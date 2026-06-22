// ============================================================
// NFL — teams, scores, standings, leaders
// ESPN public API: https://site.api.espn.com/apis/site/v2/sports/football/nfl
// ============================================================

const NFL_ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

// ── NFL season model — single source of truth; auto-rolls every year ──
// STATS  = latest season with completed/accumulating stats (Sep–Feb window).
// FANTASY = the season ADP / drafts / player profiles refer to (upcoming or in-progress).
const _nflNow = new Date();
const NFL_STATS_SEASON       = (_nflNow.getMonth() + 1 >= 9) ? _nflNow.getFullYear() : _nflNow.getFullYear() - 1;
const NFL_FANTASY_SEASON     = (_nflNow.getMonth() + 1 >= 3) ? _nflNow.getFullYear() : _nflNow.getFullYear() - 1;
const NFL_LEADERS_MIN_SEASON = 2000;  // ESPN core-API leaders depth
const NFL_NGS_MIN_SEASON     = 2016;  // Next Gen Stats depth

// ── Offseason state (P3-029) ──────────────────────────────────
// Mar–Aug is unambiguously offseason; Sep–Feb covers regular season + playoffs.
// A schedule (Scores) and the fantasy surfaces stay populated year-round, so the
// offseason component is a fallback for genuinely-empty surfaces, not a gate.
function _nflIsOffseason() {
    const m = new Date().getMonth() + 1;
    return m >= 3 && m <= 8;
}

const _NFL_OFFSEASON_GLYPH = '<svg class="nfl-offseason-glyph" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="5.6" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7M10.6 7.4l1.4 1.4M7.4 10.6l1.4 1.4"/></svg>';

function _nflOffseasonState(surface) {
    const copy = {
        standings: `Standings populate once the ${NFL_FANTASY_SEASON} regular season is underway. Until kickoff in September, browse the upcoming schedule and all 32 teams.`,
        scores:    `No games on the board right now. The ${NFL_FANTASY_SEASON} schedule appears here the moment the league releases it — until then, get a head start on the draft.`,
        generic:   `Live ${NFL_FANTASY_SEASON} data returns when the regular season kicks off in September. In the meantime, the fantasy tools are open year-round.`,
    };
    const actions = {
        standings: `<button class="nfl-offseason-btn" onclick="navigateTo('nfl-games')">View schedule</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('nfl-teams')">Browse teams</button>`,
        scores:    `<button class="nfl-offseason-btn" onclick="navigateTo('nfl-mock')">Mock draft</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('nfl-teams')">Browse teams</button>`,
        generic:   `<button class="nfl-offseason-btn" onclick="navigateTo('nfl-players')">Browse players</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('nfl-rankings')">Rankings</button>`,
    };
    const s = copy[surface] ? surface : 'generic';
    return `<div class="nfl-offseason">
        ${_NFL_OFFSEASON_GLYPH}
        <h2 class="nfl-offseason-title">NFL is in the offseason</h2>
        <p class="nfl-offseason-text">${copy[s]}</p>
        <div class="nfl-offseason-actions">${actions[s]}</div>
    </div>`;
}

// ── Fetch helper ──────────────────────────────────────────────

async function espnNFLFetch(path, params = {}, ttl = ApiCache.TTL.MEDIUM) {
    // Route through our same-origin Pages Function proxy (functions/api/nfl.js):
    // a server-side fetch fixes ESPN's browser CORS on /teams and /leaders.
    const url = new URL('/api/nfl', location.origin);
    url.searchParams.set('path', path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `nfl:${path}:${url.searchParams.toString()}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    Logger.debug(`NFL → ${url.pathname}`, undefined, 'NFL');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(tid);
    }
    if (!res.ok) throw new Error(`NFL API ${res.status}: ${res.statusText}`);

    let json;
    try { json = await res.json(); } catch { throw new Error(`NFL API returned non-JSON (${path})`); }
    ApiCache.set(cacheKey, json, ttl);
    return json;
}

// ── Logo helpers ──────────────────────────────────────────────

function getNFLTeamLogoUrl(abbr) {
    return abbr ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png` : null;
}

function getNFLPlayerHeadshotUrl(espnId) {
    return espnId ? `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png` : null;
}

// ── API functions ─────────────────────────────────────────────

async function fetchNFLTeams() {
    const data = await espnNFLFetch('/teams', { limit: 32 }, ApiCache.TTL.LONG);
    return (data.sports?.[0]?.leagues?.[0]?.teams || []).map(t => {
        const team = t.team;
        return {
            id:        team.id,
            abbr:      team.abbreviation,
            name:      team.displayName,
            shortName: team.shortDisplayName || team.name,
            color:     '#' + (team.color || '334155'),
            altColor:  '#' + (team.alternateColor || '64748b'),
            logo:      team.logos?.[0]?.href || getNFLTeamLogoUrl(team.abbreviation),
            record:    team.record?.items?.[0]?.summary || '',
        };
    });
}

async function fetchNFLScoreboard() {
    const data = await espnNFLFetch('/scoreboard', {}, ApiCache.TTL.SHORT);
    return (data.events || []).map(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors?.find(c => c.homeAway === 'home');
        const away = comp.competitors?.find(c => c.homeAway === 'away');
        const status = comp.status;
        const stName = status?.type?.name || 'STATUS_SCHEDULED';
        const isFinal = stName.startsWith('STATUS_FINAL');
        const isLive  = stName === 'STATUS_IN_PROGRESS' || stName === 'STATUS_HALFTIME';
        return {
            id:       ev.id,
            name:     ev.name,
            date:     ev.date,
            homeTeam: {
                abbr:   home?.team?.abbreviation || '?',
                name:   home?.team?.displayName  || '',
                logo:   home?.team?.logo || getNFLTeamLogoUrl(home?.team?.abbreviation),
                score:  parseInt(home?.score || '0', 10),
                winner: home?.winner === true,
            },
            awayTeam: {
                abbr:   away?.team?.abbreviation || '?',
                name:   away?.team?.displayName  || '',
                logo:   away?.team?.logo || getNFLTeamLogoUrl(away?.team?.abbreviation),
                score:  parseInt(away?.score || '0', 10),
                winner: away?.winner === true,
            },
            isFinal,
            isLive,
            statusText: status?.type?.shortDetail || status?.type?.description || '',
            period: status?.period || 0,
            clock:  status?.displayClock || '',
        };
    }).filter(Boolean);
}

async function fetchNFLStandings() {
    const data = await espnNFLFetch('/standings', {}, ApiCache.TTL.SHORT);
    const result = [];
    for (const conf of (data.children || [])) {
        const confAbbr = conf.abbreviation || conf.name;
        for (const div of (conf.children || [])) {
            const divName = div.name || div.abbreviation;
            for (const entry of (div.standings?.entries || [])) {
                const team  = entry.team;
                const stats = {};
                (entry.stats || []).forEach(s => { stats[s.name] = s; });
                result.push({
                    conference: confAbbr,
                    division:   divName,
                    id:         team.id,
                    abbr:       team.abbreviation,
                    name:       team.displayName,
                    shortName:  team.shortDisplayName || team.name,
                    logo:       team.logos?.[0]?.href || getNFLTeamLogoUrl(team.abbreviation),
                    wins:       parseInt(stats.wins?.displayValue       || '0', 10),
                    losses:     parseInt(stats.losses?.displayValue      || '0', 10),
                    ties:       parseInt(stats.ties?.displayValue        || '0', 10),
                    pct:        parseFloat(stats.winPercent?.displayValue || '0'),
                    pf:         parseInt(stats.pointsFor?.displayValue   || '0', 10),
                    pa:         parseInt(stats.pointsAgainst?.displayValue || '0', 10),
                    diff:       parseInt(stats.pointDifferential?.displayValue || '0', 10),
                    homeRec:    stats.home?.displayValue || '',
                    awayRec:    stats.road?.displayValue || '',
                    divRec:     stats.vsDiv?.displayValue || '',
                    streak:     stats.streak?.displayValue || '',
                    rank:       parseInt(stats.rank?.displayValue || stats.playoffSeed?.displayValue || '0', 10),
                });
            }
        }
    }
    return result;
}

// ── Display: Teams ────────────────────────────────────────────

async function loadNFLTeams() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'games-grid';
    if (window.setBreadcrumb) setBreadcrumb('nfl-teams', null);

    grid.innerHTML = Array.from({ length: 8 }, () =>
        `<div class="skeleton-card" style="min-height:120px"></div>`
    ).join('');

    try {
        if (!AppState.nflTeams.length) AppState.nflTeams = await fetchNFLTeams();
        displayNFLTeams(AppState.nflTeams);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLTeams, { tag: 'NFL', title: 'Failed to Load NFL Teams' });
    }
}

