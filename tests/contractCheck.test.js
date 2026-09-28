// ============================================================
// Upstream contract monitor (tools/contract-*.cjs).
// Run: node --test tests/contractCheck.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../tools/contract-lib.cjs');

test('parsePath accepts keys, fixed indexes and [] steps', () => {
    assert.deepEqual(lib.parsePath('events[].competitions[0].id'), [
        { key: 'events' }, { each: true }, { key: 'competitions' }, { index: 0 }, { key: 'id' },
    ]);
});

test('parsePath rejects malformed paths with ContractError', () => {
    for (const bad of ['', 'a..b', 'a[x]', '.a', 'a.', '[0]', 'a[0', 5]) {
        assert.throws(() => lib.parsePath(bad), lib.ContractError, String(bad));
    }
});

test('checkPath passes when every element has the value', () => {
    const data = { events: [{ status: { state: 'post' } }, { status: { state: 'in' } }] };
    assert.deepEqual(lib.checkPath(data, 'events[].status.state'), []);
});

test('checkPath reports each missing location', () => {
    const data = { events: [{ status: { state: 'post' } }, { status: {} }, {}] };
    assert.deepEqual(lib.checkPath(data, 'events[].status.state'), [
        'events[1].status.state', 'events[2].status',
    ]);
});

test('checkPath treats null as missing but 0, false and "" as present', () => {
    assert.deepEqual(lib.checkPath({ a: 0, b: false, c: '' }, 'a'), []);
    assert.deepEqual(lib.checkPath({ a: 0, b: false, c: '' }, 'b'), []);
    assert.deepEqual(lib.checkPath({ a: 0, b: false, c: '' }, 'c'), []);
    assert.deepEqual(lib.checkPath({ a: null }, 'a'), ['a']);
});

test('checkPath passes vacuously on an empty [] step', () => {
    assert.deepEqual(lib.checkPath({ events: [] }, 'events[].id'), []);
});

test('checkPath flags a non-array at a [] step', () => {
    assert.deepEqual(lib.checkPath({ events: {} }, 'events[].id'), ['events (not an array)']);
});

test('checkPath follows fixed indexes and reports a missing index', () => {
    assert.deepEqual(lib.checkPath({ c: [{ id: 1 }] }, 'c[0].id'), []);
    assert.deepEqual(lib.checkPath({ c: [] }, 'c[0].id'), ['c[0]']);
});

test('getAt resolves keys and indexes, rejects []', () => {
    assert.equal(lib.getAt({ d: [{ g: [1, 2] }] }, 'd[0].g').length, 2);
    assert.equal(lib.getAt({}, 'd[0].g'), undefined);
    assert.throws(() => lib.getAt({}, 'd[].g'), lib.ContractError);
});

test('deepCollect gathers every array under a key at any depth', () => {
    const tree = { children: [
        { standings: { entries: [1, 2] } },
        { children: [{ standings: { entries: [3] } }, { standings: { entries: [4, 5] } }] },
    ] };
    assert.deepEqual(lib.deepCollect(tree, 'entries'), [1, 2, 3, 4, 5]);
});

test('minCount enforces the floor only on a full slate when fullSlateOnly', () => {
    const inv = lib.minCount('events', 8, { fullSlateOnly: true });
    const three = { events: [1, 2, 3] };
    assert.match(inv.check(three, { fullSlate: true }), /has 3, expected >= 8/);
    assert.equal(inv.check(three, { fullSlate: false }), null);
    assert.match(inv.check({ events: [] }, { fullSlate: false }), /has 0, expected >= 1/);
    assert.match(inv.check({}, {}), /not an array/);
    assert.equal(inv.severity, 'fail');
});

test('minCount rejects [] paths at definition time', () => {
    assert.throws(() => lib.minCount('events[].id', 1), lib.ContractError);
});

test('exactCount', () => {
    const inv = lib.exactCount('boxscore.teams', 2);
    assert.equal(inv.check({ boxscore: { teams: [1, 2] } }, {}), null);
    assert.match(inv.check({ boxscore: { teams: [1] } }, {}), /has 1, expected exactly 2/);
});

test('deepCount min, exact, and per-element path', () => {
    const tree = { children: [{ standings: { entries: [{ team: { abbreviation: 'BUF' } }, { team: {} }] } }] };
    assert.equal(lib.deepCount('entries', 2).check(tree, {}), null);
    assert.match(lib.deepCount('entries', 3).check(tree, {}), /found 2 "entries", expected >= 3/);
    assert.match(lib.deepCount('entries', 1, { exact: true }).check(tree, {}), /expected exactly 1/);
    assert.match(lib.deepCount('entries', 2, { each: 'team.abbreviation' }).check(tree, {}),
        /1 of 2 "entries" missing team.abbreviation/);
});

test('numeric accepts numbers and numeric strings, rejects the rest', () => {
    const inv = lib.numeric('c[].score');
    assert.equal(inv.check({ c: [{ score: 3 }, { score: '14' }, { score: 0 }] }, {}), null);
    assert.match(inv.check({ c: [{ score: 'N/A' }, { score: '' }] }, {}), /2 non-numeric/);
});

test('eachNonEmpty', () => {
    const inv = lib.eachNonEmpty('categories[].leaders');
    assert.equal(inv.check({ categories: [{ leaders: [1] }, { leaders: [1, 2] }] }, {}), null);
    assert.match(inv.check({ categories: [{ leaders: [] }, {}] }, {}), /2 empty or missing/);
});

test('predicate wraps a custom check and carries severity', () => {
    const inv = lib.predicate('is array', d => (Array.isArray(d) ? null : 'not an array'), { severity: 'warn' });
    assert.equal(inv.check([], {}), null);
    assert.equal(inv.check({}, {}), 'not an array');
    assert.equal(inv.severity, 'warn');
    assert.equal(inv.name, 'is array');
});

test('readEspnScoreboard reads finals and season from events', () => {
    const json = { events: [
        { id: '1', season: { year: 2026, type: 2 }, status: { type: { state: 'post' } } },
        { id: '2', season: { year: 2026, type: 2 }, status: { type: { state: 'pre' } } },
    ] };
    assert.deepEqual(lib.readEspnScoreboard(json), { finalIds: ['1'], season: 2026, regularSeason: true });
    assert.deepEqual(lib.readEspnScoreboard({}), { finalIds: [], season: undefined, regularSeason: false });
});

test('readMlbSchedule reads finals, season and regular-season flag', () => {
    const json = { dates: [{ games: [
        { gamePk: 9, season: '2026', gameType: 'R', status: { abstractGameState: 'Final' } },
        { gamePk: 8, season: '2026', gameType: 'R', status: { abstractGameState: 'Preview' } },
    ] }] };
    assert.deepEqual(lib.readMlbSchedule(json), { finalIds: [9], season: 2026, regularSeason: true });
    const post = { dates: [{ games: [{ gamePk: 1, season: '2026', gameType: 'F', status: { abstractGameState: 'Final' } }] }] };
    assert.equal(lib.readMlbSchedule(post).regularSeason, false);
    assert.deepEqual(lib.readMlbSchedule({ dates: [] }), { finalIds: [], season: undefined, regularSeason: false });
});
