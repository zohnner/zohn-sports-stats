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
let _lgPlayerCardEl   = null;   // active embedded player card DOM node or null — D-117 Phase 5
let _lgH2HCache       = {};     // { "batterId_pitcherId": vsPlayerTotal stat obj }
let _lgLastPollMs     = null;   // timestamp of last completed poll (for freshness display)
let _lgTsInterval     = null;   // secondary interval — updates "Updated Xs ago" text
let _lgZoneMode       = new Map(); // gamePk → 'dots' | 'heat' — pitch zone view, session-scoped
let _lgZoneLastPitchCount = new Map(); // `${gamePk}_${atBatIndex}` → pitch count last rendered — D-117 Phase 3 trajectory-entrance gate
let _lgIsPageMode     = false;  // true when opened via showMLBLiveGame (full page); false for the inline accordion (openLiveGamePanel)
let _lgLastHeroBatterId = null; // batter id from previous poll — hero entrance-motion gate (D-117 Phase 1)
let _lgSeasonStatCache  = {};   // { playerId: seasonHittingStatObj | null } — hero batter AVG/OPS cache (D-117 Phase 1)
let _lgPregameHtml    = '';     // cached rendered pregame-preview HTML (page mode only)
let _lgPregameGamePk  = null;   // gamePk _lgPregameHtml belongs to / is being fetched for

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
    _lgSeasonSeriesHtml    = '';
    _lgSidebarExtrasGamePk = null;
    _lgBullpenRestHtml     = { away: '', home: '' };
    _lgBullpenRestGamePk   = null;
    _lgLastPollMs     = null;
    _lgIsPageMode     = false;
    _lgZoneMode.clear();
    _lgZoneLastPitchCount.clear();
    _lgPregameHtml    = '';
    _lgPregameGamePk  = null;
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

    // First arm uses _lgNextInterval(feed) — the authoritative post-poll
    // interval, same as showMLBLiveGame — not _pollInterval(game)'s stale
    // AppState stub, which could hold a pregame LG_POLL_MS poll for hours
    // before first pitch (the exact bug _lgNextInterval was built to fix,
    // missed here since this is a separate entry point — D-117 debug pass).
    await _doPoll(gamePk);
    if (_lgShouldArmPolling(gamePk)) _lgInterval = setInterval(() => _doPoll(_lgGamePk), _lgNextInterval(_lgFeedCache));
}

// ── Internal ─────────────────────────────────────────────────

// Shared arm-guard for both entry points. Equality (not just truthiness) on
// gamePk, matching each call site's own prior comment. Also refuses to arm
// for a game that's already Final on its very first poll (e.g. a deep link
// straight to a finished game) — found live 2026-09-02 alongside the
// _doPoll isFinalNow fix: without this, both showMLBLiveGame and
// openLiveGamePanel would unconditionally arm a 9s interval after the
// first poll resolves, regardless of game state, which kept polling a
// finished game forever and periodically flashed the status badge back to
// "LIVE" (_updateBadge(panel,'live') runs unconditionally at the top of
// every _doPoll, before the Final check) each time that interval fired.
function _lgShouldArmPolling(gamePk) {
    return _lgGamePk === String(gamePk)
        && _lgFeedCache?.gameData?.status?.abstractGameState !== 'Final';
}

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

