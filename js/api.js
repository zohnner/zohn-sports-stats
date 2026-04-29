// ============================================================
// CONFIGURATION
//
// Development: set BDL_API_KEY directly (fetches from balldontlie.io).
// Production:  set BDL_PROXY_URL to your Cloudflare Worker URL and
//              clear BDL_API_KEY — the Worker holds the key server-side.
//
// Example:
//   const BDL_PROXY_URL = 'https://sportstrata-proxy.your-subdomain.workers.dev';
// ============================================================
const BDL_API_KEY  = '857bec7d-aada-496f-abb1-79b16926fb37';
const BDL_PROXY_URL       = ''; // Set to Worker URL in production to hide API key
const BROADCAST_BLURB_URL = ''; // Set to broadcast-blurb Worker URL to enable AI blurbs

const BDL_BASE_URL = BDL_PROXY_URL ? `${BDL_PROXY_URL}/bdl` : 'https://api.balldontlie.io/v1';
let CURRENT_SEASON = 2025; // BDL uses the year the season starts — mutable via season selector

// ============================================================
// App State
// ============================================================
const AppState = {
    // NBA
    allPlayers: [],
    allTeams: [],
    allGames: [],
    playerStats: {},        // keyed by player id
    filteredPlayers: [],
    currentView: 'mlb-players',
    currentSport: 'mlb',
    savedStats: [],
    selectedPlayer: null,
    positionFilter: 'all',
    espnPlayerMap: null,    // name-key → ESPN athlete ID (loaded async on startup)
    nbaStatsMap:   null,    // lowercase name → stat object (from NBA.com, loaded once per season)
    _nbaStatsSeason: null,
    nbaStandings: null,     // array of team standing rows from leaguestandingsv3
    _teamRecentGames: {},   // teamId → array of recent games (cached per session)
    ppgRankMap: {},         // playerId → PPG rank across all loaded players (built once after stats load)
    nbaLeaderMinGP: 0,      // minimum games played filter on NBA leaderboards (0 = All)
    nbaLeaderPosition: 'all', // position filter on NBA leaderboards
    nbaFantasyOverlay: false, // show DraftKings FP badges and fantasy score panel
    // MLB — seeded here so fields exist before mlb.js loads
    mlbTeams:              [],
    mlbPlayers:            { hitting: [], pitching: [] },
    mlbPlayerStats:        { hitting: {}, pitching: {} },
    mlbGames:              [],
    mlbStatsGroup:         'hitting',
    mlbPositionFilter:     'all',
    mlbSearchQuery:        '',
    mlbLeaderMinGP:        0,
    mlbLeaderPosition:     'all',
    mlbLeaderSeason:       null,
    mlbLeaderSplits:       null,
    mlbStandings:          null,
    _mlbStandingsLeague:   'AL',
    _mlbTeamRecentGames:   {},
    _mlbTeamRosters:       {},
    // NFL
    nflTeams:     [],
    nflGames:     [],
    nflStandings: null,
    // NHL
    nhlTeams:     [],
    nhlGames:     [],
    nhlStandings: null,
    // Favorites — persisted to localStorage
    favorites: new Set((() => { try { return JSON.parse(localStorage.getItem('zs_favs') || '[]'); } catch (_) { return []; } })()),
};

// ── Favorites helpers ─────────────────────────────────────────

function isFavorite(id) {
    return AppState.favorites.has(id);
}

function toggleFavorite(id, btnEl) {
    if (AppState.favorites.has(id)) AppState.favorites.delete(id);
    else AppState.favorites.add(id);
    try { localStorage.setItem('zs_favs', JSON.stringify([...AppState.favorites])); } catch (_) {}
    if (btnEl) {
        const active = AppState.favorites.has(id);
        btnEl.classList.toggle('fav-btn--active', active);
        btnEl.setAttribute('aria-label', active ? 'Remove from favorites' : 'Add to favorites');
        btnEl.title = active ? 'Remove from favorites' : 'Add to favorites';
    }
}

