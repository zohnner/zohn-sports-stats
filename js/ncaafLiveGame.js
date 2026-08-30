// ============================================================
// NCAA Football Live Game viewer — Phase 2 tabbed body (2026-08-29).
// Builds on the Phase 1 skeleton (score header + venue/broadcast chips,
// 2026-08-22) by adding the same tabbed production-density body the NFL
// live game viewer ships (js/nflLiveGame.js, D-080): Summary, Play-by-Play,
// Box Score, Team Stats, Analytics, plus a sidebar (win probability, game
// leaders, game flow, standings context). Reuses the exact `.nlg-*`/`.gv-*`
// CSS classes nflLiveGame.css already defines rather than forking a new
// component — those selectors were never NFL-scoped, and Phase 1 already
// leaned on `.nlg-wrap`/`.nlg-team`/etc. the same way.
//
// SCOPE NOTE — what's still deferred, and why:
// D-118's Phase 1 comment named the exact risk this fixes: whether ESPN's
// college-football /summary response actually carries populated
// drives/plays/winprobability/leaders/standings the way NFL's does.
// 2026-08-29 (the season's first live-checkable day — Week 0, SJSU @ USC,
// event 401864494) that was verified against the real completed game: same
// drive/play/winprobability/leaders/team-stats shapes as NFL's, down to the
// same "standings entries[].team is a bare location string, not an object"
// quirk NFL's own standings card already had to work around. Every tab and
// sidebar card below is built against that confirmed shape.
//
// The ONE piece still unconfirmed is the live field position graphic (down
// & distance, ball spot, first-down line) — NFL's D-105 needed a genuinely
// in-progress game to verify /scoreboard's `situation` shape, and no NCAAF
// game was live as of this check (the SJSU @ USC game used to verify
// everything else had already gone final; the next kickoff is Sept 3).
// That piece stays deferred until a live game confirms it the same way
// D-105 did for NFL — do not build it on the NFL shape as an assumption.
// ============================================================

const _nclg = { eventId: null, timer: null, activeTab: 'summary', lastData: null };

const _NCLG_TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'pbp', label: 'Play-by-Play' },
    { id: 'box', label: 'Box Score' },
    { id: 'team', label: 'Team Stats' },
    { id: 'analytics', label: 'Analytics' },
];

async function fetchNCAAFSummary(eventId) {
    const r = await espnNCAAFFetch('/summary', { event: eventId }, ApiCache.TTL.SHORT);
    return r;
}

function _nclgStop() {
    if (_nclg.timer) { clearInterval(_nclg.timer); _nclg.timer = null; }
}

async function showNCAAFGame(eventId) {
    _nclgStop();
    const isNewGame = _nclg.eventId !== eventId;
    _nclg.eventId = eventId;
    if (isNewGame) { _nclg.activeTab = 'summary'; _nclg.lastData = null; }
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    // See D-080/js/nflLiveGame.js's own comment on why a view-render
    // function must set AppState.currentView itself rather than trust
    // navigateTo() already did — same reason applies to the poll guard
    // below.
    AppState.currentView = 'ncaaf-game-' + eventId;
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (isNewGame) {
        // navigateTo() unconditionally resets #playersGrid's className to
        // 'players-grid' for every non-home view before this runs — leaving
        // that in place would crush this page's own layout exactly the way
        // it crushed Highlight Card Studio's (found + fixed the same day
        // this file was written, see ISSUES.md). Reset it here, up front.
        grid.className = 'player-detail-container';
        grid.style.cssText = '';
        grid.innerHTML = `<div class="nlg-loading"><div class="skeleton-line" style="height:48px;width:60%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Loading game…</p></div>`;
    }
    try {
        const data = await fetchNCAAFSummary(eventId);
        _nclgRender(data);
        _nclgMaybePoll(data);
    } catch (err) {
        if (window.ErrorHandler && ErrorHandler.handle) {
            ErrorHandler.handle(grid, err, () => showNCAAFGame(eventId), { tag: 'NCAAF', title: 'Failed to Load Game' });
        } else {
            grid.innerHTML = `<div class="nlg-empty"><p>Couldn't load this game.</p><button class="md-btn" onclick="navigateTo('ncaaf-scores')">Back to scores</button></div>`;
        }
        if (window.Logger) Logger.warn('ncaaf summary failed', err, 'NCAAF');
    }
}

