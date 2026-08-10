/**
 * Pages Function: /api/youtube
 * Owner-only YouTube channel insight endpoint — powers youtube-insights.html,
 * an unlinked page (not in nav, not in sitemap.xml, noindex) reached only via
 * a private bookmarked URL. This is a single-owner internal tool, not a
 * product feature — no three-gate spec, no AppState wiring, no CORS (same-
 * origin fetch only). See DECISIONS.md D-083.
 *
 * Gated by a shared secret (X-YouTube-Dashboard-Key header), timing-safe
 * compared — same pattern as worker/push-game-alerts.js's /__run gate.
 *
 * Required config (Pages dashboard → Settings → Functions → Environment
 * variables, added as Secret, never committed):
 *   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN,
 *   YOUTUBE_CHANNEL_ID  — same four values already used by bot/youtube_stats.py
 *   YOUTUBE_DASHBOARD_KEY — a new, separate shared secret for this endpoint
 *     (not one of the four above); generate a long random string yourself.
 *
 * Required binding: YT_CACHE (Workers KV) — create once, bind under Pages →
 * Settings → Functions → KV namespace bindings. Without it the Function still
 * works, just refetches from YouTube on every request instead of caching.
 *
 * Mirrors bot/youtube_stats.py's data shape and known pitfalls:
 *   - Always queries the explicit YOUTUBE_CHANNEL_ID, never channels.list
 *     (mine=true) — that returns the authenticated Google Account's own
 *     default channel, not reliably the intended Brand Account (found live
 *     2026-08-09, see config.py's comment on this).
 *   - Very recent uploads legitimately show no windowed analytics yet
 *     (YouTube's own processing lag, not a bug) — the client renders "—"
 *     for those, same as the CLI report.
 *
 * Rate-limited automatically by functions/api/_middleware.js like every
 * other /api/* route — no extra throttling needed here.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports';

// 3h — fresh enough to inform "what to post next" without hammering the
// YouTube API quota on every repeat visit (same cost-bounding logic as
// worker/broadcast-blurb.js's CACHE_TTL_S).
const CACHE_TTL_S = 3 * 60 * 60;

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405);
    }

    if (!env.YOUTUBE_DASHBOARD_KEY) {
        return json({ error: 'YOUTUBE_DASHBOARD_KEY not configured' }, 503);
    }
    const provided = request.headers.get('X-YouTube-Dashboard-Key') || '';
    if (!_timingSafeEqual(provided, env.YOUTUBE_DASHBOARD_KEY)) {
        return json({ error: 'unauthorized' }, 401);
    }

    const missing = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN', 'YOUTUBE_CHANNEL_ID']
        .filter(k => !env[k]);
    if (missing.length) {
        return json({ error: `Missing config: ${missing.join(', ')}` }, 503);
    }

    const params = new URL(request.url).searchParams;
    const days = clamp(parseInt(params.get('days') || '90', 10), 1, 365, 90);
    const limit = clamp(parseInt(params.get('limit') || '25', 10), 1, 200, 25);

    const cacheKey = `yt:${days}:${limit}`;
    if (env.YT_CACHE) {
        const cached = await env.YT_CACHE.get(cacheKey);
        if (cached) {
            return new Response(cached, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
        }
    }

    let payload;
    try {
        payload = await buildReport(env, days, limit);
    } catch (err) {
        return json({ error: 'Failed to build report', detail: String(err) }, 502);
    }

    const body = JSON.stringify(payload);
    if (env.YT_CACHE) {
        await env.YT_CACHE.put(cacheKey, body, { expirationTtl: CACHE_TTL_S }).catch(() => {});
    }
    return new Response(body, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
}

async function buildReport(env, days, limit) {
    const token = await getAccessToken(env);
    const channelInfo = await getChannelInfo(env, token);
    const videos = await getRecentVideos(token, channelInfo.uploadsPlaylistId, limit);
    const videoIds = videos.map(v => v.videoId);
    const details = await getVideoDetails(token, videoIds);
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    const analytics = await getAnalytics(env, token, videoIds, start, end);

    const rows = videos.map(v => {
        const d = details[v.videoId] || {};
        const a = analytics[v.videoId] || {};
        return {
            videoId: v.videoId,
            title: v.title,
            url: `https://youtu.be/${v.videoId}`,
            publishedAt: v.publishedAt,
            durationSeconds: d.durationSeconds ?? null,
            windowedViews: a.views ?? null,
            avgViewPercentage: a.averageViewPercentage ?? null,
            subscribersNet: (a.subscribersGained != null && a.subscribersLost != null)
                ? a.subscribersGained - a.subscribersLost
                : null,
            lifetimeViews: d.lifetimeViews ?? null,
            lifetimeLikes: d.lifetimeLikes ?? null,
        };
    });

    // Sort by windowed views desc, falling back to lifetime views — matches the CLI report.
    rows.sort((x, y) => (y.windowedViews ?? -1) - (x.windowedViews ?? -1) || (y.lifetimeViews ?? 0) - (x.lifetimeViews ?? 0));

    return {
        channel: { title: channelInfo.title, customUrl: channelInfo.customUrl, channelId: env.YOUTUBE_CHANNEL_ID },
        range: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
        generatedAt: new Date().toISOString(),
        videos: rows,
    };
}

async function getAccessToken(env) {
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: env.YOUTUBE_CLIENT_ID,
            client_secret: env.YOUTUBE_CLIENT_SECRET,
            refresh_token: env.YOUTUBE_REFRESH_TOKEN,
            grant_type: 'refresh_token',
        }),
    });
    if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.access_token;
}

async function getChannelInfo(env, token) {
    const qs = new URLSearchParams({ part: 'snippet,contentDetails', id: env.YOUTUBE_CHANNEL_ID, access_token: token });
    const res = await fetch(`${DATA_API}/channels?${qs}`);
    if (!res.ok) throw new Error(`channels.list failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const item = (data.items || [])[0];
    if (!item) throw new Error(`No channel found for id ${env.YOUTUBE_CHANNEL_ID}`);
    return {
        uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
        title: item.snippet?.title || '(unknown)',
        customUrl: item.snippet?.customUrl || '',
    };
}

async function getRecentVideos(token, playlistId, limit) {
    const videos = [];
    let pageToken = null;
    while (videos.length < limit) {
        const qs = new URLSearchParams({
            part: 'snippet',
            playlistId,
            maxResults: String(Math.min(50, limit - videos.length)),
            access_token: token,
        });
        if (pageToken) qs.set('pageToken', pageToken);
        const res = await fetch(`${DATA_API}/playlistItems?${qs}`);
        if (!res.ok) throw new Error(`playlistItems failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
        const data = await res.json();
        for (const item of data.items || []) {
            const sn = item.snippet;
            videos.push({
                videoId: sn.resourceId.videoId,
                title: sn.title,
                publishedAt: (sn.publishedAt || '').slice(0, 10),
            });
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
    }
    return videos.slice(0, limit);
}

async function getVideoDetails(token, videoIds) {
    const out = {};
    for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const qs = new URLSearchParams({ part: 'contentDetails,statistics', id: batch.join(','), access_token: token });
        const res = await fetch(`${DATA_API}/videos?${qs}`);
        if (!res.ok) throw new Error(`videos.list failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
        const data = await res.json();
        for (const item of data.items || []) {
            const stats = item.statistics || {};
            out[item.id] = {
                durationSeconds: parseDuration(item.contentDetails?.duration || ''),
                lifetimeViews: stats.viewCount != null ? Number(stats.viewCount) : null,
                lifetimeLikes: stats.likeCount != null ? Number(stats.likeCount) : null,
            };
        }
    }
    return out;
}

async function getAnalytics(env, token, videoIds, start, end) {
    const out = {};
    if (!videoIds.length) return out;
    for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const qs = new URLSearchParams({
            ids: `channel==${env.YOUTUBE_CHANNEL_ID}`,
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
            metrics: 'views,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost',
            dimensions: 'video',
            filters: `video==${batch.join(',')}`,
            sort: '-views',
            access_token: token,
        });
        const res = await fetch(`${ANALYTICS_API}?${qs}`);
        // Best-effort — a failed analytics batch shouldn't kill the whole report,
        // same tolerance bot/youtube_stats.py uses.
        if (!res.ok) continue;
        const data = await res.json();
        const headers = (data.columnHeaders || []).map(h => h.name);
        for (const row of data.rows || []) {
            const rec = {};
            headers.forEach((h, idx) => { rec[h] = row[idx]; });
            out[rec.video] = rec;
        }
    }
    return out;
}

function parseDuration(iso) {
    const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
    if (!m) return null;
    const h = parseInt(m[1] || '0', 10);
    const mi = parseInt(m[2] || '0', 10);
    const s = parseInt(m[3] || '0', 10);
    return h * 3600 + mi * 60 + s;
}

function clamp(n, min, max, fallback) {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

function _timingSafeEqual(a, b) {
    const bufA = new TextEncoder().encode(a);
    const bufB = new TextEncoder().encode(b);
    const len = Math.max(bufA.length, bufB.length, 1);
    let diff = bufA.length ^ bufB.length;
    for (let i = 0; i < len; i++) diff |= (bufA[i] || 0) ^ (bufB[i] || 0);
    return diff === 0;
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
