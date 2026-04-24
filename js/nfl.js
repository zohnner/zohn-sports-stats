// ============================================================
// NFL — teams, scores, standings, leaders
// ESPN public API: https://site.api.espn.com/apis/site/v2/sports/football/nfl
// ============================================================

const NFL_ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

// ── Fetch helper ──────────────────────────────────────────────

async function espnNFLFetch(path, params = {}, ttl = ApiCache.TTL.MEDIUM) {
    const url = new URL(`${NFL_ESPN_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `nfl:${url.pathname}${url.search}`;

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

async function fetchNFLLeaders() {
    const data = await espnNFLFetch('/leaders', {}, ApiCache.TTL.MEDIUM);
    const cats = data.categories || data.leaders || [];
    return cats.map(cat => ({
        name:        cat.name,
        displayName: cat.displayName || cat.name,
        leaders:     (cat.leaders || []).map(l => ({
            rank:         l.rank || 1,
            value:        l.value,
            displayValue: l.displayValue,
            athlete: {
                id:       l.athlete?.id,
                name:     l.athlete?.fullName || l.athlete?.displayName || '',
                shortName:l.athlete?.shortName || '',
                headshot: l.athlete?.headshot?.href || getNFLPlayerHeadshotUrl(l.athlete?.id),
                position: l.athlete?.position?.abbreviation || '',
                team: {
                    abbr:  l.athlete?.team?.abbreviation || '',
                    logo:  l.athlete?.team?.logo || getNFLTeamLogoUrl(l.athlete?.team?.abbreviation),
                    color: '#' + (l.athlete?.team?.color || '334155'),
                },
            },
        })),
    })).filter(cat => cat.leaders.length > 0);
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
        card.style.cssText = 'cursor:default;padding:1.25rem 1rem;display:flex;flex-direction:column;align-items:center;gap:0.5rem;text-align:center;border-top:3px solid ' + team.color + '99';
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
                <div class="team-logo-wrap">
                    <img src="${game.awayTeam.logo}" alt="${_escHtml(game.awayTeam.abbr)}" class="team-logo" loading="lazy" data-hide-on-error>
                </div>
                <span class="team-abbr">${_escHtml(game.awayTeam.abbr)}</span>
                ${hasScore ? `<span class="game-score ${game.awayTeam.winner ? 'game-score--win' : ''}">${as}</span>` : ''}
            </div>
            <div class="game-vs">@</div>
            <div class="game-team ${game.homeTeam.winner ? 'game-team--winner' : ''}">
                ${hasScore ? `<span class="game-score ${game.homeTeam.winner ? 'game-score--win' : ''}">${hs}</span>` : ''}
                <span class="team-abbr">${_escHtml(game.homeTeam.abbr)}</span>
                <div class="team-logo-wrap">
                    <img src="${game.homeTeam.logo}" alt="${_escHtml(game.homeTeam.abbr)}" class="team-logo" loading="lazy" data-hide-on-error>
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
        ErrorHandler.renderEmptyState(grid, 'No NFL standings available', '📊');
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

// ── Display: Leaders ──────────────────────────────────────────

const _NFL_LEADER_CATS = [
    { name: 'passingYards',        label: 'Pass YDS',  icon: '🏈' },
    { name: 'passingTouchdowns',   label: 'Pass TD',   icon: '🏈' },
    { name: 'rushingYards',        label: 'Rush YDS',  icon: '🏃' },
    { name: 'rushingTouchdowns',   label: 'Rush TD',   icon: '🏃' },
    { name: 'receivingYards',      label: 'Rec YDS',   icon: '🙌' },
    { name: 'receptions',          label: 'REC',       icon: '🙌' },
    { name: 'receivingTouchdowns', label: 'Rec TD',    icon: '🙌' },
    { name: 'sacks',               label: 'Sacks',     icon: '🛡️' },
    { name: 'interceptions',       label: 'INT',       icon: '🛡️' },
];

async function loadNFLLeaderboards() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    if (window.setBreadcrumb) setBreadcrumb('nfl-leaders', null);

    grid.innerHTML = Array.from({ length: 6 }, () =>
        `<div class="skeleton-card" style="min-height:240px"></div>`
    ).join('');

    try {
        const cats = await fetchNFLLeaders();
        if (!cats?.length) {
            ErrorHandler.renderEmptyState(grid, 'No NFL leaders data — check back during the season.', '🏈');
            return;
        }
        displayNFLLeaderboards(cats);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLLeaderboards, { tag: 'NFL', title: 'Failed to Load NFL Leaders' });
    }
}

function displayNFLLeaderboards(cats) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.innerHTML = '';

    const ORDERED = _NFL_LEADER_CATS.map(c => cats.find(cat => cat.name === c.name)).filter(Boolean);
    cats.forEach(cat => {
        if (!_NFL_LEADER_CATS.some(c => c.name === cat.name)) ORDERED.push(cat);
    });

    const fragment = document.createDocumentFragment();
    ORDERED.forEach(cat => {
        const meta  = _NFL_LEADER_CATS.find(c => c.name === cat.name);
        const label = meta?.label || cat.displayName;
        const icon  = meta?.icon  || '🏈';

        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'padding:0;overflow:hidden';

        const rowsHtml = cat.leaders.slice(0, 5).map((l, i) => `
            <div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0.75rem;
                border-bottom:${i < 4 ? '1px solid var(--border-subtle)' : 'none'}">
                <span style="font-size:0.65rem;font-weight:800;color:var(--text-subtle);width:14px;text-align:center">${i + 1}</span>
                <div style="width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--bg-subtle);border:1px solid var(--border-subtle)">
                    <img src="${l.athlete.headshot || ''}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" data-hide-on-error>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:0.8rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(l.athlete.shortName || l.athlete.name)}</div>
                    <div style="font-size:0.67rem;color:var(--text-muted)">${_escHtml(l.athlete.team.abbr)}${l.athlete.position ? ' · ' + l.athlete.position : ''}</div>
                </div>
                <span style="font-weight:900;font-size:0.92rem;color:var(--accent)">${_escHtml(String(l.displayValue))}</span>
            </div>
        `).join('');

        card.innerHTML = `
            <div style="padding:0.55rem 0.75rem;background:var(--bg-elevated);border-bottom:1px solid var(--border-subtle);
                font-size:0.7rem;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;
                display:flex;align-items:center;gap:0.4rem;color:var(--text-secondary)">
                <span>${icon}</span> ${_escHtml(label)}
            </div>
            ${rowsHtml || '<div style="padding:1rem;color:var(--text-muted);text-align:center;font-size:0.82rem">No data available</div>'}
        `;
        fragment.appendChild(card);
    });
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

// Players view delegates to leaders
async function loadNFLPlayers() { return loadNFLLeaderboards(); }

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

if (typeof window !== 'undefined') {
    window.loadNFLTeams        = loadNFLTeams;
    window.displayNFLTeams     = displayNFLTeams;
    window.loadNFLGames        = loadNFLGames;
    window.displayNFLGames     = displayNFLGames;
    window.loadNFLStandings    = loadNFLStandings;
    window.displayNFLStandings = displayNFLStandings;
    window.loadNFLLeaderboards = loadNFLLeaderboards;
    window.loadNFLPlayers      = loadNFLPlayers;
    window.updateNFLTicker     = updateNFLTicker;
}
