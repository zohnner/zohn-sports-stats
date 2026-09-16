// ============================================================
// In-house Power Rankings — SRS engine tests, seeded/synthetic data.
// Run: node --test tests/powerRankings.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'powerRankings.js'), 'utf8');

function load() {
    const noop = () => {};
    const ctx = {
        console, Math, Date, JSON, Map, Set, Array,
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'powerRankings.js' });
    return ctx;
}

const NOW = new Date('2026-09-15T00:00:00Z').getTime();
const TODAY = '2026-09-14';

function byTeam(scored) {
    const m = {};
    scored.forEach(s => { m[s.team] = s; });
    return m;
}

test('transitive triangle: hand-computable solution (A > B > C, all margins 10)', () => {
    const ctx = load();
    // A beat B by 10, A beat C by 10, B beat C by 10.
    // Solving rating[t] = mean(margin + opponentRating), zero-mean:
    // a = 6.667, b = 0, c = -6.667 (see plan/derivation in DECISIONS.md).
    const games = [
        { home: 'A', away: 'B', homeScore: 20, awayScore: 10, date: TODAY },
        { home: 'A', away: 'C', homeScore: 20, awayScore: 10, date: TODAY },
        { home: 'B', away: 'C', homeScore: 20, awayScore: 10, date: TODAY },
    ];
    const scored = ctx.computeSRS(games, ['A', 'B', 'C'], {
        marginCap: 100, homeAdvantage: 0, recencyHalfLifeDays: 9999, now: NOW,
    });
    const r = byTeam(scored);
    assert.ok(Math.abs(r.A.rating - 6.667) < 0.01, `A expected ~6.667, got ${r.A.rating}`);
    assert.ok(Math.abs(r.B.rating - 0) < 0.01, `B expected ~0, got ${r.B.rating}`);
    assert.ok(Math.abs(r.C.rating + 6.667) < 0.01, `C expected ~-6.667, got ${r.C.rating}`);
});

test('perfect 3-cycle: symmetry forces all ratings to 0', () => {
    const ctx = load();
    // A beat B by 10, B beat C by 10, C beat A by 10 -- a closed cycle is
    // invariant under rotation, so all three teams must end up equal, and
    // since ratings are zero-mean, that means all three are ~0.
    const games = [
        { home: 'A', away: 'B', homeScore: 20, awayScore: 10, date: TODAY },
        { home: 'B', away: 'C', homeScore: 20, awayScore: 10, date: TODAY },
        { home: 'C', away: 'A', homeScore: 20, awayScore: 10, date: TODAY },
    ];
    const scored = ctx.computeSRS(games, ['A', 'B', 'C'], {
        marginCap: 100, homeAdvantage: 0, recencyHalfLifeDays: 9999, now: NOW,
    });
    scored.forEach(s => assert.ok(Math.abs(s.rating) < 0.01, `${s.team} expected ~0, got ${s.rating}`));
});

test('margin cap: a blowout is clipped before it enters the rating', () => {
    const ctx = load();
    const uncapped = ctx.computeSRS(
        [{ home: 'A', away: 'B', homeScore: 100, awayScore: 0, date: TODAY }],
        ['A', 'B'],
        { marginCap: 10000, homeAdvantage: 0, recencyHalfLifeDays: 9999, now: NOW }
    );
    const capped = ctx.computeSRS(
        [{ home: 'A', away: 'B', homeScore: 100, awayScore: 0, date: TODAY }],
        ['A', 'B'],
        { marginCap: 10, homeAdvantage: 0, recencyHalfLifeDays: 9999, now: NOW }
    );
    const rUncapped = byTeam(uncapped).A.rating;
    const rCapped = byTeam(capped).A.rating;
    assert.ok(rCapped < rUncapped, `capped rating (${rCapped}) should be less than uncapped (${rUncapped})`);
    // Zero-mean over a closed 2-team system halves the margin (a = -b, a = margin + b => a = margin/2).
    assert.ok(Math.abs(rCapped - 5) < 0.01, `capped 1-game rating should be ~5 (cap/2), got ${rCapped}`);
});

