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
    '- another item',
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
        hero_stat: '9 of 10 red-zone trips', url: '/nfl/stories/2026-09-30-x', sport: 'nfl',
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

test('checkStory sees a number hidden inside a malformed link but drops a real link target', () => {
    assert.deepEqual(tokensOf(core.checkStory(draft('See [the table](x 99 points) now'), FACTS, '')), ['99']);
    assert.deepEqual(core.checkStory(draft('[49ers](/nfl/team/sf?v=77)'), FACTS, ''), []);
});

test('checkStory rejects zero, multiplier words and ordinals, but allows real football phrasing', () => {
    assert.deepEqual(
        tokensOf(core.checkStory(draft('It ranks second, their third straight win, zero touchdowns, twice.'), FACTS, '')),
        ['second', 'third', 'zero', 'twice']);
    assert.deepEqual(
        core.checkStory(draft('a second-half comeback on third down in the fourth quarter, facing second-and-8'), FACTS, ''),
        []);
});

test('checkStory treats an en dash as a minus sign', () => {
    const facts46 = { facts: [{ key: 'm', value: 46, source: '/api/x' }] };
    assert.deepEqual(tokensOf(core.checkStory(draft('a –46 margin'), facts46, '')), ['–46']);
    const factsNeg46 = { facts: [{ key: 'm', value: -46, source: '/api/x' }] };
    assert.deepEqual(core.checkStory(draft('a –46 margin'), factsNeg46, ''), []);
    const facts3410 = { facts: [{ key: 'a', value: 34, source: '/api/x' }, { key: 'b', value: 10, source: '/api/x' }] };
    assert.deepEqual(core.checkStory(draft('won 34–10'), facts3410, ''), []);
});

test('validateMeta rejects a title over 80 characters (og card limit)', () => {
    const base = { dek: 'd', date: '2026-09-30', season: 2026, week: 1, teams: [], hero_stat: 'h' };
    const probs = core.validateMeta({ ...base, title: 'x'.repeat(81) });
    assert.ok(probs.includes('title must be 80 characters or fewer (og card limit)'));
    const okProbs = core.validateMeta({ ...base, title: 'x'.repeat(80) });
    assert.ok(!okProbs.includes('title must be 80 characters or fewer (og card limit)'));
});

const indexCli = require('../tools/stories/build-index.cjs');

function storyDir(files) {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stories-idx-'));
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    return dir;
}
const storyAt = (date, title) => STORY.replace('date: 2026-09-30', `date: ${date}`).replace('Detroit keeps finishing drives', title);

test('loadStories indexes valid stories newest first and ignores non-story files', () => {
    const dir = storyDir({
        '2026-09-23-older.md': storyAt('2026-09-23', 'Older'), '2026-09-23-older.facts.json': JSON.stringify(FACTS), '2026-09-23-older.social.md': 'x',
        '2026-09-30-newer.md': storyAt('2026-09-30', 'Newer'), '2026-09-30-newer.facts.json': JSON.stringify(FACTS), '2026-09-30-newer.social.md': 'x',
        'README.md': '# not a story',
    });
    const { stories, problems } = indexCli.loadStories(dir);
    assert.deepEqual(problems, []);
    assert.deepEqual(stories.map(s => s.slug), ['2026-09-30-newer', '2026-09-23-older']);
});

test('loadStories reports missing files, unsourced numbers and a filename/date mismatch', () => {
    const dir = storyDir({
        '2026-09-30-nofacts.md': STORY,
        '2026-09-30-badnum.md': STORY.replace('First paragraph.', 'They scored 77 points.'), '2026-09-30-badnum.facts.json': JSON.stringify(FACTS), '2026-09-30-badnum.social.md': 'x',
        '2026-10-01-wrongdate.md': STORY, '2026-10-01-wrongdate.facts.json': JSON.stringify(FACTS), '2026-10-01-wrongdate.social.md': 'x',
    });
    const { problems } = indexCli.loadStories(dir);
    assert.ok(problems.some(p => p.startsWith('2026-09-30-nofacts: missing 2026-09-30-nofacts.facts.json')));
    assert.ok(problems.some(p => p.startsWith('2026-09-30-badnum: [body]') && p.includes('"77"')));
    assert.ok(problems.some(p => p.startsWith('2026-10-01-wrongdate: filename date must match')));
});

test('loadStories flags a misnamed story filename but leaves README and social files alone', () => {
    const dir = storyDir({ '2026-09-30-Bad.md': STORY, 'README.md': '# not a story', 'x.social.md': 'y' });
    const { problems } = indexCli.loadStories(dir);
    assert.ok(problems.some(p => p.startsWith('2026-09-30-Bad.md: not a valid story filename')));
});

test('loadStories reports nothing extra for README.md and a lone social file', () => {
    const dir = storyDir({ 'README.md': '# not a story', 'x.social.md': 'y' });
    const { problems } = indexCli.loadStories(dir);
    assert.deepEqual(problems, []);
});

test('main --check fails on a stale index and passes after a rebuild', (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    const dir = storyDir({ '2026-09-30-x.md': STORY, '2026-09-30-x.facts.json': JSON.stringify(FACTS), '2026-09-30-x.social.md': 'x' });
    assert.equal(indexCli.main(['--check', '--dir', dir]), 2);
    assert.equal(indexCli.main(['--dir', dir]), 0);
    assert.equal(indexCli.main(['--check', '--dir', dir]), 0);
});

