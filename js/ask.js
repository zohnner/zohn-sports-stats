// ============================================================
// Ask Engine — natural language Q&A over live sports data
// Queries StatsDB + AppState to answer questions about NBA stats.
// ============================================================

// ── Pattern registry ─────────────────────────────────────────
// Each entry: { patterns: [...RegExp], handler: async fn → AnswerPayload | null }
// Patterns are tested in order; first match wins.

const ASK_PATTERNS = [

    // ── Playoff / standings status ────────────────────────────

    {   id: 'playoff-teams',
        patterns: [/playoff(?:s)?\s*team/i, /who.*in.*playoff/i, /playoff.*picture/i, /who.*clinched/i, /teams.*playoff/i],
        handler: async () => {
            const [east, west] = await Promise.all([
                StatsDB.getPlayoffTeams().then(r => r.filter(t => t.conference === 'East').sort((a,b)=>a.rank-b.rank)),
                StatsDB.getPlayoffTeams().then(r => r.filter(t => t.conference === 'West').sort((a,b)=>a.rank-b.rank)),
            ]);
            if (!east.length && !west.length) return null;
            return {
                title: 'Current Playoff Teams',
                subtitle: 'Top 6 seeds in each conference',
                type: 'two-col-list',
                left:  { heading: 'Eastern', rows: east  },
                right: { heading: 'Western',  rows: west  },
                rowFn: (t, i) => _standingRow(i + 1, t),
            };
        }
    },

    {   id: 'playin-teams',
        patterns: [/play.?in/i, /bubble/i, /7th.*seed/i, /on.*the.*edge/i],
        handler: async () => {
            const all   = await StatsDB.getPlayInTeams();
            const east  = all.filter(t => t.conference === 'East').sort((a,b)=>a.rank-b.rank);
            const west  = all.filter(t => t.conference === 'West').sort((a,b)=>a.rank-b.rank);
            return {
                title: 'Play-In Tournament Teams',
                subtitle: 'Seeds 7–10 in each conference',
                type: 'two-col-list',
                left:  { heading: 'Eastern', rows: east },
                right: { heading: 'Western',  rows: west },
                rowFn: (t, i) => _standingRow(i + 7, t),
            };
        }
    },

    {   id: 'conference-standings',
        patterns: [/east.*standing/i, /standing.*east/i, /eastern.*conf/i, /east.*rank/i],
        handler: async () => _confStandings('East'),
    },
    {   id: 'conference-standings-west',
        patterns: [/west.*standing/i, /standing.*west/i, /western.*conf/i, /west.*rank/i],
        handler: async () => _confStandings('West'),
    },

    // ── Team-specific ─────────────────────────────────────────

    {   id: 'team-record',
        patterns: [
            /(.+?)[\s]+(?:record|standing|stats?|rank|season)/i,
            /how.*(?:are|is)\s+(?:the\s+)?(.+?)(?:\s+doing)?$/i,
            /what'?s?\s+(?:the\s+)?(.+?)['s]?\s+record/i,
        ],
        handler: async (m) => {
            const raw   = (m[1] || '').trim().toLowerCase();
            const abbr  = TEAM_ALIASES[raw];
            if (!abbr) return null;
            const team  = await StatsDB.getTeamStandings(abbr);
            if (!team) return null;
            return _teamCard(team);
        }
    },

    {   id: 'team-roster',
        patterns: [/(.+?)\s+roster/i, /roster.*(?:of|for)\s+(.+)/i],
        handler: async (m) => {
            const raw  = (m[1] || m[2] || '').trim().toLowerCase();
            const abbr = TEAM_ALIASES[raw];
            if (!abbr) return null;
            const rows = await StatsDB.getPlayersByTeam(abbr);
            if (!rows.length) return null;
            const colors = getTeamColors(abbr);
            return {
                title: `${abbr} Roster`,
                subtitle: `${rows.length} players`,
                type: 'player-list',
                rows: rows.sort((a, b) => (b.stats?.pts ?? 0) - (a.stats?.pts ?? 0)),
                accent: colors.primary,
            };
        }
    },

    // ── Player-specific ───────────────────────────────────────

    {   id: 'player-stats',
        patterns: [
            /(.+?)\s+stats?$/i,
            /how.*(?:is|are)\s+(.+?)\s+(?:playing|doing|averaging)/i,
            /what\s+(?:is|are)\s+(.+?)\s+averaging/i,
            /show\s+me\s+(.+?)\s+stats?/i,
        ],
        handler: async (m) => {
            const raw    = (m[1] || '').trim();
            const player = await StatsDB.getPlayerByName(raw);
            if (!player) return null;
            const stats  = await StatsDB.getPlayerStats(player.id);
            if (!stats)  return null;
            return _playerCard(player, stats);
        }
    },

    // ── Stat leaders ─────────────────────────────────────────

    {   id: 'top-n-stat',
        patterns: [/top\s+(\d+)\s+(.+)/i, /best\s+(\d+)\s+(.+)/i, /(\d+)\s+best\s+(.+)/i],
        handler: async (m) => {
            const n      = parseInt(m[1]) || 5;
            const raw    = (m[2] || '').trim().toLowerCase();
            const field  = STAT_ALIASES[raw] || raw;
            const schema = PLAYER_STATS_SCHEMA[field];
            if (!schema) return null;
            const leaders = await StatsDB.getPlayerStatLeader(field, Math.min(n, 25));
            if (!leaders || !leaders.length) return null;
            return {
                title: `Top ${leaders.length} ${schema.label}`,
                subtitle: `${CURRENT_SEASON}–${String(CURRENT_SEASON+1).slice(-2)} season`,
                type: 'stat-leaders',
                field, schema, leaders,
            };
        }
    },

    {   id: 'stat-leader',
        patterns: [
            /who\s+leads?\s+(?:the\s+(?:nba\s+)?in\s+)?(.+)/i,
            /(?:best|top|most|highest)\s+(.+?)\s+(?:in\s+the\s+nba)?$/i,
            /who\s+has\s+the\s+(?:most|best|highest)\s+(.+)/i,
            /nba\s+(.+?)\s+leader/i,
            /(.+?)\s+leader/i,
        ],
        handler: async (m) => {
            const raw    = (m[1] || '').trim().toLowerCase().replace(/\?$/, '');
            const field  = STAT_ALIASES[raw] || raw;
            const schema = PLAYER_STATS_SCHEMA[field];
            if (!schema) {
                // Try standings field
                return _standingsLeaderAnswer(raw);
            }
            const result = await StatsDB.getPlayerStatLeader(field, 5);
            if (!result || !result.length) return null;
            return {
                title: `${schema.label} Leaders`,
                subtitle: `${CURRENT_SEASON}–${String(CURRENT_SEASON+1).slice(-2)} season`,
                type: 'stat-leaders',
                field, schema,
                leaders: result,
            };
        }
    },

    // ── Team performance / rankings ───────────────────────────

    {   id: 'best-record',
        patterns: [/best\s+record/i, /most\s+wins/i, /who.*(?:leads?|first)\s+overall/i, /who.*best\s+team/i],
        handler: async () => {
            const top = await StatsDB.getTopStandings('wins', 5);
            if (!top.length) return null;
            return { title: 'Best Records in the NBA', type: 'standings-list', rows: top };
        }
    },

    {   id: 'best-offense',
        patterns: [/best\s+offense/i, /most\s+(?:points?\s+)?scoring/i, /highest\s+scoring\s+team/i, /most\s+ppg/i, /team.*most.*points/i],
        handler: async () => _teamStatLeaders('pointsPg', 'Best Offenses', 5),
    },

    {   id: 'best-defense',
        patterns: [/best\s+defense/i, /lowest?\s+(?:points?\s+)?allowed/i, /fewest\s+points?\s+allowed/i, /stingiest/i],
        handler: async () => _teamStatLeaders('oppPointsPg', 'Best Defenses (Fewest Allowed)', 5, true),
    },

    {   id: 'point-diff',
        patterns: [/point\s*(?:differential|diff)/i, /net\s+rating/i, /best\s+margin/i],
        handler: async () => _teamStatLeaders('diffPointsPg', 'Best Point Differentials', 5),
    },

    {   id: 'best-home',
        patterns: [/best\s+home\s+(?:record|team)/i, /home\s+court\s+advantage/i, /win.*at\s+home/i],
        handler: async () => {
            const all  = await StatsDB.getAllStandings();
            const top  = _sortByWinPct(all, 'home').slice(0, 5);
            return { title: 'Best Home Records', type: 'standings-list', rows: top, field: 'home' };
        }
    },

    {   id: 'best-road',
        patterns: [/best\s+road\s+(?:record|team)/i, /best\s+away\s+(?:record|team)/i, /best\s+on\s+the\s+road/i],
        handler: async () => {
            const all  = await StatsDB.getAllStandings();
            const top  = _sortByWinPct(all, 'road').slice(0, 5);
            return { title: 'Best Road Records', type: 'standings-list', rows: top, field: 'road' };
        }
    },

    {   id: 'win-streak',
        patterns: [/(?:longest|best|biggest)?\s*win\s+streak/i, /hot\s+streak/i, /who.*on.*(?:a\s+)?roll/i, /hottest\s+team/i],
        handler: async () => {
            const all     = await StatsDB.getAllStandings();
            const winning = all
                .filter(t => typeof t.streak === 'string' && t.streak.startsWith('W'))
                .sort((a, b) => _parseStreak(b.streak) - _parseStreak(a.streak))
                .slice(0, 5);
            if (!winning.length) return { title: 'Win Streaks', type: 'standings-list', rows: [] };
            return { title: 'Active Win Streaks', type: 'standings-list', rows: winning, field: 'streak' };
        }
    },

    {   id: 'loss-streak',
        patterns: [/(?:longest|worst|biggest)?\s*loss\s+streak/i, /cold\s+streak/i, /struggling/i, /worst\s+team/i, /who.*losing/i],
        handler: async () => {
            const all  = await StatsDB.getAllStandings();
            const rows = all
                .filter(t => typeof t.streak === 'string' && t.streak.startsWith('L'))
                .sort((a, b) => _parseStreak(b.streak) - _parseStreak(a.streak))
                .slice(0, 5);
            return { title: 'Active Losing Streaks', type: 'standings-list', rows: rows, field: 'streak' };
        }
    },

    // ── Clinch / elimination ──────────────────────────────────

    {   id: 'clinched',
        patterns: [/who.*clinched/i, /clinch.*playoff/i, /division.*winner/i],
        handler: async () => {
            const all = await StatsDB.getAllStandings();
            const clinched = all.filter(t => t.clinchedPO || t.clinchedDiv || t.clinchedConf);
            return {
                title: 'Clinched Teams',
                type: 'standings-list',
                rows: clinched.sort((a, b) => {
                    const va = a.clinchedConf ? 3 : a.clinchedDiv ? 2 : 1;
                    const vb = b.clinchedConf ? 3 : b.clinchedDiv ? 2 : 1;
                    return vb - va;
                }),
            };
        }
    },

    {   id: 'eliminated',
        patterns: [/who.*eliminated/i, /out\s+of\s+playoff/i, /mathematically\s+eliminated/i],
        handler: async () => {
            const rows = await StatsDB.getEliminatedTeams();
            return { title: 'Eliminated Teams', type: 'standings-list', rows };
        }
    },

    // ── Catch-all help ────────────────────────────────────────

    {   id: 'help',
        patterns: [/^help$/i, /what can you/i, /what do you know/i, /examples?/i, /^\?$/],
        handler: async () => ({ type: 'help' }),
    },
];

