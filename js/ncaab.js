// ============================================================
// NCAA Men's Basketball (college-basketball) — 4th sport (D-052)
// ESPN public API via same-origin /api/ncaab Pages Function.
// Bounded P2/P3 scope, mirroring NCAAF's original D-042 phase-1:
// Scores, Standings (conference-grouped), Teams, Rankings.
// Player leaders/detail deferred pending a live data-depth check,
// same deferral NCAAF carried until D-044 found the data was fine.
// Season model mirrors nfl.js/ncaaf.js. No keys, no D1.
// ============================================================

const _ncaabNow = new Date();
// NCAAB is labeled by its END year — confirmed live 2026-08-10 against the
// real ESPN scoreboard payload: the 2026-27 season reports season.year=2027.
// Bug caught live-verifying this same day: an earlier version flipped the
// label only at November, so August (offseason, anticipating the season that
// tips off in November) showed the WRONG season — "the 2026 season tips off
// in November" when ESPN itself calls that season 2027. The label must flip
// right after the previous season ends (April), not at November — May-Dec
// are all "anticipating/hosting next season," not just Nov/Dec.
const NCAAB_SEASON = (_ncaabNow.getMonth() + 1 <= 4) ? _ncaabNow.getFullYear() : _ncaabNow.getFullYear() + 1;

// In-season: Nov-Apr (regular season through the tournament/championship).
// May-Oct = offseason.
function _ncaabIsOffseason() {
    const m = new Date().getMonth() + 1; // 1=Jan
    return m >= 5 && m <= 10;
}

async function espnNCAABFetch(path, params = {}, ttl = ApiCache.TTL.SHORT) {
    const url = new URL('/api/ncaab', location.origin);
    url.searchParams.set('path', path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `ncaab:${path}:${url.searchParams.toString()}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    Logger.debug(`NCAAB → ${url.pathname}`, undefined, 'NCAAB');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(tid);
    }
    if (!res.ok) throw new Error(`NCAAB API ${res.status}: ${res.statusText}`);
    let json;
    try { json = await res.json(); } catch { throw new Error(`NCAAB API returned non-JSON (${path})`); }
    ApiCache.set(cacheKey, json, ttl);
    return json;
}

async function fetchNCAABScoreboard() {
    const data = await espnNCAABFetch('/scoreboard', {}, ApiCache.TTL.SHORT);
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

function _ncaabOffseasonState() {
    return `<div class="nfl-offseason">
        <div class="nfl-offseason-glyph" aria-hidden="true">🏀</div>
        <h2 class="nfl-offseason-title">College basketball is in the offseason</h2>
        <p class="nfl-offseason-text">Live scores, conference standings, teams and the AP/Coaches polls populate here when the ${NCAAB_SEASON} season tips off in November.</p>
        <div class="nfl-offseason-actions">
            <button class="nfl-offseason-btn" onclick="switchSport('mlb')">MLB is live now</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('home')">Back to home</button>
        </div>
    </div>`;
}

function _ncaabGameCard(g) {
    const row = (t) => `
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

async function displayNCAABScores() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'home-container';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    if (_ncaabIsOffseason()) {
        grid.innerHTML = _ncaabOffseasonState();
        return;
    }

    grid.innerHTML = `
        <div class="home-today">
            <div class="home-section-hdr">
                <span class="home-section-title">College Basketball — Scoreboard</span>
                <span class="home-section-date">${dateStr}</span>
            </div>
            <div class="home-today-grid" id="ncaabScoresGrid">
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:96px;border-radius:var(--radius-md)"></div>
            </div>
        </div>`;

    try {
        const games = await fetchNCAABScoreboard();
        AppState.ncaabGames = games;
        const cell = document.getElementById('ncaabScoresGrid');
        if (!cell) return;
        cell.innerHTML = games.length
            ? games.map(_ncaabGameCard).join('')
            : `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">No games on the board right now — check back on game day.</p></div>`;
        if (typeof updateNCAABTicker === 'function') updateNCAABTicker(games);
    } catch (err) {
        Logger.warn('NCAAB scoreboard failed', err, 'NCAAB');
        const cell = document.getElementById('ncaabScoresGrid');
        if (cell) cell.innerHTML = `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">Couldn't load college basketball scores. <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="displayNCAABScores()">Retry</button></p></div>`;
    }
}

function updateNCAABTicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) return;
    const scored = (games || []).filter(g => g.isFinal || g.isLive || g.homeTeam.score > 0 || g.awayTeam.score > 0);
    if (!scored.length) return; // only NCAAB's own Scores page owns its ticker moment; don't blank the shared ticker if another sport already populated it
    const items = [...scored, ...scored]
        .map(g => Scorebug.renderTickerItem ? Scorebug.renderTickerItem(Scorebug.normalizeNCAAFGame ? Scorebug.normalizeNCAAFGame(g) : g) : '')
        .join('');
    if (!items) return;
    ticker.classList.remove('ticker--idle');
    ticker.innerHTML = items;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = ticker.scrollWidth;
        if (w > 0) ticker.style.animationDuration = Math.max(15, Math.round(w / 2 / 60)) + 's';
    }));
}

