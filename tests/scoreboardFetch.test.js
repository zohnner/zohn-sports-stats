// ============================================================
// Scoreboard fetch — every sport's live poll must be able to reach the
// network. D-170 found NFL's 60s poll reading a 5-minute ApiCache entry
// 4 ticks out of 5; NCAAF/NCAAB/WNBA/NBA share the identical fetch helper
// shape, so the same { fresh } contract is asserted for all five here.
// Run: node --test tests/scoreboardFetch.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SPORTS = [
    ['nfl', 'fetchNFLScoreboard'],
    ['ncaaf', 'fetchNCAAFScoreboard'],
    ['ncaab', 'fetchNCAABScoreboard'],
    ['wnba', 'fetchWNBAScoreboard'],
    ['nba', 'fetchNBAScoreboard'],
];

function load(file) {
    const noop = () => {};
    const storage = () => ({ getItem: () => null, setItem: noop, removeItem: noop });
    const cache = new Map();
    const net = { calls: 0, urls: [] };
    const ctx = {
        console, Math, Date, JSON, Map, Set, Array, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Promise,
        sessionStorage: storage(), localStorage: storage(),
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        location: { origin: 'https://sportstrata.test' },
        ApiCache: {
            TTL: { SHORT: 300000, MEDIUM: 1800000, LONG: 3600000, DAILY: 43200000 },
            get: (k) => cache.get(k) || null,
            set: (k, v) => { cache.set(k, v); },
        },
        fetch: async (u) => {
            net.calls++; net.urls.push(String(u));
            return { ok: true, json: async () => ({ season: { type: 2, year: 2026 }, events: [] }) };
        },
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', `${file}.js`), 'utf8'), ctx, { filename: `${file}.js` });
    return { ctx, net };
}

for (const [file, fn] of SPORTS) {
    test(`${file}: default scoreboard fetch is served from cache on the second call`, async () => {
        const { ctx, net } = load(file);
        await ctx[fn]();
        await ctx[fn]();
        assert.equal(net.calls, 1);
    });

    test(`${file}: fresh scoreboard fetch bypasses the cache every time`, async () => {
        const { ctx, net } = load(file);
        await ctx[fn]({ fresh: true });
        await ctx[fn]({ fresh: true });
        assert.equal(net.calls, 2);
    });

    test(`${file}: fresh fetch still refreshes the cache for everyone else`, async () => {
        const { ctx, net } = load(file);
        await ctx[fn]({ fresh: true });
        await ctx[fn]();
        assert.equal(net.calls, 1);
    });

    test(`${file}: fresh is never sent upstream as a query param`, async () => {
        const { ctx, net } = load(file);
        await ctx[fn]({ fresh: true });
        assert.doesNotMatch(net.urls[0], /fresh/);
    });
}
