// ============================================================
// StatsDB — IndexedDB-backed local data store
// Persists standings, player, and game data across sessions.
// Provides typed query methods used by the Q&A engine.
// ============================================================

const StatsDB = (() => {
    const DB_NAME    = 'zohn-stats-db';
    const DB_VERSION = 1;

    let _db = null;

    // ── Open / initialise ────────────────────────────────────

    function open() {
        if (_db) return Promise.resolve(_db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = e => {
                const db = e.target.result;

                if (!db.objectStoreNames.contains('standings')) {
                    const s = db.createObjectStore('standings', { keyPath: 'teamId' });
                    s.createIndex('conference', 'conference', { unique: false });
                    s.createIndex('teamAbbr',   'teamAbbr',   { unique: true  });
                    s.createIndex('rank',        'rank',       { unique: false });
                }

                if (!db.objectStoreNames.contains('players')) {
                    const p = db.createObjectStore('players', { keyPath: 'id' });
                    p.createIndex('teamAbbr', 'teamAbbr', { unique: false });
                    p.createIndex('position', 'position', { unique: false });
                }

                if (!db.objectStoreNames.contains('stats')) {
                    db.createObjectStore('stats', { keyPath: 'playerId' });
                }

                if (!db.objectStoreNames.contains('games')) {
                    const g = db.createObjectStore('games', { keyPath: 'id' });
                    g.createIndex('date',   'date',   { unique: false });
                    g.createIndex('status', 'status', { unique: false });
                }

                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }
            };

            req.onsuccess = e => { _db = e.target.result; resolve(_db); };
            req.onerror   = e => reject(e.target.error);
        });
    }

    // ── Generic CRUD ─────────────────────────────────────────

    async function putMany(storeName, items) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            items.forEach(item => store.put({ ...item, _ts: Date.now() }));
            tx.oncomplete = () => resolve(items.length);
            tx.onerror    = e => reject(e.target.error);
        });
    }

    async function put(storeName, item) {
        return putMany(storeName, [item]);
    }

    async function getAll(storeName) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = e => resolve(e.target.result || []);
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function getOne(storeName, key) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = e => resolve(e.target.result || null);
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function getByIndex(storeName, indexName, value) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).index(indexName).getAll(value);
            req.onsuccess = e => resolve(e.target.result || []);
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function clearStore(storeName) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(storeName, 'readwrite');
            const req = tx.objectStore(storeName).clear();
            req.onsuccess = () => resolve();
            req.onerror   = e => reject(e.target.error);
        });
    }

    // ── Meta (timestamp / version tracking) ──────────────────

    async function getMeta(key) {
        const row = await getOne('meta', key);
        return row ? row.value : null;
    }

    async function setMeta(key, value) {
        return put('meta', { key, value, _ts: Date.now() });
    }

    async function isFresh(key, ttlMs) {
        const row = await getOne('meta', key);
        if (!row) return false;
        return (Date.now() - row._ts) < ttlMs;
    }

    // ── Sync from AppState → IndexedDB ───────────────────────

    async function syncStandings(rows) {
        if (!rows || rows.length === 0) return;
        // Normalize teamAbbr to uppercase so getTeamByAbbr lookups always match
        const normalized = rows.map(r => ({
            ...r,
            teamAbbr: (r.teamAbbr || '').toUpperCase(),
        }));
        await putMany('standings', normalized);
        await setMeta('standings_sync', Date.now());
        Logger.info(`StatsDB: synced ${rows.length} standings rows`, undefined, 'DB');
    }

    async function syncPlayers(players, statsMap) {
        if (!players || players.length === 0) return;
        // Store player roster data
        const playerRows = players.map(p => ({
            id:       p.id,
            firstName: p.first_name,
            lastName:  p.last_name,
            fullName: `${p.first_name} ${p.last_name}`,
            position: p.position || '',
            teamAbbr: (p.team?.abbreviation || '').toUpperCase(),
            teamId:   p.team?.id,
            teamName: p.team?.full_name || '',
        }));
        await putMany('players', playerRows);

        // Store stats separately with player ID as key
        if (statsMap) {
            const statRows = players
                .map(p => {
                    const key  = `${p.first_name} ${p.last_name}`.toLowerCase();
                    const stat = statsMap[key];
                    if (!stat) return null;
                    return { playerId: p.id, ...stat };
                })
                .filter(Boolean);
            if (statRows.length) await putMany('stats', statRows);
        }

        await setMeta('players_sync', Date.now());
        Logger.info(`StatsDB: synced ${playerRows.length} players`, undefined, 'DB');
    }

    async function syncGames(games) {
        if (!games || games.length === 0) return;
        const rows = games.map(g => ({
            id:         g.id,
            date:       g.date,
            status:     g.status,
            homeTeam:   g.home_team?.abbreviation,
            awayTeam:   g.visitor_team?.abbreviation,
            homeScore:  g.home_team_score,
            awayScore:  g.visitor_team_score,
        }));
        await putMany('games', rows);
        await setMeta('games_sync', Date.now());
    }

    // ── Typed query methods ───────────────────────────────────

    async function getStandingsByConf(conf) {
        const rows = await getByIndex('standings', 'conference', conf);
        return rows.sort((a, b) => a.rank - b.rank);
    }

    async function getTeamByAbbr(abbr) {
        const rows = await getByIndex('standings', 'teamAbbr', abbr.toUpperCase());
        return rows[0] || null;
    }

    async function getTeamStandings(abbrOrAlias) {
        const norm = String(abbrOrAlias).toLowerCase();
        const abbr = (window.TEAM_ALIASES?.[norm] || norm).toUpperCase();
        return getTeamByAbbr(abbr);
    }

    async function getAllStandings() {
        return getAll('standings');
    }

    async function getPlayoffTeams() {
        const all = await getAll('standings');
        return all.filter(r => r.rank >= 1 && r.rank <= 6);
    }

    async function getPlayInTeams() {
        const all = await getAll('standings');
        return all.filter(r => r.rank >= 7 && r.rank <= 10);
    }

    async function getEliminatedTeams() {
        const all = await getAll('standings');
        return all.filter(r => r.eliminated || r.rank > 10);
    }

    async function getStandingsLeader(field, conf, lowerIsBetter = false) {
        let rows = conf ? await getStandingsByConf(conf) : await getAll('standings');
        rows = rows.filter(r => r[field] != null);
        rows.sort((a, b) => lowerIsBetter
            ? a[field] - b[field]
            : b[field] - a[field]);
        return rows[0] || null;
    }

    async function getTopStandings(field, n, conf, lowerIsBetter = false) {
        let rows = conf ? await getStandingsByConf(conf) : await getAll('standings');
        rows = rows.filter(r => r[field] != null);
        rows.sort((a, b) => lowerIsBetter
            ? a[field] - b[field]
            : b[field] - a[field]);
        return rows.slice(0, n);
    }

    async function getPlayerByName(query) {
        const q   = query.toLowerCase().trim();
        const all = await getAll('players');
        // Exact full name match first, then partial
        return all.find(p => p.fullName.toLowerCase() === q)
            || all.find(p => p.lastName.toLowerCase() === q)
            || all.find(p => p.firstName.toLowerCase() === q)
            || all.find(p => p.fullName.toLowerCase().includes(q))
            || null;
    }

    async function getPlayerStats(playerId) {
        return getOne('stats', playerId);
    }

    async function getPlayerStatLeader(statField, n = 1) {
        const [players, stats] = await Promise.all([getAll('players'), getAll('stats')]);
        const sm = {};
        stats.forEach(s => { sm[s.playerId] = s; });
        const sorted = players
            .filter(p => sm[p.id]?.[statField] != null)
            .sort((a, b) => sm[b.id][statField] - sm[a.id][statField]);
        if (n === 1) return sorted[0] ? { player: sorted[0], stats: sm[sorted[0].id] } : null;
        return sorted.slice(0, n).map(p => ({ player: p, stats: sm[p.id] }));
    }

    async function getPlayersByTeam(abbr) {
        const rows  = await getByIndex('players', 'teamAbbr', abbr.toUpperCase());
        const stats = await getAll('stats');
        const sm    = {};
        stats.forEach(s => { sm[s.playerId] = s; });
        return rows.map(p => ({ player: p, stats: sm[p.id] || null }));
    }

    async function getRecentGames(teamAbbr, n = 5) {
        const all = await getAll('games');
        return all
            .filter(g => g.homeTeam === teamAbbr || g.awayTeam === teamAbbr)
            .filter(g => g.status?.includes('Final'))
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, n);
    }

    // ── Diagnostics ───────────────────────────────────────────

    async function storeCounts() {
        const [s, p, stats, g] = await Promise.all([
            getAll('standings'), getAll('players'), getAll('stats'), getAll('games'),
        ]);
        return { standings: s.length, players: p.length, stats: stats.length, games: g.length };
    }

    async function lastSync() {
        const [s, p, g] = await Promise.all([
            getMeta('standings_sync'), getMeta('players_sync'), getMeta('games_sync'),
        ]);
        const fmt = ts => ts ? new Date(ts).toLocaleTimeString() : 'never';
        return { standings: fmt(s), players: fmt(p), games: fmt(g) };
    }

    // ── Public API ────────────────────────────────────────────

    return {
        // Core
        open, put, putMany, getAll, getOne, getByIndex, clearStore,
        // Meta
        getMeta, setMeta, isFresh,
        // Sync
        syncStandings, syncPlayers, syncGames,
        // Standings queries
        getStandingsByConf, getTeamByAbbr, getTeamStandings,
        getAllStandings, getPlayoffTeams, getPlayInTeams,
        getEliminatedTeams, getStandingsLeader, getTopStandings,
        // Player queries
        getPlayerByName, getPlayerStats, getPlayerStatLeader, getPlayersByTeam,
        // Game queries
        getRecentGames,
        // Diagnostics
        storeCounts, lastSync,
    };
})();

if (typeof window !== 'undefined') {
    window.StatsDB = StatsDB;
}
