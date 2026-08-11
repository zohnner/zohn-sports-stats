// ============================================================
// WNBA — 5th sport (D-092, owner override of D-052's calendar-gap
// recommendation — see DECISIONS.md D-092 for the full trade-off record).
// ESPN public API via same-origin /api/wnba Pages Function.
// Scope: Scores, Standings (conference-grouped), Teams. No Rankings (no
// poll exists for a pro league) — lighter scope than NCAAF/NCAAB.
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
    return `<div class="home-game-card${g.isLive ? ' home-game-card--live' : ''}">
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
    if (window.setBreadcrumb) setBreadcrumb(view, null);
    switch (view) {
        case 'wnba-standings': displayWNBAStandings(); break;
        case 'wnba-teams':     displayWNBATeams();     break;
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
    return {
        id: t.id || '',
        name: t.displayName || t.name || t.location || '?',
        abbr: t.abbreviation || '',
        logo: (t.logos && t.logos[0] && t.logos[0].href) || t.logo || '',
        overall: (w != null && l != null) ? `${w}-${l}` : (disp(['overall', 'total']) || '—'),
        gb: disp(['gamesBehind']) || '',
        streak: disp(['streak']) || '',
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
window._renderWNBAView      = _renderWNBAView;
window.updateWNBATicker     = updateWNBATicker;
