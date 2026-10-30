// ============================================================
// Account/Dashboard must not replace <main>'s contents (D-191): doing so
// deleted #playersGrid and every later view rendered into nothing until a
// reload. They render into _mainTakeover(), released by renderCurrentView and
// setBreadcrumb. Source-level guard; the behavior was verified in a browser.
// Run: node --test tests/mainTakeover.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const fnBody = (src, sig) => src.match(new RegExp(`^${sig}\\([\\s\\S]*?^}`, 'm'))[0];

test('account and dashboard render into the takeover node, never <main> itself', () => {
    for (const [file, name] of [['js/auth.js', 'renderAccountView'], ['js/app.js', 'renderDashboardView']]) {
        const body = fnBody(read(file), `async function ${name}`);
        assert.match(body, /const main = _mainTakeover\(\);/, name);
        assert.doesNotMatch(body, /getElementById\('main'\)|querySelector\('main'\)/, name);
    }
});

test('every non-takeover render path releases the takeover', () => {
    const nav = read('js/navigation.js');
    const render = fnBody(nav, 'function renderCurrentView');
    const dash = render.indexOf("view === 'dashboard'");
    assert.ok(dash > 0 && render.indexOf('_releaseMainTakeover();') > dash, 'released right after the takeover views');
    assert.match(nav, /^function setBreadcrumb\(root, current\) \{\r?\n\s+_releaseMainTakeover\(\);/m);
});
