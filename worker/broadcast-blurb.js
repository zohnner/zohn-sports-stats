/**
 * Cloudflare Worker: broadcast-blurb
 * POST /  — accepts player + stats JSON, returns a 2-sentence AI broadcast blurb.
 *
 * Secrets (set via CLI, never commit values):
 *   wrangler secret put ANTHROPIC_API_KEY
 *
 * Deploy:
 *   wrangler deploy --config worker/wrangler-blurb.toml
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-haiku-4-5-20251001';

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
        const origin = request.headers.get('Origin') || '';

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders(origin) });
        }
        if (request.method !== 'POST') {
            return json({ error: 'Method not allowed' }, 405, origin);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ error: 'Invalid JSON' }, 400, origin);
        }

        const { name, team, position, group, season, stats, statcast } = body;
        if (!name || !stats) return json({ error: 'Missing required fields' }, 400, origin);

        const statsText = group === 'hitting'
            ? `AVG: ${stats.avg}, OBP: ${stats.obp}, SLG: ${stats.slg}, OPS: ${stats.ops}, HR: ${stats.homeRuns}, RBI: ${stats.rbi}, SB: ${stats.stolenBases}, BABIP: ${stats.babip}, K%: ${stats.kPct?.toFixed?.(1) ?? stats.kPct}%, BB%: ${stats.bbPct?.toFixed?.(1) ?? stats.bbPct}%`
            : `ERA: ${stats.era}, WHIP: ${stats.whip}, W: ${stats.wins}, K: ${stats.strikeOuts}, IP: ${stats.inningsPitched}, K%: ${stats.kPct?.toFixed?.(1) ?? stats.kPct}%, BB%: ${stats.bbPct?.toFixed?.(1) ?? stats.bbPct}%, FIP: ${stats.fip}`;

        const statcastText = statcast
            ? `Statcast — xBA: ${statcast.xba}, xSLG: ${statcast.xslg}, xwOBA: ${statcast.xwoba}, Exit Velocity: ${statcast.avg_hit_speed} mph, Barrel%: ${statcast.barrels_per_bbe}%`
            : '';

        const userPrompt = `Write a concise 2-sentence broadcast blurb for ${name} (${position}, ${team}) for the ${season} MLB season. Use their stats naturally in commentary style — no bullet points, no labels, just flowing broadcast prose. Keep it under 60 words total.\n\n${season} stats: ${statsText}${statcastText ? `\n${statcastText}` : ''}\n\nWrite only the 2-sentence blurb, nothing else.`;

        try {
            const res = await fetch(ANTHROPIC_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: MODEL,
                    max_tokens: 150,
                    system: 'You are a professional baseball broadcaster. Be specific with numbers. No clichés.',
                    messages: [{ role: 'user', content: userPrompt }],
                }),
            });

            if (!res.ok) {
                const err = await res.text();
                return json({ error: 'Anthropic error', detail: err }, 502, origin);
            }

            const data  = await res.json();
            const blurb = data.content?.[0]?.text?.trim() || '';
            return new Response(JSON.stringify({ blurb }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
            });
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
