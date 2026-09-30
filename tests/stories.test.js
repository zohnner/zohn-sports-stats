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
    '- second item',
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

test('renderBody rejects backslash, protocol-relative and userinfo link tricks', () => {
    assert.equal(core.renderBody('[a](/\\evil.com) [b](/\\/evil.com) [c](https://sportstrata.cc@evil.com/) [d](/nfl\\x)'),
        '<p>a b c d</p>');
    assert.equal(core.renderBody('[ok](/) [ok2](/nfl/stories/x)'),
        '<p><a href="/">ok</a> <a href="/nfl/stories/x">ok2</a></p>');
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

const FACTS = { facts: [
    { key: 'rz_td', value: 9, source: '/api/x' },
    { key: 'rz_trips', value: 10, source: '/api/x' },
    { key: 'rz_rate', value: 0.9048, source: '/api/x' },
    { key: 'rating', value: 6.4, source: 'computeSRS' },
    { key: 'yards', value: 1234, source: '/api/x' },
    { key: 'rank', value: 3, source: '/api/x' },
] };
const draft = (body, meta = {}) => ({ meta: { title: 'T', dek: 'D', hero_stat: 'H', season: 2026, week: 4, ...meta }, body });
const tokensOf = probs => probs.map(p => p.token);

test('checkStory passes when every number is a fact', () => {
    assert.deepEqual(core.checkStory(draft('Detroit scored on 9 of 10 trips, 1,234 yards, #3 overall.'), FACTS, ''), []);
});

test('checkStory matches percents, rates and rounding within the stated precision', () => {
    assert.deepEqual(core.checkStory(draft('That is 90%, or 90.5%, a .905 clip, with a 6.4 rating (about 6).'), FACTS, ''), []);
    assert.deepEqual(tokensOf(core.checkStory(draft('A 7 rating and 91%.'), FACTS, '')), ['7', '91%']);
});

test('checkStory ignores week refs, the season, link targets, football phrases and team names', () => {
    const body = 'In Week 4 of the 2026 season the [49ers](/nfl/team/sf?v=77) faced a 3rd down, then a 4th-and-2, and went for two-point. See https://x.com/12345.';
    assert.deepEqual(core.checkStory(draft(body), FACTS, ''), []);
});

test('checkStory rejects spelled-out numbers', () => {
    assert.deepEqual(tokensOf(core.checkStory(draft('They won three straight and ten of eleven.'), FACTS, '')), ['three', 'ten', 'eleven']);
});

test('checkStory checks title, dek, hero_stat and social too', () => {
    const probs = core.checkStory(draft('ok', { title: 'Up 12 spots', dek: 'A 5-game run', hero_stat: '44 yards' }), FACTS, 'Reddit: 88 points');
    assert.deepEqual(probs.map(p => [p.where, p.token]), [['title', '12'], ['dek', '5'], ['hero_stat', '44'], ['social', '88']]);
});

test('checkStory requires a well-formed facts file with sources', () => {
    assert.throws(() => core.checkStory(draft('x'), { nope: [] }, ''), core.StoryError);
    const probs = core.checkStory(draft('9 trips'), { facts: [{ key: 'a', value: 9 }] }, '');
    assert.deepEqual(probs.map(p => p.where), ['facts', 'body']);
});

test('check-numbers CLI exits 0 on a clean story and 2 on an unsourced number', (t) => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const cli = require('../tools/stories/check-numbers.cjs');
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stories-'));
    const md = path.join(dir, '2026-09-30-x.md');
    fs.writeFileSync(md, STORY);
    fs.writeFileSync(path.join(dir, '2026-09-30-x.facts.json'), JSON.stringify(FACTS));
    fs.writeFileSync(path.join(dir, '2026-09-30-x.social.md'), 'Detroit: 9 of 10.');
    assert.equal(cli.main([md]), 0);
    fs.writeFileSync(path.join(dir, '2026-09-30-x.social.md'), 'Detroit: 11 of 12.');
    assert.equal(cli.main([md]), 2);
});

test('checkStory sees numbers attached to letters but exempts 49ers/76ers', () => {
    assert.deepEqual(tokensOf(core.checkStory(draft('A 4x jump and 88yds for the 49ers.'), FACTS, '')), ['4', '88']);
});

test('checkStory makes the sign count', () => {
    const facts = { facts: [{ key: 'pd', value: -6, source: '/api/x' }, { key: 'g', value: 9, source: '/api/x' }] };
    assert.deepEqual(core.checkStory(draft('They are -6 in differential and +9 in wins, a 27-9 score? no: 9.'), facts, '').map(p => p.token), ['27']);
    assert.deepEqual(tokensOf(core.checkStory(draft('They are -9 in differential.'), facts, '')), ['-9']);
});

test('checkStory only exempts plausible week references and year-season phrases', () => {
    assert.deepEqual(core.checkStory(draft('In Week 4, after Weeks 1-3 and before Week 5, the 2026 season turned.'), FACTS, ''), []);
    assert.deepEqual(tokensOf(core.checkStory(draft('In Week 88 he needed 4 more catches and sold 2026 tickets.'), FACTS, '')), ['88', '4', '2026']);
});
