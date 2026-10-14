// ============================================================
// Story share links (tools/stories/share-links.cjs, D-179). No network.
// Run: node --test tests/shareLinks.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sl = require('../tools/stories/share-links.cjs');

const JAX_SLUG = '2026-09-30-jaguars-fewest-points-allowed';
const JAX_SOCIAL = fs.readFileSync(path.join(__dirname, '..', 'content', 'nfl', 'stories', `${JAX_SLUG}.social.md`), 'utf8');
const JAX_URL = `https://sportstrata.cc/nfl/stories/${JAX_SLUG}`;

test('addedStories keeps only story .md files for known sports', () => {
    const diff = [
        'content/nfl/stories/2026-10-14-bills-run-game.md',
        'content/nfl/stories/2026-10-14-bills-run-game.social.md',
        'content/nfl/stories/2026-10-14-bills-run-game.facts.json',
        'content/mlb/stories/2026-10-15-dodgers-bullpen.md',
        'content/nhl/stories/2026-10-15-oilers.md',
        'content/nfl/stories/index.json',
        'content/nfl/stories/README.md',
        'js/app.js',
        '',
    ].join('\n');
    assert.deepEqual(sl.addedStories(diff), [
        { sport: 'nfl', slug: '2026-10-14-bills-run-game' },
        { sport: 'mlb', slug: '2026-10-15-dodgers-bullpen' },
    ]);
    assert.deepEqual(sl.addedStories(''), []);
});

test('extractSection returns a section verbatim, stopping at the next heading', () => {
    const x = sl.extractSection(JAX_SOCIAL, 'X');
    assert.ok(x.startsWith('Jaguars through Week 3: 36 points allowed'));
    assert.ok(x.endsWith(JAX_URL));
    assert.ok(x.includes('\n\nTheir 3 opponents'), 'internal blank lines preserved');
    assert.ok(!x.includes('Full breakdown'));
    assert.ok(sl.extractSection(JAX_SOCIAL, 'Reddit').endsWith(JAX_URL));

    assert.equal(sl.extractSection('## X\r\n\r\nline one\r\n\r\nline two\r\n## Bluesky\r\nother\r\n', 'X'), 'line one\n\nline two');
    assert.equal(sl.extractSection('## Reddit\n\nno x here', 'X'), null);
    assert.equal(sl.extractSection('## X\n\n   \n', 'X'), null);
    assert.equal(sl.extractSection('## Xtra\n\nnot it', 'X'), null);
});

test('parseReddit splits the **Title:** line from the body', () => {
    const r = sl.parseReddit(sl.extractSection(JAX_SOCIAL, 'Reddit'));
    assert.ok(r.title.startsWith('Through Week 3, the Jaguars have allowed 36 points'));
    assert.ok(r.body.startsWith('Jacksonville is 2-1'));
    assert.ok(!r.body.includes('**Title:**'));
    assert.deepEqual(sl.parseReddit('just a body'), { title: null, body: 'just a body' });
    assert.equal(sl.parseReddit(null), null);
});

test('weightedLength counts every URL as 23 and weights wide characters as 2', () => {
    assert.equal(sl.weightedLength('hello'), 5);
    assert.equal(sl.weightedLength(`see ${JAX_URL}`), 4 + 23);
    assert.equal(sl.weightedLength('go to sportstrata.cc now'), 'go to '.length + 23 + ' now'.length);
    assert.equal(sl.weightedLength(`${JAX_URL}.`), 24, 'trailing period is not part of the link');
    assert.equal(sl.weightedLength('日本'), 4);
    assert.equal(sl.weightedLength('🏈'), 2);
    assert.equal(sl.weightedLength('👨‍👩‍👧'), 2, 'ZWJ emoji sequence counts once');
    assert.equal(sl.weightedLength('é'), 1, 'decomposed é normalizes to one character');
    assert.equal(sl.weightedLength('a'.repeat(256) + ' ' + JAX_URL), 280);
    assert.equal(sl.weightedLength('a'.repeat(257) + ' ' + JAX_URL), 281);
});

test('xIntentUrl round-trips the exact text, newlines included', () => {
    const text = sl.extractSection(JAX_SOCIAL, 'X');
    const u = new URL(sl.xIntentUrl(text));
    assert.equal(u.origin + u.pathname, 'https://x.com/intent/post');
    assert.equal(u.searchParams.get('text'), text);

    const paren = 'scored 58 (11.6 vs 23.3) https://sportstrata.cc/x';
    const link = sl.xIntentUrl(paren);
    assert.ok(!/[()]/.test(link), 'no raw parentheses to break a Markdown link');
    assert.equal(new URL(link).searchParams.get('text'), paren);
});

test('shareBlock links the prefilled composer and the Reddit copy blocks', () => {
    const md = sl.shareBlock({ sport: 'nfl', slug: JAX_SLUG, title: 'Jaguars', social: JAX_SOCIAL, live: true });
    assert.ok(md.includes(`[Post to X](${sl.xIntentUrl(sl.extractSection(JAX_SOCIAL, 'X'))})`));
    assert.ok(md.includes(`Live: ${JAX_URL}`));
    assert.match(md, /\*\*X\*\* \(\d+\/280\)\n/);
    assert.ok(!md.includes('⚠️'));
    assert.ok(md.includes('````\nThrough Week 3, the Jaguars'));
});

test('shareBlock warns instead of blocking when something is off', () => {
    const long = `## X\n\n${'a'.repeat(300)} https://sportstrata.cc/nfl/stories/2026-01-01-other\n`;
    const md = sl.shareBlock({ sport: 'nfl', slug: JAX_SLUG, title: 'T', social: long, live: false });
    assert.match(md, /Not live yet/);
    assert.match(md, /over by \d+/);
    assert.match(md, /doesn't contain the story's URL/);
    assert.ok(md.includes('[Post to X]('), 'link still offered so it can be fixed in the composer');
    assert.match(sl.shareBlock({ sport: 'nfl', slug: JAX_SLUG, title: 'T', social: '## Reddit\n\nx', live: true }), /no `## X` section/);
});

test('liveCheck requires a real 200 that rendered the story', async () => {
    const page = res => async (_url, init) => {
        assert.equal(init.redirect, 'manual');
        return res;
    };
    assert.equal(await sl.liveCheck('nfl', JAX_SLUG, page({ status: 200, text: async () => `<link rel="canonical" href="${JAX_URL}">` })), true);
    assert.equal(await sl.liveCheck('nfl', JAX_SLUG, page({ status: 404, text: async () => '' })), false);
    assert.equal(await sl.liveCheck('nfl', JAX_SLUG, page({ status: 302, text: async () => '' })), false);
    assert.equal(await sl.liveCheck('nfl', JAX_SLUG, page({ status: 200, text: async () => '<html>shell</html>' })), false);
    assert.equal(await sl.liveCheck('nfl', JAX_SLUG, async () => { throw new Error('offline'); }), false);
});
