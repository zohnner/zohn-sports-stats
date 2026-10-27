// ============================================================
// Stories topic gate (tools/stories/story-core.cjs). The number checker only
// proves provenance; this rejects the PLAYBOOK's "not news" topics (injuries,
// transactions, reporting, quotes). The Simmons IR story shipped without it.
// Run: node --test tests/storyTopics.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const core = require('../tools/stories/story-core.cjs');

const FACTS = { facts: [{ key: 'days', value: 66, source: '/api/x' }, { key: 'pts', value: 112, source: '/api/x' }, { key: 'wk', value: 6, source: '/api/x' }] };
const draft = (body, meta = {}) => ({ meta: { title: 'T', dek: 'D', hero_stat: 'H', season: 2026, week: 6, ...meta }, body });
const topicTokens = probs => probs.filter(p => p.message.startsWith('off-limits topic')).map(p => p.token.toLowerCase());

test('rejects the Simmons story on injury, reporting and quote grounds', () => {
    const story = draft(
        'The Chiefs placed Josh Simmons on injured reserve. An MRI found a herniated disc, and surgery is not recommended. ' +
        'Rick Burkholder opened the press conference, and Reid said he was "ramping up" on Monday.',
        { title: 'Josh Simmons hit IR 66 days after the Chiefs found his herniated disc' });
    const toks = topicTokens(core.checkStory(story, FACTS, ''));
    for (const t of ['ir', 'herniated', 'injured reserve', 'mri', 'surgery', 'press conference', '"ramping up"']) {
        assert.ok(toks.includes(t), `expected "${t}" in ${JSON.stringify(toks)}`);
    }
});

test('rejects transactions and rumors', () => {
    const toks = topicTokens(core.checkStory(draft('Reportedly the Jets traded for him after signing a free agent.'), FACTS, ''));
    assert.deepEqual(toks.sort(), ['free agent', 'reportedly', 'signing', 'traded'].sort());
});

test('checks the title, dek, hero_stat and social copy too', () => {
    const story = draft('Clean body.', { dek: 'An injury story', hero_stat: '66 days on IR' });
    const where = core.checkStory(story, FACTS, 'Sources said he was traded').filter(p => p.message.startsWith('off-limits')).map(p => p.where);
    assert.deepEqual([...new Set(where)].sort(), ['dek', 'hero_stat', 'social']);
});

test('passes ordinary stat writing', () => {
    const body = 'Jacksonville allowed the fewest points through Week 6: 112. ' +
        'The trade-off is a slower offense. **Irving** and the Irish-born kicker are both fine.';
    assert.deepEqual(core.checkStory(draft(body), FACTS, ''), []);
});

test('every published story passes the topic gate', () => {
    const root = path.join(__dirname, '..', 'content');
    for (const sport of Object.keys(core.STORY_SPORTS)) {
        const dir = path.join(root, sport, 'stories');
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir).filter(n => /^\d{4}-.*(?<!\.social)\.md$/.test(n))) {
            const story = core.parseStory(fs.readFileSync(path.join(dir, f), 'utf8'));
            const socialPath = path.join(dir, f.replace(/\.md$/, '.social.md'));
            const social = fs.existsSync(socialPath) ? fs.readFileSync(socialPath, 'utf8') : '';
            const facts = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.md$/, '.facts.json')), 'utf8'));
            assert.deepEqual(topicTokens(core.checkStory(story, facts, social, sport)), [], `${sport}/${f}`);
        }
    }
});
