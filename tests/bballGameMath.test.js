// ============================================================
// Basketball game math (D-185) — the pure helpers behind the NBA Game
// Center. Hand-computable synthetic cases pin the arithmetic; three
// trimmed real ESPN NBA /summary fixtures (final, live, pregame) pin the
// math to ESPN's own box score and to the shot-coordinate orientation.
// Run: node --test tests/bballGameMath.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'bballGameMath.js'), 'utf8');
function load() {
    const ctx = { console };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'bballGameMath.js' });
    return vm.runInContext('BballMath', ctx);
}
const M = load();
// Values built inside the sandbox carry its own Array/Object prototypes,
// which strict deep-equal rejects; copy them into this realm first.
const own = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} vs ${b}`);
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const NBA = { periods: 4, periodSec: 720, otSec: 300, slug: 'quarter' };

let seq = 0;
const play = (period, clock, away, home, extra = {}) => ({
    id: String(++seq), period: { number: period }, clock: { displayValue: clock },
    awayScore: away, homeScore: home, ...extra,
});
const sides = (data) => {
    const c = data.header.competitions[0].competitors;
    const h = c.find(x => x.homeAway === 'home'), a = c.find(x => x.homeAway === 'away');
    return { h, a, ids: { home: String(h.team.id), away: String(a.team.id) } };
};
const box = (data, id) => M.teamTotals(data.boxscore.teams.find(t => String(t.team.id) === String(id)));

// -- Clock -------------------------------------------------------------------

test('parseClock reads m:ss and sub-minute tenths', () => {
    assert.equal(M.parseClock('11:07'), 667);
    assert.equal(M.parseClock('51.9'), 51.9);
    assert.equal(M.parseClock('0.0'), 0);
    assert.equal(M.parseClock(undefined), 0);
});

test('elapsedAt and clockAt round-trip through regulation and overtime', () => {
    assert.equal(M.elapsedAt(1, '12:00', NBA), 0);
    near(M.elapsedAt(2, '0:51.9', NBA), 720 + 668.1);
    assert.equal(M.elapsedAt(4, '0:00', NBA), 2880);
    assert.equal(M.elapsedAt(5, '2:00', NBA), 2880 + 180);
    assert.deepEqual(own(M.clockAt(2880 + 180, NBA)), { period: 5, clock: '2:00' });
    // A period boundary reports the period that just ended, not 12:00 of the next.
    assert.deepEqual(own(M.clockAt(720, NBA)), { period: 1, clock: '0:00' });
    assert.equal(M.periodLabel(6, NBA), '2OT');
    assert.equal(M.periodLabel(2, { ...NBA, periods: 2, slug: 'half' }), 'H2');
});

test('gameFormat reads ESPN format and falls back to NBA defaults', () => {
    assert.deepEqual(own(M.gameFormat({ format: { regulation: { periods: 2, clock: 1200, slug: 'half' }, overtime: { clock: 300 } } })),
        { periods: 2, periodSec: 1200, otSec: 300, slug: 'half' });
    assert.deepEqual(own(M.gameFormat({})), NBA);
});

// -- Runs, leads, droughts ---------------------------------------------------

test('runs count unanswered points and track the biggest per side', () => {
    const plays = [
        play(1, '11:30', 0, 2), play(1, '11:00', 0, 5), play(1, '10:30', 2, 5),
        play(1, '10:00', 4, 5), play(1, '9:30', 7, 5), play(1, '9:00', 7, 7),
    ];
    const r = M.runs(M.scoringEvents(plays, NBA));
    assert.equal(r.biggest.home.pts, 5);
    assert.equal(r.biggest.away.pts, 7);
    assert.equal(r.current.side, 'home');
    assert.equal(r.current.pts, 2);
});

test('scoringEvents credits sides from score deltas, not play.team', () => {
    const ev = M.scoringEvents([play(1, '11:00', 0, 3, { team: { id: 'AWAY' } })], NBA);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].side, 'home');
    assert.equal(ev[0].pts, 3);
});

test('leads find the largest margin for each side', () => {
    const l = M.leads([play(1, '11:00', 0, 3), play(1, '10:00', 8, 3), play(2, '5:00', 8, 20)]);
    assert.equal(l.home.lead, 12);
    assert.equal(l.away.lead, 5);
});

test('droughts measure game clock between scores, including an open one', () => {
    // Home scores at 1:00 and 6:00 elapsed; away at 5:00. Clock now 11:00 elapsed.
    const plays = [play(1, '11:00', 0, 2), play(1, '7:00', 2, 2), play(1, '6:00', 2, 4)];
    const d = M.droughts(M.scoringEvents(plays, NBA), M.elapsedAt(1, '1:00', NBA));
    // Home: 1:00 -> 6:00 is 300s; the open 6:00 -> now gap also runs 300s
    // and a tie does not replace the earlier, closed one.
    assert.equal(d.home.sec, 300);
    assert.equal(d.home.open, false);
    // Away: tip -> 5:00 is 300s, then 5:00 -> now is 360s and still open.
    assert.equal(d.away.sec, 360);
    assert.equal(d.away.open, true);
});

// -- Win probability -----------------------------------------------------------

test('wpTimeline joins by playId and wpSwings ranks by absolute swing', () => {
    const plays = [play(1, '11:00', 0, 0, { text: 'a' }), play(1, '10:00', 0, 3, { text: 'b' }), play(1, '9:00', 3, 3, { text: 'c' })];
    const wp = [
        { playId: plays[2].id, homeWinPercentage: 0.5 },
        { playId: plays[0].id, homeWinPercentage: 0.5 },
        { playId: plays[1].id, homeWinPercentage: 0.62 },
        { playId: 'not-a-play', homeWinPercentage: 0.9 },
    ];
    const tl = M.wpTimeline(plays, wp, NBA);
    assert.deepEqual(own(tl.map(x => x.play.text)), ['a', 'b', 'c']);
    const sw = M.wpSwings(tl, 2);
    assert.equal(sw.length, 2);
    near(Math.abs(sw[0].delta), 0.12);
    assert.equal(sw[0].before, 0.5);
});

// -- Box-score math --------------------------------------------------------------

const T = (o) => ({ fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, tov: 0, ...o });

test('fourFactors match hand-computed values', () => {
    const ff = M.fourFactors(T({ fgm: 40, fga: 80, tpm: 10, fta: 25, ftm: 20, orb: 10, tov: 12 }), T({ drb: 30 }));
    near(ff.efg, 45 / 80, 'eFG');
    near(ff.tov, 12 / 103, 'TOV%');
    near(ff.orb, 10 / 40, 'ORB%');
    near(ff.ftr, 20 / 80, 'FTr');
    assert.deepEqual(own(M.fourFactors(T({}), T({}))), { efg: null, tov: null, orb: null, ftr: null });
});

test('efficiency averages both possession estimates and scales pace to 48', () => {
    const h = T({ fga: 80, fta: 25, orb: 10, tov: 12 });   // 80 + 11 - 10 + 12 = 93
    const a = T({ fga: 90, fta: 20, orb: 12, tov: 15 });   // 90 + 8.8 - 12 + 15 = 101.8
    const full = M.efficiency(h, a, 110, 100, 2880, NBA);
    near(full.poss, 97.4, 'poss');
    near(full.pace, 97.4, 'pace over 48 min');
    near(full.homeOrtg, 11000 / 97.4, 'ORtg');
    near(M.efficiency(h, a, 55, 50, 1440, NBA).pace, 2 * 97.4, 'pace at the half');
    near(M.efficiency(h, a, 110, 100, 2880 + 300, NBA).pace, 97.4 * 48 / 53, 'pace with one OT');
    assert.equal(M.efficiency(T({}), T({}), 0, 0, 0, NBA), null);
});

test('teamTotals prefers totalTurnovers and parses made-attempted pairs', () => {
    const t = M.teamTotals({ statistics: [
        { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '40-82' },
        { name: 'turnovers', displayValue: '10' }, { name: 'totalTurnovers', displayValue: '11' },
    ] });
    assert.equal(t.fgm, 40); assert.equal(t.fga, 82); assert.equal(t.tov, 11);
});

// -- Shots -------------------------------------------------------------------

const shot = (x, y, pa, extra = {}) => ({ id: String(++seq), shootingPlay: true, pointsAttempted: pa, coordinate: { x, y }, type: { text: 'Jump Shot' }, period: { number: 1 }, clock: { displayValue: '5:00' }, ...extra });

test('shotZone boundaries follow the documented zone definitions', () => {
    const z = (x, y, three) => M.shotZone(three, { x, y });
    assert.equal(z(25, 1, false), 'rim');
    assert.equal(z(25, 4.75, false), 'rim', 'exactly 4 ft from the hoop');
    assert.equal(z(25, 6, false), 'paint');
    assert.equal(z(33, 14, false), 'paint', 'lane edge at the FT line');
    assert.equal(z(34, 10, false), 'mid', 'just outside the lane');
    assert.equal(z(25, 16, false), 'mid', 'past the FT line');
    assert.equal(z(1, 2, true), 'corner3');
    assert.equal(z(49, 9, true), 'corner3');
    assert.equal(z(1, 11, true), 'atb3', 'above the corner break');
    assert.equal(z(25, 26, true), 'atb3');
});

test('validShots drops free throws, sentinel coordinates, heaves, and non-shots', () => {
    const shots = M.validShots([
        shot(25, 1, 2, { scoringPlay: true }),
        shot(-214748340, -214748365, 1, { type: { text: 'Free Throw - 1 of 2' } }),
        shot(25, 50, 3, { type: { text: 'Heave Jump Shot' } }),
        { id: 'foul', shootingPlay: false, coordinate: { x: 19, y: 20 } },
        shot(3, 1, 3, { participants: [{ athlete: { id: 42 } }], team: { id: 7 } }),
    ]);
    assert.equal(shots.length, 2);
    assert.equal(shots[0].made, true);
    assert.equal(shots[0].zone, 'rim');
    assert.equal(shots[1].shooterId, '42');
    assert.equal(shots[1].teamId, '7');
    assert.equal(shots[1].zone, 'corner3');
});

test('toCourt places the hoop 5.25 ft off the baseline', () => {
    const c = M.toCourt({ x: M.HOOP.x, y: M.HOOP.y });
    assert.equal(c.cx, 25);
    assert.equal(c.cy, 5.25);
});

// -- Situational splits ----------------------------------------------------------

test('clutch keeps only Q4/OT, <=5:00 left, margin within 5 before the play', () => {
    const ids = { home: 'H', away: 'A' };
    const sh = (made, pa, team) => ({ shootingPlay: true, scoringPlay: made, pointsAttempted: pa, team: { id: team } });
    const plays = [
        play(3, '2:00', 90, 90, sh(true, 2, 'H')),     // wrong quarter
        play(4, '6:00', 90, 92, sh(true, 2, 'H')),     // 6:00 left
        play(4, '4:00', 93, 92, sh(true, 3, 'A')),     // home +2 before: in
        play(4, '3:00', 93, 92, sh(false, 3, 'H')),    // home -1 before: in
        play(4, '2:00', 93, 95, sh(true, 3, 'H')),     // home -1 before: in
        play(4, '1:00', 93, 108, sh(true, 2, 'H')),    // home +2 before: in
        play(4, '0:30', 93, 110, sh(true, 2, 'H')),    // home +15 before: out
    ];
    const c = M.clutch(plays, ids, NBA);
    assert.equal(c.plays, 4);
    assert.deepEqual(own(c.away), { pts: 3, fgm: 1, fga: 1, tpm: 1, tpa: 1, ftm: 0, fta: 0 });
    assert.equal(c.home.fga, 3);
    assert.equal(c.home.tpa, 2);
    assert.equal(c.home.pts, 3 + 13);
});

// -- Real fixtures -------------------------------------------------------------------

test('final fixture: play-derived FG/3P/FT and points reconcile exactly with the box score', () => {
    const d = fixture('nba-summary-final-trim.json');
    const { h, a, ids } = sides(d);
    const all = M.splitWhere(d.plays, ids, M.gameFormat(d), () => true);
    for (const [side, c] of [['home', h], ['away', a]]) {
        const b = box(d, c.team.id);
        const s = all[side];
        assert.deepEqual([s.fgm, s.fga, s.tpm, s.tpa, s.ftm, s.fta], [b.fgm, b.fga, b.tpm, b.tpa, b.ftm, b.fta], side);
        assert.equal(s.pts, Number(c.score), side + ' points');
    }
});

test('final fixture: biggest leads match ESPN largestLead for both teams', () => {
    const d = fixture('nba-summary-final-trim.json');
    const { h, a } = sides(d);
    const espn = (id) => Number(d.boxscore.teams.find(t => String(t.team.id) === String(id)).statistics.find(s => s.name === 'largestLead').displayValue);
    const l = M.leads(d.plays);
    assert.equal(l.home.lead, espn(h.team.id));
    assert.equal(l.away.lead, espn(a.team.id));
});

test('final fixture: every shot whose text states a distance sits within 1.6 ft of it', () => {
    const d = fixture('nba-summary-final-trim.json');
    const all = M.validShots(d.plays);
    const stated = all.filter(s => /^\d+-foot$/.test(s.text));
    assert.ok(stated.length > 120,'enough stated-distance shots to mean something: ' + stated.length);
    assert.deepEqual(own(stated.filter(s => Math.abs(parseInt(s.text, 10) - s.dist) > 1.6).map(s => `${s.text}@${s.x},${s.y}`)), []);
    assert.ok(all.filter(s => s.three).every(s => s.dist >= 21.5), 'every 3PA is outside 21.5 ft');
    assert.ok(all.filter(s => !s.three).every(s => s.dist <= 21), 'every 2PA is inside 21 ft');
});

test('live fixture: elapsed time comes from the status clock and pace scales from it', () => {
    const d = fixture('nba-summary-live-trim.json');
    const { h, a, ids } = sides(d);
    const fmt = M.gameFormat(d);
    const st = d.header.competitions[0].status;
    const endT = M.elapsedAt(st.period, st.displayClock, fmt);
    assert.ok(endT > 720 && endT < 1440, 'second quarter');
    const eff = M.efficiency(box(d, h.team.id), box(d, a.team.id), Number(h.score), Number(a.score), endT, fmt);
    assert.ok(eff.pace > 80 && eff.pace < 120, 'pace per 48 in a plausible NBA range: ' + eff.pace);
    const all = M.splitWhere(d.plays, ids, fmt, () => true);
    assert.equal(all.home.fga, box(d, h.team.id).fga);
    assert.equal(all.away.fga, box(d, a.team.id).fga);
    assert.equal(M.wpTimeline(d.plays, d.winprobability, fmt).length, d.winprobability.length, 'every WP entry joins to a play');
    assert.ok(M.lastFive(d.plays, ids, fmt, endT).plays > 0);
});

test('pregame fixture: every helper degrades to empty, never throws', () => {
    const d = fixture('nba-summary-pre-trim.json');
    const { h, a, ids } = sides(d);
    const fmt = M.gameFormat(d);
    const ev = M.scoringEvents(d.plays, fmt);
    assert.equal(ev.length, 0);
    assert.equal(M.runs(ev).current, null);
    assert.equal(M.droughts(ev, 0).home, null);
    assert.equal(M.wpSwings(M.wpTimeline(d.plays, d.winprobability, fmt)).length, 0);
    assert.equal(M.validShots(d.plays).length, 0);
    assert.equal(M.efficiency(box(d, h.team.id), box(d, a.team.id), 0, 0, 0, fmt), null);
    assert.equal(M.clutch(d.plays, ids, fmt).plays, 0);
});

// -- Live foul/timeout trust (all seen live on 401909869, MIN @ CLE, OT) -------

const team = (rem, used, cur, toGive, bonus, total = 17) => ({
    timeoutsRemaining: rem, ...(used === undefined ? {} : { timeoutsUsed: used }),
    fouls: { teamFouls: total, teamFoulsCurrent: cur, foulsToGive: toGive, bonusState: bonus },
});
const sit = (t, o, handoff) => own(M.teamSituation(t, o, handoff));

test('teamSituation passes clean mid-period values through', () => {
    const t = team(1, 6, 6, 0, 'DOUBLE', 20);
    assert.deepEqual(sit(t, t, false), { fouls: 6, gameFouls: 20, overLimit: true, toGive: null, timeouts: 1 });
    assert.deepEqual(sit(team(3, 4, 4, 1, 'NONE'), team(3, 4, 4, 1, 'NONE'), false).toGive, 1);
});

test('teamSituation keeps a real late-game 0 timeouts (used > 0)', () => {
    const t = team(0, 7, 2, 2, 'NONE');
    assert.equal(sit(t, t, false).timeouts, 0);
});

test('teamSituation hides the impossible 0 remaining / 0 used block', () => {
    const t = team(0, 0, 0, 0, 'NONE');
    assert.equal(sit(t, t, false).timeouts, null, 'mid-OT, not a handoff');
});

test('teamSituation never reports over the limit at 0 team fouls', () => {
    const t = team(2, 0, 0, 0, 'DOUBLE');
    assert.equal(sit(t, t, false).overLimit, false);
});

test('teamSituation shows counts only between periods', () => {
    // End of regulation: the ended quarter's 5 PF beside OT's "4 to give".
    const t = team(2, 7, 5, 4, 'NONE');
    assert.deepEqual(sit(t, t, true), { fouls: 5, gameFouls: 17, overLimit: false, toGive: null, timeouts: 2 });
    // Halftime 0/0 with no timeoutsUsed field: hidden by the both-zero fallback.
    const h = team(0, undefined, 5, 0, 'DOUBLE', 10);
    assert.equal(sit(h, h, true).timeouts, null);
    assert.equal(sit(h, team(3, undefined, 2, 2, 'NONE'), true).timeouts, 0, 'one side at 0 is believable');
});

test('teamSituation on the real live fixture reads cleanly', () => {
    const d = fixture('nba-summary-live-trim.json');
    const { h, a } = sides(d);
    const s = sit(h, a, false);
    assert.equal(s.fouls, h.fouls.teamFoulsCurrent);
    assert.equal(s.timeouts, h.timeoutsRemaining);
});

// -- Cross-sport play quirks (verified on NCAAB 401856530) ----------------------

test('NCAAB-style free throws ("MadeFreeThrow", real coordinate) never count as shots', () => {
    const ft = (made) => ({ id: String(++seq), type: { text: 'MadeFreeThrow' }, shootingPlay: true, scoringPlay: made,
        pointsAttempted: 1, coordinate: { x: 25, y: 0 }, team: { id: 'H' }, period: { number: 1 }, clock: { displayValue: '5:00' } });
    assert.equal(M.validShots([ft(true), ft(false)]).length, 0, 'not plotted as rim shots');
    const s = M.splitWhere([ft(true), ft(false)], { home: 'H', away: 'A' }, NBA, () => true);
    assert.deepEqual(own(s.home), { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 1, fta: 2 });
});

test('a revoked basket (score goes down) is not counted twice', () => {
    // Home scores 2, officials take it back, then home scores 2 again.
    const plays = [play(1, '10:00', 0, 2), play(1, '9:00', 0, 0), play(1, '8:00', 0, 2), play(1, '7:00', 3, 2)];
    const ev = M.scoringEvents(plays, NBA);
    assert.equal(ev.filter(e => e.side === 'home').reduce((n, e) => n + e.pts, 0), 2);
    assert.equal(M.runs(ev).biggest.home.pts, 2);
    const s = M.splitWhere(plays, { home: 'H', away: 'A' }, NBA, () => true);
    assert.equal(s.home.pts, 2);
    assert.equal(s.away.pts, 3);
});
