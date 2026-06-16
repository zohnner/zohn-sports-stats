// ============================================================
// NFL — teams, scores, standings, leaders
// ESPN public API: https://site.api.espn.com/apis/site/v2/sports/football/nfl
// ============================================================

const NFL_ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

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
        ErrorHandler.renderEmptyState(grid, 'No NFL games this week — the NFL season runs September through February.', '🏈');
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
        grid.innerHTML = `<div class="nfl-offseason">
            <svg class="nfl-offseason-glyph" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="5.6" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7M10.6 7.4l1.4 1.4M7.4 10.6l1.4 1.4"/></svg>
            <h2 class="nfl-offseason-title">NFL is in the offseason</h2>
            <p class="nfl-offseason-text">Standings populate once the 2026 regular season is underway. Until kickoff in September, browse the upcoming schedule and all 32 teams.</p>
            <div class="nfl-offseason-actions">
                <button class="nfl-offseason-btn" onclick="navigateTo('nfl-games')">View schedule</button>
                <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('nfl-teams')">Browse teams</button>
            </div>
        </div>`;
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
let _nflPosFilter = 'ALL';

const _NFL_POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];
const _NFL_POS_COLOR = { QB: '#ef4444', RB: '#34d399', WR: '#60a5fa', TE: '#fbbf24', K: '#a78bfa' };

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
        btn.addEventListener('click', () => { _nflPosFilter = btn.dataset.nflPos; displayNFLPlayers(); });
    });
}

function _createNFLPlayerCard(p) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.style.cursor = 'pointer';
    card.onclick = () => navigateTo('nfl-player-' + p.player_id);

    const pos      = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
    const posColor = _NFL_POS_COLOR[pos] || 'var(--accent)';
    card.style.borderTop = `3px solid ${posColor}cc`;

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
            <div class="player-avatar" style="background:linear-gradient(135deg,${posColor}cc,${posColor}55)">
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
            <div${clickAttr} style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0.75rem;cursor:${p ? 'pointer' : 'default'};
                border-bottom:${i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none'}">
                <span style="font-size:0.65rem;font-weight:800;color:var(--text-subtle);width:14px;text-align:center">${i + 1}</span>
                <div style="width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--bg-subtle);border:1px solid var(--border-subtle)">
                    <img src="${hs || ''}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" data-hide-on-error>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:0.8rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(name)}</div>
                    <div style="font-size:0.67rem;color:var(--text-muted)">${_escHtml(meta)}</div>
                </div>
                <span style="font-weight:900;font-size:0.92rem;color:${accent}">${Number(e.count || 0).toLocaleString()}</span>
            </div>`;
        }).join('');
        card.innerHTML = `
            <div style="padding:0.55rem 0.75rem;background:var(--bg-elevated);border-bottom:1px solid var(--border-subtle);
                font-size:0.7rem;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;
                display:flex;align-items:center;gap:0.4rem;color:var(--text-secondary)">
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

    grid.innerHTML = `
        <div class="player-detail-header">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <button onclick="navigateTo('nfl-players')" class="back-button">← Players</button>
                <button class="share-btn" onclick="window._shareCurrentPage && window._shareCurrentPage()" title="Copy link">Share</button>
            </div>
            <div class="player-hero">
                <div class="player-detail-avatar" style="background:linear-gradient(135deg,${posColor}cc,${posColor}55);color:#fff;font-size:2.5rem;font-weight:800">
                    ${headshotImg}${initials}
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${_escHtml(p.full_name)}</h1>
                        <span class="player-hero-pos" style="background:${posColor}33;color:${posColor}">${_escHtml(pos)}</span>
                        ${adpBadge}
                    </div>
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.2rem">
                        ${teamLogo ? `<img src="${teamLogo}" alt="" style="width:24px;height:24px;object-fit:contain" loading="lazy" data-hide-on-error>` : ''}
                        ${teamBtn}
                    </div>
                    <p class="player-detail-meta" style="color:var(--text-muted)">2026 NFL Season · Fantasy profile</p>
                </div>
            </div>
        </div>

        <div class="stats-card">
            <h2 class="detail-section-title">Player Profile</h2>
            <div class="player-details" style="max-width:520px">${bio}</div>
        </div>

        <div class="stats-card">
            <h2 class="detail-section-title">Fantasy Outlook</h2>
            <p style="color:var(--text-secondary);font-size:0.88rem;line-height:1.6;margin:0">
                ${_escHtml(p.full_name)} enters 2026 ${p._adp ? `as the <strong>#${p._adp}</strong> player off the board by Sleeper ADP` : 'as an undrafted-tier option'}${p.fantasy_positions && p.fantasy_positions.length ? `, eligible at <strong>${_escHtml(p.fantasy_positions.join(', '))}</strong>` : ''}.${p.depth_chart_order === 1 ? ' Currently atop the depth chart.' : p.depth_chart_order ? ` Listed ${_escHtml((p.depth_chart_position || pos) + ' ' + p.depth_chart_order)} on the depth chart.` : ''}${p.injury_status ? ` <span style="color:var(--color-loss)">Injury watch: ${_escHtml(p.injury_status)}.</span>` : ''}
            </p>
            <p style="color:var(--text-muted);font-size:0.78rem;margin:0.75rem 0 0">Game-by-game stats return when the 2026 season kicks off in September. Source: Sleeper.</p>
        </div>
    `;
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

if (typeof window !== 'undefined') {
    window.loadNFLTeams        = loadNFLTeams;
    window.showNFLPlayerDetail = showNFLPlayerDetail;
    window.showNFLTeamDetail   = showNFLTeamDetail;
    window.displayNFLTeams     = displayNFLTeams;
    window.loadNFLGames        = loadNFLGames;
    window.displayNFLGames     = displayNFLGames;
    window.loadNFLStandings    = loadNFLStandings;
    window.displayNFLStandings = displayNFLStandings;
    window.loadNFLLeaderboards = loadNFLLeaderboards;
    window.displayNFLTrending  = displayNFLTrending;
    window.loadNFLPlayers      = loadNFLPlayers;
    window.displayNFLPlayers   = displayNFLPlayers;
    window.updateNFLTicker     = updateNFLTicker;
}
