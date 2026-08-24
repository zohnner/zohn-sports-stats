// ============================================================
// Live Game Expanded View — js/liveGame.js
//
// Inline accordion that opens below a live game card in the
// Scores tab. Polls /game/{gamePk}/linescore every 9s and
// fetches /game/{gamePk}/feed/live only on state change.
//
// Globals used from mlb.js (load order dependency):
//   mlbFetch(path, params, ttl)
//   _mlbProxyUrl(url)
//   MLB_USE_PROXY
//   MLB_BASE_URL_V11       — 'https://statsapi.mlb.com/api/v1.1' (feed/live only)
//   getMLBTeamColors(abbr)
//   _escHtml(str)
//   Logger
//   ApiCache
//
// Phase 0 API findings (Finn, 2026-06-04):
//   - feed/live requires v1.1, NOT v1 (v1 returns 404). All other endpoints use v1.
//   - Strike zone bounds: playEvents[n].pitchData.strikeZoneTop/Bottom
//     NOT currentPlay.matchup.batterStrikeZoneTop (that path does not exist).
//   - Pitch events filtered via e.isPitch === true (not e.type === 'pitch').
//   - battingOrder: array of numeric IDs. Player data keyed as players['ID'+id].
//   - pitchers: array of numeric IDs in teams.{home|away}.pitchers.
//   - innings[n]: { num, ordinalNum, home: { runs, hits, errors }, away: {...} }
//
// navigateTo() in navigation.js calls stopLiveGamePolling()
// before routing — this file must define that function globally.
// ============================================================

// ── Module state ─────────────────────────────────────────────
let _lgInterval       = null;   // active setInterval handle
let _lgGamePk         = null;   // currently expanded gamePk
let _lgFailures       = 0;      // consecutive poll failure count
let _lgLastState      = null;   // last linescore state key for diff
let _lgTabMap         = new Map(); // gamePk → active tab id
let _lgFeedCache      = null;   // last feed/live payload
let _lgTriggerEl      = null;   // card element that opened the panel (focus return on close)
let _lgPrevScores     = null;   // { away, home } for score-change flash detection
let _lgLastPitcherId  = null;   // pitcher id from previous poll — pitching change detection
let _lgPitchTooltipEl = null;   // active pitch tooltip DOM node or null
let _lgH2HCache       = {};     // { "batterId_pitcherId": vsPlayerTotal stat obj }
let _lgLastPollMs     = null;   // timestamp of last completed poll (for freshness display)
let _lgTsInterval     = null;   // secondary interval — updates "Updated Xs ago" text
let _lgZoneMode       = new Map(); // gamePk → 'dots' | 'heat' — pitch zone view, session-scoped
let _lgIsPageMode     = false;  // true when opened via showMLBLiveGame (full page); false for the inline accordion (openLiveGamePanel)
let _lgLastHeroBatterId = null; // batter id from previous poll — hero entrance-motion gate (D-117 Phase 1)
let _lgSeasonStatCache  = {};   // { playerId: seasonHittingStatObj | null } — hero batter AVG/OPS cache (D-117 Phase 1)

const LG_POLL_MS        = 9000;
const LG_BETWEEN_INN_MS = 20000;
const LG_PREGAME_MS     = 60000;

// Pitch dot CSS class by MLB Stats API call.code.
// CSS variables only work as CSS properties (style="fill:..."), NOT SVG presentation
// attributes (fill="..."). We use class names to apply token-based fills via CSS.
const _LG_DOT_CLASS = {
    B: 'ball',     // Ball
    C: 'cstrike',  // Called strike
    S: 'kstrike',  // Swinging strike
    W: 'kstrike',  // Swinging strike (blocked)
    T: 'kstrike',  // Foul tip (strikeout)
    F: 'foul',     // Foul
    R: 'foul',     // Foul (bunt attempt)
    D: 'hit',      // In play (no out)
    E: 'hit',      // In play (fielding error)
};

function _lgDotCategory(code, event) {
    if (code === 'X') {
        const evt = (event || '').toLowerCase();
        if (evt === 'home run') return 'hr';
        if (/out|ground|fly|line|pop|sacrifice|double play/.test(evt)) return 'out';
        return 'hit';
    }
    return _LG_DOT_CLASS[code] || 'unknown';
}

// ── Public API ───────────────────────────────────────────────

function stopLiveGamePolling() {
    if (_lgInterval) {
        clearInterval(_lgInterval);
        _lgInterval       = null;
    }
    _lgHideTooltip();
    if (_lgTsInterval) { clearInterval(_lgTsInterval); _lgTsInterval = null; }
    _lgGamePk         = null;
    _lgLastState      = null;
    _lgFailures       = 0;
    _lgFeedCache      = null;
    _lgPrevScores     = null;
    _lgLastPitcherId  = null;
    _lgH2HCache       = {};
    _lgLastHeroBatterId = null;
    _lgSeasonStatCache  = {};
    _lgMiniStandingsHtml   = '';
    _lgMiniLeadersHtml     = '';
    _lgSidebarExtrasGamePk = null;
    _lgBullpenRestHtml     = { away: '', home: '' };
    _lgBullpenRestGamePk   = null;
    _lgLastPollMs     = null;
    _lgIsPageMode     = false;
}

function _updatePollTimestamp(state) {
    const el = document.querySelector('.lg-poll-ts');
    if (!el) return;
    if (state === 'updating') { el.textContent = 'Updating…'; return; }
    if (!_lgLastPollMs) return;
    const sec = Math.round((Date.now() - _lgLastPollMs) / 1000);
    el.textContent = `Updated ${sec}s ago`;
}

function _startTsInterval() {
    if (_lgTsInterval) clearInterval(_lgTsInterval);
    _lgTsInterval = setInterval(() => _updatePollTimestamp('tick'), 2000);
}

// Expand the live game panel below a game card.
// gamePk: number | string
// game:   game object from AppState.mlbGames (has teams, linescore, status)
// cardEl: the .game-card DOM element that was clicked
async function openLiveGamePanel(gamePk, game, cardEl) {
    _closeExistingPanel();

    _lgGamePk     = String(gamePk);
    _lgFeedCache  = null;
    _lgTriggerEl  = cardEl;
    _lgIsPageMode = false;

    const panel = _buildSkeletonPanel(game);
    cardEl.insertAdjacentElement('afterend', panel);
    panel.focus();

    panel.addEventListener('keydown', e => {
        if (e.key === 'Escape') _closeExistingPanel();
    });

    await _doPoll(gamePk);
    const interval = _pollInterval(game);
    _lgInterval = setInterval(() => _doPoll(_lgGamePk), interval);
}

// ── Internal ─────────────────────────────────────────────────

function _closeExistingPanel() {
    if (document.querySelector('.lg-panel')?.closest('.lg-live-page')) {
        navigateTo('mlb-games');
        return;
    }
    const trigger = _lgTriggerEl;
    _lgTriggerEl  = null;
    stopLiveGamePolling();
    document.querySelectorAll('.lg-panel').forEach(p => p.remove());
    trigger?.focus();
}

function _pollInterval(game) {
    const state = game?.linescore?.inningState || '';
    if (state === 'Middle' || state === 'End') return LG_BETWEEN_INN_MS;
    if (game?.status?.abstractGameState !== 'Live') return LG_PREGAME_MS;
    return LG_POLL_MS;
}

// Same interval logic as _pollInterval, but computed from a fetched feed/live
// payload (authoritative) rather than the AppState game stub. Used to arm/
// re-arm polling after every successful poll, including the very first one —
// previously the first arm in showMLBLiveGame hardcoded LG_POLL_MS regardless
// of game state, so a pregame page polled every 9s for hours before first pitch.
function _lgNextInterval(feed) {
    const status = feed?.gameData?.status || {};
    const ls     = feed?.liveData?.linescore || {};
    if (/delay|suspend/i.test(status.detailedState || '')) return 60000;
    if (status.abstractGameState === 'Preview') return LG_PREGAME_MS;
    if (ls.inningState === 'Middle' || ls.inningState === 'End') return LG_BETWEEN_INN_MS;
    return LG_POLL_MS;
}

