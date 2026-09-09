// ============================================================
// Shared basketball live-game viewer — one tabbed dashboard (Summary,
// Play-by-Play, Box Score, Team Stats, Analytics) + sidebar (Win
// Probability, Game Leaders, Game Flow, Standings), parameterized by
// sport via _BLG_SPORTS so WNBA and NCAAB — both riding ESPN's same
// site.web.api.espn.com basketball product family — share one
// implementation instead of two near-duplicate files. NBA (preview-only)
// deliberately has no entry in _BLG_SPORTS yet; wiring it later is
// adding one config entry + its own fetchSummary, not new viewer work.
//
// Built after live-fetching real completed games from both sports'
// /summary endpoints (2026-09-08, WNBA event 401857180, NCAAB event
// 401851388) rather than trusting D-092 Resolution 6's WNBA finding,
// which turned out stale/wrong on a fresh check:
//   - header.competitions[0] DOES carry a full score/status/linescore
//     block per competitor (score, linescores[], record[], status) —
//     D-092 said WNBA's /summary had no such header block and read
//     score/status from the scoreboard instead. Not reproduced here on
//     either sport; both now read score/status straight from
//     data.header like NFL's viewer does, no separate scoreboard fetch.
//   - leaders[] is real and populated (points/assists/rebounds per
//     team) on both sports — D-092 said this array was confirmed empty
//     on every WNBA event checked. Also not reproduced here.
//   - plays[] is a full flat play-by-play array (395/413 entries on the
//     two games checked) on both sports. Basketball has no "drives" the
//     way football does, so this renders grouped by period
//     (quarter/half) instead of NFL's drive cards.
//   - winprobability[] and standings.groups[] exist in the same shape
//     as NFL's, down to the same "entries[].team is a bare location
//     string" quirk NFL/NCAAF already carry.
//   - boxscore.teams[].statistics[] additionally carries pointsInPaint/
//     fastBreakPoints/turnoverPoints/leadChanges/largestLead/
//     leadPercentage on both sports — real ESPN-computed fields, not
//     derived here. Powers the Analytics tab; basketball has no drives
//     to compute a success-rate/drive-efficiency stat from the way
//     NFL/NCAAF's Analytics tab does, so this is a different but
//     equally real source instead.
//   - format.regulation.periods/displayName ("Quarter" x4 for WNBA,
//     "Half" x2 for NCAAB) drives period labeling generically instead
//     of a hardcoded Q1-4 list — NFL's viewer hardcodes that because
//     every NFL game has exactly 4 quarters; basketball's period count
//     varies by sport, so this file reads it from the data instead.
//   - No live spatial/situation payload (shot clock, court position)
//     was found on either sport's /summary — no attempt made to build
//     a court-position graphic. NFL/NCAAF's field viewer has no
//     basketball counterpart here; left out honestly rather than faked.
//   - injuries[] exists for WNBA (ESPN's own league-wide injury feed —
//     unlike NFL, this isn't a Sleeper depth-chart join) but is
//     confirmed ABSENT on the NCAAB game checked, the same "no free
//     college injury data" wall D-125 already hit for NCAAF. The
//     injuries card is written generically and simply never renders
//     when the key is missing, not specially cased per sport.
//   - No Fantasy tab: neither sport has a fantasy feature.
//   - Neither sport has a team-detail page yet, so team blocks in the
//     header are plain (non-clickable), unlike NFL/NCAAF's nav button.
//   - Neither sport has a per-team color helper (getWNBATeamColor etc.
//     don't exist) — ESPN's own team objects carry color/alternateColor
//     hex directly in this same /summary response, used via _blgTC()
//     instead of a lookup table.
//
// CSS: reuses css/nflLiveGame.css's .nlg-*/.gv-* selectors verbatim —
// same "clone the CSS, don't fork it" choice NCAAF's viewer made from
// NFL's (js/ncaafLiveGame.js). No new stylesheet, no field-viewer
// (.fv-*) classes used.
// ============================================================

const _blg = { sport: null, eventId: null, timer: null, activeTab: 'summary', lastData: null };

const _BLG_SPORTS = {
    wnba:  { label: 'WNBA',  scoresView: 'wnba-scores',  gamePrefix: 'wnba-game-',  fetchSummary: (id) => fetchWNBAGameSummary(id) },
    ncaab: { label: 'NCAAB', scoresView: 'ncaab-scores', gamePrefix: 'ncaab-game-', fetchSummary: (id) => fetchNCAABGameSummary(id) },
};

