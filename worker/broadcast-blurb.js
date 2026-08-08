/**
 * Cloudflare Worker: broadcast-blurb
 * POST /  — accepts player + stats JSON, returns a 2-sentence AI broadcast blurb.
 *
 * Provider: Gemini (generativelanguage.googleapis.com/v1beta/interactions) —
 * the exact request/response contract already proven working in production
 * by the sportstrata-video repo's src/script.js. Anthropic is not used
 * anywhere on this site (owner decision, 2026-08-08) — Gemini is the one
 * LLM vendor for the whole project now, one fewer credential/vendor
 * relationship to maintain solo (GOALS.md G5).
 *
 * Cached in BLURB_CACHE (Workers KV), keyed by sport+player+group+season,
 * TTL-bounded (CACHE_TTL_S below). This is what makes a public button safe
 * to expose at all: D-039's ratified rule is "nothing meters per user
 * action, ever — one viral day must not decide the bill." A live call on
 * every click violates that; a TTL-bounded cache means worst-case cost is
 * (unique players actually viewed) x (refresh windows per day), which does
 * not grow with traffic. The KV binding is required, not optional — see
 * the guard below. Deploying without it would silently reintroduce the
 * exact unbounded-cost pattern this rewrite exists to close, so it fails
 * loudly instead.
 *
 * Secrets (set via CLI, never commit values):
 *   wrangler secret put GEMINI_API_KEY --config worker/wrangler-blurb.toml
 *
 * KV namespace (create once, then bind in wrangler-blurb.toml):
 *   wrangler kv namespace create BLURB_CACHE --config worker/wrangler-blurb.toml
 *
 * Deploy:
 *   wrangler deploy --config worker/wrangler-blurb.toml
 */

const GEMINI_API  = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL       = 'gemini-3.6-flash';

// 4h — fresh enough across a game day (a blurb reflects roughly-current
// stats within one quarter of a day) while bounding Gemini calls to at
// most 6 per player per day regardless of how many people click the
// button. See file header re: D-039.
const CACHE_TTL_S = 4 * 60 * 60;

const SYSTEM_INSTRUCTION = 'You are a professional baseball broadcaster. Be specific with numbers. No clichés. Write only the requested blurb — no preamble, no markdown, no code fences.';

// Allowed CORS origins — only these origins receive a matching header.
// Any other origin gets the production domain, causing the browser to block it.
const ALLOWED_ORIGINS = [
    'https://sportstrata.cc',
    'https://www.sportstrata.cc',
    'https://zohn-sports-stats.pages.dev',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://127.0.0.1:3003',
];

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders(origin) });
        }
        if (request.method !== 'POST') {
            return json({ error: 'Method not allowed' }, 405, origin);
        }

        // Fail loudly, not silently — a missing KV binding must never fall
        // back to uncached live generation (see file header).
        if (!env.BLURB_CACHE) {
            return json({ error: 'BLURB_CACHE KV binding not configured — see wrangler-blurb.toml setup instructions' }, 500, origin);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ error: 'Invalid JSON' }, 400, origin);
        }

        const { name, team, position, group, season, stats, statcast, playerId } = body;
        if (!name || !stats) return json({ error: 'Missing required fields' }, 400, origin);

        // Cache key is built from identity fields only, not the stat payload —
        // the whole point is that the blurb regenerates on a fixed schedule
        // (CACHE_TTL_S), not on every request, even as the underlying stats
        // change during the day. playerId is preferred (stable, collision-free);
        // falls back to name+team for any caller that hasn't been updated to
        // send it yet.
        const sport    = body.sport || 'mlb';
        const identity = playerId != null ? String(playerId) : `${name}:${team}`;
        const cacheKey = `blurb:${sport}:${identity}:${group}:${season}`;

        const cached = await env.BLURB_CACHE.get(cacheKey);
        if (cached) {
            try {
                return json({ blurb: JSON.parse(cached).blurb, cached: true }, 200, origin);
            } catch {
                // Corrupt cache entry — fall through and regenerate rather than error out.
            }
        }

        const statsText = group === 'hitting'
            ? `AVG: ${stats.avg}, OBP: ${stats.obp}, SLG: ${stats.slg}, OPS: ${stats.ops}, HR: ${stats.homeRuns}, RBI: ${stats.rbi}, SB: ${stats.stolenBases}, BABIP: ${stats.babip}, K%: ${stats.kPct?.toFixed?.(1) ?? stats.kPct}%, BB%: ${stats.bbPct?.toFixed?.(1) ?? stats.bbPct}%`
            : `ERA: ${stats.era}, WHIP: ${stats.whip}, W: ${stats.wins}, K: ${stats.strikeOuts}, IP: ${stats.inningsPitched}, K%: ${stats.kPct?.toFixed?.(1) ?? stats.kPct}%, BB%: ${stats.bbPct?.toFixed?.(1) ?? stats.bbPct}%, FIP: ${stats.fip}`;

        const statcastText = statcast
            ? `Statcast — xBA: ${statcast.xba}, xSLG: ${statcast.xslg}, xwOBA: ${statcast.xwoba}, Exit Velocity: ${statcast.avg_hit_speed} mph, Barrel%: ${statcast.barrels_per_bbe}%`
            : '';

        const input = `Write a concise 2-sentence broadcast blurb for ${name} (${position}, ${team}) for the ${season} MLB season. Use their stats naturally in commentary style — no bullet points, no labels, just flowing broadcast prose. Keep it under 60 words total.\n\n${season} stats: ${statsText}${statcastText ? `\n${statcastText}` : ''}\n\nWrite only the 2-sentence blurb, nothing else.`;

        try {
            const res = await fetch(GEMINI_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': env.GEMINI_API_KEY,
                },
                body: JSON.stringify({
                    model: MODEL,
                    system_instruction: SYSTEM_INSTRUCTION,
                    input,
                    // max_output_tokens well above the ~60-word target — on this
                    // model, thinking tokens draw from the SAME budget as output
                    // tokens (confirmed the hard way in the video pipeline's
                    // script.js: a real request hit status "incomplete" because
                    // thinking ate the whole budget before any visible text was
                    // written). thinking_level 'low' because a 2-sentence stat
                    // blurb isn't a reasoning task.
                    generation_config: { temperature: 0.7, max_output_tokens: 400, thinking_level: 'low' },
                }),
            });

            if (!res.ok) {
                const err = await res.text();
                return json({ error: 'Gemini error', detail: err.slice(0, 500) }, 502, origin);
            }

            const data = await res.json();
            if (data.status && data.status !== 'completed') {
                return json({ error: 'Gemini interaction did not complete', detail: data.status }, 502, origin);
            }
            const modelOutputStep = (data.steps || []).find(s => s.type === 'model_output');
            const blurb = modelOutputStep
                ? (modelOutputStep.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim()
                : '';

            if (!blurb) return json({ error: 'Gemini returned an empty blurb' }, 502, origin);

            await env.BLURB_CACHE.put(cacheKey, JSON.stringify({ blurb, generatedAt: Date.now() }), { expirationTtl: CACHE_TTL_S });

            return json({ blurb, cached: false }, 200, origin);
        } catch (err) {
            return json({ error: 'Worker error', detail: String(err) }, 500, origin);
        }
    },
};

function corsHeaders(origin) {
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function json(obj, status = 200, origin = '') {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
}
