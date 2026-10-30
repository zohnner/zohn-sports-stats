// Shared SPA-shell helpers for the edge-rendered page templates (D-180).
//
// index.html references its assets relatively (css/main.css, js/app.js). Every
// template's success path rewrites those to root-absolute before serving, but
// the fail-safe path used to return index.html untouched -- so at a nested URL
// like /nfl/team/jax the browser requested /nfl/team/css/main.css, got the 404
// page back, and the reader saw an unstyled, script-less page. Nobody noticed
// until ESPN's block on Cloudflare (D-176) sent every ESPN-backed template down
// the fail-safe path at once. The fail-safe also carried no __SS_ROUTE, so even
// a working shell booted to home instead of the page the reader asked for.

const ASSET_REF = /\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g;

export function absolutize(html) {
    return html.replace(ASSET_REF, '$1="/');
}

// Raw index.html for a success path that injects its own head, snapshot and route.
export function rawShell(env, url) {
    return env.ASSETS.fetch(new URL('/index.html', url));
}

const SPORTS = new Set(['mlb', 'nfl', 'ncaaf', 'ncaab', 'wnba', 'nba']);
// Each value is the __SS_ROUTE that page's own template sets on success.
const SINGLE_VIEW = {
    'mlb/leaders': 'mlb-leaders', 'mlb/standings': 'mlb-standings',
    'nfl/leaders': 'nfl-leaders', 'nfl/standings': 'nfl-standings', 'nfl/pickem': 'nfl-pickem',
    'ncaaf/standings': 'ncaaf-standings', 'ncaaf/rankings': 'ncaaf-rankings',
    'ncaab/standings': 'ncaab-standings',
    'wnba/standings': 'wnba-standings', 'wnba/leaders': 'wnba-leaders',
    'nba/standings': 'nba-standings', 'nba/leaders': 'nba-leaders',
};
const ENTITY = [
    [/^nfl\/team\/([a-z]{2,4})$/i,          m => 'nfl-team-' + m[1].toUpperCase()],
    [/^nfl\/game\/(\d+)$/,                  m => 'nfl-game-' + m[1]],
    [/^nfl\/player\/([a-z0-9]+)$/i,         m => 'nfl-player-' + m[1]],
    [/^ncaaf\/(team|player|game)\/(\d+)$/,  m => `ncaaf-${m[1]}-${m[2]}`],
    [/^mlb\/game\/(\d+)$/,                  m => 'mlb-live-' + m[1]],
    [/^mlb\/player\/(\d+)$/,                m => 'mlb-player-' + m[1]],
    [/^(wnba|nba)\/player\/(\d+)$/,         m => `${m[1]}-player-${m[2]}`],
];

export function failSafeRoute(pathname) {
    const segs = String(pathname || '').split('/').filter(Boolean);
    if (segs.length === 1 && SPORTS.has(segs[0])) return segs[0] + '-home';
    const two = segs.slice(0, 2).join('/');
    if (segs.length === 2 && SINGLE_VIEW[two]) return SINGLE_VIEW[two];
    // Drop a trailing [[slug]] segment: /nfl/team/jax/jacksonville-jaguars.
    const key = segs.slice(0, 3).join('/');
    for (const [re, fn] of ENTITY) {
        const m = re.exec(key);
        if (m) return fn(m);
    }
    return null;
}

// index.html's canonical names the home page, so a fail-safe page must replace
// it with its own path (never the query string: every ?utm_ variant used to
// declare itself canonical).
export function setCanonical(html, canonical) {
    return html
        .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, `$1${canonical}$2`)
        .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, `$1${canonical}$2`);
}

// Fail-safe: a working SPA shell that boots to the view this URL names.
export async function shell(env, url) {
    const res = await rawShell(env, url);
    if (!res.ok) return res;
    let html = absolutize(await res.text());
    const { pathname } = new URL(url);
    html = setCanonical(html, `https://sportstrata.cc${pathname}`);
    const route = failSafeRoute(pathname);
    if (route) html = html.replace('</head>', `<script>window.__SS_ROUTE=${JSON.stringify(route)};</script></head>`);
    // Short TTL so the page returns to its full server render soon after the upstream recovers.
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
}