// ── Answer payload renderers ──────────────────────────────────

function _standingRow(rank, t) {
    const logo    = `https://a.espncdn.com/i/teamlogos/nba/500/${t.teamAbbr.toLowerCase()}.png`;
    const streak  = t.streak || '—';
    const strCls  = streak.startsWith('W') ? 'ask-streak--win' : 'ask-streak--loss';
    const clinch  = t.clinchedPO ? '<span class="clinch-badge clinch-badge--po" title="Clinched Playoff">x</span>'
                  : t.clinchedDiv ? '<span class="clinch-badge clinch-badge--div" title="Division">z</span>'
                  : '';
    return `
        <div class="ask-team-row" onclick="navigateTo('standings')">
            <span class="ask-rank">${rank}</span>
            <img class="ask-logo" src="${logo}" alt="" onerror="this.style.display='none'" loading="lazy">
            <span class="ask-team-name">${t.teamCity} ${t.teamName} ${clinch}</span>
            <span class="ask-record">${t.wins}–${t.losses}</span>
            <span class="ask-streak ${strCls}">${streak}</span>
        </div>`;
}

async function _confStandings(conf) {
    const rows = await StatsDB.getStandingsByConf(conf);
    if (!rows.length) return null;
    return {
        title: `${conf}ern Conference Standings`,
        type: 'standings-full',
        rows,
    };
}

