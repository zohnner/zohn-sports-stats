// ============================================================
// NBA — revived as a live 7th sport (D-161, 2026-09-14, owner-directed).
// Replaces the old Ball Don't Lie v1 data layer entirely (BDL's free tier
// blocks /stats and /season_averages with a 401 — see DECISIONS.md
// D-052/D-161) with the same ESPN-proxy-clone pattern proven four times
// already (NFL, NCAAF, NCAAB, WNBA). Clone of js/wnba.js.
//
// Scope (v1, D-161 continuation): Scores, Standings (conference+division-
// grouped — NBA has real divisions, unlike WNBA's flat conference tree),
// Teams, Leaders + player detail. No Playoff Picture in v1 (unlike WNBA's
// standings-derived snapshot, NBA has a real per-conference bracket once
// the postseason starts — a materially different, larger build; scoped out
// for now, not forgotten). No Rankings (no poll exists for a pro league).
//
// Season model: NBA labels a season by its END year (confirmed live
// 2026-09-14 against the real ESPN scoreboard: the 2025-26 season, running
// 2025-10-01..2026-06-27, reports season.year:2026) — the same end-year
// convention NCAAB uses, unlike NCAAF/NFL's start-year labeling. In-season
// Oct-June; Jul-Sep is the only true offseason (no games at all).
//
// Self-contained ticker (no Scorebug.normalize*Game reuse) — same
// deliberate choice WNBA made, avoiding the ncaab.js bug where
// Scorebug.normalizeNCAAFGame hardcodes sport:'ncaaf'.
// No keys, no D1.
// ============================================================

const _nbaNow = new Date();
// NBA_SEASON — the season "coming up" or currently live, for offseason copy.
// Flips to the next end-year label right after the current season ends in
// June (same fix shape D-052 applied to NCAAB_SEASON after finding its
// original flip-at-November bug) so the anticipated season is named
// correctly through the entire Jul-Sep offseason, not just right before
// it starts.
const NBA_SEASON = (_nbaNow.getMonth() + 1 <= 6) ? _nbaNow.getFullYear() : _nbaNow.getFullYear() + 1;

// In-season: Oct-June. Jul-Sep = offseason.
function _nbaIsOffseason() {
    const m = new Date().getMonth() + 1; // 1=Jan
    return m >= 7 && m <= 9;
}

// NBA_LAST_SEASON — the season with real data to show by default (Standings/
// Teams/Leaders). Diverges from NBA_SEASON only Jul-Sep: NBA_SEASON says the
// next season is coming; NBA_LAST_SEASON correctly keeps showing last
// season's real final data (the new season's games don't start until Oct).
const NBA_LAST_SEASON = (_nbaNow.getMonth() + 1 >= 10) ? _nbaNow.getFullYear() + 1 : _nbaNow.getFullYear();
const _nba = { season: NBA_LAST_SEASON };

