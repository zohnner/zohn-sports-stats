// ============================================================
// NCAA Football (college-football) — preview surface (D-042)
// ESPN public API via same-origin /api/ncaaf Pages Function.
// Phase-1 scope: Scores landing (offseason-aware). Standings /
// Teams / Rankings are the P2 remainder — routed but not built yet.
// Season model mirrors nfl.js. No keys, no D1.
// ============================================================

const _ncaafNow = new Date();
// CFB runs late Aug → mid-Jan (CFP title game). Jan belongs to the prior year's season.
const NCAAF_SEASON = (_ncaafNow.getMonth() + 1 >= 8) ? _ncaafNow.getFullYear()
    : (_ncaafNow.getMonth() === 0 ? _ncaafNow.getFullYear() - 1 : _ncaafNow.getFullYear());

// In-season: Sep–Dec + Jan (bowls/CFP). Aug = kicking off. Feb–Jul = offseason.
function _ncaafIsOffseason() {
    const m = new Date().getMonth() + 1; // 1=Jan
    return m >= 2 && m <= 7;
}

async function espnNCAAFFetch(path, params = {}, ttl = ApiCache.TTL.SHORT) {
    const url = new URL('/api/ncaaf', location.origin);
    url.searchParams.set('path', path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `ncaaf:${path}:${url.searchParams.toString()}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    Logger.debug(`NCAAF → ${url.pathname}`, undefined, 'NCAAF');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(tid);
    }
    if (!res.ok) throw new Error(`NCAAF API ${res.status}: ${res.statusText}`);
    let json;
    try { json = await res.json(); } catch { throw new Error(`NCAAF API returned non-JSON (${path})`); }
    ApiCache.set(cacheKey, json, ttl);
    return json;
}

async function fetchNCAAFScoreboard() {
    const data = await espnNCAAFFetch('/scoreboard', {}, ApiCache.TTL.SHORT);
    return (data.events || []).map(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors?.find(c => c.homeAway === 'home');
        const away = comp.competitors?.find(c => c.homeAway === 'away');
        const status = comp.status;
        const stName = status?.type?.name || 'STATUS_SCHEDULED';
        const isFinal = stName.startsWith('STATUS_FINAL');
        const isLive  = stName === 'STATUS_IN_PROGRESS' || stName === 'STATUS_HALFTIME';
        const mk = (t) => ({
            abbr:   t?.team?.abbreviation || '?',
            name:   t?.team?.displayName  || '',
            logo:   t?.team?.logo || '',
            score:  parseInt(t?.score || '0', 10),
            rank:   t?.curatedRank?.current && t.curatedRank.current <= 25 ? t.curatedRank.current : null,
            winner: t?.winner === true,
        });
        return {
            id: ev.id, name: ev.name, date: ev.date,
            homeTeam: mk(home), awayTeam: mk(away),
            isFinal, isLive,
            statusText: status?.type?.shortDetail || status?.type?.description || '',
        };
    }).filter(Boolean);
}

function _ncaafOffseasonState() {
    const glyph = (typeof _NFL_OFFSEASON_GLYPH === 'string') ? _NFL_OFFSEASON_GLYPH
        : '<div class="nfl-offseason-glyph" aria-hidden="true">🏈</div>';
    return `<div class="nfl-offseason">
        ${glyph}
        <h2 class="nfl-offseason-title">College football is in the offseason</h2>
        <p class="nfl-offseason-text">Live scores, conference standings, teams and the AP/CFP polls populate here when the ${NCAAF_SEASON} season kicks off in late August. This is a preview surface — full standings, teams and rankings are on the way.</p>
        <div class="nfl-offseason-actions">
            <button class="nfl-offseason-btn" onclick="switchSport('mlb')">MLB is live now</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('home')">Back to home</button>
        </div>
    </div>`;
}

function _ncaafGameCard(g) {
    const row = (t, other) => `
        <div class="hgc-row">
            ${t.logo ? `<img class="hgc-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error style="width:28px;height:28px">` : '<span style="width:28px"></span>'}
            <span class="hgc-team">${t.rank ? `<span class="hgc-rank">#${t.rank}</span> ` : ''}${_escHtml(t.abbr)}</span>
            <span class="hgc-score ${g.isFinal && t.winner ? 'hgc-score--win' : ''}" style="margin-left:auto">${(g.isFinal || g.isLive) ? t.score : ''}</span>
        </div>`;
    const pill = g.isLive ? '<span class="ticker-status-pill ticker-status-pill--live">LIVE</span>'
        : g.isFinal ? '<span class="ticker-status-pill ticker-status-pill--final">F</span>'
        : `<span class="hgc-status">${_escHtml(g.statusText)}</span>`;
    return `<div class="home-game-card${g.isLive ? ' home-game-card--live' : ''}">
        ${row(g.awayTeam)}
        ${row(g.homeTeam)}
        <div class="hgc-card-footer">${pill}</div>
    </div>`;
}

async function displayNCAAFScores() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'home-container';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    if (_ncaafIsOffseason()) {
        grid.innerHTML = _ncaafOffseasonState();
        return;
    }

    grid.innerHTML = `
        <div class="home-today">
            <div class="home-section-hdr">
                <span class="home-section-title">College Football — Top 25 Scoreboard</span>
                <span class="home-section-date">${dateStr}</span>
            </div>
            <div class="home-today-grid" id="ncaafScoresGrid">
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
            </div>
        </div>`;

    try {
        const games = await fetchNCAAFScoreboard();
        AppState.ncaafGames = games;
        const cell = document.getElementById('ncaafScoresGrid');
        if (!cell) return;
        cell.innerHTML = games.length
            ? games.map(_ncaafGameCard).join('')
            : `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">No games on the board right now — check back on game day.</p></div>`;
        if (typeof updateNCAAFTicker === 'function') updateNCAAFTicker(games);
    } catch (err) {
        Logger.warn('NCAAF scoreboard failed', err, 'NCAAF');
        const cell = document.getElementById('ncaafScoresGrid');
        if (cell) cell.innerHTML = `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">Couldn't load college scores. <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="displayNCAAFScores()">Retry</button></p></div>`;
    }
}

function updateNCAAFTicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) return;
    const scored = (games || []).filter(g => g.isFinal || g.isLive || g.homeTeam.score > 0 || g.awayTeam.score > 0);
    if (!scored.length) {
        ticker.classList.add('ticker--idle');
        ticker.innerHTML = `<div class="ticker__item">No college scores — season runs late Aug–Jan</div>`;
        return;
    }
    const items = [...scored, ...scored].map(g => {
        const pillCls = g.isFinal ? 'final' : g.isLive ? 'live' : 'sched';
        const pillLbl = g.isFinal ? 'F' : g.isLive ? 'LIVE' : 'SCH';
        return `<div class="ticker__item ${g.isLive ? 'ticker__item--live' : ''}" data-sport="ncaaf">
            <span class="ticker-team">${_escHtml(g.awayTeam.abbr)}</span>
            <span class="ticker-score">${g.awayTeam.score}</span>
            <span class="ticker-divider">–</span>
            <span class="ticker-score">${g.homeTeam.score}</span>
            <span class="ticker-team">${_escHtml(g.homeTeam.abbr)}</span>
            <span class="ticker-status-pill ticker-status-pill--${pillCls}">${_escHtml(pillLbl)}</span>
        </div>`;
    }).join('');
    ticker.classList.remove('ticker--idle');
    ticker.innerHTML = items;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = ticker.scrollWidth;
        if (w > 0) ticker.style.animationDuration = Math.max(15, Math.round(w / 2 / 60)) + 's';
    }));
}

function _renderNCAAFView(view) {
    if (view.startsWith('ncaaf-player-')) { showNCAAFPlayer(view.slice('ncaaf-player-'.length)); return; }
    if (view.startsWith('ncaaf-team-')) { showNCAAFTeam(view.slice('ncaaf-team-'.length)); return; }
    if (window.setBreadcrumb) setBreadcrumb(view, null);
    switch (view) {
        case 'ncaaf-standings': displayNCAAFStandings(); break;
        case 'ncaaf-teams':     displayNCAAFTeams();     break;
        case 'ncaaf-rankings':  displayNCAAFRankings();  break;
        case 'ncaaf-leaders':   displayNCAAFLeaders();   break;
        case 'ncaaf-scores':
        default:                displayNCAAFScores();
    }
}