function _teamCard(team) {
    return {
        title: `${team.teamCity} ${team.teamName}`,
        type: 'team-card',
        team,
    };
}

function _playerCard(player, stats) {
    return {
        title: player.fullName,
        type: 'player-card',
        player,
        stats,
    };
}

async function _teamStatLeaders(field, title, n, lowerIsBetter = false) {
    const rows = await StatsDB.getTopStandings(field, n, null, lowerIsBetter);
    return { title, type: 'standings-list', rows, field };
}

async function _standingsLeaderAnswer(raw) {
    // Try matching raw against standings fields
    const fieldMap = {
        'record':'wins','wins':'wins','losses':'losses',
        'home':'home','road':'road','away':'road',
        'offense':'pointsPg','scoring':'pointsPg','points':'pointsPg',
        'defense':'oppPointsPg','defensive':'oppPointsPg',
        'streak':'streak','win streak':'longWinStreak',
        'differential':'diffPointsPg',
    };
    const field = fieldMap[raw];
    if (!field) return null;
    const lowerBetter = ['losses','oppPointsPg','longLossStreak'].includes(field);
    const rows  = await StatsDB.getTopStandings(field, 5, null, lowerBetter);
    return { title: `${raw.charAt(0).toUpperCase() + raw.slice(1)} Leaders`, type: 'standings-list', rows, field };
}

