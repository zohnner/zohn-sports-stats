// ============================================================
// Visit beacon (D-183): the anonymous new-visitor fields on the page_views
// log -- sport bucketing, entry channel, per-tab sequence, first-visit flag --
// plus the server-side validation in functions/api/track.js.
// Run: node --test tests/visitBeacon.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'visitBeacon.js'), 'utf8');
function load() {
    const ctx = { console, JSON, Array, Object, String, Number, Math, URL, parseInt, decodeURIComponent };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'visitBeacon.js' });
    return vm.runInContext('VisitBeacon', ctx);
}

function store(init = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
const env = (o = {}) => ({ local: store(), session: store(), referrer: '', host: 'sportstrata.cc', pathname: '/', search: '', ...o });

test('sportOf: sport prefixes, home, static pages, and shared views', () => {
    const V = load();
    assert.equal(V.sportOf('home'), 'home');
    assert.equal(V.sportOf('mlb-player-660271'), 'mlb');
    assert.equal(V.sportOf('ncaab-game-1'), 'ncaab');
    assert.equal(V.sportOf('static-page-nfl'), 'nfl');
    // These were logged as 'nba' before D-183.
    assert.equal(V.sportOf('news'), 'shared');
    assert.equal(V.sportOf('arcade'), 'shared');
    assert.equal(V.sportOf('account'), 'shared');
});

test('refBucket: referrer hosts map to fixed buckets', () => {
    const V = load();
    const r = (ref, search) => V.refBucket(ref, 'sportstrata.cc', search);
    assert.equal(r(''), 'direct');
    assert.equal(r('https://sportstrata.cc/nfl/stories/x'), 'internal');
    assert.equal(r('https://www.google.com/'), 'google');
    assert.equal(r('https://www.google.co.uk/'), 'google');
    assert.equal(r('https://gemini.google.com/app'), 'ai');
    assert.equal(r('https://duckduckgo.com/'), 'search');
    assert.equal(r('https://old.reddit.com/r/nfl'), 'reddit');
    assert.equal(r('https://t.co/abc'), 'x');
    assert.equal(r('https://x.com/someone'), 'x');
    assert.equal(r('https://chatgpt.com/'), 'ai');
    assert.equal(r('https://notreddit.com.evil.io/'), 'other');
    assert.equal(r('not a url'), 'other');
});

test('refBucket: utm_source wins over referrer and is bucketed, never passed raw', () => {
    const V = load();
    assert.equal(V.refBucket('https://t.co/x', 'sportstrata.cc', '?utm_source=reddit'), 'reddit');
    assert.equal(V.refBucket('', 'sportstrata.cc', '?a=1&utm_source=Twitter'), 'x');
    assert.equal(V.refBucket('', 'sportstrata.cc', '?utm_source=<script>'), 'other');
});

test('payload: first visit is new, entry carries ref + path, later pages do not', () => {
    const V = load();
    const e = env({ referrer: 'https://www.reddit.com/r/fantasyfootball', pathname: '/nfl/stories/week-5' });
    const p1 = V.payload('static-page-nfl', e);
    assert.deepEqual({ ...p1 }, { sport: 'nfl', view: 'static-page-nfl', seq: 1, isNew: 1, ref: 'reddit', path: '/nfl/stories/week-5' });
    const p2 = V.payload('nfl-player-4046', e);
    assert.equal(p2.seq, 2);
    assert.equal(p2.isNew, 1, "a new visitor's 2nd page still counts as new");
    assert.equal('ref' in p2, false);
    assert.equal('path' in p2, false);
});

test('payload: a later session on the same browser is returning', () => {
    const V = load();
    const local = store();
    V.payload('home', env({ local }));
    const p = V.payload('home', env({ local, session: store() }));
    assert.equal(p.isNew, 0);
    assert.equal(p.seq, 1);
});

test('payload: seq survives a full page load in the same tab', () => {
    const V1 = load();
    const e = env();
    V1.payload('home', e);
    const V2 = load();
    assert.equal(V2.payload('mlb-games', e).seq, 2);
});

test('payload: blocked storage -> isNew unknown, seq still counts in memory', () => {
    const V = load();
    const e = env({ local: throwing, session: throwing });
    const a = V.payload('home', e), b = V.payload('mlb-games', e);
    assert.equal(a.isNew, null);
    assert.equal(a.seq, 1);
    assert.equal(b.seq, 2);
    assert.equal('ref' in b, false);
});

test('payload: view is capped at 64 chars', () => {
    const V = load();
    assert.equal(V.payload('x'.repeat(100), env()).view.length, 64);
});

test('track.js parseRow: validates and drops bad optional fields', async () => {
    const { parseRow } = await import(pathToFileURL(path.join(__dirname, '..', 'functions', 'api', 'track.js')).href);
    assert.equal(parseRow(null), null);
    assert.equal(parseRow({ sport: 'cricket', view: 'x' }), null);
    // D-149 shape still accepted (old cached clients).
    assert.deepEqual(parseRow({ sport: 'mlb', view: 'mlb-games' }),
        { sport: 'mlb', view: 'mlb-games', seq: null, isNew: null, ref: null, path: null });
    assert.deepEqual(parseRow({ sport: 'shared', view: 'news', seq: 1, isNew: 1, ref: 'google', path: '/mlb/player/1/x' }),
        { sport: 'shared', view: 'news', seq: 1, isNew: 1, ref: 'google', path: '/mlb/player/1/x' });
    // ref/path only kept on the entry row; free-form values never stored.
    const r = parseRow({ sport: 'nfl', view: 'nfl-games', seq: 2, isNew: 0, ref: 'google', path: '/nfl' });
    assert.equal(r.ref, null); assert.equal(r.path, null);
    const bad = parseRow({ sport: 'nfl', view: 'v', seq: 1, isNew: 'yes', ref: 'https://evil.io', path: '/<b>' });
    assert.equal(bad.isNew, null); assert.equal(bad.ref, null); assert.equal(bad.path, null);
    assert.equal(parseRow({ sport: 'nfl', view: 'v', seq: 0 }).seq, null);
    assert.equal(parseRow({ sport: 'nfl', view: 'v', seq: 1.5 }).seq, null);
});
