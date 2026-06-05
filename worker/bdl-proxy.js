// ============================================================
// SportStrata — Cloudflare Worker: BDL + Savant + Kalshi API Proxy
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

// Allowed CORS origins — only these origins receive a matching header.
// Any other origin gets the production domain, causing the browser to block it.
const ALLOWED_ORIGINS = [
    'https://sportsstrata.com',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://127.0.0.1:3003',
];

export default {
    async fetch(request, env) {
        const url    = new URL(request.url);
        const origin = request.headers.get('Origin') || '';

        // ── CORS preflight ────────────────────────────────────
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        // ── Only GET allowed ─────────────────────────────────
        if (request.method !== 'GET') {
            return jsonError('Method not allowed', 405);
        }

        // Route by path prefix:
        //   /bdl/*     → api.balldontlie.io/v1/*
        //   /savant/*  → baseballsavant.mlb.com/*
        //   /kalshi/*  → trading-api.kalshi.com/trade-api/v2/*  (future)

        if (url.pathname.startsWith('/bdl/')) {
            return proxyBDL(url, env, origin);
        }

        if (url.pathname.startsWith('/savant/')) {
            return proxySavant(url, origin);
        }

        if (url.pathname.startsWith('/kalshi/')) {
            return proxyKalshi(url, env, origin);
        }

        return jsonError('Unknown route. Use /bdl/*, /savant/*, or /kalshi/*', 404);
    },
};

// ── BDL proxy ─────────────────────────────────────────────────

async function proxyBDL(url, env, origin) {
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
            ...corsHeaders(origin),
        },
    });
}

// ── Baseball Savant (Statcast) proxy ──────────────────────────
// No API key required — proxying to handle CORS for client-side fetches.
// Edge-cached for 6 hours since Statcast data updates once daily.

async function proxySavant(url, origin) {
    // Strip /savant prefix → forward remainder to Savant base
    const targetPath = url.pathname.slice('/savant'.length); // e.g. /percentile-rankings
    const targetUrl  = `${SAVANT_ORIGIN}${targetPath}${url.search}`;

    // Basic path validation — no percent-encoding tricks
    if (!/^\/[\w\-/]*$/.test(targetPath)) {
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
            ...corsHeaders(origin),
        },
    });
}

// ── Kalshi proxy (stub — RSA signing to be implemented) ───────

async function proxyKalshi(url, env, origin) {
    if (!env.KALSHI_API_KEY || !env.KALSHI_PRIVATE_KEY) {
        return jsonError('Kalshi secrets not configured on the Worker', 500);
    }

    // TODO: Kalshi requires ECDSA/RSA-PS256 request signing.
    // Each request needs a signature over method + path + timestamp.
    // Implement when PLAN-001 Kalshi odds integration begins.
    return jsonError('Kalshi proxy not yet implemented', 501);
}

// ── Helpers ───────────────────────────────────────────────────

function corsHeaders(origin) {
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin':  allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function jsonError(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders('') },
    });
}