// Parse "W5" → 5 or "L3" → 3
function _parseStreak(s) {
    return parseInt((s || '').replace(/[WL]/i, '')) || 0;
}

// Sort teams by the win/loss pct inside a split record string like "24-17"
function _sortByWinPct(rows, field) {
    return rows
        .filter(r => r[field])
        .map(r => {
            const [w, l] = String(r[field]).split('-').map(Number);
            return { ...r, _pct: w / ((w + l) || 1) };
        })
        .sort((a, b) => b._pct - a._pct);
}

// ── Render answer payloads as HTML ───────────────────────────

function _renderAnswer(payload) {
    if (!payload) return `<p class="ask-no-result">No data found for that question. Try one of the examples below.</p>`;

    switch (payload.type) {
        case 'help': return _renderHelp();
        case 'standings-full': return _renderStandingsFull(payload);
        case 'standings-list': return _renderStandingsList(payload);
        case 'two-col-list':   return _renderTwoCol(payload);
        case 'stat-leaders':   return _renderStatLeaders(payload);
        case 'team-card':      return _renderTeamCard(payload);
        case 'player-card':    return _renderPlayerCard(payload);
        case 'player-list':    return _renderPlayerList(payload);
        default: return '<p class="ask-no-result">Unknown answer type.</p>';
    }
}