// ── Season model for standings/rankings (last completed season) ──
// July 2026 → 2025; in-season (Aug–Dec) → current year; Jan → prior year's season.
const NCAAF_LAST_SEASON = (_ncaafNow.getMonth() + 1 >= 8) ? _ncaafNow.getFullYear() : _ncaafNow.getFullYear() - 1;
const _ncaaf = { season: NCAAF_LAST_SEASON, poll: 0 };

// ── Rankings (AP / Coaches / CFP polls) ───────────────────────
async function fetchNCAAFRankings() {
    const data = await espnNCAAFFetch('/rankings', {}, ApiCache.TTL.LONG);
    // FBS product: keep AP / Coaches (FBS) / Playoff Committee; drop FCS + Div II/III polls.
    const _fbsPoll = (n) => !!n && !/\bFCS\b|Div(ision)?\s*(II|III)\b/i.test(n);
    return (data.rankings || []).filter(r => _fbsPoll(r.shortName || r.name)).map(r => ({
        name: r.shortName || r.name || 'Poll',
        headline: r.headline || '',
        occurrence: r.occurrence?.displayValue || '',
        ranks: (r.ranks || []).map(rk => {
            const t = rk.team || {};
            return {
                current: rk.current,
                previous: rk.previous,
                trend: rk.trend || '',
                record: rk.recordSummary || '',
                points: rk.points,
                name: t.nickname || t.name || t.location || t.displayName || '?',
                abbr: t.abbreviation || '',
                logo: (t.logos && t.logos[0] && t.logos[0].href) || t.logo || '',
            };
        }),
    })).filter(p => p.ranks.length);
}

async function displayNCAAFRankings() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs" id="ncaafPollTabs"></div>
        <div id="ncaafRankBody"><div class="skeleton-line" style="height:340px;border-radius:var(--radius-md)"></div></div>`;
    let polls;
    try { polls = await fetchNCAAFRankings(); }
    catch (err) {
        Logger.warn('NCAAF rankings failed', err, 'NCAAF');
        document.getElementById('ncaafRankBody').innerHTML = _ncaafErr('Couldn\'t load the polls.', 'displayNCAAFRankings');
        return;
    }
    if (!polls.length) {
        grid.innerHTML = `<div class="standings-container">${_ncaafOffseasonState()}</div>`;
        return;
    }
    if (_ncaaf.poll >= polls.length) _ncaaf.poll = 0;
    const tabs = document.getElementById('ncaafPollTabs');
    tabs.innerHTML = polls.map((p, i) =>
        `<button class="standings-tab${i === _ncaaf.poll ? ' active' : ''}" data-poll="${i}">${_escHtml(p.name)}</button>`).join('');
    tabs.querySelectorAll('.standings-tab').forEach(b => b.addEventListener('click', () => {
        _ncaaf.poll = parseInt(b.dataset.poll, 10); displayNCAAFRankings();
    }));
    const p = polls[_ncaaf.poll];
    const rows = p.ranks.map(rk => {
        const move = rk.previous && rk.current
            ? (rk.previous === 0 ? '<span class="standings-streak--win">NEW</span>'
               : rk.previous > rk.current ? `<span class="standings-streak--win">▲${rk.previous - rk.current}</span>`
               : rk.previous < rk.current ? `<span class="standings-streak--loss">▼${rk.current - rk.previous}</span>`
               : '<span class="standings-gb">—</span>')
            : '';
        return `<tr class="standings-row">
            <td class="standings-rank-cell"><span class="standings-rank">${rk.current}</span></td>
            <td class="standings-team-cell">
                ${rk.logo ? `<img class="standings-logo" src="${_escHtml(rk.logo)}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="standings-team-name">${_escHtml(rk.name)}</span>
            </td>
            <td class="standings-num">${_escHtml(rk.record)}</td>
            <td class="standings-num standings-split">${move}</td>
        </tr>`;
    }).join('');
    document.getElementById('ncaafRankBody').innerHTML = `
        <div class="standings-table-wrap">
            <table class="standings-table">
                <thead><tr><th class="standings-th-rank">#</th><th class="standings-th-team">Team</th><th>Record</th><th>Move</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="standings-legend">${_escHtml(p.name)}${p.occurrence ? ' · ' + _escHtml(p.occurrence) : ''}. Source: ESPN. ▲/▼ = movement vs the previous poll.</p>`;
}