function _nclgState(data) {
    const c = data?.header?.competitions?.[0];
    return c?.status?.type?.state || 'post';
}

function _nclgComp(data) { return data.header.competitions[0]; }
function _nclgSide(comp, ha) { return (comp.competitors || []).find(c => c.homeAway === ha) || {}; }

// Same 20s cadence functions/api/ncaaf.js's ttlFor('/summary') already
// edge-caches at (matches NFL's viewer — polling faster would just re-serve
// the same cached response).
function _nclgMaybePoll(data) {
    _nclgStop();
    if (_nclgState(data) !== 'in') return;
    _nclg.timer = setInterval(async () => {
        if (AppState.currentView !== 'ncaaf-game-' + _nclg.eventId) { _nclgStop(); return; }
        try {
            const d = await fetchNCAAFSummary(_nclg.eventId);
            _nclgRender(d);
            if (_nclgState(d) !== 'in') _nclgStop();
        } catch (_) { /* keep last render */ }
    }, 20000);
}

function _nclgTeamColor(team) {
    const hex = (team?.color || '').replace('#', '');
    return hex ? `#${hex}` : 'var(--accent)';
}

// -- Shell + header (mounted once; only header/sidebar/active tab body get
// -- touched on every poll tick, so a user's open tab and scroll position
// -- survive a live re-render — the exact bug D-080 fixed for the NFL
// -- viewer's own predecessor applies here the moment tabs exist. --

function _nclgRender(data) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    _nclg.lastData = data;
    const comp = _nclgComp(data);
    const home = _nclgSide(comp, 'home'), away = _nclgSide(comp, 'away');
    const homeAbbr = home.team?.abbreviation || '';
    const awayAbbr = away.team?.abbreviation || '';
    if (window.setBreadcrumb && homeAbbr && awayAbbr) setBreadcrumb('ncaaf-scores', `${awayAbbr} @ ${homeAbbr}`);

    const isFirstRender = grid.className !== 'nlg-shell-mounted';
    if (isFirstRender) {
        grid.className = 'nlg-shell-mounted'; grid.style.cssText = '';
        grid.innerHTML = `
          <div class="nlg-wrap">
            <div class="nlg-topbar">
              <button onclick="navigateTo('ncaaf-scores')" class="back-button">← Scores</button>
            </div>
            <div class="nlg-header"></div>
            <div class="nlg-layout">
              <div class="nlg-main">
                ${_nclgTabsHtml()}
                <div class="gv-tabpanel"></div>
              </div>
              ${_nclgSidebarHtml(data, comp, home, away)}
            </div>
            <p class="pct-caption nlg-venue-caption"></p>
          </div>`;
    } else {
        const sideEl = grid.querySelector('.nlg-side');
        if (sideEl) sideEl.outerHTML = _nclgSidebarHtml(data, comp, home, away);
    }

    _nclgRenderHeader(comp, home, away);
    _nclgRenderActiveTabBody();

    const venue = data.gameInfo?.venue?.fullName ? `${data.gameInfo.venue.fullName}${data.gameInfo.venue.address?.city ? ` — ${data.gameInfo.venue.address.city}${data.gameInfo.venue.address.state ? ', ' + data.gameInfo.venue.address.state : ''}` : ''}` : '';
    const oddsLine = _nclgBroadcastOddsLine(data);
    const capParts = [venue, oddsLine].filter(Boolean);
    const capEl = grid.querySelector('.nlg-venue-caption');
    if (capEl) capEl.textContent = capParts.length ? `${capParts.join(' · ')} · data via ESPN` : 'Data via ESPN';
}

