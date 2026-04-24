// ============================================================
// SportsStrata — Service Worker  v2
// Strategy: Cache-first for static assets, network-first for API calls
// Offline: navigation requests fall back to /offline.html
// ============================================================

const CACHE_NAME    = 'sportsstrata-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/css/variables.css',
    '/css/animations.css',
    '/css/main.css',
    '/css/components.css',
    '/css/ticker.css',
    '/css/arcade.css',
    '/js/config.js',
    '/js/schema.js',
    '/js/errorHandler.js',
    '/js/cache.js',
    '/js/db.js',
    '/js/api.js',
    '/js/players.js',
    '/js/playerDetail.js',
    '/js/leaderboards.js',
    '/js/teams.js',
    '/js/games.js',
    '/js/standings.js',
    '/js/charts.js',
    '/js/statBuilder.js',
    '/js/mlb.js',
    '/js/nfl.js',
    '/js/nhl.js',
    '/js/glossary.js',
    '/js/arcade.js',
    '/js/search.js',
    '/js/navigation.js',
    '/js/app.js',
];

// Install — pre-cache static shell
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate — remove stale caches
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// Fetch — cache-first for static, network-first for API
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);
    const isNavigation = e.request.mode === 'navigate';

    // Network-first for cross-origin API calls (always want fresh data)
    const isAPI = url.hostname !== self.location.hostname;
    if (isAPI) {
        e.respondWith(
            fetch(e.request).catch(() => {
                // No offline fallback for API calls — callers handle empty state
                return new Response(JSON.stringify({ error: 'offline' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' },
                });
            })
        );
        return;
    }

    // Navigation requests (full page loads) — network first, fall back to offline.html
    if (isNavigation) {
        e.respondWith(
            fetch(e.request)
                .then(resp => {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                    return resp;
                })
                .catch(() => caches.match('/offline.html'))
        );
        return;
    }

    // Cache-first for all other same-origin assets (JS, CSS, images, fonts)
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(resp => {
                if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
                const clone = resp.clone();
                caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                return resp;
            });
        })
    );
});
