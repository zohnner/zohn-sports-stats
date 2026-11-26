// ============================================================
// TeamPage shell (js/teamPage.js): standings, league ranks, form, stakes,
// matchup edge, and the rule that the shell never names a sport.
// Run: node --test tests/teamPage.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'teamPage.js'), 'utf8');
function load() {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const ctx = { console, JSON, Array, Object, String, Number, Math, Date, _escHtml: esc, _iconSvg: () => '<svg></svg>' };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'teamPage.js' });
    return vm.runInContext('TeamPage', ctx);
}

// A made-up four-team league in two groups: no real sport.
const TEAMS = [
    { abbr: 'AAA', name: 'Alpha', group: 'North', conf: 'East' },
    { abbr: 'BBB', name: 'Bravo', group: 'North', conf: 'East' },
    { abbr: 'CCC', name: 'Charlie', group: 'South', conf: 'East' },
    { abbr: 'DDD', name: 'Delta', group: 'South', conf: 'West' },
];
const g = (date, home, away, homeScore, awayScore) => ({ date, home, away, homeScore, awayScore });
const GAMES = [
    g('2026-09-01T18:00Z', 'AAA', 'BBB', 20, 10), // AAA W
    g('2026-09-08T18:00Z', 'CCC', 'AAA', 14, 7),  // AAA L
    g('2026-09-08T18:00Z', 'BBB', 'DDD', 30, 3),
    g('2026-09-15T18:00Z', 'AAA', 'DDD', 21, 21), // tie
    g('2026-09-15T18:00Z', 'CCC', 'BBB', 10, 13),
];

const REG = {
    sport: 'test', formWindow: 3, standingsScope: 'group',
    stateStats: [
        { key: 'pfg', label: 'For / G', better: 'high', d: 1, source: 'pf/g' },
        { key: 'pag', label: 'Against / G', better: 'low', d: 1, source: 'pa/g' },
        { key: 'x', label: 'Extra', better: 'high', signed: true },
    ],
    edges: [{ off: 'pfg', def: 'pag', offLabel: 'offense', defLabel: 'defense' }],
    leaders: [{ key: 'one', label: 'One', unit: 'U' }],
    rosterGroups: [{ key: 'a', label: 'Side A' }],
    conferenceCut: 2,
    backView: 'back', gameRoute: id => `game-${id}`, teamRoute: a => `team-${a}`, playerRoute: id => `p-${id}`,
};

test('standings: W-L-T, points, streak and pct from finals', () => {
    const T = load();
    const rows = T.standings(GAMES, TEAMS);
    assert.deepEqual([rows.AAA.w, rows.AAA.l, rows.AAA.t, rows.AAA.pf, rows.AAA.pa], [1, 1, 1, 48, 45]);
    assert.equal(rows.AAA.streak, 'T1');
    assert.equal(rows.BBB.streak, 'W2');
    assert.equal(rows.AAA.pct, 0.5);
});

test('table: rank by record, games back, shared rank on equal records', () => {
    const T = load();
    const rows = T.standings(GAMES, TEAMS);
    const north = T.table(rows, 'group', 'North');
    assert.deepEqual(north.map(r => [r.abbr, r.rank, r.gb]), [['BBB', 1, 0], ['AAA', 2, 0.5]]);
    const tied = T.table({ X: { abbr: 'X', group: 'G', w: 2, l: 1, t: 0, pct: 2 / 3, diff: 5 }, Y: { abbr: 'Y', group: 'G', w: 2, l: 1, t: 0, pct: 2 / 3, diff: 1 } }, 'group', 'G');
    assert.deepEqual(tied.map(r => r.rank), [1, 1]);
});

test('rank: competition ranking, lower-is-better, percentile', () => {
    const T = load();
    const hi = T.rank({ A: 30, B: 20, C: 20, D: 10 }, 'high');
    assert.deepEqual([hi.A.rank, hi.B.rank, hi.C.rank, hi.D.rank], [1, 2, 2, 4]);
    assert.equal(hi.B.tied, true);
    assert.equal(hi.A.pctile, 100);
    assert.equal(hi.D.pctile, 0);
    const lo = T.rank({ A: 30, B: 10 }, 'low');
    assert.equal(lo.B.rank, 1);
});

