// ============================================================
// October Odds (D-039 2c) — Monte Carlo sim tests, seeded RNG.
// Run: node --test tests/odds.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'odds.js'), 'utf8');

function load() {
    const noop = () => {};
    const ctx = {
        console, Math, Date, JSON, Promise, Float64Array, Set,
        AppState: {},
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        ApiCache: { TTL: { DAILY: 1 } },
        mlbFetch: async () => { throw new Error('network disabled'); },
        MLB_SEASON: 2026,
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'odds.js' });
    return ctx;
}

// 4-team league: one division per league so div% === oct-viability is easy to reason about
const T = (id, lg, div, wins, strength) => ({ id, league: lg, division: div, wins, strength });

test('strength: pythagorean + regression', () => {
    const ctx = load();
    assert.equal(ctx._oddsStrength(0, 0, 0), 0.5);                       // no data → neutral
    const s = ctx._oddsStrength(500, 400, 100);                          // strong offense
    assert.ok(s > 0.55 && s < 0.65, `expected ~0.59, got ${s}`);
    // regression pulls toward .500: pure pythag would be ~0.601
    assert.ok(s < 0.601);
});

test('game prob: log5 symmetry, home bump, clamps', () => {
    const ctx = load();
    const even = ctx._oddsGameProb(0.5, 0.5);
    assert.ok(Math.abs(even - 0.535) < 1e-9, 'even teams = .500 + home bump');
    assert.equal(ctx._oddsGameProb(0.75, 0.25), 0.75, 'clamped high');
    assert.equal(ctx._oddsGameProb(0.25, 0.75), 0.25, 'clamped low');
});

test('sim: zero games left → standings decide deterministically', () => {
    const ctx = load();
    const teams = [
        T(1, 'AL', 'AL X', 90, 0.55), T(2, 'AL', 'AL X', 80, 0.50),
        T(3, 'NL', 'NL X', 85, 0.52), T(4, 'NL', 'NL X', 70, 0.48),
    ];
    const r = ctx._mlbOddsSim(teams, [], 200, ctx._oddsMulberry32(42), 0); // 0 wild cards
    assert.equal(r[1].div, 100);
    assert.equal(r[2].div, 0);
    assert.equal(r[2].oct, 0, 'no WC slots → loser out');
    assert.equal(r[3].oct, 100);
});

test('sim: dead-even 2-team race with one game ≈ 50/50 (seeded)', () => {
    const ctx = load();
    const teams = [T(1, 'AL', 'AL X', 50, 0.5), T(2, 'AL', 'AL X', 50, 0.5)];
    const r = ctx._mlbOddsSim(teams, [[0, 1]], 4000, ctx._oddsMulberry32(7), 0);
    // home team gets the 3.5% bump → ~53.5/46.5
    assert.ok(Math.abs(r[1].div - 53.5) < 3, `expected ~53.5, got ${r[1].div}`);
    assert.ok(Math.abs(r[1].div + r[2].div - 100) < 1e-9, 'division probabilities sum to 100');
});

test('sim: wild card rescues the division loser', () => {
    const ctx = load();
    const teams = [
        T(1, 'AL', 'AL X', 90, 0.55), T(2, 'AL', 'AL X', 80, 0.50),
        T(3, 'AL', 'AL Y', 85, 0.52), T(4, 'AL', 'AL Y', 60, 0.45),
    ];
    const r = ctx._mlbOddsSim(teams, [], 200, ctx._oddsMulberry32(1), 1); // 1 WC slot
    assert.equal(r[1].oct, 100); assert.equal(r[3].oct, 100);
    assert.equal(r[2].oct, 100, '80-win runner-up takes the lone WC over the 60-win team');
    assert.equal(r[4].oct, 0);
});

test('formatting: no false precision at the extremes', () => {
    const ctx = load();
    assert.equal(ctx._oddsFmtPct(99.7), '&gt;99');
    assert.equal(ctx._oddsFmtPct(0.2), '&lt;1');
    assert.equal(ctx._oddsFmtPct(0), '0');
    assert.equal(ctx._oddsFmtPct(42.4), '42');
});
