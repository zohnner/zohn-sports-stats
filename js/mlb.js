// ============================================================
// MLB — players, teams, games, leaderboards
// Official MLB Stats API: https://statsapi.mlb.com/api/v1
// ============================================================

let MLB_SEASON = new Date().getMonth() >= 2 && new Date().getMonth() <= 9  // Mar–Oct = current season
    ? new Date().getFullYear()
    : new Date().getFullYear() - 1;   // Nov–Feb = previous completed season

// True when it's noon–midnight ET — games are live or recently completed,
// so season stat corrections are most likely. Use SHORT TTL instead of MEDIUM.
function _activeGameHours() {
    const h = new Date(Date.now() - 5 * 3600000).getUTCHours();
    return h >= 12;
}

// Park factor tiers keyed by team abbreviation (home park).
// tier > 0 = hitter-friendly, tier < 0 = pitcher-friendly, 0 = neutral.
// Based on multi-year park factor averages (FanGraphs/Baseball Reference).
const _MLB_PARK_TIERS = {
    'COL': { tier: 3,  label: 'Coors'              },  // extreme outlier
    'CIN': { tier: 2,  label: 'Hitter park'        },
    'TEX': { tier: 2,  label: 'Hitter park'        },
    'BAL': { tier: 2,  label: 'Hitter park'        },
    'BOS': { tier: 2,  label: 'Hitter park'        },
    'ATL': { tier: 1,  label: 'Hitter-friendly'    },
    'PHI': { tier: 1,  label: 'Hitter-friendly'    },
    'LAA': { tier: 1,  label: 'Hitter-friendly'    },
    'KC':  { tier: 1,  label: 'Hitter-friendly'    },
    'SF':  { tier: -2, label: 'Pitcher park'       },
    'SD':  { tier: -2, label: 'Pitcher park'       },
    'NYM': { tier: -2, label: 'Pitcher park'       },
    'SEA': { tier: -2, label: 'Pitcher park'       },
    'CLE': { tier: -1, label: 'Pitcher-friendly'   },
    'MIN': { tier: -1, label: 'Pitcher-friendly'   },
    'OAK': { tier: -1, label: 'Pitcher-friendly'   },
    'ATH': { tier: -1, label: 'Pitcher-friendly'   },
    'MIA': { tier: -1, label: 'Pitcher-friendly'   },
    'PIT': { tier: -1, label: 'Pitcher-friendly'   },
};

function _parkFactorBadge(teamAbbr, style = 'inline') {
    const tf = _MLB_PARK_TIERS[teamAbbr];
    if (!tf) return '';
    if (style === 'dot') {
        // Compact colored dot for leaderboard rows
        const color = tf.tier >= 2 ? '#ef4444' : tf.tier === 1 ? '#f97316' : tf.tier <= -2 ? '#22d3ee' : '#60a5fa';
        return `<span class="park-dot" style="background:${color}" title="${tf.label}"></span>`;
    }
    // Full badge for player detail hero
    const cls = tf.tier >= 2 ? 'park-badge--hit' : tf.tier === 1 ? 'park-badge--hit-light' : tf.tier <= -2 ? 'park-badge--pit' : 'park-badge--pit-light';
    return `<span class="park-badge ${cls}" title="${tf.label}">${tf.tier === 3 ? '⛰️ ' : ''}${tf.label}</span>`;
}

// ── MLB Favorites (starred players) ──────────────────────────
const _MLB_FAVS_KEY = 'zs_mlb_favs';
// Initialise from localStorage into AppState (AppState is defined later in navigation.js,
// so we defer the Set population to _initMLBFavs() called at the end of this file).
function _initMLBFavs() {
    try {
        const ids = JSON.parse(localStorage.getItem(_MLB_FAVS_KEY) || '[]');
        AppState.mlbFavorites = new Set(ids.map(Number));
    } catch (_) { AppState.mlbFavorites = new Set(); }
}
function _toggleMLBFav(playerId) {
    if (!AppState.mlbFavorites) AppState.mlbFavorites = new Set();
    if (AppState.mlbFavorites.has(playerId)) {
        AppState.mlbFavorites.delete(playerId);
    } else {
        AppState.mlbFavorites.add(playerId);
    }
    try { localStorage.setItem(_MLB_FAVS_KEY, JSON.stringify([...AppState.mlbFavorites])); } catch (_) {}
    // Re-render star button(s) in the DOM without re-building the whole card
    document.querySelectorAll(`.mlb-fav-btn[data-player-id="${playerId}"]`).forEach(btn => {
        const isNow = AppState.mlbFavorites.has(playerId);
        btn.classList.toggle('mlb-fav-btn--active', isNow);
        btn.title = isNow ? 'Remove from starred' : 'Star player';
        btn.setAttribute('aria-label', isNow ? 'Remove from starred' : 'Star player');
    });
}

// ── Team colours ─────────────────────────────────────────────
// Keys use the abbreviation returned by the MLB Stats API.
// Alternate spellings (BBREF/Fangraphs style) are aliased below the main table.
const _MLB_COLORS_BASE = {
    // American League East
    'BAL': { primary: '#DF4601', secondary: '#000000' },
    'BOS': { primary: '#BD3039', secondary: '#0C2340' },
    'NYY': { primary: '#132448', secondary: '#C4CED3' },
    'TB':  { primary: '#092C5C', secondary: '#8FBCE6' },
    'TOR': { primary: '#134A8E', secondary: '#E8291C' },
    // American League Central
    'CWS': { primary: '#27251F', secondary: '#C4CED3' },
    'CLE': { primary: '#00385D', secondary: '#E50022' },
    'DET': { primary: '#0C2C56', secondary: '#FA4616' },
    'KC':  { primary: '#004687', secondary: '#C09A5B' },
    'MIN': { primary: '#002B5C', secondary: '#D31145' },
    // American League West
    'HOU': { primary: '#002D62', secondary: '#EB6E1F' },
    'LAA': { primary: '#BA0021', secondary: '#003263' },
    'ATH': { primary: '#003831', secondary: '#EFB21E' },   // Athletics (Sacramento/Las Vegas 2025)
    'SEA': { primary: '#0C2C56', secondary: '#005C5C' },
    'TEX': { primary: '#003278', secondary: '#C0111F' },
    // National League East
    'ATL': { primary: '#CE1141', secondary: '#13274F' },
    'MIA': { primary: '#00A3E0', secondary: '#EF3340' },
    'NYM': { primary: '#002D72', secondary: '#FF5910' },
    'PHI': { primary: '#E81828', secondary: '#002D72' },
    'WSH': { primary: '#AB0003', secondary: '#14225A' },
    // National League Central
    'CHC': { primary: '#0E3386', secondary: '#CC3433' },
    'CIN': { primary: '#C6011F', secondary: '#000000' },
    'MIL': { primary: '#12284B', secondary: '#FFC52F' },
    'PIT': { primary: '#27251F', secondary: '#FDB827' },
    'STL': { primary: '#C41E3A', secondary: '#FEDB00' },
    // National League West
    'ARI': { primary: '#A71930', secondary: '#E3D4AD' },
    'COL': { primary: '#33006F', secondary: '#C4CED4' },
    'LAD': { primary: '#005A9C', secondary: '#EF3E42' },
    'SD':  { primary: '#2F241D', secondary: '#FFC425' },
    'SF':  { primary: '#FD5A1E', secondary: '#27251F' },
};

// Alternate abbreviation aliases — BBREF/Fangraphs style and legacy spellings
const _MLB_ABBR_ALIASES = {
    'TBR': 'TB',   // Tampa Bay Rays
    'KCR': 'KC',   // Kansas City Royals
    'CHW': 'CWS',  // Chicago White Sox
    'SDP': 'SD',   // San Diego Padres
    'SFG': 'SF',   // San Francisco Giants
    'OAK': 'ATH',  // Oakland / Athletics legacy
    'WSN': 'WSH',  // Washington Nationals (ESPN abbr)
    'AZ':  'ARI',  // Arizona Diamondbacks (ESPN abbr)
};

// ── Park factors by home team ID (2024 run-scoring environment) ─
// 1.00 = league avg; >1.05 hitter-friendly; <0.95 pitcher-friendly
// Source: Baseball Reference multi-year park factors (2022–2024 avg) | Season: 2024
// Review annually at season start — values shift as parks change or teams relocate.
// 2026-07-01 review (Relay): still the 2022–2024 B-Ref averages — refresh requires a manual
// source pull (no fetchable feed); tracked in ISSUES.md (P2 park-factor refresh).
const _PARK_FACTORS = {
    115: 1.15, // Rockies — Coors Field
    113: 1.08, // Reds — Great American Ball Park
    109: 1.07, // D-backs — Chase Field
    146: 1.06, // Marlins — loanDepot park
    147: 1.05, // Yankees — Yankee Stadium
    143: 1.05, // Phillies — Citizens Bank Park
    111: 1.04, // Red Sox — Fenway Park
    112: 1.03, // Cubs — Wrigley Field
    121: 1.02, // Mets — Citi Field
    145: 1.01, // White Sox — Guaranteed Rate Field
    134: 1.00, // Pirates — PNC Park
    118: 0.99, // Royals — Kauffman Stadium
    144: 0.99, // Braves — Truist Park
    108: 0.98, // Angels — Angel Stadium
    133: 0.97, // Athletics — Sutter Health Park
    137: 0.97, // Giants — Oracle Park
    117: 0.97, // Astros — Minute Maid Park
    116: 0.97, // Tigers — Comerica Park
    138: 0.96, // Cardinals — Busch Stadium
    142: 0.96, // Twins — Target Field
    135: 0.95, // Padres — Petco Park
    120: 0.95, // Nationals — Nationals Park
    141: 0.95, // Blue Jays — Rogers Centre
    110: 0.95, // Orioles — Camden Yards
    119: 0.94, // Dodgers — Dodger Stadium
    140: 0.94, // Rangers — Globe Life Field
    114: 0.93, // Guardians — Progressive Field
    139: 0.93, // Rays — Tropicana Field
    136: 0.92, // Mariners — T-Mobile Park
    158: 0.91, // Brewers — American Family Field
};

// ── Stadium weather lookup (Open-Meteo, keyed by MLB team ID) ─
// dome: true → show "Dome" instead of fetching weather
const _MLB_STADIUMS = {
    108: { lat: 33.8003,  lon: -117.8827, dome: false }, // Angels — Angel Stadium
    109: { lat: 33.4453,  lon: -112.0668, dome: true  }, // D-backs — Chase Field (retractable)
    110: { lat: 39.2839,  lon: -76.6218,  dome: false }, // Orioles — Camden Yards
    111: { lat: 42.3467,  lon: -71.0972,  dome: false }, // Red Sox — Fenway Park
    112: { lat: 41.9484,  lon: -87.6553,  dome: false }, // Cubs — Wrigley Field
    113: { lat: 39.0979,  lon: -84.5076,  dome: false }, // Reds — Great American Ball Park
    114: { lat: 41.4962,  lon: -81.6852,  dome: false }, // Guardians — Progressive Field
    115: { lat: 39.7559,  lon: -104.9942, dome: false }, // Rockies — Coors Field
    116: { lat: 42.3390,  lon: -83.0485,  dome: false }, // Tigers — Comerica Park
    117: { lat: 29.7572,  lon: -95.3555,  dome: true  }, // Astros — Minute Maid Park (retractable)
    118: { lat: 39.0517,  lon: -94.4803,  dome: false }, // Royals — Kauffman Stadium
    119: { lat: 34.0739,  lon: -118.2400, dome: false }, // Dodgers — Dodger Stadium
    120: { lat: 38.8730,  lon: -77.0074,  dome: false }, // Nationals — Nationals Park
    121: { lat: 40.7571,  lon: -73.8458,  dome: false }, // Mets — Citi Field
    133: { lat: 38.5803,  lon: -121.5009, dome: false }, // Athletics — Sutter Health Park
    134: { lat: 40.4469,  lon: -80.0057,  dome: false }, // Pirates — PNC Park
    135: { lat: 32.7076,  lon: -117.1570, dome: false }, // Padres — Petco Park
    136: { lat: 47.5914,  lon: -122.3325, dome: false }, // Mariners — T-Mobile Park
    137: { lat: 37.7786,  lon: -122.3893, dome: false }, // Giants — Oracle Park
    138: { lat: 38.6226,  lon: -90.1928,  dome: false }, // Cardinals — Busch Stadium
    139: { lat: 27.7683,  lon: -82.6534,  dome: true  }, // Rays — Tropicana Field
    140: { lat: 32.7512,  lon: -97.0832,  dome: true  }, // Rangers — Globe Life Field (retractable)
    141: { lat: 43.6414,  lon: -79.3894,  dome: true  }, // Blue Jays — Rogers Centre
    142: { lat: 44.9817,  lon: -93.2777,  dome: false }, // Twins — Target Field
    143: { lat: 39.9057,  lon: -75.1665,  dome: false }, // Phillies — Citizens Bank Park
    144: { lat: 33.8908,  lon: -84.4678,  dome: false }, // Braves — Truist Park
    145: { lat: 41.8299,  lon: -87.6338,  dome: false }, // White Sox — Guaranteed Rate Field
    146: { lat: 25.7780,  lon: -80.2196,  dome: true  }, // Marlins — loanDepot park (retractable)
    147: { lat: 40.8296,  lon: -73.9262,  dome: false }, // Yankees — Yankee Stadium
    158: { lat: 43.0280,  lon: -87.9712,  dome: true  }, // Brewers — American Family Field (retractable)
};

function _windDegToCompass(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
}

async function _fetchStadiumWeather(teamId) {
    const stadium = _MLB_STADIUMS[teamId];
    if (!stadium) return null;
    if (stadium.dome) return { dome: true };

    const cacheKey = `ss_weather_${teamId}`;
    try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            const { ts, data } = JSON.parse(cached);
            if (Date.now() - ts < 30 * 60 * 1000) return data;
        }
    } catch (_) {}

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${stadium.lat}&longitude=${stadium.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
        if (!resp.ok) return null;
        const json = await resp.json();
        const cur = json.current;
        if (!cur) return null;
        const data = {
            temp: Math.round(cur.temperature_2m),
            wind: Math.round(cur.wind_speed_10m),
            dir:  _windDegToCompass(cur.wind_direction_10m),
        };
        sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
        return data;
    } catch (_) {
        return null;
    }
}

async function _injectGameWeather(wrap) {
    const slots = wrap.querySelectorAll('[data-weather-team]');
    if (!slots.length) return;

    const teamIds = [...new Set([...slots].map(s => +s.dataset.weatherTeam))];
    const results = await Promise.all(teamIds.map(id =>
        _fetchStadiumWeather(id).then(w => [id, w])
    ));
    const map = Object.fromEntries(results);

    slots.forEach(slot => {
        const w = map[+slot.dataset.weatherTeam];
        if (!w) { slot.style.display = 'none'; return; }
        if (w.dome) {
            slot.textContent = 'Dome';
            slot.classList.add('game-weather--dome');
        } else {
            slot.innerHTML = `${w.temp}°F · ${w.wind} mph ${w.dir}`;
            slot.classList.add('game-weather--outdoor');
        }
    });
}

const MLB_TEAM_COLORS = new Proxy(_MLB_COLORS_BASE, {
    get(target, abbr) {
        if (typeof abbr !== 'string') return undefined;
        return target[abbr] ?? target[_MLB_ABBR_ALIASES[abbr]] ?? undefined;
    },
});

function getMLBTeamColors(abbr) {
    const colors = abbr ? MLB_TEAM_COLORS[abbr] : null;
    if (!colors && abbr && abbr !== '???' && typeof Logger !== 'undefined') {
        Logger.debug(`Unknown MLB abbreviation: "${abbr}"`, undefined, 'MLB');
    }
    return colors || { primary: '#334155', secondary: '#64748b' };
}

// Derive a short abbreviation from a team object when the API omits it
function _mlbTeamAbbr(team) {
    if (!team) return '???';
    if (team.abbreviation) return team.abbreviation;
    // Fall back to a lookup in the already-loaded teams list
    const cached = AppState?.mlbTeams?.find(t => t.id === team.id);
    if (cached?.abbreviation) return cached.abbreviation;
    // Last resort: initials from team name words ("Kansas City Royals" → "KCR")
    return (team.name || '').split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase() || '???';
}

// ── Position matching ─────────────────────────────────────────
// Single source of truth for "does this player's position match the filter?"
// Handles OF (covers LF/CF/RF/OF) and generic P (unclassified pitcher).
const _MLB_OF_SET = new Set(['lf', 'cf', 'rf', 'of']);

function _mlbPosMatch(playerPos, filter) {
    if (!filter || filter === 'all') return true;
    const pos = (playerPos || '').toLowerCase();
    if (filter === 'of') return _MLB_OF_SET.has(pos);
    return pos === filter;
}

// Canonical position lists — single source of truth used by player page + leaderboards
const MLB_HITTING_POSITIONS  = ['All', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'];
const MLB_PITCHING_POSITIONS = ['All', 'SP', 'RP', 'CL'];

// MLB Stats API teamId → ESPN abbreviation (lowercase)
// ESPN PNG logos are reliable and explicitly in our CSP allowlist (a.espncdn.com)
const _MLB_ID_TO_ESPN = {
    108:'laa', 109:'ari', 110:'bal', 111:'bos', 112:'chc',
    113:'cin', 114:'cle', 115:'col', 116:'det', 117:'hou',
    118:'kc',  119:'lad', 120:'wsh', 121:'nym', 133:'oak',
    134:'pit', 135:'sd',  136:'sea', 137:'sf',  138:'stl',
    139:'tb',  140:'tex', 141:'tor', 142:'min', 143:'phi',
    144:'atl', 145:'cws', 146:'mia', 147:'nyy', 158:'mil',
};

function getMLBTeamLogoUrl(teamId) {
    const abbr = _MLB_ID_TO_ESPN[teamId];
    if (abbr) return `https://a.espncdn.com/i/teamlogos/mlb/500/${abbr}.png`;
    return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : null;
}

function getMLBTeamLogoByAbbr(abbr) {
    if (!abbr) return null;
    const key = abbr.toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/mlb/500/${key}.png`;
}

function getMLBPlayerHeadshotUrl(playerId) {
    return playerId
        ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`
        : null;
}

// ── wRC+ league constants (FanGraphs guts) ───────────────────
// Source: FanGraphs leaderboard guts page — update each season.
// Values marked † are preliminary (early-season estimates); finalize after ~1200 PA of season data.
// Formula: ((wOBA − lgwOBA) / wOBAscale + lgRPA) / lgRPA × 100
// I'm flagging <90% confidence on the 2025 values — drawn from historical FanGraphs data.
const _MLB_WRC_CONSTANTS = {
    2024: { lgwOBA: 0.310, wOBAscale: 1.157, lgRPA: 0.115 },
    2025: { lgwOBA: 0.309, wOBAscale: 1.157, lgRPA: 0.113, preliminary: true },
};

// ── wRC+ constants derivation (Relay, 2026-07-01) ────────────
// Static entries go stale each season (2026 silently fell back to 2024
// values before this). For any season without a static entry, derive
// lgwOBA and lgR/PA from MLB Stats API league hitting totals using the
// SAME 2024 linear weights as _computeBattingRates — self-consistent
// with player wOBA. wOBAscale carried from the latest static year.
// Derived entries are marked { derived: true } and render with †.
const _wrcDerive = {};
function _ensureWrcConstants(season = MLB_SEASON) {
    if (_MLB_WRC_CONSTANTS[season]) return Promise.resolve();
    if (_wrcDerive[season]) return _wrcDerive[season];
    _wrcDerive[season] = mlbFetch('/teams/stats', { season, sportId: 1, group: 'hitting', stats: 'season' }, ApiCache.TTL.DAILY)
        .then(data => {
            const splits = data?.stats?.[0]?.splits || [];
            if (splits.length < 24) return; // partial league response — keep fallback
            const t = { bb: 0, ibb: 0, hbp: 0, h: 0, d2: 0, t3: 0, hr: 0, ab: 0, sf: 0, r: 0, pa: 0 };
            splits.forEach(s => {
                const st = s.stat || {};
                t.bb += st.baseOnBalls || 0;  t.ibb += st.intentionalWalks || 0;
                t.hbp += st.hitByPitch || 0;  t.h  += st.hits || 0;
                t.d2 += st.doubles || 0;      t.t3 += st.triples || 0;
                t.hr += st.homeRuns || 0;     t.ab += st.atBats || 0;
                t.sf += st.sacFlies || 0;     t.r  += st.runs || 0;
                t.pa += st.plateAppearances || 0;
            });
            const sing  = t.h - t.d2 - t.t3 - t.hr;
            const denom = t.ab + t.bb - t.ibb + t.sf + t.hbp;
            if (denom <= 0 || t.pa <= 0) return;
            const lgwOBA = (0.69 * (t.bb - t.ibb) + 0.72 * t.hbp + 0.89 * sing + 1.27 * t.d2 + 1.62 * t.t3 + 2.10 * t.hr) / denom;
            _MLB_WRC_CONSTANTS[season] = { lgwOBA: +lgwOBA.toFixed(4), wOBAscale: 1.157, lgRPA: +(t.r / t.pa).toFixed(4), derived: true };
            Logger.info(`wRC+ constants derived for ${season}`, _MLB_WRC_CONSTANTS[season], 'MLB');
        })
        .catch(err => { Logger.warn(`wRC+ constants derivation failed for ${season} — using latest static year`, err?.message, 'MLB'); })
        .finally(() => { delete _wrcDerive[season]; });
    return _wrcDerive[season];
}

function _wrcDagger(season = MLB_SEASON) {
    const c = _MLB_WRC_CONSTANTS[season];
    return (!c || c.derived || c.preliminary) ? '†' : '';
}


// ── Core fetch helper ─────────────────────────────────────────
const MLB_BASE_URL    = 'https://statsapi.mlb.com/api/v1';
const MLB_BASE_URL_V11 = 'https://statsapi.mlb.com/api/v1.1'; // feed/live only

// On Cloudflare Pages, route MLB API calls through the /api/mlb Pages Function
// so responses are cached in D1 and the MLB API domain is never hit from the browser.
// Direct fetch is used in local development where the Pages Function doesn't exist.
const MLB_USE_PROXY = (
    typeof location !== 'undefined' &&
    location.hostname !== 'localhost' &&
    location.hostname !== '127.0.0.1'
);

function _mlbProxyUrl(targetUrl) {
    return `/api/mlb?url=${encodeURIComponent(targetUrl)}`;
}

async function mlbFetch(endpoint, params = {}, ttl = ApiCache.TTL.MEDIUM, baseUrl = MLB_BASE_URL) {
    const url = new URL(`${baseUrl}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `mlb${url.pathname}${url.search}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    Logger.debug(`MLB → ${url.pathname}${url.search}`, undefined, 'MLB');
    const fetchUrl = MLB_USE_PROXY ? _mlbProxyUrl(url.toString()) : url.toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await fetch(fetchUrl, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error(`MLB API ${res.status}: ${res.statusText}`);

    let json;
    try {
        json = await res.json();
    } catch {
        throw new Error(`MLB API returned non-JSON response (${url.pathname})`);
    }
    ApiCache.set(cacheKey, json, ttl);
    return json;
}

const SAVANT_BASE_URL = 'https://baseballsavant.mlb.com';

// Fetch Statcast percentile data from Baseball Savant.
// Routes through the Cloudflare Worker (/savant/*) when BDL_PROXY_URL is set,
// otherwise falls back to a direct fetch (requires CORS on Savant's side).
async function fetchStatcast(playerId, type = 'batter') {
    const year    = MLB_SEASON;
    const cacheKey = `statcast_${playerId}_${type}_${year}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    const params = new URLSearchParams({ type, year, mlbamId: playerId });
    const directUrl = `${SAVANT_BASE_URL}/percentile-rankings?${params}`;
    const fetchUrl  = MLB_USE_PROXY ? _mlbProxyUrl(directUrl) : directUrl;
    let json;
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 10_000);
    try {
        const res = await fetch(fetchUrl, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal });
        if (!res.ok) throw new Error(`Savant ${res.status}`);
        json = await res.json();
    } catch (err) {
        Logger.debug(`Statcast unavailable for ${playerId}: ${err.message}`, undefined, 'MLB');
        return null;
    } finally {
        clearTimeout(tid);
    }

    // Savant returns an array; we want the first entry
    const data = Array.isArray(json) ? json[0] : json;
    if (!data) return null;
    ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
    return data;
}

function _splitCSVLine(line) {
    const result = [];
    let cur = '';
    let inQ = false;
    for (const c of line) {
        if (c === '"') { inQ = !inQ; }
        else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
        else { cur += c; }
    }
    result.push(cur);
    return result;
}

async function fetchStatcastBulkLeaderboard(season) {
    const cacheKey = `statcast_lb_${season}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    const url = `${SAVANT_BASE_URL}/leaderboard/custom?year=${season}&type=batter&filter=&sort=4&sortDir=desc&min=50&selections=xba,xslg,xwoba,exit_velocity_avg,barrel_batted_rate,hard_hit_percent,sweet_spot_percent&chart=false&csv=true`;
    try {
        const res = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(url) : url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`Savant CSV ${res.status}`);
        const text = await res.text();
        if (text.trim().startsWith('<')) throw new Error('Savant returned HTML');
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = _splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
        const required = ['player_id', 'xba', 'xwoba', 'exit_velocity_avg', 'barrel_batted_rate', 'hard_hit_percent'];
        const missing  = required.filter(c => !headers.includes(c));
        if (missing.length) {
            Logger.warn(`Savant batter CSV schema drift — missing: ${missing.join(', ')}`, { headers }, 'MLB');
            return null;
        }
        const rows = lines.slice(1).map(line => {
            const vals = _splitCSVLine(line);
            const obj = {};
            headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
            return obj;
        }).filter(r => r.player_id);
        ApiCache.set(cacheKey, rows, ApiCache.TTL.LONG);
        return rows;
    } catch (err) {
        Logger.debug(`Statcast leaderboard unavailable: ${err.message}`, undefined, 'MLB');
        return null;
    }
}

async function fetchStatcastPitcherLeaderboard(season) {
    const cacheKey = `statcast_pitcher_lb_${season}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    const url = `${SAVANT_BASE_URL}/leaderboard/custom?year=${season}&type=pitcher&filter=&sort=1&sortDir=desc&min=50&selections=k_percent,bb_percent,whiff_percent,exit_velocity_avg&chart=false&csv=true`;
    try {
        const res = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(url) : url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`Savant pitcher CSV ${res.status}`);
        const text = await res.text();
        if (text.trim().startsWith('<')) throw new Error('Savant returned HTML');
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = _splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
        const required = ['player_id', 'k_percent', 'bb_percent', 'whiff_percent', 'exit_velocity_avg'];
        const missing  = required.filter(c => !headers.includes(c));
        if (missing.length) {
            Logger.warn(`Savant pitcher CSV schema drift — missing: ${missing.join(', ')}`, { headers }, 'MLB');
            return null;
        }
        const rows = lines.slice(1).map(line => {
            const vals = _splitCSVLine(line);
            const obj = {};
            headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
            return obj;
        }).filter(r => r.player_id);
        ApiCache.set(cacheKey, rows, ApiCache.TTL.LONG);
        return rows;
    } catch (err) {
        Logger.debug(`Statcast pitcher leaderboard unavailable: ${err.message}`, undefined, 'MLB');
        return null;
    }
}

async function fetchSprintSpeedLeaderboard() {
    const cacheKey = `sprint_speed_${MLB_SEASON}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    const url = `${SAVANT_BASE_URL}/leaderboard/sprint_speed?min_opp=10&position=&team=&csv=true`;
    try {
        const res = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(url) : url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`Sprint speed CSV ${res.status}`);
        const text = await res.text();
        if (text.trim().startsWith('<')) throw new Error('Savant returned HTML');
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = _splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
        if (!headers.includes('sprint_speed')) {
            Logger.warn('Savant sprint speed CSV schema changed — expected column not found', undefined, 'MLB');
            return null;
        }
        const rows = lines.slice(1).map(line => {
            const vals = _splitCSVLine(line);
            const obj = {};
            headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
            return obj;
        }).filter(r => r.player_id && r.sprint_speed);
        ApiCache.set(cacheKey, rows, ApiCache.TTL.DAILY);
        return rows;
    } catch (err) {
        Logger.debug(`Sprint speed unavailable: ${err.message}`, undefined, 'MLB');
        return null;
    }
}

async function fetchSprayChartData(playerId) {
    const year = MLB_SEASON;
    const cacheKey = `spray_${playerId}_${year}_v3`;
    const cached = ApiCache.get(cacheKey);
    if (cached) return cached;

    // P9 Phase 1 (Relay-verified 2026-06-09): single Savant CSV replaces the
    // old gameLog + up-to-20 playByPlay reconstruction (~21 requests → 1).
    // Savant event values ('single'…'home_run') match the renderer's keys directly.
    const url = `${SAVANT_BASE_URL}/statcast_search/csv?all=true&type=details` +
        `&player_type=batter&hfSea=${year}%7C&batters_lookup%5B%5D=${playerId}` +
        `&hfGT=R%7C&min_results=0`;
    try {
        const res = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(url) : url, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`Savant spray CSV ${res.status}`);
        const text = await res.text();
        if (text.trim().startsWith('<')) throw new Error('Savant returned HTML');
        const lines = text.trim().split('\n');
        if (lines.length < 2) { ApiCache.set(cacheKey, [], ApiCache.TTL.LONG); return []; }
        const headers = _splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
        const iEv = headers.indexOf('events'), iX = headers.indexOf('hc_x'), iY = headers.indexOf('hc_y');
        const iLS = headers.indexOf('launch_speed');
        if (iEv < 0 || iX < 0 || iY < 0) {
            Logger.warn('Savant spray CSV schema changed — events/hc_x/hc_y not found', undefined, 'MLB');
            return null;
        }
        const clean = v => (v || '').replace(/^"|"$/g, '').trim();
        const hits = [];
        for (let i = 1; i < lines.length; i++) {
            const vals = _splitCSVLine(lines[i]);
            const x = parseFloat(clean(vals[iX]));
            const y = parseFloat(clean(vals[iY]));
            const ev = clean(vals[iEv]);
            if (isNaN(x) || isNaN(y) || !ev) continue;
            const ls = iLS >= 0 ? parseFloat(clean(vals[iLS])) : NaN;
            hits.push({ events: ev, hc_x: x, hc_y: y, ev: isNaN(ls) ? null : ls });
        }
        ApiCache.set(cacheKey, hits, ApiCache.TTL.LONG);
        return hits;
    } catch (err) {
        Logger.debug(`Spray chart unavailable for ${playerId}: ${err.message}`, undefined, 'MLB');
        return null;
    }
}

// P9 Phase 2: mode 'outcome' (default) or 'ev' — exit-velocity coloring on
// the shared _mlbPctColor data-intensity scale (75 mph → blue, 115 → red).
function _sprayEvColor(ev) {
    return _mlbPctColor(Math.max(1, Math.min(99, Math.round((ev - 75) * 2.5))));
}

function _renderSprayChartSVG(hits, mode = 'outcome') {
    if (!hits || !hits.length) return '<p class="spray-no-data">No batted ball data available for this season.</p>';

    const HITS = new Set(['single', 'double', 'triple', 'home_run']);
    const COLOR = { single: '#22d3a0', double: '#38bdf8', triple: '#ffd200', home_run: '#ff8100' };
    const OUT_FILL = 'rgba(255,255,255,0.18)';
    const hasEv = hits.some(r => r.ev != null);
    const evMode = mode === 'ev' && hasEv;
    const dotFill = r => evMode
        ? (r.ev != null ? _sprayEvColor(r.ev) : OUT_FILL)
        : (HITS.has(r.events) ? COLOR[r.events] : OUT_FILL);

    // Outs rendered first so hits appear on top
    const outDots = hits
        .filter(r => !HITS.has(r.events))
        .map(r => {
            const x = parseFloat(r.hc_x), y = parseFloat(r.hc_y);
            return isNaN(x) || isNaN(y) ? '' : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${dotFill(r)}" opacity="${evMode ? 0.85 : 1}"/>`;
        }).join('');

    const hitDots = hits
        .filter(r => HITS.has(r.events))
        .map(r => {
            const x = parseFloat(r.hc_x), y = parseFloat(r.hc_y);
            if (isNaN(x) || isNaN(y)) return '';
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${dotFill(r)}" opacity="0.9"/>`;
        }).join('');

    const count = t => hits.filter(r => r.events === t).length;
    const outs  = hits.filter(r => !HITS.has(r.events)).length;
    const evBucket = (lo, hi) => hits.filter(r => r.ev != null && r.ev >= lo && r.ev < hi).length;

    const legend = evMode ? `
        <div class="spray-legend">
            <span class="spray-legend-item"><span class="spray-dot" style="background:${_sprayEvColor(110)}"></span>105+ mph (${evBucket(105, 999)})</span>
            <span class="spray-legend-item"><span class="spray-dot" style="background:${_sprayEvColor(99)}"></span>95–105 (${evBucket(95, 105)})</span>
            <span class="spray-legend-item"><span class="spray-dot" style="background:${_sprayEvColor(89)}"></span>85–95 (${evBucket(85, 95)})</span>
            <span class="spray-legend-item"><span class="spray-dot" style="background:${_sprayEvColor(79)}"></span>&lt;85 (${evBucket(0, 85)})</span>
        </div>` : `
        <div class="spray-legend">
            <span class="spray-legend-item"><span class="spray-dot" style="background:#ff8100"></span>HR (${count('home_run')})</span>
            <span class="spray-legend-item"><span class="spray-dot" style="background:#ffd200"></span>3B (${count('triple')})</span>
            <span class="spray-legend-item"><span class="spray-dot" style="background:#38bdf8"></span>2B (${count('double')})</span>
            <span class="spray-legend-item"><span class="spray-dot" style="background:#22d3a0"></span>1B (${count('single')})</span>
            <span class="spray-legend-item"><span class="spray-dot" style="background:rgba(255,255,255,0.2)"></span>Out (${outs})</span>
        </div>`;

    const toggle = hasEv ? `
        <div class="spray-toggle" role="group" aria-label="Spray chart color mode">
            <button class="spray-mode-btn${evMode ? '' : ' active'}" data-mode="outcome" aria-pressed="${!evMode}">Outcome</button>
            <button class="spray-mode-btn${evMode ? ' active' : ''}" data-mode="ev" aria-pressed="${evMode}">Exit velo</button>
        </div>` : '';

    return `${toggle}`+`
        <svg viewBox="0 0 250 210" xmlns="http://www.w3.org/2000/svg" class="spray-svg" role="img" aria-label="Spray chart">
            <!-- Outfield grass wedge -->
            <path d="M125,199 L22,28 Q125,-12 228,28 Z" fill="rgba(34,160,80,0.10)"/>
            <!-- Foul lines -->
            <line x1="125" y1="199" x2="22" y2="28" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>
            <line x1="125" y1="199" x2="228" y2="28" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>
            <!-- Outfield fence arc -->
            <path d="M22,28 Q125,-12 228,28" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>
            <!-- Infield dirt -->
            <circle cx="125" cy="148" r="54" fill="rgba(180,120,55,0.09)" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>
            <!-- Base paths (rough diamond) -->
            <polygon points="125,199 161,163 125,127 89,163" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="0.8"/>
            <!-- Home plate -->
            <circle cx="125" cy="199" r="3.5" fill="rgba(255,255,255,0.55)"/>
            ${outDots}
            ${hitDots}
        </svg>
        ${legend}`;
}

async function _fetchPitchArsenal(pitcherId) {
    const year = MLB_SEASON;
    const cacheKey = `pitch_arsenal_${pitcherId}_${year}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    const url = `${SAVANT_BASE_URL}/statcast_search/csv?type=pitcher` +
        `&pitchers_lookup%5B%5D=${pitcherId}` +
        `&player_type=pitcher&hfGT=R%7C&hfSea=${year}%7C` +
        `&min_results=0&group_by=name-pitch&sort_col=pitches&sort_order=desc`;

    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 10_000);
    try {
        const res = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(url) : url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`Arsenal ${res.status}`);
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) return null;

        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];

        const hdrs = _splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
        const rows = lines.slice(1)
            .filter(l => l.trim())
            .map(line => {
                const vals = _splitCSVLine(line);
                const obj = {};
                hdrs.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
                return obj;
            })
            .filter(r => r.pitch_type && r.pitch_type !== 'null');

        if (!rows.length) return null;
        ApiCache.set(cacheKey, rows, ApiCache.TTL.LONG);
        return rows;
    } catch (err) {
        Logger.debug(`Pitch arsenal unavailable: ${err.message}`, undefined, 'MLB');
        return null;
    } finally {
        clearTimeout(tid);
    }
}

const _PITCH_COLORS = {
    FF: '#ef4444', SI: '#f97316', FC: '#eab308',
    SL: '#06b6d4', ST: '#3b82f6', SW: '#0ea5e9',
    CU: '#8b5cf6', KC: '#a78bfa', CS: '#7c3aed',
    CH: '#10b981', FS: '#34d399', FO: '#6ee7b7',
    KN: '#64748b',
};

function _buildMovementSVG(rows, total) {
    // Returns inline SVG for pitch movement plot, or '' if pfx data absent.
    const valid = rows.filter(r =>
        r.pfx_x != null && r.pfx_x !== '' && r.pfx_x !== 'null' &&
        r.pfx_z != null && r.pfx_z !== '' && r.pfx_z !== 'null'
    );
    if (!valid.length) return '';

    const axisColor  = 'var(--border-mid)';
    const mutedColor = 'var(--text-muted)';

    // Axis labels
    const labels = `
        <text x="-21" y="1.2"  font-size="2" fill="${mutedColor}" text-anchor="start">Arm</text>
        <text x="21"  y="1.2"  font-size="2" fill="${mutedColor}" text-anchor="end">Glove</text>
        <text x="0"   y="-19"  font-size="2" fill="${mutedColor}" text-anchor="middle">Rise</text>
        <text x="0"   y="21.5" font-size="2" fill="${mutedColor}" text-anchor="middle">Drop</text>`;

    const dots = valid.map(r => {
        const cx    = parseFloat(r.pfx_x);
        const cy    = -parseFloat(r.pfx_z); // negate: positive pfx_z = rise = up in SVG
        const count = parseInt(r.pitches || r.n || 0);
        const pct   = total > 0 ? (count / total * 100) : 0;
        const rad   = (2.5 + (pct / 100) * 3.5).toFixed(2);
        const color = _PITCH_COLORS[r.pitch_type] || '#7c8df0';
        const velo  = parseFloat(r.release_speed || r.effective_speed || 0);
        const spin  = parseInt(r.release_spin_rate || r.spin_rate || 0);
        const name  = _escHtml(r.pitch_name || r.pitch_type);
        // Data attrs drive the tooltip via event delegation
        return `<circle
            cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${rad}"
            fill="${color}" stroke="${color}66" stroke-width="0.3"
            role="img"
            aria-label="${name}: ${Math.abs(cx).toFixed(1)}&quot; ${cx >= 0 ? 'arm-side' : 'glove-side'}, ${Math.abs(parseFloat(r.pfx_z)).toFixed(1)}&quot; ${parseFloat(r.pfx_z) >= 0 ? 'rise' : 'drop'}"
            data-pitch-type="${_escHtml(r.pitch_type)}"
            data-pitch-name="${name}"
            data-pfx-h="${cx.toFixed(1)}"
            data-pfx-v="${parseFloat(r.pfx_z).toFixed(1)}"
            data-velo="${velo > 0 ? velo.toFixed(1) : ''}"
            data-spin="${spin > 0 ? spin.toLocaleString() : ''}"
            data-pct="${pct.toFixed(1)}"
            style="cursor:pointer"
        />
        <text x="${(cx + parseFloat(rad) + 0.6).toFixed(2)}" y="${(cy + 0.9).toFixed(2)}"
            font-size="2.2" fill="var(--text-secondary)"
            class="arsenal-mvmt-label"
        >${_escHtml(r.pitch_type)}</text>`;
    }).join('');

    return `<div class="arsenal-movement-plot">
        <svg viewBox="-22 -22 44 44" width="240" height="240"
            role="img" aria-label="Pitch movement plot"
            id="arsenal-mvmt-svg" style="display:block;overflow:visible">
            <rect x="-22" y="-22" width="44" height="44" fill="var(--bg-surface)" rx="1"/>
            <line x1="-20" y1="0" x2="20" y2="0" stroke="${axisColor}" stroke-width="0.5" stroke-dasharray="2 2"/>
            <line x1="0" y1="-20" x2="0" y2="20" stroke="${axisColor}" stroke-width="0.5" stroke-dasharray="2 2"/>
            ${labels}
            ${dots}
        </svg>
        <div id="arsenal-mvmt-tooltip" style="display:none;position:absolute;z-index:10;width:160px;
            background:var(--bg-raised);border:1px solid var(--border-default);
            border-radius:var(--radius-sm);padding:0.4rem 0.6rem;font-size:0.75rem;
            color:var(--text-primary);pointer-events:none"></div>
    </div>`;
}

function _renderPitchArsenal(rows) {
    const total = rows.reduce((sum, r) => sum + (parseInt(r.pitches || r.n || 0)), 0);
    if (!total) return '';

    const mvmtSvg = _buildMovementSVG(rows, total);
    if (!mvmtSvg) Logger.debug('Movement plot: pfx_x/pfx_z absent from arsenal rows', undefined, 'MLB');

    const rowsHtml = rows.map(r => {
        const count = parseInt(r.pitches || r.n || 0);
        const pct   = total > 0 ? (count / total * 100) : 0;
        const velo  = parseFloat(r.release_speed || r.effective_speed || 0);
        const spin  = parseInt(r.release_spin_rate || r.spin_rate || 0);
        const ba    = parseFloat(r.ba || 0);
        const color = _PITCH_COLORS[r.pitch_type] || '#7c8df0';
        const name  = _escHtml(r.pitch_name || r.pitch_type);

        return `
            <div class="arsenal-row">
                <span class="arsenal-type" style="background:${color}22;color:${color};border-color:${color}44">${_escHtml(r.pitch_type)}</span>
                <span class="arsenal-name">${name}</span>
                <div class="arsenal-bar-wrap" title="${pct.toFixed(1)}% usage">
                    <div class="arsenal-bar" style="width:${Math.min(pct, 100).toFixed(1)}%;background:${color}"></div>
                </div>
                <span class="arsenal-pct">${pct.toFixed(1)}%</span>
                <span class="arsenal-velo">${velo > 0 ? velo.toFixed(1) : '—'}</span>
                <span class="arsenal-spin">${spin > 0 ? spin.toLocaleString() : '—'}</span>
                ${ba > 0 ? `<span class="arsenal-ba">.${String(Math.round(ba * 1000)).padStart(3, '0')}</span>` : '<span class="arsenal-ba">—</span>'}
            </div>`;
    }).join('');

    return `${mvmtSvg}
        <div class="arsenal-list">
            <div class="arsenal-hdr-row">
                <span></span>
                <span>Pitch</span>
                <span class="arsenal-bar-col"></span>
                <span>Usage</span>
                <span title="Average velocity (mph)">Velo</span>
                <span title="Average spin rate (rpm)">Spin</span>
                <span title="Batting average against">BAA</span>
            </div>
            ${rowsHtml}
        </div>`;
}

async function _fetchMLBH2H(batterId, pitcherId) {
    const cacheKey = `h2h_${batterId}_${pitcherId}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    const curYear = MLB_SEASON;
    const hfSea = [curYear, curYear-1, curYear-2, curYear-3, curYear-4].map(y => `${y}%7C`).join('');
    const url = `${SAVANT_BASE_URL}/statcast_search/csv?type=pitcher` +
        `&pitchers_lookup%5B%5D=${pitcherId}` +
        `&batters_lookup%5B%5D=${batterId}` +
        `&player_type=pitcher&hfGT=R%7C&hfSea=${hfSea}&min_results=0`;

    try {
        const res = await fetch(MLB_USE_PROXY ? _mlbProxyUrl(url) : url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`H2H ${res.status}`);
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) return null;

        const lines = text.trim().split('\n');
        if (lines.length < 2) return { pa: 0, ab: 0, h: 0, hr: 0, k: 0, bb: 0, hbp: 0, sf: 0 };

        const hdrs = _splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
        const eIdx = hdrs.indexOf('events');
        if (eIdx < 0) return null;

        let pa = 0, ab = 0, h = 0, hr = 0, k = 0, bb = 0, hbp = 0, sf = 0;
        const NON_AB = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_fly', 'sac_fly_double_play', 'sac_bunt', 'catcher_interf']);
        const HIT    = new Set(['single', 'double', 'triple', 'home_run']);

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const vals = _splitCSVLine(lines[i]);
            const ev = (vals[eIdx] || '').replace(/^"|"$/g, '').trim();
            if (!ev) continue;

            pa++;
            if (!NON_AB.has(ev))  ab++;
            if (HIT.has(ev))       h++;
            if (ev === 'home_run') hr++;
            if (ev === 'strikeout' || ev === 'strikeout_double_play') k++;
            if (ev === 'walk')     bb++;
            if (ev === 'hit_by_pitch') hbp++;
            if (ev === 'sac_fly' || ev === 'sac_fly_double_play') sf++;
        }

        const result = { pa, ab, h, hr, k, bb, hbp, sf };
        ApiCache.set(cacheKey, result, ApiCache.TTL.LONG);
        return result;
    } catch (err) {
        Logger.debug(`H2H fetch failed: ${err.message}`, undefined, 'MLB');
        return null;
    }
}

// ── API functions ─────────────────────────────────────────────

async function fetchMLBTeams(season = MLB_SEASON) {
    const data = await mlbFetch('/teams', { sportId: 1, season }, ApiCache.TTL.LONG);
    return (data.teams || []).filter(t =>
        t.league?.name?.includes('League') && t.sport?.id === 1
    );
}

async function fetchMLBSchedule(daysBack = 7) {
    // MLB schedule dates are ET-based. toISOString() is UTC, so after ~8pm ET the
    // UTC date is already "tomorrow" — subtract 5h to anchor to the ET calendar day.
    const nowET  = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const fromET = new Date(nowET.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const fmt    = d => d.toISOString().split('T')[0];
    const data   = await mlbFetch('/schedule', {
        sportId:   1,
        startDate: fmt(fromET),
        endDate:   fmt(nowET),
        hydrate:   'team,probablePitcher',
    }, ApiCache.TTL.SHORT);
    return (data.dates || [])
        .flatMap(d => d.games || [])
        .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
}

async function fetchMLBLeagueStats(group = 'hitting', season = MLB_SEASON, limit = 600, statsType = 'season') {
    const sortStat = group === 'hitting' ? 'battingAverage' : 'strikeOuts';
    const params = { stats: statsType, season, group, sportId: 1, limit, playerPool: 'All' };
    if (statsType === 'season') params.sortStat = sortStat;
    const ttl  = statsType === 'season' && _activeGameHours() ? ApiCache.TTL.SHORT : ApiCache.TTL.MEDIUM;
    if (group === 'hitting' && statsType === 'season') await _ensureWrcConstants(season);
    const data = await mlbFetch('/stats', params, ttl);
    return data.stats?.[0]?.splits || [];
}

async function fetchMLBTeamSchedule(teamId, daysBack = 15) {
    const nowET  = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const fromET = new Date(nowET.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const fmt    = d => d.toISOString().split('T')[0];
    const data   = await mlbFetch('/schedule', {
        sportId:   1,
        teamId,
        startDate: fmt(fromET),
        endDate:   fmt(nowET),
        hydrate:   'team',
    }, ApiCache.TTL.SHORT);
    return (data.dates || [])
        .flatMap(d => d.games || [])
        .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
}

async function fetchMLBRoster(teamId, season = MLB_SEASON) {
    const data = await mlbFetch(`/teams/${teamId}/roster`, {
        rosterType: 'fullRoster',
        season,
    }, ApiCache.TTL.MEDIUM);
    const POS_ORDER = { C: 0, '1B': 1, '2B': 2, '3B': 3, SS: 4, LF: 5, CF: 6, RF: 7, DH: 8, SP: 9, RP: 10, CL: 11 };
    const IL_CODES  = new Set(['D7', 'D10', 'D15', 'D60', 'MIN', 'BRV', 'PL', 'SUSP', 'RM']);
    return (data.roster || [])
        .map(p => ({
            id:           p.person?.id,
            fullName:     p.person?.fullName || '',
            jerseyNumber: p.jerseyNumber || '',
            position:     p.position?.abbreviation || '',
            positionType: p.position?.type || '',
            statusCode:   p.status?.code || 'A',
            statusDesc:   p.status?.description || '',
            onIL:         IL_CODES.has(p.status?.code) || (p.status?.description || '').toLowerCase().includes('injured'),
        }))
        .sort((a, b) => {
            if (a.onIL !== b.onIL) return a.onIL ? 1 : -1;
            const ap = POS_ORDER[a.position] ?? 20;
            const bp = POS_ORDER[b.position] ?? 20;
            return ap !== bp ? ap - bp : a.fullName.localeCompare(b.fullName);
        });
}

// ── MLB player view mode ─────────────────────────────────────
let mlbPlayerViewMode  = 'cards';
let mlbTableSortField  = 'avg';
let mlbTableSortDir    = 'desc';

function setMLBPlayerView(mode) {
    mlbPlayerViewMode = mode;
    document.getElementById('mlbCardViewBtn')?.classList.toggle('active',  mode === 'cards');
    document.getElementById('mlbTableViewBtn')?.classList.toggle('active', mode === 'table');
    displayMLBPlayers(AppState.mlbStatsGroup);
}

// ── View: Players ─────────────────────────────────────────────

async function loadMLBPlayers() {
    const grid = document.getElementById('playersGrid');
    if (window.setBreadcrumb) setBreadcrumb('mlb-players', null);

    // Show search bar with adjusted placeholder for MLB
    document.getElementById('searchBar')?.style.setProperty('display', 'block');
    document.getElementById('viewHeader')?.style.setProperty('display', 'none');

    const resultEl = document.getElementById('resultCount');
    if (resultEl) resultEl.textContent = 'Loading MLB players…';

    grid.className = 'players-grid';
    grid.innerHTML = Array.from({ length: 9 }, () => `
        <div class="skeleton-card">
            <div class="skeleton-card-header">
                <div>
                    <div class="skeleton-line" style="width:140px;height:18px;margin-bottom:8px"></div>
                    <div class="skeleton-line" style="width:70px;height:12px"></div>
                </div>
                <div class="skeleton-line" style="width:52px;height:28px;border-radius:20px"></div>
            </div>
            <div class="skeleton-card-rows">
                <div class="skeleton-line" style="height:34px;border-radius:7px"></div>
                <div class="skeleton-line" style="height:34px;border-radius:7px"></div>
                <div class="skeleton-line" style="height:34px;border-radius:7px"></div>
                <div class="skeleton-line" style="height:34px;border-radius:7px"></div>
            </div>
        </div>
    `).join('');

    try {
        _renderMLBGroupToggle();

        const group = AppState.mlbStatsGroup;
        const [splits, teams] = await Promise.all([
            fetchMLBLeagueStats(group, MLB_SEASON),
            AppState.mlbTeams.length
                ? Promise.resolve(AppState.mlbTeams)
                : fetchMLBTeams(MLB_SEASON).then(t => { AppState.mlbTeams = t; return t; }),
        ]);

        const abbrById = new Map(teams.map(t => [t.id, t.abbreviation]));

        AppState.mlbPlayerStats[group] = {};
        AppState.mlbPlayers[group]     = [];

        splits.forEach(split => {
            const id = split.player?.id;
            if (!id) return;
            AppState.mlbPlayerStats[group][id] = { ...split.stat, player_id: id };
            AppState.mlbPlayers[group].push({
                id,
                fullName: split.player.fullName || '—',
                teamId:   split.team?.id,
                teamName: split.team?.name,
                teamAbbr: abbrById.get(split.team?.id) || split.team?.abbreviation || '',
                position: split.position?.abbreviation,
            });
        });

        AppState._mlbPlayerStatsTs = Date.now();
        displayMLBPlayers(group);

    } catch (error) {
        ErrorHandler.handle(grid, error, loadMLBPlayers, { tag: 'MLB', title: 'Failed to Load MLB Players' });
    }
}

function _renderMLBGroupToggle() {
    if (document.getElementById('mlbGroupToggle')) return;

    const container = document.querySelector('.search-container');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.id = 'mlbGroupToggle';
    wrap.className = 'mlb-group-toggle-row';

    ['hitting', 'pitching'].forEach(group => {
        const btn = document.createElement('button');
        btn.className = 'mlb-group-btn';
        btn.textContent  = group === 'hitting' ? 'Hitters' : 'Pitchers';
        btn.dataset.group = group;
        _styleMLBGroupBtn(btn, AppState.mlbStatsGroup === group);
        btn.addEventListener('click', () => {
            AppState.mlbStatsGroup    = group;
            AppState.mlbPositionFilter = 'all'; // reset position when switching groups
            _clearMLBSearch();
            mlbTableSortField = group === 'hitting' ? 'avg' : 'era';
            mlbTableSortDir   = group === 'hitting' ? 'desc' : 'asc';
            document.querySelectorAll('[data-group]').forEach(b =>
                _styleMLBGroupBtn(b, b.dataset.group === group)
            );
            // Remove existing toggles before reloading
            document.getElementById('mlbGroupToggle')?.remove();
            document.getElementById('mlbPositionRow')?.remove();
            loadMLBPlayers();
        });
        wrap.appendChild(btn);
    });

    // Separator
    const sep = document.createElement('span');
    sep.className = 'mlb-group-sep';
    wrap.appendChild(sep);

    // View toggle buttons (card / table)
    const cardBtn = document.createElement('button');
    cardBtn.id = 'mlbCardViewBtn';
    cardBtn.className = 'mlb-view-btn';
    cardBtn.title = 'Card view';
    cardBtn.textContent = '⊞';
    cardBtn.addEventListener('click', () => setMLBPlayerView('cards'));

    const tableBtn = document.createElement('button');
    tableBtn.id = 'mlbTableViewBtn';
    tableBtn.className = 'mlb-view-btn';
    tableBtn.title = 'Table view';
    tableBtn.textContent = '≡';
    tableBtn.addEventListener('click', () => setMLBPlayerView('table'));

    _styleMLBViewBtn(cardBtn,  mlbPlayerViewMode === 'cards');
    _styleMLBViewBtn(tableBtn, mlbPlayerViewMode === 'table');

    wrap.appendChild(cardBtn);
    wrap.appendChild(tableBtn);

    const meta = container.querySelector('.search-meta');
    container.insertBefore(wrap, meta);

    // ── Position filter row ───────────────────────────────────
    const posWrap = document.createElement('div');
    posWrap.id = 'mlbPositionRow';
    posWrap.className = 'mlb-pos-row';

    const HITTING_POS  = MLB_HITTING_POSITIONS;
    const PITCHING_POS = MLB_PITCHING_POSITIONS;
    const posList = AppState.mlbStatsGroup === 'hitting' ? HITTING_POS : PITCHING_POS;
    const curPlayers = AppState.mlbPlayers[AppState.mlbStatsGroup] || [];

    posList.forEach(pos => {
        const filterVal = pos.toLowerCase();
        const count     = pos === 'All'
            ? curPlayers.length
            : curPlayers.filter(p => _mlbPosMatch(p.position, filterVal)).length;
        if (pos !== 'All' && count === 0) return; // skip positions with no data yet

        const btn = document.createElement('button');
        btn.className = 'mlb-pos-btn';
        btn.textContent      = pos;
        btn.dataset.posFilter = filterVal;
        _styleMLBPosBtn(btn, AppState.mlbPositionFilter === filterVal);
        btn.addEventListener('click', () => {
            AppState.mlbPositionFilter = filterVal;
            _clearMLBSearch();
            document.querySelectorAll('[data-pos-filter]').forEach(b =>
                _styleMLBPosBtn(b, b.dataset.posFilter === filterVal)
            );
            displayMLBPlayers(AppState.mlbStatsGroup);
        });
        posWrap.appendChild(btn);
    });

    container.insertBefore(posWrap, meta);
}

function _styleMLBViewBtn(btn, active) {
    btn.classList.toggle('mlb-view-btn--active', active);
}

function _styleMLBGroupBtn(btn, active) {
    btn.classList.toggle('mlb-group-btn--active', active);
}

function _styleMLBPosBtn(btn, active) {
    btn.classList.toggle('mlb-pos-btn--active', active);
}

function displayMLBPlayers(group = AppState.mlbStatsGroup) {
    _refreshMLBPositionRow(group);
    if (mlbPlayerViewMode === 'table') {
        displayMLBPlayersTable(group);
    } else {
        displayMLBPlayerCards(group);
    }
}

// Rebuild the position filter pill row with current player counts.
// Called after player data loads so positions with >0 players appear.
function _refreshMLBPositionRow(group) {
    const existing = document.getElementById('mlbPositionRow');
    if (!existing) return; // toggle not rendered yet (non-players view)

    const HITTING_POS  = MLB_HITTING_POSITIONS;
    const PITCHING_POS = MLB_PITCHING_POSITIONS;
    const posList    = group === 'hitting' ? HITTING_POS : PITCHING_POS;
    const curPlayers = AppState.mlbPlayers[group] || [];
    const curFilter  = AppState.mlbPositionFilter;

    existing.innerHTML = '';
    posList.forEach(pos => {
        const filterVal = pos.toLowerCase();
        const count     = pos === 'All'
            ? curPlayers.length
            : curPlayers.filter(p => _mlbPosMatch(p.position, filterVal)).length;
        if (pos !== 'All' && count === 0) return;

        const btn = document.createElement('button');
        btn.className = 'mlb-pos-btn';
        btn.textContent       = pos;
        btn.dataset.posFilter = filterVal;
        _styleMLBPosBtn(btn, curFilter === filterVal);
        btn.addEventListener('click', () => {
            AppState.mlbPositionFilter = filterVal;
            _clearMLBSearch();
            document.querySelectorAll('[data-pos-filter]').forEach(b =>
                _styleMLBPosBtn(b, b.dataset.posFilter === filterVal)
            );
            displayMLBPlayers(group);
        });
        existing.appendChild(btn);
    });
}

function displayMLBPlayerCards(group) {
    const grid    = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = ''; // clear leftover inline layout (e.g. player-detail flex-center) so .players-grid governs

    const allPlayers = AppState.mlbPlayers[group] || [];
    const players    = AppState.mlbPositionFilter === 'all'
        ? allPlayers
        : allPlayers.filter(p => _mlbPosMatch(p.position, AppState.mlbPositionFilter));
    if (allPlayers.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No MLB player data available for this season');
        return;
    }

    // Build rank map for primary stat (AVG for hitters, ERA for pitchers)
    const rankKey = group === 'hitting' ? 'avg' : 'era';
    const rankDesc = group === 'hitting'; // higher AVG = better; lower ERA = better
    const rankMap  = {};
    [...players]
        .filter(p => AppState.mlbPlayerStats[group]?.[p.id]?.[rankKey] != null)
        .sort((a, b) => {
            const av = parseFloat(AppState.mlbPlayerStats[group][a.id][rankKey]);
            const bv = parseFloat(AppState.mlbPlayerStats[group][b.id][rankKey]);
            return rankDesc ? bv - av : av - bv;
        })
        .forEach((p, i) => { rankMap[p.id] = i + 1; });

    const fragment = document.createDocumentFragment();
    players.slice(0, 100).forEach(player => {
        const stats = AppState.mlbPlayerStats[group]?.[player.id];
        fragment.appendChild(_createMLBPlayerCard(player, stats, group, rankMap[player.id]));
    });
    grid.innerHTML = '';
    grid.appendChild(fragment);

    const el = document.getElementById('resultCount');
    if (el) {
        const freshness = _formatFreshness(AppState._mlbPlayerStatsTs);
        el.textContent = `Showing ${Math.min(players.length, 100)} of ${players.length}${AppState.mlbPositionFilter !== 'all' ? ` ${AppState.mlbPositionFilter.toUpperCase()}` : ''} players`;
        if (freshness) {
            const badge = document.createElement('span');
            badge.className = 'freshness-label';
            badge.textContent = freshness;
            badge.setAttribute('aria-label', 'Data last updated ' + freshness.slice('Updated '.length));
            el.appendChild(badge);
        }
    }
}

function displayMLBPlayersTable(group) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = ''; // clear leftover inline layout from a prior view (e.g. player-detail flex-center)
    grid.innerHTML = '';

    const allPlayers = AppState.mlbPlayers[group] || [];
    const players    = AppState.mlbPositionFilter === 'all'
        ? allPlayers
        : allPlayers.filter(p => _mlbPosMatch(p.position, AppState.mlbPositionFilter));
    if (allPlayers.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No MLB player data available for this season');
        return;
    }

    const HITTING_COLS = [
        { label: '#',    field: null,            cls: 'tbl-rank' },
        { label: 'Player', field: null,          cls: '' },
        { label: 'Team', field: null,            cls: '' },
        { label: 'AVG',  field: 'avg',           cls: 'tbl-stat tbl-pts' },
        { label: 'OPS',  field: 'ops',           cls: 'tbl-stat tbl-reb' },
        { label: 'HR',   field: 'homeRuns',      cls: 'tbl-stat tbl-ast' },
        { label: 'RBI',  field: 'rbi',           cls: 'tbl-stat' },
        { label: 'R',    field: 'runs',          cls: 'tbl-stat' },
        { label: 'SB',   field: 'stolenBases',   cls: 'tbl-stat' },
        { label: 'BB',   field: 'baseOnBalls',   cls: 'tbl-stat' },
        { label: 'SO',   field: 'strikeOuts',    cls: 'tbl-stat' },
        { label: 'GP',   field: 'gamesPlayed',   cls: 'tbl-stat' },
    ];

    const PITCHING_COLS = [
        { label: '#',    field: null,              cls: 'tbl-rank' },
        { label: 'Player', field: null,            cls: '' },
        { label: 'Team', field: null,              cls: '' },
        { label: 'ERA',  field: 'era',             cls: 'tbl-stat tbl-pts' },
        { label: 'WHIP', field: 'whip',            cls: 'tbl-stat tbl-reb' },
        { label: 'W',    field: 'wins',            cls: 'tbl-stat tbl-ast' },
        { label: 'L',    field: 'losses',          cls: 'tbl-stat' },
        { label: 'SO',   field: 'strikeOuts',      cls: 'tbl-stat' },
        { label: 'IP',   field: 'inningsPitched',  cls: 'tbl-stat' },
        { label: 'BB',   field: 'baseOnBalls',     cls: 'tbl-stat' },
        { label: 'SV',   field: 'saves',           cls: 'tbl-stat' },
        { label: 'GP',   field: 'gamesPlayed',     cls: 'tbl-stat' },
    ];

    const COLS = group === 'hitting' ? HITTING_COLS : PITCHING_COLS;

    const sorted = [...players].sort((a, b) => {
        const av = parseFloat(AppState.mlbPlayerStats[group]?.[a.id]?.[mlbTableSortField]) || (mlbTableSortDir === 'desc' ? -Infinity : Infinity);
        const bv = parseFloat(AppState.mlbPlayerStats[group]?.[b.id]?.[mlbTableSortField]) || (mlbTableSortDir === 'desc' ? -Infinity : Infinity);
        return mlbTableSortDir === 'desc' ? bv - av : av - bv;
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';

    const table = document.createElement('table');
    table.className = 'stats-table';

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${COLS.map(col => {
        const sortable = col.field ? 'sortable' : '';
        const isActive = col.field === mlbTableSortField ? 'sort-active' : '';
        const dir      = col.field === mlbTableSortField ? (mlbTableSortDir === 'desc' ? '↓' : '↑') : '';
        const dataAttr = col.field ? `data-sort="${col.field}"` : '';
        return `<th class="${sortable} ${isActive}" ${dataAttr}>${col.label}${dir ? ` <span class="sort-arrow">${dir}</span>` : ''}</th>`;
    }).join('')}</tr>`;
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    sorted.forEach((player, i) => {
        const stats = AppState.mlbPlayerStats[group]?.[player.id];
        const tr    = document.createElement('tr');
        tr.onclick  = () => showMLBPlayerDetail(player.id, group);

        const cells = COLS.map(col => {
            if (!col.field) {
                if (col.label === '#')       return `<td class="tbl-rank">${i + 1}</td>`;
                if (col.label === 'Player') {
                    const hsUrl  = getMLBPlayerHeadshotUrl(player.id);
                    const clrs   = getMLBTeamColors(player.teamAbbr);
                    const inits  = (player.fullName || '').split(' ').map(w => w[0]).slice(0, 2).join('');
                    return `<td>
                        <div style="display:flex;align-items:center;gap:0.5rem">
                            <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,${clrs.primary}cc,${clrs.primary}44);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:800;color:#fff;position:relative;overflow:hidden">
                                <img src="${hsUrl}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%" data-hide-on-error>
                                <span>${inits}</span>
                            </div>
                            <div>
                                <div class="tbl-player-name">${_escHtml(player.fullName)}</div>
                                <div class="tbl-player-pos">${player.position || ''}</div>
                            </div>
                        </div>
                    </td>`;
                }
                if (col.label === 'Team')    return `<td><span class="tbl-team-badge">${player.teamAbbr || '—'}</span></td>`;
            }
            if (!stats || stats[col.field] == null) return `<td class="${col.cls}" style="color:#334155">—</td>`;
            const raw = stats[col.field];
            const num = parseFloat(raw);
            const display = isNaN(num) ? raw :
                (col.field === 'era'  || col.field === 'whip') ? num.toFixed(2) :
                (col.field === 'avg'  || col.field === 'obp'  ||
                 col.field === 'slg'  || col.field === 'ops')  ? _fmtAvg(num) :
                String(raw);
            return `<td class="${col.cls}">${display}</td>`;
        });

        tr.innerHTML = cells.join('');
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Column sort
    thead.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (mlbTableSortField === field) {
                mlbTableSortDir = mlbTableSortDir === 'desc' ? 'asc' : 'desc';
            } else {
                mlbTableSortField = field;
                mlbTableSortDir   = field === 'era' || field === 'whip' || field === 'losses' ? 'asc' : 'desc';
            }
            displayMLBPlayersTable(group);
        });
    });

    wrapper.appendChild(table);
    grid.appendChild(wrapper);

    const el = document.getElementById('resultCount');
    if (el) {
        const freshness = _formatFreshness(AppState._mlbPlayerStatsTs);
        el.textContent = `Showing ${sorted.length} of ${players.length} players`;
        if (freshness) {
            const badge = document.createElement('span');
            badge.className = 'freshness-label';
            badge.textContent = freshness;
            badge.setAttribute('aria-label', 'Data last updated ' + freshness.slice('Updated '.length));
            el.appendChild(badge);
        }
    }
}

function _createMLBPlayerCard(player, stats, group, rank) {
    const card     = document.createElement('div');
    card.className = 'player-card';
    card.style.cursor = 'pointer';
    card.onclick   = () => showMLBPlayerDetail(player.id, group);

    const colors      = getMLBTeamColors(player.teamAbbr);
    // Team-color accent border at top (like NBA conference borders)
    card.style.borderTop = `3px solid ${colors.primary}cc`;

    const initials    = (player.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const headshotUrl = getMLBPlayerHeadshotUrl(player.id);

    const statsHtml = stats
        ? (group === 'hitting' ? `
            <div class="detail-row"><span class="detail-label">AVG</span><span class="detail-value">${stats.avg || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">OBP</span><span class="detail-value">${stats.obp || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">SLG</span><span class="detail-value">${stats.slg || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">OPS</span><span class="detail-value">${stats.ops || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">HR</span><span class="detail-value">${stats.homeRuns ?? '—'}</span></div>
            <div class="detail-row"><span class="detail-label">RBI</span><span class="detail-value">${stats.rbi ?? '—'}</span></div>
        ` : `
            <div class="detail-row"><span class="detail-label">ERA</span><span class="detail-value">${stats.era || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">WHIP</span><span class="detail-value">${stats.whip || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">W-L</span><span class="detail-value">${stats.wins ?? '—'}–${stats.losses ?? '—'}</span></div>
            <div class="detail-row"><span class="detail-label">SO</span><span class="detail-value">${stats.strikeOuts ?? '—'}</span></div>
            <div class="detail-row"><span class="detail-label">K/9</span><span class="detail-value">${stats.strikeoutsPer9Inn ? parseFloat(stats.strikeoutsPer9Inn).toFixed(1) : '—'}</span></div>
            <div class="detail-row"><span class="detail-label">SV</span><span class="detail-value">${stats.saves ?? '—'}</span></div>
        `)
        : `<div class="detail-row" style="justify-content:center;color:var(--color-text-muted);font-size:0.82rem">No stats available</div>`;

    const rankLabel  = group === 'hitting' ? 'AVG' : 'ERA';
    const rankBadge  = rank != null
        ? `<span class="player-rank-badge ${rank <= 10 ? 'player-rank-badge--top' : ''}">#${rank} ${rankLabel}</span>`
        : '';
    const isFav  = AppState.mlbFavorites?.has(player.id) ?? false;
    const favBtn = `<button class="mlb-fav-btn ${isFav ? 'mlb-fav-btn--active' : ''}"
        data-player-id="${player.id}"
        title="${isFav ? 'Remove from starred' : 'Star player'}"
        aria-label="${isFav ? 'Remove from starred' : 'Star player'}"
        onclick="event.stopPropagation();_toggleMLBFav(${player.id})">♥</button>`;

    card.innerHTML = `
        <div class="player-card-top">
            ${rankBadge}
            ${favBtn}
            <div class="player-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55)">
                ${headshotUrl ? `<img class="player-headshot" src="${headshotUrl}" alt="" loading="lazy" data-hide-on-error>` : ''}
                ${initials}
            </div>
            <div class="player-name">${_escHtml(player.fullName)}</div>
            <div class="player-team">${player.teamAbbr ? player.teamAbbr + ' · ' : ''}${player.position || 'N/A'}</div>
        </div>
        <div class="player-details">${statsHtml}</div>
        <div class="card-cta">VIEW PROFILE →</div>
    `;

    return card;
}

// ── Freshness label helper ────────────────────────────────────

function _formatFreshness(ts) {
    if (!ts) return '';
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1)  return 'Updated just now';
    if (mins < 60) return `Updated ${mins} min ago`;
    const d = new Date(ts);
    const isToday = d.toDateString() === new Date().toDateString();
    if (isToday) return `Updated today at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    return `Updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

// ── Phase 2: computed rate stats ─────────────────────────────

function _computeBattingRates(s) {
    const pa   = parseFloat(s.plateAppearances) || 0;
    const ab   = parseFloat(s.atBats)           || 1;
    const sf   = parseFloat(s.sacFlies)         || 0;
    const hits = parseFloat(s.hits)             || 0;
    const hr   = parseFloat(s.homeRuns)         || 0;
    const so   = parseFloat(s.strikeOuts)       || 0;
    const bb   = parseFloat(s.baseOnBalls)      || 0;
    const tb   = parseFloat(s.totalBases)       || 0;
    const sb   = parseFloat(s.stolenBases)      || 0;
    const cs   = parseFloat(s.caughtStealing)   || 0;
    const hbp  = parseFloat(s.hitByPitch)       || 0;
    const ibw  = parseFloat(s.intentionalWalks) || 0;
    const dbl  = parseFloat(s.doubles)          || 0;
    const trpl = parseFloat(s.triples)          || 0;
    const slg  = parseFloat(s.slg);
    const avg  = parseFloat(s.avg);

    const iso   = (!isNaN(slg) && !isNaN(avg)) ? _fmtAvg(slg - avg) : null;
    const babip = (hits >= 0 && hr >= 0 && so >= 0 && (ab - so - hr + sf) > 0)
        ? _fmtAvg((hits - hr) / (ab - so - hr + sf))
        : null;
    const bbPct = pa > 0 ? (bb / pa * 100).toFixed(1) : null;
    const kPct  = pa > 0 ? (so / pa * 100).toFixed(1) : null;
    const bbK   = so > 0 ? (bb / so).toFixed(2) : null;
    // Bill James Runs Created: (H + BB) × TB ÷ (AB + BB)
    const rc    = (ab + bb) > 0 ? String(Math.round((hits + bb) * tb / (ab + bb))) : null;
    const sbPct = (sb + cs) > 0 ? (sb / (sb + cs) * 100).toFixed(1) : null;
    // wOBA — 2024 FanGraphs linear weights
    const sing      = Math.max(0, hits - dbl - trpl - hr);
    const wobaDenom = ab + bb - ibw + sf + hbp;
    const wobaRaw   = wobaDenom > 0
        ? (0.69 * (bb - ibw) + 0.72 * hbp + 0.89 * sing + 1.27 * dbl + 1.62 * trpl + 2.10 * hr) / wobaDenom
        : null;
    const woba = wobaRaw != null ? _fmtAvg(wobaRaw) : null;

    // On-pace projections (min 10 GP for stability)
    const gp = parseFloat(s.gamesPlayed) || 0;
    const pace = gp >= 10 ? {
        hr:  Math.round(hr  / gp * 162),
        rbi: Math.round((parseFloat(s.rbi)         || 0) / gp * 162),
        r:   Math.round((parseFloat(s.runs)        || 0) / gp * 162),
        h:   Math.round(hits / gp * 162),
        sb:  Math.round(sb   / gp * 162),
        so:  Math.round(so   / gp * 162),
        dbl: Math.round(dbl  / gp * 162),
    } : null;

    // wRC+ — park-neutral, league-average-scaled offensive rate
    // Uses FanGraphs guts constants. Display with "†" if using preliminary constants.
    const wrcConst = _MLB_WRC_CONSTANTS[MLB_SEASON] || _MLB_WRC_CONSTANTS[2025];
    const wrcPlus = wobaRaw != null && wrcConst && wrcConst.lgRPA > 0
        ? Math.round(((wobaRaw - wrcConst.lgwOBA) / wrcConst.wOBAscale + wrcConst.lgRPA) / wrcConst.lgRPA * 100)
        : null;

    return { iso, babip, bbPct, kPct, bbK, pa: pa || null, rc, sbPct, woba, wrcPlus, pace };
}

function _computePitchingRates(s) {
    // parseFloat reads "100.2" (100⅔ IP) as 100.2 — _mlbIpToNum converts thirds correctly
    const ip  = _mlbIpToNum(s.inningsPitched);
    const bf  = parseFloat(s.battersFaced)    || 1;
    const so  = parseFloat(s.strikeOuts)      || 0;
    const bb  = parseFloat(s.baseOnBalls)     || 0;
    const hr  = parseFloat(s.homeRuns)        || 0;
    const hbp = parseFloat(s.hitBatsmen)      || 0;
    const h   = parseFloat(s.hits)            || 0;
    const r   = parseFloat(s.runs)            || 0;
    const gs  = parseFloat(s.gamesStarted)    || 0;
    const qs  = parseFloat(s.qualityStarts)   || 0;
    const sv  = parseFloat(s.saves)           || 0;
    const hld = parseFloat(s.holds)           || 0;

    const fip = ip > 0
        ? ((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + 3.10).toFixed(2)
        : null;
    const kBbPct = bf > 0
        ? (((so - bb) / bf) * 100).toFixed(1)
        : null;
    // FanGraphs LOB%: (H + BB + HBP − R) ÷ (H + BB + HBP − 1.4 × HR) × 100
    const lobDenom = h + bb + hbp - 1.4 * hr;
    const lobPct = lobDenom > 0
        ? Math.min(100, (h + bb + hbp - r) / lobDenom * 100).toFixed(1)
        : null;
    // QS% — requires at least 5 starts to be meaningful
    const qsPct = gs >= 5 ? (qs / gs * 100).toFixed(1) : null;
    // SV+HLD — total leverage appearances preserved
    const svHld = sv + hld;

    // On-pace projections — min 3 starts for starters, 10 GP for relievers
    const gp   = parseFloat(s.gamesPlayed) || 0;
    const pace = (gs >= 3 || (gs === 0 && gp >= 10)) ? {
        k:  Math.round(so / gp * 162),
        w:  gs >= 3 ? Math.round((parseFloat(s.wins) || 0) / gs * 30) : null,
        sv: gs === 0 && sv > 0 ? Math.round(sv / gp * 162) : null,
        ip: ip > 0 ? parseFloat((ip / gp * 162).toFixed(1)) : null,
    } : null;

    return { fip, kBbPct, lobPct, qsPct, svHld: svHld > 0 ? String(svHld) : null, pace };
}

// ── MLB formatting helpers ────────────────────────────────────

// Baseball rate stats (AVG/OBP/SLG) omit the leading zero: .315 not 0.315.
// OPS can exceed 1.000, so we only strip when the result starts with "0.".
function _fmtAvg(n) {
    return n.toFixed(3).replace(/^0\./, '.');
}

// ── MLB stat bar helpers ──────────────────────────────────────

// ── League percentile engine (P3-028) ─────────────────────────
// Percentiles computed client-side from AppState.mlbLeaderSplits —
// the same qualified pool as the P3-015 rank badges. No extra fetches.

const _MLB_PCT_MIN_PA = 80;
const _MLB_PCT_MIN_IP = 15;

function _mlbIpToNum(ip) { const p = String(ip || '0').split('.'); return parseInt(p[0]) + (parseInt(p[1] || 0) / 3); }

function _mlbPctPool(group) {
    AppState._mlbPctPools = AppState._mlbPctPools || {};
    const key = `${group}_${MLB_SEASON}`;
    if (AppState._mlbPctPools[key]) return AppState._mlbPctPools[key];
    const splits = AppState.mlbLeaderSplits?.[group] || [];
    if (!splits.length) return null;
    const qual = group === 'hitting'
        ? splits.filter(s => (parseFloat(s.stat?.plateAppearances) || 0) >= _MLB_PCT_MIN_PA)
        : splits.filter(s => _mlbIpToNum(s.stat?.inningsPitched) >= _MLB_PCT_MIN_IP);
    if (qual.length < 20) return null;
    const pool = { qual, sorted: {}, n: qual.length };
    AppState._mlbPctPools[key] = pool;
    return pool;
}

function _mlbPctOf(group, statKey, value, lowerBetter) {
    const pool = _mlbPctPool(group);
    if (!pool) return null;
    const v = parseFloat(value);
    if (isNaN(v)) return null;
    let arr = pool.sorted[statKey];
    if (!arr) {
        arr = pool.qual.map(s => parseFloat(s.stat?.[statKey])).filter(x => !isNaN(x)).sort((a, b) => a - b);
        pool.sorted[statKey] = arr;
    }
    if (arr.length < 20) return null;
    let below = 0, ties = 0;
    for (const x of arr) { if (x < v) below++; else if (x === v) ties++; }
    let pct = Math.round(((below + ties / 2) / arr.length) * 100);
    if (lowerBetter) pct = 100 - pct;
    return Math.max(1, Math.min(99, pct));
}

// Diverging blue → gray → red, Savant convention (red = elite).
// Fixed hex by design: data-encoding scale, not a themed surface (P3-028).
function _mlbPctColor(p) {
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    if (p >= 50) { const t = (p - 50) / 50; return `rgb(${lerp(138, 214, t)},${lerp(141, 58, t)},${lerp(147, 49, t)})`; }
    const t = p / 50;
    return `rgb(${lerp(54, 138, t)},${lerp(97, 141, t)},${lerp(173, 147, t)})`;
}

function _mlbPctRow(label, value, opts = {}) {
    const num = parseFloat(value);
    if (isNaN(num) || value == null) return '';
    const display = opts.fmt ? opts.fmt(num) : value;
    const pct = (opts.statKey && !opts.noPct) ? _mlbPctOf(opts.group, opts.statKey, num, opts.lowerBetter) : null;
    if (pct == null) {
        return `
        <div class="pct-row pct-row--plain">
            <span class="pct-label">${label}</span>
            <span class="pct-value">${display}</span>
        </div>`;
    }
    const color = _mlbPctColor(pct);
    const ord = (pct % 10 === 1 && pct !== 11) ? 'st' : (pct % 10 === 2 && pct !== 12) ? 'nd' : (pct % 10 === 3 && pct !== 13) ? 'rd' : 'th';
    const pool = opts.group === 'pitching' ? 'pitchers' : 'hitters';
    return `
        <div class="pct-row" role="img" aria-label="${label}: ${display}, ${pct}${ord} percentile of qualified ${pool}" title="${pct}${ord} percentile of qualified ${pool}">
            <span class="pct-label">${label}</span>
            <div class="pct-track">
                <div class="pct-fill" style="width:${pct}%;background:${color}"></div>
                <span class="pct-bubble" style="left:${pct}%;background:${color}">${pct}</span>
            </div>
            <span class="pct-value">${display}</span>
        </div>`;
}

function _mlbPctCaption(group, playerQualified) {
    const pool = _mlbPctPool(group);
    if (!pool) return '';
    const noun = group === 'pitching' ? 'pitchers' : 'hitters';
    if (!playerQualified) {
        const thresh = group === 'pitching' ? `${_MLB_PCT_MIN_IP} IP` : `${_MLB_PCT_MIN_PA} PA`;
        return `<p class="pct-caption">Below qualification threshold (${thresh}) — league percentiles hidden</p>`;
    }
    return `<p class="pct-caption">League percentiles · vs ${pool.n} qualified ${noun} · red = elite</p>`;
}

function _mlbHittingBars(stats, rates = {}) {
    const qualified = (parseFloat(stats.plateAppearances) || 0) >= _MLB_PCT_MIN_PA && !!_mlbPctPool('hitting');
    const g = { group: 'hitting', noPct: !qualified };
    const rows = [
        _mlbPctRow('Batting Avg',  stats.avg,         { ...g, statKey: 'avg', fmt: _fmtAvg }),
        _mlbPctRow('On-Base %',    stats.obp,         { ...g, statKey: 'obp', fmt: _fmtAvg }),
        _mlbPctRow('Slugging %',   stats.slg,         { ...g, statKey: 'slg', fmt: _fmtAvg }),
        _mlbPctRow('OPS',          stats.ops,         { ...g, statKey: 'ops', fmt: _fmtAvg }),
        _mlbPctRow('wOBA',         rates.woba,        { ...g, statKey: 'woba' }),
        _mlbPctRow('wRC+',         rates.wrcPlus,     { ...g, statKey: 'wrcPlus', fmt: v => v + _wrcDagger() }),
        _mlbPctRow('ISO',          rates.iso,         { ...g, statKey: 'iso' }),
        _mlbPctRow('BABIP',        rates.babip,       { ...g, statKey: 'babip' }),
        _mlbPctRow('BB%',          rates.bbPct,       { ...g, statKey: 'bbPct', fmt: v => `${v}%` }),
        _mlbPctRow('K%',           rates.kPct,        { ...g, statKey: 'kPct',  lowerBetter: true, fmt: v => `${v}%` }),
        _mlbPctRow('SB%',          rates.sbPct,       { ...g, statKey: 'sbPct', fmt: v => `${v}%` }),
    ].filter(Boolean).join('');
    return _mlbPctCaption('hitting', qualified) + rows;
}

function _mlbPitchingBars(stats, rates = {}) {
    const qualified = _mlbIpToNum(stats.inningsPitched) >= _MLB_PCT_MIN_IP && !!_mlbPctPool('pitching');
    const g = { group: 'pitching', noPct: !qualified };
    const f2 = v => parseFloat(v).toFixed(2);
    const rows = [
        _mlbPctRow('ERA',        stats.era,                { ...g, statKey: 'era',  lowerBetter: true, fmt: f2 }),
        _mlbPctRow('WHIP',       stats.whip,               { ...g, statKey: 'whip', lowerBetter: true, fmt: f2 }),
        _mlbPctRow('K/9',        stats.strikeoutsPer9Inn,  { ...g, statKey: 'strikeoutsPer9Inn', fmt: v => parseFloat(v).toFixed(1) }),
        _mlbPctRow('BB/9',       stats.walksPer9Inn,       { ...g, statKey: 'walksPer9Inn', lowerBetter: true, fmt: f2 }),
        _mlbPctRow('H/9',        stats.hitsPer9Inn,        { ...g, statKey: 'hitsPer9Inn',  lowerBetter: true, fmt: f2 }),
        _mlbPctRow('HR/9',       stats.homeRunsPer9,       { ...g, statKey: 'homeRunsPer9', lowerBetter: true, fmt: f2 }),
        _mlbPctRow('K/BB',       stats.strikeoutWalkRatio, { ...g, statKey: 'strikeoutWalkRatio', fmt: f2 }),
        _mlbPctRow('FIP',        rates?.fip,               { ...g, statKey: 'fip',    lowerBetter: true, fmt: f2 }),
        _mlbPctRow('K-BB%',      rates?.kBbPct,            { ...g, statKey: 'kBbPct', fmt: v => `${v}%` }),
        _mlbPctRow('LOB%',       rates?.lobPct,            { ...g, statKey: 'lobPct', fmt: v => `${v}%` }),
        _mlbPctRow('QS%',        rates?.qsPct,             { ...g, statKey: 'qsPct',  fmt: v => `${v}%` }),
    ].filter(Boolean).join('');
    return _mlbPctCaption('pitching', qualified) + rows;
}

// ── Savant Visual Card ──────────────────────────────────────────────
// Opens Baseball Savant in a new tab — no iframe (Savant blocks embedding).

function _mlbSavantVisualCard(player, group) {
    const year = MLB_SEASON;
    const id   = player.id;

    const slug = (player.fullName || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        + '-' + id;

    const profileUrl = `https://baseballsavant.mlb.com/savant-player/${slug}`;

    if (group === 'hitting') {
        const sprayUrl = `https://baseballsavant.mlb.com/statcast_search?hfSea=${year}%7C&type=details&player_type=batter&batters_lookup%5B%5D=${id}`;
        return `
            <h2 class="detail-section-title">Spray Chart <span class="statcast-badge">${year} season</span></h2>
            <div id="spray-chart-area" class="spray-loading">
                <div class="skeleton-line" style="height:220px;border-radius:var(--radius-sm)"></div>
            </div>
            <div class="savant-link-row" style="margin-top:0.75rem">
                <a href="${sprayUrl}" target="_blank" rel="noopener" class="savant-link-btn">View on Savant ↗</a>
                <a href="${profileUrl}" target="_blank" rel="noopener" class="savant-link-btn">Player Profile ↗</a>
            </div>`;
    }

    const zoneUrl = `https://baseballsavant.mlb.com/statcast_search?hfSea=${year}%7C&type=details&player_type=pitcher&pitchers_lookup%5B%5D=${id}`;
    return `
        <h2 class="detail-section-title">Baseball Savant <span class="statcast-badge">opens in new tab</span></h2>
        <p class="savant-card-sub">Pitch zone heatmaps and Statcast visuals on Baseball Savant.</p>
        <div class="savant-link-row">
            <a href="${zoneUrl}"    target="_blank" rel="noopener" class="savant-link-btn">Pitch Search ↗</a>
            <a href="${profileUrl}" target="_blank" rel="noopener" class="savant-link-btn">Player Profile ↗</a>
        </div>`;
}

// ── League rank context for player detail stats ───────────────
// Returns { statKey: { rank, total } } for stats where player qualifies and
// has a notable rank. Used to annotate the stats grid in showMLBPlayerDetail.
function _mlbPlayerLeagueRanks(playerId, group) {
    const splits = AppState.mlbLeaderSplits?.[group] || [];
    if (!splits.length) return {};

    const _parseIP = ip => { const p = String(ip || '0').split('.'); return parseInt(p[0]) + (parseInt(p[1] || 0) / 3); };

    const CATS = group === 'hitting' ? [
        { key: 'avg',               desc: true,  minPA: 80 },
        { key: 'obp',               desc: true,  minPA: 80 },
        { key: 'slg',               desc: true,  minPA: 80 },
        { key: 'ops',               desc: true,  minPA: 80 },
        { key: 'homeRuns',          desc: true,  minPA: 0 },
        { key: 'rbi',               desc: true,  minPA: 0 },
        { key: 'hits',              desc: true,  minPA: 0 },
        { key: 'runs',              desc: true,  minPA: 0 },
        { key: 'stolenBases',       desc: true,  minPA: 0 },
        { key: 'baseOnBalls',       desc: true,  minPA: 0 },
        { key: 'strikeOuts',        desc: false, minPA: 0 },
        { key: 'totalBases',        desc: true,  minPA: 0 },
    ] : [
        { key: 'era',               desc: false, minIP: 15 },
        { key: 'whip',              desc: false, minIP: 15 },
        { key: 'strikeoutsPer9Inn', desc: true,  minIP: 15 },
        { key: 'walksPer9Inn',      desc: false, minIP: 15 },
        { key: 'wins',              desc: true,  minIP: 0 },
        { key: 'strikeOuts',        desc: true,  minIP: 0 },
        { key: 'saves',             desc: true,  minIP: 0 },
        { key: 'qualityStarts',     desc: true,  minIP: 0 },
    ];

    const result = {};
    CATS.forEach(cat => {
        const pool = splits.filter(s => {
            if (s.stat?.[cat.key] == null || isNaN(parseFloat(s.stat[cat.key]))) return false;
            if ((cat.minPA || 0) > 0 && (s.stat?.plateAppearances || 0) < cat.minPA) return false;
            if ((cat.minIP || 0) > 0 && _parseIP(s.stat?.inningsPitched) < cat.minIP) return false;
            return true;
        });
        if (!pool.length) return;
        const sorted = [...pool].sort((a, b) => {
            const av = parseFloat(a.stat[cat.key]);
            const bv = parseFloat(b.stat[cat.key]);
            return cat.desc ? bv - av : av - bv;
        });
        const rank = sorted.findIndex(s => s.player?.id === playerId) + 1;
        if (rank > 0) result[cat.key] = { rank, total: sorted.length };
    });
    return result;
}

// ── View: Player Detail ───────────────────────────────────────

function showMLBPlayerDetail(playerId, group = AppState.mlbStatsGroup) {
    AppState.currentView = `mlb-player-${playerId}`;

    // Cold deep-links land here without mlbLeaderSplits — rank badges and
    // P3-028 percentiles silently vanish. Fetch the pool once and re-render.
    if (!AppState.mlbLeaderSplits && typeof _fetchMLBLeaderSplits === 'function' && !showMLBPlayerDetail._refetching) {
        showMLBPlayerDetail._refetching = true;
        _fetchMLBLeaderSplits(MLB_SEASON).then(() => {
            showMLBPlayerDetail._refetching = false;
            if (AppState.mlbLeaderSplits && String(location.hash).startsWith(`#mlb-player-${playerId}`)) {
                showMLBPlayerDetail(playerId, group);
            }
        }).catch(() => { showMLBPlayerDetail._refetching = false; });
    }

    // Cache coherence: if leaderboard data is more than 5 min fresher than player
    // stats in AppState, the player card would show stale numbers. Clear and re-fetch.
    const _STALE = 5 * 60 * 1000;
    if (AppState._mlbLeaderSplitsTs && AppState._mlbPlayerStatsTs &&
        AppState._mlbLeaderSplitsTs - AppState._mlbPlayerStatsTs > _STALE) {
        AppState.mlbPlayers     = { hitting: [], pitching: [] };
        AppState.mlbPlayerStats = { hitting: {}, pitching: {} };
        AppState._mlbPlayerStatsTs = null;
        if (typeof _restoreMLBPlayerDetail === 'function') {
            _restoreMLBPlayerDetail(playerId, group);
            return;
        }
    }

    const players = AppState.mlbPlayers[group] || [];
    const player  = players.find(p => p.id === playerId);
    if (!player) {
        // Pool never loaded on this session path (e.g. Leaders as the entry
        // view) — defer to the deep-link restore path, which fetches the pool
        // directly and re-renders (D-038 V1).
        if (!players.length && typeof _restoreMLBPlayerDetail === 'function' && !showMLBPlayerDetail._restoring) {
            showMLBPlayerDetail._restoring = true;
            Promise.resolve(_restoreMLBPlayerDetail(playerId, group))
                .finally(() => { showMLBPlayerDetail._restoring = false; });
            return;
        }
        const grid = document.getElementById('playersGrid');
        if (grid) {
            grid.className = '';
            grid.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:4rem 1.5rem';
            grid.innerHTML = `
                <div style="text-align:center;max-width:360px">
                    <p style="color:var(--text-secondary);font-weight:600;margin-bottom:0.5rem">Player not found</p>
                    <p style="color:var(--text-muted);font-size:var(--text-sm);margin-bottom:1rem">This player may not have stats recorded for the current season, or the link may be outdated.</p>
                    <button class="btn-ghost" onclick="navigateTo('mlb-players')">Browse all players →</button>
                </div>`;
        }
        return;
    }

    const grid    = document.getElementById('playersGrid');
    const stats   = AppState.mlbPlayerStats[group]?.[playerId] || {};
    const colors  = getMLBTeamColors(player.teamAbbr);
    const initials = (player.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');

    // Record in recently viewed
    if (typeof addRecent === 'function') addRecent({
        id:    player.id,
        sport: 'mlb',
        type:  'player',
        name:  player.fullName || `Player ${player.id}`,
        sub:   `${player.teamAbbr || '—'} · ${player.position || '—'}`,
        badge: 'MLB',
        action: null,
    });

    window.scrollTo({ top: 0, behavior: 'instant' });

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="mlb-players"]').forEach(t => t.classList.add('active'));

    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('mlb-players', player.fullName);

    history.pushState({ view: 'mlb-player', id: playerId, group }, '', `#mlb-player-${playerId}-${group}`);

    const headshotUrl = getMLBPlayerHeadshotUrl(playerId);
    const headshotImg = headshotUrl
        ? `<img class="player-headshot player-headshot--detail" src="${headshotUrl}" alt="${_escHtml(player.fullName)}" loading="lazy" data-hide-on-error>`
        : '';
    // Computed rate stats (Phase 2 — derived from existing API fields)
    const batting  = group === 'hitting'  ? _computeBattingRates(stats)  : null;
    const pitching = group === 'pitching' ? _computePitchingRates(stats) : null;

    // 4th element: stat key for league rank lookup (null = no rank shown)
    // One number, one home (2026-06-11): tiles hold counting/volume stats with
    // rank badges; all rates/advanced live in Key Metrics with percentile bars.
    const statDefs = group === 'hitting' ? [
        ['HR',    stats.homeRuns,     'homeRuns'],
        ['RBI',   stats.rbi,          'rbi'],
        ['R',     stats.runs,         'runs'],
        ['H',     stats.hits,         'hits'],
        ['2B',    stats.doubles,      null],
        ['3B',    stats.triples,      null],
        ['TB',    stats.totalBases,   'totalBases'],
        ['SB',    stats.stolenBases,  'stolenBases'],
        ['BB',    stats.baseOnBalls,  'baseOnBalls'],
        ['SO',    stats.strikeOuts,   'strikeOuts'],
        ['Speed', (() => { const sr = AppState.mlbSprintSpeed?.[playerId]; return sr ? parseFloat(sr.sprint_speed).toFixed(1) + ' ft/s' : null; })(), null],
        ['PA',    batting?.pa,         null],
        ['GP',    stats.gamesPlayed,   null],
    ] : [
        ['W',     stats.wins,               'wins'],
        ['L',     stats.losses,             null],
        ['SO',    stats.strikeOuts,         'strikeOuts'],
        ['IP',    stats.inningsPitched,     null],
        ['BB',    stats.baseOnBalls,        null],
        ['QS',    stats.qualityStarts,      'qualityStarts'],
        ['SV',    stats.saves,              'saves'],
        ['HLD',   stats.holds,              null],
        ['GS',    stats.gamesStarted,       null],
        ['GP',    stats.gamesPlayed,        null],
    ];

    const gl = typeof StatGlossary !== 'undefined' ? StatGlossary : null;
    const leagueRanks = _mlbPlayerLeagueRanks(playerId, group);
    const statsGrid = statDefs
        .filter(([, value]) => value != null)
        .map(([label, value, rankKey]) => {
            const ri = rankKey && leagueRanks[rankKey];
            const rankHtml = ri && ri.rank <= 30
                ? `<div class="stat-rank${ri.rank <= 5 ? ' stat-rank--elite' : ri.rank <= 15 ? ' stat-rank--top' : ''}">#${ri.rank}</div>`
                : '';
            return `
                <div class="stat-item">
                    <div class="stat-value">${value}</div>
                    <div class="stat-label">${gl ? gl.auto(label) : label}</div>
                    ${rankHtml}
                </div>
            `;
        }).join('');

    // Stat bars for key metrics
    const barHtml = group === 'hitting' ? _mlbHittingBars(stats, batting || {}) : _mlbPitchingBars(stats, pitching || {});

    // Fielding card — synchronous lookup from AppState populated by _fetchMLBLeaderSplits
    const _fs = AppState.mlbFieldingStats?.[playerId];
    const _fmtFpct = v => { const n = parseFloat(v); return isNaN(n) ? '—' : n.toFixed(3).replace(/^0\./, '.'); };
    const _fsi = (val, label) => val != null
        ? `<div class="stat-item"><div class="stat-value">${val}</div><div class="stat-label">${label}</div></div>`
        : '';
    const fieldingCardHtml = _fs ? `
        <div class="stats-card">
            <h2 class="detail-section-title">Fielding</h2>
            <div class="stats-grid">
                ${_fsi(_fs.errors,                              'E')}
                ${_fsi(_fmtFpct(_fs.fielding),                 'FPCT')}
                ${_fsi(_fs.chances,                            'TC')}
                ${_fsi(_fs.assists,                            'A')}
                ${_fsi(_fs.putOuts,                            'PO')}
                ${_fs.rangeFactorPerGame != null ? _fsi(parseFloat(_fs.rangeFactorPerGame).toFixed(2), 'RF/G') : ''}
            </div>
        </div>` : '';

    // Team logo
    const teamLogo = getMLBTeamLogoUrl(player.teamId);

    grid.className  = 'player-detail-container';
    grid.innerHTML = `
        <div class="player-detail-header">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <button onclick="backToMLBPlayers()" class="back-button">← Players</button>
                <div style="display:flex;gap:0.5rem;align-items:center">
                    <button class="share-btn" onclick="_downloadMLBCard(${playerId},'${group}')" title="Download stat card PNG">↓ Card</button>
                    <button class="share-btn" onclick="_shareCurrentPage()" title="Copy link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        Share
                    </button>
                    <button class="share-btn" onclick="_triggerBroadcastBlurb(${playerId},'${group}')" title="Generate AI broadcast blurb (requires Blurb Worker)">Blurb</button>
                    <button class="share-btn" onclick="_showMLBScoutReport(${playerId},'${group}')" title="Generate scouting report">Scout</button>
                </div>
            </div>
            <div class="player-hero">
                <div class="player-detail-avatar"
                     style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55);
                            color:#fff;font-size:2.5rem;font-weight:800">
                    ${headshotImg}${initials}
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${_escHtml(player.fullName)}</h1>
                        <span class="player-hero-pos">${player.position || 'N/A'}</span>
                        <button class="shc-share-btn" id="mlb-hero-share" aria-label="Share ${_escHtml(player.fullName)}'s stat card" title="Share stat card">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>
                        </button>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.2rem">
                        ${teamLogo ? `<img src="${teamLogo}" alt="" style="width:24px;height:24px;object-fit:contain" loading="lazy" data-hide-on-error>` : ''}
                        ${player.teamId
                            ? `<button onclick="showMLBTeamDetail(${player.teamId})" style="background:none;border:none;padding:0;color:var(--color-text-secondary);cursor:pointer;font-size:inherit;font-family:inherit;text-decoration:underline;text-underline-offset:3px;margin:0">${player.teamName || ''}</button>`
                            : `<p class="player-detail-meta" style="color:var(--color-text-secondary);margin:0">${player.teamName || ''}</p>`}
                    </div>
                    <p class="player-detail-meta" style="color:var(--color-text-muted)">
                        ${MLB_SEASON} MLB Season · ${group === 'hitting' ? 'Batting' : 'Pitching'}
                        ${_parkFactorBadge(player.teamAbbr)}
                    </p>
                    <div id="mlb-analytics-badge"></div>
                    <div id="mlb-bio-strip"></div>
                </div>
            </div>
        </div>

        <div class="stats-card" id="mlb-blurb-card" style="display:none"></div>
        <div class="stats-card" id="mlb-scout-card" style="display:none"></div>

        <div class="stats-card">
            <h2 class="detail-section-title">Stat Profile</h2>
            <div style="position:relative;height:260px">
                <canvas id="mlb-player-radar"></canvas>
            </div>
        </div>

        <div class="stats-card">
            <div class="detail-section-hdr">
                <h2 class="detail-section-title">${MLB_SEASON} Season Totals</h2>
                <div id="mlb-sparkline-row"></div>
            </div>
            <div class="stats-grid">${statsGrid}</div>
        </div>

        ${barHtml ? `
        <div class="stats-card">
            <h2 class="detail-section-title">Key Metrics</h2>
            <div class="pct-profile">${barHtml}</div>
        </div>
        ` : ''}

        ${(() => {
            const p = group === 'hitting' ? batting?.pace : pitching?.pace;
            if (!p) return '';
            const items = group === 'hitting' ? [
                ['HR', p.hr], ['RBI', p.rbi], ['R', p.r], ['H', p.h],
                ['2B', p.dbl], ['SB', p.sb], ['SO', p.so],
            ] : [
                ['K', p.k], ['W', p.w], ['SV', p.sv], ['IP', p.ip],
            ].filter(([, v]) => v != null);
            return `<div class="stats-card pace-card">
                <h2 class="detail-section-title">On Pace For <span class="pace-season-label">${MLB_SEASON}</span></h2>
                <div class="pace-grid">${items.map(([label, val]) => val != null ? `<div class="pace-item"><div class="pace-val">${val}</div><div class="pace-label">${label}</div></div>` : '').join('')}</div>
            </div>`;
        })()}

        <div class="stats-card" id="mlb-splits-card">
            <h2 class="detail-section-title">Splits</h2>
            <div style="height:64px;display:flex;align-items:center;justify-content:center">
                <div class="skeleton-line" style="width:100%;height:40px;border-radius:8px"></div>
            </div>
        </div>

        ${group === 'pitching' ? `
        <div class="stats-card" id="mlb-last-starts-card">
            <div style="height:36px;display:flex;align-items:center">
                <div class="skeleton-line" style="width:80%;height:20px;border-radius:6px"></div>
            </div>
        </div>
        ` : ''}

        <div class="stats-card" id="mlb-trend-card">
            <h2 class="detail-section-title">${group === 'hitting' ? 'Last 20 Games' : 'Last 8 Outings'}</h2>
            <div style="position:relative;height:220px;display:flex;align-items:center;justify-content:center">
                <div class="skeleton-line" style="width:100%;height:100%;border-radius:8px"></div>
            </div>
        </div>

        <div class="stats-card" id="mlb-statcast-card">
            <h2 class="detail-section-title">Statcast</h2>
            <div style="height:48px;display:flex;align-items:center;padding:0 0.5rem">
                <div class="skeleton-line" style="width:100%;height:28px;border-radius:6px"></div>
            </div>
        </div>

        ${group === 'pitching' ? `
        <div class="stats-card" id="mlb-arsenal-card">
            <h2 class="detail-section-title">Pitch Arsenal</h2>
            <div style="height:80px;display:flex;align-items:center;padding:0 0.5rem">
                <div class="skeleton-line" style="width:100%;height:60px;border-radius:6px"></div>
            </div>
        </div>
        ` : ''}

        <div class="stats-card" id="mlb-career-card">
            <h2 class="detail-section-title">Career Stats</h2>
            <div style="height:48px;display:flex;align-items:center;padding:0 0.5rem">
                <div class="skeleton-line" style="width:100%;height:28px;border-radius:6px"></div>
            </div>
        </div>

        ${fieldingCardHtml}

        <div class="stats-card" id="mlb-savant-visual-card">
            ${_mlbSavantVisualCard(player, group)}
        </div>

        <div class="stats-card">
            ${_mlbH2HCard(player, group)}
        </div>

        ${_mlbCompareCard(player, group)}
    `;

    // Render radar chart immediately
    if (group === 'hitting') {
        StatsCharts.mlbRadar('mlb-player-radar', [{
            label: player.fullName,
            color: colors.primary,
            data: {
                avg:         parseFloat(stats.avg)  || 0,
                homeRuns:    stats.homeRuns          || 0,
                rbi:         stats.rbi               || 0,
                obp:         parseFloat(stats.obp)   || 0,
                slg:         parseFloat(stats.slg)   || 0,
                stolenBases: stats.stolenBases       || 0,
            },
        }], 'hitting', player.position || '');
    } else {
        StatsCharts.mlbRadar('mlb-player-radar', [{
            label: player.fullName,
            color: colors.primary,
            data: {
                era:  parseFloat(stats.era)              || 0,
                k9:   parseFloat(stats.strikeoutsPer9Inn) || 0,
                bb9:  parseFloat(stats.walksPer9Inn)      || 0,
                whip: parseFloat(stats.whip)              || 0,
                ip:   parseFloat(stats.inningsPitched)    || 0,
            },
        }], 'pitching');
    }

    // Wire compare dropdowns
    document.getElementById('mlb-cmp-select-b')?.addEventListener('change', e => _onMLBCompareChange(player, stats, group, colors));
    document.getElementById('mlb-cmp-select-c')?.addEventListener('change', e => _onMLBCompareChange(player, stats, group, colors));

    // Hero share button (P3-027 Phase 2) — headline stat card
    document.getElementById('mlb-hero-share')?.addEventListener('click', () => {
        if (typeof shareStatCard !== 'function') return;
        const hit = group === 'hitting';
        const statKey = hit ? 'ops' : 'era';
        const statNum = parseFloat(hit ? stats.ops : stats.era);
        if (isNaN(statNum)) return;
        shareStatCard({
            playerId,
            playerName: player.fullName || '',
            teamAbbr:   player.teamAbbr || '',
            position:   player.position || '',
            statLabel:  hit ? 'OPS' : 'ERA',
            statValue:  hit ? _fmtAvg(statNum) : statNum.toFixed(2),
            rank:       leagueRanks?.[statKey]?.rank || null,
            headshotUrl: getMLBPlayerHeadshotUrl(playerId),
            btn: document.getElementById('mlb-hero-share'),
        });
    });

    // Async: splits (hitting + pitching)
    const splitsFetcher = group === 'hitting'
        ? _fetchMLBHittingSplits(playerId)
        : _fetchMLBPitchingSplits(playerId);

    splitsFetcher.then(splits => {
        const card = document.getElementById('mlb-splits-card');
        if (!card) return;
        if (!splits || Object.keys(splits).length === 0) { card.innerHTML = ''; return; }
        card.innerHTML = `
            <h2 class="detail-section-title">Splits</h2>
            ${group === 'hitting' ? _renderMLBSplits(splits) : _renderMLBPitchingSplits(splits)}
        `;
        _initSplitsTabs(card);
    }).catch(() => {
        const card = document.getElementById('mlb-splits-card');
        if (card) card.innerHTML = '';
    });

    // Async: fetch game log → last-N-starts summary + trend chart
    _fetchMLBGameLog(playerId, group).then(logs => {
        // Last N starts card (pitchers only)
        if (group === 'pitching') {
            const startsCard = document.getElementById('mlb-last-starts-card');
            if (startsCard) {
                const html = _renderLastNStarts(logs, colors.primary);
                startsCard.innerHTML = html || '';
            }
        }

        // Sparkline — last 7 entries shown inline in the stats card header
        const sparkEl = document.getElementById('mlb-sparkline-row');
        if (sparkEl && logs.length >= 2) {
            const last7 = logs.slice(-7);
            const vals = group === 'hitting'
                ? last7.map(g => parseFloat(g.avg) || 0)
                : last7.map(g => {
                    const ip = parseFloat(g.inningsPitched || 0);
                    return ip > 0 ? Math.min((g.earnedRuns / ip) * 9, 20) : 0;
                });
            const stat = group === 'hitting' ? 'AVG' : 'ERA';
            const svg  = _buildSparklineSVG(vals);
            if (svg) {
                sparkEl.innerHTML = `<div class="sparkline-widget" title="Last ${last7.length} games — ${stat} trend">${svg}<span class="sparkline-lbl">L${last7.length} ${stat}</span></div>`;
            }
        }

        const trendCard = document.getElementById('mlb-trend-card');
        if (!trendCard) return;

        const limit  = group === 'hitting' ? 20 : 8;
        const recent = logs.slice(-limit);

        if (recent.length < 2) { trendCard.innerHTML = ''; return; }

        trendCard.innerHTML = `
            <h2 class="detail-section-title">${group === 'hitting' ? `Last ${recent.length} Games` : `Last ${recent.length} Outings`}</h2>
            <div style="position:relative;height:220px">
                <canvas id="mlb-player-trend"></canvas>
            </div>
        `;
        StatsCharts.mlbGameTrend('mlb-player-trend', recent, group, colors.primary);
    }).catch(() => {
        const trendCard = document.getElementById('mlb-trend-card');
        if (trendCard) trendCard.innerHTML = '';
        const startsCard = document.getElementById('mlb-last-starts-card');
        if (startsCard) startsCard.innerHTML = '';
    });

    // Async: Statcast percentile data (Baseball Savant / Google Cloud)
    const savantType = group === 'pitching' ? 'pitcher' : 'batter';
    fetchStatcast(playerId, savantType).then(data => {
        const card = document.getElementById('mlb-statcast-card');
        if (!card) return;
        if (!data) { card.innerHTML = ''; return; }
        // Augment with actual stats for luck-delta rows (data stays in-scope; no mutation outside this closure)
        data._actual_avg  = stats.avg  ? parseFloat(stats.avg)  : null;
        data._actual_woba = batting?.woba ?? null;
        data._actual_era  = stats.era  ? parseFloat(stats.era)  : null;
        card.innerHTML = `
            <h2 class="detail-section-title">Statcast <span class="statcast-badge">via Baseball Savant</span></h2>
            ${_renderStatcastCard(data, group)}
        `;
        const badge   = _computeMLBAnalyticsBadge(stats, data, group);
        const badgeEl = document.getElementById('mlb-analytics-badge');
        if (badgeEl) badgeEl.innerHTML = badge
            ? `<span class="analytics-badge ${badge.cls}" title="${_escHtml(badge.desc)}">${badge.label}</span>`
            : '';
    }).catch(() => {
        const card = document.getElementById('mlb-statcast-card');
        if (card) card.innerHTML = '';
    });

    // Async: spray chart (hitters only — MLB Stats API play-by-play, last 20 games)
    if (group === 'hitting') {
        fetchSprayChartData(playerId).then(hits => {
            const area = document.getElementById('spray-chart-area');
            if (!area) return;
            area.className = '';
            if (!hits || !hits.length) {
                area.innerHTML = '<p class="spray-no-data">No batted ball data available for this season.</p>';
                return;
            }
            area.innerHTML = _renderSprayChartSVG(hits, 'outcome');
            area.addEventListener('click', e => {
                const btn = e.target.closest('.spray-mode-btn');
                if (!btn || btn.classList.contains('active')) return;
                area.innerHTML = _renderSprayChartSVG(hits, btn.dataset.mode);
            });
        }).catch(() => {
            const area = document.getElementById('spray-chart-area');
            if (area) area.innerHTML = '<p class="spray-no-data">Spray chart unavailable.</p>';
        });
    }

    // Async: pitch arsenal (pitchers only — Statcast grouped CSV)
    if (group === 'pitching') {
        _fetchPitchArsenal(playerId).then(rows => {
            const card = document.getElementById('mlb-arsenal-card');
            if (!card) return;
            if (!rows || !rows.length) { card.innerHTML = ''; return; }
            card.innerHTML = `
                <h2 class="detail-section-title">Pitch Arsenal <span class="statcast-badge">via Baseball Savant</span></h2>
                ${_renderPitchArsenal(rows)}
            `;
            // Movement plot tooltip — event delegation on SVG
            const svg     = document.getElementById('arsenal-mvmt-svg');
            const tooltip = document.getElementById('arsenal-mvmt-tooltip');
            if (svg && tooltip) {
                svg.addEventListener('mouseover', e => {
                    const c = e.target.closest('circle[data-pitch-type]');
                    if (!c) return;
                    const h    = c.dataset.pfxH;
                    const v    = c.dataset.pfxV;
                    const hDir = parseFloat(h) >= 0 ? 'arm-side' : 'glove-side';
                    const vDir = parseFloat(v) >= 0 ? 'rise' : 'drop';
                    const velo = c.dataset.velo ? `${c.dataset.velo} mph` : '';
                    const spin = c.dataset.spin ? `${c.dataset.spin} rpm` : '';
                    const meta = [velo, spin].filter(Boolean).join(' · ');
                    tooltip.innerHTML =
                        `<strong>${c.dataset.pitchName} (${_escHtml(c.dataset.pitchType)})</strong><br>` +
                        `Break: ${Math.abs(parseFloat(h)).toFixed(1)}" H (${hDir}) · ${Math.abs(parseFloat(v)).toFixed(1)}" V (${vDir})<br>` +
                        (meta ? meta + ` · ` : '') +
                        `${c.dataset.pct}% usage`;
                    const svgRect = svg.getBoundingClientRect();
                    const cRect   = c.getBoundingClientRect();
                    const wrap    = svg.closest('.arsenal-movement-plot');
                    const wRect   = wrap.getBoundingClientRect();
                    tooltip.style.display = 'block';
                    tooltip.style.left = `${cRect.left - wRect.left + 12}px`;
                    tooltip.style.top  = `${cRect.top  - wRect.top  - tooltip.offsetHeight - 6}px`;
                });
                svg.addEventListener('mouseout', e => {
                    if (!e.target.closest('circle[data-pitch-type]')) return;
                    tooltip.style.display = 'none';
                });
                // Touch: tap to show, tap elsewhere to hide
                svg.addEventListener('click', e => {
                    const c = e.target.closest('circle[data-pitch-type]');
                    tooltip.style.display = (c && tooltip.style.display === 'none') ? 'block' : 'none';
                });
            }
        }).catch(() => {
            const card = document.getElementById('mlb-arsenal-card');
            if (card) card.innerHTML = '';
        });
    }

    // Async: player bio (age, handedness, hometown, debut)
    _fetchMLBPlayerBio(playerId).then(person => {
        const el = document.getElementById('mlb-bio-strip');
        if (el) el.innerHTML = _renderPlayerBio(person, group);
    }).catch(() => {});

    // Async: career year-by-year stats
    _fetchMLBCareerStats(playerId, group).then(rows => {
        const card = document.getElementById('mlb-career-card');
        if (!card) return;
        if (!rows || rows.length === 0) { card.innerHTML = ''; return; }
        card.innerHTML = `
            <h2 class="detail-section-title">Career Stats</h2>
            ${_renderMLBCareerTable(rows, group)}
        `;
        _wireMLBCareerTrend(rows, group, colors.primary);
        _wireMLBCareerCSV(rows, group, player);
    }).catch(() => {
        const card = document.getElementById('mlb-career-card');
        if (card) card.innerHTML = '';
    });
}

// ── MLB Hitting Splits ────────────────────────────────────────

const _MONTH_LABELS = { 3:'Mar', 4:'Apr', 5:'May', 6:'Jun', 7:'Jul', 8:'Aug', 9:'Sep', 10:'Oct' };

async function _fetchMLBHittingSplits(playerId) {
    const types  = ['vsLeft', 'vsRight', 'home', 'away', 'last7Days', 'last14Days', 'last30Days'];
    const labels = {
        vsLeft:    'vs LHP',
        vsRight:   'vs RHP',
        home:      'Home',
        away:      'Away',
        last7Days:  'L7',
        last14Days: 'L14',
        last30Days: 'L30',
    };
    const results = {};

    await Promise.all([
        ...types.map(async type => {
            try {
                const hydrate = `stats(group=[hitting],type=${type},season=${MLB_SEASON})`;
                const data    = await mlbFetch(`/people/${playerId}`, { hydrate }, ApiCache.TTL.MEDIUM);
                const splits  = data?.people?.[0]?.stats?.[0]?.splits || [];
                if (splits.length) results[type] = { label: labels[type], stat: splits[0]?.stat || {} };
            } catch (_) {}
        }),
        (async () => {
            try {
                const hydrate = `stats(group=[hitting],type=byMonth,season=${MLB_SEASON})`;
                const data    = await mlbFetch(`/people/${playerId}`, { hydrate }, ApiCache.TTL.MEDIUM);
                const splits  = data?.people?.[0]?.stats?.[0]?.splits || [];
                for (const s of splits) {
                    const lbl = _MONTH_LABELS[s.month];
                    if (lbl && s.stat) results[`month_${s.month}`] = { label: lbl, stat: s.stat };
                }
            } catch (_) {}
        })(),
    ]);

    return results;
}

async function _fetchMLBPitchingSplits(playerId) {
    const types  = ['vsLeft', 'vsRight', 'home', 'away', 'last7Days', 'last14Days', 'last30Days'];
    const labels = {
        vsLeft:    'vs LHB',
        vsRight:   'vs RHB',
        home:      'Home',
        away:      'Away',
        last7Days:  'L7',
        last14Days: 'L14',
        last30Days: 'L30',
    };
    const results = {};

    await Promise.all([
        ...types.map(async type => {
            try {
                const hydrate = `stats(group=[pitching],type=${type},season=${MLB_SEASON})`;
                const data    = await mlbFetch(`/people/${playerId}`, { hydrate }, ApiCache.TTL.MEDIUM);
                const splits  = data?.people?.[0]?.stats?.[0]?.splits || [];
                if (splits.length) results[type] = { label: labels[type], stat: splits[0]?.stat || {} };
            } catch (_) {}
        }),
        (async () => {
            try {
                const hydrate = `stats(group=[pitching],type=byMonth,season=${MLB_SEASON})`;
                const data    = await mlbFetch(`/people/${playerId}`, { hydrate }, ApiCache.TTL.MEDIUM);
                const splits  = data?.people?.[0]?.stats?.[0]?.splits || [];
                for (const s of splits) {
                    const lbl = _MONTH_LABELS[s.month];
                    if (lbl && s.stat) results[`month_${s.month}`] = { label: lbl, stat: s.stat };
                }
            } catch (_) {}
        })(),
    ]);

    return results;
}

function _renderMLBPitchingSplits(splits) {
    const COLS = [
        { key: 'gamesPlayed',   label: 'G' },
        { key: 'inningsPitched',label: 'IP' },
        { key: 'era',           label: 'ERA' },
        { key: 'whip',          label: 'WHIP', fmt: v => v != null ? parseFloat(v).toFixed(2) : '—' },
        { key: 'strikeOuts',    label: 'K' },
        { key: 'baseOnBalls',   label: 'BB' },
        { key: 'homeRuns',      label: 'HR' },
        { key: 'earnedRuns',    label: 'ER' },
    ];

    const RECENT_TYPES = new Set(['last7Days', 'last14Days', 'last30Days']);
    const types    = Object.keys(splits);
    const firstTab = types[0];

    const _eraDelta = (t, stat) => {
        if (!RECENT_TYPES.has(t)) return '';
        const homeEra   = parseFloat(splits.home?.stat?.era || 0);
        const awayEra   = parseFloat(splits.away?.stat?.era || 0);
        const recentEra = parseFloat(stat.era || 0);
        if (!homeEra || !awayEra || !recentEra) return '';
        const seasonRef = (homeEra + awayEra) / 2;
        const diff = recentEra - seasonRef;
        if (Math.abs(diff) < 0.05) return '';
        // Lower ERA is better — negative diff is good
        const sign = diff > 0 ? '+' : '';
        const cls  = diff < 0 ? 'splits-delta--pos' : 'splits-delta--neg';
        return `<span class="${cls}" title="vs estimated season avg">${sign}${diff.toFixed(2)} ERA</span>`;
    };

    const tabs = types.map(t => {
        const isRecent = RECENT_TYPES.has(t);
        const isMonth  = t.startsWith('month_');
        return `<button class="mlb-splits-tab ${t === firstTab ? 'mlb-splits-tab--active' : ''}${isRecent ? ' mlb-splits-tab--recent' : ''}${isMonth ? ' mlb-splits-tab--month' : ''}" data-split="${t}">${splits[t].label}</button>`;
    }).join('');

    const panels = types.map(t => {
        const s = splits[t].stat;
        const cells = COLS.map(col => {
            const raw = s[col.key];
            const val = raw == null ? '—' : (col.fmt ? col.fmt(raw) : raw);
            return `<div class="mlb-splits-cell">
                        <div class="mlb-splits-val">${val}</div>
                        <div class="mlb-splits-lbl">${col.label}</div>
                    </div>`;
        }).join('');
        const delta = _eraDelta(t, s);
        return `<div class="mlb-splits-panel ${t === firstTab ? 'mlb-splits-panel--active' : ''}" data-split="${t}">
                    ${delta ? `<div class="splits-delta-row">${delta}</div>` : ''}
                    <div class="mlb-splits-stat-row">${cells}</div>
                </div>`;
    }).join('');

    return `
        <div class="mlb-splits-tabs">${tabs}</div>
        <div class="mlb-splits-panels">${panels}</div>
    `;
}

async function _fetchMLBPlayerBio(playerId) {
    const cacheKey = `mlb_bio_${playerId}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;
    const data = await mlbFetch(`/people/${playerId}`, {}, ApiCache.TTL.LONG);
    const person = data?.people?.[0] || null;
    if (person) ApiCache.set(cacheKey, person, ApiCache.TTL.LONG);
    return person;
}

function _renderPlayerBio(person, group) {
    if (!person) return '';
    const items = [];

    if (person.birthDate) {
        const age = Math.floor((Date.now() - new Date(person.birthDate)) / (365.25 * 86400000));
        items.push(['Age', age]);
    }

    const bat = person.batSide?.code;
    const thr = person.pitchHand?.code;
    if (bat && group === 'hitting') items.push(['Bats', bat === 'S' ? 'Switch' : bat === 'L' ? 'Left' : 'Right']);
    if (thr) items.push([group === 'pitching' ? 'Throws' : 'Throws', thr === 'L' ? 'Left' : 'Right']);
    if (person.height) items.push(['Ht', person.height]);
    if (person.weight) items.push(['Wt', `${person.weight} lbs`]);

    const city    = person.birthCity || '';
    const state   = person.birthStateProvince || '';
    const country = person.birthCountry || '';
    const hometown = [city, country === 'USA' ? state : country].filter(Boolean).join(', ');
    if (hometown) items.push(['Born', hometown]);

    if (person.mlbDebutDate) {
        const yr = person.mlbDebutDate.slice(0, 4);
        const yrs = new Date().getFullYear() - parseInt(yr);
        items.push(['Debut', yrs > 0 ? `${yr} (Yr ${yrs + 1})` : yr]);
    }

    if (person.draftYear) items.push(['Draft', String(person.draftYear)]);

    if (!items.length) return '';
    return `<div class="player-bio-grid">${
        items.map(([lbl, val]) => `
            <div class="player-bio-item">
                <span class="bio-label">${lbl}</span>
                <span class="bio-value">${_escHtml(String(val))}</span>
            </div>`).join('')
    }</div>`;
}

async function _fetchMLBCareerStats(playerId, group) {
    const data = await mlbFetch(`/people/${playerId}/stats`, {
        stats: 'yearByYear',
        group,
    }, ApiCache.TTL.LONG);
    const splits = data?.stats?.[0]?.splits || [];
    // Filter to MLB (sportId 1) and exclude career totals / minor leagues
    return splits
        .filter(s => s.sport?.id === 1)
        .map(s => ({
            season:   s.season,
            teamAbbr: s.team?.abbreviation || s.team?.name || '—',
            teamId:   s.team?.id,
            stat:     s.stat || {},
        }));
}

function _renderMLBCareerTable(rows, group) {
    const hitCols  = [
        { key: 'gamesPlayed',  label: 'G' },
        { key: 'atBats',       label: 'AB' },
        { key: 'avg',          label: 'AVG' },
        { key: 'obp',          label: 'OBP' },
        { key: 'slg',          label: 'SLG' },
        { key: 'homeRuns',     label: 'HR' },
        { key: 'rbi',          label: 'RBI' },
        { key: 'runs',         label: 'R' },
        { key: 'stolenBases',  label: 'SB' },
        { key: 'strikeOuts',   label: 'SO' },
    ];
    const pitCols  = [
        { key: 'gamesPlayed',   label: 'G' },
        { key: 'gamesStarted',  label: 'GS' },
        { key: 'wins',          label: 'W' },
        { key: 'losses',        label: 'L' },
        { key: 'era',           label: 'ERA' },
        { key: 'inningsPitched',label: 'IP' },
        { key: 'strikeOuts',    label: 'SO' },
        { key: 'whip',          label: 'WHIP' },
        { key: 'saves',         label: 'SV' },
    ];
    const cols = group === 'hitting' ? hitCols : pitCols;

    const thead = `<tr>
        <th>Year</th>
        <th>Team</th>
        ${cols.map(c => `<th title="${c.key}">${c.label}</th>`).join('')}
    </tr>`;

    const tbody = rows.map(row => {
        const logo = row.teamId ? `<img src="${getMLBTeamLogoUrl(row.teamId)}" alt="" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:4px" loading="lazy" data-hide-on-error>` : '';
        const cells = cols.map(c => {
            const val = row.stat[c.key];
            return `<td>${val ?? '—'}</td>`;
        }).join('');
        return `<tr>
            <td class="career-season">${row.season}</td>
            <td>${logo}${row.teamAbbr}</td>
            ${cells}
        </tr>`;
    }).join('');

    const trendStats = group === 'hitting' ? _MLB_CAREER_TREND_HITTING : _MLB_CAREER_TREND_PITCHING;
    const trendBtns = trendStats.map((s, i) =>
        `<button class="career-stat-btn${i === 0 ? ' active' : ''}" data-stat="${s.key}" data-color="${s.color}">${s.label}</button>`
    ).join('');

    return `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">
            <span style="font-size:0.75rem;color:var(--text-muted)">${rows.length} season${rows.length !== 1 ? 's' : ''}</span>
            <button class="lb-export-btn" id="mlb-career-csv-btn" title="Download CSV">↓ CSV</button>
        </div>
        <div class="career-table-wrap"><table class="career-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>
        <div class="career-trend-section">
            <div class="career-trend-controls" id="mlb-career-trend-controls">${trendBtns}</div>
            <div class="chart-wrap chart-wrap--tall" style="margin-top:0.75rem">
                <canvas id="mlb-pd-career-trend"></canvas>
            </div>
        </div>
    `;
}

const _MLB_CAREER_TREND_HITTING = [
    { key: 'avg',         label: 'AVG',  color: '#fbbf24' },
    { key: 'obp',         label: 'OBP',  color: '#34d399' },
    { key: 'slg',         label: 'SLG',  color: '#60a5fa' },
    { key: 'ops',         label: 'OPS',  color: '#a78bfa' },
    { key: 'homeRuns',    label: 'HR',   color: '#f87171' },
    { key: 'rbi',         label: 'RBI',  color: '#fb923c' },
    { key: 'stolenBases', label: 'SB',   color: '#4ade80' },
];

const _MLB_CAREER_TREND_PITCHING = [
    { key: 'era',            label: 'ERA',  color: '#f87171' },
    { key: 'whip',           label: 'WHIP', color: '#fb923c' },
    { key: 'strikeOuts',     label: 'K',    color: '#a78bfa' },
    { key: 'wins',           label: 'W',    color: '#34d399' },
    { key: 'inningsPitched', label: 'IP',   color: '#60a5fa' },
];

function _wireMLBCareerTrend(rows, group, primaryColor) {
    if (!window.StatsCharts || rows.length < 2) return;

    // rows are oldest→newest from the API filter
    const chronRows = rows.map(r => ({ season: parseInt(r.season, 10), stats: r.stat }));

    const renderTrend = (statKey, color) => {
        StatsCharts.careerTrend('mlb-pd-career-trend', chronRows, statKey, color || primaryColor);
    };

    const trendStats = group === 'hitting' ? _MLB_CAREER_TREND_HITTING : _MLB_CAREER_TREND_PITCHING;
    renderTrend(trendStats[0].key, trendStats[0].color);

    const controls = document.getElementById('mlb-career-trend-controls');
    if (!controls) return;
    controls.addEventListener('click', e => {
        const btn = e.target.closest('.career-stat-btn');
        if (!btn) return;
        controls.querySelectorAll('.career-stat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTrend(btn.dataset.stat, btn.dataset.color);
    });
}

function _wireMLBCareerCSV(rows, group, player) {
    const btn = document.getElementById('mlb-career-csv-btn');
    if (!btn || typeof exportCSV !== 'function') return;

    btn.addEventListener('click', () => {
        const hitHeaders = ['Year','Team','G','AB','AVG','OBP','SLG','HR','RBI','R','SB','SO'];
        const pitHeaders = ['Year','Team','G','GS','W','L','ERA','IP','SO','WHIP','SV'];
        const headers    = group === 'hitting' ? hitHeaders : pitHeaders;

        const csvRows = rows.map(r => {
            const s = r.stat;
            if (group === 'hitting') {
                return [r.season, r.teamAbbr, s.gamesPlayed, s.atBats, s.avg, s.obp, s.slg,
                    s.homeRuns, s.rbi, s.runs, s.stolenBases, s.strikeOuts];
            }
            return [r.season, r.teamAbbr, s.gamesPlayed, s.gamesStarted, s.wins, s.losses,
                s.era, s.inningsPitched, s.strikeOuts, s.whip, s.saves];
        });

        const safeName = (player.fullName || 'player').replace(/[^a-z0-9]/gi, '-').toLowerCase();
        exportCSV(`${safeName}-career-${group}.csv`, headers, csvRows);
    });
}

// ── Statcast card renderer ────────────────────────────────────

function _renderStatcastCard(data, group) {
    // Percentile → colour token
    const _pctColor = p => {
        if (p == null) return 'var(--text-muted)';
        if (p >= 90)  return '#22c55e';   // elite green
        if (p >= 70)  return '#86efac';   // good green
        if (p >= 50)  return '#fbbf24';   // average yellow
        if (p >= 30)  return '#fb923c';   // below avg orange
        return '#f87171';                  // poor red
    };

    const _row = (label, val, pct, unit = '') => {
        if (val == null && pct == null) return '';
        const display   = val != null ? `${parseFloat(val).toFixed(1)}${unit}` : '—';
        const pctNum    = pct != null ? Math.round(pct) : null;
        const pctColor  = _pctColor(pctNum);
        const pctLabel  = pctNum != null ? `<span class="sc-pct" style="color:${pctColor}">${pctNum}th</span>` : '';
        const barW      = pctNum != null ? pctNum : 0;
        return `
            <div class="sc-row">
                <span class="sc-label">${label}</span>
                <span class="sc-val">${display}</span>
                <div class="sc-bar-wrap">
                    <div class="sc-bar-fill" style="width:${barW}%;background:${pctColor}"></div>
                </div>
                ${pctLabel}
            </div>
        `;
    };

    // Delta row: directional ± display for expected-vs-actual luck gaps.
    // invert=true flips color logic (used for ERA where lower = better for pitcher).
    // threshold: |delta| < thresh → neutral display.
    const _deltaRow = (label, expected, actual, invert = false, decimals = 3, title = '', thresh = 0) => {
        if (expected == null || actual == null) return '';
        const delta = parseFloat(expected) - parseFloat(actual);
        const abs   = Math.abs(delta);
        let color   = 'var(--text-muted)';
        let display;
        if (abs <= thresh) {
            display = '≈ 0';
        } else {
            // positive delta = performing below expected = unlucky (good signal for hitters)
            // invert flips semantics for ERA (higher xERA vs ERA = pitcher getting lucky = bad)
            const good = invert ? delta < 0 : delta > 0;
            color   = good ? 'var(--color-win)' : 'var(--color-loss)';
            const sign = delta > 0 ? '+' : '−'; // U+2212 proper minus
            display = `${sign}${abs.toFixed(decimals)}`;
        }
        return `
            <div class="sc-row">
                <span class="sc-label" title="${title}">${label}</span>
                <span class="sc-val" style="font-weight:500;opacity:0.80;color:${color}">${display}</span>
                <div class="sc-bar-wrap"><div class="sc-bar-fill" style="width:0"></div></div>
                <span class="sc-pct"></span>
            </div>
        `;
    };

    let rows = '';
    if (group === 'hitting') {
        rows += _row('Exit Velocity',  data.avg_hit_speed,       data.p_avg_hit_speed,       ' mph');
        rows += _row('Hard-Hit %',     data.hard_hit_percent,    data.p_hard_hit_percent,    '%');
        rows += _row('Barrel %',       data.barrels_per_bbe,     data.p_barrels_per_bbe,     '%');
        rows += _row('Sweet Spot %',   data.sweet_spot_percent,  data.p_sweet_spot_percent,  '%');
        rows += _row('Launch Angle',   data.launch_angle,        data.p_launch_angle,        '°');
        rows += _row('xBA',            data.xba,                 data.p_xba);
        rows += _deltaRow('Luck (xBA)',   data.xba,  data._actual_avg,  false, 3, 'xBA vs AVG: positive = hitting below expectations (unlucky); negative = hitting above expectations (lucky)', 0.020);
        rows += _row('xSLG',           data.xslg,                data.p_xslg);
        rows += _row('xwOBA',          data.xwoba,               data.p_xwoba);
        rows += _deltaRow('Luck (xwOBA)', data.xwoba, data._actual_woba, false, 3, 'xwOBA vs wOBA: positive = underperforming expected run value (unlucky); negative = overperforming (lucky)', 0.020);
        rows += _row('Sprint Speed',   data.sprint_speed,        data.p_sprint_speed,        ' ft/s');
        rows += _row('Chase %',        data.oz_swing_percent,    data.p_oz_swing_percent,    '%');
        rows += _row('Zone Contact %', data.z_contact_percent,   data.p_z_contact_percent,   '%');
    } else {
        rows += _row('Exit Velocity',  data.exit_velocity,       data.p_exit_velocity,       ' mph');
        rows += _row('Spin Rate',      data.spin_rate,           data.p_spin_rate,           ' rpm');
        rows += _row('K %',            data.k_percent,           data.p_k_percent,           '%');
        rows += _row('BB %',           data.bb_percent,          data.p_bb_percent,          '%');
        rows += _row('Chase %',        data.oz_swing_percent,    data.p_oz_swing_percent,    '%');
        rows += _row('Zone Contact %', data.z_contact_percent,   data.p_z_contact_percent,   '%');
        rows += _row('Whiff %',        data.whiff_percent,       data.p_whiff_percent,       '%');
        rows += _row('CSW %',          data.csw_rate,            data.p_csw_rate,             '%');
        rows += _row('xERA',           data.xera,                data.p_xera);
        rows += _deltaRow('Luck (xERA)',  data.xera, data._actual_era,  true,  2, 'xERA vs ERA: positive = ERA better than deserved (lucky, regression risk); negative = ERA worse than deserved (unlucky, expected improvement)', 0.50);
        rows += _row('xwOBA vs',       data.xwoba,               data.p_xwoba);
    }

    if (!rows.trim()) return '<p style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0">No Statcast data available for this season.</p>';

    return `<div class="sc-grid">${rows}</div>
            <p class="sc-note">Percentile rankings among all qualified ${group === 'hitting' ? 'hitters' : 'pitchers'} · ${MLB_SEASON} MLB season</p>`;
}

function _renderMLBSplits(splits) {
    const COLS = [
        { key: 'gamesPlayed', label: 'G' },
        { key: 'atBats',      label: 'AB' },
        { key: 'avg',         label: 'AVG', fmt: v => v || '.000' },
        { key: 'obp',         label: 'OBP', fmt: v => v || '.000' },
        { key: 'slg',         label: 'SLG', fmt: v => v || '.000' },
        { key: 'ops',         label: 'OPS', fmt: v => v || '.000' },
        { key: 'homeRuns',    label: 'HR' },
        { key: 'rbi',         label: 'RBI' },
        { key: 'strikeOuts',  label: 'K' },
        { key: 'baseOnBalls', label: 'BB' },
    ];

    const RECENT_TYPES = new Set(['last7Days', 'last14Days', 'last30Days']);
    const types    = Object.keys(splits);
    const firstTab = types[0];

    const _opsDelta = (t, stat) => {
        if (!RECENT_TYPES.has(t)) return '';
        const homeOps   = parseFloat(splits.home?.stat?.ops  || 0);
        const awayOps   = parseFloat(splits.away?.stat?.ops  || 0);
        const recentOps = parseFloat(stat.ops || 0);
        if (!homeOps || !awayOps || !recentOps) return '';
        const seasonRef = (homeOps + awayOps) / 2;
        const diff = recentOps - seasonRef;
        if (Math.abs(diff) < 0.005) return '';
        const sign = diff > 0 ? '+' : '';
        const cls  = diff > 0 ? 'splits-delta--pos' : 'splits-delta--neg';
        return `<span class="${cls}" title="vs estimated season avg">${sign}${diff.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.')} OPS</span>`;
    };

    const tabs = types.map(t => {
        const isRecent = RECENT_TYPES.has(t);
        const isMonth  = t.startsWith('month_');
        return `<button class="mlb-splits-tab ${t === firstTab ? 'mlb-splits-tab--active' : ''}${isRecent ? ' mlb-splits-tab--recent' : ''}${isMonth ? ' mlb-splits-tab--month' : ''}"
                        data-split="${t}">${splits[t].label}</button>`;
    }).join('');

    const panels = types.map(t => {
        const s = splits[t].stat;
        const cells = COLS.map(col => {
            const raw = s[col.key];
            const val = raw == null ? '—' : (col.fmt ? col.fmt(raw) : raw);
            return `<div class="mlb-splits-cell">
                        <div class="mlb-splits-val">${val}</div>
                        <div class="mlb-splits-lbl">${col.label}</div>
                    </div>`;
        }).join('');
        const delta = _opsDelta(t, s);
        return `<div class="mlb-splits-panel ${t === firstTab ? 'mlb-splits-panel--active' : ''}"
                     data-split="${t}">
                    ${delta ? `<div class="splits-delta-row">${delta}</div>` : ''}
                    <div class="mlb-splits-stat-row">${cells}</div>
                </div>`;
    }).join('');

    return `
        <div class="mlb-splits-tabs">${tabs}</div>
        <div class="mlb-splits-panels">${panels}</div>
    `;
}

function _initSplitsTabs(card) {
    card.querySelectorAll('.mlb-splits-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const split = btn.dataset.split;
            card.querySelectorAll('.mlb-splits-tab').forEach(b => b.classList.remove('mlb-splits-tab--active'));
            card.querySelectorAll('.mlb-splits-panel').forEach(p => p.classList.remove('mlb-splits-panel--active'));
            btn.classList.add('mlb-splits-tab--active');
            card.querySelector(`.mlb-splits-panel[data-split="${split}"]`)?.classList.add('mlb-splits-panel--active');
        });
    });
}

async function _fetchMLBGameLog(playerId, group) {
    const apiGroup = group === 'hitting' ? 'hitting' : 'pitching';
    const hydrate  = `stats(group=[${apiGroup}],type=gameLog,season=${MLB_SEASON})`;
    const data     = await mlbFetch(`/people/${playerId}`, { hydrate }, ApiCache.TTL.MEDIUM);
    const statSplits = data?.people?.[0]?.stats?.[0]?.splits || [];

    return statSplits.map(s => {
        const st = s.stat || {};
        const entry = { date: s.date || '' };
        if (group === 'hitting') {
            entry.avg       = st.avg       ?? null;
            entry.homeRuns  = st.homeRuns  ?? 0;
            entry.rbi       = st.rbi       ?? 0;
            entry.hits      = st.hits      ?? 0;
            entry.atBats    = st.atBats    ?? 0;
        } else {
            entry.inningsPitched = st.inningsPitched ?? '0';
            entry.strikeOuts     = st.strikeOuts     ?? 0;
            entry.earnedRuns     = st.earnedRuns     ?? 0;
            entry.baseOnBalls    = st.baseOnBalls    ?? 0;
            entry.homeRuns       = st.homeRuns       ?? 0;
            entry.wins           = st.wins           ?? 0;
            entry.losses         = st.losses         ?? 0;
            entry.isStart        = (st.gamesStarted  ?? 0) > 0;
            entry.opponent       = s.opponent?.abbreviation || s.team?.abbreviation || '';
            entry.isHome         = s.isHome ?? null;
        }
        return entry;
    }).filter(e => {
        // Filter out games with no meaningful data
        if (group === 'hitting') return (e.atBats ?? 0) > 0;
        return parseFloat(e.inningsPitched || 0) > 0;
    });
}

function _buildSparklineSVG(values) {
    const W = 60, H = 24, PAD = 2;
    if (!values || values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
        const x = (i / (values.length - 1)) * W;
        const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const first = values[0], last = values[values.length - 1];
    const trend = (last - first) / (Math.abs(max - min) + 0.001);
    const col = trend > 0.1 ? 'var(--color-win)' : trend < -0.1 ? 'var(--color-loss)' : 'var(--text-muted)';
    const [lx, ly] = pts[pts.length - 1].split(',');
    const [fx]     = pts[0].split(',');
    const area = `M ${pts.join(' L ')} L ${lx},${H} L ${fx},${H} Z`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" style="overflow:visible;display:block">
        <path d="${area}" fill="${col}" opacity="0.14"/>
        <polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function _renderLastNStarts(logs, primaryColor) {
    const N = 5;
    const starts = logs.filter(e => e.isStart).slice(-N);
    if (starts.length === 0) return '';

    // Aggregate totals
    let wins = 0, losses = 0, er = 0, k = 0, bb = 0, hr = 0, ipRaw = 0;
    for (const s of starts) {
        wins   += s.wins        || 0;
        losses += s.losses      || 0;
        er     += s.earnedRuns  || 0;
        k      += s.strikeOuts  || 0;
        bb     += s.baseOnBalls || 0;
        hr     += s.homeRuns    || 0;
        // IP like "6.2" → convert to outs then back
        const parts = String(s.inningsPitched || '0').split('.');
        ipRaw += parseInt(parts[0] || 0) * 3 + parseInt(parts[1] || 0);
    }
    const ipFull  = Math.floor(ipRaw / 3);
    const ipFrac  = ipRaw % 3;
    const ipStr   = ipFrac ? `${ipFull}.${ipFrac}` : String(ipFull);
    const era     = ipRaw > 0 ? ((er * 27) / ipRaw).toFixed(2) : '—';

    // Per-start row items
    const rows = starts.map(s => {
        const ip    = s.inningsPitched || '0';
        const dec   = s.wins ? 'W' : s.losses ? 'L' : '—';
        const decCls = s.wins ? 'ls-dec--w' : s.losses ? 'ls-dec--l' : 'ls-dec--nd';
        const erNum = s.earnedRuns || 0;
        const erCls = erNum === 0 ? 'ls-er--zero' : erNum >= 4 ? 'ls-er--bad' : '';
        const opp   = s.opponent ? (s.isHome === false ? `@ ${s.opponent}` : `vs ${s.opponent}`) : '';
        const dateStr = s.date ? s.date.slice(5) : '';
        return `
            <div class="ls-row">
                <span class="ls-date">${dateStr}</span>
                <span class="ls-opp">${_escHtml(opp)}</span>
                <span class="ls-ip">${ip} IP</span>
                <span class="ls-k">${s.strikeOuts ?? 0} K</span>
                <span class="ls-bb">${s.baseOnBalls ?? 0} BB</span>
                <span class="ls-er ${erCls}">${erNum} ER</span>
                <span class="ls-dec ${decCls}">${dec}</span>
            </div>`;
    }).join('');

    return `
        <div class="last-starts-wrap">
            <div class="ls-summary">
                <span class="ls-label">Last ${starts.length} Starts</span>
                <span class="ls-stat-pill">${wins}–${losses}</span>
                <span class="ls-stat-pill">${era} ERA</span>
                <span class="ls-stat-pill">${ipStr} IP</span>
                <span class="ls-stat-pill">${k} K</span>
                <span class="ls-stat-pill">${bb} BB</span>
                ${hr > 0 ? `<span class="ls-stat-pill ls-stat-pill--hr">${hr} HR</span>` : ''}
            </div>
            <div class="ls-rows">${rows}</div>
        </div>`;
}

function backToMLBPlayers() {
    if (window.StatsCharts) StatsCharts.destroyAll();
    _clearMLBSearch();
    document.getElementById('searchBar')?.style.setProperty('display', 'block');
    document.getElementById('viewHeader')?.style.setProperty('display', 'none');

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="mlb-players"]').forEach(t => t.classList.add('active'));

    history.pushState({ view: 'mlb-players' }, '', '#mlb-players');

    _renderMLBGroupToggle();
    displayMLBPlayers(AppState.mlbStatsGroup);
}

// ── View: Games ───────────────────────────────────────────────

async function loadMLBGames() {
    await _loadMLBGamesForOffset(0);
}

async function _loadMLBGamesForOffset(offset) {
    const grid = document.getElementById('playersGrid');
    if (window.setBreadcrumb) setBreadcrumb('mlb-games', null);

    grid.className = 'games-grid';
    grid.innerHTML = Array.from({ length: 6 }, () => `
        <div class="skeleton-card" style="min-height:160px">
            <div class="skeleton-line" style="width:60%;height:14px;margin-bottom:1.25rem"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                <div class="skeleton-line" style="width:30%;height:40px;border-radius:8px"></div>
                <div class="skeleton-line" style="width:12%;height:20px"></div>
                <div class="skeleton-line" style="width:30%;height:40px;border-radius:8px"></div>
            </div>
        </div>
    `).join('');

    try {
        const dateStr = _mlbDateString(offset);
        const games   = await _fetchMLBGamesForDate(dateStr);
        if (offset === 0) AppState.mlbGames = games;
        displayMLBGames(games, dateStr, offset);
    } catch (error) {
        ErrorHandler.handle(grid, error, () => _loadMLBGamesForOffset(offset), { tag: 'MLB', title: 'Failed to Load MLB Games' });
    }
}

// Build an ET-anchored date string for a given offset from today
function _mlbDateString(offsetDays = 0) {
    const nowET = new Date(Date.now() - 5 * 60 * 60 * 1000);
    nowET.setUTCDate(nowET.getUTCDate() + offsetDays);
    const y = nowET.getUTCFullYear();
    const m = String(nowET.getUTCMonth() + 1).padStart(2, '0');
    const d = String(nowET.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Fetch all games for a single calendar date
async function _fetchMLBGamesForDate(dateStr) {
    const data = await mlbFetch('/schedule', {
        sportId:   1,
        date:      dateStr,
        hydrate:   'team,linescore,probablePitcher',
        gameType:  'R,F,D,L,W',
    }, ApiCache.TTL.SHORT);
    const games = [];
    (data.dates || []).forEach(d => games.push(...(d.games || [])));
    return games;
}

function displayMLBGames(games, dateStr, offset) {
    const grid     = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;';

    // Date label for the nav row
    const label = offset === 0 ? 'Today'
                : offset === -1 ? 'Yesterday'
                : new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    const navRow = document.createElement('div');
    navRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0 1rem;max-width:900px;margin:0 auto;';
    const todayBtn = offset < 0
        ? `<button class="mlb-date-nav-btn mlb-date-nav-btn--today" onclick="_mlbGamesGoTo(0)">Today</button>`
        : '';
    navRow.innerHTML = `
        <button class="mlb-date-nav-btn" onclick="_mlbGamesGoTo(${offset - 1})">← Prev</button>
        <span style="font-weight:700;font-size:0.95rem;color:var(--text-primary)">${label}
            <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);margin-left:0.4rem">${dateStr}</span>
        </span>
        <div style="display:flex;gap:0.4rem;align-items:center">
            ${todayBtn}
            <button class="mlb-date-nav-btn" onclick="_mlbGamesGoTo(${offset + 1})" ${offset >= 0 ? 'disabled style="opacity:0.35;cursor:not-allowed"' : ''}>Next →</button>
        </div>
    `;

    const gamesWrap = document.createElement('div');
    gamesWrap.className = 'games-grid';
    gamesWrap.style.cssText = 'max-width:900px;margin:0 auto;';

    if (!games || games.length === 0) {
        gamesWrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${ErrorHandler.EMPTY_GLYPH}</div><p class="empty-state-title">No MLB games scheduled for ${label}</p></div>`;
    } else {
        games.forEach(game => gamesWrap.appendChild(_createMLBGameCard(game)));
    }

    grid.innerHTML = '';
    grid.appendChild(navRow);
    grid.appendChild(gamesWrap);

    _injectGameWeather(gamesWrap);
}

function _mlbGamesGoTo(offset) {
    if (offset > 0) return; // Don't go into the future beyond today
    _loadMLBGamesForOffset(offset);
}
if (typeof window !== 'undefined') window._mlbGamesGoTo = _mlbGamesGoTo;

function _createMLBGameCard(game) {
    const card      = document.createElement('div');
    card.className  = 'game-card';

    // Only final/live games have meaningful box scores to show
    const clickable = game.status?.abstractGameState === 'Final' || game.status?.abstractGameState === 'Live';
    const isLiveCard = game.status?.abstractGameState === 'Live';
    if (clickable && game.gamePk) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            if (isLiveCard) {
                AppState.mlbLiveGame = game;
                navigateTo('mlb-live-' + game.gamePk);
            } else {
                showMLBGameDetail(game.gamePk, game);
            }
        });
    }

    const homeTeam  = game.teams?.home?.team  || {};
    const awayTeam  = game.teams?.away?.team  || {};
    const homeScore = game.teams?.home?.score ?? null;
    const awayScore = game.teams?.away?.score ?? null;
    const hasScore  = homeScore != null && awayScore != null;
    const homeWon   = hasScore && homeScore > awayScore;
    const awayWon   = hasScore && awayScore > homeScore;

    const homeColors = getMLBTeamColors(homeTeam.abbreviation);
    const awayColors = getMLBTeamColors(awayTeam.abbreviation);

    const status    = game.status?.detailedState || 'Scheduled';
    const isFinal   = status === 'Final';
    const isLive    = game.status?.abstractGameState === 'Live';
    const statusCls = isFinal ? 'game-status--final' : isLive ? 'game-status--live' : 'game-status--sched';

    // Enrich status label: inning for live, ET time for scheduled
    let statusLabel = status;
    if (isLive && game.linescore?.currentInning) {
        const half = game.linescore.isTopInning ? '▲' : '▼';
        statusLabel = `${half}${game.linescore.currentInning}`;
    } else if (!isFinal && !isLive && game.gameDate) {
        const d = new Date(game.gameDate);
        const etH = (d.getUTCHours() - 4 + 24) % 24;
        const etM = d.getUTCMinutes();
        statusLabel = `${etH % 12 || 12}:${String(etM).padStart(2, '0')} ${etH >= 12 ? 'PM' : 'AM'} ET`;
    }

    let dateStr = '';
    if (game.gameDate) {
        try {
            dateStr = new Date(game.gameDate).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });
        } catch (_) { dateStr = game.gameDate.split('T')[0]; }
    }

    const homeLogo = getMLBTeamLogoUrl(homeTeam.id);
    const awayLogo = getMLBTeamLogoUrl(awayTeam.id);
    const homeAbbr = _mlbTeamAbbr(homeTeam);
    const awayAbbr = _mlbTeamAbbr(awayTeam);

    const awayPP = game.teams?.away?.probablePitcher?.fullName;
    const homePP = game.teams?.home?.probablePitcher?.fullName;
    const ppLastName = n => n ? n.split(' ').slice(-1)[0] : 'TBD';
    const ppLine = !isFinal && (awayPP || homePP)
        ? `<div class="game-card-pitchers">${ppLastName(awayPP)} vs ${ppLastName(homePP)}</div>`
        : '';

    const scorecardBtn = (isFinal || isLive) && game.gamePk
        ? `<button class="game-card-scorecard-btn${isLive ? ' game-card-scorecard-btn--live' : ''}"
               onclick="event.stopPropagation();${isLive
                   ? `if(typeof startLiveScorecard==='function')startLiveScorecard(${game.gamePk},null)`
                   : `if(typeof loadMLBScorecard==='function')loadMLBScorecard(${game.gamePk},null)`}"
               aria-label="${isLive ? 'Live s' : 'S'}corecard for this game">
               ${isLive ? 'Live Scorecard' : 'Scorecard →'}
           </button>`
        : '';

    card.innerHTML = `
        <div class="game-card-header">
            <span class="game-date">${dateStr}</span>
            <span class="game-status ${statusCls}">${isLive ? '<span class="live-dot"></span>' : ''}${statusLabel}</span>
        </div>
        <div class="game-matchup">
            <div class="game-team ${homeWon ? 'game-team--winner' : ''}" data-team-id="${homeTeam.id}" style="cursor:pointer" role="button" tabindex="0" aria-label="${homeTeam.name || homeAbbr}">
                <div class="game-team-logo" style="background:linear-gradient(135deg,${homeColors.primary}cc,${homeColors.primary}55)">
                    ${homeLogo ? `<img class="game-logo-img" src="${homeLogo}" loading="lazy" data-hide-on-error>` : ''}
                    <span class="game-logo-text">${homeAbbr}</span>
                </div>
                <div class="game-team-abbr">${homeAbbr}</div>
                <div class="game-team-name">${homeTeam.name || ''}</div>
            </div>
            <div class="game-scores">
                <span class="game-score ${homeWon ? 'game-score--win' : hasScore && !homeWon ? 'game-score--loss' : ''}">${hasScore ? homeScore : '—'}</span>
                <span class="game-scores-sep">:</span>
                <span class="game-score ${awayWon ? 'game-score--win' : hasScore && !awayWon ? 'game-score--loss' : ''}">${hasScore ? awayScore : '—'}</span>
            </div>
            <div class="game-team game-team--away ${awayWon ? 'game-team--winner' : ''}" data-team-id="${awayTeam.id}" style="cursor:pointer" role="button" tabindex="0" aria-label="${awayTeam.name || awayAbbr}">
                <div class="game-team-logo" style="background:linear-gradient(135deg,${awayColors.primary}cc,${awayColors.primary}55)">
                    ${awayLogo ? `<img class="game-logo-img" src="${awayLogo}" loading="lazy" data-hide-on-error>` : ''}
                    <span class="game-logo-text">${awayAbbr}</span>
                </div>
                <div class="game-team-abbr">${awayAbbr}</div>
                <div class="game-team-name">${awayTeam.name || ''}</div>
            </div>
        </div>
        ${ppLine}
        ${scorecardBtn}
        <div class="game-weather" data-weather-team="${homeTeam.id}"></div>
    `;

    card.querySelectorAll('.game-logo-img').forEach(img => {
        img.addEventListener('load', () => {
            img.parentElement.querySelector('.game-logo-text')?.style.setProperty('display', 'none');
        }, { once: true });
    });

    card.querySelectorAll('.game-team[data-team-id]').forEach(el => {
        const handler = e => {
            e.stopPropagation();
            const tid = parseInt(el.dataset.teamId, 10);
            if (tid) showMLBTeamDetail(tid);
        };
        el.addEventListener('click', handler);
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(e); } });
    });

    return card;
}

// ── View: Game Detail ─────────────────────────────────────────

async function showMLBGameDetail(gamePk, gameStub = null) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;';

    const homeTeam = gameStub?.teams?.home?.team || {};
    const awayTeam = gameStub?.teams?.away?.team || {};
    const homeAbbr = _mlbTeamAbbr(homeTeam);
    const awayAbbr = _mlbTeamAbbr(awayTeam);

    if (window.setBreadcrumb) {
        setBreadcrumb('mlb-games', `${awayAbbr} @ ${homeAbbr}`);
    }
    if (window.history?.pushState) {
        history.pushState({ view: 'mlb-game', gamePk }, '', `#mlb-game-${gamePk}`);
    }

    grid.innerHTML = `
        <div class="mlb-game-detail-wrap">
            <div class="arcade-back-row" style="margin-bottom:1.5rem">
                <button class="arcade-back-btn" onclick="loadMLBGames()">← Back to Scores</button>
            </div>
            <div class="skeleton-card" style="height:280px;margin-bottom:1rem"></div>
            <div class="skeleton-card" style="height:200px;margin-bottom:1rem"></div>
            <div class="skeleton-card" style="height:200px"></div>
        </div>
    `;

    try {
        const [linescore, boxscore] = await Promise.all([
            mlbFetch(`/game/${gamePk}/linescore`, {}, ApiCache.TTL.SHORT),
            mlbFetch(`/game/${gamePk}/boxscore`,  {}, ApiCache.TTL.SHORT),
        ]);
        _renderMLBGameDetail(grid, gameStub, linescore, boxscore);
    } catch (err) {
        Logger.error('MLB game detail failed', err, 'MLB');
        grid.innerHTML = `
            <div class="mlb-game-detail-wrap">
                <div class="arcade-back-row">
                    <button class="arcade-back-btn" onclick="loadMLBGames()">← Back to Scores</button>
                </div>
                <div class="arcade-error"><p>Could not load game detail. Try again later.</p></div>
            </div>
        `;
    }
}

function _renderMLBGameDetail(grid, stub, ls, bs) {
    const homeTeam  = stub?.teams?.home?.team || bs?.teams?.home?.team || {};
    const awayTeam  = stub?.teams?.away?.team || bs?.teams?.away?.team || {};
    const homeAbbr  = _mlbTeamAbbr(homeTeam);
    const awayAbbr  = _mlbTeamAbbr(awayTeam);
    const homeColors = getMLBTeamColors(homeAbbr);
    const awayColors  = getMLBTeamColors(awayAbbr);
    const homeLogo  = getMLBTeamLogoUrl(homeTeam.id);
    const awayLogo  = getMLBTeamLogoUrl(awayTeam.id);

    const homeScore = ls?.teams?.home?.runs ?? stub?.teams?.home?.score ?? '—';
    const awayScore = ls?.teams?.away?.runs ?? stub?.teams?.away?.score ?? '—';
    const homeWon   = typeof homeScore === 'number' && typeof awayScore === 'number' && homeScore > awayScore;
    const awayWon   = typeof awayScore === 'number' && typeof homeScore === 'number' && awayScore > homeScore;

    // ── Linescore (inning by inning) ──────────────────────────
    const innings = ls?.innings || [];
    const maxInn  = Math.max(9, innings.length);
    const innNums = Array.from({ length: maxInn }, (_, i) => i + 1);

    const innHeaders = innNums.map(n => `<th class="mlb-ls-inn">${n}</th>`).join('');
    const homeCells  = innNums.map(n => {
        const inn = innings.find(i => i.num === n);
        const r   = inn?.home?.runs;
        return `<td class="mlb-ls-cell">${r ?? '—'}</td>`;
    }).join('');
    const awayCells  = innNums.map(n => {
        const inn = innings.find(i => i.num === n);
        const r   = inn?.away?.runs;
        return `<td class="mlb-ls-cell">${r ?? '—'}</td>`;
    }).join('');

    const homeR = ls?.teams?.home?.runs ?? '—';
    const homeH = ls?.teams?.home?.hits ?? '—';
    const homeE = ls?.teams?.home?.errors ?? '—';
    const awayR = ls?.teams?.away?.runs ?? '—';
    const awayH = ls?.teams?.away?.hits ?? '—';
    const awayE = ls?.teams?.away?.errors ?? '—';

    const linescoreHtml = `
        <div class="mlb-linescore-wrap">
            <div class="mlb-game-header">
                <div class="mlb-gh-team ${awayWon ? 'mlb-gh-team--winner' : ''}" role="button" tabindex="0" style="cursor:pointer" onclick="showMLBTeamDetail(${awayTeam.id})" onkeydown="if(event.key==='Enter')this.click()">
                    <div class="mlb-gh-logo" style="background:linear-gradient(135deg,${awayColors.primary}cc,${awayColors.primary}44)">
                        ${awayLogo ? `<img src="${awayLogo}" loading="lazy" data-hide-on-error>` : ''}
                        <span>${awayAbbr}</span>
                    </div>
                    <span class="mlb-gh-abbr">${awayAbbr}</span>
                    <span class="mlb-gh-name">${awayTeam.name || ''}</span>
                </div>
                <div class="mlb-gh-score">
                    <span class="${awayWon ? 'mlb-gh-score-val--win' : ''}">${awayScore}</span>
                    <span class="mlb-gh-sep">–</span>
                    <span class="${homeWon ? 'mlb-gh-score-val--win' : ''}">${homeScore}</span>
                </div>
                <div class="mlb-gh-team ${homeWon ? 'mlb-gh-team--winner' : ''}" role="button" tabindex="0" style="cursor:pointer;text-align:right" onclick="showMLBTeamDetail(${homeTeam.id})" onkeydown="if(event.key==='Enter')this.click()">
                    <div class="mlb-gh-logo" style="background:linear-gradient(135deg,${homeColors.primary}cc,${homeColors.primary}44)">
                        ${homeLogo ? `<img src="${homeLogo}" loading="lazy" data-hide-on-error>` : ''}
                        <span>${homeAbbr}</span>
                    </div>
                    <span class="mlb-gh-abbr">${homeAbbr}</span>
                    <span class="mlb-gh-name">${homeTeam.name || ''}</span>
                </div>
            </div>
            <div class="mlb-ls-scroll">
                <table class="mlb-ls-table">
                    <thead>
                        <tr>
                            <th class="mlb-ls-team-hdr">Team</th>
                            ${innHeaders}
                            <th class="mlb-ls-rhe">R</th><th class="mlb-ls-rhe">H</th><th class="mlb-ls-rhe">E</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="mlb-ls-team-cell">${awayAbbr}</td>
                            ${awayCells}
                            <td class="mlb-ls-rhe mlb-ls-rhe--r ${awayWon ? 'mlb-ls-win' : ''}">${awayR}</td>
                            <td class="mlb-ls-rhe">${awayH}</td>
                            <td class="mlb-ls-rhe">${awayE}</td>
                        </tr>
                        <tr>
                            <td class="mlb-ls-team-cell">${homeAbbr}</td>
                            ${homeCells}
                            <td class="mlb-ls-rhe mlb-ls-rhe--r ${homeWon ? 'mlb-ls-win' : ''}">${homeR}</td>
                            <td class="mlb-ls-rhe">${homeH}</td>
                            <td class="mlb-ls-rhe">${homeE}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // ── Batting box scores ────────────────────────────────────
    function _battingTable(sideKey) {
        const side = bs?.teams?.[sideKey];
        if (!side) return '';
        const batters = (side.batters || []).map(id => {
            const p = side.players?.[`ID${id}`];
            if (!p) return null;
            const s = p.stats?.batting;
            if (!s) return null;
            const pos = p.position?.abbreviation || '';
            return { name: _escHtml(p.person?.fullName || '—'), id, pos, s };
        }).filter(Boolean);

        if (!batters.length) return '';
        const teamLabel = sideKey === 'home' ? homeAbbr : awayAbbr;
        const rows = batters.map(({ name, id, pos, s }) => `
            <tr class="mlb-box-row" tabindex="0" style="cursor:pointer" onclick="showMLBPlayerDetail(${id}, 'hitting')" onkeydown="if(event.key==='Enter')this.click()">
                <td class="mlb-box-name"><span class="mlb-box-pos">${pos}</span>${name}</td>
                <td>${s.atBats ?? '—'}</td>
                <td>${s.runs ?? '—'}</td>
                <td>${s.hits ?? '—'}</td>
                <td>${s.rbi ?? '—'}</td>
                <td>${s.homeRuns > 0 ? s.homeRuns : '—'}</td>
                <td>${s.baseOnBalls ?? '—'}</td>
                <td>${s.strikeOuts ?? '—'}</td>
                <td class="mlb-box-avg">${s.avg || '—'}</td>
            </tr>
        `).join('');

        return `
            <div class="mlb-box-section">
                <h3 class="mlb-box-title">${teamLabel} Batting</h3>
                <div class="mlb-box-scroll">
                    <table class="mlb-box-table">
                        <thead><tr>
                            <th class="mlb-box-name-hdr">Player</th>
                            <th title="At bats">AB</th><th title="Runs">R</th><th title="Hits">H</th>
                            <th title="RBI">RBI</th><th title="Home runs">HR</th>
                            <th title="Walks">BB</th><th title="Strikeouts">K</th>
                            <th title="Batting average">AVG</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ── Pitching box scores ───────────────────────────────────
    function _pitchingTable(sideKey) {
        const side = bs?.teams?.[sideKey];
        if (!side) return '';
        const pitchers = (side.pitchers || []).map(id => {
            const p = side.players?.[`ID${id}`];
            if (!p) return null;
            const s = p.stats?.pitching;
            if (!s || parseFloat(s.inningsPitched ?? 0) === 0) return null;
            return { name: _escHtml(p.person?.fullName || '—'), id, s };
        }).filter(Boolean);

        if (!pitchers.length) return '';
        const teamLabel = sideKey === 'home' ? homeAbbr : awayAbbr;
        const oppTeamId = sideKey === 'home' ? awayTeam.id : homeTeam.id;
        const oppAbbr   = sideKey === 'home' ? awayAbbr : homeAbbr;

        const rows = pitchers.map(({ name, id, s }, idx) => {
            const isStarter = idx === 0 && oppTeamId;
            const vsPlaceholder = isStarter
                ? `<div class="vs-opp-row" data-vs-placeholder="1" style="margin-top:2px"><span class="skeleton-line" style="height:8px;width:110px;display:inline-block"></span></div>`
                : '';
            const dataAttrs = isStarter
                ? `data-pitcher-id="${id}" data-opp-team-id="${oppTeamId}"`
                : '';
            return `
            <tr class="mlb-box-row" tabindex="0" style="cursor:pointer" ${dataAttrs} onclick="showMLBPlayerDetail(${id}, 'pitching')" onkeydown="if(event.key==='Enter')this.click()">
                <td class="mlb-box-name">${name}${vsPlaceholder}</td>
                <td>${s.inningsPitched ?? '—'}</td>
                <td>${s.hits ?? '—'}</td>
                <td>${s.runs ?? '—'}</td>
                <td>${s.earnedRuns ?? '—'}</td>
                <td>${s.baseOnBalls ?? '—'}</td>
                <td>${s.strikeOuts ?? '—'}</td>
                <td class="mlb-box-avg">${s.era || '—'}</td>
            </tr>`;
        }).join('');

        return `
            <div class="mlb-box-section">
                <h3 class="mlb-box-title">${teamLabel} Pitching</h3>
                <div class="mlb-box-scroll">
                    <table class="mlb-box-table">
                        <thead><tr>
                            <th class="mlb-box-name-hdr">Pitcher</th>
                            <th title="Innings pitched">IP</th><th title="Hits">H</th><th title="Runs">R</th>
                            <th title="Earned runs">ER</th><th title="Walks">BB</th>
                            <th title="Strikeouts">K</th><th title="ERA">ERA</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    grid.innerHTML = `
        <div class="mlb-game-detail-wrap">
            <div class="arcade-back-row" style="margin-bottom:1.5rem">
                <button class="arcade-back-btn" onclick="loadMLBGames()">← Back to Scores</button>
            </div>
            ${linescoreHtml}
            <div class="mlb-box-grid">
                ${_battingTable('away')}
                ${_battingTable('home')}
                ${_pitchingTable('away')}
                ${_pitchingTable('home')}
            </div>
        </div>
    `;

    // Async enrichment: populate career vs-opponent context for each SP
    grid.querySelectorAll('tr[data-pitcher-id][data-opp-team-id]').forEach(async row => {
        const pid   = parseInt(row.dataset.pitcherId);
        const oppId = parseInt(row.dataset.oppTeamId);
        const rowEl = row.querySelector('[data-vs-placeholder]');
        if (!pid || !oppId || !rowEl) return;

        try {
            const data  = await mlbFetch(`/people/${pid}`, {
                hydrate: `stats(group=[pitching],type=vsTeamTotal,opposingTeamId=${oppId})`
            }, ApiCache.TTL.LONG);

            const split = data.people?.[0]?.stats?.[0]?.splits?.[0]?.stat;
            if (!split || !split.gamesPlayed) { rowEl.remove(); return; }

            const opp    = data.people?.[0]?.stats?.[0]?.splits?.[0]?.opponent?.abbreviation || '';
            const era    = split.era   ? parseFloat(split.era).toFixed(2)          : null;
            const ip     = split.inningsPitched ?? null;
            const whip   = split.whip  ? parseFloat(split.whip).toFixed(2)         : null;
            const baa    = split.avg   ? split.avg.replace(/^0/, '')               : null;
            const starts = split.gamesPlayed;
            const qual   = starts < 3 ? '(small sample)' : `(${starts}G)`;

            if (!era && !baa) { rowEl.remove(); return; }

            const parts = [];
            if (era)  parts.push(`<span class="vs-opp-row__val">${_escHtml(era)} ERA</span>`);
            if (ip)   parts.push(`<span class="vs-opp-row__val">${_escHtml(String(ip))} IP</span>`);
            if (whip) parts.push(`<span class="vs-opp-row__val">${_escHtml(whip)} WHIP</span>`);
            if (baa)  parts.push(`<span class="vs-opp-row__val">${_escHtml(baa)} BAA</span>`);

            rowEl.removeAttribute('data-vs-placeholder');
            rowEl.innerHTML =
                `<span class="vs-opp-row__label">vs ${_escHtml(opp)}</span> ` +
                parts.join('<span class="vs-opp-row__sep"> · </span>') +
                `<span class="vs-opp-row__caveat"> ${_escHtml(qual)}</span>`;
        } catch (_) {
            rowEl.remove();
        }
    });
}

// ── View: Teams ───────────────────────────────────────────────

async function loadMLBTeams() {
    const grid = document.getElementById('playersGrid');
    if (window.setBreadcrumb) setBreadcrumb('mlb-teams', null);

    grid.className = 'players-grid';
    grid.innerHTML = Array.from({ length: 6 }, () =>
        '<div class="skeleton-card" style="height:200px"></div>'
    ).join('');

    try {
        const [teams, standings] = await Promise.all([
            AppState.mlbTeams.length === 0 ? fetchMLBTeams() : Promise.resolve(AppState.mlbTeams),
            fetchMLBStandings().catch(() => ({})),
        ]);
        if (AppState.mlbTeams.length === 0) AppState.mlbTeams = teams;
        displayMLBTeams(AppState.mlbTeams, standings);
    } catch (error) {
        ErrorHandler.handle(grid, error, loadMLBTeams, { tag: 'MLB', title: 'Failed to Load MLB Teams' });
    }
}

function displayMLBTeams(teams, standings = {}) {
    const grid     = document.getElementById('playersGrid');
    grid.className = 'players-grid';

    if (!teams || teams.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No MLB teams found');
        return;
    }

    const sorted = [...teams].sort((a, b) => {
        const keyOf = t =>
            (t.league?.name || '') + (t.division?.name || '') + (t.name || '');
        return keyOf(a).localeCompare(keyOf(b));
    });

    const fragment = document.createDocumentFragment();
    sorted.forEach(team => {
        const colors  = getMLBTeamColors(team.abbreviation);
        const logo    = getMLBTeamLogoUrl(team.id);
        const abbr    = (team.abbreviation || '?').slice(0, 3);
        const divName = (team.division?.name || '')
            .replace('American League ', 'AL ')
            .replace('National League ', 'NL ');
        const rec     = standings[team.id];
        const hasRec  = rec && (rec.wins != null || rec.losses != null);

        const card    = document.createElement('div');
        card.className = 'team-card';
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => showMLBTeamDetail(team.id));
        card.innerHTML = `
            <div class="team-card-header" style="background:linear-gradient(135deg,${colors.primary}dd,${colors.primary}33)">
                <div style="width:64px;height:64px;display:flex;align-items:center;justify-content:center;margin:0 auto 0.5rem">
                    ${logo
                        ? `<img src="${logo}" style="width:100%;height:100%;object-fit:contain" loading="lazy" data-logo-fallback="${_escHtml(abbr)}">`
                        : `<span style="font-size:1.4rem;font-weight:800;color:#fff">${abbr}</span>`}
                </div>
                <h3 class="team-name">${team.name}</h3>
                ${hasRec ? `
                    <div style="margin-top:0.375rem;display:flex;align-items:center;justify-content:center;gap:0.5rem">
                        <span style="font-weight:800;font-size:1rem;color:#fff">${rec.wins}–${rec.losses}</span>
                        <span style="font-size:0.75rem;color:rgba(255,255,255,0.6)">${rec.pct}</span>
                        ${rec.streak ? `<span style="font-size:0.7rem;color:${rec.streak.startsWith('W') ? '#34d399' : '#f87171'};font-weight:700">${rec.streak}</span>` : ''}
                    </div>
                ` : `<p style="color:rgba(255,255,255,0.55);font-size:0.78rem;margin-top:0.25rem">${team.locationName || ''}</p>`}
            </div>
            <div class="team-card-body">
                <div class="team-stat-row">
                    <span style="color:var(--color-text-muted)">League</span>
                    <span>${(team.league?.name || '—').replace('American League', 'AL').replace('National League', 'NL')}</span>
                </div>
                <div class="team-stat-row">
                    <span style="color:var(--color-text-muted)">Division</span>
                    <span style="font-size:0.82rem">${divName || '—'}</span>
                </div>
                ${hasRec ? `
                    <div class="team-stat-row">
                        <span style="color:var(--color-text-muted)">GB</span>
                        <span>${rec.gamesBack}</span>
                    </div>
                ` : ''}
                <div class="team-stat-row">
                    <span style="color:var(--color-text-muted)">Stadium</span>
                    <span style="font-size:0.82rem">${team.venue?.name || '—'}</span>
                </div>
                <div class="team-stat-row">
                    <span style="color:var(--color-text-muted)">Since</span>
                    <span>${team.firstYearOfPlay || '—'}</span>
                </div>
            </div>
            <div class="card-cta">VIEW DETAILS →</div>
        `;
        fragment.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);
}

// ── View: Team Detail ─────────────────────────────────────────

async function showMLBTeamDetail(teamId, push = true) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const grid = document.getElementById('playersGrid');

    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="mlb-teams"]').forEach(t => t.classList.add('active'));

    // Optimistically find the team for the loading screen
    let team = AppState.mlbTeams.find(t => t.id === teamId);
    const loadColors = team ? getMLBTeamColors(team.abbreviation) : { primary: '#334155' };
    const loadLogo   = getMLBTeamLogoUrl(teamId);

    if (window.setBreadcrumb) setBreadcrumb('mlb-teams', team?.name || `Team ${teamId}`);
    if (push) history.pushState({ view: 'mlb-team', id: teamId }, '', `#mlb-team-${teamId}`);

    grid.className = 'player-detail-container';
    grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:4rem">
            <div class="player-detail-avatar" style="background:linear-gradient(135deg,${loadColors.primary}cc,${loadColors.primary}55);margin:0 auto 1.25rem">
                ${loadLogo ? `<img src="${loadLogo}" style="width:100%;height:100%;object-fit:contain;padding:10px" loading="lazy" data-hide-on-error>` : (team?.abbreviation || '?')}
            </div>
            <p style="color:var(--color-text-secondary);font-size:1.1rem">Loading roster…</p>
            <div style="max-width:420px;margin:1.25rem auto 0;display:flex;flex-direction:column;gap:0.6rem">
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line" style="width:70%;margin:0 auto"></div>
            </div>
        </div>
    `;

    try {
        if (!team) {
            if (AppState.mlbTeams.length === 0) AppState.mlbTeams = await fetchMLBTeams();
            team = AppState.mlbTeams.find(t => t.id === teamId);
        }

        const [roster, recentGames, teamBatRes, teamPitRes, upcomingGames] = await Promise.all([
            fetchMLBRoster(teamId),
            fetchMLBTeamSchedule(teamId, 15),
            mlbFetch(`/teams/${teamId}/stats`, { stats: 'season', group: 'hitting',  season: MLB_SEASON }, ApiCache.TTL.MEDIUM).catch(() => null),
            mlbFetch(`/teams/${teamId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM).catch(() => null),
            _fetchMLBTeamUpcoming(teamId, 7).catch(() => []),
        ]);

        AppState._mlbTeamRecentGames[teamId] = recentGames;
        AppState._mlbTeamRosters[teamId]     = roster;

        const teamBat = teamBatRes?.stats?.[0]?.splits?.[0]?.stat || null;
        const teamPit = teamPitRes?.stats?.[0]?.splits?.[0]?.stat || null;

        // Pull standings record if available
        let rec = null;
        if (AppState.mlbStandings) {
            for (const div of AppState.mlbStandings) {
                const found = div.teams.find(t => t.teamId === teamId);
                if (found) { rec = found; break; }
            }
        }

        const colors = getMLBTeamColors(team?.abbreviation || '');
        if (team && typeof addRecent === 'function') addRecent({
            id:    team.id,
            sport: 'mlb',
            type:  'team',
            name:  team.name || team.abbreviation || `Team ${teamId}`,
            sub:   rec ? `${rec.wins}–${rec.losses}` : 'MLB',
            badge: 'TEAM',
        });
        grid.innerHTML = `
            ${_mlbTeamHeader(team, teamId, colors, rec)}
            ${_mlbTeamStatsCard(teamBat, teamPit, colors)}
            ${_mlbTeamUpcomingCard(upcomingGames, teamId, colors)}
            ${_mlbRecentGamesCard(recentGames, teamId)}
            ${_mlbRosterCard(roster, colors)}
        `;

        // If player stats haven't been loaded yet (user came straight to team detail),
        // fetch them in the background and refresh just the roster card when ready.
        const statsLoaded =
            Object.keys(AppState.mlbPlayerStats.hitting  || {}).length > 0 ||
            Object.keys(AppState.mlbPlayerStats.pitching || {}).length > 0;

        if (!statsLoaded) {
            Promise.all([
                fetchMLBLeagueStats('hitting',  MLB_SEASON),
                fetchMLBLeagueStats('pitching', MLB_SEASON),
            ]).then(([hitSplits, pitSplits]) => {
                // Populate AppState so subsequent views are instant
                AppState.mlbPlayerStats.hitting  = {};
                AppState.mlbPlayerStats.pitching = {};
                AppState.mlbPlayers.hitting      = AppState.mlbPlayers.hitting.length  ? AppState.mlbPlayers.hitting  : [];
                AppState.mlbPlayers.pitching     = AppState.mlbPlayers.pitching.length ? AppState.mlbPlayers.pitching : [];

                for (const split of hitSplits) {
                    const id = split.player?.id;
                    if (!id) continue;
                    AppState.mlbPlayerStats.hitting[id] = { ...split.stat, player_id: id };
                    if (!AppState.mlbPlayers.hitting.find(p => p.id === id)) {
                        AppState.mlbPlayers.hitting.push({
                            id, fullName: split.player.fullName || '—',
                            teamId: split.team?.id, teamName: split.team?.name,
                            teamAbbr: split.team?.abbreviation, position: split.position?.abbreviation,
                        });
                    }
                }
                for (const split of pitSplits) {
                    const id = split.player?.id;
                    if (!id) continue;
                    AppState.mlbPlayerStats.pitching[id] = { ...split.stat, player_id: id };
                    if (!AppState.mlbPlayers.pitching.find(p => p.id === id)) {
                        AppState.mlbPlayers.pitching.push({
                            id, fullName: split.player.fullName || '—',
                            teamId: split.team?.id, teamName: split.team?.name,
                            teamAbbr: split.team?.abbreviation, position: split.position?.abbreviation,
                        });
                    }
                }

                // Re-render just the roster card in-place
                const rosterCard = grid.querySelector('.mlb-roster-card');
                if (rosterCard) {
                    rosterCard.outerHTML = _mlbRosterCard(AppState._mlbTeamRosters[teamId] || roster, colors);
                }
            }).catch(() => {}); // silent — roster is already visible, stats are a bonus
        }
    } catch (err) {
        Logger.error('Failed to load MLB team detail', err, 'MLB');
        grid.innerHTML = `
            <div class="error-state">
                <div class="error-state-icon">!</div>
                <h3 class="error-state-title">Failed to Load Team</h3>
                <p class="error-state-message">${err.message}</p>
                <button class="retry-btn" onclick="backToMLBTeams()">← Back to Teams</button>
            </div>
        `;
    }
}

function backToMLBTeams() {
    if (window.StatsCharts) StatsCharts.destroyAll();
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="mlb-teams"]').forEach(t => t.classList.add('active'));
    history.pushState({ view: 'mlb-teams' }, '', '#mlb-teams');
    if (window.setBreadcrumb) setBreadcrumb('mlb-teams', null);
    displayMLBTeams(AppState.mlbTeams);
}

async function _fetchMLBTeamUpcoming(teamId, daysForward = 7) {
    const nowET  = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const toET   = new Date(nowET.getTime() + daysForward * 24 * 60 * 60 * 1000);
    const fmt    = d => d.toISOString().split('T')[0];
    const data   = await mlbFetch('/schedule', {
        sportId:   1,
        teamId,
        startDate: fmt(nowET),
        endDate:   fmt(toET),
        hydrate:   'team,probablePitcher',
    }, ApiCache.TTL.SHORT);
    return (data.dates || [])
        .flatMap(d => d.games || [])
        .filter(g => g.status?.abstractGameState !== 'Final')
        .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
}

function _mlbTeamStatsCard(bat, pit, colors) {
    if (!bat && !pit) return '';
    const _l = (v, d = 3) => v != null ? parseFloat(v).toFixed(d).replace(/^0\./, '.') : '—';
    const _f = (v, d = 2) => v != null ? parseFloat(v).toFixed(d) : '—';
    const _n = v => v ?? '—';
    const ip  = parseFloat(pit?.inningsPitched || 0);
    const fip = ip > 0 && pit?.homeRuns != null
        ? ((13 * (pit.homeRuns || 0) + 3 * (pit.baseOnBalls || 0) - 2 * (pit.strikeOuts || 0)) / ip + 3.10).toFixed(2)
        : '—';

    const batItems = bat ? [
        ['AVG',  _l(bat.avg)],
        ['OBP',  _l(bat.obp)],
        ['SLG',  _l(bat.slg)],
        ['OPS',  _l(bat.ops)],
        ['HR',   _n(bat.homeRuns)],
        ['R',    _n(bat.runs)],
        ['SB',   _n(bat.stolenBases)],
        ['K',    _n(bat.strikeOuts)],
    ] : [];

    const pitItems = pit ? [
        ['ERA',  _f(pit.era)],
        ['FIP',  fip],
        ['WHIP', _f(pit.whip)],
        ['K/9',  pit.strikeoutsPer9Inn ? _f(pit.strikeoutsPer9Inn, 1) : '—'],
        ['BB/9', ip > 0 ? _f((pit.baseOnBalls / ip) * 9, 1) : '—'],
        ['K',    _n(pit.strikeOuts)],
        ['SV',   _n(pit.saves)],
        ['QS',   _n(pit.qualityStarts)],
    ] : [];

    const bioChip = items => items.map(([lbl, val]) => `
        <div class="player-bio-item">
            <span class="bio-label">${lbl}</span>
            <span class="bio-value">${val}</span>
        </div>`).join('');

    return `
        <div class="stats-card">
            ${bat ? `
            <h3 class="detail-section-title" style="margin-bottom:0.5rem">Team Batting</h3>
            <div class="player-bio-grid" style="margin-top:0">${bioChip(batItems)}</div>
            ` : ''}
            ${pit ? `
            <h3 class="detail-section-title" style="margin-top:${bat ? '1rem' : '0'};margin-bottom:0.5rem">Team Pitching</h3>
            <div class="player-bio-grid" style="margin-top:0">${bioChip(pitItems)}</div>
            ` : ''}
        </div>
    `;
}

function _mlbTeamUpcomingCard(games, teamId, colors) {
    if (!games || !games.length) return '';
    const rows = games.slice(0, 6).map(g => {
        const isHome    = g.teams?.home?.team?.id === teamId;
        const oppTeam   = isHome ? g.teams?.away?.team : g.teams?.home?.team;
        const oppAbbr   = _mlbTeamAbbr(oppTeam);
        const oppLogo   = getMLBTeamLogoUrl(oppTeam?.id);
        const ha        = isHome ? 'vs' : '@';
        const pp        = isHome ? g.teams?.home?.probablePitcher : g.teams?.away?.probablePitcher;
        const oppPP     = isHome ? g.teams?.away?.probablePitcher : g.teams?.home?.probablePitcher;
        const ppName    = pp?.fullName?.split(' ').slice(-1)[0] || '';
        const oppPPName = oppPP?.fullName?.split(' ').slice(-1)[0] || '';

        let dateStr = '—', timeStr = '';
        if (g.gameDate) {
            try {
                const d = new Date(g.gameDate);
                dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
                timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' });
            } catch (_) {}
        }

        const ppLine = (ppName || oppPPName)
            ? `<span class="team-upcoming-pp">${ppName || '?'} vs ${oppPPName || '?'}</span>`
            : '';

        return `
            <div class="roster-row">
                <div style="display:flex;align-items:center;gap:0.5rem;flex:1;min-width:0">
                    <span style="color:var(--text-muted);font-size:0.7rem;min-width:42px">${ha}</span>
                    ${oppLogo ? `<img src="${oppLogo}" alt="" style="width:20px;height:20px;object-fit:contain;flex-shrink:0" loading="lazy" data-hide-on-error>` : ''}
                    <span style="font-weight:600;font-size:0.875rem">${oppAbbr}</span>
                    ${ppLine}
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600">${dateStr}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted)">${timeStr}</div>
                </div>
            </div>`;
    }).join('');

    return `
        <div class="stats-card">
            <h2 class="detail-section-title">Upcoming</h2>
            <div class="roster-list">${rows}</div>
        </div>`;
}

function _mlbTeamHeader(team, teamId, colors, rec) {
    const name    = team?.name || `Team ${teamId}`;
    const abbr    = team?.abbreviation || '?';
    const logo    = getMLBTeamLogoUrl(teamId);
    const divName = (team?.division?.name || '')
        .replace('American League ', 'AL ')
        .replace('National League ', 'NL ');
    const lgName  = (team?.league?.name || '')
        .replace('American League', 'AL')
        .replace('National League', 'NL');

    const standingsBio = rec ? `
        <div class="player-bio-grid" style="margin-top:0.75rem">
            <div class="player-bio-item"><span class="bio-label">Record</span><span class="bio-value" style="font-weight:800">${rec.wins}–${rec.losses}</span></div>
            <div class="player-bio-item"><span class="bio-label">PCT</span><span class="bio-value">${rec.pct}</span></div>
            <div class="player-bio-item"><span class="bio-label">GB</span><span class="bio-value">${rec.gb}</span></div>
            ${rec.streak ? `<div class="player-bio-item"><span class="bio-label">Streak</span><span class="bio-value" style="color:${rec.streak.startsWith('W') ? '#10b981' : '#f87171'};font-weight:700">${rec.streak}</span></div>` : ''}
            <div class="player-bio-item"><span class="bio-label">Last 10</span><span class="bio-value">${rec.last10}</span></div>
            <div class="player-bio-item"><span class="bio-label">Home</span><span class="bio-value">${rec.home}</span></div>
            <div class="player-bio-item"><span class="bio-label">Away</span><span class="bio-value">${rec.away}</span></div>
        </div>
    ` : '';

    return `
        <div class="player-detail-header"
             style="background:radial-gradient(ellipse at top left,${colors.primary}1a 0%,rgba(15,23,42,0.85) 55%);
                    border-top:3px solid ${colors.primary}88">
            <button onclick="backToMLBTeams()" class="back-button">← Teams</button>
            <div class="player-hero">
                <div class="player-detail-avatar"
                     style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55);
                            color:#fff;font-size:1.75rem;font-weight:800">
                    ${logo ? `<img class="player-headshot player-headshot--detail" src="${logo}" alt="${name}" loading="lazy" style="object-fit:contain;object-position:center;padding:10px" data-hide-on-error>` : abbr}
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${name}</h1>
                        <span class="player-hero-pos">${abbr}</span>
                    </div>
                    <p class="player-detail-meta" style="color:var(--color-text-secondary)">${lgName}${divName ? ' · ' + divName : ''}</p>
                    ${team?.venue?.name ? `<p class="player-detail-meta" style="color:var(--color-text-muted)">${team.venue.name}${team.firstYearOfPlay ? ' · Est. ' + team.firstYearOfPlay : ''}</p>` : ''}
                    ${standingsBio}
                </div>
            </div>
        </div>
    `;
}

function _mlbRecentGamesCard(games, teamId) {
    if (!games || games.length === 0) {
        return `
            <div class="stats-card" style="grid-column:1/-1">
                <h2 class="detail-section-title">Recent Games</h2>
                <p style="color:var(--color-text-muted);text-align:center;padding:2rem">No recent games found.</p>
            </div>
        `;
    }

    const rows = games.slice(0, 12).map(g => {
        const homeTeam  = g.teams?.home?.team || {};
        const awayTeam  = g.teams?.away?.team || {};
        const homeScore = g.teams?.home?.score ?? null;
        const awayScore = g.teams?.away?.score ?? null;
        const hasScore  = homeScore != null && awayScore != null;

        const isHome  = homeTeam.id === teamId;
        const myScore = isHome ? homeScore : awayScore;
        const opScore = isHome ? awayScore : homeScore;
        const oppTeam = isHome ? awayTeam : homeTeam;
        const oppAbbr = _mlbTeamAbbr(oppTeam);
        const oppLogo = getMLBTeamLogoUrl(oppTeam.id);

        const status   = g.status?.detailedState || '';
        const isFinal  = status === 'Final';
        const isLive   = g.status?.abstractGameState === 'Live';
        const isWin    = isFinal && hasScore && myScore > opScore;
        const isLoss   = isFinal && hasScore && myScore < opScore;
        const outcome  = isFinal && hasScore ? (isWin ? 'W' : 'L') : (isLive ? 'LIVE' : '—');
        const outClr   = isWin ? '#10b981' : isLoss ? '#f87171' : 'var(--color-text-muted)';
        const scoreStr = hasScore ? `${myScore}–${opScore}` : '—';
        const scoreClr = isWin ? '#10b981' : isLoss ? '#f87171' : 'var(--color-text-secondary)';
        const ha       = isHome ? 'vs' : '@';

        let dateStr = '—';
        if (g.gameDate) {
            try { dateStr = new Date(g.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) {}
        }

        const clickable = isFinal && g.gamePk;
        return `
            <div class="roster-row ${clickable ? 'roster-row--clickable' : ''}"
                 ${clickable ? `onclick="showMLBGameDetail(${g.gamePk}, AppState._mlbTeamRecentGames[${teamId}].find(g=>g.gamePk===${g.gamePk}))"` : ''}>
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
                    <span style="font-weight:900;font-size:0.875rem;min-width:26px;color:${outClr}">${outcome}</span>
                    <span style="color:var(--color-text-muted);font-size:0.75rem;min-width:54px">${dateStr}</span>
                    <span style="color:var(--color-text-muted);font-size:0.75rem">${ha}</span>
                    ${oppLogo ? `<img src="${oppLogo}" alt="" style="width:18px;height:18px;object-fit:contain;flex-shrink:0" loading="lazy" data-hide-on-error>` : ''}
                    <span style="font-weight:600;font-size:0.875rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${oppAbbr}</span>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0">
                    <span style="font-weight:700;font-size:0.95rem;color:${scoreClr}">${scoreStr}</span>
                    ${clickable ? '<span style="font-size:0.65rem;color:#334155">›</span>' : ''}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="stats-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">Recent Games</h2>
            <div class="roster-list">${rows}</div>
        </div>
    `;
}

function _mlbRosterCard(roster, colors) {
    if (!roster || roster.length === 0) {
        return `
            <div class="stats-card" style="grid-column:1/-1">
                <h2 class="detail-section-title">Roster</h2>
                <p style="color:var(--color-text-muted);text-align:center;padding:2rem">No roster data available.</p>
            </div>
        `;
    }

    const rows = roster.map(p => {
        const isPitcher  = p.positionType === 'Pitcher';
        const hitStats   = AppState.mlbPlayerStats.hitting?.[p.id];
        const pitStats   = AppState.mlbPlayerStats.pitching?.[p.id];
        const stats      = isPitcher ? (pitStats || hitStats) : (hitStats || pitStats);

        let statsHtml = '';
        if (stats && isPitcher) {
            const era  = stats.era  != null ? parseFloat(stats.era).toFixed(2)  : '—';
            const whip = stats.whip != null ? parseFloat(stats.whip).toFixed(2) : '—';
            const so   = stats.strikeOuts ?? '—';
            statsHtml = `
                <div class="roster-stats">
                    <span>${era}</span>
                    <span>${whip}</span>
                    <span>${so}</span>
                </div>
                <div class="roster-labels"><span>ERA</span><span>WHIP</span><span>K</span></div>
            `;
        } else if (stats) {
            const avg = stats.avg || '—';
            const hr  = stats.homeRuns ?? '—';
            const rbi = stats.rbi     ?? '—';
            statsHtml = `
                <div class="roster-stats">
                    <span>${avg}</span>
                    <span>${hr}</span>
                    <span>${rbi}</span>
                </div>
                <div class="roster-labels"><span>AVG</span><span>HR</span><span>RBI</span></div>
            `;
        }

        const initials    = (p.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
        const headshotUrl = getMLBPlayerHeadshotUrl(p.id);
        const jersey      = p.jerseyNumber ? `#${p.jerseyNumber}` : '';

        const group     = isPitcher ? 'pitching' : 'hitting';
        const inPlayers = AppState.mlbPlayers[group]?.find(pl => pl.id === p.id);
        const clickAttr = inPlayers && !p.onIL ? `role="button" tabindex="0" onclick="showMLBPlayerDetail(${p.id},'${group}')" onkeydown="if(event.key==='Enter')this.click()" style="cursor:pointer"` : '';

        // IL badge — short display from status description or code
        let ilBadge = '';
        if (p.onIL) {
            const desc = p.statusDesc || p.statusCode || 'IL';
            const short = desc.replace('Injured List', 'IL').replace('Day ', 'D-').replace('Restricted List', 'RL').replace('Paternity List', 'PL').replace('Bereavement List', 'BL');
            ilBadge = `<span class="roster-il-badge">${_escHtml(short)}</span>`;
        }

        return `
            <div class="roster-row${p.onIL ? ' roster-row--il' : ''}" ${clickAttr}>
                <div class="roster-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44);position:relative;overflow:hidden;${p.onIL ? 'opacity:0.65' : ''}">
                    ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;z-index:1" data-hide-on-error>` : ''}
                    <span style="position:relative">${initials}</span>
                </div>
                <div class="roster-info">
                    <span class="roster-name">${_escHtml(p.fullName)}${ilBadge}</span>
                    <span class="roster-meta">${p.position || 'N/A'}${jersey ? ' · ' + jersey : ''}</span>
                </div>
                ${p.onIL ? '' : statsHtml}
            </div>
        `;
    }).join('');

    const active = roster.filter(p => !p.onIL);
    const il     = roster.filter(p => p.onIL);
    const title  = `Roster · ${active.length} Active${il.length ? ` · <span class="roster-il-count">${il.length} IL</span>` : ''}`;

    return `
        <div class="stats-card mlb-roster-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">${title}</h2>
            <div class="roster-list">${rows}</div>
        </div>
    `;
}

// ── Shared fetch: mlbLeaderSplits ─────────────────────────────

let _mlbLeaderSplitsPromise       = null;
let _mlbSavantLbPromise           = null;  // dedup guard for bulk batter leaderboard CSV
let _mlbSavantPitcherLbPromise    = null;  // dedup guard for bulk pitcher leaderboard CSV

function _clearMLBLeaderSplitsCache() { _mlbLeaderSplitsPromise = null; }

function _fetchMLBLeaderSplits(season) {
    if (AppState.mlbLeaderSplits) return Promise.resolve(AppState.mlbLeaderSplits);
    if (_mlbLeaderSplitsPromise)  return _mlbLeaderSplitsPromise;

    const teamsPromise = AppState.mlbTeams.length
        ? Promise.resolve(AppState.mlbTeams)
        : fetchMLBTeams(season).then(t => { if (!AppState.mlbTeams.length) AppState.mlbTeams = t; return t; });

    const fieldingPromise = mlbFetch('/stats', {
        stats: 'season', season, group: 'fielding', sportId: 1, limit: 800, playerPool: 'All',
    }, ApiCache.TTL.MEDIUM).then(d => d.stats?.[0]?.splits || []).catch(() => []);

    _mlbLeaderSplitsPromise = Promise.all([
        fetchMLBLeagueStats('hitting',  season, 600),
        fetchMLBLeagueStats('pitching', season, 600),
        teamsPromise,
        fieldingPromise,
    ]).then(([hitSplits, pitSplits, teams, fieldSplits]) => {
        const abbrById = new Map(teams.map(t => [t.id, t.abbreviation]));

        // Build fielding map: playerId → primary-position stats (most chances)
        const fieldMap = {};
        fieldSplits.forEach(s => {
            const id = s.player?.id;
            if (!id || !s.stat) return;
            const prev = fieldMap[id];
            if (!prev || (s.stat.chances || 0) > (prev.chances || 0)) fieldMap[id] = s.stat;
        });
        AppState.mlbFieldingStats = fieldMap;
        const enrich   = splits => splits.forEach(s => {
            if (s.team?.id && !s.team.abbreviation) s.team.abbreviation = abbrById.get(s.team.id) || '';
        });
        hitSplits.forEach(s => { if (s.stat) Object.assign(s.stat, _computeBattingRates(s.stat)); });
        pitSplits.forEach(s => { if (s.stat) Object.assign(s.stat, _computePitchingRates(s.stat)); });
        enrich(hitSplits);
        enrich(pitSplits);
        AppState.mlbLeaderSplits = { hitting: hitSplits, pitching: pitSplits };
        AppState._mlbLeaderSplitsTs = Date.now();
        _mlbLeaderSplitsPromise  = null;
        return AppState.mlbLeaderSplits;
    }).catch(err => {
        _mlbLeaderSplitsPromise = null;
        throw err;
    });

    return _mlbLeaderSplitsPromise;
}

// ── View: Leaderboards ────────────────────────────────────────

async function loadMLBLeaderboards() {
    const grid = document.getElementById('playersGrid');
    if (window.setBreadcrumb) setBreadcrumb('mlb-leaders', null);

    grid.className = 'leaderboards-grid';
    grid.innerHTML = Array.from({ length: 8 }, () => `
        <div class="skeleton-card">
            <div class="skeleton-line" style="width:55%;height:16px;margin-bottom:1rem"></div>
            ${Array.from({ length: 5 }, () => `
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
                    <div class="skeleton-line" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"></div>
                    <div style="flex:1"><div class="skeleton-line" style="width:70%;height:12px"></div></div>
                    <div class="skeleton-line" style="width:36px;height:20px"></div>
                </div>
            `).join('')}
        </div>
    `).join('');

    try {
        const season = AppState.mlbLeaderSeason || MLB_SEASON;
        const promises = [];
        promises.push(_fetchMLBLeaderSplits(season));
        if (!AppState.mlbHotStats || AppState._mlbHotStatsSeason !== season) {
            promises.push(Promise.all([
                fetchMLBLeagueStats('hitting',  season, 600, 'last7Days'),
                fetchMLBLeagueStats('pitching', season, 400, 'last7Days'),
            ]).then(([hotHit, hotPit]) => {
                hotHit.forEach(s => { if (s.stat) Object.assign(s.stat, _computeBattingRates(s.stat)); });
                hotPit.forEach(s => { if (s.stat) Object.assign(s.stat, _computePitchingRates(s.stat)); });
                AppState.mlbHotStats = { hitting: hotHit, pitching: hotPit };
                AppState._mlbHotStatsSeason = season;
            }).catch(() => {}));
        }
        if (!AppState.mlbSavantLeaderboard || AppState._mlbSavantLbSeason !== season) {
            if (!_mlbSavantLbPromise) {
                _mlbSavantLbPromise = fetchStatcastBulkLeaderboard(season).then(d => {
                    AppState.mlbSavantLeaderboard = d || [];
                    AppState._mlbSavantLbSeason = season;
                }).finally(() => { _mlbSavantLbPromise = null; });
            }
            promises.push(_mlbSavantLbPromise);
        }
        if (!AppState.mlbSavantPitcherLeaderboard || AppState._mlbSavantPitcherLbSeason !== season) {
            if (!_mlbSavantPitcherLbPromise) {
                _mlbSavantPitcherLbPromise = fetchStatcastPitcherLeaderboard(season).then(d => {
                    AppState.mlbSavantPitcherLeaderboard = d || [];
                    AppState._mlbSavantPitcherLbSeason = season;
                }).catch(() => {}).finally(() => { _mlbSavantPitcherLbPromise = null; });
            }
            promises.push(_mlbSavantPitcherLbPromise);
        }
        if (!AppState.mlbSprintSpeed) {
            promises.push(fetchSprintSpeedLeaderboard().then(rows => {
                if (!rows) return;
                const map = {};
                rows.forEach(r => { if (r.player_id) map[r.player_id] = r; });
                AppState.mlbSprintSpeed = map;
                AppState._mlbSprintRows = rows;
            }).catch(() => {}));
        }
        if (!AppState.mlbHittingStreaks || AppState._mlbStreakSeason !== season) {
            promises.push(
                mlbFetch('/stats', { stats: 'streak', group: 'hitting', season, sportId: 1, playerPool: 'All', limit: 50 }, ApiCache.TTL.SHORT)
                    .then(d => {
                        const splits = d?.stats?.[0]?.splits || [];
                        AppState.mlbHittingStreaks = splits;
                        AppState._mlbStreakSeason  = season;
                    })
                    .catch(() => { AppState.mlbHittingStreaks = []; })
            );
        }
        await Promise.all(promises);
        displayMLBLeaderboards();
    } catch (error) {
        ErrorHandler.handle(grid, error, loadMLBLeaderboards, { tag: 'MLB', title: 'Failed to Load MLB Leaders' });
    }
}

// desc:true = higher value is better (rank #1 = highest); desc:false = lower is better (ERA/WHIP)
// decimals: how many decimal places to display for this stat
const MLB_LEADER_CATS = [
    { key: 'avg',                label: 'Batting Average', unit: 'AVG',   color: '#fbbf24', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'ops',                label: 'OPS',             unit: 'OPS',   color: '#a78bfa', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'obp',                label: 'On-Base %',       unit: 'OBP',   color: '#34d399', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'slg',                label: 'Slugging %',      unit: 'SLG',   color: '#60a5fa', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'iso',                label: 'Iso Power',       unit: 'ISO',   color: '#c4b5fd', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'babip',              label: 'BABIP',           unit: 'BABIP', color: '#fcd34d', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'homeRuns',           label: 'Home Runs',       unit: 'HR',    color: '#ef4444', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'rbi',                label: 'RBI',             unit: 'RBI',   color: '#f59e0b', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'plateAppearances',   label: 'Plate Appearances',unit: 'PA',   color: '#a5b4fc', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'hits',               label: 'Hits',            unit: 'H',     color: '#fdba74', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'runs',               label: 'Runs',            unit: 'R',     color: '#86efac', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'doubles',            label: 'Doubles',         unit: '2B',    color: '#67e8f9', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'baseOnBalls',        label: 'Walks',           unit: 'BB',    color: '#22d3ee', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'stolenBases',        label: 'Stolen Bases',    unit: 'SB',    color: '#10b981', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'bbPct',              label: 'Walk Rate',       unit: 'BB%',   color: '#5eead4', group: 'hitting',  desc: true,  decimals: 1 },
    { key: 'kPct',               label: 'Strikeout Rate',  unit: 'K%',    color: '#f87171', group: 'hitting',  desc: false, decimals: 1 },
    { key: 'totalBases',         label: 'Total Bases',     unit: 'TB',    color: '#fb923c', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'triples',            label: 'Triples',         unit: '3B',    color: '#a3e635', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'groundIntoDoublePlay',label:'Grounded Into DP',unit: 'GIDP',  color: '#94a3b8', group: 'hitting',  desc: false, decimals: 0 },
    { key: 'rc',                 label: 'Runs Created',    unit: 'RC',    color: '#f59e0b', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'sbPct',              label: 'Stolen Base %',   unit: 'SB%',   color: '#10b981', group: 'hitting',  desc: true,  decimals: 1 },
    { key: 'woba',               label: 'wOBA',            unit: 'wOBA',  color: '#818cf8', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'bbK',                label: 'BB/K',            unit: 'BB/K',  color: '#22d3ee', group: 'hitting',  desc: true,  decimals: 2 },
    { key: 'atBatsPerHomeRun',   label: 'AB per HR',       unit: 'AB/HR', color: '#fca5a5', group: 'hitting',  desc: false, decimals: 1 },
    { key: 'groundOutsToAirouts',label: 'GB/FB Ratio',     unit: 'GB/FB', color: '#a3e635', group: 'hitting',  desc: true,  decimals: 2 },
    { key: 'strikeOuts',         label: 'Strikeouts (Bat)',unit: 'SO',    color: '#f87171', group: 'hitting',  desc: false, decimals: 0 },
    { key: 'era',                label: 'ERA',             unit: 'ERA',   color: '#f472b6', group: 'pitching', desc: false, decimals: 2 },
    { key: 'whip',               label: 'WHIP',            unit: 'WHIP',  color: '#818cf8', group: 'pitching', desc: false, decimals: 2 },
    { key: 'fip',                label: 'FIP',             unit: 'FIP',   color: '#e879f9', group: 'pitching', desc: false, decimals: 2 },
    { key: 'strikeoutsPer9Inn',  label: 'K/9',             unit: 'K/9',   color: '#fb923c', group: 'pitching', desc: true,  decimals: 1 },
    { key: 'kBbPct',             label: 'K-BB%',           unit: 'K-BB%', color: '#a3e635', group: 'pitching', desc: true,  decimals: 1 },
    { key: 'walksPer9Inn',       label: 'Walks per 9',     unit: 'BB/9',  color: '#fcd34d', group: 'pitching', desc: false, decimals: 2 },
    { key: 'hitsPer9Inn',        label: 'Hits per 9',      unit: 'H/9',   color: '#38bdf8', group: 'pitching', desc: false, decimals: 2 },
    { key: 'homeRunsPer9',       label: 'HR per 9',        unit: 'HR/9',  color: '#fca5a5', group: 'pitching', desc: false, decimals: 2 },
    { key: 'strikeoutWalkRatio', label: 'K/BB Ratio',      unit: 'K/BB',  color: '#c084fc', group: 'pitching', desc: true,  decimals: 2 },
    { key: 'lobPct',             label: 'Left on Base %',  unit: 'LOB%',  color: '#67e8f9', group: 'pitching', desc: true,  decimals: 1 },
    { key: 'strikeOuts',         label: 'Strikeouts',      unit: 'K',     color: '#c084fc', group: 'pitching', desc: true,  decimals: 0 },
    { key: 'wins',               label: 'Wins',            unit: 'W',     color: '#38bdf8', group: 'pitching', desc: true,  decimals: 0 },
    { key: 'gamesStarted',      label: 'Games Started',   unit: 'GS',    color: '#38bdf8', group: 'pitching', desc: true,  decimals: 0 },
    { key: 'completeGames',     label: 'Complete Games',  unit: 'CG',    color: '#a3e635', group: 'pitching', desc: true,  decimals: 0 },
    { key: 'qualityStarts',      label: 'Quality Starts',  unit: 'QS',    color: '#4ade80', group: 'pitching', desc: true,  decimals: 0 },
    { key: 'saves',              label: 'Saves',           unit: 'SV',    color: '#fbbf24', group: 'pitching', desc: true,  decimals: 0 },
    { key: 'holds',              label: 'Holds',           unit: 'HLD',   color: '#94a3b8', group: 'pitching', desc: true,  decimals: 0 },
    { key: 'blownSaves',         label: 'Blown Saves',     unit: 'BSV',   color: '#fca5a5', group: 'pitching', desc: false, decimals: 0 },
    { key: 'qsPct',              label: 'Quality Start %', unit: 'QS%',   color: '#86efac', group: 'pitching', desc: true,  decimals: 1 },
    { key: 'inningsPitched',     label: 'Innings Pitched', unit: 'IP',    color: '#a5b4fc', group: 'pitching', desc: true,  decimals: 1 },
    { key: 'svHld',              label: 'Saves + Holds',   unit: 'SVHD',  color: '#fde68a', group: 'pitching', desc: true,  decimals: 0 },
];

const STATCAST_LEADER_CATS = [
    { key: 'exit_velocity_avg',  label: 'Exit Velocity',  unit: 'EV',      color: '#f97316', desc: true, decimals: 1, suffix: ' mph' },
    { key: 'barrel_batted_rate', label: 'Barrel Rate',    unit: 'Barrel%', color: '#ef4444', desc: true, decimals: 1, suffix: '%'    },
    { key: 'hard_hit_percent',   label: 'Hard Hit Rate',  unit: 'HH%',     color: '#fb923c', desc: true, decimals: 1, suffix: '%'    },
    { key: 'sweet_spot_percent', label: 'Sweet Spot Rate',unit: 'SS%',     color: '#38bdf8', desc: true, decimals: 1, suffix: '%'    },
    { key: 'xba',                label: 'Expected BA',    unit: 'xBA',     color: '#fbbf24', desc: true, decimals: 3, suffix: ''     },
    { key: 'xslg',               label: 'Expected SLG',   unit: 'xSLG',    color: '#a78bfa', desc: true, decimals: 3, suffix: ''     },
    { key: 'xwoba',              label: 'Expected wOBA',  unit: 'xwOBA',   color: '#34d399', desc: true, decimals: 3, suffix: ''     },
];

const STATCAST_PITCHER_CATS = [
    { key: 'k_percent',       label: 'Pitcher K Rate',  unit: 'K%',     color: '#c084fc', desc: true,  decimals: 1, suffix: '%'    },
    { key: 'whiff_percent',   label: 'Whiff Rate',       unit: 'Whiff%', color: '#fb923c', desc: true,  decimals: 1, suffix: '%'    },
    { key: 'bb_percent',      label: 'Pitcher BB Rate',  unit: 'BB%',    color: '#fcd34d', desc: false, decimals: 1, suffix: '%'    },
    { key: 'exit_velocity_avg',label: 'EV Allowed',      unit: 'EV Alw', color: '#34d399', desc: false, decimals: 1, suffix: ' mph' },
];

const MLB_MINGP_OPTIONS = [0, 10, 20, 50, 100];
// Values are lowercase to match AppState.mlbLeaderPosition storage convention
const MLB_POS_OPTIONS   = [
    { value: 'all', label: 'All' },
    // hitting positions (derived from MLB_HITTING_POSITIONS)
    { value: 'c',   label: 'C'   },
    { value: '1b',  label: '1B'  },
    { value: '2b',  label: '2B'  },
    { value: '3b',  label: '3B'  },
    { value: 'ss',  label: 'SS'  },
    { value: 'of',  label: 'OF'  },
    { value: 'dh',  label: 'DH'  },
    // pitching positions (derived from MLB_PITCHING_POSITIONS)
    { value: 'sp',  label: 'SP'  },
    { value: 'rp',  label: 'RP'  },
    { value: 'cl',  label: 'CL'  },
];
// Positions that belong to pitching panels; all others are hitting
// Derived from the canonical position lists defined near getMLBTeamLogoUrl
const PITCHING_POS_SET = new Set(MLB_PITCHING_POSITIONS.filter(p => p !== 'All').map(p => p.toLowerCase()));
// OF set reuses _MLB_OF_SET (defined near _mlbPosMatch)

function _appendMLBByPositionGrid(fragment, splits, season) {
    const HIT_POS = [
        { pos: 'c',  label: 'C',  minPA: 50  },
        { pos: '1b', label: '1B', minPA: 50  },
        { pos: '2b', label: '2B', minPA: 50  },
        { pos: '3b', label: '3B', minPA: 50  },
        { pos: 'ss', label: 'SS', minPA: 50  },
        { pos: 'of', label: 'OF', minPA: 50  },
        { pos: 'dh', label: 'DH', minPA: 50  },
    ];
    const PIT_POS = [
        { pos: 'sp', label: 'SP', minIP: 15 },
        { pos: 'rp', label: 'RP', minIP: 10 },
        { pos: 'cl', label: 'CL', minIP: 5  },
    ];

    const hitters  = splits.hitting  || [];
    const pitchers = splits.pitching || [];

    const divider = document.createElement('div');
    divider.className = 'leaderboard-section-divider';
    divider.innerHTML = `<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>By Position · ${season} · OPS &amp; ERA</span>`;
    fragment.appendChild(divider);

    const grid = document.createElement('div');
    grid.className = 'lb-pos-grid';

    const _fmtOps = v => {
        const n = parseFloat(v);
        if (isNaN(n)) return '—';
        return n.toFixed(3).replace(/^0\./, '.');
    };
    const _fmtEra = v => {
        const n = parseFloat(v);
        return isNaN(n) ? '—' : n.toFixed(2);
    };

    [...HIT_POS, ...PIT_POS].forEach(({ pos, label, minPA, minIP }) => {
        const isPit = PITCHING_POS_SET.has(pos);
        const pool  = isPit ? pitchers : hitters;
        const stat  = isPit ? 'era' : 'ops';
        const desc  = !isPit;

        const top = pool
            .filter(s => {
                if (isPit) {
                    // Stats API reports every pitcher as position "P" — SP/RP/CL
                    // must be classified from role stats, not the position field
                    // (this left all three panels empty since ship — D-038 V4).
                    const st = s.stat || {};
                    const gs = parseFloat(st.gamesStarted) || 0;
                    const g  = parseFloat(st.gamesPlayed) || parseFloat(st.gamesPitched) || 0;
                    const sv = parseFloat(st.saves) || 0;
                    const role = gs >= Math.max(3, g * 0.5) ? 'sp' : (sv >= 3 ? 'cl' : 'rp');
                    if (role !== pos) return false;
                    if (isNaN(parseFloat(st[stat]))) return false;
                    return _mlbIpToNum(st.inningsPitched) >= (minIP || 0);
                }
                if (!_mlbPosMatch((s.position?.abbreviation || '').toLowerCase(), pos)) return false;
                if (isNaN(parseFloat(s.stat?.[stat]))) return false;
                return (s.stat?.plateAppearances ?? s.stat?.atBats ?? 0) >= (minPA || 0);
            })
            .sort((a, b) => {
                const av = parseFloat(a.stat[stat]);
                const bv = parseFloat(b.stat[stat]);
                return desc ? bv - av : av - bv;
            })
            .slice(0, 5);

        const accent = isPit ? '#f97316' : '#818cf8';
        const unitLabel = isPit ? 'ERA' : 'OPS';

        let rows = '';
        if (!top.length) {
            rows = `<div class="lb-pos-empty">No qualified ${label} yet (min ${isPit ? (minIP + ' IP') : (minPA + ' PA')})</div>`;
        } else {
            top.forEach((s, i) => {
                const pid      = s.player?.id;
                const abbr     = s.team?.abbreviation || '';
                const colors   = getMLBTeamColors(abbr);
                const headshot = getMLBPlayerHeadshotUrl(pid);
                const parts    = (s.player?.fullName || '').split(' ');
                const lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '—';
                const initials = parts.map(w => w[0] || '').slice(0, 2).join('');
                const val      = isPit ? _fmtEra(s.stat[stat]) : _fmtOps(s.stat[stat]);
                rows += `<div class="lb-pos-row${i === 0 ? ' lb-pos-row--gold' : ''}"
                              ${pid ? `data-pid="${pid}" data-group="${isPit ? 'pitching' : 'hitting'}"` : ''}>
                    <span class="lb-pos-rank">${i + 1}</span>
                    <div class="lb-pos-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                        ${headshot ? `<img src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}
                        <span class="lb-pos-initials">${_escHtml(initials)}</span>
                    </div>
                    <span class="lb-pos-name">${_escHtml(lastName)}</span>
                    <span class="lb-pos-val" style="color:${accent}">${_escHtml(val)}</span>
                </div>`;
            });
        }

        const cell = document.createElement('div');
        cell.className = 'lb-pos-cell';
        cell.innerHTML = `
            <div class="lb-pos-header">
                <span class="lb-pos-badge" style="background:${accent}22;color:${accent};border:1px solid ${accent}44">${label}</span>
                <span class="lb-pos-unit">${unitLabel}</span>
            </div>
            <div class="lb-pos-list">${rows}</div>
        `;
        cell.querySelectorAll('.lb-pos-row[data-pid]').forEach(row => {
            const pid   = parseInt(row.dataset.pid, 10);
            const group = row.dataset.group;
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => showMLBPlayerDetail(pid, group));
        });
        grid.appendChild(cell);
    });

    fragment.appendChild(grid);
}

function _appendMLBStreakPanel(fragment, splits, season) {
    // The streak stats type returns players sorted by active consecutive-game hitting streak.
    // `stat.gamesPlayed` = streak length for this stat type.
    // Guard: need at least one split with a plausible streak (≥ 5 games).
    const streakers = splits
        .filter(s => (s.stat?.gamesPlayed || 0) >= 5 && s.player?.id)
        .sort((a, b) => (b.stat?.gamesPlayed || 0) - (a.stat?.gamesPlayed || 0))
        .slice(0, 10);

    if (!streakers.length) return;

    const divider = document.createElement('div');
    divider.className = 'leaderboard-section-divider';
    divider.innerHTML = `<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>Active Hitting Streaks · ${season}</span>`;
    fragment.appendChild(divider);

    const panel = document.createElement('div');
    panel.className = 'leaderboard-panel leaderboard-panel--streak';

    const header = document.createElement('div');
    header.className = 'leaderboard-header';
    header.style.borderLeftColor = '#f97316';
    header.innerHTML = `
        <span class="leaderboard-title">Consecutive Games with a Hit</span>
        <span class="leaderboard-unit" style="color:#f97316">${streakers.length} active</span>
    `;

    const list = document.createElement('div');
    list.className = 'leaderboard-list';

    streakers.forEach((split, i) => {
        const games    = split.stat.gamesPlayed;
        const avg      = split.stat.avg ? _fmtAvg(parseFloat(split.stat.avg)) : '—';
        const abbr     = split.team?.abbreviation || '';
        const colors   = getMLBTeamColors(abbr);
        const pid      = split.player.id;
        const name     = split.player.fullName || '—';
        const initials = name.split(' ').map(w => w[0] || '').slice(0, 2).join('');
        const headshot = getMLBPlayerHeadshotUrl(pid);
        const fireCls  = games >= 15 ? 'streak-fire--hot' : games >= 10 ? 'streak-fire--warm' : '';

        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.addEventListener('click', () => showMLBPlayerDetail(pid, 'hitting'));
        row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showMLBPlayerDetail(pid, 'hitting'); });
        row.innerHTML = `
            <span class="lb-rank ${i < 3 ? `lb-rank-${i + 1}` : ''}">${i + 1}</span>
            <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                ${headshot ? `<img src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="lb-avatar-initials">${initials}</span>
            </div>
            <div class="lb-player">
                <span class="lb-name">${_escHtml(name)}</span>
                <span class="lb-team">${_escHtml(abbr)}</span>
            </div>
            <div class="streak-games-col">
                <span class="streak-games ${fireCls}">${games}<span class="streak-g-label">G</span></span>
                <span class="streak-avg">${avg} AVG</span>
            </div>
        `;
        list.appendChild(row);
    });

    panel.appendChild(header);
    panel.appendChild(list);
    fragment.appendChild(panel);
}

function _appendMLBHotStrip(fragment, hotStats, season) {
    const _parseIP = ip => { const p = String(ip || '0').split('.'); return parseInt(p[0]) + (parseInt(p[1] || 0) / 3); };

    const HOT_CATS = [
        { key: 'ops',               label: 'Last 7 — OPS',    unit: 'OPS',  color: '#f97316', group: 'hitting',  desc: true,  decimals: 3,
          qualify: s => (s.stat?.plateAppearances ?? 0) >= 10 },
        { key: 'avg',               label: 'Last 7 — AVG',    unit: 'AVG',  color: '#fbbf24', group: 'hitting',  desc: true,  decimals: 3,
          qualify: s => (s.stat?.plateAppearances ?? 0) >= 10 },
        { key: 'homeRuns',          label: 'Last 7 — HR',     unit: 'HR',   color: '#ef4444', group: 'hitting',  desc: true,  decimals: 0,
          qualify: s => (s.stat?.plateAppearances ?? 0) >= 10 },
        { key: 'era',               label: 'Last 7 — ERA',    unit: 'ERA',  color: '#818cf8', group: 'pitching', desc: false, decimals: 2,
          qualify: s => _parseIP(s.stat?.inningsPitched) >= 3 },
        { key: 'strikeoutsPer9Inn', label: 'Last 7 — K/9',    unit: 'K/9',  color: '#c084fc', group: 'pitching', desc: true,  decimals: 1,
          qualify: s => _parseIP(s.stat?.inningsPitched) >= 3 },
        { key: 'whip',              label: 'Last 7 — WHIP',   unit: 'WHIP', color: '#a78bfa', group: 'pitching', desc: false, decimals: 2,
          qualify: s => _parseIP(s.stat?.inningsPitched) >= 3 },
    ];

    const divider = document.createElement('div');
    divider.className = 'leaderboard-section-divider';
    divider.innerHTML = `<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><path d="M13 2c0 4-4 6-4 10a5 5 0 0 0 10 0c0-4.5-3-7.5-3-10"/><path d="M12 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor" stroke="none"/></svg>Hot Right Now · Last 7 Days · ${season}</span>`;
    fragment.appendChild(divider);

    HOT_CATS.forEach(cat => {
        const sorted = (hotStats[cat.group] || [])
            .filter(s => !isNaN(parseFloat(s.stat?.[cat.key])) && cat.qualify(s))
            .sort((a, b) => {
                const av = parseFloat(a.stat[cat.key]);
                const bv = parseFloat(b.stat[cat.key]);
                return cat.desc ? bv - av : av - bv;
            });

        const panel = document.createElement('div');
        panel.className = 'leaderboard-panel leaderboard-panel--hot';

        const header = document.createElement('div');
        header.className = 'leaderboard-header';
        header.style.borderLeftColor = cat.color;
        header.innerHTML = `
            <span class="leaderboard-title">${cat.label}</span>
            <span class="leaderboard-unit" style="color:${cat.color}">${sorted.length} qualifying</span>
        `;

        const list = document.createElement('div');
        list.className = 'leaderboard-list';

        if (sorted.length === 0) {
            list.innerHTML = `<p style="color:var(--text-muted);padding:1.5rem;text-align:center;font-size:0.875rem">No qualifying players</p>`;
        } else {
            sorted.slice(0, 5).forEach((split, i) => {
                const rawVal = split.stat[cat.key];
                const numVal = parseFloat(rawVal);
                const valStr = isNaN(numVal) ? rawVal :
                    cat.decimals === 3 ? _fmtAvg(numVal) :
                    cat.decimals > 0  ? numVal.toFixed(cat.decimals) : String(rawVal);
                const abbr = split.team?.abbreviation || '';
                const colors = getMLBTeamColors(abbr);
                const initials = (split.player?.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
                const headshotUrl = getMLBPlayerHeadshotUrl(split.player?.id);
                const pid = split.player?.id;

                const row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.setAttribute('role', 'button');
                row.setAttribute('tabindex', '0');
                if (pid) {
                    row.addEventListener('click', () => showMLBPlayerDetail(pid, cat.group));
                    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showMLBPlayerDetail(pid, cat.group); });
                }
                row.innerHTML = `
                    <span class="lb-rank ${i < 3 ? `lb-rank-${i + 1}` : ''}">${i + 1}</span>
                    <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                        ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" data-hide-on-error>` : ''}
                        <span class="lb-avatar-initials">${initials}</span>
                    </div>
                    <div class="lb-player">
                        <span class="lb-name">${_escHtml(split.player?.fullName || '—')}</span>
                        <span class="lb-team">${abbr}${_parkFactorBadge(abbr, 'dot')}</span>
                    </div>
                    <span class="lb-value" style="color:${cat.color}">${valStr}</span>
                `;
                list.appendChild(row);
            });
        }

        panel.appendChild(header);
        panel.appendChild(list);
        fragment.appendChild(panel);
    });
}

function _buildTeamSelect(splits, current, onSelect) {
    const wrap = document.createElement('div');
    wrap.className = 'leaderboard-team-filter';

    const lbl = document.createElement('span');
    lbl.textContent = 'Team:';
    lbl.className = 'leaderboard-team-filter__label';
    wrap.appendChild(lbl);

    const teamsMap = new Map();
    [...(splits.hitting || []), ...(splits.pitching || [])].forEach(s => {
        if (s.team?.abbreviation) teamsMap.set(s.team.abbreviation, s.team.name || s.team.abbreviation);
    });
    const teams = [...teamsMap.entries()].sort(([a], [b]) => a.localeCompare(b));

    const sel = document.createElement('select');
    sel.style.cssText = [
        'background:var(--bg-interactive)',
        'border:1px solid var(--border-default)',
        'border-radius:var(--radius-full)',
        'color:' + (current !== 'all' ? 'var(--accent)' : 'var(--text-subtle)'),
        'font-size:0.72rem',
        'font-weight:700',
        'font-family:inherit',
        'padding:0.2rem 0.6rem',
        'cursor:pointer',
        'outline:none',
        'transition:border-color 0.15s,color 0.15s',
    ].join(';');

    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'All Teams';
    sel.appendChild(allOpt);

    teams.forEach(([abbr, name]) => {
        const opt = document.createElement('option');
        opt.value = abbr;
        opt.textContent = `${abbr} — ${name}`;
        if (current === abbr) opt.selected = true;
        sel.appendChild(opt);
    });

    if (current === 'all') sel.value = 'all';

    sel.addEventListener('change', () => onSelect(sel.value));
    wrap.appendChild(sel);
    return wrap;
}

function displayMLBLeaderboards() {
    const grid     = document.getElementById('playersGrid');
    grid.className = 'leaderboards-grid';

    const splits   = AppState.mlbLeaderSplits || { hitting: [], pitching: [] };
    const minGP    = AppState.mlbLeaderMinGP    || 0;
    const posFilt  = AppState.mlbLeaderPosition || 'all';
    const teamFilt = AppState.mlbLeaderTeam     || 'all';
    const season   = AppState.mlbLeaderSeason   || MLB_SEASON;
    const fragment = document.createDocumentFragment();

    const MLB_SEASON_OPTIONS = [MLB_SEASON - 2, MLB_SEASON - 1, MLB_SEASON].map(y => ({ value: y, label: String(y) }));

    // Control row 1 — Season
    fragment.appendChild(_buildPillControl('Season:', MLB_SEASON_OPTIONS, season, val => {
        if (val === season) return;
        AppState.mlbLeaderSeason = val;
        AppState.mlbLeaderTeam   = 'all';
        AppState.mlbLeaderSplits = null;
        AppState.mlbHotStats = null;
        AppState.mlbHittingStreaks = null;
        _clearMLBLeaderSplitsCache();
        loadMLBLeaderboards();
    }));

    // Control row 2 — Min GP (hitting) / Min IP (pitching)
    fragment.appendChild(_buildPillControl('Min GP / IP:', MLB_MINGP_OPTIONS, minGP, val => {
        AppState.mlbLeaderMinGP = val;
        displayMLBLeaderboards();
    }));

    // Control row 3 — Position
    fragment.appendChild(_buildPillControl('Position:', MLB_POS_OPTIONS, posFilt, val => {
        AppState.mlbLeaderPosition = val;
        displayMLBLeaderboards();
    }));

    // Control row 4 — Team
    if (splits.hitting?.length || splits.pitching?.length) {
        fragment.appendChild(_buildTeamSelect(splits, teamFilt, val => {
            AppState.mlbLeaderTeam = val;
            displayMLBLeaderboards();
        }));
    }

    if (AppState.mlbHittingStreaks?.length && teamFilt === 'all') {
        _appendMLBStreakPanel(fragment, AppState.mlbHittingStreaks, season);
    }

    if (AppState.mlbHotStats && teamFilt === 'all') {
        _appendMLBHotStrip(fragment, AppState.mlbHotStats, season);
    }

    if (posFilt === 'all' && teamFilt === 'all' && (splits.hitting?.length || splits.pitching?.length)) {
        _appendMLBByPositionGrid(fragment, splits, season);
    }

    const seasonDivider = document.createElement('div');
    seasonDivider.className = 'leaderboard-section-divider';
    const _freshFmt = AppState._mlbLeaderSplitsTs ? _formatFreshness(AppState._mlbLeaderSplitsTs) : '';
    const freshnessLabel = _freshFmt
        ? `<span class="freshness-label" aria-label="Data last updated ${_escHtml(_freshFmt.slice('Updated '.length))}">${_escHtml(_freshFmt)}</span>`
        : '';
    seasonDivider.innerHTML = `<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><path d="M2 20V9M9 20V4M16 20V12M23 20V6"/></svg>Season Leaders · ${season}</span>${freshnessLabel}`;
    fragment.appendChild(seasonDivider);

    // Rate-stat qualifier (MLB standard: 3.1 PA / 1 IP per team game) so small-sample
    // lines (e.g. 1-for-1) don't top rate leaderboards. Counting stats need no qualifier.
    const _teamG  = Math.max(0, ...((splits.hitting || []).map(s => parseInt(s.stat?.gamesPlayed, 10) || 0)));
    const _paQual = Math.round(3.1 * _teamG);
    const _ipQual = _teamG;

    MLB_LEADER_CATS.forEach(cat => {
        const catSplits = splits[cat.group] || [];

        // Determine whether the position filter applies to this panel
        const posIsForPitching = PITCHING_POS_SET.has(posFilt);
        const posIsForHitting  = posFilt !== 'all' && !posIsForPitching;
        const applyPosFilt     = (cat.group === 'pitching' && posIsForPitching) ||
                                 (cat.group === 'hitting'  && posIsForHitting);

        const dir = AppState._mlbLbSortDir?.[cat.key] !== undefined
            ? AppState._mlbLbSortDir[cat.key]
            : cat.desc;
        const sorted = [...catSplits]
            .filter(s => {
                const numVal = parseFloat(s.stat?.[cat.key]);
                if (isNaN(numVal)) return false;
                if (cat.decimals > 0) { // rate stat — require a qualified sample
                    const q = cat.group === 'pitching'
                        ? (parseFloat(s.stat?.inningsPitched) || 0) >= _ipQual
                        : (parseFloat(s.stat?.plateAppearances) || 0) >= _paQual;
                    if (!q) return false;
                }
                if (minGP > 0) {
                    const qualVal = cat.group === 'pitching'
                        ? (parseFloat(s.stat?.inningsPitched) || 0)
                        : (s.stat?.gamesPlayed ?? 0);
                    if (qualVal < minGP) return false;
                }
                if (teamFilt !== 'all' && s.team?.abbreviation !== teamFilt) return false;
                if (applyPosFilt) {
                    const pos = (s.position?.abbreviation || '').toLowerCase();
                    return _mlbPosMatch(pos, posFilt);
                }
                return true;
            })
            .sort((a, b) => {
                const av = parseFloat(a.stat[cat.key]);
                const bv = parseFloat(b.stat[cat.key]);
                return dir ? bv - av : av - bv;
            });

        // Hide a panel with no data in the default (unfiltered) view — e.g. a stat the
        // source doesn't provide (Quality Starts). Filtered views keep the empty panel
        // so "no matches" stays visible to the user.
        if (sorted.length === 0 && minGP === 0 && teamFilt === 'all' && posFilt === 'all') return;

        const panel  = document.createElement('div');
        panel.className = 'leaderboard-panel';

        const unitTipMlb = (typeof StatGlossary !== 'undefined' && StatGlossary.MLB[cat.unit])
            ? `<span class="stat-tip" data-tip="${StatGlossary.MLB[cat.unit].replace(/"/g,'&quot;')}" tabindex="0">${cat.unit}</span>`
            : cat.unit;

        const header = document.createElement('div');
        header.className = 'leaderboard-header leaderboard-header--sortable';
        header.style.borderLeftColor = cat.color;
        header.title = `Click to sort ${dir ? 'ascending' : 'descending'}`;
        header.innerHTML = `
            <span class="leaderboard-title">${cat.label}</span>
            <span class="leaderboard-unit" style="color:${cat.color}">${season} ${teamFilt !== 'all' ? teamFilt : 'MLB'} · ${unitTipMlb}${(minGP > 0 || applyPosFilt || teamFilt !== 'all' || cat.decimals > 0) ? ` · ${sorted.length} qualifying` : ''}</span>
            <button class="lb-export-btn" aria-label="Export ${cat.label} as CSV" title="Download CSV" onclick="event.stopPropagation()">↓CSV</button>
            <span class="leaderboard-sort-arrow">${dir ? '▼' : '▲'}</span>
        `;
        header.addEventListener('click', () => {
            if (!AppState._mlbLbSortDir) AppState._mlbLbSortDir = {};
            AppState._mlbLbSortDir[cat.key] = !dir;
            displayMLBLeaderboards();
        });

        setTimeout(() => {
            const exportBtn = panel.querySelector('.lb-export-btn');
            if (exportBtn && typeof exportCSV === 'function') {
                exportBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    const headers = ['Rank', 'Player', 'Team', 'Position', 'GP', cat.unit];
                    const rows = sorted.map((s, i) => {
                        const rawVal = s.stat[cat.key];
                        const numVal = parseFloat(rawVal);
                        const _isBatAvg = cat.decimals === 3;
                        const display = isNaN(numVal) ? rawVal :
                            _isBatAvg ? _fmtAvg(numVal) :
                            cat.decimals > 0 ? numVal.toFixed(cat.decimals) : String(rawVal);
                        return [i+1, s.player?.fullName||'', s.team?.abbreviation||'', s.position?.abbreviation||'', s.stat?.gamesPlayed??'', display];
                    });
                    exportCSV(`mlb-${cat.key}-${season}.csv`, headers, rows);
                });
            }
        }, 0);

        const list = document.createElement('div');
        list.className = 'leaderboard-list';

        const MLB_LB_INIT = 10;

        function _buildMLBLeaderboardRow(split, i) {
            const rawVal  = split.stat[cat.key];
            const numVal  = parseFloat(rawVal);
            const _isBatAvg = cat.decimals === 3;
            const valStr  = isNaN(numVal) ? rawVal :
                _isBatAvg   ? _fmtAvg(numVal) :
                cat.decimals > 0 ? numVal.toFixed(cat.decimals) : String(rawVal);
            const abbr       = split.team?.abbreviation || '';
            const colors     = getMLBTeamColors(abbr);
            const initials   = (split.player?.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
            const headshotUrl = getMLBPlayerHeadshotUrl(split.player?.id);

            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            row.setAttribute('role', 'button');
            row.setAttribute('tabindex', '0');
            const pid = split.player?.id;
            if (pid) {
                row.addEventListener('click', e => { if (e.target.closest('.shc-share-btn')) return; showMLBPlayerDetail(pid, cat.group); });
                row.addEventListener('keydown', e => { if (e.target.closest('.shc-share-btn')) return; if (e.key === 'Enter' || e.key === ' ') showMLBPlayerDetail(pid, cat.group); });
            }
            row.innerHTML = `
                <span class="lb-rank ${i < 3 ? `lb-rank-${i + 1}` : ''}">${i + 1}</span>
                <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                    ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" data-hide-on-error>` : ''}
                    <span class="lb-avatar-initials">${initials}</span>
                </div>
                <div class="lb-player">
                    <span class="lb-name">${_escHtml(split.player?.fullName || '—')}</span>
                    <span class="lb-team">${abbr}${split.position?.abbreviation ? ' · ' + split.position.abbreviation : ''}</span>
                </div>
                <span class="lb-value" style="color:${cat.color}">${valStr}</span>
                <button class="shc-share-btn" aria-label="Share ${_escHtml(split.player?.fullName || 'player')}'s ${_escHtml(cat.label)} stat card" title="Share stat card">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>
                </button>
            `;
            const shareBtn = row.querySelector('.shc-share-btn');
            if (shareBtn && pid && typeof shareStatCard === 'function') {
                shareBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    shareStatCard({
                        playerId: pid,
                        playerName: split.player?.fullName || '',
                        teamAbbr: abbr,
                        position: split.position?.abbreviation || '',
                        statLabel: cat.label,
                        statUnit: cat.unit,
                        statValue: valStr,
                        rank: i + 1,
                        headshotUrl,
                        btn: shareBtn,
                    });
                });
            } else if (shareBtn) {
                shareBtn.remove();
            }
            return row;
        }

        if (sorted.length === 0) {
            list.innerHTML = `<p style="color:var(--color-text-muted);padding:1.5rem;text-align:center;font-size:0.875rem">No data available</p>`;
        } else {
            sorted.slice(0, MLB_LB_INIT).forEach((split, i) => {
                list.appendChild(_buildMLBLeaderboardRow(split, i));
            });

            const extra = sorted.slice(MLB_LB_INIT);
            extra.forEach((split, i) => {
                const row = _buildMLBLeaderboardRow(split, MLB_LB_INIT + i);
                row.style.display = 'none';
                row.dataset.extra = '1';
                list.appendChild(row);
            });

            if (extra.length > 0) {
                const moreBtn = document.createElement('button');
                moreBtn.className = 'leaderboard-more-btn';
                moreBtn.textContent = `Show ${extra.length} more`;
                moreBtn.addEventListener('click', () => {
                    const hidden = [...list.querySelectorAll('[data-extra]')];
                    const showing = hidden[0]?.style.display !== 'none';
                    hidden.forEach(r => r.style.display = showing ? 'none' : '');
                    moreBtn.textContent = showing ? `Show ${extra.length} more` : 'Show less';
                });
                panel.appendChild(header);
                panel.appendChild(list);
                panel.appendChild(moreBtn);
                fragment.appendChild(panel);
                return;
            }
        }

        panel.appendChild(header);
        panel.appendChild(list);
        fragment.appendChild(panel);
    });

    // ── Statcast section ──────────────────────────────────────
    const savantRows = AppState.mlbSavantLeaderboard;
    if (savantRows && savantRows.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'leaderboard-section-divider';
        divider.innerHTML = `<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>Statcast Leaders · ${season} · min 50 batted balls</span>`;
        fragment.appendChild(divider);

        // Build player_id → team/position lookup from already-loaded hitting splits
        const _savantTeamMap = {};
        for (const s of (splits.hitting || [])) {
            if (s.player?.id) _savantTeamMap[String(s.player.id)] = s.team?.abbreviation || '';
        }

        STATCAST_LEADER_CATS.forEach(scat => {
            const sorted = [...savantRows]
                .filter(r => r[scat.key] !== '' && !isNaN(parseFloat(r[scat.key])))
                .sort((a, b) => {
                    const av = parseFloat(a[scat.key]);
                    const bv = parseFloat(b[scat.key]);
                    return scat.desc ? bv - av : av - bv;
                });

            const panel = document.createElement('div');
            panel.className = 'leaderboard-panel';

            const header = document.createElement('div');
            header.className = 'leaderboard-header';
            header.style.borderLeftColor = scat.color;
            const scatTip = (typeof StatGlossary !== 'undefined' && StatGlossary.MLB[scat.unit])
                ? `<span class="stat-tip" data-tip="${StatGlossary.MLB[scat.unit].replace(/"/g,'&quot;')}" tabindex="0">${scat.unit}</span>`
                : scat.unit;
            header.innerHTML = `
                <span class="leaderboard-title">${scat.label}</span>
                <span class="leaderboard-unit" style="color:${scat.color}">${season} MLB · ${scatTip} · ${sorted.length} qualifying</span>
            `;

            const list = document.createElement('div');
            list.className = 'leaderboard-list';

            const MLB_LB_INIT = 10;
            const _buildSavantRow = (r, i) => {
                const numVal  = parseFloat(r[scat.key]);
                const valStr  = isNaN(numVal) ? '—' :
                    (scat.decimals === 3 ? _fmtAvg(numVal) : numVal.toFixed(scat.decimals)) + (scat.suffix || '');
                // CSV name field is "last_name, first_name" combined; convert to "First Last"
                const combined = r['last_name, first_name'] || '';
                const parts    = combined.split(', ');
                const fullName = parts.length === 2 ? `${parts[1]} ${parts[0]}` : combined || '—';
                const pid      = r.player_id;
                const abbr     = _savantTeamMap[String(pid)] || '';
                const colors   = getMLBTeamColors(abbr);
                const initials = fullName.split(' ').map(w => w[0] || '').slice(0, 2).join('');
                const headshotUrl = pid ? getMLBPlayerHeadshotUrl(pid) : null;

                const row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.setAttribute('role', 'button');
                row.setAttribute('tabindex', '0');
                if (pid) {
                    row.addEventListener('click', () => showMLBPlayerDetail(pid, 'hitting'));
                    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showMLBPlayerDetail(pid, 'hitting'); });
                }
                row.innerHTML = `
                    <span class="lb-rank ${i < 3 ? `lb-rank-${i + 1}` : ''}">${i + 1}</span>
                    <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                        ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" data-hide-on-error>` : ''}
                        <span class="lb-avatar-initials">${initials}</span>
                    </div>
                    <div class="lb-player">
                        <span class="lb-name">${_escHtml(fullName)}</span>
                        <span class="lb-team">${_escHtml(abbr)}</span>
                    </div>
                    <span class="lb-value" style="color:${scat.color}">${valStr}</span>
                `;
                return row;
            };

            if (sorted.length === 0) {
                list.innerHTML = `<p style="color:var(--color-text-muted);padding:1.5rem;text-align:center;font-size:0.875rem">No data available</p>`;
            } else {
                sorted.slice(0, MLB_LB_INIT).forEach((r, i) => list.appendChild(_buildSavantRow(r, i)));
                const extra = sorted.slice(MLB_LB_INIT);
                extra.forEach((r, i) => {
                    const row = _buildSavantRow(r, MLB_LB_INIT + i);
                    row.style.display = 'none';
                    row.dataset.extra = '1';
                    list.appendChild(row);
                });
                if (extra.length > 0) {
                    const moreBtn = document.createElement('button');
                    moreBtn.className = 'leaderboard-more-btn';
                    moreBtn.textContent = `Show ${extra.length} more`;
                    moreBtn.addEventListener('click', () => {
                        const hidden = [...list.querySelectorAll('[data-extra]')];
                        const showing = hidden[0]?.style.display !== 'none';
                        hidden.forEach(row => row.style.display = showing ? 'none' : '');
                        moreBtn.textContent = showing ? `Show ${extra.length} more` : 'Show less';
                    });
                    panel.appendChild(header);
                    panel.appendChild(list);
                    panel.appendChild(moreBtn);
                    fragment.appendChild(panel);
                    return;
                }
            }
            panel.appendChild(header);
            panel.appendChild(list);
            fragment.appendChild(panel);
        });

        // Sprint Speed panel — separate Savant fetch
        const sprintRows = AppState._mlbSprintRows;
        if (sprintRows && sprintRows.length > 0) {
            const sorted = [...sprintRows]
                .filter(r => r.sprint_speed !== '' && !isNaN(parseFloat(r.sprint_speed)))
                .sort((a, b) => parseFloat(b.sprint_speed) - parseFloat(a.sprint_speed));

            const panel  = document.createElement('div');
            panel.className = 'leaderboard-panel';
            const header = document.createElement('div');
            header.className = 'leaderboard-header';
            header.style.borderLeftColor = '#10b981';
            header.innerHTML = `
                <span class="leaderboard-title">Sprint Speed</span>
                <span class="leaderboard-unit" style="color:#10b981">${season} MLB · ft/sec · ${sorted.length} qualifying</span>
            `;
            const list = document.createElement('div');
            list.className = 'leaderboard-list';
            sorted.slice(0, 10).forEach((r, i) => {
                const speed   = parseFloat(r.sprint_speed).toFixed(1);
                const pid     = r.player_id;
                const combined = r['last_name, first_name'] || '';
                const parts   = combined.split(', ');
                const fullName = parts.length === 2 ? `${parts[1]} ${parts[0]}` : combined || '—';
                const abbr    = _savantTeamMap[String(pid)] || '';
                const colors  = getMLBTeamColors(abbr);
                const initials = fullName.split(' ').map(w => w[0] || '').slice(0, 2).join('');
                const headshotUrl = pid ? getMLBPlayerHeadshotUrl(pid) : null;
                const row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.setAttribute('role', 'button'); row.setAttribute('tabindex', '0');
                if (pid) {
                    row.addEventListener('click', () => showMLBPlayerDetail(Number(pid), 'hitting'));
                    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showMLBPlayerDetail(Number(pid), 'hitting'); });
                }
                row.innerHTML = `
                    <span class="lb-rank ${i < 3 ? `lb-rank-${i + 1}` : ''}">${i + 1}</span>
                    <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                        ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" data-hide-on-error>` : ''}
                        <span class="lb-avatar-initials">${initials}</span>
                    </div>
                    <div class="lb-player">
                        <span class="lb-name">${_escHtml(fullName)}</span>
                        <span class="lb-team">${_escHtml(abbr)}</span>
                    </div>
                    <span class="lb-value" style="color:#10b981">${speed} ft/s</span>
                `;
                list.appendChild(row);
            });
            panel.appendChild(header);
            panel.appendChild(list);
            fragment.appendChild(panel);
        }

        // ── Pitcher Statcast section ──────────────────────────
        const pitcherSavantRows = AppState.mlbSavantPitcherLeaderboard;
        if (pitcherSavantRows && pitcherSavantRows.length > 0) {
            const pitcherDivider = document.createElement('div');
            pitcherDivider.className = 'leaderboard-section-divider';
            pitcherDivider.innerHTML = `<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>Pitcher Statcast · ${season} · min 50 IP</span>`;
            fragment.appendChild(pitcherDivider);

            // Build pitcher team map from pitching splits
            const _pitcherTeamMap = {};
            for (const s of (splits.pitching || [])) {
                if (s.player?.id) _pitcherTeamMap[String(s.player.id)] = s.team?.abbreviation || '';
            }

            STATCAST_PITCHER_CATS.forEach(pcat => {
                const sorted = [...pitcherSavantRows]
                    .filter(r => r[pcat.key] !== '' && !isNaN(parseFloat(r[pcat.key])))
                    .sort((a, b) => {
                        const av = parseFloat(a[pcat.key]);
                        const bv = parseFloat(b[pcat.key]);
                        return pcat.desc ? bv - av : av - bv;
                    });

                const panel = document.createElement('div');
                panel.className = 'leaderboard-panel';
                const header = document.createElement('div');
                header.className = 'leaderboard-header';
                header.style.borderLeftColor = pcat.color;
                const pcatTip = (typeof StatGlossary !== 'undefined' && StatGlossary.MLB[pcat.unit])
                    ? `<span class="stat-tip" data-tip="${StatGlossary.MLB[pcat.unit].replace(/"/g,'&quot;')}" tabindex="0">${pcat.unit}</span>`
                    : pcat.unit;
                header.innerHTML = `
                    <span class="leaderboard-title">${pcat.label}</span>
                    <span class="leaderboard-unit" style="color:${pcat.color}">${season} MLB · ${pcatTip} · ${sorted.length} qualifying</span>
                `;
                const list = document.createElement('div');
                list.className = 'leaderboard-list';

                const _buildPitcherSavantRow = (r, i) => {
                    const numVal  = parseFloat(r[pcat.key]);
                    const valStr  = isNaN(numVal) ? '—' :
                        numVal.toFixed(pcat.decimals) + (pcat.suffix || '');
                    const combined = r['last_name, first_name'] || '';
                    const parts    = combined.split(', ');
                    const fullName = parts.length === 2 ? `${parts[1]} ${parts[0]}` : combined || '—';
                    const pid      = r.player_id;
                    const abbr     = _pitcherTeamMap[String(pid)] || '';
                    const colors   = getMLBTeamColors(abbr);
                    const initials = fullName.split(' ').map(w => w[0] || '').slice(0, 2).join('');
                    const headshotUrl = pid ? getMLBPlayerHeadshotUrl(pid) : null;

                    const row = document.createElement('div');
                    row.className = 'leaderboard-row';
                    row.setAttribute('role', 'button');
                    row.setAttribute('tabindex', '0');
                    if (pid) {
                        row.addEventListener('click', () => showMLBPlayerDetail(Number(pid), 'pitching'));
                        row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showMLBPlayerDetail(Number(pid), 'pitching'); });
                    }
                    row.innerHTML = `
                        <span class="lb-rank ${i < 3 ? `lb-rank-${i + 1}` : ''}">${i + 1}</span>
                        <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                            ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" data-hide-on-error>` : ''}
                            <span class="lb-avatar-initials">${_escHtml(initials)}</span>
                        </div>
                        <div class="lb-player">
                            <span class="lb-name">${_escHtml(fullName)}</span>
                            <span class="lb-team">${_escHtml(abbr)}</span>
                        </div>
                        <span class="lb-value" style="color:${pcat.color}">${valStr}</span>
                    `;
                    return row;
                };

                if (sorted.length === 0) {
                    list.innerHTML = `<p style="color:var(--text-muted);padding:1.5rem;text-align:center;font-size:0.875rem">No data available</p>`;
                } else {
                    sorted.slice(0, 10).forEach((r, i) => list.appendChild(_buildPitcherSavantRow(r, i)));
                }
                panel.appendChild(header);
                panel.appendChild(list);
                fragment.appendChild(panel);
            });
        }
    }

    grid.innerHTML = '';
    grid.appendChild(fragment);
}

// ── Local search filter ───────────────────────────────────────

function filterMLBPlayers(term) {
    const q = (term || '').toLowerCase().trim();
    AppState.mlbSearchQuery = q;

    // No query — restore normal group + position view
    if (q.length < 2) {
        displayMLBPlayers(AppState.mlbStatsGroup);
        return;
    }

    // Search across BOTH groups so pitchers are findable while on hitters tab
    const seen    = new Set();
    const results = [];
    ['hitting', 'pitching'].forEach(grp => {
        (AppState.mlbPlayers[grp] || []).forEach(p => {
            if (seen.has(p.id)) return;
            if (
                p.fullName?.toLowerCase().includes(q) ||
                p.teamAbbr?.toLowerCase().includes(q) ||
                p.teamName?.toLowerCase().includes(q)
            ) {
                seen.add(p.id);
                results.push({ ...p, _group: grp });
            }
        });
    });

    _displayMLBSearchResults(results, q);
}

// Clears the search box + query state so filters/group switches start fresh.
function _clearMLBSearch() {
    AppState.mlbSearchQuery = '';
    const box   = document.getElementById('searchBox');
    const clear = document.getElementById('searchClear');
    if (box)   box.value = '';
    if (clear) clear.style.display = 'none';
}

// Renders cross-group search results as cards (position filter is bypassed).
function _displayMLBSearchResults(results, q) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';

    const el = document.getElementById('resultCount');

    if (results.length === 0) {
        ErrorHandler.renderEmptyState(grid, `No players found matching "${q}"`);
        if (el) el.textContent = '0 players found';
        return;
    }

    if (el) el.textContent = `${results.length} player${results.length !== 1 ? 's' : ''} found`;

    const fragment = document.createDocumentFragment();
    results.forEach(player => {
        const grp   = player._group || AppState.mlbStatsGroup;
        const stats = AppState.mlbPlayerStats[grp]?.[player.id];
        const card  = _createMLBPlayerCard(player, stats, grp, null);
        fragment.appendChild(card);
    });
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

// ── MLB Ticker ────────────────────────────────────────────────

// Route a game click to the right view: live games open the live page,
// everything else opens the static game detail. forceLive covers surfaces
// where the game object may not be in AppState.mlbGames but the DOM knows
// the game is live (ticker pill, home card class).
function openMLBGame(gamePk, forceLive = false) {
    const game = (AppState.mlbGames || []).find(g => g.gamePk === gamePk);
    const isLive = forceLive || game?.status?.abstractGameState === 'Live';
    if (isLive) {
        if (game) AppState.mlbLiveGame = game;
        navigateTo('mlb-live-' + gamePk);
    } else if (typeof showMLBGameDetail === 'function') {
        showMLBGameDetail(gamePk);
    }
}

function updateMLBTicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) return;

    // Exclude Preview (not-yet-started) games so 0-0 SCH items don't flood the ticker.
    // abstractGameState: 'Preview' | 'Live' | 'Final'
    const scored = (games || []).filter(g =>
        g.status?.abstractGameState !== 'Preview' &&
        g.teams?.home?.score != null &&
        g.teams?.away?.score != null
    );

    if (scored.length === 0) {
        ticker.innerHTML = `<div class="ticker__item">No recent MLB scores — check back during the season</div>`;
        return;
    }

    const items = [...scored, ...scored].map(g => {
        const hs      = g.teams?.home?.score ?? 0;
        const vs      = g.teams?.away?.score ?? 0;
        const ha      = _mlbTeamAbbr(g.teams?.home?.team);
        const va      = _mlbTeamAbbr(g.teams?.away?.team);
        const homeId  = g.teams?.home?.team?.id;
        const awayId  = g.teams?.away?.team?.id;
        const st      = g.status?.detailedState || 'Final';
        const isFinal = st === 'Final';
        const isLive  = g.status?.abstractGameState === 'Live';
        const pillCls = isFinal ? 'final' : isLive ? 'live' : 'sched';
        // For live games show inning from linescore if available
        const inning  = g.linescore?.currentInning ? `${g.linescore.isTopInning ? '▲' : '▼'}${g.linescore.currentInning}` : null;
        const pillLbl = isFinal ? 'F' : isLive ? (inning || 'LIVE') : 'SCH';
        const homeLogo = homeId ? `https://www.mlbstatic.com/team-logos/${homeId}.svg` : null;
        const awayLogo = awayId ? `https://www.mlbstatic.com/team-logos/${awayId}.svg` : null;
        const homeWon  = hs > vs;
        const awayWon  = vs > hs;
        const itemCls = isLive ? 'ticker__item--live' : isFinal ? 'ticker__item--final' : '';
        return `
            <div class="ticker__item${itemCls ? ' ' + itemCls : ''}" data-game-pk="${g.gamePk}" data-sport="mlb" style="cursor:pointer">
                ${homeLogo ? `<img class="ticker-logo" src="${homeLogo}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="ticker-team">${ha}</span>
                <span class="ticker-score ${homeWon && isFinal ? 'ticker-score--win' : ''}">${hs}</span>
                <span class="ticker-divider">–</span>
                <span class="ticker-score ${awayWon && isFinal ? 'ticker-score--win' : ''}">${vs}</span>
                <span class="ticker-team">${va}</span>
                ${awayLogo ? `<img class="ticker-logo" src="${awayLogo}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="ticker-status-pill ticker-status-pill--${pillCls}">${pillLbl}</span>
            </div>
        `;
    }).join('');

    ticker.innerHTML = items;

    // Proportional scroll speed — same logic as NBA ticker in games.js
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = ticker.scrollWidth;
        if (w > 0) {
            ticker.style.animationDuration = Math.max(15, Math.round(w / 2 / 60)) + 's';
        }
    }));
}

// ── Standings ─────────────────────────────────────────────────

async function fetchMLBStandings(season = MLB_SEASON) {
    const data = await mlbFetch('/standings', {
        leagueId:      '103,104',
        season,
        standingsTypes: 'regularSeason',
    }, ApiCache.TTL.SHORT);
    // Build teamId → record map
    const map = {};
    (data.records || []).forEach(div => {
        (div.teamRecords || []).forEach(tr => {
            map[tr.team.id] = {
                wins:      tr.wins,
                losses:    tr.losses,
                pct:       tr.leagueRecord?.pct ?? '.000',
                gamesBack: tr.gamesBack || '—',
                streak:    tr.streak?.streakCode || '',
            };
        });
    });
    return map;
}

// ── Full Standings (divisional, for Standings view) ──────────

// Division ID → short name: used when the API returns division.name = null (active season)
const _MLB_DIV_ID_MAP = {
    200: 'AL East', 201: 'AL East', 202: 'AL Central', 203: 'AL West',
    204: 'NL East', 205: 'NL Central', 206: 'NL West',
};

async function fetchMLBStandingsFull(season = MLB_SEASON) {
    const data = await mlbFetch('/standings', {
        leagueId:       '103,104',
        season,
        standingsTypes: 'regularSeason',
        hydrate:        'team,league,division,sport,conference,record(overallRecords)',
    }, ApiCache.TTL.SHORT);

    return (data.records || []).map(rec => {
        // For the current/active season the API may return division.name = null;
        // fall back to a hardcoded ID lookup so standings still render.
        const rawName = rec.division?.name || _MLB_DIV_ID_MAP[rec.division?.id] || '';
        const divName = rawName
            .replace('American League ', 'AL ')
            .replace('National League ', 'NL ');
        const league = divName.startsWith('AL') ? 'AL' : 'NL';
        return {
            division: divName,
            league,
            teams: (rec.teamRecords || []).map(tr => {
                const findRec = type => (tr.records?.overallRecords || []).find(r => r.type === type);
                const home    = findRec('home');
                const away    = findRec('away');
                const last10  = findRec('lastTen');
                const teamAbbr = tr.team?.abbreviation || '';
                const rs     = tr.runsScored  ?? tr.runs ?? null;
                const ra     = tr.runsAllowed ?? null;
                const rdiff  = rs != null && ra != null ? rs - ra : null;
                return {
                    teamId:   tr.team?.id,
                    teamName: tr.team?.name || teamAbbr,
                    teamAbbr,
                    wins:     tr.wins   ?? 0,
                    losses:   tr.losses ?? 0,
                    pct:      tr.leagueRecord?.pct ?? '.000',
                    gb:       tr.gamesBack          || '—',
                    streak:   tr.streak?.streakCode || '',
                    home:     home   ? `${home.wins}-${home.losses}` : '—',
                    away:     away   ? `${away.wins}-${away.losses}` : '—',
                    l10:      last10 ? `${last10.wins}-${last10.losses}` : '—',
                    rdiff:    rdiff != null ? (rdiff > 0 ? `+${rdiff}` : String(rdiff)) : '—',
                    rs:       rs ?? null,
                    ra:       ra ?? null,
                    clinched: tr.clinchIndicator || '',
                    divRank:  parseInt(tr.divisionRank) || 99,
                };
            }).sort((a, b) => a.divRank - b.divRank),
        };
    });
}

let _mlbStandingsLeague = 'AL';

async function loadMLBStandings() {
    const grid = document.getElementById('playersGrid');
    const viewCount = document.getElementById('viewResultCount');
    if (viewCount) viewCount.textContent = 'MLB Standings';
    if (window.setBreadcrumb) setBreadcrumb('mlb-standings', null);

    grid.className = 'standings-container';
    grid.innerHTML = Array.from({ length: 18 }, () =>
        `<div class="skeleton-line" style="height:38px;border-radius:8px;margin-bottom:4px"></div>`
    ).join('');

    try {
        if (!AppState.mlbStandings) {
            AppState.mlbStandings = await fetchMLBStandingsFull();
        }
        displayMLBStandings(AppState.mlbStandings, _mlbStandingsLeague);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadMLBStandings, { tag: 'MLB', title: 'Failed to Load MLB Standings' });
    }
}

function displayMLBStandings(divisions, league = 'AL') {
    _mlbStandingsLeague = league;
    AppState._mlbStandingsLeague = league;
    const grid = document.getElementById('playersGrid');
    grid.className = 'standings-container';

    const DIV_ORDER = {
        AL: ['AL East', 'AL Central', 'AL West'],
        NL: ['NL East', 'NL Central', 'NL West'],
    };
    const leagueDivs = divisions.filter(d => d.league === league);
    const ordered = (DIV_ORDER[league] || [])
        .map(name => leagueDivs.find(d => d.division === name))
        .filter(Boolean);

    const tabHtml = `
        <div class="standings-tabs">
            <button class="standings-tab ${league === 'AL' ? 'active' : ''}"
                onclick="displayMLBStandings(AppState.mlbStandings,'AL')">AL</button>
            <button class="standings-tab ${league === 'NL' ? 'active' : ''}"
                onclick="displayMLBStandings(AppState.mlbStandings,'NL')">NL</button>
            <button class="standings-tab"
                onclick="displayMLBWildCard(AppState.mlbStandings)">Wild Card</button>
            <button class="standings-tab"
                onclick="displayMLBPowerRankings(AppState.mlbStandings)">Power</button>
            <button class="standings-tab"
                onclick="displayMLBTransactions()">Moves</button>
        </div>
    `;

    const _rdiffCls = rdiff => {
        const n = parseFloat(rdiff);
        return isNaN(n) ? '' : n > 0 ? 'standings-rdiff--pos' : n < 0 ? 'standings-rdiff--neg' : '';
    };

    const _xW = team => {
        const gp = team.wins + team.losses;
        if (!team.rs || !team.ra || gp === 0) return null;
        const rs = team.rs ** 1.83, ra = team.ra ** 1.83;
        return Math.round(gp * rs / (rs + ra));
    };

    const _l10Cls = l10 => {
        const p = (l10 || '').split('-').map(Number);
        if (p.length !== 2 || isNaN(p[0]) || isNaN(p[1]) || p[0] + p[1] === 0) return '';
        return p[0] > p[1] ? 'standings-l10--hot' : p[0] < p[1] ? 'standings-l10--cold' : '';
    };

    const divsHtml = ordered.map(div => {
        const leader = div.teams[0];
        const second = div.teams[1];

        const rowsHtml = div.teams.map((team, idx) => {
            const rank      = idx + 1;
            const streakWin = team.streak?.startsWith?.('W') ?? false;
            const streakCls = team.streak ? (streakWin ? 'standings-streak--win' : 'standings-streak--loss') : '';
            const rowCls    = rank === 1 ? 'standings-row--playoff' : '';
            const colors    = getMLBTeamColors(team.teamAbbr);
            const xW        = _xW(team);

            // Magic number: only meaningful for division leader when season is in progress
            let magicNum = '—';
            if (rank === 1 && second && !team.clinched) {
                const m = 163 - team.wins - second.losses;
                if (m > 0 && m <= 50) magicNum = m;
            }

            const clinchBadge = team.clinched === 'z'
                ? `<span class="clinch-badge clinch-badge--div" title="Clinched Division">z</span>`
                : (team.clinched === 'x' || team.clinched === 'y')
                ? `<span class="clinch-badge clinch-badge--po" title="Clinched Playoff">x</span>`
                : '';

            const logo = getMLBTeamLogoUrl(team.teamId);
            return `
                <tr class="standings-row ${rowCls}" tabindex="0"
                    style="cursor:pointer;--row-accent:${colors.primary}"
                    onclick="showMLBTeamDetail(${team.teamId})"
                    onkeydown="if(event.key==='Enter')this.click()">
                    <td class="standings-rank standings-rank-cell">${rank}</td>
                    <td class="standings-team-cell">
                        ${logo ? `<img class="standings-logo" src="${logo}" alt="" loading="lazy" data-hide-on-error>` : ''}
                        <span class="standings-team-name">${team.teamName}</span>
                        ${clinchBadge}
                    </td>
                    <td class="standings-num">${team.wins}</td>
                    <td class="standings-num">${team.losses}</td>
                    <td class="standings-num standings-pct">${team.pct}</td>
                    <td class="standings-num standings-gb">${team.gb}</td>
                    <td class="standings-num ${_rdiffCls(team.rdiff)}">${team.rdiff}</td>
                    <td class="standings-num standings-xw standings-col--wide">${(() => {
                        if (xW == null) return '—';
                        const delta = team.wins - xW;
                        const deltaStr = delta > 0 ? `<span class="standings-xw-delta standings-xw-delta--over">+${delta}</span>` : delta < 0 ? `<span class="standings-xw-delta standings-xw-delta--under">${delta}</span>` : '';
                        return `${xW}${deltaStr}`;
                    })()}</td>
                    <td class="standings-num standings-col--wide standings-mn">${magicNum}</td>
                    <td class="standings-num ${streakCls}">${team.streak || '—'}</td>
                    <td class="standings-num standings-l10 ${_l10Cls(team.l10)}">${team.l10 || '—'}</td>
                    <td class="standings-num standings-split standings-col--wide">${team.home}</td>
                    <td class="standings-num standings-split standings-col--wide">${team.away}</td>
                </tr>
            `;
        }).join('');

        const leagueCls = div.division.startsWith('AL') ? 'div-league--al' : 'div-league--nl';
        const divShort  = div.division.slice(3); // "East" / "Central" / "West"
        return `
            <div class="mlb-division-panel">
                <h3 class="mlb-division-title">
                    <span class="div-league-badge ${leagueCls}">${div.division.slice(0, 2)}</span>
                    ${divShort}
                </h3>
                <div class="standings-table-wrap">
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th class="standings-th-rank">#</th>
                                <th class="standings-th-team">Team</th>
                                <th title="Wins">W</th>
                                <th title="Losses">L</th>
                                <th title="Win percentage">PCT</th>
                                <th title="Games behind division leader">GB</th>
                                <th title="Run differential">RDIFF</th>
                                <th class="standings-col--wide" title="Pythagorean expected wins based on run differential">xW</th>
                                <th class="standings-col--wide" title="Magic number to clinch division (leader only)">M#</th>
                                <th title="Current streak">STRK</th>
                                <th title="Record in last 10 games">L10</th>
                                <th class="standings-col--wide" title="Home record">HOME</th>
                                <th class="standings-col--wide" title="Away record">AWAY</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = `
        ${tabHtml}
        <div class="mlb-standings-grid">${divsHtml}</div>
        <div class="standings-legend">
            <span class="legend-item"><span class="legend-dot legend-dot--playoff"></span>Division Leader</span>
            <span class="legend-item"><span class="clinch-badge clinch-badge--div">z</span>Clinched Division</span>
            <span class="legend-item"><span class="clinch-badge clinch-badge--po">x</span>Clinched Playoff</span>
            <span class="legend-item standings-legend-note">xW = Pythagorean expected wins · M# = magic number to clinch</span>
        </div>
    `;
}

// ── MLB Wild Card Race ────────────────────────────────────────

function displayMLBWildCard(divisions) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'standings-container';

    if (!divisions || !divisions.length) {
        grid.innerHTML = '<p style="padding:2rem;color:var(--text-muted);text-align:center">No standings data available</p>';
        return;
    }

    const tabHtml = `
        <div class="standings-tabs">
            <button class="standings-tab" onclick="displayMLBStandings(AppState.mlbStandings,'AL')">AL</button>
            <button class="standings-tab" onclick="displayMLBStandings(AppState.mlbStandings,'NL')">NL</button>
            <button class="standings-tab active">Wild Card</button>
            <button class="standings-tab" onclick="displayMLBPowerRankings(AppState.mlbStandings)">Power</button>
            <button class="standings-tab" onclick="displayMLBTransactions()">Moves</button>
        </div>
    `;

    // Build wild card standings for one league
    // Division winner = rank 1 in their division. Wild cards = best records among non-division-winners.
    const _wcSection = (leagueName, leagueKey) => {
        const leagueDivs = divisions.filter(d => d.league === leagueKey);
        const allTeams   = leagueDivs.flatMap(d => d.teams.map(t => ({ ...t, division: d.division })));

        // Identify division winners (rank 1 in each division)
        const divWinnerIds = new Set(
            leagueDivs.map(d => d.teams[0]?.teamId).filter(Boolean)
        );

        const divWinners = allTeams
            .filter(t => divWinnerIds.has(t.teamId))
            .sort((a, b) => {
                const agp = a.wins + a.losses, bgp = b.wins + b.losses;
                const apct = agp > 0 ? a.wins / agp : 0;
                const bpct = bgp > 0 ? b.wins / bgp : 0;
                return bpct - apct;
            });

        const wcContenders = allTeams
            .filter(t => !divWinnerIds.has(t.teamId))
            .sort((a, b) => {
                const agp = a.wins + a.losses, bgp = b.wins + b.losses;
                const apct = agp > 0 ? a.wins / agp : 0;
                const bpct = bgp > 0 ? b.wins / bgp : 0;
                return bpct - apct;
            });

        const qualified = wcContenders.slice(0, 3);
        const bubble    = wcContenders.slice(3, 7);

        const _row = (team, rank, badge) => {
            const logo      = getMLBTeamLogoUrl(team.teamId);
            const gp        = team.wins + team.losses;
            const pct       = gp > 0 ? (team.wins / gp).toFixed(3) : '.000';
            const streakWin = team.streak?.startsWith?.('W') ?? false;
            const streakCls = team.streak ? (streakWin ? 'standings-streak--win' : 'standings-streak--loss') : '';
            const divShort  = (team.division || '').replace('American League ', 'AL ').replace('National League ', 'NL ');
            return `
                <tr class="standings-row ${badge === 'wc' ? 'standings-row--playoff' : badge === 'bubble' ? 'standings-row--playin' : ''}"
                    tabindex="0" style="cursor:pointer"
                    onclick="showMLBTeamDetail(${team.teamId})"
                    onkeydown="if(event.key==='Enter')this.click()">
                    <td class="standings-rank">${rank}</td>
                    <td class="standings-team-cell">
                        ${logo ? `<img class="standings-logo" src="${logo}" alt="" loading="lazy" data-hide-on-error>` : ''}
                        <span class="standings-team-name">${team.teamName}</span>
                        ${badge === 'wc' ? `<span class="wc-badge">WC</span>` : ''}
                    </td>
                    <td class="standings-num">${team.wins}</td>
                    <td class="standings-num">${team.losses}</td>
                    <td class="standings-num standings-pct">${pct}</td>
                    <td class="standings-num standings-gb">${team.gb}</td>
                    <td class="standings-num standings-rdiff ${team.rdiff?.startsWith?.('+') ? 'standings-rdiff--pos' : team.rdiff !== '—' && !team.rdiff?.startsWith?.('+') && team.rdiff !== '0' ? 'standings-rdiff--neg' : ''}">${team.rdiff}</td>
                    <td class="standings-num ${streakCls}">${team.streak || '—'}</td>
                    <td class="standings-num standings-split">${team.l10 || '—'}</td>
                    <td class="standings-num standings-split">${divShort}</td>
                </tr>
            `;
        };

        const divRows = divWinners.map((t, i) => _row(t, i + 1, 'div')).join('');
        const wcRows  = qualified.map((t, i) => _row(t, i + 1, 'wc')).join('');
        const bubbleRows = bubble.length
            ? `<tr class="standings-sep standings-sep--playoff"><td colspan="10"><span>Chasing Wild Card</span></td></tr>` +
              bubble.map((t, i) => _row(t, qualified.length + i + 1, 'bubble')).join('')
            : '';

        return `
            <div class="mlb-wc-section">
                <h3 class="mlb-division-title">${leagueName}</h3>
                <div class="standings-table-wrap">
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th class="standings-th-rank">#</th>
                                <th class="standings-th-team">Team</th>
                                <th title="Wins">W</th>
                                <th title="Losses">L</th>
                                <th title="Win percentage">PCT</th>
                                <th title="Games behind wild card">GB</th>
                                <th title="Run differential">RDIFF</th>
                                <th title="Current streak">STRK</th>
                                <th title="Last 10">L10</th>
                                <th title="Division">DIV</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="standings-sep"><td colspan="10"><span>Division Leaders</span></td></tr>
                            ${divRows}
                            <tr class="standings-sep standings-sep--playoff"><td colspan="10"><span>Wild Card</span></td></tr>
                            ${wcRows}
                            ${bubbleRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    };

    grid.innerHTML = `
        ${tabHtml}
        <div class="mlb-standings-grid">
            ${_wcSection('American League', 'AL')}
            ${_wcSection('National League', 'NL')}
        </div>
        <div class="standings-legend">
            <span class="legend-item"><span class="legend-dot legend-dot--playoff"></span>Division Leader / Wild Card In</span>
            <span class="legend-item"><span class="legend-dot legend-dot--playin"></span>Chasing Wild Card</span>
            <span class="legend-item"><span class="wc-badge">WC</span>Wild Card spot</span>
        </div>
    `;
}

// ── MLB Power Rankings ────────────────────────────────────────

function displayMLBPowerRankings(divisions) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'standings-container';

    if (!divisions || !divisions.length) {
        grid.innerHTML = '<p style="padding:2rem;color:var(--text-muted);text-align:center">No standings data available</p>';
        return;
    }

    // Flatten all teams from all divisions
    const allTeams = divisions.flatMap(d => d.teams.map(t => ({ ...t, division: d.division })));

    // Normalise RDIFF: parse "+12" / "-5" / "—" → number, then scale to 0..1
    const rdiffs = allTeams
        .map(t => parseFloat(t.rdiff))
        .filter(n => !isNaN(n));
    const rdiffMin = Math.min(...rdiffs, 0);
    const rdiffMax = Math.max(...rdiffs, 1);

    const _mlbPowerScore = t => {
        const gp      = t.wins + t.losses;
        const winPct  = gp > 0 ? t.wins / gp : 0;
        const rd      = parseFloat(t.rdiff);
        const rdFact  = isNaN(rd) ? winPct
            : rdiffMax !== rdiffMin ? (rd - rdiffMin) / (rdiffMax - rdiffMin) : 0.5;
        const strNum  = typeof _parseStreak === 'function' ? _parseStreak(t.streak) : 0;
        const strFact = (strNum + 10) / 20;
        // L10 form factor: parse "W-L" string → recent win rate
        const l10Parts = (t.l10 || '').split('-').map(Number);
        const l10Fact  = l10Parts.length === 2 && !isNaN(l10Parts[0]) && (l10Parts[0] + l10Parts[1]) > 0
            ? l10Parts[0] / (l10Parts[0] + l10Parts[1])
            : winPct;
        return winPct * 0.50 + rdFact * 0.20 + strFact * 0.10 + l10Fact * 0.20;
    };

    const scored = allTeams
        .map(t => ({ ...t, _score: _mlbPowerScore(t) }))
        .sort((a, b) => b._score - a._score);

    const maxScore = scored[0]._score || 1;

    const tabHtml = `
        <div class="standings-tabs">
            <button class="standings-tab" onclick="displayMLBStandings(AppState.mlbStandings,'AL')">AL</button>
            <button class="standings-tab" onclick="displayMLBStandings(AppState.mlbStandings,'NL')">NL</button>
            <button class="standings-tab" onclick="displayMLBWildCard(AppState.mlbStandings)">Wild Card</button>
            <button class="standings-tab active">Power</button>
            <button class="standings-tab" onclick="displayMLBTransactions()">Moves</button>
        </div>
    `;

    const rowsHtml = scored.map((team, idx) => {
        const rank      = idx + 1;
        const gp        = team.wins + team.losses;
        const winPct    = gp > 0 ? (team.wins / gp).toFixed(3) : '.000';
        const strNum    = typeof _parseStreak === 'function' ? _parseStreak(team.streak) : 0;
        const streakClr = strNum >= 3 ? 'var(--color-win)' : strNum <= -3 ? 'var(--color-loss)' : 'var(--text-muted)';
        const logo      = getMLBTeamLogoUrl(team.teamId);
        const barW      = (team._score / maxScore * 100).toFixed(1);

        const heat = team._score >= 0.65 ? { label: 'HOT',   cls: 'power-heat--hot'  }
                   : team._score >= 0.52 ? { label: 'SOLID', cls: 'power-heat--solid' }
                   : team._score >= 0.40 ? { label: 'MID',   cls: 'power-heat--mid'  }
                   :                       { label: 'COLD',  cls: 'power-heat--cold'  };

        const divShort = team.division.replace('American League ', 'AL ').replace('National League ', 'NL ');
        const leagueCls = divShort.startsWith('AL') ? 'power-conf--east' : 'power-conf--west';

        return `
            <div class="power-row power-row--mlb" role="button" tabindex="0" style="cursor:pointer" onclick="showMLBTeamDetail(${team.teamId})" onkeydown="if(event.key==='Enter')this.click()">
                <div class="power-rank">${rank}</div>
                ${logo ? `<img class="power-logo" src="${logo}" alt="" loading="lazy" data-hide-on-error>` : '<div class="power-logo"></div>'}
                <div class="power-team">
                    <div class="power-team-name">${team.teamName} <span class="power-conf ${leagueCls}">${divShort.slice(0, 2)}</span></div>
                    <div class="power-bar-wrap">
                        <div class="power-bar-fill" style="width:${barW}%"></div>
                    </div>
                </div>
                <div class="power-record">${team.wins}–${team.losses}<span class="power-pct">${winPct}</span></div>
                <div class="power-streak" style="color:${streakClr}">${team.streak || '—'}</div>
                <div class="power-l10">${team.l10 || '—'}</div>
                <div class="power-heat ${heat.cls}">${heat.label}</div>
            </div>
        `;
    }).join('');

    grid.innerHTML = `
        ${tabHtml}
        <div class="power-header-row power-header-row--mlb">
            <div></div><div></div>
            <div class="power-col-label">Team</div>
            <div class="power-col-label">Record</div>
            <div class="power-col-label">Streak</div>
            <div class="power-col-label">L10</div>
            <div class="power-col-label">Form</div>
        </div>
        <div class="power-list">${rowsHtml}</div>
        <p class="power-note">Power score = Win% (50%) + L10 Form (20%) + Run Differential (20%) + Streak (10%)</p>
    `;
}

// ── Recent Transactions ───────────────────────────────────────

async function displayMLBTransactions() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'standings-container';

    const tabHtml = `
        <div class="standings-tabs">
            <button class="standings-tab" onclick="displayMLBStandings(AppState.mlbStandings,'AL')">AL</button>
            <button class="standings-tab" onclick="displayMLBStandings(AppState.mlbStandings,'NL')">NL</button>
            <button class="standings-tab" onclick="displayMLBWildCard(AppState.mlbStandings)">Wild Card</button>
            <button class="standings-tab" onclick="displayMLBPowerRankings(AppState.mlbStandings)">Power</button>
            <button class="standings-tab active">Moves</button>
        </div>
    `;

    const skelRows = Array.from({ length: 10 }, () => `
        <div class="txn-row txn-row--skeleton">
            <span style="width:20px;flex-shrink:0"></span>
            <div class="skeleton-line" style="width:32px;height:32px;border-radius:50%;flex-shrink:0"></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:5px">
                <div class="skeleton-line" style="width:45%;height:12px"></div>
                <div class="skeleton-line" style="width:78%;height:10px"></div>
            </div>
            <div class="skeleton-line" style="width:32px;height:18px;border-radius:4px"></div>
        </div>
    `).join('');

    grid.innerHTML = tabHtml + `<div id="mlb-moves-feed"><div class="txn-loading">${skelRows}</div></div>`;

    try {
        const endDate   = _mlbDateString(0);
        const startDate = _mlbDateString(-6);
        const data = await mlbFetch('/transactions', { sportId: 1, startDate, endDate }, ApiCache.TTL.SHORT);
        _renderMLBTransactions(data.transactions || []);
    } catch (err) {
        Logger.error('Transactions fetch failed', err, 'MLB');
        const feed = document.getElementById('mlb-moves-feed');
        if (feed) feed.innerHTML = '<p style="padding:2rem;color:var(--text-muted);text-align:center">Could not load recent transactions.</p>';
    }
}

function _renderMLBTransactions(transactions) {
    const feed = document.getElementById('mlb-moves-feed');
    if (!feed) return;

    const _emoji = desc => {
        const d = (desc || '').toLowerCase();
        if (d.includes('trade'))                                                          return 'TRD';
        if (d.includes('recalled') || d.includes('called up') || d.includes('selected')) return 'UP';
        if (d.includes('optioned') || (d.includes('assigned to') && !d.includes('outright'))) return 'DN';
        if (d.includes('designated for assignment'))                                       return 'DFA';
        if (d.includes('released'))                                                        return 'REL';
        if (d.includes('placed on') && (d.includes(' il') || d.includes('injured list'))) return 'IL';
        if (d.includes('activated') && (d.includes(' il') || d.includes('injured list'))) return 'ACT';
        if (d.includes('signed'))                                                          return 'SIG';
        if (d.includes('claimed') || d.includes('waiver'))                                return 'CLM';
        return 'MOV';
    };

    // Exclude purely minor-league-to-minor-league moves that aren't promotions
    const relevant = transactions.filter(txn => {
        if (!txn.person?.id || !txn.person?.fullName) return false;
        const d = (txn.description || '').toLowerCase();
        const minorLeagueOnly = (d.includes('double-a') || d.includes('triple-a') || d.includes('single-a') || d.includes('rookie') || d.includes('complex league'))
            && d.includes('assigned to') && !d.includes('outright') && !d.includes('recalled') && !d.includes('called up') && !d.includes('selected');
        return !minorLeagueOnly;
    });

    if (!relevant.length) {
        feed.innerHTML = '<p style="padding:2rem;color:var(--text-muted);text-align:center">No recent transactions found for this period.</p>';
        return;
    }

    // Group by date descending
    const byDate = {};
    relevant.forEach(txn => {
        const d = (txn.date || txn.effectiveDate || '').slice(0, 10);
        if (d) { if (!byDate[d]) byDate[d] = []; byDate[d].push(txn); }
    });
    const sortedDates = Object.keys(byDate).sort().reverse();

    const _fmtDate = d => {
        try {
            return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        } catch (_) { return d; }
    };

    let html = '<div class="txn-feed">';
    let shown = 0;
    const MAX = 80;

    for (const date of sortedDates) {
        if (shown >= MAX) break;
        html += `<div class="txn-date-hdr">${_fmtDate(date)}</div>`;
        for (const txn of byDate[date]) {
            if (shown >= MAX) break;
            const pid      = txn.person.id;
            const name     = _escHtml(txn.person.fullName);
            const abbr     = txn.team?.abbreviation || '';
            const desc     = _escHtml(txn.description || txn.typeDesc || '');
            const emoji    = _emoji(txn.description || txn.typeDesc || '');
            const colors   = getMLBTeamColors(abbr);
            const headshot = getMLBPlayerHeadshotUrl(pid);
            const initials = (txn.person.fullName).split(' ').map(w => w[0] || '').slice(0, 2).join('');

            html += `
                <div class="txn-row" role="button" tabindex="0"
                     onclick="showMLBPlayerDetail(${pid})"
                     onkeydown="if(event.key==='Enter')showMLBPlayerDetail(${pid})">
                    <span class="txn-emoji" aria-hidden="true">${emoji}</span>
                    <div class="txn-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                        ${headshot ? `<img src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}
                        <span class="txn-avatar-initials">${_escHtml(initials)}</span>
                    </div>
                    <div class="txn-body">
                        <span class="txn-name">${name}</span>
                        <span class="txn-desc">${desc}</span>
                    </div>
                    ${abbr ? `<span class="txn-team-badge" style="background:${colors.primary}22;border:1px solid ${colors.primary}44;color:${colors.primary}">${_escHtml(abbr)}</span>` : ''}
                </div>`;
            shown++;
        }
    }

    html += '</div>';
    if (shown >= MAX) html += `<p class="txn-overflow">Showing ${MAX} most recent moves · <a href="https://www.mlb.com/transactions" target="_blank" rel="noopener" style="color:var(--accent)">All transactions →</a></p>`;

    feed.innerHTML = html;
}

// ── MLB Player Compare (PREM-004) ─────────────────────────────

const _MLB_CMP_HIT = [
    { key: 'avg',         label: 'AVG',  d: 3, lead: true },
    { key: 'obp',         label: 'OBP',  d: 3, lead: true },
    { key: 'slg',         label: 'SLG',  d: 3, lead: true },
    { key: 'ops',         label: 'OPS',  d: 3, lead: true },
    { key: 'homeRuns',    label: 'HR',   d: 0 },
    { key: 'rbi',         label: 'RBI',  d: 0 },
    { key: 'stolenBases', label: 'SB',   d: 0 },
    { key: 'strikeOuts',  label: 'K',    d: 0, lower: true },
];
const _MLB_CMP_PIT = [
    { key: 'era',             label: 'ERA',  d: 2, lower: true },
    { key: 'whip',            label: 'WHIP', d: 2, lower: true },
    { key: 'strikeoutsPer9Inn', label: 'K/9', d: 1 },
    { key: 'walksPer9Inn',    label: 'BB/9', d: 1, lower: true },
    { key: 'strikeOuts',      label: 'K',    d: 0 },
    { key: 'wins',            label: 'W',    d: 0 },
    { key: 'inningsPitched',  label: 'IP',   d: 1 },
    { key: 'saves',           label: 'SV',   d: 0 },
];

function _mlbH2HCard(player, group) {
    const oppGroup = group === 'hitting' ? 'pitching' : 'hitting';
    const oppPool  = AppState.mlbPlayers?.[oppGroup] || [];
    if (!oppPool.length) return '';

    const sortKey = oppGroup === 'pitching' ? 'era' : 'ops';
    const opts = oppPool
        .sort((a, b) => {
            const av = parseFloat(AppState.mlbPlayerStats?.[oppGroup]?.[a.id]?.[sortKey] || (oppGroup === 'pitching' ? 99 : 0));
            const bv = parseFloat(AppState.mlbPlayerStats?.[oppGroup]?.[b.id]?.[sortKey] || (oppGroup === 'pitching' ? 99 : 0));
            return oppGroup === 'pitching' ? av - bv : bv - av;
        })
        .map(p => `<option value="${p.id}">${_escHtml(p.fullName || '—')} · ${_escHtml(p.teamAbbr || '—')}</option>`)
        .join('');

    const placeholder = group === 'hitting' ? '— Select a pitcher —' : '— Select a batter —';
    return `
        <h2 class="detail-section-title">Career Matchup</h2>
        <div class="h2h-select-row">
            <select id="mlb-h2h-select" class="compare-select" style="flex:1">
                <option value="">${placeholder}</option>
                ${opts}
            </select>
            <button class="share-btn" id="mlb-h2h-btn" onclick="_loadMLBH2H(${player.id},'${group}')">Load</button>
        </div>
        <div id="mlb-h2h-result"></div>
    `;
}

function _mlbCompareCard(currentPlayer, group) {
    const pool = AppState.mlbPlayers?.[group] || [];
    if (!pool.length) return '';

    const sortKey = group === 'hitting' ? 'ops' : 'era';
    const opts = pool
        .filter(p => p.id !== currentPlayer.id)
        .sort((a, b) => {
            const av = parseFloat(AppState.mlbPlayerStats?.[group]?.[a.id]?.[sortKey] || (group === 'hitting' ? 0 : 99));
            const bv = parseFloat(AppState.mlbPlayerStats?.[group]?.[b.id]?.[sortKey] || (group === 'hitting' ? 0 : 99));
            return group === 'hitting' ? bv - av : av - bv;
        })
        .map(p => `<option value="${p.id}">${_escHtml(p.fullName || '—')} · ${_escHtml(p.teamAbbr || '—')}</option>`)
        .join('');

    return `
        <div class="stats-card">
            <h2 class="detail-section-title">Compare Players</h2>
            <div class="mlb-cmp-selects">
                <select id="mlb-cmp-select-b" class="compare-select" aria-label="Compare: player 2">
                    <option value="">— Add player 2 —</option>
                    ${opts}
                </select>
                <select id="mlb-cmp-select-c" class="compare-select" aria-label="Compare: player 3">
                    <option value="">— Add player 3 —</option>
                    ${opts}
                </select>
            </div>
            <div id="mlb-cmp-wrap" style="display:none;margin-top:1rem">
                <div style="display:flex;justify-content:flex-end;margin-bottom:0.5rem">
                    <button class="share-btn" id="mlb-cmp-share-btn" style="display:none">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        Share Comparison
                    </button>
                </div>
                <div style="position:relative;height:280px"><canvas id="mlb-cmp-radar"></canvas></div>
                <div id="mlb-cmp-table" class="compare-table-wrap"></div>
            </div>
        </div>
    `;
}

function _onMLBCompareChange(playerA, statsA, group, colorsA) {
    const selB  = document.getElementById('mlb-cmp-select-b');
    const selC  = document.getElementById('mlb-cmp-select-c');
    const wrap  = document.getElementById('mlb-cmp-wrap');
    if (!selB || !wrap) return;

    const idB = parseInt(selB.value) || null;
    const idC = parseInt(selC?.value) || null;

    if (!idB) {
        wrap.style.display = 'none';
        const sb = document.getElementById('mlb-cmp-share-btn');
        if (sb) sb.style.display = 'none';
        return;
    }

    const playerB  = (AppState.mlbPlayers?.[group] || []).find(p => p.id === idB);
    const statsB   = AppState.mlbPlayerStats?.[group]?.[idB];
    const playerC  = idC ? (AppState.mlbPlayers?.[group] || []).find(p => p.id === idC) : null;
    const statsC   = idC ? AppState.mlbPlayerStats?.[group]?.[idC] : null;

    if (!playerB || !statsB) { wrap.style.display = 'none'; return; }

    wrap.style.display = 'block';

    const shareBtn = document.getElementById('mlb-cmp-share-btn');
    if (shareBtn) {
        shareBtn.style.display = '';
        const cmpUrl = `${window.location.href.split('#')[0]}#mlb-compare-${group}-${playerA.id}-${idB}`;
        shareBtn.onclick = () => {
            if (navigator.share) {
                navigator.share({ url: cmpUrl, title: `${playerA.fullName} vs ${playerB.fullName}` }).catch(() => {});
            } else {
                navigator.clipboard?.writeText(cmpUrl).then(() => {
                    ErrorHandler.toast('Comparison link copied', 'success');
                }).catch(() => {});
            }
        };
    }

    const colorsB = getMLBTeamColors(playerB.teamAbbr);
    const colorsC = playerC ? getMLBTeamColors(playerC.teamAbbr) : null;

    // Radar datasets
    const _radarData = (s) => group === 'hitting' ? {
        avg:         parseFloat(s.avg)         || 0,
        homeRuns:    s.homeRuns                || 0,
        rbi:         s.rbi                     || 0,
        obp:         parseFloat(s.obp)         || 0,
        slg:         parseFloat(s.slg)         || 0,
        stolenBases: s.stolenBases             || 0,
    } : {
        era:  parseFloat(s.era)              || 0,
        k9:   parseFloat(s.strikeoutsPer9Inn) || 0,
        bb9:  parseFloat(s.walksPer9Inn)      || 0,
        whip: parseFloat(s.whip)              || 0,
        ip:   parseFloat(s.inningsPitched)    || 0,
    };

    const datasets = [
        { label: playerA.fullName, data: _radarData(statsA), color: colorsA.primary },
        { label: playerB.fullName, data: _radarData(statsB), color: colorsB.primary },
    ];
    if (playerC && statsC) datasets.push({ label: playerC.fullName, data: _radarData(statsC), color: colorsC?.primary || '#f472b6' });

    requestAnimationFrame(() => {
        StatsCharts.mlbRadar('mlb-cmp-radar', datasets, group);
    });

    // Stat table
    const statDefs = group === 'hitting' ? _MLB_CMP_HIT : _MLB_CMP_PIT;
    const _fmtVal = (s, def) => {
        const raw = parseFloat(s?.[def.key]);
        if (isNaN(raw)) return '—';
        const str = raw.toFixed(def.d);
        return def.lead ? str.replace(/^0\./, '.') : str;
    };

    const players  = [{ p: playerA, s: statsA, clr: colorsA.primary }, { p: playerB, s: statsB, clr: colorsB.primary }];
    if (playerC && statsC) players.push({ p: playerC, s: statsC, clr: colorsC?.primary || '#f472b6' });

    const thead = `<tr>
        <th class="cmp-th-a" style="color:${players[0].clr}">${_escHtml(playerA.fullName)}</th>
        <th class="cmp-th-mid">Stat</th>
        <th class="cmp-th-b" style="color:${players[1].clr}">${_escHtml(playerB.fullName)}</th>
        ${players[2] ? `<th class="cmp-th-b" style="color:${players[2].clr}">${_escHtml(playerC.fullName)}</th>` : ''}
    </tr>`;

    const tbody = statDefs.map(def => {
        const vals = players.map(({ s }) => parseFloat(s?.[def.key]));
        const best = vals.reduce((bst, v, i) => {
            if (isNaN(v)) return bst;
            if (bst === -1) return i;
            const bv = vals[bst];
            return def.lower ? (v < bv ? i : bst) : (v > bv ? i : bst);
        }, -1);
        const cells = players.map(({ s, clr }, i) => {
            const disp = _fmtVal(s, def);
            const win  = i === best && !isNaN(vals[i]);
            return `<td class="cmp-val-a ${win ? 'cmp-winner' : ''}" style="${win ? `color:${clr}` : ''}">${disp}</td>`;
        }).join('');
        return `<tr class="cmp-row"><td class="cmp-stat-lbl-cell">${def.label}</td>${cells}</tr>`;
    }).join('');

    const tableEl = document.getElementById('mlb-cmp-table');
    if (tableEl) {
        tableEl.innerHTML = `<table class="cmp-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    }
}

// ── Standings lookup helper ───────────────────────────────────

function _standingsTeam(teamId) {
    if (!teamId || !AppState.mlbStandings) return null;
    for (const div of AppState.mlbStandings) {
        const found = div.teams.find(t => t.teamId === teamId);
        if (found) return found;
    }
    return null;
}

// ── Predictive Analytics badge (F3) ──────────────────────────

function _computeMLBAnalyticsBadge(stats, statcast, group) {
    if (!statcast) return null;

    if (group === 'hitting') {
        const babip     = parseFloat(stats.babip)              || 0;
        const xbaPct    = statcast.p_xba            ?? null;
        const evPct     = statcast.p_avg_hit_speed   ?? null;
        const barrelPct = statcast.p_barrels_per_bbe ?? null;
        const computed  = _computeBattingRates(stats);
        const kPct      = parseFloat(computed.kPct)  || 0;
        const bbPct     = parseFloat(computed.bbPct) || 0;

        if (xbaPct === null && evPct === null) return null;

        let breakout = 0, regress = 0;
        if (babip < 0.275 && xbaPct >= 55)               breakout += 2;
        if (evPct !== null && evPct >= 65)                breakout += 1;
        if (barrelPct !== null && barrelPct >= 60)        breakout += 1;
        if (kPct < 22 && bbPct >= 7)                     breakout += 1;

        if (babip > 0.345 && xbaPct < 45)                regress  += 2;
        if (evPct !== null && evPct < 40)                 regress  += 1;
        if (barrelPct !== null && barrelPct < 35)         regress  += 1;
        if (kPct > 27)                                    regress  += 1;

        if (breakout >= 3) return { label: 'Breakout Candidate', desc: 'Contact quality outpacing results — expected stats point higher', cls: 'badge--breakout' };
        if (regress  >= 3) return { label: 'Regression Risk',    desc: 'Results outpacing contact quality — expected stats point lower',  cls: 'badge--regress'  };
        if (breakout >= 2 && regress <= 1) return { label: 'Buy Low',    desc: 'Underperforming expected metrics — potential upside',   cls: 'badge--buy'  };
        if (regress  >= 2 && breakout <= 1) return { label: 'Sell High', desc: 'Overperforming expected metrics — potential downside', cls: 'badge--sell' };
    } else {
        const eraRaw  = parseFloat(stats.era)       || 0;
        const xEraRaw = parseFloat(statcast.xera)   || 0;
        const xEraPct = statcast.p_xera             ?? null;
        const computed = _computePitchingRates(stats);
        const kPct    = parseFloat(computed.kBbPct !== undefined ? 0 : 0) || 0;
        const bbPct   = 0;
        void kPct; void bbPct;

        if (!xEraRaw || !eraRaw) return null;
        const diff = eraRaw - xEraRaw;

        let breakout = 0, regress = 0;
        if (diff > 0.75 && (xEraPct ?? 50) >= 55)  breakout += 2;
        if (parseFloat(stats.strikeoutsPer9Inn) > 9) breakout += 1;
        if (parseFloat(stats.walksPer9Inn) < 2.5)   breakout += 1;

        if (diff < -0.75 && (xEraPct ?? 50) < 45)  regress  += 2;
        if (parseFloat(stats.walksPer9Inn) > 3.5)   regress  += 1;
        if (parseFloat(stats.strikeoutsPer9Inn) < 6) regress += 1;

        if (breakout >= 3) return { label: 'Breakout Candidate', desc: 'ERA running above xERA — underlying stuff points to improvement', cls: 'badge--breakout' };
        if (regress  >= 3) return { label: 'Regression Risk',    desc: 'ERA running below xERA — results likely to reverse',             cls: 'badge--regress'  };
        if (breakout >= 2 && regress <= 1) return { label: 'Buy Low',    desc: 'ERA overstating struggles — underlying metrics are solid',     cls: 'badge--buy'  };
        if (regress  >= 2 && breakout <= 1) return { label: 'Sell High', desc: 'ERA understating risk — underlying metrics are concerning',   cls: 'badge--sell' };
    }
    return null;
}

// ── Broadcast Blurb (F1 — AI Stat Narratives) ────────────────

async function _fetchBroadcastBlurb(player, stats, statcast, group, colors) {
    const blurbCard = document.getElementById('mlb-blurb-card');
    if (!blurbCard) return;

    if (!BROADCAST_BLURB_URL) {
        blurbCard.style.display = '';
        blurbCard.innerHTML = `
            <h2 class="detail-section-title">Broadcast Blurb</h2>
            <p style="color:var(--text-muted);font-size:0.85rem">
                Deploy <code>worker/broadcast-blurb.js</code> and set <code>BROADCAST_BLURB_URL</code> in <code>api.js</code> to enable AI blurbs.
            </p>`;
        return;
    }

    blurbCard.style.display = '';
    blurbCard.innerHTML = `
        <h2 class="detail-section-title">Broadcast Blurb</h2>
        <div>
            <div class="skeleton-line" style="width:100%;height:18px;border-radius:6px"></div>
            <div class="skeleton-line" style="width:88%;height:18px;border-radius:6px;margin-top:8px"></div>
        </div>`;

    const computed = group === 'hitting' ? _computeBattingRates(stats) : _computePitchingRates(stats);
    const payload  = {
        name: player.fullName, team: player.teamName || player.teamAbbr,
        position: player.position, group, season: MLB_SEASON,
        stats: group === 'hitting' ? {
            avg: stats.avg, obp: stats.obp, slg: stats.slg, ops: stats.ops,
            homeRuns: stats.homeRuns, rbi: stats.rbi, stolenBases: stats.stolenBases,
            babip: stats.babip, kPct: computed.kPct, bbPct: computed.bbPct,
        } : {
            era: stats.era, whip: stats.whip, wins: stats.wins,
            strikeOuts: stats.strikeOuts, inningsPitched: stats.inningsPitched,
            fip: computed.fip,
        },
        statcast: statcast ? {
            xba: statcast.xba, xslg: statcast.xslg, xwoba: statcast.xwoba,
            avg_hit_speed: statcast.avg_hit_speed, barrels_per_bbe: statcast.barrels_per_bbe,
        } : null,
    };

    try {
        const res  = await fetch(BROADCAST_BLURB_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Blurb API ${res.status}`);
        const { blurb } = await res.json();
        blurbCard.innerHTML = `
            <h2 class="detail-section-title">Broadcast Blurb</h2>
            <div class="blurb-text" style="border-left-color:${colors.primary}">
                <p>${_escHtml(blurb)}</p>
            </div>
            <button class="share-btn" data-blurb="${_escHtml(blurb)}"
                onclick="navigator.clipboard?.writeText(this.dataset.blurb).then(()=>ErrorHandler.toast('Blurb copied','success'))">Copy</button>`;
    } catch (err) {
        Logger.warn('Broadcast blurb failed', err, 'MLB');
        blurbCard.innerHTML = `
            <h2 class="detail-section-title">Broadcast Blurb</h2>
            <p style="color:var(--color-error);font-size:0.85rem">
                Blurb service unavailable — deploy <code>worker/broadcast-blurb.js</code> to enable AI blurbs.
            </p>`;
    }
}

async function _triggerBroadcastBlurb(playerId, group) {
    const player = (AppState.mlbPlayers?.[group] || []).find(p => p.id === playerId);
    const stats  = AppState.mlbPlayerStats?.[group]?.[playerId];
    if (!player || !stats) return;
    const colors      = getMLBTeamColors(player.teamAbbr);
    const savantType  = group === 'pitching' ? 'pitcher' : 'batter';
    const statcast    = await fetchStatcast(playerId, savantType).catch(() => null);
    await _fetchBroadcastBlurb(player, stats, statcast, group, colors);
}
window._triggerBroadcastBlurb = _triggerBroadcastBlurb;

// ── Scouting Report (P3-002) ──────────────────────────────────

async function _showMLBScoutReport(playerId, group) {
    const card = document.getElementById('mlb-scout-card');
    if (!card) return;
    card.style.display = '';
    card.innerHTML = `<div class="scout-loading">Generating report…<span class="scout-loading-dot"></span></div>`;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (!AppState.mlbLeaderSplits) {
        try {
            await _fetchMLBLeaderSplits(MLB_SEASON);
        } catch (_) {
            card.innerHTML = `<p style="padding:1rem;color:var(--color-loss)">Could not load league data for comparison.</p>`;
            return;
        }
    }

    card.innerHTML = _buildScoutReportHTML(playerId, group);
}
window._showMLBScoutReport = _showMLBScoutReport;

function _buildScoutReportHTML(playerId, group) {
    const player = (AppState.mlbPlayers?.[group] || []).find(p => p.id === playerId);
    if (!player) return '<p style="padding:1rem;color:var(--text-muted)">Player data unavailable.</p>';

    const stats    = AppState.mlbPlayerStats?.[group]?.[playerId] || {};
    const computed = group === 'hitting' ? _computeBattingRates(stats) : _computePitchingRates(stats);
    const allSplits = AppState.mlbLeaderSplits?.[group] || [];

    // percentile: high = good regardless of whether stat is higher-is-better or lower-is-better
    const _pct = (key, playerVal, desc = true, minGP = 20) => {
        const pv = parseFloat(playerVal);
        if (isNaN(pv)) return null;
        const vals = allSplits
            .filter(s => (s.stat?.gamesPlayed ?? 0) >= minGP)
            .map(s => parseFloat(s.stat?.[key]))
            .filter(v => !isNaN(v));
        if (vals.length < 10) return null;
        const count = vals.filter(v => desc ? v <= pv : v >= pv).length;
        return Math.round(count / vals.length * 100);
    };

    const _bar = pct => {
        if (pct == null) return '<span class="scout-bar scout-bar--na">—</span>';
        const filled = Math.min(10, Math.round(pct / 10));
        const cls = pct >= 80 ? 'scout-bar--elite'
                  : pct >= 60 ? 'scout-bar--good'
                  : pct >= 40 ? 'scout-bar--avg'
                  : pct >= 20 ? 'scout-bar--weak'
                  :             'scout-bar--poor';
        return `<span class="scout-bar ${cls}">${'█'.repeat(filled)}${'░'.repeat(10 - filled)}</span>`;
    };

    const _grade = pct => {
        if (pct == null) return { label: '—',         cls: '' };
        if (pct >= 90)   return { label: 'Elite',      cls: 'scout-grade--elite' };
        if (pct >= 75)   return { label: 'Strong',     cls: 'scout-grade--good'  };
        if (pct >= 55)   return { label: 'Above Avg',  cls: 'scout-grade--above' };
        if (pct >= 45)   return { label: 'Average',    cls: 'scout-grade--avg'   };
        if (pct >= 25)   return { label: 'Below Avg',  cls: 'scout-grade--below' };
        return                   { label: 'Poor',       cls: 'scout-grade--poor'  };
    };

    const _row = (category, pct, detail) => {
        const g = _grade(pct);
        return `
            <div class="scout-metric-row">
                <span class="scout-cat">${category}</span>
                ${_bar(pct)}
                <span class="scout-pct">${pct != null ? pct + 'th' : '—'}</span>
                <span class="scout-grade ${g.cls}">${g.label}</span>
                <span class="scout-detail">${detail}</span>
            </div>`;
    };

    let rows = '';
    const phrases = [];
    const gp = stats.gamesPlayed ?? 0;

    if (group === 'hitting') {
        const opsPct  = _pct('ops',          stats.ops,      true);
        const isoPct  = _pct('iso',          computed.iso,   true);
        const avgPct  = _pct('avg',          stats.avg,      true);
        const kPct    = _pct('kPct',         computed.kPct,  false); // lower K% = better
        const bbPct   = _pct('bbPct',        computed.bbPct, true);
        const sbPct   = _pct('stolenBases',  stats.stolenBases, true, 0);

        const isoFmt  = computed.iso  ? `${computed.iso} ISO` : '';
        const kFmt    = computed.kPct ? `${computed.kPct}% K` : '';
        const bbFmt   = computed.bbPct ? `${computed.bbPct}% BB` : '';

        rows += _row('OPS',          opsPct, stats.ops  || '—');
        rows += _row('Power (ISO)',  isoPct, [isoFmt, `${stats.homeRuns ?? '—'} HR`].filter(Boolean).join(' · '));
        rows += _row('Contact',      avgPct, [stats.avg || '—', kFmt].filter(Boolean).join(' AVG · '));
        rows += _row('Plate Disc.',  bbPct,  [stats.obp || '—', bbFmt].filter(Boolean).join(' OBP · '));
        if (stats.stolenBases != null) rows += _row('Speed', sbPct, `${stats.stolenBases} SB`);

        if (opsPct != null) phrases.push(opsPct >= 75 ? `elite offensive profile (${opsPct}th pctile OPS)` : opsPct >= 55 ? `above-average bat (${opsPct}th pctile OPS)` : `below-average offense (${opsPct}th pctile OPS)`);
        if (isoPct != null && isoPct >= 75) phrases.push('plus raw power');
        if (kPct   != null && kPct   < 35)  phrases.push(`elevated strikeout rate (${kPct}th pctile K%)`);
        if (bbPct  != null && bbPct  >= 75)  phrases.push('excellent plate discipline');

    } else {
        const eraPct  = _pct('era',               stats.era,                false);
        const fipPct  = _pct('fip',               computed.fip,             false);
        const k9Pct   = _pct('strikeoutsPer9Inn', stats.strikeoutsPer9Inn,  true);
        const whipPct = _pct('whip',              stats.whip,               false);
        const kbbPct  = _pct('kBbPct',            computed.kBbPct,          true);
        const ipPct   = _pct('inningsPitched',    parseFloat(stats.inningsPitched || 0), true, 5);

        const k9Fmt  = stats.strikeoutsPer9Inn ? `${parseFloat(stats.strikeoutsPer9Inn).toFixed(1)} K/9` : '';
        const bb9Fmt = stats.walksPer9Inn      ? `${parseFloat(stats.walksPer9Inn).toFixed(1)} BB/9`     : '';

        rows += _row('ERA',          eraPct,  stats.era || '—');
        rows += _row('Stuff (K/9)',  k9Pct,   [k9Fmt, `${stats.strikeOuts ?? '—'} K`].filter(Boolean).join(' · '));
        rows += _row('Control',      whipPct, [stats.whip || '—', bb9Fmt].filter(Boolean).join(' WHIP · '));
        rows += _row('K-BB%',        kbbPct,  computed.kBbPct != null ? `${computed.kBbPct}%` : '—');
        rows += _row('Durability',   ipPct,   `${stats.inningsPitched || '—'} IP · ${stats.gamesStarted ?? stats.gamesPlayed ?? '—'} GS`);

        if (eraPct != null) phrases.push(eraPct >= 75 ? `elite ERA (${eraPct}th pctile)` : eraPct >= 55 ? `above-average ERA (${eraPct}th pctile)` : `below-average ERA (${eraPct}th pctile)`);
        if (k9Pct  != null && k9Pct  >= 75) phrases.push('swing-and-miss stuff');
        if (whipPct != null && whipPct < 35) phrases.push('control concerns (WHIP)');
        if (kbbPct  != null && kbbPct >= 75) phrases.push('excellent command differential');
    }

    const summary = phrases.length
        ? `${player.fullName} profiles as ${phrases.join('; ')}.`
        : `${player.fullName} · ${MLB_SEASON} MLB season stats.`;

    const sampleWarn = gp < 20
        ? `<span class="scout-warn"> · small sample (${gp} GP)</span>` : '';

    return `
        <div class="scout-report">
            <div class="scout-hdr">
                <span class="scout-title">Scouting Report</span>
                <span class="scout-meta">${_escHtml(player.teamAbbr || '')} · ${group === 'hitting' ? 'Batter' : 'Pitcher'} · ${MLB_SEASON}${sampleWarn}</span>
            </div>
            <div class="scout-col-hdr">
                <span>Category</span><span>Percentile</span><span></span><span>Grade</span><span>Stats</span>
            </div>
            <div class="scout-rows">${rows}</div>
            <p class="scout-summary">"${_escHtml(summary)}"</p>
            <p class="scout-footnote">Percentile vs qualified MLB ${group === 'hitting' ? 'hitters (min 20 GP)' : 'pitchers (min 20 GP)'}  ·  ${MLB_SEASON} season</p>
        </div>`;
}

// ── Share helpers ─────────────────────────────────────────────

function _shareCurrentPage() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ url, title: document.title }).catch(() => {});
    } else {
        navigator.clipboard?.writeText(url).then(() => {
            if (typeof ErrorHandler !== 'undefined') ErrorHandler.toast('Link copied', 'success');
        });
    }
}
window._shareCurrentPage = _shareCurrentPage;

function _downloadMLBCard(playerId, group) {
    const player = (AppState.mlbPlayers?.[group] || []).find(p => p.id === playerId);
    const stats  = AppState.mlbPlayerStats?.[group]?.[playerId];
    if (!player || !stats) return;
    const colors = getMLBTeamColors(player.teamAbbr);
    StatsCharts.downloadShareCard(player, stats, group, colors);
}

// ── Game Prep View (ANN-001) ──────────────────────────────────

async function displayGamePrep() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;';

    grid.innerHTML = `
        <div class="prep-page-wrap">
            <h1 class="prep-page-title">Game Prep</h1>
            <p class="prep-page-sub">Select a game to generate a broadcast prep sheet</p>
            <div class="skeleton-line" style="height:80px;border-radius:12px;margin-bottom:0.75rem"></div>
            <div class="skeleton-line" style="height:80px;border-radius:12px;margin-bottom:0.75rem"></div>
            <div class="skeleton-line" style="height:80px;border-radius:12px"></div>
        </div>
    `;

    const todayStr = _mlbDateString(0);
    let games;
    try {
        const data = await mlbFetch('/schedule', {
            sportId:  1,
            date:     todayStr,
            hydrate:  'team,probablePitcher,linescore',
            gameType: 'R,F,D,L,W',
        }, ApiCache.TTL.SHORT);
        games = (data.dates || []).flatMap(d => d.games || []);
    } catch (err) {
        Logger.warn('Game prep schedule fetch failed', err, 'MLB');
        grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${ErrorHandler.EMPTY_GLYPH}</div><p class="empty-state-title">Could not load today's schedule</p><button class="btn-ghost" style="margin-top:0.75rem" onclick="displayGamePrep()">Try again</button></div>`;
        return;
    }

    if (!games.length) {
        grid.innerHTML = `<div class="prep-page-wrap"><h1 class="prep-page-title">Game Prep</h1><div class="empty-state"><div class="empty-state-icon">${ErrorHandler.EMPTY_GLYPH}</div><p class="empty-state-title">No games scheduled today</p><p style="color:var(--text-muted);font-size:0.85rem">${todayStr}</p></div></div>`;
        return;
    }

    const cards = games.map(g => {
        const away      = g.teams?.away;
        const home      = g.teams?.home;
        const awayAbbr  = away?.team?.abbreviation || '???';
        const homeAbbr  = home?.team?.abbreviation || '???';
        const awayClr   = getMLBTeamColors(awayAbbr);
        const homeClr   = getMLBTeamColors(homeAbbr);
        const awayLogo  = away?.team?.id ? getMLBTeamLogoUrl(away.team.id) : '';
        const homeLogo  = home?.team?.id ? getMLBTeamLogoUrl(home.team.id) : '';
        const awayPP    = away?.probablePitcher;
        const homePP    = home?.probablePitcher;
        const awayRec   = away?.leagueRecord ? `${away.leagueRecord.wins}-${away.leagueRecord.losses}` : '';
        const homeRec   = home?.leagueRecord ? `${home.leagueRecord.wins}-${home.leagueRecord.losses}` : '';
        const status    = g.status?.abstractGameState;
        const gameTime  = g.gameDate ? new Date(g.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }) : '';
        const statusTxt = status === 'Live' ? 'LIVE' : status === 'Final' ? 'Final' : gameTime;

        return `
            <button class="prep-game-card" onclick="_openGamePrepSheet(${g.gamePk},${away?.team?.id},${home?.team?.id},${awayPP?.id || 'null'},${homePP?.id || 'null'})">
                <div class="prep-gc-team">
                    ${awayLogo ? `<img src="${awayLogo}" alt="${awayAbbr}" class="prep-gc-logo" loading="lazy" data-hide-on-error>` : ''}
                    <div class="prep-gc-info">
                        <span class="prep-gc-side">Away</span>
                        <span class="prep-gc-abbr" style="color:${awayClr.primary}">${awayAbbr}</span>
                        <span class="prep-gc-rec">${awayRec}</span>
                        <span class="prep-gc-pitcher">P: ${_escHtml(awayPP?.fullName || 'TBD')}</span>
                    </div>
                </div>
                <div class="prep-gc-mid">
                    <span class="prep-gc-at">@</span>
                    <span class="prep-gc-status">${statusTxt}</span>
                    <span class="prep-gc-cta">Prep →</span>
                </div>
                <div class="prep-gc-team prep-gc-team--home">
                    <div class="prep-gc-info prep-gc-info--home">
                        <span class="prep-gc-side">Home</span>
                        <span class="prep-gc-abbr" style="color:${homeClr.primary}">${homeAbbr}</span>
                        <span class="prep-gc-rec">${homeRec}</span>
                        <span class="prep-gc-pitcher">P: ${_escHtml(homePP?.fullName || 'TBD')}</span>
                    </div>
                    ${homeLogo ? `<img src="${homeLogo}" alt="${homeAbbr}" class="prep-gc-logo" loading="lazy" data-hide-on-error>` : ''}
                </div>
            </button>
        `;
    }).join('');

    grid.innerHTML = `
        <div class="prep-page-wrap">
            <h1 class="prep-page-title">Game Prep</h1>
            <p class="prep-page-sub">Select a game · ${todayStr}</p>
            <div class="prep-game-list">${cards}</div>
        </div>
    `;
}

async function _openGamePrepSheet(gamePk, awayTeamId, homeTeamId, awayPitcherId, homePitcherId) {
    const grid = document.getElementById('playersGrid');
    grid.innerHTML = `
        <div class="prep-sheet">
            <div class="prep-sheet-toolbar no-print">
                <button class="back-button" onclick="displayGamePrep()">← All Games</button>
            </div>
            <div class="skeleton-line" style="height:120px;border-radius:16px;margin-bottom:1rem"></div>
            <div class="skeleton-line" style="height:160px;border-radius:12px;margin-bottom:1rem"></div>
            <div class="skeleton-line" style="height:200px;border-radius:12px;margin-bottom:1rem"></div>
            <div class="skeleton-line" style="height:200px;border-radius:12px"></div>
        </div>
    `;

    // Parallel fetches — include probable pitcher stats if not already in AppState
    const _needsPP = id => id && !AppState.mlbPlayerStats?.pitching?.[id];
    const [gameRes, awayBatRes, awayPitRes, homeBatRes, homePitRes, awayPPRes, homePPRes, awayPlayersRes, homePlayersRes, awaySplitsRes, homeSplitsRes] = await Promise.allSettled([
        mlbFetch(`/game/${gamePk}/feed/live`, {}, ApiCache.TTL.SHORT, MLB_BASE_URL_V11),
        mlbFetch(`/teams/${awayTeamId}/stats`, { stats: 'season', group: 'hitting',  season: MLB_SEASON }, ApiCache.TTL.MEDIUM),
        mlbFetch(`/teams/${awayTeamId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM),
        mlbFetch(`/teams/${homeTeamId}/stats`, { stats: 'season', group: 'hitting',  season: MLB_SEASON }, ApiCache.TTL.MEDIUM),
        mlbFetch(`/teams/${homeTeamId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM),
        _needsPP(awayPitcherId) ? mlbFetch(`/people/${awayPitcherId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM) : Promise.resolve(null),
        _needsPP(homePitcherId) ? mlbFetch(`/people/${homePitcherId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM) : Promise.resolve(null),
        mlbFetch('/stats', { stats: 'season', group: 'hitting', sportId: 1, season: MLB_SEASON, teamId: awayTeamId }, ApiCache.TTL.MEDIUM),
        mlbFetch('/stats', { stats: 'season', group: 'hitting', sportId: 1, season: MLB_SEASON, teamId: homeTeamId }, ApiCache.TTL.MEDIUM),
        mlbFetch('/stats', { stats: 'statSplits', group: 'hitting', sportId: 1, season: MLB_SEASON, teamId: awayTeamId, sitCodes: 'vl,vr' }, ApiCache.TTL.MEDIUM),
        mlbFetch('/stats', { stats: 'statSplits', group: 'hitting', sportId: 1, season: MLB_SEASON, teamId: homeTeamId, sitCodes: 'vl,vr' }, ApiCache.TTL.MEDIUM),
    ]);

    // Cache fetched pitcher stats into AppState so _pitcherCard can find them
    const _cachePPStats = (id, res) => {
        if (!id || res.status !== 'fulfilled' || !res.value) return;
        const stat = res.value?.stats?.[0]?.splits?.[0]?.stat;
        if (stat) {
            if (!AppState.mlbPlayerStats.pitching) AppState.mlbPlayerStats.pitching = {};
            AppState.mlbPlayerStats.pitching[id] = stat;
        }
    };
    _cachePPStats(awayPitcherId, awayPPRes);
    _cachePPStats(homePitcherId, homePPRes);

    const gameData   = gameRes.status === 'fulfilled' ? gameRes.value : {};
    const gameInfo   = gameData?.gameData || {};
    const awayTeam   = gameInfo?.teams?.away || {};
    const homeTeam   = gameInfo?.teams?.home || {};
    const awayAbbr   = awayTeam?.abbreviation || '???';
    const homeAbbr   = homeTeam?.abbreviation || '???';
    const awayClr    = getMLBTeamColors(awayAbbr);
    const homeClr    = getMLBTeamColors(homeAbbr);
    const awayLogo   = awayTeamId ? getMLBTeamLogoUrl(awayTeamId) : '';
    const homeLogo   = homeTeamId ? getMLBTeamLogoUrl(homeTeamId) : '';
    const venue      = gameInfo?.venue?.name || '';
    const gameDate   = gameInfo?.datetime?.dateTime;
    const dateFmt    = gameDate ? new Date(gameDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' }) : '';
    const timeFmt    = gameDate ? new Date(gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }) : '';
    const awayPPInfo = gameInfo?.probablePitchers?.away;
    const homePPInfo = gameInfo?.probablePitchers?.home;

    const _teamStat = res => (res.status === 'fulfilled' ? res.value?.stats?.[0]?.splits?.[0]?.stat : null) || {};
    const _playerSplits = res => (res.status === 'fulfilled' ? res.value?.stats?.[0]?.splits || [] : []);
    const awayBat = _teamStat(awayBatRes);
    const homeBat = _teamStat(homeBatRes);
    const awayPit = _teamStat(awayPitRes);
    const homePit = _teamStat(homePitRes);
    const awayPlayerSplits = _playerSplits(awayPlayersRes);
    const homePlayerSplits = _playerSplits(homePlayersRes);

    // Handedness splits: sitCode 'vl' = vs LHP, 'vr' = vs RHP
    const _handSplit = (res, code) => {
        if (res.status !== 'fulfilled') return null;
        const splits = (res.value?.stats || []).flatMap(s => s.splits || []);
        const match  = splits.find(s => s.split?.code === code);
        return match?.stat || null;
    };
    const awayHandSplits = { vl: _handSplit(awaySplitsRes, 'vl'), vr: _handSplit(awaySplitsRes, 'vr') };
    const homeHandSplits = { vl: _handSplit(homeSplitsRes, 'vl'), vr: _handSplit(homeSplitsRes, 'vr') };

    // pitcher handedness from game feed (R/L); default to R when unknown
    const awayHand = awayPPInfo?.pitchHand?.code || (awayPitcherId ? 'R' : null);
    const homeHand = homePPInfo?.pitchHand?.code || (homePitcherId ? 'R' : null);

    const _fmt  = (v, d = 2) => v != null ? parseFloat(v).toFixed(d) : '—';
    const _lead = v => v != null ? parseFloat(v).toFixed(3).replace(/^0\./, '.') : '—';

    const _handSection = () => {
        if (!awayHand && !homeHand) return '';
        const awayFacing = homeHand === 'L' ? 'vl' : 'vr';
        const homeFacing = awayHand === 'L' ? 'vl' : 'vr';
        const awaySplit  = awayHandSplits[awayFacing];
        const homeSplit  = homeHandSplits[homeFacing];
        const awayLabel  = homeHand ? `vs ${homeHand}HP` : '—';
        const homeLabel  = awayHand ? `vs ${awayHand}HP` : '—';
        const _s = (split, key, d) => split?.[key] != null ? parseFloat(split[key]).toFixed(d).replace(/^0\./, '.') : '—';
        const row = (aw, lbl, hm) => `
            <div class="prep-cmp-row">
                <span class="prep-cmp-val">${aw}</span>
                <span class="prep-cmp-lbl">${lbl}</span>
                <span class="prep-cmp-val" style="text-align:right">${hm}</span>
            </div>`;
        return `
            <div class="prep-section">
                <div class="prep-section-title">Handedness Splits</div>
                <div class="prep-cmp-header">
                    <span class="prep-cmp-team-lbl" style="color:${awayClr.primary}">${awayAbbr} <span class="prep-hand-badge">${awayLabel}</span></span>
                    <span></span>
                    <span class="prep-cmp-team-lbl" style="color:${homeClr.primary};text-align:right">${homeAbbr} <span class="prep-hand-badge">${homeLabel}</span></span>
                </div>
                ${row(_s(awaySplit,'avg',3), 'AVG', _s(homeSplit,'avg',3))}
                ${row(_s(awaySplit,'obp',3), 'OBP', _s(homeSplit,'obp',3))}
                ${row(_s(awaySplit,'slg',3), 'SLG', _s(homeSplit,'slg',3))}
                ${row(_s(awaySplit,'ops',3), 'OPS', _s(homeSplit,'ops',3))}
                ${row(_s(awaySplit,'homeRuns',0), 'HR', _s(homeSplit,'homeRuns',0))}
                ${row(_s(awaySplit,'strikeOuts',0), 'K', _s(homeSplit,'strikeOuts',0))}
                <p class="prep-hand-note">Lineup OPS facing ${homeHand === 'L' ? 'lefty' : 'righty'} / ${awayHand === 'L' ? 'lefty' : 'righty'} starters · ${MLB_SEASON} season</p>
            </div>`;
    };

    const _pitcherCard = (ppInfo, fallbackId) => {
        const info    = ppInfo || {};
        const pid     = info.id || fallbackId;
        const name    = info.fullName || (pid ? 'Probable Pitcher' : 'TBD');
        const pStats  = AppState.mlbPlayerStats?.pitching?.[pid] || {};
        const hs      = pid ? getMLBPlayerHeadshotUrl(pid) : '';
        const avatar  = hs
            ? `<img src="${hs}" alt="${_escHtml(name)}" class="prep-pp-hs" loading="lazy" data-hide-on-error>`
            : `<div class="prep-pp-avatar">${_escHtml((name[0] || '?').toUpperCase())}</div>`;
        const wins   = pStats.wins   ?? '—';
        const losses = pStats.losses ?? '—';
        const rec    = wins !== '—' ? `${wins}-${losses}` : '';
        const ip     = parseFloat(pStats.inningsPitched || 0);
        const fip    = ip > 0 && pStats.homeRuns != null
            ? ((13 * (pStats.homeRuns || 0) + 3 * (pStats.baseOnBalls || 0) - 2 * (pStats.strikeOuts || 0)) / ip + 3.10).toFixed(2)
            : '—';
        const bb9    = ip > 0 && pStats.baseOnBalls != null
            ? ((pStats.baseOnBalls || 0) / ip * 9).toFixed(1)
            : '—';
        const qs     = pStats.qualityStarts ?? '—';
        return `
            <div class="prep-pp-card">
                <div class="prep-pp-top">
                    ${avatar}
                    <div>
                        <div class="prep-pp-name">${_escHtml(name)}</div>
                        ${rec ? `<div class="prep-pp-rec">${rec}</div>` : ''}
                    </div>
                </div>
                <div class="prep-pp-stats">
                    <div class="prep-pp-stat"><span class="prep-pp-val">${_fmt(pStats.era, 2)}</span><span class="prep-pp-lbl">ERA</span></div>
                    <div class="prep-pp-stat"><span class="prep-pp-val">${fip}</span><span class="prep-pp-lbl">FIP</span></div>
                    <div class="prep-pp-stat"><span class="prep-pp-val">${_fmt(pStats.whip, 2)}</span><span class="prep-pp-lbl">WHIP</span></div>
                    <div class="prep-pp-stat"><span class="prep-pp-val">${pStats.strikeoutsPer9Inn ? _fmt(pStats.strikeoutsPer9Inn, 1) : '—'}</span><span class="prep-pp-lbl">K/9</span></div>
                    <div class="prep-pp-stat"><span class="prep-pp-val">${bb9}</span><span class="prep-pp-lbl">BB/9</span></div>
                    <div class="prep-pp-stat"><span class="prep-pp-val">${pStats.strikeOuts ?? '—'}</span><span class="prep-pp-lbl">K</span></div>
                    <div class="prep-pp-stat"><span class="prep-pp-val">${pStats.inningsPitched ?? '—'}</span><span class="prep-pp-lbl">IP</span></div>
                    ${qs !== '—' ? `<div class="prep-pp-stat"><span class="prep-pp-val">${qs}</span><span class="prep-pp-lbl">QS</span></div>` : ''}
                </div>
            </div>
        `;
    };

    const _cmpRow = (awayVal, lbl, homeVal, highlight = false, lowerBetter = false) => {
        const cls = highlight ? ' prep-cmp-row--highlight' : '';
        const av  = parseFloat(awayVal);
        const hv  = parseFloat(homeVal);
        const valid = !isNaN(av) && !isNaN(hv) && av !== hv;
        const awayWin = valid && (lowerBetter ? av < hv : av > hv);
        const homeWin = valid && (lowerBetter ? hv < av : hv > av);
        return `
            <div class="prep-cmp-row${cls}">
                <span class="prep-cmp-val${awayWin ? ' prep-cmp-winner' : ''}">${awayVal}</span>
                <span class="prep-cmp-lbl">${lbl}</span>
                <span class="prep-cmp-val${homeWin ? ' prep-cmp-winner' : ''}">${homeVal}</span>
            </div>
        `;
    };

    // Park factor badge for the home venue
    const pf = _PARK_FACTORS[homeTeamId];
    const pfBadge = pf > 1.05
        ? `<span class="prep-park-badge prep-park-badge--hit" title="Hitter-friendly park (PF ${pf.toFixed(2)})">Park +</span>`
        : pf < 0.95
        ? `<span class="prep-park-badge prep-park-badge--pit" title="Pitcher-friendly park (PF ${pf.toFixed(2)})">Park −</span>`
        : '';

    const _keyHitters = (splits) => {
        const top = (splits || [])
            .filter(s => s.player?.id && parseFloat(s.stat?.ops || 0) > 0 && (s.stat?.atBats || 0) >= 20)
            .sort((a, b) => parseFloat(b.stat?.ops || 0) - parseFloat(a.stat?.ops || 0))
            .slice(0, 5);

        if (!top.length) return `<p class="prep-no-hitters">Stats unavailable</p>`;

        return top.map(({ player: p, stat: s, position: pos }) => {
            const hs  = getMLBPlayerHeadshotUrl(p.id);
            const img = hs
                ? `<img src="${hs}" alt="" class="prep-hitter-hs" loading="lazy" data-hide-on-error>`
                : `<div class="prep-hitter-init">${_escHtml((p.fullName || '?')[0])}</div>`;
            const iso = s.slg && s.avg ? (parseFloat(s.slg) - parseFloat(s.avg)).toFixed(3).replace(/^0\./, '.') : '—';
            return `
                <div class="prep-hitter-row" onclick="showMLBPlayerDetail(${p.id},'hitting')" role="button" tabindex="0">
                    ${img}
                    <div class="prep-hitter-info">
                        <span class="prep-hitter-name">${_escHtml(p.fullName || '—')}${pfBadge}</span>
                        <span class="prep-hitter-pos">${_escHtml(pos?.abbreviation || '')}</span>
                    </div>
                    <div class="prep-hitter-stats">
                        <span>${s.avg || '.000'}</span>
                        <span>${s.homeRuns ?? '—'} HR</span>
                        <span>${s.ops || '.000'} OPS</span>
                        <span class="prep-hitter-iso">${iso} ISO</span>
                    </div>
                </div>
            `;
        }).join('');
    };

    const awayRec = awayTeam?.record ? `${awayTeam.record.wins}–${awayTeam.record.losses}` : '';
    const homeRec = homeTeam?.record ? `${homeTeam.record.wins}–${homeTeam.record.losses}` : '';

    // Enrich from standings if loaded
    const awaySt = _standingsTeam(awayTeamId);
    const homeSt = _standingsTeam(homeTeamId);
    const _formBadge = st => {
        if (!st) return '';
        const parts = [];
        if (st.streak) {
            const isW = st.streak.startsWith('W');
            parts.push(`<span class="prep-form-badge prep-form-badge--${isW ? 'w' : 'l'}">${_escHtml(st.streak)}</span>`);
        }
        if (st.rdiff && st.rdiff !== '—') {
            const pos = st.rdiff.startsWith('+');
            parts.push(`<span class="prep-form-badge prep-form-badge--${pos ? 'pos' : 'neg'}" title="Run differential">${_escHtml(st.rdiff)} R</span>`);
        }
        if (st.home) parts.push(`<span class="prep-form-tag" title="Home record">Home ${st.home}</span>`);
        if (st.away) parts.push(`<span class="prep-form-tag" title="Away record">Away ${st.away}</span>`);
        return parts.length ? `<div class="prep-form-strip">${parts.join('')}</div>` : '';
    };

    grid.innerHTML = `
        <div class="prep-sheet">
            <div class="prep-sheet-toolbar no-print">
                <button class="back-button" onclick="displayGamePrep()">← All Games</button>
                <button class="prep-print-btn" onclick="window.print()">Print</button>
            </div>

            <div class="prep-matchup-hdr">
                <div class="prep-mh-team" style="border-left:4px solid ${awayClr.primary}">
                    ${awayLogo ? `<img src="${awayLogo}" alt="${awayAbbr}" class="prep-mh-logo" loading="lazy" data-hide-on-error>` : ''}
                    <div>
                        <div class="prep-mh-side">Away</div>
                        <div class="prep-mh-city">${_escHtml(awayTeam.locationName || '')}</div>
                        <div class="prep-mh-name">${_escHtml(awayTeam.teamName || awayAbbr)}</div>
                        <div class="prep-mh-rec">${awayRec}</div>
                        ${_formBadge(awaySt)}
                    </div>
                </div>
                <div class="prep-mh-center">
                    <div class="prep-mh-vs">@</div>
                    <div class="prep-mh-time">${timeFmt}</div>
                    <div class="prep-mh-venue">${_escHtml(venue)}</div>
                    <div class="prep-mh-date">${dateFmt}</div>
                    <div class="game-weather prep-weather" data-weather-team="${homeTeamId}"></div>
                </div>
                <div class="prep-mh-team prep-mh-team--home" style="border-right:4px solid ${homeClr.primary}">
                    <div class="prep-mh-team-info--home">
                        <div class="prep-mh-side">Home</div>
                        <div class="prep-mh-city">${_escHtml(homeTeam.locationName || '')}</div>
                        <div class="prep-mh-name">${_escHtml(homeTeam.teamName || homeAbbr)}</div>
                        <div class="prep-mh-rec">${homeRec}</div>
                        ${_formBadge(homeSt)}
                    </div>
                    ${homeLogo ? `<img src="${homeLogo}" alt="${homeAbbr}" class="prep-mh-logo" loading="lazy" data-hide-on-error>` : ''}
                </div>
            </div>

            <div class="prep-section">
                <div class="prep-section-title">Probable Pitchers</div>
                <div class="prep-two-col">
                    ${_pitcherCard(awayPPInfo, awayPitcherId)}
                    <div class="prep-divider"></div>
                    ${_pitcherCard(homePPInfo, homePitcherId)}
                </div>
            </div>

            <div class="prep-section">
                <div class="prep-section-title">Team Batting</div>
                <div class="prep-cmp-header">
                    <span class="prep-cmp-team-lbl" style="color:${awayClr.primary}">${awayAbbr}</span>
                    <span></span>
                    <span class="prep-cmp-team-lbl" style="color:${homeClr.primary}">${homeAbbr}</span>
                </div>
                ${_cmpRow(_lead(awayBat.avg),  'AVG',  _lead(homeBat.avg),  true)}
                ${_cmpRow(_lead(awayBat.obp),  'OBP',  _lead(homeBat.obp),  false)}
                ${_cmpRow(_lead(awayBat.slg),  'SLG',  _lead(homeBat.slg),  false)}
                ${_cmpRow(_lead(awayBat.ops),  'OPS',  _lead(homeBat.ops),  true)}
                ${(()=>{ const ai=awayBat.slg&&awayBat.avg?(parseFloat(awayBat.slg)-parseFloat(awayBat.avg)).toFixed(3).replace(/^0\./,'.'):'—'; const hi=homeBat.slg&&homeBat.avg?(parseFloat(homeBat.slg)-parseFloat(homeBat.avg)).toFixed(3).replace(/^0\./,'.'):'—'; return _cmpRow(ai,'ISO',hi); })()}
                ${_cmpRow(awayBat.babip || '—',       'BABIP', homeBat.babip || '—')}
                ${_cmpRow(awayBat.homeRuns ?? '—',    'HR',    homeBat.homeRuns ?? '—')}
                ${_cmpRow(awayBat.runs ?? '—',        'R',     homeBat.runs ?? '—')}
                ${_cmpRow(awayBat.stolenBases ?? '—', 'SB',    homeBat.stolenBases ?? '—')}
                ${_cmpRow(awayBat.strikeOuts ?? '—',  'K',     homeBat.strikeOuts ?? '—', false, true)}
            </div>

            <div class="prep-section">
                <div class="prep-section-title">Team Pitching</div>
                <div class="prep-cmp-header">
                    <span class="prep-cmp-team-lbl" style="color:${awayClr.primary}">${awayAbbr}</span>
                    <span></span>
                    <span class="prep-cmp-team-lbl" style="color:${homeClr.primary}">${homeAbbr}</span>
                </div>
                ${_cmpRow(_fmt(awayPit.era, 2),  'ERA',  _fmt(homePit.era, 2),  true, true)}
                ${(()=>{ const _fip = pit => { const ip=parseFloat(pit.inningsPitched||0); return ip>0&&pit.homeRuns!=null ? ((13*(pit.homeRuns||0)+3*(pit.baseOnBalls||0)-2*(pit.strikeOuts||0))/ip+3.10).toFixed(2) : '—'; }; return _cmpRow(_fip(awayPit),'FIP',_fip(homePit),false,true); })()}
                ${_cmpRow(_fmt(awayPit.whip, 2), 'WHIP', _fmt(homePit.whip, 2), false, true)}
                ${_cmpRow(awayPit.strikeoutsPer9Inn ? _fmt(awayPit.strikeoutsPer9Inn, 1) : '—', 'K/9', homePit.strikeoutsPer9Inn ? _fmt(homePit.strikeoutsPer9Inn, 1) : '—')}
                ${(()=>{ const _bb9 = pit => { const ip=parseFloat(pit.inningsPitched||0); return ip>0&&pit.baseOnBalls!=null ? ((pit.baseOnBalls||0)/ip*9).toFixed(1) : '—'; }; return _cmpRow(_bb9(awayPit),'BB/9',_bb9(homePit),false,true); })()}
                ${_cmpRow(awayPit.strikeOuts ?? '—', 'K',  homePit.strikeOuts ?? '—')}
                ${_cmpRow(awayPit.saves ?? '—',      'SV', homePit.saves ?? '—')}
            </div>

            <div class="prep-section" id="prep-bullpen-section">
                <div class="prep-section-title">Bullpen Availability</div>
                <div class="prep-bullpen-loading">
                    <div class="skeleton-line" style="height:20px;width:60%;margin-bottom:0.5rem"></div>
                    <div class="skeleton-line" style="height:20px;width:80%"></div>
                </div>
            </div>

            <div class="prep-section">
                <div class="prep-section-title">Key Hitters</div>
                <div class="prep-two-col">
                    <div class="prep-hitters-col">
                        <div class="prep-hitters-lbl" style="color:${awayClr.primary}">
                            ${awayLogo ? `<img src="${awayLogo}" alt="" style="width:16px;height:16px;object-fit:contain" loading="lazy" data-hide-on-error>` : ''}
                            ${awayAbbr}
                        </div>
                        ${_keyHitters(awayPlayerSplits)}
                    </div>
                    <div class="prep-divider"></div>
                    <div class="prep-hitters-col">
                        <div class="prep-hitters-lbl" style="color:${homeClr.primary}">
                            ${homeLogo ? `<img src="${homeLogo}" alt="" style="width:16px;height:16px;object-fit:contain" loading="lazy" data-hide-on-error>` : ''}
                            ${homeAbbr}
                        </div>
                        ${_keyHitters(homePlayerSplits)}
                    </div>
                </div>
            </div>

            ${_handSection()}
        </div>
    `;

    _injectGameWeather(grid);

    // Async: bullpen rest tracker (non-blocking, fills placeholder when ready)
    _populateBullpenSection(awayTeamId, homeTeamId, awayAbbr, homeAbbr, awayClr.primary, homeClr.primary);
}

async function _fetchBullpenRest(teamId) {
    const nowET = new Date(Date.now() - 5 * 3600000);
    const fmt   = d => d.toISOString().split('T')[0];
    const from  = new Date(nowET.getTime() - 4 * 24 * 3600000);
    const today = fmt(nowET);

    try {
        const sched = await mlbFetch('/schedule', {
            sportId: 1, teamId, startDate: fmt(from), endDate: today,
            hydrate: 'team', gameType: 'R,F,D,L,W',
        }, ApiCache.TTL.SHORT);

        const pks = (sched.dates || [])
            .flatMap(d => d.games || [])
            .filter(g => g.status?.abstractGameState === 'Final')
            .slice(-3)
            .map(g => ({ pk: g.gamePk, date: (g.gameDate || '').slice(0, 10), isHome: g.teams?.home?.team?.id === teamId }));

        if (!pks.length) return {};

        const restMap = {};
        await Promise.all(pks.map(async ({ pk, date, isHome }) => {
            const daysAgo = Math.round((new Date(today) - new Date(date)) / 86400000);
            try {
                const box = await mlbFetch(`/game/${pk}/boxscore`, {}, ApiCache.TTL.LONG);
                const side = isHome ? 'home' : 'away';
                const players = box.teams?.[side]?.players || {};
                for (const pd of Object.values(players)) {
                    const ip = parseFloat(pd.stats?.pitching?.inningsPitched || 0);
                    if (!ip || !pd.person?.id) continue;
                    const pid = pd.person.id;
                    if (!restMap[pid] || daysAgo < restMap[pid].daysAgo) {
                        restMap[pid] = {
                            name:   pd.person.fullName || '',
                            daysAgo,
                            ip,
                            pitches: pd.stats.pitching.numberOfPitches || 0,
                            gs:      pd.stats.pitching.gamesStarted || 0,
                        };
                    }
                }
            } catch (_) {}
        }));

        return restMap;
    } catch (_) { return {}; }
}

async function _populateBullpenSection(awayId, homeId, awayAbbr, homeAbbr, awayColor, homeColor) {
    const section = document.getElementById('prep-bullpen-section');
    if (!section) return;

    const [awayRest, homeRest] = await Promise.all([
        _fetchBullpenRest(awayId),
        _fetchBullpenRest(homeId),
    ]);

    const _restPill = (name, daysAgo) => {
        const [cls, label] = daysAgo === 0 ? ['bullpen-pill--hot',   'Yesterday']
                           : daysAgo === 1 ? ['bullpen-pill--warm',  '1 day rest']
                           : daysAgo === 2 ? ['bullpen-pill--ok',    '2 days rest']
                           :                 ['bullpen-pill--fresh', `${daysAgo}d rest`];
        const lastName = name.split(' ').slice(-1)[0] || name;
        return `<span class="bullpen-pill ${cls}" title="${name} — last pitched ${daysAgo === 0 ? 'yesterday' : daysAgo + ' days ago'}">${_escHtml(lastName)} <span class="bullpen-pill-rest">${label}</span></span>`;
    };

    const _renderSide = (restMap, abbr, color) => {
        // Only show relievers (gs === 0) used in last 3 days; sort by most recently used
        const used = Object.values(restMap)
            .filter(p => p.gs === 0 && p.daysAgo <= 3)
            .sort((a, b) => a.daysAgo - b.daysAgo);
        if (!used.length) return `<div class="bullpen-team-section"><span class="bullpen-abbr" style="color:${color}">${abbr}</span> <span class="bullpen-all-fresh">All fresh</span></div>`;
        return `<div class="bullpen-team-section"><span class="bullpen-abbr" style="color:${color}">${abbr}</span>${used.map(p => _restPill(p.name, p.daysAgo)).join('')}</div>`;
    };

    const hasData = Object.keys(awayRest).length || Object.keys(homeRest).length;
    if (!hasData) { section.remove(); return; }

    section.innerHTML = `
        <div class="prep-section-title">Bullpen Availability <span class="prep-section-note">last 3 days</span></div>
        ${_renderSide(awayRest, awayAbbr, awayColor)}
        ${_renderSide(homeRest, homeAbbr, homeColor)}
    `;
}

// ── Standalone Compare View ───────────────────────────────────

async function loadMLBCompare() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block';

    // Ensure player data is loaded
    if (!(AppState.mlbPlayers?.hitting?.length)) {
        grid.innerHTML = `<div class="cmp-page-wrap"><div class="skeleton-line" style="height:48px;border-radius:12px;margin-bottom:1rem"></div><div class="skeleton-line" style="height:300px;border-radius:12px"></div></div>`;
        await loadMLBPlayers();
    }

    _renderMLBCompareView(AppState.mlbStatsGroup);
}

function _renderMLBCompareView(group) {
    const grid = document.getElementById('playersGrid');
    const pool = AppState.mlbPlayers?.[group] || [];
    const sortKey = group === 'hitting' ? 'ops' : 'era';
    const sorted = [...pool].sort((a, b) => {
        const av = parseFloat(AppState.mlbPlayerStats?.[group]?.[a.id]?.[sortKey] ?? (group === 'hitting' ? 0 : 99));
        const bv = parseFloat(AppState.mlbPlayerStats?.[group]?.[b.id]?.[sortKey] ?? (group === 'hitting' ? 0 : 99));
        return group === 'hitting' ? bv - av : av - bv;
    });

    const opts = sorted.map(p =>
        `<option value="${p.id}">${_escHtml(p.fullName || '—')} · ${_escHtml(p.teamAbbr || '—')}</option>`
    ).join('');

    grid.innerHTML = `
        <div class="cmp-page-wrap">
            <div class="cmp-page-hdr">
                <h1 class="cmp-page-title">Player Compare</h1>
                <div class="cmp-group-toggle">
                    <button class="cmp-group-btn ${group === 'hitting' ? 'cmp-group-btn--active' : ''}"
                        onclick="_renderMLBCompareView('hitting')">Hitters</button>
                    <button class="cmp-group-btn ${group === 'pitching' ? 'cmp-group-btn--active' : ''}"
                        onclick="_renderMLBCompareView('pitching')">Pitchers</button>
                </div>
            </div>

            <div class="cmp-selects-row">
                <div class="cmp-player-slot" id="cmp-slot-a">
                    <label class="cmp-slot-label">Player A</label>
                    <select id="cmp-sel-a" class="cmp-select">
                        <option value="">— Select player —</option>
                        ${opts}
                    </select>
                </div>
                <div class="cmp-vs-badge">VS</div>
                <div class="cmp-player-slot" id="cmp-slot-b">
                    <label class="cmp-slot-label">Player B</label>
                    <select id="cmp-sel-b" class="cmp-select">
                        <option value="">— Select player —</option>
                        ${opts}
                    </select>
                </div>
            </div>

            <div id="cmp-results" class="cmp-results" style="display:none"></div>
        </div>
    `;

    const selA = document.getElementById('cmp-sel-a');
    const selB = document.getElementById('cmp-sel-b');
    const onChange = () => _updateMLBCompareResults(group);
    selA.addEventListener('change', onChange);
    selB.addEventListener('change', onChange);

    // Restore from URL hash: #mlb-compare-hitting-123-456
    const hash = location.hash.replace('#', '');
    const m = hash.match(/^mlb-compare-(hitting|pitching)-(\d+)-(\d+)$/);
    if (m && m[1] === group) {
        selA.value = m[2];
        selB.value = m[3];
        _updateMLBCompareResults(group);
    }
}

function _updateMLBCompareResults(group) {
    const selA = document.getElementById('cmp-sel-a');
    const selB = document.getElementById('cmp-sel-b');
    const results = document.getElementById('cmp-results');
    if (!selA || !selB || !results) return;

    const idA = parseInt(selA.value) || null;
    const idB = parseInt(selB.value) || null;
    if (!idA || !idB || idA === idB) { results.style.display = 'none'; return; }

    const playerA = (AppState.mlbPlayers?.[group] || []).find(p => p.id === idA);
    const playerB = (AppState.mlbPlayers?.[group] || []).find(p => p.id === idB);
    const statsA  = AppState.mlbPlayerStats?.[group]?.[idA];
    const statsB  = AppState.mlbPlayerStats?.[group]?.[idB];
    if (!playerA || !playerB || !statsA || !statsB) { results.style.display = 'none'; return; }

    const colA = getMLBTeamColors(playerA.teamAbbr);
    const colB = getMLBTeamColors(playerB.teamAbbr);

    // Update URL without navigation
    const cmpHash = `mlb-compare-${group}-${idA}-${idB}`;
    history.replaceState(null, '', `#${cmpHash}`);

    const statDefs = group === 'hitting' ? _MLB_CMP_HIT : _MLB_CMP_PIT;

    const _val = (stats, key, d, lead) => {
        const raw = parseFloat(stats?.[key]);
        if (isNaN(raw)) return null;
        const str = raw.toFixed(d);
        return lead ? str.replace(/^0\./, '.') : str;
    };

    // Stat bars
    const bars = statDefs.map(def => {
        const vA = parseFloat(statsA?.[def.key]);
        const vB = parseFloat(statsB?.[def.key]);
        const dispA = _val(statsA, def.key, def.d, def.lead) ?? '—';
        const dispB = _val(statsB, def.key, def.d, def.lead) ?? '—';
        if (isNaN(vA) && isNaN(vB)) return '';

        // Normalise to bar widths — for lower-is-better stats, invert
        const safeA = isNaN(vA) ? 0 : vA;
        const safeB = isNaN(vB) ? 0 : vB;
        const total = safeA + safeB;
        let pctA = total > 0 ? safeA / total * 100 : 50;
        let pctB = total > 0 ? safeB / total * 100 : 50;
        if (def.lower) { pctA = 100 - pctA; pctB = 100 - pctB; }
        pctA = Math.max(5, Math.min(95, pctA));
        pctB = Math.max(5, Math.min(95, pctB));

        const winA = def.lower ? safeA < safeB : safeA > safeB;
        const winB = def.lower ? safeB < safeA : safeB > safeA;

        return `
            <div class="cmp-bar-row">
                <span class="cmp-bar-val cmp-bar-val--a ${winA ? 'cmp-bar-val--win' : ''}"
                    style="${winA ? `color:${colA.primary}` : ''}">${dispA}</span>
                <div class="cmp-bar-track">
                    <div class="cmp-bar-fill cmp-bar-fill--a" style="width:${pctA}%;background:${colA.primary}88"></div>
                    <span class="cmp-bar-label">${def.label}</span>
                    <div class="cmp-bar-fill cmp-bar-fill--b" style="width:${pctB}%;background:${colB.primary}88"></div>
                </div>
                <span class="cmp-bar-val cmp-bar-val--b ${winB ? 'cmp-bar-val--win' : ''}"
                    style="${winB ? `color:${colB.primary}` : ''}">${dispB}</span>
            </div>`;
    }).join('');

    const hsA = getMLBPlayerHeadshotUrl(idA);
    const hsB = getMLBPlayerHeadshotUrl(idB);

    results.style.display = 'block';
    results.innerHTML = `
        <div class="cmp-players-hdr">
            <div class="cmp-player-hdr cmp-player-hdr--a" style="border-left:4px solid ${colA.primary}">
                ${hsA ? `<img src="${hsA}" alt="" class="cmp-hs" loading="lazy" data-hide-on-error>` : ''}
                <div>
                    <div class="cmp-player-name" style="color:${colA.primary}">${_escHtml(playerA.fullName)}</div>
                    <div class="cmp-player-meta">${_escHtml(playerA.teamAbbr || '')} · ${_escHtml(playerA.position || '')}</div>
                </div>
            </div>
            <button class="share-btn" id="cmp-share-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share
            </button>
            <div class="cmp-player-hdr cmp-player-hdr--b" style="border-right:4px solid ${colB.primary}">
                <div style="text-align:right">
                    <div class="cmp-player-name" style="color:${colB.primary}">${_escHtml(playerB.fullName)}</div>
                    <div class="cmp-player-meta">${_escHtml(playerB.teamAbbr || '')} · ${_escHtml(playerB.position || '')}</div>
                </div>
                ${hsB ? `<img src="${hsB}" alt="" class="cmp-hs" loading="lazy" data-hide-on-error>` : ''}
            </div>
        </div>

        <div class="cmp-bars-wrap">
            ${bars}
        </div>

        <div class="cmp-radar-wrap">
            <div style="position:relative;height:280px"><canvas id="cmp-standalone-radar"></canvas></div>
        </div>
    `;

    document.getElementById('cmp-share-btn')?.addEventListener('click', () => {
        const url = `${location.href.split('#')[0]}#${cmpHash}`;
        if (navigator.share) {
            navigator.share({ url, title: `${playerA.fullName} vs ${playerB.fullName}` }).catch(() => {});
        } else {
            navigator.clipboard?.writeText(url).then(() => ErrorHandler.toast('Link copied', 'success')).catch(() => {});
        }
    });

    requestAnimationFrame(() => {
        const _radarData = s => group === 'hitting' ? {
            avg: parseFloat(s.avg) || 0, homeRuns: s.homeRuns || 0, rbi: s.rbi || 0,
            obp: parseFloat(s.obp) || 0, slg: parseFloat(s.slg) || 0, stolenBases: s.stolenBases || 0,
        } : {
            era: parseFloat(s.era) || 0, k9: parseFloat(s.strikeoutsPer9Inn) || 0,
            bb9: parseFloat(s.walksPer9Inn) || 0, whip: parseFloat(s.whip) || 0,
            ip: parseFloat(s.inningsPitched) || 0,
        };
        StatsCharts.mlbRadar('cmp-standalone-radar', [
            { label: playerA.fullName, data: _radarData(statsA), color: colA.primary },
            { label: playerB.fullName, data: _radarData(statsB), color: colB.primary },
        ], group);
    });
}

window.loadMLBCompare          = loadMLBCompare;
window._renderMLBCompareView   = _renderMLBCompareView;
window._updateMLBCompareResults = _updateMLBCompareResults;

// ── State initialisation (runs immediately on script load) ────
Object.assign(AppState, {
    mlbTeams:              [],
    mlbPlayers:            { hitting: [], pitching: [] },
    mlbPlayerStats:        { hitting: {}, pitching: {} },
    mlbGames:              [],
    mlbStatsGroup:         'hitting',
    mlbPositionFilter:     'all',
    mlbSearchQuery:        '',
    mlbLeaderMinGP:        0,
    mlbLeaderPosition:     'all',
    mlbLeaderTeam:         'all',
    mlbLeaderSeason:       null,   // null = use MLB_SEASON default
    mlbLeaderSplits:       null,
    mlbStandings:          null,
    _mlbStandingsLeague:   'AL',
    _mlbTeamRecentGames:   {},
    _mlbTeamRosters:       {},
});

function setMLBSeason(year) { MLB_SEASON = year; _ensureWrcConstants(year); }

if (typeof window !== 'undefined') {
    window.MLB_SEASON              = MLB_SEASON;
    window.setMLBSeason            = setMLBSeason;
    window.fetchMLBLeagueStats     = fetchMLBLeagueStats;
    window.loadMLBPlayers          = loadMLBPlayers;
    window.displayMLBPlayers       = displayMLBPlayers;
    window.filterMLBPlayers        = filterMLBPlayers;
    window.setMLBPlayerView        = setMLBPlayerView;
    window.showMLBPlayerDetail     = showMLBPlayerDetail;
    window.backToMLBPlayers        = backToMLBPlayers;
    window.loadMLBGames            = loadMLBGames;
    window.displayMLBGames         = displayMLBGames;
    window.updateMLBTicker         = updateMLBTicker;
    window.loadMLBTeams            = loadMLBTeams;
    window.displayMLBTeams         = displayMLBTeams;
    window.showMLBTeamDetail       = showMLBTeamDetail;
    window.backToMLBTeams          = backToMLBTeams;
    window.loadMLBLeaderboards     = loadMLBLeaderboards;
    window.displayMLBLeaderboards  = displayMLBLeaderboards;
    window.loadMLBStandings          = loadMLBStandings;
    window.displayMLBStandings       = displayMLBStandings;
    window.displayMLBWildCard        = displayMLBWildCard;
    window.displayMLBPowerRankings   = displayMLBPowerRankings;
    window.displayMLBTransactions    = displayMLBTransactions;
    window.getMLBTeamColors        = getMLBTeamColors;
    window._renderMLBGroupToggle   = _renderMLBGroupToggle;
    window.displayGamePrep         = displayGamePrep;
    window._openGamePrepSheet      = _openGamePrepSheet;
    window._downloadMLBCard        = _downloadMLBCard;
    window._toggleMLBFav           = _toggleMLBFav;

    window._loadMLBH2H = async function(currentId, group) {
        const sel    = document.getElementById('mlb-h2h-select');
        const result = document.getElementById('mlb-h2h-result');
        const btn    = document.getElementById('mlb-h2h-btn');
        if (!sel || !result || !sel.value) return;

        const oppId    = parseInt(sel.value);
        const oppGroup = group === 'hitting' ? 'pitching' : 'hitting';
        const oppPlayer = (AppState.mlbPlayers?.[oppGroup] || []).find(p => p.id === oppId);
        const batterId  = group === 'hitting' ? currentId : oppId;
        const pitcherId = group === 'hitting' ? oppId : currentId;

        result.innerHTML = '<div class="skeleton-line" style="width:100%;height:48px;border-radius:8px;margin-top:1rem"></div>';
        if (btn) btn.disabled = true;

        const data = await _fetchMLBH2H(batterId, pitcherId);
        if (btn) btn.disabled = false;

        if (!data || data.pa === 0) {
            result.innerHTML = '<p class="h2h-empty">No matchup data found in last 5 seasons.</p>';
            return;
        }

        const avg = data.ab > 0 ? data.h / data.ab : null;
        const obpDen = data.ab + data.bb + data.hbp + data.sf;
        const obp = obpDen > 0 ? (data.h + data.bb + data.hbp) / obpDen : null;
        const fmt3 = v => v != null ? v.toFixed(3).replace(/^0\./, '.') : '—';

        const oppName = oppPlayer?.fullName || `Player ${oppId}`;
        const headshotUrl = getMLBPlayerHeadshotUrl(oppId);
        const headshotImg = headshotUrl
            ? `<img src="${headshotUrl}" alt="${_escHtml(oppName)}" class="h2h-opp-headshot" data-hide-on-error>`
            : '';

        const chips = [
            ['PA',  data.pa],
            ['AB',  data.ab],
            ['H',   data.h],
            ['HR',  data.hr],
            ['K',   data.k],
            ['BB',  data.bb],
            ['AVG', fmt3(avg)],
            ['OBP', fmt3(obp)],
        ].map(([lbl, val]) => `
            <div class="h2h-stat">
                <div class="h2h-stat-val">${val}</div>
                <div class="h2h-stat-lbl">${lbl}</div>
            </div>
        `).join('');

        result.innerHTML = `
            <div class="h2h-result">
                <div class="h2h-opp-hdr">
                    ${headshotImg}
                    <span class="h2h-opp-name">${_escHtml(oppName)}</span>
                    <span class="h2h-opp-team">${_escHtml(oppPlayer?.teamAbbr || '')}</span>
                    <span class="h2h-years">Last 5 seasons · regular season</span>
                </div>
                <div class="h2h-stats-row">${chips}</div>
            </div>
        `;
    };
}

// Init MLB favorites after AppState is available (mlb.js loads after navigation.js)
_initMLBFavs();

// Warm current-season wRC+ constants at boot so early stat computes use derived,
// not fallback, values (DAILY-cached; harmless no-op when a static entry exists)
if (typeof window !== 'undefined') _ensureWrcConstants();
