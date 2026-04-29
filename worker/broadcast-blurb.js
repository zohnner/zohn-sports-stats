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

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }
        if (request.method !== 'POST') {
            return json({ error: 'Method not allowed' }, 405);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ error: 'Invalid JSON' }, 400);
        }

        const { name, team, position, group, season, stats, statcast } = body;
        if (!name || !stats) return json({ error: 'Missing required fields' }, 400);

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
                return json({ error: 'Anthropic error', detail: err }, 502);
            }

            const data  = await res.json();
            const blurb = data.content?.[0]?.text?.trim() || '';
            return new Response(JSON.stringify({ blurb }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders() },
            });
        } catch (err) {
            return json({ error: 'Worker error', detail: String(err) }, 500);
        }
    },
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
}
