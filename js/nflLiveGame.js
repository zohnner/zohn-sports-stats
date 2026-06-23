// ============================================================
// NFL Live Game viewer (D-030) — expanded game panel with live polling.
// Mirrors the MLB liveGame experience for NFL: linescore by quarter, live
// possession / down & distance, scoring-play feed, team-stat comparison, and a
// passing/rushing/receiving box score. Data: ESPN summary via /api/nfl?path=/summary.
// Polls every 20s while a game is in progress; self-stops when the user leaves
// the view or the game goes final.
// ============================================================

const _nlg = { eventId: null, timer: null };

async function fetchNFLSummary(eventId) {
    const r = await fetch(`/api/nfl?path=/summary&event=${encodeURIComponent(eventId)}`);
    if (!r.ok) throw new Error(`summary ${r.status}`);
    return r.json();
}

function _nlgStop() {
    if (_nlg.timer) { clearInterval(_nlg.timer); _nlg.timer = null; }
}

async function showNFLGame(eventId) {
    _nlgStop();
    _nlg.eventId = eventId;
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'player-detail-container'; grid.style.cssText = '';
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('nfl-games', 'Game');
    grid.innerHTML = `<div class="nlg-loading"><div class="skeleton-line" style="height:48px;width:60%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Loading game…</p></div>`;
    try {
        const data = await fetchNFLSummary(eventId);
        _nlgRender(data);
        _nlgMaybePoll(data);
    } catch (err) {
        if (window.ErrorHandler && ErrorHandler.handle) ErrorHandler.handle(grid, err, () => showNFLGame(eventId), { tag: 'NFL', title: 'Failed to Load Game' });
        else grid.innerHTML = `<div class="nlg-empty"><p>Couldn't load this game.</p><button class="md-btn" onclick="navigateTo('nfl-games')">Back to scores</button></div>`;
        if (window.Logger) Logger.warn('nfl summary failed', err, 'NFL');
    }
}

function _nlgMaybePoll(data) {
    const state = _nlgState(data);
    _nlgStop();
    if (state !== 'in') return;
    _nlg.timer = setInterval(async () => {
        if (AppState.currentView !== 'nfl-game-' + _nlg.eventId) { _nlgStop(); return; }
        try {
            const d = await fetchNFLSummary(_nlg.eventId);
            _nlgRender(d);
            if (_nlgState(d) !== 'in') _nlgStop();
        } catch (_) { /* keep last render */ }
    }, 20000);
}

function _nlgState(data) {
    const c = data && data.header && data.header.competitions && data.header.competitions[0];
    return (c && c.status && c.status.type && c.status.type.state) || 'post';
}

function _nlgComp(data) { return data.header.competitions[0]; }
function _nlgSide(comp, ha) { return (comp.competitors || []).find(c => c.homeAway === ha) || {}; }

