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

// ── Early-season prior blend (2026-09-19) ──────────────────────────────
// Week 1 of a real season is N disconnected 2-team pairs -- no shared
// opponents anywhere. Without a prior, forcing every pair's mean to 0 means
// the ONLY information in the rating is that pair's own margin: a blowout
// win over a weak team is indistinguishable from a blowout win over a
// strong one. These tests reproduce that shape with two disconnected pairs
// where the "quality" signal can only come from priorRatings.

test('no prior supplied: disconnected pairs default to the original zero-mean behavior', () => {
    const ctx = load();
    // A beats B by 10 (pair 1); C beats D by 10 (pair 2) -- structurally
    // identical, fully disconnected from each other.
    const games = [
        { home: 'A', away: 'B', homeScore: 20, awayScore: 10, date: TODAY },
        { home: 'C', away: 'D', homeScore: 20, awayScore: 10, date: TODAY },
    ];
    const scored = ctx.computeSRS(games, ['A', 'B', 'C', 'D'], {
        marginCap: 100, homeAdvantage: 0, recencyHalfLifeDays: 9999, now: NOW,
    });
    const r = byTeam(scored);
    // Both winners rate identically and both losers rate identically --
    // there is no way to tell A is "better" or "worse" than C without a prior.
    assert.ok(Math.abs(r.A.rating - r.C.rating) < 0.001, `A and C should be indistinguishable with no prior: A=${r.A.rating}, C=${r.C.rating}`);
    assert.ok(Math.abs(r.A.rating - 5) < 0.01, `A expected ~5 (margin/2), got ${r.A.rating}`);
});

test('prior blend: disconnected pairs stay correctly ordered by their prior strength', () => {
    const ctx = load();
    // Same two structurally-identical pairs as above, but A/B enter with a
    // strong prior and C/D enter with a weak one -- e.g. A is a good team
    // that beat a bad team, C is a bad team that beat a worse one. Without
    // a prior these are indistinguishable (see test above); with one, A's
    // pair should rate above C's pair even though both margins are +10.
    const games = [
        { home: 'A', away: 'B', homeScore: 20, awayScore: 10, date: TODAY },
        { home: 'C', away: 'D', homeScore: 20, awayScore: 10, date: TODAY },
    ];
    const priorRatings = new Map([['A', 15], ['B', 15], ['C', -15], ['D', -15]]);
    const scored = ctx.computeSRS(games, ['A', 'B', 'C', 'D'], {
        marginCap: 100, homeAdvantage: 0, recencyHalfLifeDays: 9999, now: NOW,
        priorRatings, priorWeight: 2,
    });
    const r = byTeam(scored);
    assert.ok(r.A.rating > r.C.rating, `A (strong prior) should outrate C (weak prior) despite an identical margin: A=${r.A.rating}, C=${r.C.rating}`);
    assert.ok(r.A.rating > r.B.rating, `A (won) should still outrate B (lost) within its own pair: A=${r.A.rating}, B=${r.B.rating}`);
    assert.ok(r.C.rating > r.D.rating, `C (won) should still outrate D (lost) within its own pair: C=${r.C.rating}, D=${r.D.rating}`);
});

test('prior blend: a team with no prior data (0) is unaffected by an unrelated team\'s prior', () => {
    const ctx = load();
    const games = [{ home: 'A', away: 'B', homeScore: 20, awayScore: 10, date: TODAY }];
    // Only A has a prior; B (e.g. new to the league) defaults to 0.
    const priorRatings = new Map([['A', 15]]);
    const scored = ctx.computeSRS(games, ['A', 'B'], {
        marginCap: 100, homeAdvantage: 0, recencyHalfLifeDays: 9999, now: NOW,
        priorRatings, priorWeight: 2,
    });
    const r = byTeam(scored);
    assert.ok(r.A.rating > r.B.rating, `A (has a prior) should outrate B (no prior, defaults to 0): A=${r.A.rating}, B=${r.B.rating}`);
});
