// ============================================================
// NHL — teams, scores, standings, leaders
// NHLe public API: https://api-web.nhle.com/v1
// ============================================================

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

// ── Fetch helper ──────────────────────────────────────────────

async function nhleApiFetch(path, params = {}, ttl = ApiCache.TTL.MEDIUM) {
    const url = new URL(`${NHL_API_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `nhl:${url.pathname}${url.search}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    Logger.debug(`NHL → ${url.pathname}`, undefined, 'NHL');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(tid);
    }
    if (!res.ok) throw new Error(`NHL API ${res.status}: ${res.statusText}`);

    let json;
    try { json = await res.json(); } catch { throw new Error(`NHL API returned non-JSON (${path})`); }
    ApiCache.set(cacheKey, json, ttl);
    return json;
}

// ── Logo helpers ──────────────────────────────────────────────

function getNHLTeamLogoUrl(abbr) {
    return abbr ? `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg` : null;
}

// ── API functions ─────────────────────────────────────────────

async function fetchNHLStandings() {
    const data = await nhleApiFetch('/standings/now', {}, ApiCache.TTL.SHORT);
    return (data.standings || []).map(t => {
        const abbr = t.teamAbbrev?.default || t.teamAbbrev || '';
        return {
            id:         t.teamId || abbr,
            abbr,
            name:       t.teamName?.default || t.teamName || abbr,
            commonName: t.teamCommonName?.default || t.teamCommonName || abbr,
            logo:       t.teamLogoUrl || t.teamLogo || getNHLTeamLogoUrl(abbr),
            conference: t.conferenceName || '',
            division:   t.divisionName   || '',
            gp:         t.gamesPlayed  || 0,
            wins:       t.wins         || 0,
            losses:     t.losses       || 0,
            otLosses:   t.otLosses     || 0,
            points:     t.points       || 0,
            pointPct:   t.pointPctg    || 0,
            gf:         t.goalFor      || 0,
            ga:         t.goalAgainst  || 0,
            diff:       t.goalDifferential || 0,
            l10:        `${t.l10Wins || 0}-${t.l10Losses || 0}-${t.l10OtLosses || 0}`,
            streak:     (t.streakCode && t.streakCount) ? `${t.streakCode}${t.streakCount}` : '',
            divSeq:     t.divisionSequence   || 99,
            confSeq:    t.conferenceSequence || 99,
        };
    });
}

async function fetchNHLScoreboard(date = null) {
    const path = date ? `/score/${date}` : '/score/now';
    const data = await nhleApiFetch(path, {}, ApiCache.TTL.SHORT);
    return {
        currentDate: data.currentDate,
        prevDate:    data.prevDate,
        nextDate:    data.nextDate,
        games: (data.games || []).map(g => ({
            id:        g.id,
            gameState: g.gameState,
            gameDate:  g.gameDate,
            startTime: g.startTimeUTC,
            period:    g.period || 0,
            clock:     g.clock?.timeRemaining || '',
            awayTeam: {
                id:    g.awayTeam?.id,
                abbr:  g.awayTeam?.abbrev,
                name:  g.awayTeam?.name?.default || g.awayTeam?.commonName?.default || g.awayTeam?.abbrev,
                logo:  g.awayTeam?.logo || getNHLTeamLogoUrl(g.awayTeam?.abbrev),
                score: g.awayTeam?.score ?? 0,
                sog:   g.awayTeam?.sog   ?? 0,
            },
            homeTeam: {
                id:    g.homeTeam?.id,
                abbr:  g.homeTeam?.abbrev,
                name:  g.homeTeam?.name?.default || g.homeTeam?.commonName?.default || g.homeTeam?.abbrev,
                logo:  g.homeTeam?.logo || getNHLTeamLogoUrl(g.homeTeam?.abbrev),
                score: g.homeTeam?.score ?? 0,
                sog:   g.homeTeam?.sog   ?? 0,
            },
        })),
    };
}

