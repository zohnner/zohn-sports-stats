// Read-only aggregates over the anonymous page_views log, for the scheduled
// desk and audit runs, which cannot reach D1. Gated by a shared secret because
// the numbers are the owner's, not because any row is personal: the table
// holds no user id, IP or user agent, and this route never returns a row.
const DAY_MS = 86400000;

export const QUERIES = {
    bySport: 'SELECT sport, COUNT(*) AS views, SUM(CASE WHEN seq = 1 AND is_new = 1 THEN 1 ELSE 0 END) AS new_sessions FROM page_views WHERE created_at > ? GROUP BY sport ORDER BY views DESC',
    byChannel: "SELECT COALESCE(ref, 'unknown') AS channel, COUNT(*) AS entries FROM page_views WHERE seq = 1 AND created_at > ? GROUP BY channel ORDER BY entries DESC",
    topEntries: 'SELECT entry_path AS path, COUNT(*) AS entries FROM page_views WHERE seq = 1 AND entry_path IS NOT NULL AND created_at > ? GROUP BY entry_path ORDER BY entries DESC LIMIT 25',
    stories: "SELECT view, COUNT(*) AS views, SUM(CASE WHEN seq = 1 THEN 1 ELSE 0 END) AS entries FROM page_views WHERE view LIKE 'story:%' AND created_at > ? GROUP BY view ORDER BY views DESC LIMIT 100",
    daily: "SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS views, SUM(CASE WHEN seq = 1 THEN 1 ELSE 0 END) AS entries FROM page_views WHERE created_at > ? GROUP BY day ORDER BY day",
};

export function windowDays(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return 14;
    return Math.min(Math.max(n, 1), 90);
}

export function shape(days, since, now, results) {
    const [bySport, byChannel, topEntries, stories, daily] = results.map(r => (r && r.results) || []);
    return {
        days, since, generatedAt: now,
        bySport: bySport.map(r => ({ sport: r.sport, views: r.views, newSessions: r.new_sessions || 0 })),
        byChannel: byChannel.map(r => ({ channel: r.channel, entries: r.entries })),
        topEntries: topEntries.map(r => ({ path: r.path, entries: r.entries })),
        stories: stories.map(r => ({ slug: String(r.view).slice(6), views: r.views, entries: r.entries || 0 })),
        daily: daily.map(r => ({ day: r.day, views: r.views, entries: r.entries || 0 })),
    };
}

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (!env.STATS_KEY) return json({ error: 'STATS_KEY not configured' }, 503);
    if (!timingSafeEqual(request.headers.get('X-Stats-Key') || '', env.STATS_KEY)) return json({ error: 'unauthorized' }, 401);

    const days = windowDays(new URL(request.url).searchParams.get('days'));
    const now = Date.now();
    const since = now - days * DAY_MS;
    try {
        const db = env.USER_DB;
        const results = await db.batch(Object.values(QUERIES).map(sql => db.prepare(sql).bind(since)));
        return json(shape(days, since, now, results));
    } catch {
        return json({ error: 'stats unavailable' }, 502);
    }
}

function timingSafeEqual(a, b) {
    const bufA = new TextEncoder().encode(a);
    const bufB = new TextEncoder().encode(b);
    const len = Math.max(bufA.length, bufB.length, 1);
    let diff = bufA.length ^ bufB.length;
    for (let i = 0; i < len; i++) diff |= (bufA[i] || 0) ^ (bufB[i] || 0);
    return diff === 0;
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
