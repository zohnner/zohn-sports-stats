// ============================================================
// Public surface guard: every tracked top-level repo entry must be classified
// public or private in functions/_private-paths.cjs, and every private entry
// must be routed through Functions so the middleware can 404 it.
// Run: node --test tests/publicSurface.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const p = require('../functions/_private-paths.cjs');

const ROOT = path.join(__dirname, '..');

test('every tracked top-level entry is classified', () => {
    const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    const files = new Set(tracked.filter(f => !f.includes('/')));
    const dirs = new Set(tracked.filter(f => f.includes('/')).map(f => f.split('/')[0]));
    const knownFiles = new Set([...p.PRIVATE_FILES, ...p.PUBLIC_FILES]);
    const knownDirs = new Set([...p.PRIVATE_DIRS, ...p.PUBLIC_DIRS]);
    const unclassified = [...[...files].filter(f => !knownFiles.has(f)), ...[...dirs].filter(d => !knownDirs.has(d)).map(d => d + '/')];
    assert.deepEqual(unclassified, [], 'Add these to PUBLIC_* or PRIVATE_* in functions/_private-paths.cjs');
});

test('public and private lists do not overlap', () => {
    assert.deepEqual(p.PRIVATE_FILES.filter(f => p.PUBLIC_FILES.includes(f)), []);
    assert.deepEqual(p.PRIVATE_DIRS.filter(d => p.PUBLIC_DIRS.includes(d)), []);
});

test('_routes.json routes every private path through Functions', () => {
    const routes = JSON.parse(fs.readFileSync(path.join(ROOT, '_routes.json'), 'utf8'));
    assert.deepEqual(p.routeRules().filter(r => !routes.include.includes(r)), []);
    assert.ok(routes.include.length + routes.exclude.length <= 100, 'Cloudflare caps _routes.json at 100 rules');
});

test('isPrivatePath blocks private files and dirs, including encoded forms', () => {
    for (const x of ['/CLAUDE.md', '/CLAUDE.md/', '/%43LAUDE.md', '/docs/a.md', '/tools/contract-check.cjs',
                     '/worker/push-game-alerts.js', '/.github/workflows/ci.yml', '/docs%2Fa.md', '//wrangler.toml']) {
        assert.equal(p.isPrivatePath(x), true, x);
    }
});

test('isPrivatePath leaves the site alone', () => {
    for (const x of ['/', '/index.html', '/js/app.js', '/css/main.css', '/assets/og-default.png', '/sw.js',
                     '/content/nfl/stories/index.json', '/data/stadiums.json', '/api/nfl', '/nfl/stories',
                     '/docs', '/tools', '/README', '/%E0%A4%A']) {
        assert.equal(p.isPrivatePath(x), false, x);
    }
});