function displayNFLTeams(teams) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'games-grid';

    if (!teams?.length) {
        ErrorHandler.renderEmptyState(grid, 'No NFL team data available', '🏈');
        return;
    }

    const fragment = document.createDocumentFragment();
    teams.forEach(team => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.style.cssText = 'cursor:pointer;padding:1.25rem 1rem;display:flex;flex-direction:column;align-items:center;gap:0.5rem;text-align:center;border-top:3px solid ' + team.color + '99';
        card.onclick = () => navigateTo('nfl-team-' + team.abbr);
        card.innerHTML = `
            <div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center">
                <img src="${team.logo}" alt="${_escHtml(team.shortName)}" style="width:100%;height:100%;object-fit:contain" loading="lazy" data-hide-on-error>
            </div>
            <div style="font-weight:800;font-size:0.88rem;color:var(--text-primary)">${_escHtml(team.shortName)}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">${_escHtml(team.abbr)}</div>
            ${team.record ? `<div style="font-size:0.72rem;font-weight:700;color:var(--text-secondary)">${_escHtml(team.record)}</div>` : ''}
        `;
        fragment.appendChild(card);
    });
    grid.innerHTML = '';
    if (_nflIsOffseason() && teams.every(t => !t.record)) {
        const note = document.createElement('div');
        note.className = 'nfl-teams-note';
        note.textContent = `Records show 0–0 until the ${NFL_FANTASY_SEASON} season starts.`;
        grid.appendChild(note);
    }
    grid.appendChild(fragment);
}

// ── Display: Scores ───────────────────────────────────────────

async function loadNFLGames() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'games-grid';
    if (window.setBreadcrumb) setBreadcrumb('nfl-games', null);

    grid.innerHTML = Array.from({ length: 6 }, () =>
        `<div class="skeleton-card" style="min-height:160px"></div>`
    ).join('');

    try {
        const games = await fetchNFLScoreboard();
        AppState.nflGames = games;
        displayNFLGames(games);
        updateNFLTicker(games);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLGames, { tag: 'NFL', title: 'Failed to Load NFL Scores' });
    }
}

function displayNFLGames(games) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'games-grid';

    if (!games?.length) {
        grid.className = '';
        grid.innerHTML = _nflIsOffseason()
            ? _nflOffseasonState('scores')
            : '';
        if (!_nflIsOffseason()) ErrorHandler.renderEmptyState(grid, 'No NFL games scheduled right now.', '🏈');
        return;
    }

    const fragment = document.createDocumentFragment();
    games.forEach(game => fragment.appendChild(_createNFLGameCard(game)));
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

function _createNFLGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.dataset.gameId = game.id;

    const hs = game.homeTeam.score;
    const as = game.awayTeam.score;
    const hasScore = game.isFinal || game.isLive || hs > 0 || as > 0;

    const statusCls = game.isFinal ? 'game-status--final' : game.isLive ? 'game-status--live' : 'game-status--sched';

    let dateStr = '';
    if (game.date) {
        try { dateStr = new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (_) {}
    }

    card.innerHTML = `
        <div class="game-date">${dateStr}</div>
        <div class="game-teams">
            <div class="game-team ${game.awayTeam.winner ? 'game-team--winner' : ''}">
                <div class="game-team-logo">
                    <img src="${game.awayTeam.logo}" alt="${_escHtml(game.awayTeam.abbr)}" class="game-logo-img" loading="lazy" data-hide-on-error>
                </div>
                <span class="game-team-abbr">${_escHtml(game.awayTeam.abbr)}</span>
                ${hasScore ? `<span class="game-score ${game.awayTeam.winner ? 'game-score--win' : ''}">${as}</span>` : ''}
            </div>
            <div class="game-vs">@</div>
            <div class="game-team ${game.homeTeam.winner ? 'game-team--winner' : ''}">
                ${hasScore ? `<span class="game-score ${game.homeTeam.winner ? 'game-score--win' : ''}">${hs}</span>` : ''}
                <span class="game-team-abbr">${_escHtml(game.homeTeam.abbr)}</span>
                <div class="game-team-logo">
                    <img src="${game.homeTeam.logo}" alt="${_escHtml(game.homeTeam.abbr)}" class="game-logo-img" loading="lazy" data-hide-on-error>
                </div>
            </div>
        </div>
        <div class="game-status ${statusCls}">
            ${_escHtml(game.statusText || (game.isFinal ? 'Final' : 'Scheduled'))}
            ${game.isLive && game.clock ? ` · ${_escHtml(game.clock)}` : ''}
        </div>
    `;
    return card;
}

// ── Display: Standings ────────────────────────────────────────

async function loadNFLStandings() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:400px"></div>`;
    if (window.setBreadcrumb) setBreadcrumb('nfl-standings', null);

    try {
        if (!AppState.nflStandings?.length) AppState.nflStandings = await fetchNFLStandings();
        displayNFLStandings(AppState.nflStandings);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLStandings, { tag: 'NFL', title: 'Failed to Load NFL Standings' });
    }
}

function displayNFLStandings(rows) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.innerHTML = '';

    if (!rows?.length) {
        grid.innerHTML = _nflOffseasonState('standings');
        return;
    }

    const grouped = {};
    rows.forEach(t => {
        if (!grouped[t.conference]) grouped[t.conference] = {};
        if (!grouped[t.conference][t.division]) grouped[t.conference][t.division] = [];
        grouped[t.conference][t.division].push(t);
    });

    const confOrder = ['AFC', 'NFC'];
    const divOrder  = {
        AFC: ['AFC East', 'AFC North', 'AFC South', 'AFC West'],
        NFC: ['NFC East', 'NFC North', 'NFC South', 'NFC West'],
    };

    const wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem;padding:1rem 0';

    for (const conf of confOrder) {
        if (!grouped[conf]) continue;
        const confWrap = document.createElement('div');
        confWrap.innerHTML = `<h2 style="font-size:1rem;font-weight:900;letter-spacing:1px;text-transform:uppercase;
            color:var(--accent);margin:0 0 0.75rem;padding:0.5rem 0;border-bottom:2px solid var(--border-mid)">${conf}</h2>`;

        const divsGrid = document.createElement('div');
        divsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem';

        for (const div of (divOrder[conf] || Object.keys(grouped[conf] || {}))) {
            const teams = grouped[conf]?.[div];
            if (!teams?.length) continue;
            teams.sort((a, b) => b.wins - a.wins || a.losses - b.losses);

            const divCard = document.createElement('div');
            divCard.className = 'card';
            divCard.style.cssText = 'padding:0;overflow:hidden';

            const header = `<div style="display:grid;grid-template-columns:14px 1fr repeat(4,auto);align-items:center;
                gap:0.4rem;padding:0.4rem 0.75rem;background:var(--bg-elevated);
                border-bottom:1px solid var(--border-subtle);font-size:0.64rem;font-weight:800;
                letter-spacing:0.5px;text-transform:uppercase;color:var(--text-subtle)">
                <span></span><span>${_escHtml(div)}</span><span>W</span><span>L</span><span>T</span><span>PCT</span>
            </div>`;

            const teamRows = teams.map((t, i) => `
                <div style="display:grid;grid-template-columns:14px 1fr repeat(4,auto);align-items:center;
                    gap:0.4rem;padding:0.45rem 0.75rem;
                    border-bottom:${i < teams.length - 1 ? '1px solid var(--border-subtle)' : 'none'}">
                    <span style="font-size:0.65rem;color:var(--text-subtle);text-align:center">${i + 1}</span>
                    <div style="display:flex;align-items:center;gap:0.4rem">
                        <img src="${getNFLTeamLogoUrl(t.abbr)}" alt="" style="width:18px;height:18px;object-fit:contain" loading="lazy" data-hide-on-error>
                        <span style="font-weight:700;font-size:0.82rem;color:var(--text-primary)">${_escHtml(t.shortName)}</span>
                    </div>
                    <span style="font-weight:700;font-size:0.8rem;color:var(--text-primary);text-align:right">${t.wins}</span>
                    <span style="font-size:0.78rem;color:var(--text-secondary);text-align:right">${t.losses}</span>
                    <span style="font-size:0.75rem;color:var(--text-muted);text-align:right">${t.ties}</span>
                    <span style="font-size:0.74rem;color:var(--text-muted);text-align:right">${t.pct.toFixed(3)}</span>
                </div>
            `).join('');

            divCard.innerHTML = header + teamRows;
            divsGrid.appendChild(divCard);
        }
        confWrap.appendChild(divsGrid);
        wrap.appendChild(confWrap);
    }
    grid.appendChild(wrap);
}

// ── Sleeper player pool (validated NFL player source) ─────────
// ESPN's site API exposes no working /leaders or roster path, so player-level
// NFL data comes from Sleeper's public API via the same-origin /api/sleeper proxy.
let _nflPool    = null;     // active fantasy players sorted by ADP (search_rank)
let _nflPoolMap = null;     // { [sleeper_id]: rawPlayer }
let _nflPosFilter = sessionStorage.getItem('ss_nfl_pos_filter') || 'ALL';

const _NFL_POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];
const _NFL_POS_COLOR = { QB: 'var(--nfl-pos-qb)', RB: 'var(--nfl-pos-rb)', WR: 'var(--nfl-pos-wr)', TE: 'var(--nfl-pos-te)', K: 'var(--nfl-pos-k)' };
const _nflAlpha = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