// Broadcast network + betting line, folded into the venue caption — same
// pregame-relevant-context-checked-once reasoning as NFL's own
// _nlgBroadcastOddsLine. pickcenter[0].details/overUnder verified live
// (DraftKings, "USC -37.5", O/U 61.5) against event 401864494;
// data.broadcasts was empty for that (already-final) game, but the
// /scoreboard competition carried a populated broadcasts[] for the same
// game (NBC) — so this checks both, scoreboard-shaped array first since
// that was the one actually populated.
function _nclgBroadcastOddsLine(data) {
    const parts = [];
    const b = data.broadcasts?.[0] || null;
    const bname = b && (b.names?.[0] || b.media?.shortName || b.media?.callLetters || b.type?.shortName || b.name);
    if (bname) parts.push(String(bname));
    const pc = data.pickcenter?.[0] || null;
    if (pc) {
        const line = [];
        if (pc.details) line.push(pc.details);
        if (pc.overUnder != null) line.push(`O/U ${pc.overUnder}`);
        if (line.length) parts.push(line.join(', '));
    }
    return parts.join(' · ');
}

function _nclgRenderHeader(comp, home, away) {
    const headerEl = document.querySelector('.nlg-header');
    if (!headerEl) return;
    const st = comp.status?.type || {};
    const state = st.state || 'post';
    const live = state === 'in';
    const statusText = st.shortDetail || st.detail || (state === 'pre' ? 'Scheduled' : 'Final');

    const teamBlock = (c, align) => {
        const t = c.team || {};
        const logo = t.logos?.[0]?.href || '';
        const rec = c.records?.[0]?.summary || '';
        const rank = c.curatedRank?.current && c.curatedRank.current <= 25 ? c.curatedRank.current : null;
        const won = state === 'post' && c.winner;
        return `<button class="nlg-team nlg-team--${align}" onclick="${_nclgNav(t.id)}" style="--tc:${_nclgTeamColor(t)}">
            <img src="${_escHtml(logo)}" alt="" data-hide-on-error>
            <span class="nlg-team-abbr">${rank ? `#${rank} ` : ''}${_escHtml(t.abbreviation || '')}</span>
            <span class="nlg-team-name">${_escHtml(t.shortDisplayName || t.name || '')}</span>
            ${rec ? `<span class="nlg-team-rec">${_escHtml(rec)}</span>` : ''}
            <span class="nlg-team-score ${won ? 'nlg-team-score--win' : ''}">${c.score != null ? c.score : ''}</span>
        </button>`;
    };

    headerEl.innerHTML = `
        <div class="nlg-score ${live ? 'nlg-score--live' : ''}">
          ${teamBlock(away, 'away')}
          <div class="nlg-center">
            <div class="nlg-status ${live ? 'nlg-status--live' : ''}">${_escHtml(statusText)}${live ? ' <span class="nlg-livebadge">● LIVE</span>' : ''}</div>
            <div class="nlg-vs">@</div>
          </div>
          ${teamBlock(home, 'home')}
        </div>`;
}

function _nclgNav(teamId) {
    return teamId ? `event.stopPropagation();navigateTo('ncaaf-team-${_escHtml(String(teamId))}')` : '';
}

// -- Tabs -----------------------------------------------------------------

function _nclgTabsHtml() {
    return `<div class="gv-tabs" role="tablist">${_NCLG_TABS.map(t => `<button type="button" id="gv-tab-${t.id}" class="gv-tab ${_nclg.activeTab === t.id ? 'gv-tab--active' : ''}" role="tab" aria-selected="${_nclg.activeTab === t.id}" aria-controls="gv-tabpanel" onclick="_nclgSwitchTab('${t.id}')">${_escHtml(t.label)}</button>`).join('')}</div>`;
}

function _nclgSwitchTab(tab) {
    if (_nclg.activeTab === tab) return;
    _nclg.activeTab = tab;
    const tabsEl = document.querySelector('.gv-tabs');
    if (tabsEl) tabsEl.outerHTML = _nclgTabsHtml();
    _nclgRenderActiveTabBody();
}

function _nclgRenderActiveTabBody() {
    const data = _nclg.lastData;
    const panel = document.querySelector('.gv-tabpanel');
    if (!data || !panel) return;
    const comp = _nclgComp(data);
    const home = _nclgSide(comp, 'home'), away = _nclgSide(comp, 'away');
    const scrollTop = panel.scrollTop; // preserve reading position across poll-driven re-renders
    let html = '';
    switch (_nclg.activeTab) {
        case 'summary': html = _nclgRenderSummaryTab(data, comp, home, away); break;
        case 'pbp': html = _nclgRenderPbp(data); break;
        case 'box': html = _nclgRenderBoxFull(data, home, away); break;
        case 'team': html = _nclgTeamStats(data, home, away); break;
        case 'analytics': html = _nclgRenderAnalyticsTab(data, comp, home, away); break;
        default: html = _nclgRenderSummaryTab(data, comp, home, away);
    }
    panel.innerHTML = html;
    panel.id = 'gv-tabpanel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'gv-tab-' + _nclg.activeTab);
    panel.scrollTop = scrollTop;
}

// -- Summary tab (linescore + scoring feed + NCAAF news) -------------------

function _nclgRenderSummaryTab(data, comp, home, away) {
    return `${_nclgLinescore(comp, home, away)}${_nclgScoringFeed(data)}${_nclgNewsCard(data)}`;
}

function _nclgLinescore(comp, home, away) {
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

function _nclgScoringFeed(data) {
    const plays = data.scoringPlays || [];
    if (!plays.length) return '';
    const rows = plays.map(p => {
        const t = p.team || {};
        const logo = t.logos?.[0]?.href || t.logo || '';
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

// data.news.articles[] — general college football news, not scoped to this
// specific game (same honest labeling as NFL's own news card). data.injuries
// doesn't exist at all in the NCAAF /summary shape (checked live 2026-08-29
// against event 401864494 — the key itself is absent, not just empty), so
// unlike nflLiveGame.js this file has no injuries card to build.
function _nclgNewsCard(data) {
    const ago = typeof _newsTimeAgo === 'function' ? _newsTimeAgo : () => '';
    const articles = (data.news?.articles || []).filter(a => a && a.headline && a.links?.web?.href).slice(0, 5);
    if (!articles.length) return '';
    const rows = articles.map(a => `<a class="nlg-news-row" href="${_escHtml(a.links.web.href)}" target="_blank" rel="noopener">
        <span class="nlg-news-headline">${_escHtml(a.headline)}</span>
        <span class="nlg-news-meta">${_escHtml(a.byline || '')}${a.byline ? ' · ' : ''}${_escHtml(ago(a.published || a.lastModified))}</span>
    </a>`).join('');
    return `<details class="nlg-card"><summary class="nlg-sum">College Football News</summary><div class="nlg-news">${rows}</div></details>`;
}

// -- Play-by-Play tab (drives.current + drives.previous) -------------------
// Shape verified live 2026-08-29 against event 401864494: drives.previous[]
// entries carry the same {id, description, team, plays[]} shape NFL's do,
// and plays[] carry the same {text, start/end.downDistanceText, statYardage,
// scoringPlay} fields _nlgRenderPbp already reads. Same current/previous
// id-dedupe guard as NFL's, ported preemptively — not yet confirmed live on
// an in-progress NCAAF game, but it's a cheap no-op if drives.current is
// always distinct here, and a real bug (duplicated drive card) if it isn't.

function _nclgRenderPbp(data) {
    const drivesObj = data.drives || {};
    const prev = (drivesObj.previous || []).filter(d => !drivesObj.current || d.id !== drivesObj.current.id);
    const all = [...(drivesObj.current ? [drivesObj.current] : []), ...prev.slice().reverse()];
    if (!all.length) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No play-by-play yet</p><p class="pct-caption">Drive detail appears once the game is underway.</p></div>`;
    const driveHtml = (d, i) => {
        const teamAbbr = (d.team || {}).abbreviation || '';
        const plays = (d.plays || []).slice().reverse();
        const playsHtml = plays.map(p => `<div class="nlg-pbp-play ${p.scoringPlay ? 'nlg-pbp-play--score' : ''}">
                <span class="nlg-pbp-dd">${_escHtml((p.start && p.start.downDistanceText) || '')}</span>
                <span class="nlg-pbp-text">${_escHtml(p.text || '')}</span>
                <span class="nlg-pbp-score">${p.awayScore != null ? p.awayScore : ''}–${p.homeScore != null ? p.homeScore : ''}</span>
            </div>`).join('');
        return `<details class="nlg-card" ${i < 2 ? 'open' : ''}>
            <summary class="nlg-sum">${_escHtml(teamAbbr)} · ${_escHtml(d.description || d.displayResult || 'Drive')}
                <span class="nlg-sum-teams">${_escHtml(d.shortDisplayResult || '')}</span></summary>
            <div class="nlg-pbp-plays">${playsHtml}</div>
        </details>`;
    };
    return all.map(driveHtml).join('');
}

// -- Box Score tab (all statistic groups present — NCAAF carries more of
// -- them than NFL: passing/rushing/receiving/fumbles/defensive/
// -- interceptions/kickReturns/puntReturns/kicking/punting, verified live
// -- 2026-08-29 — the generic label-driven renderer below doesn't care
// -- which groups exist, so this needed no NCAAF-specific branching. --

function _nclgRenderBoxFull(data, home, away) {
    const players = data.boxscore?.players || [];
    if (!players.length) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No box score yet</p><p class="pct-caption">Player stats post once the game starts.</p></div>`;
    const groupHtml = (group) => {
        const labels = group.labels || [];
        if (!group.athletes || !group.athletes.length) return '';
        const head = `<div class="nlg-bx-head"><span>${_escHtml((group.name || '').toUpperCase())}</span>${labels.map(l => `<span>${_escHtml(l)}</span>`).join('')}</div>`;
        const rows = group.athletes.map(a => `<div class="nlg-bx-row">
            <span class="nlg-bx-name">${_escHtml((a.athlete && (a.athlete.shortName || a.athlete.displayName)) || '')}</span>
            ${(a.stats || []).map(v => `<span>${_escHtml(v)}</span>`).join('')}
        </div>`).join('');
        return head + rows;
    };
    const teamCol = (side) => {
        const tb = players.find(p => (p.team || {}).id === (side.team || {}).id);
        if (!tb) return '';
        const groups = (tb.statistics || []).filter(g => g.athletes && g.athletes.length);
        return `<div class="nlg-bx-team"><div class="nlg-bx-team-title">${_escHtml((side.team || {}).abbreviation || '')}</div>${groups.map(groupHtml).join('')}</div>`;
    };
    return `<div class="nlg-bx nlg-bx--full">${teamCol(away)}${teamCol(home)}</div>`;
}

// -- Team Stats tab ---------------------------------------------------------
// Field list verified live 2026-08-29: firstDowns, thirdDownEff,
// fourthDownEff, totalYards, netPassingYards, rushingYards,
// totalPenaltiesYards, turnovers, possessionTime (+ a few not surfaced
// below). fourthDownEff is kept in the "want" list unlike NFL's — 4th-down
// attempts are a much more common, more telling stat in college football.

function _nclgTeamStats(data, home, away) {
    const teams = data.boxscore?.teams || [];
    if (teams.length < 2) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No team stats yet</p></div>`;
    const byHA = {};
    teams.forEach(t => { byHA[t.homeAway || (t.team && t.team.id === (home.team || {}).id ? 'home' : 'away')] = t; });
    const ht = byHA.home || teams.find(t => (t.team || {}).id === (home.team || {}).id) || teams[1];
    const at = byHA.away || teams.find(t => (t.team || {}).id === (away.team || {}).id) || teams[0];
    const get = (t, name) => { const s = (t.statistics || []).find(x => x.name === name); return s ? (s.displayValue || '') : '—'; };
    const want = [
        ['totalYards', 'Total Yards'], ['netPassingYards', 'Passing'], ['rushingYards', 'Rushing'],
        ['firstDowns', 'First Downs'], ['thirdDownEff', '3rd Down'], ['fourthDownEff', '4th Down'],
        ['totalPenaltiesYards', 'Penalties'], ['turnovers', 'Turnovers'], ['possessionTime', 'Time of Poss.'],
    ];
    const rows = want.map(([k, l]) => `<div class="nlg-ts-row">
        <span class="nlg-ts-a">${_escHtml(get(at, k))}</span>
        <span class="nlg-ts-l">${l}</span>
        <span class="nlg-ts-h">${_escHtml(get(ht, k))}</span></div>`).join('');
    return `<div class="nlg-card"><div class="nlg-sum">Team stats <span class="nlg-sum-teams">${_escHtml((at.team || {}).abbreviation || '')} · ${_escHtml((ht.team || {}).abbreviation || '')}</span></div>
        <div class="nlg-ts">${rows}</div></div>`;
}

// -- Analytics tab (Success Rate + Drive Efficiency, computed live from
// -- drives/plays already fetched — same algorithm as NFL's, since the
// -- down-based success thresholds are the same convention regardless of
// -- level. No EPA/CPOE/win-prob model here either — same reasoning as
// -- NFL's own Analytics tab. --

function _nclgAllDrives(data) {
    const drivesObj = data.drives || {};
    const prev = (drivesObj.previous || []).filter(d => !drivesObj.current || d.id !== drivesObj.current.id);
    return [...(drivesObj.current ? [drivesObj.current] : []), ...prev];
}

function _nclgIsSuccess(down, distance, yardsGained) {
    if (!distance || distance <= 0 || yardsGained == null) return null;
    const pct = yardsGained / distance;
    if (down === 1) return pct >= 0.4;
    if (down === 2) return pct >= 0.6;
    return pct >= 1.0;
}

function _nclgComputeSuccessRate(data) {
    const byTeam = {};
    _nclgAllDrives(data).forEach((d) => {
        const abbr = (d.team || {}).abbreviation;
        if (!abbr) return;
        if (!byTeam[abbr]) byTeam[abbr] = { total: 0, success: 0, byDown: { 1: { t: 0, s: 0 }, 2: { t: 0, s: 0 }, 3: { t: 0, s: 0 } } };
        (d.plays || []).forEach((p) => {
            if (p.isPenalty) return;
            const down = p.start && p.start.down;
            const distance = p.start && p.start.distance;
            if (!down || down < 1 || down > 4 || distance == null) return;
            const success = _nclgIsSuccess(down, distance, p.statYardage);
            if (success == null) return;
            const t = byTeam[abbr];
            t.total++;
            if (success) t.success++;
            const bucket = down >= 3 ? 3 : down;
            t.byDown[bucket].t++;
            if (success) t.byDown[bucket].s++;
        });
    });
    return byTeam;
}

function _nclgComputeDriveEfficiency(data) {
    const byTeam = {};
    _nclgAllDrives(data).forEach((d) => {
        const abbr = (d.team || {}).abbreviation;
        if (!abbr) return;
        if (!byTeam[abbr]) byTeam[abbr] = { drives: 0, scoringDrives: 0, totalYards: 0, totalPlays: 0 };
        const t = byTeam[abbr];
        t.drives++;
        if (d.isScore) t.scoringDrives++;
        t.totalYards += (typeof d.yards === 'number' ? d.yards : 0);
        t.totalPlays += (typeof d.offensivePlays === 'number' ? d.offensivePlays : 0);
    });
    return byTeam;
}

function _nclgRenderAnalyticsTab(data, comp, home, away) {
    const sr = _nclgComputeSuccessRate(data);
    const de = _nclgComputeDriveEfficiency(data);
    const teamAbbrs = [away, home].map((s) => (s.team || {}).abbreviation).filter(Boolean);
    const hasData = teamAbbrs.some((abbr) => sr[abbr] && sr[abbr].total);
    if (!hasData) {
        return `<div class="nlg-empty-tab">
            <p class="nlg-empty-tab-title">No plays yet</p>
            <p class="pct-caption">Success rate and drive efficiency compute live from this game's plays once it's underway.</p>
        </div>`;
    }

    const downRow = (byDown, label, bucket) => {
        const b = byDown[bucket];
        if (!b || !b.t) return '';
        const pct = Math.round(100 * b.s / b.t);
        return `<div class="nlg-ts-row"><span class="nlg-ts-l">${label}</span><span class="nlg-an-val">${pct}% <span class="pct-caption">(${b.s}/${b.t})</span></span></div>`;
    };
    const srCard = teamAbbrs.map((abbr) => {
        const s = sr[abbr];
        if (!s || !s.total) return '';
        const pct = Math.round(100 * s.success / s.total);
        return `<div class="nlg-an-team">
            <div class="nlg-bx-team-title">${_escHtml(abbr)}</div>
            <div class="nlg-an-headline">${pct}% <span class="pct-caption">(${s.success}/${s.total} plays)</span></div>
            ${downRow(s.byDown, '1st down', 1)}${downRow(s.byDown, '2nd down', 2)}${downRow(s.byDown, '3rd/4th down', 3)}
        </div>`;
    }).join('');

    const deCard = teamAbbrs.map((abbr) => {
        const d = de[abbr];
        if (!d || !d.drives) return '';
        const ypp = d.totalPlays ? (d.totalYards / d.totalPlays).toFixed(1) : '—';
        const ypd = (d.totalYards / d.drives).toFixed(1);
        const scoringPct = Math.round(100 * d.scoringDrives / d.drives);
        return `<div class="nlg-an-team">
            <div class="nlg-bx-team-title">${_escHtml(abbr)}</div>
            <div class="nlg-ts-row"><span class="nlg-ts-l">Yards / Play</span><span class="nlg-an-val">${ypp}</span></div>
            <div class="nlg-ts-row"><span class="nlg-ts-l">Yards / Drive</span><span class="nlg-an-val">${ypd}</span></div>
            <div class="nlg-ts-row"><span class="nlg-ts-l">Scoring Drives</span><span class="nlg-an-val">${scoringPct}% <span class="pct-caption">(${d.scoringDrives}/${d.drives})</span></span></div>
        </div>`;
    }).join('');

    return `<div class="nlg-card"><div class="nlg-sum">Success Rate <span class="nlg-sum-teams">≥40% on 1st · ≥60% on 2nd · 100% on 3rd/4th</span></div>
            <div class="nlg-an-grid">${srCard}</div></div>
        <div class="nlg-card"><div class="nlg-sum">Drive Efficiency</div>
            <div class="nlg-an-grid">${deCard}</div></div>
        <p class="pct-caption">Computed live from this game's plays and drives.</p>`;
}

// -- Sidebar: win probability + game leaders + game flow + standings -------

function _nclgSidebarHtml(data, comp, home, away) {
    return `<aside class="nlg-side">
        ${_nclgWinProbability(data, home, away)}
        ${_nclgSidebarLeaders(data)}
        ${_nclgGameFlow(comp, home, away)}
        ${_nclgStandingsCard(data, home, away)}
    </aside>`;
}

// data.winprobability[] verified live 2026-08-29 against event 401864494:
// 165 real, populated entries, same {homeWinPercentage, tiePercentage,
// playId} shape NFL's D-106 confirmed. Same two-tone clip-path rendering
// as NFL's — no coordinate math reinvented here.
function _nclgWinProbability(data, home, away) {
    const wp = (data.winprobability || []).filter(w => typeof w.homeWinPercentage === 'number');
    if (wp.length < 2) return '';
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const hColor = _nclgTeamColor(home.team);
    const aColor = _nclgTeamColor(away.team);
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
                <clipPath id="nclg-wp-clip-above"><rect x="0" y="0" width="${w}" height="${midY}"/></clipPath>
                <clipPath id="nclg-wp-clip-below"><rect x="0" y="${midY}" width="${w}" height="${hgt - midY}"/></clipPath>
            </defs>
            <line x1="${pad}" y1="${midY}" x2="${w - pad}" y2="${midY}" stroke="var(--border-subtle)" stroke-width="1" stroke-dasharray="3,3"/>
            <polyline points="${_escHtml(pts)}" fill="none" stroke="${_escHtml(hColor)}" stroke-width="2" clip-path="url(#nclg-wp-clip-above)"/>
            <polyline points="${_escHtml(pts)}" fill="none" stroke="${_escHtml(aColor)}" stroke-width="2" clip-path="url(#nclg-wp-clip-below)"/>
        </svg>
        <div class="nlg-wp-legend">
            <span style="color:${_escHtml(curColor)}">${_escHtml(curAbbr)} ${curVal}%</span>
            <span class="pct-caption">Win probability</span>
        </div>
    </div>`;
}

// data.leaders[] verified live 2026-08-29: {team, leaders:[{name,
// shortDisplayName, leaders:[{athlete, displayValue}]}]} — same shape NFL
// reads, different category set (passingYards/rushingYards/receivingYards/
// sacks/totalTackles vs NFL's own categories), which this already reads
// generically off each category's own label, not a hardcoded list.
function _nclgSidebarLeaders(data) {
    const leaders = data.leaders || [];
    const block = (tb) => {
        const abbr = (tb.team || {}).abbreviation || '';
        const cats = (tb.leaders || []).slice(0, 3);
        const rows = cats.map((c) => {
            const top = c.leaders && c.leaders[0];
            if (!top) return '';
            const name = (top.athlete && (top.athlete.shortName || top.athlete.displayName)) || '';
            return `<div class="nlg-leader-row"><span class="nlg-leader-cat">${_escHtml(c.shortDisplayName || c.displayName || c.name || '')}</span><span class="nlg-leader-name">${_escHtml(name)}</span><span class="nlg-leader-val">${_escHtml(top.displayValue || '')}</span></div>`;
        }).join('');
        return rows ? `<div class="nlg-leader-team"><div class="nlg-leader-team-title">${_escHtml(abbr)}</div>${rows}</div>` : '';
    };
    const blocks = leaders.map(block).filter(Boolean);
    if (!blocks.length) return '';
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Game Leaders</h3>${blocks.join('')}</div>`;
}

function _nclgGameFlow(comp, home, away) {
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
    const hColor = _nclgTeamColor(home.team);
    const aColor = _nclgTeamColor(away.team);
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Game Flow</h3>
        <svg class="nlg-flow-svg" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">
            <polyline points="${_escHtml(aPts)}" fill="none" stroke="${_escHtml(aColor)}" stroke-width="2"/>
            <polyline points="${_escHtml(hPts)}" fill="none" stroke="${_escHtml(hColor)}" stroke-width="2"/>
        </svg>
        <div class="nlg-flow-legend"><span style="color:${_escHtml(aColor)}">${_escHtml(awayAbbr)}</span><span style="color:${_escHtml(hColor)}">${_escHtml(homeAbbr)}</span></div>
    </div>`;
}

// Conference-race context (data.standings.groups[], verified live
// 2026-08-29 against event 401864494): each group is one conference's
// table. entries[].team is a bare location string ("USC", "San José
// State"), NOT an object with .abbreviation — the exact shape NFL's
// standings card had to discover the hard way (see js/nflLiveGame.js's own
// comment on this). Matched here from the start against
// home.team.location/away.team.location, which was confirmed to equal
// those same strings exactly for this game.
function _nclgStandingsCard(data, home, away) {
    const groups = data.standings?.groups || [];
    if (!groups.length) return '';
    const homeLoc = home.team?.location || '';
    const awayLoc = away.team?.location || '';
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const findGroupFor = (loc) => groups.find(g => (g.standings?.entries || []).some(e => e.team === loc));
    const gHome = findGroupFor(homeLoc), gAway = findGroupFor(awayLoc);
    const uniqueGroups = (gHome && gHome === gAway) ? [gHome] : [gHome, gAway].filter(Boolean);
    if (!uniqueGroups.length) return '';
    const table = (g) => {
        const entries = g.standings?.entries || [];
        const rows = entries.map(e => {
            const loc = e.team || '';
            const playing = loc === homeLoc || loc === awayLoc;
            const teamForColor = loc === homeLoc ? home.team : (loc === awayLoc ? away.team : null);
            const overall = (e.stats || []).find(s => s.name === 'overall');
            const pct = (e.stats || []).find(s => s.name === 'winPercent' || s.name === 'vs. Conf.');
            return `<div class="nlg-st-row ${playing ? 'nlg-st-row--playing' : ''}" ${playing ? `style="--tc:${_nclgTeamColor(teamForColor)}"` : ''}>
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
    window.showNCAAFGame = showNCAAFGame;
    window.fetchNCAAFSummary = fetchNCAAFSummary;
    window.stopNCAAFLiveGame = _nclgStop;
    window._nclgSwitchTab = _nclgSwitchTab;
}