function _nlgRender(data) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = ''; grid.style.cssText = '';
    const comp = _nlgComp(data);
    const home = _nlgSide(comp, 'home'), away = _nlgSide(comp, 'away');
    const st = (comp.status && comp.status.type) || {};
    const state = st.state || 'post';
    const live = state === 'in';
    const statusText = st.shortDetail || st.detail || (state === 'pre' ? 'Scheduled' : 'Final');
    const venue = (data.gameInfo && data.gameInfo.venue && data.gameInfo.venue.fullName) || '';
    const tc = (abbr) => (typeof getNFLTeamColor === 'function' && getNFLTeamColor(abbr)) || 'var(--accent)';

    const teamBlock = (c, align) => {
        const t = c.team || {};
        const logo = (t.logos && t.logos[0] && t.logos[0].href) || (typeof getNFLTeamLogoUrl === 'function' ? getNFLTeamLogoUrl(t.abbreviation) : '');
        const rec = (c.records && c.records[0] && c.records[0].summary) || (Array.isArray(c.record) ? (c.record[0] && c.record[0].summary) : '') || '';
        const won = state === 'post' && c.winner;
        return `<button class="nlg-team nlg-team--${align}" onclick="${_nlgNav(t.abbreviation)}" style="--tc:${tc(t.abbreviation)}">
            <img src="${_escHtml(logo)}" alt="" data-hide-on-error>
            <span class="nlg-team-abbr">${_escHtml(t.abbreviation || '')}</span>
            <span class="nlg-team-name">${_escHtml(t.shortDisplayName || t.name || '')}</span>
            ${rec ? `<span class="nlg-team-rec">${_escHtml(rec)}</span>` : ''}
            <span class="nlg-team-score ${won ? 'nlg-team-score--win' : ''}">${c.score != null ? c.score : ''}</span>
        </button>`;
    };

    const possId = live && comp.situation ? comp.situation.possession : null;
    const sitLine = live && comp.situation
        ? `<div class="nlg-situation">
             ${comp.situation.possessionText ? `<span class="nlg-poss">🏈 ${_escHtml(comp.situation.possessionText)}</span>` : ''}
             ${comp.situation.downDistanceText ? `<span class="nlg-dd">${_escHtml(comp.situation.downDistanceText)}</span>` : ''}
             ${comp.situation.lastPlay && comp.situation.lastPlay.text ? `<span class="nlg-lastplay">${_escHtml(comp.situation.lastPlay.text)}</span>` : ''}
           </div>`
        : '';

    grid.innerHTML = `
      <div class="nlg-wrap">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <button onclick="navigateTo('nfl-games')" class="back-button">← Scores</button>
          ${live ? `<span class="nlg-livebadge">● LIVE</span>` : ''}
        </div>
        <div class="nlg-score ${live ? 'nlg-score--live' : ''}">
          ${teamBlock(away, 'away')}
          <div class="nlg-center">
            <div class="nlg-status ${live ? 'nlg-status--live' : ''}">${_escHtml(statusText)}</div>
            <div class="nlg-vs">@</div>
          </div>
          ${teamBlock(home, 'home')}
        </div>
        ${sitLine}
        ${_nlgLinescore(comp, home, away)}
        ${_nlgScoringFeed(data)}
        ${_nlgTeamStats(data, home, away)}
        ${_nlgBoxScore(data, home, away)}
        ${venue ? `<p class="pct-caption">${_escHtml(venue)} · data via ESPN</p>` : `<p class="pct-caption">Data via ESPN</p>`}
      </div>`;
}

function _nlgLinescore(comp, home, away) {
    const ls = (c) => (c.linescores || []).map(l => (l.value != null ? l.value : (l.displayValue || 0)));
    const h = ls(home), a = ls(away);
    const n = Math.max(h.length, a.length, 4);
    if (!h.length && !a.length) return '';
    const qLabels = []; for (let i = 0; i < n; i++) qLabels.push(i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3));
    const row = (c, arr) => `<tr><td class="nlg-ls-team">${_escHtml((c.team || {}).abbreviation || '')}</td>
        ${qLabels.map((_, i) => `<td>${arr[i] != null ? arr[i] : '-'}</td>`).join('')}
        <td class="nlg-ls-total">${c.score != null ? c.score : ''}</td></tr>`;
    return `<div class="nlg-card"><table class="nlg-ls">
        <thead><tr><th></th>${qLabels.map(q => `<th>${q}</th>`).join('')}<th>T</th></tr></thead>
        <tbody>${row(away, a)}${row(home, h)}</tbody></table></div>`;
}

function _nlgScoringFeed(data) {
    const plays = data.scoringPlays || [];
    if (!plays.length) return '';
    const rows = plays.map(p => {
        const t = p.team || {};
        const logo = (typeof getNFLTeamLogoUrl === 'function') ? getNFLTeamLogoUrl(t.abbreviation) : '';
        const q = p.period && p.period.number ? (p.period.number <= 4 ? 'Q' + p.period.number : 'OT') : '';
        const clk = p.clock && p.clock.displayValue ? p.clock.displayValue : '';
        return `<div class="nlg-play">
            <span class="nlg-play-when">${q}${clk ? ' ' + _escHtml(clk) : ''}</span>
            ${logo ? `<img src="${_escHtml(logo)}" alt="" data-hide-on-error>` : ''}
            <span class="nlg-play-text">${_escHtml(p.text || (p.type && p.type.text) || 'Score')}</span>
            <span class="nlg-play-score">${p.awayScore}–${p.homeScore}</span>
        </div>`;
    }).join('');
    return `<details class="nlg-card" open><summary class="nlg-sum">Scoring plays</summary><div class="nlg-plays">${rows}</div></details>`;
}