function _renderHelp() {
    const examples = [
        ['Standings', 'East standings', 'Playoff teams', 'Play-in teams', 'Who\'s eliminated?'],
        ['Team info', 'Lakers record', 'Celtics standings', 'Nuggets roster'],
        ['Player stats', 'LeBron stats', 'Steph Curry stats', 'Giannis averaging'],
        ['Stat leaders', 'Who leads in points?', 'Top 5 rebounders', 'Best free throw shooter'],
        ['Team performance', 'Best home record', 'Best offense', 'Longest win streak'],
    ];
    return `
        <div class="ask-help">
            <p class="ask-help-intro">Ask anything about NBA stats. Here are some examples:</p>
            <div class="ask-help-grid">
                ${examples.map(([cat, ...qs]) => `
                    <div class="ask-help-group">
                        <div class="ask-help-cat">${cat}</div>
                        ${qs.map(q => `<button class="ask-example-chip" onclick="AskEngine.submit('${q}')">${q}</button>`).join('')}
                    </div>
                `).join('')}
            </div>
        </div>`;
}

function _renderStandingsFull(p) {
    const rows = p.rows;
    return `
        <div class="ask-standings-table">
            <div class="ask-standings-header">
                <span>#</span><span>Team</span><span>W</span><span>L</span><span>PCT</span><span>GB</span><span>L10</span><span>STRK</span>
            </div>
            ${rows.map((t, i) => {
                const rank     = i + 1;
                const logo     = `https://a.espncdn.com/i/teamlogos/nba/500/${t.teamAbbr.toLowerCase()}.png`;
                const streak   = t.streak || '—';
                const strCls   = streak.startsWith('W') ? 'ask-streak--win' : 'ask-streak--loss';
                const zoneCls  = rank <= 6 ? 'ask-row--playoff' : rank <= 10 ? 'ask-row--playin' : '';
                const clinch   = t.clinchedPO ? '<span class="clinch-badge clinch-badge--po">x</span>' : '';
                return `
                    <div class="ask-standings-row ${zoneCls}" onclick="navigateTo('standings')">
                        <span class="ask-rank">${rank}</span>
                        <div class="ask-team-cell">
                            <img class="ask-logo" src="${logo}" alt="" onerror="this.style.display='none'" loading="lazy">
                            <span>${t.teamName} ${clinch}</span>
                        </div>
                        <span>${t.wins}</span>
                        <span>${t.losses}</span>
                        <span>${t.pct?.toFixed ? t.pct.toFixed(3) : t.pct || '—'}</span>
                        <span>${!t.gb || t.gb === 0 ? '—' : t.gb}</span>
                        <span>${t.l10 || '—'}</span>
                        <span class="${strCls}">${streak}</span>
                    </div>`;
            }).join('')}
        </div>`;
}

function _renderStandingsList(p) {
    const { rows, field } = p;
    if (!rows.length) return `<p class="ask-no-result">No data available.</p>`;
    return `
        <div class="ask-list">
            ${rows.map((t, i) => {
                const logo   = `https://a.espncdn.com/i/teamlogos/nba/500/${t.teamAbbr.toLowerCase()}.png`;
                const val    = field ? (STANDINGS_SCHEMA[field]?.format?.(t[field]) ?? t[field] ?? '—') : `${t.wins}–${t.losses}`;
                const streak = t.streak || '';
                const strCls = streak.startsWith('W') ? 'ask-streak--win' : 'ask-streak--loss';
                const colors = getTeamColors(t.teamAbbr);
                return `
                    <div class="ask-list-row" onclick="navigateTo('standings')" style="border-left:3px solid ${colors.primary}66">
                        <span class="ask-rank">${i + 1}</span>
                        <img class="ask-logo" src="${logo}" alt="" onerror="this.style.display='none'" loading="lazy">
                        <span class="ask-team-name">${t.teamCity} ${t.teamName}</span>
                        <span class="ask-stat-val">${val}</span>
                        ${field !== 'streak' ? `<span class="ask-record">${t.wins}–${t.losses}</span>` : ''}
                        ${field !== 'streak' ? `<span class="${strCls}" style="font-size:0.75rem">${streak}</span>` : ''}
                    </div>`;
            }).join('')}
        </div>`;
}

function _renderTwoCol(p) {
    const col = (conf) => `
        <div class="ask-col">
            <div class="ask-col-head">${conf.heading}</div>
            ${conf.rows.map((t, i) => p.rowFn(t, i)).join('')}
        </div>`;
    return `<div class="ask-two-col">${col(p.left)}${col(p.right)}</div>`;
}

function _renderStatLeaders(p) {
    const { leaders, field, schema } = p;
    return `
        <div class="ask-list">
            ${leaders.map(({ player, stats }, i) => {
                const val    = schema.format(stats[field]);
                const abbr   = player.teamAbbr || '';
                const colors = getTeamColors(abbr);
                const logo   = `https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png`;
                const headshot = getESPNHeadshotUrl({ first_name: player.firstName, last_name: player.lastName });
                return `
                    <div class="ask-list-row" onclick="showPlayerDetail(${player.id})" style="border-left:3px solid ${colors.primary}66">
                        <span class="ask-rank">${i + 1}</span>
                        <div class="ask-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                            ${headshot ? `<img src="${headshot}" alt="" loading="lazy" onerror="this.style.display='none'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%">` : ''}
                            <span>${(player.firstName?.[0]||'')+(player.lastName?.[0]||'')}</span>
                        </div>
                        <div class="ask-player-info">
                            <span class="ask-player-name">${player.fullName}</span>
                            <div class="ask-player-meta">
                                <img class="ask-logo-sm" src="${logo}" alt="" onerror="this.style.display='none'" loading="lazy">
                                ${abbr} · ${player.position || ''}
                            </div>
                        </div>
                        <span class="ask-stat-val" style="color:${schema.color||'#f1f5f9'}">${val}</span>
                    </div>`;
            }).join('')}
        </div>`;
}

function _renderTeamCard(p) {
    const t      = p.team;
    const colors = getTeamColors(t.teamAbbr);
    const logo   = `https://a.espncdn.com/i/teamlogos/nba/500/${t.teamAbbr.toLowerCase()}.png`;
    const streak = t.streak || '—';
    const strCls = streak.startsWith('W') ? '#10b981' : '#f87171';

    const stats = [
        ['Record',   `${t.wins}–${t.losses}`, '#f1f5f9'],
        ['PCT',      t.pct?.toFixed ? t.pct.toFixed(3) : '—', '#f1f5f9'],
        ['Conf Rank',`#${t.rank} ${t.conference}`, 'var(--color-accent)'],
        ['Streak',    streak, strCls],
        ['Last 10',  t.l10 || '—', '#f1f5f9'],
        ['Home',     t.home || '—', '#10b981'],
        ['Road',     t.road || '—', '#94a3b8'],
        ...(t.pointsPg  ? [['PPG',    t.pointsPg?.toFixed(1),    'var(--color-pts)']] : []),
        ...(t.oppPointsPg ? [['Opp PPG', t.oppPointsPg?.toFixed(1), 'var(--color-reb)']] : []),
        ...(t.diffPointsPg != null ? [['Diff',  (t.diffPointsPg >= 0 ? '+' : '') + t.diffPointsPg?.toFixed(1), t.diffPointsPg >= 0 ? '#10b981' : '#f87171']] : []),
        ...(t.confRecord ? [['Conf',   t.confRecord, '#f1f5f9']] : []),
        ...(t.divRecord  ? [['Div',    t.divRecord,  '#f1f5f9']] : []),
    ];

    return `
        <div class="ask-team-card" style="border-top:3px solid ${colors.primary};cursor:pointer" onclick="navigateTo('standings')">
            <div class="ask-team-card-hero">
                <div class="ask-team-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                    <img src="${logo}" alt="" loading="lazy" onerror="this.style.display='none'" style="position:absolute;inset:4px;width:calc(100%-8px);height:calc(100%-8px);object-fit:contain">
                    <span>${t.teamAbbr}</span>
                </div>
                <div>
                    <h3 class="ask-team-hero-name">${t.teamCity} ${t.teamName}</h3>
                    <p class="ask-team-hero-sub">${t.division} Division · ${t.conference}ern Conference</p>
                </div>
            </div>
            <div class="ask-stat-grid">
                ${stats.map(([label, val, color]) => `
                    <div class="ask-stat-item">
                        <span class="ask-stat-label">${label}</span>
                        <span class="ask-stat-val" style="color:${color}">${val}</span>
                    </div>
                `).join('')}
            </div>
        </div>`;
}