async function fetchNFLSleeperPool() {
    if (_nflPool) return _nflPool;
    const res = await fetch('/api/sleeper?path=/v1/players/nfl');
    if (!res.ok) throw new Error(`Sleeper players ${res.status}`);
    const raw = await res.json();
    _nflPoolMap = raw;
    _nflPool = Object.values(raw)
        .filter(p => p && p.active && p.full_name && Array.isArray(p.fantasy_positions)
                     && p.fantasy_positions.length && p.search_rank && p.search_rank < 9999)
        .sort((a, b) => a.search_rank - b.search_rank);
    _nflPool.forEach((p, i) => { p._adp = i + 1; });  // dense ADP (search_rank has ties)
    return _nflPool;
}

function getNFLSleeperHeadshot(id) {
    return id ? `https://sleepercdn.com/content/nfl/players/${id}.jpg` : null;
}

// ── Display: Players (reuses the .player-card component) ───────
async function loadNFLPlayers() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-players', null);

    grid.innerHTML = Array.from({ length: 8 }, () =>
        `<div class="skeleton-card" style="min-height:240px"></div>`
    ).join('');

    try {
        await fetchNFLSleeperPool();
        displayNFLPlayers();
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLPlayers, { tag: 'NFL', title: 'Failed to Load NFL Players' });
    }
}

function displayNFLPlayers() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';

    const pool = _nflPool || [];
    if (!pool.length) {
        ErrorHandler.renderEmptyState(grid, 'No NFL player data available', '🏈');
        return;
    }

    const filtered = _nflPosFilter === 'ALL'
        ? pool
        : pool.filter(p => p.fantasy_positions.includes(_nflPosFilter));
    const shown = filtered.slice(0, 120);

    const chip = (f) => {
        const active = f === _nflPosFilter;
        return `<button data-nfl-pos="${f}" style="padding:0.32rem 0.74rem;border-radius:var(--radius-full);
            border:1px solid ${active ? 'var(--accent)' : 'var(--border-default)'};
            background:${active ? 'var(--accent)' : 'transparent'};
            color:${active ? '#0b0b0d' : 'var(--text-secondary)'};
            font-weight:700;font-size:0.72rem;cursor:pointer">${f}</button>`;
    };
    const bar = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem;padding:0 0.25rem 0.85rem">
        ${_NFL_POS_FILTERS.map(chip).join('')}
        <span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted)">Top ${shown.length} by ADP</span>
    </div>`;

    const cards = document.createElement('div');
    cards.className = 'players-grid';
    shown.forEach(p => cards.appendChild(_createNFLPlayerCard(p)));

    grid.innerHTML = bar;
    grid.appendChild(cards);

    grid.querySelectorAll('[data-nfl-pos]').forEach(btn => {
        btn.addEventListener('click', () => { _nflPosFilter = btn.dataset.nflPos; sessionStorage.setItem('ss_nfl_pos_filter', _nflPosFilter); displayNFLPlayers(); });
    });
}

function _createNFLPlayerCard(p) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.style.cursor = 'pointer';
    card.onclick = () => navigateTo('nfl-player-' + p.player_id);

    const pos      = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
    const posColor = _NFL_POS_COLOR[pos] || 'var(--accent)';
    card.style.borderTop = `3px solid ${_nflAlpha(posColor, 80)}`;

    const initials = (p.full_name || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const headshot = getNFLSleeperHeadshot(p.player_id);
    const inches   = parseInt(p.height, 10);
    const htStr    = (!isNaN(inches) && inches > 0) ? `${Math.floor(inches / 12)}'${inches % 12}"` : (p.height || '—');

    const rows = [
        ['POS',     pos || '—'],
        ['TEAM',    p.team || 'FA'],
        ['AGE',     p.age != null ? p.age : '—'],
        ['EXP',     p.years_exp != null ? (p.years_exp === 0 ? 'Rookie' : `${p.years_exp} yr`) : '—'],
        ['HT / WT', `${htStr}${p.weight ? ' · ' + p.weight : ''}`],
        ['COLLEGE', p.college || '—'],
    ].map(([l, v]) =>
        `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${_escHtml(String(v))}</span></div>`
    ).join('');

    const rankBadge = `<span class="player-rank-badge ${p._adp <= 12 ? 'player-rank-badge--top' : ''}">#${p._adp} ADP</span>`;
    const inj = p.injury_status
        ? `<div class="player-team" style="color:var(--color-loss);font-size:0.68rem">${_escHtml(p.injury_status)}</div>`
        : '';

    card.innerHTML = `
        <div class="player-card-top">
            ${rankBadge}
            <div class="player-avatar nfl-pos-grad" style="--pc:${posColor}">
                ${headshot ? `<img class="player-headshot" src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}
                ${initials}
            </div>
            <div class="player-name">${_escHtml(p.full_name)}</div>
            <div class="player-team">${p.team ? _escHtml(p.team) + ' · ' : ''}${_escHtml(pos)}${p.number ? ' · #' + p.number : ''}</div>
            ${inj}
        </div>
        <div class="player-details">${rows}</div>
        <div class="card-cta">VIEW PROFILE →</div>
    `;
    return card;
}

// ── Display: Trending (fantasy add/drop — reuses leaderboard panel) ──
async function loadNFLLeaderboards() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-leaders', null);

    grid.innerHTML = Array.from({ length: 2 }, () =>
        `<div class="skeleton-card" style="min-height:360px"></div>`
    ).join('');

    try {
        await fetchNFLSleeperPool();
        const [adds, drops] = await Promise.all([
            fetch('/api/sleeper?path=/v1/players/nfl/trending/add').then(r => r.json()),
            fetch('/api/sleeper?path=/v1/players/nfl/trending/drop').then(r => r.json()),
        ]);
        displayNFLTrending(adds, drops);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLLeaderboards, { tag: 'NFL', title: 'Failed to Load NFL Trending' });
    }
}

function displayNFLTrending(adds, drops) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    grid.innerHTML = '';

    const panel = (title, icon, list, accent) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'padding:0;overflow:hidden';
        const items = (list || []).slice(0, 12);
        const rows = items.map((e, i) => {
            const p    = _nflPoolMap?.[e.player_id];
            const name = p ? p.full_name : 'Unknown player';
            const meta = p ? `${p.team || 'FA'}${p.position ? ' · ' + p.position : ''}` : '';
            const hs   = getNFLSleeperHeadshot(e.player_id);
            const clickAttr = p ? ` onclick="navigateTo('nfl-player-${e.player_id}')"` : '';
            return `
            <div${clickAttr} class="nfl-lrow${p ? ' nfl-lrow--link' : ''}">
                <span class="nfl-lrow-rank">${i + 1}</span>
                <div class="nfl-lrow-av"><img src="${hs || ''}" alt="" loading="lazy" data-hide-on-error></div>
                <div class="nfl-lrow-main">
                    <div class="nfl-lrow-name">${_escHtml(name)}</div>
                    <div class="nfl-lrow-meta">${_escHtml(meta)}</div>
                </div>
                <span class="nfl-lrow-val" style="color:${accent}">${Number(e.count || 0).toLocaleString()}</span>
            </div>`;
        }).join('');
        card.innerHTML = `
            <div class="nfl-card-head" style="gap:0.4rem">
                <span>${icon}</span> ${title}
            </div>
            ${rows || '<div style="padding:1rem;color:var(--text-muted);text-align:center;font-size:0.82rem">No trending data</div>'}`;
        return card;
    };

    const note = document.createElement('div');
    note.style.cssText = 'grid-column:1/-1;font-size:0.74rem;color:var(--text-muted);padding:0 0.25rem 0.4rem';
    note.textContent = 'Most-added and most-dropped players across fantasy leagues in the last 24 hours. Source: Sleeper.';

    grid.appendChild(note);
    grid.appendChild(panel('Trending Adds', '📈', adds, 'var(--color-win)'));
    grid.appendChild(panel('Trending Drops', '📉', drops, 'var(--color-loss)'));
}

// ── Ticker ────────────────────────────────────────────────────

function updateNFLTicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) return;

    const scored = (games || []).filter(g => g.isFinal || g.isLive || g.homeTeam.score > 0 || g.awayTeam.score > 0);

    if (!scored.length) {
        ticker.innerHTML = `<div class="ticker__item">No NFL scores — season runs Sep–Feb</div>`;
        return;
    }

    const items = [...scored, ...scored].map(g => {
        const pillCls = g.isFinal ? 'final' : g.isLive ? 'live' : 'sched';
        const pillLbl = g.isFinal ? 'F' : g.isLive ? (g.clock || 'LIVE') : 'SCH';
        return `
            <div class="ticker__item" data-game-id="${g.id}" data-sport="nfl" style="cursor:pointer">
                <img class="ticker-logo" src="${g.awayTeam.logo}" alt="" loading="lazy" data-hide-on-error>
                <span class="ticker-team">${_escHtml(g.awayTeam.abbr)}</span>
                <span class="ticker-score ${g.awayTeam.winner && g.isFinal ? 'ticker-score--win' : ''}">${g.awayTeam.score}</span>
                <span class="ticker-divider">–</span>
                <span class="ticker-score ${g.homeTeam.winner && g.isFinal ? 'ticker-score--win' : ''}">${g.homeTeam.score}</span>
                <span class="ticker-team">${_escHtml(g.homeTeam.abbr)}</span>
                <img class="ticker-logo" src="${g.homeTeam.logo}" alt="" loading="lazy" data-hide-on-error>
                <span class="ticker-status-pill ticker-status-pill--${pillCls}">${_escHtml(pillLbl)}</span>
            </div>
        `;
    }).join('');

    ticker.innerHTML = items;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = ticker.scrollWidth;
        if (w > 0) ticker.style.animationDuration = Math.max(15, Math.round(w / 2 / 60)) + 's';
    }));
}

// ── Display: Stat Leaders (real season stats via /api/nflstats) ──
const _NFL_STAT_COLORS = ['var(--nfl-cat-1)','var(--nfl-cat-2)','var(--nfl-cat-3)','var(--nfl-cat-4)','var(--nfl-cat-5)','var(--nfl-cat-6)','var(--nfl-cat-7)','var(--nfl-cat-8)','var(--nfl-cat-9)'];

let _nflLeaderSeason = null;  // null = current season (server auto-detects)

async function loadNFLStatLeaders() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-leaders', null);

    grid.innerHTML = Array.from({ length: 6 }, () =>
        `<div class="skeleton-card" style="min-height:260px"></div>`
    ).join('');

    try {
        const qs = _nflLeaderSeason ? `?season=${_nflLeaderSeason}` : '';
        const cacheKey = `nfl:statleaders:${_nflLeaderSeason || 'cur'}`;
        let data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch('/api/nflstats' + qs);
            if (!res.ok) throw new Error(`Stat leaders ${res.status}`);
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
        if (!data.categories || !data.categories.length) {
            ErrorHandler.renderEmptyState(grid, 'Stat leaders are unavailable right now.', '🏈');
            return;
        }
        try { await fetchNFLSleeperPool(); } catch (_) {}
        displayNFLStatLeaders(data);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLStatLeaders, { tag: 'NFL', title: 'Failed to Load NFL Leaders' });
    }
}

function displayNFLStatLeaders(data) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    grid.innerHTML = '';

    const bar = document.createElement('div');
    bar.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;padding:0 0.25rem 0.6rem';
    let opts = '';
    for (let y = NFL_STATS_SEASON; y >= NFL_LEADERS_MIN_SEASON; y--) opts += `<option value="${y}" ${y === data.season ? 'selected' : ''}>${y}</option>`;
    bar.innerHTML = `
        <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.78rem;color:var(--text-secondary);font-weight:700">
            Season
            <select id="nflLeaderSeason" style="background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-default);border-radius:var(--radius-sm,6px);padding:0.3rem 0.5rem;font-weight:700;cursor:pointer">${opts}</select>
        </label>
        <span style="font-size:0.74rem;color:var(--text-muted)">${data.season} regular-season leaders · Source: ESPN</span>`;
    grid.appendChild(bar);
    bar.querySelector('#nflLeaderSeason').addEventListener('change', e => { _nflLeaderSeason = e.target.value; loadNFLStatLeaders(); });

    const _nflLeaderNrm = x => (x || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
    const _nflLeaderNameIdx = {}; (_nflPool || []).forEach(pl => { _nflLeaderNameIdx[_nflLeaderNrm(pl.full_name)] = pl.player_id; });

    data.categories.forEach((cat, ci) => {
        const color = _NFL_STAT_COLORS[ci % _NFL_STAT_COLORS.length];
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = `padding:0;overflow:hidden;border-left:3px solid ${color}`;
        const rows = cat.leaders.map((l, i) => {
            const _sid = _nflLeaderNameIdx[_nflLeaderNrm(l.name)];
            const _clk = _sid ? ` onclick="navigateTo('nfl-player-${_sid}')"` : '';
            return `
            <div${_clk} class="nfl-lrow${_sid ? ' nfl-lrow--link' : ''}">
                <span class="nfl-lrow-rank">${i + 1}</span>
                <div class="nfl-lrow-av"><img src="${l.headshot}" alt="" loading="lazy" data-hide-on-error></div>
                <div class="nfl-lrow-main">
                    <div class="nfl-lrow-name">${_escHtml(l.name)}</div>
                    <div class="nfl-lrow-meta">${_escHtml(l.team)}${l.pos ? ' · ' + _escHtml(l.pos) : ''}</div>
                </div>
                <span class="nfl-lrow-val" style="color:${color}">${_escHtml(String(l.value))}</span>
            </div>`;
        }).join('');
        card.innerHTML = `
            <div class="nfl-card-head" style="justify-content:space-between">
                <span>${_escHtml(cat.label)}</span><span style="color:${color};font-size:0.64rem">${_escHtml(cat.unit)}</span>
            </div>
            ${rows}`;
        grid.appendChild(card);
    });
}

// ── Team abbr alias: ESPN → Sleeper (Washington + legacy Oakland differ) ──
function _nflSleeperAbbr(abbr) {
    return ({ WSH: 'WAS', OAK: 'LV' })[abbr] || abbr;
}

// ── Player detail (reuses the .player-detail-* component) ─────
async function showNFLPlayerDetail(id) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'player-detail-container';
    grid.style.cssText = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:320px"></div>`;
    if (window.setBreadcrumb) setBreadcrumb('nfl-player', null);
    try {
        await fetchNFLSleeperPool();
    } catch (err) {
        ErrorHandler.handle(grid, err, () => showNFLPlayerDetail(id), { tag: 'NFL', title: 'Failed to Load Player' });
        return;
    }
    const p = _nflPoolMap && _nflPoolMap[id];
    if (!p) { ErrorHandler.renderEmptyState(grid, 'Player not found', '🏈'); return; }
    _renderNFLPlayerDetail(p);
}