// ── Standings + Teams (shared site.web.api conference tree) ────
function _ncaafStandingRow(e) {
    const t = e.team || {};
    const stat = (names) => (e.stats || []).find(x => names.includes(x.name) || names.includes(x.type)) || null;
    const num  = (names) => { const x = stat(names); return x ? (x.value != null ? x.value : parseFloat(x.displayValue)) : null; };
    const disp = (names) => { const x = stat(names); return x ? (x.displayValue || '') : ''; };
    const w = num(['wins']), l = num(['losses']);
    return {
        id: t.id || '',
        name: t.displayName || t.name || t.location || '?',
        abbr: t.abbreviation || '',
        logo: (t.logos && t.logos[0] && t.logos[0].href) || t.logo || '',
        overall: (w != null && l != null) ? `${w}-${l}` : (disp(['overall', 'total']) || '—'),
        conf: disp(['vsConf', 'conferenceRecord', 'vsConference']) || '',
        winPct: num(['winPercent']),
    };
}

function _ncaafCollectConfs(node, trail, out) {
    const nm = node.name || node.abbreviation;
    const t2 = nm ? [...trail, nm] : trail;
    const entries = (node.standings && node.standings.entries) || [];
    if (entries.length) {
        const label = t2.join(' — ') || nm || 'Conference';
        out.push({ name: label, teams: entries.map(_ncaafStandingRow).filter(Boolean) });
    }
    for (const c of (node.children || [])) _ncaafCollectConfs(c, t2, out);
}