async function _doPoll(gamePk) {
    if (!gamePk) return;
    const panel = document.querySelector('.lg-panel');
    if (!panel) { stopLiveGamePolling(); return; }

    _updatePollTimestamp('updating');

    try {
        const lsUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`;
        const lsRes = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(lsUrl) : lsUrl, { signal: AbortSignal.timeout(10_000) });
        if (!lsRes.ok) throw new Error(`Linescore ${lsRes.status}`);
        const ls = await lsRes.json();

        _lgFailures = 0;
        _lgLastPollMs = Date.now();
        _updateBadge(panel, 'live');
        _updatePollTimestamp('tick');
        if (!_lgTsInterval) _startTsInterval();

        const stateKey = `${ls.currentInning}|${ls.inningState}|${ls.teams?.away?.runs}|${ls.teams?.home?.runs}`;
        if (stateKey === _lgLastState) return;
        _lgLastState = stateKey;

        // State changed — fetch full feed (v1.1 required — v1 returns 404)
        const feedUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
        const feedRes = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(feedUrl) : feedUrl, { signal: AbortSignal.timeout(15_000) });
        if (!feedRes.ok) throw new Error(`Feed ${feedRes.status}`);
        const feed = await feedRes.json();
        _lgFeedCache = feed;

        const prevPbpCount = panel.querySelectorAll('.lg-pbp-entry').length;
        const curAway      = ls.teams?.away?.runs ?? 0;
        const curHome      = ls.teams?.home?.runs ?? 0;
        _renderPanel(panel, feed, gamePk);
        _animateNewPlays(panel, prevPbpCount);

        if (_lgPrevScores) {
            if (curAway > _lgPrevScores.away) _flashScore(panel, 'away');
            if (curHome > _lgPrevScores.home) _flashScore(panel, 'home');
        }
        _lgPrevScores = { away: curAway, home: curHome };

        // Pitching change detection
        const currentPlay  = feed.liveData?.plays?.currentPlay;
        const curPitcherId = currentPlay?.matchup?.pitcher?.id;
        if (curPitcherId && _lgLastPitcherId && curPitcherId !== _lgLastPitcherId) {
            const lastName = currentPlay.matchup.pitcher.fullName?.split(' ').pop() || '—';
            const pbpEl = panel.querySelector('.lg-pbp');
            if (pbpEl) {
                const entry = document.createElement('div');
                entry.className = 'lg-pbp-entry lg-pbp-entry--pitching-change lg-pbp-entry--new';
                entry.textContent = `↔ ${lastName} now pitching`;
                pbpEl.prepend(entry);
            }
        }
        _lgLastPitcherId = curPitcherId ?? _lgLastPitcherId;

        const isFinalNow = feed.gameData?.status?.abstractGameState === 'Final';
        if (isFinalNow) { stopLiveGamePolling(); return; }

        const newMs = _lgNextInterval(feed);
        if (_lgInterval) {
            clearInterval(_lgInterval);
            _lgInterval = setInterval(() => _doPoll(_lgGamePk), newMs);
        }
    } catch (err) {
        _lgFailures++;
        Logger.warn(`Live game poll failed (${_lgFailures})`, err, 'LIVE');
        if (_lgFailures >= 2) _updateBadge(panel, 'reconnecting');
        if (_lgFailures >= 5) { _updateBadge(panel, 'unavailable'); _showRetryBtn(panel); }
    }
}

function _buildSkeletonPanel(game) {
    const panel = document.createElement('div');
    panel.className = 'lg-panel';
    panel.tabIndex  = -1;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Live game expanded view');

    const hc = getMLBTeamColors(game?.teams?.home?.team?.abbreviation);
    panel.style.setProperty('--lg-team-color', hc?.primary || 'var(--accent)');

    const hasScore  = game?.teams?.home?.score != null;
    const homeScore = hasScore ? game.teams.home.score : '—';
    const awayScore = hasScore ? game.teams.away.score : '—';
    const homeAbbr  = game?.teams?.home?.team?.abbreviation || '???';
    const awayAbbr  = game?.teams?.away?.team?.abbreviation || '???';
    const half      = game?.linescore?.isTopInning ? '▲' : '▼';
    const inning    = game?.linescore?.currentInning || '—';
    const balls     = game?.linescore?.balls ?? '?';
    const strikes   = game?.linescore?.strikes ?? '?';
    const outs      = game?.linescore?.outs ?? '?';

    panel.innerHTML = `
        <div class="lg-header">
            <button class="lg-close-btn" aria-label="Collapse game view">×</button>
            <div class="lg-scoreline">
                <span class="lg-abbr">${_escHtml(awayAbbr)}</span>
                <span class="lg-score">${awayScore}</span>
                <span class="lg-sep">:</span>
                <span class="lg-score">${homeScore}</span>
                <span class="lg-abbr">${_escHtml(homeAbbr)}</span>
            </div>
            <div class="lg-meta-row">
                <span class="lg-inning">${half}${inning}</span>
                <span class="lg-count-pill">${balls}-${strikes} · ${outs} Out${outs !== 1 ? 's' : ''}</span>
                <span class="game-status game-status--live lg-status-badge"><span class="live-dot"></span>LIVE</span>
            </div>
        </div>
        <div class="lg-linescore-wrap">
            <div class="skeleton-line" style="height:36px;margin:0.5rem 0"></div>
        </div>
        <div class="lg-poll-ts" aria-live="polite"></div>
        <div class="lg-hero-host"></div>
        <div class="lg-dueup-host"></div>
        <div class="lg-body">
            <div class="lg-zone-col" hidden></div>
            <div class="lg-tab-col">
                <div class="mlb-group-toggle-row lg-tabs" role="tablist">
                    <button class="mlb-group-btn mlb-group-btn--active" role="tab" id="lg-tab-pbp"     aria-selected="true"  aria-controls="lg-tabpanel" data-lg-tab="pbp">Play-by-Play</button>
                    <button class="mlb-group-btn"                        role="tab" id="lg-tab-box"     aria-selected="false" aria-controls="lg-tabpanel" data-lg-tab="box">Box Score</button>
                    <button class="mlb-group-btn"                        role="tab" id="lg-tab-matchup" aria-selected="false" aria-controls="lg-tabpanel" data-lg-tab="matchup">Matchup</button>
                    <button class="mlb-group-btn"                        role="tab" id="lg-tab-bullpen" aria-selected="false" aria-controls="lg-tabpanel" data-lg-tab="bullpen">Bullpen</button>
                </div>
                <div class="lg-tab-content" role="tabpanel" id="lg-tabpanel" aria-labelledby="lg-tab-pbp">
                    <div class="skeleton-line" style="height:14px;margin:0.4rem 0;width:90%"></div>
                    <div class="skeleton-line" style="height:14px;margin:0.4rem 0;width:75%"></div>
                    <div class="skeleton-line" style="height:14px;margin:0.4rem 0;width:82%"></div>
                    <div class="skeleton-line" style="height:14px;margin:0.4rem 0;width:60%"></div>
                </div>
            </div>
        </div>`;

    panel.querySelector('.lg-close-btn')?.addEventListener('click', _closeExistingPanel);

    panel.querySelectorAll('[data-lg-tab]').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(panel, btn.dataset.lgTab, String(_lgGamePk)));
    });

    panel.querySelector('.lg-tabs')?.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const tabs = [...panel.querySelectorAll('[data-lg-tab]')];
        const idx  = tabs.indexOf(document.activeElement);
        if (idx === -1) return;
        const next = e.key === 'ArrowRight'
            ? (idx + 1) % tabs.length
            : (idx - 1 + tabs.length) % tabs.length;
        tabs[next].focus();
        tabs[next].click();
    });

    return panel;
}

function _renderPanel(panel, feed, gamePk) {
    const ls       = feed.liveData?.linescore || {};
    const plays    = feed.liveData?.plays || {};
    const boxscore = feed.liveData?.boxscore || {};
    const status   = feed.gameData?.status || {};
    const home     = feed.gameData?.teams?.home || {};
    const away     = feed.gameData?.teams?.away || {};

    const isFinal      = status.abstractGameState === 'Final';
    const isPreview    = status.abstractGameState === 'Preview';
    const isLive       = status.abstractGameState === 'Live';
    const isDelayed    = /delay|suspend/i.test(status.detailedState || '');
    const homeScore    = ls.teams?.home?.runs ?? '—';
    const awayScore    = ls.teams?.away?.runs ?? '—';
    const homeWon      = isFinal && homeScore > awayScore;
    const awayWon      = isFinal && awayScore > homeScore;
    const half         = ls.isTopInning ? '▲' : '▼';
    const inning       = ls.currentInning || '—';
    const balls        = ls.balls ?? '?';
    const strikes      = ls.strikes ?? '?';
    const outs         = ls.outs ?? '?';
    const isBetweenInn = ls.inningState === 'Middle' || ls.inningState === 'End';

    const hc = getMLBTeamColors(home.abbreviation);
    panel.style.setProperty('--lg-team-color', hc?.primary || 'var(--accent)');

    // Page-mode breadcrumb refinement — see the best-effort set in
    // showMLBLiveGame; this corrects it once real abbreviations are in.
    if (_lgIsPageMode && window.setBreadcrumb) {
        setBreadcrumb('mlb-games', `${away.abbreviation || '???'} @ ${home.abbreviation || '???'}`);
    }

    let badgeHtml;
    if (isFinal) {
        badgeHtml = `<span class="game-status game-status--final lg-status-badge">FINAL</span>`;
    } else if (isPreview) {
        const dt = feed.gameData?.datetime;
        const fp = dt?.time ? `${dt.time} ${dt.ampm || ''}`.trim() : 'SCHEDULED';
        badgeHtml = `<span class="game-status game-status--sched lg-status-badge">${_escHtml(fp)}</span>`;
    } else if (isDelayed) {
        badgeHtml = `<span class="game-status game-status--sched lg-status-badge">DELAYED</span>`;
    } else {
        badgeHtml = `<span class="game-status game-status--live lg-status-badge"><span class="live-dot"></span>LIVE</span>`;
    }

    const scorecardLink = isFinal
        ? `<a class="lg-scorecard-link" href="#mlb-scorecard-${gamePk}">Full scorecard →</a>`
        : '';
    // Works for live and final games alike — the boxscore endpoint returns
    // stats-so-far for a live game, so this is deliberately not isFinal-gated
    // the way scorecardLink is. Pregame has no plays to highlight yet, so it
    // is gated.
    const highlightLink = !isPreview
        ? `<a class="lg-scorecard-link" href="javascript:void(0)" onclick="openHighlightCardForGame(${gamePk})">Highlight card →</a>`
        : '';

    panel.querySelector('.lg-header').innerHTML = `
        <button class="lg-close-btn" aria-label="Collapse game view">×</button>
        <div class="lg-scoreline">
            <span class="lg-abbr ${awayWon ? 'lg-winner' : ''}">${_escHtml(away.abbreviation || '???')}</span>
            <span class="lg-score ${awayWon ? 'lg-score--win' : isFinal && !awayWon ? 'lg-score--loss' : ''}" data-side="away">${awayScore}</span>
            <span class="lg-sep">:</span>
            <span class="lg-score ${homeWon ? 'lg-score--win' : isFinal && !homeWon ? 'lg-score--loss' : ''}" data-side="home">${homeScore}</span>
            <span class="lg-abbr ${homeWon ? 'lg-winner' : ''}">${_escHtml(home.abbreviation || '???')}</span>
        </div>
        <div class="lg-meta-row">
            ${isLive ? `<span class="lg-inning">${half}${inning}</span><span class="lg-count-pill">${isBetweenInn ? '—' : `${balls}-${strikes} · ${outs} Out${outs !== 1 ? 's' : ''}`}</span>` : ''}
            ${badgeHtml}
            ${scorecardLink}
            ${highlightLink}
        </div>`;

    panel.querySelector('.lg-close-btn')?.addEventListener('click', _closeExistingPanel);

    panel.querySelector('.lg-linescore-wrap').innerHTML =
        _buildLinescore(ls, away.abbreviation, home.abbreviation);

    // Ensure the freshness row exists in re-rendered panels (fallback for panels
    // that were built before this element was added to the skeleton template)
    if (!panel.querySelector('.lg-poll-ts')) {
        const ts = document.createElement('div');
        ts.className = 'lg-poll-ts';
        ts.setAttribute('aria-live', 'polite');
        panel.querySelector('.lg-linescore-wrap')?.insertAdjacentElement('afterend', ts);
    }

    // Delay/suspension reason note
    const existingNote = panel.querySelector('.lg-delay-note');
    if (isDelayed && ls.note) {
        if (existingNote) {
            existingNote.textContent = _escHtml(ls.note);
        } else {
            const n = document.createElement('p');
            n.className   = 'lg-delay-note';
            n.textContent = _escHtml(ls.note);
            panel.querySelector('.lg-linescore-wrap')?.insertAdjacentElement('afterend', n);
        }
    } else if (existingNote) {
        existingNote.remove();
    }

    // Phase 1 (D-117): batter/pitcher hero + Due Up rail — both built from
    // data this poll already fetched except the hero's batter season line,
    // which is fetched separately and gated on the batter actually changing.
    const heroHost = panel.querySelector('.lg-hero-host');
    if (heroHost) {
        heroHost.innerHTML = _buildHero(feed);
        _lgMaybeFetchHeroBatterLine(feed, panel);
    }
    const dueUpHost = panel.querySelector('.lg-dueup-host');
    if (dueUpHost) dueUpHost.innerHTML = _buildDueUp(feed);

    // Phase 2 + P9-live: pitch zone (dots / heat toggle) + base diagram
    _renderZone(panel, feed, gamePk);

    const tabsEl    = panel.querySelector('.lg-tabs');
    const tabpanel  = panel.querySelector('.lg-tab-content');

    if (isPreview) {
        // No plays/box score exist yet — show probable pitchers instead of
        // the tab strip rather than three tabs that all render empty states.
        tabsEl?.setAttribute('hidden', '');
        if (tabpanel) {
            tabpanel.removeAttribute('aria-labelledby');
            tabpanel.innerHTML = _buildProbablePitchers(
                feed.gameData?.probablePitchers, away.abbreviation, home.abbreviation
            );
        }
    } else {
        tabsEl?.removeAttribute('hidden');
        const activeTab = _lgTabMap.get(String(gamePk)) || 'pbp';
        panel.querySelectorAll('[data-lg-tab]').forEach(btn => {
            const isActive = btn.dataset.lgTab === activeTab;
            btn.classList.toggle('mlb-group-btn--active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
        });

        if (tabpanel) tabpanel.setAttribute('aria-labelledby', `lg-tab-${activeTab}`);

        if (activeTab === 'pbp') {
            tabpanel.innerHTML = _buildPbp(plays.allPlays || []);
        } else if (activeTab === 'box') {
            tabpanel.innerHTML = _buildBoxScore(boxscore, away.abbreviation, home.abbreviation);
        } else if (activeTab === 'bullpen') {
            // Phase 2 (D-117): cheap to rebuild every poll (boxscore's already in
            // hand) — only the async rest-day fetch is gated to once per game,
            // triggered from _switchTab, not here.
            tabpanel.innerHTML = _buildBullpenTab(feed, gamePk);
        }
        // matchup tab: don't auto-rebuild on poll — tab click handles the async fetch
    }

    // Sidebar (page mode only) — mini standings + mini leaders (D-117 Phase 1,
    // prepended ahead of venue/notes/umpires per Vera's priority ordering)
    // then venue/weather, mound visits, challenges, umpires. All read from
    // feed/live fields already fetched above except the two mini widgets,
    // which reuse the site's existing shared standings/leaders fetches —
    // fetched once per game (see _lgFetchSidebarExtras), not once per poll.
    if (_lgIsPageMode) {
        const sidebarEl = document.querySelector('.lg-sidebar');
        if (sidebarEl) {
            sidebarEl.innerHTML = _lgMiniStandingsHtml + _lgMiniLeadersHtml + _buildSidebar(feed);
        }
        if (_lgSidebarExtrasGamePk !== String(gamePk)) {
            _lgSidebarExtrasGamePk = String(gamePk);
            _lgFetchSidebarExtras(gamePk, away.abbreviation, home.abbreviation);
        }
    }
}

function _buildLinescore(ls, awayAbbr, homeAbbr) {
    const innings   = ls.innings || [];
    const count     = Math.max(9, innings.length);
    const curInning = ls.currentInning || 0;

    let headerCells = `<div class="lg-linescore-cell lg-linescore-team"></div>`;
    for (let i = 1; i <= count; i++) {
        const active = i === curInning;
        headerCells += `<div class="lg-linescore-cell lg-linescore-cell--header${active ? ' lg-linescore-cell--active' : ''}">${i}</div>`;
    }
    headerCells += `<div class="lg-linescore-cell lg-linescore-cell--header lg-linescore-cell--rhe">R</div><div class="lg-linescore-cell lg-linescore-cell--header lg-linescore-cell--rhe">H</div><div class="lg-linescore-cell lg-linescore-cell--header lg-linescore-cell--rhe">E</div>`;

    const buildRow = (side, abbr) => {
        let cells = `<div class="lg-linescore-cell lg-linescore-team">${_escHtml(abbr || '')}</div>`;
        for (let i = 1; i <= count; i++) {
            const inn  = innings.find(n => n.num === i);
            const val  = inn?.[side]?.runs;
            const active = i === curInning;
            cells += `<div class="lg-linescore-cell${active ? ' lg-linescore-cell--active' : ''}">${val != null ? val : '—'}</div>`;
        }
        const totals = ls.teams?.[side];
        cells += `<div class="lg-linescore-cell lg-linescore-cell--rhe">${totals?.runs ?? '—'}</div>`;
        cells += `<div class="lg-linescore-cell lg-linescore-cell--rhe">${totals?.hits ?? '—'}</div>`;
        cells += `<div class="lg-linescore-cell lg-linescore-cell--rhe">${totals?.errors ?? '—'}</div>`;
        return cells;
    };

    return `<div class="lg-linescore" style="--lg-innings:${count}">
        ${headerCells}
        ${buildRow('away', awayAbbr)}
        ${buildRow('home', homeAbbr)}
    </div>`;
}

function _buildPbp(allPlays) {
    if (!allPlays.length) return '<div class="lg-pbp-empty">No plays recorded yet.</div>';

    const grouped = {};
    for (const play of [...allPlays].reverse()) {
        const key = `${play.about?.halfInning === 'top' ? '▲' : '▼'}${play.about?.inning || '?'}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(play);
    }

    let html = '<div class="lg-pbp">';
    for (const [inningLabel, plays] of Object.entries(grouped)) {
        html += `<div class="lg-pbp-inning">${inningLabel}</div>`;
        for (const play of plays) {
            const desc    = _escHtml(play.result?.description || '');
            const isScore = play.about?.isScoringPlay;
            const isHR    = play.result?.eventType === 'home_run';
            const score   = isScore
                ? ` <span class="lg-pbp-score">${play.result?.awayScore}–${play.result?.homeScore}</span>`
                : '';
            const cls = `lg-pbp-entry${isScore ? ' lg-pbp-entry--scoring' : ''}${isHR ? ' lg-pbp-entry--hr' : ''}`;
            html += `<div class="${cls}">${desc}${score}</div>`;
        }
    }
    return html + '</div>';
}

