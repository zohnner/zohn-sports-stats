// ============================================================
// Sitemap check (tools/audit/sitemap-check.cjs) and the audit runner's
// backlog rule (tools/audit/integrity-audit.cjs). Planted faults.
// Run: node --test tests/sitemapCheck.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { readSitemap, check } = require('../tools/audit/sitemap-check.cjs');
const { unowned } = require('../tools/audit/integrity-audit.cjs');

const url = (p, mod) => `<url><loc>https://sportstrata.cc${p}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}<changefreq>daily</changefreq></url>`;
const STORIES = [{ sport: 'nba', slug: '2026-11-15-a', date: '2026-11-15' }, { sport: 'nfl', slug: '2026-11-10-b', date: '2026-11-10' }];
const good = () => [url('/', ''), url('/nba/stories', '2026-11-15'), url('/nfl/stories', '2026-11-10'),
    url('/nba/stories/2026-11-15-a', '2026-11-15'), url('/nfl/stories/2026-11-10-b', '2026-11-10'), url('/mlb/standings', '')];
const run = urls => check(readSitemap(`<urlset>${urls.join('\n')}</urlset>`), STORIES);

test('a sitemap that lists every story and index with its date passes', () => {
    const r = run(good());
    assert.deepEqual(r.findings, []);
    assert.equal(r.urls, 6);
    assert.equal(r.withLastmod, 4);
    assert.equal(r.stories, 2);
    assert.equal(r.indexes, 2);
});

test('planted fault: a story with no <lastmod>', () => {
    const urls = good();
    urls[3] = url('/nba/stories/2026-11-15-a', '');
    assert.deepEqual(run(urls).findings.map(f => [f.kind, f.url]), [['no-lastmod', '/nba/stories/2026-11-15-a']]);
});

test('planted fault: a story missing from the sitemap, and one with the wrong date', () => {
    const urls = good();
    urls.splice(3, 1);
    urls[3] = url('/nfl/stories/2026-11-10-b', '2026-11-11');
    assert.deepEqual(run(urls).findings.map(f => f.kind), ['missing', 'wrong-lastmod']);
});

test('planted fault: a stories index with no <lastmod>', () => {
    const urls = good();
    urls[1] = url('/nba/stories', '');
    assert.deepEqual(run(urls).findings.map(f => [f.kind, f.url]), [['no-lastmod', '/nba/stories']]);
});

test('backlog: an open derived-stat issue with no comment is unowned; one with a comment is not', () => {
    const issues = [{ number: 1, title: 'a', comments: [] }, { number: 2, title: 'b', comments: [{ body: 'Owner: Claude Code' }] }, { number: 3, title: 'c', comments: [] }];
    assert.deepEqual(unowned(issues).map(i => i.number), [1, 3]);
    assert.deepEqual(unowned([]), []);
});
