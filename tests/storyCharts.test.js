// ============================================================
// Story charts (D-195): site-drawn from values in the story body, so the
// number checker and topic gate cover them with no chart-specific rules.
// Run: node --test tests/storyCharts.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../tools/stories/story-core.cjs');
const { mergeProblems } = require('../tools/stories/automerge-check.cjs');

const BARS = [
    '::chart bars Point differential through Week 8',
    '*Jaguars | 85',
    '49ers | 58',
    'Bills | 52',
    '::',
].join('\n');
const MARGINS = ['::chart bars Margin by game', 'Week 1 vs CLE | 24', 'Week 2 at DEN | -7', '::'].join('\n');
const COMPARE = [
    '::chart compare Opponents scored less against Jacksonville',
    'Their other games | Against Jacksonville',
    'CIN | 31.5 | 17',
    'DEN | 21.7 | 20',
    '::',
].join('\n');

const meta = { title: 'A finding', dek: 'A dek.', date: '2026-11-02', season: 2026, week: 8, teams: ['JAX'], hero_stat: 'x' };
const facts = vals => ({ facts: vals.map((value, i) => ({ key: `f${i}`, value, label: 'x', source: '/api/x' })) });

test('a bars chart renders every row with its label and value as written', () => {
    const html = core.renderBody(BARS);
    assert.match(html, /^<figure class="ss-chart ss-chart--bars">/);
    assert.match(html, /<figcaption>Point differential through Week 8<\/figcaption>/);
    for (const v of ['Jaguars', '49ers', 'Bills', '>85<', '>58<', '>52<']) assert.ok(html.includes(v), v);
});

test('bars keep a zero baseline: the largest fills the track, others scale to it', () => {
    const html = core.renderBody(BARS);
    assert.match(html, /left:0%;width:100%/);
    assert.match(html, /left:0%;width:61\.2%/);
});

test('only the starred row is highlighted', () => {
    assert.equal((core.renderBody(BARS).match(/is-hi/g) || []).length, 1);
});

test('negative values diverge from a shared zero line', () => {
    const html = core.renderBody(MARGINS);
    assert.match(html, /is-neg/);
    assert.match(html, /left:22\.6%;width:77\.4%/);
    assert.match(html, /left:0%;width:22\.6%/);
});

test('a compare chart renders the legend and both values per row', () => {
    const html = core.renderBody(COMPARE);
    assert.ok(html.includes('Their other games') && html.includes('Against Jacksonville'));
    for (const v of ['CIN', '31.5', '17', 'DEN', '21.7', '20']) assert.ok(html.includes(v), v);
    assert.match(html, /left:100%/);
});

test('chart text is escaped', () => {
    const html = core.renderBody('::chart bars <img src=x>\n<b>A</b> | 1\nB | 2\n::');
    assert.ok(!html.includes('<img') && !html.includes('<b>A'));
});

test('a chart sits between ordinary blocks', () => {
    const html = core.renderBody(`Before.\n\n${BARS}\n\nAfter.`);
    assert.match(html, /^<p>Before\.<\/p><figure/);
    assert.match(html, /<\/figure><p>After\.<\/p>$/);
});

test('every chart value goes through the number checker', () => {
    const ok = core.checkStory({ meta, body: BARS }, facts([85, 58, 52]), '');
    assert.deepEqual(ok, []);
    const bad = core.checkStory({ meta, body: BARS }, facts([85, 58]), '');
    assert.deepEqual(bad.map(p => p.token), ['52']);
});

test('a chart sign has to match its fact', () => {
    const bad = core.checkStory({ meta, body: MARGINS }, facts([24, 7]), '');
    assert.deepEqual(bad.map(p => p.token), ['-7']);
});

test('the topic gate reads chart text too', () => {
    const bad = core.checkStory({ meta, body: '::chart bars Points since the trade for him\nA | 1\nB | 1\n::' }, facts([1]), '');
    assert.ok(bad.some(p => /off-limits/.test(p.message)));
});

