// D-149 — First-party page-view log (js/navigation.js's _trackPageView() posts here via
// navigator.sendBeacon on every navigation). Anonymous by construction: no user_id, no
// IP, no user-agent stored. See migrations/0008_page_views.sql for why this exists
// instead of relying on Cloudflare Web Analytics alone.
//
// D-183 adds seq / is_new / ref / entry_path (migrations/0009_page_views_visit.sql).
// Every new field is validated against a fixed shape so nothing free-form is stored;
// an invalid optional field is dropped to NULL rather than failing the whole row.
//
// sendBeacon can't set a custom header, so the client sends a Blob with an explicit
// application/json type -- this still arrives as a normal JSON body here.
export const VALID_SPORTS = new Set(['mlb', 'nfl', 'nhl', 'nba', 'ncaaf', 'ncaab', 'wnba', 'home', 'shared']);
// Mirrors VisitBeacon.refBucket() in js/visitBeacon.js.
export const REF_BUCKETS = new Set(['direct', 'internal', 'google', 'search', 'reddit', 'x', 'meta', 'ai', 'other']);
const PATH_RE = /^\/[A-Za-z0-9/_.-]{0,63}$/;

export function parseRow(body) {
    if (!body || !VALID_SPORTS.has(body.sport) || typeof body.view !== 'string' || !body.view || body.view.length > 64) {
        return null;
    }
    const seq = Number.isInteger(body.seq) && body.seq >= 1 && body.seq <= 999 ? body.seq : null;
    const isNew = body.isNew === 0 || body.isNew === 1 ? body.isNew : null;
    const entry = seq === 1;
    const ref = entry && REF_BUCKETS.has(body.ref) ? body.ref : null;
    const path = entry && typeof body.path === 'string' && PATH_RE.test(body.path) ? body.path : null;
    return { sport: body.sport, view: body.view, seq, isNew, ref, path };
}

export async function onRequestPost(context) {
    const row = parseRow(await context.request.json().catch(() => null));
    if (!row) return new Response(null, { status: 400 });

    const db = context.env.USER_DB;
    const now = Date.now();
    try {
        await db
            .prepare('INSERT INTO page_views (sport, view, created_at, is_new, seq, ref, entry_path) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(row.sport, row.view, now, row.isNew, row.seq, row.ref, row.path)
            .run();
    } catch {
        // Deployed ahead of migration 0009: keep the D-149 count flowing.
        await db
            .prepare('INSERT INTO page_views (sport, view, created_at) VALUES (?, ?, ?)')
            .bind(row.sport, row.view, now)
            .run();
    }

    // 204 keeps this beacon-cheap -- no body for sendBeacon to ever look at.
    return new Response(null, { status: 204 });
}
