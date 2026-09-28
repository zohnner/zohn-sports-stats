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
