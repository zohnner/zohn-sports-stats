// Ink + Ice rebrand guard (2026-11-20): no orange-family color may return outside team-color data.
const test = require('node:test');
const assert = require('node:assert');
const { isOrange, scanText, scan } = require('../tools/check-orange.cjs');

const rgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16));

test('the old brand oranges are detected', () => {
    for (const hex of ['#ff8100', '#ff7a00', '#ffb347', '#d96a00', '#fb923c', '#f97316', '#f59e0b']) {
        assert.ok(isOrange(...rgb(hex)), hex);
    }
});

test('ink, ice and the semantic colors are not orange', () => {
    for (const hex of ['#070b16', '#0f182a', '#4cc9f0', '#f2f7fc', '#8fa3bf', '#facc15', '#fbbf24', '#ff006e', '#e5484d']) {
        assert.ok(!isOrange(...rgb(hex)), hex);
    }
});

test('planted fault: an orange in a stylesheet is reported, one inside a team-color fence is not', () => {
    const css = '.x { color: #ff8100; }\n// ss-team-colors:start\nconst T = { BAL: "#DF4601" };\n// ss-team-colors:end\n';
    assert.deepStrictEqual(scanText('css/planted.css', css), ['css/planted.css:1  #ff8100']);
});

test('the site has zero orange-family colors outside team-color data', () => {
    assert.deepStrictEqual(scan(), []);
});
