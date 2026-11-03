// D-196: the one way server-side code reads ESPN (edge templates, the push
// Worker, /api/sourcehealth). Every read comes back LIVE, STALE or DOWN, with
// its age, instead of the silent null each caller used to invent for itself.
//
// ESPN refuses Cloudflare egress (D-176), so from here most reads are DOWN
// today. Snapshots are written only on a LIVE read, so STALE can only appear
// once ESPN answers again and then fails; until then this layer's job is to
// say DOWN out loud.
//
// Never use readSource inside an /api/* proxy. _espnFetch (js/config.js) takes
// any 2xx from a passthrough proxy as final, so a proxy serving a snapshot
// would keep readers on old data when their browser could fetch live ESPN.
//
// Import-free on purpose: tests load it with `export` stripped (see
// tests/espnSource.test.js), and worker/push-game-alerts.js bundles it.

export const ESPN_SITE = 'https://site.web.api.espn.com/apis/site/v2/sports';

// Shared by the home page and /api/sourcehealth so a LIVE health probe also
// refreshes the home page's last-good copy (same key, same URL).
export const SCOREBOARD_PATH = {
    nfl: 'football/nfl/scoreboard',
    ncaaf: 'football/college-football/scoreboard?groups=80',
    nba: 'basketball/nba/scoreboard',
    ncaab: 'basketball/mens-college-basketball/scoreboard?groups=50',
    wnba: 'basketball/wnba/scoreboard',
};

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

// How old a last-good copy each consumer will show. 0 means LIVE or nothing.
// Push alerts and Pick'em are 0: an alert or a confidence pick built on an old
// scoreboard can tell someone something false, and neither can label itself.
export const TOLERANCE = {
    push: 0,
    pickem: 0,
    scores: 15 * MIN,
    game: 30 * MIN,
    standings: DAY,
    leaders: DAY,
    rankings: 7 * DAY,
    team: 7 * DAY,
    player: 7 * DAY,
};

// Shape checks: a 200 that lacks what the caller reads is DOWN, not LIVE.
// An empty events array is a real answer (an off day), not a failure.
export const SHAPES = {
    scoreboard: b => Array.isArray(b.events) ? null : 'no events array',
    standings: b => Array.isArray(b.children) ? null : 'no children',
    leaders: b => Array.isArray(b.categories) ? null : 'no categories',
    summary: b => (b.header && Array.isArray(b.header.competitions)) ? null : 'no header.competitions',
    teams: b => Array.isArray(b.sports) ? null : 'no sports',
    team: b => b.team ? null : 'no team',
    rankings: b => Array.isArray(b.rankings) ? null : 'no rankings',
    athlete: b => typeof b.found === 'boolean' ? null : 'no found flag',
    coreAthlete: b => (b.fullName || b.displayName) ? null : 'no name',
    league: b => b.id ? null : 'no id',
    news: b => Array.isArray(b.articles) ? null : 'no articles',
};

// Pure: one upstream answer -> { data } or { reason }.
export function classify(status, text, validate) {
    if (!(status >= 200 && status <= 299)) return { reason: `HTTP ${status}` };
    let body;
    try { body = JSON.parse(text); } catch (_) { return { reason: `non-JSON body (HTTP ${status})` }; }
    if (!body || typeof body !== 'object') return { reason: 'empty body' };
    // Our own proxies wrap upstream failures in a 200: standings send
    // {ok:false, reason}, stats send {error}, athlete proxies {found:false,
    // reason:'upstream 403'}. A real "no such player" stays LIVE.
    const wrapped = body.ok === false || body.error
        || (body.found === false && /^upstream/i.test(String(body.reason || '')));
    if (wrapped) return { reason: `upstream error inside 200: ${String(body.reason || body.error).slice(0, 80)}` };
    const bad = validate ? validate(body) : null;
    if (bad) return { reason: `unexpected shape: ${bad}` };
    return { data: body };
}

const SNAP_HOST = 'https://espn-source.sportstrata.internal/';
const SNAP_KEEP_S = 8 * 24 * 3600;

// Last-good copies in the Cache API: free, no binding to configure, but
// per-data-center and evictable, so a missing snapshot is normal and just
// means DOWN. Returns null where the Cache API doesn't exist.
export function cacheStore() {
    const c = typeof caches !== 'undefined' && caches.default;
    if (!c) return null;
    const req = key => new Request(SNAP_HOST + encodeURIComponent(key));
    return {
        async get(key) { const r = await c.match(req(key)); return r ? r.json() : null; },
        async put(key, snap) {
            await c.put(req(key), new Response(JSON.stringify(snap), {
                headers: { 'content-type': 'application/json', 'cache-control': `max-age=${SNAP_KEEP_S}` },
            }));
        },
    };
}

// -> { state: 'LIVE'|'STALE'|'DOWN', data, fetchedAt, ageMs, reason }
// fetchedAt/ageMs describe the data returned (or, when DOWN, the newest
// last-good copy that was too old to use; null if there is none).
export async function readSource(key, url, opts = {}) {
    const { maxStaleMs, validate, init = {}, now = Date.now(), waitUntil } = opts;
    if (typeof maxStaleMs !== 'number') throw new Error(`readSource(${key}): maxStaleMs is required`);
    const store = 'store' in opts ? opts.store : cacheStore();
    const fetchImpl = opts.fetchImpl || fetch;

    let got;
    try {
        const r = await fetchImpl(url, init);
        got = classify(r.status, await r.text(), validate);
    } catch (e) {
        got = { reason: `network: ${String((e && e.message) || e).slice(0, 80)}` };
    }

    if (got.data !== undefined) {
        if (store) {
            const p = Promise.resolve().then(() => store.put(key, { data: got.data, fetchedAt: now })).catch(() => {});
            if (waitUntil) waitUntil(p); else await p;
        }
        return { state: 'LIVE', data: got.data, fetchedAt: now, ageMs: 0, reason: null };
    }

    let snap = null;
    if (store) { try { snap = await store.get(key); } catch (_) { snap = null; } }
    const ageMs = snap ? now - snap.fetchedAt : null;
    if (snap && maxStaleMs > 0 && ageMs <= maxStaleMs) {
        return { state: 'STALE', data: snap.data, fetchedAt: snap.fetchedAt, ageMs, reason: got.reason };
    }
    return {
        state: 'DOWN', data: null, fetchedAt: snap ? snap.fetchedAt : null, ageMs,
        reason: snap ? `${got.reason}; last good copy too old` : got.reason,
    };
}

export function etStamp(ms) {
    return new Date(ms).toLocaleString('en-US', {
        timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }) + ' ET';
}

// The receipt a STALE page must carry. An absolute time, not "N min ago",
// because the rendered page is itself edge-cached.
export function staleNote(src, what) {
    if (!src || src.state !== 'STALE') return '';
    const label = String(what).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    return `<p class="ss-stale" data-source-state="stale">${label} as of ${etStamp(src.fetchedAt)}: ` +
        `ESPN isn't answering our server, so this is the last copy we got.</p>`;
}

// A STALE page re-checks every minute instead of holding old data for the
// page's normal cache lifetime.
export function pageCacheControl(src, seconds) {
    return `public, max-age=${src && src.state === 'STALE' ? 60 : seconds}`;
}