function _buildBoxScore(boxscore, awayAbbr, homeAbbr) {
    const sides = [
        { key: 'away', label: _escHtml(awayAbbr || 'Away') },
        { key: 'home', label: _escHtml(homeAbbr || 'Home') },
    ];

    let html = '<div class="lg-box">';
    for (const { key, label } of sides) {
        const team    = boxscore.teams?.[key] || {};
        const order   = team.battingOrder || [];
        const players = team.players || {};

        html += `<div class="lg-box-section-title">${label} — Batting</div>`;
        html += `<table class="lg-box-table"><thead><tr>
            <th style="text-align:left">Player</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>K</th>
        </tr></thead><tbody>`;

        for (const pid of order) {
            const p  = players[`ID${pid}`] || {};
            const s  = p.stats?.batting || {};
            const nm = _escHtml(p.person?.lastName || p.person?.fullName || '');
            const pos = _escHtml(p.position?.abbreviation || '');
            html += `<tr>
                <td>${nm}, ${pos}</td>
                <td>${s.atBats ?? '—'}</td><td>${s.runs ?? '—'}</td><td>${s.hits ?? '—'}</td>
                <td>${s.rbi ?? '—'}</td><td>${s.baseOnBalls ?? '—'}</td><td>${s.strikeOuts ?? '—'}</td>
            </tr>`;
        }
        html += '</tbody></table>';

        const pitchers = team.pitchers || [];
        html += `<div class="lg-box-section-title" style="margin-top:0.75rem">${label} — Pitching</div>`;
        html += `<table class="lg-box-table"><thead><tr>
            <th style="text-align:left">Pitcher</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th>
        </tr></thead><tbody>`;

        for (const pid of pitchers) {
            const p      = players[`ID${pid}`] || {};
            const s      = p.stats?.pitching || {};
            const nm     = _escHtml(p.person?.lastName || p.person?.fullName || '');
            const active = p.gameStatus?.isCurrentPitcher
                ? '<span class="lg-box-active">▶</span> '
                : '';
            html += `<tr>
                <td>${active}${nm}</td>
                <td>${s.inningsPitched ?? '—'}</td><td>${s.hits ?? '—'}</td><td>${s.runs ?? '—'}</td>
                <td>${s.earnedRuns ?? '—'}</td><td>${s.baseOnBalls ?? '—'}</td><td>${s.strikeOuts ?? '—'}</td>
            </tr>`;
        }
        html += '</tbody></table>';
    }
    return html + '</div>';
}