async function fetchNCAAFStandings(season) {
    const cacheKey = `ncaaf:standings:${season}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;
    const res = await fetch(`/api/ncaafstandings?season=${season}`);
    if (!res.ok) throw new Error(`NCAAF standings ${res.status}`);
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.reason || 'standings unavailable');
    const confs = [];
    for (const c of (data.children || [])) _ncaafCollectConfs(c, [], confs);
    const out = confs.filter(c => c.teams.length);
    ApiCache.set(cacheKey, out, ApiCache.TTL.LONG);
    return out;
}

function _ncaafSeasonSelect() {
    const yrs = [];
    for (let y = NCAAF_LAST_SEASON; y >= NCAAF_LAST_SEASON - 5; y--) yrs.push(y);
    return `<select id="ncaafSeasonSel" class="standings-tab" style="cursor:pointer">${
        yrs.map(y => `<option value="${y}"${y === _ncaaf.season ? ' selected' : ''}>${y} season</option>`).join('')}</select>`;
}

async function displayNCAAFStandings() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs">${_ncaafSeasonSelect()}</div>
        <div id="ncaafStdBody"><div class="skeleton-line" style="height:360px;border-radius:var(--radius-md)"></div></div>`;
    document.getElementById('ncaafSeasonSel').addEventListener('change', (ev) => {
        _ncaaf.season = parseInt(ev.target.value, 10); displayNCAAFStandings();
    });
    let confs;
    try { confs = await fetchNCAAFStandings(_ncaaf.season); }
    catch (err) {
        Logger.warn('NCAAF standings failed', err, 'NCAAF');
        document.getElementById('ncaafStdBody').innerHTML = _ncaafErr('Standings are unavailable for this season.', 'displayNCAAFStandings');
        return;
    }
    if (!confs.length) {
        document.getElementById('ncaafStdBody').innerHTML = _ncaafErr('No standings returned for the ' + _ncaaf.season + ' season.', 'displayNCAAFStandings');
        return;
    }
    document.getElementById('ncaafStdBody').innerHTML = confs.map(c => `
        <section class="mlb-division-panel" style="margin-bottom:var(--space-4)">
            <h2 class="standings-team-name" style="font-family:var(--font-display);font-size:1.02rem;margin:0 0 0.5rem">${_escHtml(c.name)}</h2>
            <div class="standings-table-wrap">
                <table class="standings-table">
                    <thead><tr><th class="standings-th-team">Team</th><th>Conf</th><th>Overall</th></tr></thead>
                    <tbody>${c.teams.map(t => `<tr class="standings-row">
                        <td class="standings-team-cell">
                            ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : ''}
                            <span class="standings-team-name">${_escHtml(t.name)}</span>
                        </td>
                        <td class="standings-num standings-pct">${_escHtml(t.conf || '—')}</td>
                        <td class="standings-num">${_escHtml(t.overall)}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </section>`).join('') +
        `<p class="standings-legend">${_escHtml(String(_ncaaf.season))} FBS conference standings. Source: ESPN. Conf = record within the conference.</p>`;
}

async function displayNCAAFTeams() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs">${_ncaafSeasonSelect()}</div>
        <div id="ncaafTeamsBody"><div class="skeleton-line" style="height:360px;border-radius:var(--radius-md)"></div></div>`;
    document.getElementById('ncaafSeasonSel').addEventListener('change', (ev) => {
        _ncaaf.season = parseInt(ev.target.value, 10); displayNCAAFTeams();
    });
    let confs;
    try { confs = await fetchNCAAFStandings(_ncaaf.season); }
    catch (err) {
        Logger.warn('NCAAF teams failed', err, 'NCAAF');
        document.getElementById('ncaafTeamsBody').innerHTML = _ncaafErr('Teams are unavailable for this season.', 'displayNCAAFTeams');
        return;
    }
    if (!confs.length) {
        document.getElementById('ncaafTeamsBody').innerHTML = _ncaafErr('No teams returned for the ' + _ncaaf.season + ' season.', 'displayNCAAFTeams');
        return;
    }
    document.getElementById('ncaafTeamsBody').innerHTML = confs.map(c => `
        <section style="margin-bottom:var(--space-4)">
            <h2 class="standings-team-name" style="font-family:var(--font-display);font-size:1.02rem;margin:0 0 0.6rem">${_escHtml(c.name)} <span class="standings-gb" style="font-size:0.8rem">· ${c.teams.length}</span></h2>
            <div class="ncaaf-team-grid">${c.teams.map(t => `<div class="ncaaf-team-chip${t.id ? ' ncaaf-team-chip--link' : ''}"${t.id ? ` role="button" tabindex="0" aria-label="${_escHtml(t.name)}" onclick="navigateTo('ncaaf-team-${_escHtml(String(t.id))}')"` : ''}>
                ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : '<span class="standings-logo"></span>'}
                <span class="ncaaf-team-chip-name">${_escHtml(t.name)}</span>
            </div>`).join('')}</div>
        </section>`).join('') +
        `<p class="standings-legend">FBS teams grouped by conference (${_escHtml(String(_ncaaf.season))}). Source: ESPN.</p>`;
}

function _ncaafErr(msg, retryFn) {
    return `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">${_escHtml(msg)}</p><div class="nfl-offseason-actions"><button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="${retryFn}()">Retry</button></div></div>`;
}

// ── Leaders (real season stats via /api/ncaafstats) ──────────
const _NCF_LCOLORS = ['#c8452b','#3b7dd8','#2e9e6b','#b0842f','#8b5cf6','#d6455f','#0d9488','#c2410c','#6366f1','#0891b2'];

