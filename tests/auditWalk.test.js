// ============================================================
// Page walk (tools/audit/page-walk.cjs): turns what a browser saw on each
// view into findings. The browser part can't run here; these test the
// judgement applied to its records.
// Run: node --test tests/auditWalk.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, summarize, pickSamples } = require('../tools/audit/page-walk.cjs');

// One visited view as the in-page walker records it.
const visit = (o = {}) => ({
    target: 'nba-standings', landed: 'nba-standings', textLength: 2400, skeleton: false,
    emptyText: '', errors: [], ...o,
});
const kinds = v => classify(v).map(f => f.kind);

test('a healthy page yields no findings', () => {
    assert.deepEqual(classify(visit()), []);
});

test('landing somewhere else is a misroute, and names both views', () => {
    const f = classify(visit({ target: 'ncaaf-game-401866461', landed: 'ncaaf-scores' }));
    assert.deepEqual(f, [{ kind: 'misroute', view: 'ncaaf-game-401866461', detail: 'landed on ncaaf-scores' }]);
});

test('falling back to home is reported as fell-home, not as a misroute', () => {
    assert.deepEqual(kinds(visit({ target: 'nba-team-SA', landed: 'home' })), ['fell-home']);
});

test('a page that never fills in is empty', () => {
    assert.deepEqual(kinds(visit({ textLength: 40 })), ['empty']);
});

test('skeletons still on screen after the wait are stuck', () => {
    assert.deepEqual(kinds(visit({ skeleton: true })), ['stuck-loading']);
});

test('an "unavailable" message is reported with its text', () => {
    const f = classify(visit({ emptyText: 'NBA scores unavailable.' }));
    assert.deepEqual(f, [{ kind: 'unavailable', view: 'nba-standings', detail: 'NBA scores unavailable.' }]);
});

test('a script error is reported once per distinct message', () => {
    const f = classify(visit({ errors: ['TypeError: x is undefined', 'TypeError: x is undefined', 'ReferenceError: y'] }));
    assert.deepEqual(f.map(x => x.detail), ['TypeError: x is undefined', 'ReferenceError: y']);
    assert.deepEqual(f.map(x => x.kind), ['script-error', 'script-error']);
});

test('an offseason message is expected, not a finding', () => {
    assert.deepEqual(classify(visit({ textLength: 60, emptyText: 'The WNBA is in its offseason.', offseason: true })), []);
});

// The in-page walker's two text patterns, on messages the site really shows.
test('error and idle messages are recognized from real page text', () => {
    const { EMPTY_RE, IDLE_RE } = require('../tools/audit/page-walk.cjs');
    assert.equal(EMPTY_RE.exec("Couldn't load this team. Retry")[0].trim(), "Couldn't load this team.");
    assert.match('Something went wrong Sleeper players 404', EMPTY_RE);
    assert.match('NBA scores unavailable.', EMPTY_RE);
    assert.match('← Prev Today 2026-11-11 Next → No MLB games scheduled for Today', IDLE_RE);
    assert.match('The WNBA is in its offseason.', IDLE_RE);
    assert.doesNotMatch('San Antonio Spurs 9-2', EMPTY_RE);
    assert.doesNotMatch('San Antonio Spurs 9-2', IDLE_RE);
});

test('pickSamples takes one team, player and game link per sport', () => {
    const got = pickSamples([
        'nba-game-1', 'nba-game-2', 'nba-player-9', 'nfl-team-KC', 'nfl-team-BUF', 'nba-standings', 'mlb-live-77',
    ]);
    assert.deepEqual(got, ['nba-game-1', 'nba-player-9', 'nfl-team-KC', 'mlb-live-77']);
});

test('summarize counts findings by kind and keeps the worst first', () => {
    const s = summarize([
        visit({ target: 'a', landed: 'home' }),
        visit({ target: 'b', landed: 'b', textLength: 10 }),
        visit({ target: 'c', landed: 'c', errors: ['boom'] }),
        visit(),
    ]);
    assert.equal(s.visited, 4);
    assert.deepEqual(s.counts, { 'script-error': 1, 'fell-home': 1, empty: 1 });
    assert.deepEqual(s.findings.map(f => f.kind), ['script-error', 'fell-home', 'empty']);
});