if (typeof window !== 'undefined') {
    window.isFavorite     = isFavorite;
    window.toggleFavorite = toggleFavorite;
}

// ============================================================
// Core fetch helper — with caching and exponential-backoff retry
//
// Options:
//   cache   {boolean} — read/write ApiCache (default: true)
//   ttl     {number}  — cache TTL in ms (default: ApiCache.TTL.MEDIUM)
//   retries {number}  — max retries on 429 / network error (default: 2)
// ============================================================
async function bdlFetch(endpoint, params = {}, { cache = true, ttl, retries = 2 } = {}) {
    if (!BDL_API_KEY || BDL_API_KEY === 'YOUR_API_KEY_HERE') {
        throw new Error(
            'API key not configured. ' +
            'Get a free key at balldontlie.io and add it to js/api.js'
        );
    }

    const url = new URL(`${BDL_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach(v => url.searchParams.append(`${key}[]`, v));
        } else {
            url.searchParams.set(key, value);
        }
    });

    const cacheKey = url.pathname + url.search;

    // ── Cache read ──────────────────────────────────────────
    if (cache) {
        const hit = ApiCache.get(cacheKey);
        if (hit) return hit;
    }

    Logger.debug(`→ ${url.pathname}${url.search}`, undefined, 'API');

    // ── Fetch with retry ────────────────────────────────────
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) {
            const delay = Math.pow(2, attempt - 1) * 1000; // 1 s, 2 s, 4 s…
            Logger.warn(`Retry ${attempt}/${retries} in ${delay}ms — ${endpoint}`, undefined, 'API');
            await new Promise(r => setTimeout(r, delay));
        }

        // When using the proxy the Worker adds Authorization server-side — don't expose the key client-side
        const fetchHeaders = BDL_PROXY_URL ? {} : { 'Authorization': BDL_API_KEY };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        let response;
        try {
            response = await fetch(url.toString(), { headers: fetchHeaders, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }

        // Hard failures — don't retry
        if (response.status === 401) {
            const body = await response.json().catch(() => ({}));
            throw new Error(`Unauthorized (401): ${body?.error || 'Check your API key in js/api.js'}`);
        }
        if (!response.ok && response.status !== 429) {
            throw new Error(`API error ${response.status}: ${response.statusText}`);
        }

        // Rate-limit — retry if we have attempts left
        if (response.status === 429) {
            if (attempt < retries) continue;
            throw new Error('Rate limit hit — please wait a moment and try again.');
        }

        // ── Success ────────────────────────────────────────
        const json = await response.json();
        Logger.debug(`← ${url.pathname} — ${json.data?.length ?? '?'} records`, undefined, 'API');

        if (cache) {
            ApiCache.set(cacheKey, json, ttl ?? ApiCache.TTL.MEDIUM);
        }

        return json;
    }

    throw new Error('Request failed after maximum retries.');
}

// ============================================================
// Helpers
// ============================================================

/**
 * BDL returns minutes as "MM:SS" strings. Convert to decimal float
 * so formulas in the stat builder can use `min` numerically.
 */
function parseMinutes(minStr) {
    if (typeof minStr === 'number') return minStr;
    if (!minStr || minStr === '00' || minStr === '') return 0;
    const [mins, secs = '0'] = minStr.split(':');
    return parseFloat(mins) + parseFloat(secs) / 60;
}

/**
 * Normalize a player stats object: converts min to float, ensures
 * all numeric fields are numbers (not strings).
 */
function normalizeStats(stat) {
    return {
        ...stat,
        min: parseMinutes(stat.min)
    };
}

// ============================================================
// API functions
// ============================================================

/**
 * Fetch the first 100 active NBA players.
 * Use the search param when the user types a name (3+ chars).
 */
async function fetchAllPlayers(searchQuery = '') {
    return Logger.time('fetchAllPlayers', async () => {
        const params = { per_page: 100 };
        if (searchQuery.length >= 3) params.search = searchQuery;

        const data = await bdlFetch('/players', params, { ttl: ApiCache.TTL.MEDIUM });
        const players = data.data.filter(p => p.team && p.team.id);
        ApiShape.check(players, ApiShape.bdlPlayer, 'players');
        return players;
    }, 'API');
}

/**
 * Search players by name via the API (used for live search).
 */
async function searchPlayersAPI(query) {
    if (!query || query.length < 2) return [];
    const data = await bdlFetch('/players', {
        search: query,
        per_page: 50
    });
    return data.data.filter(p => p.team && p.team.id);
}

/**
 * Fetch all 30 NBA teams.
 */
async function fetchTeamsAPI() {
    return Logger.time('fetchTeamsAPI', async () => {
        const data = await bdlFetch('/teams', { per_page: 100 }, { ttl: ApiCache.TTL.LONG });
        return data.data.map(team => ({
            ...team,
            full_name: team.full_name || `${team.city} ${team.name}`
        }));
    }, 'API');
}

/**
 * Fetch recent games (last 14 days).
 * Falls back to the current season's latest games if date range is empty.
 */
async function fetchGamesAPI() {
    return Logger.time('fetchGamesAPI', async () => {
        const today       = new Date();
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(today.getDate() - 14);
        const fmt = d => d.toISOString().split('T')[0];

        let data = await bdlFetch('/games', {
            per_page: 15,
            start_date: fmt(twoWeeksAgo),
            end_date: fmt(today)
        }, { ttl: ApiCache.TTL.SHORT });

        // Off-season fallback: return latest games of the current season
        if (!data.data || data.data.length === 0) {
            Logger.warn('No games in last 14 days — falling back to season fetch', undefined, 'API');
            data = await bdlFetch('/games', { per_page: 15, seasons: [CURRENT_SEASON] }, { ttl: ApiCache.TTL.SHORT });
        }

        const games = (data.data || []).sort((a, b) => new Date(b.date) - new Date(a.date));
        ApiShape.check(games, ApiShape.bdlGame, 'games');
        return games;
    }, 'API');
}

/**
 * Batch-fetch season averages for a list of player IDs.
 * Chunks into groups of 25 to stay within URL length limits.
 * Returns an array of stat objects (one per player with data).
 */
async function fetchPlayerStatsAPI(playerIds, season = CURRENT_SEASON) {
    if (!Array.isArray(playerIds)) playerIds = [playerIds];
    if (playerIds.length === 0) return [];

    const CHUNK = 25;
    const results = [];
    let failedChunks = 0;

    for (let i = 0; i < playerIds.length; i += CHUNK) {
        const chunk = playerIds.slice(i, i + CHUNK);
        try {
            const data = await bdlFetch('/season_averages', {
                season,
                player_ids: chunk
            }, { ttl: ApiCache.TTL.MEDIUM });
            results.push(...(data.data || []));
        } catch (err) {
            failedChunks++;
            Logger.warn(`Stats chunk ${i}–${i + CHUNK} failed`, err.message, 'API');
        }
    }

    if (failedChunks > 0) {
        ErrorHandler.toast(
            `${failedChunks} stat batch${failedChunks > 1 ? 'es' : ''} failed to load — some players may show incomplete stats.`,
            'warn',
            { title: 'Partial Stats', duration: 6000 }
        );
    }

    ApiShape.check(results, ApiShape.bdlStats, 'season_averages');
    return results.map(normalizeStats);
}

/**
 * Fetch all players on a team roster for the current season.
 * Returns active players belonging to the given team ID.
 */
async function fetchTeamRoster(teamId) {
    return Logger.time(`fetchTeamRoster(${teamId})`, async () => {
        const data = await bdlFetch('/players', {
            team_ids: [teamId],
            per_page: 100,
        }, { ttl: ApiCache.TTL.MEDIUM });
        return (data.data || []).filter(p => p.team && p.team.id);
    }, 'API');
}

/**
 * Fetch the most recent N games played by a specific team this season.
 * Returns games sorted most-recent first.
 */
async function fetchTeamGamesAPI(teamId, limit = 10) {
    return Logger.time(`fetchTeamGames(${teamId})`, async () => {
        let data = await bdlFetch('/games', {
            team_ids: [teamId],
            per_page: limit,
            seasons:  [CURRENT_SEASON],
        }, { ttl: ApiCache.TTL.SHORT });
        // Off-season: current season has no games yet — fall back to last completed season
        if (!data.data || data.data.length === 0) {
            data = await bdlFetch('/games', {
                team_ids: [teamId],
                per_page: limit,
                seasons:  [CURRENT_SEASON - 1],
            }, { ttl: ApiCache.TTL.MEDIUM });
        }
        return (data.data || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    }, 'API');
}

/**
 * Fetch all player stat lines for a single game (box score).
 * Returns an array of stat objects, each with a nested `player` and `team`.
 */
async function fetchGameBoxScoreAPI(gameId) {
    return Logger.time(`fetchGameBoxScore(${gameId})`, async () => {
        const data = await bdlFetch('/stats', {
            game_ids: [gameId],
            per_page: 100,
        }, { ttl: ApiCache.TTL.LONG });
        return data.data || [];
    }, 'API');
}

/**
 * Fetch ESPN's NBA athlete list and return a normalised name→ESPN-ID map.
 * Stored in AppState.espnPlayerMap so it's only fetched once per session.
 * Returns {} silently on any network/CORS failure.
 */
async function fetchESPNPlayerMap() {
    if (AppState.espnPlayerMap) return AppState.espnPlayerMap;
    try {
        const res = await fetch(
            'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes?limit=1000'
        );
        if (!res.ok) {
            Logger.warn(`ESPN athlete map fetch failed — HTTP ${res.status}`, undefined, 'ESPN');
            AppState.espnPlayerMap = {};
            return {};
        }
        const json = await res.json();
        // ESPN API returns athletes under `items`; also try `athletes` as a fallback
        const list = json.items || json.athletes || [];
        const map  = {};
        list.forEach(a => {
            if (!a.id) return;
            // Prefer separate first/last fields; fall back to splitting displayName
            const first = a.firstName || (a.displayName || '').split(' ')[0] || '';
            const last  = a.lastName  || (a.displayName || '').split(' ').slice(1).join(' ') || '';
            if (first && last) {
                map[`${first} ${last}`.toLowerCase()] = a.id;
            } else if (a.displayName) {
                map[a.displayName.toLowerCase()] = a.id;
            }
        });
        AppState.espnPlayerMap = map;
        Logger.info(`ESPN map loaded — ${Object.keys(map).length} athletes`, undefined, 'ESPN');
        return map;
    } catch (err) {
        Logger.warn('ESPN athlete map unavailable', err.message, 'ESPN');
        AppState.espnPlayerMap = {};
        return {};
    }
}

/**
 * Return the ESPN CDN headshot URL for a player, or null if no mapping exists.
 */
function getESPNHeadshotUrl(player) {
    const map = AppState.espnPlayerMap;
    if (!map) return null;
    const key  = `${player.first_name} ${player.last_name}`.toLowerCase();
    const id   = map[key];
    return id ? `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png` : null;
}

if (typeof window !== 'undefined') {
    window.getESPNHeadshotUrl  = getESPNHeadshotUrl;
    window.fetchESPNPlayerMap  = fetchESPNPlayerMap;
}

/**
 * Fetch per-game season averages for all NBA players from NBA.com's public stats API.
 * Returns a plain object { [lowercaseFullName]: statObject } for all players who have appeared.
 * Cached in localStorage for 30 minutes; also held in AppState.nbaStatsMap for the session.
 * Returns {} silently on any network failure so the rest of the app keeps working.
 *
 * NBA.com season format: "2024-25" when CURRENT_SEASON = 2024.
 */
async function fetchNBAStatsMap(season = CURRENT_SEASON) {
    // In-memory shortcut — avoids localStorage round-trip within same session & season
    if (AppState.nbaStatsMap && AppState._nbaStatsSeason === season) {
        return AppState.nbaStatsMap;
    }

    const nbaSeasonStr = `${season}-${String(season + 1).slice(-2)}`;
    const cacheKey     = `/nba_stats/${nbaSeasonStr}/v2`; // v2 = _normName keys

    const hit = ApiCache.get(cacheKey);
    if (hit) {
        AppState.nbaStatsMap    = hit;
        AppState._nbaStatsSeason = season;
        return hit;
    }

    try {
        const url = `https://stats.nba.com/stats/leagueLeaders` +
            `?LeagueID=00&PerMode=PerGame&Scope=S&Season=${nbaSeasonStr}` +
            `&SeasonType=Regular%20Season&StatCategory=PTS`;

        const res = await fetch(url, { headers: { 'Referer': 'https://www.nba.com/' } });
        if (!res.ok) throw new Error(`NBA stats API error ${res.status}`);

        const json = await res.json();
        const resultSet = json?.resultSet;
        if (!resultSet?.headers || !Array.isArray(resultSet?.rowSet)) {
            throw new Error('Unexpected NBA stats API response shape — endpoint may have changed');
        }
        const { headers, rowSet } = resultSet;
        const get = (row, h) => row[headers.indexOf(h)];

        const map = {};
        rowSet.forEach(row => {
            const name = _normName(get(row, 'PLAYER') || '');
            if (!name) return;
            map[name] = {
                pts:          get(row, 'PTS'),
                reb:          get(row, 'REB'),
                ast:          get(row, 'AST'),
                stl:          get(row, 'STL'),
                blk:          get(row, 'BLK'),
                turnover:     get(row, 'TOV'),
                min:          get(row, 'MIN'),
                fgm:          get(row, 'FGM'),
                fga:          get(row, 'FGA'),
                fg_pct:       get(row, 'FG_PCT'),   // already 0–1
                fg3m:         get(row, 'FG3M'),
                fg3a:         get(row, 'FG3A'),
                fg3_pct:      get(row, 'FG3_PCT'),  // already 0–1
                ftm:          get(row, 'FTM'),
                fta:          get(row, 'FTA'),
                ft_pct:       get(row, 'FT_PCT'),   // already 0–1
                oreb:         get(row, 'OREB'),
                dreb:         get(row, 'DREB'),
                games_played: get(row, 'GP'),
                nba_id:       get(row, 'PLAYER_ID'),
            };
        });

        Logger.info(`NBA stats map: ${Object.keys(map).length} players (${nbaSeasonStr})`, undefined, 'NBA');

        ApiCache.set(cacheKey, map, ApiCache.TTL.MEDIUM);
        AppState.nbaStatsMap    = map;
        AppState._nbaStatsSeason = season;
        return map;

    } catch (err) {
        Logger.warn('NBA stats map failed', err.message, 'NBA');
        return {};
    }
}