const _BLG_TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'pbp', label: 'Play-by-Play' },
    { id: 'box', label: 'Box Score' },
    { id: 'team', label: 'Team Stats' },
    { id: 'analytics', label: 'Analytics' },
];

function _blgStop() { if (_blg.timer) { clearInterval(_blg.timer); _blg.timer = null; } }

async function _blgShow(sport, eventId) {
    const cfg = _BLG_SPORTS[sport];
    if (!cfg) return;
    _blgStop();
    const isNewGame = _blg.sport !== sport || _blg.eventId !== eventId;
    _blg.sport = sport; _blg.eventId = eventId;
    if (isNewGame) { _blg.activeTab = 'summary'; _blg.lastData = null; }
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    // Same D-075/D-080 lesson: own currentView here rather than trusting the
    // router, since home-hero/game-card click sites call this directly.
    AppState.currentView = cfg.gamePrefix + eventId;
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb(cfg.scoresView, 'Game');
    if (isNewGame) {
        grid.className = 'player-detail-container'; grid.style.cssText = '';
        grid.innerHTML = `<div class="nlg-loading"><div class="skeleton-line" style="height:48px;width:60%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Loading game…</p></div>`;
    }
    try {
        const data = await cfg.fetchSummary(eventId);
        _blgRender(data);
        _blgMaybePoll(data);
    } catch (err) {
        if (window.ErrorHandler && ErrorHandler.handle) ErrorHandler.handle(grid, err, () => _blgShow(sport, eventId), { tag: cfg.label, title: 'Failed to Load Game' });
        else grid.innerHTML = `<div class="nlg-empty"><p>Couldn't load this game.</p><button class="md-btn" onclick="navigateTo('${cfg.scoresView}')">Back to scores</button></div>`;
        if (window.Logger) Logger.warn(cfg.label + ' summary failed', err, cfg.label.toUpperCase());
    }
}

function _blgMaybePoll(data) {
    const state = _blgState(data);
    _blgStop();
    if (state !== 'in') return;
    const cfg = _BLG_SPORTS[_blg.sport];
    // 20s matches functions/api/wnba.js's and functions/api/ncaab.js's own
    // ttlFor('/summary') edge-cache TTL — polling faster just re-serves the
    // same cached response, same reasoning as NFL's viewer.
    _blg.timer = setInterval(async () => {
        if (AppState.currentView !== cfg.gamePrefix + _blg.eventId) { _blgStop(); return; }
        try {
            const d = await cfg.fetchSummary(_blg.eventId);
            _blgRender(d);
            if (_blgState(d) !== 'in') _blgStop();
        } catch (_) { /* keep last good render on a transient poll failure */ }
    }, 20000);
}

function _blgState(data) {
    const c = data && data.header && data.header.competitions && data.header.competitions[0];
    return (c && c.status && c.status.type && c.status.type.state) || 'post';
}
function _blgComp(data) { return data.header.competitions[0]; }
function _blgSide(comp, ha) { return (comp.competitors || []).find(c => c.homeAway === ha) || {}; }

// ESPN's team object on /summary carries color/alternateColor hex directly —
// no per-sport lookup table needed the way NFL's getNFLTeamColor is.
function _blgTC(team, isAway) {
    if (team && team.color) return '#' + team.color;
    return isAway ? 'var(--text-muted)' : 'var(--accent)';
}

function _blgRecord(c) {
    const list = c.record || [];
    const total = list.find(r => r.type === 'total') || list[0];
    return total ? (total.summary || total.displayValue || '') : '';
}

// -- Shell + header (always re-rendered; never loses tab/scroll state) ------