async function espnNBAFetch(path, params = {}, ttl = ApiCache.TTL.SHORT) {
    const url = new URL('/api/nba', location.origin);
    url.searchParams.set('path', path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `nba:${path}:${url.searchParams.toString()}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    Logger.debug(`NBA → ${url.pathname}`, undefined, 'NBA');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(tid);
    }
    if (!res.ok) throw new Error(`NBA API ${res.status}: ${res.statusText}`);
    let json;
    try { json = await res.json(); } catch { throw new Error(`NBA API returned non-JSON (${path})`); }
    ApiCache.set(cacheKey, json, ttl);
    return json;
}

async function fetchNBAScoreboard() {
    const data = await espnNBAFetch('/scoreboard', {}, ApiCache.TTL.SHORT);
    return (data.events || []).map(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors?.find(c => c.homeAway === 'home');
        const away = comp.competitors?.find(c => c.homeAway === 'away');
        const status = comp.status;
        // Canonical pre/in/post state (D-129's fix) rather than a hardcoded
        // STATUS_* name allowlist — that allowlist approach is exactly what
        // silently dropped live status at every football quarter break
        // (missing STATUS_END_PERIOD) until D-130 fixed it. No reason to
        // reintroduce the same class of bug for a sport with a between-
        // period status of its own.
        const state = status?.type?.state;
        const isFinal = state === 'post';
        const isLive  = state === 'in';
        const mk = (t) => ({
            abbr:   t?.team?.abbreviation || '?',
            name:   t?.team?.displayName  || '',
            logo:   t?.team?.logo || '',
            score:  parseInt(t?.score || '0', 10),
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

function _nbaOffseasonState() {
    return `<div class="nfl-offseason">
        <div class="nfl-offseason-glyph" aria-hidden="true">${_iconSvg('basketball', 44)}</div>
        <h2 class="nfl-offseason-title">The NBA is in the offseason</h2>
        <p class="nfl-offseason-text">Live scores, conference standings, and teams populate here when the ${NBA_SEASON} season starts in October.</p>
        <div class="nfl-offseason-actions">
            <button class="nfl-offseason-btn" onclick="switchSport('mlb')">MLB is live now</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('home')">Back to home</button>
        </div>
    </div>`;
}

function _nbaGameCard(g) {
    const row = (t) => `
        <div class="hgc-row">
            ${t.logo ? `<img class="hgc-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error style="width:28px;height:28px">` : '<span style="width:28px"></span>'}
            <span class="hgc-team">${_escHtml(t.abbr)}</span>
            <span class="hgc-score ${g.isFinal && t.winner ? 'hgc-score--win' : ''}" style="margin-left:auto">${(g.isFinal || g.isLive) ? t.score : ''}</span>
        </div>`;
    const pill = g.isLive ? '<span class="ticker-status-pill ticker-status-pill--live">LIVE</span>'
        : g.isFinal ? '<span class="ticker-status-pill ticker-status-pill--final">F</span>'
        : `<span class="hgc-status">${_escHtml(g.statusText)}</span>`;
    return `<div class="home-game-card${g.isLive ? ' home-game-card--live' : ''}" role="button" tabindex="0" style="cursor:pointer" onclick="showNBAGame('${_escHtml(String(g.id))}')" onkeydown="if(event.key==='Enter')showNBAGame('${_escHtml(String(g.id))}')">
        ${row(g.awayTeam)}
        ${row(g.homeTeam)}
        <div class="hgc-card-footer">${pill}</div>
    </div>`;
}

async function displayNBAScores() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'home-container';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    if (_nbaIsOffseason()) {
        grid.innerHTML = _nbaOffseasonState();
        return;
    }

    grid.innerHTML = `
        <div class="home-today">
            <div class="home-section-hdr">
                <span class="home-section-title">NBA — Scoreboard</span>
                <span class="home-section-date">${dateStr}</span>
            </div>
            <div class="home-today-grid" id="nbaScoresGrid">
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
            </div>
        </div>`;

    try {
        const games = await fetchNBAScoreboard();
        AppState.nbaGames = games;
        const cell = document.getElementById('nbaScoresGrid');
        if (!cell) return;
        cell.innerHTML = games.length
            ? games.map(_nbaGameCard).join('')
            : `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">No games on the board right now — check back on game day.</p></div>`;
        if (typeof updateNBATicker === 'function') updateNBATicker(games);
    } catch (err) {
        Logger.warn('NBA scoreboard failed', err, 'NBA');
        const cell = document.getElementById('nbaScoresGrid');
        if (cell) cell.innerHTML = `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">Couldn't load NBA scores. <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="displayNBAScores()">Retry</button></p></div>`;
    }
}

function updateNBATicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) return;
    const scored = (games || []).filter(g => g.isFinal || g.isLive || g.homeTeam.score > 0 || g.awayTeam.score > 0);
    if (!scored.length) return; // only NBA's own Scores page owns its ticker moment; don't blank the shared ticker if another sport already populated it
    const row = (t, cls) => `
        <span class="ticker-team">${_escHtml(t.abbr)}</span>
        <span class="ticker-score${cls}">${t.score ?? 0}</span>`;
    const items = [...scored, ...scored].map(g => {
        const pillCls = g.isLive ? 'live' : g.isFinal ? 'final' : 'sched';
        const pillLbl = g.isLive ? 'LIVE' : g.isFinal ? 'F' : 'SCH';
        return `<div class="ticker__item${g.isLive ? ' ticker__item--live' : g.isFinal ? ' ticker__item--final' : ''}" data-game-id="${_escHtml(g.id)}" data-sport="nba" style="cursor:pointer">
            <span class="ticker-glyph" aria-hidden="true">${_iconSvg('basketball')}</span>
            ${g.homeTeam.logo ? `<img class="ticker-logo" src="${_escHtml(g.homeTeam.logo)}" alt="" loading="lazy" data-hide-on-error>` : ''}
            ${row(g.homeTeam, g.isFinal && g.homeTeam.winner ? ' ticker-score--win' : '')}
            <span class="ticker-divider">–</span>
            ${row(g.awayTeam, g.isFinal && g.awayTeam.winner ? ' ticker-score--win' : '')}
            ${g.awayTeam.logo ? `<img class="ticker-logo" src="${_escHtml(g.awayTeam.logo)}" alt="" loading="lazy" data-hide-on-error>` : ''}
            <span class="ticker-status-pill ticker-status-pill--${pillCls}">${pillLbl}</span>
        </div>`;
    }).join('');
    if (!items) return;
    ticker.classList.remove('ticker--idle');
    ticker.innerHTML = items;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = ticker.scrollWidth;
        if (w > 0) ticker.style.animationDuration = Math.max(15, Math.round(w / 2 / 60)) + 's';
    }));
}

function _renderNBAView(view) {
    if (window.StatsCharts && StatsCharts.destroyAll) StatsCharts.destroyAll();
    if (view.startsWith('nba-player-')) { showNBAPlayer(view.slice('nba-player-'.length)); return; }
    if (view.startsWith('nba-game-'))   { showNBAGame(view.slice('nba-game-'.length));     return; }
    if (window.setBreadcrumb) setBreadcrumb(view, null);
    switch (view) {
        case 'nba-standings':      displayNBAStandings();          break;
        case 'nba-teams':          displayNBATeams();              break;
        case 'nba-leaders':        displayNBALeaders();            break;
        case 'nba-powerrankings':  if (typeof _prShow === 'function') _prShow('nba'); break;
        case 'nba-scores':
        case 'nba-home':
        default:                displayNBAScores();
    }
}

function _nbaErr(msg, retryFn) {
    return `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">${_escHtml(msg)}</p><div class="nfl-offseason-actions"><button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="${retryFn}()">Retry</button></div></div>`;
}

// ── Standings + Teams (shared site.web.api conference/division tree) ───
function _nbaStandingRow(e) {
    const t = e.team || {};
    const stat = (names) => (e.stats || []).find(x => names.includes(x.name) || names.includes(x.type)) || null;
    const num  = (names) => { const x = stat(names); return x ? (x.value != null ? x.value : parseFloat(x.displayValue)) : null; };
    const disp = (names) => { const x = stat(names); return x ? (x.displayValue || '') : ''; };
    const w = num(['wins']), l = num(['losses']);
    let pct = num(['winPercent', 'winpercent']);
    if (pct == null && w != null && l != null && (w + l) > 0) pct = w / (w + l);
    return {
        id: t.id || '',
        name: t.displayName || t.name || t.location || '?',
        abbr: t.abbreviation || '',
        logo: (t.logos && t.logos[0] && t.logos[0].href) || t.logo || '',
        overall: (w != null && l != null) ? `${w}-${l}` : (disp(['overall', 'total']) || '—'),
        gb: disp(['gamesBehind']) || '',
        streak: disp(['streak']) || '',
        w, l, pct,
    };
}

