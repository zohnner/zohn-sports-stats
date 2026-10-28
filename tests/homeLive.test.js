// ============================================================
// Home live refresh — pure decisions behind the home poll (D-173):
// which sports need a fresh scoreboard, and whether anything changed
// enough to re-render the hero.
// Run: node --test tests/homeLive.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'homeLive.js'), 'utf8');
function load() {
    const ctx = { console, JSON, Array, Object, String };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'homeLive.js' });
    // A top-level `const` is a script-scope binding, not a property of the
    // sandbox's global object -- read it through the context instead.
    return vm.runInContext('HomeLive', ctx);
}

const game = (id, o = {}) => ({
    id, isLive: false, isFinal: false, statusText: 'Sun 4:25 PM',
    homeTeam: { abbr: 'H', score: 0 }, awayTeam: { abbr: 'A', score: 0 }, ...o,
});

test('liveSports: only sports with at least one live game', () => {
    const H = load();
    const out = H.liveSports({
        nfl: [game('1', { isLive: true }), game('2')],
        ncaaf: [game('3', { isFinal: true })],
        nba: [game('4', { isLive: true })],
    });
    assert.deepEqual(Array.from(out).sort(), ['nba', 'nfl']);
});

test('liveSports: tolerates missing, null, and empty sports', () => {
    const H = load();
    assert.deepEqual(Array.from(H.liveSports({ nfl: null, ncaab: [], wnba: undefined })), []);
    assert.deepEqual(Array.from(H.liveSports({})), []);
});

test('signature: identical data gives the identical signature', () => {
    const H = load();
    const a = { nfl: [game('1', { isLive: true, statusText: '2:00 - 2nd' })] };
    const b = JSON.parse(JSON.stringify(a));
    assert.equal(H.signature(a), H.signature(b));
});

test('signature changes when a score changes', () => {
    const H = load();
    const before = { nfl: [game('1', { isLive: true })] };
    const after = { nfl: [game('1', { isLive: true, homeTeam: { abbr: 'H', score: 7 } })] };
    assert.notEqual(H.signature(before), H.signature(after));
});

test('signature changes when only the clock/status text changes', () => {
    const H = load();
    const before = { nfl: [game('1', { isLive: true, statusText: '9:27 - 1st' })] };
    const after = { nfl: [game('1', { isLive: true, statusText: '9:18 - 1st' })] };
    assert.notEqual(H.signature(before), H.signature(after));
});

test('signature changes when a game goes live or final', () => {
    const H = load();
    const pre = { nba: [game('9')] };
    const live = { nba: [game('9', { isLive: true })] };
    const fin = { nba: [game('9', { isFinal: true })] };
    assert.notEqual(H.signature(pre), H.signature(live));
    assert.notEqual(H.signature(live), H.signature(fin));
});

test('signature ignores fields the hero does not show', () => {
    const H = load();
    const a = { nfl: [game('1', { isLive: true, leaders: [{ name: 'X' }] })] };
    const b = { nfl: [game('1', { isLive: true, leaders: [{ name: 'Y' }] })] };
    assert.equal(H.signature(a), H.signature(b));
});

// Hero ranking (2026-10-27): the hero showed WKU at Delaware (unranked, live
// on CBSSN), and earlier a Saturday game, while World Series Game 4 was tonight.
const mlbGame = (gameType, awayWins, homeWins, gamesInSeries = 7) => ({
    gameType, gamesInSeries,
    teams: { away: { leagueRecord: { wins: awayWins } }, home: { leagueRecord: { wins: homeWins } } },
});

test('mlbTier: postseason rounds rank above the regular season, World Series highest', () => {
    const H = load();
    assert.deepEqual(['R', 'F', 'D', 'L', 'W', undefined].map(t => H.mlbTier({ gameType: t })), [0, 1, 2, 3, 4, 0]);
});

test('mlbCanClinch: a team one win from taking the series, by series length', () => {
    const H = load();
    assert.equal(H.mlbCanClinch(mlbGame('W', 3, 0)), true);    // best of 7, up 3-0
    assert.equal(H.mlbCanClinch(mlbGame('W', 2, 2)), false);
    assert.equal(H.mlbCanClinch(mlbGame('D', 1, 2, 5)), true);  // best of 5, home up 2-1
    assert.equal(H.mlbCanClinch(mlbGame('F', 0, 0, 3)), false); // wild card game 1
    assert.equal(H.mlbCanClinch(mlbGame('F', 1, 0, 3)), true);
    assert.equal(H.mlbCanClinch({ gameType: 'R', teams: {} }), false);
});

// Fixed local clock so "today" and the 3-hour window don't depend on when CI runs.
const NOW = new Date(2026, 9, 27, 19, 0).getTime();          // Tue 7:00 PM local
const at = (h, m = 0, dayOffset = 0) => new Date(2026, 9, 27 + dayOffset, h, m).getTime();
const cand = (name, o) => ({ name, live: false, tier: 0, score: 0, start: NaN, ...o });

test('pickHero: tonight -- a World Series game an hour out beats a live unranked college game', () => {
    const H = load();
    const winner = H.pickHero([
        cand('WKU-DEL', { live: true, score: 14, start: at(19) }),
        cand('WS G4', { tier: 4, score: 18, start: at(20) }),
        cand('ARIZ-TTU Sat', { score: 10, start: at(12, 0, 4) }),
    ], NOW);
    assert.equal(winner.name, 'WS G4');
});

test('pickHero: a tiered game more than 3 hours out waits behind a live game', () => {
    const H = load();
    const winner = H.pickHero([
        cand('WKU-DEL', { live: true, score: 14, start: at(19) }),
        cand('WS G4', { tier: 4, score: 18, start: at(22, 30) }),
    ], NOW);
    assert.equal(winner.name, 'WKU-DEL');
});

test('pickHero: upcoming games after today are never the hero', () => {
    const H = load();
    const winner = H.pickHero([
        cand('ARIZ-TTU Sat', { score: 10, start: at(12, 0, 4) }),
        cand('NBA tonight', { score: 0, start: at(19, 30) }),
    ], NOW);
    assert.equal(winner.name, 'NBA tonight');
    assert.equal(H.pickHero([cand('Sat only', { score: 10, start: at(12, 0, 4) })], NOW), null);
});

test('pickHero: within a tier live beats upcoming, then the higher score wins', () => {
    const H = load();
    assert.equal(H.pickHero([
        cand('upcoming', { score: 50, start: at(20) }),
        cand('live', { live: true, score: 1, start: at(18) }),
    ], NOW).name, 'live');
    assert.equal(H.pickHero([
        cand('live WS', { live: true, tier: 4, score: 20 }),
        cand('live NCAAF', { live: true, score: 30 }),
    ], NOW).name, 'live WS');
    assert.equal(H.pickHero([
        cand('a', { live: true, score: 5 }),
        cand('b', { live: true, score: 9 }),
    ], NOW).name, 'b');
});

test('pickHero: a game with no known start still counts as today, and nothing yields null', () => {
    const H = load();
    assert.equal(H.pickHero([cand('no date', { score: 3 })], NOW).name, 'no date');
    assert.equal(H.pickHero([], NOW), null);
});
