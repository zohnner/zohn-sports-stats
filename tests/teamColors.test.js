// ============================================================
// Matchup-aware team colors (_teamColorsDistinct / _matchupTeamColors).
// Pairs are real brand hexes from js/config.js, js/mlb.js, js/nfl.js and
// ESPN's live team.color/alternateColor.
// Run: node --test tests/teamColors.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');

function load() {
    const noop = () => {};
    const ctx = {
        console, Math, JSON, Map, Set, Array,
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        document: { addEventListener: noop },
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'config.js' });
    return ctx;
}
const C = load();

const SIMILAR = [
    ['NCAAF NAVY/UAB (live bug)', '#00225b', '#1a5632'],
    ['NBA ATL/POR', '#E03A3E', '#E03A3E'],
    ['NBA DEN/MIN navy', '#0E2240', '#0C2340'],
    ['MLB CWS/SD', '#27251F', '#2F241D'],
    ['MLB DET/SEA', '#0C2C56', '#0C2C56'],
    ['NFL CAR/LAC', '#0085CA', '#0080C6'],
    ['NFL ARI/WAS', '#97233F', '#5A1414'],
    ['NFL BUF/IND', '#00338D', '#002C5F'],
    ['NFL GB/CHI', '#203731', '#0B162A'],
];
const DISTINCT = [
    ['MLB NYY/BOS', '#0C2340', '#BD3039'],
    ['MLB LAD/SF', '#005A9C', '#FD5A1E'],
    ['NFL KC/BUF', '#E31837', '#00338D'],
    ['NFL GB/PIT secondaries', '#203731', '#FFB612'],
    ['NCAAF NAVY gold/UAB green', '#b5a67c', '#1a5632'],
    ['NFL MIA/NYJ', '#008E97', '#125740'],
];

for (const [name, a, b] of SIMILAR) {
    test(`flags ${name} as indistinguishable`, () => assert.equal(C._teamColorsDistinct(a, b), false));
}
for (const [name, a, b] of DISTINCT) {
    test(`keeps ${name} as distinct`, () => assert.equal(C._teamColorsDistinct(a, b), true));
}

test('distinct matchup is returned untouched', () => {
    const r = C._matchupTeamColors({ primary: '#BD3039', secondary: '#0C2340' }, { primary: '#0C2340', secondary: '#FFFFFF' });
    assert.deepEqual({ ...r }, { away: '#BD3039', home: '#0C2340' });
});

test('NAVY @ UAB: home keeps green, away switches to its gold alternate', () => {
    const r = C._matchupTeamColors({ primary: '#00225b', secondary: '#b5a67c' }, { primary: '#1a5632', secondary: '#fdb913' });
    assert.deepEqual({ ...r }, { away: '#b5a67c', home: '#1a5632' });
});

test('home yields its secondary when the away alternate still collides', () => {
    // Away primary + secondary both near home's primary; home secondary is distinct.
    const r = C._matchupTeamColors({ primary: '#E03A3E', secondary: '#C8102E' }, { primary: '#E03A3E', secondary: '#000000' });
    assert.equal(r.home, '#000000');
    assert.equal(C._teamColorsDistinct(r.away, r.home), true);
});

test('exact duplicate with no usable alternate degrades away to fallback', () => {
    const r = C._matchupTeamColors({ primary: '#E31837' }, { primary: '#E31837' });
    assert.deepEqual({ ...r }, { away: 'var(--text-muted)', home: '#E31837' });
});

test('missing color on either side is passed through as null', () => {
    const r = C._matchupTeamColors({ primary: '#E31837' }, null);
    assert.equal(r.home, null);
    assert.equal(r.away, '#E31837');
});

test('unparseable CSS-var colors compare by string only', () => {
    assert.equal(C._teamColorsDistinct('var(--accent)', 'var(--text-muted)'), true);
    assert.equal(C._teamColorsDistinct('var(--accent)', 'var(--accent)'), false);
});