// ── MLB (D-171) ──────────────────────────────────────────────
const MLB_STORY = [
    '---',
    'title: Seattle keeps winning late',
    'dek: The Mariners own the 9th inning.',
    'date: 2026-10-04',
    'season: 2026',
    'round: ALDS',
    'teams: [SEA, NYY]',
    'players: []',
    'hero_stat: 9 of 10 one-run games',
    '---',
    '',
    'First paragraph.',
].join('\n');
const mlbDraft = (body, meta = {}) => ({ meta: { title: 'T', dek: 'D', hero_stat: 'H', season: 2026, ...meta }, body });

test('validateMeta: MLB needs no week, NFL still does, unknown sports are rejected', () => {
    const meta = core.parseStory(MLB_STORY).meta;
    assert.deepEqual(core.validateMeta(meta, 'mlb'), []);
    assert.ok(core.validateMeta(meta, 'nfl').includes('missing week'));
    assert.ok(core.validateMeta(meta, 'nhl').includes('unknown sport nhl'));
});

test('validateMeta: round is plain text with no digits (it is never number-checked)', () => {
    const meta = { ...core.parseStory(MLB_STORY).meta, round: 'Game 7' };
    assert.ok(core.validateMeta(meta, 'mlb').includes('round must not contain digits'));
});

test('url, index entry and eyebrow are per sport', () => {
    const meta = core.parseStory(MLB_STORY).meta;
    assert.equal(core.storyUrl('2026-10-04-x', 'mlb'), '/mlb/stories/2026-10-04-x');
    const e = core.indexEntry('2026-10-04-x', meta, 'mlb');
    assert.equal(e.url, '/mlb/stories/2026-10-04-x');
    assert.equal(e.sport, 'mlb');
    assert.equal(e.week, undefined);
    assert.equal(e.round, 'ALDS');
    assert.equal(core.storyEyebrow(meta, 'mlb'), 'MLB · 2026 ALDS');
    assert.equal(core.storyEyebrow({ season: 2026 }, 'mlb'), 'MLB · 2026 Season');
    assert.equal(core.storyEyebrow({ week: 4 }, 'nfl'), 'NFL Week 4');
});

test('checkStory allows real baseball phrasing in MLB stories', () => {
    const body = 'A two-out, 3-2 slider in the 9th inning of Game 5 in the 2026 ALDS, the seventh-inning stretch long gone, '
        + 'snared by the third baseman on a 0-2 pitch with 2-out pressure in the 2026 postseason.';
    assert.deepEqual(core.checkStory(mlbDraft(body), FACTS, '', 'mlb'), []);
});

test('checkStory still flags unsourced MLB stats', () => {
    assert.deepEqual(tokensOf(core.checkStory(mlbDraft('He hit .312 with 44 homers in the 9th inning, a 5-4 win.'), FACTS, '', 'mlb')),
        ['.312', '44', '5', '4']);
});

test('checkStory keeps each sport to its own phrase list', () => {
    assert.deepEqual(tokensOf(core.checkStory(draft('Game 5 in the 8th inning'), FACTS, '', 'nfl')), ['5', '8th']);
    assert.deepEqual(tokensOf(core.checkStory(mlbDraft('on 2nd down in Week 4'), FACTS, '', 'mlb')), ['2nd', '4']);
});

test('sportFromPath reads the content/<sport>/stories folder', () => {
    const path = require('node:path');
    assert.equal(core.sportFromPath(path.join('x', 'content', 'mlb', 'stories', 'a.md')), 'mlb');
    assert.equal(core.sportFromPath('content/nfl/stories'), 'nfl');
    assert.equal(core.sportFromPath('/tmp/whatever'), null);
});

test('loadStories validates an MLB folder with MLB rules', () => {
    const files = { '2026-10-04-x.md': MLB_STORY, '2026-10-04-x.facts.json': JSON.stringify(FACTS), '2026-10-04-x.social.md': 'x' };
    const mlb = indexCli.loadStories(storyDir(files), 'mlb');
    assert.deepEqual(mlb.problems, []);
    assert.equal(mlb.stories[0].url, '/mlb/stories/2026-10-04-x');
    assert.ok(indexCli.loadStories(storyDir(files), 'nfl').problems.some(p => p.includes('missing week')));
});

test('check-numbers CLI infers MLB from the story path', (t) => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const cli = require('../tools/stories/check-numbers.cjs');
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stories-')), 'content', 'mlb', 'stories');
    fs.mkdirSync(dir, { recursive: true });
    const md = path.join(dir, '2026-10-04-x.md');
    fs.writeFileSync(md, MLB_STORY.replace('First paragraph.', 'A 3-2 count in the 9th inning.'));
    fs.writeFileSync(path.join(dir, '2026-10-04-x.facts.json'), JSON.stringify(FACTS));
    fs.writeFileSync(path.join(dir, '2026-10-04-x.social.md'), 'Seattle: 9 of 10.');
    assert.equal(cli.main([md]), 0);
});
