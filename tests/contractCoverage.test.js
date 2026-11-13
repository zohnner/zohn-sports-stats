// ============================================================
// Story coverage and the NBA/NCAAB contracts, proven with planted faults:
// each "planted fault" test breaks one thing on purpose and passes only
// if the control reports it.
// Run: node --test tests/contractCoverage.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cov = require('../tools/contract-coverage.cjs');
const check = require('../tools/contract-check.cjs');
const lib = require('../tools/contract-lib.cjs');
const core = require('../tools/stories/story-core.cjs');
const numbers = require('../tools/stories/check-numbers.cjs');

const ROOT = path.join(__dirname, '..');
const sports = cov.loadSports();
const contract = id => sports.flatMap(s => s.contracts).find(c => c.id === id);
const nba = sports.find(s => s.sport === 'nba').contracts;

// ── Coverage ─────────────────────────────────────────────────

test('every story sport has a contract file', () => {
    for (const s of Object.keys(core.STORY_SPORTS)) assert.ok(cov.SPORT_FILES.includes(s), `${s} has stories but no contract file`);
});

test('every published story in the repo is under contract', () => {
    const r = cov.storyCoverage(ROOT, sports);
    assert.ok(r.published > 0);
    assert.deepEqual(r.uncoveredStories, []);
    assert.equal(r.underContract, r.published);
});

test('classify: feeds with a contract, derived facts, third-party pages, and gaps', () => {
    const c = src => cov.classify(src, nba);
    assert.deepEqual(c('https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261026'), { state: 'covered', contract: 'nba-scoreboard' });
    assert.equal(c('https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/13/schedule?season=2027&seasontype=2').contract, 'nba-team-schedule');
    assert.equal(c('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/3975/gamelog?season=2027').contract, 'nba-athlete-gamelog');
    assert.equal(c('derived: a_points - b_points').state, 'derived');
    assert.equal(c('').state, 'derived');
    assert.deepEqual(c('https://www.basketball-reference.com/players/d/doncilu01/gamelog/2027/'), { state: 'external', host: 'basketball-reference.com' });
    assert.equal(c('https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/injuries').state, 'uncovered');
    assert.equal(c('/api/nbadraft?year=2026').state, 'uncovered');
});

const story = (sport, slug, sources) => ({ sport, slug, facts: sources.map((source, i) => ({ key: `k${i}`, label: 'x', value: i, source })) });
const SB = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261026';