// Pregame tab-body content (page mode) — probable pitchers only, v1. No
// season stat line here on purpose: gameData.probablePitchers only carries
// id/fullName/link, and pulling ERA/W-L would mean a new per-pitcher fetch
// this pass didn't scope. Ships honest and minimal rather than guessing at
// a stat line with unverified data.
function _buildProbablePitchers(pp, awayAbbr, homeAbbr) {
    if (!pp || (!pp.away?.fullName && !pp.home?.fullName)) {
        return '<div class="lg-pbp-empty">Probable pitchers not yet announced.</div>';
    }
    const row = (abbr, p) => `
        <div class="lg-side-row">
            <span>${_escHtml(abbr || '')}</span>
            <span class="lg-side-val">${p?.fullName ? _escHtml(p.fullName) : 'TBD'}</span>
        </div>`;
    return `<div class="lg-pregame-wrap">
        <div class="lg-box-section-title">Probable Pitchers</div>
        ${row(awayAbbr, pp.away)}
        ${row(homeAbbr, pp.home)}
        <div class="lg-matchup-empty" style="margin-top:var(--space-2)">Play-by-play and box score open automatically once the game starts.</div>
    </div>`;
}

// Sidebar (page mode only) — surfaces feed/live fields the tab body never
// rendered: venue/weather, mound visits + challenges remaining per team, and
// the umpire crew. All read from data _doPoll already fetched; no new
// requests. liveData.leaders was checked live (2026-08-20) and is NOT a
// game-leaders module as ESPN's sidebar has — it's hit-distance/hit-speed/
// pitch-speed tracking that was empty on the game checked, so it is
// deliberately left out rather than built against an unverified shape.
function _buildSidebar(feed) {
    const gd        = feed.gameData || {};
    const officials = feed.liveData?.boxscore?.officials || [];
    const mv        = gd.moundVisits;
    const rv        = gd.review;
    const weather   = gd.weather;
    const venue     = gd.venue?.name;
    const awayAbbr  = gd.teams?.away?.abbreviation || 'Away';
    const homeAbbr  = gd.teams?.home?.abbreviation || 'Home';

    let html = '';

    if (venue || weather?.condition) {
        html += `<div class="lg-side-card">
            <div class="lg-box-section-title">Game Info</div>
            ${venue ? `<div class="lg-side-line">${_escHtml(venue)}</div>` : ''}
            ${weather?.condition ? `<div class="lg-side-line">${_escHtml(weather.condition)}${weather.temp ? `, ${_escHtml(weather.temp)}°` : ''}</div>` : ''}
            ${weather?.wind ? `<div class="lg-side-line lg-side-line--muted">${_escHtml(weather.wind)}</div>` : ''}
        </div>`;
    }

    if (mv || rv?.hasChallenges) {
        html += `<div class="lg-side-card">
            <div class="lg-box-section-title">Game Notes</div>
            ${mv ? `<div class="lg-side-row"><span>Mound Visits Left</span><span class="lg-side-val">${_escHtml(awayAbbr)} ${mv.away?.remaining ?? '—'} · ${_escHtml(homeAbbr)} ${mv.home?.remaining ?? '—'}</span></div>` : ''}
            ${rv?.hasChallenges ? `<div class="lg-side-row"><span>Challenges Left</span><span class="lg-side-val">${_escHtml(awayAbbr)} ${rv.away?.remaining ?? '—'} · ${_escHtml(homeAbbr)} ${rv.home?.remaining ?? '—'}</span></div>` : ''}
        </div>`;
    }

    if (officials.length) {
        html += `<div class="lg-side-card">
            <div class="lg-box-section-title">Umpires</div>
            ${officials.map(o => `<div class="lg-side-row"><span>${_escHtml(o.officialType || '')}</span><span class="lg-side-val">${_escHtml(o.official?.fullName || '—')}</span></div>`).join('')}
        </div>`;
    }

    return html || '<div class="lg-side-card"><div class="lg-matchup-empty">No additional game details yet.</div></div>';
}

// ── Phase 2: Pitch zone SVG ───────────────────────────────────

function _lgSvgCoords(pX, pZ) {
    return {
        x: +(50 + (pX / 2.5) * 50).toFixed(1),
        y: +(130 - ((pZ - 0.5) / 4.5) * 120).toFixed(1),
    };
}

// Strike-zone geometry (rect + 3×3 grid) shared by the dots and heat views so
// both render against an identical zone.
function _lgZoneGeom(currentPlay) {
    const pitches = (currentPlay?.playEvents || []).filter(e => e.isPitch);
    let szTop = 3.5, szBot = 1.5;
    const lastPitchWithZone = [...pitches].reverse().find(e => e.pitchData?.strikeZoneTop);
    if (lastPitchWithZone?.pitchData) {
        szTop = lastPitchWithZone.pitchData.strikeZoneTop;
        szBot = lastPitchWithZone.pitchData.strikeZoneBottom;
    }
    const zoneXL = _lgSvgCoords(-0.71, 0);
    const zoneXR = _lgSvgCoords(0.71, 0);
    const zoneYT = _lgSvgCoords(0, szTop);
    const zoneYB = _lgSvgCoords(0, szBot);
    const zx = zoneXL.x, zw = zoneXR.x - zoneXL.x;
    const zy = zoneYT.y, zh = zoneYB.y - zoneYT.y;
    const gw = +(zw / 3).toFixed(1);
    const gh = +(zh / 3).toFixed(1);
    const gridHtml =
        `<line x1="${+(zx + gw).toFixed(1)}"   y1="${zy.toFixed(1)}"        x2="${+(zx + gw).toFixed(1)}"   y2="${+(zy + zh).toFixed(1)}" class="lg-zone-grid"/>` +
        `<line x1="${+(zx + gw * 2).toFixed(1)}" y1="${zy.toFixed(1)}"       x2="${+(zx + gw * 2).toFixed(1)}" y2="${+(zy + zh).toFixed(1)}" class="lg-zone-grid"/>` +
        `<line x1="${zx.toFixed(1)}"             y1="${+(zy + gh).toFixed(1)}" x2="${+(zx + zw).toFixed(1)}"  y2="${+(zy + gh).toFixed(1)}" class="lg-zone-grid"/>` +
        `<line x1="${zx.toFixed(1)}"             y1="${+(zy + gh * 2).toFixed(1)}" x2="${+(zx + zw).toFixed(1)}" y2="${+(zy + gh * 2).toFixed(1)}" class="lg-zone-grid"/>`;
    return { zx, zy, zw, zh, gridHtml };
}

// Every pitch thrown by one pitcher across the whole game — feeds the heat view.
// Uses the same confirmed pX/pZ coordinate fields as the dots view.
function _collectPitcherGamePitches(allPlays, pitcherId) {
    if (!Array.isArray(allPlays) || pitcherId == null) return [];
    const out = [];
    for (const play of allPlays) {
        if (play?.matchup?.pitcher?.id !== pitcherId) continue;
        for (const e of (play.playEvents || [])) {
            if (!e.isPitch) continue;
            const pX = e.pitchData?.coordinates?.pX;
            const pZ = e.pitchData?.coordinates?.pZ;
            if (pX == null || pZ == null) continue;
            out.push(_lgSvgCoords(pX, pZ));
        }
    }
    return out;
}

function _buildZoneToggle(mode, heatCount) {
    const heatOn = mode === 'heat';
    const heatDisabled = heatCount < 1;
    return `<div class="lg-zone-toggle" role="group" aria-label="Pitch zone view">
        <button type="button" class="lg-zone-toggle-btn ${!heatOn ? 'lg-zone-toggle-btn--active' : ''}" data-lg-zone="dots" aria-pressed="${!heatOn}">Dots</button>
        <button type="button" class="lg-zone-toggle-btn ${heatOn ? 'lg-zone-toggle-btn--active' : ''}" data-lg-zone="heat" aria-pressed="${heatOn}"${heatDisabled ? ' disabled' : ''}>Heat</button>
    </div>`;
}

function _buildPitchZone(currentPlay) {
    const pitches = (currentPlay?.playEvents || []).filter(e => e.isPitch);
    const { zx, zy, zw, zh, gridHtml } = _lgZoneGeom(currentPlay);

    let dotsHtml = '';
    for (let i = 0; i < pitches.length; i++) {
        const p  = pitches[i];
        const pd = p.pitchData || {};
        const pX = pd.coordinates?.pX;
        const pZ = pd.coordinates?.pZ;
        if (pX == null || pZ == null) continue;

        const { x: cx, y: cy } = _lgSvgCoords(pX, pZ);
        const code      = p.details?.call?.code || '';
        const category  = _lgDotCategory(code, p.result?.event);
        const pitchType = _escHtml(p.details?.type?.description || '—');
        const velocity  = p.startSpeed ? `${p.startSpeed} mph` : '—';
        // Confirmed live 2026-08-20 against a real feed/live payload: breaks.spinRate
        // is populated on real pitches (D-009's 2026-06-12 amendment had this as
        // unconfirmed for pfxX/pfxZ/breaks.* — that gate is stale, see DECISIONS.md D-116).
        const spin      = pd.breaks?.spinRate ? `${pd.breaks.spinRate} rpm` : '';
        const result    = _escHtml(p.details?.call?.description || '—');
        const countStr  = `${p.count?.balls ?? '?'}-${p.count?.strikes ?? '?'} count`;
        const ariaLabel = _escHtml(`Pitch ${i + 1}: ${pitchType} ${velocity}${spin ? `, ${spin}` : ''} — ${result}`);

        // CSS classes carry all fill/stroke via liveGame.css — SVG presentation
        // attributes don't resolve CSS custom properties, so we rely on CSS only.
        dotsHtml += `<g class="lg-dot-group lg-dot--${category}" tabindex="0" role="button"
            aria-label="${ariaLabel}"
            data-pitch-type="${pitchType}"
            data-velocity="${_escHtml(velocity)}"
            data-spin="${_escHtml(spin)}"
            data-result="${result}"
            data-count="${_escHtml(countStr)}">
            <circle cx="${cx}" cy="${cy}" r="4"/>
            <circle cx="${cx}" cy="${cy}" r="7" class="lg-dot-focus-ring"/>
            <text class="lg-dot-text" x="${cx}" y="${cy}" font-size="5" text-anchor="middle" dominant-baseline="central">${i + 1}</text>
        </g>`;
    }

    return `<div class="lg-zone-wrap">
        <svg class="lg-pitch-zone" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pitch zone — current at-bat, ${pitches.length} pitch${pitches.length !== 1 ? 'es' : ''}">
            <polygon points="44,132 56,132 58,128 50,126 42,128" class="lg-home-plate"/>
            <rect x="${zx.toFixed(1)}" y="${zy.toFixed(1)}" width="${zw.toFixed(1)}" height="${zh.toFixed(1)}" class="lg-zone-rect"/>
            ${gridHtml}
            ${dotsHtml}
        </svg>
        <div class="lg-zone-legend">
            <span class="lg-zone-legend-item lg-zone-legend--ball">Ball</span>
            <span class="lg-zone-legend-item lg-zone-legend--strike">Strike</span>
            <span class="lg-zone-legend-item lg-zone-legend--hit">In Play</span>
        </div>
    </div>`;
}