function _renderNFLPlayerDetail(p) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'player-detail-container';
    grid.style.cssText = '';

    const pos      = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
    const posColor = _NFL_POS_COLOR[pos] || 'var(--accent)';
    const headshot = getNFLSleeperHeadshot(p.player_id);
    const initials = (p.full_name || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const inches   = parseInt(p.height, 10);
    const htStr    = (!isNaN(inches) && inches > 0) ? `${Math.floor(inches / 12)}'${inches % 12}"` : (p.height || '—');
    const teamLogo = p.team ? getNFLTeamLogoUrl(p.team) : null;
    const headshotImg = headshot ? `<img class="player-headshot" src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : '';

    const bio = [
        ['Age',         p.age != null ? p.age : '—'],
        ['Experience',  p.years_exp != null ? (p.years_exp === 0 ? 'Rookie' : `${p.years_exp} yr`) : '—'],
        ['Height',      htStr],
        ['Weight',      p.weight ? p.weight + ' lb' : '—'],
        ['College',     p.college || '—'],
        ['Jersey',      p.number ? '#' + p.number : '—'],
        ['Depth Chart', p.depth_chart_order ? `${p.depth_chart_position || pos} ${p.depth_chart_order}` : '—'],
        ['Status',      p.injury_status || p.status || '—'],
    ].map(([l, v]) =>
        `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${_escHtml(String(v))}</span></div>`
    ).join('');

    const adpBadge = p._adp ? `<span class="player-hero-pos" style="background:${posColor};color:#0b0b0d">#${p._adp} ADP</span>` : '';
    const teamBtn = p.team
        ? `<button onclick="navigateTo('nfl-team-${_escHtml(p.team)}')" style="background:none;border:none;padding:0;color:var(--text-secondary);cursor:pointer;font-size:inherit;font-family:inherit;text-decoration:underline;text-underline-offset:3px">${_escHtml(p.team)}</button>`
        : '<span style="color:var(--text-secondary)">Free Agent</span>';

    const _exp = (typeof p.years_exp === 'number') ? p.years_exp : 1;
    const _rookieSeason = Math.max(2000, NFL_STATS_SEASON - Math.max(0, _exp - 1));
    let _seasonOpts = '';
    for (let _y = NFL_STATS_SEASON; _y >= _rookieSeason; _y--) _seasonOpts += `<option value="${_y}" ${_y === NFL_STATS_SEASON ? 'selected' : ''}>${_y}</option>`;

    grid.innerHTML = `
        <div class="player-detail-header">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <button onclick="navigateTo('nfl-players')" class="back-button">← Players</button>
                <button class="share-btn" onclick="window._shareCurrentPage && window._shareCurrentPage()" title="Copy link">Share</button>
            </div>
            <div class="player-hero">
                <div class="player-detail-avatar nfl-hero-avatar" style="--pc:${posColor}">
                    ${headshotImg}${initials}
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${_escHtml(p.full_name)}</h1>
                        <span class="player-hero-pos" style="background:${_nflAlpha(posColor, 20)};color:${posColor}">${_escHtml(pos)}</span>
                        ${adpBadge}
                    </div>
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.2rem">
                        ${teamLogo ? `<img src="${teamLogo}" alt="" style="width:24px;height:24px;object-fit:contain" loading="lazy" data-hide-on-error>` : ''}
                        ${teamBtn}
                    </div>
                    <p class="player-detail-meta" style="color:var(--text-muted)">${NFL_FANTASY_SEASON} NFL Season · Fantasy profile</p>
                </div>
            </div>
        </div>

        <div class="stats-card">
            <h2 class="detail-section-title">Player Profile</h2>
            <div class="player-details" style="max-width:520px">${bio}</div>
        </div>

        <div style="display:flex;align-items:center;gap:0.5rem;margin:0.1rem 0 0.55rem">
            <span style="font-size:0.74rem;font-weight:700;color:var(--text-secondary)">Stats season</span>
            <select onchange="_nflChangeDetailSeason(this.value)" style="background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-default);border-radius:var(--radius-sm,6px);padding:0.3rem 0.5rem;font-weight:700;cursor:pointer">${_seasonOpts}</select>
        </div>
        <div id="nfl-advanced"></div>
        <div id="nfl-stat-line"></div>
        <div id="nfl-gamelog"></div>
        <div id="nfl-career"></div>

        <div class="stats-card">
            <h2 class="detail-section-title">Fantasy Outlook</h2>
            <p style="color:var(--text-secondary);font-size:0.88rem;line-height:1.6;margin:0">
                ${_escHtml(p.full_name)} enters ${NFL_FANTASY_SEASON} ${p._adp ? `as the <strong>#${p._adp}</strong> player off the board by Sleeper ADP` : 'as an undrafted-tier option'}${p.fantasy_positions && p.fantasy_positions.length ? `, eligible at <strong>${_escHtml(p.fantasy_positions.join(', '))}</strong>` : ''}.${p.depth_chart_order === 1 ? ' Currently atop the depth chart.' : p.depth_chart_order ? ` Listed ${_escHtml((p.depth_chart_position || pos) + ' ' + p.depth_chart_order)} on the depth chart.` : ''}${p.injury_status ? ` <span style="color:var(--color-loss)">Injury watch: ${_escHtml(p.injury_status)}.</span>` : ''}
            </p>
            <p style="color:var(--text-muted);font-size:0.78rem;margin:0.75rem 0 0">Fantasy/ADP and depth chart via Sleeper; season stats via ESPN.</p>
        </div>
    `;

    _nflDetailPlayer = p;
    _nflEspnId = null;
    _nflDetailSeason = NFL_STATS_SEASON;
    _nflCareerEspnId = null;
    _loadNFLPlayerStats(p, NFL_STATS_SEASON);
    _loadNFLAdvanced(p, NFL_STATS_SEASON);
}

let _nflDetailPlayer = null, _nflDetailSeason = null, _nflCareerEspnId = null, _nflEspnId = null, _nflEspnSeason = null;
// Player-detail season switch — drives the stats / game log / advanced cards.
function _nflChangeDetailSeason(season) {
    season = String(season);
    _nflDetailSeason = season;
    const _sel = document.querySelector('#playersGrid select[onchange*="_nflChangeDetailSeason"]');
    if (_sel && String(_sel.value) !== season) _sel.value = season;
    ['nfl-advanced', 'nfl-stat-line', 'nfl-gamelog'].forEach(id => { const e = document.getElementById(id); if (e) { e.className = ''; e.innerHTML = ''; } });
    if (_nflDetailPlayer) { _loadNFLPlayerStats(_nflDetailPlayer, season); _loadNFLAdvanced(_nflDetailPlayer, season); }
}

// Career year-by-year table (ESPN /api/nflcareer) — season-independent.
async function _loadNFLCareer(espnId) {
    if (!espnId) return;
    const host = document.getElementById('nfl-career');
    if (!host) return;
    try {
        const cacheKey = `nfl:career:${espnId}`;
        let data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/nflcareer?id=${encodeURIComponent(espnId)}`);
            if (!res.ok) return;
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
        if (!data.found || !data.categories || !data.categories.length) return;
        if (!document.body.contains(host)) return;

        const tables = data.categories.map(c => {
            const head = `<th style="text-align:left;position:sticky;left:0;background:var(--bg-elevated)">SZN</th><th style="text-align:left">TM</th>` +
                (c.labels || []).map(l => `<th>${_escHtml(l)}</th>`).join('');
            const rows = (c.seasons || []).map(sn => `<tr onclick="_nflCareerRowClick('${sn.year}')" style="cursor:pointer">
                <td style="font-weight:700;position:sticky;left:0;background:var(--bg-card)">${_escHtml(String(sn.year || ''))}</td>
                <td style="color:var(--text-muted)">${_escHtml(sn.team || '')}</td>
                ${(sn.stats || []).map(v => `<td style="text-align:center">${_escHtml(String(v))}</td>`).join('')}
            </tr>`).join('');
            const totals = `<tr style="border-top:2px solid var(--border-mid);font-weight:800">
                <td style="position:sticky;left:0;background:var(--bg-card)">Career</td><td></td>
                ${(c.totals || []).map(v => `<td style="text-align:center">${_escHtml(String(v))}</td>`).join('')}
            </tr>`;
            return `<div style="margin-bottom:1rem">
                <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:var(--accent);margin:0 0 0.35rem">${_escHtml(c.displayName)}</div>
                <div class="table-wrapper" style="overflow-x:auto"><table class="stats-table" style="min-width:max-content;white-space:nowrap"><thead><tr>${head}</tr></thead><tbody>${rows}${totals}</tbody></table></div>
            </div>`;
        }).join('');

        host.className = 'stats-card';
        host.innerHTML = `<h2 class="detail-section-title">Career</h2>${tables}<p style="color:var(--text-muted);font-size:0.72rem;margin:0.3rem 0 0">Regular season · tap a row to load that season above · Source: ESPN.</p>`;
    } catch (e) { Logger.warn('NFL career load failed', e, 'NFL'); }
}

