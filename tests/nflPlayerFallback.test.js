// ============================================================
// NFL player pages — browser fallback for the four ESPN player proxies
// (/api/nflplayer, nflathlete, nflcareer, nflgamelog). ESPN 403s them from
// Cloudflare (seen live 2026-11-16), so js/config.js rebuilds each response in
// the browser. Each proxy and its port run on the same ESPN payload here and
// must return identical JSON.
// Fixture: trimmed real ESPN responses for Jordan Love (GB), 2026.
// Run: node --test tests/nflPlayerFallback.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nfl-player-espn-love-trim.json'), 'utf8'));
const ID = '4036378';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ESPN as seen from a browser: every route the player pages need, nothing else.
function espn(url) {
    const u = String(url);
    if (/\/teams\/9\/roster$/.test(u)) return json(F.roster);
    if (u.includes(`/seasons/2026/types/2/athletes/${ID}/statistics`)) return json(F.stats);
    if (u.endsWith(`/athletes/${ID}/stats`)) return json(F.career);
    if (u.includes(`/athletes/${ID}/gamelog?season=2026`)) return json(F.gamelog);
    if (u.endsWith(`/athletes/${ID}`)) return json(F.athlete);
    return json({ error: 'not found' }, 404);
}

async function proxy(name, query, upstream = espn) {
    const mod = await import(pathToFileURL(path.join(ROOT, 'functions', 'api', `${name}.js`)).href);
    const saved = globalThis.fetch;
    globalThis.fetch = async (u) => upstream(u);
    try {
        const res = await mod.onRequest({ request: new Request(`https://sportstrata.test/api/${name}?${query}`) });
        return res.json();
    } finally { globalThis.fetch = saved; }
}

// config.js in a browser-like sandbox. `api` answers same-origin /api/* calls.
function browser(api, upstream = espn) {
    const noop = () => {};
    const calls = [];
    const ctx = {
        console, Math, Date, JSON, Map, Set, Array, Number, String, Object, Promise, URL, URLSearchParams, Response,
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        document: { addEventListener: noop },
        location: { origin: 'https://sportstrata.test' },
        fetch: async (u) => {
            calls.push(String(u));
            return String(u).startsWith('/api/') ? api(String(u)) : upstream(u);
        },
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'), ctx, { filename: 'config.js' });
    return { ctx, calls, get: async (u) => JSON.parse(JSON.stringify(await (await ctx._espnFetch(u)).json())) };
}

const BLOCKED = {
    nflplayer: { found: false, reason: 'roster fetch failed', status: 403, season: 2026 },
    nflathlete: { found: false, reason: 'athlete fetch failed', status: 403 },
    nflcareer: { found: false, reason: 'career fetch failed', status: 403 },
    nflgamelog: { found: false, reason: 'gamelog fetch failed', status: 403 },
};
const CASES = [
    ['nflplayer', 'name=Jordan%20Love&team=GB&season=2026'],
    ['nflathlete', `id=${ID}`],
    ['nflcareer', `id=${ID}`],
    ['nflgamelog', `id=${ID}&season=2026`],
];

for (const [name, query] of CASES) {
    test(`${name}: the browser fallback returns exactly what the proxy would`, async () => {
        const want = await proxy(name, query);
        assert.equal(want.found, true, 'fixture exercises a real hit');
        const b = browser(() => json(BLOCKED[name]));
        const got = await b.get(`/api/${name}?${query}`);
        assert.deepEqual(got, want);
        assert.ok(b.calls.some(u => /espn\.com/.test(u)), 'went to ESPN directly');
    });
}

// NCAAF's game log proxy (/api/ncaafgamelog) has the NFL one's shape and the same
// 403. Fixture: Drew Mestemaker's 2026 log (3 games), plus one season type
// relabelled "Bowls" by hand so the college-only postseason rule is exercised.
const CFB = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ncaaf-gamelog-mestemaker-trim.json'), 'utf8'));
const cfb = u => (String(u).includes('/college-football/athletes/5219834/gamelog?season=2026') ? json(CFB) : json({}, 404));

test('ncaafgamelog: the browser fallback returns exactly what the proxy would', async () => {
    const want = await proxy('ncaafgamelog', 'id=5219834&season=2026', cfb);
    assert.equal(want.found, true);
    assert.ok(want.games.some(g => g.post), 'fixture has a bowl game');
    const b = browser(() => json({ found: false, reason: 'gamelog fetch failed', status: 403 }), cfb);
    assert.deepEqual(await b.get('/api/ncaafgamelog?id=5219834&season=2026'), want);
});

test('a proxy that answered "not on roster" is trusted, not retried against ESPN', async () => {
    const b = browser(() => json({ found: false, reason: 'not on roster', season: 2026 }));
    const got = await b.get('/api/nflplayer?name=Nobody%20Here&team=GB&season=2026');
    assert.equal(got.reason, 'not on roster');
    assert.ok(!b.calls.some(u => /espn\.com/.test(u)));
});

test('a proxy that is down entirely (5xx) also falls back', async () => {
    const b = browser(() => new Response('error code: 502', { status: 502 }));
    const got = await b.get(`/api/nflcareer?id=${ID}`);
    assert.equal(got.found, true);
});

test('proxy: a blocked roster fetch says so, instead of claiming the player is not on the roster', async () => {
    const got = await proxy('nflplayer', 'name=Jordan%20Love&team=GB&season=2026', () => json({}, 403));
    assert.equal(got.found, false);
    assert.equal(got.reason, 'roster fetch failed');
});

test('proxy: a blocked stats fetch says so, instead of claiming the player has no stats', async () => {
    const got = await proxy('nflplayer', 'name=Jordan%20Love&team=GB&season=2026',
        u => (/roster$/.test(String(u)) ? espn(u) : json({}, 502)));
    assert.equal(got.found, false);
    assert.equal(got.reason, 'stats fetch failed');
});

test('every script in index.html loads into one global scope without a name clash', () => {
    // Classic scripts share one global scope, so a top-level let/const/class
    // declared in two files is a SyntaxError that stops the second file loading.
    // config.js's _nflEspnSeason did exactly that to nfl.js (caught in the browser,
    // 2026-11-16). The clash is raised before any code runs, so runtime errors from
    // the missing DOM here are ignored; only SyntaxErrors count.
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const srcs = [...html.matchAll(/<script[^>]*\ssrc="(js\/[^"?]+)/g)].map(m => m[1]);
    assert.ok(srcs.length > 40, 'found the script chain');
    const ctx = vm.createContext({});
    const clashes = [];
    for (const s of srcs) {
        try { vm.runInContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), ctx, { filename: s }); }
        catch (e) { if (e.name === 'SyntaxError') clashes.push(`${s}: ${e.message}`); }
    }
    assert.deepEqual(clashes, []);
});

test('fallback: a player truly not on the roster comes back "not on roster", not a failure', async () => {
    const b = browser(() => json(BLOCKED.nflplayer));
    const got = await b.get('/api/nflplayer?name=Nobody%20Here&team=GB&season=2026');
    assert.equal(got.reason, 'not on roster');
});