function _nlgTeamStats(data, home, away) {
    const teams = (data.boxscore && data.boxscore.teams) || [];
    if (teams.length < 2) return '';
    const byHA = {};
    teams.forEach(t => { byHA[t.homeAway || (t.team && t.team.id === (home.team || {}).id ? 'home' : 'away')] = t; });
    const ht = byHA.home || teams.find(t => (t.team || {}).id === (home.team || {}).id) || teams[1];
    const at = byHA.away || teams.find(t => (t.team || {}).id === (away.team || {}).id) || teams[0];
    const get = (t, name) => { const s = (t.statistics || []).find(x => x.name === name); return s ? (s.displayValue || '') : '—'; };
    const want = [
        ['totalYards', 'Total Yards'], ['netPassingYards', 'Passing'], ['rushingYards', 'Rushing'],
        ['firstDowns', 'First Downs'], ['thirdDownEff', '3rd Down'], ['totalPenaltiesYards', 'Penalties'],
        ['turnovers', 'Turnovers'], ['possessionTime', 'Time of Poss.'],
    ];
    const rows = want.map(([k, l]) => `<div class="nlg-ts-row">
        <span class="nlg-ts-a">${_escHtml(get(at, k))}</span>
        <span class="nlg-ts-l">${l}</span>
        <span class="nlg-ts-h">${_escHtml(get(ht, k))}</span></div>`).join('');
    return `<details class="nlg-card" open><summary class="nlg-sum">Team stats
        <span class="nlg-sum-teams">${_escHtml((at.team || {}).abbreviation || '')} · ${_escHtml((ht.team || {}).abbreviation || '')}</span></summary>
        <div class="nlg-ts">${rows}</div></details>`;
}

function _nlgBoxScore(data, home, away) {
    const players = (data.boxscore && data.boxscore.players) || [];
    if (!players.length) return '';
    const groupHtml = (teamBlock, groupName, limit) => {
        const g = (teamBlock.statistics || []).find(s => s.name === groupName);
        if (!g || !g.athletes || !g.athletes.length) return '';
        const labels = g.labels || [];
        const keep = groupName === 'passing' ? 4 : 3;
        const idx = labels.slice(0, keep);
        const head = `<div class="nlg-bx-head"><span>${groupName.toUpperCase()}</span>${idx.map(l => `<span>${_escHtml(l)}</span>`).join('')}</div>`;
        const rows = g.athletes.slice(0, limit).map(a => `<div class="nlg-bx-row">
            <span class="nlg-bx-name">${_escHtml((a.athlete && (a.athlete.shortName || a.athlete.displayName)) || '')}</span>
            ${(a.stats || []).slice(0, keep).map(v => `<span>${_escHtml(v)}</span>`).join('')}
        </div>`).join('');
        return head + rows;
    };
    const teamCol = (side, label) => {
        const tb = players.find(p => (p.team || {}).id === (side.team || {}).id) || null;
        if (!tb) return '';
        return `<div class="nlg-bx-team">
            <div class="nlg-bx-team-title">${_escHtml((side.team || {}).abbreviation || label)}</div>
            ${groupHtml(tb, 'passing', 2)}${groupHtml(tb, 'rushing', 3)}${groupHtml(tb, 'receiving', 3)}
        </div>`;
    };
    return `<details class="nlg-card"><summary class="nlg-sum">Box score <span class="nlg-sum-teams">passing · rushing · receiving leaders</span></summary>
        <div class="nlg-bx">${teamCol(away, 'AWAY')}${teamCol(home, 'HOME')}</div></details>`;
}

function _nlgNav(abbr) {
    return `event.stopPropagation();navigateTo('nfl-team-${_escHtml(abbr === 'WAS' ? 'WSH' : (abbr || ''))}')`;
}

if (typeof window !== 'undefined') {
    window.showNFLGame = showNFLGame;
    window.fetchNFLSummary = fetchNFLSummary;
    window.stopNFLLiveGame = _nlgStop;
}
