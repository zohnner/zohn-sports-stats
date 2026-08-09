// ============================================================
// SportStrata — paid-tier entitlement gate unit tests (node:test, zero deps)
// Run: node --test tests/entitlement.test.js
//
// Added 2026-08-08 (full-team audit, docs/full-audit-2026-08-08.md A2) —
// functions/api/_entitlement.js is the single gate every paid-tier endpoint
// (AI League Insights, Personalized Fantasy Grade, and whatever else Stripe
// eventually unlocks) calls to decide free vs. paid. It had zero test
// coverage despite being the one place in the codebase where a bug means
// either a paying user gets rejected or a non-paying user gets a feature
// for free. This is deliberately the FIRST Pages Function in the repo to
// get real tests — see docs/roadmap-2026-08-08.md Phase 0.
//
// Loads the real source (not a reimplementation) in a vm sandbox, same
// pattern tests/stats.test.js already uses for js/mlb.js. The only
// transform applied is stripping the leading `export ` keyword, since
// vm.runInContext runs plain scripts, not ES modules, and this file has
// exactly one export statement to strip.
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api', '_entitlement.js'), 'utf8');
const SCRIPT = SRC.replace(/^export\s+/m, '');

function loadEntitlement() {
    const ctx = { console, Date, Promise };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(SCRIPT, ctx, { filename: '_entitlement.js' });
    return vm.runInContext('isEntitled', ctx);
}

// Minimal fake D1 binding: mirrors the real .prepare(sql).bind(...args).first()
// chain closely enough to exercise the real query shape, without a real D1.
function fakeUserDb(row) {
    return {
        prepare(sql) {
            assert.match(sql, /FROM subscriptions WHERE user_id = \? AND status = 'active'/);
            return {
                bind(userId) {
                    return {
                        async first() {
                            return typeof row === 'function' ? row(userId) : row;
                        },
                    };
                },
            };
        },
    };
}

test('isEntitled: no userId returns false without touching the database', async () => {
    const isEntitled = loadEntitlement();
    let touched = false;
    const env = { USER_DB: { prepare() { touched = true; } } };
    assert.equal(await isEntitled(env, null), false);
    assert.equal(await isEntitled(env, undefined), false);
    assert.equal(await isEntitled(env, ''), false);
    assert.equal(touched, false, 'must short-circuit before querying D1 with no user id');
});

test('isEntitled: missing USER_DB binding returns false (fails closed, not open)', async () => {
    const isEntitled = loadEntitlement();
    assert.equal(await isEntitled({}, 'user_123'), false);
    assert.equal(await isEntitled({ USER_DB: null }, 'user_123'), false);
});

test('isEntitled: no matching subscription row returns false (default free tier)', async () => {
    const isEntitled = loadEntitlement();
    const env = { USER_DB: fakeUserDb(null) };
    assert.equal(await isEntitled(env, 'user_no_sub'), false);
});

test('isEntitled: active row with no current_period_end (lifetime/manual grant) returns true', async () => {
    const isEntitled = loadEntitlement();
    const env = { USER_DB: fakeUserDb({ status: 'active', current_period_end: null }) };
    assert.equal(await isEntitled(env, 'user_active'), true);
});

test('isEntitled: active row with a future current_period_end returns true', async () => {
    const isEntitled = loadEntitlement();
    const future = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const env = { USER_DB: fakeUserDb({ status: 'active', current_period_end: future }) };
    assert.equal(await isEntitled(env, 'user_current'), true);
});

test('isEntitled: active row with a past current_period_end returns false (lapsed subscription)', async () => {
    const isEntitled = loadEntitlement();
    const past = Date.now() - 24 * 60 * 60 * 1000;
    const env = { USER_DB: fakeUserDb({ status: 'active', current_period_end: past }) };
    assert.equal(await isEntitled(env, 'user_lapsed'), false);
});

test('isEntitled: never trusts a client-supplied entitlement claim — only reads from D1', async () => {
    // Regression guard for the exact failure mode this function exists to prevent:
    // isEntitled's signature takes (env, userId) only — there is no "claimed"
    // parameter for a client to assert its own paid status. This test fails loudly
    // if a future edit adds one without an explicit, reviewed decision.
    const isEntitled = loadEntitlement();
    assert.equal(isEntitled.length, 2, 'isEntitled(env, userId) must stay a 2-argument function');
});