// Binned density overlay over the plot region. Opacity encodes pitch count in
// one hue (accent) — same single-intensity language as the rest of the site,
// no new palette.
function _buildPitchHeat(currentPlay, gamePitches) {
    const { zx, zy, zw, zh, gridHtml } = _lgZoneGeom(currentPlay);
    const X0 = 15, X1 = 85, Y0 = 15, Y1 = 125, COLS = 7, ROWS = 9;
    const cw = (X1 - X0) / COLS, ch = (Y1 - Y0) / ROWS;
    const counts = new Array(COLS * ROWS).fill(0);
    let plotted = 0;
    for (const p of gamePitches) {
        if (p.x < X0 || p.x > X1 || p.y < Y0 || p.y > Y1) continue;
        const c = Math.min(COLS - 1, Math.floor((p.x - X0) / cw));
        const r = Math.min(ROWS - 1, Math.floor((p.y - Y0) / ch));
        counts[r * COLS + c]++;
        plotted++;
    }
    const max = Math.max(0, ...counts);
    let cellsHtml = '';
    if (max > 0) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const n = counts[r * COLS + c];
                if (!n) continue;
                const op = +(0.12 + 0.78 * (n / max)).toFixed(2);
                const x  = +(X0 + c * cw).toFixed(1);
                const y  = +(Y0 + r * ch).toFixed(1);
                cellsHtml += `<rect x="${x}" y="${y}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" class="lg-heat-cell" style="opacity:${op}"/>`;
            }
        }
    }

    return `<div class="lg-zone-wrap">
        <svg class="lg-pitch-zone" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pitch location heat map — ${plotted} pitches by the current pitcher this game">
            <polygon points="44,132 56,132 58,128 50,126 42,128" class="lg-home-plate"/>
            ${cellsHtml}
            <rect x="${zx.toFixed(1)}" y="${zy.toFixed(1)}" width="${zw.toFixed(1)}" height="${zh.toFixed(1)}" class="lg-zone-rect"/>
            ${gridHtml}
        </svg>
        <div class="lg-zone-legend">
            <span class="lg-zone-legend-heat">Fewer</span>
            <span class="lg-heat-ramp" aria-hidden="true"></span>
            <span class="lg-zone-legend-heat">More</span>
            <span class="lg-zone-legend-note">${plotted} pitches this game</span>
        </div>
    </div>`;
}

// Renders the zone column (toggle + dots|heat + bases) and wires its events.
// Called on every poll render and on toggle clicks (re-renders from cache).
//
// Base state should never fully disappear once an at-bat context exists
// (Vera, 2026-08-20 live-game audit) — previously the whole column hid
// whenever the current at-bat had zero pitches yet (e.g. the moment a new
// batter steps in), which read as broken rather than "bases are empty."
// The column now only hides entirely pregame or when there's no play
// context at all; a fresh at-bat with no pitches yet shows the base
// diagram with a placeholder in place of the pitch plot.
function _renderZone(panel, feed, gamePk) {
    const plays       = feed.liveData?.plays || {};
    const currentPlay = plays.currentPlay;
    const pitches     = (currentPlay?.playEvents || []).filter(e => e.isPitch);
    const zoneCol     = panel.querySelector('.lg-zone-col');
    if (!zoneCol) return;
    _lgHideTooltip();

    const isPreview = feed.gameData?.status?.abstractGameState === 'Preview';
    if (isPreview || !currentPlay) {
        zoneCol.setAttribute('hidden', '');
        zoneCol.innerHTML = '';
        return;
    }

    zoneCol.removeAttribute('hidden');
    const key         = String(gamePk);
    const mode        = _lgZoneMode.get(key) || 'dots';
    const gamePitches = _collectPitcherGamePitches(plays.allPlays, currentPlay.matchup?.pitcher?.id);
    const useHeat     = mode === 'heat' && gamePitches.length > 0;
    const hasPitches  = pitches.length > 0;

    zoneCol.innerHTML =
        (hasPitches
            ? `<div class="lg-zone-section-label">Pitch Zone</div>` +
              _buildZoneToggle(mode, gamePitches.length) +
              (useHeat ? _buildPitchHeat(currentPlay, gamePitches) : _buildPitchZone(currentPlay))
            : `<div class="lg-zone-empty">Next pitch coming up.</div>`) +
        `<div class="lg-zone-section-label" style="margin-top:var(--space-2)">Bases</div>` +
        _buildBaseDiagram(currentPlay);
    _wireZoneEvents(panel, key);
}

// ── Phase 2: Base runner diagram ──────────────────────────────

function _buildBaseDiagram(currentPlay) {
    const runners  = currentPlay?.runners || [];
    const occupied = new Set(
        runners
            .map(r => r.movement?.end)
            .filter(e => e && e !== 'score' && e !== 'Home')
    );

    const baseCls = base => occupied.has(base) ? 'lg-base-occupied' : 'lg-base-empty';

    return `<svg class="lg-base-diagram" viewBox="0 0 60 60" width="56" xmlns="http://www.w3.org/2000/svg" aria-label="Base runner positions" style="pointer-events:none">
        <line x1="30" y1="12" x2="50" y2="30" class="lg-base-line"/>
        <line x1="50" y1="30" x2="30" y2="48" class="lg-base-line"/>
        <line x1="30" y1="48" x2="10" y2="30" class="lg-base-line"/>
        <line x1="10" y1="30" x2="30" y2="12" class="lg-base-line"/>
        <rect x="26" y="8"  width="8" height="8" transform="rotate(45,30,12)" class="${baseCls('2B')}"/>
        <rect x="6"  y="26" width="8" height="8" transform="rotate(45,10,30)" class="${baseCls('3B')}"/>
        <rect x="46" y="26" width="8" height="8" transform="rotate(45,50,30)" class="${baseCls('1B')}"/>
        <polygon points="26,52 34,52 36,48 30,46 24,48" class="lg-home-plate-shape"/>
    </svg>`;
}

// ── Phase 2: Tooltip ──────────────────────────────────────────

function _lgShowTooltip(groupEl, zoneWrap) {
    if (_lgPitchTooltipEl?._forGroup === groupEl) return;
    _lgHideTooltip();

    const circle = groupEl.querySelector('circle:not(.lg-dot-focus-ring)');
    if (!circle) return;

    const tip = document.createElement('div');
    tip.className = 'lg-pitch-tooltip';
    tip.innerHTML = [
        _escHtml(groupEl.dataset.pitchType),
        _escHtml([groupEl.dataset.velocity, groupEl.dataset.spin].filter(Boolean).join(' · ')),
        _escHtml(groupEl.dataset.result),
        _escHtml(groupEl.dataset.count),
    ].join('<br>');
    zoneWrap.appendChild(tip);
    _lgPitchTooltipEl = tip;
    tip._forGroup = groupEl;

    const cr   = circle.getBoundingClientRect();
    const wr   = zoneWrap.getBoundingClientRect();
    const tipH = tip.offsetHeight;
    const tipW = tip.offsetWidth;

    const relTop  = cr.top  - wr.top;
    const relLeft = cr.left - wr.left + cr.width / 2;

    let top  = relTop - tipH - 6;
    let left = relLeft - tipW / 2;

    if (top < 0) top = relTop + cr.height + 6;
    left = Math.max(0, Math.min(left, wr.width - tipW));

    tip.style.top  = `${top}px`;
    tip.style.left = `${left}px`;
}

function _lgHideTooltip() {
    if (_lgPitchTooltipEl) {
        _lgPitchTooltipEl.remove();
        _lgPitchTooltipEl = null;
    }
}

function _wireZoneEvents(panel, gamePk) {
    const toggle = panel.querySelector('.lg-zone-col .lg-zone-toggle');
    if (toggle && gamePk != null) {
        toggle.addEventListener('click', e => {
            const btn = e.target.closest?.('[data-lg-zone]');
            if (!btn || btn.disabled) return;
            _lgZoneMode.set(String(gamePk), btn.dataset.lgZone);
            if (_lgFeedCache) _renderZone(panel, _lgFeedCache, String(gamePk));
        });
    }
    const zoneWrap = panel.querySelector('.lg-zone-wrap');
    if (!zoneWrap) return;

    zoneWrap.addEventListener('mouseover', e => {
        const group = e.target.closest?.('.lg-dot-group');
        if (group) _lgShowTooltip(group, zoneWrap);
    });

    zoneWrap.addEventListener('mouseleave', () => _lgHideTooltip());

    zoneWrap.addEventListener('click', e => {
        const group = e.target.closest?.('.lg-dot-group');
        if (group) {
            if (_lgPitchTooltipEl) {
                _lgHideTooltip();
            } else {
                _lgShowTooltip(group, zoneWrap);
            }
        } else {
            _lgHideTooltip();
        }
    });

    zoneWrap.addEventListener('focusin', e => {
        const group = e.target.closest?.('.lg-dot-group');
        if (group) _lgShowTooltip(group, zoneWrap);
    });

    zoneWrap.addEventListener('focusout', e => {
        const group = e.target.closest?.('.lg-dot-group');
        if (group) _lgHideTooltip();
    });

    zoneWrap.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            _lgHideTooltip();
            zoneWrap.focus();
        }
    });
}

// ── Phase 1 (D-117): Batter/pitcher hero + Due Up rail ─────────
// Hero is built synchronously from data _renderPanel already has (matchup,
// box score pitching line, current at-bat pitches) — only the batter's
// season AVG/OPS needs a new fetch, and that fetch is gated on the batter
// actually changing, not on poll cadence (Axiom, D-117 Phase 1 feasibility).

