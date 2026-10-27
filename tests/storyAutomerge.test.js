// ============================================================
// Stories auto-publish gate (D-187): tools/stories/automerge-check.cjs, plus
// the D-187 additions to story-core (new sports, the news hook).
// Run: node --test tests/storyAutomerge.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeProblems } = require('../tools/stories/automerge-check.cjs');
const core = require('../tools/stories/story-core.cjs');

const story = date => `---\ntitle: T\ndek: D\ndate: ${date}\nseason: 2027\nteams: [BOS]\nhero_stat: H\n---\nBody.`;
const reader = date => () => story(date);
const add = p => ({ filename: p, status: 'added' });

test('a fresh story PR passes and returns its new slugs', () => {
    const files = [add('content/nba/stories/2026-10-27-celtics-x.md'), add('content/nba/stories/2026-10-27-celtics-x.facts.json'),
        add('content/nba/stories/2026-10-27-celtics-x.social.md'), { filename: 'content/nba/stories/index.json', status: 'modified' }];
    assert.deepEqual(mergeProblems(files, reader('2026-10-27'), '2026-10-27'), { problems: [], slugs: ['2026-10-27-celtics-x'] });
});

test('anything outside content/<sport>/stories/ blocks the merge', () => {
    for (const p of ['tools/stories/story-core.cjs', '.github/workflows/story-automerge.yml', 'content/nfl/fields/x.json', 'content/nhl/stories/x.md']) {
        const { problems } = mergeProblems([add(p)], reader('2026-10-27'), '2026-10-27');
        assert.ok(problems.some(x => x.includes('outside the story fence')), p);
    }
});

test('a rename out of the fence is caught by its old path too', () => {
    const files = [{ filename: 'content/nfl/stories/x.md', previous_filename: 'js/app.js', status: 'renamed' }];
    assert.equal(mergeProblems(files, reader('2026-10-27'), '2026-10-27').problems.length, 1);
});

test('stale stories wait for the owner; deletions (unpublish) pass', () => {
    const stale = mergeProblems([add('content/mlb/stories/2026-10-20-x.md')], reader('2026-10-20'), '2026-10-27');
    assert.match(stale.problems[0], /more than 3 days/);
    const fresh = mergeProblems([add('content/mlb/stories/2026-10-24-x.md')], reader('2026-10-24'), '2026-10-27');
    assert.deepEqual(fresh.problems, []);
    const removed = mergeProblems([{ filename: 'content/nfl/stories/2026-09-30-x.md', status: 'removed' }], () => { throw new Error('unread'); }, '2026-10-27');
    assert.deepEqual(removed, { problems: [], slugs: [] });
});

test('an empty PR does not merge', () => {
    assert.deepEqual(mergeProblems([], reader('2026-10-27'), '2026-10-27').problems, ['PR changes no files']);
});

const FACTS = { facts: [{ key: 'pts', value: 112, source: 'https://x' }, { key: 'g', value: 4, source: 'https://x' }] };

test('news words are allowed in the hook only, and hook numbers still need facts', () => {
    const meta = { title: 'T', dek: 'D', hero_stat: 'H', season: 2027, hook: 'Celtics place star on IR after injury', hook_url: 'https://www.espn.com/x' };
    assert.deepEqual(core.checkStory({ meta, body: 'Boston scored 112 in 4 games without him.' }, FACTS, '', 'nba'), []);
    const inBody = core.checkStory({ meta, body: 'He is on IR and expected to miss time.' }, FACTS, '', 'nba').map(p => p.token);
    assert.ok(inBody.includes('IR') && inBody.includes('expected to'), JSON.stringify(inBody));
    const hookNum = core.checkStory({ meta: { ...meta, hook: 'Out 6 weeks' }, body: 'x' }, FACTS, '', 'nba');
    assert.ok(hookNum.some(p => p.where === 'hook' && p.token === '6'));
});

test('hook and hook_url go together and the URL must be https', () => {
    const base = { title: 'T', dek: 'D', date: '2026-10-27', season: 2027, teams: [], hero_stat: 'H' };
    assert.ok(core.validateMeta({ ...base, hook: 'x' }, 'nba').includes('hook and hook_url go together'));
    assert.ok(core.validateMeta({ ...base, hook: 'x', hook_url: 'javascript:alert(1)' }, 'nba').includes('hook_url must be an https URL'));
    assert.deepEqual(core.validateMeta({ ...base, hook: 'x', hook_url: 'https://www.espn.com/a' }, 'nba'), []);
});

test('new sports: NCAAF needs a week; basketball eyebrows show the season span', () => {
    const base = { title: 'T', dek: 'D', date: '2026-10-27', season: 2026, teams: [], hero_stat: 'H' };
    assert.ok(core.validateMeta(base, 'ncaaf').includes('missing week'));
    assert.equal(core.storyEyebrow({ season: 2027 }, 'nba'), 'NBA · 2026-27 Season');
    assert.equal(core.storyEyebrow({ season: 2027 }, 'ncaab'), 'NCAAB · 2026-27 Season');
    assert.equal(core.storyEyebrow({ week: 9 }, 'ncaaf'), 'NCAAF Week 9');
});

test('basketball phrases exempt structure, not stats', () => {
    const meta = { title: 'T', dek: 'D', hero_stat: 'H', season: 2027 };
    const body = 'In the 4th quarter of Game 3 the 76ers hit a 3-pointer to open the 2026-27 season. They scored 112.';
    assert.deepEqual(core.checkStory({ meta, body }, FACTS, '', 'nba'), []);
    assert.ok(core.checkStory({ meta, body: 'They scored 113.' }, FACTS, '', 'nba').some(p => p.token === '113'));
});