function _renderPlayerCard(p) {
    const { player, stats } = p;
    const colors   = getTeamColors(player.teamAbbr);
    const headshot = getESPNHeadshotUrl({ first_name: player.firstName, last_name: player.lastName });
    const logo     = `https://a.espncdn.com/i/teamlogos/nba/500/${(player.teamAbbr||'').toLowerCase()}.png`;
    const fmt      = (s, f) => PLAYER_STATS_SCHEMA[f]?.format(s[f]) ?? '—';

    return `
        <div class="ask-player-detail" style="border-top:3px solid ${colors.primary};cursor:pointer" onclick="showPlayerDetail(${player.id})">
            <div class="ask-team-card-hero">
                <div class="ask-avatar ask-avatar--lg" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                    ${headshot ? `<img src="${headshot}" alt="" loading="lazy" onerror="this.style.display='none'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%">` : ''}
                    <span>${(player.firstName?.[0]||'')+(player.lastName?.[0]||'')}</span>
                </div>
                <div>
                    <h3 class="ask-team-hero-name">${player.fullName}</h3>
                    <p class="ask-team-hero-sub">
                        <img class="ask-logo-sm" src="${logo}" alt="" onerror="this.style.display='none'" loading="lazy">
                        ${player.teamName} · ${player.position || 'N/A'}
                    </p>
                </div>
            </div>
            <div class="ask-stat-grid">
                ${[
                    ['PPG',  fmt(stats,'pts'),      'var(--color-pts)'],
                    ['RPG',  fmt(stats,'reb'),       'var(--color-reb)'],
                    ['APG',  fmt(stats,'ast'),       'var(--color-ast)'],
                    ['SPG',  fmt(stats,'stl'),       'var(--color-stl)'],
                    ['BPG',  fmt(stats,'blk'),       'var(--color-blk)'],
                    ['TOV',  fmt(stats,'turnover'),  '#f87171'],
                    ['FG%',  fmt(stats,'fg_pct'),    'var(--color-pct)'],
                    ['3P%',  fmt(stats,'fg3_pct'),   '#818cf8'],
                    ['FT%',  fmt(stats,'ft_pct'),    '#38bdf8'],
                    ['MIN',  fmt(stats,'min'),        '#94a3b8'],
                    ['GP',   stats.games_played ?? '—', '#64748b'],
                ].map(([l, v, c]) => `
                    <div class="ask-stat-item">
                        <span class="ask-stat-label">${l}</span>
                        <span class="ask-stat-val" style="color:${c}">${v ?? '—'}</span>
                    </div>
                `).join('')}
            </div>
            <p class="ask-tap-hint">Tap to view full profile →</p>
        </div>`;
}