async function displayNCAAFLeaders() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'players-grid';
    grid.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton-card" style="min-height:240px"></div>`).join('');
    let data;
    try {
        const cacheKey = `ncaaf:leaders:${_ncaaf.season}`;
        data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/ncaafstats?season=${_ncaaf.season}`);
            if (!res.ok) throw new Error('leaders ' + res.status);
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
    } catch (err) {
        Logger.warn('NCAAF leaders failed', err, 'NCAAF');
        grid.className = 'standings-container';
        grid.innerHTML = _ncaafErr("Couldn't load college leaders.", 'displayNCAAFLeaders');
        return;
    }
    if (!data.categories || !data.categories.length) {
        grid.className = 'standings-container';
        grid.innerHTML = _ncaafOffseasonState();
        return;
    }
    grid.innerHTML = data.categories.map((cat, ci) => {
        const color = _NCF_LCOLORS[ci % _NCF_LCOLORS.length];
        const rows = cat.leaders.map((l, i) => `
            <div class="nfl-lrow nfl-lrow--link" role="button" tabindex="0" aria-label="${_escHtml(l.name)}${l.pos ? ', ' + _escHtml(l.pos) : ''}" onclick="navigateTo('ncaaf-player-${_escHtml(String(l.id))}')">
                <span class="nfl-lrow-rank">${i + 1}</span>
                <div class="nfl-lrow-av">${l.headshot ? `<img src="${_escHtml(l.headshot)}" alt="" loading="lazy" data-hide-on-error>` : ''}</div>
                <div class="nfl-lrow-main">
                    <div class="nfl-lrow-name">${_escHtml(l.name)}</div>
                    <div class="nfl-lrow-meta">${_escHtml(l.team)}${l.pos ? ' · ' + _escHtml(l.pos) : ''}</div>
                </div>
                <span class="nfl-lrow-val" style="color:${color}">${_escHtml(String(l.value))}</span>
            </div>`).join('');
        return `<div class="card" style="padding:0;overflow:hidden;border-left:3px solid ${color}">
            <div class="nfl-card-head" style="justify-content:space-between">
                <span>${_escHtml(cat.label)}</span><span style="color:${color};font-size:0.64rem">${_escHtml(cat.unit)}</span>
            </div>${rows}</div>`;
    }).join('');
}

// ── Player detail on the shared frame (D-044) ────────────────
async function showNCAAFPlayer(id) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    AppState.currentView = 'ncaaf-player-' + id;
    grid.className = 'player-detail-container';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:320px"></div>`;
    let data;
    try {
        const cacheKey = `ncaaf:athlete:${id}:${_ncaaf.season}`;
        data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/ncaafathlete?id=${encodeURIComponent(id)}&season=${_ncaaf.season}`);
            if (!res.ok) throw new Error('athlete ' + res.status);
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
    } catch (err) {
        Logger.warn('NCAAF athlete failed', err, 'NCAAF');
        grid.innerHTML = _ncaafErr("Couldn't load this player.", 'displayNCAAFLeaders');
        return;
    }
    displayNCAAFPlayerDetail(data);
}

function displayNCAAFPlayerDetail(data) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'player-detail-container';
    const bio = (data && data.bio) || {};
    if (!bio.name) { grid.innerHTML = _ncaafErr('Player not found.', 'displayNCAAFLeaders'); return; }
    if (window.setBreadcrumb) setBreadcrumb('ncaaf-leaders', _escHtml(bio.name));

    const accent = (typeof SPORTS_META !== 'undefined' && SPORTS_META.ncaaf && SPORTS_META.ncaaf.accent) || '#c8452b';
    const initials = bio.name.split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const headshotImg = bio.headshot ? `<img class="player-headshot" src="${_escHtml(bio.headshot)}" alt="" loading="lazy" data-hide-on-error>` : '';
    const teamRow = `${bio.teamLogo ? `<img src="${_escHtml(bio.teamLogo)}" alt="" class="player-hero-team-logo" loading="lazy" data-hide-on-error>` : ''}<span>${_escHtml(bio.team || '')}</span>`;

    const header = detailHeader({
        back: { view: 'ncaaf-leaders', label: 'Leaders' },
        actions: [{ label: 'Share', onclick: "window._shareCurrentPage && window._shareCurrentPage()", title: 'Copy link' }],
        avatar: { headshotHtml: headshotImg, initials, accent, className: 'nfl-hero-avatar' },
        name: bio.name,
        chips: bio.pos ? [{ text: bio.pos }] : [],
        teamRow,
        meta: [`${data.season} College Football${data.gp ? ` · ${_escHtml(String(data.gp))} GP` : ''}`],
    });

    const bioRows = [
        ['Position', bio.pos], ['Class', bio.classYr], ['Jersey', bio.jersey ? '#' + bio.jersey : ''],
        ['Height', bio.height], ['Weight', bio.weight], ['Team', bio.team],
    ].filter(r => r[1]).map(([l, v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${_escHtml(String(v))}</span></div>`).join('');
    const profile = detailSection({ title: 'Player Profile', body: `<div class="player-details detail-bio-wide">${bioRows}</div>` });

    const statSections = (data.groups || []).map(g => {
        const cells = g.stats.map(([l, v]) => `<div class="ncf-stat"><span class="ncf-stat-v">${_escHtml(String(v))}</span><span class="ncf-stat-l">${_escHtml(l)}</span></div>`).join('');
        return detailSection({ title: g.label, body: `<div class="ncf-statline">${cells}</div>` });
    }).join('');

    const noStats = (!data.groups || !data.groups.length)
        ? detailSection({ title: 'Season Stats', body: `<p class="detail-prose">No ${data.season} season stats for ${_escHtml(bio.name)} yet — common for reserves and early-career players.</p>` })
        : '';

    grid.innerHTML = header + profile + statSections + noStats +
        `<p class="detail-note" style="margin-top:0.75rem">${data.season} regular season · Source: ESPN.</p>`;
}

