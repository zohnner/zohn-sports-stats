// ============================================================
// SportStrata — Service Worker  v22
// Strategy: stale-while-revalidate for static assets, network-first for navigation
// Offline: navigation requests fall back to /offline.html
// ============================================================

const CACHE_NAME    = 'sportstrata-v23';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/favicon.ico',
    '/assets/icon-64.png',
    '/assets/icon-192.png',
    '/css/variables.css',
    '/css/animations.css',
    '/css/main.css',
    '/css/components.css',
    '/css/ticker.css',
    '/css/arcade.css',
    '/css/scorecard.css',
    '/css/liveGame.css',
    '/css/shareCard.css',
    '/js/math.min.js',
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
    '/js/scorecard.js',
    '/js/liveGame.js',
    '/js/shareCard.js',
    '/js/nfl.js',
    '/js/nhl.js',
    '/js/glossary.js',
    '/js/arcade.js',
    '/js/search.js',
    '/js/navigation.js',
    '/js/app.js',
];

// Install — pre-cache the static shell, bypassing the HTTP cache so a CACHE_NAME
// bump always lands the freshly deployed files. cache.addAll() fetches through the
// 4h must-revalidate HTTP cache and could re-cache stale code; { cache: 'reload' }
// forces each precache fetch to the network.
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(STATIC_ASSETS.map(url =>
                fetch(new Request(url, { cache: 'reload' }))
                    .then(resp => { if (resp && resp.ok) return cache.put(url, resp); })
                    .catch(() => {})
            )))
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

// Fetch — SWR for static, network-first for navigation
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);
    const isNavigation = e.request.mode === 'navigate';

    // Don't intercept cross-origin requests — let the browser handle them directly.
    // fetch() from a service worker is subject to connect-src, but images/fonts/CDN
    // scripts are permitted via img-src/style-src/script-src. Intercepting here would
    // cause the browser to block those fetches and return 503 for all external assets.
    if (url.hostname !== self.location.hostname) return;

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

    // Stale-while-revalidate for all other same-origin assets (JS, CSS, images, fonts).
    // Cache-first here previously froze deployed JS/CSS until CACHE_NAME was bumped —
    // returning users kept running old code after every deploy. SWR serves the cached
    // copy instantly but refreshes it in the background, so the next load is current.
    e.respondWith(
        caches.match(e.request).then(cached => {
            const network = fetch(e.request).then(resp => {
                if (resp && resp.status === 200 && resp.type !== 'opaque') {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return resp;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
