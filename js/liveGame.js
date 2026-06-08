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
    _lgGamePk         = null;
    _lgLastState      = null;
    _lgFailures       = 0;
    _lgFeedCache      = null;
    _lgPrevScores     = null;
    _lgLastPitcherId  = null;
    _lgH2HCache       = {};
}

// Expand the live game panel below a game card.
// gamePk: number | string
// game:   game object from AppState.mlbGames (has teams, linescore, status)
// cardEl: the .game-card DOM element that was clicked
async function openLiveGamePanel(gamePk, game, cardEl) {
    _closeExistingPanel();

    _lgGamePk    = String(gamePk);
    _lgFeedCache = null;
    _lgTriggerEl = cardEl;

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

async function _doPoll(gamePk) {
    if (!gamePk) return;
    const panel = document.querySelector('.lg-panel');
    if (!panel) { stopLiveGamePolling(); return; }

    try {
        const lsUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`;
        const lsRes = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(lsUrl) : lsUrl, { signal: AbortSignal.timeout(10_000) });
        if (!lsRes.ok) throw new Error(`Linescore ${lsRes.status}`);
        const ls = await lsRes.json();

        _lgFailures = 0;
        _updateBadge(panel, 'live');

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

        const isFinalNow   = feed.gameData?.status?.abstractGameState === 'Final';
        const isDelayedNow = /delay|suspend/i.test(feed.gameData?.status?.detailedState || '');
        const isBetweenNow = ls.inningState === 'Middle' || ls.inningState === 'End';

        if (isFinalNow) { stopLiveGamePolling(); return; }

        const newMs = isDelayedNow ? 60000 : isBetweenNow ? LG_BETWEEN_INN_MS : LG_POLL_MS;
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
        <div class="lg-body">
            <div class="lg-zone-col" hidden></div>
            <div class="lg-tab-col">
                <div class="mlb-group-toggle-row lg-tabs" role="tablist">
                    <button class="mlb-group-btn mlb-group-btn--active" role="tab" id="lg-tab-pbp"     aria-selected="true"  aria-controls="lg-tabpanel" data-lg-tab="pbp">Play-by-Play</button>
                    <button class="mlb-group-btn"                        role="tab" id="lg-tab-box"     aria-selected="false" aria-controls="lg-tabpanel" data-lg-tab="box">Box Score</button>
                    <button class="mlb-group-btn"                        role="tab" id="lg-tab-matchup" aria-selected="false" aria-controls="lg-tabpanel" data-lg-tab="matchup">Matchup</button>
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

    let badgeHtml;
    if (isFinal)        badgeHtml = `<span class="game-status game-status--final lg-status-badge">FINAL</span>`;
    else if (isDelayed) badgeHtml = `<span class="game-status game-status--sched lg-status-badge">DELAYED</span>`;
    else                badgeHtml = `<span class="game-status game-status--live lg-status-badge"><span class="live-dot"></span>LIVE</span>`;

    const scorecardLink = isFinal
        ? `<a class="lg-scorecard-link" href="#mlb-scorecard-${gamePk}">Full scorecard →</a>`
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
            ${!isFinal ? `<span class="lg-inning">${half}${inning}</span><span class="lg-count-pill">${isBetweenInn ? '—' : `${balls}-${strikes} · ${outs} Out${outs !== 1 ? 's' : ''}`}</span>` : ''}
            ${badgeHtml}
            ${scorecardLink}
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

    // Phase 2: pitch zone + base diagram
    const currentPlay = plays.currentPlay;
    const pitches     = (currentPlay?.playEvents || []).filter(e => e.isPitch);
    const zoneCol     = panel.querySelector('.lg-zone-col');
    if (zoneCol) {
        if (currentPlay?.matchup && pitches.length > 0) {
            zoneCol.removeAttribute('hidden');
            _lgHideTooltip();
            zoneCol.innerHTML =
                `<div class="lg-zone-section-label">Pitch Zone</div>` +
                _buildPitchZone(currentPlay) +
                `<div class="lg-zone-section-label" style="margin-top:var(--space-2)">Bases</div>` +
                _buildBaseDiagram(currentPlay);
            _wireZoneEvents(panel);
        } else {
            zoneCol.setAttribute('hidden', '');
            zoneCol.innerHTML = '';
        }
    }

    const activeTab = _lgTabMap.get(String(gamePk)) || 'pbp';
    panel.querySelectorAll('[data-lg-tab]').forEach(btn => {
        const isActive = btn.dataset.lgTab === activeTab;
        btn.classList.toggle('mlb-group-btn--active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });

    const tabpanel = panel.querySelector('.lg-tab-content');
    if (tabpanel) tabpanel.setAttribute('aria-labelledby', `lg-tab-${activeTab}`);

    if (activeTab === 'pbp') {
        tabpanel.innerHTML = _buildPbp(plays.allPlays || []);
    } else if (activeTab === 'box') {
        tabpanel.innerHTML = _buildBoxScore(boxscore, away.abbreviation, home.abbreviation);
    }
    // matchup tab: don't auto-rebuild on poll — tab click handles the async fetch
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

// ── Phase 2: Pitch zone SVG ───────────────────────────────────

function _lgSvgCoords(pX, pZ) {
    return {
        x: +(50 + (pX / 2.5) * 50).toFixed(1),
        y: +(130 - ((pZ - 0.5) / 4.5) * 120).toFixed(1),
    };
}

function _buildPitchZone(currentPlay) {
    const playEvents = currentPlay?.playEvents || [];
    const pitches    = playEvents.filter(e => e.isPitch);

    // Zone bounds from last pitch that has strikeZoneTop
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

    // 3×3 inner grid — divides zone into 9 MLB-standard zones
    const gw = +(zw / 3).toFixed(1);
    const gh = +(zh / 3).toFixed(1);
    const gridHtml =
        `<line x1="${+(zx + gw).toFixed(1)}"   y1="${zy.toFixed(1)}"        x2="${+(zx + gw).toFixed(1)}"   y2="${+(zy + zh).toFixed(1)}" class="lg-zone-grid"/>` +
        `<line x1="${+(zx + gw * 2).toFixed(1)}" y1="${zy.toFixed(1)}"       x2="${+(zx + gw * 2).toFixed(1)}" y2="${+(zy + zh).toFixed(1)}" class="lg-zone-grid"/>` +
        `<line x1="${zx.toFixed(1)}"             y1="${+(zy + gh).toFixed(1)}" x2="${+(zx + zw).toFixed(1)}"  y2="${+(zy + gh).toFixed(1)}" class="lg-zone-grid"/>` +
        `<line x1="${zx.toFixed(1)}"             y1="${+(zy + gh * 2).toFixed(1)}" x2="${+(zx + zw).toFixed(1)}" y2="${+(zy + gh * 2).toFixed(1)}" class="lg-zone-grid"/>`;

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
        const result    = _escHtml(p.details?.call?.description || '—');
        const countStr  = `${p.count?.balls ?? '?'}-${p.count?.strikes ?? '?'} count`;
        const ariaLabel = _escHtml(`Pitch ${i + 1}: ${pitchType} ${velocity} — ${result}`);

        // CSS classes carry all fill/stroke via liveGame.css — SVG presentation
        // attributes don't resolve CSS custom properties, so we rely on CSS only.
        dotsHtml += `<g class="lg-dot-group lg-dot--${category}" tabindex="0" role="button"
            aria-label="${ariaLabel}"
            data-pitch-type="${pitchType}"
            data-velocity="${_escHtml(velocity)}"
            data-result="${result}"
            data-count="${_escHtml(countStr)}">
            <circle cx="${cx}" cy="${cy}" r="4"/>
            <circle cx="${cx}" cy="${cy}" r="7" class="lg-dot-focus-ring"/>
            <text class="lg-dot-text" x="${cx}" y="${cy}" font-size="5" text-anchor="middle" dominant-baseline="central">${i + 1}</text>
        </g>`;
    }

    return `<div class="lg-zone-wrap">
        <svg class="lg-pitch-zone" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" aria-label="Pitch zone diagram for current at-bat">
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
        _escHtml(groupEl.dataset.velocity),
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

function _wireZoneEvents(panel) {
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

// ── Global exports ────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.openLiveGamePanel   = openLiveGamePanel;
    window.stopLiveGamePolling = stopLiveGamePolling;
}
