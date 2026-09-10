// D-149 — First-party page-view log (js/navigation.js's navigateTo() posts here via
// navigator.sendBeacon on every navigation). Anonymous by construction: no user_id, no
// IP, no user-agent stored -- sport/view/timestamp only. See migrations/0008_page_views.sql
// for why this exists instead of relying on Cloudflare Web Analytics alone.
//
// sendBeacon can't set a custom header, so the client sends a Blob with an explicit
// application/json type -- this still arrives as a normal JSON body here.
const VALID_SPORTS = new Set(['mlb', 'nfl', 'nhl', 'nba', 'ncaaf', 'ncaab', 'wnba', 'home']);

export async function onRequestPost(context) {
    const body = await context.request.json().catch(() => null);
    if (!body || !VALID_SPORTS.has(body.sport) || typeof body.view !== 'string' || !body.view || body.view.length > 64) {
        return new Response(null, { status: 400 });
    }

    await context.env.USER_DB
        .prepare('INSERT INTO page_views (sport, view, created_at) VALUES (?, ?, ?)')
        .bind(body.sport, body.view.slice(0, 64), Date.now())
        .run();

    // 204 keeps this beacon-cheap -- no body for sendBeacon to ever look at.
    return new Response(null, { status: 204 });
}
