// ============================================================
// NCAAB Leaders (#191): /api/ncaabstats and its browser fallback in
// js/config.js (_espnLeadersResponse) read the same ESPN site/v3 feed and must
// return identical JSON, minus FG% and FT% (ESPN applies no attempts minimum
// for college, so its 2026-11-17 FG% leader shot 85.7%).
// Fixture: trimmed real ESPN response, 2026-11-17 (2026-27 season).
// Run: node --test tests/ncaabLeaders.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ncaab-leaders-v3-trim.json'), 'utf8'));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// One leader without a headshot, to prove the team logo still comes through.
function feed() {
    const f = JSON.parse(JSON.stringify(FIXTURE));
    delete f.leaders.categories.find(c => c.name === 'pointsPerGame').leaders[1].athlete.headshot;
    return f;
}
const espn = (f = feed()) => url => /mens-college-basketball\/leaders\?seasontype=2/.test(String(url)) ? json(f) : json({ error: 'not found' }, 404);

async function proxy(query, upstream = espn()) {
    const mod = await import(pathToFileURL(path.join(ROOT, 'functions', 'api', 'ncaabstats.js')).href);
    const saved = globalThis.fetch;
    globalThis.fetch = async u => upstream(u);
    try {
        const res = await mod.onRequest({ request: new Request(`https://sportstrata.test/api/ncaabstats${query}`) });
        return { status: res.status, body: await res.json() };
    } finally { globalThis.fetch = saved; }
}

function browser(upstream = espn()) {
    const noop = () => {};
    const calls = [];
    const ctx = {
        console, Math, Date, JSON, Map, Set, Array, Number, String, Object, Promise, URL, URLSearchParams, Response,
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        document: { addEventListener: noop },
        location: { origin: 'https://sportstrata.test' },
        fetch: async u => {
            calls.push(String(u));
            return String(u).startsWith('/api/') ? json({ error: 'leaders fetch failed', detail: 'status 403' }, 502) : upstream(u);
        },
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'), ctx, { filename: 'config.js' });
    return { calls, get: async u => JSON.parse(JSON.stringify(await (await ctx._espnFetch(u)).json())) };
}

test('ncaabstats: six per-game categories, no shooting percentages, logo and headshot per row', async () => {
    const { status, body } = await proxy('?season=2027');
    assert.equal(status, 200);
    assert.equal(body.season, 2027);
    assert.deepEqual(body.categories.map(c => c.unit), ['PPG', 'RPG', 'APG', 'SPG', 'BPG', '3PM']);
    const ppg = body.categories[0].leaders;
    assert.equal(ppg.length, 5, 'top 5 of the 6 in the feed');
    assert.equal(ppg[0].name, 'Dior Johnson');
    assert.equal(ppg[0].team, 'UCF');
    assert.equal(ppg[0].value, '29.5');
    assert.match(ppg[0].headshot, /mens-college-basketball\/players\/full\/\d+\.png$/);
    assert.equal(ppg[1].headshot, '');
    assert.match(ppg[1].logo, /teamlogos\/ncaa\/500\/\d+\.png$/);
});

test('ncaab leaders: the browser fallback returns exactly what the proxy would', async () => {
    const want = (await proxy('?season=2027')).body;
    const b = browser();
    const got = await b.get('/api/ncaabstats?season=2027');
    assert.deepEqual(got, want);
    assert.ok(b.calls.some(u => /site\.web\.api\.espn\.com\/apis\/site\/v3\/sports\/basketball\/mens-college-basketball\/leaders/.test(u)), 'went to ESPN directly');
});

test('ncaab leaders: a feed without the six categories is a failure, not an empty page', async () => {
    const empty = espn({ leaders: { categories: FIXTURE.leaders.categories.filter(c => /Pct|Percentage/.test(c.name)) } });
    assert.equal((await proxy('', empty)).status, 502);
});