async function fetchNHLLeaders() {
    const SKATER_CATS = 'goals,assists,points,plusMinus,powerPlayGoals,penaltyMinutes';
    const GOALIE_CATS = 'wins,savePctg,goalsAgainstAvg,shutouts';
    const [skaterData, goalieData] = await Promise.all([
        nhleApiFetch('/skater-stats-leaders/current', { categories: SKATER_CATS, limit: 10 }, ApiCache.TTL.MEDIUM),
        nhleApiFetch('/goalie-stats-leaders/current',  { categories: GOALIE_CATS, limit: 8  }, ApiCache.TTL.MEDIUM),
    ]);
    return { skaters: skaterData, goalies: goalieData };
}

// ── Display: Teams ────────────────────────────────────────────

async function loadNHLTeams() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'games-grid';
    if (window.setBreadcrumb) setBreadcrumb('nhl-teams', null);

    grid.innerHTML = Array.from({ length: 8 }, () =>
        `<div class="skeleton-card" style="min-height:120px"></div>`
    ).join('');

    try {
        if (!AppState.nhlTeams.length) {
            const rows = await fetchNHLStandings();
            AppState.nhlTeams    = rows;
            AppState.nhlStandings = AppState.nhlStandings || rows;
        }
        displayNHLTeams(AppState.nhlTeams);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNHLTeams, { tag: 'NHL', title: 'Failed to Load NHL Teams' });
    }
}

function displayNHLTeams(teams) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'games-grid';

    if (!teams?.length) {
        ErrorHandler.renderEmptyState(grid, 'No NHL team data available', '🏒');
        return;
    }

    const fragment = document.createDocumentFragment();
    [...teams].sort((a, b) => (a.division || '').localeCompare(b.division || '') || a.commonName.localeCompare(b.commonName)).forEach(team => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.style.cssText = 'cursor:default;padding:1.2rem 1rem;display:flex;flex-direction:column;align-items:center;gap:0.5rem;text-align:center';
        card.innerHTML = `
            <div style="width:52px;height:52px;display:flex;align-items:center;justify-content:center">
                <img src="${team.logo}" alt="${_escHtml(team.abbr)}" style="width:100%;height:100%;object-fit:contain" loading="lazy" data-hide-on-error>
            </div>
            <div style="font-weight:800;font-size:0.86rem;color:var(--text-primary)">${_escHtml(team.commonName)}</div>
            <div style="font-size:0.68rem;color:var(--text-muted)">${_escHtml(team.division)}</div>
            <div style="font-size:0.72rem;font-weight:700;color:var(--text-secondary)">
                ${team.wins}-${team.losses}-${team.otLosses}
                <span style="color:var(--accent)">${team.points} pts</span>
            </div>
        `;
        fragment.appendChild(card);
    });
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

// ── Display: Scores ───────────────────────────────────────────

let _nhlCurrentDate = null;

async function loadNHLGames(date = null) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.innerHTML = '';
    if (window.setBreadcrumb) setBreadcrumb('nhl-games', null);

    // Skeleton while loading
    const skelWrap = document.createElement('div');
    skelWrap.className = 'games-grid';
    skelWrap.innerHTML = Array.from({ length: 6 }, () =>
        `<div class="skeleton-card" style="min-height:160px"></div>`
    ).join('');
    grid.appendChild(skelWrap);

    try {
        const data = await fetchNHLScoreboard(date || _nhlCurrentDate);
        _nhlCurrentDate = data.currentDate;
        AppState.nhlGames = data.games;
        displayNHLGames(data);
        updateNHLTicker(data.games);
    } catch (err) {
        ErrorHandler.handle(grid, err, () => loadNHLGames(date), { tag: 'NHL', title: 'Failed to Load NHL Scores' });
    }
}

