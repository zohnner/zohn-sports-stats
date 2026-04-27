/**
 * Pages Function: /api/mlb
 * Proxies requests to MLB Stats API and Baseball Savant, caching responses in D1.
 * Binding required: DB → sportStrata-db (set in Pages > Settings > Functions > D1 bindings)
 */

const ALLOWED_ORIGINS = [
    'https://statsapi.mlb.com',
    'https://baseballsavant.mlb.com',
];

// TTL in seconds per endpoint type
function ttlFor(url) {
    if (url.includes('/schedule'))             return 60;    // live scores
    if (url.includes('/standings'))            return 1800;  // standings 30 min
    if (url.includes('/people/') ||
        url.includes('/teams/'))               return 3600;  // rosters 1 hr
    if (url.includes('baseballsavant'))        return 3600;  // savant data 1 hr
    return 300; // default 5 min
}

export async function onRequest(context) {
    const { request, env } = context;

    // CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    const params = new URL(request.url).searchParams;
    const target = params.get('url');

    if (!target) {
        return json({ error: 'Missing url param' }, 400);
    }

    // Allowlist check — never proxy arbitrary URLs
    if (!ALLOWED_ORIGINS.some(o => target.startsWith(o))) {
        return json({ error: 'Forbidden' }, 403);
    }

    const now = Math.floor(Date.now() / 1000);

    // Cache read
    if (env.DB) {
        const row = await env.DB
            .prepare('SELECT value, expires_at FROM api_cache WHERE key = ?')
            .bind(target)
            .first();

        if (row && row.expires_at > now) {
            return new Response(row.value, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Cache': 'HIT',
                    'Cache-Control': 'public, max-age=60',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
    }

    // Upstream fetch
    let resp;
    try {
        resp = await fetch(target, {
            headers: { 'User-Agent': 'SportStrata/1.0' },
        });
    } catch (err) {
        return json({ error: 'Upstream unreachable', detail: String(err) }, 502);
    }

    if (!resp.ok) {
        return json({ error: 'Upstream error', status: resp.status }, resp.status);
    }

    const body = await resp.text();

    // Cache write (best-effort — don't fail the response if D1 is unavailable)
    if (env.DB) {
        const expires = now + ttlFor(target);
        env.DB.prepare(
            'INSERT OR REPLACE INTO api_cache (key, value, expires_at) VALUES (?, ?, ?)'
        ).bind(target, body, expires).run().catch(() => {});
    }

    return new Response(body, {
        headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'MISS',
            'Cache-Control': 'public, max-age=60',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}