// Recursive collector — NBA's real tree is conference > division > entries
// (confirmed live 2026-09-14: 2 conferences x 3 divisions each, the same
// shape NFL/NCAAF use), unlike WNBA's flat conference-only tree. This
// collector handles both without special-casing (it already terminates as
// soon as it finds standings.entries at any depth), so it's shared verbatim
// with no NBA-specific branching.
function _nbaCollectConfs(node, trail, out) {
    const nm = node.name || node.abbreviation;
    const t2 = nm ? [...trail, nm] : trail;
    const entries = (node.standings && node.standings.entries) || [];
    if (entries.length) {
        const label = t2.join(' — ') || nm || 'Conference';
        out.push({ name: label, teams: entries.map(_nbaStandingRow).filter(Boolean) });
    }
    for (const c of (node.children || [])) _nbaCollectConfs(c, t2, out);
}

async function fetchNBAStandings(season) {
    const cacheKey = `nba:standings:${season}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;
    const res = await fetch(`/api/nbastandings?season=${season}`);
    if (!res.ok) throw new Error(`NBA standings ${res.status}`);
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.reason || 'standings unavailable');
    const confs = [];
    for (const c of (data.children || [])) _nbaCollectConfs(c, [], confs);
    const out = confs.filter(c => c.teams.length);
    ApiCache.set(cacheKey, out, ApiCache.TTL.LONG);
    return out;
}

// Power Rankings adapter (js/powerRankings.js), modeled directly on WNBA's
// verified pattern (js/wnba.js's fetchWNBASeasonGames): 30 teams makes a
// per-team /teams/{id}/schedule loop (30 calls) reasonable the way it was
// for WNBA's 15, unlike NCAAB's 360+-team pool. UNVERIFIED until the season
// starts (2026-09-15): NBA is in the offseason right now, so the per-team
// schedule endpoint's shape for this specific sport (seasonType.type,
// competitors[].score.value) has not been checked against a real NBA game
// the way it was for WNBA -- carried forward as the same ESPN platform
// family, not re-verified.
async function fetchNBASeasonGames() {
    const cacheKey = `nbaSeasonGames${NBA_LAST_SEASON}`;
    const cached = ApiCache.get(cacheKey);
    if (cached) return cached;

    const confs = await fetchNBAStandings(NBA_LAST_SEASON);
    const teamIds = confs.flatMap(c => c.teams.map(t => t.id)).filter(Boolean);

    const perTeam = await Promise.all(
        teamIds.map(id => espnNBAFetch(`/teams/${id}/schedule`, {}, ApiCache.TTL.SEASON).catch(() => null))
    );

    const seen = new Set();
    const games = [];
    perTeam.forEach(d => {
        (d?.events || []).forEach(ev => {
            if (seen.has(ev.id)) return;
            if (ev.seasonType?.type !== 2) return;
            const comp = ev.competitions?.[0];
            if (!comp || !comp.status?.type?.name?.startsWith('STATUS_FINAL')) return;
            const home = comp.competitors?.find(c => c.homeAway === 'home');
            const away = comp.competitors?.find(c => c.homeAway === 'away');
            if (!home || !away) return;
            seen.add(ev.id);
            games.push({
                home:      home.team.abbreviation,
                away:      away.team.abbreviation,
                homeScore: home.score?.value ?? 0,
                awayScore: away.score?.value ?? 0,
                date:      ev.date,
            });
        });
    });

    ApiCache.set(cacheKey, games, ApiCache.TTL.SEASON);
    return games;
}

async function fetchNBAPowerTeamMeta() {
    const confs = await fetchNBAStandings(NBA_LAST_SEASON);
    const meta = {};
    confs.forEach(c => c.teams.forEach(t => {
        if (!t.abbr) return;
        meta[t.abbr] = {
            name: t.name,
            logo: t.logo,
            color: null,
            record: t.overall || '',
            onClick: '',
        };
    }));
    return meta;
}

function _nbaSeasonSelect() {
    const yrs = [];
    for (let y = NBA_LAST_SEASON; y >= NBA_LAST_SEASON - 5; y--) yrs.push(y);
    return `<select id="nbaSeasonSel" class="standings-tab" style="cursor:pointer">${
        yrs.map(y => `<option value="${y}"${y === _nba.season ? ' selected' : ''}>${y} season</option>`).join('')}</select>`;
}

async function displayNBAStandings() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs">${_nbaSeasonSelect()}</div>
        <div id="nbaStdBody"><div class="skeleton-line" style="height:360px;border-radius:var(--radius-md)"></div></div>`;
    document.getElementById('nbaSeasonSel').addEventListener('change', (ev) => {
        _nba.season = parseInt(ev.target.value, 10); displayNBAStandings();
    });
    let confs;
    try { confs = await fetchNBAStandings(_nba.season); }
    catch (err) {
        Logger.warn('NBA standings failed', err, 'NBA');
        document.getElementById('nbaStdBody').innerHTML = _nbaErr('Standings are unavailable for this season.', 'displayNBAStandings');
        return;
    }
    if (!confs.length) {
        document.getElementById('nbaStdBody').innerHTML = _nbaErr('No standings returned for the ' + _nba.season + ' season.', 'displayNBAStandings');
        return;
    }
    document.getElementById('nbaStdBody').innerHTML = confs.map(c => `
        <section class="mlb-division-panel" style="margin-bottom:var(--space-4)">
            <h2 class="standings-team-name" style="font-family:var(--font-display);font-size:1.02rem;margin:0 0 0.5rem">${_escHtml(c.name)}</h2>
            <div class="standings-table-wrap">
                <table class="standings-table">
                    <thead><tr><th class="standings-th-team">Team</th><th>Overall</th><th>GB</th><th>Streak</th></tr></thead>
                    <tbody>${c.teams.map(t => `<tr class="standings-row">
                        <td class="standings-team-cell">
                            ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : ''}
                            <span class="standings-team-name" title="${_escHtml(t.name)}">${_escHtml(t.name)}</span>
                        </td>
                        <td class="standings-num">${_escHtml(t.overall)}</td>
                        <td class="standings-num standings-gb">${_escHtml(t.gb || '—')}</td>
                        <td class="standings-num">${_escHtml(t.streak || '—')}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </section>`).join('') +
        `<p class="standings-legend">${_escHtml(String(_nba.season))} NBA standings by conference and division. Source: ESPN. GB = games behind division leader.</p>`;
}

async function displayNBATeams() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs">${_nbaSeasonSelect()}</div>
        <div id="nbaTeamsBody"><div class="skeleton-line" style="height:360px;border-radius:var(--radius-md)"></div></div>`;
    document.getElementById('nbaSeasonSel').addEventListener('change', (ev) => {
        _nba.season = parseInt(ev.target.value, 10); displayNBATeams();
    });
    let confs;
    try { confs = await fetchNBAStandings(_nba.season); }
    catch (err) {
        Logger.warn('NBA teams failed', err, 'NBA');
        document.getElementById('nbaTeamsBody').innerHTML = _nbaErr('Teams are unavailable for this season.', 'displayNBATeams');
        return;
    }
    if (!confs.length) {
        document.getElementById('nbaTeamsBody').innerHTML = _nbaErr('No teams returned for this season.', 'displayNBATeams');
        return;
    }
    // Team detail is not built (deferred, mirroring NCAAF/NCAAB/WNBA's own
    // team-detail deferral) — chips are display-only, no click-through, so
    // this never links into a view that doesn't exist.
    document.getElementById('nbaTeamsBody').innerHTML = confs.map(c => `
        <section style="margin-bottom:var(--space-4)">
            <h2 class="standings-team-name" style="font-family:var(--font-display);font-size:1.02rem;margin:0 0 0.6rem">${_escHtml(c.name)} <span class="standings-gb" style="font-size:0.8rem">· ${c.teams.length}</span></h2>
            <div class="ncaaf-team-grid">${c.teams.map(t => `<div class="ncaaf-team-chip">
                ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : '<span class="standings-logo"></span>'}
                <span class="ncaaf-team-chip-name">${_escHtml(t.name)}</span>
            </div>`).join('')}</div>
        </section>`).join('') +
        `<p class="standings-legend">NBA teams grouped by conference and division (${_escHtml(String(_nba.season))}). Source: ESPN.</p>`;
}