const _NFL_STAT_GROUP_COLOR = { passing:'var(--nfl-stat-passing)', rushing:'var(--nfl-stat-rushing)', receiving:'var(--nfl-stat-receiving)', defense:'var(--nfl-stat-defense)', kicking:'var(--nfl-stat-kicking)' };

// Explicit placeholder when the Sleeper->ESPN name match yields no stats, so a
// real player never shows a blank stat area with no explanation (N-1).
function _nflStatsUnavailable(host, name) {
    if (!host || !document.body.contains(host)) return;
    host.className = 'stats-card';
    host.innerHTML = `<h2 class="detail-section-title">Season Stats</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0;line-height:1.5">Season stats aren't available for ${_escHtml(name || 'this player')} right now — we couldn't match this player to a stats source. This is common for free agents and recent roster moves.</p>`;
}

// Season stat line on the player-detail page. Sleeper has no game stats, so we
// bridge to ESPN via /api/nflplayer (team roster name-match -> athlete stats).
async function _loadNFLPlayerStats(p, season) {
    season = season || NFL_STATS_SEASON;
    const host = document.getElementById('nfl-stat-line');
    if (!host) return;
    if (!p || !p.team) { _nflStatsUnavailable(host, p && p.full_name); return; }
    try {
        const cacheKey = `nfl:pstats2:${p.player_id}:${season}`;
        let data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/nflplayer?name=${encodeURIComponent(p.full_name)}&team=${encodeURIComponent(p.team)}&season=${season}`);
            if (!res.ok) { Logger.warn('NFL player stats fetch ' + res.status, null, 'NFL'); _nflStatsUnavailable(host, p.full_name); return; }
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
        if (data.espnId) _loadNFLGameLog(data.espnId, season);
        if (data.espnId && _nflCareerEspnId !== data.espnId) { _nflCareerEspnId = data.espnId; _loadNFLCareer(data.espnId); }
        if (!data.found || !data.groups || !data.groups.length) { _nflStatsUnavailable(host, p.full_name); return; }
        if (!document.body.contains(host)) return;  // user navigated away

        const groupsHtml = data.groups.map(g => {
            const color = _NFL_STAT_GROUP_COLOR[g.key] || 'var(--accent)';
            const chips = g.stats.map(([l, v]) =>
                `<div style="text-align:center;min-width:54px">
                    <div style="font-size:1.05rem;font-weight:800;color:var(--text-primary)">${_escHtml(String(v))}</div>
                    <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.5px;color:var(--text-muted)">${_escHtml(l)}</div>
                </div>`).join('');
            return `<div style="margin-bottom:0.9rem">
                <div style="font-size:0.68rem;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;color:${color};margin-bottom:0.4rem">${_escHtml(g.label)}</div>
                <div style="display:flex;flex-wrap:wrap;gap:0.6rem 1.1rem">${chips}</div>
            </div>`;
        }).join('');

        host.className = 'stats-card';
        host.innerHTML = `
            <h2 class="detail-section-title">${data.season} Season Stats${data.gp ? ` · ${_escHtml(String(data.gp))} GP` : ''}</h2>
            ${groupsHtml}
            <p style="color:var(--text-muted);font-size:0.72rem;margin:0.25rem 0 0">Source: ESPN.</p>
        `;
    } catch (e) { Logger.warn('NFL player stats load failed', e, 'NFL'); _nflStatsUnavailable(host, p.full_name); }
}

// Game-by-game log on the player-detail page (ESPN, via the resolved athlete id).
async function _loadNFLGameLog(espnId, season) {
    if (!espnId) return;
    const host = document.getElementById('nfl-gamelog');
    if (!host) return;
    try {
        const cacheKey = `nfl:gamelog:${espnId}:${season}`;
        let data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/nflgamelog?id=${encodeURIComponent(espnId)}&season=${encodeURIComponent(season)}`);
            if (!res.ok) return;
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
        if (!data.found || !data.games || !data.games.length) return;
        if (!document.body.contains(host)) return;

        const cols = data.columns || [];
        const head = `<th style="text-align:left;position:sticky;left:0;background:var(--bg-elevated)">WK</th>` +
            `<th style="text-align:left">OPP</th><th>RES</th>` +
            cols.map(c => `<th title="${_escHtml(c.full)}">${_escHtml(c.label)}</th>`).join('');
        const rows = data.games.map(gm => {
            const resColor = gm.res === 'W' ? 'var(--color-win)' : gm.res === 'L' ? 'var(--color-loss)' : 'var(--text-muted)';
            const wk = gm.post ? 'P' : (gm.wk != null ? gm.wk : '');
            const statTds = (gm.stats || []).map(v => `<td style="text-align:center">${_escHtml(String(v))}</td>`).join('');
            return `<tr>
                <td style="font-weight:700;position:sticky;left:0;background:var(--bg-card)">${_escHtml(String(wk))}</td>
                <td style="white-space:nowrap">${gm.atVs === '@' ? '@' : 'vs'} <strong>${_escHtml(gm.opp)}</strong></td>
                <td style="text-align:center;white-space:nowrap"><span style="color:${resColor};font-weight:800">${_escHtml(gm.res)}</span> <span style="color:var(--text-muted);font-size:0.7rem">${_escHtml(gm.score)}</span></td>
                ${statTds}
            </tr>`;
        }).join('');

        host.className = 'stats-card';
        host.innerHTML = `
            <h2 class="detail-section-title">${data.season} Game Log</h2>
            <div id="nfl-gl-chart-wrap" style="position:relative;height:200px;margin:0 0 0.9rem"><canvas id="nfl-gl-chart"></canvas></div>
            <div class="table-wrapper" style="overflow-x:auto">
                <table class="stats-table" style="min-width:max-content;white-space:nowrap">
                    <thead><tr>${head}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <p style="color:var(--text-muted);font-size:0.72rem;margin:0.5rem 0 0">Game-by-game · Source: ESPN.</p>`;
        const _glChart = (window.StatsCharts && StatsCharts.nflGameTrend) ? StatsCharts.nflGameTrend('nfl-gl-chart', data.games, data.columns) : null;
        if (!_glChart) { const w = document.getElementById('nfl-gl-chart-wrap'); if (w) w.remove(); }
    } catch (e) { Logger.warn('NFL game log load failed', e, 'NFL'); }
}

