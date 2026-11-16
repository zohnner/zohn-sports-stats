// The audit tools load production in a real browser. Without this, every run
// writes rows to page_views that read as new direct visitors.
const TRACK_RE = /\/api\/track(\?|$)/;

async function blockTracking(page) {
    await page.route(TRACK_RE, route => route.abort());
    await page.addInitScript(() => { navigator.sendBeacon = () => true; });
}

module.exports = { TRACK_RE, blockTracking };