function displayNHLGames({ games, currentDate, prevDate, nextDate }) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.innerHTML = '';

    // Date navigation
    const nav = document.createElement('div');
    nav.style.cssText = 'display:flex;align-items:center;gap:0.75rem;padding:0.75rem 0 1rem;justify-content:space-between;max-width:480px;margin:0 auto';

    const _navBtn = (label, onClick) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = 'padding:0.3rem 0.75rem;border-radius:8px;cursor:pointer;font-size:0.78rem;font-weight:700;font-family:inherit;border:1px solid var(--border-mid);background:var(--bg-elevated);color:var(--text-secondary);transition:all 0.15s';
        btn.addEventListener('click', onClick);
        return btn;
    };

    if (prevDate) nav.appendChild(_navBtn('← ' + _nhlFmtDate(prevDate), () => loadNHLGames(prevDate)));
    else nav.appendChild(document.createElement('span'));

    const cur = document.createElement('span');
    cur.style.cssText = 'font-weight:800;font-size:0.88rem;color:var(--text-primary);text-align:center';
    cur.textContent = _nhlFmtDate(currentDate, true);
    nav.appendChild(cur);

    if (nextDate) nav.appendChild(_navBtn(_nhlFmtDate(nextDate) + ' →', () => loadNHLGames(nextDate)));
    else nav.appendChild(document.createElement('span'));

    grid.appendChild(nav);

    if (!games?.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;padding:2rem;color:var(--text-muted);font-size:0.9rem';
        empty.textContent = 'No games scheduled for this date.';
        grid.appendChild(empty);
        return;
    }

    const gamesWrap = document.createElement('div');
    gamesWrap.className = 'games-grid';
    const fragment = document.createDocumentFragment();
    games.forEach(g => fragment.appendChild(_createNHLGameCard(g)));
    gamesWrap.appendChild(fragment);
    grid.appendChild(gamesWrap);
}

function _nhlFmtDate(dateStr, long = false) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr + 'T12:00:00');
        if (long) return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (_) { return dateStr; }
}

function _createNHLGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';

    const isFinal = game.gameState === 'FINAL' || game.gameState === 'CRIT' || game.gameState === 'OFF';
    const isLive  = game.gameState === 'LIVE';
    const isPre   = !isFinal && !isLive;

    const hs = game.homeTeam.score;
    const as = game.awayTeam.score;
    const homeWon = isFinal && hs > as;
    const awayWon = isFinal && as > hs;

    const statusCls = isFinal ? 'game-status--final' : isLive ? 'game-status--live' : 'game-status--sched';

    const PERIOD_LABELS = ['1st', '2nd', '3rd', 'OT', '2OT', '3OT'];
    let statusText = 'Scheduled';
    if (isFinal) {
        statusText = game.period > 3 ? `Final/${PERIOD_LABELS[game.period - 1] || 'OT'}` : 'Final';
    } else if (isLive) {
        const pLabel = PERIOD_LABELS[game.period - 1] || `P${game.period}`;
        statusText = game.clock ? `${pLabel} ${game.clock}` : pLabel;
    } else if (game.startTime) {
        try { statusText = new Date(game.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); } catch (_) {}
    }

    const hasScore = isFinal || isLive;

    card.innerHTML = `
        <div class="game-teams">
            <div class="game-team ${awayWon ? 'game-team--winner' : ''}">
                <div class="team-logo-wrap">
                    <img src="${game.awayTeam.logo}" alt="${_escHtml(game.awayTeam.abbr || '')}" class="team-logo" loading="lazy" data-hide-on-error>
                </div>
                <span class="team-abbr">${_escHtml(game.awayTeam.abbr || '?')}</span>
                ${hasScore ? `<span class="game-score ${awayWon ? 'game-score--win' : ''}">${as}</span>` : ''}
            </div>
            <div class="game-vs">@</div>
            <div class="game-team ${homeWon ? 'game-team--winner' : ''}">
                ${hasScore ? `<span class="game-score ${homeWon ? 'game-score--win' : ''}">${hs}</span>` : ''}
                <span class="team-abbr">${_escHtml(game.homeTeam.abbr || '?')}</span>
                <div class="team-logo-wrap">
                    <img src="${game.homeTeam.logo}" alt="${_escHtml(game.homeTeam.abbr || '')}" class="team-logo" loading="lazy" data-hide-on-error>
                </div>
            </div>
        </div>
        <div class="game-status ${statusCls}">${_escHtml(statusText)}</div>
        ${hasScore ? `<div style="font-size:0.64rem;color:var(--text-subtle);text-align:center;margin-top:2px">SOG: ${as} – ${hs}</div>` : ''}
    `;
    return card;
}

