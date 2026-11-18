// ============================================================
// #142 / D-211: a returning visitor's service worker can serve a navigation.js
// older than the HTML, so an edge page's __SS_ROUTE has no branch in that
// router and the page boots to home. _staleCodeReload reloads once instead, and
// sw.js revalidates instead of letting a 4h HTTP-cached copy overwrite the
// fresh precache.
// Run: node --test tests/staleRouteReload.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const NAV = fs.readFileSync(path.join(ROOT, 'js', 'navigation.js'), 'utf8');

function load() {
    const fn = NAV.match(/^function _staleCodeReload\([\s\S]*?^}\r?$/m)[0];
    const ctx = { Promise, setTimeout, Logger: { warn() {} } };
    vm.createContext(ctx);
    vm.runInContext(`${fn}\n;globalThis.__f = _staleCodeReload;`, ctx);
    return ctx.__f;
}

function env({ sw = true, storageThrows = false } = {}) {
    const store = new Map();
    const log = [];
    let fireChange;
    return {
        log, store, fire: () => fireChange && fireChange(),
        storage: {
            getItem: k => { if (storageThrows) throw new Error('blocked'); return store.get(k) ?? null; },
            setItem: (k, v) => { if (storageThrows) throw new Error('blocked'); store.set(k, v); },
        },
        sw: sw ? {
            addEventListener: (ev, cb) => { log.push(`listen:${ev}`); fireChange = cb; },
            getRegistration: async () => ({ update: async () => { log.push('update'); } }),
        } : undefined,
        reload: () => log.push('reload'),
        wait: () => new Promise(() => {}),
    };
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('an unknown server route reloads once, after the new worker takes control', async () => {
    const f = load();
    const e = env();
    assert.equal(f('nba-team-DET', e), true);
    await tick();
    assert.deepEqual(e.log, ['listen:controllerchange', 'update']);
    e.fire();
    await tick();
    assert.equal(e.log.at(-1), 'reload');
    assert.equal(e.store.get('zs_route_reload:nba-team-DET'), '1');
});

test('the same route does not reload twice in a session, so a really unknown route lands on home', () => {
    const f = load();
    const e = env();
    e.store.set('zs_route_reload:nba-team-DET', '1');
    assert.equal(f('nba-team-DET', e), false);
    assert.deepEqual(e.log, []);
});

test('without a service worker it still reloads, after the wait', async () => {
    const f = load();
    const e = env({ sw: false });
    e.wait = () => Promise.resolve();
    assert.equal(f('ncaab-leaders', e), true);
    await tick(); await tick();
    assert.deepEqual(e.log, ['reload']);
});

test('blocked storage never reloads (no way to stop a loop)', () => {
    const f = load();
    const e = env({ storageThrows: true });
    assert.equal(f('nba-team-DET', e), false);
    assert.deepEqual(e.log, []);
});

test('_loadFromHash asks for the reload before falling back to the hash or home', () => {
    const body = NAV.match(/^function _loadFromHash\(\) \{[\s\S]*?const hash = window\.location\.hash\.slice\(1\);/m)[0];
    assert.match(body, /if \(_staleCodeReload\(_r\)\) return;\r?\n    \}\r?\n    const hash/);
});

test('sw.js revalidates stale-while-revalidate refreshes instead of reading the HTTP cache', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.match(sw, /const network = fetch\(new Request\(e\.request, \{ cache: 'no-cache' \}\)\)/);
});
