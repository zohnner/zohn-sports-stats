// GET /api/og?eyebrow=&title=&subtitle=&stat=&accent=RRGGBB
// Dynamic per-entity share-card PNG (D-127 continuation of the og:image gap flagged
// in D-056/D-057/D-062 -- every edge-rendered page previously shared one static image).
// Rate-limited like every other /api/* route via functions/api/_middleware.js.
import { renderOgPng } from '../_og.js';

// Generous but bounded -- this renders server-side on every miss, so an attacker
// pasting a huge string shouldn't get free expensive satori/resvg work. Real callers
// (this site's own edge-render Functions) never send anything close to these caps.
const MAX_LEN = { eyebrow: 60, title: 80, subtitle: 90, stat: 90 };
function clip(v, max) {
    if (!v) return '';
    const s = String(v).slice(0, max);
    return s;
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const q = url.searchParams;

    const title = clip(q.get('title'), MAX_LEN.title);
    if (!title || !env.ASSETS) {
        return new Response('missing title', { status: 400 });
    }

    try {
        const png = await renderOgPng({
            env,
            url: request.url,
            eyebrow: clip(q.get('eyebrow'), MAX_LEN.eyebrow),
            title,
            subtitle: clip(q.get('subtitle'), MAX_LEN.subtitle),
            statLine: clip(q.get('stat'), MAX_LEN.stat),
            accentColor: q.get('accent') ? `#${q.get('accent').replace(/^#/, '')}` : null,
        });

        return new Response(png, {
            headers: {
                'content-type': 'image/png',
                // Entity content (a player's stat line, a final score) doesn't change
                // fast enough to need short TTLs the way live-game JSON does -- an hour
                // matches the MEDIUM tier this codebase already uses for season stats.
                'cache-control': 'public, max-age=3600',
            },
        });
    } catch (e) {
        console.error('OG render failed:', e && e.stack || e);
        // Fail safe to the static default image rather than a broken <meta> reference --
        // a crawler/scraper following a 500 or an error page as the og:image is worse
        // than falling back to the generic (but real) brand card.
        return Response.redirect(new URL('/assets/og-default.png', request.url).href, 302);
    }
}