async function _lgFetchBatterSeasonLine(batterId) {
    if (_lgSeasonStatCache[batterId] !== undefined) return _lgSeasonStatCache[batterId];
    try {
        const data = await mlbFetch(
            `/people/${batterId}/stats`,
            { stats: 'season', season: MLB_SEASON, group: 'hitting' },
            ApiCache.TTL.MEDIUM
        );
        const line = data?.stats?.[0]?.splits?.[0]?.stat || null;
        _lgSeasonStatCache[batterId] = line;
        return line;
    } catch (err) {
        Logger.warn('Hero batter season-line fetch failed', err, 'LIVE');
        _lgSeasonStatCache[batterId] = null;
        return null;
    }
}

function _lgInitial(name) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

function _buildHero(feed) {
    const status       = feed.gameData?.status || {};
    const isPreview    = status.abstractGameState === 'Preview';
    const isFinal      = status.abstractGameState === 'Final';
    const isDelayed    = /delay|suspend/i.test(status.detailedState || '');

    // No "current batter" in a finished game — hero is retired entirely,
    // matching Vera's Final state spec (D-117 Phase 1).
    if (isFinal) return '';

    if (isPreview) {
        const pp = feed.gameData?.probablePitchers;
        if (!pp || (!pp.away?.fullName && !pp.home?.fullName)) return '';
        const away = feed.gameData?.teams?.away || {};
        const home = feed.gameData?.teams?.home || {};
        const awayClr = getMLBTeamColors(away.abbreviation)?.primary || 'var(--accent)';
        const homeClr = getMLBTeamColors(home.abbreviation)?.primary || 'var(--accent)';
        const side = (abbr, p, color) => `<div class="lg-hero-side">
            <div class="player-avatar lg-hero-badge" style="background:linear-gradient(135deg,${color}cc,${color}55)">${_lgInitial(p?.fullName)}</div>
            <div class="lg-hero-body">
                <div class="lg-hero-role">${_escHtml(abbr || '')} Probable</div>
                <div class="lg-hero-name">${p?.fullName ? _escHtml(p.fullName) : 'TBD'}</div>
            </div>
        </div>`;
        return `<div class="lg-hero lg-hero--pregame">
            ${side(away.abbreviation, pp.away, awayClr)}
            <div class="lg-hero-divider"></div>
            ${side(home.abbreviation, pp.home, homeClr)}
        </div>`;
    }

    const currentPlay = feed.liveData?.plays?.currentPlay;
    const matchup      = currentPlay?.matchup;
    if (!matchup?.batter?.id || !matchup?.pitcher?.id) return '';

    const batterId     = matchup.batter.id;
    const pitcherId    = matchup.pitcher.id;
    const batterName   = matchup.batter.fullName || '';
    const pitcherName  = matchup.pitcher.fullName || '';
    const isTop        = !!feed.liveData?.linescore?.isTopInning;
    const battingTeam  = isTop ? feed.gameData?.teams?.away : feed.gameData?.teams?.home;
    const pitchingTeam = isTop ? feed.gameData?.teams?.home : feed.gameData?.teams?.away;
    const batClr       = getMLBTeamColors(battingTeam?.abbreviation)?.primary  || 'var(--accent)';
    const pitClr       = getMLBTeamColors(pitchingTeam?.abbreviation)?.primary || 'var(--accent)';

    // Pitcher line: today's pitch count + last-pitch velocity — both already
    // in hand from data this poll already fetched, zero new requests.
    const boxscore   = feed.liveData?.boxscore || {};
    const pSide      = isTop ? 'home' : 'away';
    const pStats     = boxscore.teams?.[pSide]?.players?.[`ID${pitcherId}`]?.stats?.pitching || {};
    const pitchCount = pStats.numberOfPitches ?? '—';
    const pitchesThrown = (currentPlay?.playEvents || []).filter(e => e.isPitch);
    const lastVelo    = pitchesThrown.length ? pitchesThrown[pitchesThrown.length - 1].startSpeed : null;

    const cachedLine = _lgSeasonStatCache[batterId];
    const battingStatHtml = cachedLine === undefined ? 'Loading…'
        : cachedLine === null ? '—'
        : `${cachedLine.avg ?? '—'} AVG · ${cachedLine.ops ?? '—'} OPS`;

    // Motion gate: only a real batter change gets the entrance animation —
    // a poll that re-renders the same at-bat should never replay it
    // (Kael, D-117 Phase 1 — "motion marks a real state change, never a refresh").
    const changed = _lgLastHeroBatterId !== batterId;
    _lgLastHeroBatterId = batterId;

    const delayNote = isDelayed ? '<div class="lg-hero-delay">Game Delayed</div>' : '';

    return `<div class="lg-hero${changed ? ' lg-hero--new' : ''}" data-batter-id="${batterId}">
        <div class="lg-hero-side">
            <div class="player-avatar lg-hero-badge" style="background:linear-gradient(135deg,${batClr}cc,${batClr}55)">${_lgInitial(batterName)}</div>
            <div class="lg-hero-body">
                <div class="lg-hero-role">Batting</div>
                <div class="lg-hero-name">${_escHtml(batterName)}</div>
                <div class="lg-hero-stat" data-hero-batter-stat>${_escHtml(battingStatHtml)}</div>
            </div>
        </div>
        <div class="lg-hero-divider"></div>
        <div class="lg-hero-side">
            <div class="player-avatar lg-hero-badge" style="background:linear-gradient(135deg,${pitClr}cc,${pitClr}55)">${_lgInitial(pitcherName)}</div>
            <div class="lg-hero-body">
                <div class="lg-hero-role">Pitching</div>
                <div class="lg-hero-name">${_escHtml(pitcherName)}</div>
                <div class="lg-hero-stat">${pitchCount} pitches${lastVelo ? ` · ${lastVelo} mph` : ''}</div>
            </div>
        </div>
        ${delayNote}
    </div>`;
}

// Kicks off the cached season-line fetch for the current batter (if not
// already cached) and patches just the stat-line node when it resolves —
// guarded against a batter change mid-flight (Axiom, D-117 Phase 1).
function _lgMaybeFetchHeroBatterLine(feed, panel) {
    const batterId = feed.liveData?.plays?.currentPlay?.matchup?.batter?.id;
    if (!batterId || _lgSeasonStatCache[batterId] !== undefined) return;
    _lgFetchBatterSeasonLine(batterId).then(line => {
        if (_lgFeedCache !== feed) return; // a newer poll already superseded this one
        const heroEl = panel.querySelector('.lg-hero');
        if (!heroEl || heroEl.dataset.batterId !== String(batterId)) return; // batter moved on
        const statEl = heroEl.querySelector('[data-hero-batter-stat]');
        if (statEl) statEl.textContent = line ? `${line.avg ?? '—'} AVG · ${line.ops ?? '—'} OPS` : '—';
    });
}

function _buildDueUp(feed) {
    const status       = feed.gameData?.status || {};
    if (status.abstractGameState !== 'Live') return '';

    const currentPlay = feed.liveData?.plays?.currentPlay;
    const batterId     = currentPlay?.matchup?.batter?.id;
    if (!batterId) return '';

    const boxscore = feed.liveData?.boxscore || {};
    const side      = feed.liveData?.linescore?.isTopInning ? 'away' : 'home';
    const team      = boxscore.teams?.[side] || {};
    const order     = team.battingOrder || [];
    const idx       = order.indexOf(batterId);
    if (idx === -1 || !order.length) return '';

    const players  = team.players || {};
    const upcoming = [1, 2, 3].map(n => order[(idx + n) % order.length]);

    const rows = upcoming.map(pid => {
        const p   = players[`ID${pid}`] || {};
        const nm  = p.person?.fullName || '';
        const pos = p.position?.abbreviation || '';
        if (!nm) return '';
        return `<div class="lg-dueup-item">
            <span class="lg-dueup-name">${_escHtml(nm)}</span>
            <span class="lg-dueup-pos">${_escHtml(pos)}</span>
        </div>`;
    }).filter(Boolean).join('');

    if (!rows) return '';

    return `<div class="lg-dueup-wrap">
        <div class="lg-box-section-title">Due Up</div>
        <div class="lg-dueup">${rows}</div>
    </div>`;
}

// ── Phase 1 (D-117): Mini standings + mini leaders (sidebar) ───
// Reuse the site's existing shared caches — fetchMLBStandingsFull() and
// _fetchMLBLeaderSplits(), the same primitives the Standings and Leaders
// views already use — rather than a scoped one-off. A cold direct link to
// mlb-live-{id} (a shared URL, a bookmark) is a realistic entry path with
// AppState not yet warm, not an edge case (Axiom, D-117 Phase 1 feasibility).
// Fetched once per game open (gated by _lgSidebarExtrasGamePk), not per poll.

async function _lgBuildMiniStandings(homeAbbr, awayAbbr) {
    try {
        if (!AppState.mlbStandings) {
            AppState.mlbStandings = await fetchMLBStandingsFull();
        }
    } catch (err) {
        Logger.warn('Mini standings fetch failed', err, 'LIVE');
        return '';
    }
    const divisions = AppState.mlbStandings || [];
    // Field names confirmed against the real deployed AppState.mlbStandings
    // shape (live-verified 2026-08-23, gamePk 824799) — teamAbbr/gb, not the
    // abbreviation/gamesBack names Axiom's feasibility pass assumed by
    // analogy with the team-object shape used elsewhere in the codebase.
    const div = divisions.find(d =>
        (d.teams || []).some(t => t.teamAbbr === homeAbbr || t.teamAbbr === awayAbbr)
    );
    if (!div || !(div.teams || []).length) return '';

    const rows = div.teams.slice(0, 5).map(t => {
        const clr = getMLBTeamColors(t.teamAbbr)?.primary || 'var(--text-muted)';
        const gb  = t.gb === '-' ? '—' : (t.gb ?? '—');
        return `<div class="lg-side-row">
            <span><span class="lg-mini-dot" style="background:${clr}"></span>${_escHtml(t.teamAbbr || '')}</span>
            <span class="lg-side-val">${t.wins ?? '—'}-${t.losses ?? '—'} · ${gb}</span>
        </div>`;
    }).join('');

    return `<div class="lg-side-card">
        <div class="lg-box-section-title">${_escHtml(div.division || 'Standings')}</div>
        ${rows}
    </div>`;
}