const _NFL_NGS_LABEL = { receiving: 'receivers', passing: 'passers', rushing: 'rushers' };

// Advanced metrics card (Next Gen Stats via nflverse) with league percentile bars.
async function _loadNFLAdvanced(p, season) {
    if (!p || !p.full_name) return;
    season = season || NFL_STATS_SEASON;
    const host = document.getElementById('nfl-advanced');
    if (!host) return;
    const pos = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
    if (!['QB', 'RB', 'FB', 'WR', 'TE'].includes(pos)) return;  // NGS covers skill positions only
    try {
        const cacheKey = `nfl:adv:${p.player_id}:${season}`;
        let data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/nfladv?name=${encodeURIComponent(p.full_name)}&team=${encodeURIComponent(p.team || '')}&pos=${encodeURIComponent(pos)}&season=${season}`);
            if (!res.ok) return;
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
        if (!data.found || !data.metrics || !data.metrics.length) return;
        if (!document.body.contains(host)) return;

        const fmt = v => { const n = +v; if (!isFinite(n)) return '—'; return Number.isInteger(n) ? String(n) : n.toFixed(1); };
        const barColor = pct => pct == null ? 'var(--border-mid)' : pct >= 80 ? '#ef4444' : pct >= 60 ? '#f59e0b' : pct >= 40 ? '#64748b' : '#3b82f6';
        const rows = data.metrics.map(m => {
            const ord = n => (n % 10 === 1 && n % 100 !== 11) ? 'st' : (n % 10 === 2 && n % 100 !== 12) ? 'nd' : (n % 10 === 3 && n % 100 !== 13) ? 'rd' : 'th';
            const pctTxt = m.pct != null ? ` <span style="color:var(--text-muted);font-weight:700">· ${m.pct}<span style="font-size:0.6rem">${ord(m.pct)}</span></span>` : '';
            return `<div style="margin-bottom:0.55rem">
                <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:0.8rem;margin-bottom:0.25rem">
                    <span style="color:var(--text-secondary);font-weight:600">${_escHtml(m.label)}</span>
                    <span style="font-weight:800;color:var(--text-primary)">${_escHtml(fmt(m.value))}${m.unit ? '<span style="color:var(--text-muted);font-size:0.7rem">' + _escHtml(m.unit) + '</span>' : ''}${pctTxt}</span>
                </div>
                <div style="height:7px;border-radius:4px;background:var(--bg-subtle);overflow:hidden">
                    ${m.pct != null ? `<div style="height:100%;width:${m.pct}%;background:${barColor(m.pct)};border-radius:4px"></div>` : ''}
                </div>
            </div>`;
        }).join('');

        host.className = 'stats-card';
        host.innerHTML = `
            <h2 class="detail-section-title">Advanced · Next Gen Stats</h2>
            <div style="max-width:560px">${rows}</div>
            <p style="color:var(--text-muted);font-size:0.72rem;margin:0.4rem 0 0">${data.season} · percentile vs qualified ${_escHtml(_NFL_NGS_LABEL[data.type] || data.type)} (n=${data.qualifiedPlayers}) · Data via nflverse Next Gen Stats (CC-BY)</p>`;
    } catch (e) { Logger.warn('NFL advanced stats load failed', e, 'NFL'); }
}

// ── Team detail (header + roster grouped by position) ─────────
const _NFL_ROSTER_GROUPS = [
    ['Offense',       ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'OT', 'G', 'C']],
    ['Defense',       ['DL', 'DE', 'DT', 'NT', 'LB', 'DB', 'CB', 'S']],
    ['Special Teams', ['K', 'P', 'LS']],
];

async function showNFLTeamDetail(abbr) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:360px"></div>`;
    if (window.setBreadcrumb) setBreadcrumb('nfl-team', null);
    try {
        if (!AppState.nflTeams.length) AppState.nflTeams = await fetchNFLTeams();
        await fetchNFLSleeperPool();
        if (!AppState.nflGames || !AppState.nflGames.length) { try { AppState.nflGames = await fetchNFLScoreboard(); } catch (_) {} }
    } catch (err) {
        ErrorHandler.handle(grid, err, () => showNFLTeamDetail(abbr), { tag: 'NFL', title: 'Failed to Load Team' });
        return;
    }
    _renderNFLTeamDetail(abbr);
}

function _renderNFLTeamDetail(abbr) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';

    const team = (AppState.nflTeams || []).find(t => t.abbr === abbr)
        || { abbr, name: abbr, logo: getNFLTeamLogoUrl(abbr), color: '#334155', record: '' };
    const sAbbr  = _nflSleeperAbbr(abbr);
    const roster = Object.values(_nflPoolMap || {})
        .filter(p => p && p.active && p.team === sAbbr && p.position && p.position !== 'DEF');

    let oppHtml = '';
    const g = (AppState.nflGames || []).find(x => x.homeTeam.abbr === abbr || x.awayTeam.abbr === abbr);
    if (g) {
        const home = g.homeTeam.abbr === abbr;
        const opp  = home ? g.awayTeam : g.homeTeam;
        let dateStr = '';
        try { dateStr = new Date(g.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (_) {}
        oppHtml = `<div style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--text-secondary)">
            <span style="color:var(--text-muted)">Next:</span> ${home ? 'vs' : '@'}
            <img src="${getNFLTeamLogoUrl(opp.abbr)}" alt="" style="width:18px;height:18px;object-fit:contain" loading="lazy" data-hide-on-error>
            <strong>${_escHtml(opp.abbr)}</strong>${dateStr ? ' · ' + dateStr : ''}</div>`;
    }

    const sortFn = (a, b) =>
        (a.depth_chart_order || 99) - (b.depth_chart_order || 99) ||
        (a.search_rank || 1e9) - (b.search_rank || 1e9) ||
        (a.full_name || '').localeCompare(b.full_name || '');

    const groupsHtml = _NFL_ROSTER_GROUPS.map(([label, positions]) => {
        const players = roster.filter(p => positions.includes(p.position)).sort(sortFn);
        if (!players.length) return '';
        const rows = players.map(p => {
            const hs = getNFLSleeperHeadshot(p.player_id);
            return `<button onclick="navigateTo('nfl-player-${p.player_id}')" style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0.6rem;background:none;border:none;border-bottom:1px solid var(--border-subtle);width:100%;text-align:left;cursor:pointer">
                <div style="width:26px;height:26px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--bg-subtle);border:1px solid var(--border-subtle)">
                    <img src="${hs}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" data-hide-on-error>
                </div>
                <span style="flex:1;min-width:0;font-weight:600;font-size:0.82rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(p.full_name)}</span>
                <span style="font-size:0.68rem;font-weight:700;color:var(--text-muted)">${_escHtml(p.position)}${p.number ? ' · #' + p.number : ''}</span>
            </button>`;
        }).join('');
        return `<div style="margin-bottom:1.25rem">
            <h3 style="font-size:0.74rem;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;color:var(--accent);margin:0 0 0.5rem;padding-bottom:0.3rem;border-bottom:2px solid var(--border-mid)">${label} <span style="color:var(--text-subtle)">(${players.length})</span></h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.15rem 1rem">${rows}</div>
        </div>`;
    }).join('');

    grid.innerHTML = `
        <div style="max-width:1000px;margin:0 auto">
            <div class="player-detail-header" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
                <button onclick="navigateTo('nfl-teams')" class="back-button">← Teams</button>
                ${oppHtml}
            </div>
            <div style="display:flex;align-items:center;gap:1rem;margin:1rem 0 1.5rem;padding-bottom:1.25rem;border-bottom:1px solid var(--border-default)">
                <img src="${team.logo}" alt="${_escHtml(team.name)}" style="width:64px;height:64px;object-fit:contain" loading="lazy" data-hide-on-error>
                <div>
                    <h1 class="player-detail-name" style="margin:0">${_escHtml(team.name)}</h1>
                    <p style="margin:0.2rem 0 0;color:var(--text-muted);font-size:0.84rem">${_escHtml(team.abbr)}${team.record ? ' · ' + _escHtml(team.record) : ''} · ${roster.length} players</p>
                </div>
            </div>
            ${groupsHtml || '<p style="color:var(--text-muted);text-align:center;padding:2rem">Roster data unavailable.</p>'}
        </div>
    `;
}

// ── Display: Rankings (Sleeper ADP — overall + positional ranks + tiers) ──
let _nflRankPos = 'ALL';

async function loadNFLRankings() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-rankings', null);
    grid.innerHTML = `<div class="skeleton-card" style="min-height:420px"></div>`;
    try {
        await fetchNFLSleeperPool();
        displayNFLRankings();
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLRankings, { tag: 'NFL', title: 'Failed to Load NFL Rankings' });
    }
}