// Computed from a fetched feed/live payload (authoritative), not the
// AppState game stub — used to arm/re-arm polling after every successful
// poll on both entry points (openLiveGamePanel, showMLBLiveGame), including
// each one's very first arm. Previously each entry point's first arm
// hardcoded LG_POLL_MS regardless of game state, so a pregame page polled
// every 9s for hours before first pitch.
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

        // Outs/balls/strikes/current-batter are on this same lightweight
        // linescore payload and change on nearly every pitch — without them
        // in the key, a strikeout, walk, or groundout that doesn't change
        // the score or inning never triggers a feed/live refetch, so the
        // hero, Due Up, win prob, pitch mix, and PBP all sit frozen for the
        // rest of the half-inning (found during the D-117 post-ship debug
        // pass, 2026-08-30 — pre-existing gate, made much more visible now
        // that six phases of "live" UI depend on per-play freshness).
        const stateKey = `${ls.currentInning}|${ls.inningState}|${ls.outs}|${ls.balls}|${ls.strikes}|${ls.offense?.batter?.id}|${ls.teams?.away?.runs}|${ls.teams?.home?.runs}`;
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

        // Stop polling once a game goes Final — no more updates are coming.
        // Deliberately NOT the full stopLiveGamePolling(): that also wipes
        // _lgGamePk/_lgFeedCache/_lgTabMap/etc., which are exactly what tab
        // switching (_switchTab), the Matchup H2H fetch, and every other
        // still-live interaction on this now-static panel depend on. Found
        // live 2026-09-02: calling the full teardown here meant clicking
        // Box Score/Matchup/Bullpen on ANY finished game silently did
        // nothing — the tab buttons toggled active but the content stayed
        // frozen on whichever tab happened to be showing at the moment the
        // game went Final, since _switchTab bails out immediately once
        // _lgFeedCache is null.
        const isFinalNow = feed.gameData?.status?.abstractGameState === 'Final';
        if (isFinalNow) {
            if (_lgInterval)   { clearInterval(_lgInterval);   _lgInterval   = null; }
            if (_lgTsInterval) { clearInterval(_lgTsInterval); _lgTsInterval = null; }
            return;
        }

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
                <span class="game-status game-status--live lg-status-badge"><span class="live-dot"></span>LIVE</span>
            </div>
        </div>
        <div class="lg-linescore-wrap">
            <div class="skeleton-line" style="height:36px;margin:0.5rem 0"></div>
        </div>
        <div class="lg-now-card" hidden>
            <div class="lg-hero-host"></div>
            <div class="lg-situation-host"></div>
            <div class="lg-dueup-host"></div>
        </div>
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
        </div>
        <div class="lg-winprob-host"></div>
        <div class="lg-poll-ts" aria-live="polite"></div>`;

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

    // D-117 Phase 5: one delegated listener catches clicks on any current
    // or future [data-player-id] trigger (hero names, Due Up names) —
    // matches _wireZoneEvents' delegation shape, no per-name wiring.
    panel.addEventListener('click', e => {
        const trigger = e.target.closest?.('[data-player-id]');
        if (trigger) {
            if (!_lgFeedCache) return;
            _lgShowPlayerCard(
                trigger, panel, _lgFeedCache,
                Number(trigger.dataset.playerId),
                trigger.dataset.playerSide,
                trigger.dataset.playerRole
            );
            return;
        }
        if (_lgPlayerCardEl && !e.target.closest('.lg-player-card')) _lgHidePlayerCard();
    });

    panel.addEventListener('keydown', e => {
        if (e.key === 'Escape' && _lgPlayerCardEl) _lgHidePlayerCard();
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
            ${isLive ? `<span class="lg-inning">${half}${inning}</span>` : ''}
            ${badgeHtml}
            ${scorecardLink}
            ${highlightLink}
        </div>`;

    panel.querySelector('.lg-close-btn')?.addEventListener('click', _closeExistingPanel);

    panel.querySelector('.lg-linescore-wrap').innerHTML =
        _buildLinescore(ls, away.abbreviation, home.abbreviation);

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

    // "Now" card — matchup, count/outs/bases, and due up, one unit right
    // after the score/linescore and ahead of win probability, the pitch
    // zone, and the tabs. Rebuilt after owner feedback (2026-09-02) that
    // the previous top-to-bottom order didn't match how anyone actually
    // watches a live game: score, then "what's happening right now" (who's
    // up, the count, who's on, who's next), THEN secondary reference detail
    // (pitch-by-pitch zone, box score, win probability) — the same
    // priority order ESPN/MLB Gameday use for their own live modules, not
    // score → box-score-adjacent stats → the actual at-bat buried below
    // them. Empty (Preview page-mode, Final) for all three builders, so the
    // card itself is hidden rather than showing as an empty bordered box.
    const heroHost = panel.querySelector('.lg-hero-host');
    if (heroHost) {
        heroHost.innerHTML = _buildHero(feed);
        _lgMaybeFetchHeroBatterLine(feed, panel);
    }
    const situationHost = panel.querySelector('.lg-situation-host');
    if (situationHost) situationHost.innerHTML = _buildSituationBar(feed);

    const dueUpHost = panel.querySelector('.lg-dueup-host');
    if (dueUpHost) dueUpHost.innerHTML = _buildDueUp(feed);

    const nowCard = panel.querySelector('.lg-now-card');
    if (nowCard) {
        const hasContent = [heroHost, situationHost, dueUpHost].some(el => el?.textContent.trim());
        nowCard.toggleAttribute('hidden', !hasContent);
    }

    // Phase 2 + P9-live: pitch zone (dots / heat toggle) + base diagram
    _renderZone(panel, feed, gamePk);

    // D-117 Phase 6: win-probability bar, recomputed fresh every render.
    // Below the Now card and the tabs on purpose — secondary/nice-to-have,
    // not moment-to-moment info anyone needs to watch a live game.
    const winProbHost = panel.querySelector('.lg-winprob-host');
    if (winProbHost) winProbHost.innerHTML = _buildWinProb(feed);

    // Ensure the freshness row exists in re-rendered panels (fallback for panels
    // that were built before this element was added to the skeleton template)
    if (!panel.querySelector('.lg-poll-ts')) {
        const ts = document.createElement('div');
        ts.className = 'lg-poll-ts';
        ts.setAttribute('aria-live', 'polite');
        panel.querySelector('.lg-winprob-host')?.insertAdjacentElement('afterend', ts);
    }

    const tabsEl    = panel.querySelector('.lg-tabs');
    const tabpanel  = panel.querySelector('.lg-tab-content');

    if (isPreview) {
        // No plays/box score exist yet — show probable pitchers instead of
        // the tab strip rather than three tabs that all render empty states.
        tabsEl?.setAttribute('hidden', '');
        if (tabpanel) {
            tabpanel.removeAttribute('aria-labelledby');
            tabpanel.innerHTML = _lgIsPageMode
                ? _buildPregamePreview(feed, gamePk)
                : _buildProbablePitchers(feed.gameData?.probablePitchers, away.abbreviation, home.abbreviation);
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
            sidebarEl.innerHTML = _lgMiniStandingsHtml + _lgSeasonSeriesHtml + _lgMiniLeadersHtml + _buildSidebar(feed);
        }
        if (_lgSidebarExtrasGamePk !== String(gamePk)) {
            _lgSidebarExtrasGamePk = String(gamePk);
            _lgFetchSidebarExtras(gamePk, away.id, home.id, away.abbreviation, home.abbreviation);
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

            // D-117 Phase 4: hard-hit callout, real launchSpeed/totalDistance
            // appended straight from hitData — never derived or estimated.
            // HR keeps its own 💥 treatment; the two aren't stacked on one
            // play, since a home run already communicates the bigger fact
            // (Kael, D-117 Phase 4).
            const hardHitEvent = !isHR
                ? (play.playEvents || []).find(e => e.hitData?.hardness === 'hard')
                : null;
            const hardHitNote = hardHitEvent
                ? ` <span class="lg-pbp-hardhit-note">(${hardHitEvent.hitData.launchSpeed} mph, ${hardHitEvent.hitData.totalDistance} ft)</span>`
                : '';

            const cls = `lg-pbp-entry${isScore ? ' lg-pbp-entry--scoring' : ''}${isHR ? ' lg-pbp-entry--hr' : ''}${hardHitEvent ? ' lg-pbp-entry--hardhit' : ''}`;
            html += `<div class="${cls}">${desc}${hardHitNote}${score}</div>`;
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

// ── Pregame preview (page mode only) ────────────────────────────
// Full stat spread for the Preview state — pitcher cards, key hitters, team
// form — replacing the bare-names v1 above on the dedicated live-game page.
// The inline accordion (openLiveGamePanel) keeps _buildProbablePitchers()
// unchanged; this is deliberately page-mode-only (too much for a card
// expansion in a scrolling list).
//
// Mirrors the data js/mlb.js's Game Prep sheet (_openGamePrepSheet) already
// proves out — same endpoints, same derived-stat formulas, same top-5-by-OPS
// threshold — but rendered through this file's own lg-* markup rather than
// Game Prep's prep-* print-sheet layout, and fetched once per game open
// (gated by _lgPregameGamePk), not once per 60s pregame poll.

function _lgFip(s) {
    const ip = parseFloat(s?.inningsPitched || 0);
    if (!ip || s?.homeRuns == null) return '—';
    return ((13 * (s.homeRuns || 0) + 3 * ((s.baseOnBalls || 0) + (s.hitBatsmen || 0)) - 2 * (s.strikeOuts || 0)) / ip + 3.10).toFixed(2);
}
function _lgBb9(s) {
    const ip = parseFloat(s?.inningsPitched || 0);
    if (!ip || s?.baseOnBalls == null) return '—';
    return ((s.baseOnBalls || 0) / ip * 9).toFixed(1);
}

function _lgBuildPitcherCard(ppInfo, abbr, teamColor) {
    const pid    = ppInfo?.id;
    const name   = ppInfo?.fullName || 'TBD';
    const stats  = pid ? (AppState.mlbPlayerStats?.pitching?.[pid] || null) : null;
    const hs     = pid ? getMLBPlayerHeadshotUrl(pid) : '';
    const avatar = hs
        ? `<img src="${hs}" alt="" class="lg-pregame-pp-avatar" loading="lazy" data-hide-on-error>`
        : `<div class="lg-pregame-pp-avatar lg-pregame-pp-avatar--init">${_lgInitial(name)}</div>`;
    const rec = stats?.wins != null ? `${stats.wins}-${stats.losses}` : '';

    return `<div class="lg-side-card lg-pregame-pp-card" style="border-left:3px solid ${teamColor}">
        <div class="lg-pregame-pp-top">
            ${avatar}
            <div>
                <div class="lg-pregame-pp-role">${_escHtml(abbr || '')} Probable</div>
                <div class="lg-hero-name">${_escHtml(name)}</div>
                ${rec ? `<div class="lg-side-line lg-side-line--muted">${rec}</div>` : ''}
            </div>
        </div>
        ${stats ? `<div class="lg-pregame-pp-stats">
            <span><b>${stats.era != null ? parseFloat(stats.era).toFixed(2) : '—'}</b>ERA</span>
            <span><b>${_lgFip(stats)}</b>FIP</span>
            <span><b>${stats.whip != null ? parseFloat(stats.whip).toFixed(2) : '—'}</b>WHIP</span>
            <span><b>${stats.strikeoutsPer9Inn != null ? parseFloat(stats.strikeoutsPer9Inn).toFixed(1) : '—'}</b>K/9</span>
            <span><b>${_lgBb9(stats)}</b>BB/9</span>
            <span><b>${stats.strikeOuts ?? '—'}</b>K</span>
        </div>` : pid ? `<div class="lg-side-line lg-side-line--muted">Stats unavailable</div>` : ''}
    </div>`;
}

function _lgBuildKeyHitters(splits, abbr) {
    const top = (splits || [])
        .filter(s => s.player?.id && parseFloat(s.stat?.ops || 0) > 0 && (s.stat?.atBats || 0) >= 20)
        .sort((a, b) => parseFloat(b.stat?.ops || 0) - parseFloat(a.stat?.ops || 0))
        .slice(0, 5);
    if (!top.length) return '';

    const rows = top.map(({ player: p, stat: s }) => {
        const hs  = getMLBPlayerHeadshotUrl(p.id);
        const img = hs
            ? `<img src="${hs}" alt="" class="lg-pregame-hitter-hs" loading="lazy" data-hide-on-error>`
            : `<div class="lg-pregame-hitter-init">${_escHtml((p.fullName || '?')[0])}</div>`;
        return `<button type="button" class="lg-pregame-hitter-row" onclick="showMLBPlayerDetail(${p.id},'hitting')">
            ${img}
            <div class="lg-pregame-hitter-info">
                <span class="lg-pregame-hitter-name">${_escHtml(p.fullName || '')}</span>
                <span class="lg-pregame-hitter-stats">${s.avg || '.000'} · ${s.homeRuns ?? '—'} HR · ${s.ops || '.000'} OPS</span>
            </div>
        </button>`;
    }).join('');

    return `<div class="lg-side-card">
        <div class="lg-box-section-title">${_escHtml(abbr || '')} Key Hitters</div>
        ${rows}
    </div>`;
}

function _lgBuildFormStrip(awayTeamId, homeTeamId, awayAbbr, homeAbbr) {
    const awaySt = typeof _standingsTeam === 'function' ? _standingsTeam(awayTeamId) : null;
    const homeSt = typeof _standingsTeam === 'function' ? _standingsTeam(homeTeamId) : null;
    if (!awaySt && !homeSt) return '';

    const row = (abbr, st) => {
        if (!st) return '';
        const isW   = (st.streak || '').startsWith('W');
        const posRd = (st.rdiff  || '').startsWith('+');
        const splitTxt = [st.home ? `Home ${st.home}` : '', st.away ? `Away ${st.away}` : ''].filter(Boolean).join(' · ');
        return `<div class="lg-pregame-form-row">
            <span class="lg-pregame-form-abbr">${_escHtml(abbr || '')}</span>
            ${st.streak ? `<span class="lg-form-badge lg-form-badge--${isW ? 'w' : 'l'}">${_escHtml(st.streak)}</span>` : ''}
            ${st.rdiff && st.rdiff !== '—' ? `<span class="lg-form-badge lg-form-badge--${posRd ? 'pos' : 'neg'}" title="Run differential">${_escHtml(st.rdiff)} R</span>` : ''}
            ${splitTxt ? `<span class="lg-side-line--muted">${_escHtml(splitTxt)}</span>` : ''}
        </div>`;
    };

    return `<div class="lg-side-card">
        <div class="lg-box-section-title">Form</div>
        ${row(awayAbbr, awaySt)}
        ${row(homeAbbr, homeSt)}
    </div>`;
}

function _lgAssemblePregameHtml(pp, away, home, hittersHtml, formHtml) {
    const awayClr = getMLBTeamColors(away.abbreviation)?.primary || 'var(--accent)';
    const homeClr = getMLBTeamColors(home.abbreviation)?.primary || 'var(--accent)';
    return `<div class="lg-pregame-wrap">
        <div class="lg-pregame-pitchers">
            ${_lgBuildPitcherCard(pp.away, away.abbreviation, awayClr)}
            ${_lgBuildPitcherCard(pp.home, home.abbreviation, homeClr)}
        </div>
        ${hittersHtml || ''}
        ${formHtml || ''}
        <div class="lg-matchup-empty" style="margin-top:var(--space-2)">Play-by-play and box score open automatically once the game starts.</div>
    </div>`;
}

// Synchronous — called from _renderPanel on every pregame poll. Returns the
// cached fully-built HTML once _lgFetchPregameExtras resolves; before that,
// pitcher cards render immediately (from whatever's already in AppState) with
// a loading placeholder standing in for hitters/form, and the fetch is kicked
// off exactly once per game open.
function _buildPregamePreview(feed, gamePk) {
    const gd   = feed.gameData || {};
    const pp   = gd.probablePitchers || {};
    const away = gd.teams?.away || {};
    const home = gd.teams?.home || {};

    if (!pp.away?.fullName && !pp.home?.fullName) {
        return '<div class="lg-pbp-empty">Probable pitchers not yet announced.</div>';
    }

    if (_lgPregameGamePk === String(gamePk) && _lgPregameHtml) {
        return _lgPregameHtml;
    }

    if (_lgPregameGamePk !== String(gamePk)) {
        _lgPregameGamePk = String(gamePk);
        _lgPregameHtml   = '';
        _lgFetchPregameExtras(gamePk, feed);
    }

    return _lgAssemblePregameHtml(pp, away, home,
        `<div class="skeleton-line" style="height:90px;border-radius:12px;margin-top:var(--space-3)"></div>`,
        '');
}

async function _lgFetchPregameExtras(gamePk, feed) {
    const gd   = feed.gameData || {};
    const pp   = gd.probablePitchers || {};
    const away = gd.teams?.away || {};
    const home = gd.teams?.home || {};
    const awayPitcherId = pp.away?.id;
    const homePitcherId = pp.home?.id;
    const _needsStats = id => id && !AppState.mlbPlayerStats?.pitching?.[id];

    const [awayPPRes, homePPRes, awayHitRes, homeHitRes] = await Promise.allSettled([
        _needsStats(awayPitcherId) ? mlbFetch(`/people/${awayPitcherId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM) : Promise.resolve(null),
        _needsStats(homePitcherId) ? mlbFetch(`/people/${homePitcherId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM) : Promise.resolve(null),
        away.id ? mlbFetch('/stats', { stats: 'season', group: 'hitting', sportId: 1, season: MLB_SEASON, teamId: away.id }, ApiCache.TTL.MEDIUM) : Promise.resolve(null),
        home.id ? mlbFetch('/stats', { stats: 'season', group: 'hitting', sportId: 1, season: MLB_SEASON, teamId: home.id }, ApiCache.TTL.MEDIUM) : Promise.resolve(null),
    ]);

    // Cache into AppState.mlbPlayerStats.pitching — same shared cache Game
    // Prep and player-detail read from, so visiting either next is warm.
    const _cacheStats = (id, res) => {
        if (!id || res.status !== 'fulfilled' || !res.value) return;
        const stat = res.value?.stats?.[0]?.splits?.[0]?.stat;
        if (stat) {
            if (!AppState.mlbPlayerStats.pitching) AppState.mlbPlayerStats.pitching = {};
            AppState.mlbPlayerStats.pitching[id] = stat;
        }
    };
    _cacheStats(awayPitcherId, awayPPRes);
    _cacheStats(homePitcherId, homePPRes);

    const _splits = res => (res.status === 'fulfilled' ? res.value?.stats?.[0]?.splits || [] : []);
    const hittersHtml = `<div class="lg-pregame-hitters">
        ${_lgBuildKeyHitters(_splits(awayHitRes), away.abbreviation)}
        ${_lgBuildKeyHitters(_splits(homeHitRes), home.abbreviation)}
    </div>`;
    const formHtml = _lgBuildFormStrip(away.id, home.id, away.abbreviation, home.abbreviation);

    _lgPregameHtml = _lgAssemblePregameHtml(pp, away, home, hittersHtml, formHtml);

    // Only touch the DOM if still on the same game, still page mode, and
    // still Preview — mirrors the guard style already used by
    // _lgFetchSidebarExtras/_lgFetchBullpenRest (the game may have started,
    // or the user navigated away, by the time these fetches resolve).
    if (_lgGamePk !== String(gamePk) || !_lgIsPageMode) return;
    if (_lgFeedCache?.gameData?.status?.abstractGameState !== 'Preview') return;
    const tabpanel = document.querySelector('.lg-panel .lg-tab-content');
    if (tabpanel) tabpanel.innerHTML = _lgPregameHtml;
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
    const pf        = typeof _PARK_FACTORS !== 'undefined' ? _PARK_FACTORS[gd.teams?.home?.id] : null;
    const parkBadge = pf > 1.05
        ? `<span class="lg-park-badge lg-park-badge--hit" title="Hitter-friendly park (PF ${pf.toFixed(2)})">Park +</span>`
        : pf < 0.95
        ? `<span class="lg-park-badge lg-park-badge--pit" title="Pitcher-friendly park (PF ${pf.toFixed(2)})">Park −</span>`
        : '';

    let html = '';

    if (venue || weather?.condition) {
        html += `<div class="lg-side-card">
            <div class="lg-box-section-title">Game Info</div>
            ${venue ? `<div class="lg-side-line">${_escHtml(venue)}${parkBadge}</div>` : ''}
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

// ── D-117 Phase 3: Pitch-mix wheel ────────────────────────────
// Same pitcher-scoping filter as _collectPitcherGamePitches above, tallying
// pitch-type counts instead of SVG coordinates (Axiom, D-117 Phase 3).
function _collectPitcherPitchTypes(allPlays, pitcherId) {
    if (!Array.isArray(allPlays) || pitcherId == null) return [];
    const counts = new Map(); // code → { code, description, count }
    for (const play of allPlays) {
        if (play?.matchup?.pitcher?.id !== pitcherId) continue;
        for (const e of (play.playEvents || [])) {
            if (!e.isPitch) continue;
            const code = e.details?.type?.code || '??';
            const desc = e.details?.type?.description || code;
            const entry = counts.get(code) || { code, description: desc, count: 0 };
            entry.count++;
            counts.set(code, entry);
        }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

// Fixed small palette for pitch TYPE (distinct from the dots' ball/strike/
// in-play RESULT colors above) — desaturated/secondary per DESIGN.md's
// category-not-importance rule, since this is a breakdown fact, not a
// headline stat. Anything outside this set falls into "Other" rather than
// growing the palette per-game (Kael, D-117 Phase 3).
const LG_PITCH_TYPE_COLORS = {
    FF: '#8ab4f8', SI: '#7cc7a4', FC: '#c58af9', SL: '#f4a261',
    CU: '#5aa9e6', CH: '#e8c468', FS: '#e07a9e', KC: '#9d8df1',
    ST: '#6ec6b0', SV: '#d98b6b',
};
const LG_PITCH_TYPE_OTHER_COLOR = 'var(--text-muted)';

function _buildPitchMixWheel(pitcherId, allPlays) {
    const types = _collectPitcherPitchTypes(allPlays, pitcherId);
    if (!types.length) return '';

    const total = types.reduce((s, t) => s + t.count, 0);
    const R = 40, CX = 50, CY = 50, STROKE = 14;
    const circumference = 2 * Math.PI * R;

    let offset = 0;
    let arcsHtml = '';
    let legendHtml = '';
    let ariaParts = [];
    types.forEach((t, i) => {
        const color = LG_PITCH_TYPE_COLORS[t.code] || LG_PITCH_TYPE_OTHER_COLOR;
        const frac  = t.count / total;
        const dash  = frac * circumference;
        const pct   = Math.round(frac * 100);
        arcsHtml += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${color}" stroke-width="${STROKE}"
            stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"
            stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${CX} ${CY})"/>`;
        offset += dash;
        legendHtml += `<div class="lg-mix-legend-item">
            <span class="lg-mix-legend-swatch" style="background:${color}"></span>
            <span class="lg-mix-legend-code">${_escHtml(t.code)}</span>
            <span class="lg-mix-legend-count">${t.count} (${pct}%)</span>
        </div>`;
        ariaParts.push(`${t.count} ${_escHtml(t.description)}`);
    });

    return `<div class="lg-mix-wrap">
        <svg class="lg-pitch-mix" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img"
            aria-label="Pitch mix: ${_escHtml(ariaParts.join(', '))}">
            ${arcsHtml}
        </svg>
        <div class="lg-mix-legend">${legendHtml}</div>
    </div>`;
}

function _buildZoneToggle(mode, heatCount) {
    const heatOn = mode === 'heat';
    const heatDisabled = heatCount < 1;
    return `<div class="lg-zone-toggle" role="group" aria-label="Pitch zone view">
        <button type="button" class="lg-zone-toggle-btn ${!heatOn ? 'lg-zone-toggle-btn--active' : ''}" data-lg-zone="dots" aria-pressed="${!heatOn}">Dots</button>
        <button type="button" class="lg-zone-toggle-btn ${heatOn ? 'lg-zone-toggle-btn--active' : ''}" data-lg-zone="heat" aria-pressed="${heatOn}"${heatDisabled ? ' disabled' : ''}>Heat</button>
    </div>`;
}

function _buildPitchZone(currentPlay, enterFromIdx) {
    const pitches = (currentPlay?.playEvents || []).filter(e => e.isPitch);
    const { zx, zy, zw, zh, gridHtml } = _lgZoneGeom(currentPlay);
    if (enterFromIdx == null) enterFromIdx = Infinity;

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

        // D-117 Phase 3: only the newest dot(s) since the last render get the
        // trajectory-entrance animation — a fixed near-top origin (50, 8),
        // bowed at the midpoint by breakHorizontal's sign, purely stylized
        // (not a physics sim), stripped entirely under prefers-reduced-motion
        // via CSS (Kael/Vera, D-117 Phase 3).
        const isEntering = i >= enterFromIdx;
        let enterStyle = '';
        if (isEntering) {
            const dx  = +(50 - cx).toFixed(1);
            const dy  = +(8 - cy).toFixed(1);
            const bh  = pd.breaks?.breakHorizontal;
            const bow = bh ? (bh > 0 ? 6 : -6) : 0;
            enterStyle = ` style="--lg-enter-dx:${dx}px;--lg-enter-dy:${dy}px;--lg-enter-bow:${bow}px"`;
        }

        // CSS classes carry all fill/stroke via liveGame.css — SVG presentation
        // attributes don't resolve CSS custom properties, so we rely on CSS only.
        dotsHtml += `<g class="lg-dot-group lg-dot--${category}${isEntering ? ' lg-dot--entering' : ''}" tabindex="0" role="button"
            aria-label="${ariaLabel}"
            data-pitch-type="${pitchType}"
            data-velocity="${_escHtml(velocity)}"
            data-spin="${_escHtml(spin)}"
            data-result="${result}"
            data-count="${_escHtml(countStr)}"${enterStyle}>
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
    const pitcherId   = currentPlay.matchup?.pitcher?.id;
    const gamePitches = _collectPitcherGamePitches(plays.allPlays, pitcherId);
    const useHeat     = mode === 'heat' && gamePitches.length > 0;
    const hasPitches  = pitches.length > 0;

    // D-117 Phase 3: detect whether this at-bat grew a new pitch since the
    // last render of THIS at-bat specifically (a fresh at-bat, a fresh tab
    // open, or a page load mid-at-bat all start with no "last known count"
    // for that key, so nothing animates on first paint — Vera, D-117 Phase 3).
    const abKey         = `${key}_${currentPlay.atBatIndex}`;
    const lastPitchCount = _lgZoneLastPitchCount.has(abKey) ? _lgZoneLastPitchCount.get(abKey) : pitches.length;
    const enterFromIdx   = pitches.length > lastPitchCount ? lastPitchCount : Infinity;
    _lgZoneLastPitchCount.set(abKey, pitches.length);

    // Bases used to render here too — moved into _buildSituationBar, right
    // under the score line, so it's not a second copy 600px away from the
    // count/outs it belongs next to (owner feedback, 2026-09-02).
    zoneCol.innerHTML =
        (hasPitches
            ? `<div class="lg-zone-section-label">Pitch Zone</div>` +
              _buildZoneToggle(mode, gamePitches.length) +
              (useHeat ? _buildPitchHeat(currentPlay, gamePitches) : _buildPitchZone(currentPlay, enterFromIdx))
            : `<div class="lg-zone-empty">Next pitch coming up.</div>`) +
        (hasPitches
            ? `<div class="lg-zone-section-label" style="margin-top:var(--space-2)">Pitch Mix</div>` +
              _buildPitchMixWheel(pitcherId, plays.allPlays)
            : '');
    _wireZoneEvents(panel, key);
}

// ── Phase 2: Base runner diagram ──────────────────────────────

// Shared by _buildBaseDiagram and Phase 6's win-expectancy lookup so the
// two features can never disagree about who's on base (Axiom, D-117 Phase 6).
function _lgOccupiedBases(currentPlay) {
    const runners = currentPlay?.runners || [];
    return new Set(
        runners
            .map(r => r.movement?.end)
            .filter(e => e && e !== 'score' && e !== 'Home')
    );
}

function _buildBaseDiagram(currentPlay) {
    const occupied = _lgOccupiedBases(currentPlay);

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

// ── Game Situation bar — count, outs, bases in one glanceable spot ──
// Owner feedback (2026-09-02): this info was scattered — a tiny count pill
// up in the header meta-row, the base diagram all the way at the bottom of
// the pitch-zone column, ~600px apart with the linescore/win-prob/hero/
// due-up sandwiched between them. Every broadcast score bug puts count,
// outs, and bases in one fixed spot for exactly this reason; this
// consolidates them the same way, directly under the score line, ahead of
// everything else. Reuses _buildBaseDiagram verbatim — one diagram, not a
// second copy — so the old bottom-of-zone-column one is removed, not
// duplicated (see _renderZone).
function _buildSituationBar(feed) {
    const status = feed.gameData?.status || {};
    if (status.abstractGameState !== 'Live') return '';

    const ls           = feed.liveData?.linescore || {};
    const isBetweenInn = ls.inningState === 'Middle' || ls.inningState === 'End';
    const currentPlay  = feed.liveData?.plays?.currentPlay;

    // Between half-innings ls.balls/strikes/outs still hold the just-ended
    // at-bat's final numbers (the same staleness _lgCurrentMatchup routes
    // around for the hero card) — a fresh half genuinely has an empty
    // count, no outs, and empty bases, so show that instead of leftovers.
    const balls   = isBetweenInn ? 0 : (ls.balls   ?? 0);
    const strikes = isBetweenInn ? 0 : (ls.strikes ?? 0);
    const outs    = isBetweenInn ? 0 : (ls.outs    ?? 0);
    const basesHtml = _buildBaseDiagram(isBetweenInn ? null : currentPlay);

    const dots = (count, max, cls) =>
        Array.from({ length: max }, (_, i) =>
            `<span class="lg-sit-dot lg-sit-dot--${cls}${i < count ? ' is-lit' : ''}"></span>`
        ).join('');

    return `<div class="lg-situation" role="group" aria-label="Count ${balls}-${strikes}, ${outs} out${outs !== 1 ? 's' : ''}">
        <div class="lg-sit-counts">
            <div class="lg-sit-row"><span class="lg-sit-label">B</span>${dots(balls, 3, 'ball')}</div>
            <div class="lg-sit-row"><span class="lg-sit-label">S</span>${dots(strikes, 2, 'strike')}</div>
            <div class="lg-sit-row"><span class="lg-sit-label">O</span>${dots(outs, 2, 'out')}</div>
        </div>
        <div class="lg-sit-bases">${basesHtml}</div>
    </div>`;
}

// ── Phase 6 (D-117): In-house win-expectancy model ──────────
// Real, cited, empirical data — not a formula, not invented. Source and
// spot-checks documented in DECISIONS.md's D-117 Phase 6 Relay addendum:
// Retrosheet-derived play-by-play counts (github.com/gregstoll/baseballstats,
// the same Tango/Birnbaum methodology Baseball-Reference and FanGraphs both
// credit for their own Win Expectancy figures). Each row is
// [half, inning, outs, baseState, scoreDiff, homeWinPermille] where
// half: 0 = visitor batting ("V" — top half), 1 = home batting ("H" — bottom
// half); baseState: 3-bit runner encoding, bit0=1B(1) bit1=2B(2) bit2=3B(4),
// 0=empty..7=loaded, identical to _lgOccupiedBases' own encoding so the two
// features can't disagree; scoreDiff: home score minus away score;
// homeWinPermille: home team's empirical win probability * 1000, rounded.
//
// Capped at inning 9 (innings 10+ summed into the inning-9 bucket — summing
// raw counts, not averaging percentages, is the statistically correct way
// to merge samples of the same conceptual state) and |scoreDiff| <= 8
// (overflow clamped at lookup time, same idea as Baseball-Reference's own
// published "any lead beyond N is treated as N" cap — a different number
// here because this dataset's own sample mass thins out past this point,
// not an arbitrary choice). Cells with fewer than 30 raw occurrences were
// dropped as statistically unreliable rather than shipped as false
// precision; a lookup miss falls back by shrinking |scoreDiff| toward 0
// one step at a time until it finds a populated cell, which always
// terminates because scoreDiff=0 states are the densest in the table.
const LG_WE_MAX_INNING = 9;
const LG_WE_MAX_DIFF   = 8;
const LG_WE_TABLE = [[0,1,0,0,0,460],[0,1,0,0,1,567],[0,1,0,0,2,692],[0,1,0,0,3,756],[0,1,0,0,4,845],[0,1,0,0,5,872],[0,1,0,1,0,503],[0,1,0,1,1,600],[0,1,0,1,2,702],[0,1,0,1,3,748],[0,1,0,1,4,870],[0,1,0,2,0,531],[0,1,0,2,1,609],[0,1,0,2,2,721],[0,1,0,2,3,758],[0,1,0,2,4,896],[0,1,0,3,0,574],[0,1,0,3,1,659],[0,1,0,3,2,752],[0,1,0,3,3,762],[0,1,0,3,4,896],[0,1,0,4,0,565],[0,1,0,4,1,665],[0,1,0,4,2,689],[0,1,0,4,3,823],[0,1,0,5,0,582],[0,1,0,5,1,655],[0,1,0,5,2,769],[0,1,0,5,3,816],[0,1,0,6,0,612],[0,1,0,6,1,723],[0,1,0,6,2,789],[0,1,0,6,3,820],[0,1,0,7,0,643],[0,1,0,7,1,710],[0,1,0,7,2,808],[0,1,0,7,3,881],[0,1,0,7,4,967],[0,1,1,0,0,434],[0,1,1,0,1,549],[0,1,1,0,2,651],[0,1,1,0,3,718],[0,1,1,0,4,816],[0,1,1,0,5,858],[0,1,1,0,6,896],[0,1,1,1,0,465],[0,1,1,1,1,567],[0,1,1,1,2,636],[0,1,1,1,3,742],[0,1,1,1,4,838],[0,1,1,1,5,895],[0,1,1,1,6,894],[0,1,1,2,0,480],[0,1,1,2,1,573],[0,1,1,2,2,686],[0,1,1,2,3,772],[0,1,1,2,4,853],[0,1,1,2,5,912],[0,1,1,2,6,938],[0,1,1,3,0,509],[0,1,1,3,1,600],[0,1,1,3,2,671],[0,1,1,3,3,769],[0,1,1,3,4,826],[0,1,1,3,5,853],[0,1,1,3,6,844],[0,1,1,4,0,519],[0,1,1,4,1,604],[0,1,1,4,2,697],[0,1,1,4,3,764],[0,1,1,4,4,872],[0,1,1,4,5,905],[0,1,1,5,0,530],[0,1,1,5,1,625],[0,1,1,5,2,726],[0,1,1,5,3,788],[0,1,1,5,4,867],[0,1,1,5,5,911],[0,1,1,6,0,552],[0,1,1,6,1,652],[0,1,1,6,2,732],[0,1,1,6,3,832],[0,1,1,6,4,838],[0,1,1,6,5,846],[0,1,1,7,0,575],[0,1,1,7,1,659],[0,1,1,7,2,727],[0,1,1,7,3,824],[0,1,1,7,4,866],[0,1,1,7,5,1000],[0,1,2,0,0,416],[0,1,2,0,1,528],[0,1,2,0,2,629],[0,1,2,0,3,699],[0,1,2,0,4,814],[0,1,2,0,5,854],[0,1,2,0,6,889],[0,1,2,0,8,944],[0,1,2,1,0,431],[0,1,2,1,1,545],[0,1,2,1,2,631],[0,1,2,1,3,724],[0,1,2,1,4,830],[0,1,2,1,5,877],[0,1,2,1,6,917],[0,1,2,1,7,933],[0,1,2,1,8,936],[0,1,2,2,0,443],[0,1,2,2,1,540],[0,1,2,2,2,653],[0,1,2,2,3,730],[0,1,2,2,4,813],[0,1,2,2,5,877],[0,1,2,2,6,907],[0,1,2,2,7,1000],[0,1,2,2,8,967],[0,1,2,3,0,450],[0,1,2,3,1,546],[0,1,2,3,2,640],[0,1,2,3,3,748],[0,1,2,3,4,827],[0,1,2,3,5,872],[0,1,2,3,6,967],[0,1,2,4,0,464],[0,1,2,4,1,552],[0,1,2,4,2,645],[0,1,2,4,3,726],[0,1,2,4,4,841],[0,1,2,4,5,798],[0,1,2,4,6,938],[0,1,2,5,0,468],[0,1,2,5,1,570],[0,1,2,5,2,661],[0,1,2,5,3,739],[0,1,2,5,4,856],[0,1,2,5,5,868],[0,1,2,5,6,870],[0,1,2,6,0,478],[0,1,2,6,1,593],[0,1,2,6,2,698],[0,1,2,6,3,767],[0,1,2,6,4,837],[0,1,2,6,5,840],[0,1,2,6,6,944],[0,1,2,7,0,498],[0,1,2,7,1,583],[0,1,2,7,2,662],[0,1,2,7,3,754],[0,1,2,7,4,839],[0,1,2,7,5,884],[0,2,0,0,-8,8],[0,2,0,0,-7,32],[0,2,0,0,-6,58],[0,2,0,0,-5,84],[0,2,0,0,-4,119],[0,2,0,0,-3,176],[0,2,0,0,-2,252],[0,2,0,0,-1,354],[0,2,0,0,0,466],[0,2,0,0,1,585],[0,2,0,0,2,687],[0,2,0,0,3,775],[0,2,0,0,4,855],[0,2,0,0,5,881],[0,2,0,0,6,940],[0,2,0,0,7,941],[0,2,0,0,8,963],[0,2,0,1,-8,0],[0,2,0,1,-7,62],[0,2,0,1,-6,59],[0,2,0,1,-5,125],[0,2,0,1,-4,140],[0,2,0,1,-3,211],[0,2,0,1,-2,277],[0,2,0,1,-1,395],[0,2,0,1,0,500],[0,2,0,1,1,616],[0,2,0,1,2,721],[0,2,0,1,3,775],[0,2,0,1,4,864],[0,2,0,1,5,864],[0,2,0,1,6,963],[0,2,0,1,7,1000],[0,2,0,1,8,978],[0,2,0,2,-5,133],[0,2,0,2,-4,178],[0,2,0,2,-3,219],[0,2,0,2,-2,322],[0,2,0,2,-1,431],[0,2,0,2,0,516],[0,2,0,2,1,641],[0,2,0,2,2,733],[0,2,0,2,3,778],[0,2,0,2,4,873],[0,2,0,2,5,894],[0,2,0,2,6,973],[0,2,0,3,-5,127],[0,2,0,3,-4,188],[0,2,0,3,-3,242],[0,2,0,3,-2,332],[0,2,0,3,-1,443],[0,2,0,3,0,554],[0,2,0,3,1,671],[0,2,0,3,2,761],[0,2,0,3,3,798],[0,2,0,3,4,898],[0,2,0,3,5,987],[0,2,0,3,6,925],[0,2,0,4,-4,161],[0,2,0,4,-3,206],[0,2,0,4,-2,310],[0,2,0,4,-1,441],[0,2,0,4,0,578],[0,2,0,4,1,643],[0,2,0,4,2,717],[0,2,0,4,3,827],[0,2,0,4,4,892],[0,2,0,5,-4,224],[0,2,0,5,-3,269],[0,2,0,5,-2,385],[0,2,0,5,-1,491],[0,2,0,5,0,600],[0,2,0,5,1,668],[0,2,0,5,2,751],[0,2,0,5,3,806],[0,2,0,5,4,946],[0,2,0,5,5,944],[0,2,0,6,-4,231],[0,2,0,6,-3,244],[0,2,0,6,-2,335],[0,2,0,6,-1,485],[0,2,0,6,0,638],[0,2,0,6,1,687],[0,2,0,6,2,765],[0,2,0,6,3,861],[0,2,0,6,4,867],[0,2,0,7,-4,297],[0,2,0,7,-3,329],[0,2,0,7,-2,396],[0,2,0,7,-1,551],[0,2,0,7,0,622],[0,2,0,7,1,721],[0,2,0,7,2,866],[0,2,0,7,3,890],[0,2,0,7,4,917],[0,2,1,0,-8,12],[0,2,1,0,-7,25],[0,2,1,0,-6,57],[0,2,1,0,-5,64],[0,2,1,0,-4,98],[0,2,1,0,-3,160],[0,2,1,0,-2,232],[0,2,1,0,-1,327],[0,2,1,0,0,443],[0,2,1,0,1,565],[0,2,1,0,2,666],[0,2,1,0,3,771],[0,2,1,0,4,853],[0,2,1,0,5,878],[0,2,1,0,6,926],[0,2,1,0,7,928],[0,2,1,0,8,953],[0,2,1,1,-8,0],[0,2,1,1,-7,43],[0,2,1,1,-6,74],[0,2,1,1,-5,123],[0,2,1,1,-4,121],[0,2,1,1,-3,184],[0,2,1,1,-2,246],[0,2,1,1,-1,355],[0,2,1,1,0,468],[0,2,1,1,1,594],[0,2,1,1,2,685],[0,2,1,1,3,775],[0,2,1,1,4,842],[0,2,1,1,5,876],[0,2,1,1,6,942],[0,2,1,1,7,976],[0,2,1,1,8,914],[0,2,1,2,-6,86],[0,2,1,2,-5,95],[0,2,1,2,-4,125],[0,2,1,2,-3,216],[0,2,1,2,-2,265],[0,2,1,2,-1,367],[0,2,1,2,0,486],[0,2,1,2,1,606],[0,2,1,2,2,713],[0,2,1,2,3,764],[0,2,1,2,4,838],[0,2,1,2,5,898],[0,2,1,2,6,944],[0,2,1,2,7,985],[0,2,1,2,8,978],[0,2,1,3,-6,91],[0,2,1,3,-5,215],[0,2,1,3,-4,196],[0,2,1,3,-3,204],[0,2,1,3,-2,280],[0,2,1,3,-1,387],[0,2,1,3,0,504],[0,2,1,3,1,638],[0,2,1,3,2,718],[0,2,1,3,3,786],[0,2,1,3,4,854],[0,2,1,3,5,920],[0,2,1,3,6,932],[0,2,1,3,7,966],[0,2,1,3,8,960],[0,2,1,4,-4,72],[0,2,1,4,-3,166],[0,2,1,4,-2,287],[0,2,1,4,-1,402],[0,2,1,4,0,501],[0,2,1,4,1,639],[0,2,1,4,2,712],[0,2,1,4,3,756],[0,2,1,4,4,880],[0,2,1,4,5,911],[0,2,1,4,6,1000],[0,2,1,5,-5,175],[0,2,1,5,-4,167],[0,2,1,5,-3,252],[0,2,1,5,-2,306],[0,2,1,5,-1,436],[0,2,1,5,0,538],[0,2,1,5,1,648],[0,2,1,5,2,742],[0,2,1,5,3,815],[0,2,1,5,4,840],[0,2,1,5,5,913],[0,2,1,5,6,941],[0,2,1,5,7,968],[0,2,1,5,8,972],[0,2,1,6,-4,99],[0,2,1,6,-3,273],[0,2,1,6,-2,372],[0,2,1,6,-1,414],[0,2,1,6,0,558],[0,2,1,6,1,663],[0,2,1,6,2,745],[0,2,1,6,3,786],[0,2,1,6,4,877],[0,2,1,6,5,860],[0,2,1,6,6,904],[0,2,1,7,-4,211],[0,2,1,7,-3,261],[0,2,1,7,-2,379],[0,2,1,7,-1,480],[0,2,1,7,0,576],[0,2,1,7,1,677],[0,2,1,7,2,778],[0,2,1,7,3,838],[0,2,1,7,4,884],[0,2,1,7,5,907],[0,2,1,7,6,889],[0,2,2,0,-8,13],[0,2,2,0,-7,11],[0,2,2,0,-6,35],[0,2,2,0,-5,46],[0,2,2,0,-4,84],[0,2,2,0,-3,142],[0,2,2,0,-2,219],[0,2,2,0,-1,312],[0,2,2,0,0,425],[0,2,2,0,1,549],[0,2,2,0,2,660],[0,2,2,0,3,759],[0,2,2,0,4,846],[0,2,2,0,5,853],[0,2,2,0,6,904],[0,2,2,0,7,940],[0,2,2,0,8,971],[0,2,2,1,-7,22],[0,2,2,1,-6,52],[0,2,2,1,-5,80],[0,2,2,1,-4,102],[0,2,2,1,-3,155],[0,2,2,1,-2,235],[0,2,2,1,-1,330],[0,2,2,1,0,445],[0,2,2,1,1,570],[0,2,2,1,2,664],[0,2,2,1,3,779],[0,2,2,1,4,822],[0,2,2,1,5,855],[0,2,2,1,6,921],[0,2,2,1,7,952],[0,2,2,1,8,963],[0,2,2,2,-6,56],[0,2,2,2,-5,68],[0,2,2,2,-4,115],[0,2,2,2,-3,176],[0,2,2,2,-2,239],[0,2,2,2,-1,327],[0,2,2,2,0,449],[0,2,2,2,1,574],[0,2,2,2,2,690],[0,2,2,2,3,771],[0,2,2,2,4,831],[0,2,2,2,5,862],[0,2,2,2,6,931],[0,2,2,2,7,944],[0,2,2,2,8,968],[0,2,2,3,-6,146],[0,2,2,3,-5,130],[0,2,2,3,-4,125],[0,2,2,3,-3,177],[0,2,2,3,-2,250],[0,2,2,3,-1,354],[0,2,2,3,0,476],[0,2,2,3,1,594],[0,2,2,3,2,685],[0,2,2,3,3,769],[0,2,2,3,4,832],[0,2,2,3,5,883],[0,2,2,3,6,924],[0,2,2,3,7,943],[0,2,2,3,8,931],[0,2,2,4,-5,57],[0,2,2,4,-4,122],[0,2,2,4,-3,150],[0,2,2,4,-2,233],[0,2,2,4,-1,351],[0,2,2,4,0,458],[0,2,2,4,1,573],[0,2,2,4,2,702],[0,2,2,4,3,740],[0,2,2,4,4,833],[0,2,2,4,5,879],[0,2,2,4,6,925],[0,2,2,4,7,961],[0,2,2,4,8,1000],[0,2,2,5,-5,102],[0,2,2,5,-4,110],[0,2,2,5,-3,193],[0,2,2,5,-2,255],[0,2,2,5,-1,374],[0,2,2,5,0,468],[0,2,2,5,1,600],[0,2,2,5,2,709],[0,2,2,5,3,769],[0,2,2,5,4,855],[0,2,2,5,5,851],[0,2,2,5,6,932],[0,2,2,5,7,923],[0,2,2,5,8,1000],[0,2,2,6,-5,121],[0,2,2,6,-4,85],[0,2,2,6,-3,171],[0,2,2,6,-2,305],[0,2,2,6,-1,364],[0,2,2,6,0,481],[0,2,2,6,1,612],[0,2,2,6,2,711],[0,2,2,6,3,769],[0,2,2,6,4,832],[0,2,2,6,5,840],[0,2,2,6,6,931],[0,2,2,6,7,939],[0,2,2,6,8,1000],[0,2,2,7,-5,152],[0,2,2,7,-4,173],[0,2,2,7,-3,196],[0,2,2,7,-2,326],[0,2,2,7,-1,365],[0,2,2,7,0,497],[0,2,2,7,1,631],[0,2,2,7,2,728],[0,2,2,7,3,755],[0,2,2,7,4,882],[0,2,2,7,5,848],[0,2,2,7,6,943],[0,2,2,7,7,900],[0,2,2,7,8,974],[0,3,0,0,-8,20],[0,3,0,0,-7,31],[0,3,0,0,-6,46],[0,3,0,0,-5,71],[0,3,0,0,-4,109],[0,3,0,0,-3,167],[0,3,0,0,-2,237],[0,3,0,0,-1,342],[0,3,0,0,0,469],[0,3,0,0,1,601],[0,3,0,0,2,706],[0,3,0,0,3,791],[0,3,0,0,4,869],[0,3,0,0,5,884],[0,3,0,0,6,941],[0,3,0,0,7,969],[0,3,0,0,8,977],[0,3,0,1,-8,17],[0,3,0,1,-7,44],[0,3,0,1,-6,64],[0,3,0,1,-5,94],[0,3,0,1,-4,144],[0,3,0,1,-3,187],[0,3,0,1,-2,282],[0,3,0,1,-1,387],[0,3,0,1,0,511],[0,3,0,1,1,635],[0,3,0,1,2,735],[0,3,0,1,3,825],[0,3,0,1,4,871],[0,3,0,1,5,899],[0,3,0,1,6,943],[0,3,0,1,7,967],[0,3,0,1,8,986],[0,3,0,2,-8,65],[0,3,0,2,-6,37],[0,3,0,2,-5,124],[0,3,0,2,-4,167],[0,3,0,2,-3,197],[0,3,0,2,-2,295],[0,3,0,2,-1,423],[0,3,0,2,0,538],[0,3,0,2,1,677],[0,3,0,2,2,755],[0,3,0,2,3,814],[0,3,0,2,4,874],[0,3,0,2,5,908],[0,3,0,2,6,960],[0,3,0,2,7,979],[0,3,0,2,8,955],[0,3,0,3,-8,29],[0,3,0,3,-7,83],[0,3,0,3,-6,85],[0,3,0,3,-5,146],[0,3,0,3,-4,214],[0,3,0,3,-3,248],[0,3,0,3,-2,359],[0,3,0,3,-1,456],[0,3,0,3,0,578],[0,3,0,3,1,670],[0,3,0,3,2,770],[0,3,0,3,3,841],[0,3,0,3,4,868],[0,3,0,3,5,919],[0,3,0,3,6,970],[0,3,0,3,7,978],[0,3,0,3,8,977],[0,3,0,4,-4,319],[0,3,0,4,-3,244],[0,3,0,4,-2,311],[0,3,0,4,-1,466],[0,3,0,4,0,569],[0,3,0,4,1,689],[0,3,0,4,2,787],[0,3,0,4,3,837],[0,3,0,4,4,949],[0,3,0,4,5,907],[0,3,0,5,-5,91],[0,3,0,5,-4,224],[0,3,0,5,-3,214],[0,3,0,5,-2,362],[0,3,0,5,-1,506],[0,3,0,5,0,618],[0,3,0,5,1,713],[0,3,0,5,2,780],[0,3,0,5,3,860],[0,3,0,5,4,933],[0,3,0,5,5,951],[0,3,0,5,6,1000],[0,3,0,6,-5,129],[0,3,0,6,-4,256],[0,3,0,6,-3,286],[0,3,0,6,-2,419],[0,3,0,6,-1,523],[0,3,0,6,0,615],[0,3,0,6,1,769],[0,3,0,6,2,841],[0,3,0,6,3,887],[0,3,0,6,4,911],[0,3,0,6,5,913],[0,3,0,6,6,973],[0,3,0,7,-5,125],[0,3,0,7,-4,220],[0,3,0,7,-3,363],[0,3,0,7,-2,459],[0,3,0,7,-1,569],[0,3,0,7,0,681],[0,3,0,7,1,730],[0,3,0,7,2,827],[0,3,0,7,3,865],[0,3,0,7,4,930],[0,3,0,7,5,955],[0,3,1,0,-8,20],[0,3,1,0,-7,31],[0,3,1,0,-6,39],[0,3,1,0,-5,59],[0,3,1,0,-4,94],[0,3,1,0,-3,154],[0,3,1,0,-2,215],[0,3,1,0,-1,318],[0,3,1,0,0,447],[0,3,1,0,1,577],[0,3,1,0,2,684],[0,3,1,0,3,772],[0,3,1,0,4,855],[0,3,1,0,5,883],[0,3,1,0,6,934],[0,3,1,0,7,972],[0,3,1,0,8,976],[0,3,1,1,-8,15],[0,3,1,1,-7,34],[0,3,1,1,-6,59],[0,3,1,1,-5,72],[0,3,1,1,-4,119],[0,3,1,1,-3,186],[0,3,1,1,-2,234],[0,3,1,1,-1,353],[0,3,1,1,0,477],[0,3,1,1,1,602],[0,3,1,1,2,705],[0,3,1,1,3,795],[0,3,1,1,4,858],[0,3,1,1,5,889],[0,3,1,1,6,924],[0,3,1,1,7,939],[0,3,1,1,8,977],[0,3,1,2,-8,18],[0,3,1,2,-7,0],[0,3,1,2,-6,65],[0,3,1,2,-5,71],[0,3,1,2,-4,118],[0,3,1,2,-3,200],[0,3,1,2,-2,257],[0,3,1,2,-1,361],[0,3,1,2,0,500],[0,3,1,2,1,632],[0,3,1,2,2,721],[0,3,1,2,3,806],[0,3,1,2,4,865],[0,3,1,2,5,895],[0,3,1,2,6,947],[0,3,1,2,7,949],[0,3,1,2,8,970],[0,3,1,3,-8,0],[0,3,1,3,-7,97],[0,3,1,3,-6,62],[0,3,1,3,-5,74],[0,3,1,3,-4,164],[0,3,1,3,-3,219],[0,3,1,3,-2,299],[0,3,1,3,-1,396],[0,3,1,3,0,515],[0,3,1,3,1,639],[0,3,1,3,2,725],[0,3,1,3,3,807],[0,3,1,3,4,846],[0,3,1,3,5,918],[0,3,1,3,6,940],[0,3,1,3,7,943],[0,3,1,3,8,964],[0,3,1,4,-6,25],[0,3,1,4,-5,105],[0,3,1,4,-4,184],[0,3,1,4,-3,219],[0,3,1,4,-2,262],[0,3,1,4,-1,414],[0,3,1,4,0,534],[0,3,1,4,1,659],[0,3,1,4,2,753],[0,3,1,4,3,812],[0,3,1,4,4,874],[0,3,1,4,5,909],[0,3,1,4,6,890],[0,3,1,4,7,980],[0,3,1,4,8,973],[0,3,1,5,-6,106],[0,3,1,5,-5,137],[0,3,1,5,-4,167],[0,3,1,5,-3,248],[0,3,1,5,-2,303],[0,3,1,5,-1,425],[0,3,1,5,0,570],[0,3,1,5,1,676],[0,3,1,5,2,748],[0,3,1,5,3,819],[0,3,1,5,4,868],[0,3,1,5,5,906],[0,3,1,5,6,949],[0,3,1,5,7,980],[0,3,1,5,8,987],[0,3,1,6,-5,133],[0,3,1,6,-4,186],[0,3,1,6,-3,306],[0,3,1,6,-2,329],[0,3,1,6,-1,444],[0,3,1,6,0,568],[0,3,1,6,1,676],[0,3,1,6,2,791],[0,3,1,6,3,840],[0,3,1,6,4,866],[0,3,1,6,5,904],[0,3,1,6,6,949],[0,3,1,6,7,951],[0,3,1,6,8,981],[0,3,1,7,-6,56],[0,3,1,7,-5,125],[0,3,1,7,-4,147],[0,3,1,7,-3,300],[0,3,1,7,-2,358],[0,3,1,7,-1,456],[0,3,1,7,0,593],[0,3,1,7,1,684],[0,3,1,7,2,773],[0,3,1,7,3,842],[0,3,1,7,4,883],[0,3,1,7,5,928],[0,3,1,7,6,975],[0,3,1,7,7,974],[0,3,1,7,8,979],[0,3,2,0,-8,12],[0,3,2,0,-7,35],[0,3,2,0,-6,29],[0,3,2,0,-5,55],[0,3,2,0,-4,83],[0,3,2,0,-3,133],[0,3,2,0,-2,206],[0,3,2,0,-1,300],[0,3,2,0,0,431],[0,3,2,0,1,559],[0,3,2,0,2,671],[0,3,2,0,3,762],[0,3,2,0,4,841],[0,3,2,0,5,881],[0,3,2,0,6,929],[0,3,2,0,7,967],[0,3,2,0,8,977],[0,3,2,1,-8,17],[0,3,2,1,-7,38],[0,3,2,1,-6,41],[0,3,2,1,-5,70],[0,3,2,1,-4,101],[0,3,2,1,-3,149],[0,3,2,1,-2,213],[0,3,2,1,-1,319],[0,3,2,1,0,445],[0,3,2,1,1,572],[0,3,2,1,2,684],[0,3,2,1,3,769],[0,3,2,1,4,850],[0,3,2,1,5,877],[0,3,2,1,6,917],[0,3,2,1,7,960],[0,3,2,1,8,975],[0,3,2,2,-8,30],[0,3,2,2,-7,0],[0,3,2,2,-6,52],[0,3,2,2,-5,46],[0,3,2,2,-4,90],[0,3,2,2,-3,168],[0,3,2,2,-2,239],[0,3,2,2,-1,335],[0,3,2,2,0,456],[0,3,2,2,1,575],[0,3,2,2,2,699],[0,3,2,2,3,787],[0,3,2,2,4,861],[0,3,2,2,5,887],[0,3,2,2,6,930],[0,3,2,2,7,937],[0,3,2,2,8,980],[0,3,2,3,-8,26],[0,3,2,3,-7,33],[0,3,2,3,-6,45],[0,3,2,3,-5,89],[0,3,2,3,-4,105],[0,3,2,3,-3,164],[0,3,2,3,-2,234],[0,3,2,3,-1,351],[0,3,2,3,0,468],[0,3,2,3,1,580],[0,3,2,3,2,702],[0,3,2,3,3,794],[0,3,2,3,4,856],[0,3,2,3,5,881],[0,3,2,3,6,926],[0,3,2,3,7,949],[0,3,2,3,8,966],[0,3,2,4,-6,31],[0,3,2,4,-5,83],[0,3,2,4,-4,127],[0,3,2,4,-3,160],[0,3,2,4,-2,232],[0,3,2,4,-1,325],[0,3,2,4,0,459],[0,3,2,4,1,599],[0,3,2,4,2,698],[0,3,2,4,3,774],[0,3,2,4,4,872],[0,3,2,4,5,906],[0,3,2,4,6,913],[0,3,2,4,7,949],[0,3,2,4,8,980],[0,3,2,5,-7,81],[0,3,2,5,-6,77],[0,3,2,5,-5,111],[0,3,2,5,-4,125],[0,3,2,5,-3,175],[0,3,2,5,-2,269],[0,3,2,5,-1,349],[0,3,2,5,0,480],[0,3,2,5,1,606],[0,3,2,5,2,698],[0,3,2,5,3,793],[0,3,2,5,4,855],[0,3,2,5,5,905],[0,3,2,5,6,955],[0,3,2,5,7,948],[0,3,2,5,8,981],[0,3,2,6,-7,32],[0,3,2,6,-6,116],[0,3,2,6,-5,66],[0,3,2,6,-4,141],[0,3,2,6,-3,201],[0,3,2,6,-2,280],[0,3,2,6,-1,382],[0,3,2,6,0,492],[0,3,2,6,1,596],[0,3,2,6,2,701],[0,3,2,6,3,796],[0,3,2,6,4,824],[0,3,2,6,5,897],[0,3,2,6,6,957],[0,3,2,6,7,928],[0,3,2,6,8,974],[0,3,2,7,-6,61],[0,3,2,7,-5,171],[0,3,2,7,-4,164],[0,3,2,7,-3,200],[0,3,2,7,-2,286],[0,3,2,7,-1,403],[0,3,2,7,0,512],[0,3,2,7,1,610],[0,3,2,7,2,728],[0,3,2,7,3,832],[0,3,2,7,4,845],[0,3,2,7,5,900],[0,3,2,7,6,950],[0,3,2,7,7,959],[0,3,2,7,8,1000],[0,4,0,0,-8,9],[0,4,0,0,-7,24],[0,4,0,0,-6,40],[0,4,0,0,-5,65],[0,4,0,0,-4,93],[0,4,0,0,-3,152],[0,4,0,0,-2,229],[0,4,0,0,-1,342],[0,4,0,0,0,474],[0,4,0,0,1,608],[0,4,0,0,2,721],[0,4,0,0,3,809],[0,4,0,0,4,881],[0,4,0,0,5,916],[0,4,0,0,6,946],[0,4,0,0,7,963],[0,4,0,0,8,989],[0,4,0,1,-8,15],[0,4,0,1,-7,15],[0,4,0,1,-6,66],[0,4,0,1,-5,77],[0,4,0,1,-4,121],[0,4,0,1,-3,192],[0,4,0,1,-2,267],[0,4,0,1,-1,389],[0,4,0,1,0,521],[0,4,0,1,1,649],[0,4,0,1,2,749],[0,4,0,1,3,826],[0,4,0,1,4,903],[0,4,0,1,5,914],[0,4,0,1,6,954],[0,4,0,1,7,962],[0,4,0,1,8,991],[0,4,0,2,-8,0],[0,4,0,2,-7,27],[0,4,0,2,-6,50],[0,4,0,2,-5,99],[0,4,0,2,-4,137],[0,4,0,2,-3,226],[0,4,0,2,-2,307],[0,4,0,2,-1,428],[0,4,0,2,0,577],[0,4,0,2,1,682],[0,4,0,2,2,757],[0,4,0,2,3,830],[0,4,0,2,4,889],[0,4,0,2,5,943],[0,4,0,2,6,974],[0,4,0,2,7,975],[0,4,0,2,8,973],[0,4,0,3,-8,11],[0,4,0,3,-7,24],[0,4,0,3,-6,80],[0,4,0,3,-5,88],[0,4,0,3,-4,150],[0,4,0,3,-3,249],[0,4,0,3,-2,351],[0,4,0,3,-1,456],[0,4,0,3,0,595],[0,4,0,3,1,707],[0,4,0,3,2,793],[0,4,0,3,3,856],[0,4,0,3,4,911],[0,4,0,3,5,948],[0,4,0,3,6,993],[0,4,0,3,7,941],[0,4,0,3,8,1000],[0,4,0,4,-6,0],[0,4,0,4,-5,111],[0,4,0,4,-4,37],[0,4,0,4,-3,220],[0,4,0,4,-2,377],[0,4,0,4,-1,411],[0,4,0,4,0,566],[0,4,0,4,1,688],[0,4,0,4,2,795],[0,4,0,4,3,868],[0,4,0,4,4,908],[0,4,0,4,5,964],[0,4,0,4,6,973],[0,4,0,5,-8,32],[0,4,0,5,-6,73],[0,4,0,5,-5,179],[0,4,0,5,-4,140],[0,4,0,5,-3,278],[0,4,0,5,-2,359],[0,4,0,5,-1,480],[0,4,0,5,0,630],[0,4,0,5,1,714],[0,4,0,5,2,788],[0,4,0,5,3,862],[0,4,0,5,4,939],[0,4,0,5,5,963],[0,4,0,5,6,983],[0,4,0,5,7,1000],[0,4,0,5,8,980],[0,4,0,6,-6,100],[0,4,0,6,-5,91],[0,4,0,6,-4,173],[0,4,0,6,-3,255],[0,4,0,6,-2,336],[0,4,0,6,-1,498],[0,4,0,6,0,655],[0,4,0,6,1,760],[0,4,0,6,2,838],[0,4,0,6,3,874],[0,4,0,6,4,969],[0,4,0,6,5,926],[0,4,0,6,6,958],[0,4,0,6,7,1000],[0,4,0,7,-6,167],[0,4,0,7,-5,178],[0,4,0,7,-4,239],[0,4,0,7,-3,378],[0,4,0,7,-2,409],[0,4,0,7,-1,557],[0,4,0,7,0,692],[0,4,0,7,1,801],[0,4,0,7,2,874],[0,4,0,7,3,943],[0,4,0,7,4,945],[0,4,0,7,5,989],[0,4,0,7,6,978],[0,4,0,7,7,1000],[0,4,1,0,-8,7],[0,4,1,0,-7,26],[0,4,1,0,-6,30],[0,4,1,0,-5,54],[0,4,1,0,-4,79],[0,4,1,0,-3,128],[0,4,1,0,-2,202],[0,4,1,0,-1,309],[0,4,1,0,0,442],[0,4,1,0,1,582],[0,4,1,0,2,705],[0,4,1,0,3,794],[0,4,1,0,4,869],[0,4,1,0,5,913],[0,4,1,0,6,938],[0,4,1,0,7,967],[0,4,1,0,8,989],[0,4,1,1,-8,10],[0,4,1,1,-7,26],[0,4,1,1,-6,40],[0,4,1,1,-5,65],[0,4,1,1,-4,98],[0,4,1,1,-3,154],[0,4,1,1,-2,229],[0,4,1,1,-1,345],[0,4,1,1,0,475],[0,4,1,1,1,610],[0,4,1,1,2,729],[0,4,1,1,3,814],[0,4,1,1,4,883],[0,4,1,1,5,907],[0,4,1,1,6,951],[0,4,1,1,7,965],[0,4,1,1,8,986],[0,4,1,2,-8,0],[0,4,1,2,-7,29],[0,4,1,2,-6,26],[0,4,1,2,-5,77],[0,4,1,2,-4,105],[0,4,1,2,-3,158],[0,4,1,2,-2,246],[0,4,1,2,-1,385],[0,4,1,2,0,514],[0,4,1,2,1,632],[0,4,1,2,2,735],[0,4,1,2,3,820],[0,4,1,2,4,875],[0,4,1,2,5,914],[0,4,1,2,6,937],[0,4,1,2,7,956],[0,4,1,2,8,970],[0,4,1,3,-8,14],[0,4,1,3,-7,8],[0,4,1,3,-6,74],[0,4,1,3,-5,82],[0,4,1,3,-4,102],[0,4,1,3,-3,204],[0,4,1,3,-2,281],[0,4,1,3,-1,395],[0,4,1,3,0,525],[0,4,1,3,1,651],[0,4,1,3,2,756],[0,4,1,3,3,833],[0,4,1,3,4,896],[0,4,1,3,5,915],[0,4,1,3,6,972],[0,4,1,3,7,957],[0,4,1,3,8,991],[0,4,1,4,-8,0],[0,4,1,4,-7,0],[0,4,1,4,-6,60],[0,4,1,4,-5,80],[0,4,1,4,-4,103],[0,4,1,4,-3,200],[0,4,1,4,-2,252],[0,4,1,4,-1,426],[0,4,1,4,0,551],[0,4,1,4,1,674],[0,4,1,4,2,783],[0,4,1,4,3,838],[0,4,1,4,4,881],[0,4,1,4,5,932],[0,4,1,4,6,972],[0,4,1,4,7,988],[0,4,1,4,8,1000],[0,4,1,5,-8,0],[0,4,1,5,-7,59],[0,4,1,5,-6,37],[0,4,1,5,-5,102],[0,4,1,5,-4,146],[0,4,1,5,-3,216],[0,4,1,5,-2,286],[0,4,1,5,-1,453],[0,4,1,5,0,570],[0,4,1,5,1,691],[0,4,1,5,2,771],[0,4,1,5,3,837],[0,4,1,5,4,912],[0,4,1,5,5,941],[0,4,1,5,6,972],[0,4,1,5,7,983],[0,4,1,5,8,966],[0,4,1,6,-7,56],[0,4,1,6,-6,54],[0,4,1,6,-5,62],[0,4,1,6,-4,129],[0,4,1,6,-3,225],[0,4,1,6,-2,297],[0,4,1,6,-1,448],[0,4,1,6,0,553],[0,4,1,6,1,716],[0,4,1,6,2,805],[0,4,1,6,3,837],[0,4,1,6,4,932],[0,4,1,6,5,943],[0,4,1,6,6,953],[0,4,1,6,7,985],[0,4,1,6,8,970],[0,4,1,7,-8,0],[0,4,1,7,-7,30],[0,4,1,7,-6,162],[0,4,1,7,-5,190],[0,4,1,7,-4,162],[0,4,1,7,-3,248],[0,4,1,7,-2,344],[0,4,1,7,-1,477],[0,4,1,7,0,569],[0,4,1,7,1,716],[0,4,1,7,2,834],[0,4,1,7,3,867],[0,4,1,7,4,906],[0,4,1,7,5,957],[0,4,1,7,6,955],[0,4,1,7,7,975],[0,4,1,7,8,963],[0,4,2,0,-8,9],[0,4,2,0,-7,22],[0,4,2,0,-6,25],[0,4,2,0,-5,42],[0,4,2,0,-4,68],[0,4,2,0,-3,115],[0,4,2,0,-2,186],[0,4,2,0,-1,283],[0,4,2,0,0,415],[0,4,2,0,1,564],[0,4,2,0,2,690],[0,4,2,0,3,788],[0,4,2,0,4,863],[0,4,2,0,5,912],[0,4,2,0,6,935],[0,4,2,0,7,963],[0,4,2,0,8,988],[0,4,2,1,-8,14],[0,4,2,1,-7,27],[0,4,2,1,-6,35],[0,4,2,1,-5,48],[0,4,2,1,-4,71],[0,4,2,1,-3,123],[0,4,2,1,-2,202],[0,4,2,1,-1,306],[0,4,2,1,0,443],[0,4,2,1,1,583],[0,4,2,1,2,703],[0,4,2,1,3,797],[0,4,2,1,4,877],[0,4,2,1,5,914],[0,4,2,1,6,941],[0,4,2,1,7,969],[0,4,2,1,8,983],[0,4,2,2,-8,0],[0,4,2,2,-7,8],[0,4,2,2,-6,15],[0,4,2,2,-5,70],[0,4,2,2,-4,78],[0,4,2,2,-3,131],[0,4,2,2,-2,208],[0,4,2,2,-1,317],[0,4,2,2,0,465],[0,4,2,2,1,591],[0,4,2,2,2,717],[0,4,2,2,3,814],[0,4,2,2,4,876],[0,4,2,2,5,916],[0,4,2,2,6,937],[0,4,2,2,7,973],[0,4,2,2,8,983],[0,4,2,3,-8,41],[0,4,2,3,-7,23],[0,4,2,3,-6,36],[0,4,2,3,-5,68],[0,4,2,3,-4,80],[0,4,2,3,-3,147],[0,4,2,3,-2,221],[0,4,2,3,-1,339],[0,4,2,3,0,473],[0,4,2,3,1,612],[0,4,2,3,2,720],[0,4,2,3,3,810],[0,4,2,3,4,885],[0,4,2,3,5,911],[0,4,2,3,6,933],[0,4,2,3,7,979],[0,4,2,3,8,991],[0,4,2,4,-8,0],[0,4,2,4,-7,23],[0,4,2,4,-6,44],[0,4,2,4,-5,55],[0,4,2,4,-4,102],[0,4,2,4,-3,128],[0,4,2,4,-2,196],[0,4,2,4,-1,325],[0,4,2,4,0,470],[0,4,2,4,1,604],[0,4,2,4,2,702],[0,4,2,4,3,809],[0,4,2,4,4,880],[0,4,2,4,5,899],[0,4,2,4,6,943],[0,4,2,4,7,961],[0,4,2,4,8,989],[0,4,2,5,-8,0],[0,4,2,5,-7,16],[0,4,2,5,-6,39],[0,4,2,5,-5,74],[0,4,2,5,-4,106],[0,4,2,5,-3,145],[0,4,2,5,-2,242],[0,4,2,5,-1,356],[0,4,2,5,0,486],[0,4,2,5,1,606],[0,4,2,5,2,737],[0,4,2,5,3,824],[0,4,2,5,4,876],[0,4,2,5,5,916],[0,4,2,5,6,957],[0,4,2,5,7,974],[0,4,2,5,8,966],[0,4,2,6,-8,44],[0,4,2,6,-6,39],[0,4,2,6,-5,103],[0,4,2,6,-4,107],[0,4,2,6,-3,145],[0,4,2,6,-2,245],[0,4,2,6,-1,377],[0,4,2,6,0,497],[0,4,2,6,1,632],[0,4,2,6,2,749],[0,4,2,6,3,797],[0,4,2,6,4,863],[0,4,2,6,5,927],[0,4,2,6,6,907],[0,4,2,6,7,948],[0,4,2,6,8,983],[0,4,2,7,-8,32],[0,4,2,7,-7,31],[0,4,2,7,-6,0],[0,4,2,7,-5,122],[0,4,2,7,-4,111],[0,4,2,7,-3,175],[0,4,2,7,-2,240],[0,4,2,7,-1,386],[0,4,2,7,0,508],[0,4,2,7,1,645],[0,4,2,7,2,742],[0,4,2,7,3,824],[0,4,2,7,4,855],[0,4,2,7,5,922],[0,4,2,7,6,968],[0,4,2,7,7,954],[0,4,2,7,8,963],[0,5,0,0,-8,7],[0,5,0,0,-7,16],[0,5,0,0,-6,29],[0,5,0,0,-5,48],[0,5,0,0,-4,76],[0,5,0,0,-3,130],[0,5,0,0,-2,209],[0,5,0,0,-1,322],[0,5,0,0,0,473],[0,5,0,0,1,634],[0,5,0,0,2,750],[0,5,0,0,3,840],[0,5,0,0,4,906],[0,5,0,0,5,939],[0,5,0,0,6,962],[0,5,0,0,7,978],[0,5,0,0,8,989],[0,5,0,1,-8,13],[0,5,0,1,-7,25],[0,5,0,1,-6,37],[0,5,0,1,-5,61],[0,5,0,1,-4,101],[0,5,0,1,-3,170],[0,5,0,1,-2,258],[0,5,0,1,-1,380],[0,5,0,1,0,523],[0,5,0,1,1,676],[0,5,0,1,2,782],[0,5,0,1,3,853],[0,5,0,1,4,913],[0,5,0,1,5,952],[0,5,0,1,6,962],[0,5,0,1,7,983],[0,5,0,1,8,994],[0,5,0,2,-8,12],[0,5,0,2,-7,19],[0,5,0,2,-6,34],[0,5,0,2,-5,95],[0,5,0,2,-4,137],[0,5,0,2,-3,192],[0,5,0,2,-2,291],[0,5,0,2,-1,415],[0,5,0,2,0,563],[0,5,0,2,1,719],[0,5,0,2,2,816],[0,5,0,2,3,890],[0,5,0,2,4,915],[0,5,0,2,5,953],[0,5,0,2,6,957],[0,5,0,2,7,1000],[0,5,0,2,8,994],[0,5,0,3,-8,24],[0,5,0,3,-7,59],[0,5,0,3,-6,41],[0,5,0,3,-5,86],[0,5,0,3,-4,147],[0,5,0,3,-3,228],[0,5,0,3,-2,340],[0,5,0,3,-1,467],[0,5,0,3,0,587],[0,5,0,3,1,739],[0,5,0,3,2,814],[0,5,0,3,3,886],[0,5,0,3,4,941],[0,5,0,3,5,966],[0,5,0,3,6,977],[0,5,0,3,7,975],[0,5,0,3,8,1000],[0,5,0,4,-5,109],[0,5,0,4,-4,165],[0,5,0,4,-3,209],[0,5,0,4,-2,313],[0,5,0,4,-1,472],[0,5,0,4,0,618],[0,5,0,4,1,737],[0,5,0,4,2,829],[0,5,0,4,3,859],[0,5,0,4,4,944],[0,5,0,4,5,989],[0,5,0,4,6,946],[0,5,0,4,7,1000],[0,5,0,4,8,978],[0,5,0,5,-8,40],[0,5,0,5,-6,52],[0,5,0,5,-5,155],[0,5,0,5,-4,138],[0,5,0,5,-3,242],[0,5,0,5,-2,382],[0,5,0,5,-1,511],[0,5,0,5,0,652],[0,5,0,5,1,767],[0,5,0,5,2,853],[0,5,0,5,3,908],[0,5,0,5,4,939],[0,5,0,5,5,972],[0,5,0,5,6,967],[0,5,0,5,7,1000],[0,5,0,5,8,985],[0,5,0,6,-8,0],[0,5,0,6,-6,59],[0,5,0,6,-5,121],[0,5,0,6,-4,137],[0,5,0,6,-3,327],[0,5,0,6,-2,365],[0,5,0,6,-1,550],[0,5,0,6,0,702],[0,5,0,6,1,791],[0,5,0,6,2,870],[0,5,0,6,3,953],[0,5,0,6,4,944],[0,5,0,6,5,933],[0,5,0,6,6,1000],[0,5,0,6,7,1000],[0,5,0,6,8,1000],[0,5,0,7,-8,0],[0,5,0,7,-6,91],[0,5,0,7,-5,165],[0,5,0,7,-4,234],[0,5,0,7,-3,318],[0,5,0,7,-2,448],[0,5,0,7,-1,621],[0,5,0,7,0,697],[0,5,0,7,1,851],[0,5,0,7,2,859],[0,5,0,7,3,935],[0,5,0,7,4,937],[0,5,0,7,5,957],[0,5,0,7,6,981],[0,5,0,7,7,971],[0,5,0,7,8,1000],[0,5,1,0,-8,4],[0,5,1,0,-7,12],[0,5,1,0,-6,23],[0,5,1,0,-5,38],[0,5,1,0,-4,59],[0,5,1,0,-3,108],[0,5,1,0,-2,181],[0,5,1,0,-1,288],[0,5,1,0,0,443],[0,5,1,0,1,608],[0,5,1,0,2,732],[0,5,1,0,3,827],[0,5,1,0,4,901],[0,5,1,0,5,932],[0,5,1,0,6,964],[0,5,1,0,7,975],[0,5,1,0,8,988],[0,5,1,1,-8,8],[0,5,1,1,-7,19],[0,5,1,1,-6,30],[0,5,1,1,-5,46],[0,5,1,1,-4,73],[0,5,1,1,-3,123],[0,5,1,1,-2,213],[0,5,1,1,-1,328],[0,5,1,1,0,484],[0,5,1,1,1,638],[0,5,1,1,2,761],[0,5,1,1,3,830],[0,5,1,1,4,897],[0,5,1,1,5,943],[0,5,1,1,6,966],[0,5,1,1,7,977],[0,5,1,1,8,989],[0,5,1,2,-8,8],[0,5,1,2,-7,32],[0,5,1,2,-6,30],[0,5,1,2,-5,49],[0,5,1,2,-4,89],[0,5,1,2,-3,147],[0,5,1,2,-2,230],[0,5,1,2,-1,350],[0,5,1,2,0,509],[0,5,1,2,1,664],[0,5,1,2,2,768],[0,5,1,2,3,850],[0,5,1,2,4,909],[0,5,1,2,5,949],[0,5,1,2,6,960],[0,5,1,2,7,986],[0,5,1,2,8,992],[0,5,1,3,-8,22],[0,5,1,3,-7,38],[0,5,1,3,-6,40],[0,5,1,3,-5,57],[0,5,1,3,-4,100],[0,5,1,3,-3,176],[0,5,1,3,-2,272],[0,5,1,3,-1,381],[0,5,1,3,0,524],[0,5,1,3,1,686],[0,5,1,3,2,784],[0,5,1,3,3,852],[0,5,1,3,4,895],[0,5,1,3,5,950],[0,5,1,3,6,954],[0,5,1,3,7,980],[0,5,1,3,8,989],[0,5,1,4,-8,0],[0,5,1,4,-7,19],[0,5,1,4,-6,39],[0,5,1,4,-5,78],[0,5,1,4,-4,119],[0,5,1,4,-3,178],[0,5,1,4,-2,274],[0,5,1,4,-1,405],[0,5,1,4,0,553],[0,5,1,4,1,692],[0,5,1,4,2,792],[0,5,1,4,3,849],[0,5,1,4,4,927],[0,5,1,4,5,941],[0,5,1,4,6,947],[0,5,1,4,7,1000],[0,5,1,4,8,1000],[0,5,1,5,-8,34],[0,5,1,5,-7,42],[0,5,1,5,-6,49],[0,5,1,5,-5,56],[0,5,1,5,-4,104],[0,5,1,5,-3,180],[0,5,1,5,-2,304],[0,5,1,5,-1,444],[0,5,1,5,0,584],[0,5,1,5,1,727],[0,5,1,5,2,812],[0,5,1,5,3,864],[0,5,1,5,4,919],[0,5,1,5,5,962],[0,5,1,5,6,980],[0,5,1,5,7,991],[0,5,1,5,8,989],[0,5,1,6,-8,0],[0,5,1,6,-7,16],[0,5,1,6,-6,10],[0,5,1,6,-5,129],[0,5,1,6,-4,119],[0,5,1,6,-3,256],[0,5,1,6,-2,300],[0,5,1,6,-1,456],[0,5,1,6,0,628],[0,5,1,6,1,733],[0,5,1,6,2,824],[0,5,1,6,3,897],[0,5,1,6,4,924],[0,5,1,6,5,951],[0,5,1,6,6,951],[0,5,1,6,7,990],[0,5,1,6,8,994],[0,5,1,7,-8,26],[0,5,1,7,-7,40],[0,5,1,7,-6,51],[0,5,1,7,-5,83],[0,5,1,7,-4,156],[0,5,1,7,-3,264],[0,5,1,7,-2,339],[0,5,1,7,-1,479],[0,5,1,7,0,611],[0,5,1,7,1,750],[0,5,1,7,2,834],[0,5,1,7,3,905],[0,5,1,7,4,931],[0,5,1,7,5,940],[0,5,1,7,6,967],[0,5,1,7,7,990],[0,5,1,7,8,1000],[0,5,2,0,-8,3],[0,5,2,0,-7,8],[0,5,2,0,-6,19],[0,5,2,0,-5,34],[0,5,2,0,-4,57],[0,5,2,0,-3,102],[0,5,2,0,-2,162],[0,5,2,0,-1,267],[0,5,2,0,0,420],[0,5,2,0,1,590],[0,5,2,0,2,720],[0,5,2,0,3,818],[0,5,2,0,4,890],[0,5,2,0,5,927],[0,5,2,0,6,962],[0,5,2,0,7,974],[0,5,2,0,8,990],[0,5,2,1,-8,4],[0,5,2,1,-7,5],[0,5,2,1,-6,22],[0,5,2,1,-5,43],[0,5,2,1,-4,55],[0,5,2,1,-3,112],[0,5,2,1,-2,180],[0,5,2,1,-1,285],[0,5,2,1,0,447],[0,5,2,1,1,608],[0,5,2,1,2,728],[0,5,2,1,3,820],[0,5,2,1,4,896],[0,5,2,1,5,931],[0,5,2,1,6,958],[0,5,2,1,7,974],[0,5,2,1,8,990],[0,5,2,2,-8,4],[0,5,2,2,-7,40],[0,5,2,2,-6,35],[0,5,2,2,-5,26],[0,5,2,2,-4,71],[0,5,2,2,-3,122],[0,5,2,2,-2,197],[0,5,2,2,-1,314],[0,5,2,2,0,456],[0,5,2,2,1,621],[0,5,2,2,2,731],[0,5,2,2,3,832],[0,5,2,2,4,890],[0,5,2,2,5,934],[0,5,2,2,6,970],[0,5,2,2,7,977],[0,5,2,2,8,981],[0,5,2,3,-8,4],[0,5,2,3,-7,22],[0,5,2,3,-6,49],[0,5,2,3,-5,42],[0,5,2,3,-4,86],[0,5,2,3,-3,121],[0,5,2,3,-2,211],[0,5,2,3,-1,320],[0,5,2,3,0,471],[0,5,2,3,1,636],[0,5,2,3,2,736],[0,5,2,3,3,837],[0,5,2,3,4,888],[0,5,2,3,5,936],[0,5,2,3,6,953],[0,5,2,3,7,966],[0,5,2,3,8,997],[0,5,2,4,-8,19],[0,5,2,4,-7,0],[0,5,2,4,-6,45],[0,5,2,4,-5,33],[0,5,2,4,-4,87],[0,5,2,4,-3,108],[0,5,2,4,-2,192],[0,5,2,4,-1,309],[0,5,2,4,0,471],[0,5,2,4,1,619],[0,5,2,4,2,746],[0,5,2,4,3,820],[0,5,2,4,4,910],[0,5,2,4,5,927],[0,5,2,4,6,956],[0,5,2,4,7,974],[0,5,2,4,8,1000],[0,5,2,5,-8,21],[0,5,2,5,-7,31],[0,5,2,5,-6,19],[0,5,2,5,-5,47],[0,5,2,5,-4,68],[0,5,2,5,-3,149],[0,5,2,5,-2,236],[0,5,2,5,-1,335],[0,5,2,5,0,484],[0,5,2,5,1,634],[0,5,2,5,2,752],[0,5,2,5,3,835],[0,5,2,5,4,906],[0,5,2,5,5,941],[0,5,2,5,6,960],[0,5,2,5,7,965],[0,5,2,5,8,990],[0,5,2,6,-8,14],[0,5,2,6,-7,19],[0,5,2,6,-6,25],[0,5,2,6,-5,31],[0,5,2,6,-4,90],[0,5,2,6,-3,165],[0,5,2,6,-2,255],[0,5,2,6,-1,362],[0,5,2,6,0,497],[0,5,2,6,1,660],[0,5,2,6,2,766],[0,5,2,6,3,857],[0,5,2,6,4,900],[0,5,2,6,5,936],[0,5,2,6,6,959],[0,5,2,6,7,984],[0,5,2,6,8,995],[0,5,2,7,-8,0],[0,5,2,7,-7,0],[0,5,2,7,-6,99],[0,5,2,7,-5,50],[0,5,2,7,-4,92],[0,5,2,7,-3,157],[0,5,2,7,-2,254],[0,5,2,7,-1,324],[0,5,2,7,0,513],[0,5,2,7,1,672],[0,5,2,7,2,761],[0,5,2,7,3,855],[0,5,2,7,4,929],[0,5,2,7,5,936],[0,5,2,7,6,957],[0,5,2,7,7,1000],[0,5,2,7,8,991],[0,6,0,0,-8,5],[0,6,0,0,-7,13],[0,6,0,0,-6,19],[0,6,0,0,-5,38],[0,6,0,0,-4,62],[0,6,0,0,-3,113],[0,6,0,0,-2,187],[0,6,0,0,-1,304],[0,6,0,0,0,475],[0,6,0,0,1,657],[0,6,0,0,2,776],[0,6,0,0,3,866],[0,6,0,0,4,925],[0,6,0,0,5,953],[0,6,0,0,6,975],[0,6,0,0,7,985],[0,6,0,0,8,995],[0,6,0,1,-8,8],[0,6,0,1,-7,19],[0,6,0,1,-6,30],[0,6,0,1,-5,50],[0,6,0,1,-4,79],[0,6,0,1,-3,155],[0,6,0,1,-2,242],[0,6,0,1,-1,362],[0,6,0,1,0,523],[0,6,0,1,1,699],[0,6,0,1,2,798],[0,6,0,1,3,883],[0,6,0,1,4,932],[0,6,0,1,5,952],[0,6,0,1,6,978],[0,6,0,1,7,984],[0,6,0,1,8,998],[0,6,0,2,-8,4],[0,6,0,2,-7,16],[0,6,0,2,-6,38],[0,6,0,2,-5,62],[0,6,0,2,-4,110],[0,6,0,2,-3,175],[0,6,0,2,-2,281],[0,6,0,2,-1,416],[0,6,0,2,0,566],[0,6,0,2,1,731],[0,6,0,2,2,809],[0,6,0,2,3,886],[0,6,0,2,4,927],[0,6,0,2,5,951],[0,6,0,2,6,972],[0,6,0,2,7,994],[0,6,0,2,8,1000],[0,6,0,3,-8,12],[0,6,0,3,-7,46],[0,6,0,3,-6,42],[0,6,0,3,-5,64],[0,6,0,3,-4,121],[0,6,0,3,-3,254],[0,6,0,3,-2,328],[0,6,0,3,-1,453],[0,6,0,3,0,601],[0,6,0,3,1,760],[0,6,0,3,2,827],[0,6,0,3,3,908],[0,6,0,3,4,960],[0,6,0,3,5,973],[0,6,0,3,6,972],[0,6,0,3,7,1000],[0,6,0,3,8,993],[0,6,0,4,-8,37],[0,6,0,4,-6,17],[0,6,0,4,-5,127],[0,6,0,4,-4,105],[0,6,0,4,-3,209],[0,6,0,4,-2,288],[0,6,0,4,-1,494],[0,6,0,4,0,620],[0,6,0,4,1,772],[0,6,0,4,2,793],[0,6,0,4,3,905],[0,6,0,4,4,943],[0,6,0,4,5,990],[0,6,0,4,6,984],[0,6,0,4,7,1000],[0,6,0,4,8,961],[0,6,0,5,-8,14],[0,6,0,5,-7,0],[0,6,0,5,-6,65],[0,6,0,5,-5,114],[0,6,0,5,-4,136],[0,6,0,5,-3,215],[0,6,0,5,-2,355],[0,6,0,5,-1,498],[0,6,0,5,0,681],[0,6,0,5,1,790],[0,6,0,5,2,849],[0,6,0,5,3,929],[0,6,0,5,4,941],[0,6,0,5,5,958],[0,6,0,5,6,964],[0,6,0,5,7,986],[0,6,0,5,8,1000],[0,6,0,6,-8,0],[0,6,0,6,-7,0],[0,6,0,6,-6,38],[0,6,0,6,-5,144],[0,6,0,6,-4,157],[0,6,0,6,-3,217],[0,6,0,6,-2,379],[0,6,0,6,-1,571],[0,6,0,6,0,712],[0,6,0,6,1,803],[0,6,0,6,2,887],[0,6,0,6,3,931],[0,6,0,6,4,952],[0,6,0,6,5,981],[0,6,0,6,6,986],[0,6,0,6,7,1000],[0,6,0,6,8,988],[0,6,0,7,-8,49],[0,6,0,7,-7,71],[0,6,0,7,-6,98],[0,6,0,7,-5,107],[0,6,0,7,-4,169],[0,6,0,7,-3,312],[0,6,0,7,-2,402],[0,6,0,7,-1,589],[0,6,0,7,0,684],[0,6,0,7,1,834],[0,6,0,7,2,898],[0,6,0,7,3,942],[0,6,0,7,4,966],[0,6,0,7,5,990],[0,6,0,7,6,986],[0,6,0,7,7,1000],[0,6,0,7,8,989],[0,6,1,0,-8,4],[0,6,1,0,-7,10],[0,6,1,0,-6,11],[0,6,1,0,-5,28],[0,6,1,0,-4,51],[0,6,1,0,-3,89],[0,6,1,0,-2,155],[0,6,1,0,-1,267],[0,6,1,0,0,444],[0,6,1,0,1,630],[0,6,1,0,2,764],[0,6,1,0,3,857],[0,6,1,0,4,920],[0,6,1,0,5,950],[0,6,1,0,6,973],[0,6,1,0,7,984],[0,6,1,0,8,995],[0,6,1,1,-8,5],[0,6,1,1,-7,18],[0,6,1,1,-6,17],[0,6,1,1,-5,39],[0,6,1,1,-4,60],[0,6,1,1,-3,118],[0,6,1,1,-2,192],[0,6,1,1,-1,307],[0,6,1,1,0,477],[0,6,1,1,1,659],[0,6,1,1,2,779],[0,6,1,1,3,871],[0,6,1,1,4,927],[0,6,1,1,5,946],[0,6,1,1,6,976],[0,6,1,1,7,982],[0,6,1,1,8,996],[0,6,1,2,-8,2],[0,6,1,2,-7,11],[0,6,1,2,-6,36],[0,6,1,2,-5,21],[0,6,1,2,-4,72],[0,6,1,2,-3,119],[0,6,1,2,-2,209],[0,6,1,2,-1,343],[0,6,1,2,0,508],[0,6,1,2,1,688],[0,6,1,2,2,801],[0,6,1,2,3,875],[0,6,1,2,4,915],[0,6,1,2,5,947],[0,6,1,2,6,984],[0,6,1,2,7,989],[0,6,1,2,8,998],[0,6,1,3,-8,13],[0,6,1,3,-7,21],[0,6,1,3,-6,32],[0,6,1,3,-5,54],[0,6,1,3,-4,91],[0,6,1,3,-3,167],[0,6,1,3,-2,247],[0,6,1,3,-1,379],[0,6,1,3,0,519],[0,6,1,3,1,693],[0,6,1,3,2,797],[0,6,1,3,3,890],[0,6,1,3,4,930],[0,6,1,3,5,959],[0,6,1,3,6,977],[0,6,1,3,7,986],[0,6,1,3,8,996],[0,6,1,4,-8,0],[0,6,1,4,-7,0],[0,6,1,4,-6,10],[0,6,1,4,-5,46],[0,6,1,4,-4,87],[0,6,1,4,-3,155],[0,6,1,4,-2,224],[0,6,1,4,-1,413],[0,6,1,4,0,574],[0,6,1,4,1,717],[0,6,1,4,2,828],[0,6,1,4,3,893],[0,6,1,4,4,912],[0,6,1,4,5,949],[0,6,1,4,6,984],[0,6,1,4,7,1000],[0,6,1,4,8,983],[0,6,1,5,-8,0],[0,6,1,5,-7,60],[0,6,1,5,-6,46],[0,6,1,5,-5,52],[0,6,1,5,-4,114],[0,6,1,5,-3,162],[0,6,1,5,-2,282],[0,6,1,5,-1,398],[0,6,1,5,0,598],[0,6,1,5,1,728],[0,6,1,5,2,830],[0,6,1,5,3,909],[0,6,1,5,4,931],[0,6,1,5,5,969],[0,6,1,5,6,975],[0,6,1,5,7,1000],[0,6,1,5,8,1000],[0,6,1,6,-8,20],[0,6,1,6,-7,41],[0,6,1,6,-6,17],[0,6,1,6,-5,96],[0,6,1,6,-4,84],[0,6,1,6,-3,190],[0,6,1,6,-2,329],[0,6,1,6,-1,442],[0,6,1,6,0,600],[0,6,1,6,1,743],[0,6,1,6,2,836],[0,6,1,6,3,897],[0,6,1,6,4,949],[0,6,1,6,5,979],[0,6,1,6,6,982],[0,6,1,6,7,1000],[0,6,1,6,8,995],[0,6,1,7,-8,23],[0,6,1,7,-7,56],[0,6,1,7,-6,63],[0,6,1,7,-5,67],[0,6,1,7,-4,133],[0,6,1,7,-3,273],[0,6,1,7,-2,318],[0,6,1,7,-1,486],[0,6,1,7,0,623],[0,6,1,7,1,766],[0,6,1,7,2,852],[0,6,1,7,3,912],[0,6,1,7,4,950],[0,6,1,7,5,987],[0,6,1,7,6,990],[0,6,1,7,7,1000],[0,6,1,7,8,995],[0,6,2,0,-8,3],[0,6,2,0,-7,7],[0,6,2,0,-6,8],[0,6,2,0,-5,22],[0,6,2,0,-4,42],[0,6,2,0,-3,76],[0,6,2,0,-2,133],[0,6,2,0,-1,238],[0,6,2,0,0,416],[0,6,2,0,1,610],[0,6,2,0,2,746],[0,6,2,0,3,850],[0,6,2,0,4,916],[0,6,2,0,5,955],[0,6,2,0,6,968],[0,6,2,0,7,981],[0,6,2,0,8,996],[0,6,2,1,-8,3],[0,6,2,1,-7,8],[0,6,2,1,-6,12],[0,6,2,1,-5,24],[0,6,2,1,-4,48],[0,6,2,1,-3,88],[0,6,2,1,-2,150],[0,6,2,1,-1,259],[0,6,2,1,0,432],[0,6,2,1,1,627],[0,6,2,1,2,755],[0,6,2,1,3,851],[0,6,2,1,4,926],[0,6,2,1,5,942],[0,6,2,1,6,975],[0,6,2,1,7,977],[0,6,2,1,8,996],[0,6,2,2,-8,0],[0,6,2,2,-7,3],[0,6,2,2,-6,18],[0,6,2,2,-5,26],[0,6,2,2,-4,41],[0,6,2,2,-3,80],[0,6,2,2,-2,151],[0,6,2,2,-1,275],[0,6,2,2,0,457],[0,6,2,2,1,641],[0,6,2,2,2,767],[0,6,2,2,3,867],[0,6,2,2,4,913],[0,6,2,2,5,944],[0,6,2,2,6,976],[0,6,2,2,7,990],[0,6,2,2,8,995],[0,6,2,3,-8,2],[0,6,2,3,-7,10],[0,6,2,3,-6,18],[0,6,2,3,-5,38],[0,6,2,3,-4,68],[0,6,2,3,-3,101],[0,6,2,3,-2,183],[0,6,2,3,-1,296],[0,6,2,3,0,455],[0,6,2,3,1,639],[0,6,2,3,2,780],[0,6,2,3,3,869],[0,6,2,3,4,921],[0,6,2,3,5,949],[0,6,2,3,6,981],[0,6,2,3,7,986],[0,6,2,3,8,993],[0,6,2,4,-8,0],[0,6,2,4,-7,0],[0,6,2,4,-6,0],[0,6,2,4,-5,31],[0,6,2,4,-4,63],[0,6,2,4,-3,90],[0,6,2,4,-2,168],[0,6,2,4,-1,298],[0,6,2,4,0,456],[0,6,2,4,1,636],[0,6,2,4,2,778],[0,6,2,4,3,857],[0,6,2,4,4,914],[0,6,2,4,5,945],[0,6,2,4,6,977],[0,6,2,4,7,980],[0,6,2,4,8,992],[0,6,2,5,-8,6],[0,6,2,5,-7,22],[0,6,2,5,-6,25],[0,6,2,5,-5,31],[0,6,2,5,-4,58],[0,6,2,5,-3,104],[0,6,2,5,-2,189],[0,6,2,5,-1,298],[0,6,2,5,0,486],[0,6,2,5,1,644],[0,6,2,5,2,773],[0,6,2,5,3,875],[0,6,2,5,4,909],[0,6,2,5,5,941],[0,6,2,5,6,970],[0,6,2,5,7,989],[0,6,2,5,8,993],[0,6,2,6,-8,0],[0,6,2,6,-7,13],[0,6,2,6,-6,23],[0,6,2,6,-5,56],[0,6,2,6,-4,69],[0,6,2,6,-3,118],[0,6,2,6,-2,218],[0,6,2,6,-1,303],[0,6,2,6,0,523],[0,6,2,6,1,675],[0,6,2,6,2,784],[0,6,2,6,3,873],[0,6,2,6,4,925],[0,6,2,6,5,941],[0,6,2,6,6,967],[0,6,2,6,7,981],[0,6,2,6,8,985],[0,6,2,7,-8,12],[0,6,2,7,-7,38],[0,6,2,7,-6,24],[0,6,2,7,-5,43],[0,6,2,7,-4,93],[0,6,2,7,-3,130],[0,6,2,7,-2,238],[0,6,2,7,-1,344],[0,6,2,7,0,515],[0,6,2,7,1,699],[0,6,2,7,2,800],[0,6,2,7,3,861],[0,6,2,7,4,926],[0,6,2,7,5,956],[0,6,2,7,6,967],[0,6,2,7,7,977],[0,6,2,7,8,992],[0,7,0,0,-8,2],[0,7,0,0,-7,6],[0,7,0,0,-6,11],[0,7,0,0,-5,25],[0,7,0,0,-4,42],[0,7,0,0,-3,83],[0,7,0,0,-2,150],[0,7,0,0,-1,268],[0,7,0,0,0,478],[0,7,0,0,1,698],[0,7,0,0,2,822],[0,7,0,0,3,906],[0,7,0,0,4,950],[0,7,0,0,5,971],[0,7,0,0,6,986],[0,7,0,0,7,991],[0,7,0,0,8,998],[0,7,0,1,-8,3],[0,7,0,1,-7,15],[0,7,0,1,-6,19],[0,7,0,1,-5,43],[0,7,0,1,-4,60],[0,7,0,1,-3,128],[0,7,0,1,-2,201],[0,7,0,1,-1,328],[0,7,0,1,0,534],[0,7,0,1,1,732],[0,7,0,1,2,848],[0,7,0,1,3,925],[0,7,0,1,4,959],[0,7,0,1,5,976],[0,7,0,1,6,983],[0,7,0,1,7,990],[0,7,0,1,8,997],[0,7,0,2,-8,5],[0,7,0,2,-7,5],[0,7,0,2,-6,21],[0,7,0,2,-5,65],[0,7,0,2,-4,84],[0,7,0,2,-3,142],[0,7,0,2,-2,240],[0,7,0,2,-1,396],[0,7,0,2,0,601],[0,7,0,2,1,757],[0,7,0,2,2,871],[0,7,0,2,3,935],[0,7,0,2,4,972],[0,7,0,2,5,973],[0,7,0,2,6,994],[0,7,0,2,7,991],[0,7,0,2,8,1000],[0,7,0,3,-8,6],[0,7,0,3,-7,21],[0,7,0,3,-6,26],[0,7,0,3,-5,73],[0,7,0,3,-4,89],[0,7,0,3,-3,193],[0,7,0,3,-2,305],[0,7,0,3,-1,454],[0,7,0,3,0,642],[0,7,0,3,1,787],[0,7,0,3,2,894],[0,7,0,3,3,931],[0,7,0,3,4,974],[0,7,0,3,5,987],[0,7,0,3,6,988],[0,7,0,3,7,989],[0,7,0,3,8,997],[0,7,0,4,-8,27],[0,7,0,4,-7,0],[0,7,0,4,-6,0],[0,7,0,4,-5,57],[0,7,0,4,-4,71],[0,7,0,4,-3,132],[0,7,0,4,-2,296],[0,7,0,4,-1,394],[0,7,0,4,0,633],[0,7,0,4,1,807],[0,7,0,4,2,847],[0,7,0,4,3,944],[0,7,0,4,4,949],[0,7,0,4,5,981],[0,7,0,4,6,971],[0,7,0,4,7,1000],[0,7,0,4,8,1000],[0,7,0,5,-8,0],[0,7,0,5,-7,17],[0,7,0,5,-6,25],[0,7,0,5,-5,72],[0,7,0,5,-4,128],[0,7,0,5,-3,194],[0,7,0,5,-2,315],[0,7,0,5,-1,517],[0,7,0,5,0,694],[0,7,0,5,1,858],[0,7,0,5,2,908],[0,7,0,5,3,955],[0,7,0,5,4,992],[0,7,0,5,5,978],[0,7,0,5,6,992],[0,7,0,5,7,1000],[0,7,0,5,8,1000],[0,7,0,6,-8,14],[0,7,0,6,-7,26],[0,7,0,6,-6,29],[0,7,0,6,-5,45],[0,7,0,6,-4,118],[0,7,0,6,-3,213],[0,7,0,6,-2,381],[0,7,0,6,-1,510],[0,7,0,6,0,707],[0,7,0,6,1,804],[0,7,0,6,2,901],[0,7,0,6,3,972],[0,7,0,6,4,952],[0,7,0,6,5,969],[0,7,0,6,6,1000],[0,7,0,6,7,1000],[0,7,0,6,8,1000],[0,7,0,7,-8,23],[0,7,0,7,-7,0],[0,7,0,7,-6,72],[0,7,0,7,-5,73],[0,7,0,7,-4,145],[0,7,0,7,-3,286],[0,7,0,7,-2,444],[0,7,0,7,-1,611],[0,7,0,7,0,758],[0,7,0,7,1,853],[0,7,0,7,2,926],[0,7,0,7,3,951],[0,7,0,7,4,1000],[0,7,0,7,5,991],[0,7,0,7,6,990],[0,7,0,7,7,1000],[0,7,0,7,8,1000],[0,7,1,0,-8,1],[0,7,1,0,-7,4],[0,7,1,0,-6,7],[0,7,1,0,-5,15],[0,7,1,0,-4,30],[0,7,1,0,-3,58],[0,7,1,0,-2,122],[0,7,1,0,-1,229],[0,7,1,0,0,438],[0,7,1,0,1,675],[0,7,1,0,2,806],[0,7,1,0,3,895],[0,7,1,0,4,944],[0,7,1,0,5,967],[0,7,1,0,6,986],[0,7,1,0,7,991],[0,7,1,0,8,997],[0,7,1,1,-8,1],[0,7,1,1,-7,4],[0,7,1,1,-6,11],[0,7,1,1,-5,24],[0,7,1,1,-4,44],[0,7,1,1,-3,93],[0,7,1,1,-2,155],[0,7,1,1,-1,272],[0,7,1,1,0,489],[0,7,1,1,1,704],[0,7,1,1,2,817],[0,7,1,1,3,905],[0,7,1,1,4,951],[0,7,1,1,5,973],[0,7,1,1,6,984],[0,7,1,1,7,994],[0,7,1,1,8,998],[0,7,1,2,-8,0],[0,7,1,2,-7,7],[0,7,1,2,-6,9],[0,7,1,2,-5,32],[0,7,1,2,-4,69],[0,7,1,2,-3,81],[0,7,1,2,-2,173],[0,7,1,2,-1,317],[0,7,1,2,0,514],[0,7,1,2,1,723],[0,7,1,2,2,838],[0,7,1,2,3,925],[0,7,1,2,4,957],[0,7,1,2,5,972],[0,7,1,2,6,994],[0,7,1,2,7,995],[0,7,1,2,8,1000],[0,7,1,3,-8,3],[0,7,1,3,-7,13],[0,7,1,3,-6,12],[0,7,1,3,-5,40],[0,7,1,3,-4,71],[0,7,1,3,-3,130],[0,7,1,3,-2,213],[0,7,1,3,-1,363],[0,7,1,3,0,537],[0,7,1,3,1,750],[0,7,1,3,2,843],[0,7,1,3,3,918],[0,7,1,3,4,963],[0,7,1,3,5,975],[0,7,1,3,6,989],[0,7,1,3,7,992],[0,7,1,3,8,999],[0,7,1,4,-8,6],[0,7,1,4,-7,0],[0,7,1,4,-6,8],[0,7,1,4,-5,48],[0,7,1,4,-4,34],[0,7,1,4,-3,117],[0,7,1,4,-2,184],[0,7,1,4,-1,338],[0,7,1,4,0,606],[0,7,1,4,1,747],[0,7,1,4,2,854],[0,7,1,4,3,931],[0,7,1,4,4,963],[0,7,1,4,5,978],[0,7,1,4,6,1000],[0,7,1,4,7,993],[0,7,1,4,8,992],[0,7,1,5,-8,0],[0,7,1,5,-7,8],[0,7,1,5,-6,10],[0,7,1,5,-5,65],[0,7,1,5,-4,93],[0,7,1,5,-3,142],[0,7,1,5,-2,253],[0,7,1,5,-1,390],[0,7,1,5,0,619],[0,7,1,5,1,793],[0,7,1,5,2,874],[0,7,1,5,3,937],[0,7,1,5,4,958],[0,7,1,5,5,976],[0,7,1,5,6,993],[0,7,1,5,7,995],[0,7,1,5,8,1000],[0,7,1,6,-8,0],[0,7,1,6,-7,0],[0,7,1,6,-6,24],[0,7,1,6,-5,23],[0,7,1,6,-4,72],[0,7,1,6,-3,137],[0,7,1,6,-2,304],[0,7,1,6,-1,443],[0,7,1,6,0,669],[0,7,1,6,1,781],[0,7,1,6,2,881],[0,7,1,6,3,943],[0,7,1,6,4,967],[0,7,1,6,5,978],[0,7,1,6,6,996],[0,7,1,6,7,1000],[0,7,1,6,8,996],[0,7,1,7,-8,6],[0,7,1,7,-7,9],[0,7,1,7,-6,19],[0,7,1,7,-5,52],[0,7,1,7,-4,129],[0,7,1,7,-3,203],[0,7,1,7,-2,319],[0,7,1,7,-1,462],[0,7,1,7,0,632],[0,7,1,7,1,800],[0,7,1,7,2,906],[0,7,1,7,3,927],[0,7,1,7,4,969],[0,7,1,7,5,994],[0,7,1,7,6,989],[0,7,1,7,7,986],[0,7,1,7,8,1000],[0,7,2,0,-8,1],[0,7,2,0,-7,5],[0,7,2,0,-6,7],[0,7,2,0,-5,11],[0,7,2,0,-4,23],[0,7,2,0,-3,45],[0,7,2,0,-2,100],[0,7,2,0,-1,195],[0,7,2,0,0,405],[0,7,2,0,1,654],[0,7,2,0,2,798],[0,7,2,0,3,891],[0,7,2,0,4,942],[0,7,2,0,5,963],[0,7,2,0,6,983],[0,7,2,0,7,990],[0,7,2,0,8,998],[0,7,2,1,-8,0],[0,7,2,1,-7,2],[0,7,2,1,-6,13],[0,7,2,1,-5,15],[0,7,2,1,-4,28],[0,7,2,1,-3,67],[0,7,2,1,-2,117],[0,7,2,1,-1,227],[0,7,2,1,0,434],[0,7,2,1,1,662],[0,7,2,1,2,807],[0,7,2,1,3,894],[0,7,2,1,4,948],[0,7,2,1,5,966],[0,7,2,1,6,987],[0,7,2,1,7,990],[0,7,2,1,8,997],[0,7,2,2,-8,2],[0,7,2,2,-7,8],[0,7,2,2,-6,9],[0,7,2,2,-5,22],[0,7,2,2,-4,44],[0,7,2,2,-3,57],[0,7,2,2,-2,134],[0,7,2,2,-1,237],[0,7,2,2,0,453],[0,7,2,2,1,682],[0,7,2,2,2,808],[0,7,2,2,3,901],[0,7,2,2,4,947],[0,7,2,2,5,974],[0,7,2,2,6,992],[0,7,2,2,7,997],[0,7,2,2,8,999],[0,7,2,3,-8,0],[0,7,2,3,-7,7],[0,7,2,3,-6,14],[0,7,2,3,-5,21],[0,7,2,3,-4,40],[0,7,2,3,-3,75],[0,7,2,3,-2,142],[0,7,2,3,-1,250],[0,7,2,3,0,470],[0,7,2,3,1,691],[0,7,2,3,2,815],[0,7,2,3,3,904],[0,7,2,3,4,946],[0,7,2,3,5,973],[0,7,2,3,6,983],[0,7,2,3,7,993],[0,7,2,3,8,999],[0,7,2,4,-8,9],[0,7,2,4,-7,9],[0,7,2,4,-6,9],[0,7,2,4,-5,15],[0,7,2,4,-4,25],[0,7,2,4,-3,59],[0,7,2,4,-2,119],[0,7,2,4,-1,251],[0,7,2,4,0,458],[0,7,2,4,1,687],[0,7,2,4,2,823],[0,7,2,4,3,905],[0,7,2,4,4,948],[0,7,2,4,5,978],[0,7,2,4,6,979],[0,7,2,4,7,992],[0,7,2,4,8,996],[0,7,2,5,-8,0],[0,7,2,5,-7,0],[0,7,2,5,-6,8],[0,7,2,5,-5,41],[0,7,2,5,-4,47],[0,7,2,5,-3,88],[0,7,2,5,-2,162],[0,7,2,5,-1,274],[0,7,2,5,0,496],[0,7,2,5,1,728],[0,7,2,5,2,812],[0,7,2,5,3,908],[0,7,2,5,4,943],[0,7,2,5,5,971],[0,7,2,5,6,996],[0,7,2,5,7,993],[0,7,2,5,8,996],[0,7,2,6,-8,0],[0,7,2,6,-7,9],[0,7,2,6,-6,18],[0,7,2,6,-5,27],[0,7,2,6,-4,54],[0,7,2,6,-3,81],[0,7,2,6,-2,180],[0,7,2,6,-1,300],[0,7,2,6,0,490],[0,7,2,6,1,710],[0,7,2,6,2,821],[0,7,2,6,3,905],[0,7,2,6,4,952],[0,7,2,6,5,966],[0,7,2,6,6,984],[0,7,2,6,7,994],[0,7,2,6,8,1000],[0,7,2,7,-8,0],[0,7,2,7,-7,0],[0,7,2,7,-6,19],[0,7,2,7,-5,65],[0,7,2,7,-4,84],[0,7,2,7,-3,119],[0,7,2,7,-2,209],[0,7,2,7,-1,313],[0,7,2,7,0,518],[0,7,2,7,1,736],[0,7,2,7,2,837],[0,7,2,7,3,918],[0,7,2,7,4,961],[0,7,2,7,5,972],[0,7,2,7,6,981],[0,7,2,7,7,989],[0,7,2,7,8,1000],[0,8,0,0,-8,1],[0,8,0,0,-7,2],[0,8,0,0,-6,6],[0,8,0,0,-5,11],[0,8,0,0,-4,26],[0,8,0,0,-3,52],[0,8,0,0,-2,106],[0,8,0,0,-1,222],[0,8,0,0,0,476],[0,8,0,0,1,757],[0,8,0,0,2,873],[0,8,0,0,3,941],[0,8,0,0,4,970],[0,8,0,0,5,982],[0,8,0,0,6,993],[0,8,0,0,7,997],[0,8,0,0,8,999],[0,8,0,1,-8,2],[0,8,0,1,-7,5],[0,8,0,1,-6,11],[0,8,0,1,-5,19],[0,8,0,1,-4,50],[0,8,0,1,-3,86],[0,8,0,1,-2,169],[0,8,0,1,-1,312],[0,8,0,1,0,541],[0,8,0,1,1,797],[0,8,0,1,2,886],[0,8,0,1,3,948],[0,8,0,1,4,972],[0,8,0,1,5,986],[0,8,0,1,6,996],[0,8,0,1,7,995],[0,8,0,1,8,999],[0,8,0,2,-8,0],[0,8,0,2,-7,4],[0,8,0,2,-6,3],[0,8,0,2,-5,27],[0,8,0,2,-4,50],[0,8,0,2,-3,104],[0,8,0,2,-2,198],[0,8,0,2,-1,361],[0,8,0,2,0,607],[0,8,0,2,1,836],[0,8,0,2,2,910],[0,8,0,2,3,952],[0,8,0,2,4,971],[0,8,0,2,5,989],[0,8,0,2,6,997],[0,8,0,2,7,996],[0,8,0,2,8,1000],[0,8,0,3,-8,6],[0,8,0,3,-7,4],[0,8,0,3,-6,22],[0,8,0,3,-5,37],[0,8,0,3,-4,89],[0,8,0,3,-3,164],[0,8,0,3,-2,301],[0,8,0,3,-1,434],[0,8,0,3,0,677],[0,8,0,3,1,841],[0,8,0,3,2,913],[0,8,0,3,3,945],[0,8,0,3,4,991],[0,8,0,3,5,991],[0,8,0,3,6,994],[0,8,0,3,7,1000],[0,8,0,3,8,1000],[0,8,0,4,-8,0],[0,8,0,4,-7,0],[0,8,0,4,-6,0],[0,8,0,4,-5,12],[0,8,0,4,-4,54],[0,8,0,4,-3,112],[0,8,0,4,-2,159],[0,8,0,4,-1,401],[0,8,0,4,0,684],[0,8,0,4,1,854],[0,8,0,4,2,932],[0,8,0,4,3,966],[0,8,0,4,4,983],[0,8,0,4,5,992],[0,8,0,4,6,989],[0,8,0,4,7,1000],[0,8,0,4,8,1000],[0,8,0,5,-8,7],[0,8,0,5,-7,24],[0,8,0,5,-6,30],[0,8,0,5,-5,40],[0,8,0,5,-4,85],[0,8,0,5,-3,152],[0,8,0,5,-2,310],[0,8,0,5,-1,528],[0,8,0,5,0,741],[0,8,0,5,1,888],[0,8,0,5,2,953],[0,8,0,5,3,980],[0,8,0,5,4,988],[0,8,0,5,5,978],[0,8,0,5,6,992],[0,8,0,5,7,990],[0,8,0,5,8,1000],[0,8,0,6,-8,0],[0,8,0,6,-7,19],[0,8,0,6,-6,33],[0,8,0,6,-5,65],[0,8,0,6,-4,88],[0,8,0,6,-3,180],[0,8,0,6,-2,360],[0,8,0,6,-1,645],[0,8,0,6,0,774],[0,8,0,6,1,891],[0,8,0,6,2,941],[0,8,0,6,3,977],[0,8,0,6,4,994],[0,8,0,6,5,992],[0,8,0,6,6,1000],[0,8,0,6,7,1000],[0,8,0,6,8,1000],[0,8,0,7,-8,18],[0,8,0,7,-7,0],[0,8,0,7,-6,39],[0,8,0,7,-5,70],[0,8,0,7,-4,173],[0,8,0,7,-3,279],[0,8,0,7,-2,473],[0,8,0,7,-1,606],[0,8,0,7,0,777],[0,8,0,7,1,923],[0,8,0,7,2,927],[0,8,0,7,3,976],[0,8,0,7,4,995],[0,8,0,7,5,994],[0,8,0,7,6,1000],[0,8,0,7,7,986],[0,8,0,7,8,1000],[0,8,1,0,-8,0],[0,8,1,0,-7,0],[0,8,1,0,-6,4],[0,8,1,0,-5,7],[0,8,1,0,-4,15],[0,8,1,0,-3,35],[0,8,1,0,-2,75],[0,8,1,0,-1,166],[0,8,1,0,0,431],[0,8,1,0,1,733],[0,8,1,0,2,864],[0,8,1,0,3,935],[0,8,1,0,4,968],[0,8,1,0,5,979],[0,8,1,0,6,992],[0,8,1,0,7,996],[0,8,1,0,8,999],[0,8,1,1,-8,1],[0,8,1,1,-7,2],[0,8,1,1,-6,4],[0,8,1,1,-5,11],[0,8,1,1,-4,27],[0,8,1,1,-3,55],[0,8,1,1,-2,108],[0,8,1,1,-1,225],[0,8,1,1,0,486],[0,8,1,1,1,761],[0,8,1,1,2,862],[0,8,1,1,3,945],[0,8,1,1,4,967],[0,8,1,1,5,984],[0,8,1,1,6,991],[0,8,1,1,7,997],[0,8,1,1,8,999],[0,8,1,2,-8,4],[0,8,1,2,-7,0],[0,8,1,2,-6,7],[0,8,1,2,-5,10],[0,8,1,2,-4,24],[0,8,1,2,-3,62],[0,8,1,2,-2,136],[0,8,1,2,-1,274],[0,8,1,2,0,533],[0,8,1,2,1,787],[0,8,1,2,2,888],[0,8,1,2,3,945],[0,8,1,2,4,977],[0,8,1,2,5,988],[0,8,1,2,6,993],[0,8,1,2,7,998],[0,8,1,2,8,998],[0,8,1,3,-8,1],[0,8,1,3,-7,2],[0,8,1,3,-6,11],[0,8,1,3,-5,25],[0,8,1,3,-4,46],[0,8,1,3,-3,100],[0,8,1,3,-2,179],[0,8,1,3,-1,308],[0,8,1,3,0,566],[0,8,1,3,1,784],[0,8,1,3,2,883],[0,8,1,3,3,940],[0,8,1,3,4,972],[0,8,1,3,5,992],[0,8,1,3,6,997],[0,8,1,3,7,996],[0,8,1,3,8,998],[0,8,1,4,-8,0],[0,8,1,4,-7,0],[0,8,1,4,-6,7],[0,8,1,4,-5,8],[0,8,1,4,-4,14],[0,8,1,4,-3,57],[0,8,1,4,-2,153],[0,8,1,4,-1,338],[0,8,1,4,0,625],[0,8,1,4,1,802],[0,8,1,4,2,903],[0,8,1,4,3,955],[0,8,1,4,4,971],[0,8,1,4,5,990],[0,8,1,4,6,988],[0,8,1,4,7,994],[0,8,1,4,8,1000],[0,8,1,5,-8,7],[0,8,1,5,-7,7],[0,8,1,5,-6,0],[0,8,1,5,-5,22],[0,8,1,5,-4,49],[0,8,1,5,-3,107],[0,8,1,5,-2,198],[0,8,1,5,-1,388],[0,8,1,5,0,641],[0,8,1,5,1,829],[0,8,1,5,2,922],[0,8,1,5,3,950],[0,8,1,5,4,980],[0,8,1,5,5,988],[0,8,1,5,6,997],[0,8,1,5,7,995],[0,8,1,5,8,1000],[0,8,1,6,-8,5],[0,8,1,6,-7,0],[0,8,1,6,-6,19],[0,8,1,6,-5,33],[0,8,1,6,-4,73],[0,8,1,6,-3,124],[0,8,1,6,-2,246],[0,8,1,6,-1,460],[0,8,1,6,0,688],[0,8,1,6,1,827],[0,8,1,6,2,926],[0,8,1,6,3,964],[0,8,1,6,4,983],[0,8,1,6,5,997],[0,8,1,6,6,996],[0,8,1,6,7,1000],[0,8,1,6,8,1000],[0,8,1,7,-8,5],[0,8,1,7,-7,0],[0,8,1,7,-6,22],[0,8,1,7,-5,55],[0,8,1,7,-4,112],[0,8,1,7,-3,192],[0,8,1,7,-2,292],[0,8,1,7,-1,447],[0,8,1,7,0,698],[0,8,1,7,1,834],[0,8,1,7,2,921],[0,8,1,7,3,962],[0,8,1,7,4,974],[0,8,1,7,5,995],[0,8,1,7,6,1000],[0,8,1,7,7,994],[0,8,1,7,8,1000],[0,8,2,0,-8,0],[0,8,2,0,-7,0],[0,8,2,0,-6,3],[0,8,2,0,-5,5],[0,8,2,0,-4,10],[0,8,2,0,-3,22],[0,8,2,0,-2,55],[0,8,2,0,-1,129],[0,8,2,0,0,389],[0,8,2,0,1,717],[0,8,2,0,2,857],[0,8,2,0,3,927],[0,8,2,0,4,966],[0,8,2,0,5,979],[0,8,2,0,6,993],[0,8,2,0,7,994],[0,8,2,0,8,999],[0,8,2,1,-8,0],[0,8,2,1,-7,1],[0,8,2,1,-6,4],[0,8,2,1,-5,5],[0,8,2,1,-4,15],[0,8,2,1,-3,28],[0,8,2,1,-2,73],[0,8,2,1,-1,164],[0,8,2,1,0,413],[0,8,2,1,1,737],[0,8,2,1,2,854],[0,8,2,1,3,930],[0,8,2,1,4,963],[0,8,2,1,5,982],[0,8,2,1,6,992],[0,8,2,1,7,998],[0,8,2,1,8,1000],[0,8,2,2,-8,0],[0,8,2,2,-7,0],[0,8,2,2,-6,4],[0,8,2,2,-5,7],[0,8,2,2,-4,16],[0,8,2,2,-3,40],[0,8,2,2,-2,82],[0,8,2,2,-1,198],[0,8,2,2,0,454],[0,8,2,2,1,754],[0,8,2,2,2,861],[0,8,2,2,3,937],[0,8,2,2,4,971],[0,8,2,2,5,986],[0,8,2,2,6,989],[0,8,2,2,7,999],[0,8,2,2,8,999],[0,8,2,3,-8,0],[0,8,2,3,-7,0],[0,8,2,3,-6,5],[0,8,2,3,-5,11],[0,8,2,3,-4,26],[0,8,2,3,-3,49],[0,8,2,3,-2,105],[0,8,2,3,-1,211],[0,8,2,3,0,459],[0,8,2,3,1,751],[0,8,2,3,2,864],[0,8,2,3,3,930],[0,8,2,3,4,962],[0,8,2,3,5,984],[0,8,2,3,6,994],[0,8,2,3,7,1000],[0,8,2,3,8,999],[0,8,2,4,-8,0],[0,8,2,4,-7,0],[0,8,2,4,-6,4],[0,8,2,4,-5,0],[0,8,2,4,-4,17],[0,8,2,4,-3,29],[0,8,2,4,-2,82],[0,8,2,4,-1,185],[0,8,2,4,0,472],[0,8,2,4,1,763],[0,8,2,4,2,869],[0,8,2,4,3,939],[0,8,2,4,4,970],[0,8,2,4,5,987],[0,8,2,4,6,995],[0,8,2,4,7,997],[0,8,2,4,8,998],[0,8,2,5,-8,0],[0,8,2,5,-7,0],[0,8,2,5,-6,0],[0,8,2,5,-5,9],[0,8,2,5,-4,24],[0,8,2,5,-3,45],[0,8,2,5,-2,114],[0,8,2,5,-1,234],[0,8,2,5,0,487],[0,8,2,5,1,767],[0,8,2,5,2,883],[0,8,2,5,3,931],[0,8,2,5,4,968],[0,8,2,5,5,975],[0,8,2,5,6,996],[0,8,2,5,7,1000],[0,8,2,5,8,1000],[0,8,2,6,-8,0],[0,8,2,6,-7,0],[0,8,2,6,-6,5],[0,8,2,6,-5,4],[0,8,2,6,-4,37],[0,8,2,6,-3,70],[0,8,2,6,-2,130],[0,8,2,6,-1,260],[0,8,2,6,0,523],[0,8,2,6,1,757],[0,8,2,6,2,886],[0,8,2,6,3,945],[0,8,2,6,4,977],[0,8,2,6,5,988],[0,8,2,6,6,997],[0,8,2,6,7,991],[0,8,2,6,8,1000],[0,8,2,7,-8,0],[0,8,2,7,-7,0],[0,8,2,7,-6,5],[0,8,2,7,-5,18],[0,8,2,7,-4,43],[0,8,2,7,-3,93],[0,8,2,7,-2,156],[0,8,2,7,-1,276],[0,8,2,7,0,547],[0,8,2,7,1,779],[0,8,2,7,2,891],[0,8,2,7,3,942],[0,8,2,7,4,969],[0,8,2,7,5,975],[0,8,2,7,6,990],[0,8,2,7,7,1000],[0,8,2,7,8,1000],[0,9,0,0,-8,0],[0,9,0,0,-7,0],[0,9,0,0,-6,2],[0,9,0,0,-5,3],[0,9,0,0,-4,10],[0,9,0,0,-3,22],[0,9,0,0,-2,56],[0,9,0,0,-1,132],[0,9,0,0,0,475],[0,9,0,0,1,853],[0,9,0,0,2,934],[0,9,0,0,3,972],[0,9,0,0,4,988],[0,9,0,0,5,994],[0,9,0,0,6,998],[0,9,0,0,7,999],[0,9,0,0,8,1000],[0,9,0,1,-8,1],[0,9,0,1,-7,1],[0,9,0,1,-6,7],[0,9,0,1,-5,9],[0,9,0,1,-4,25],[0,9,0,1,-3,51],[0,9,0,1,-2,121],[0,9,0,1,-1,244],[0,9,0,1,0,561],[0,9,0,1,1,872],[0,9,0,1,2,942],[0,9,0,1,3,974],[0,9,0,1,4,992],[0,9,0,1,5,993],[0,9,0,1,6,998],[0,9,0,1,7,1000],[0,9,0,1,8,1000],[0,9,0,2,-8,0],[0,9,0,2,-7,0],[0,9,0,2,-6,3],[0,9,0,2,-5,7],[0,9,0,2,-4,22],[0,9,0,2,-3,65],[0,9,0,2,-2,141],[0,9,0,2,-1,320],[0,9,0,2,0,668],[0,9,0,2,1,898],[0,9,0,2,2,959],[0,9,0,2,3,984],[0,9,0,2,4,995],[0,9,0,2,5,995],[0,9,0,2,6,998],[0,9,0,2,7,1000],[0,9,0,2,8,1000],[0,9,0,3,-8,2],[0,9,0,3,-7,3],[0,9,0,3,-6,22],[0,9,0,3,-5,28],[0,9,0,3,-4,60],[0,9,0,3,-3,114],[0,9,0,3,-2,231],[0,9,0,3,-1,429],[0,9,0,3,0,689],[0,9,0,3,1,908],[0,9,0,3,2,957],[0,9,0,3,3,981],[0,9,0,3,4,995],[0,9,0,3,5,993],[0,9,0,3,6,997],[0,9,0,3,7,1000],[0,9,0,3,8,1000],[0,9,0,4,-8,0],[0,9,0,4,-7,0],[0,9,0,4,-6,0],[0,9,0,4,-5,12],[0,9,0,4,-4,8],[0,9,0,4,-3,54],[0,9,0,4,-2,118],[0,9,0,4,-1,378],[0,9,0,4,0,757],[0,9,0,4,1,926],[0,9,0,4,2,970],[0,9,0,4,3,986],[0,9,0,4,4,984],[0,9,0,4,5,1000],[0,9,0,4,6,990],[0,9,0,4,7,1000],[0,9,0,4,8,1000],[0,9,0,5,-8,6],[0,9,0,5,-7,11],[0,9,0,5,-6,0],[0,9,0,5,-5,30],[0,9,0,5,-4,92],[0,9,0,5,-3,95],[0,9,0,5,-2,214],[0,9,0,5,-1,514],[0,9,0,5,0,798],[0,9,0,5,1,911],[0,9,0,5,2,969],[0,9,0,5,3,982],[0,9,0,5,4,996],[0,9,0,5,5,995],[0,9,0,5,6,1000],[0,9,0,5,7,1000],[0,9,0,5,8,1000],[0,9,0,6,-8,0],[0,9,0,6,-7,0],[0,9,0,6,-6,12],[0,9,0,6,-5,9],[0,9,0,6,-4,35],[0,9,0,6,-3,99],[0,9,0,6,-2,271],[0,9,0,6,-1,583],[0,9,0,6,0,760],[0,9,0,6,1,934],[0,9,0,6,2,958],[0,9,0,6,3,980],[0,9,0,6,4,1000],[0,9,0,6,5,992],[0,9,0,6,6,1000],[0,9,0,6,7,1000],[0,9,0,6,8,1000],[0,9,0,7,-8,8],[0,9,0,7,-7,26],[0,9,0,7,-6,48],[0,9,0,7,-5,40],[0,9,0,7,-4,148],[0,9,0,7,-3,229],[0,9,0,7,-2,355],[0,9,0,7,-1,624],[0,9,0,7,0,810],[0,9,0,7,1,957],[0,9,0,7,2,981],[0,9,0,7,3,992],[0,9,0,7,4,995],[0,9,0,7,5,1000],[0,9,0,7,6,1000],[0,9,0,7,7,1000],[0,9,0,7,8,1000],[0,9,1,0,-8,0],[0,9,1,0,-7,0],[0,9,1,0,-6,1],[0,9,1,0,-5,1],[0,9,1,0,-4,3],[0,9,1,0,-3,8],[0,9,1,0,-2,24],[0,9,1,0,-1,72],[0,9,1,0,0,416],[0,9,1,0,1,838],[0,9,1,0,2,929],[0,9,1,0,3,971],[0,9,1,0,4,986],[0,9,1,0,5,994],[0,9,1,0,6,998],[0,9,1,0,7,998],[0,9,1,0,8,1000],[0,9,1,1,-8,0],[0,9,1,1,-7,0],[0,9,1,1,-6,1],[0,9,1,1,-5,2],[0,9,1,1,-4,11],[0,9,1,1,-3,25],[0,9,1,1,-2,66],[0,9,1,1,-1,146],[0,9,1,1,0,479],[0,9,1,1,1,845],[0,9,1,1,2,940],[0,9,1,1,3,969],[0,9,1,1,4,991],[0,9,1,1,5,990],[0,9,1,1,6,998],[0,9,1,1,7,999],[0,9,1,1,8,1000],[0,9,1,2,-8,0],[0,9,1,2,-7,0],[0,9,1,2,-6,2],[0,9,1,2,-5,2],[0,9,1,2,-4,8],[0,9,1,2,-3,22],[0,9,1,2,-2,79],[0,9,1,2,-1,191],[0,9,1,2,0,558],[0,9,1,2,1,866],[0,9,1,2,2,939],[0,9,1,2,3,978],[0,9,1,2,4,987],[0,9,1,2,5,990],[0,9,1,2,6,998],[0,9,1,2,7,1000],[0,9,1,2,8,1000],[0,9,1,3,-8,0],[0,9,1,3,-7,0],[0,9,1,3,-6,3],[0,9,1,3,-5,8],[0,9,1,3,-4,33],[0,9,1,3,-3,62],[0,9,1,3,-2,145],[0,9,1,3,-1,279],[0,9,1,3,0,582],[0,9,1,3,1,879],[0,9,1,3,2,938],[0,9,1,3,3,973],[0,9,1,3,4,994],[0,9,1,3,5,987],[0,9,1,3,6,999],[0,9,1,3,7,1000],[0,9,1,3,8,1000],[0,9,1,4,-8,0],[0,9,1,4,-7,0],[0,9,1,4,-6,0],[0,9,1,4,-5,4],[0,9,1,4,-4,3],[0,9,1,4,-3,37],[0,9,1,4,-2,78],[0,9,1,4,-1,274],[0,9,1,4,0,652],[0,9,1,4,1,901],[0,9,1,4,2,954],[0,9,1,4,3,984],[0,9,1,4,4,989],[0,9,1,4,5,995],[0,9,1,4,6,990],[0,9,1,4,7,1000],[0,9,1,4,8,1000],[0,9,1,5,-8,0],[0,9,1,5,-7,0],[0,9,1,5,-6,0],[0,9,1,5,-5,6],[0,9,1,5,-4,22],[0,9,1,5,-3,62],[0,9,1,5,-2,148],[0,9,1,5,-1,340],[0,9,1,5,0,689],[0,9,1,5,1,897],[0,9,1,5,2,959],[0,9,1,5,3,983],[0,9,1,5,4,996],[0,9,1,5,5,996],[0,9,1,5,6,1000],[0,9,1,5,7,1000],[0,9,1,5,8,1000],[0,9,1,6,-8,0],[0,9,1,6,-7,0],[0,9,1,6,-6,5],[0,9,1,6,-5,4],[0,9,1,6,-4,26],[0,9,1,6,-3,74],[0,9,1,6,-2,170],[0,9,1,6,-1,454],[0,9,1,6,0,697],[0,9,1,6,1,906],[0,9,1,6,2,965],[0,9,1,6,3,986],[0,9,1,6,4,992],[0,9,1,6,5,992],[0,9,1,6,6,1000],[0,9,1,6,7,1000],[0,9,1,6,8,1000],[0,9,1,7,-8,0],[0,9,1,7,-7,0],[0,9,1,7,-6,10],[0,9,1,7,-5,26],[0,9,1,7,-4,90],[0,9,1,7,-3,158],[0,9,1,7,-2,267],[0,9,1,7,-1,467],[0,9,1,7,0,717],[0,9,1,7,1,912],[0,9,1,7,2,952],[0,9,1,7,3,983],[0,9,1,7,4,993],[0,9,1,7,5,995],[0,9,1,7,6,1000],[0,9,1,7,7,1000],[0,9,1,7,8,1000],[0,9,2,0,-8,0],[0,9,2,0,-7,0],[0,9,2,0,-6,0],[0,9,2,0,-5,0],[0,9,2,0,-4,0],[0,9,2,0,-3,2],[0,9,2,0,-2,7],[0,9,2,0,-1,27],[0,9,2,0,0,369],[0,9,2,0,1,832],[0,9,2,0,2,921],[0,9,2,0,3,971],[0,9,2,0,4,984],[0,9,2,0,5,994],[0,9,2,0,6,996],[0,9,2,0,7,999],[0,9,2,0,8,1000],[0,9,2,1,-8,0],[0,9,2,1,-7,0],[0,9,2,1,-6,0],[0,9,2,1,-5,0],[0,9,2,1,-4,1],[0,9,2,1,-3,7],[0,9,2,1,-2,26],[0,9,2,1,-1,61],[0,9,2,1,0,399],[0,9,2,1,1,831],[0,9,2,1,2,928],[0,9,2,1,3,968],[0,9,2,1,4,986],[0,9,2,1,5,993],[0,9,2,1,6,998],[0,9,2,1,7,999],[0,9,2,1,8,1000],[0,9,2,2,-8,0],[0,9,2,2,-7,0],[0,9,2,2,-6,1],[0,9,2,2,-5,1],[0,9,2,2,-4,1],[0,9,2,2,-3,10],[0,9,2,2,-2,26],[0,9,2,2,-1,89],[0,9,2,2,0,457],[0,9,2,2,1,834],[0,9,2,2,2,931],[0,9,2,2,3,965],[0,9,2,2,4,987],[0,9,2,2,5,991],[0,9,2,2,6,997],[0,9,2,2,7,997],[0,9,2,2,8,1000],[0,9,2,3,-8,0],[0,9,2,3,-7,0],[0,9,2,3,-6,1],[0,9,2,3,-5,1],[0,9,2,3,-4,8],[0,9,2,3,-3,23],[0,9,2,3,-2,57],[0,9,2,3,-1,131],[0,9,2,3,0,464],[0,9,2,3,1,844],[0,9,2,3,2,940],[0,9,2,3,3,963],[0,9,2,3,4,991],[0,9,2,3,5,992],[0,9,2,3,6,999],[0,9,2,3,7,1000],[0,9,2,3,8,1000],[0,9,2,4,-8,0],[0,9,2,4,-7,0],[0,9,2,4,-6,0],[0,9,2,4,-5,0],[0,9,2,4,-4,2],[0,9,2,4,-3,9],[0,9,2,4,-2,23],[0,9,2,4,-1,102],[0,9,2,4,0,455],[0,9,2,4,1,847],[0,9,2,4,2,923],[0,9,2,4,3,971],[0,9,2,4,4,984],[0,9,2,4,5,995],[0,9,2,4,6,992],[0,9,2,4,7,997],[0,9,2,4,8,1000],[0,9,2,5,-8,0],[0,9,2,5,-7,0],[0,9,2,5,-6,0],[0,9,2,5,-5,4],[0,9,2,5,-4,0],[0,9,2,5,-3,30],[0,9,2,5,-2,69],[0,9,2,5,-1,150],[0,9,2,5,0,487],[0,9,2,5,1,848],[0,9,2,5,2,935],[0,9,2,5,3,970],[0,9,2,5,4,986],[0,9,2,5,5,991],[0,9,2,5,6,996],[0,9,2,5,7,1000],[0,9,2,5,8,1000],[0,9,2,6,-8,0],[0,9,2,6,-7,0],[0,9,2,6,-6,0],[0,9,2,6,-5,0],[0,9,2,6,-4,0],[0,9,2,6,-3,21],[0,9,2,6,-2,92],[0,9,2,6,-1,196],[0,9,2,6,0,489],[0,9,2,6,1,855],[0,9,2,6,2,943],[0,9,2,6,3,970],[0,9,2,6,4,989],[0,9,2,6,5,984],[0,9,2,6,6,1000],[0,9,2,6,7,1000],[0,9,2,6,8,1000],[0,9,2,7,-8,0],[0,9,2,7,-7,0],[0,9,2,7,-6,0],[0,9,2,7,-5,3],[0,9,2,7,-4,27],[0,9,2,7,-3,47],[0,9,2,7,-2,124],[0,9,2,7,-1,228],[0,9,2,7,0,520],[0,9,2,7,1,846],[0,9,2,7,2,935],[0,9,2,7,3,973],[0,9,2,7,4,986],[0,9,2,7,5,994],[0,9,2,7,6,997],[0,9,2,7,7,1000],[0,9,2,7,8,1000],[1,1,0,0,-8,38],[1,1,0,0,-7,39],[1,1,0,0,-6,98],[1,1,0,0,-5,146],[1,1,0,0,-4,192],[1,1,0,0,-3,291],[1,1,0,0,-2,382],[1,1,0,0,-1,483],[1,1,0,0,0,594],[1,1,0,0,1,703],[1,1,0,0,2,773],[1,1,0,0,3,832],[1,1,0,0,4,911],[1,1,0,0,5,970],[1,1,0,1,-8,0],[1,1,0,1,-7,44],[1,1,0,1,-6,78],[1,1,0,1,-5,169],[1,1,0,1,-4,244],[1,1,0,1,-3,336],[1,1,0,1,-2,435],[1,1,0,1,-1,531],[1,1,0,1,0,634],[1,1,0,1,1,728],[1,1,0,1,2,806],[1,1,0,1,3,860],[1,1,0,1,4,903],[1,1,0,1,5,935],[1,1,0,2,-5,129],[1,1,0,2,-4,229],[1,1,0,2,-3,375],[1,1,0,2,-2,459],[1,1,0,2,-1,562],[1,1,0,2,0,654],[1,1,0,2,1,754],[1,1,0,2,2,817],[1,1,0,2,3,877],[1,1,0,2,4,886],[1,1,0,3,-6,121],[1,1,0,3,-5,206],[1,1,0,3,-4,319],[1,1,0,3,-3,417],[1,1,0,3,-2,526],[1,1,0,3,-1,605],[1,1,0,3,0,697],[1,1,0,3,1,772],[1,1,0,3,2,816],[1,1,0,3,3,853],[1,1,0,3,4,953],[1,1,0,4,-4,278],[1,1,0,4,-3,343],[1,1,0,4,-2,448],[1,1,0,4,-1,543],[1,1,0,4,0,676],[1,1,0,4,1,754],[1,1,0,4,2,892],[1,1,0,4,3,829],[1,1,0,5,-4,221],[1,1,0,5,-3,358],[1,1,0,5,-2,487],[1,1,0,5,-1,612],[1,1,0,5,0,717],[1,1,0,5,1,793],[1,1,0,5,2,870],[1,1,0,5,3,898],[1,1,0,5,4,972],[1,1,0,6,-4,432],[1,1,0,6,-3,450],[1,1,0,6,-2,517],[1,1,0,6,-1,658],[1,1,0,6,0,734],[1,1,0,6,1,811],[1,1,0,6,2,846],[1,1,0,6,3,943],[1,1,0,7,-4,459],[1,1,0,7,-3,482],[1,1,0,7,-2,559],[1,1,0,7,-1,683],[1,1,0,7,0,750],[1,1,0,7,1,821],[1,1,0,7,2,875],[1,1,0,7,3,878],[1,1,0,7,4,900],[1,1,1,0,-8,50],[1,1,1,0,-7,42],[1,1,1,0,-6,86],[1,1,1,0,-5,137],[1,1,1,0,-4,166],[1,1,1,0,-3,262],[1,1,1,0,-2,348],[1,1,1,0,-1,451],[1,1,1,0,0,567],[1,1,1,0,1,682],[1,1,1,0,2,767],[1,1,1,0,3,844],[1,1,1,0,4,899],[1,1,1,0,5,931],[1,1,1,0,6,931],[1,1,1,1,-8,61],[1,1,1,1,-7,48],[1,1,1,1,-6,63],[1,1,1,1,-5,149],[1,1,1,1,-4,197],[1,1,1,1,-3,295],[1,1,1,1,-2,389],[1,1,1,1,-1,487],[1,1,1,1,0,599],[1,1,1,1,1,701],[1,1,1,1,2,783],[1,1,1,1,3,848],[1,1,1,1,4,911],[1,1,1,1,5,924],[1,1,1,1,6,971],[1,1,1,2,-6,132],[1,1,1,2,-5,208],[1,1,1,2,-4,212],[1,1,1,2,-3,325],[1,1,1,2,-2,415],[1,1,1,2,-1,496],[1,1,1,2,0,612],[1,1,1,2,1,712],[1,1,1,2,2,777],[1,1,1,2,3,835],[1,1,1,2,4,890],[1,1,1,2,5,929],[1,1,1,2,6,951],[1,1,1,3,-6,21],[1,1,1,3,-5,153],[1,1,1,3,-4,258],[1,1,1,3,-3,317],[1,1,1,3,-2,450],[1,1,1,3,-1,513],[1,1,1,3,0,636],[1,1,1,3,1,719],[1,1,1,3,2,794],[1,1,1,3,3,877],[1,1,1,3,4,880],[1,1,1,3,5,946],[1,1,1,4,-5,188],[1,1,1,4,-4,174],[1,1,1,4,-3,288],[1,1,1,4,-2,443],[1,1,1,4,-1,541],[1,1,1,4,0,639],[1,1,1,4,1,739],[1,1,1,4,2,821],[1,1,1,4,3,856],[1,1,1,4,4,901],[1,1,1,4,5,957],[1,1,1,5,-5,208],[1,1,1,5,-4,193],[1,1,1,5,-3,324],[1,1,1,5,-2,467],[1,1,1,5,-1,556],[1,1,1,5,0,668],[1,1,1,5,1,745],[1,1,1,5,2,821],[1,1,1,5,3,876],[1,1,1,5,4,912],[1,1,1,5,5,918],[1,1,1,6,-5,323],[1,1,1,6,-4,293],[1,1,1,6,-3,392],[1,1,1,6,-2,497],[1,1,1,6,-1,583],[1,1,1,6,0,692],[1,1,1,6,1,768],[1,1,1,6,2,822],[1,1,1,6,3,863],[1,1,1,6,4,913],[1,1,1,6,5,977],[1,1,1,7,-5,91],[1,1,1,7,-4,283],[1,1,1,7,-3,431],[1,1,1,7,-2,481],[1,1,1,7,-1,607],[1,1,1,7,0,698],[1,1,1,7,1,770],[1,1,1,7,2,850],[1,1,1,7,3,876],[1,1,1,7,4,972],[1,1,1,7,5,921],[1,1,2,0,-8,21],[1,1,2,0,-7,18],[1,1,2,0,-6,73],[1,1,2,0,-5,118],[1,1,2,0,-4,148],[1,1,2,0,-3,239],[1,1,2,0,-2,324],[1,1,2,0,-1,431],[1,1,2,0,0,547],[1,1,2,0,1,659],[1,1,2,0,2,759],[1,1,2,0,3,837],[1,1,2,0,4,876],[1,1,2,0,5,935],[1,1,2,0,6,935],[1,1,2,0,7,980],[1,1,2,0,8,979],[1,1,2,1,-7,29],[1,1,2,1,-6,69],[1,1,2,1,-5,94],[1,1,2,1,-4,159],[1,1,2,1,-3,241],[1,1,2,1,-2,326],[1,1,2,1,-1,442],[1,1,2,1,0,565],[1,1,2,1,1,665],[1,1,2,1,2,775],[1,1,2,1,3,834],[1,1,2,1,4,886],[1,1,2,1,5,939],[1,1,2,1,6,947],[1,1,2,1,7,938],[1,1,2,1,8,973],[1,1,2,2,-6,77],[1,1,2,2,-5,258],[1,1,2,2,-4,151],[1,1,2,2,-3,261],[1,1,2,2,-2,368],[1,1,2,2,-1,462],[1,1,2,2,0,577],[1,1,2,2,1,677],[1,1,2,2,2,764],[1,1,2,2,3,828],[1,1,2,2,4,904],[1,1,2,2,5,911],[1,1,2,2,6,934],[1,1,2,2,7,1000],[1,1,2,3,-6,53],[1,1,2,3,-5,164],[1,1,2,3,-4,186],[1,1,2,3,-3,250],[1,1,2,3,-2,372],[1,1,2,3,-1,465],[1,1,2,3,0,585],[1,1,2,3,1,679],[1,1,2,3,2,782],[1,1,2,3,3,852],[1,1,2,3,4,899],[1,1,2,3,5,938],[1,1,2,3,6,957],[1,1,2,3,7,1000],[1,1,2,3,8,967],[1,1,2,4,-5,132],[1,1,2,4,-4,200],[1,1,2,4,-3,326],[1,1,2,4,-2,373],[1,1,2,4,-1,465],[1,1,2,4,0,578],[1,1,2,4,1,694],[1,1,2,4,2,755],[1,1,2,4,3,831],[1,1,2,4,4,908],[1,1,2,4,5,878],[1,1,2,4,6,950],[1,1,2,5,-5,130],[1,1,2,5,-4,136],[1,1,2,5,-3,242],[1,1,2,5,-2,365],[1,1,2,5,-1,473],[1,1,2,5,0,601],[1,1,2,5,1,702],[1,1,2,5,2,773],[1,1,2,5,3,839],[1,1,2,5,4,885],[1,1,2,5,5,881],[1,1,2,5,6,962],[1,1,2,6,-5,125],[1,1,2,6,-4,174],[1,1,2,6,-3,224],[1,1,2,6,-2,405],[1,1,2,6,-1,485],[1,1,2,6,0,603],[1,1,2,6,1,702],[1,1,2,6,2,789],[1,1,2,6,3,868],[1,1,2,6,4,835],[1,1,2,6,5,955],[1,1,2,7,-5,125],[1,1,2,7,-4,195],[1,1,2,7,-3,286],[1,1,2,7,-2,403],[1,1,2,7,-1,496],[1,1,2,7,0,623],[1,1,2,7,1,712],[1,1,2,7,2,807],[1,1,2,7,3,868],[1,1,2,7,4,918],[1,1,2,7,5,930],[1,2,0,0,-8,39],[1,2,0,0,-7,60],[1,2,0,0,-6,78],[1,2,0,0,-5,154],[1,2,0,0,-4,180],[1,2,0,0,-3,255],[1,2,0,0,-2,344],[1,2,0,0,-1,454],[1,2,0,0,0,581],[1,2,0,0,1,696],[1,2,0,0,2,788],[1,2,0,0,3,857],[1,2,0,0,4,915],[1,2,0,0,5,941],[1,2,0,0,6,969],[1,2,0,0,7,972],[1,2,0,0,8,994],[1,2,0,1,-8,47],[1,2,0,1,-7,82],[1,2,0,1,-6,101],[1,2,0,1,-5,191],[1,2,0,1,-4,226],[1,2,0,1,-3,294],[1,2,0,1,-2,383],[1,2,0,1,-1,493],[1,2,0,1,0,618],[1,2,0,1,1,712],[1,2,0,1,2,813],[1,2,0,1,3,873],[1,2,0,1,4,915],[1,2,0,1,5,940],[1,2,0,1,6,986],[1,2,0,1,7,971],[1,2,0,1,8,1000],[1,2,0,2,-8,83],[1,2,0,2,-6,108],[1,2,0,2,-5,150],[1,2,0,2,-4,201],[1,2,0,2,-3,322],[1,2,0,2,-2,436],[1,2,0,2,-1,532],[1,2,0,2,0,641],[1,2,0,2,1,752],[1,2,0,2,2,817],[1,2,0,2,3,897],[1,2,0,2,4,942],[1,2,0,2,5,953],[1,2,0,2,6,923],[1,2,0,2,8,1000],[1,2,0,3,-8,30],[1,2,0,3,-7,163],[1,2,0,3,-6,118],[1,2,0,3,-5,247],[1,2,0,3,-4,261],[1,2,0,3,-3,352],[1,2,0,3,-2,440],[1,2,0,3,-1,568],[1,2,0,3,0,677],[1,2,0,3,1,771],[1,2,0,3,2,854],[1,2,0,3,3,891],[1,2,0,3,4,947],[1,2,0,3,5,967],[1,2,0,3,6,974],[1,2,0,4,-4,196],[1,2,0,4,-3,340],[1,2,0,4,-2,425],[1,2,0,4,-1,545],[1,2,0,4,0,660],[1,2,0,4,1,809],[1,2,0,4,2,859],[1,2,0,4,3,910],[1,2,0,4,4,962],[1,2,0,4,5,967],[1,2,0,5,-6,133],[1,2,0,5,-5,289],[1,2,0,5,-4,224],[1,2,0,5,-3,393],[1,2,0,5,-2,452],[1,2,0,5,-1,593],[1,2,0,5,0,692],[1,2,0,5,1,785],[1,2,0,5,2,855],[1,2,0,5,3,908],[1,2,0,5,4,954],[1,2,0,5,5,922],[1,2,0,6,-5,206],[1,2,0,6,-4,292],[1,2,0,6,-3,352],[1,2,0,6,-2,471],[1,2,0,6,-1,676],[1,2,0,6,0,714],[1,2,0,6,1,773],[1,2,0,6,2,877],[1,2,0,6,3,927],[1,2,0,6,4,921],[1,2,0,6,5,933],[1,2,0,7,-5,436],[1,2,0,7,-4,394],[1,2,0,7,-3,474],[1,2,0,7,-2,553],[1,2,0,7,-1,640],[1,2,0,7,0,747],[1,2,0,7,1,825],[1,2,0,7,2,883],[1,2,0,7,3,913],[1,2,0,7,4,925],[1,2,0,7,5,946],[1,2,1,0,-8,23],[1,2,1,0,-7,45],[1,2,1,0,-6,66],[1,2,1,0,-5,128],[1,2,1,0,-4,151],[1,2,1,0,-3,229],[1,2,1,0,-2,312],[1,2,1,0,-1,425],[1,2,1,0,0,555],[1,2,1,0,1,681],[1,2,1,0,2,773],[1,2,1,0,3,842],[1,2,1,0,4,910],[1,2,1,0,5,933],[1,2,1,0,6,974],[1,2,1,0,7,965],[1,2,1,0,8,994],[1,2,1,1,-8,52],[1,2,1,1,-7,39],[1,2,1,1,-6,111],[1,2,1,1,-5,156],[1,2,1,1,-4,181],[1,2,1,1,-3,257],[1,2,1,1,-2,350],[1,2,1,1,-1,452],[1,2,1,1,0,584],[1,2,1,1,1,701],[1,2,1,1,2,797],[1,2,1,1,3,860],[1,2,1,1,4,900],[1,2,1,1,5,924],[1,2,1,1,6,972],[1,2,1,1,7,972],[1,2,1,1,8,990],[1,2,1,2,-8,108],[1,2,1,2,-7,133],[1,2,1,2,-6,113],[1,2,1,2,-5,154],[1,2,1,2,-4,224],[1,2,1,2,-3,301],[1,2,1,2,-2,348],[1,2,1,2,-1,474],[1,2,1,2,0,605],[1,2,1,2,1,714],[1,2,1,2,2,804],[1,2,1,2,3,886],[1,2,1,2,4,910],[1,2,1,2,5,902],[1,2,1,2,6,969],[1,2,1,2,7,982],[1,2,1,2,8,1000],[1,2,1,3,-8,19],[1,2,1,3,-7,43],[1,2,1,3,-6,124],[1,2,1,3,-5,183],[1,2,1,3,-4,203],[1,2,1,3,-3,315],[1,2,1,3,-2,378],[1,2,1,3,-1,504],[1,2,1,3,0,619],[1,2,1,3,1,738],[1,2,1,3,2,816],[1,2,1,3,3,865],[1,2,1,3,4,913],[1,2,1,3,5,937],[1,2,1,3,6,940],[1,2,1,3,7,959],[1,2,1,3,8,986],[1,2,1,4,-6,79],[1,2,1,4,-5,77],[1,2,1,4,-4,240],[1,2,1,4,-3,313],[1,2,1,4,-2,414],[1,2,1,4,-1,511],[1,2,1,4,0,628],[1,2,1,4,1,751],[1,2,1,4,2,823],[1,2,1,4,3,877],[1,2,1,4,4,946],[1,2,1,4,5,974],[1,2,1,4,6,1000],[1,2,1,4,8,1000],[1,2,1,5,-6,135],[1,2,1,5,-5,188],[1,2,1,5,-4,277],[1,2,1,5,-3,332],[1,2,1,5,-2,413],[1,2,1,5,-1,522],[1,2,1,5,0,637],[1,2,1,5,1,759],[1,2,1,5,2,818],[1,2,1,5,3,880],[1,2,1,5,4,911],[1,2,1,5,5,926],[1,2,1,5,6,967],[1,2,1,5,7,974],[1,2,1,5,8,971],[1,2,1,6,-5,143],[1,2,1,6,-4,330],[1,2,1,6,-3,362],[1,2,1,6,-2,435],[1,2,1,6,-1,568],[1,2,1,6,0,670],[1,2,1,6,1,762],[1,2,1,6,2,853],[1,2,1,6,3,878],[1,2,1,6,4,936],[1,2,1,6,5,965],[1,2,1,6,6,982],[1,2,1,7,-6,226],[1,2,1,7,-5,242],[1,2,1,7,-4,299],[1,2,1,7,-3,368],[1,2,1,7,-2,454],[1,2,1,7,-1,546],[1,2,1,7,0,680],[1,2,1,7,1,794],[1,2,1,7,2,832],[1,2,1,7,3,909],[1,2,1,7,4,955],[1,2,1,7,5,967],[1,2,1,7,6,965],[1,2,1,7,7,857],[1,2,2,0,-8,12],[1,2,2,0,-7,37],[1,2,2,0,-6,53],[1,2,2,0,-5,112],[1,2,2,0,-4,137],[1,2,2,0,-3,213],[1,2,2,0,-2,294],[1,2,2,0,-1,406],[1,2,2,0,0,536],[1,2,2,0,1,666],[1,2,2,0,2,764],[1,2,2,0,3,834],[1,2,2,0,4,900],[1,2,2,0,5,940],[1,2,2,0,6,966],[1,2,2,0,7,971],[1,2,2,0,8,988],[1,2,2,1,-8,40],[1,2,2,1,-7,43],[1,2,2,1,-6,67],[1,2,2,1,-5,122],[1,2,2,1,-4,160],[1,2,2,1,-3,217],[1,2,2,1,-2,322],[1,2,2,1,-1,414],[1,2,2,1,0,554],[1,2,2,1,1,678],[1,2,2,1,2,772],[1,2,2,1,3,841],[1,2,2,1,4,908],[1,2,2,1,5,926],[1,2,2,1,6,963],[1,2,2,1,7,953],[1,2,2,1,8,985],[1,2,2,2,-8,56],[1,2,2,2,-7,23],[1,2,2,2,-6,103],[1,2,2,2,-5,136],[1,2,2,2,-4,171],[1,2,2,2,-3,248],[1,2,2,2,-2,332],[1,2,2,2,-1,450],[1,2,2,2,0,571],[1,2,2,2,1,687],[1,2,2,2,2,780],[1,2,2,2,3,861],[1,2,2,2,4,906],[1,2,2,2,5,923],[1,2,2,2,6,950],[1,2,2,2,7,987],[1,2,2,2,8,985],[1,2,2,3,-8,14],[1,2,2,3,-7,32],[1,2,2,3,-6,72],[1,2,2,3,-5,121],[1,2,2,3,-4,160],[1,2,2,3,-3,262],[1,2,2,3,-2,332],[1,2,2,3,-1,457],[1,2,2,3,0,581],[1,2,2,3,1,697],[1,2,2,3,2,791],[1,2,2,3,3,842],[1,2,2,3,4,918],[1,2,2,3,5,921],[1,2,2,3,6,957],[1,2,2,3,7,969],[1,2,2,3,8,985],[1,2,2,4,-6,123],[1,2,2,4,-5,126],[1,2,2,4,-4,203],[1,2,2,4,-3,226],[1,2,2,4,-2,319],[1,2,2,4,-1,447],[1,2,2,4,0,571],[1,2,2,4,1,685],[1,2,2,4,2,791],[1,2,2,4,3,879],[1,2,2,4,4,906],[1,2,2,4,5,932],[1,2,2,4,6,952],[1,2,2,4,7,969],[1,2,2,4,8,1000],[1,2,2,5,-6,83],[1,2,2,5,-5,172],[1,2,2,5,-4,219],[1,2,2,5,-3,255],[1,2,2,5,-2,381],[1,2,2,5,-1,449],[1,2,2,5,0,572],[1,2,2,5,1,701],[1,2,2,5,2,807],[1,2,2,5,3,863],[1,2,2,5,4,897],[1,2,2,5,5,952],[1,2,2,5,6,957],[1,2,2,5,7,971],[1,2,2,5,8,971],[1,2,2,6,-6,125],[1,2,2,6,-5,127],[1,2,2,6,-4,134],[1,2,2,6,-3,292],[1,2,2,6,-2,347],[1,2,2,6,-1,482],[1,2,2,6,0,600],[1,2,2,6,1,702],[1,2,2,6,2,820],[1,2,2,6,3,863],[1,2,2,6,4,937],[1,2,2,6,5,942],[1,2,2,6,6,949],[1,2,2,6,7,956],[1,2,2,6,8,1000],[1,2,2,7,-6,86],[1,2,2,7,-5,254],[1,2,2,7,-4,224],[1,2,2,7,-3,275],[1,2,2,7,-2,377],[1,2,2,7,-1,480],[1,2,2,7,0,612],[1,2,2,7,1,713],[1,2,2,7,2,816],[1,2,2,7,3,873],[1,2,2,7,4,923],[1,2,2,7,5,928],[1,2,2,7,6,982],[1,2,2,7,7,965],[1,2,2,7,8,981],[1,3,0,0,-8,24],[1,3,0,0,-7,49],[1,3,0,0,-6,77],[1,3,0,0,-5,120],[1,3,0,0,-4,165],[1,3,0,0,-3,245],[1,3,0,0,-2,339],[1,3,0,0,-1,455],[1,3,0,0,0,582],[1,3,0,0,1,711],[1,3,0,0,2,808],[1,3,0,0,3,869],[1,3,0,0,4,923],[1,3,0,0,5,945],[1,3,0,0,6,969],[1,3,0,0,7,983],[1,3,0,0,8,992],[1,3,0,1,-8,54],[1,3,0,1,-7,74],[1,3,0,1,-6,108],[1,3,0,1,-5,171],[1,3,0,1,-4,210],[1,3,0,1,-3,295],[1,3,0,1,-2,389],[1,3,0,1,-1,509],[1,3,0,1,0,632],[1,3,0,1,1,748],[1,3,0,1,2,834],[1,3,0,1,3,882],[1,3,0,1,4,937],[1,3,0,1,5,954],[1,3,0,1,6,969],[1,3,0,1,7,1000],[1,3,0,1,8,988],[1,3,0,2,-8,86],[1,3,0,2,-7,67],[1,3,0,2,-6,99],[1,3,0,2,-5,216],[1,3,0,2,-4,227],[1,3,0,2,-3,321],[1,3,0,2,-2,423],[1,3,0,2,-1,545],[1,3,0,2,0,660],[1,3,0,2,1,768],[1,3,0,2,2,855],[1,3,0,2,3,901],[1,3,0,2,4,934],[1,3,0,2,5,959],[1,3,0,2,6,950],[1,3,0,2,7,984],[1,3,0,2,8,982],[1,3,0,3,-8,40],[1,3,0,3,-7,104],[1,3,0,3,-6,125],[1,3,0,3,-5,229],[1,3,0,3,-4,256],[1,3,0,3,-3,369],[1,3,0,3,-2,459],[1,3,0,3,-1,592],[1,3,0,3,0,697],[1,3,0,3,1,791],[1,3,0,3,2,865],[1,3,0,3,3,892],[1,3,0,3,4,937],[1,3,0,3,5,987],[1,3,0,3,6,992],[1,3,0,3,7,960],[1,3,0,3,8,983],[1,3,0,4,-5,267],[1,3,0,4,-4,281],[1,3,0,4,-3,368],[1,3,0,4,-2,405],[1,3,0,4,-1,552],[1,3,0,4,0,704],[1,3,0,4,1,767],[1,3,0,4,2,882],[1,3,0,4,3,914],[1,3,0,4,4,932],[1,3,0,4,5,983],[1,3,0,4,6,973],[1,3,0,5,-6,167],[1,3,0,5,-5,276],[1,3,0,5,-4,242],[1,3,0,5,-3,373],[1,3,0,5,-2,521],[1,3,0,5,-1,609],[1,3,0,5,0,760],[1,3,0,5,1,821],[1,3,0,5,2,874],[1,3,0,5,3,938],[1,3,0,5,4,954],[1,3,0,5,5,968],[1,3,0,5,6,953],[1,3,0,6,-5,167],[1,3,0,6,-4,281],[1,3,0,6,-3,364],[1,3,0,6,-2,570],[1,3,0,6,-1,658],[1,3,0,6,0,762],[1,3,0,6,1,852],[1,3,0,6,2,891],[1,3,0,6,3,921],[1,3,0,6,4,947],[1,3,0,6,5,985],[1,3,0,6,6,972],[1,3,0,7,-5,240],[1,3,0,7,-4,381],[1,3,0,7,-3,439],[1,3,0,7,-2,595],[1,3,0,7,-1,666],[1,3,0,7,0,789],[1,3,0,7,1,835],[1,3,0,7,2,909],[1,3,0,7,3,922],[1,3,0,7,4,964],[1,3,0,7,5,988],[1,3,0,7,6,1000],[1,3,1,0,-8,15],[1,3,1,0,-7,40],[1,3,1,0,-6,63],[1,3,1,0,-5,92],[1,3,1,0,-4,141],[1,3,1,0,-3,218],[1,3,1,0,-2,311],[1,3,1,0,-1,427],[1,3,1,0,0,556],[1,3,1,0,1,688],[1,3,1,0,2,791],[1,3,1,0,3,860],[1,3,1,0,4,917],[1,3,1,0,5,938],[1,3,1,0,6,964],[1,3,1,0,7,973],[1,3,1,0,8,996],[1,3,1,1,-8,25],[1,3,1,1,-7,60],[1,3,1,1,-6,84],[1,3,1,1,-5,124],[1,3,1,1,-4,174],[1,3,1,1,-3,259],[1,3,1,1,-2,350],[1,3,1,1,-1,461],[1,3,1,1,0,595],[1,3,1,1,1,725],[1,3,1,1,2,810],[1,3,1,1,3,874],[1,3,1,1,4,928],[1,3,1,1,5,947],[1,3,1,1,6,973],[1,3,1,1,7,985],[1,3,1,1,8,993],[1,3,1,2,-8,67],[1,3,1,2,-7,39],[1,3,1,2,-6,90],[1,3,1,2,-5,149],[1,3,1,2,-4,199],[1,3,1,2,-3,268],[1,3,1,2,-2,366],[1,3,1,2,-1,482],[1,3,1,2,0,620],[1,3,1,2,1,727],[1,3,1,2,2,817],[1,3,1,2,3,877],[1,3,1,2,4,927],[1,3,1,2,5,919],[1,3,1,2,6,963],[1,3,1,2,7,981],[1,3,1,2,8,979],[1,3,1,3,-8,20],[1,3,1,3,-7,105],[1,3,1,3,-6,115],[1,3,1,3,-5,186],[1,3,1,3,-4,210],[1,3,1,3,-3,301],[1,3,1,3,-2,414],[1,3,1,3,-1,526],[1,3,1,3,0,650],[1,3,1,3,1,749],[1,3,1,3,2,835],[1,3,1,3,3,888],[1,3,1,3,4,940],[1,3,1,3,5,964],[1,3,1,3,6,979],[1,3,1,3,7,990],[1,3,1,3,8,978],[1,3,1,4,-8,56],[1,3,1,4,-7,54],[1,3,1,4,-6,94],[1,3,1,4,-5,181],[1,3,1,4,-4,236],[1,3,1,4,-3,317],[1,3,1,4,-2,412],[1,3,1,4,-1,524],[1,3,1,4,0,658],[1,3,1,4,1,744],[1,3,1,4,2,844],[1,3,1,4,3,891],[1,3,1,4,4,915],[1,3,1,4,5,961],[1,3,1,4,6,929],[1,3,1,4,7,1000],[1,3,1,4,8,1000],[1,3,1,5,-8,73],[1,3,1,5,-7,25],[1,3,1,5,-6,92],[1,3,1,5,-5,212],[1,3,1,5,-4,251],[1,3,1,5,-3,292],[1,3,1,5,-2,424],[1,3,1,5,-1,572],[1,3,1,5,0,693],[1,3,1,5,1,782],[1,3,1,5,2,855],[1,3,1,5,3,898],[1,3,1,5,4,942],[1,3,1,5,5,947],[1,3,1,5,6,960],[1,3,1,5,7,1000],[1,3,1,5,8,973],[1,3,1,6,-6,153],[1,3,1,6,-5,209],[1,3,1,6,-4,292],[1,3,1,6,-3,355],[1,3,1,6,-2,474],[1,3,1,6,-1,588],[1,3,1,6,0,679],[1,3,1,6,1,793],[1,3,1,6,2,871],[1,3,1,6,3,910],[1,3,1,6,4,923],[1,3,1,6,5,948],[1,3,1,6,6,990],[1,3,1,6,7,985],[1,3,1,6,8,1000],[1,3,1,7,-6,196],[1,3,1,7,-5,196],[1,3,1,7,-4,319],[1,3,1,7,-3,375],[1,3,1,7,-2,477],[1,3,1,7,-1,593],[1,3,1,7,0,704],[1,3,1,7,1,787],[1,3,1,7,2,863],[1,3,1,7,3,900],[1,3,1,7,4,938],[1,3,1,7,5,968],[1,3,1,7,6,974],[1,3,1,7,7,985],[1,3,1,7,8,984],[1,3,2,0,-8,13],[1,3,2,0,-7,34],[1,3,2,0,-6,50],[1,3,2,0,-5,81],[1,3,2,0,-4,129],[1,3,2,0,-3,203],[1,3,2,0,-2,290],[1,3,2,0,-1,409],[1,3,2,0,0,534],[1,3,2,0,1,670],[1,3,2,0,2,780],[1,3,2,0,3,851],[1,3,2,0,4,911],[1,3,2,0,5,934],[1,3,2,0,6,960],[1,3,2,0,7,972],[1,3,2,0,8,997],[1,3,2,1,-8,20],[1,3,2,1,-7,42],[1,3,2,1,-6,57],[1,3,2,1,-5,87],[1,3,2,1,-4,143],[1,3,2,1,-3,221],[1,3,2,1,-2,309],[1,3,2,1,-1,426],[1,3,2,1,0,554],[1,3,2,1,1,679],[1,3,2,1,2,792],[1,3,2,1,3,854],[1,3,2,1,4,914],[1,3,2,1,5,947],[1,3,2,1,6,958],[1,3,2,1,7,981],[1,3,2,1,8,993],[1,3,2,2,-8,19],[1,3,2,2,-7,56],[1,3,2,2,-6,95],[1,3,2,2,-5,121],[1,3,2,2,-4,128],[1,3,2,2,-3,238],[1,3,2,2,-2,314],[1,3,2,2,-1,438],[1,3,2,2,0,572],[1,3,2,2,1,693],[1,3,2,2,2,796],[1,3,2,2,3,860],[1,3,2,2,4,924],[1,3,2,2,5,926],[1,3,2,2,6,971],[1,3,2,2,7,974],[1,3,2,2,8,993],[1,3,2,3,-8,20],[1,3,2,3,-7,45],[1,3,2,3,-6,91],[1,3,2,3,-5,121],[1,3,2,3,-4,175],[1,3,2,3,-3,240],[1,3,2,3,-2,338],[1,3,2,3,-1,469],[1,3,2,3,0,590],[1,3,2,3,1,706],[1,3,2,3,2,806],[1,3,2,3,3,868],[1,3,2,3,4,923],[1,3,2,3,5,942],[1,3,2,3,6,987],[1,3,2,3,7,983],[1,3,2,3,8,985],[1,3,2,4,-8,18],[1,3,2,4,-7,44],[1,3,2,4,-6,59],[1,3,2,4,-5,66],[1,3,2,4,-4,146],[1,3,2,4,-3,248],[1,3,2,4,-2,341],[1,3,2,4,-1,435],[1,3,2,4,0,582],[1,3,2,4,1,677],[1,3,2,4,2,797],[1,3,2,4,3,873],[1,3,2,4,4,897],[1,3,2,4,5,930],[1,3,2,4,6,937],[1,3,2,4,7,966],[1,3,2,4,8,990],[1,3,2,5,-8,0],[1,3,2,5,-7,65],[1,3,2,5,-6,81],[1,3,2,5,-5,79],[1,3,2,5,-4,154],[1,3,2,5,-3,252],[1,3,2,5,-2,325],[1,3,2,5,-1,457],[1,3,2,5,0,601],[1,3,2,5,1,705],[1,3,2,5,2,818],[1,3,2,5,3,880],[1,3,2,5,4,926],[1,3,2,5,5,949],[1,3,2,5,6,991],[1,3,2,5,7,967],[1,3,2,5,8,977],[1,3,2,6,-8,0],[1,3,2,6,-7,67],[1,3,2,6,-6,91],[1,3,2,6,-5,194],[1,3,2,6,-4,184],[1,3,2,6,-3,265],[1,3,2,6,-2,393],[1,3,2,6,-1,481],[1,3,2,6,0,594],[1,3,2,6,1,742],[1,3,2,6,2,805],[1,3,2,6,3,880],[1,3,2,6,4,945],[1,3,2,6,5,945],[1,3,2,6,6,939],[1,3,2,6,7,989],[1,3,2,6,8,979],[1,3,2,7,-7,32],[1,3,2,7,-6,141],[1,3,2,7,-5,184],[1,3,2,7,-4,190],[1,3,2,7,-3,291],[1,3,2,7,-2,402],[1,3,2,7,-1,499],[1,3,2,7,0,621],[1,3,2,7,1,722],[1,3,2,7,2,833],[1,3,2,7,3,890],[1,3,2,7,4,929],[1,3,2,7,5,954],[1,3,2,7,6,965],[1,3,2,7,7,981],[1,3,2,7,8,993],[1,4,0,0,-8,19],[1,4,0,0,-7,36],[1,4,0,0,-6,65],[1,4,0,0,-5,95],[1,4,0,0,-4,141],[1,4,0,0,-3,219],[1,4,0,0,-2,315],[1,4,0,0,-1,442],[1,4,0,0,0,590],[1,4,0,0,1,724],[1,4,0,0,2,825],[1,4,0,0,3,892],[1,4,0,0,4,934],[1,4,0,0,5,963],[1,4,0,0,6,976],[1,4,0,0,7,986],[1,4,0,0,8,992],[1,4,0,1,-8,34],[1,4,0,1,-7,49],[1,4,0,1,-6,99],[1,4,0,1,-5,114],[1,4,0,1,-4,183],[1,4,0,1,-3,269],[1,4,0,1,-2,361],[1,4,0,1,-1,503],[1,4,0,1,0,634],[1,4,0,1,1,760],[1,4,0,1,2,839],[1,4,0,1,3,911],[1,4,0,1,4,948],[1,4,0,1,5,975],[1,4,0,1,6,979],[1,4,0,1,7,990],[1,4,0,1,8,995],[1,4,0,2,-8,22],[1,4,0,2,-7,81],[1,4,0,2,-6,83],[1,4,0,2,-5,134],[1,4,0,2,-4,198],[1,4,0,2,-3,294],[1,4,0,2,-2,407],[1,4,0,2,-1,542],[1,4,0,2,0,662],[1,4,0,2,1,787],[1,4,0,2,2,847],[1,4,0,2,3,916],[1,4,0,2,4,944],[1,4,0,2,5,984],[1,4,0,2,6,973],[1,4,0,2,7,972],[1,4,0,2,8,1000],[1,4,0,3,-8,77],[1,4,0,3,-7,99],[1,4,0,3,-6,105],[1,4,0,3,-5,166],[1,4,0,3,-4,263],[1,4,0,3,-3,313],[1,4,0,3,-2,440],[1,4,0,3,-1,594],[1,4,0,3,0,695],[1,4,0,3,1,801],[1,4,0,3,2,878],[1,4,0,3,3,932],[1,4,0,3,4,965],[1,4,0,3,5,986],[1,4,0,3,6,995],[1,4,0,3,7,991],[1,4,0,3,8,992],[1,4,0,4,-6,31],[1,4,0,4,-5,75],[1,4,0,4,-4,270],[1,4,0,4,-3,265],[1,4,0,4,-2,410],[1,4,0,4,-1,557],[1,4,0,4,0,690],[1,4,0,4,1,805],[1,4,0,4,2,857],[1,4,0,4,3,927],[1,4,0,4,4,958],[1,4,0,4,5,989],[1,4,0,4,6,983],[1,4,0,4,7,1000],[1,4,0,5,-8,91],[1,4,0,5,-6,92],[1,4,0,5,-5,204],[1,4,0,5,-4,270],[1,4,0,5,-3,377],[1,4,0,5,-2,488],[1,4,0,5,-1,613],[1,4,0,5,0,725],[1,4,0,5,1,811],[1,4,0,5,2,888],[1,4,0,5,3,944],[1,4,0,5,4,978],[1,4,0,5,5,980],[1,4,0,5,6,977],[1,4,0,5,7,1000],[1,4,0,5,8,1000],[1,4,0,6,-6,200],[1,4,0,6,-5,186],[1,4,0,6,-4,267],[1,4,0,6,-3,410],[1,4,0,6,-2,498],[1,4,0,6,-1,626],[1,4,0,6,0,778],[1,4,0,6,1,858],[1,4,0,6,2,949],[1,4,0,6,3,928],[1,4,0,6,4,957],[1,4,0,6,5,965],[1,4,0,6,6,1000],[1,4,0,6,8,1000],[1,4,0,7,-6,57],[1,4,0,7,-5,182],[1,4,0,7,-4,284],[1,4,0,7,-3,456],[1,4,0,7,-2,567],[1,4,0,7,-1,653],[1,4,0,7,0,781],[1,4,0,7,1,862],[1,4,0,7,2,944],[1,4,0,7,3,955],[1,4,0,7,4,980],[1,4,0,7,5,980],[1,4,0,7,6,1000],[1,4,0,7,7,1000],[1,4,0,7,8,1000],[1,4,1,0,-8,13],[1,4,1,0,-7,23],[1,4,1,0,-6,49],[1,4,1,0,-5,83],[1,4,1,0,-4,115],[1,4,1,0,-3,188],[1,4,1,0,-2,283],[1,4,1,0,-1,404],[1,4,1,0,0,560],[1,4,1,0,1,699],[1,4,1,0,2,811],[1,4,1,0,3,880],[1,4,1,0,4,928],[1,4,1,0,5,954],[1,4,1,0,6,977],[1,4,1,0,7,982],[1,4,1,0,8,989],[1,4,1,1,-8,14],[1,4,1,1,-7,39],[1,4,1,1,-6,68],[1,4,1,1,-5,94],[1,4,1,1,-4,143],[1,4,1,1,-3,226],[1,4,1,1,-2,312],[1,4,1,1,-1,442],[1,4,1,1,0,593],[1,4,1,1,1,723],[1,4,1,1,2,829],[1,4,1,1,3,898],[1,4,1,1,4,940],[1,4,1,1,5,962],[1,4,1,1,6,983],[1,4,1,1,7,980],[1,4,1,1,8,995],[1,4,1,2,-8,10],[1,4,1,2,-7,62],[1,4,1,2,-6,69],[1,4,1,2,-5,121],[1,4,1,2,-4,148],[1,4,1,2,-3,272],[1,4,1,2,-2,343],[1,4,1,2,-1,478],[1,4,1,2,0,612],[1,4,1,2,1,739],[1,4,1,2,2,823],[1,4,1,2,3,913],[1,4,1,2,4,937],[1,4,1,2,5,979],[1,4,1,2,6,977],[1,4,1,2,7,996],[1,4,1,2,8,1000],[1,4,1,3,-8,21],[1,4,1,3,-7,74],[1,4,1,3,-6,111],[1,4,1,3,-5,129],[1,4,1,3,-4,181],[1,4,1,3,-3,279],[1,4,1,3,-2,356],[1,4,1,3,-1,521],[1,4,1,3,0,624],[1,4,1,3,1,764],[1,4,1,3,2,853],[1,4,1,3,3,903],[1,4,1,3,4,955],[1,4,1,3,5,974],[1,4,1,3,6,984],[1,4,1,3,7,996],[1,4,1,3,8,1000],[1,4,1,4,-8,17],[1,4,1,4,-7,70],[1,4,1,4,-6,46],[1,4,1,4,-5,115],[1,4,1,4,-4,176],[1,4,1,4,-3,265],[1,4,1,4,-2,406],[1,4,1,4,-1,504],[1,4,1,4,0,650],[1,4,1,4,1,780],[1,4,1,4,2,852],[1,4,1,4,3,913],[1,4,1,4,4,953],[1,4,1,4,5,983],[1,4,1,4,6,994],[1,4,1,4,7,989],[1,4,1,4,8,1000],[1,4,1,5,-8,26],[1,4,1,5,-7,96],[1,4,1,5,-6,38],[1,4,1,5,-5,145],[1,4,1,5,-4,221],[1,4,1,5,-3,294],[1,4,1,5,-2,388],[1,4,1,5,-1,533],[1,4,1,5,0,681],[1,4,1,5,1,780],[1,4,1,5,2,863],[1,4,1,5,3,919],[1,4,1,5,4,956],[1,4,1,5,5,979],[1,4,1,5,6,995],[1,4,1,5,7,992],[1,4,1,5,8,1000],[1,4,1,6,-8,50],[1,4,1,6,-7,54],[1,4,1,6,-6,111],[1,4,1,6,-5,118],[1,4,1,6,-4,203],[1,4,1,6,-3,305],[1,4,1,6,-2,428],[1,4,1,6,-1,578],[1,4,1,6,0,701],[1,4,1,6,1,803],[1,4,1,6,2,871],[1,4,1,6,3,925],[1,4,1,6,4,969],[1,4,1,6,5,982],[1,4,1,6,6,994],[1,4,1,6,7,989],[1,4,1,6,8,1000],[1,4,1,7,-8,18],[1,4,1,7,-7,130],[1,4,1,7,-6,194],[1,4,1,7,-5,246],[1,4,1,7,-4,234],[1,4,1,7,-3,371],[1,4,1,7,-2,474],[1,4,1,7,-1,608],[1,4,1,7,0,691],[1,4,1,7,1,787],[1,4,1,7,2,885],[1,4,1,7,3,932],[1,4,1,7,4,970],[1,4,1,7,5,979],[1,4,1,7,6,995],[1,4,1,7,7,990],[1,4,1,7,8,1000],[1,4,2,0,-8,12],[1,4,2,0,-7,17],[1,4,2,0,-6,42],[1,4,2,0,-5,65],[1,4,2,0,-4,98],[1,4,2,0,-3,164],[1,4,2,0,-2,261],[1,4,2,0,-1,377],[1,4,2,0,0,540],[1,4,2,0,1,686],[1,4,2,0,2,797],[1,4,2,0,3,873],[1,4,2,0,4,925],[1,4,2,0,5,953],[1,4,2,0,6,972],[1,4,2,0,7,985],[1,4,2,0,8,992],[1,4,2,1,-8,8],[1,4,2,1,-7,28],[1,4,2,1,-6,50],[1,4,2,1,-5,83],[1,4,2,1,-4,108],[1,4,2,1,-3,179],[1,4,2,1,-2,286],[1,4,2,1,-1,393],[1,4,2,1,0,562],[1,4,2,1,1,703],[1,4,2,1,2,805],[1,4,2,1,3,881],[1,4,2,1,4,927],[1,4,2,1,5,960],[1,4,2,1,6,976],[1,4,2,1,7,988],[1,4,2,1,8,996],[1,4,2,2,-8,9],[1,4,2,2,-7,36],[1,4,2,2,-6,50],[1,4,2,2,-5,88],[1,4,2,2,-4,112],[1,4,2,2,-3,207],[1,4,2,2,-2,299],[1,4,2,2,-1,420],[1,4,2,2,0,569],[1,4,2,2,1,704],[1,4,2,2,2,810],[1,4,2,2,3,893],[1,4,2,2,4,930],[1,4,2,2,5,956],[1,4,2,2,6,979],[1,4,2,2,7,988],[1,4,2,2,8,996],[1,4,2,3,-8,13],[1,4,2,3,-7,27],[1,4,2,3,-6,50],[1,4,2,3,-5,77],[1,4,2,3,-4,116],[1,4,2,3,-3,206],[1,4,2,3,-2,289],[1,4,2,3,-1,439],[1,4,2,3,0,594],[1,4,2,3,1,713],[1,4,2,3,2,828],[1,4,2,3,3,898],[1,4,2,3,4,935],[1,4,2,3,5,961],[1,4,2,3,6,965],[1,4,2,3,7,981],[1,4,2,3,8,996],[1,4,2,4,-8,11],[1,4,2,4,-7,56],[1,4,2,4,-6,17],[1,4,2,4,-5,92],[1,4,2,4,-4,143],[1,4,2,4,-3,174],[1,4,2,4,-2,310],[1,4,2,4,-1,429],[1,4,2,4,0,562],[1,4,2,4,1,723],[1,4,2,4,2,808],[1,4,2,4,3,883],[1,4,2,4,4,922],[1,4,2,4,5,961],[1,4,2,4,6,977],[1,4,2,4,7,988],[1,4,2,4,8,992],[1,4,2,5,-8,22],[1,4,2,5,-7,36],[1,4,2,5,-6,61],[1,4,2,5,-5,97],[1,4,2,5,-4,153],[1,4,2,5,-3,185],[1,4,2,5,-2,342],[1,4,2,5,-1,453],[1,4,2,5,0,586],[1,4,2,5,1,725],[1,4,2,5,2,809],[1,4,2,5,3,896],[1,4,2,5,4,929],[1,4,2,5,5,952],[1,4,2,5,6,985],[1,4,2,5,7,996],[1,4,2,5,8,993],[1,4,2,6,-8,34],[1,4,2,6,-7,21],[1,4,2,6,-6,42],[1,4,2,6,-5,84],[1,4,2,6,-4,150],[1,4,2,6,-3,205],[1,4,2,6,-2,347],[1,4,2,6,-1,454],[1,4,2,6,0,614],[1,4,2,6,1,768],[1,4,2,6,2,830],[1,4,2,6,3,890],[1,4,2,6,4,931],[1,4,2,6,5,970],[1,4,2,6,6,975],[1,4,2,6,7,993],[1,4,2,6,8,1000],[1,4,2,7,-8,16],[1,4,2,7,-7,34],[1,4,2,7,-6,101],[1,4,2,7,-5,153],[1,4,2,7,-4,159],[1,4,2,7,-3,214],[1,4,2,7,-2,344],[1,4,2,7,-1,476],[1,4,2,7,0,610],[1,4,2,7,1,729],[1,4,2,7,2,846],[1,4,2,7,3,897],[1,4,2,7,4,945],[1,4,2,7,5,966],[1,4,2,7,6,971],[1,4,2,7,7,1000],[1,4,2,7,8,1000],[1,5,0,0,-8,11],[1,5,0,0,-7,29],[1,5,0,0,-6,44],[1,5,0,0,-5,76],[1,5,0,0,-4,114],[1,5,0,0,-3,191],[1,5,0,0,-2,289],[1,5,0,0,-1,419],[1,5,0,0,0,592],[1,5,0,0,1,746],[1,5,0,0,2,846],[1,5,0,0,3,909],[1,5,0,0,4,950],[1,5,0,0,5,970],[1,5,0,0,6,982],[1,5,0,0,7,991],[1,5,0,0,8,996],[1,5,0,1,-8,16],[1,5,0,1,-7,55],[1,5,0,1,-6,67],[1,5,0,1,-5,106],[1,5,0,1,-4,142],[1,5,0,1,-3,237],[1,5,0,1,-2,350],[1,5,0,1,-1,474],[1,5,0,1,0,635],[1,5,0,1,1,771],[1,5,0,1,2,872],[1,5,0,1,3,927],[1,5,0,1,4,960],[1,5,0,1,5,974],[1,5,0,1,6,984],[1,5,0,1,7,991],[1,5,0,1,8,996],[1,5,0,2,-8,20],[1,5,0,2,-7,57],[1,5,0,2,-6,65],[1,5,0,2,-5,108],[1,5,0,2,-4,203],[1,5,0,2,-3,263],[1,5,0,2,-2,358],[1,5,0,2,-1,513],[1,5,0,2,0,668],[1,5,0,2,1,803],[1,5,0,2,2,882],[1,5,0,2,3,942],[1,5,0,2,4,957],[1,5,0,2,5,969],[1,5,0,2,6,981],[1,5,0,2,7,994],[1,5,0,2,8,1000],[1,5,0,3,-8,24],[1,5,0,3,-7,75],[1,5,0,3,-6,118],[1,5,0,3,-5,163],[1,5,0,3,-4,219],[1,5,0,3,-3,309],[1,5,0,3,-2,423],[1,5,0,3,-1,567],[1,5,0,3,0,703],[1,5,0,3,1,816],[1,5,0,3,2,889],[1,5,0,3,3,946],[1,5,0,3,4,966],[1,5,0,3,5,978],[1,5,0,3,6,982],[1,5,0,3,7,989],[1,5,0,3,8,995],[1,5,0,4,-8,57],[1,5,0,4,-6,77],[1,5,0,4,-5,95],[1,5,0,4,-4,275],[1,5,0,4,-3,304],[1,5,0,4,-2,382],[1,5,0,4,-1,534],[1,5,0,4,0,712],[1,5,0,4,1,844],[1,5,0,4,2,895],[1,5,0,4,3,954],[1,5,0,4,4,963],[1,5,0,4,5,984],[1,5,0,4,6,989],[1,5,0,4,7,1000],[1,5,0,4,8,1000],[1,5,0,5,-8,0],[1,5,0,5,-7,70],[1,5,0,5,-6,141],[1,5,0,5,-5,178],[1,5,0,5,-4,238],[1,5,0,5,-3,360],[1,5,0,5,-2,490],[1,5,0,5,-1,603],[1,5,0,5,0,714],[1,5,0,5,1,844],[1,5,0,5,2,904],[1,5,0,5,3,960],[1,5,0,5,4,990],[1,5,0,5,5,985],[1,5,0,5,6,969],[1,5,0,5,7,1000],[1,5,0,5,8,1000],[1,5,0,6,-8,41],[1,5,0,6,-7,158],[1,5,0,6,-6,111],[1,5,0,6,-5,153],[1,5,0,6,-4,273],[1,5,0,6,-3,387],[1,5,0,6,-2,504],[1,5,0,6,-1,598],[1,5,0,6,0,776],[1,5,0,6,1,861],[1,5,0,6,2,913],[1,5,0,6,3,944],[1,5,0,6,4,981],[1,5,0,6,5,970],[1,5,0,6,6,1000],[1,5,0,6,7,1000],[1,5,0,6,8,1000],[1,5,0,7,-8,53],[1,5,0,7,-7,152],[1,5,0,7,-6,242],[1,5,0,7,-5,230],[1,5,0,7,-4,306],[1,5,0,7,-3,486],[1,5,0,7,-2,569],[1,5,0,7,-1,683],[1,5,0,7,0,801],[1,5,0,7,1,861],[1,5,0,7,2,908],[1,5,0,7,3,942],[1,5,0,7,4,989],[1,5,0,7,5,993],[1,5,0,7,6,1000],[1,5,0,7,7,984],[1,5,0,7,8,985],[1,5,1,0,-8,8],[1,5,1,0,-7,16],[1,5,1,0,-6,31],[1,5,1,0,-5,62],[1,5,1,0,-4,94],[1,5,1,0,-3,165],[1,5,1,0,-2,259],[1,5,1,0,-1,386],[1,5,1,0,0,564],[1,5,1,0,1,727],[1,5,1,0,2,833],[1,5,1,0,3,896],[1,5,1,0,4,944],[1,5,1,0,5,967],[1,5,1,0,6,982],[1,5,1,0,7,989],[1,5,1,0,8,996],[1,5,1,1,-8,8],[1,5,1,1,-7,29],[1,5,1,1,-6,40],[1,5,1,1,-5,82],[1,5,1,1,-4,115],[1,5,1,1,-3,193],[1,5,1,1,-2,305],[1,5,1,1,-1,429],[1,5,1,1,0,591],[1,5,1,1,1,752],[1,5,1,1,2,847],[1,5,1,1,3,910],[1,5,1,1,4,950],[1,5,1,1,5,974],[1,5,1,1,6,985],[1,5,1,1,7,989],[1,5,1,1,8,994],[1,5,1,2,-8,13],[1,5,1,2,-7,35],[1,5,1,2,-6,55],[1,5,1,2,-5,99],[1,5,1,2,-4,137],[1,5,1,2,-3,187],[1,5,1,2,-2,331],[1,5,1,2,-1,457],[1,5,1,2,0,625],[1,5,1,2,1,757],[1,5,1,2,2,867],[1,5,1,2,3,917],[1,5,1,2,4,958],[1,5,1,2,5,968],[1,5,1,2,6,977],[1,5,1,2,7,985],[1,5,1,2,8,998],[1,5,1,3,-8,16],[1,5,1,3,-7,33],[1,5,1,3,-6,60],[1,5,1,3,-5,116],[1,5,1,3,-4,175],[1,5,1,3,-3,238],[1,5,1,3,-2,371],[1,5,1,3,-1,507],[1,5,1,3,0,645],[1,5,1,3,1,785],[1,5,1,3,2,876],[1,5,1,3,3,923],[1,5,1,3,4,958],[1,5,1,3,5,966],[1,5,1,3,6,978],[1,5,1,3,7,993],[1,5,1,3,8,992],[1,5,1,4,-8,0],[1,5,1,4,-7,47],[1,5,1,4,-6,42],[1,5,1,4,-5,112],[1,5,1,4,-4,193],[1,5,1,4,-3,224],[1,5,1,4,-2,330],[1,5,1,4,-1,497],[1,5,1,4,0,675],[1,5,1,4,1,794],[1,5,1,4,2,856],[1,5,1,4,3,937],[1,5,1,4,4,954],[1,5,1,4,5,979],[1,5,1,4,6,996],[1,5,1,4,7,1000],[1,5,1,4,8,1000],[1,5,1,5,-8,8],[1,5,1,5,-7,73],[1,5,1,5,-6,71],[1,5,1,5,-5,145],[1,5,1,5,-4,189],[1,5,1,5,-3,276],[1,5,1,5,-2,378],[1,5,1,5,-1,524],[1,5,1,5,0,669],[1,5,1,5,1,812],[1,5,1,5,2,879],[1,5,1,5,3,939],[1,5,1,5,4,954],[1,5,1,5,5,988],[1,5,1,5,6,966],[1,5,1,5,7,994],[1,5,1,5,8,996],[1,5,1,6,-8,0],[1,5,1,6,-7,37],[1,5,1,6,-6,85],[1,5,1,6,-5,106],[1,5,1,6,-4,224],[1,5,1,6,-3,279],[1,5,1,6,-2,433],[1,5,1,6,-1,554],[1,5,1,6,0,717],[1,5,1,6,1,823],[1,5,1,6,2,891],[1,5,1,6,3,934],[1,5,1,6,4,963],[1,5,1,6,5,978],[1,5,1,6,6,986],[1,5,1,6,7,993],[1,5,1,6,8,995],[1,5,1,7,-8,26],[1,5,1,7,-7,67],[1,5,1,7,-6,148],[1,5,1,7,-5,193],[1,5,1,7,-4,238],[1,5,1,7,-3,334],[1,5,1,7,-2,446],[1,5,1,7,-1,574],[1,5,1,7,0,715],[1,5,1,7,1,827],[1,5,1,7,2,888],[1,5,1,7,3,929],[1,5,1,7,4,953],[1,5,1,7,5,983],[1,5,1,7,6,981],[1,5,1,7,7,993],[1,5,1,7,8,1000],[1,5,2,0,-8,7],[1,5,2,0,-7,15],[1,5,2,0,-6,30],[1,5,2,0,-5,47],[1,5,2,0,-4,80],[1,5,2,0,-3,148],[1,5,2,0,-2,232],[1,5,2,0,-1,358],[1,5,2,0,0,542],[1,5,2,0,1,710],[1,5,2,0,2,823],[1,5,2,0,3,890],[1,5,2,0,4,944],[1,5,2,0,5,963],[1,5,2,0,6,983],[1,5,2,0,7,991],[1,5,2,0,8,997],[1,5,2,1,-8,8],[1,5,2,1,-7,18],[1,5,2,1,-6,30],[1,5,2,1,-5,52],[1,5,2,1,-4,95],[1,5,2,1,-3,165],[1,5,2,1,-2,257],[1,5,2,1,-1,386],[1,5,2,1,0,560],[1,5,2,1,1,722],[1,5,2,1,2,830],[1,5,2,1,3,903],[1,5,2,1,4,943],[1,5,2,1,5,964],[1,5,2,1,6,983],[1,5,2,1,7,980],[1,5,2,1,8,996],[1,5,2,2,-8,6],[1,5,2,2,-7,4],[1,5,2,2,-6,50],[1,5,2,2,-5,71],[1,5,2,2,-4,91],[1,5,2,2,-3,163],[1,5,2,2,-2,286],[1,5,2,2,-1,404],[1,5,2,2,0,574],[1,5,2,2,1,737],[1,5,2,2,2,842],[1,5,2,2,3,894],[1,5,2,2,4,950],[1,5,2,2,5,969],[1,5,2,2,6,985],[1,5,2,2,7,984],[1,5,2,2,8,996],[1,5,2,3,-8,6],[1,5,2,3,-7,29],[1,5,2,3,-6,45],[1,5,2,3,-5,80],[1,5,2,3,-4,118],[1,5,2,3,-3,189],[1,5,2,3,-2,297],[1,5,2,3,-1,435],[1,5,2,3,0,585],[1,5,2,3,1,747],[1,5,2,3,2,839],[1,5,2,3,3,904],[1,5,2,3,4,960],[1,5,2,3,5,964],[1,5,2,3,6,980],[1,5,2,3,7,991],[1,5,2,3,8,999],[1,5,2,4,-8,0],[1,5,2,4,-7,34],[1,5,2,4,-6,40],[1,5,2,4,-5,62],[1,5,2,4,-4,107],[1,5,2,4,-3,147],[1,5,2,4,-2,287],[1,5,2,4,-1,411],[1,5,2,4,0,579],[1,5,2,4,1,729],[1,5,2,4,2,823],[1,5,2,4,3,903],[1,5,2,4,4,941],[1,5,2,4,5,964],[1,5,2,4,6,988],[1,5,2,4,7,984],[1,5,2,4,8,1000],[1,5,2,5,-8,6],[1,5,2,5,-7,9],[1,5,2,5,-6,47],[1,5,2,5,-5,50],[1,5,2,5,-4,116],[1,5,2,5,-3,195],[1,5,2,5,-2,303],[1,5,2,5,-1,432],[1,5,2,5,0,573],[1,5,2,5,1,738],[1,5,2,5,2,836],[1,5,2,5,3,914],[1,5,2,5,4,950],[1,5,2,5,5,972],[1,5,2,5,6,983],[1,5,2,5,7,993],[1,5,2,5,8,988],[1,5,2,6,-8,10],[1,5,2,6,-7,33],[1,5,2,6,-6,74],[1,5,2,6,-5,74],[1,5,2,6,-4,139],[1,5,2,6,-3,204],[1,5,2,6,-2,327],[1,5,2,6,-1,462],[1,5,2,6,0,620],[1,5,2,6,1,752],[1,5,2,6,2,859],[1,5,2,6,3,917],[1,5,2,6,4,953],[1,5,2,6,5,977],[1,5,2,6,6,986],[1,5,2,6,7,988],[1,5,2,6,8,996],[1,5,2,7,-8,0],[1,5,2,7,-7,17],[1,5,2,7,-6,74],[1,5,2,7,-5,72],[1,5,2,7,-4,162],[1,5,2,7,-3,234],[1,5,2,7,-2,346],[1,5,2,7,-1,494],[1,5,2,7,0,629],[1,5,2,7,1,775],[1,5,2,7,2,870],[1,5,2,7,3,901],[1,5,2,7,4,944],[1,5,2,7,5,975],[1,5,2,7,6,980],[1,5,2,7,7,995],[1,5,2,7,8,990],[1,6,0,0,-8,6],[1,6,0,0,-7,16],[1,6,0,0,-6,31],[1,6,0,0,-5,56],[1,6,0,0,-4,91],[1,6,0,0,-3,156],[1,6,0,0,-2,261],[1,6,0,0,-1,405],[1,6,0,0,0,602],[1,6,0,0,1,778],[1,6,0,0,2,876],[1,6,0,0,3,933],[1,6,0,0,4,964],[1,6,0,0,5,979],[1,6,0,0,6,994],[1,6,0,0,7,994],[1,6,0,0,8,999],[1,6,0,1,-8,8],[1,6,0,1,-7,27],[1,6,0,1,-6,44],[1,6,0,1,-5,87],[1,6,0,1,-4,127],[1,6,0,1,-3,206],[1,6,0,1,-2,318],[1,6,0,1,-1,480],[1,6,0,1,0,647],[1,6,0,1,1,809],[1,6,0,1,2,896],[1,6,0,1,3,933],[1,6,0,1,4,970],[1,6,0,1,5,980],[1,6,0,1,6,992],[1,6,0,1,7,993],[1,6,0,1,8,997],[1,6,0,2,-8,13],[1,6,0,2,-7,39],[1,6,0,2,-6,57],[1,6,0,2,-5,74],[1,6,0,2,-4,139],[1,6,0,2,-3,228],[1,6,0,2,-2,361],[1,6,0,2,-1,512],[1,6,0,2,0,699],[1,6,0,2,1,838],[1,6,0,2,2,898],[1,6,0,2,3,943],[1,6,0,2,4,978],[1,6,0,2,5,989],[1,6,0,2,6,991],[1,6,0,2,7,995],[1,6,0,2,8,1000],[1,6,0,3,-8,7],[1,6,0,3,-7,26],[1,6,0,3,-6,73],[1,6,0,3,-5,129],[1,6,0,3,-4,203],[1,6,0,3,-3,302],[1,6,0,3,-2,413],[1,6,0,3,-1,592],[1,6,0,3,0,726],[1,6,0,3,1,847],[1,6,0,3,2,908],[1,6,0,3,3,961],[1,6,0,3,4,977],[1,6,0,3,5,984],[1,6,0,3,6,997],[1,6,0,3,7,1000],[1,6,0,3,8,1000],[1,6,0,4,-8,41],[1,6,0,4,-7,26],[1,6,0,4,-6,66],[1,6,0,4,-5,112],[1,6,0,4,-4,194],[1,6,0,4,-3,288],[1,6,0,4,-2,372],[1,6,0,4,-1,612],[1,6,0,4,0,786],[1,6,0,4,1,843],[1,6,0,4,2,926],[1,6,0,4,3,955],[1,6,0,4,4,983],[1,6,0,4,5,949],[1,6,0,4,6,1000],[1,6,0,4,7,1000],[1,6,0,4,8,1000],[1,6,0,5,-8,11],[1,6,0,5,-7,38],[1,6,0,5,-6,62],[1,6,0,5,-5,126],[1,6,0,5,-4,190],[1,6,0,5,-3,268],[1,6,0,5,-2,484],[1,6,0,5,-1,633],[1,6,0,5,0,758],[1,6,0,5,1,878],[1,6,0,5,2,939],[1,6,0,5,3,953],[1,6,0,5,4,989],[1,6,0,5,5,1000],[1,6,0,5,6,1000],[1,6,0,5,7,987],[1,6,0,5,8,1000],[1,6,0,6,-8,38],[1,6,0,6,-7,0],[1,6,0,6,-6,61],[1,6,0,6,-5,150],[1,6,0,6,-4,264],[1,6,0,6,-3,378],[1,6,0,6,-2,414],[1,6,0,6,-1,670],[1,6,0,6,0,808],[1,6,0,6,1,903],[1,6,0,6,2,943],[1,6,0,6,3,962],[1,6,0,6,4,988],[1,6,0,6,5,992],[1,6,0,6,6,990],[1,6,0,6,7,1000],[1,6,0,6,8,1000],[1,6,0,7,-8,22],[1,6,0,7,-7,57],[1,6,0,7,-6,70],[1,6,0,7,-5,194],[1,6,0,7,-4,323],[1,6,0,7,-3,441],[1,6,0,7,-2,517],[1,6,0,7,-1,701],[1,6,0,7,0,798],[1,6,0,7,1,889],[1,6,0,7,2,958],[1,6,0,7,3,980],[1,6,0,7,4,985],[1,6,0,7,5,1000],[1,6,0,7,6,1000],[1,6,0,7,7,1000],[1,6,0,7,8,1000],[1,6,1,0,-8,4],[1,6,1,0,-7,12],[1,6,1,0,-6,22],[1,6,1,0,-5,41],[1,6,1,0,-4,70],[1,6,1,0,-3,128],[1,6,1,0,-2,224],[1,6,1,0,-1,356],[1,6,1,0,0,569],[1,6,1,0,1,756],[1,6,1,0,2,864],[1,6,1,0,3,930],[1,6,1,0,4,961],[1,6,1,0,5,977],[1,6,1,0,6,993],[1,6,1,0,7,995],[1,6,1,0,8,999],[1,6,1,1,-8,2],[1,6,1,1,-7,20],[1,6,1,1,-6,34],[1,6,1,1,-5,60],[1,6,1,1,-4,90],[1,6,1,1,-3,158],[1,6,1,1,-2,274],[1,6,1,1,-1,417],[1,6,1,1,0,603],[1,6,1,1,1,783],[1,6,1,1,2,877],[1,6,1,1,3,933],[1,6,1,1,4,964],[1,6,1,1,5,983],[1,6,1,1,6,992],[1,6,1,1,7,992],[1,6,1,1,8,998],[1,6,1,2,-8,5],[1,6,1,2,-7,25],[1,6,1,2,-6,44],[1,6,1,2,-5,57],[1,6,1,2,-4,95],[1,6,1,2,-3,166],[1,6,1,2,-2,294],[1,6,1,2,-1,442],[1,6,1,2,0,630],[1,6,1,2,1,796],[1,6,1,2,2,887],[1,6,1,2,3,939],[1,6,1,2,4,976],[1,6,1,2,5,981],[1,6,1,2,6,989],[1,6,1,2,7,996],[1,6,1,2,8,999],[1,6,1,3,-8,0],[1,6,1,3,-7,28],[1,6,1,3,-6,58],[1,6,1,3,-5,89],[1,6,1,3,-4,131],[1,6,1,3,-3,205],[1,6,1,3,-2,342],[1,6,1,3,-1,502],[1,6,1,3,0,651],[1,6,1,3,1,822],[1,6,1,3,2,884],[1,6,1,3,3,935],[1,6,1,3,4,969],[1,6,1,3,5,982],[1,6,1,3,6,988],[1,6,1,3,7,996],[1,6,1,3,8,996],[1,6,1,4,-8,15],[1,6,1,4,-7,15],[1,6,1,4,-6,48],[1,6,1,4,-5,44],[1,6,1,4,-4,117],[1,6,1,4,-3,189],[1,6,1,4,-2,329],[1,6,1,4,-1,516],[1,6,1,4,0,702],[1,6,1,4,1,824],[1,6,1,4,2,898],[1,6,1,4,3,947],[1,6,1,4,4,983],[1,6,1,4,5,979],[1,6,1,4,6,986],[1,6,1,4,7,1000],[1,6,1,4,8,1000],[1,6,1,5,-8,5],[1,6,1,5,-7,0],[1,6,1,5,-6,39],[1,6,1,5,-5,100],[1,6,1,5,-4,143],[1,6,1,5,-3,263],[1,6,1,5,-2,385],[1,6,1,5,-1,519],[1,6,1,5,0,713],[1,6,1,5,1,834],[1,6,1,5,2,912],[1,6,1,5,3,944],[1,6,1,5,4,986],[1,6,1,5,5,986],[1,6,1,5,6,997],[1,6,1,5,7,991],[1,6,1,5,8,997],[1,6,1,6,-8,16],[1,6,1,6,-7,49],[1,6,1,6,-6,32],[1,6,1,6,-5,79],[1,6,1,6,-4,174],[1,6,1,6,-3,292],[1,6,1,6,-2,390],[1,6,1,6,-1,593],[1,6,1,6,0,736],[1,6,1,6,1,851],[1,6,1,6,2,917],[1,6,1,6,3,945],[1,6,1,6,4,974],[1,6,1,6,5,995],[1,6,1,6,6,993],[1,6,1,6,7,1000],[1,6,1,6,8,996],[1,6,1,7,-8,9],[1,6,1,7,-7,46],[1,6,1,7,-6,70],[1,6,1,7,-5,134],[1,6,1,7,-4,197],[1,6,1,7,-3,321],[1,6,1,7,-2,438],[1,6,1,7,-1,601],[1,6,1,7,0,737],[1,6,1,7,1,859],[1,6,1,7,2,931],[1,6,1,7,3,958],[1,6,1,7,4,979],[1,6,1,7,5,987],[1,6,1,7,6,997],[1,6,1,7,7,1000],[1,6,1,7,8,996],[1,6,2,0,-8,5],[1,6,2,0,-7,9],[1,6,2,0,-6,16],[1,6,2,0,-5,31],[1,6,2,0,-4,57],[1,6,2,0,-3,106],[1,6,2,0,-2,192],[1,6,2,0,-1,317],[1,6,2,0,0,544],[1,6,2,0,1,739],[1,6,2,0,2,854],[1,6,2,0,3,923],[1,6,2,0,4,959],[1,6,2,0,5,976],[1,6,2,0,6,991],[1,6,2,0,7,995],[1,6,2,0,8,999],[1,6,2,1,-8,2],[1,6,2,1,-7,11],[1,6,2,1,-6,17],[1,6,2,1,-5,44],[1,6,2,1,-4,74],[1,6,2,1,-3,123],[1,6,2,1,-2,217],[1,6,2,1,-1,340],[1,6,2,1,0,556],[1,6,2,1,1,753],[1,6,2,1,2,866],[1,6,2,1,3,921],[1,6,2,1,4,961],[1,6,2,1,5,973],[1,6,2,1,6,992],[1,6,2,1,7,994],[1,6,2,1,8,998],[1,6,2,2,-8,6],[1,6,2,2,-7,17],[1,6,2,2,-6,15],[1,6,2,2,-5,45],[1,6,2,2,-4,77],[1,6,2,2,-3,118],[1,6,2,2,-2,235],[1,6,2,2,-1,373],[1,6,2,2,0,587],[1,6,2,2,1,758],[1,6,2,2,2,865],[1,6,2,2,3,933],[1,6,2,2,4,963],[1,6,2,2,5,981],[1,6,2,2,6,992],[1,6,2,2,7,997],[1,6,2,2,8,1000],[1,6,2,3,-8,0],[1,6,2,3,-7,20],[1,6,2,3,-6,22],[1,6,2,3,-5,54],[1,6,2,3,-4,87],[1,6,2,3,-3,142],[1,6,2,3,-2,271],[1,6,2,3,-1,395],[1,6,2,3,0,592],[1,6,2,3,1,767],[1,6,2,3,2,870],[1,6,2,3,3,925],[1,6,2,3,4,966],[1,6,2,3,5,979],[1,6,2,3,6,985],[1,6,2,3,7,995],[1,6,2,3,8,997],[1,6,2,4,-8,0],[1,6,2,4,-7,23],[1,6,2,4,-6,25],[1,6,2,4,-5,33],[1,6,2,4,-4,70],[1,6,2,4,-3,134],[1,6,2,4,-2,237],[1,6,2,4,-1,397],[1,6,2,4,0,575],[1,6,2,4,1,774],[1,6,2,4,2,872],[1,6,2,4,3,926],[1,6,2,4,4,974],[1,6,2,4,5,971],[1,6,2,4,6,988],[1,6,2,4,7,993],[1,6,2,4,8,994],[1,6,2,5,-8,0],[1,6,2,5,-7,7],[1,6,2,5,-6,28],[1,6,2,5,-5,43],[1,6,2,5,-4,82],[1,6,2,5,-3,164],[1,6,2,5,-2,272],[1,6,2,5,-1,425],[1,6,2,5,0,616],[1,6,2,5,1,789],[1,6,2,5,2,881],[1,6,2,5,3,934],[1,6,2,5,4,969],[1,6,2,5,5,980],[1,6,2,5,6,981],[1,6,2,5,7,982],[1,6,2,5,8,1000],[1,6,2,6,-8,7],[1,6,2,6,-7,11],[1,6,2,6,-6,23],[1,6,2,6,-5,54],[1,6,2,6,-4,95],[1,6,2,6,-3,180],[1,6,2,6,-2,279],[1,6,2,6,-1,443],[1,6,2,6,0,646],[1,6,2,6,1,783],[1,6,2,6,2,884],[1,6,2,6,3,928],[1,6,2,6,4,970],[1,6,2,6,5,986],[1,6,2,6,6,985],[1,6,2,6,7,1000],[1,6,2,6,8,1000],[1,6,2,7,-8,0],[1,6,2,7,-7,22],[1,6,2,7,-6,21],[1,6,2,7,-5,62],[1,6,2,7,-4,113],[1,6,2,7,-3,203],[1,6,2,7,-2,312],[1,6,2,7,-1,462],[1,6,2,7,0,637],[1,6,2,7,1,792],[1,6,2,7,2,888],[1,6,2,7,3,944],[1,6,2,7,4,963],[1,6,2,7,5,981],[1,6,2,7,6,992],[1,6,2,7,7,1000],[1,6,2,7,8,1000],[1,7,0,0,-8,3],[1,7,0,0,-7,10],[1,7,0,0,-6,17],[1,7,0,0,-5,36],[1,7,0,0,-4,59],[1,7,0,0,-3,114],[1,7,0,0,-2,212],[1,7,0,0,-1,357],[1,7,0,0,0,613],[1,7,0,0,1,823],[1,7,0,0,2,913],[1,7,0,0,3,958],[1,7,0,0,4,979],[1,7,0,0,5,991],[1,7,0,0,6,995],[1,7,0,0,7,998],[1,7,0,0,8,999],[1,7,0,1,-8,3],[1,7,0,1,-7,21],[1,7,0,1,-6,25],[1,7,0,1,-5,52],[1,7,0,1,-4,82],[1,7,0,1,-3,172],[1,7,0,1,-2,291],[1,7,0,1,-1,436],[1,7,0,1,0,673],[1,7,0,1,1,854],[1,7,0,1,2,929],[1,7,0,1,3,967],[1,7,0,1,4,980],[1,7,0,1,5,993],[1,7,0,1,6,995],[1,7,0,1,7,998],[1,7,0,1,8,999],[1,7,0,2,-8,3],[1,7,0,2,-7,16],[1,7,0,2,-6,37],[1,7,0,2,-5,72],[1,7,0,2,-4,98],[1,7,0,2,-3,174],[1,7,0,2,-2,307],[1,7,0,2,-1,528],[1,7,0,2,0,742],[1,7,0,2,1,881],[1,7,0,2,2,936],[1,7,0,2,3,971],[1,7,0,2,4,986],[1,7,0,2,5,997],[1,7,0,2,6,995],[1,7,0,2,7,1000],[1,7,0,2,8,1000],[1,7,0,3,-8,8],[1,7,0,3,-7,33],[1,7,0,3,-6,40],[1,7,0,3,-5,83],[1,7,0,3,-4,120],[1,7,0,3,-3,263],[1,7,0,3,-2,377],[1,7,0,3,-1,556],[1,7,0,3,0,751],[1,7,0,3,1,891],[1,7,0,3,2,942],[1,7,0,3,3,980],[1,7,0,3,4,983],[1,7,0,3,5,996],[1,7,0,3,6,997],[1,7,0,3,7,995],[1,7,0,3,8,1000],[1,7,0,4,-8,0],[1,7,0,4,-7,0],[1,7,0,4,-6,0],[1,7,0,4,-5,37],[1,7,0,4,-4,134],[1,7,0,4,-3,171],[1,7,0,4,-2,335],[1,7,0,4,-1,579],[1,7,0,4,0,782],[1,7,0,4,1,917],[1,7,0,4,2,952],[1,7,0,4,3,960],[1,7,0,4,4,995],[1,7,0,4,5,987],[1,7,0,4,6,1000],[1,7,0,4,7,1000],[1,7,0,4,8,1000],[1,7,0,5,-8,9],[1,7,0,5,-7,29],[1,7,0,5,-6,92],[1,7,0,5,-5,87],[1,7,0,5,-4,105],[1,7,0,5,-3,239],[1,7,0,5,-2,431],[1,7,0,5,-1,609],[1,7,0,5,0,820],[1,7,0,5,1,942],[1,7,0,5,2,970],[1,7,0,5,3,989],[1,7,0,5,4,994],[1,7,0,5,5,995],[1,7,0,5,6,1000],[1,7,0,5,7,1000],[1,7,0,5,8,1000],[1,7,0,6,-8,26],[1,7,0,6,-7,22],[1,7,0,6,-6,42],[1,7,0,6,-5,131],[1,7,0,6,-4,161],[1,7,0,6,-3,344],[1,7,0,6,-2,570],[1,7,0,6,-1,673],[1,7,0,6,0,801],[1,7,0,6,1,935],[1,7,0,6,2,962],[1,7,0,6,3,986],[1,7,0,6,4,989],[1,7,0,6,5,993],[1,7,0,6,6,1000],[1,7,0,6,7,1000],[1,7,0,6,8,1000],[1,7,0,7,-8,11],[1,7,0,7,-7,61],[1,7,0,7,-6,54],[1,7,0,7,-5,200],[1,7,0,7,-4,181],[1,7,0,7,-3,367],[1,7,0,7,-2,577],[1,7,0,7,-1,748],[1,7,0,7,0,838],[1,7,0,7,1,945],[1,7,0,7,2,964],[1,7,0,7,3,992],[1,7,0,7,4,996],[1,7,0,7,5,1000],[1,7,0,7,6,1000],[1,7,0,7,7,1000],[1,7,0,7,8,1000],[1,7,1,0,-8,2],[1,7,1,0,-7,6],[1,7,1,0,-6,12],[1,7,1,0,-5,27],[1,7,1,0,-4,46],[1,7,1,0,-3,82],[1,7,1,0,-2,169],[1,7,1,0,-1,304],[1,7,1,0,0,573],[1,7,1,0,1,803],[1,7,1,0,2,903],[1,7,1,0,3,954],[1,7,1,0,4,977],[1,7,1,0,5,990],[1,7,1,0,6,995],[1,7,1,0,7,999],[1,7,1,0,8,1000],[1,7,1,1,-8,2],[1,7,1,1,-7,14],[1,7,1,1,-6,17],[1,7,1,1,-5,37],[1,7,1,1,-4,63],[1,7,1,1,-3,112],[1,7,1,1,-2,222],[1,7,1,1,-1,360],[1,7,1,1,0,621],[1,7,1,1,1,830],[1,7,1,1,2,914],[1,7,1,1,3,963],[1,7,1,1,4,977],[1,7,1,1,5,990],[1,7,1,1,6,994],[1,7,1,1,7,997],[1,7,1,1,8,999],[1,7,1,2,-8,4],[1,7,1,2,-7,7],[1,7,1,2,-6,32],[1,7,1,2,-5,49],[1,7,1,2,-4,71],[1,7,1,2,-3,111],[1,7,1,2,-2,223],[1,7,1,2,-1,408],[1,7,1,2,0,658],[1,7,1,2,1,846],[1,7,1,2,2,932],[1,7,1,2,3,960],[1,7,1,2,4,983],[1,7,1,2,5,993],[1,7,1,2,6,995],[1,7,1,2,7,1000],[1,7,1,2,8,999],[1,7,1,3,-8,3],[1,7,1,3,-7,22],[1,7,1,3,-6,34],[1,7,1,3,-5,51],[1,7,1,3,-4,97],[1,7,1,3,-3,174],[1,7,1,3,-2,294],[1,7,1,3,-1,452],[1,7,1,3,0,673],[1,7,1,3,1,850],[1,7,1,3,2,929],[1,7,1,3,3,970],[1,7,1,3,4,981],[1,7,1,3,5,994],[1,7,1,3,6,994],[1,7,1,3,7,998],[1,7,1,3,8,999],[1,7,1,4,-8,12],[1,7,1,4,-7,10],[1,7,1,4,-6,29],[1,7,1,4,-5,56],[1,7,1,4,-4,86],[1,7,1,4,-3,162],[1,7,1,4,-2,272],[1,7,1,4,-1,499],[1,7,1,4,0,705],[1,7,1,4,1,876],[1,7,1,4,2,926],[1,7,1,4,3,968],[1,7,1,4,4,976],[1,7,1,4,5,993],[1,7,1,4,6,997],[1,7,1,4,7,1000],[1,7,1,4,8,1000],[1,7,1,5,-8,4],[1,7,1,5,-7,7],[1,7,1,5,-6,36],[1,7,1,5,-5,54],[1,7,1,5,-4,107],[1,7,1,5,-3,178],[1,7,1,5,-2,314],[1,7,1,5,-1,530],[1,7,1,5,0,746],[1,7,1,5,1,869],[1,7,1,5,2,938],[1,7,1,5,3,973],[1,7,1,5,4,989],[1,7,1,5,5,994],[1,7,1,5,6,995],[1,7,1,5,7,1000],[1,7,1,5,8,1000],[1,7,1,6,-8,0],[1,7,1,6,-7,52],[1,7,1,6,-6,29],[1,7,1,6,-5,79],[1,7,1,6,-4,122],[1,7,1,6,-3,196],[1,7,1,6,-2,380],[1,7,1,6,-1,555],[1,7,1,6,0,782],[1,7,1,6,1,870],[1,7,1,6,2,954],[1,7,1,6,3,976],[1,7,1,6,4,986],[1,7,1,6,5,995],[1,7,1,6,6,997],[1,7,1,6,7,1000],[1,7,1,6,8,997],[1,7,1,7,-8,19],[1,7,1,7,-7,44],[1,7,1,7,-6,51],[1,7,1,7,-5,101],[1,7,1,7,-4,178],[1,7,1,7,-3,248],[1,7,1,7,-2,399],[1,7,1,7,-1,575],[1,7,1,7,0,777],[1,7,1,7,1,890],[1,7,1,7,2,945],[1,7,1,7,3,977],[1,7,1,7,4,988],[1,7,1,7,5,989],[1,7,1,7,6,994],[1,7,1,7,7,995],[1,7,1,7,8,1000],[1,7,2,0,-8,1],[1,7,2,0,-7,4],[1,7,2,0,-6,7],[1,7,2,0,-5,18],[1,7,2,0,-4,35],[1,7,2,0,-3,68],[1,7,2,0,-2,141],[1,7,2,0,-1,267],[1,7,2,0,0,543],[1,7,2,0,1,786],[1,7,2,0,2,895],[1,7,2,0,3,948],[1,7,2,0,4,976],[1,7,2,0,5,990],[1,7,2,0,6,995],[1,7,2,0,7,1000],[1,7,2,0,8,1000],[1,7,2,1,-8,2],[1,7,2,1,-7,1],[1,7,2,1,-6,9],[1,7,2,1,-5,27],[1,7,2,1,-4,43],[1,7,2,1,-3,85],[1,7,2,1,-2,168],[1,7,2,1,-1,294],[1,7,2,1,0,562],[1,7,2,1,1,809],[1,7,2,1,2,898],[1,7,2,1,3,960],[1,7,2,1,4,979],[1,7,2,1,5,989],[1,7,2,1,6,996],[1,7,2,1,7,999],[1,7,2,1,8,999],[1,7,2,2,-8,1],[1,7,2,2,-7,5],[1,7,2,2,-6,19],[1,7,2,2,-5,28],[1,7,2,2,-4,52],[1,7,2,2,-3,83],[1,7,2,2,-2,177],[1,7,2,2,-1,318],[1,7,2,2,0,606],[1,7,2,2,1,813],[1,7,2,2,2,914],[1,7,2,2,3,957],[1,7,2,2,4,979],[1,7,2,2,5,990],[1,7,2,2,6,995],[1,7,2,2,7,997],[1,7,2,2,8,999],[1,7,2,3,-8,5],[1,7,2,3,-7,9],[1,7,2,3,-6,17],[1,7,2,3,-5,31],[1,7,2,3,-4,59],[1,7,2,3,-3,100],[1,7,2,3,-2,209],[1,7,2,3,-1,336],[1,7,2,3,0,618],[1,7,2,3,1,818],[1,7,2,3,2,916],[1,7,2,3,3,959],[1,7,2,3,4,977],[1,7,2,3,5,992],[1,7,2,3,6,998],[1,7,2,3,7,995],[1,7,2,3,8,999],[1,7,2,4,-8,0],[1,7,2,4,-7,0],[1,7,2,4,-6,13],[1,7,2,4,-5,37],[1,7,2,4,-4,57],[1,7,2,4,-3,94],[1,7,2,4,-2,169],[1,7,2,4,-1,339],[1,7,2,4,0,610],[1,7,2,4,1,816],[1,7,2,4,2,912],[1,7,2,4,3,949],[1,7,2,4,4,982],[1,7,2,4,5,993],[1,7,2,4,6,993],[1,7,2,4,7,1000],[1,7,2,4,8,1000],[1,7,2,5,-8,0],[1,7,2,5,-7,18],[1,7,2,5,-6,26],[1,7,2,5,-5,44],[1,7,2,5,-4,69],[1,7,2,5,-3,109],[1,7,2,5,-2,203],[1,7,2,5,-1,372],[1,7,2,5,0,621],[1,7,2,5,1,818],[1,7,2,5,2,921],[1,7,2,5,3,965],[1,7,2,5,4,981],[1,7,2,5,5,995],[1,7,2,5,6,992],[1,7,2,5,7,1000],[1,7,2,5,8,1000],[1,7,2,6,-8,0],[1,7,2,6,-7,29],[1,7,2,6,-6,27],[1,7,2,6,-5,34],[1,7,2,6,-4,74],[1,7,2,6,-3,136],[1,7,2,6,-2,226],[1,7,2,6,-1,387],[1,7,2,6,0,607],[1,7,2,6,1,823],[1,7,2,6,2,922],[1,7,2,6,3,964],[1,7,2,6,4,977],[1,7,2,6,5,994],[1,7,2,6,6,994],[1,7,2,6,7,1000],[1,7,2,6,8,998],[1,7,2,7,-8,11],[1,7,2,7,-7,18],[1,7,2,7,-6,22],[1,7,2,7,-5,58],[1,7,2,7,-4,97],[1,7,2,7,-3,153],[1,7,2,7,-2,255],[1,7,2,7,-1,406],[1,7,2,7,0,657],[1,7,2,7,1,822],[1,7,2,7,2,919],[1,7,2,7,3,972],[1,7,2,7,4,979],[1,7,2,7,5,985],[1,7,2,7,6,992],[1,7,2,7,7,1000],[1,7,2,7,8,1000],[1,8,0,0,-8,1],[1,8,0,0,-7,5],[1,8,0,0,-6,8],[1,8,0,0,-5,19],[1,8,0,0,-4,38],[1,8,0,0,-3,76],[1,8,0,0,-2,152],[1,8,0,0,-1,291],[1,8,0,0,0,637],[1,8,0,0,1,893],[1,8,0,0,2,957],[1,8,0,0,3,984],[1,8,0,0,4,992],[1,8,0,0,5,997],[1,8,0,0,6,998],[1,8,0,0,7,1000],[1,8,0,0,8,1000],[1,8,0,1,-8,3],[1,8,0,1,-7,12],[1,8,0,1,-6,15],[1,8,0,1,-5,35],[1,8,0,1,-4,71],[1,8,0,1,-3,137],[1,8,0,1,-2,229],[1,8,0,1,-1,393],[1,8,0,1,0,704],[1,8,0,1,1,911],[1,8,0,1,2,958],[1,8,0,1,3,984],[1,8,0,1,4,993],[1,8,0,1,5,997],[1,8,0,1,6,995],[1,8,0,1,7,1000],[1,8,0,1,8,1000],[1,8,0,2,-8,0],[1,8,0,2,-7,12],[1,8,0,2,-6,12],[1,8,0,2,-5,38],[1,8,0,2,-4,74],[1,8,0,2,-3,128],[1,8,0,2,-2,283],[1,8,0,2,-1,489],[1,8,0,2,0,760],[1,8,0,2,1,909],[1,8,0,2,2,966],[1,8,0,2,3,991],[1,8,0,2,4,994],[1,8,0,2,5,997],[1,8,0,2,6,1000],[1,8,0,2,7,1000],[1,8,0,2,8,1000],[1,8,0,3,-8,2],[1,8,0,3,-7,18],[1,8,0,3,-6,30],[1,8,0,3,-5,75],[1,8,0,3,-4,120],[1,8,0,3,-3,216],[1,8,0,3,-2,362],[1,8,0,3,-1,576],[1,8,0,3,0,808],[1,8,0,3,1,926],[1,8,0,3,2,959],[1,8,0,3,3,984],[1,8,0,3,4,996],[1,8,0,3,5,1000],[1,8,0,3,6,995],[1,8,0,3,7,1000],[1,8,0,3,8,1000],[1,8,0,4,-8,0],[1,8,0,4,-7,0],[1,8,0,4,-6,30],[1,8,0,4,-5,51],[1,8,0,4,-4,68],[1,8,0,4,-3,137],[1,8,0,4,-2,259],[1,8,0,4,-1,550],[1,8,0,4,0,824],[1,8,0,4,1,945],[1,8,0,4,2,965],[1,8,0,4,3,992],[1,8,0,4,4,995],[1,8,0,4,5,1000],[1,8,0,4,6,1000],[1,8,0,4,7,1000],[1,8,0,4,8,1000],[1,8,0,5,-8,0],[1,8,0,5,-7,11],[1,8,0,5,-6,21],[1,8,0,5,-5,54],[1,8,0,5,-4,125],[1,8,0,5,-3,236],[1,8,0,5,-2,379],[1,8,0,5,-1,658],[1,8,0,5,0,855],[1,8,0,5,1,945],[1,8,0,5,2,982],[1,8,0,5,3,986],[1,8,0,5,4,997],[1,8,0,5,5,1000],[1,8,0,5,6,993],[1,8,0,5,7,1000],[1,8,0,5,8,1000],[1,8,0,6,-8,19],[1,8,0,6,-7,60],[1,8,0,6,-6,59],[1,8,0,6,-5,61],[1,8,0,6,-4,192],[1,8,0,6,-3,245],[1,8,0,6,-2,471],[1,8,0,6,-1,682],[1,8,0,6,0,868],[1,8,0,6,1,967],[1,8,0,6,2,973],[1,8,0,6,3,996],[1,8,0,6,4,1000],[1,8,0,6,5,993],[1,8,0,6,6,1000],[1,8,0,6,7,1000],[1,8,0,6,8,1000],[1,8,0,7,-8,9],[1,8,0,7,-7,16],[1,8,0,7,-6,34],[1,8,0,7,-5,127],[1,8,0,7,-4,254],[1,8,0,7,-3,366],[1,8,0,7,-2,505],[1,8,0,7,-1,700],[1,8,0,7,0,856],[1,8,0,7,1,967],[1,8,0,7,2,971],[1,8,0,7,3,988],[1,8,0,7,4,991],[1,8,0,7,5,1000],[1,8,0,7,6,1000],[1,8,0,7,7,1000],[1,8,0,7,8,1000],[1,8,1,0,-8,0],[1,8,1,0,-7,1],[1,8,1,0,-6,5],[1,8,1,0,-5,12],[1,8,1,0,-4,22],[1,8,1,0,-3,47],[1,8,1,0,-2,109],[1,8,1,0,-1,226],[1,8,1,0,0,589],[1,8,1,0,1,882],[1,8,1,0,2,954],[1,8,1,0,3,984],[1,8,1,0,4,992],[1,8,1,0,5,997],[1,8,1,0,6,998],[1,8,1,0,7,1000],[1,8,1,0,8,1000],[1,8,1,1,-8,1],[1,8,1,1,-7,2],[1,8,1,1,-6,9],[1,8,1,1,-5,18],[1,8,1,1,-4,38],[1,8,1,1,-3,82],[1,8,1,1,-2,157],[1,8,1,1,-1,301],[1,8,1,1,0,634],[1,8,1,1,1,902],[1,8,1,1,2,956],[1,8,1,1,3,983],[1,8,1,1,4,994],[1,8,1,1,5,998],[1,8,1,1,6,999],[1,8,1,1,7,1000],[1,8,1,1,8,1000],[1,8,1,2,-8,0],[1,8,1,2,-7,3],[1,8,1,2,-6,4],[1,8,1,2,-5,30],[1,8,1,2,-4,39],[1,8,1,2,-3,86],[1,8,1,2,-2,170],[1,8,1,2,-1,355],[1,8,1,2,0,699],[1,8,1,2,1,904],[1,8,1,2,2,959],[1,8,1,2,3,986],[1,8,1,2,4,994],[1,8,1,2,5,997],[1,8,1,2,6,1000],[1,8,1,2,7,1000],[1,8,1,2,8,1000],[1,8,1,3,-8,3],[1,8,1,3,-7,2],[1,8,1,3,-6,17],[1,8,1,3,-5,32],[1,8,1,3,-4,65],[1,8,1,3,-3,129],[1,8,1,3,-2,235],[1,8,1,3,-1,403],[1,8,1,3,0,718],[1,8,1,3,1,906],[1,8,1,3,2,957],[1,8,1,3,3,984],[1,8,1,3,4,998],[1,8,1,3,5,998],[1,8,1,3,6,999],[1,8,1,3,7,1000],[1,8,1,3,8,1000],[1,8,1,4,-8,5],[1,8,1,4,-7,0],[1,8,1,4,-6,0],[1,8,1,4,-5,9],[1,8,1,4,-4,59],[1,8,1,4,-3,82],[1,8,1,4,-2,221],[1,8,1,4,-1,457],[1,8,1,4,0,762],[1,8,1,4,1,921],[1,8,1,4,2,961],[1,8,1,4,3,987],[1,8,1,4,4,996],[1,8,1,4,5,998],[1,8,1,4,6,1000],[1,8,1,4,7,1000],[1,8,1,4,8,1000],[1,8,1,5,-8,3],[1,8,1,5,-7,11],[1,8,1,5,-6,18],[1,8,1,5,-5,23],[1,8,1,5,-4,73],[1,8,1,5,-3,139],[1,8,1,5,-2,278],[1,8,1,5,-1,477],[1,8,1,5,0,781],[1,8,1,5,1,935],[1,8,1,5,2,973],[1,8,1,5,3,984],[1,8,1,5,4,990],[1,8,1,5,5,998],[1,8,1,5,6,994],[1,8,1,5,7,1000],[1,8,1,5,8,1000],[1,8,1,6,-8,0],[1,8,1,6,-7,9],[1,8,1,6,-6,0],[1,8,1,6,-5,61],[1,8,1,6,-4,92],[1,8,1,6,-3,168],[1,8,1,6,-2,335],[1,8,1,6,-1,568],[1,8,1,6,0,801],[1,8,1,6,1,940],[1,8,1,6,2,962],[1,8,1,6,3,985],[1,8,1,6,4,992],[1,8,1,6,5,998],[1,8,1,6,6,997],[1,8,1,6,7,1000],[1,8,1,6,8,1000],[1,8,1,7,-8,5],[1,8,1,7,-7,17],[1,8,1,7,-6,41],[1,8,1,7,-5,84],[1,8,1,7,-4,121],[1,8,1,7,-3,201],[1,8,1,7,-2,362],[1,8,1,7,-1,568],[1,8,1,7,0,791],[1,8,1,7,1,940],[1,8,1,7,2,969],[1,8,1,7,3,989],[1,8,1,7,4,997],[1,8,1,7,5,1000],[1,8,1,7,6,1000],[1,8,1,7,7,1000],[1,8,1,7,8,1000],[1,8,2,0,-8,0],[1,8,2,0,-7,2],[1,8,2,0,-6,3],[1,8,2,0,-5,6],[1,8,2,0,-4,15],[1,8,2,0,-3,32],[1,8,2,0,-2,81],[1,8,2,0,-1,178],[1,8,2,0,0,554],[1,8,2,0,1,871],[1,8,2,0,2,951],[1,8,2,0,3,981],[1,8,2,0,4,991],[1,8,2,0,5,997],[1,8,2,0,6,997],[1,8,2,0,7,1000],[1,8,2,0,8,1000],[1,8,2,1,-8,0],[1,8,2,1,-7,2],[1,8,2,1,-6,4],[1,8,2,1,-5,10],[1,8,2,1,-4,22],[1,8,2,1,-3,46],[1,8,2,1,-2,105],[1,8,2,1,-1,220],[1,8,2,1,0,580],[1,8,2,1,1,881],[1,8,2,1,2,948],[1,8,2,1,3,983],[1,8,2,1,4,992],[1,8,2,1,5,997],[1,8,2,1,6,999],[1,8,2,1,7,1000],[1,8,2,1,8,999],[1,8,2,2,-8,0],[1,8,2,2,-7,0],[1,8,2,2,-6,4],[1,8,2,2,-5,10],[1,8,2,2,-4,23],[1,8,2,2,-3,50],[1,8,2,2,-2,113],[1,8,2,2,-1,255],[1,8,2,2,0,617],[1,8,2,2,1,888],[1,8,2,2,2,953],[1,8,2,2,3,981],[1,8,2,2,4,992],[1,8,2,2,5,996],[1,8,2,2,6,998],[1,8,2,2,7,1000],[1,8,2,2,8,1000],[1,8,2,3,-8,0],[1,8,2,3,-7,2],[1,8,2,3,-6,4],[1,8,2,3,-5,16],[1,8,2,3,-4,42],[1,8,2,3,-3,74],[1,8,2,3,-2,143],[1,8,2,3,-1,286],[1,8,2,3,0,632],[1,8,2,3,1,892],[1,8,2,3,2,949],[1,8,2,3,3,986],[1,8,2,3,4,997],[1,8,2,3,5,998],[1,8,2,3,6,998],[1,8,2,3,7,1000],[1,8,2,3,8,999],[1,8,2,4,-8,0],[1,8,2,4,-7,6],[1,8,2,4,-6,8],[1,8,2,4,-5,8],[1,8,2,4,-4,14],[1,8,2,4,-3,57],[1,8,2,4,-2,107],[1,8,2,4,-1,271],[1,8,2,4,0,640],[1,8,2,4,1,893],[1,8,2,4,2,940],[1,8,2,4,3,984],[1,8,2,4,4,996],[1,8,2,4,5,999],[1,8,2,4,6,998],[1,8,2,4,7,1000],[1,8,2,4,8,1000],[1,8,2,5,-8,0],[1,8,2,5,-7,0],[1,8,2,5,-6,3],[1,8,2,5,-5,18],[1,8,2,5,-4,38],[1,8,2,5,-3,79],[1,8,2,5,-2,142],[1,8,2,5,-1,288],[1,8,2,5,0,650],[1,8,2,5,1,889],[1,8,2,5,2,958],[1,8,2,5,3,981],[1,8,2,5,4,994],[1,8,2,5,5,1000],[1,8,2,5,6,996],[1,8,2,5,7,1000],[1,8,2,5,8,1000],[1,8,2,6,-8,0],[1,8,2,6,-7,0],[1,8,2,6,-6,5],[1,8,2,6,-5,33],[1,8,2,6,-4,42],[1,8,2,6,-3,71],[1,8,2,6,-2,204],[1,8,2,6,-1,308],[1,8,2,6,0,651],[1,8,2,6,1,914],[1,8,2,6,2,943],[1,8,2,6,3,992],[1,8,2,6,4,983],[1,8,2,6,5,993],[1,8,2,6,6,994],[1,8,2,6,7,1000],[1,8,2,6,8,1000],[1,8,2,7,-8,0],[1,8,2,7,-7,7],[1,8,2,7,-6,10],[1,8,2,7,-5,48],[1,8,2,7,-4,71],[1,8,2,7,-3,109],[1,8,2,7,-2,193],[1,8,2,7,-1,375],[1,8,2,7,0,681],[1,8,2,7,1,911],[1,8,2,7,2,954],[1,8,2,7,3,983],[1,8,2,7,4,992],[1,8,2,7,5,996],[1,8,2,7,6,995],[1,8,2,7,7,1000],[1,8,2,7,8,1000],[1,9,0,0,-8,0],[1,9,0,0,-7,1],[1,9,0,0,-6,3],[1,9,0,0,-5,8],[1,9,0,0,-4,14],[1,9,0,0,-3,35],[1,9,0,0,-2,80],[1,9,0,0,-1,182],[1,9,0,0,0,664],[1,9,0,1,-8,0],[1,9,0,1,-7,3],[1,9,0,1,-6,7],[1,9,0,1,-5,23],[1,9,0,1,-4,30],[1,9,0,1,-3,82],[1,9,0,1,-2,166],[1,9,0,1,-1,308],[1,9,0,1,0,734],[1,9,0,2,-8,0],[1,9,0,2,-7,0],[1,9,0,2,-6,3],[1,9,0,2,-5,16],[1,9,0,2,-4,38],[1,9,0,2,-3,77],[1,9,0,2,-2,180],[1,9,0,2,-1,435],[1,9,0,2,0,828],[1,9,0,3,-8,0],[1,9,0,3,-7,10],[1,9,0,3,-6,7],[1,9,0,3,-5,49],[1,9,0,3,-4,72],[1,9,0,3,-3,177],[1,9,0,3,-2,281],[1,9,0,3,-1,523],[1,9,0,3,0,842],[1,9,0,4,-8,0],[1,9,0,4,-7,0],[1,9,0,4,-6,26],[1,9,0,4,-5,15],[1,9,0,4,-4,79],[1,9,0,4,-3,58],[1,9,0,4,-2,182],[1,9,0,4,-1,539],[1,9,0,4,0,913],[1,9,0,5,-8,0],[1,9,0,5,-7,0],[1,9,0,5,-6,0],[1,9,0,5,-5,35],[1,9,0,5,-4,70],[1,9,0,5,-3,168],[1,9,0,5,-2,329],[1,9,0,5,-1,631],[1,9,0,5,0,917],[1,9,0,6,-8,0],[1,9,0,6,-7,0],[1,9,0,6,-6,27],[1,9,0,6,-5,42],[1,9,0,6,-4,97],[1,9,0,6,-3,190],[1,9,0,6,-2,445],[1,9,0,6,-1,684],[1,9,0,6,0,932],[1,9,0,7,-8,0],[1,9,0,7,-7,29],[1,9,0,7,-6,40],[1,9,0,7,-5,135],[1,9,0,7,-4,181],[1,9,0,7,-3,339],[1,9,0,7,-2,470],[1,9,0,7,-1,698],[1,9,0,7,0,932],[1,9,1,0,-8,0],[1,9,1,0,-7,0],[1,9,1,0,-6,1],[1,9,1,0,-5,2],[1,9,1,0,-4,6],[1,9,1,0,-3,14],[1,9,1,0,-2,38],[1,9,1,0,-1,101],[1,9,1,0,0,607],[1,9,1,1,-8,0],[1,9,1,1,-7,1],[1,9,1,1,-6,5],[1,9,1,1,-5,7],[1,9,1,1,-4,14],[1,9,1,1,-3,36],[1,9,1,1,-2,93],[1,9,1,1,-1,196],[1,9,1,1,0,665],[1,9,1,2,-8,0],[1,9,1,2,-7,0],[1,9,1,2,-6,0],[1,9,1,2,-5,6],[1,9,1,2,-4,14],[1,9,1,2,-3,37],[1,9,1,2,-2,98],[1,9,1,2,-1,271],[1,9,1,2,0,731],[1,9,1,3,-8,0],[1,9,1,3,-7,2],[1,9,1,3,-6,9],[1,9,1,3,-5,15],[1,9,1,3,-4,31],[1,9,1,3,-3,97],[1,9,1,3,-2,178],[1,9,1,3,-1,354],[1,9,1,3,0,747],[1,9,1,4,-8,0],[1,9,1,4,-7,0],[1,9,1,4,-6,5],[1,9,1,4,-5,0],[1,9,1,4,-4,18],[1,9,1,4,-3,31],[1,9,1,4,-2,122],[1,9,1,4,-1,426],[1,9,1,4,0,839],[1,9,1,5,-8,0],[1,9,1,5,-7,0],[1,9,1,5,-6,4],[1,9,1,5,-5,14],[1,9,1,5,-4,30],[1,9,1,5,-3,106],[1,9,1,5,-2,186],[1,9,1,5,-1,460],[1,9,1,5,0,846],[1,9,1,6,-8,0],[1,9,1,6,-7,0],[1,9,1,6,-6,6],[1,9,1,6,-5,21],[1,9,1,6,-4,51],[1,9,1,6,-3,96],[1,9,1,6,-2,290],[1,9,1,6,-1,541],[1,9,1,6,0,840],[1,9,1,7,-8,0],[1,9,1,7,-7,14],[1,9,1,7,-6,24],[1,9,1,7,-5,35],[1,9,1,7,-4,93],[1,9,1,7,-3,195],[1,9,1,7,-2,307],[1,9,1,7,-1,548],[1,9,1,7,0,857],[1,9,2,0,-8,0],[1,9,2,0,-7,0],[1,9,2,0,-6,0],[1,9,2,0,-5,1],[1,9,2,0,-4,2],[1,9,2,0,-3,5],[1,9,2,0,-2,13],[1,9,2,0,-1,37],[1,9,2,0,0,556],[1,9,2,1,-8,0],[1,9,2,1,-7,1],[1,9,2,1,-6,1],[1,9,2,1,-5,2],[1,9,2,1,-4,5],[1,9,2,1,-3,12],[1,9,2,1,-2,36],[1,9,2,1,-1,84],[1,9,2,1,0,586],[1,9,2,2,-8,0],[1,9,2,2,-7,0],[1,9,2,2,-6,1],[1,9,2,2,-5,1],[1,9,2,2,-4,5],[1,9,2,2,-3,9],[1,9,2,2,-2,39],[1,9,2,2,-1,126],[1,9,2,2,0,629],[1,9,2,3,-8,0],[1,9,2,3,-7,2],[1,9,2,3,-6,1],[1,9,2,3,-5,3],[1,9,2,3,-4,11],[1,9,2,3,-3,41],[1,9,2,3,-2,79],[1,9,2,3,-1,162],[1,9,2,3,0,639],[1,9,2,4,-8,0],[1,9,2,4,-7,0],[1,9,2,4,-6,0],[1,9,2,4,-5,2],[1,9,2,4,-4,5],[1,9,2,4,-3,15],[1,9,2,4,-2,49],[1,9,2,4,-1,162],[1,9,2,4,0,680],[1,9,2,5,-8,0],[1,9,2,5,-7,0],[1,9,2,5,-6,6],[1,9,2,5,-5,6],[1,9,2,5,-4,11],[1,9,2,5,-3,47],[1,9,2,5,-2,87],[1,9,2,5,-1,191],[1,9,2,5,0,679],[1,9,2,6,-8,0],[1,9,2,6,-7,0],[1,9,2,6,-6,4],[1,9,2,6,-5,11],[1,9,2,6,-4,4],[1,9,2,6,-3,48],[1,9,2,6,-2,136],[1,9,2,6,-1,211],[1,9,2,6,0,674],[1,9,2,7,-8,0],[1,9,2,7,-7,0],[1,9,2,7,-6,10],[1,9,2,7,-5,21],[1,9,2,7,-4,36],[1,9,2,7,-3,85],[1,9,2,7,-2,174],[1,9,2,7,-1,253],[1,9,2,7,0,682]];

const LG_WE_MAP = new Map();
for (const [h, inn, outs, bs, diff, permille] of LG_WE_TABLE) {
    LG_WE_MAP.set(`${h}_${inn}_${outs}_${bs}_${diff}`, permille);
}

// Same 3-bit encoding as LG_WE_TABLE's baseState column, built from the
// exact same occupied-bases set _buildBaseDiagram already computes.
function _lgBaseStateIndex(currentPlay) {
    const occupied = _lgOccupiedBases(currentPlay);
    return (occupied.has('1B') ? 1 : 0) + (occupied.has('2B') ? 2 : 0) + (occupied.has('3B') ? 4 : 0);
}

// Returns the home team's win probability (0-1) for the feed's current
// state, or null outside Live (Vera, D-117 Phase 6) — recomputed fresh
// every call from data _renderPanel already has, no module state, no new
// fetch (Axiom, D-117 Phase 6).
function _lgWinProbability(feed) {
    const status = feed.gameData?.status || {};
    if (status.abstractGameState !== 'Live') return null;

    const ls = feed.liveData?.linescore || {};
    if (ls.currentInning == null || ls.outs == null) return null;

    const currentPlay = feed.liveData?.plays?.currentPlay;
    const half        = ls.isTopInning ? 0 : 1;
    const inning      = Math.min(ls.currentInning, LG_WE_MAX_INNING);
    const outs         = Math.min(ls.outs, 2);
    const baseState    = _lgBaseStateIndex(currentPlay);
    const homeScore    = ls.teams?.home?.runs ?? 0;
    const awayScore    = ls.teams?.away?.runs ?? 0;

    let diff = Math.max(-LG_WE_MAX_DIFF, Math.min(LG_WE_MAX_DIFF, homeScore - awayScore));
    let permille = LG_WE_MAP.get(`${half}_${inning}_${outs}_${baseState}_${diff}`);
    while (permille === undefined && diff !== 0) {
        diff += diff > 0 ? -1 : 1;
        permille = LG_WE_MAP.get(`${half}_${inning}_${outs}_${baseState}_${diff}`);
    }
    if (permille === undefined) return null;

    return permille / 1000;
}

// D-117 Phase 6: split win-probability bar — primary content, sits between
// the linescore and the hero (Vera, D-117 Phase 6, same "not a sidebar
// fact" reasoning Phase 1 gave the hero). Reuses the hero avatar's own
// team-color-gradient-plus-fixed-white-text recipe (css/components.css
// .player-avatar) rather than a flat team-color fill, for the identical
// legibility reason: a flat fill in a light team color with white text
// would be unreadable, and gradient-over-dark keeps every team's color
// legible regardless of its own luminance (Kael, D-117 Phase 6).
function _buildWinProb(feed) {
    const homeProb = _lgWinProbability(feed);
    if (homeProb == null) return '';

    const home = feed.gameData?.teams?.home || {};
    const away = feed.gameData?.teams?.away || {};
    const homeClr = getMLBTeamColors(home.abbreviation)?.primary || 'var(--accent)';
    const awayClr = getMLBTeamColors(away.abbreviation)?.primary || 'var(--accent)';
    const homePct = Math.round(homeProb * 100);
    const awayPct = 100 - homePct;

    return `<div class="lg-winprob" role="group" aria-label="Win probability">
        <div class="lg-winprob-seg lg-winprob-seg--away" style="width:${awayPct}%;background:linear-gradient(135deg,${awayClr}cc,${awayClr}55)">
            <span class="lg-winprob-label">${_escHtml(away.abbreviation || '')} ${awayPct}%</span>
        </div>
        <div class="lg-winprob-seg lg-winprob-seg--home" style="width:${homePct}%;background:linear-gradient(135deg,${homeClr}cc,${homeClr}55)">
            <span class="lg-winprob-label">${_escHtml(home.abbreviation || '')} ${homePct}%</span>
        </div>
    </div>`;
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

// ── Phase 5 (D-117): Embedded player card ───────────────────
// Same single-instance-tracker pattern as _lgPitchTooltipEl. Reads
// entirely from _lgFeedCache's already-fetched boxscore — Relay's Phase 5
// reuse-point re-check confirmed seasonStats.{batting|pitching} (season
// line) and stats.{batting|pitching} (today's line, NOT .hitting) are
// both already present on every boxscore player entry, so this is zero
// new fetches. Season stats + today's line only — Trophy Case link
// explicitly excluded per owner direction 2026-08-23 (D-117 Phase 5).

function _lgFmtStat(v) {
    if (v === undefined || v === null || v === '' || v === '.---' || v === '-.--') return '—';
    return v;
}

function _buildPlayerCard(feed, playerId, side, role) {
    const boxscore = feed.liveData?.boxscore || {};
    const entry     = boxscore.teams?.[side]?.players?.[`ID${playerId}`];
    if (!entry) return '';

    const name     = entry.person?.fullName || '';
    const today    = entry.stats?.[role] || {};
    const season   = entry.seasonStats?.[role] || {};
    const hasToday = Object.keys(today).length > 0;

    const f = _lgFmtStat;
    const seasonLine = role === 'pitching'
        ? `${f(season.era)} ERA · ${f(season.whip)} WHIP · ${f(season.wins)}-${f(season.losses)} · ${f(season.strikeOuts)} K`
        : `${f(season.avg)} AVG · ${f(season.obp)} OBP · ${f(season.slg)} SLG · ${f(season.homeRuns)} HR · ${f(season.rbi)} RBI`;
    const todayLine = hasToday && today.summary
        ? today.summary
        : (role === 'pitching' ? 'No pitches yet today' : 'No at-bats yet');

    return `<div class="lg-player-card" role="dialog" aria-label="${_escHtml(name)} stats">
        <button type="button" class="lg-player-card-close" aria-label="Close player card">×</button>
        <div class="lg-player-card-name">${_escHtml(name)}</div>
        <div class="lg-hero-role">Season</div>
        <div class="lg-side-line">${_escHtml(seasonLine)}</div>
        <div class="lg-hero-role">Today</div>
        <div class="lg-side-line">${_escHtml(todayLine)}</div>
    </div>`;
}

function _lgShowPlayerCard(triggerEl, panel, feed, playerId, side, role) {
    if (_lgPlayerCardEl?._forTrigger === triggerEl) { _lgHidePlayerCard(); return; }
    _lgHidePlayerCard();

    const html = _buildPlayerCard(feed, playerId, side, role);
    if (!html) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const cardEl = wrap.firstElementChild;
    panel.appendChild(cardEl);
    cardEl._forTrigger = triggerEl;
    _lgPlayerCardEl = cardEl;

    const tr    = triggerEl.getBoundingClientRect();
    const pr    = panel.getBoundingClientRect();
    const cardH = cardEl.offsetHeight;
    const cardW = cardEl.offsetWidth;

    let top  = tr.bottom - pr.top + 6;
    let left = tr.left   - pr.left;
    if (top + cardH > pr.height) top = Math.max(0, tr.top - pr.top - cardH - 6);
    left = Math.max(0, Math.min(left, pr.width - cardW));

    cardEl.style.top  = `${top}px`;
    cardEl.style.left = `${left}px`;

    cardEl.querySelector('.lg-player-card-close')?.addEventListener('click', _lgHidePlayerCard);
}

function _lgHidePlayerCard() {
    if (_lgPlayerCardEl) {
        _lgPlayerCardEl.remove();
        _lgPlayerCardEl = null;
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

// D-117 Phase 4: current pitcher's consecutive-strikeout streak — reverse
// scan of allPlays filtered to this pitcher, same shape as
// _lgZoneGeom's "most recent pitch with a zone" reverse lookup. Recomputed
// fresh every render (no module state), so a pitching change naturally
// starts at zero — the new pitcher simply has no prior strikeouts under
// their own id (Axiom, D-117 Phase 4).
function _lgPitcherKStreak(allPlays, pitcherId) {
    if (!Array.isArray(allPlays) || pitcherId == null) return 0;
    let streak = 0;
    for (let i = allPlays.length - 1; i >= 0; i--) {
        const play = allPlays[i];
        if (play?.matchup?.pitcher?.id !== pitcherId) continue;
        if (play.result?.eventType === 'strikeout') { streak++; continue; }
        break;
    }
    return streak;
}

// Live-verified 2026-08-31 against a real game (SF @ ATL, gamePk 824911):
// currentPlay.matchup still points at the just-completed at-bat's batter/
// pitcher for the whole Middle/End window between half-innings — it only
// advances once the new half's first pitch is thrown. linescore.offense.batter
// and linescore.defense.pitcher, by contrast, are already correct in both
// states (checked byte-for-byte against currentPlay.matchup during a live
// at-bat, where they matched exactly) — offense/defense are the reliable
// source, not currentPlay. Team side is resolved by matching team id rather
// than isTopInning, since isTopInning is also "last-completed-half," not
// "upcoming half" (it stays true through Middle, false through End) — both
// windows live-verified against this same game (Middle of the 2nd via a
// captured-feed replay, End of the 3rd live in the browser minutes later).
function _lgCurrentMatchup(feed) {
    const ls      = feed.liveData?.linescore || {};
    const home    = feed.gameData?.teams?.home || {};
    const away    = feed.gameData?.teams?.away || {};
    const batter  = ls.offense?.batter;
    const pitcher = ls.defense?.pitcher;
    if (!batter?.id || !pitcher?.id) return null;
    const bSide = ls.offense?.team?.id === home.id ? 'home' : 'away';
    const pSide = bSide === 'home' ? 'away' : 'home';
    return {
        batterId: batter.id, batterName: batter.fullName || '',
        pitcherId: pitcher.id, pitcherName: pitcher.fullName || '',
        battingTeam: bSide === 'home' ? home : away,
        pitchingTeam: pSide === 'home' ? home : away,
        bSide, pSide,
    };
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
        // Page mode's pregame tab now renders full pitcher cards (headshot,
        // record, ERA/FIP/WHIP/K9/BB9) — this compact name-only hero would
        // just repeat the same two names above them. Keep it for the inline
        // accordion, where it's the only pregame content shown.
        if (_lgIsPageMode) return '';
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
    const matchup      = _lgCurrentMatchup(feed);
    if (!matchup) return '';

    const { batterId, pitcherId, batterName, pitcherName, battingTeam, pitchingTeam, bSide, pSide } = matchup;
    const batClr       = getMLBTeamColors(battingTeam?.abbreviation)?.primary  || 'var(--accent)';
    const pitClr       = getMLBTeamColors(pitchingTeam?.abbreviation)?.primary || 'var(--accent)';

    // Between half-innings, currentPlay still refers to the just-finished
    // at-bat — real for pitch count (a boxscore running total, keyed off the
    // now-correct pitcherId) but not for "last pitch": that pitch belongs to
    // whichever pitcher just finished the prior half, not the one about to
    // take the mound. Suppress it rather than mislabel it (Axiom, live debug
    // 2026-08-31).
    const ls          = feed.liveData?.linescore || {};
    const isBetweenInn = ls.inningState === 'Middle' || ls.inningState === 'End';

    // Pitcher line: today's pitch count + last-pitch velocity — both already
    // in hand from data this poll already fetched, zero new requests.
    const boxscore   = feed.liveData?.boxscore || {};
    const pStats     = boxscore.teams?.[pSide]?.players?.[`ID${pitcherId}`]?.stats?.pitching || {};
    const pitchCount = pStats.numberOfPitches ?? '—';
    const pitchesThrown = isBetweenInn ? [] : (currentPlay?.playEvents || []).filter(e => e.isPitch);
    const lastVelo    = pitchesThrown.length ? pitchesThrown[pitchesThrown.length - 1].startSpeed : null;

    // D-117 Phase 4: K-streak only shows at 2+ — a single strikeout isn't
    // a "streak" in the broadcast sense this feature models (Vera, D-117 Phase 4).
    const kStreak     = _lgPitcherKStreak(feed.liveData?.plays?.allPlays, pitcherId);
    const kStreakNote = kStreak >= 2 ? ` · ${kStreak} K streak` : '';

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
                <button type="button" class="lg-hero-name lg-player-name-trigger" data-player-id="${batterId}" data-player-side="${bSide}" data-player-role="batting">${_escHtml(batterName)}</button>
                <div class="lg-hero-stat" data-hero-batter-stat>${_escHtml(battingStatHtml)}</div>
            </div>
        </div>
        <div class="lg-hero-divider"></div>
        <div class="lg-hero-side">
            <div class="player-avatar lg-hero-badge" style="background:linear-gradient(135deg,${pitClr}cc,${pitClr}55)">${_lgInitial(pitcherName)}</div>
            <div class="lg-hero-body">
                <div class="lg-hero-role">Pitching</div>
                <button type="button" class="lg-hero-name lg-player-name-trigger" data-player-id="${pitcherId}" data-player-side="${pSide}" data-player-role="pitching">${_escHtml(pitcherName)}</button>
                <div class="lg-hero-stat">${pitchCount} pitches${lastVelo ? ` · ${lastVelo} mph` : ''}${kStreakNote}</div>
            </div>
        </div>
        ${delayNote}
    </div>`;
}

// Kicks off the cached season-line fetch for the current batter (if not
// already cached) and patches just the stat-line node when it resolves —
// guarded against a batter change mid-flight (Axiom, D-117 Phase 1).
function _lgMaybeFetchHeroBatterLine(feed, panel) {
    const batterId = _lgCurrentMatchup(feed)?.batterId;
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

    const matchup  = _lgCurrentMatchup(feed);
    const batterId = matchup?.batterId;
    if (!batterId) return '';

    const boxscore = feed.liveData?.boxscore || {};
    const side      = matchup.bSide;
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
            <button type="button" class="lg-dueup-name lg-player-name-trigger" data-player-id="${pid}" data-player-side="${side}" data-player-role="batting">${_escHtml(nm)}</button>
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
let _lgSeasonSeriesHtml    = '';
let _lgSidebarExtrasGamePk = null;

async function _lgFetchSidebarExtras(gamePk, awayTeamId, homeTeamId, awayAbbr, homeAbbr) {
    const [standingsHtml, leadersHtml, seriesHtml] = await Promise.all([
        _lgBuildMiniStandings(homeAbbr, awayAbbr),
        _lgBuildMiniLeaders(),
        _lgBuildSeasonSeries(awayTeamId, homeTeamId, awayAbbr, homeAbbr),
    ]);
    if (_lgSidebarExtrasGamePk !== String(gamePk)) return; // superseded by a different game
    _lgMiniStandingsHtml = standingsHtml;
    _lgMiniLeadersHtml   = leadersHtml;
    _lgSeasonSeriesHtml  = seriesHtml;
    const el = document.querySelector('.lg-sidebar');
    if (el && _lgFeedCache) el.innerHTML = _lgMiniStandingsHtml + _lgSeasonSeriesHtml + _lgMiniLeadersHtml + _buildSidebar(_lgFeedCache);
}

// Season series — head-to-head record between these two teams this season,
// visualized as a split bar (same recipe as .lg-winprob: one bar, two
// team-colored segments sized by win share) rather than a text line, per
// owner direction (2026-09-02). MLB's schedule endpoint supports a direct
// teamId+opponentId head-to-head filter — live-verified (NYM/PHI, 2026
// season: 13 scheduled meetings, 9 already Final, isWinner present and
// correct on both sides of every completed game) — so this is one fetch,
// not a client-side join across each team's full schedule.
async function _lgBuildSeasonSeries(awayTeamId, homeTeamId, awayAbbr, homeAbbr) {
    if (!awayTeamId || !homeTeamId) return '';
    try {
        const data = await mlbFetch('/schedule', {
            sportId: 1, season: MLB_SEASON, teamId: awayTeamId, opponentId: homeTeamId, gameType: 'R',
        }, ApiCache.TTL.MEDIUM);
        const games = (data.dates || []).flatMap(d => d.games || []);

        let awayWins = 0, homeWins = 0;
        for (const g of games) {
            if (g.status?.abstractGameState !== 'Final') continue;
            const gAway = g.teams?.away, gHome = g.teams?.home;
            if (gAway?.team?.id === awayTeamId) {
                if (gAway.isWinner) awayWins++; else if (gHome?.isWinner) homeWins++;
            } else if (gHome?.team?.id === awayTeamId) {
                if (gHome.isWinner) awayWins++; else if (gAway?.isWinner) homeWins++;
            }
        }
        const total = awayWins + homeWins;
        if (!total) return '';

        const awayClr = getMLBTeamColors(awayAbbr)?.primary || 'var(--text-muted)';
        const homeClr = getMLBTeamColors(homeAbbr)?.primary || 'var(--text-muted)';
        const awayPct = (awayWins / total * 100).toFixed(1);
        const homePct = (100 - awayPct).toFixed(1);

        return `<div class="lg-side-card">
            <div class="lg-box-section-title">Season Series</div>
            <div class="lg-series-bar" role="group" aria-label="Season series ${_escHtml(awayAbbr)} ${awayWins}, ${_escHtml(homeAbbr)} ${homeWins}">
                <div class="lg-series-seg" style="width:${awayPct}%;background:linear-gradient(135deg,${awayClr}cc,${awayClr}55)">
                    ${awayWins ? `<span class="lg-series-label">${_escHtml(awayAbbr)} ${awayWins}</span>` : ''}
                </div>
                <div class="lg-series-seg" style="width:${homePct}%;background:linear-gradient(135deg,${homeClr}cc,${homeClr}55)">
                    ${homeWins ? `<span class="lg-series-label">${_escHtml(homeAbbr)} ${homeWins}</span>` : ''}
                </div>
            </div>
        </div>`;
    } catch (err) {
        Logger.warn('Season series fetch failed', err, 'LIVE');
        return '';
    }
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
    // Sourced from _lgCurrentMatchup (linescore.offense/defense), not
    // currentPlay.matchup — same stale-pairing bug as the hero card/Due Up
    // rail (fixed 2026-08-31, see ISSUES.md), left open here at the time
    // pending "a future pass." currentPlay.matchup doesn't advance until the
    // new half's first pitch, so during the Middle/End window it still names
    // the batter/pitcher from the at-bat that just ended.
    const currentPlay = feed.liveData?.plays?.currentPlay;
    const matchup      = _lgCurrentMatchup(feed);
    if (!matchup) return '<div class="lg-pbp-empty">No at-bat in progress.</div>';

    const batterId    = matchup.batterId;
    const pitcherId   = matchup.pitcherId;
    const batterName  = _escHtml(matchup.batterName  || '');
    const pitcherName = _escHtml(matchup.pitcherName || '');
    const isBetweenInn = ['Middle', 'End'].includes(feed.liveData?.linescore?.inningState);

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

    // Block 2 — This At-Bat (only if pitches thrown). Skipped entirely
    // between innings: currentPlay.playEvents still belongs to the at-bat
    // that just ended, not the new batter named above, so showing it here
    // would attribute the old at-bat's pitch count to the new matchup.
    const pitches = (!isBetweenInn ? (currentPlay?.playEvents || []) : []).filter(e => e.isPitch);
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
    _lgHidePlayerCard();
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
        // Guard on the active tab, not just the feed — found live 2026-09-02:
        // clicking away to another tab before this async H2H/arsenal fetch
        // resolves let the stale promise overwrite whatever tab the user had
        // since switched to (the feed-only guard doesn't change on a tab
        // switch, only on the next poll).
        _buildMatchupContent(feed).then(html => {
            if (_lgFeedCache === feed && _lgTabMap.get(gamePk) === 'matchup') tabpanel.innerHTML = html;
        }).catch(err => {
            Logger.warn('Matchup content failed', err, 'LIVE');
            if (_lgFeedCache === feed && _lgTabMap.get(gamePk) === 'matchup') tabpanel.innerHTML = '<div class="lg-matchup-empty">Matchup data unavailable.</div>';
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
        // Equality, not just truthiness — a second showMLBLiveGame/
        // openLiveGamePanel call for a DIFFERENT game before this poll
        // resolves already reassigned _lgGamePk, so a bare truthy check
        // here would still arm a second interval on top of that newer
        // call's own, leaking an orphaned duplicate poller for the
        // session (found during the D-117 debug pass, 2026-08-31). Also
        // skips arming for a game that's already Final on this first poll
        // (see _lgShouldArmPolling) — a deep link straight to a finished
        // game otherwise polled it forever every 9s.
        if (_lgShouldArmPolling(gamePk)) _lgInterval = setInterval(() => _doPoll(_lgGamePk), _lgNextInterval(_lgFeedCache));
    });
}

// ── Global exports ────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.openLiveGamePanel   = openLiveGamePanel;
    window.stopLiveGamePolling = stopLiveGamePolling;
    window.showMLBLiveGame     = showMLBLiveGame;
}