test('leader: top player on the team, ranked against the whole list', () => {
    const T = load();
    const players = [{ id: 1, team: 'BBB', value: 900 }, { id: 2, team: 'AAA', value: 700 }, { id: 3, team: 'AAA', value: 400 }, { id: 4, team: 'CCC', value: null }];
    const l = T.leader(players, 'AAA');
    assert.equal(l.id, 2);
    assert.equal(l.rank, 2);
    assert.equal(T.leader(players, 'DDD'), null);
});

const SCHED = [
    { id: '1', date: '2026-09-01T18:00Z', isHome: true, oppAbbr: 'BBB', completed: true, myScore: 20, oppScore: 10 },
    { id: '2', date: '2026-09-08T18:00Z', isHome: false, oppAbbr: 'CCC', completed: true, myScore: 7, oppScore: 14 },
    { id: '3', date: '2026-09-15T18:00Z', isHome: true, oppAbbr: 'DDD', completed: true, myScore: 21, oppScore: 21 },
    { id: '5', date: '2026-09-29T18:00Z', isHome: false, oppAbbr: 'BBB', completed: false, myScore: null, oppScore: null },
    { id: '4', date: '2026-09-22T18:00Z', isHome: true, oppAbbr: 'CCC', completed: false, myScore: null, oppScore: null },
];

test('form and nextGame read dates, never array order', () => {
    const T = load();
    assert.deepEqual(T.form(SCHED, 2), ['L', 'T']);
    assert.equal(T.nextGame(SCHED).id, '4');
    const tl = T.timeline(SCHED, '4');
    assert.deepEqual(tl.map(x => x.id), ['1', '2', '3', '5']);
    assert.deepEqual(tl.slice(0, 3).map(x => x.margin), [10, -7, 0]);
});

test('stakes: group lead, revenge, cross-conference', () => {
    const T = load();
    const rows = T.standings(GAMES, TEAMS);
    // AAA (2nd, 0.5 back) hosting BBB: lead on the line.
    const s1 = T.stakes({ me: 'AAA', opp: 'BBB', rows, schedule: SCHED, next: { id: '9' } });
    assert.equal(s1[0], 'North lead on the line: BBB leads AAA by 0.5 games');
    assert.match(s1[1], /^Rematch: won 20-10 on /);
    // CCC beat AAA earlier: revenge game. Different groups, same conference.
    const s2 = T.stakes({ me: 'AAA', opp: 'CCC', rows, schedule: SCHED, next: { id: '4' } });
    assert.match(s2[0], /^Revenge game: lost 7-14 on /);
    const s3 = T.stakes({ me: 'AAA', opp: 'DDD', rows, schedule: [], next: { id: '9' } });
    assert.equal(s3[0], 'Cross-conference game');
});

test('stakes: both near the conference cut line', () => {
    const T = load();
    const rows = T.standings(GAMES, TEAMS);
    const s = T.stakes({ me: 'AAA', opp: 'CCC', rows, schedule: [], next: { id: '9' }, cut: 2 });
    assert.ok(s.includes("Both within a game of the East's 2nd-best record"), s.join(' | '));
});

test('edge: widest unit-vs-unit gap, from whichever side holds it', () => {
    const T = load();
    const ranks = {
        o: T.rank({ AAA: 30, BBB: 10, CCC: 20, DDD: 5 }, 'high'),
        d: T.rank({ AAA: 12, BBB: 25, CCC: 15, DDD: 9 }, 'low'),
    };
    const e = T.edge(ranks, [{ off: 'o', def: 'd', offLabel: 'offense', defLabel: 'defense' }], 'AAA', 'BBB');
    assert.deepEqual([e.atk, e.offRank, e.dfn, e.defRank], ['AAA', 1, 'BBB', 4]);
});