function displayNFLRankings() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';
    const pool = _nflPool || [];
    if (!pool.length) { ErrorHandler.renderEmptyState(grid, 'No NFL ranking data available', '🏈'); return; }

    const posCount = {};
    const ranked = pool.map((p, i) => {
        const pos = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
        posCount[pos] = (posCount[pos] || 0) + 1;
        return { p, overall: i + 1, pos, posRank: posCount[pos] };
    });
    const isAll = _nflRankPos === 'ALL';
    const filtered = isAll ? ranked : ranked.filter(r => r.pos === _nflRankPos || (r.p.fantasy_positions || []).includes(_nflRankPos));
    const shown = filtered.slice(0, 200);

    const chip = f => {
        const a = f === _nflRankPos;
        return `<button data-nfl-rank-pos="${f}" style="padding:0.32rem 0.74rem;border-radius:var(--radius-full);border:1px solid ${a ? 'var(--accent)' : 'var(--border-default)'};background:${a ? 'var(--accent)' : 'transparent'};color:${a ? '#0b0b0d' : 'var(--text-secondary)'};font-weight:700;font-size:0.72rem;cursor:pointer">${f}</button>`;
    };

    let html = `<div style="max-width:760px;margin:0 auto">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem;padding:0 0.25rem 0.85rem">
            ${['ALL', 'QB', 'RB', 'WR', 'TE', 'K'].map(chip).join('')}
            <span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted)">${NFL_FANTASY_SEASON} rankings · ADP via Sleeper</span>
        </div>`;

    let lastTier = null;
    shown.forEach(r => {
        const tier = isAll ? Math.ceil(r.overall / 12) : Math.ceil(r.posRank / 6);
        if (tier !== lastTier) {
            lastTier = tier;
            const label = isAll ? `Round ${tier}` : `${_escHtml(_nflRankPos)} Tier ${tier}`;
            html += `<div style="font-size:0.66rem;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;color:var(--accent);margin:0.9rem 0 0.35rem;padding-bottom:0.2rem;border-bottom:1px solid var(--border-mid)">${label}</div>`;
        }
        const pos = r.pos, pc = _NFL_POS_COLOR[pos] || 'var(--accent)';
        const hs = getNFLSleeperHeadshot(r.p.player_id);
        const rankNum = isAll ? r.overall : r.posRank;
        const posTag = (isAll && pos) ? `${_escHtml(pos)}${r.posRank}` : '';
        const inj = r.p.injury_status ? ` <span style="color:var(--color-loss);font-size:0.62rem;font-weight:700">${_escHtml(r.p.injury_status)}</span>` : '';
        html += `<div onclick="navigateTo('nfl-player-${r.p.player_id}')" style="display:flex;align-items:center;gap:0.7rem;padding:0.4rem 0.5rem;border-bottom:1px solid var(--border-subtle);cursor:pointer">
            <span style="width:28px;text-align:right;font-weight:800;font-size:0.95rem;color:var(--text-primary)">${rankNum}</span>
            <div style="width:30px;height:30px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--bg-subtle);border:1px solid var(--border-subtle)">
                <img src="${hs}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" data-hide-on-error>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:0.85rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(r.p.full_name)}${inj}</div>
                <div style="font-size:0.68rem;color:var(--text-muted)">${_escHtml(r.p.team || 'FA')}</div>
            </div>
            ${posTag ? `<span style="font-size:0.7rem;font-weight:800;color:${pc};min-width:38px;text-align:right">${posTag}</span>` : ''}
            <span style="font-size:0.72rem;color:var(--text-secondary);min-width:56px;text-align:right">ADP ${r.p._adp}</span>
        </div>`;
    });
    html += `</div>`;
    grid.innerHTML = html;
    grid.querySelectorAll('[data-nfl-rank-pos]').forEach(b => b.addEventListener('click', () => { _nflRankPos = b.dataset.nflRankPos; displayNFLRankings(); }));
}

// ── Player Compare (two-player side-by-side; reuses .cmp-* + /api/nflplayer) ──
const _NFL_CMP_A = '#ff8100';
const _NFL_CMP_B = '#60a5fa';

async function loadNFLCompare() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-compare', null);
    grid.innerHTML = `<div class="skeleton-card" style="min-height:300px"></div>`;
    try {
        await fetchNFLSleeperPool();
        _renderNFLCompareView();
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLCompare, { tag: 'NFL', title: 'Failed to Load Compare' });
    }
}

function _renderNFLCompareView() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';
    const top = (_nflPool || []).slice(0, 300);
    const opts = '<option value="">— Select player —</option>' +
        top.map(p => `<option value="${p.player_id}">${_escHtml(p.full_name)} · ${_escHtml(p.team || 'FA')} ${_escHtml(p.position || '')}</option>`).join('');
    grid.innerHTML = `
        <div class="cmp-page-wrap">
            <div class="cmp-page-hdr"><h1 class="cmp-page-title">Player Compare</h1></div>
            <div class="cmp-selects-row">
                <div class="cmp-player-slot"><label class="cmp-slot-label">Player A</label><select id="nfl-cmp-a" class="cmp-select">${opts}</select></div>
                <div class="cmp-vs-badge">VS</div>
                <div class="cmp-player-slot"><label class="cmp-slot-label">Player B</label><select id="nfl-cmp-b" class="cmp-select">${opts}</select></div>
            </div>
            <div id="nfl-cmp-results" class="cmp-results" style="display:none"></div>
        </div>`;
    const a = document.getElementById('nfl-cmp-a'), b = document.getElementById('nfl-cmp-b');
    a.addEventListener('change', _updateNFLCompare);
    b.addEventListener('change', _updateNFLCompare);
    const m = location.hash.replace('#', '').match(/^nfl-compare-([A-Za-z0-9]+)-([A-Za-z0-9]+)$/);
    if (m) { a.value = m[1]; b.value = m[2]; _updateNFLCompare(); }
}

