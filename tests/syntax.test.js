// ============================================================
// Syntax guard: every browser script must parse. The scripts share one global
// scope through <script> tags, so a single parse error (D-187 shipped a regex
// with its escapes stripped in js/navigation.js) kills setupNavigation and the
// whole app boots dead, while no unit test loads that file to notice.
// Run: node --test tests/syntax.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const JS_DIR = path.join(__dirname, '..', 'js');

test('every js/*.js file parses', () => {
    const broken = fs.readdirSync(JS_DIR)
        .filter(f => f.endsWith('.js'))
        .map(f => ({ f, r: spawnSync(process.execPath, ['--check', path.join(JS_DIR, f)], { encoding: 'utf8' }) }))
        .filter(({ r }) => r.status !== 0)
        .map(({ f, r }) => `${f}: ${r.stderr.split('\n').slice(0, 3).join(' ')}`);
    assert.deepEqual(broken, []);
});
