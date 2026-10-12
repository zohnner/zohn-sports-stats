// ============================================================
// MLB win expectancy: table orientation + history replay (_lgWinProbSeries).
// Run: node --test tests/winProbSeries.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'liveGame.js'), 'utf8');

// liveGame.js touches the DOM at load, so pull out only the self-contained
// win-expectancy section: the table, its lookup, and the series replay.
function load() {
    const start = SRC.indexOf('const LG_WE_MAX_INNING');
    const end = SRC.indexOf('\n}\n', SRC.indexOf('function _lgWinProbSeries')) + 3;
    assert.ok(start > 0 && end > start, 'win-expectancy section not found');
    const ctx = { Math, Map };
    vm.createContext(ctx);
    vm.runInContext(SRC.slice(start, end) + '\nthis._lgWinProbSeries = _lgWinProbSeries; this._lgWinProbFromRawState = _lgWinProbFromRawState;', ctx);
    return ctx;
}

const { _lgWinProbSeries, _lgWinProbFromRawState: wp } = load();
const pct = p => Math.round(p * 100);

function play(top, inning, outs, away, home, bases = {}) {
    return {
        about: { isComplete: true, isTopInning: top, inning },
        count: { outs },
        result: { awayScore: away, homeScore: home },
        matchup: bases,
    };
}

function feed(plays, state = 'Live') {
    return { gameData: { status: { abstractGameState: state } }, liveData: { plays: { allPlays: plays } } };
}

test('home team is favored at first pitch (home-field edge)', () => {
    const p = wp(0, 1, 0, 0, 0);
    assert.ok(p > 0.5 && p < 0.6, `got ${p}`);
});

test('visitor outs in a top half raise the home team\'s odds', () => {
    assert.ok(wp(0, 1, 1, 0, 0) > wp(0, 1, 0, 0, 0));
    assert.ok(wp(0, 1, 2, 0, 0) > wp(0, 1, 1, 0, 0));
});

test('visitor runners and runs in a top half lower the home team\'s odds', () => {
    assert.ok(wp(0, 5, 0, 7, 0) < wp(0, 5, 0, 0, 0));
    assert.ok(wp(0, 1, 0, 0, -2) < wp(0, 1, 0, 0, 0));
});

test('a home lead is good for home in both halves', () => {
    assert.ok(wp(0, 9, 0, 0, 2) > 0.9);
    assert.ok(wp(1, 8, 0, 0, 2) > 0.85);
    assert.ok(wp(1, 9, 0, 0, -2) < 0.15);
});

test('no completed plays yields an empty series', () => {
    assert.equal(_lgWinProbSeries(feed([])).length, 0);
    const pending = play(true, 1, 0, 0, 0);
    pending.about.isComplete = false;
    assert.equal(_lgWinProbSeries(feed([pending])).length, 0);
});

test('series starts at the first-pitch state and adds one point per completed play', () => {
    const s = _lgWinProbSeries(feed([play(true, 1, 1, 0, 0), play(true, 1, 2, 0, 0)]));
    assert.equal(s.length, 3);
    assert.equal(s[0].label, '▲1');
    assert.equal(s[0].homePct, pct(wp(0, 1, 0, 0, 0)));
    assert.equal(s[2].homePct, pct(wp(0, 1, 2, 0, 0)));
});

test('postOn* fields set the base state', () => {
    const s = _lgWinProbSeries(feed([play(false, 3, 1, 0, 0, { postOnFirst: { id: 1 }, postOnThird: { id: 2 } })]));
    assert.equal(s[1].homePct, pct(wp(1, 3, 1, 5, 0)));
});

test('third out rolls to the start of the next half-inning', () => {
    const s = _lgWinProbSeries(feed([
        play(true, 4, 3, 2, 0, { postOnSecond: { id: 9 } }),
        play(false, 4, 3, 2, 0),
    ]));
    assert.equal(s[1].label, '▲4');
    assert.equal(s[1].homePct, pct(wp(1, 4, 0, 0, -2)));
    assert.equal(s[2].label, '▼4');
    assert.equal(s[2].homePct, pct(wp(0, 5, 0, 0, -2)));
});

test('a Final game ends at 100 or 0 for the winner', () => {
    const walkoff = _lgWinProbSeries(feed([play(true, 9, 3, 3, 3), play(false, 9, 1, 3, 4)], 'Final'));
    assert.equal(walkoff[walkoff.length - 1].homePct, 100);
    const roadWin = _lgWinProbSeries(feed([play(false, 9, 3, 5, 2)], 'Final'));
    assert.equal(roadWin[roadWin.length - 1].homePct, 0);
});

test('a still-Live game is never pinned to 100/0', () => {
    const s = _lgWinProbSeries(feed([play(false, 9, 1, 3, 4)]));
    assert.ok(s[s.length - 1].homePct > 0 && s[s.length - 1].homePct < 100);
});
