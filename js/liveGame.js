// ============================================================
// Live Game Expanded View — js/liveGame.js
//
// Inline accordion that opens below a live game card in the
// Scores tab. Polls /game/{gamePk}/linescore every 9s and
// fetches /game/{gamePk}/feed/live only on state change.
//
// Globals used from mlb.js (load order dependency):
//   _mlbProxyUrl(url)      — routes through Cloudflare proxy
//   MLB_USE_PROXY          — true in production
//   MLB_BASE_URL_V11       — 'https://statsapi.mlb.com/api/v1.1' (feed/live only)
//   getMLBTeamColors(abbr)
//   getMLBTeamLogoUrl(id)
//   _escHtml(str)
//   Logger
//
// Phase 0 API findings (Finn, 2026-06-04):
//   - feed/live requires v1.1, NOT v1 (v1 returns 404). All other endpoints use v1.
//   - Strike zone bounds are at playEvents[n].pitchData.strikeZoneTop/Bottom,
//     NOT at currentPlay.matchup.batterStrikeZoneTop (that field does not exist).
//   - Pitch events filtered via e.isPitch === true (not e.type === 'pitch').
//   - battingOrder: array of numeric player IDs. Player data keyed as players['ID'+id].
//   - pitchers: array of numeric pitcher IDs in same teams.{home|away}.pitchers array.
//   - innings[n] shape: { num, ordinalNum, home: { runs, hits, errors }, away: {...} }
//
// navigateTo() in navigation.js calls stopLiveGamePolling()
// before routing — this file must define that function globally.
// ============================================================

// ── Module state ─────────────────────────────────────────────
let _lgInterval    = null;   // active setInterval handle
let _lgGamePk      = null;   // currently expanded gamePk
let _lgFailures    = 0;      // consecutive poll failure count
let _lgLastState   = null;   // last linescore state key for diff
let _lgTabMap      = new Map(); // gamePk → active tab id
let _lgFeedCache   = null;   // last feed/live payload
let _lgTriggerEl   = null;   // card element that opened the panel (focus return on close)
let _lgPrevScores  = null;   // { away, home } for score-change flash detection

const LG_POLL_MS        = 9000;
const LG_BETWEEN_INN_MS = 20000;
const LG_PREGAME_MS     = 60000;

// ── Public API ───────────────────────────────────────────────

function stopLiveGamePolling() {
    if (_lgInterval) {
        clearInterval(_lgInterval);
        _lgInterval  = null;
    }
    _lgGamePk    = null;
    _lgLastState = null;
    _lgFailures  = 0;
    _lgFeedCache  = null;
    _lgPrevScores = null;
}