window.fetchNBAScoreboard = fetchNBAScoreboard;
window.displayNBAScores    = displayNBAScores;
window.displayNBAStandings = displayNBAStandings;
window.displayNBATeams     = displayNBATeams;
window.fetchNBASeasonGames = fetchNBASeasonGames;
window.fetchNBAPowerTeamMeta = fetchNBAPowerTeamMeta;
window._renderNBAView      = _renderNBAView;
window.updateNBATicker     = updateNBATicker;

// ── Leaders (real season stats via /api/nbastats) ────────────
const _NBA_LCOLORS = ['#c8102e','#3b7dd8','#2e9e6b','#b0842f','#8b5cf6','#d6455f','#0d9488'];

async function displayNBALeaders() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'players-grid';
    grid.innerHTML = Array.from({ length: 7 }, () => `<div class="skeleton-card" style="min-height:240px"></div>`).join('');
    let data;
    try {
        const cacheKey = `nba:leaders:${_nba.season}`;
        data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/nbastats?season=${_nba.season}`);
            if (!res.ok) throw new Error('leaders ' + res.status);
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
    } catch (err) {
        Logger.warn('NBA leaders failed', err, 'NBA');
        grid.className = 'standings-container';
        grid.innerHTML = _nbaErr("Couldn't load NBA leaders.", 'displayNBALeaders');
        return;
    }
    if (!data.categories || !data.categories.length) {
        grid.className = 'standings-container';
        grid.innerHTML = _nbaOffseasonState();
        return;
    }
    grid.innerHTML = data.categories.map((cat, ci) => {
        const color = _NBA_LCOLORS[ci % _NBA_LCOLORS.length];
        const rows = cat.leaders.map((l, i) => `
            <div class="nfl-lrow nfl-lrow--link" role="button" tabindex="0" aria-label="${_escHtml(l.name)}${l.pos ? ', ' + _escHtml(l.pos) : ''}" onclick="navigateTo('nba-player-${_escHtml(String(l.id))}')">
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

// ── Player detail on the shared frame (mirrors NCAAF's D-044 pattern) ─
async function showNBAPlayer(id) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    AppState.currentView = 'nba-player-' + id;
    grid.className = 'player-detail-container';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:320px"></div>`;
    let data;
    try {
        const cacheKey = `nba:athlete:${id}:${_nba.season}`;
        data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/nbaathlete?id=${encodeURIComponent(id)}&season=${_nba.season}`);
            if (!res.ok) throw new Error('athlete ' + res.status);
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
    } catch (err) {
        Logger.warn('NBA athlete failed', err, 'NBA');
        grid.innerHTML = _nbaErr("Couldn't load this player.", 'displayNBALeaders');
        return;
    }
    displayNBAPlayerDetail(data);
}

function displayNBAPlayerDetail(data) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'player-detail-container';
    const bio = (data && data.bio) || {};
    if (!bio.name) { grid.innerHTML = _nbaErr('Player not found.', 'displayNBALeaders'); return; }
    if (window.setBreadcrumb) setBreadcrumb('nba-leaders', _escHtml(bio.name));

    if (data.id && typeof addRecent === 'function') addRecent({
        id: data.id, sport: 'nba', type: 'player', name: bio.name,
        sub: `${bio.team || '—'} · ${bio.pos || '—'}`, badge: 'NBA', action: null,
    });

    const accent = (typeof SPORTS_META !== 'undefined' && SPORTS_META.nba && SPORTS_META.nba.accent) || '#c8102e';
    const initials = bio.name.split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const headshotImg = bio.headshot ? `<img class="player-headshot" src="${_escHtml(bio.headshot)}" alt="" loading="lazy" data-hide-on-error>` : '';
    const teamRow = `${bio.teamLogo ? `<img src="${_escHtml(bio.teamLogo)}" alt="" class="player-hero-team-logo" loading="lazy" data-hide-on-error>` : ''}<span>${_escHtml(bio.team || '')}</span>`;

    const header = detailHeader({
        back: { view: 'nba-leaders', label: 'Leaders' },
        actions: [{ label: 'Share', onclick: "window._shareCurrentPage && window._shareCurrentPage()", title: 'Copy link' }],
        avatar: { headshotHtml: headshotImg, initials, accent, className: 'nfl-hero-avatar' },
        name: bio.name,
        chips: [
            ...(bio.pos ? [{ text: bio.pos }] : []),
            ...((data.id && typeof renderFollowStar === 'function') ? [{ html: renderFollowStar('nba', 'player', data.id) }] : []),
        ],
        teamRow,
        meta: [`${data.season} NBA${data.gp ? ` · ${_escHtml(String(data.gp))} GP` : ''}`],
    });

    const bioRows = [
        ['Position', bio.pos], ['Experience', bio.exp], ['Jersey', bio.jersey ? '#' + bio.jersey : ''],
        ['Height', bio.height], ['Weight', bio.weight], ['Team', bio.team],
    ].filter(r => r[1]).map(([l, v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${_escHtml(String(v))}</span></div>`).join('');
    const profile = detailSection({ title: 'Player Profile', body: `<div class="player-details detail-bio-wide">${bioRows}</div>` });

    const statSections = (data.groups || []).map(g => {
        const cells = g.stats.map(([l, v]) => `<div class="ncf-stat"><span class="ncf-stat-v">${_escHtml(String(v))}</span><span class="ncf-stat-l">${_escHtml(l)}</span></div>`).join('');
        return detailSection({ title: g.label, body: `<div class="ncf-statline">${cells}</div>` });
    }).join('');

    const noStats = (!data.groups || !data.groups.length)
        ? detailSection({ title: 'Season Stats', body: `<p class="detail-prose">No ${data.season} season stats for ${_escHtml(bio.name)} yet — common for reserves and early-season players.</p>` })
        : '';

    grid.innerHTML = header + profile + statSections + noStats +
        `<p class="detail-note" style="margin-top:0.75rem">${data.season} regular season · Source: ESPN.</p>`;
}

