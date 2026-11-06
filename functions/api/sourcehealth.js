// D-196: GET /api/sourcehealth -- what ESPN tells this site's server right
// now, per source, through the same readSource() every server-side consumer
// uses. JSON rather than a page section: the contract monitor and the owner
// both read it, and it keeps eight upstream probes out of any reader's render.
//
// The answer is cached 60s at the edge so the endpoint can't be used to make
// this site hammer ESPN. Always HTTP 200: it's a report, and "ESPN is down"
// is a valid report, not an error in this endpoint.
import { readSource, ESPN_SITE, SCOREBOARD_PATH, SHAPES, TOLERANCE } from '../_espnSource.js';

const PROBES = [
    ...Object.entries(SCOREBOARD_PATH).map(([sport, p]) => [`scoreboard:${sport}`, `${ESPN_SITE}/${p}`, SHAPES.scoreboard]),
    ['standings:nfl', 'https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings?seasontype=2&level=3', SHAPES.standings],
    ['core:nfl', 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl', SHAPES.league],
    ['news:nfl', `${ESPN_SITE}/football/nfl/news`, SHAPES.news],
];

const ESPN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export async function probeAll(opts = {}) {
    const now = opts.now || Date.now();
    const results = await Promise.all(PROBES.map(async ([key, url, validate]) => {
        // No tolerance limit: report any last-good copy, however old, so its age shows.
        const src = await readSource(key, url, {
            ...opts, now, validate, maxStaleMs: Number.MAX_SAFE_INTEGER,
            init: { headers: { Accept: 'application/json', 'User-Agent': ESPN_UA } },
        });
        return {
            key,
            upstream: src.state === 'LIVE' ? 'LIVE' : 'DOWN',
            reason: src.reason,
            lastGoodAt: src.fetchedAt ? new Date(src.fetchedAt).toISOString() : null,
            lastGoodAgeMin: src.ageMs == null ? null : Math.round(src.ageMs / 60000),
        };
    }));
    const live = results.filter(r => r.upstream === 'LIVE').length;
    return {
        checkedAt: new Date(now).toISOString(),
        egress: 'cloudflare',
        overall: live === results.length ? 'LIVE' : live === 0 ? 'DOWN' : 'DEGRADED',
        note: 'Server-side reads only. Readers fetch ESPN from their own browser when these are DOWN (js/config.js _espnFetch), so DOWN here does not mean readers see nothing.',
        sources: results,
        toleranceMin: Object.fromEntries(Object.entries(TOLERANCE).map(([k, v]) => [k, v / 60000])),
    };
}

export async function onRequest(context) {
    const { request } = context;
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheKey = new Request(new URL('/api/sourcehealth', request.url).toString());
    if (cache) {
        const hit = await cache.match(cacheKey).catch(() => null);
        if (hit) return hit;
    }
    const body = await probeAll({ waitUntil: p => context.waitUntil(p) });
    const res = new Response(JSON.stringify(body, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' },
    });
    if (cache) context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
    return res;
}
