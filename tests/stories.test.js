// ============================================================
// SportStrata Stories core + CLIs (tools/stories/*.cjs, D-166).
// Run: node --test tests/stories.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../tools/stories/story-core.cjs');

const STORY = [
    '---',
    'title: Detroit keeps finishing drives',
    'dek: The Lions turn red-zone trips into touchdowns.',
    'date: 2026-09-30',
    'season: 2026',
    'week: 4',
    'teams: [DET, NYJ]',
    'players: []',
    'hero_stat: 9 of 10 red-zone trips',
    '---',
    '',
    'First paragraph.',
    '',
    '## A heading',
    '',
    '- one item',
    '- two item',
].join('\n');

test('parseStory reads frontmatter types and body', () => {
    const { meta, body } = core.parseStory(STORY);
    assert.equal(meta.title, 'Detroit keeps finishing drives');
    assert.equal(meta.season, 2026);
    assert.equal(meta.week, 4);
    assert.deepEqual(meta.teams, ['DET', 'NYJ']);
    assert.deepEqual(meta.players, []);
    assert.equal(meta.hero_stat, '9 of 10 red-zone trips');
    assert.match(body, /^First paragraph\./);
});

test('parseStory accepts CRLF line endings', () => {
    assert.equal(core.parseStory(STORY.replace(/\n/g, '\r\n')).meta.week, 4);
});

test('parseStory rejects missing frontmatter and malformed lines', () => {
    assert.throws(() => core.parseStory('no frontmatter here'), core.StoryError);
    assert.throws(() => core.parseStory('---\nTitle Case: x\n---\nbody'), core.StoryError);
});

test('validateMeta passes a complete story and names each problem', () => {
    assert.deepEqual(core.validateMeta(core.parseStory(STORY).meta), []);
    const probs = core.validateMeta({ title: 'x', date: '9/30/2026', season: '2026', week: 4, teams: 'DET' });
    assert.ok(probs.includes('missing dek'));
    assert.ok(probs.includes('missing hero_stat'));
    assert.ok(probs.includes('date must be YYYY-MM-DD'));
    assert.ok(probs.includes('season must be an integer'));
    assert.ok(probs.includes('teams must be a [list]'));
});

test('renderBody renders the allowed subset', () => {
    assert.equal(core.renderBody('Hello **world**.\n\n## Head\n\n- a\n- b'),
        '<p>Hello <strong>world</strong>.</p><h2>Head</h2><ul><li>a</li><li>b</li></ul>');
});

test('renderBody joins wrapped lines into one paragraph', () => {
    assert.equal(core.renderBody('line one\nline two'), '<p>line one line two</p>');
});

test('renderBody escapes raw HTML', () => {
    assert.equal(core.renderBody('<script>alert(1)</script> & "q"'),
        '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;</p>');
});

test('renderBody keeps safe links and neutralizes unsafe ones', () => {
    assert.equal(core.renderBody('[site](/nfl/team/det) [ext](https://x.com/a?b=1&c=2)'),
        '<p><a href="/nfl/team/det">site</a> <a href="https://x.com/a?b=1&amp;c=2">ext</a></p>');
    assert.equal(core.renderBody('[bad](javascript:alert(1)) [proto](//evil.com) [http](http://x.com)'),
        '<p>bad) proto http</p>');
});

test('slug, url and index-entry helpers', () => {
    assert.ok(core.SLUG_RE.test('2026-09-30-detroit-red-zone'));
    assert.ok(!core.SLUG_RE.test('../etc/passwd'));
    assert.ok(!core.SLUG_RE.test('2026-09-30-Detroit'));
    assert.equal(core.storyUrl('2026-09-30-x'), '/nfl/stories/2026-09-30-x');
    assert.deepEqual(core.indexEntry('2026-09-30-x', core.parseStory(STORY).meta), {
        slug: '2026-09-30-x', title: 'Detroit keeps finishing drives',
        dek: 'The Lions turn red-zone trips into touchdowns.', date: '2026-09-30',
        season: 2026, week: 4, teams: ['DET', 'NYJ'], players: [],
        hero_stat: '9 of 10 red-zone trips', url: '/nfl/stories/2026-09-30-x',
    });
});