if (typeof window !== 'undefined') {
    window.fetchNBAStatsMap = fetchNBAStatsMap;
}

/**
 * Fetch NBA standings from NBA.com's public stats API.
 * Returns an array of team row objects for all 30 teams.
 * Cached for a short TTL (scores / wins change daily).
 */
async function fetchNBAStandings(season = CURRENT_SEASON) {
    const nbaSeasonStr = `${season}-${String(season + 1).slice(-2)}`;
    const cacheKey     = `/nba_standings/${nbaSeasonStr}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    try {
        const url = `https://stats.nba.com/stats/leaguestandingsv3` +
            `?LeagueID=00&Season=${nbaSeasonStr}&SeasonType=Regular%20Season`;

        const res = await fetch(url, { headers: { 'Referer': 'https://www.nba.com/' } });
        if (!res.ok) throw new Error(`NBA standings API error ${res.status}`);

        const json    = await res.json();
        const rs      = json.resultSets[0];
        const headers = rs.headers;
        const get     = (row, h) => row[headers.indexOf(h)];

        const rows = rs.rowSet.map(row => ({
            // Identity
            rank:           get(row, 'PlayoffRank'),
            teamId:         get(row, 'TeamID'),
            teamAbbr:       get(row, 'TeamAbbreviation'),
            teamName:       get(row, 'TeamName'),
            teamCity:       get(row, 'TeamCity'),
            conference:     get(row, 'Conference'),
            division:       get(row, 'Division'),
            // Core record
            wins:           get(row, 'WINS'),
            losses:         get(row, 'LOSSES'),
            pct:            get(row, 'WinPCT'),
            gb:             get(row, 'ConferenceGamesBack'),
            divRank:        get(row, 'DivisionRank'),
            leagueRank:     get(row, 'LeagueRank'),
            // Splits
            l10:            get(row, 'L10'),
            home:           get(row, 'HOME'),
            road:           get(row, 'ROAD'),
            confRecord:     get(row, 'ConferenceRecord'),
            divRecord:      get(row, 'DivisionRecord'),
            otRecord:       get(row, 'OT'),
            // Scoring
            pointsPg:       get(row, 'PointsPG'),
            oppPointsPg:    get(row, 'OppPointsPG'),
            diffPointsPg:   get(row, 'DiffPointsPG'),
            // Situational
            above500:       get(row, 'OppOver500'),
            score100:       get(row, 'Score100PTS'),
            oppScore100:    get(row, 'OppScore100PTS'),
            blowouts3:      get(row, 'TenPTSOrLess'),   // games ≤ 3 pts not in all versions
            blowouts10:     get(row, 'TenPTSOrMore'),
            leadHalf:       get(row, 'AheadAtHalf'),
            behindHalf:     get(row, 'BehindAtHalf'),
            // Streaks
            streak:         get(row, 'strCurrentStreak'),
            longWinStreak:  get(row, 'LongWinStreak'),
            longLossStreak: get(row, 'LongLossStreak'),
            curHomeStreak:  get(row, 'strCurrentHomeStreak'),
            curRoadStreak:  get(row, 'strCurrentRoadStreak'),
            // Clinch / elimination
            clinchedDiv:    get(row, 'clinchedDivisionTitle'),
            clinchedPO:     get(row, 'clinchedPlayoffBirth'),
            clinchedConf:   get(row, 'clinchedConferenceTitle'),
            clinchedSeed:   get(row, 'clinchedSeed'),
            eliminated:     get(row, 'EliminatedConference'),
        }));

        Logger.info(`NBA standings: ${rows.length} teams (${nbaSeasonStr})`, undefined, 'NBA');
        ApiCache.set(cacheKey, rows, ApiCache.TTL.SHORT);
        return rows;

    } catch (err) {
        Logger.warn('NBA standings fetch failed', err.message, 'NBA');
        return [];
    }
}

if (typeof window !== 'undefined') {
    window.fetchNBAStandings = fetchNBAStandings;
}

/**
 * Fetch a player's last 10 game log entries for the current season.
 * BDL /stats is a paid-tier endpoint — returns [] gracefully on 401
 * so the player detail page still loads with season averages intact.
 */
async function fetchPlayerGamesAPI(playerId, season = CURRENT_SEASON) {
    return Logger.time(`fetchPlayerGames(${playerId})`, async () => {
        try {
            const data = await bdlFetch('/stats', {
                player_ids: [playerId],
                seasons: [season],
                per_page: 10
            }, { ttl: ApiCache.TTL.SHORT });
            return (data.data || []).sort(
                (a, b) => new Date(b.game?.date || 0) - new Date(a.game?.date || 0)
            );
        } catch (err) {
            if (
                err.message.includes('401') ||
                err.message.includes('Unauthorized') ||
                err.name === 'AbortError' ||
                err.message.includes('abort')
            ) {
                Logger.warn(
                    'fetchPlayerGamesAPI: game log unavailable (paid tier or timeout)',
                    undefined, 'API'
                );
                return [];
            }
            throw err;
        }
    }, 'API');
}
