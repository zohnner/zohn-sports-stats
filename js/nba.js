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

// `fresh` skips the cache READ but still writes the result back (D-170):
// a live poll gets current data and every other caller benefits from it.
async function espnNBAFetch(path, params = {}, ttl = ApiCache.TTL.SHORT, { fresh = false } = {}) {
    const url = new URL('/api/nba', location.origin);
    url.searchParams.set('path', path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `nba:${path}:${url.searchParams.toString()}`;

    const hit = fresh ? null : ApiCache.get(cacheKey);
    if (hit) { noteFetched(`nba${path}`, ApiCache.getTimestamp(cacheKey)); return hit; }

    Logger.debug(`NBA → ${url.pathname}`, undefined, 'NBA');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await _espnFetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(tid);
    }
    if (!res.ok) throw new Error(`NBA API ${res.status}: ${res.statusText}`);
    let json;
    try { json = await res.json(); } catch { throw new Error(`NBA API returned non-JSON (${path})`); }
    ApiCache.set(cacheKey, json, ttl);
    noteFetched(`nba${path}`, Date.now());
    return json;
}

async function fetchNBAScoreboard(opts = {}) {
    const data = await espnNBAFetch('/scoreboard', {}, ApiCache.TTL.SHORT, { fresh: !!opts.fresh });
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
            statusName: status?.type?.name || '',
            clock: status?.displayClock || '',
            period: status?.period || 0,
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

// Live label from the status clock: "2:38 Q1", "OT", or ESPN's own text
// for breaks ("Halftime", "End of 1st") where the clock reads 0.0.
function _nbaLiveLabel(g) {
    if (/HALFTIME|END_PERIOD/.test(g.statusName) || !g.period) return g.statusText;
    const per = g.period <= 4 ? 'Q' + g.period : (g.period === 5 ? 'OT' : (g.period - 4) + 'OT');
    return g.clock ? `${g.clock} ${per}` : per;
}

// ESPN's statusText is fixed to Eastern; the ISO date is the real instant.
function _nbaTipLabel(g) {
    const d = new Date(g.date);
    if (isNaN(d) || /TBD/i.test(g.statusText)) return g.statusText;
    const sameDay = d.toDateString() === new Date().toDateString();
    return d.toLocaleString([], { ...(sameDay ? {} : { weekday: 'short' }), hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

// 4th quarter or OT, within 5. Uses only the scoreboard's own score and
// status; no per-card summary fetch.
function _nbaIsClose(g) {
    return g.isLive && g.period >= 4 && Math.abs(g.homeTeam.score - g.awayTeam.score) <= 5;
}

function _nbaGameCard(g) {
    const row = (t) => `
        <div class="hgc-row">
            ${t.logo ? `<img class="hgc-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error style="width:28px;height:28px">` : '<span style="width:28px"></span>'}
            <span class="hgc-team">${_escHtml(t.abbr)}</span>
            <span class="hgc-score ${g.isFinal && t.winner ? 'hgc-score--win' : ''}" style="margin-left:auto">${(g.isFinal || g.isLive) ? t.score : ''}</span>
        </div>`;
    const pill = g.isLive ? `<span class="ticker-status-pill ticker-status-pill--live">LIVE · ${_escHtml(_nbaLiveLabel(g))}</span>`
        : g.isFinal ? '<span class="ticker-status-pill ticker-status-pill--final">F</span>'
        : `<span class="hgc-status">${_escHtml(_nbaTipLabel(g))}</span>`;
    const close = _nbaIsClose(g) ? '<span class="nba-close-badge" title="4th quarter or overtime, within 5 points">Close</span>' : '';
    const id = _escHtml(String(g.id));
    return `<div class="home-game-card${g.isLive ? ' home-game-card--live' : ''}" role="button" tabindex="0" style="cursor:pointer" onclick="navigateTo('nba-game-${id}')" onkeydown="if(event.key==='Enter')navigateTo('nba-game-${id}')">
        ${row(g.awayTeam)}
        ${row(g.homeTeam)}
        <div class="hgc-card-footer">${pill}${close}</div>
    </div>`;
}

async function displayNBAScores(opts = {}) {
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
        const games = await fetchNBAScoreboard({ fresh: !!opts.fresh });
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
    const items = scored.map(g => {
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
    Scorebug.fillTicker(ticker, items, ['nba']);
}

function _renderNBAView(view) {
    if (window.StatsCharts && StatsCharts.destroyAll) StatsCharts.destroyAll();
    if (view.startsWith('nba-player-')) { showNBAPlayer(view.slice('nba-player-'.length)); return; }
    if (view.startsWith('nba-game-'))   { showNBAGame(view.slice('nba-game-'.length));     return; }
    if (view.startsWith('nba-team-'))   { showNBATeam(view.slice('nba-team-'.length));     return; }
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
        home: disp(['home', 'Home']), road: disp(['road', 'Road']), l10: disp(['lasttengames', 'Last Ten Games']),
        ppg: num(['avgPointsFor']), oppg: num(['avgPointsAgainst']), seed: num(['playoffSeed']),
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
    const res = await _espnFetch(`/api/nbastandings?season=${season}`);
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
            onClick: `navigateTo('nba-team-${t.abbr}')`,
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
                    <tbody>${c.teams.map(t => `<tr class="standings-row"${t.abbr ? ` style="cursor:pointer" onclick="navigateTo('nba-team-${_escHtml(t.abbr)}')"` : ''}>
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
        `<p class="standings-legend">${_escHtml(String(_nba.season))} NBA standings by conference and division. Source: ESPN. GB = games behind division leader.${freshnessHtml(ApiCache.getTimestamp(`nba:standings:${_nba.season}`))}</p>`;
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
    document.getElementById('nbaTeamsBody').innerHTML = confs.map(c => `
        <section style="margin-bottom:var(--space-4)">
            <h2 class="standings-team-name" style="font-family:var(--font-display);font-size:1.02rem;margin:0 0 0.6rem">${_escHtml(c.name)} <span class="standings-gb" style="font-size:0.8rem">· ${c.teams.length}</span></h2>
            <div class="ncaaf-team-grid">${c.teams.map(t => `<div class="ncaaf-team-chip${t.abbr ? ' ncaaf-team-chip--link' : ''}"${t.abbr ? ` role="button" tabindex="0" aria-label="${_escHtml(t.name)}" onclick="navigateTo('nba-team-${_escHtml(t.abbr)}')"` : ''}>
                ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : '<span class="standings-logo"></span>'}
                <span class="ncaaf-team-chip-name">${_escHtml(t.name)}</span>
            </div>`).join('')}</div>
        </section>`).join('') +
        `<p class="standings-legend">NBA teams grouped by conference and division (${_escHtml(String(_nba.season))}). Source: ESPN.</p>`;
}

// ── Team detail (parity #87) — ESPN-native, rendered by the shared
// _renderTeamPage (js/nfl.js) the way NCAAF's team page is. Every source here
// sends CORS headers (roster, schedule, standings), so it survives the proxy
// block. Keyed by ESPN's
// own abbreviation (SA, GS, NY, NO, UTAH, WSH), which is also what follow
// keys and story `teams` frontmatter use; the common long forms alias to it.
// ESPN's /teams/{abbr} answers for either form, but the route and follow key
// must be one spelling.
const _NBA_TEAM_ALIASES = { SAS: 'SA', GSW: 'GS', NYK: 'NY', NOP: 'NO', UTA: 'UTAH', WAS: 'WSH' };
function _nbaTeamKey(abbr) {
    const a = String(abbr || '').toUpperCase();
    return _NBA_TEAM_ALIASES[a] || a;
}

// Record card from the standings row (_nbaStandingRow), the source the
// Standings page already reads. Not /teams/{id}: ESPN sends no CORS header
// there, so it fails in the browser fallback readers get under D-176.
function _nbaTeamRecordChips(row) {
    if (!row || !((row.w || 0) + (row.l || 0))) return [];
    const one = v => v.toFixed(1);
    const diff = (row.ppg != null && row.oppg != null) ? row.ppg - row.oppg : null;
    return [
        ['Record', row.overall || '—'],
        ...(row.pct != null ? [['PCT', row.pct.toFixed(3).replace(/^0/, '')]] : []),
        ...(row.home ? [['Home', row.home]] : []),
        ...(row.road ? [['Away', row.road]] : []),
        ...(row.l10 ? [['Last 10', row.l10]] : []),
        ...(row.ppg != null ? [['PPG', one(row.ppg)]] : []),
        ...(row.oppg != null ? [['Opp PPG', one(row.oppg)]] : []),
        ...(diff != null ? [['Diff', (diff > 0 ? '+' : '') + one(diff)]] : []),
        ...(row.streak ? [['Streak', row.streak]] : []),
    ];
}

function _nbaFindStanding(confs, key) {
    for (const c of (confs || [])) {
        const row = c.teams.find(t => _nbaTeamKey(t.abbr) === key);
        if (row) return { row, division: c.name };
    }
    return null;
}

const _NBA_POS_GROUPS = [['G', 'Guards'], ['F', 'Forwards'], ['C', 'Centers']];
function _nbaRosterGroups(athletes) {
    const buckets = new Map(_NBA_POS_GROUPS.map(([k]) => [k, []]));
    const other = [];
    (athletes || []).forEach(p => {
        const pos = (p.position && p.position.abbreviation) || '';
        const inj = (p.injuries || [])[0];
        const row = {
            id: p.id, name: p.fullName || p.displayName || '', pos, number: p.jersey || '',
            starter: false, injury: (inj && inj.status) || '', headshot: (p.headshot && p.headshot.href) || '',
        };
        (buckets.get(pos.charAt(0)) || other).push(row);
    });
    const groups = _NBA_POS_GROUPS.map(([k, label]) => ({ label, players: buckets.get(k) })).filter(g => g.players.length);
    if (other.length) groups.push({ label: 'Other', players: other });
    return groups;
}

// Splits a /teams/{id}/schedule event list into the last `nRecent` finished
// games (newest first) and the next `nNext` unfinished ones (live included).
function _nbaTeamGames(events, teamId, nRecent = 5, nNext = 3) {
    const rows = (events || []).map(ev => {
        const comp = ev.competitions && ev.competitions[0];
        if (!comp) return null;
        const comps = comp.competitors || [];
        const me = comps.find(c => String(c.id || (c.team && c.team.id)) === String(teamId));
        const opp = comps.find(c => c !== me);
        if (!me || !opp) return null;
        const st = (comp.status && comp.status.type) || {};
        const ot = opp.team || {};
        const score = c => (c.score && c.score.value != null) ? Number(c.score.value) : null;
        return {
            id: ev.id, date: ev.date, isHome: me.homeAway === 'home',
            oppAbbr: ot.abbreviation || '', oppName: ot.displayName || '',
            oppLogo: (ot.logos && ot.logos[0] && ot.logos[0].href) || '',
            done: !!st.completed, live: st.state === 'in',
            reg: !ev.seasonType || ev.seasonType.type === 2,
            my: score(me), opp: score(opp), won: me.winner === true,
        };
    }).filter(Boolean);
    const t = r => (r.date ? new Date(r.date).getTime() : 0);
    let w = 0, l = 0;
    const log = rows.filter(r => r.done && r.reg && r.my != null && r.opp != null).sort((a, b) => t(a) - t(b)).map(r => {
        if (r.won) w++; else l++;
        return { ...r, margin: r.my - r.opp, record: `${w}-${l}` };
    }).reverse();
    return {
        recent: rows.filter(r => r.done).sort((a, b) => t(b) - t(a)).slice(0, nRecent),
        upcoming: rows.filter(r => !r.done).sort((a, b) => t(a) - t(b)).slice(0, nNext),
        log,
    };
}

// W-L and per-game points for/against/margin over the newest `n` games of a
// newest-first log (n = null for the whole season).
function _nbaTeamSplit(log, n) {
    const g = n == null ? log : log.slice(0, n);
    if (!g.length) return null;
    const sum = f => g.reduce((s, r) => s + f(r), 0);
    const per = v => Math.round((v / g.length) * 10) / 10;
    const w = g.filter(r => r.won).length;
    return { n: g.length, w, l: g.length - w, pf: per(sum(r => r.my)), pa: per(sum(r => r.opp)), margin: per(sum(r => r.margin)) };
}

const _nbaSigned = v => (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 1);

function _nbaTeamGameLogCard(log) {
    if (!log.length) return `<div class="stats-card" style="grid-column:1/-1"><h2 class="detail-section-title">Game Log</h2><div class="team-empty">No games played yet this season.</div></div>`;
    const spans = [['Last 5', 5], ['Last 10', 10], ['Season', null]]
        .filter(([, n]) => n == null || log.length > n)
        .map(([label, n]) => [label, _nbaTeamSplit(log, n)]);
    const splitRows = spans.map(([label, s]) => `<tr><td class="gl-l">${label}</td><td>${s.w}-${s.l}</td><td>${s.pf.toFixed(1)}</td><td>${s.pa.toFixed(1)}</td><td style="color:${s.margin >= 0 ? 'var(--color-win)' : 'var(--color-loss)'}">${_nbaSigned(s.margin)}</td></tr>`).join('');
    const row = g => {
        let day = '';
        try { day = new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) {}
        return `<tr class="roster-row--clickable" role="button" tabindex="0" onclick="navigateTo('nba-game-${_escHtml(String(g.id))}')" onkeydown="if(event.key==='Enter')this.click()">
            <td class="gl-l">${_escHtml(day)}</td>
            <td class="gl-l">${g.isHome ? 'vs' : '@'} <span title="${_escHtml(g.oppName)}">${_escHtml(g.oppAbbr)}</span></td>
            <td style="font-family:var(--font-mono)"><span class="${g.won ? 'gl-res--w' : 'gl-res--l'}">${g.won ? 'W' : 'L'}</span> ${g.my}-${g.opp}</td>
            <td style="font-family:var(--font-mono)">${_nbaSigned(g.margin)}</td>
            <td>${g.record}</td></tr>`;
    };
    const table = rows => `<div class="table-wrapper" style="overflow-x:auto"><table class="stats-table gl-table gl-table--compact" style="white-space:nowrap"><thead><tr><th class="gl-l">Date</th><th class="gl-l">Opp</th><th>Result</th><th>Margin</th><th>Record</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>`;
    const SHOWN = 10;
    const rest = log.length > SHOWN
        ? `<details style="margin-top:0.5rem"><summary style="cursor:pointer;color:var(--text-secondary);font-size:0.8125rem">All ${log.length} games</summary>${table(log.slice(SHOWN))}</details>`
        : '';
    return `<div class="stats-card" style="grid-column:1/-1"><h2 class="detail-section-title">Game Log</h2>
        <div class="table-wrapper" style="overflow-x:auto;margin-bottom:0.75rem"><table class="stats-table gl-table gl-table--compact" style="white-space:nowrap"><thead><tr><th></th><th>W-L</th><th title="Points per game">PF/G</th><th title="Points allowed per game">PA/G</th><th title="Average margin">Margin</th></tr></thead><tbody>${splitRows}</tbody></table></div>
        ${table(log.slice(0, SHOWN))}${rest}
        <p class="detail-note" style="margin-top:0.5rem">Regular season, newest first. Margin is points scored minus points allowed.</p></div>`;
}

function _nbaTeamGamesCard(title, games, emptyText) {
    const rows = games.map(g => {
        let right;
        if (g.done && g.my != null && g.opp != null) {
            right = `<span style="font-weight:700;color:${g.won ? 'var(--color-win)' : 'var(--color-loss)'}">${g.won ? 'W' : 'L'}</span> <span style="font-family:var(--font-mono)">${g.my}-${g.opp}</span>`;
        } else if (g.live) {
            right = `<span style="color:var(--color-live);font-weight:700">LIVE</span>`;
        } else {
            let d = '';
            try { d = new Date(g.date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (_) {}
            right = `<span style="font-size:0.75rem;color:var(--text-secondary)">${_escHtml(d)}</span>`;
        }
        let day = '';
        if (g.done) { try { day = new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) {} }
        return `<div class="roster-row roster-row--clickable roster-row--split" role="button" tabindex="0" onclick="navigateTo('nba-game-${_escHtml(String(g.id))}')" onkeydown="if(event.key==='Enter')this.click()">
                <div style="display:flex;align-items:center;gap:0.5rem;flex:1;min-width:0">
                    <span style="color:var(--text-muted);font-size:0.7rem;min-width:42px">${day ? _escHtml(day) : ''} ${g.isHome ? 'vs' : '@'}</span>
                    ${g.oppLogo ? `<img src="${_escHtml(g.oppLogo)}" alt="" style="width:20px;height:20px;object-fit:contain;flex-shrink:0" loading="lazy" data-hide-on-error>` : ''}
                    <span style="font-weight:600;font-size:0.875rem" title="${_escHtml(g.oppName)}">${_escHtml(g.oppAbbr)}</span>
                </div>
                <div style="text-align:right;flex-shrink:0">${right}</div>
            </div>`;
    }).join('');
    return `<div class="stats-card" style="grid-column:1/-1"><h2 class="detail-section-title">${_escHtml(title)}</h2>${
        rows ? `<div class="roster-list">${rows}</div>` : `<div class="team-empty">${_escHtml(emptyText)}</div>`}</div>`;
}

async function showNBATeam(abbr) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    const key = _nbaTeamKey(abbr);
    const view = 'nba-team-' + key;
    AppState.currentView = view;
    grid.className = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:360px"></div>`;
    const slug = key.toLowerCase();
    const [roster, sched, std] = await Promise.all([
        espnNBAFetch(`/teams/${slug}/roster`, {}, ApiCache.TTL.LONG).catch(err => { Logger.warn('NBA roster fetch failed', err, 'NBA'); return null; }),
        espnNBAFetch(`/teams/${slug}/schedule`, {}, ApiCache.TTL.SHORT).catch(err => { Logger.warn('NBA schedule fetch failed', err, 'NBA'); return null; }),
        fetchNBAStandings(NBA_LAST_SEASON).then(c => _nbaFindStanding(c, key)).catch(err => { Logger.warn('NBA standings fetch failed (team detail)', err, 'NBA'); return null; }),
    ]);
    if (AppState.currentView !== view) return;
    const team = (roster && roster.team) || (sched && sched.team);
    if (!team || !team.id) { grid.innerHTML = _nbaErr("Couldn't load this team.", 'displayNBATeams'); return; }
    displayNBATeamDetail(team, roster, sched, std);
}

function displayNBATeamDetail(team, roster, sched, std) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    const name = team.displayName || team.name || 'Team';
    if (window.setBreadcrumb) setBreadcrumb('nba-teams', _escHtml(name));
    const abbr = team.abbreviation || '';
    const color = '#' + String(team.color || 'c8102e').replace('#', '');
    const row = std && std.row;
    const athletes = (roster && roster.athletes) || [];
    const groups = _nbaRosterGroups(athletes);
    const coach = roster && roster.coach && roster.coach[0];
    const coachName = coach ? [coach.firstName, coach.lastName].filter(Boolean).join(' ') : '';
    const games = _nbaTeamGames(sched && sched.events, team.id);
    const seasonName = team.seasonSummary || (sched && sched.requestedSeason && sched.requestedSeason.displayName) || '';
    const injured = groups.reduce((n, g) => n + g.players.filter(p => p.injury).length, 0);
    const recordChips = _nbaTeamRecordChips(row);
    const record = recordChips.length ? row.overall : (team.recordSummary || '');

    const model = {
        sport: 'nba', abbr, name,
        logo: team.logo || (team.logos && team.logos[0] && team.logos[0].href) || '', teamColor: color,
        division: (std && std.division) || '', record,
        seasonLabel: [seasonName ? `${seasonName} season` : '', team.standingSummary || ''].filter(Boolean).join(' · '),
        facts: [
            ...(recordChips.length && row.seed ? [{ label: 'Conf. Seed', value: row.seed }] : []),
            ...(coachName ? [{ label: 'Head Coach', value: coachName }] : []),
            ...(athletes.length ? [{ label: 'Players', value: athletes.length }] : []),
        ],
        recordChips, recordSeasonLabel: recordChips.length && seasonName ? `${seasonName} Season` : '',
        scheduleHtmlTop: _nbaTeamGamesCard('Upcoming', games.upcoming, 'No upcoming games on the schedule.')
            + _nbaTeamGameLogCard(games.log),
        groups, rosterTitle: 'Roster',
        rosterCaption: `Grouped by position${injured ? ' · injury status from ESPN' : ''}`,
        rosterEmpty: 'Roster data unavailable for this team right now.',
        backView: 'nba-teams', backLabel: 'Teams', playerPrefix: 'nba-player-', storiesSport: 'nba',
    };

    grid.className = 'player-detail-container';
    grid.innerHTML = _renderTeamPage(model)
        + `<p class="detail-note" style="margin-top:0.75rem">Source: ESPN.</p>`;
    if (typeof _loadTeamStories === 'function') _loadTeamStories('nba', abbr, _nbaTeamKey);
}

window.showNBATeam          = showNBATeam;
window.displayNBATeamDetail = displayNBATeamDetail;

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
            const res = await _espnFetch(`/api/nbastats?season=${_nba.season}`);
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
            const res = await _espnFetch(`/api/nbaathlete?id=${encodeURIComponent(id)}&season=${_nba.season}`);
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
    const res = await _espnFetch(`/api/nba?path=/summary&event=${encodeURIComponent(eventId)}`);
    if (!res.ok) throw new Error('summary ' + res.status);
    return res.json();
}

async function showNBAGame(id) { return _blgShow('nba', id); }

window.fetchNBAGameSummary = fetchNBAGameSummary;
window.showNBAGame         = showNBAGame;
