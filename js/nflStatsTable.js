// ============================================================
// NFLStatsTable — pure logic behind the NFL Stats page (#nfl-leaders).
// No DOM, no fetch: js/nfl.js fetches ESPN's byathlete table and renders.
// Columns are keyed `group.field` by ESPN's own `names`, never by label or
// position: the defense table spans three groups, `sacks` exists in two, and
// ESPN repeats labels (QBR twice). Tests: tests/nflStatsTable.test.js.
// ============================================================
const NFLStatsTable = (() => {
    const ENDPOINT = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete';
    const GP_KEY = 'general.gamesPlayed';
    const MIN_GP = 5;
    const GP = { k: GP_KEY, l: 'GP', rate: true, noShade: true };
    const c = (k, l, o = {}) => ({ k, l, ...o });

    const CATEGORIES = [
        { id: 'passing', label: 'Passing', espn: 'offense:passing', toggle: true, sort: 'passing.passingYards', pos: [],
          lead: ['passing.passingYards', 'passing.passingTouchdowns', 'passing.QBRating'],
          cols: [GP, c('passing.completions', 'CMP'), c('passing.passingAttempts', 'ATT'),
              c('passing.completionPct', 'CMP%', { rate: true, d: 1 }), c('passing.passingYards', 'YDS'),
              c('passing.yardsPerPassAttempt', 'Y/A', { rate: true, d: 1 }), c('passing.passingYardsPerGame', 'YDS/G', { rate: true, d: 1 }),
              c('passing.passingTouchdowns', 'TD'), c('passing.interceptions', 'INT', { low: true }),
              c('passing.sacks', 'SACK', { low: true }), c('passing.QBRating', 'RTG', { rate: true, d: 1 }),
              c('passing.adjQBR', 'QBR', { rate: true, d: 1 })] },
        { id: 'rushing', label: 'Rushing', espn: 'offense:rushing', toggle: true, sort: 'rushing.rushingYards', pos: ['RB', 'QB', 'WR'],
          lead: ['rushing.rushingYards', 'rushing.rushingTouchdowns', 'rushing.rushingYardsPerGame'],
          cols: [GP, c('rushing.rushingAttempts', 'CAR'), c('rushing.rushingYards', 'YDS'),
              c('rushing.yardsPerRushAttempt', 'AVG', { rate: true, d: 1 }), c('rushing.rushingYardsPerGame', 'YDS/G', { rate: true, d: 1 }),
              c('rushing.longRushing', 'LNG', { rate: true }), c('rushing.rushingTouchdowns', 'TD'),
              c('rushing.rushingFumbles', 'FUM', { low: true }), c('rushing.rushingFirstDowns', 'FD')] },
        { id: 'receiving', label: 'Receiving', espn: 'offense:receiving', toggle: true, sort: 'receiving.receivingYards', pos: ['WR', 'TE', 'RB'],
          lead: ['receiving.receptions', 'receiving.receivingYards', 'receiving.receivingTouchdowns'],
          cols: [GP, c('receiving.receptions', 'REC'), c('receiving.receivingTargets', 'TGT'), c('receiving.receivingYards', 'YDS'),
              c('receiving.yardsPerReception', 'AVG', { rate: true, d: 1 }), c('receiving.receivingYardsPerGame', 'YDS/G', { rate: true, d: 1 }),
              c('receiving.receivingTouchdowns', 'TD'), c('receiving.longReception', 'LNG', { rate: true }),
              c('receiving.receivingYardsAfterCatch', 'YAC'), c('receiving.receivingFirstDowns', 'FD')] },
        { id: 'defense', label: 'Defense', espn: 'defense', toggle: false, sort: 'defensive.totalTackles', pos: ['DL', 'LB', 'DB'],
          posGroups: { DL: ['DE', 'DT', 'NT', 'DL'], LB: ['LB', 'OLB', 'ILB', 'MLB'], DB: ['CB', 'S', 'SS', 'FS', 'DB'] },
          lead: ['defensive.sacks', 'defensive.totalTackles', 'defensiveinterceptions.interceptions'],
          cols: [GP, c('defensive.totalTackles', 'TOT'), c('defensive.soloTackles', 'SOLO'), c('defensive.sacks', 'SACK'),
              c('defensive.tacklesForLoss', 'TFL'), c('defensive.passesDefended', 'PD'),
              c('defensiveinterceptions.interceptions', 'INT'), c('general.fumblesForced', 'FF')] },
        { id: 'kicking', label: 'Kicking', espn: 'specialTeams:kicking', toggle: false, sort: 'kicking.fieldGoalsMade', pos: [],
          lead: ['kicking.fieldGoalsMade', 'kicking.fieldGoalPct', 'kicking.longFieldGoalMade'],
          cols: [GP, c('kicking.fieldGoalsMade', 'FGM'), c('kicking.fieldGoalAttempts', 'FGA'),
              c('kicking.fieldGoalPct', 'FG%', { rate: true, d: 1 }), c('kicking.longFieldGoalMade', 'LNG', { rate: true }),
              c('kicking.fieldGoalsMade50', '50+'), c('kicking.extraPointsMade', 'XPM'), c('kicking.extraPointAttempts', 'XPA')] },
        { id: 'scoring', label: 'Scoring', espn: 'scoring', toggle: false, sort: 'scoring.totalPoints', pos: [],
          lead: ['scoring.totalPoints', 'scoring.totalTouchdowns'],
          cols: [GP, c('scoring.totalTouchdowns', 'TD'), c('scoring.fieldGoals', 'FG'), c('scoring.kickExtraPoints', 'PAT'),
              c('scoring.totalTwoPointConvs', '2PT'), c('scoring.totalPoints', 'PTS'),
              c('scoring.totalPointsPerGame', 'TP/G', { rate: true, d: 1 })] },
    ];
    // ESPN's defense list also carries every receiver, kicker and long snapper
    // with a special-teams tackle; they'd flood the table and drag the curve.
    const def = CATEGORIES.find(x => x.id === 'defense');
    def.onlyPos = Object.values(def.posGroups).flat();
    const category = id => CATEGORIES.find(x => x.id === id) || CATEGORIES[0];

    // 1,000 is ESPN's page cap (defense runs ~1,300); the caller reads
    // pagination.pages and asks for the rest.
    function url(catId, season, qualified, page = 1) {
        const cat = category(catId);
        const p = new URLSearchParams({ region: 'us', lang: 'en', contentorigin: 'espn', seasontype: '2', season: String(season),
            limit: '1000', isqualified: String(!!qualified), category: cat.espn, sort: `${cat.sort}:desc` });
        if (page > 1) p.set('page', String(page));
        return `${ENDPOINT}?${p}`;
    }

    function num(v) {
        if (v == null) return null;
        const s = String(v).replace(/,/g, '').replace(/t$/i, '').trim();
        if (s === '' || /^-+$/.test(s)) return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }

    function parse(json, catId) {
        const cat = category(catId);
        const at = {};
        for (const g of (json && json.categories) || []) (g.names || []).forEach((n, i) => { at[`${g.name}.${n}`] = [g.name, i]; });
        const cols = cat.cols.filter(col => at[col.k]);
        const dropped = cat.cols.filter(col => !at[col.k]).map(col => col.k);
        const rows = ((json && json.athletes) || []).map(a => {
            const ath = a.athlete || {};
            const totals = {};
            for (const g of a.categories || []) totals[g.name] = g.totals || [];
            const v = {};
            for (const col of cols) { const [g, i] = at[col.k]; v[col.k] = num((totals[g] || [])[i]); }
            return { id: String(ath.id || ''), name: ath.displayName || '', team: ath.teamShortName || '',
                pos: (ath.position && ath.position.abbreviation) || '', headshot: (ath.headshot && ath.headshot.href) || '', v };
        }).filter(r => r.id && r.name && (!cat.onlyPos || cat.onlyPos.includes(r.pos)));
        return { cols, dropped, rows };
    }

    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    function filterRows(rows, { q = '', team = '', pos = '', cat: catId } = {}) {
        const cat = category(catId), nq = norm(q);
        const group = pos && cat.posGroups && cat.posGroups[pos];
        return rows.filter(r => (!team || r.team === team)
            && (!pos || (group ? group.includes(r.pos) : r.pos === pos))
            && (!nq || norm(r.name).includes(nq)));
    }

    function perGame(rows, cols) {
        return rows.map(r => {
            const gp = r.v[GP_KEY], v = { ...r.v };
            for (const col of cols) if (!col.rate && v[col.k] != null) v[col.k] = gp ? v[col.k] / gp : null;
            return { ...r, v };
        });
    }

    function sortRows(rows, key, dir) {
        const m = dir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const x = a.v[key], y = b.v[key];
            if (x == null || y == null) return (x == null) - (y == null) || a.name.localeCompare(b.name);
            return (x - y) * m || a.name.localeCompare(b.name);
        });
    }
    const defaultDir = col => (col && col.low ? 'asc' : 'desc');

    // Ranked only among qualified players with MIN_GP+ games, so a 1-for-1
    // backup never paints as the league's best completion rate.
    function percentiles(rows, cols, poolIds) {
        const pool = rows.filter(r => poolIds.has(r.id) && (r.v[GP_KEY] || 0) >= MIN_GP);
        const out = {};
        for (const col of cols) {
            if (col.noShade) continue;
            const vals = pool.map(r => r.v[col.k]).filter(x => x != null).sort((a, b) => a - b);
            if (vals.length < 5) continue;
            for (const r of pool) {
                const x = r.v[col.k];
                if (x == null) continue;
                let below = 0, eq = 0;
                for (const y of vals) { if (y < x) below++; else if (y === x) eq++; }
                const p = (below + eq / 2) / vals.length;
                (out[r.id] = out[r.id] || {})[col.k] = col.low ? 1 - p : p;
            }
        }
        return out;
    }
    const tier = p => (p == null ? '' : p >= 0.9 ? 'hi2' : p >= 0.75 ? 'hi1' : p <= 0.1 ? 'lo2' : p <= 0.25 ? 'lo1' : '');

    function leaders(rows, catId, poolIds) {
        const cat = category(catId);
        const pool = rows.filter(r => poolIds.has(r.id));
        return cat.lead.map(k => {
            const col = cat.cols.find(x => x.k === k);
            const top = col ? sortRows(pool.filter(r => r.v[k] != null), k, defaultDir(col)).slice(0, 3) : [];
            return top.length ? { col, top } : null;
        }).filter(Boolean);
    }

    // ESPN row → the full Sleeper-keyed player page. Name + team first; then the
    // name alone if exactly one pool player has it (ESPN keeps a traded or cut
    // player under his old team). Namesakes never get a guess: ESPN page instead.
    function linker(pool, aliasTeam = a => a) {
        const key = x => String(x || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
        const byTeam = new Map(), byName = new Map();
        for (const p of pool || []) {
            const n = key(p.full_name), t = `${n}|${p.team || ''}`;
            byTeam.set(t, byTeam.has(t) ? null : p.player_id);
            byName.set(n, byName.has(n) ? null : p.player_id);
        }
        return r => {
            const n = key(r.name);
            const sid = byTeam.get(`${n}|${aliasTeam(r.team)}`) || byName.get(n);
            return sid ? `nfl-player-${sid}` : `nfl-player-espn-${r.id}`;
        };
    }

    const VIEW_RE = /^nfl-leaders(?:-(passing|rushing|receiving|defense|kicking|scoring))?(?:~([A-Za-z0-9]+\.[A-Za-z0-9_]+)-(asc|desc))?$/;
    function parseView(view) {
        const m = VIEW_RE.exec(String(view || ''));
        return m ? { cat: m[1] || 'passing', sort: m[2] || null, dir: m[3] || null } : null;
    }
    function viewFor({ cat = 'passing', sort = null, dir = null } = {}) {
        return 'nfl-leaders' + (cat === 'passing' ? '' : '-' + cat) + (sort && dir ? `~${sort}-${dir}` : '');
    }

    function fmt(col, x, perGameMode) {
        if (x == null) return '—';
        if (perGameMode && !col.rate) return x.toFixed(1);
        if (col.d) return x.toFixed(col.d);
        return Number.isInteger(x) ? x.toLocaleString('en-US') : x.toFixed(1);
    }

    return { ENDPOINT, GP_KEY, MIN_GP, CATEGORIES, category, url, num, parse, filterRows, perGame,
        sortRows, defaultDir, percentiles, tier, leaders, linker, parseView, viewFor, fmt };
})();