async function _lgBuildMiniLeaders() {
    try {
        if (!AppState.mlbLeaderSplits && typeof _fetchMLBLeaderSplits === 'function') {
            await _fetchMLBLeaderSplits(MLB_SEASON);
        }
    } catch (err) {
        Logger.warn('Mini leaders fetch failed', err, 'LIVE');
        return '';
    }
    const hitting = AppState.mlbLeaderSplits?.hitting || [];
    const top = hitting
        .filter(s => s.stat?.ops != null && (s.stat.plateAppearances || 0) >= 100)
        .sort((a, b) => (parseFloat(b.stat.ops) || 0) - (parseFloat(a.stat.ops) || 0))
        .slice(0, 5);
    if (!top.length) return '';

    const rows = top.map(s => `<div class="lg-side-row">
        <span>${_escHtml(s.player?.fullName || '')}</span>
        <span class="lg-side-val">${_escHtml(String(s.stat.ops))}</span>
    </div>`).join('');

    return `<div class="lg-side-card">
        <div class="lg-box-section-title">OPS Leaders</div>
        ${rows}
    </div>`;
}

let _lgMiniStandingsHtml   = '';
let _lgMiniLeadersHtml     = '';
let _lgSidebarExtrasGamePk = null;

async function _lgFetchSidebarExtras(gamePk, awayAbbr, homeAbbr) {
    const [standingsHtml, leadersHtml] = await Promise.all([
        _lgBuildMiniStandings(homeAbbr, awayAbbr),
        _lgBuildMiniLeaders(),
    ]);
    if (_lgSidebarExtrasGamePk !== String(gamePk)) return; // superseded by a different game
    _lgMiniStandingsHtml = standingsHtml;
    _lgMiniLeadersHtml   = leadersHtml;
    const el = document.querySelector('.lg-sidebar');
    if (el && _lgFeedCache) el.innerHTML = _lgMiniStandingsHtml + _lgMiniLeadersHtml + _buildSidebar(_lgFeedCache);
}

// ── D-117 Phase 2: Bullpen tab ────────────────────────────────
// Today's live usage (pitch counts) reads boxscore — already in
// _lgFeedCache every poll, zero new fetch. Rest-day availability for
// relievers not yet used today reuses mlb.js's _fetchBullpenRest verbatim
// (global via script load order, same reuse discipline as Phase 1's
// fetchMLBStandingsFull/_fetchMLBLeaderSplits), fetched once per game open,
// gated lazily on first tab entry (Axiom, D-117 Phase 2).

let _lgBullpenRestHtml   = { away: '', home: '' };
let _lgBullpenRestGamePk = null;

function _lgBullpenRestPill(name, daysAgo) {
    const [cls, label] = daysAgo === 0 ? ['bullpen-pill--hot',   'Yesterday']
                       : daysAgo === 1 ? ['bullpen-pill--warm',  '1 day rest']
                       : daysAgo === 2 ? ['bullpen-pill--ok',    '2 days rest']
                       :                 ['bullpen-pill--fresh', `${daysAgo}d rest`];
    const lastName = (name || '').split(' ').slice(-1)[0] || name || '';
    return `<span class="bullpen-pill ${cls}" title="${_escHtml(name || '')} — last pitched ${daysAgo === 0 ? 'yesterday' : daysAgo + ' days ago'}">${_escHtml(lastName)} <span class="bullpen-pill-rest">${_escHtml(label)}</span></span>`;
}

function _buildBullpenUsageRows(players, teamAbbr, teamColor) {
    const used = Object.values(players || {})
        .filter(p => {
            const pit = p.stats?.pitching;
            if (!pit || (pit.gamesStarted || 0) > 0) return false;
            return parseFloat(pit.inningsPitched || 0) > 0 || (pit.numberOfPitches || 0) > 0;
        })
        .sort((a, b) => (b.stats.pitching.numberOfPitches || 0) - (a.stats.pitching.numberOfPitches || 0));

    const rows = used.map(p => `<div class="lg-side-row">
        <span>${_escHtml(p.person?.fullName || '')}</span>
        <span class="lg-side-val">${p.stats.pitching.numberOfPitches ?? 0} P</span>
    </div>`).join('');

    return `<div class="lg-bullpen-team">
        <div class="lg-box-section-title" style="color:${teamColor}">${_escHtml(teamAbbr || '')}</div>
        ${rows || '<div class="lg-bullpen-empty">No relievers used yet.</div>'}
    </div>`;
}

function _buildBullpenTab(feed, gamePk) {
    const boxscore = feed.liveData?.boxscore || {};
    const away     = feed.gameData?.teams?.away || {};
    const home     = feed.gameData?.teams?.home || {};
    const awayClr  = getMLBTeamColors(away.abbreviation)?.primary || 'var(--accent)';
    const homeClr  = getMLBTeamColors(home.abbreviation)?.primary || 'var(--accent)';
    const isFinal  = feed.gameData?.status?.abstractGameState === 'Final';

    const usageHtml = _buildBullpenUsageRows(boxscore.teams?.away?.players, away.abbreviation, awayClr)
        + _buildBullpenUsageRows(boxscore.teams?.home?.players, home.abbreviation, homeClr);

    let availableHtml = '';
    if (!isFinal) {
        const fetched = String(_lgBullpenRestGamePk) === String(gamePk);
        if (!fetched) {
            availableHtml = '<div class="skeleton-line" style="height:14px;margin:0.6rem 0;width:70%"></div>';
        } else if (_lgBullpenRestHtml.away || _lgBullpenRestHtml.home) {
            availableHtml = `<div class="lg-bullpen-available-wrap">${_lgBullpenRestHtml.away}${_lgBullpenRestHtml.home}</div>`;
        }
        // fetched but both empty (no reliever appearance in the last 3 Final
        // games for either team) → omitted, not a guessed "All fresh"
        // (Vera, D-117 Phase 2 — omission over invented confidence).
    }

    return usageHtml + availableHtml;
}

async function _lgFetchBullpenRest(gamePk, awayId, homeId, awayAbbr, homeAbbr) {
    const [awayRest, homeRest] = await Promise.all([
        _fetchBullpenRest(awayId),
        _fetchBullpenRest(homeId),
    ]);
    if (String(_lgBullpenRestGamePk) !== String(gamePk)) return; // superseded by a different game

    const boxscore = _lgFeedCache?.liveData?.boxscore || {};
    // Boxscore's players map lists the FULL active roster for the game (all
    // ~27 players), not just those who've appeared — confirmed live against
    // ATL@MIL (823745): unused relievers like Brent Suter showed up here
    // with an empty {} pitching stat line. Filter to players who actually
    // have a populated pitching line (the API only attaches one once a
    // pitcher takes the mound) so "used today" means "has pitched today,"
    // not "is on the active roster" (caught during D-117 Phase 2 live
    // verification, 2026-08-23).
    const usedTodayIds = new Set(
        [
            ...Object.values(boxscore.teams?.away?.players || {}),
            ...Object.values(boxscore.teams?.home?.players || {}),
        ]
            .filter(p => Object.keys(p.stats?.pitching || {}).length > 0)
            .map(p => p.person?.id)
            .filter(Boolean)
    );

    const renderSide = (restMap, abbr) => {
        const color  = getMLBTeamColors(abbr)?.primary || 'var(--text-muted)';
        const rested = Object.entries(restMap || {})
            .filter(([pid, p]) => p.gs === 0 && p.daysAgo <= 3 && !usedTodayIds.has(Number(pid)))
            .sort((a, b) => a[1].daysAgo - b[1].daysAgo);
        if (!rested.length) return '';
        return `<div class="bullpen-team-section">
            <span class="bullpen-abbr" style="color:${color}">${_escHtml(abbr || '')}</span>
            ${rested.map(([, p]) => _lgBullpenRestPill(p.name, p.daysAgo)).join('')}
        </div>`;
    };

    _lgBullpenRestHtml.away = renderSide(awayRest, awayAbbr);
    _lgBullpenRestHtml.home = renderSide(homeRest, homeAbbr);

    const panel    = document.querySelector('.lg-panel');
    const tabpanel = panel?.querySelector('.lg-tab-content');
    if (tabpanel && _lgTabMap.get(String(gamePk)) === 'bullpen' && _lgFeedCache) {
        tabpanel.innerHTML = _buildBullpenTab(_lgFeedCache, gamePk);
    }
}

// ── Phase 2: H2H data + Matchup tab ──────────────────────────

async function _lgFetchH2H(batterId, pitcherId) {
    const key = `${batterId}_${pitcherId}`;
    if (_lgH2HCache[key] !== undefined) return _lgH2HCache[key];
    try {
        const data = await mlbFetch(
            `/people/${batterId}/stats`,
            { stats: 'vsPlayer', opposingPlayerId: pitcherId, group: 'hitting' },
            ApiCache.TTL.MEDIUM
        );
        const total = data?.stats?.find(s => s.type?.displayName === 'vsPlayerTotal')
            ?.splits?.[0]?.stat || null;
        _lgH2HCache[key] = total;
        return total;
    } catch (err) {
        Logger.warn('H2H fetch failed', err, 'LIVE');
        _lgH2HCache[key] = null;
        return null;
    }
}