function _blgRender(data) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    _blg.lastData = data;
    const cfg = _BLG_SPORTS[_blg.sport];
    const comp = _blgComp(data);
    const home = _blgSide(comp, 'home'), away = _blgSide(comp, 'away');
    const homeAbbr = (home.team && home.team.abbreviation) || '';
    const awayAbbr = (away.team && away.team.abbreviation) || '';
    if (window.setBreadcrumb && homeAbbr && awayAbbr) setBreadcrumb(cfg.scoresView, `${awayAbbr} @ ${homeAbbr}`);

    const isFirstRender = grid.className !== 'blg-shell-mounted';
    if (isFirstRender) {
        grid.className = 'blg-shell-mounted'; grid.style.cssText = '';
        grid.innerHTML = `
          <div class="nlg-wrap">
            <div class="nlg-topbar">
              <button onclick="navigateTo('${cfg.scoresView}')" class="back-button">← Scores</button>
            </div>
            <div class="nlg-header"></div>
            <div class="nlg-layout">
              <div class="nlg-main">
                ${_blgTabsHtml()}
                <div class="gv-tabpanel"></div>
              </div>
              ${_blgSidebarHtml(data, comp, home, away)}
            </div>
            <p class="pct-caption nlg-venue-caption"></p>
          </div>`;
    } else {
        const sideEl = grid.querySelector('.nlg-side');
        if (sideEl) sideEl.outerHTML = _blgSidebarHtml(data, comp, home, away);
    }

    _blgRenderHeader(comp, home, away);
    _blgRenderActiveTabBody();

    const venue = (data.gameInfo && data.gameInfo.venue && data.gameInfo.venue.fullName) || '';
    const capEl = grid.querySelector('.nlg-venue-caption');
    if (capEl) capEl.textContent = venue ? `${venue} · data via ESPN` : 'Data via ESPN';
}