for (const [name, body, re] of [
    ['an unknown chart type', '::chart pie X\nA | 1\nB | 2\n::', /type/],
    ['a missing closing line', '::chart bars X\nA | 1\nB | 2', /closing/],
    ['a missing title', '::chart bars\nA | 1\nB | 2\n::', /title|type/],
    ['a single row', '::chart bars X\nA | 1\n::', /2 to 18/],
    ['too many rows', `::chart bars X\n${Array.from({ length: 19 }, (_, i) => `R | ${i}`).join('\n')}\n::`, /2 to 18/],
    ['a non-numeric value', '::chart bars X\nA | 1\nB | lots\n::', /value/],
    ['two highlights', '::chart bars X\n*A | 1\n*B | 2\n::', /highlight/],
    ['a compare row with one value', '::chart compare X\nP | Q\nA | 1\nB | 2\n::', /value/],
    ['a compare chart with no legend', '::chart compare X\nA | 1 | 2\nB | 3 | 4\n::', /legend/],
]) {
    test(`the checker fails ${name}, and the page omits it`, () => {
        const problems = core.checkStory({ meta, body }, facts([0, 1, 2, 3, 4]), '');
        assert.ok(problems.some(p => p.where === 'chart' && re.test(p.message)), JSON.stringify(problems));
        assert.equal(core.renderBody(body), '');
    });
}

test('firstBarChart gives the share card its values and highlight', () => {
    assert.deepEqual(core.firstBarChart(`Intro.\n\n${COMPARE}\n\n${BARS}`),
        { title: 'Point differential through Week 8', values: [85, 58, 52], hi: 0 });
    assert.equal(core.firstBarChart('No chart.'), null);
    assert.equal(core.firstBarChart(COMPARE), null);
    assert.equal(core.firstBarChart('::chart bars X\nA | 1\n::'), null);
});

test('barColumns places bars around a shared zero inside the height', () => {
    assert.deepEqual(core.barColumns([100, 50], 120), [{ top: 0, height: 120 }, { top: 60, height: 60 }]);
    assert.deepEqual(core.barColumns([30, -10], 120), [{ top: 0, height: 90 }, { top: 90, height: 30 }]);
    assert.deepEqual(core.barColumns([0, 10], 120)[0], { top: 117, height: 3 });
    assert.deepEqual(core.barColumns([0, 0], 120), [{ top: 117, height: 3 }, { top: 117, height: 3 }]);
});

test('accent is optional, and must be #RRGGBB', () => {
    assert.deepEqual(core.validateMeta({ ...meta, accent: '#006778' }), []);
    assert.deepEqual(core.validateMeta(core.parseStory(`---\ntitle: t\ndek: d\ndate: 2026-11-02\nseason: 2026\nweek: 8\nteams: [JAX]\nhero_stat: x\naccent: #006778\n---\nBody`).meta), []);
    assert.ok(core.validateMeta({ ...meta, accent: '006778' }).some(p => /accent/.test(p)));
    assert.ok(core.validateMeta({ ...meta, accent: '#00677' }).some(p => /accent/.test(p)));
});

test('the auto-publish fence refuses anything but story text files', () => {
    const read = () => '---\ndate: 2026-11-02\n---\n';
    for (const name of ['2026-11-02-x.png', '2026-11-02-x.mp4', '2026-11-02-x.svg', '2026-11-02-x.html']) {
        const { problems } = mergeProblems([{ filename: `content/nfl/stories/${name}`, status: 'added' }], read, '2026-11-02');
        assert.ok(problems.some(p => /outside the story fence/.test(p)), name);
    }
    for (const name of ['2026-11-02-x.md', '2026-11-02-x.facts.json', '2026-11-02-x.social.md', 'index.json']) {
        const { problems } = mergeProblems([{ filename: `content/nfl/stories/${name}`, status: 'modified' }], read, '2026-11-02');
        assert.deepEqual(problems, [], name);
    }
});