async function _updateNFLCompare() {
    const selA = document.getElementById('nfl-cmp-a'), selB = document.getElementById('nfl-cmp-b');
    const results = document.getElementById('nfl-cmp-results');
    if (!selA || !selB || !results) return;
    const idA = selA.value, idB = selB.value;
    if (!idA || !idB || idA === idB) { results.style.display = 'none'; return; }
    const pA = _nflPoolMap && _nflPoolMap[idA], pB = _nflPoolMap && _nflPoolMap[idB];
    if (!pA || !pB) { results.style.display = 'none'; return; }
    history.replaceState(null, '', `#nfl-compare-${idA}-${idB}`);
    results.style.display = '';
    results.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:1.5rem">Loading…</div>`;

    const fetchStats = async p => {
        try { const r = await fetch(`/api/nflplayer?name=${encodeURIComponent(p.full_name)}&team=${encodeURIComponent(p.team || '')}`); return r.ok ? await r.json() : null; }
        catch { return null; }
    };
    const [dA, dB] = await Promise.all([fetchStats(pA), fetchStats(pB)]);
    if (!document.body.contains(results)) return;

    const flat = d => { const m = {}; (d && d.groups || []).forEach(g => g.stats.forEach(([l, v]) => { m[`${g.label} · ${l}`] = v; })); return m; };
    const mA = flat(dA), mB = flat(dB);
    const keys = [...Object.keys(mA), ...Object.keys(mB).filter(k => !(k in mA))];
    const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; };

    const headCard = (p, d, color) => `
        <div style="flex:1;text-align:center;min-width:0">
            <div style="width:54px;height:54px;border-radius:50%;overflow:hidden;margin:0 auto 0.4rem;border:2px solid ${color};background:var(--bg-subtle)"><img src="${getNFLSleeperHeadshot(p.player_id)}" alt="" style="width:100%;height:100%;object-fit:cover" data-hide-on-error></div>
            <div style="font-weight:800;font-size:0.9rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(p.full_name)}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">${_escHtml(p.team || 'FA')} · ${_escHtml(p.position || '')}${d && d.gp ? ' · ' + _escHtml(String(d.gp)) + ' GP' : ''}</div>
        </div>`;

    const rows = keys.map(k => {
        const va = mA[k], vb = mB[k], na = num(va), nb = num(vb);
        let barA = 50, barB = 50;
        if (na != null && nb != null && (na + nb) > 0) { barA = Math.round(na / (na + nb) * 100); barB = 100 - barA; }
        const aWin = na != null && nb != null && na > nb, bWin = nb != null && na != null && nb > na;
        return `<div style="display:grid;grid-template-columns:1fr 2fr 1fr;align-items:center;gap:0.6rem;padding:0.35rem 0;border-bottom:1px solid var(--border-subtle)">
            <span style="text-align:right;font-weight:${aWin ? '800' : '600'};color:${aWin ? 'var(--text-primary)' : 'var(--text-secondary)'};font-size:0.84rem">${va != null ? _escHtml(String(va)) : '—'}</span>
            <div style="min-width:0">
                <div style="font-size:0.62rem;text-align:center;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px">${_escHtml(k.split(' · ')[1])}</div>
                <div style="display:flex;height:7px;border-radius:4px;overflow:hidden;background:var(--bg-subtle)"><div style="width:${barA}%;background:${_NFL_CMP_A}"></div><div style="width:${barB}%;background:${_NFL_CMP_B}"></div></div>
            </div>
            <span style="text-align:left;font-weight:${bWin ? '800' : '600'};color:${bWin ? 'var(--text-primary)' : 'var(--text-secondary)'};font-size:0.84rem">${vb != null ? _escHtml(String(vb)) : '—'}</span>
        </div>`;
    }).join('');

    results.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:0.5rem;margin-bottom:0.8rem">${headCard(pA, dA, _NFL_CMP_A)}<div style="align-self:center;font-weight:900;color:var(--text-muted);font-size:0.8rem">VS</div>${headCard(pB, dB, _NFL_CMP_B)}</div>
        ${keys.length ? rows : '<p style="text-align:center;color:var(--text-muted);padding:1rem">No season stats to compare for these players.</p>'}
        <p style="color:var(--text-muted);font-size:0.7rem;margin:0.7rem 0 0;text-align:center">${NFL_STATS_SEASON} season · bar = share of each stat · Source: ESPN</p>`;
}

// Career-row click dispatcher — works on the Sleeper detail and the all-time (ESPN) detail.
function _nflCareerRowClick(year) {
    if (_nflEspnId) _nflEspnSetSeason(year);
    else _nflChangeDetailSeason(year);
}

function _nflEspnSetSeason(season) {
    _nflEspnSeason = String(season);
    const sel = document.querySelector('#playersGrid select[onchange*="_nflEspnSetSeason"]');
    if (sel && String(sel.value) !== String(season)) sel.value = season;
    const g = document.getElementById('nfl-gamelog'); if (g) { g.className = ''; g.innerHTML = ''; }
    if (_nflEspnId) _loadNFLGameLog(_nflEspnId, season);
}

// All-time player detail (any current or retired player, keyed by ESPN athlete id).
async function showNFLEspnPlayer(espnId) {
    espnId = String(espnId).replace(/[^0-9]/g, '');
    const grid = document.getElementById('playersGrid');
    grid.className = 'player-detail-container';
    grid.style.cssText = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:320px"></div>`;
    if (window.setBreadcrumb) setBreadcrumb('nfl-player', null);
    _nflDetailPlayer = null;
    _nflEspnId = espnId;

    let prof = {}, career = null;
    try {
        const [pr, cr] = await Promise.all([
            fetch(`/api/nflathlete?id=${espnId}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/nflcareer?id=${espnId}`).then(r => r.ok ? r.json() : null),
        ]);
        prof = pr || {}; career = cr;
    } catch (_) {}
    if (!prof.found) { ErrorHandler.renderEmptyState(grid, 'Player not found', '🏈'); return; }

    const years = [];
    (career && career.categories || []).forEach(c => (c.seasons || []).forEach(sn => { if (sn.year && years.indexOf(sn.year) < 0) years.push(sn.year); }));
    years.sort((a, b) => b - a);
    _nflEspnSeason = years[0] || NFL_STATS_SEASON;

    const pos = prof.pos || '';
    const posColor = _NFL_POS_COLOR[pos] || 'var(--accent)';
    const initials = (prof.name || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const retired = prof.statusType && prof.statusType !== 'active';
    const bits = [prof.team, (prof.height && prof.weight) ? `${prof.height}, ${prof.weight}` : '', prof.college, prof.debutYear ? `Debut ${prof.debutYear}` : '', prof.jersey ? '#' + prof.jersey : ''].filter(Boolean);
    const yearOpts = years.map(y => `<option value="${y}" ${y === _nflEspnSeason ? 'selected' : ''}>${y}</option>`).join('');

    grid.innerHTML = `
        <div class="player-detail-header">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <button onclick="navigateTo('nfl-players')" class="back-button">← Players</button>
                ${retired ? '<span class="player-hero-pos" style="background:var(--bg-elevated);color:var(--text-muted)">Retired</span>' : ''}
            </div>
            <div class="player-hero">
                <div class="player-detail-avatar nfl-hero-avatar" style="--pc:${posColor}">
                    ${prof.headshot ? `<img class="player-headshot" src="${prof.headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}${initials}
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${_escHtml(prof.name)}</h1>
                        <span class="player-hero-pos" style="background:${_nflAlpha(posColor, 20)};color:${posColor}">${_escHtml(pos)}</span>
                    </div>
                    <p class="player-detail-meta" style="color:var(--text-muted)">${_escHtml(bits.join(' · '))}</p>
                </div>
            </div>
        </div>
        <div id="nfl-career"></div>
        ${years.length ? `<div style="display:flex;align-items:center;gap:0.5rem;margin:0.6rem 0 0.45rem;padding:0 0.1rem">
            <span style="font-size:0.74rem;font-weight:700;color:var(--text-secondary)">Game log season</span>
            <select onchange="_nflEspnSetSeason(this.value)" style="background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-default);border-radius:var(--radius-sm,6px);padding:0.3rem 0.5rem;font-weight:700;cursor:pointer">${yearOpts}</select>
        </div>` : ''}
        <div id="nfl-gamelog"></div>
        <p style="color:var(--text-muted);font-size:0.72rem;margin:0.6rem 0 0;text-align:center">All-time player data · Source: ESPN</p>
    `;
    _loadNFLCareer(espnId);
    if (years.length) _loadNFLGameLog(espnId, _nflEspnSeason);
}

if (typeof window !== 'undefined') {
    window.loadNFLTeams        = loadNFLTeams;
    window.showNFLEspnPlayer   = showNFLEspnPlayer;
    window.loadNFLRankings     = loadNFLRankings;
    window.loadNFLCompare      = loadNFLCompare;
    window.showNFLPlayerDetail = showNFLPlayerDetail;
    window.showNFLTeamDetail   = showNFLTeamDetail;
    window.displayNFLTeams     = displayNFLTeams;
    window.loadNFLGames        = loadNFLGames;
    window.displayNFLGames     = displayNFLGames;
    window.loadNFLStandings    = loadNFLStandings;
    window.displayNFLStandings = displayNFLStandings;
    window.loadNFLLeaderboards = loadNFLLeaderboards;
    window.displayNFLTrending  = displayNFLTrending;
    window.loadNFLStatLeaders  = loadNFLStatLeaders;
    window.displayNFLStatLeaders = displayNFLStatLeaders;
    window.loadNFLPlayers      = loadNFLPlayers;
    window.displayNFLPlayers   = displayNFLPlayers;
    window.updateNFLTicker     = updateNFLTicker;
}
