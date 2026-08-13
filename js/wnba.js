// ============================================================
// WNBA — 5th sport (D-092, owner override of D-052's calendar-gap
// recommendation — see DECISIONS.md D-092 for the full trade-off record).
// ESPN public API via same-origin /api/wnba Pages Function.
// Scope: Scores, Standings (conference-grouped), Teams, Leaders + player
// detail (D-092 Resolution 5), Live/Final Game panel + Playoff Picture
// (D-092 Resolution 6). No Rankings (no poll exists for a pro league).
// Season model: single calendar year (Apr-Oct), unlike NCAAF/NCAAB's
// fall-spanning label — confirmed live 2026-08-10 against the real ESPN
// scoreboard payload (season.year:2026, window 2026-04-03..2026-10-20).
// Self-contained ticker (no Scorebug.normalize*Game reuse) — deliberately,
// per D-092's Axiom finding: ncaab.js's ticker calls
// Scorebug.normalizeNCAAFGame, which hardcodes sport:'ncaaf' and mislabels
// every NCAAB ticker item. WNBA does not reproduce that bug.
// No keys, no D1.
// ============================================================

const _wnbaNow = new Date();
// WNBA_SEASON — the season "coming up" or currently live, for offseason copy.
// Jan-Mar: this year's season hasn't started yet, but it's the one anticipated.
// Apr-Oct: this year's season, live.
// Nov-Dec: next year's season is what's anticipated (this year's just ended).
const WNBA_SEASON = (_wnbaNow.getMonth() + 1 >= 11) ? _wnbaNow.getFullYear() + 1 : _wnbaNow.getFullYear();

// In-season: Apr-Oct. Nov-Mar = offseason.
function _wnbaIsOffseason() {
    const m = new Date().getMonth() + 1; // 1=Jan
    return m <= 3 || m >= 11;
}

// WNBA_LAST_SEASON — the season with real data to show by default (Standings/
// Teams). Diverges from WNBA_SEASON only Jan-Mar: WNBA_SEASON says next
// season is coming; WNBA_LAST_SEASON correctly keeps showing last year's
// real final standings instead of an empty upcoming one.
const WNBA_LAST_SEASON = (_wnbaNow.getMonth() + 1 <= 3) ? _wnbaNow.getFullYear() - 1 : _wnbaNow.getFullYear();
const _wnba = { season: WNBA_LAST_SEASON };

