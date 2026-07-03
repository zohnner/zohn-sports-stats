// ============================================================
// SportStrata — VBD / market-implied value tests (D-036)
// Run: node --test tests/vbd.test.js
// Loads js/fantasy.js in a vm sandbox and asserts the implied-
// projection math (rookies / no-production players) against
// hand-verified fixtures.
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'fantasy.js'), 'utf8');

function loadFantasy() {
    const noop = () => {};
    const ctx = {
        console, setTimeout, clearTimeout, Date, Math, JSON, Promise,
        navigator: {},
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        document: {
            getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
            addEventListener: noop, createElement: () => ({ style: {}, classList: { add: noop, remove: noop } }),
        },
        fetch: async () => { throw new Error('network disabled in tests'); },
    };
    ctx.globalThis = ctx;
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'fantasy.js' });
    const evalIn = expr => vm.runInContext(expr, ctx);
    return { ctx, evalIn };
}

// Pool fixture: 6 production-matched RBs + rookies at various ADPs.
// _fp shape: { ppr, half, std, g } — proj = (pts/g) * 17, so g:17 makes
// proj === the ppr number (hand-checkable).
function poolFixture() {
    const rb = (adp, pts) => ({ id: 'rb' + adp, name: 'RB ' + adp, pos: 'RB', team: 'T', adp,
        _fp: { ppr: pts, half: pts, std: pts, g: 17 } });
    return [
        rb(2, 300), rb(4, 280), rb(6, 260), rb(8, 240), rb(10, 220), rb(12, 200),
        { id: 'rk5', name: 'Rookie Five', pos: 'RB', team: 'T', adp: 5, _fp: null },
        { id: 'rk1', name: 'Rookie One', pos: 'RB', team: 'T', adp: 1, _fp: null },
        { id: 'qbX', name: 'Lone QB', pos: 'QB', team: 'T', adp: 3, _fp: null },
    ];
}

test('_vbdImplied — interpolates between position ADP neighbors', () => {
    const { ctx, evalIn } = loadFantasy();
    evalIn('_mdPool = ' + JSON.stringify(poolFixture()));
    // Rookie at ADP 5: below = {2:300, 4:280}(last 3 of ≤5... entries 2,4 → both) ,
    // above = {6:260, 8:240, 10:220}. Weights 1/(1+|d|):
    // 2→1/4·300, 4→1/2·280, 6→1/2·260, 8→1/4·240, 10→1/6·220
    // vSum = 75 + 140 + 130 + 60 + 36.6667 = 441.6667 ; wSum = 0.25+0.5+0.5+0.25+0.16667 = 1.66667
    // implied = 265.0
    const v = ctx._vbdImplied({ pos: 'RB', adp: 5 }, 'PPR');
    assert.ok(Math.abs(v - 265.0) < 0.01, `expected ~265.0, got ${v}`);
});

test('_vbdImplied — rookie above all matched ADPs uses upper neighbors only', () => {
    const { ctx, evalIn } = loadFantasy();
    evalIn('_mdPool = ' + JSON.stringify(poolFixture()));
    // ADP 1: below = none (no adp ≤ 1), above = {2:300, 4:280, 6:260}
    // weights 1/2, 1/4, 1/6 → vSum = 150 + 70 + 43.3333 = 263.3333 ; wSum = 0.91667
    // implied = 287.27
    const v = ctx._vbdImplied({ pos: 'RB', adp: 1 }, 'PPR');
    assert.ok(Math.abs(v - 287.2727) < 0.01, `expected ~287.27, got ${v}`);
});

test('_vbdImplied — returns null when the position has <4 matched players', () => {
    const { ctx, evalIn } = loadFantasy();
    evalIn('_mdPool = ' + JSON.stringify(poolFixture()));
    assert.equal(ctx._vbdImplied({ pos: 'QB', adp: 3 }, 'PPR'), null);
    assert.equal(ctx._vbdImplied({ pos: 'TE', adp: 3 }, 'PPR'), null);
});

test('_vbdImpTable — caches per scoring and invalidates when the pool changes', () => {
    const { ctx, evalIn } = loadFantasy();
    evalIn('_mdPool = ' + JSON.stringify(poolFixture()));
    const t1 = ctx._vbdImpTable('PPR');
    assert.equal(t1.RB.length, 6);
    assert.equal(ctx._vbdImpTable('PPR'), t1, 'same pool + scoring → cached object');
    evalIn('_mdPool = ' + JSON.stringify(poolFixture().slice(0, 3)));
    const t2 = ctx._vbdImpTable('PPR');
    assert.notEqual(t2, t1, 'pool change → rebuilt table');
    assert.equal(t2.RB.length, 3);
});

test('_dkBuild — implied rows join the valued board, tagged imp', () => {
    const { ctx, evalIn } = loadFantasy();
    evalIn('_mdPool = ' + JSON.stringify(poolFixture()));
    // _vbd.ok drives replacement calc; give it the same RB set
    evalIn(`_vbd = { season: 2025, ok: true, map: Object.fromEntries(
        _mdPool.filter(p => p._fp).map(p => [p.name.toLowerCase() + '|' + p.pos, { pos: p.pos, name: p.name, ppr: p._fp.ppr, half: p._fp.half, std: p._fp.std, g: 17 }])) }`);
    evalIn(`_dk = { scoring: 'PPR', teams: 12, superflex: false, pos: 'ALL' }`);
    const { valued, unvalued } = evalIn('_dkBuild()');
    const rookie = valued.find(r => r.id === 'rk5');
    assert.ok(rookie, 'ADP-5 rookie is on the valued board');
    assert.equal(rookie.imp, true);
    assert.equal(rookie.proj, 265);
    const lonely = unvalued.find(r => r.id === 'qbX');
    assert.ok(lonely, 'QB with no matched peers stays unvalued (no fabrication)');
});