function _blgRenderHeader(comp, home, away) {
    const headerEl = document.querySelector('.nlg-header');
    if (!headerEl) return;
    const st = (comp.status && comp.status.type) || {};
    const state = st.state || 'post';
    const live = state === 'in';
    const statusText = st.shortDetail || st.detail || (state === 'pre' ? 'Scheduled' : 'Final');

    // Plain divs, not nav buttons — neither WNBA nor NCAAB has a team-detail
    // page yet (confirmed: no showWNBATeam/showNCAABTeam anywhere), unlike
    // NFL/NCAAF's clickable team blocks.
    const teamBlock = (c, align, isAway) => {
        const t = c.team || {};
        const logo = (t.logos && t.logos[0] && t.logos[0].href) || t.logo || '';
        const rec = _blgRecord(c);
        const won = state === 'post' && c.winner;
        return `<div class="nlg-team nlg-team--${align}" style="--tc:${_blgTC(t, isAway)}">
            <img src="${_escHtml(logo)}" alt="" data-hide-on-error>
            <span class="nlg-team-abbr">${c.rank ? `#${_escHtml(String(c.rank))} ` : ''}${_escHtml(t.abbreviation || '')}</span>
            <span class="nlg-team-name">${_escHtml(t.shortDisplayName || t.name || t.displayName || '')}</span>
            ${rec ? `<span class="nlg-team-rec">${_escHtml(rec)}</span>` : ''}
            <span class="nlg-team-score ${won ? 'nlg-team-score--win' : ''}">${c.score != null ? c.score : ''}</span>
        </div>`;
    };

    headerEl.innerHTML = `
        <div class="nlg-score ${live ? 'nlg-score--live' : ''}">
          ${teamBlock(away, 'away', true)}
          <div class="nlg-center">
            <div class="nlg-status ${live ? 'nlg-status--live' : ''}">${_escHtml(statusText)}${live ? ' <span class="nlg-livebadge">● LIVE</span>' : ''}</div>
            <div class="nlg-vs">@</div>
          </div>
          ${teamBlock(home, 'home', false)}
        </div>`;
}

// -- Tabs ---------------------------------------------------------------

function _blgTabsHtml() {
    return `<div class="gv-tabs" role="tablist">${_BLG_TABS.map(t => `<button type="button" id="gv-tab-${t.id}" class="gv-tab ${_blg.activeTab === t.id ? 'gv-tab--active' : ''}" role="tab" aria-selected="${_blg.activeTab === t.id}" aria-controls="gv-tabpanel" onclick="_blgSwitchTab('${t.id}')">${_escHtml(t.label)}</button>`).join('')}</div>`;
}

function _blgSwitchTab(tab) {
    if (_blg.activeTab === tab) return;
    _blg.activeTab = tab;
    const tabsEl = document.querySelector('.gv-tabs');
    if (tabsEl) tabsEl.outerHTML = _blgTabsHtml();
    _blgRenderActiveTabBody();
}

function _blgRenderActiveTabBody() {
    const data = _blg.lastData;
    const panel = document.querySelector('.gv-tabpanel');
    if (!data || !panel) return;
    const comp = _blgComp(data);
    const home = _blgSide(comp, 'home'), away = _blgSide(comp, 'away');
    const scrollTop = panel.scrollTop;
    let html = '';
    switch (_blg.activeTab) {
        case 'summary': html = _blgRenderSummaryTab(data, comp, home, away); break;
        case 'pbp': html = _blgRenderPbp(data); break;
        case 'box': html = _blgRenderBoxFull(data, home, away); break;
        case 'team': html = _blgTeamStats(data, home, away); break;
        case 'analytics': html = _blgRenderAnalyticsTab(data, home, away); break;
        default: html = _blgRenderSummaryTab(data, comp, home, away);
    }
    panel.innerHTML = html;
    panel.id = 'gv-tabpanel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'gv-tab-' + _blg.activeTab);
    panel.scrollTop = scrollTop;
}

// -- Summary tab (linescore + injuries + news — no scoringPlays card: -------
// -- basketball's /summary carries no top-level scoringPlays[] the way ------
// -- NFL's does, live-verified absent on both sports; every score belongs ---
// -- in Play-by-Play instead of a curated highlights feed here) -------------

function _blgRenderSummaryTab(data, comp, home, away) {
    return `${_blgLinescore(data, comp, home, away)}${_blgInjuriesCard(data)}${_blgNewsCard(data)}`;
}

// format.regulation.periods/displayName reads real per-sport period count
// (4 quarters WNBA, 2 halves NCAAB) instead of a hardcoded Q1-4 list.
function _blgPeriodLabels(data, n) {
    const reg = (data.format && data.format.regulation) || {};
    const periods = reg.periods || 4;
    const short = reg.slug === 'half' ? 'H' : (reg.slug === 'quarter' ? 'Q' : 'P');
    const labels = [];
    for (let i = 0; i < n; i++) {
        labels.push(i < periods ? short + (i + 1) : ('OT' + (i - periods > 0 ? (i - periods + 1) : '')));
    }
    return labels;
}

function _blgLinescore(data, comp, home, away) {
    const ls = (c) => (c.linescores || []).map(l => (l.value != null ? l.value : (l.displayValue || 0)));
    const h = ls(home), a = ls(away);
    const n = Math.max(h.length, a.length);
    if (!n) return '';
    const labels = _blgPeriodLabels(data, n);
    const row = (c, arr) => `<tr><td class="nlg-ls-team">${_escHtml((c.team || {}).abbreviation || '')}</td>
        ${labels.map((_, i) => `<td>${arr[i] != null ? arr[i] : '-'}</td>`).join('')}
        <td class="nlg-ls-total">${c.score != null ? c.score : ''}</td></tr>`;
    return `<div class="nlg-card"><table class="nlg-ls">
        <thead><tr><th></th>${labels.map(q => `<th>${q}</th>`).join('')}<th>T</th></tr></thead>
        <tbody>${row(away, a)}${row(home, h)}</tbody></table></div>`;
}

// Injuries[] confirmed present+populated on WNBA (ESPN's own league-wide feed)
// and confirmed ABSENT on the NCAAB game checked (same wall D-125 already hit
// for NCAAF) — renders nothing when data.injuries is missing, not sport-cased.
// Field shape differs from NFL's: no details.detail free-text field here;
// details carries {type, side, returnDate} instead (body part / left-right /
// expected return date) — live-verified 2026-09-08 against a real "Out" entry.
function _blgInjuriesCard(data) {
    const teams = (data.injuries || []).filter(t => t.injuries && t.injuries.length);
    if (!teams.length) return '';
    const total = teams.reduce((n, t) => n + t.injuries.length, 0);
    const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
    const rows = (t) => (t.injuries || []).map(i => {
        const abbr = (i.type && i.type.abbreviation) || (i.status || '').slice(0, 1);
        const name = (i.athlete && (i.athlete.shortName || i.athlete.displayName)) || '';
        const pos = (i.athlete && i.athlete.position && i.athlete.position.abbreviation) || '';
        const d = i.details || {};
        const parts = [d.type, d.side].filter(Boolean);
        if (d.returnDate) parts.push('Return ' + fmtDate(d.returnDate));
        const detail = parts.join(' · ');
        return `<div class="nlg-inj-row">
            <span class="nlg-inj-status">${_escHtml(abbr)}</span>
            <span class="nlg-inj-name">${_escHtml(name)}</span>
            <span class="nlg-inj-pos">${_escHtml(pos)}</span>
            <span class="nlg-inj-detail">${_escHtml(detail)}</span>
        </div>`;
    }).join('');
    const teamBlock = (t) => `<div class="nlg-inj-team"><div class="nlg-bx-team-title">${_escHtml((t.team || {}).abbreviation || '')}</div>${rows(t)}</div>`;
    return `<details class="nlg-card" open><summary class="nlg-sum">Injury Report <span class="nlg-sum-teams">${total} listed</span></summary>
        <div class="nlg-inj">${teams.map(teamBlock).join('')}</div></details>`;
}

function _blgNewsCard(data) {
    const ago = typeof _newsTimeAgo === 'function' ? _newsTimeAgo : () => '';
    const articles = ((data.news && data.news.articles) || []).filter(a => a && a.headline && a.links && a.links.web && a.links.web.href).slice(0, 5);
    if (!articles.length) return '';
    const rows = articles.map(a => `<a class="nlg-news-row" href="${_escHtml(a.links.web.href)}" target="_blank" rel="noopener">
        <span class="nlg-news-headline">${_escHtml(a.headline)}</span>
        <span class="nlg-news-meta">${_escHtml(a.byline || '')}${a.byline ? ' · ' : ''}${_escHtml(ago(a.published || a.lastModified))}</span>
    </a>`).join('');
    const label = _BLG_SPORTS[_blg.sport].label;
    return `<details class="nlg-card"><summary class="nlg-sum">${_escHtml(label)} News</summary><div class="nlg-news">${rows}</div></details>`;
}

// -- Play-by-Play tab (flat data.plays[], grouped by period — basketball has
// -- no "drives" the way football does, so this groups by quarter/half
// -- instead of NFL's per-drive cards. Only the most recent period starts
// -- open: a period can carry 100+ plays, unlike a football drive's handful.

function _blgRenderPbp(data) {
    const plays = data.plays || [];
    if (!plays.length) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No play-by-play yet</p><p class="pct-caption">Play detail appears once the game is underway.</p></div>`;
    const byPeriod = {};
    plays.forEach(p => {
        const num = (p.period && p.period.number) || 1;
        (byPeriod[num] = byPeriod[num] || []).push(p);
    });
    const periods = Object.keys(byPeriod).map(Number).sort((a, b) => b - a);
    const periodHtml = (num, i) => {
        const list = byPeriod[num].slice().reverse();
        const disp = (list[0] && list[0].period && list[0].period.displayValue) || ('Period ' + num);
        const playsHtml = list.map(p => `<div class="nlg-pbp-play ${p.scoringPlay ? 'nlg-pbp-play--score' : ''}">
                <span class="nlg-pbp-dd">${_escHtml((p.clock && p.clock.displayValue) || '')}</span>
                <span class="nlg-pbp-text">${_escHtml(p.text || p.shortDescription || '')}</span>
                <span class="nlg-pbp-score">${p.awayScore != null ? p.awayScore : ''}–${p.homeScore != null ? p.homeScore : ''}</span>
            </div>`).join('');
        return `<details class="nlg-card" ${i < 1 ? 'open' : ''}>
            <summary class="nlg-sum">${_escHtml(disp)}</summary>
            <div class="nlg-pbp-plays">${playsHtml}</div>
        </details>`;
    };
    return periods.map(periodHtml).join('');
}

// -- Box Score tab (one stat group per team, unlike NFL's multi-group -------
// -- passing/rushing/receiving split — live-verified shape on both sports:
// -- boxscore.players[].statistics[0] = {names, keys, labels, athletes,
// -- totals}. DNP athletes carry an empty stats[] and a reason string.

function _blgRenderBoxFull(data, home, away) {
    const players = (data.boxscore && data.boxscore.players) || [];
    if (!players.length) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No box score yet</p><p class="pct-caption">Player stats post once the game starts.</p></div>`;
    const teamCol = (side) => {
        const tb = players.find(p => (p.team || {}).id === (side.team || {}).id);
        const group = tb && tb.statistics && tb.statistics[0];
        if (!group) return '';
        const labels = group.labels || group.names || [];
        const head = `<div class="nlg-bx-head"><span>PLAYER</span>${labels.map(l => `<span>${_escHtml(l)}</span>`).join('')}</div>`;
        const rows = (group.athletes || []).map(a => {
            const name = (a.athlete && (a.athlete.shortName || a.athlete.displayName)) || '';
            if (a.didNotPlay) {
                return `<div class="nlg-bx-row"><span class="nlg-bx-name">${_escHtml(name)}</span><span class="pct-caption" style="flex:1 1 0;text-align:left">${_escHtml(a.reason || 'DNP')}</span></div>`;
            }
            return `<div class="nlg-bx-row"><span class="nlg-bx-name">${_escHtml(name)}</span>${(a.stats || []).map(v => `<span>${_escHtml(v)}</span>`).join('')}</div>`;
        }).join('');
        const totalsRow = (group.totals || []).length
            ? `<div class="nlg-bx-row" style="font-weight:800;border-top:1px solid var(--border-subtle);margin-top:0.2rem;padding-top:0.3rem"><span class="nlg-bx-name">Team</span>${group.totals.map(v => `<span>${_escHtml(v)}</span>`).join('')}</div>`
            : '';
        return `<div class="nlg-bx-team"><div class="nlg-bx-team-title">${_escHtml((side.team || {}).abbreviation || '')}</div><div class="blg-bx-scroll">${head}${rows}${totalsRow}</div></div>`;
    };
    return `<div class="nlg-bx nlg-bx--full">${teamCol(away)}${teamCol(home)}</div>`;
}

// -- Team Stats tab -------------------------------------------------------

function _blgByHomeAway(teams, home, away) {
    const at = teams.find(t => t.homeAway === 'away') || teams.find(t => (t.team || {}).id === (away.team || {}).id) || teams[0];
    const ht = teams.find(t => t.homeAway === 'home') || teams.find(t => (t.team || {}).id === (home.team || {}).id) || teams[1];
    return { at, ht };
}

function _blgTeamStats(data, home, away) {
    const teams = (data.boxscore && data.boxscore.teams) || [];
    if (teams.length < 2) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No team stats yet</p></div>`;
    const { at, ht } = _blgByHomeAway(teams, home, away);
    const get = (t, name) => { const s = (t.statistics || []).find(x => x.name === name); return s ? (s.displayValue || '') : '—'; };
    const want = [
        ['fieldGoalsMade-fieldGoalsAttempted', 'FG'], ['fieldGoalPct', 'FG%'],
        ['threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3PT'], ['threePointFieldGoalPct', '3P%'],
        ['freeThrowsMade-freeThrowsAttempted', 'FT'], ['freeThrowPct', 'FT%'],
        ['totalRebounds', 'REB'], ['offensiveRebounds', 'OREB'], ['defensiveRebounds', 'DREB'],
        ['assists', 'AST'], ['steals', 'STL'], ['blocks', 'BLK'], ['turnovers', 'TO'], ['fouls', 'PF'],
    ];
    const rows = want.map(([k, l]) => `<div class="nlg-ts-row">
        <span class="nlg-ts-a">${_escHtml(get(at, k))}</span>
        <span class="nlg-ts-l">${l}</span>
        <span class="nlg-ts-h">${_escHtml(get(ht, k))}</span></div>`).join('');
    return `<div class="nlg-card"><div class="nlg-sum">Team stats <span class="nlg-sum-teams">${_escHtml((at.team || {}).abbreviation || '')} · ${_escHtml((ht.team || {}).abbreviation || '')}</span></div>
        <div class="nlg-ts">${rows}</div></div>`;
}

// -- Analytics tab (ESPN's own advanced team-tracking fields, already -------
// -- present in boxscore.teams[].statistics on both sports — not derived
// -- here. Basketball has no drives to compute a success-rate/drive-
// -- efficiency stat from the way NFL/NCAAF's Analytics tab does, so this
// -- surfaces a different real source instead of leaving the tab empty.

function _blgRenderAnalyticsTab(data, home, away) {
    const teams = (data.boxscore && data.boxscore.teams) || [];
    if (teams.length < 2) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No analytics yet</p><p class="pct-caption">Advanced team stats post once the game is underway.</p></div>`;
    const { at, ht } = _blgByHomeAway(teams, home, away);
    const get = (t, name) => { const s = (t.statistics || []).find(x => x.name === name); return s ? s.displayValue : null; };
    const want = [
        ['pointsInPaint', 'Points in Paint'], ['fastBreakPoints', 'Fast Break Points'],
        ['turnoverPoints', 'Points off Turnovers'], ['largestLead', 'Largest Lead'],
        ['leadChanges', 'Lead Changes'], ['leadPercentage', 'Time Spent Leading'],
    ];
    const present = want.filter(([k]) => get(at, k) != null || get(ht, k) != null);
    if (!present.length) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No analytics yet</p></div>`;
    const rows = present.map(([k, l]) => {
        const av = get(at, k), hv = get(ht, k);
        const suffix = k === 'leadPercentage' ? '%' : '';
        return `<div class="nlg-ts-row">
        <span class="nlg-ts-a">${_escHtml(av != null ? av + suffix : '—')}</span>
        <span class="nlg-ts-l">${l}</span>
        <span class="nlg-ts-h">${_escHtml(hv != null ? hv + suffix : '—')}</span></div>`;
    }).join('');
    return `<div class="nlg-card"><div class="nlg-sum">Advanced Stats <span class="nlg-sum-teams">${_escHtml((at.team || {}).abbreviation || '')} · ${_escHtml((ht.team || {}).abbreviation || '')}</span></div>
        <div class="nlg-ts">${rows}</div></div>
        <p class="pct-caption">ESPN's own tracked advanced stats for this game.</p>`;
}

// -- Sidebar: win probability + game leaders + game flow + standings --------

function _blgSidebarHtml(data, comp, home, away) {
    return `<aside class="nlg-side">
        ${_blgWinProbability(data, home, away)}
        ${_blgSidebarLeaders(data)}
        ${_blgGameFlow(comp, home, away)}
        ${_blgStandingsCard(data, home, away)}
    </aside>`;
}

// Same shape/logic as NFL's _nlgWinProbability (D-106) — data.winprobability[]
// = {homeWinPercentage, tiePercentage, playId}, live-verified present and
// populated (395/412 entries) on both basketball sports' /summary.
function _blgWinProbability(data, home, away) {
    const wp = (data.winprobability || []).filter(w => typeof w.homeWinPercentage === 'number');
    if (wp.length < 2) return '';
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const hColor = _blgTC(home.team, false), aColor = _blgTC(away.team, true);
    const n = wp.length;
    const w = 220, hgt = 56, pad = 4;
    const midY = hgt / 2;
    const xFor = (i) => pad + (i / (n - 1)) * (w - pad * 2);
    const yFor = (pct) => pad + (1 - pct) * (hgt - pad * 2);
    const pts = wp.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.homeWinPercentage).toFixed(1)}`).join(' ');
    const cur = wp[n - 1].homeWinPercentage;
    const curAbbr = cur >= 0.5 ? homeAbbr : awayAbbr;
    const curColor = cur >= 0.5 ? hColor : aColor;
    const curVal = Math.round((cur >= 0.5 ? cur : 1 - cur) * 100);
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Win Probability</h3>
        <svg class="nlg-wp-svg" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">
            <defs>
                <clipPath id="blg-wp-clip-above"><rect x="0" y="0" width="${w}" height="${midY}"/></clipPath>
                <clipPath id="blg-wp-clip-below"><rect x="0" y="${midY}" width="${w}" height="${hgt - midY}"/></clipPath>
            </defs>
            <line x1="${pad}" y1="${midY}" x2="${w - pad}" y2="${midY}" stroke="var(--border-subtle)" stroke-width="1" stroke-dasharray="3,3"/>
            <polyline points="${_escHtml(pts)}" fill="none" stroke="${_escHtml(hColor)}" stroke-width="2" clip-path="url(#blg-wp-clip-above)"/>
            <polyline points="${_escHtml(pts)}" fill="none" stroke="${_escHtml(aColor)}" stroke-width="2" clip-path="url(#blg-wp-clip-below)"/>
        </svg>
        <div class="nlg-wp-legend">
            <span style="color:${_escHtml(curColor)}">${_escHtml(curAbbr)} ${curVal}%</span>
            <span class="pct-caption">Win probability</span>
        </div>
    </div>`;
}