test('planted fault: a story citing a route no contract checks is uncovered', () => {
    const r = cov.storyCoverage(ROOT, sports, [
        story('nba', 'good', [SB]),
        story('nba', 'plant', [SB, 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/injuries']),
    ]);
    assert.equal(r.uncovered, 1);
    assert.deepEqual(r.sports.nba, { published: 2, underContract: 1, uncovered: 1 });
    assert.equal(r.uncoveredStories[0].slug, 'plant');
    assert.match(cov.format(r), /FAIL nba\/plant\n\s+no contract for: https:\/\/site\.web\.api\.espn\.com\/apis\/site\/v2\/sports\/basketball\/nba\/injuries/);
});

test('planted fault: a story in a sport with no contract file is uncovered', () => {
    const r = cov.storyCoverage(ROOT, sports, [story('wnba', 'plant', ['https://site.web.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard'])]);
    assert.equal(r.uncovered, 1);
    assert.deepEqual(r.uncoveredStories[0].sources, ['no contract file for wnba']);
});

test('planted fault: a story with no facts file is uncovered', () => {
    const r = cov.storyCoverage(ROOT, sports, [{ sport: 'nba', slug: 'plant', facts: null }]);
    assert.equal(r.uncovered, 1);
});

test('a third-party citation is counted and named, never silently covered', () => {
    const r = cov.storyCoverage(ROOT, sports, [story('nba', 'bref', [SB, 'https://www.basketball-reference.com/leaders/pts_per_g_yearly.html'])]);
    assert.equal(r.uncovered, 0);
    assert.equal(r.externalFacts, 1);
    assert.match(cov.format(r), /Third-party citations .*: 1 fact\(s\) in 1 story/);
    assert.match(cov.format(r), /note nba\/bref: basketball-reference\.com \(1\)/);
});

// ── A wrong number in a copied story ─────────────────────────

test('planted fault: a wrong number in a copied story fails the number check', t => {
    const dir = path.join(ROOT, 'content', 'nba', 'stories');
    const slug = fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.endsWith('.social.md')).sort()[0].slice(0, -3);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-plant-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const out = path.join(tmp, 'content', 'nba', 'stories');
    fs.mkdirSync(out, { recursive: true });
    for (const ext of ['.md', '.facts.json', '.social.md']) {
        if (fs.existsSync(path.join(dir, slug + ext))) fs.copyFileSync(path.join(dir, slug + ext), path.join(out, slug + ext));
    }
    const file = path.join(out, `${slug}.md`);
    const quiet = fn => { const e = console.error, l = console.log; const seen = []; console.error = console.log = m => seen.push(String(m)); try { return [fn(), seen]; } finally { console.error = e; console.log = l; } };

    const [clean] = quiet(() => numbers.main([file]));
    assert.equal(clean, 0, 'the untouched copy must pass');

    // Change the first number in the body to one the facts file has never seen.
    const text = fs.readFileSync(file, 'utf8');
    const bodyAt = text.indexOf('\n---', 3) + 4;
    const body = text.slice(bodyAt);
    const m = /\b\d{2,3}\b/.exec(body);
    assert.ok(m, 'the story body has a number to corrupt');
    fs.writeFileSync(file, text.slice(0, bodyAt) + body.slice(0, m.index) + '98765' + body.slice(m.index + m[0].length));
    const [code, seen] = quiet(() => numbers.main([file]));
    assert.equal(code, 2);
    assert.ok(seen.some(line => line.includes('98765')), `the report names the planted number: ${seen.join(' | ')}`);
});

// ── Contracts: planted upstream drift ────────────────────────

const stub = json => async () => ({ ok: true, status: 200, contentType: 'application/json', json, bodySnippet: '' });
const CTX = { season: 2027, finalId: '401909958', yyyymmdd: '20261109', athleteId: '3945274' };
const run = (id, json, ctx = CTX) => check.runContract({ ...contract(id), resolve: undefined }, ctx, stub(json));

const LABELS = ['MIN', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'];
const NAMES = ['minutes', 'fieldGoalsMade-fieldGoalsAttempted', 'fieldGoalPct', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'threePointPct', 'freeThrowsMade-freeThrowsAttempted', 'freeThrowPct', 'totalRebounds', 'assists', 'blocks', 'steals', 'fouls', 'turnovers', 'points'];
const gamelog = () => ({
    labels: [...LABELS], names: [...NAMES],
    events: { 401909971: { gameDate: '2026-11-11T03:00:00.000+00:00', opponent: { abbreviation: 'PHX' } } },
    seasonTypes: [{ displayName: '2026-27 Regular Season', categories: [{ events: [{ eventId: '401909971', stats: ['32', '10-25', '40.0', '5-12', '41.7', '7-10', '70.0', '5', '5', '0', '2', '4', '5', '32'] }] }] }],
});

test('NBA game log: the real shape passes', async () => {
    assert.equal((await run('nba-athlete-gamelog', gamelog())).status, 'pass');
});

test('planted fault: the game log loses its PTS column', async () => {
    const g = gamelog();
    g.labels[13] = 'POINTS';
    const r = await run('nba-athlete-gamelog', g);
    assert.equal(r.status, 'fail');
    assert.match(r.failures.join('\n'), /labels is missing PTS/);
});

test('planted fault: a game row is one stat short (every later column reads off by one)', async () => {
    const g = gamelog();
    g.seasonTypes[0].categories[0].events[0].stats.splice(3, 1);
    const r = await run('nba-athlete-gamelog', g);
    assert.equal(r.status, 'fail');
    assert.match(r.failures.join('\n'), /event 401909971 has 13 stats for 14 labels/);
});

test('planted fault: an NBA box score whose keys no longer start minutes, points', async () => {
    const keys = ['minutes', 'points', 'rebounds', 'assists'];
    const side = k => ({ statistics: [{ keys: k, athletes: [{ athlete: { id: '1', displayName: 'A' }, stats: k.map(() => '1') }] }] });
    const summary = k => ({
        header: { competitions: [{ status: { type: { state: 'post' } }, competitors: [{ homeAway: 'home', team: { abbreviation: 'SA' }, score: '120' }, { homeAway: 'away', team: { abbreviation: 'PHX' }, score: '101' }] }] },
        boxscore: { teams: [{ statistics: [{ name: 'fg', displayValue: '1' }] }, { statistics: [{ name: 'fg', displayValue: '1' }] }], players: [side(k), side(k)] },
        plays: Array.from({ length: 60 }, () => ({ type: { id: '1' } })),
        winprobability: [{ homeWinPercentage: 0.5 }],
    });
    assert.equal((await run('nba-summary', summary(keys))).status, 'pass');
    const r = await run('nba-summary', summary(['min', 'pts', 'rebounds', 'assists']));
    assert.equal(r.status, 'fail');
    assert.match(r.failures.join('\n'), /is missing minutes, points/);
});

test('planted fault: NBA standings with 29 teams, or a row without pointsFor', async () => {
    const row = (abbr, names = ['wins', 'losses', 'pointsFor', 'pointsAgainst']) => ({ team: { abbreviation: abbr }, stats: names.map(name => ({ name, value: 1 })) });
    const tree = rows => ({ children: [{ standings: { entries: rows } }] });
    const thirty = Array.from({ length: 30 }, (_, i) => row(`T${i}`));
    assert.equal((await run('nba-standings', tree(thirty))).status, 'pass');
    assert.match((await run('nba-standings', tree(thirty.slice(1)))).failures.join('\n'), /found 29 "entries"/);
    const r = await run('nba-standings', tree([...thirty.slice(1), row('LAL', ['wins', 'losses'])]));
    assert.match(r.failures.join('\n'), /LAL is missing one of/);
});

test('planted fault: a finished game on a team schedule with no score', async () => {
    const ev = (id, score) => ({ id, date: '2026-11-01T00:00Z', competitions: [{ status: { type: { completed: true } }, competitors: [{ team: { abbreviation: 'LAL' }, score }, { team: { abbreviation: 'GS' }, score: { value: 101 } }] }] });
    const sched = events => ({ team: { abbreviation: 'LAL' }, events });
    const full = Array.from({ length: 41 }, (_, i) => ev(String(i), { value: 110 }));
    assert.equal((await run('nba-team-schedule', sched(full))).status, 'pass');
    const r = await run('nba-team-schedule', sched([...full.slice(1), ev('plant', {})]));
    assert.match(r.failures.join('\n'), /1 completed event\(s\) without numeric scores, e\.g\. plant/);
});

test('planted fault: nflverse games.csv renames a score column', async () => {
    const header = 'game_id,season,game_type,week,gameday,away_team,away_score,home_team,home_score';
    const rows = [];
    for (let y = 1999; y <= 2000; y++) for (let i = 0; i < 240; i++) rows.push(`${y}_${i},${y},REG,1,${y}-09-10,AAA,10,BBB,20`);
    rows.push('2001_0,2001,REG,1,2001-09-09,AAA,10,BBB,20');
    const good = lib.parseCsv(`${header}\n${rows.join('\n')}\n`);
    assert.equal((await run('nflverse-games', good)).status, 'pass');
    const bad = lib.parseCsv(`${header.replace('home_score', 'home_pts')}\n${rows.join('\n')}\n`);
    const r = await run('nflverse-games', bad);
    assert.equal(r.status, 'fail');
    assert.match(r.failures.join('\n'), /missing column\(s\): home_score/);
});

test('parseCsv reads quoted fields, embedded commas and CRLF', () => {
    const { columns, rows } = lib.parseCsv('a,b,c\r\n1,"x, y","he said ""hi"""\r\n2,,z');
    assert.deepEqual(columns, ['a', 'b', 'c']);
    assert.deepEqual(rows, [{ a: '1', b: 'x, y', c: 'he said "hi"' }, { a: '2', b: '', c: 'z' }]);
});

test('a contract whose resolve step finds nothing fails instead of fetching a broken URL', async () => {
    const c = { id: 'x', route: ctx => `/x/${ctx.athleteId}`, resolve: async () => null };
    const r = await check.runContract(c, {}, stub({}));
    assert.equal(r.status, 'fail');
    assert.match(r.failures[0], /could not resolve/);
});

test('absolute routes are fetched as given, not through the site', async () => {
    const seen = [];
    const fetchJson = check.fetchJsonFrom('https://x.test', async u => { seen.push(u); return { ok: true, json: {} }; }, async u => { seen.push(`fallback:${u}`); return { ok: true, json: {} }; });
    await fetchJson('https://site.web.api.espn.com/apis/site/v3/sports/basketball/nba/leaders');
    await fetchJson('/api/nba?path=/scoreboard');
    await fetchJson('/api/ncaabstandings?season=2027');
    await fetchJson('/api/mlb?url=x');
    assert.deepEqual(seen, [
        'https://site.web.api.espn.com/apis/site/v3/sports/basketball/nba/leaders',
        'fallback:https://x.test/api/nba?path=/scoreboard',
        'fallback:https://x.test/api/ncaabstandings?season=2027',
        'https://x.test/api/mlb?url=x',
    ]);
});
