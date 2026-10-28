// ============================================================
// Cross-sport "Today" front door (D-190): the / edge snapshot's game
// parsing and ordering (functions/index.js), and My Teams' game pick
// (js/app.js _myTeamGame). Synthetic data only.
// Run: node --test tests/todayFrontDoor.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// functions/index.js: drop its imports (not needed by the pure helpers) and `export`.
function loadIndex() {
    const src = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8')
        .replace(/^import .*$/gm, '')
        .replace(/^export /gm, '');
    const ctx = { URL };
    vm.createContext(ctx);
    vm.runInContext(`${src}\n;globalThis.__o = { mlbGames, espnGames, gamesSnapshot, ESPN_SPORTS };`, ctx);
    return ctx.__o;
}
const F = loadIndex();
const plain = v => JSON.parse(JSON.stringify(v));

const mlbJson = { dates: [{ games: [
    { gamePk: 1, status: { abstractGameState: 'Live', detailedState: 'In Progress' },
      teams: { away: { team: { name: 'Dodgers' }, score: 2 }, home: { team: { name: 'Yankees' }, score: 3 } } },
    { gamePk: 2, status: { abstractGameState: 'Preview', detailedState: 'Scheduled' },
      teams: { away: { team: { name: 'Mets' } }, home: { team: { name: '<Cubs>' } } } },
] }] };

const ev = (id, state, date, detail) => ({
    id, date, status: { type: { state, shortDetail: detail } },
    competitions: [{ competitors: [
        { homeAway: 'home', team: { displayName: 'Home ' + id }, score: '10' },
        { homeAway: 'away', team: { displayName: 'Away ' + id }, score: '7' },
    ] }],
});

test('mlbGames flags live games and links each game page', () => {
    const rows = plain(F.mlbGames(mlbJson));
    assert.deepEqual(rows.map(r => [r.live, r.href]), [[true, '/mlb/game/1'], [false, '/mlb/game/2']]);
    assert.equal(rows[0].line, 'Dodgers 2, Yankees 3 — In Progress');
    assert.equal(rows[1].line, 'Mets at <Cubs> — Scheduled');
    assert.deepEqual(plain(F.mlbGames(null)), []);
});

test('espnGames keeps live games and games dated today (ET), drops the rest of the week', () => {
    const nfl = F.ESPN_SPORTS.find(s => s[0] === 'nfl');
    const json = { events: [
        ev('a', 'in',   '2026-10-25T17:00Z', 'Q3 4:12'),       // live, even though dated Sunday
        ev('b', 'pre',  '2026-10-27T23:15Z', '7:15 PM ET'),    // today 7:15 PM ET
        ev('c', 'post', '2026-10-28T03:30Z', 'Final'),         // 11:30 PM ET on the 27th
        ev('d', 'pre',  '2026-11-01T17:00Z', 'Sun 1:00 PM'),   // later this week
    ] };
    const rows = plain(F.espnGames(json, nfl, '2026-10-27'));
    assert.deepEqual(rows.map(r => r.href), ['/nfl/game/a', '/nfl/game/b', '/nfl/game/c']);
    assert.equal(rows[0].live, true);
    assert.equal(rows[1].line, 'Away b at Home b — 7:15 PM ET');
    assert.equal(rows[2].line, 'Away c 7, Home c 10 — Final');
    const nba = F.ESPN_SPORTS.find(s => s[0] === 'nba');
    assert.equal(plain(F.espnGames({ events: [ev('x', 'in', '2026-10-27T23:00Z', 'Q1')] }, nba, '2026-10-27'))[0].href, null, 'no NBA game path exists');
});

test('gamesSnapshot leads with live games across sports, caps each sport, escapes', () => {
    const rows = [
        ...Array.from({ length: 12 }, (_, i) => ({ sport: 'mlb', label: 'MLB', live: false, line: `m${i}`, href: null })),
        { sport: 'nba', label: 'NBA', live: true, line: 'Lakers <b>', href: null },
        { sport: 'nfl', label: 'NFL', live: false, line: 'n0', href: '/nfl/game/9' },
    ];
    const html = F.gamesSnapshot(rows, 'October 27, 2026');
    assert.ok(html.indexOf('Live now') < html.indexOf("Today's games"));
    assert.match(html, /NBA: Lakers &lt;b&gt;/);
    assert.equal((html.match(/MLB: m\d+/g) || []).length, 8, 'MLB capped at 8 non-live');
    assert.match(html, /<a href="\/nfl\/game\/9">NFL: n0<\/a>/);
    assert.match(F.gamesSnapshot([], 'x'), /No games on today/);
});

test('My Teams picks live, then upcoming, then final, and only today for MLB', () => {
    const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
    const fn = app.match(/^function _myTeamGame\([\s\S]*?^}/m)[0];
    const norm = g => ({ status: g.st, home: { abbr: g.h }, away: { abbr: g.a } });
    const ctx = {
        Scorebug: { normalizeMLBGame: norm },
        _homeSportTabCfg: () => ({ normalize: norm }),
    };
    vm.createContext(ctx);
    vm.runInContext(`${fn}\n;globalThis.__f = _myTeamGame;`, ctx);
    const pick = (sport, abbr, games) => { const r = ctx.__f(sport, abbr, games); return r && r.g.id; };
    const games = [
        { id: 1, st: 'final', h: 'DAL', a: 'PHI' },
        { id: 2, st: 'upcoming', h: 'PHI', a: 'NYG' },
        { id: 3, st: 'live', h: 'SEA', a: 'SF' },
    ];
    assert.equal(pick('nfl', 'phi', games), 2);
    assert.equal(pick('nfl', 'SF', games), 3);
    assert.equal(pick('nfl', 'DAL', games), 1);
    assert.equal(pick('nfl', 'KC', games), null);
    const todayET = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
    const mlb = [
        { id: 7, st: 'final', h: 'NYY', a: 'BOS', officialDate: '2020-01-01' },
        { id: 8, st: 'upcoming', h: 'NYY', a: 'TB', officialDate: todayET },
    ];
    assert.equal(pick('mlb', 'NYY', mlb), 8);
    assert.equal(pick('mlb', 'BOS', mlb), null, "yesterday's final isn't today's game");
});
