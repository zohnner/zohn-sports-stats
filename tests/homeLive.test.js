// ============================================================
// Home live refresh — pure decisions behind the home poll (D-173):
// which sports need a fresh scoreboard, and whether anything changed
// enough to re-render the hero.
// Run: node --test tests/homeLive.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'homeLive.js'), 'utf8');
function load() {
    const ctx = { console, JSON, Array, Object, String };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'homeLive.js' });
    // A top-level `const` is a script-scope binding, not a property of the
    // sandbox's global object -- read it through the context instead.
    return vm.runInContext('HomeLive', ctx);
}

const game = (id, o = {}) => ({
    id, isLive: false, isFinal: false, statusText: 'Sun 4:25 PM',
    homeTeam: { abbr: 'H', score: 0 }, awayTeam: { abbr: 'A', score: 0 }, ...o,
});

test('liveSports: only sports with at least one live game', () => {
    const H = load();
    const out = H.liveSports({
        nfl: [game('1', { isLive: true }), game('2')],
        ncaaf: [game('3', { isFinal: true })],
        nba: [game('4', { isLive: true })],
    });
    assert.deepEqual(Array.from(out).sort(), ['nba', 'nfl']);
});

test('liveSports: tolerates missing, null, and empty sports', () => {
    const H = load();
    assert.deepEqual(Array.from(H.liveSports({ nfl: null, ncaab: [], wnba: undefined })), []);
    assert.deepEqual(Array.from(H.liveSports({})), []);
});

test('signature: identical data gives the identical signature', () => {
    const H = load();
    const a = { nfl: [game('1', { isLive: true, statusText: '2:00 - 2nd' })] };
    const b = JSON.parse(JSON.stringify(a));
    assert.equal(H.signature(a), H.signature(b));
});

test('signature changes when a score changes', () => {
    const H = load();
    const before = { nfl: [game('1', { isLive: true })] };
    const after = { nfl: [game('1', { isLive: true, homeTeam: { abbr: 'H', score: 7 } })] };
    assert.notEqual(H.signature(before), H.signature(after));
});

test('signature changes when only the clock/status text changes', () => {
    const H = load();
    const before = { nfl: [game('1', { isLive: true, statusText: '9:27 - 1st' })] };
    const after = { nfl: [game('1', { isLive: true, statusText: '9:18 - 1st' })] };
    assert.notEqual(H.signature(before), H.signature(after));
});

test('signature changes when a game goes live or final', () => {
    const H = load();
    const pre = { nba: [game('9')] };
    const live = { nba: [game('9', { isLive: true })] };
    const fin = { nba: [game('9', { isFinal: true })] };
    assert.notEqual(H.signature(pre), H.signature(live));
    assert.notEqual(H.signature(live), H.signature(fin));
});

test('signature ignores fields the hero does not show', () => {
    const H = load();
    const a = { nfl: [game('1', { isLive: true, leaders: [{ name: 'X' }] })] };
    const b = { nfl: [game('1', { isLive: true, leaders: [{ name: 'Y' }] })] };
    assert.equal(H.signature(a), H.signature(b));
});