function _renderNCAABView(view) {
    if (window.StatsCharts && StatsCharts.destroyAll) StatsCharts.destroyAll();
    if (window.setBreadcrumb) setBreadcrumb(view, null);
    switch (view) {
        case 'ncaab-standings': displayNCAABStandings(); break;
        case 'ncaab-teams':     displayNCAABTeams();     break;
        case 'ncaab-rankings':  displayNCAABRankings();  break;
        case 'ncaab-scores':
        case 'ncaab-home':
        default:                displayNCAABScores();
    }
}

// ── Season model for standings/rankings (last season with real data) ──
// Distinct from NCAAB_SEASON on purpose — same split NCAAF uses
// (NCAAF_SEASON vs NCAAF_LAST_SEASON). NCAAB_SEASON answers "what season is
// about to start" (for offseason copy); this answers "what season has real
// data to show right now" (for the Standings/Teams/Rankings default). They
// diverge for exactly the May-Oct offseason: NCAAB_SEASON says next season
// (2027) is coming; NCAAB_LAST_SEASON correctly keeps showing the just-
// finished 2026 season's real final standings instead of an empty upcoming
// one. Nov-Dec: both agree (the new season has live real data). Jan-Apr:
// both agree (the current season is real and in progress).
const NCAAB_LAST_SEASON = (_ncaabNow.getMonth() + 1 <= 10) ? _ncaabNow.getFullYear() : _ncaabNow.getFullYear() + 1;
const _ncaab = { season: NCAAB_LAST_SEASON, poll: 0 };

function _ncaabErr(msg, retryFn) {
    return `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">${_escHtml(msg)}</p><div class="nfl-offseason-actions"><button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="${retryFn}()">Retry</button></div></div>`;
}

