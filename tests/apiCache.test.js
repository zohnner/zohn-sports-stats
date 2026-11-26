// ============================================================
// ApiCache size cap (js/cache.js). A cold home load wrote ~7 MB of raw
// payloads into a ~5 MB localStorage, so every first visit hit the quota and
// wiped the whole cache. Entries over 256K chars now stay in memory.
// Run: node --test tests/apiCache.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'cache.js'), 'utf8');

// A localStorage stub with a real quota, counted in characters like browsers.
function quotaStorage(limit = 5 * 1024 * 1024) {
    const m = new Map();
    const used = () => [...m].reduce((t, [k, v]) => t + k.length + v.length, 0);
    const s = {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => {
            v = String(v);
            if (used() - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + v.length > limit) {
                const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
            }
            m.set(k, v);
        },
        removeItem: k => m.delete(k),
        get length() { return m.size; },
        key: i => [...m.keys()][i],
    };
    return new Proxy(s, { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: (t, k) => (m.has(k) ? { enumerable: true, configurable: true, value: m.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)) });
}

function load(storage = quotaStorage()) {
    const noop = () => {};
    const toasts = [];
    const ctx = {
        console, JSON, Date, Map, Object, localStorage: storage,
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        ErrorHandler: { toast: (...a) => toasts.push(a) },
        requestAnimationFrame: fn => fn(),
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'cache.js' });
    return { ApiCache: ctx.ApiCache, storage, toasts };
}

const big = kb => ({ events: [{ blob: 'x'.repeat(kb * 1024) }] });

test('a payload over the cap is cached in memory, never written to localStorage', () => {
    const { ApiCache, storage } = load();
    ApiCache.set('ncaaf:/scoreboard', big(1200));
    assert.equal(storage.getItem('zs_cache_ncaaf:/scoreboard'), null);
    assert.equal(ApiCache.get('ncaaf:/scoreboard').events[0].blob.length, 1200 * 1024);
    assert.equal(typeof ApiCache.getTimestamp('ncaaf:/scoreboard'), 'number');
});

test('a small payload still persists to localStorage', () => {
    const { ApiCache, storage } = load();
    ApiCache.set('nfl:/standings', { a: 1 });
    assert.ok(storage.getItem('zs_cache_nfl:/standings'));
    assert.deepEqual(ApiCache.get('nfl:/standings'), { a: 1 });
});

test('the measured cold home load (~7 MB of payloads) no longer evicts other entries or toasts', () => {
    const { ApiCache, storage, toasts } = load();
    ApiCache.set('nfl:/standings', { kept: true });
    for (const [k, kb] of [['ncaaf:/scoreboard', 1273], ['ncaab:/scoreboard', 1144], ['mlb/stats/pitching', 928],
        ['mlb/stats/hitting', 624], ['mlb/stats/fielding', 605], ['ncaaf:/rankings', 546], ['nfl:/scoreboard', 280],
        ['ncaab:/rankings', 270], ['nba:/scoreboard', 150]]) ApiCache.set(k, big(kb));
    assert.deepEqual(ApiCache.get('nfl:/standings'), { kept: true }, 'a small entry survived');
    assert.equal(toasts.length, 0);
    assert.ok(ApiCache.get('ncaaf:/scoreboard'));
    assert.ok(storage.length <= 2);
});

test('each read of a memory entry is a fresh copy, as from localStorage', () => {
    const { ApiCache } = load();
    ApiCache.set('k', big(300));
    ApiCache.get('k').events.push('mutated');
    assert.equal(ApiCache.get('k').events.length, 1);
});

test('memory entries expire on their TTL', () => {
    const { ApiCache } = load();
    ApiCache.set('k', big(300), -1);
    assert.equal(ApiCache.get('k'), null);
    assert.equal(ApiCache.getTimestamp('k'), null);
});

test('invalidate clears memory entries by prefix too', () => {
    const { ApiCache } = load();
    ApiCache.set('ncaaf:/scoreboard', big(300));
    ApiCache.set('nba:/scoreboard', big(300));
    ApiCache.invalidate('ncaaf');
    assert.equal(ApiCache.get('ncaaf:/scoreboard'), null);
    assert.ok(ApiCache.get('nba:/scoreboard'));
});

test('a payload that grows past the cap replaces its stale localStorage copy', () => {
    const { ApiCache, storage } = load();
    ApiCache.set('k', { small: true });
    ApiCache.set('k', big(300));
    assert.equal(storage.getItem('zs_cache_k'), null);
    assert.equal(ApiCache.get('k').events.length, 1);
});