test('recency weight: an old game influences less than an equally-sized recent one', () => {
    const ctx = load();
    // A has one old blowout win; B has one recent identical-magnitude win.
    // Both then lose by the same amount to a common, otherwise-idle opponent
    // C -- with decay applied, the old win should leave A's combined rating
    // lower than B's, since A's positive result is discounted more.
    const games = [
        { home: 'A', away: 'X', homeScore: 20, awayScore: 0, date: '2026-06-01' }, // ~106 days old
        { home: 'B', away: 'Y', homeScore: 20, awayScore: 0, date: '2026-09-13' }, // 2 days old
        { home: 'C', away: 'A', homeScore: 20, awayScore: 0, date: TODAY },
        { home: 'C', away: 'B', homeScore: 20, awayScore: 0, date: TODAY },
    ];
    const scored = ctx.computeSRS(games, ['A', 'B', 'C', 'X', 'Y'], {
        marginCap: 100, homeAdvantage: 0, recencyHalfLifeDays: 30, now: NOW,
    });
    const r = byTeam(scored);
    assert.ok(r.B.rating > r.A.rating, `B (recent win) should rate higher than A (old win): A=${r.A.rating}, B=${r.B.rating}`);
});

test('zero-games team: appears at rating 0, does not throw, does not perturb others', () => {
    const ctx = load();
    const games = [
        { home: 'A', away: 'B', homeScore: 10, awayScore: 0, date: TODAY },
    ];
    const scored = ctx.computeSRS(games, ['A', 'B', 'Z'], {
        marginCap: 100, homeAdvantage: 0, recencyHalfLifeDays: 9999, now: NOW,
    });
    const r = byTeam(scored);
    assert.equal(r.Z.rating, 0);
    assert.equal(r.Z.gamesPlayed, 0);
    assert.ok(Math.abs(r.A.rating - 5) < 0.01, `A vs B alone, zero-mean over {A,B} only, expected ~5, got ${r.A.rating}`);
});

test('home-field advantage: identical margin, home win rates lower than an away win', () => {
    const ctx = load();
    const homeWin = ctx.computeSRS(
        [{ home: 'A', away: 'B', homeScore: 10, awayScore: 0, date: TODAY }],
        ['A', 'B'],
        { marginCap: 100, homeAdvantage: 3, recencyHalfLifeDays: 9999, now: NOW }
    );
    const awayWin = ctx.computeSRS(
        [{ home: 'B', away: 'A', homeScore: 0, awayScore: 10, date: TODAY }],
        ['A', 'B'],
        { marginCap: 100, homeAdvantage: 3, recencyHalfLifeDays: 9999, now: NOW }
    );
    const rHome = byTeam(homeWin).A.rating;
    const rAway = byTeam(awayWin).A.rating;
    assert.ok(rAway > rHome, `winning on the road should rate higher than the identical margin at home: home=${rHome}, away=${rAway}`);
});

test('does not converge within maxIterations still returns a result and logs a warning', () => {
    const ctx = load();
    let warned = false;
    ctx.Logger.warn = () => { warned = true; };
    const games = [
        { home: 'A', away: 'B', homeScore: 10, awayScore: 0, date: TODAY },
        { home: 'B', away: 'C', homeScore: 10, awayScore: 0, date: TODAY },
        { home: 'C', away: 'A', homeScore: 10, awayScore: 0, date: TODAY },
    ];
    const scored = ctx.computeSRS(games, ['A', 'B', 'C'], {
        marginCap: 100, homeAdvantage: 0, recencyHalfLifeDays: 9999, now: NOW,
        maxIterations: 0, damping: 0.6,
    });
    assert.equal(scored.length, 3);
    assert.ok(warned, 'expected Logger.warn to be called when maxIterations is exhausted');
});

test('empty input: no games, no teams throws nothing and returns empty', () => {
    const ctx = load();
    const scored = ctx.computeSRS([], [], { now: NOW });
    assert.equal(Array.isArray(scored), true);
    assert.equal(scored.length, 0);
});