async function espnWNBAFetch(path, params = {}, ttl = ApiCache.TTL.SHORT) {
    const url = new URL('/api/wnba', location.origin);
    url.searchParams.set('path', path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `wnba:${path}:${url.searchParams.toString()}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    Logger.debug(`WNBA → ${url.pathname}`, undefined, 'WNBA');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(tid);
    }
    if (!res.ok) throw new Error(`WNBA API ${res.status}: ${res.statusText}`);
    let json;
    try { json = await res.json(); } catch { throw new Error(`WNBA API returned non-JSON (${path})`); }
    ApiCache.set(cacheKey, json, ttl);
    return json;
}

async function fetchWNBAScoreboard() {
    const data = await espnWNBAFetch('/scoreboard', {}, ApiCache.TTL.SHORT);
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

function _wnbaOffseasonState() {
    return `<div class="nfl-offseason">
        <div class="nfl-offseason-glyph" aria-hidden="true">🏀</div>
        <h2 class="nfl-offseason-title">The WNBA is in the offseason</h2>
        <p class="nfl-offseason-text">Live scores, conference standings, and teams populate here when the ${WNBA_SEASON} season starts in April.</p>
        <div class="nfl-offseason-actions">
            <button class="nfl-offseason-btn" onclick="switchSport('mlb')">MLB is live now</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('home')">Back to home</button>
        </div>
    </div>`;
}

function _wnbaGameCard(g) {
    const row = (t) => `
        <div class="hgc-row">
            ${t.logo ? `<img class="hgc-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error style="width:28px;height:28px">` : '<span style="width:28px"></span>'}
            <span class="hgc-team">${_escHtml(t.abbr)}</span>
            <span class="hgc-score ${g.isFinal && t.winner ? 'hgc-score--win' : ''}" style="margin-left:auto">${(g.isFinal || g.isLive) ? t.score : ''}</span>
        </div>`;
    const pill = g.isLive ? '<span class="ticker-status-pill ticker-status-pill--live">LIVE</span>'
        : g.isFinal ? '<span class="ticker-status-pill ticker-status-pill--final">F</span>'
        : `<span class="hgc-status">${_escHtml(g.statusText)}</span>`;
    return `<div class="home-game-card${g.isLive ? ' home-game-card--live' : ''}" role="button" tabindex="0" style="cursor:pointer" onclick="showWNBAGame('${_escHtml(String(g.id))}')" onkeydown="if(event.key==='Enter')showWNBAGame('${_escHtml(String(g.id))}')">
        ${row(g.awayTeam)}
        ${row(g.homeTeam)}
        <div class="hgc-card-footer">${pill}</div>
    </div>`;
}

async function displayWNBAScores() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'home-container';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    if (_wnbaIsOffseason()) {
        grid.innerHTML = _wnbaOffseasonState();
        return;
    }

    grid.innerHTML = `
        <div class="home-today">
            <div class="home-section-hdr">
                <span class="home-section-title">WNBA — Scoreboard</span>
                <span class="home-section-date">${dateStr}</span>
            </div>
            <div class="home-today-grid" id="wnbaScoresGrid">
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
            </div>
        </div>`;

    try {
        const games = await fetchWNBAScoreboard();
        AppState.wnbaGames = games;
        const cell = document.getElementById('wnbaScoresGrid');
        if (!cell) return;
        cell.innerHTML = games.length
            ? games.map(_wnbaGameCard).join('')
            : `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">No games on the board right now — check back on game day.</p></div>`;
        if (typeof updateWNBATicker === 'function') updateWNBATicker(games);
    } catch (err) {
        Logger.warn('WNBA scoreboard failed', err, 'WNBA');
        const cell = document.getElementById('wnbaScoresGrid');
        if (cell) cell.innerHTML = `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">Couldn't load WNBA scores. <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="displayWNBAScores()">Retry</button></p></div>`;
    }
}

function updateWNBATicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) return;
    const scored = (games || []).filter(g => g.isFinal || g.isLive || g.homeTeam.score > 0 || g.awayTeam.score > 0);
    if (!scored.length) return; // only WNBA's own Scores page owns its ticker moment; don't blank the shared ticker if another sport already populated it
    const row = (t, cls) => `
        <span class="ticker-team">${_escHtml(t.abbr)}</span>
        <span class="ticker-score${cls}">${t.score ?? 0}</span>`;
    const items = [...scored, ...scored].map(g => {
        const pillCls = g.isLive ? 'live' : g.isFinal ? 'final' : 'sched';
        const pillLbl = g.isLive ? 'LIVE' : g.isFinal ? 'F' : 'SCH';
        return `<div class="ticker__item${g.isLive ? ' ticker__item--live' : g.isFinal ? ' ticker__item--final' : ''}" data-game-id="${_escHtml(g.id)}" data-sport="wnba" style="cursor:pointer">
            <span class="ticker-glyph" aria-hidden="true">🏀</span>
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

function _renderWNBAView(view) {
    if (window.StatsCharts && StatsCharts.destroyAll) StatsCharts.destroyAll();
    if (view.startsWith('wnba-player-')) { showWNBAPlayer(view.slice('wnba-player-'.length)); return; }
    if (view.startsWith('wnba-game-'))   { showWNBAGame(view.slice('wnba-game-'.length));     return; }
    if (window.setBreadcrumb) setBreadcrumb(view, null);
    switch (view) {
        case 'wnba-standings': displayWNBAStandings(); break;
        case 'wnba-teams':     displayWNBATeams();     break;
        case 'wnba-leaders':   displayWNBALeaders();   break;
        case 'wnba-playoffs':  displayWNBAPlayoffPicture(); break;
        case 'wnba-scores':
        case 'wnba-home':
        default:                displayWNBAScores();
    }
}

function _wnbaErr(msg, retryFn) {
    return `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">${_escHtml(msg)}</p><div class="nfl-offseason-actions"><button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="${retryFn}()">Retry</button></div></div>`;
}

// ── Standings + Teams (shared site.web.api conference tree) ───
function _wnbaStandingRow(e) {
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

function _wnbaCollectConfs(node, trail, out) {
    const nm = node.name || node.abbreviation;
    const t2 = nm ? [...trail, nm] : trail;
    const entries = (node.standings && node.standings.entries) || [];
    if (entries.length) {
        const label = t2.join(' — ') || nm || 'Conference';
        out.push({ name: label, teams: entries.map(_wnbaStandingRow).filter(Boolean) });
    }
    for (const c of (node.children || [])) _wnbaCollectConfs(c, t2, out);
}

async function fetchWNBAStandings(season) {
    const cacheKey = `wnba:standings:${season}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;
    const res = await fetch(`/api/wnbastandings?season=${season}`);
    if (!res.ok) throw new Error(`WNBA standings ${res.status}`);
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.reason || 'standings unavailable');
    const confs = [];
    for (const c of (data.children || [])) _wnbaCollectConfs(c, [], confs);
    const out = confs.filter(c => c.teams.length);
    ApiCache.set(cacheKey, out, ApiCache.TTL.LONG);
    return out;
}

function _wnbaSeasonSelect() {
    const yrs = [];
    for (let y = WNBA_LAST_SEASON; y >= WNBA_LAST_SEASON - 5; y--) yrs.push(y);
    return `<select id="wnbaSeasonSel" class="standings-tab" style="cursor:pointer">${
        yrs.map(y => `<option value="${y}"${y === _wnba.season ? ' selected' : ''}>${y} season</option>`).join('')}</select>`;
}

async function displayWNBAStandings() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs">${_wnbaSeasonSelect()}</div>
        <div id="wnbaStdBody"><div class="skeleton-line" style="height:360px;border-radius:var(--radius-md)"></div></div>`;
    document.getElementById('wnbaSeasonSel').addEventListener('change', (ev) => {
        _wnba.season = parseInt(ev.target.value, 10); displayWNBAStandings();
    });
    let confs;
    try { confs = await fetchWNBAStandings(_wnba.season); }
    catch (err) {
        Logger.warn('WNBA standings failed', err, 'WNBA');
        document.getElementById('wnbaStdBody').innerHTML = _wnbaErr('Standings are unavailable for this season.', 'displayWNBAStandings');
        return;
    }
    if (!confs.length) {
        document.getElementById('wnbaStdBody').innerHTML = _wnbaErr('No standings returned for the ' + _wnba.season + ' season.', 'displayWNBAStandings');
        return;
    }
    document.getElementById('wnbaStdBody').innerHTML = confs.map(c => `
        <section class="mlb-division-panel" style="margin-bottom:var(--space-4)">
            <h2 class="standings-team-name" style="font-family:var(--font-display);font-size:1.02rem;margin:0 0 0.5rem">${_escHtml(c.name)}</h2>
            <div class="standings-table-wrap">
                <table class="standings-table">
                    <thead><tr><th class="standings-th-team">Team</th><th>Overall</th><th>GB</th><th>Streak</th></tr></thead>
                    <tbody>${c.teams.map(t => `<tr class="standings-row">
                        <td class="standings-team-cell">
                            ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : ''}
                            <span class="standings-team-name">${_escHtml(t.name)}</span>
                        </td>
                        <td class="standings-num">${_escHtml(t.overall)}</td>
                        <td class="standings-num standings-gb">${_escHtml(t.gb || '—')}</td>
                        <td class="standings-num">${_escHtml(t.streak || '—')}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </section>`).join('') +
        `<p class="standings-legend">${_escHtml(String(_wnba.season))} WNBA conference standings. Source: ESPN. GB = games behind conference leader.</p>`;
}

async function displayWNBATeams() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs">${_wnbaSeasonSelect()}</div>
        <div id="wnbaTeamsBody"><div class="skeleton-line" style="height:360px;border-radius:var(--radius-md)"></div></div>`;
    document.getElementById('wnbaSeasonSel').addEventListener('change', (ev) => {
        _wnba.season = parseInt(ev.target.value, 10); displayWNBATeams();
    });
    let confs;
    try { confs = await fetchWNBAStandings(_wnba.season); }
    catch (err) {
        Logger.warn('WNBA teams failed', err, 'WNBA');
        document.getElementById('wnbaTeamsBody').innerHTML = _wnbaErr('Teams are unavailable for this season.', 'displayWNBATeams');
        return;
    }
    if (!confs.length) {
        document.getElementById('wnbaTeamsBody').innerHTML = _wnbaErr('No teams returned for this season.', 'displayWNBATeams');
        return;
    }
    // Team detail is not built (deferred, mirroring NCAAF/NCAAB's own player/team
    // detail deferral) — chips are display-only, no click-through, so this never
    // links into a view that doesn't exist.
    document.getElementById('wnbaTeamsBody').innerHTML = confs.map(c => `
        <section style="margin-bottom:var(--space-4)">
            <h2 class="standings-team-name" style="font-family:var(--font-display);font-size:1.02rem;margin:0 0 0.6rem">${_escHtml(c.name)} <span class="standings-gb" style="font-size:0.8rem">· ${c.teams.length}</span></h2>
            <div class="ncaaf-team-grid">${c.teams.map(t => `<div class="ncaaf-team-chip">
                ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : '<span class="standings-logo"></span>'}
                <span class="ncaaf-team-chip-name">${_escHtml(t.name)}</span>
            </div>`).join('')}</div>
        </section>`).join('') +
        `<p class="standings-legend">WNBA teams grouped by conference (${_escHtml(String(_wnba.season))}). Source: ESPN.</p>`;
}

window.fetchWNBAScoreboard = fetchWNBAScoreboard;
window.displayWNBAScores    = displayWNBAScores;
window.displayWNBAStandings = displayWNBAStandings;
window.displayWNBATeams     = displayWNBATeams;

// ── Playoff Picture (standings-derived, not odds/bracket) ─────
// Real format (live-verified via WebSearch, 2026-08-10): top 8 of 15 teams
// make the postseason by OVERALL record, regardless of conference — no
// per-conference bracket like NBA's. Seeded 1-8. Round 1 best-of-3,
// Semis best-of-5, Finals best-of-7. 2026 playoffs start Sun Sept 27 — no
// real bracket/seed data exists this early in the season, so this renders
// a standings snapshot ("if the season ended today"), not a Monte Carlo
// odds model (that's a materially larger build, see MLB's October Odds)
// and not a fabricated bracket.
function _wnbaPlayoffRow(t, rank, gbFrom8) {
    const inField = rank <= 8;
    return `<tr class="standings-row">
        <td class="standings-rank-cell"><span class="standings-rank">${rank}</span></td>
        <td class="standings-team-cell">
            ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : ''}
            <span class="standings-team-name">${_escHtml(t.name)}</span>
        </td>
        <td class="standings-num">${_escHtml(t.overall)}</td>
        <td class="standings-num standings-split">${t.pct != null ? t.pct.toFixed(3).replace(/^0/, '') : '—'}</td>
        <td class="standings-num standings-gb">${inField ? '—' : (gbFrom8 != null ? gbFrom8.toFixed(1) : '—')}</td>
        <td class="standings-num">${inField ? '<span class="standings-streak--win">IN</span>' : '<span class="standings-gb">chasing</span>'}</td>
    </tr>`;
}

async function displayWNBAPlayoffPicture() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';

    if (_wnbaIsOffseason()) {
        grid.innerHTML = _wnbaOffseasonState();
        return;
    }

    grid.innerHTML = `<div id="wnbaPlayoffBody"><div class="skeleton-line" style="height:420px;border-radius:var(--radius-md)"></div></div>`;
    let confs;
    try { confs = await fetchWNBAStandings(_wnba.season); }
    catch (err) {
        Logger.warn('WNBA playoff picture failed', err, 'WNBA');
        document.getElementById('wnbaPlayoffBody').innerHTML = _wnbaErr('Playoff picture is unavailable right now.', 'displayWNBAPlayoffPicture');
        return;
    }
    const all = confs.flatMap(c => c.teams.map(t => ({ ...t, conf: c.name })));
    if (!all.length) {
        document.getElementById('wnbaPlayoffBody').innerHTML = _wnbaErr('No standings returned for the ' + _wnba.season + ' season.', 'displayWNBAPlayoffPicture');
        return;
    }
    all.sort((a, b) => {
        if (a.pct != null && b.pct != null && a.pct !== b.pct) return b.pct - a.pct;
        if (a.w != null && b.w != null && a.w !== b.w) return b.w - a.w;
        return 0;
    });
    const eighth = all[7] || null;
    const rows = all.map((t, i) => {
        const rank = i + 1;
        let gbFrom8 = null;
        if (rank > 8 && eighth && t.w != null && t.l != null && eighth.w != null && eighth.l != null) {
            gbFrom8 = ((eighth.w - eighth.l) - (t.w - t.l)) / 2;
        }
        return _wnbaPlayoffRow(t, rank, gbFrom8);
    }).join('');

    document.getElementById('wnbaPlayoffBody').innerHTML = `
        <div class="standings-table-wrap">
            <table class="standings-table">
                <thead><tr>
                    <th class="standings-th-rank">#</th><th class="standings-th-team">Team</th>
                    <th>Overall</th><th>PCT</th><th>GB of 8</th><th>Status</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="standings-legend">Top 8 of 15 teams make the postseason by overall record — no conference bracket. Seeds 1-8, best-of-3/5/7 rounds. Snapshot as if the ${_escHtml(String(_wnba.season))} season ended today; the ${_escHtml(String(_wnba.season))} playoffs begin Sept 27. Source: ESPN standings, not an odds model.</p>`;
}

