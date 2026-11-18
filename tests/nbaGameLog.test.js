// ============================================================
// NBA player game log (BballMath.gameLog / gameLogSummary, js/nba.js) and
// the nightly cross-check against ESPN's season totals
// (tools/contracts/nba.cjs nba-athlete-gamelog). Derived stats #92, #107, #126.
// Fixture: tests/fixtures/nba-gamelog-curry-trim.json, Stephen Curry's
// 2026-27 log trimmed from a live ESPN response on 2026-11-15.
// Run: node --test tests/nbaGameLog.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const check = require('../tools/contract-check.cjs');
const nba = require('../tools/contracts/nba.cjs');

const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'bballGameMath.js'), 'utf8'), ctx);
const M = vm.runInContext('BballMath', ctx);
const plain = v => JSON.parse(JSON.stringify(v));
const CURRY = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nba-gamelog-curry-trim.json'), 'utf8'));

test('#92: Curry’s log lists regular-season games only, newest first, with his 40-point games', () => {
    const rows = plain(M.gameLog(CURRY));
    assert.equal(rows.length, 10);
    assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].date >= r.date));
    assert.deepEqual(rows.filter(r => r.pts >= 40).map(r => r.pts).sort(), [41, 44]);
    const s = plain(M.gameLogSummary(M.gameLog(CURRY)));
    assert.equal(s.games, 10);
    assert.equal(s.points, 278);
    assert.equal(s.ppg, 27.8);
    assert.equal(s.high, 44);
    assert.equal(s.forty, 2);
    assert.equal(s.doubleDoubles, 0);
});

const log = games => ({
    names: ['minutes', 'fieldGoalsMade-fieldGoalsAttempted', 'totalRebounds', 'assists', 'blocks', 'steals', 'points'],
    events: Object.fromEntries(games.map((g, i) => [String(i), { gameDate: `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00.000+00:00`, atVs: 'vs', gameResult: 'W', score: '110-100', opponent: { abbreviation: 'PHX' } }])),
    seasonTypes: [
        { displayName: '2026-27 Regular Season', categories: [{ events: games.map((g, i) => ({ eventId: String(i), stats: g.map(String) })) }] },
        { displayName: '2026-27 Preseason', categories: [{ events: [{ eventId: '99', stats: ['20', '9-9', '20', '20', '0', '0', '50'] }] }] },
    ],
});

test('#107: points per minute, and #126: double-doubles out of games played', () => {
    //            MIN  FG      REB AST BLK STL PTS
    const data = log([[25, '14-20', 9, 2, 3, 1, 40], [30, '8-15', 12, 10, 0, 0, 22], [28, '5-12', 11, 4, 0, 0, 9], [20, '6-9', 10, 11, 0, 10, 12]]);
    const rows = plain(M.gameLog(data));
    assert.equal(rows.length, 4, 'the preseason row is left out');
    assert.equal(rows.find(r => r.pts === 40).min, 25);
    const s = plain(M.gameLogSummary(M.gameLog(data)));
    assert.equal(s.points, 83);
    assert.equal(s.minutes, 103);
    assert.equal(s.ptsPerMin, 0.81);
    assert.equal(s.doubleDoubles, 2, '22/12/10 and 12/10/11/10 steals; 9 points with 11 rebounds is not one');
    assert.equal(s.tripleDoubles, 2);
    assert.equal(s.forty, 1);
});

test('columns are found by name: a reordered payload gives the same totals', () => {
    const a = log([[30, '8-15', 12, 10, 0, 0, 22]]);
    const b = JSON.parse(JSON.stringify(a));
    b.names.reverse();
    for (const st of b.seasonTypes) for (const c of st.categories) for (const e of c.events) e.stats.reverse();
    assert.deepEqual(plain(M.gameLogSummary(M.gameLog(b))), plain(M.gameLogSummary(M.gameLog(a))));
});

test('a row whose stat count does not match the columns is dropped, and an empty log has no summary', () => {
    const data = log([[30, '8-15', 12, 10, 0, 0, 22]]);
    data.seasonTypes[0].categories[0].events[0].stats.pop();
    assert.equal(M.gameLog(data).length, 0);
    assert.equal(M.gameLogSummary([]), null);
    assert.equal(M.gameLog({}).length, 0);
});

// ── The nightly cross-check ──────────────────────────────────

const contract = { ...nba.contracts.find(c => c.id === 'nba-athlete-gamelog'), resolve: undefined };
const full = { ...CURRY };
const run = core => check.runContract(contract, { season: 2027, athleteId: '3975', core }, async () => ({ ok: true, status: 200, json: full, bodySnippet: '' }));

test('the contract passes when the game-log totals match the season totals', async () => {
    const r = await run({ games: 10, points: 278, doubleDoubles: 0 });
    assert.deepEqual(r.failures, []);
});

test('planted fault: totals that are off by one fail the contract', async () => {
    for (const [field, core] of [['points', { games: 10, points: 279, doubleDoubles: 0 }], ['games', { games: 9, points: 278, doubleDoubles: 0 }], ['doubleDoubles', { games: 10, points: 278, doubleDoubles: 1 }]]) {
        const r = await run(core);
        assert.equal(r.status, 'fail', field);
        assert.match(r.failures.join('\n'), new RegExp(`${field}: game log gives \\d+, season totals say ${core[field]}`), field);
    }
});

test('planted fault: no season totals to compare against is a failure, not a pass', async () => {
    const r = await run(undefined);
    assert.equal(r.status, 'fail');
    assert.match(r.failures.join('\n'), /no season totals to compare against/);
});

// ── Largest margins (derived stat #106, js/powerRankings.js) ─

const rk = { console };
rk.globalThis = rk;
vm.createContext(rk);
vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', 'js', 'powerRankings.js'), 'utf8')}\n;globalThis.__lm = largestMargins;`, rk);
const largestMargins = rk.__lm;
const SEASON = [
    { home: 'GS', away: 'NO', homeScore: 138, awayScore: 87, date: '2026-11-10T03:00Z' },
    { home: 'CHA', away: 'ATL', homeScore: 81, awayScore: 128, date: '2026-10-24T00:00Z' },
    { home: 'DAL', away: 'BKN', homeScore: 130, awayScore: 93, date: '2026-11-09T00:00Z' },
    { home: 'LAL', away: 'PHX', homeScore: null, awayScore: null, date: '2026-12-01T00:00Z' },
];

test('#106: the largest margin of the season, then the next, with winner and loser', () => {
    const top = plain(largestMargins(SEASON, 2));
    assert.deepEqual(top.map(g => [g.winner, g.winnerScore, g.loser, g.loserScore, g.margin]), [['GS', 138, 'NO', 87, 51], ['ATL', 128, 'CHA', 81, 47]]);
    assert.deepEqual(plain(largestMargins([], 5)), []);
});

const marginContract = { ...nba.contracts.find(c => c.id === 'nba-largest-margin'), resolve: undefined };
const runMargin = maxMargin => check.runContract(marginContract, { season: 2027, seasonGames: SEASON, maxMargin }, async () => ({ ok: true, status: 200, json: { events: [] }, bodySnippet: '' }));

test('planted fault: a largest margin that is off by one fails the contract', async () => {
    assert.deepEqual((await runMargin(51)).failures, []);
    const r = await runMargin(52);
    assert.equal(r.status, 'fail');
    assert.match(r.failures.join('\n'), /site says 51, the schedules give 52/);
});