// ── Rankings (AP / Coaches polls) ─────────────────────────────
async function fetchNCAABRankings() {
    const data = await espnNCAABFetch('/rankings', {}, ApiCache.TTL.LONG);
    return (data.rankings || []).map(r => ({
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

async function displayNCAABRankings() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs" id="ncaabPollTabs"></div>
        <div id="ncaabRankBody"><div class="skeleton-line" style="height:340px;border-radius:var(--radius-md)"></div></div>`;
    let polls;
    try { polls = await fetchNCAABRankings(); }
    catch (err) {
        Logger.warn('NCAAB rankings failed', err, 'NCAAB');
        document.getElementById('ncaabRankBody').innerHTML = _ncaabErr('Couldn\'t load the polls.', 'displayNCAABRankings');
        return;
    }
    if (!polls.length) {
        grid.innerHTML = `<div class="standings-container">${_ncaabOffseasonState()}</div>`;
        return;
    }
    if (_ncaab.poll >= polls.length) _ncaab.poll = 0;
    const tabs = document.getElementById('ncaabPollTabs');
    tabs.innerHTML = polls.map((p, i) =>
        `<button class="standings-tab${i === _ncaab.poll ? ' active' : ''}" data-poll="${i}">${_escHtml(p.name)}</button>`).join('');
    tabs.querySelectorAll('.standings-tab').forEach(b => b.addEventListener('click', () => {
        _ncaab.poll = parseInt(b.dataset.poll, 10); displayNCAABRankings();
    }));
    const p = polls[_ncaab.poll];
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
    document.getElementById('ncaabRankBody').innerHTML = `
        <div class="standings-table-wrap">
            <table class="standings-table">
                <thead><tr><th class="standings-th-rank">#</th><th class="standings-th-team">Team</th><th>Record</th><th>Move</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="standings-legend">${_escHtml(p.name)}${p.occurrence ? ' · ' + _escHtml(p.occurrence) : ''}. Source: ESPN. ▲/▼ = movement vs the previous poll.</p>`;
}

// ── Standings + Teams (shared site.web.api conference tree) ───
function _ncaabStandingRow(e) {
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
        streak: disp(['streak']) || '',
    };
}

function _ncaabCollectConfs(node, trail, out) {
    const nm = node.name || node.abbreviation;
    const t2 = nm ? [...trail, nm] : trail;
    const entries = (node.standings && node.standings.entries) || [];
    if (entries.length) {
        const label = t2.join(' — ') || nm || 'Conference';
        out.push({ name: label, teams: entries.map(_ncaabStandingRow).filter(Boolean) });
    }
    for (const c of (node.children || [])) _ncaabCollectConfs(c, t2, out);
}

async function fetchNCAABStandings(season) {
    const cacheKey = `ncaab:standings:${season}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;
    const res = await fetch(`/api/ncaabstandings?season=${season}`);
    if (!res.ok) throw new Error(`NCAAB standings ${res.status}`);
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.reason || 'standings unavailable');
    const confs = [];
    for (const c of (data.children || [])) _ncaabCollectConfs(c, [], confs);
    const out = confs.filter(c => c.teams.length);
    ApiCache.set(cacheKey, out, ApiCache.TTL.LONG);
    return out;
}

function _ncaabSeasonSelect() {
    const yrs = [];
    for (let y = NCAAB_LAST_SEASON; y >= NCAAB_LAST_SEASON - 5; y--) yrs.push(y);
    return `<select id="ncaabSeasonSel" class="standings-tab" style="cursor:pointer">${
        yrs.map(y => `<option value="${y}"${y === _ncaab.season ? ' selected' : ''}>${y - 1}-${String(y).slice(2)} season</option>`).join('')}</select>`;
}

async function displayNCAABStandings() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs">${_ncaabSeasonSelect()}</div>
        <div id="ncaabStdBody"><div class="skeleton-line" style="height:360px;border-radius:var(--radius-md)"></div></div>`;
    document.getElementById('ncaabSeasonSel').addEventListener('change', (ev) => {
        _ncaab.season = parseInt(ev.target.value, 10); displayNCAABStandings();
    });
    let confs;
    try { confs = await fetchNCAABStandings(_ncaab.season); }
    catch (err) {
        Logger.warn('NCAAB standings failed', err, 'NCAAB');
        document.getElementById('ncaabStdBody').innerHTML = _ncaabErr('Standings are unavailable for this season.', 'displayNCAABStandings');
        return;
    }
    if (!confs.length) {
        document.getElementById('ncaabStdBody').innerHTML = _ncaabErr('No standings returned for the ' + (_ncaab.season - 1) + '-' + String(_ncaab.season).slice(2) + ' season.', 'displayNCAABStandings');
        return;
    }
    document.getElementById('ncaabStdBody').innerHTML = confs.map(c => `
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
        `<p class="standings-legend">${_escHtml(String(_ncaab.season - 1))}-${_escHtml(String(_ncaab.season).slice(2))} D-I conference standings. Source: ESPN. Conf = record within the conference.</p>`;
}

async function displayNCAABTeams() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs">${_ncaabSeasonSelect()}</div>
        <div id="ncaabTeamsBody"><div class="skeleton-line" style="height:360px;border-radius:var(--radius-md)"></div></div>`;
    document.getElementById('ncaabSeasonSel').addEventListener('change', (ev) => {
        _ncaab.season = parseInt(ev.target.value, 10); displayNCAABTeams();
    });
    let confs;
    try { confs = await fetchNCAABStandings(_ncaab.season); }
    catch (err) {
        Logger.warn('NCAAB teams failed', err, 'NCAAB');
        document.getElementById('ncaabTeamsBody').innerHTML = _ncaabErr('Teams are unavailable for this season.', 'displayNCAABTeams');
        return;
    }
    if (!confs.length) {
        document.getElementById('ncaabTeamsBody').innerHTML = _ncaabErr('No teams returned for this season.', 'displayNCAABTeams');
        return;
    }
    // Team detail is deferred (D-052 P4, not built yet) — chips are display-only,
    // no click-through, so this never links into a view that doesn't exist.
    document.getElementById('ncaabTeamsBody').innerHTML = confs.map(c => `
        <section style="margin-bottom:var(--space-4)">
            <h2 class="standings-team-name" style="font-family:var(--font-display);font-size:1.02rem;margin:0 0 0.6rem">${_escHtml(c.name)} <span class="standings-gb" style="font-size:0.8rem">· ${c.teams.length}</span></h2>
            <div class="ncaaf-team-grid">${c.teams.map(t => `<div class="ncaaf-team-chip">
                ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : '<span class="standings-logo"></span>'}
                <span class="ncaaf-team-chip-name">${_escHtml(t.name)}</span>
            </div>`).join('')}</div>
        </section>`).join('') +
        `<p class="standings-legend">D-I teams grouped by conference (${_escHtml(String(_ncaab.season - 1))}-${_escHtml(String(_ncaab.season).slice(2))}). Source: ESPN.</p>`;
}

window.fetchNCAABScoreboard = fetchNCAABScoreboard;
window.displayNCAABScores   = displayNCAABScores;
window.displayNCAABRankings = displayNCAABRankings;
window.displayNCAABStandings = displayNCAABStandings;
window.displayNCAABTeams    = displayNCAABTeams;
window._renderNCAABView     = _renderNCAABView;
window.updateNCAABTicker    = updateNCAABTicker;
