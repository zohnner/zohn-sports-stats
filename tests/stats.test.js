// ============================================================
// SportStrata — computed-stat unit tests (node:test, zero deps)
// Run: node --test tests/
// Loads js/mlb.js in a vm sandbox with browser stubs and asserts
// the pure stat helpers against hand-verified fixtures. Guards the
// class of bug where wRC+ silently used stale league constants.
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MLB_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'mlb.js'), 'utf8');

function loadMlb(overrides = {}) {
    const noop = () => {};
    const ctx = {
        console, setTimeout, clearTimeout, setInterval, clearInterval,
        URL, URLSearchParams, AbortController, Date, Math, JSON, Promise,
        encodeURIComponent, decodeURIComponent,
        AppState: {},
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        Logger: { info: noop, debug: noop, warn: noop, error: noop, time: async (l, fn) => fn() },
        ApiCache: { get: () => null, set: noop, invalidate: noop, TTL: { SHORT: 1, MEDIUM: 2, LONG: 3, DAILY: 4 } },
        _escHtml: v => String(v),
        _normName: v => String(v).toLowerCase(),
        navigator: {},
        document: {
            getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
            addEventListener: noop, removeEventListener: noop,
            createElement: () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, addEventListener: noop, appendChild: noop }),
            body: { appendChild: noop, addEventListener: noop },
            documentElement: { setAttribute: noop, getAttribute: () => null },
        },
        fetch: async () => { throw new Error('network disabled in tests'); },
        ...overrides,
    };
    ctx.globalThis = ctx;
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(MLB_SRC, ctx, { filename: 'mlb.js' });
    const evalIn = expr => vm.runInContext(expr, ctx);
    return { ctx, evalIn };
}

// Hand-verified 500-AB hitter: .300/.500, 20 HR, 60 BB (5 IBB), 5 HBP, 5 SF
const HITTER = {
    plateAppearances: 575, atBats: 500, hits: 150, doubles: 30, triples: 5,
    homeRuns: 20, baseOnBalls: 60, intentionalWalks: 5, hitByPitch: 5,
    sacFlies: 5, strikeOuts: 100, totalBases: 250, stolenBases: 20,
    caughtStealing: 5, avg: '.300', slg: '.500',
};

test('_computeBattingRates — hand-verified fixture', () => {
    const { ctx } = loadMlb();
    const r = ctx._computeBattingRates(HITTER);
    assert.equal(r.iso, '.200');
    assert.equal(r.babip, '.338');   // 130 / 385
    assert.equal(r.bbPct, '10.4');   // 60 / 575
    assert.equal(r.kPct, '17.4');    // 100 / 575
    assert.equal(r.bbK, '0.60');
    assert.equal(r.rc, '94');        // (150+60)*250/560
    assert.equal(r.sbPct, '80.0');
    assert.equal(r.woba, '.379');    // 214.30 / 565 = .3793 (2024 weights)
});

test('wRC+ uses latest static constants as fallback and rounds correctly', () => {
    const { ctx, evalIn } = loadMlb();
    const season = evalIn('MLB_SEASON');
    const hasStatic = evalIn(`!!_MLB_WRC_CONSTANTS[${season}]`);
    const r = ctx._computeBattingRates(HITTER);
    if (!hasStatic) {
        // fallback = 2025 constants: ((.3793 - .309)/1.157 + .113)/.113*100
        assert.equal(r.wrcPlus, 154);
        // regression guard: a fallback-computed wRC+ must NEVER render undaggered
        assert.equal(ctx._wrcDagger(), '†');
    } else {
        assert.equal(typeof r.wrcPlus, 'number');
    }
});

test('_wrcDagger — final year clean, preliminary/derived/missing daggered', () => {
    const { ctx } = loadMlb();
    assert.equal(ctx._wrcDagger(2024), '');
    assert.equal(ctx._wrcDagger(2025), '†');  // marked preliminary
    assert.equal(ctx._wrcDagger(1999), '†');  // no entry
});

test('_computePitchingRates — hand-verified fixture', () => {
    const { ctx } = loadMlb();
    const r = ctx._computePitchingRates({
        inningsPitched: '180.0', battersFaced: 740, strikeOuts: 180,
        baseOnBalls: 50, hitBatsmen: 5, homeRuns: 20, hits: 150, runs: 70,
        gamesStarted: 30, qualityStarts: 18, saves: 0, holds: 0, gamesPlayed: 30, wins: 12,
    });
    assert.equal(r.fip, '3.46');     // (260+165-360)/180 + 3.10
    assert.equal(r.kBbPct, '17.6');  // 130/740
    assert.equal(r.lobPct, '76.3');  // 135/177
    assert.equal(r.qsPct, '60.0');
    assert.equal(r.svHld, null);
});

test('FIP converts baseball-notation IP thirds ("100.2" = 100⅔)', () => {
    const { ctx } = loadMlb();
    const r = ctx._computePitchingRates({
        inningsPitched: '100.2', battersFaced: 450, strikeOuts: 60,
        baseOnBalls: 20, hitBatsmen: 0, homeRuns: 20, hits: 100, runs: 60,
        gamesStarted: 18, qualityStarts: 6, saves: 0, holds: 0, gamesPlayed: 18, wins: 6,
    });
    assert.equal(r.fip, '5.09');     // 200/100.667+3.10 — parseFloat would give 5.10
});

test('_ensureWrcConstants derives league constants from team totals', async () => {
    const teamStat = {
        baseOnBalls: 150, intentionalWalks: 5, hitByPitch: 20, hits: 380,
        doubles: 70, triples: 5, homeRuns: 50, atBats: 1500, sacFlies: 12,
        runs: 200, plateAppearances: 1700,
    };
    const payload = { stats: [{ splits: Array.from({ length: 30 }, () => ({ stat: { ...teamStat } })) }] };
    const { ctx, evalIn } = loadMlb({
        fetch: async () => ({ ok: true, status: 200, json: async () => payload }),
    });
    await ctx._ensureWrcConstants(2099);
    const c = evalIn('_MLB_WRC_CONSTANTS[2099]');
    assert.ok(c, 'derived entry exists');
    assert.equal(c.derived, true);
    assert.equal(c.lgwOBA, 0.324);   // 16302 / 50310 (2024 weights)
    assert.equal(c.lgRPA, 0.1176);   // 6000 / 51000
    assert.equal(c.wOBAscale, 1.157);
    assert.equal(ctx._wrcDagger(2099), '†');
});

test('_ensureWrcConstants keeps fallback on partial league response', async () => {
    const payload = { stats: [{ splits: Array.from({ length: 10 }, () => ({ stat: { runs: 1, plateAppearances: 1 } })) }] };
    const { ctx, evalIn } = loadMlb({
        fetch: async () => ({ ok: true, status: 200, json: async () => payload }),
    });
    await ctx._ensureWrcConstants(2098);
    assert.equal(evalIn('_MLB_WRC_CONSTANTS[2098]'), undefined);
});