// ── Display: Standings ────────────────────────────────────────

async function loadNHLStandings() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:400px"></div>`;
    if (window.setBreadcrumb) setBreadcrumb('nhl-standings', null);

    try {
        if (!AppState.nhlStandings?.length) {
            AppState.nhlStandings = await fetchNHLStandings();
            if (!AppState.nhlTeams.length) AppState.nhlTeams = AppState.nhlStandings;
        }
        displayNHLStandings(AppState.nhlStandings);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNHLStandings, { tag: 'NHL', title: 'Failed to Load NHL Standings' });
    }
}

function displayNHLStandings(rows) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.innerHTML = '';

    if (!rows?.length) {
        ErrorHandler.renderEmptyState(grid, 'No NHL standings available', '📊');
        return;
    }

    const grouped = {};
    rows.forEach(t => {
        if (!grouped[t.conference]) grouped[t.conference] = {};
        if (!grouped[t.conference][t.division]) grouped[t.conference][t.division] = [];
        grouped[t.conference][t.division].push(t);
    });

    const confOrder = ['Eastern', 'Western'];
    const divOrder  = { Eastern: ['Atlantic', 'Metropolitan'], Western: ['Central', 'Pacific'] };

    const wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem;padding:1rem 0';

    for (const conf of confOrder) {
        if (!grouped[conf]) continue;
        const confWrap = document.createElement('div');
        confWrap.innerHTML = `<h2 style="font-size:1rem;font-weight:900;letter-spacing:1px;text-transform:uppercase;
            color:var(--accent);margin:0 0 0.75rem;padding:0.5rem 0;border-bottom:2px solid var(--border-mid)">${conf}ern Conference</h2>`;

        const divsGrid = document.createElement('div');
        divsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem';

        for (const div of (divOrder[conf] || Object.keys(grouped[conf]))) {
            const teams = grouped[conf]?.[div];
            if (!teams?.length) continue;
            teams.sort((a, b) => a.divSeq - b.divSeq || b.points - a.points);

            const divCard = document.createElement('div');
            divCard.className = 'card';
            divCard.style.cssText = 'padding:0;overflow:hidden';

            const header = `<div style="display:grid;grid-template-columns:22px 1fr repeat(6,auto);align-items:center;
                gap:0.35rem;padding:0.4rem 0.75rem;background:var(--bg-elevated);
                border-bottom:1px solid var(--border-subtle);font-size:0.63rem;font-weight:800;
                letter-spacing:0.4px;text-transform:uppercase;color:var(--text-subtle)">
                <span></span><span>${_escHtml(div)}</span>
                <span>GP</span><span>W</span><span>L</span><span>OT</span><span>PTS</span><span>L10</span>
            </div>`;

            const teamRows = teams.map((t, i) => `
                <div style="display:grid;grid-template-columns:22px 1fr repeat(6,auto);align-items:center;
                    gap:0.35rem;padding:0.42rem 0.75rem;
                    border-bottom:${i < teams.length - 1 ? '1px solid var(--border-subtle)' : 'none'}">
                    <img src="${t.logo}" alt="" style="width:20px;height:20px;object-fit:contain" loading="lazy" data-hide-on-error>
                    <span style="font-weight:700;font-size:0.82rem;color:var(--text-primary)">${_escHtml(t.commonName)}</span>
                    <span style="font-size:0.72rem;color:var(--text-muted);text-align:right">${t.gp}</span>
                    <span style="font-weight:700;font-size:0.78rem;color:var(--text-primary);text-align:right">${t.wins}</span>
                    <span style="font-size:0.75rem;color:var(--text-secondary);text-align:right">${t.losses}</span>
                    <span style="font-size:0.72rem;color:var(--text-muted);text-align:right">${t.otLosses}</span>
                    <span style="font-weight:800;font-size:0.82rem;color:var(--accent);text-align:right">${t.points}</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);text-align:right">${_escHtml(t.l10)}</span>
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

const _NHL_SKATER_CATS = [
    { key: 'goals',           label: 'Goals',     icon: '🥅' },
    { key: 'assists',         label: 'Assists',   icon: '🏒' },
    { key: 'points',          label: 'Points',    icon: '⭐' },
    { key: 'plusMinus',       label: '+/-',       icon: '📊' },
    { key: 'powerPlayGoals',  label: 'PP Goals',  icon: '🔋' },
    { key: 'penaltyMinutes',  label: 'PIM',       icon: '⏱️' },
];
const _NHL_GOALIE_CATS = [
    { key: 'wins',            label: 'Wins',      icon: '🥅' },
    { key: 'savePctg',        label: 'SV%',       icon: '🛡️' },
    { key: 'goalsAgainstAvg', label: 'GAA',       icon: '📉' },
    { key: 'shutouts',        label: 'Shutouts',  icon: '🔒' },
];

async function loadNHLLeaderboards() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:400px"></div>`;
    if (window.setBreadcrumb) setBreadcrumb('nhl-leaders', null);

    try {
        const data = await fetchNHLLeaders();
        displayNHLLeaderboards(data);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNHLLeaderboards, { tag: 'NHL', title: 'Failed to Load NHL Leaders' });
    }
}

function displayNHLLeaderboards({ skaters, goalies }) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:1100px;margin:0 auto;padding:0.5rem 0';

    const _sectionTitle = text => {
        const h = document.createElement('h2');
        h.style.cssText = 'font-size:0.9rem;font-weight:900;letter-spacing:0.8px;text-transform:uppercase;color:var(--accent);margin:1.25rem 0 0.75rem;padding-bottom:0.4rem;border-bottom:2px solid var(--border-mid)';
        h.textContent = text;
        return h;
    };

    const _buildCatGrid = (cats, dataObj, fmtVal = null) => {
        const g = document.createElement('div');
        g.className = 'players-grid';
        cats.forEach(cat => {
            const list = dataObj?.[cat.key];
            if (!list?.length) return;

            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = 'padding:0;overflow:hidden';

            const rowsHtml = list.slice(0, 5).map((p, i) => {
                const val   = fmtVal ? fmtVal(cat.key, p.value) : (typeof p.value === 'number' ? (Number.isInteger(p.value) ? p.value : p.value.toFixed(3)) : p.value);
                const first = p.firstName?.default || p.firstName || '';
                const last  = p.lastName?.default  || p.lastName  || '';
                const name  = `${first} ${last}`.trim();
                const short = first && last ? `${first[0]}. ${last}` : name;
                const abbr  = p.teamAbbrev?.default || p.teamAbbrev || '';
                return `
                    <div style="display:flex;align-items:center;gap:0.55rem;padding:0.5rem 0.7rem;
                        border-bottom:${i < 4 ? '1px solid var(--border-subtle)' : 'none'}">
                        <span style="font-size:0.65rem;font-weight:800;color:var(--text-subtle);width:14px;text-align:center">${i + 1}</span>
                        <div style="width:26px;height:26px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--bg-subtle)">
                            <img src="${p.headshot || ''}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" data-hide-on-error>
                        </div>
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:700;font-size:0.78rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(short)}</div>
                            <div style="font-size:0.65rem;color:var(--text-muted)">${_escHtml(abbr)}</div>
                        </div>
                        <span style="font-weight:900;font-size:0.9rem;color:var(--accent)">${val}</span>
                    </div>
                `;
            }).join('');

            card.innerHTML = `
                <div style="padding:0.55rem 0.7rem;background:var(--bg-elevated);border-bottom:1px solid var(--border-subtle);
                    font-size:0.7rem;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;
                    display:flex;align-items:center;gap:0.35rem;color:var(--text-secondary)">
                    <span>${cat.icon}</span> ${_escHtml(cat.label)}
                </div>
                ${rowsHtml || '<div style="padding:1rem;color:var(--text-muted);text-align:center;font-size:0.8rem">No data</div>'}
            `;
            g.appendChild(card);
        });
        return g;
    };

    const goaliesFmt = (key, val) => {
        if (key === 'savePctg')        return parseFloat(val).toFixed(3);
        if (key === 'goalsAgainstAvg') return parseFloat(val).toFixed(2);
        return val;
    };

    wrap.appendChild(_sectionTitle('Skater Leaders'));
    wrap.appendChild(_buildCatGrid(_NHL_SKATER_CATS, skaters));
    wrap.appendChild(_sectionTitle('Goalie Leaders'));
    wrap.appendChild(_buildCatGrid(_NHL_GOALIE_CATS, goalies, goaliesFmt));

    grid.appendChild(wrap);
}