async function _buildMatchupContent(feed) {
    const currentPlay = feed.liveData?.plays?.currentPlay;
    const matchup     = currentPlay?.matchup;
    if (!matchup) return '<div class="lg-pbp-empty">No at-bat in progress.</div>';

    const batterId    = matchup.batter?.id;
    const pitcherId   = matchup.pitcher?.id;
    const batterName  = _escHtml(matchup.batter?.fullName  || '');
    const pitcherName = _escHtml(matchup.pitcher?.fullName || '');

    const [h2h, arsenalRows] = await Promise.all([
        (batterId && pitcherId) ? _lgFetchH2H(batterId, pitcherId) : Promise.resolve(null),
        pitcherId               ? _fetchPitchArsenal(pitcherId)     : Promise.resolve(null),
    ]);

    // Block 1 — Career H2H
    let block1Html;
    const pa = h2h?.plateAppearances;
    if (!h2h || !pa) {
        block1Html = `<div class="lg-matchup-empty">${batterName} has never faced ${pitcherName} in the majors</div>`;
    } else {
        const s = h2h;
        block1Html = `<table class="lg-box-table"><thead><tr>
            <th>PA</th><th>H</th><th>HR</th><th>BB</th><th>K</th><th>AVG</th><th>OBP</th><th>SLG</th>
        </tr></thead><tbody><tr>
            <td>${pa}</td>
            <td>${s.hits           ?? '—'}</td>
            <td>${s.homeRuns       ?? '—'}</td>
            <td>${s.baseOnBalls    ?? '—'}</td>
            <td>${s.strikeOuts     ?? '—'}</td>
            <td>${s.avg            ?? '—'}</td>
            <td>${s.obp            ?? '—'}</td>
            <td>${s.slg            ?? '—'}</td>
        </tr></tbody></table>`;
    }

    // Block 2 — This At-Bat (only if pitches thrown)
    const pitches = (currentPlay?.playEvents || []).filter(e => e.isPitch);
    const ls      = feed.liveData?.linescore || {};
    let block2Html = '';
    if (pitches.length > 0) {
        block2Html = `<div class="lg-matchup-block">
            <div class="lg-box-section-title">This At-Bat</div>
            <div class="lg-matchup-line">${pitches.length} pitch${pitches.length !== 1 ? 'es' : ''} · ${ls.balls ?? '?'}-${ls.strikes ?? '?'} count</div>
        </div>`;
    }

    // Block 3 — Pitcher Arsenal (only if Statcast data available)
    let block3Html = '';
    if (arsenalRows?.length) {
        block3Html = `<div class="lg-matchup-block">
            <div class="lg-box-section-title">${pitcherName} Arsenal</div>
            ${_renderPitchArsenal(arsenalRows)}
        </div>`;
    }

    return `<div class="lg-matchup-wrap">
        <div class="lg-matchup-block">
            <div class="lg-box-section-title">${batterName} vs. ${pitcherName}</div>
            ${block1Html}
        </div>
        ${block2Html}
        ${block3Html}
    </div>`;
}

// ── Tab switching ─────────────────────────────────────────────

function _switchTab(panel, tabId, gamePk) {
    _lgTabMap.set(gamePk, tabId);
    panel.querySelectorAll('[data-lg-tab]').forEach(btn => {
        const active = btn.dataset.lgTab === tabId;
        btn.classList.toggle('mlb-group-btn--active', active);
        btn.setAttribute('aria-selected', String(active));
    });
    const tabpanel = panel.querySelector('.lg-tab-content');
    if (tabpanel) tabpanel.setAttribute('aria-labelledby', `lg-tab-${tabId}`);
    if (!_lgFeedCache) return;

    const feed = _lgFeedCache;
    const away = feed.gameData?.teams?.away?.abbreviation || '';
    const home = feed.gameData?.teams?.home?.abbreviation || '';

    if (tabId === 'pbp') {
        tabpanel.innerHTML = _buildPbp(feed.liveData?.plays?.allPlays || []);
    } else if (tabId === 'box') {
        tabpanel.innerHTML = _buildBoxScore(feed.liveData?.boxscore || {}, away, home);
    } else if (tabId === 'matchup') {
        tabpanel.innerHTML = `
            <div class="skeleton-line" style="height:14px;margin:0.4rem 0;width:85%"></div>
            <div class="skeleton-line" style="height:14px;margin:0.4rem 0;width:70%"></div>`;
        _buildMatchupContent(feed).then(html => {
            if (_lgFeedCache === feed) tabpanel.innerHTML = html;
        }).catch(err => {
            Logger.warn('Matchup content failed', err, 'LIVE');
            if (_lgFeedCache === feed) tabpanel.innerHTML = '<div class="lg-matchup-empty">Matchup data unavailable.</div>';
        });
    } else if (tabId === 'bullpen') {
        // Phase 2 (D-117): today's usage renders synchronously (boxscore's
        // already in _lgFeedCache); rest-day availability is fetched once per
        // game, lazily on first entry into this tab — not eagerly like Phase
        // 1's mini standings, since this content is behind a tab click, not
        // always visible (Axiom, D-117 Phase 2).
        tabpanel.innerHTML = _buildBullpenTab(feed, gamePk);
        const isFinal = feed.gameData?.status?.abstractGameState === 'Final';
        if (!isFinal && String(_lgBullpenRestGamePk) !== String(gamePk)) {
            const awayId   = feed.gameData?.teams?.away?.id;
            const homeId   = feed.gameData?.teams?.home?.id;
            const awayAbbr = feed.gameData?.teams?.away?.abbreviation || '';
            const homeAbbr = feed.gameData?.teams?.home?.abbreviation || '';
            if (awayId && homeId) {
                _lgBullpenRestGamePk = String(gamePk);
                _lgFetchBullpenRest(gamePk, awayId, homeId, awayAbbr, homeAbbr);
            }
        }
    }
}

// ── Status badge ──────────────────────────────────────────────

function _updateBadge(panel, state) {
    const badge = panel?.querySelector('.lg-status-badge');
    if (!badge) return;
    if (state === 'live') {
        badge.className = 'game-status game-status--live lg-status-badge';
        badge.innerHTML = '<span class="live-dot"></span>LIVE';
    } else if (state === 'reconnecting') {
        badge.className = 'game-status game-status--sched lg-status-badge';
        badge.textContent = 'RECONNECTING…';
    } else if (state === 'unavailable') {
        badge.className = 'game-status game-status--sched lg-status-badge';
        badge.textContent = 'DATA UNAVAILABLE';
    }
}

function _flashScore(panel, side) {
    const el = panel.querySelector(`.lg-score[data-side="${side}"]`);
    if (!el) return;
    el.classList.add('lg-score--flash');
    setTimeout(() => el.classList.remove('lg-score--flash'), 800);
}

function _showRetryBtn(panel) {
    if (panel.querySelector('.lg-retry-btn')) return;
    const btn       = document.createElement('button');
    btn.className   = 'lg-retry-btn';
    btn.textContent = 'Retry';
    btn.onclick = () => {
        btn.remove();
        _lgFailures = 0;
        _updateBadge(panel, 'live');
        _doPoll(_lgGamePk);
    };
    panel.querySelector('.lg-meta-row')?.appendChild(btn);
}

function _animateNewPlays(panel, prevCount) {
    const entries  = panel.querySelectorAll('.lg-pbp-entry');
    const newCount = entries.length - prevCount;
    for (let i = 0; i < Math.min(newCount, entries.length); i++) {
        entries[i].classList.add('lg-pbp-entry--new');
    }
}

// ── Page-mode entry point (navigateTo('mlb-live-{gamePk}')) ──
function showMLBLiveGame(gamePk) {
    stopLiveGamePolling();

    // Prefer the stub set by the card click; fall back to cached games list
    // for back-navigation and deep-link cases where mlbLiveGame may be stale.
    const game = AppState?.mlbLiveGame?.gamePk === gamePk
        ? AppState.mlbLiveGame
        : (AppState.mlbGames || []).find(g => g.gamePk === gamePk) || {};

    _lgGamePk     = String(gamePk);
    _lgFeedCache  = null;
    _lgTriggerEl  = null;
    _lgIsPageMode = true;

    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    // navigateTo() leaves #playersGrid as .players-grid (multi-column auto-fill);
    // the live view is a single-column page, so clear it the way scorecard/detail do.
    grid.className = '';

    const page = document.createElement('div');
    page.className = 'lg-live-page';

    const backRow = document.createElement('div');
    backRow.className = 'arcade-back-row';
    const backBtn = document.createElement('button');
    backBtn.className   = 'arcade-back-btn';
    backBtn.textContent = '← Back to Scores';
    backBtn.addEventListener('click', () => navigateTo('mlb-games'));
    backRow.appendChild(backBtn);
    page.appendChild(backRow);

    const panel = _buildSkeletonPanel(game);
    page.appendChild(panel);

    // Breadcrumb: best-effort now from the game stub, refined once the feed
    // loads via _renderPanel. Without this, this route falls through
    // navigateTo()'s generic setBreadcrumb(view, null) — no _NAV_META entry
    // exists for a dynamic gamePk route, so it printed the raw hash
    // ("mlb-live-824801") as the breadcrumb text.
    if (window.setBreadcrumb) {
        const awayAbbr = game?.teams?.away?.team?.abbreviation;
        const homeAbbr = game?.teams?.home?.team?.abbreviation;
        setBreadcrumb('mlb-games', awayAbbr && homeAbbr ? `${awayAbbr} @ ${homeAbbr}` : 'Live Game');
    }

    // Sidebar (page mode only) — surfaces feed/live fields the tab body never
    // rendered (venue/weather, mound visits, challenges, umpires). Filled in
    // by _renderPanel once the first poll resolves.
    const sidebarEl = document.createElement('div');
    sidebarEl.className = 'lg-sidebar';
    sidebarEl.setAttribute('aria-label', 'Game details');
    sidebarEl.innerHTML =
        `<div class="lg-side-card">
            <div class="skeleton-line" style="height:12px;margin:0.4rem 0;width:70%"></div>
            <div class="skeleton-line" style="height:12px;margin:0.4rem 0;width:50%"></div>
        </div>`;
    page.appendChild(sidebarEl);

    grid.innerHTML = '';
    grid.appendChild(page);
    panel.focus();

    _doPoll(gamePk).then(() => {
        // Guard against navigation-away during the initial poll
        if (_lgGamePk) _lgInterval = setInterval(() => _doPoll(_lgGamePk), _lgNextInterval(_lgFeedCache));
    });
}

// ── Global exports ────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.openLiveGamePanel   = openLiveGamePanel;
    window.stopLiveGamePolling = stopLiveGamePolling;
    window.showMLBLiveGame     = showMLBLiveGame;
}
