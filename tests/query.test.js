// ============================================================
// Ask Bar (D-039) — parser + engine tests. Loads mlb.js (entity
// sources: MLB_LEADER_CATS, _mlbPosMatch, _mlbIpToNum) and query.js
// in one vm context, with fixture leader splits.
// Run: node --test tests/query.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MLB_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'mlb.js'), 'utf8');
const QUERY_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'query.js'), 'utf8');

function load() {
    const noop = () => {};
    const ctx = {
        console, setTimeout, clearTimeout, setInterval, clearInterval,
        URL, URLSearchParams, AbortController, Date, Math, JSON, Promise,
        encodeURIComponent, decodeURIComponent,
        AppState: { currentSport: 'mlb' },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        Logger: { info: noop, debug: noop, warn: noop, error: noop, time: async (l, fn) => fn() },
        ApiCache: { get: () => null, set: noop, invalidate: noop, TTL: { SHORT: 1, MEDIUM: 2, LONG: 3, DAILY: 4 } },
        _escHtml: v => String(v),
        _normName: v => String(v).toLowerCase(),
        navigator: {},
        document: {
            getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
            addEventListener: noop, removeEventListener: noop,
            createElement: () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, addEventListener: noop, appendChild: noop }),
            body: { appendChild: noop, addEventListener: noop },
            documentElement: { setAttribute: noop, getAttribute: () => null },
        },
        fetch: async () => { throw new Error('network disabled'); },
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(MLB_SRC, ctx, { filename: 'mlb.js' });
    vm.runInContext(QUERY_SRC, ctx, { filename: 'query.js' });
    return ctx;
}

const hit = (id, name, team, pos, stat) => ({ player: { id, fullName: name }, team: { abbreviation: team }, position: { abbreviation: pos }, stat });
const FIXTURE = {
    hitting: [
        hit(1, 'Slug One', 'LAD', 'SS', { homeRuns: 30, avg: '.310', ops: '.950', plateAppearances: 350 }),
        hit(2, 'Slug Two', 'NYY', '1B', { homeRuns: 25, avg: '.290', ops: '.900', plateAppearances: 300 }),
        hit(3, 'Slug Three', 'LAD', 'CF', { homeRuns: 20, avg: '.330', ops: '.880', plateAppearances: 320 }),
        hit(4, 'Small Sample', 'BOS', 'C', { homeRuns: 5, avg: '.400', ops: '1.200', plateAppearances: 40 }),
    ],
    pitching: [
        hit(11, 'Ace Starter', 'LAD', 'P', { era: '2.10', inningsPitched: '110.2', gamesStarted: 18, gamesPlayed: 18, saves: 0, strikeOuts: 140 }),
        hit(12, 'Mid Starter', 'NYY', 'P', { era: '3.50', inningsPitched: '95.0', gamesStarted: 16, gamesPlayed: 16, saves: 0, strikeOuts: 100 }),
        hit(13, 'Elite Closer', 'SD', 'P', { era: '1.50', inningsPitched: '30.0', gamesStarted: 0, gamesPlayed: 30, saves: 22, strikeOuts: 45 }),
        hit(14, 'Setup Guy', 'TB', 'P', { era: '2.80', inningsPitched: '28.0', gamesStarted: 0, gamesPlayed: 29, saves: 1, strikeOuts: 38 }),
    ],
};

test('parse: basic stat + noise words', () => {
    const ctx = load();
    const p = ctx.parseStatQuery('hr leaders');
    assert.equal(p.cat.key, 'homeRuns');
    assert.equal(p.group, 'hitting');
    assert.equal(p.team, null);
});

test('parse: team + stat, and two-token entities', () => {
    const ctx = load();
    assert.equal(ctx.parseStatQuery('dodgers ops').team, 'LAD');
    const p = ctx.parseStatQuery('red sox home runs');
    assert.equal(p.team, 'BOS');
    assert.equal(p.cat.key, 'homeRuns');
});

test('parse: position + stat phrase', () => {
    const ctx = load();
    const p = ctx.parseStatQuery('ss batting average');
    assert.equal(p.pos, 'ss');
    assert.equal(p.cat.key, 'avg');
});

test('parse: qualifier extraction', () => {
    const ctx = load();
    const p = ctx.parseStatQuery('era leaders min 50 ip');
    assert.equal(p.cat.key, 'era');
    assert.equal(p.group, 'pitching');
    assert.equal(p.qual.type, 'ip');   // field asserts — vm-realm objects fail deepStrictEqual
    assert.equal(p.qual.n, 50);
});

test('parse: ambiguous stat group — pref + hint override', () => {
    const ctx = load();
    assert.equal(ctx.parseStatQuery('strikeouts').group, 'pitching');       // announcer default
    assert.equal(ctx.parseStatQuery('hitters strikeouts').group, 'hitting'); // explicit hint wins
    assert.equal(ctx.parseStatQuery('closers saves').pos, 'cl');
});

test('parse: no stat → null; leftover tokens preserved', () => {
    const ctx = load();
    assert.equal(ctx.parseStatQuery('asdf qwerty'), null);
    const p = ctx.parseStatQuery('judge hr');
    assert.equal(p.cat.key, 'homeRuns');
    assert.equal(p.leftover.length, 1); // field asserts — vm-realm arrays fail deepStrictEqual
    assert.equal(p.leftover[0], 'judge');
});

test('run: counting stat sorts desc, no default qual', () => {
    const ctx = load();
    ctx.AppState.mlbLeaderSplits = FIXTURE;
    const r = ctx.runStatQuery(ctx.parseStatQuery('hr leaders'));
    assert.equal(r.rows[0].player.fullName, 'Slug One');
    assert.equal(r.rows.length, 4);            // Small Sample included — counting stats have no min
    assert.equal(r.qual, null);
});

test('run: rate stat applies default qualification', () => {
    const ctx = load();
    ctx.AppState.mlbLeaderSplits = FIXTURE;
    const r = ctx.runStatQuery(ctx.parseStatQuery('batting average leaders'));
    assert.equal(r.defaultQual, true);
    assert.ok(!r.rows.some(s => s.player.fullName === 'Small Sample'), '40-PA player excluded by 80-PA default');
    assert.equal(r.rows[0].player.fullName, 'Slug Three'); // .330 tops qualified
});

test('run: era sorts ascending; ip qualifier uses thirds notation', () => {
    const ctx = load();
    ctx.AppState.mlbLeaderSplits = FIXTURE;
    const r = ctx.runStatQuery(ctx.parseStatQuery('era leaders min 100 ip'));
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].player.fullName, 'Ace Starter'); // 110.2 = 110⅔ ≥ 100
});

test('run: team filter + closer role classification', () => {
    const ctx = load();
    ctx.AppState.mlbLeaderSplits = FIXTURE;
    const lad = ctx.runStatQuery(ctx.parseStatQuery('dodgers hr'));
    assert.equal(lad.rows.map(s => s.player.fullName).join(','), 'Slug One,Slug Three');
    const cl = ctx.runStatQuery(ctx.parseStatQuery('closers era'));
    assert.equal(cl.rows.length, 1);
    assert.equal(cl.rows[0].player.fullName, 'Elite Closer'); // Setup Guy: 1 save → rp
});

test('run: pool not warmed → null (panel skipped, never an error)', () => {
    const ctx = load();
    ctx.AppState.mlbLeaderSplits = null;
    assert.equal(ctx.runStatQuery(ctx.parseStatQuery('hr leaders')), null);
});