// ── Team detail (D-044 P4) — banner + team leaders ───────────
async function showNCAAFTeam(id) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    AppState.currentView = 'ncaaf-team-' + id;
    grid.className = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:360px"></div>`;
    let team;
    try {
        const data = await espnNCAAFFetch(`/teams/${id}`, {}, ApiCache.TTL.LONG);
        team = data && data.team;
    } catch (err) {
        Logger.warn('NCAAF team failed', err, 'NCAAF');
        grid.innerHTML = _ncaafErr("Couldn't load this team.", 'displayNCAAFTeams');
        return;
    }
    if (!team) { grid.innerHTML = _ncaafErr('Team not found.', 'displayNCAAFTeams'); return; }
    let roster = [], sched = [], stats = null;
    try { const rd = await espnNCAAFFetch(`/teams/${id}/roster`, {}, ApiCache.TTL.LONG); roster = (rd && rd.athletes) || []; } catch (_) {}
    try { const sd = await espnNCAAFFetch(`/teams/${id}/schedule`, {}, ApiCache.TTL.MEDIUM); sched = (sd && sd.events) || []; } catch (_) {}
    try { stats = await fetch(`/api/ncaafstats?season=${_ncaaf.season}`).then(r => r.json()); } catch (_) {}
    displayNCAAFTeamDetail(team, roster, sched, stats);
}

