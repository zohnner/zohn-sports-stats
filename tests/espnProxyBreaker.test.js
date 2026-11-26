// ============================================================
// ESPN proxy breaker (js/config.js _espnFetch) and the NFL season loops'
// persist:false (js/nfl.js).
// While ESPN blocks Cloudflare (D-176) every proxy call 403s and the browser
// falls back; the breaker skips a failed proxy for 10 minutes per endpoint.
// The 18-week NFL season loop wrote every raw weekly scoreboard to
// localStorage, filling it on a first home visit ("Caching off" toast).
// Run: node --test tests/espnProxyBreaker.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ORIGIN = 'https://sportstrata.test';
const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

function memStorage() {
    const m = new Map();
    return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

function loadConfig({ session = memStorage(), proxyStatus = 403 } = {}) {
    const noop = () => {};
    const calls = [];
    const ctx = {
        console, URL, URLSearchParams, Response, Headers, AbortController, setTimeout, clearTimeout, Promise,
        location: { origin: ORIGIN, href: ORIGIN + '/' },
        Logger: { warn: noop, info: noop, debug: noop, error: noop },
        document: { addEventListener: noop, querySelectorAll: () => [] }, navigator: {},
        localStorage: memStorage(),
        fetch: async u => {
            const own = String(u).startsWith(ORIGIN);
            calls.push({ own, url: String(u) });
            const status = own ? ctx.__proxyStatus : 200;
            return new Response(JSON.stringify({ events: [] }), { status, headers: { 'content-type': 'application/json' } });
        },
        __proxyStatus: proxyStatus,
    };
    if (session) ctx.sessionStorage = session;
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(`${read('config.js')}\n;globalThis.__espnFetch = _espnFetch;`, ctx, { filename: 'config.js' });
    return { ctx, calls, session };
}

const SCOREBOARD = `${ORIGIN}/api/nfl?path=%2Fscoreboard`;

test('a failed proxy is tried once, then skipped: the second call goes straight to ESPN', async () => {
    const { ctx, calls } = loadConfig();
    const r1 = await ctx.__espnFetch(SCOREBOARD);
    assert.equal(r1.status, 200);
    assert.deepEqual(calls.map(c => c.own), [true, false]);
    calls.length = 0;
    const r2 = await ctx.__espnFetch(SCOREBOARD);
    assert.equal(r2.status, 200);
    assert.deepEqual(calls.map(c => c.own), [false], 'proxy must be skipped while marked down');
});

test('18 concurrent calls to a dead proxy pay one proxy round trip, not 18', async () => {
    const { ctx, calls } = loadConfig();
    const weeks = Array.from({ length: 18 }, (_, i) => ctx.__espnFetch(`${SCOREBOARD}&seasontype=2&week=${i + 1}`));
    const res = await Promise.all(weeks);
    assert.ok(res.every(r => r.status === 200));
    assert.equal(calls.filter(c => c.own).length, 1);
    assert.equal(calls.filter(c => !c.own).length, 18);
});

test('concurrent calls to a healthy proxy all use the proxy', async () => {
    const { ctx, calls } = loadConfig({ proxyStatus: 200 });
    await Promise.all([1, 2, 3].map(w => ctx.__espnFetch(`${SCOREBOARD}&week=${w}`)));
    assert.deepEqual(calls.map(c => c.own), [true, true, true]);
});

test('the skip is per endpoint: a dead /api/nfl does not skip /api/nflstandings', async () => {
    const { ctx, calls } = loadConfig();
    await ctx.__espnFetch(SCOREBOARD);
    calls.length = 0;
    await ctx.__espnFetch(`${ORIGIN}/api/nflstandings?season=2026`);
    assert.equal(calls[0].own, true);
    assert.match(calls[0].url, /\/api\/nflstandings/);
});

test('the proxy is retried once the 10-minute window has passed', async () => {
    const { ctx, calls, session } = loadConfig();
    await ctx.__espnFetch(SCOREBOARD);
    session.setItem('ss_proxy_down:nfl', String(Date.now() - 11 * 60 * 1000));
    ctx.__proxyStatus = 200;
    calls.length = 0;
    await ctx.__espnFetch(SCOREBOARD);
    assert.deepEqual(calls.map(c => c.own), [true], 'a recovered proxy answers and nothing falls back');
});

test('a healthy proxy is never marked down', async () => {
    const { ctx, calls, session } = loadConfig({ proxyStatus: 200 });
    await ctx.__espnFetch(SCOREBOARD);
    await ctx.__espnFetch(SCOREBOARD);
    assert.deepEqual(calls.map(c => c.own), [true, true]);
    assert.equal(session.m.size, 0);
});

test('without sessionStorage (the contract monitor sandbox) the proxy is probed on every call', async () => {
    const { ctx, calls } = loadConfig({ session: null });
    await ctx.__espnFetch(SCOREBOARD);
    await ctx.__espnFetch(SCOREBOARD);
    assert.deepEqual(calls.map(c => c.own), [true, false, true, false]);
});

test('an endpoint with no browser fallback is never skipped', async () => {
    const { ctx, calls, session } = loadConfig();
    session.setItem('ss_proxy_down:nflsos', String(Date.now()));
    await ctx.__espnFetch(`${ORIGIN}/api/nflsos`).catch(() => {});
    assert.equal(calls[0]?.own, true, '/api/nflsos has no fallback, so it must still be tried');
});

// ---------------------------------------------------------------- NFL persist

function loadNFL() {
    const noop = () => {};
    const writes = [];
    const cache = new Map();
    const ctx = {
        console, Math, Date, JSON, Map, Set, Array, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Promise,
        sessionStorage: memStorage(), localStorage: memStorage(),
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        location: { origin: ORIGIN },
        ApiCache: {
            TTL: { SHORT: 300000, MEDIUM: 1800000, LONG: 3600000, DAILY: 43200000, SEASON: 1500000 },
            get: k => cache.get(k) || null,
            set: (k, v) => { writes.push(k); cache.set(k, v); },
            getTimestamp: () => null,
        },
        fetch: async () => ({ ok: true, json: async () => ({ season: { type: 2, year: 2026 }, events: [] }) }),
        noteFetched: noop,
    };
    ctx._espnFetch = (u, init) => ctx.fetch(u, init);
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('teamPage.js'), ctx, { filename: 'teamPage.js' });
    vm.runInContext(read('nfl.js'), ctx, { filename: 'nfl.js' });
    return { ctx, writes };
}

for (const fn of ['fetchNFLSeasonGames', 'fetchNFLPriorSeasonGames']) {
    test(`${fn} caches only the flattened season, never the 18 raw weekly scoreboards`, async () => {
        const { ctx, writes } = loadNFL();
        await ctx[fn]();
        assert.equal(writes.filter(k => k.startsWith('nfl:/scoreboard')).length, 0, `raw weeks written: ${writes.join(', ')}`);
        assert.equal(writes.length, 1);
    });
}

test('a plain fetchNFLScoreboard call still caches its response', async () => {
    const { ctx, writes } = loadNFL();
    await ctx.fetchNFLScoreboard();
    assert.equal(writes.filter(k => k.startsWith('nfl:/scoreboard')).length, 1);
});
