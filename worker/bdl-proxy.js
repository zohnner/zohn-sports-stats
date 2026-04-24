// ============================================================
// ZohnStats — Cloudflare Worker: BDL + Kalshi API Proxy
//
// Keeps API keys server-side. The static site calls this Worker;
// the Worker adds credentials and forwards to the real APIs.
//
// Deploy:
//   npm install -g wrangler
//   wrangler secret put BDL_API_KEY
//   wrangler deploy
//
// Secrets (set via CLI, never committed):
//   BDL_API_KEY       — balldontlie.io key
//   KALSHI_API_KEY    — Kalshi REST key  (future)
//   KALSHI_PRIVATE_KEY — Kalshi RSA PEM  (future)
// ============================================================

const BDL_ORIGIN     = 'https://api.balldontlie.io/v1';
const KALSHI_ORIGIN  = 'https://trading-api.kalshi.com/trade-api/v2';
const SAVANT_ORIGIN  = 'https://baseballsavant.mlb.com';

// Allowed origins for CORS — lock down to your domain in production.
// During development '*' is fine since the API key never leaves the Worker.
const ALLOWED_ORIGIN = '*';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // ── CORS preflight ────────────────────────────────────
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders() });
        }

        // ── Only GET allowed ─────────────────────────────────
        if (request.method !== 'GET') {
            return jsonError('Method not allowed', 405);
        }

        // Route by path prefix:
        //   /bdl/*     → api.balldontlie.io/v1/*
        //   /kalshi/*  → trading-api.kalshi.com/trade-api/v2/*  (future)

        if (url.pathname.startsWith('/bdl/')) {
            return proxyBDL(url, env);
        }

        if (url.pathname.startsWith('/savant/')) {
            return proxySavant(url);
        }

        if (url.pathname.startsWith('/kalshi/')) {
            return proxyKalshi(url, env);
        }

        return jsonError('Unknown route. Use /bdl/*, /savant/*, or /kalshi/*', 404);
    },
};

// ── BDL proxy ─────────────────────────────────────────────────

async function proxyBDL(url, env) {
    if (!env.BDL_API_KEY) {
        return jsonError('BDL_API_KEY secret not configured on the Worker', 500);
    }

    // Strip /bdl prefix → forward remainder to BDL base
    const targetPath = url.pathname.slice('/bdl'.length); // e.g. /players
    const targetUrl  = `${BDL_ORIGIN}${targetPath}${url.search}`;

    // Validate path — no traversal, only alphanumeric + safe chars
    if (!/^\/[\w\-/]*$/.test(targetPath)) {
        return jsonError('Invalid path', 400);
    }

    let resp;
    try {
        resp = await fetch(targetUrl, {
            headers: { 'Authorization': env.BDL_API_KEY },
            // Cloudflare edge cache — match the client-side ApiCache TTL
            cf: { cacheTtl: 300, cacheEverything: true },
        });
    } catch (err) {
        return jsonError(`Upstream fetch failed: ${err.message}`, 502);
    }

    const body = await resp.text();
    return new Response(body, {
        status: resp.status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
            ...corsHeaders(),
        },
    });
}

// ── Baseball Savant (Statcast) proxy ──────────────────────────
// No API key required — proxying to handle CORS for client-side fetches.
// Edge-cached for 6 hours since Statcast data updates once daily.

async function proxySavant(url) {
    // Strip /savant prefix → forward remainder to Savant base
    const targetPath = url.pathname.slice('/savant'.length); // e.g. /percentile-rankings
    const targetUrl  = `${SAVANT_ORIGIN}${targetPath}${url.search}`;

    // Basic path validation
    if (!/^\/[\w\-/%.]*$/.test(targetPath)) {
        return jsonError('Invalid path', 400);
    }

    let resp;
    try {
        resp = await fetch(targetUrl, {
            headers: { 'Accept': 'application/json, text/plain, */*' },
            cf: { cacheTtl: 21600, cacheEverything: true },
        });
    } catch (err) {
        return jsonError(`Savant fetch failed: ${err.message}`, 502);
    }

    const body = await resp.text();
    return new Response(body, {
        status: resp.status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=21600',
            ...corsHeaders(),
        },
    });
}

// ── Kalshi proxy (stub — RSA signing to be implemented) ───────

async function proxyKalshi(url, env) {
    if (!env.KALSHI_API_KEY || !env.KALSHI_PRIVATE_KEY) {
        return jsonError('Kalshi secrets not configured on the Worker', 500);
    }

    // TODO: Kalshi requires ECDSA/RSA-PS256 request signing.
    // Each request needs a signature over method + path + timestamp.
    // Implement when PLAN-001 Kalshi odds integration begins.
    return jsonError('Kalshi proxy not yet implemented', 501);
}

// ── Helpers ───────────────────────────────────────────────────

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function jsonError(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
}