function displayNCAAFTeamDetail(team, roster, sched, stats) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = '';
    if (window.setBreadcrumb) setBreadcrumb('ncaaf-teams', _escHtml(team.displayName || team.name || 'Team'));
    const color   = '#' + String(team.color || 'c8452b').replace('#', '');
    const abbr    = team.abbreviation || '';
    const summary = team.standingSummary || '';
    const conf    = (summary.match(/\bin\s+(.+)$/) || [])[1] || '';
    const record  = (team.record && team.record.items && team.record.items[0] && team.record.items[0].summary) || '';

    const GLABEL = { offense: 'Offense', defense: 'Defense', specialTeam: 'Special Teams' };
    const mapItem = p => ({
        id: p.id, name: p.fullName || p.displayName || '',
        pos: (p.position && p.position.abbreviation) || '', number: p.jersey || '',
        starter: false, injury: '', headshot: (p.headshot && p.headshot.href) || '',
    });
    const groups = (roster || []).map(g => ({
        label: GLABEL[g.position] || g.position || 'Squad',
        players: (g.items || []).map(mapItem),
    })).filter(g => g.players.length);
    const rosterCount = groups.reduce((n, g) => n + g.players.length, 0);

    const seen = new Set(), assets = [];
    if (stats && stats.categories) {
        stats.categories.forEach(cat => (cat.leaders || []).forEach(l => {
            if (l.team === abbr && !seen.has(l.id)) {
                seen.add(l.id);
                assets.push({ id: l.id, name: l.name, pos: l.pos || '', number: '', adp: null, posColor: color, headshot: l.headshot || '' });
            }
        }));
    }

    let scheduleHtml;
    const nowMs = Date.now();
    const upcoming = (sched || []).map(ev => {
        const comp = ev.competitions && ev.competitions[0];
        const d = ev.date ? new Date(ev.date).getTime() : 0;
        return { ev, comp, d };
    }).filter(x => x.comp && x.d >= nowMs - 6 * 3600 * 1000).sort((a, b) => a.d - b.d)[0];
    if (upcoming) {
        const comps = upcoming.comp.competitors || [];
        const me  = comps.find(c => c.team && c.team.id === team.id) || comps.find(c => c.homeAway === 'home');
        const opp = comps.find(c => c !== me) || {};
        const home = me && me.homeAway === 'home';
        const ot = opp.team || {};
        let dateStr = '';
        try { dateStr = new Date(upcoming.ev.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (_) {}
        scheduleHtml = `<section class="team-section"><h3 class="team-section__title">Schedule</h3>
            <div class="team-next-card"><span class="team-next-card__label">Next game</span>
            <span class="team-next-card__matchup">${home ? 'vs' : '@'} ${(ot.logos && ot.logos[0]) ? `<img src="${_escHtml(ot.logos[0].href)}" alt="" loading="lazy" data-hide-on-error>` : ''}<strong>${_escHtml(ot.abbreviation || ot.displayName || 'TBD')}</strong></span>
            ${dateStr ? `<span class="team-next-card__date">${_escHtml(dateStr)}</span>` : ''}</div></section>`;
    } else {
        scheduleHtml = `<section class="team-section"><h3 class="team-section__title">Schedule</h3><div class="team-empty">The ${_ncaaf.season} schedule appears here once released.</div></section>`;
    }

    const model = {
        sport: 'ncaaf', abbr, name: team.displayName || team.name || 'Team',
        logo: (team.logos && team.logos[0] && team.logos[0].href) || '', teamColor: color,
        division: conf, record,
        seasonLabel: record ? '' : (summary || `${_ncaaf.season} season`),
        facts: [
            { label: 'Players', value: rosterCount },
            ...groups.map(g => ({ label: g.label, value: g.players.length })),
            ...(conf ? [{ label: 'Conference', value: conf }] : []),
        ],
        assets: assets.slice(0, 6), assetsTitle: 'Team Leaders', assetsCountLabel: String(_ncaaf.season),
        groups, rosterEmpty: 'Roster data unavailable for this team right now.',
        scheduleHtml, backView: 'ncaaf-teams', backLabel: 'Teams', playerPrefix: 'ncaaf-player-',
    };

    grid.innerHTML = (typeof _renderTeamPage === 'function')
        ? _renderTeamPage(model)
        : `<div class="ncf-team-banner" style="--team:${color}"><button onclick="navigateTo('ncaaf-teams')" class="back-button">\u2190 Teams</button><h1 class="player-detail-name">${_escHtml(model.name)}</h1><p class="player-detail-meta">${_escHtml(abbr)}${summary ? ' \u00b7 ' + _escHtml(summary) : ''}</p></div>`;
}

window.fetchNCAAFScoreboard = fetchNCAAFScoreboard;
window.displayNCAAFScores   = displayNCAAFScores;
window.displayNCAAFRankings = displayNCAAFRankings;
window.displayNCAAFStandings = displayNCAAFStandings;
window.displayNCAAFTeams    = displayNCAAFTeams;
window.displayNCAAFLeaders  = displayNCAAFLeaders;
window.showNCAAFPlayer      = showNCAAFPlayer;
window.showNCAAFTeam        = showNCAAFTeam;
window._renderNCAAFView     = _renderNCAAFView;
window.updateNCAAFTicker    = updateNCAAFTicker;
