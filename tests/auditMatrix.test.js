// ============================================================
// Parity matrix (tools/audit/matrix.cjs): which sport has which page type,
// read from the code. Tested against a small fake repo, so the cells here
// are hand-written, plus one check that it runs on the real tree.
// Run: node --test tests/auditMatrix.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildMatrix, gaps, repoReader, SPORTS } = require('../tools/audit/matrix.cjs');

// A fake repo: path -> file text.
function reader(files) {
    return {
        text: p => files[p] || '',
        has: prefix => Object.keys(files).some(k => k === prefix || k.startsWith(prefix)),
    };
}

const FAKE = {
    'js/navigation.js': `['nfl-games','nfl-standings','nfl-teams','nfl-leaders','nba-scores','nba-standings','nba-teams','nba-leaders','ncaab-scores','ncaab-rankings']
        hash.match(/^nfl-team-([A-Z]+)$/); hash.match(/^nfl-player-(\\d+)$/); hash.match(/^nba-player-(\\d+)$/);`,
    'js/nfl.js': `if (view.startsWith('nfl-game-')) {} // Game Log card\nnavigateTo('nfl-powerrankings')`,
    'js/nba.js': `if (view.startsWith('nba-game-')) {}`,
    'js/ncaab.js': `if (view.startsWith('ncaab-game-')) {}`,
    'functions/nfl/standings.js': 'x', 'functions/nfl/team/[abbr]/[[slug]].js': 'x', 'functions/nfl/player/[id]/[[slug]].js': 'x',
    'functions/nba/standings.js': 'x', 'functions/nba/player/[id]/[[slug]].js': 'x',
    'functions/api/follows.js': `const VALID_SPORTS = new Set(['mlb', 'nfl', 'nba']);`,
    'tools/contracts/nfl.cjs': 'x',
    'content/nfl/stories/index.json': '{}', 'content/nba/stories/index.json': '{}',
};

const cell = (m, cap, sport) => m.rows.find(r => r.id === cap).cells[sport];

test('a sport with the view, the route and the template gets a yes', () => {
    const m = buildMatrix(reader(FAKE));
    assert.equal(cell(m, 'teamPage', 'nfl'), 'yes');
    assert.equal(cell(m, 'playerPage', 'nfl'), 'yes');
    assert.equal(cell(m, 'gameView', 'nfl'), 'yes');
    assert.equal(cell(m, 'gameLog', 'nfl'), 'yes');
    assert.equal(cell(m, 'edgeTeam', 'nfl'), 'yes');
    assert.equal(cell(m, 'contract', 'nfl'), 'yes');
    assert.equal(cell(m, 'followSync', 'nfl'), 'yes');
});

test('a sport without the page gets a no, not a guess', () => {
    const m = buildMatrix(reader(FAKE));
    assert.equal(cell(m, 'teamPage', 'nba'), 'no');
    assert.equal(cell(m, 'gameLog', 'nba'), 'no');
    assert.equal(cell(m, 'edgeTeam', 'nba'), 'no');
    assert.equal(cell(m, 'contract', 'nba'), 'no');
    assert.equal(cell(m, 'playerPage', 'ncaab'), 'no');
    assert.equal(cell(m, 'followSync', 'ncaab'), 'no');
});

test('one sport\'s view name does not count for another (ncaab is not nba)', () => {
    const m = buildMatrix(reader({ 'js/navigation.js': `hash.match(/^ncaab-team-(\\d+)$/); ['ncaab-leaders']` }));
    assert.equal(cell(m, 'teamPage', 'ncaab'), 'yes');
    assert.equal(cell(m, 'teamPage', 'nba'), 'no');
    assert.equal(cell(m, 'leaders', 'nba'), 'no');
});

test('polls are not applicable to pro leagues, and never listed as gaps', () => {
    const m = buildMatrix(reader(FAKE));
    assert.equal(cell(m, 'rankings', 'nba'), 'n/a');
    assert.equal(cell(m, 'rankings', 'ncaab'), 'yes');
    assert.equal(gaps(m).some(g => g.capability === 'rankings' && g.sport === 'nba'), false);
});

test('gaps name the sport, the capability and who already has it', () => {
    const g = gaps(buildMatrix(reader(FAKE))).find(x => x.sport === 'nba' && x.capability === 'teamPage');
    assert.deepEqual(g, { sport: 'nba', capability: 'teamPage', label: 'Team page', have: ['nfl'] });
});

test('a capability nobody has is not a parity gap', () => {
    const m = buildMatrix(reader({ 'js/navigation.js': `['nfl-games']` }));
    assert.equal(gaps(m).some(g => g.capability === 'teamPage'), false);
});

test('runs on the real repo: every sport has a scores view, MLB has a team page', () => {
    const m = buildMatrix(repoReader(path.join(__dirname, '..')));
    for (const s of SPORTS) assert.equal(cell(m, 'scores', s), 'yes', s);
    assert.equal(cell(m, 'teamPage', 'mlb'), 'yes');
    assert.equal(cell(m, 'gameView', 'mlb'), 'yes');
});