window.displayNBALeaders      = displayNBALeaders;
window.showNBAPlayer          = showNBAPlayer;
window.displayNBAPlayerDetail = displayNBAPlayerDetail;

// ── Live/Final Game panel (shared basketball live-game viewer, js/bballLiveGame.js) ──
// Live-verified 2026-09-14 (D-161) against a real completed 2025-26 game
// (event 401811041, BOS 113-ORL) before wiring this in, exactly like
// js/bballLiveGame.js's own header comment describes doing for WNBA/NCAAB:
// header.competitions[0] carries the full score/status/linescore/record
// block, leaders[]/plays[]/winprobability[] are all real and populated,
// boxscore.teams[].statistics[] carries the same pointsInPaint/
// fastBreakPoints/leadChanges/largestLead/leadPercentage fields the
// Analytics tab needs, and standings.groups[].standings.entries[].team is
// the same bare-location-string quirk ("Atlanta", "Boston") already handled
// generically. One real difference: NBA's standings groups carry both
// conferenceHeader and divisionHeader (real divisions, unlike WNBA's flat
// tree) — the existing generic per-group header render absorbs this with no
// code change. injuries[] is also populated for NBA (unlike NCAAB, which
// has none) — a bonus, not required for this to work.
async function fetchNBAGameSummary(eventId) {
    const res = await fetch(`/api/nba?path=/summary&event=${encodeURIComponent(eventId)}`);
    if (!res.ok) throw new Error('summary ' + res.status);
    return res.json();
}

async function showNBAGame(id) { return _blgShow('nba', id); }

window.fetchNBAGameSummary = fetchNBAGameSummary;
window.showNBAGame         = showNBAGame;