test('build + html: standings-sourced metrics are ranked; every metric shows a rank', () => {
    const T = load();
    T.register(REG);
    const m = T.build('test', {
        team: { abbr: 'AAA', name: 'Alpha', color: '#123456' }, teams: TEAMS, games: GAMES, schedule: SCHED,
        metrics: { x: { AAA: 3, BBB: -1, CCC: 0, DDD: 2 } },
        players: { one: [{ id: 'p', name: 'Pat Q', team: 'AAA', value: 50 }] },
        groups: [{ label: 'G1', side: 'a', players: [{ id: 'z', name: 'Zed', pos: 'X' }] }],
    });
    assert.equal(m.ranks.pfg.AAA.rank, 2);   // 16.0/G: BBB 17.7, AAA 16.0, CCC 12.0, DDD 9.0
    assert.equal(m.ranks.pag.AAA.rank, 3);
    assert.equal(m.myRank.rank, 2);
    assert.equal(m.next.id, '4');
    const html = T.html(m);
    for (const label of ['For / G', 'Against / G', 'Extra']) assert.ok(html.includes(label), label);
    assert.equal((html.match(/class="tp-metric__rank"/g) || []).length, 3 + 1); // 3 metrics + 1 leader
    assert.ok(html.includes('2nd in North'));
    assert.ok(html.includes('#1'));
});

test('signed metrics carry win/loss color by sign; unsigned and zero stay neutral', () => {
    const T = load();
    T.register({ ...REG, sport: 'sign', stateStats: [
        { key: 'up', label: 'Up', better: 'high', signed: true },
        { key: 'dn', label: 'Dn', better: 'high', signed: true },
        { key: 'lo', label: 'Lo', better: 'low', signed: true },
        { key: 'zero', label: 'Zero', better: 'high', signed: true },
        { key: 'plain', label: 'Plain', better: 'high' },
    ] });
    const vals = v => ({ AAA: v, BBB: 1, CCC: 2, DDD: 3 });
    const html = T.html(T.build('sign', { team: { abbr: 'AAA', name: 'Alpha' }, teams: TEAMS, games: GAMES, schedule: [],
        metrics: { up: vals(5), dn: vals(-5), lo: vals(-5), zero: vals(0), plain: vals(-5) } }));
    const cls = label => html.split(`>${label}<`)[1].match(/class="tp-metric__val([^"]*)"/)[1].trim();
    assert.equal(cls('Up'), 'tp-metric__val--pos');
    assert.equal(cls('Dn'), 'tp-metric__val--neg');
    assert.equal(cls('Lo'), 'tp-metric__val--pos', 'negative is good when lower is better');
    assert.equal(cls('Zero'), '');
    assert.equal(cls('Plain'), '');
});

test('standings table: no cut line between two teams with the same record', () => {
    const T = load();
    T.register({ ...REG, sport: 'cut', standingsCut: { after: 1, label: 'Title' } });
    const tiedGames = [g('2026-09-01T18:00Z', 'AAA', 'CCC', 10, 0), g('2026-09-01T18:00Z', 'BBB', 'DDD', 10, 0)];
    const m = T.build('cut', { team: { abbr: 'AAA', name: 'Alpha' }, teams: TEAMS, games: tiedGames, schedule: [] });
    const html = T.html(m);
    assert.ok(!html.includes('tp-cut'), 'cut line drawn between tied leaders');
    assert.ok(html.includes('T-1st in North'));
    const clear = T.html(T.build('cut', { team: { abbr: 'AAA', name: 'Alpha' }, teams: TEAMS, games: GAMES, schedule: [] }));
    assert.ok(clear.includes('tp-cut'));
});

// The spec's review gate, made mechanical: the shell names no sport, league,
// stat or route. Anything sport-specific belongs in that sport's registration.
const BANNED = /\b(nfl|nba|mlb|nhl|wnba|ncaaf|ncaab|afc|nfc|touchdowns?|yards?|quarterback|inning|espn|sleeper|division)\b/i;
const sportLines = src => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => BANNED.test(l));

test('shell contains no sport-specific literals', () => {
    assert.deepEqual(sportLines(SRC), []);
});

test('planted fault: the literal scan reports a sport name', () => {
    assert.equal(sportLines("const ok = 1;\nconst route = 'nfl-game-';").length, 1);
});
