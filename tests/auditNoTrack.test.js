// Our own audit browsers must never write to the page_views log.
// Run: node --test tests/auditNoTrack.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { blockTracking, TRACK_RE } = require('../tools/audit/no-track.cjs');

function fakePage() {
    const p = { routes: [], inits: [] };
    p.route = async (re, handler) => { p.routes.push({ re, handler }); };
    p.addInitScript = async fn => { p.inits.push(fn); };
    return p;
}

test('TRACK_RE matches the page-view route and nothing else under /api', () => {
    assert.equal(TRACK_RE.test('https://sportstrata.cc/api/track'), true);
    assert.equal(TRACK_RE.test('https://sportstrata.cc/api/track?x=1'), true);
    assert.equal(TRACK_RE.test('https://sportstrata.cc/api/nba?path=/scoreboard'), false);
    assert.equal(TRACK_RE.test('https://sportstrata.cc/api/tracker'), false);
});

test('planted fault: a beacon sent from an audit page is aborted and sendBeacon is replaced', async () => {
    const page = fakePage();
    await blockTracking(page);
    assert.equal(page.routes.length, 1);
    assert.equal(page.routes[0].re, TRACK_RE);
    let aborted = 0;
    await page.routes[0].handler({ abort: async () => { aborted++; } });
    assert.equal(aborted, 1);
    const nav = { sendBeacon: () => { throw new Error('sent'); } };
    const saved = global.navigator;
    Object.defineProperty(global, 'navigator', { value: nav, configurable: true, writable: true });
    try { page.inits[0](); assert.equal(nav.sendBeacon('/api/track', 'x'), true); }
    finally { Object.defineProperty(global, 'navigator', { value: saved, configurable: true, writable: true }); }
});

test('planted fault: an audit tool that opens a page without blockTracking fails here', () => {
    for (const file of ['page-walk.cjs', 'route-crawl.cjs']) {
        const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'audit', file), 'utf8');
        const opened = src.indexOf('browser.newPage(');
        const blocked = src.indexOf('await blockTracking(page)');
        const went = src.indexOf('page.goto(');
        assert.ok(opened > -1 && went > -1, `${file} opens a page`);
        assert.ok(blocked > opened && blocked < went, `${file} must call blockTracking(page) before its first page.goto`);
    }
});
