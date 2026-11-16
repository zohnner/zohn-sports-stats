// GET /api/stats: key-gated, read-only aggregates over page_views.
// Run: node --test tests/statsRoute.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const mod = () => import(pathToFileURL(path.join(__dirname, '..', 'functions', 'api', 'stats.js')).href);

const ROWS = {
    bySport: [{ sport: 'nba', views: 100, new_sessions: 20 }],
    byChannel: [{ channel: 'direct', entries: 50 }, { channel: 'tiktok', entries: 9 }],
    topEntries: [{ path: '/', entries: 30 }],
    stories: [{ view: 'story:2026-01-01-example-story', views: 12, entries: 7 }],
    daily: [{ day: '2026-01-01', views: 40, entries: 9 }],
};

function fakeDb(log = []) {
    return {
        prepare(sql) { return { sql, bind(...args) { return { sql, args }; } }; },
        async batch(stmts) {
            log.push(...stmts);
            return Object.keys(ROWS).map(k => ({ results: ROWS[k] }));
        },
    };
}
const req = (url, headers = {}, method = 'GET') => new Request(url, { method, headers });
const call = async (request, env) => (await mod()).onRequest({ request, env });

test('windowDays: default 14, clamped to 1..90, junk falls back', async () => {
    const { windowDays } = await mod();
    assert.equal(windowDays(null), 14);
    assert.equal(windowDays('7'), 7);
    assert.equal(windowDays('0'), 1);
    assert.equal(windowDays('9999'), 90);
    assert.equal(windowDays('abc'), 14);
    assert.equal(windowDays('7.9'), 7);
});

test('every query is a single read-only aggregate bound to the window', async () => {
    const { QUERIES } = await mod();
    assert.deepEqual(Object.keys(QUERIES), ['bySport', 'byChannel', 'topEntries', 'stories', 'daily']);
    for (const [name, sql] of Object.entries(QUERIES)) {
        assert.match(sql, /^SELECT /, name);
        assert.match(sql, /GROUP BY/, `${name} aggregates`);
        assert.equal((sql.match(/\?/g) || []).length, 1, `${name} binds the window once`);
        assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|DROP|ALTER|;/i, name);
    }
});

test('fails closed: 503 with no key configured, 401 on a wrong or missing key', async () => {
    assert.equal((await call(req('https://x/api/stats'), { USER_DB: fakeDb() })).status, 503);
    assert.equal((await call(req('https://x/api/stats'), { USER_DB: fakeDb(), STATS_KEY: 'k' })).status, 401);
    assert.equal((await call(req('https://x/api/stats', { 'X-Stats-Key': 'kk' }), { USER_DB: fakeDb(), STATS_KEY: 'k' })).status, 401);
    assert.equal((await call(req('https://x/api/stats', { 'X-Stats-Key': 'k' }, 'POST'), { USER_DB: fakeDb(), STATS_KEY: 'k' })).status, 405);
});

test('a good key returns the five aggregates, shaped, and never cached', async () => {
    const log = [];
    const before = Date.now();
    const res = await call(req('https://x/api/stats?days=7', { 'X-Stats-Key': 'k' }), { USER_DB: fakeDb(log), STATS_KEY: 'k' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const body = await res.json();
    assert.equal(body.days, 7);
    assert.ok(Math.abs(body.since - (before - 7 * 86400000)) < 5000);
    assert.equal(log.length, 5);
    for (const s of log) assert.deepEqual(s.args, [body.since]);
    assert.deepEqual(body.bySport, [{ sport: 'nba', views: 100, newSessions: 20 }]);
    assert.deepEqual(body.byChannel[1], { channel: 'tiktok', entries: 9 });
    assert.deepEqual(body.topEntries, [{ path: '/', entries: 30 }]);
    assert.deepEqual(body.stories, [{ slug: '2026-01-01-example-story', views: 12, entries: 7 }]);
    assert.deepEqual(body.daily, [{ day: '2026-01-01', views: 40, entries: 9 }]);
});

test('a database error is a 502, not a crash and not a leak', async () => {
    const db = { prepare: () => ({ bind: () => ({}) }), batch: async () => { throw new Error('no such column: ref'); } };
    const res = await call(req('https://x/api/stats', { 'X-Stats-Key': 'k' }), { USER_DB: db, STATS_KEY: 'k' });
    assert.equal(res.status, 502);
    assert.doesNotMatch(await res.text(), /no such column/);
});
