/**
 * Best-effort per-IP rate limit for every /api/* Pages Function (Cipher, 2026-07-01).
 * These endpoints are open proxies to ESPN / Sleeper / MLB / nflverse — without a
 * limit, third parties can freeload on them (burning quota, risking upstream IP
 * bans that would take the whole product down).
 *
 * In-isolate memory: counts reset on isolate recycle and are per-colo, so this is
 * abuse DAMPING, not a hard quota. Pair with a Cloudflare WAF rate-limiting rule
 * for real enforcement — owner setup steps in docs/ops-rate-limiting.md.
 */
const WINDOW_MS = 60_000;
const LIMIT = 120; // ~2 req/s sustained per IP; a cold page-load burst stays well under
const buckets = new Map(); // ip -> { count, resetAt }

export async function onRequest(context) {
    const { request, next } = context;
    if (request.method === 'OPTIONS') return next(); // CORS preflight is never counted

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || now >= b.resetAt) {
        b = { count: 0, resetAt: now + WINDOW_MS };
        buckets.set(ip, b);
    }
    b.count++;

    if (buckets.size > 10_000) {
        for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
        if (buckets.size > 10_000) buckets.clear(); // pathological flood — reset rather than grow unbounded
    }

    if (b.count > LIMIT) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': String(Math.ceil((b.resetAt - now) / 1000)),
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
    return next();
}
