// ============================================================
// NFL start history (functions/_nflStarts.js, /api/nflstarts) and the
// nightly contract that re-derives it (tools/contracts/nfl.cjs nfl-starts).
// Fixture: tests/fixtures/nfl-starts-games.csv, real nflverse rows for the
// team-seasons these cases name (first 9 games each), fetched 2026-11-13.
// Run: node --test tests/nflStarts.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const lib = require('../tools/contract-lib.cjs');
const check = require('../tools/contract-check.cjs');
const nflContracts = require('../tools/contracts/nfl.cjs');

const ROOT = path.join(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(`${fs.readFileSync(path.join(ROOT, 'functions', '_nflStarts.js'), 'utf8').replace(/^export /gm, '')}
;globalThis.api = { teamSeasons, startComps, TO_NFLVERSE };`, ctx);
const { startComps, teamSeasons } = ctx.api;
const plain = v => JSON.parse(JSON.stringify(v));

const game = (season, week, home, hs, away, as, type = 'REG') => ({ season: String(season), game_type: type, week: String(week), gameday: `${season}-09-${String(week).padStart(2, '0')}`, home_team: home, home_score: String(hs), away_team: away, away_score: String(as) });

test('through N games means the first N games played, not weeks 1-N', () => {
    // AAA has a Week 2 bye: its third game is in Week 4.
    const games = [
        game(2020, 1, 'AAA', 20, 'BBB', 10), game(2020, 3, 'AAA', 7, 'CCC', 3), game(2020, 4, 'AAA', 30, 'BBB', 0),
        game(2020, 2, 'BBB', 14, 'CCC', 13), game(2020, 4, 'CCC', 3, 'DDD', 9),
    ];
    const r = startComps(games, 'AAA', 2020, 3);
    assert.deepEqual(plain(r.record), { w: 3, l: 0, t: 0 });
    assert.equal(r.pf, 57);
    assert.equal(r.sequence, 'WWW');
    assert.equal(r.pool, 3, 'AAA, BBB and CCC have 3 games; DDD has 1');
});

test('ties, playoff rows and unplayed games', () => {
    const games = [
        game(2021, 1, 'AAA', 17, 'BBB', 17), game(2021, 2, 'AAA', 3, 'BBB', 10),
        game(2021, 19, 'AAA', 40, 'BBB', 0, 'WC'),
        { ...game(2021, 3, 'AAA', '', 'BBB', '') },
    ];
    const r = startComps(games, 'AAA', 2021);
    assert.equal(r.through, 2);
    assert.deepEqual(plain(r.record), { w: 0, l: 1, t: 1 });
    assert.equal(r.sequence, 'TL');
    assert.equal(startComps(games, 'ZZZ', 2021), null);
    assert.equal(startComps(games, 'AAA', 1998), null);
});

test('ESPN abbreviations map to nflverse ones', () => {
    const games = [game(2022, 1, 'LA', 20, 'WAS', 10)];
    assert.equal(startComps(games, 'LAR', 2022).team, 'LA');
    assert.equal(startComps(games, 'wsh', 2022).team, 'WAS');
});

// ── Real rows: the four filed stats ──────────────────────────

const FIXTURE = lib.parseCsv(fs.readFileSync(path.join(__dirname, 'fixtures', 'nfl-starts-games.csv'), 'utf8')).rows;
const names = list => plain(list).map(t => `${t.season} ${t.team}${t.value !== undefined ? ` ${t.value}` : ''}${t.final ? ` ${t.final}` : ''}`);

test('#98: the 2026 Eagles and the five earlier teams that started 2-0 and lost seven straight', () => {
    const r = startComps(FIXTURE, 'PHI', 2026, 9);
    assert.equal(r.sequence, 'WWLLLLLLL');
    assert.deepEqual(names(r.sameSequence.teams), ['2002 CHI 4-12', '2007 SF 5-11', '2013 HOU 2-14', '2015 DAL 4-12', '2024 NO 5-12']);
});

test('#99: the 2026 Broncos at 7-2 and plus-12, with Atlanta 2004 and Buffalo 2020 below them', () => {
    const r = startComps(FIXTURE, 'DEN', 2026, 9);
    assert.deepEqual(plain(r.record), { w: 7, l: 2, t: 0 });
    assert.equal(r.diff, 12);
    assert.deepEqual(names(r.smallerDiff.teams), ['2004 ATL 10', '2020 BUF 9']);
});

test('#83: the 2026 Jaguars at plus-108 through 8 games', () => {
    const r = startComps(FIXTURE, 'JAX', 2026, 8);
    assert.deepEqual(plain(r.record), { w: 6, l: 2, t: 0 });
    assert.equal(r.diff, 108);
});

test('#105 / #138: three 6-2 teams scored fewer than Minnesota through 8 games; each had an early bye', () => {
    const r = startComps(FIXTURE, 'MIN', 2026, 8);
    assert.deepEqual(plain(r.record), { w: 6, l: 2, t: 0 });
    assert.equal(r.pf, 146);
    assert.deepEqual(names(r.fewerPoints.teams), ['2000 NYG 144', '2001 PIT 135', '2006 DEN 141']);
    assert.deepEqual(plain(r.nextFewestPoints), { season: 2000, team: 'WAS', value: 149 });
    // The weeks-1-8 method that produced the published "no team" claim drops all three.
    const eighthGameWeek = (season, team) => teamSeasons(FIXTURE).find(ts => ts.season === season && ts.team === team).games[7].week;
    assert.deepEqual([eighthGameWeek(2001, 'PIT'), eighthGameWeek(2006, 'DEN'), eighthGameWeek(2000, 'NYG'), eighthGameWeek(2026, 'MIN')], [9, 9, 9, 9]);
});

// ── The nightly contract re-derives the route's answer ───────

const contract = nflContracts.contracts.find(c => c.id === 'nfl-starts');
const stub = json => async () => ({ ok: true, status: 200, contentType: 'application/json', json, bodySnippet: '' });

async function runAgainst(apiResponse) {
    const fetchJson = async url => (/games\.csv/.test(url) ? { ok: true, json: { columns: Object.keys(FIXTURE[0]), rows: FIXTURE } } : (await stub(apiResponse)()));
    return check.runContract(contract, {}, fetchJson);
}

test('the contract passes when the route agrees with a fresh computation from games.csv', async () => {
    const good = { ok: true, ...plain(startComps(FIXTURE, 'JAX', 2026, 8)) };
    const r = await runAgainst(good);
    assert.deepEqual(r.failures, []);
});

test('planted fault: a count that is off by one fails the contract', async () => {
    const good = { ok: true, ...plain(startComps(FIXTURE, 'JAX', 2026, 8)) };
    for (const field of ['diffAtLeast', 'pool', 'peers', 'diff', 'pf']) {
        const r = await runAgainst({ ...good, [field]: good[field] + 1 });
        assert.equal(r.status, 'fail', field);
        assert.match(r.failures.join('\n'), new RegExp(`${field}: route says ${good[field] + 1}, games\\.csv gives ${good[field]}`), field);
    }
    const r = await runAgainst({ ...good, sameSequence: { ...good.sameSequence, count: good.sameSequence.count + 1 } });
    assert.match(r.failures.join('\n'), /sameSequence\.count: route says/);
});

test('planted fault: a route that counts weeks 1-8 instead of the first 8 games fails the contract', async () => {
    const byWeek = FIXTURE.filter(g => Number(g.week) <= 8);
    const wrong = { ok: true, ...plain(startComps(byWeek, 'JAX', 2026, 8)) };
    const r = await runAgainst(wrong);
    assert.equal(r.status, 'fail');
});