// Same guard as NFL's _nlgSidebarLeaders (D-105/D-134): a team block is
// omitted unless it produced at least one real leader row, and the whole
// card is omitted unless at least one team block survived. Categories here
// are points/assists/rebounds (live-verified on both sports), not NFL's
// passing/rushing/receiving.
function _blgSidebarLeaders(data) {
    const leaders = data.leaders || [];
    const block = (tb) => {
        const abbr = (tb.team || {}).abbreviation || '';
        const cats = (tb.leaders || []).slice(0, 3);
        const rows = cats.map((c) => {
            const top = c.leaders && c.leaders[0];
            if (!top) return '';
            const name = (top.athlete && (top.athlete.shortName || top.athlete.displayName)) || '';
            return `<div class="nlg-leader-row">` +
                `<div class="nlg-leader-row-top"><span class="nlg-leader-cat">${_escHtml(c.shortDisplayName || c.displayName || c.name || '')}</span><span class="nlg-leader-val">${_escHtml(top.displayValue || '')}</span></div>` +
                `<span class="nlg-leader-name">${_escHtml(name)}</span></div>`;
        }).join('');
        return rows ? `<div class="nlg-leader-team"><div class="nlg-leader-team-title">${_escHtml(abbr)}</div>${rows}</div>` : '';
    };
    const blocks = leaders.map(block).filter(Boolean);
    if (!blocks.length) return '';
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Game Leaders</h3>${blocks.join('')}</div>`;
}

// Cumulative-score line chart from linescores — identical logic to NFL's
// _nlgGameFlow, unaffected by period count (4 quarters or 2 halves both
// just change n).
function _blgGameFlow(comp, home, away) {
    const ls = (c) => (c.linescores || []).map((l) => (l.value != null ? l.value : (l.displayValue || 0)));
    const h = ls(home), a = ls(away);
    const n = Math.max(h.length, a.length);
    if (n < 2) return '';
    const cum = (arr) => { let s = 0; return arr.map((v) => (s += (v || 0))); };
    const hc = cum(h), ac = cum(a);
    const maxV = Math.max(...hc, ...ac, 1);
    const w = 220, hgt = 56, pad = 4;
    const pt = (arr, i) => {
        const x = pad + (i / (n - 1)) * (w - pad * 2);
        const y = hgt - pad - (arr[i] / maxV) * (hgt - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    };
    const hPts = hc.map((_, i) => pt(hc, i)).join(' ');
    const aPts = ac.map((_, i) => pt(ac, i)).join(' ');
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const hColor = _blgTC(home.team, false), aColor = _blgTC(away.team, true);
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Game Flow</h3>
        <svg class="nlg-flow-svg" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">
            <polyline points="${_escHtml(aPts)}" fill="none" stroke="${_escHtml(aColor)}" stroke-width="2"/>
            <polyline points="${_escHtml(hPts)}" fill="none" stroke="${_escHtml(hColor)}" stroke-width="2"/>
        </svg>
        <div class="nlg-flow-legend"><span style="color:${_escHtml(aColor)}">${_escHtml(awayAbbr)}</span><span style="color:${_escHtml(hColor)}">${_escHtml(homeAbbr)}</span></div>
    </div>`;
}