function _renderPlayerList(p) {
    return `
        <div class="ask-list">
            ${p.rows.map(({ player, stats }, i) => {
                const headshot = getESPNHeadshotUrl({ first_name: player.firstName, last_name: player.lastName });
                const colors   = getTeamColors(player.teamAbbr || '');
                const pts      = stats?.pts?.toFixed(1) || '—';
                const reb      = stats?.reb?.toFixed(1) || '—';
                const ast      = stats?.ast?.toFixed(1) || '—';
                return `
                    <div class="ask-list-row" onclick="showPlayerDetail(${player.id})" style="border-left:3px solid ${colors.primary}66">
                        <span class="ask-rank">${i + 1}</span>
                        <div class="ask-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                            ${headshot ? `<img src="${headshot}" alt="" loading="lazy" onerror="this.style.display='none'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%">` : ''}
                            <span>${(player.firstName?.[0]||'')+(player.lastName?.[0]||'')}</span>
                        </div>
                        <div class="ask-player-info">
                            <span class="ask-player-name">${player.fullName}</span>
                            <span class="ask-player-meta">${player.position || 'N/A'}</span>
                        </div>
                        <div class="ask-mini-stats">
                            <span style="color:var(--color-pts)">${pts}</span>
                            <span style="color:var(--color-reb)">${reb}</span>
                            <span style="color:var(--color-ast)">${ast}</span>
                        </div>
                    </div>`;
            }).join('')}
        </div>`;
}