window.displayWNBAPlayoffPicture = displayWNBAPlayoffPicture;
window._renderWNBAView      = _renderWNBAView;
window.updateWNBATicker     = updateWNBATicker;

// ── Leaders (real season stats via /api/wnbastats) ────────────
const _WNBA_LCOLORS = ['#f5580a','#3b7dd8','#2e9e6b','#b0842f','#8b5cf6','#d6455f','#0d9488'];

async function displayWNBALeaders() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'players-grid';
    grid.innerHTML = Array.from({ length: 7 }, () => `<div class="skeleton-card" style="min-height:240px"></div>`).join('');
    let data;
    try {
        const cacheKey = `wnba:leaders:${_wnba.season}`;
        data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/wnbastats?season=${_wnba.season}`);
            if (!res.ok) throw new Error('leaders ' + res.status);
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
    } catch (err) {
        Logger.warn('WNBA leaders failed', err, 'WNBA');
        grid.className = 'standings-container';
        grid.innerHTML = _wnbaErr("Couldn't load WNBA leaders.", 'displayWNBALeaders');
        return;
    }
    if (!data.categories || !data.categories.length) {
        grid.className = 'standings-container';
        grid.innerHTML = _wnbaOffseasonState();
        return;
    }
    grid.innerHTML = data.categories.map((cat, ci) => {
        const color = _WNBA_LCOLORS[ci % _WNBA_LCOLORS.length];
        const rows = cat.leaders.map((l, i) => `
            <div class="nfl-lrow nfl-lrow--link" role="button" tabindex="0" aria-label="${_escHtml(l.name)}${l.pos ? ', ' + _escHtml(l.pos) : ''}" onclick="navigateTo('wnba-player-${_escHtml(String(l.id))}')">
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
async function showWNBAPlayer(id) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    AppState.currentView = 'wnba-player-' + id;
    grid.className = 'player-detail-container';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:320px"></div>`;
    let data;
    try {
        const cacheKey = `wnba:athlete:${id}:${_wnba.season}`;
        data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/wnbaathlete?id=${encodeURIComponent(id)}&season=${_wnba.season}`);
            if (!res.ok) throw new Error('athlete ' + res.status);
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
    } catch (err) {
        Logger.warn('WNBA athlete failed', err, 'WNBA');
        grid.innerHTML = _wnbaErr("Couldn't load this player.", 'displayWNBALeaders');
        return;
    }
    displayWNBAPlayerDetail(data);
}

function displayWNBAPlayerDetail(data) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'player-detail-container';
    const bio = (data && data.bio) || {};
    if (!bio.name) { grid.innerHTML = _wnbaErr('Player not found.', 'displayWNBALeaders'); return; }
    if (window.setBreadcrumb) setBreadcrumb('wnba-leaders', _escHtml(bio.name));

    const accent = (typeof SPORTS_META !== 'undefined' && SPORTS_META.wnba && SPORTS_META.wnba.accent) || '#f5580a';
    const initials = bio.name.split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const headshotImg = bio.headshot ? `<img class="player-headshot" src="${_escHtml(bio.headshot)}" alt="" loading="lazy" data-hide-on-error>` : '';
    const teamRow = `${bio.teamLogo ? `<img src="${_escHtml(bio.teamLogo)}" alt="" class="player-hero-team-logo" loading="lazy" data-hide-on-error>` : ''}<span>${_escHtml(bio.team || '')}</span>`;

    const header = detailHeader({
        back: { view: 'wnba-leaders', label: 'Leaders' },
        actions: [{ label: 'Share', onclick: "window._shareCurrentPage && window._shareCurrentPage()", title: 'Copy link' }],
        avatar: { headshotHtml: headshotImg, initials, accent, className: 'nfl-hero-avatar' },
        name: bio.name,
        chips: [
            ...(bio.pos ? [{ text: bio.pos }] : []),
            ...((data.id && typeof renderFollowStar === 'function') ? [{ html: renderFollowStar('wnba', 'player', data.id) }] : []),
        ],
        teamRow,
        meta: [`${data.season} WNBA${data.gp ? ` · ${_escHtml(String(data.gp))} GP` : ''}`],
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

window.displayWNBALeaders     = displayWNBALeaders;
window.showWNBAPlayer         = showWNBAPlayer;
window.displayWNBAPlayerDetail = displayWNBAPlayerDetail;

// ── Live/Final Game panel (D-092 follow-up #2) ────────────────
// Field-shape note (live-verified 2026-08-10, event 401857134): unlike NFL's
// /summary, WNBA's summary response has NO top-level header/competitions
// block with score/period/clock — it starts straight at boxscore. Score/live
// state must come from the scoreboard event object instead (already fetched
// by fetchWNBAScoreboard, cached in AppState.wnbaGames). boxscore.teams[].
// statistics and boxscore.leaders[].leaders are SEASON averages (decimal
// values like "24.2 PPG"), not this specific game's box score — ESPN reuses
// the season-leaders shape inside the game summary. Labeled "Season" in the
// UI rather than implied as this game's stat line, per Relay's "don't
// confuse what the API says with what it actually returns" rule.
const _wnbaGame = { id: null, timer: null };

async function fetchWNBAGameSummary(eventId) {
    const res = await fetch(`/api/wnba?path=/summary&event=${encodeURIComponent(eventId)}`);
    if (!res.ok) throw new Error('summary ' + res.status);
    return res.json();
}

function _wnbaGameStop() { if (_wnbaGame.timer) { clearInterval(_wnbaGame.timer); _wnbaGame.timer = null; } }

async function _wnbaFindGame(id) {
    const cached = (AppState.wnbaGames || []).find(g => String(g.id) === String(id));
    if (cached) return cached;
    const games = await fetchWNBAScoreboard();
    AppState.wnbaGames = games;
    return games.find(g => String(g.id) === String(id)) || null;
}

async function showWNBAGame(id) {
    _wnbaGameStop();
    _wnbaGame.id = id;
    AppState.currentView = 'wnba-game-' + id;
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'player-detail-container';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:320px"></div>`;
    if (window.setBreadcrumb) setBreadcrumb('wnba-scores', 'Game');
    let game, summary;
    try {
        [game, summary] = await Promise.all([_wnbaFindGame(id), fetchWNBAGameSummary(id)]);
    } catch (err) {
        Logger.warn('WNBA game load failed', err, 'WNBA');
        grid.innerHTML = `<div class="nfl-offseason"><p class="nfl-offseason-text">Couldn't load this game.</p><div class="nfl-offseason-actions"><button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="showWNBAGame('${_escHtml(id)}')">Retry</button></div></div>`;
        return;
    }
    if (!game) {
        grid.innerHTML = `<div class="nfl-offseason"><p class="nfl-offseason-text">Game not found.</p><div class="nfl-offseason-actions"><button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('wnba-scores')">Back to scores</button></div></div>`;
        return;
    }
    _wnbaRenderGamePanel(game, summary);
    if (game.isLive) {
        _wnbaGame.timer = setInterval(async () => {
            if (AppState.currentView !== 'wnba-game-' + id) { _wnbaGameStop(); return; }
            try {
                const freshGame = await _wnbaFindGame(id);
                const freshSummary = await fetchWNBAGameSummary(id);
                if (freshGame) _wnbaRenderGamePanel(freshGame, freshSummary);
                if (freshGame && !freshGame.isLive) _wnbaGameStop();
            } catch { /* keep last good render on a transient poll failure */ }
        }, 30_000);
    }
}

function _wnbaSeasonStatRow(label, homeStat, awayStat) {
    return `<div class="detail-row"><span class="detail-value">${_escHtml(awayStat)}</span><span class="detail-label">${_escHtml(label)}</span><span class="detail-value">${_escHtml(homeStat)}</span></div>`;
}

function _wnbaRenderGamePanel(game, summary) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    const pillLbl = game.isLive ? 'LIVE' : game.isFinal ? 'FINAL' : (game.statusText || 'Scheduled');
    const pillCls = game.isLive ? 'live' : game.isFinal ? 'final' : 'sched';

    const teamCol = (t, side) => `
        <div class="hgc-row" style="justify-content:${side === 'away' ? 'flex-start' : 'flex-end'};gap:0.6rem">
            ${side === 'home' ? `<span class="hgc-score${game.isFinal && t.winner ? ' hgc-score--win' : ''}" style="font-size:2rem">${(game.isFinal || game.isLive) ? t.score : ''}</span>` : ''}
            ${t.logo ? `<img class="hgc-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error style="width:44px;height:44px">` : ''}
            <span class="hgc-team" style="font-size:1.05rem">${_escHtml(t.name || t.abbr)}</span>
            ${side === 'away' ? `<span class="hgc-score${game.isFinal && t.winner ? ' hgc-score--win' : ''}" style="font-size:2rem">${(game.isFinal || game.isLive) ? t.score : ''}</span>` : ''}
        </div>`;

    const header = `<div class="player-detail-header">
        <div class="detail-header-bar">
            <button onclick="navigateTo('wnba-scores')" class="back-button">← Scores</button>
            <span></span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0.5rem 0">
            ${teamCol(game.awayTeam, 'away')}
            <div style="text-align:center">
                <span class="ticker-status-pill ticker-status-pill--${pillCls}">${_escHtml(pillLbl)}</span>
            </div>
            ${teamCol(game.homeTeam, 'home')}
        </div>
    </div>`;

    // Season comparison — boxscore.teams[].statistics (labeled "Season", see note above)
    let comparison = '';
    const bxTeams = (summary && summary.boxscore && summary.boxscore.teams) || [];
    if (bxTeams.length === 2) {
        const away = bxTeams.find(t => t.homeAway === 'away') || bxTeams[0];
        const home = bxTeams.find(t => t.homeAway === 'home') || bxTeams[1];
        const wantStats = [
            ['avgPoints', 'PPG'], ['fieldGoalPct', 'FG%'], ['threePointFieldGoalPct', '3P%'],
            ['avgRebounds', 'RPG'], ['avgAssists', 'APG'], ['avgSteals', 'SPG'], ['avgBlocks', 'BPG'],
        ];
        const statVal = (team, name) => { const s = (team.statistics || []).find(x => x.name === name); return s ? s.displayValue : '—'; };
        const rows = wantStats.map(([n, l]) => _wnbaSeasonStatRow(l, statVal(home, n), statVal(away, n))).join('');
        comparison = detailSection({ title: 'Season Comparison', body: `<div class="player-details detail-bio-wide">${rows}</div>`, hdrExtra: `<span class="standings-gb" style="font-size:0.7rem">season averages, not this game's box score</span>` });
    }

    // Team season leaders (per boxscore.leaders — same "Season" caveat)
    let leadersHtml = '';
    const bxLeaders = (summary && summary.boxscore && summary.boxscore.leaders) || [];
    if (bxLeaders.length) {
        const cards = bxLeaders.map(tl => {
            const teamName = (tl.team && (tl.team.abbreviation || tl.team.displayName)) || '';
            const cats = (tl.leaders || []).slice(0, 3).map(c => {
                const p = c.leaders && c.leaders[0];
                if (!p || !p.athlete) return '';
                return `<div class="nfl-lrow" style="cursor:pointer" onclick="navigateTo('wnba-player-${_escHtml(String(p.athlete.id))}')">
                    <div class="nfl-lrow-av">${p.athlete.headshot && p.athlete.headshot.href ? `<img src="${_escHtml(p.athlete.headshot.href)}" alt="" loading="lazy" data-hide-on-error>` : ''}</div>
                    <div class="nfl-lrow-main"><div class="nfl-lrow-name">${_escHtml(p.athlete.shortName || p.athlete.fullName || '')}</div><div class="nfl-lrow-meta">${_escHtml(c.displayName || '')}</div></div>
                    <span class="nfl-lrow-val">${_escHtml(p.displayValue)}</span>
                </div>`;
            }).join('');
            return `<div class="card" style="padding:0;overflow:hidden">
                <div class="nfl-card-head">${_escHtml(teamName)}</div>${cats}
            </div>`;
        }).join('');
        leadersHtml = detailSection({ title: 'Season Leaders', body: `<div class="players-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${cards}</div>`, hdrExtra: `<span class="standings-gb" style="font-size:0.7rem">top scorer, rebounder, assister — season stats</span>` });
    }

    const venue = (summary && summary.gameInfo && summary.gameInfo.venue) || null;
    const broadcasts = (summary && summary.gameInfo && summary.gameInfo.broadcasts) || [];
    const infoParts = [];
    if (venue) infoParts.push(`${_escHtml(venue.fullName || '')}${venue.address ? ` · ${_escHtml(venue.address.city || '')}, ${_escHtml(venue.address.state || '')}` : ''}`);
    if (broadcasts.length) infoParts.push(broadcasts.map(b => b.media && b.media.shortName).filter(Boolean).map(_escHtml).join(', '));
    const infoNote = infoParts.length ? `<p class="detail-note" style="margin-top:0.75rem">${infoParts.join(' · ')}</p>` : '';

    grid.innerHTML = header + comparison + leadersHtml + infoNote;
}

window.fetchWNBAGameSummary = fetchWNBAGameSummary;
window.showWNBAGame         = showWNBAGame;