// Expand the live game panel below a game card.
// gamePk: number | string
// game:   game object from AppState.mlbGames (has teams, linescore, status)
// cardEl: the .game-card DOM element that was clicked
async function openLiveGamePanel(gamePk, game, cardEl) {
    // Close any open panel first
    _closeExistingPanel();

    _lgGamePk    = String(gamePk);
    _lgFeedCache = null;
    _lgTriggerEl = cardEl;

    // Inject skeleton panel immediately (synchronous)
    const panel = _buildSkeletonPanel(game);
    cardEl.insertAdjacentElement('afterend', panel);
    panel.focus();

    // Escape key closes the panel
    panel.addEventListener('keydown', e => {
        if (e.key === 'Escape') _closeExistingPanel();
    });

    // Start polling
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
        const lsRes = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(lsUrl) : lsUrl);
        if (!lsRes.ok) throw new Error(`Linescore ${lsRes.status}`);
        const ls = await lsRes.json();

        _lgFailures = 0;
        _updateBadge(panel, 'live');

        const stateKey = `${ls.currentInning}|${ls.inningState}|${ls.teams?.away?.runs}|${ls.teams?.home?.runs}`;
        if (stateKey === _lgLastState) return; // nothing changed
        _lgLastState = stateKey;

        // State changed — fetch full feed (v1.1 required — v1 returns 404)
        const feedUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
        const feedRes = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(feedUrl) : feedUrl);
        if (!feedRes.ok) throw new Error(`Feed ${feedRes.status}`);
        const feed = await feedRes.json();
        _lgFeedCache = feed;

        const prevPbpCount = panel.querySelectorAll('.lg-pbp-entry').length;
        const curAway      = ls.teams?.away?.runs ?? 0;
        const curHome      = ls.teams?.home?.runs ?? 0;
        _renderPanel(panel, feed, gamePk);
        _animateNewPlays(panel, prevPbpCount);

        // Flash score digit when a team scores (compare against last known state)
        if (_lgPrevScores) {
            if (curAway > _lgPrevScores.away) _flashScore(panel, 'away');
            if (curHome > _lgPrevScores.home) _flashScore(panel, 'home');
        }
        _lgPrevScores = { away: curAway, home: curHome };

        // Stop polling if game ended
        if (feed.gameData?.status?.abstractGameState === 'Final') {
            stopLiveGamePolling();
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
    panel.className  = 'lg-panel';
    panel.tabIndex   = -1;
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
            <button class="lg-close-btn" onclick="stopLiveGamePolling();this.closest('.lg-panel').remove()" aria-label="Collapse game view">×</button>
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
        <div class="mlb-group-toggle-row lg-tabs" role="tablist">
            <button class="mlb-group-btn mlb-group-btn--active" role="tab" id="lg-tab-pbp" aria-selected="true"  aria-controls="lg-tabpanel" data-lg-tab="pbp">Play-by-Play</button>
            <button class="mlb-group-btn"                        role="tab" id="lg-tab-box" aria-selected="false" aria-controls="lg-tabpanel" data-lg-tab="box">Box Score</button>
        </div>
        <div class="lg-tab-content" role="tabpanel" id="lg-tabpanel" aria-labelledby="lg-tab-pbp">
            <div class="skeleton-line" style="height:14px;margin:0.4rem 0;width:90%"></div>
            <div class="skeleton-line" style="height:14px;margin:0.4rem 0;width:75%"></div>
            <div class="skeleton-line" style="height:14px;margin:0.4rem 0;width:82%"></div>
            <div class="skeleton-line" style="height:14px;margin:0.4rem 0;width:60%"></div>
        </div>`;

    // Wire tab clicks
    panel.querySelectorAll('[data-lg-tab]').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(panel, btn.dataset.lgTab, String(_lgGamePk)));
    });

    // Arrow-key navigation between tabs (ARIA tabs pattern)
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

    const isFinal   = status.abstractGameState === 'Final';
    const isDelayed = /delay|suspend/i.test(status.detailedState || '');
    const homeScore = ls.teams?.home?.runs ?? '—';
    const awayScore = ls.teams?.away?.runs ?? '—';
    const homeWon   = isFinal && homeScore > awayScore;
    const awayWon   = isFinal && awayScore > homeScore;
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
        <button class="lg-close-btn" onclick="stopLiveGamePolling();this.closest('.lg-panel').remove()" aria-label="Collapse game view">×</button>
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

    panel.querySelector('.lg-close-btn')?.addEventListener('click', () => {
        stopLiveGamePolling();
        panel.remove();
    });

    panel.querySelector('.lg-linescore-wrap').innerHTML = _buildLinescore(ls, away.abbreviation, home.abbreviation);

    const activeTab = _lgTabMap.get(String(gamePk)) || 'pbp';
    panel.querySelectorAll('[data-lg-tab]').forEach(btn => {
        const isActive = btn.dataset.lgTab === activeTab;
        btn.classList.toggle('mlb-group-btn--active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });

    const tabpanel = panel.querySelector('.lg-tab-content');
    if (tabpanel) tabpanel.setAttribute('aria-labelledby', `lg-tab-${activeTab}`);

    tabpanel.innerHTML = activeTab === 'pbp'
        ? _buildPbp(plays.allPlays || [])
        : _buildBoxScore(boxscore, away.abbreviation, home.abbreviation);
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
            const inn = innings.find(n => n.num === i);
            const val = inn?.[side]?.runs;
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
            const desc     = _escHtml(play.result?.description || '');
            const isScore  = play.about?.isScoringPlay;
            const isHR     = play.result?.eventType === 'home_run';
            const score    = isScore ? ` <span class="lg-pbp-score">${play.result?.awayScore}–${play.result?.homeScore}</span>` : '';
            const cls      = `lg-pbp-entry${isScore ? ' lg-pbp-entry--scoring' : ''}${isHR ? ' lg-pbp-entry--hr' : ''}`;
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
            const p  = players[`ID${pid}`] || {};
            const s  = p.stats?.pitching || {};
            const nm = _escHtml(p.person?.lastName || p.person?.fullName || '');
            const decision = p.gameStatus?.isCurrentPitcher ? '<span class="lg-box-active">▶</span> ' : '';
            html += `<tr>
                <td>${decision}${nm}</td>
                <td>${s.inningsPitched ?? '—'}</td><td>${s.hits ?? '—'}</td><td>${s.runs ?? '—'}</td>
                <td>${s.earnedRuns ?? '—'}</td><td>${s.baseOnBalls ?? '—'}</td><td>${s.strikeOuts ?? '—'}</td>
            </tr>`;
        }
        html += '</tbody></table>';
    }
    return html + '</div>';
}

function _switchTab(panel, tabId, gamePk) {
    _lgTabMap.set(gamePk, tabId);
    panel.querySelectorAll('[data-lg-tab]').forEach(btn => {
        const active = btn.dataset.lgTab === tabId;
        btn.classList.toggle('mlb-group-btn--active', active);
        btn.setAttribute('aria-selected', String(active));
    });
    const tabpanel = panel.querySelector('.lg-tab-content');
    if (tabpanel) tabpanel.setAttribute('aria-labelledby', `lg-tab-${tabId}`);
    if (_lgFeedCache) {
        const feed  = _lgFeedCache;
        const away  = feed.gameData?.teams?.away?.abbreviation || '';
        const home  = feed.gameData?.teams?.home?.abbreviation || '';
        panel.querySelector('.lg-tab-content').innerHTML = tabId === 'pbp'
            ? _buildPbp(feed.liveData?.plays?.allPlays || [])
            : _buildBoxScore(feed.liveData?.boxscore || {}, away, home);
    }
}

function _updateBadge(panel, state) {
    const badge = panel?.querySelector('.lg-status-badge');
    if (!badge) return;
    if (state === 'live')        { badge.className = 'game-status game-status--live lg-status-badge'; badge.innerHTML = '<span class="live-dot"></span>LIVE'; }
    else if (state === 'reconnecting') { badge.className = 'game-status game-status--sched lg-status-badge'; badge.textContent = 'RECONNECTING…'; }
    else if (state === 'unavailable')  { badge.className = 'game-status game-status--sched lg-status-badge'; badge.textContent = 'DATA UNAVAILABLE'; }
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
    const entries = panel.querySelectorAll('.lg-pbp-entry');
    const newCount = entries.length - prevCount;
    for (let i = 0; i < Math.min(newCount, entries.length); i++) {
        entries[i].classList.add('lg-pbp-entry--new');
    }
}

// ── Global exports ────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.openLiveGamePanel  = openLiveGamePanel;
    window.stopLiveGamePolling = stopLiveGamePolling;
}