// ── Core Q&A processor ────────────────────────────────────────

const AskEngine = (() => {

    async function query(question) {
        const q = String(question).trim();
        if (!q) return null;

        // Ensure IndexedDB is seeded with latest AppState data
        await _ensureData();

        // Test each pattern in order
        for (const entry of ASK_PATTERNS) {
            for (const pattern of entry.patterns) {
                const m = q.match(pattern);
                if (m) {
                    try {
                        const payload = await entry.handler(m);
                        if (payload) return { payload, answerId: entry.id };
                    } catch (err) {
                        Logger.warn(`Ask handler "${entry.id}" failed`, err.message, 'ASK');
                    }
                }
            }
        }

        // No pattern matched → try a fuzzy team / player name lookup
        return _fuzzyFallback(q);
    }

    async function _fuzzyFallback(q) {
        const norm = q.toLowerCase().trim();

        // Team abbreviation / alias?
        const abbr = TEAM_ALIASES[norm];
        if (abbr) {
            const team = await StatsDB.getTeamStandings(abbr);
            if (team) return { payload: _teamCard(team), answerId: 'team-card' };
        }

        // Player name?
        const player = await StatsDB.getPlayerByName(q);
        if (player) {
            const stats = await StatsDB.getPlayerStats(player.id);
            if (stats) return { payload: _playerCard(player, stats), answerId: 'player-card' };
        }

        return null;
    }

    async function _ensureData() {
        // Push AppState → IndexedDB whenever standings / players are loaded
        const standings = AppState.nbaStandings;
        if (standings?.length) {
            await StatsDB.syncStandings(standings);
        }
        if (AppState.allPlayers?.length) {
            await StatsDB.syncPlayers(AppState.allPlayers, AppState.nbaStatsMap);
        }
        if (AppState.allGames?.length) {
            await StatsDB.syncGames(AppState.allGames);
        }
    }

    // Called when user hits Enter or Submit in the Ask overlay
    async function submit(question) {
        const input = document.getElementById('askInput');
        const out   = document.getElementById('askOutput');
        if (!out) return;

        const q = question || (input?.value || '').trim();
        if (!q) return;
        if (input) input.value = q;

        out.innerHTML = `<div class="ask-loading"><div class="loading-spinner" style="margin:0 auto"></div><p>Searching…</p></div>`;

        const result = await query(q);

        if (!result) {
            out.innerHTML = `
                <div class="ask-no-result-wrap">
                    <p class="ask-no-result">No results found for "<strong>${_esc(q)}</strong>".</p>
                    <p class="ask-no-result-hint">Try asking about a player name, team name, or stat category.</p>
                    ${_renderHelp()}
                </div>`;
            return;
        }

        out.innerHTML = `
            <div class="ask-answer">
                ${result.payload.title ? `<h3 class="ask-answer-title">${result.payload.title}</h3>` : ''}
                ${result.payload.subtitle ? `<p class="ask-answer-sub">${result.payload.subtitle}</p>` : ''}
                ${_renderAnswer(result.payload)}
            </div>`;
    }

    function _esc(s) {
        return String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function openPanel() {
        const panel = document.getElementById('askPanel');
        if (!panel) return;
        panel.classList.add('ask-panel--open');
        setTimeout(() => document.getElementById('askInput')?.focus(), 80);
        // Show help by default
        const out = document.getElementById('askOutput');
        if (out && !out.innerHTML.trim()) {
            out.innerHTML = _renderHelp();
        }
    }

    function closePanel() {
        document.getElementById('askPanel')?.classList.remove('ask-panel--open');
    }

    function togglePanel() {
        const panel = document.getElementById('askPanel');
        if (!panel) return;
        panel.classList.contains('ask-panel--open') ? closePanel() : openPanel();
    }

    return { query, submit, openPanel, closePanel, togglePanel };
})();

if (typeof window !== 'undefined') {
    window.AskEngine = AskEngine;
    window.ASK_PATTERNS = ASK_PATTERNS;
}
