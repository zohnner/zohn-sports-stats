// ============================================================
// NFL scoreboard fetch — the live poll must reach the network.
// Live-observed 2026-10-04: setupNFLLivePolling ticked every 60s but
// fetchNFLScoreboard served ApiCache.TTL.SHORT (5 min), so the Scores page,
// ticker, and home hero refreshed every ~5 minutes during live games.
// Run: node --test tests/nflScoreboardFetch.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'nfl.js'), 'utf8');

function load() {
    const noop = () => {};
    const storage = () => ({ getItem: () => null, setItem: noop, removeItem: noop });
    const cache = new Map();
    const net = { calls: 0 };
    const ctx = {
        console, Math, Date, JSON, Map, Set, Array, URL, AbortController, setTimeout, clearTimeout, Promise,
        sessionStorage: storage(), localStorage: storage(),
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        location: { origin: 'https://sportstrata.test' },
        ApiCache: {
            TTL: { SHORT: 300000, MEDIUM: 1800000, LONG: 3600000, DAILY: 43200000 },
            get: (k) => cache.get(k) || null,
            set: (k, v) => { cache.set(k, v); },
        },
        fetch: async () => {
            net.calls++;
            return { ok: true, json: async () => ({ season: { type: 2 }, events: [] }) };
        },
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'nfl.js' });
    return { ctx, net };
}

test('default scoreboard fetch is served from cache on the second call', async () => {
    const { ctx, net } = load();
    await ctx.fetchNFLScoreboard();
    await ctx.fetchNFLScoreboard();
    assert.equal(net.calls, 1);
});

test('fresh scoreboard fetch bypasses the cache every time', async () => {
    const { ctx, net } = load();
    await ctx.fetchNFLScoreboard({ fresh: true });
    await ctx.fetchNFLScoreboard({ fresh: true });
    assert.equal(net.calls, 2);
});

test('fresh fetch still refreshes the cache for everyone else', async () => {
    const { ctx, net } = load();
    await ctx.fetchNFLScoreboard({ fresh: true });
    await ctx.fetchNFLScoreboard();
    assert.equal(net.calls, 1);
});

test('fresh is not sent upstream as a query param', async () => {
    const { ctx } = load();
    let url = '';
    ctx.fetch = async (u) => { url = u; return { ok: true, json: async () => ({ events: [] }) }; };
    await ctx.fetchNFLScoreboard({ fresh: true });
    assert.doesNotMatch(url, /fresh/);
});