// Players view delegates to leaders
async function loadNHLPlayers() { return loadNHLLeaderboards(); }

// ── Ticker ────────────────────────────────────────────────────

function updateNHLTicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) return;

    const scored = (games || []).filter(g =>
        g.gameState !== 'FUT' && g.gameState !== 'PRE' &&
        (g.homeTeam.score > 0 || g.awayTeam.score > 0 || g.gameState === 'FINAL' || g.gameState === 'OFF')
    );

    if (!scored.length) {
        ticker.innerHTML = `<div class="ticker__item">No NHL scores today</div>`;
        return;
    }

    const PERIOD_LABELS = ['1st', '2nd', '3rd', 'OT', '2OT'];
    const items = [...scored, ...scored].map(g => {
        const isFinal = g.gameState === 'FINAL' || g.gameState === 'CRIT' || g.gameState === 'OFF';
        const isLive  = g.gameState === 'LIVE';
        const pillCls = isFinal ? 'final' : isLive ? 'live' : 'sched';
        const pLabel  = PERIOD_LABELS[g.period - 1] || '';
        const pillLbl = isFinal ? 'F' : isLive ? (pLabel || 'LIVE') : 'SCH';
        const homeWon = isFinal && g.homeTeam.score > g.awayTeam.score;
        const awayWon = isFinal && g.awayTeam.score > g.homeTeam.score;
        return `
            <div class="ticker__item" data-game-id="${g.id}" data-sport="nhl" style="cursor:pointer">
                <img class="ticker-logo" src="${g.awayTeam.logo}" alt="" loading="lazy" data-hide-on-error>
                <span class="ticker-team">${_escHtml(g.awayTeam.abbr || '?')}</span>
                <span class="ticker-score ${awayWon ? 'ticker-score--win' : ''}">${g.awayTeam.score}</span>
                <span class="ticker-divider">–</span>
                <span class="ticker-score ${homeWon ? 'ticker-score--win' : ''}">${g.homeTeam.score}</span>
                <span class="ticker-team">${_escHtml(g.homeTeam.abbr || '?')}</span>
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
    window.loadNHLTeams        = loadNHLTeams;
    window.displayNHLTeams     = displayNHLTeams;
    window.loadNHLGames        = loadNHLGames;
    window.displayNHLGames     = displayNHLGames;
    window.loadNHLStandings    = loadNHLStandings;
    window.displayNHLStandings = displayNHLStandings;
    window.loadNHLLeaderboards = loadNHLLeaderboards;
    window.loadNHLPlayers      = loadNHLPlayers;
    window.updateNHLTicker     = updateNHLTicker;
}