// Same "entries[].team is a bare location string" quirk NFL/NCAAF's
// standings card already works around (D-080's live-verified fix) —
// confirmed identical on both basketball sports' /summary. WNBA's groups
// are the two flat conferences (Eastern/Western); NCAAB's are the teams'
// shared conference(s) — same findGroupFor-by-location approach handles both.
function _blgStandingsCard(data, home, away) {
    const groups = (data.standings && data.standings.groups) || [];
    if (!groups.length) return '';
    const homeLoc = (home.team && home.team.location) || '';
    const awayLoc = (away.team && away.team.location) || '';
    const findGroupFor = (loc) => groups.find(g => (((g.standings || {}).entries) || []).some(e => e.team === loc));
    const gHome = findGroupFor(homeLoc), gAway = findGroupFor(awayLoc);
    const uniqueGroups = (gHome && gHome === gAway) ? [gHome] : [gHome, gAway].filter(Boolean);
    if (!uniqueGroups.length) return '';
    const table = (g) => {
        const entries = ((g.standings || {}).entries) || [];
        const rows = entries.map(e => {
            const loc = e.team || '';
            const playing = loc === homeLoc || loc === awayLoc;
            const tc = loc === homeLoc ? _blgTC(home.team, false) : (loc === awayLoc ? _blgTC(away.team, true) : 'var(--border-strong)');
            const overall = (e.stats || []).find(s => s.name === 'overall');
            const pct = (e.stats || []).find(s => s.name === 'winPercent');
            return `<div class="nlg-st-row ${playing ? 'nlg-st-row--playing' : ''}" ${playing ? `style="--tc:${tc}"` : ''}>
                <span class="nlg-st-team">${_escHtml(loc)}</span>
                <span class="nlg-st-rec">${_escHtml(overall ? overall.displayValue : '')}</span>
                <span class="nlg-st-pct">${_escHtml(pct ? pct.displayValue : '')}</span>
            </div>`;
        }).join('');
        return `<div class="nlg-st-group"><div class="nlg-leader-team-title">${_escHtml(g.divisionHeader || g.header || '')}</div>${rows}</div>`;
    };
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Standings</h3>${uniqueGroups.map(table).join('')}</div>`;
}

if (typeof window !== 'undefined') {
    window._blgShow = _blgShow;
    window.stopBballLiveGame = _blgStop;
    window._blgSwitchTab = _blgSwitchTab;
}
