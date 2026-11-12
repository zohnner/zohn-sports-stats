// ============================================================
// NBA team page (parity #87). Pure helpers in js/nba.js read the shapes in
// tests/fixtures/nba-team-sa-trim.json, trimmed from live ESPN responses
// (/teams/sa/roster, /teams/24/schedule, level=3 standings) on
// 2026-11-12. The render test runs the real shared _renderTeamPage (js/nfl.js).
// Run: node --test tests/nbaTeam.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nba-team-sa-trim.json'), 'utf8'));

function load(files, extra = {}) {
    const noop = () => {};
    const storage = () => ({ getItem: () => null, setItem: noop, removeItem: noop });
    const el = () => ({ innerHTML: '', className: '', style: {}, isConnected: true, remove: noop });
    const els = {};
    const ctx = {
        console, Math, Date, JSON, Map, Set, Array, Number, String, Object, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Promise,
        sessionStorage: storage(), localStorage: storage(),
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        location: { origin: 'https://sportstrata.test', hash: '' },
        ApiCache: { TTL: { SHORT: 1, MEDIUM: 1, LONG: 1, DAILY: 1, SEASON: 1 }, get: () => null, set: noop, getTimestamp: () => null },
        AppState: {},
        document: {
            getElementById: (id) => (els[id] = els[id] || el()),
            querySelector: () => null, querySelectorAll: () => [], addEventListener: noop,
            createElement: el, body: { classList: { toggle: noop, add: noop, remove: noop } },
        },
        _escHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        noteFetched: noop, freshnessHtml: () => '',
        ...extra,
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
    return { ctx, els };
}

const { ctx } = load(['nba.js']);

test('team key: ESPN abbr is canonical, common long forms alias to it', () => {
    assert.equal(ctx._nbaTeamKey('sas'), 'SA');
    assert.equal(ctx._nbaTeamKey('GSW'), 'GS');
    assert.equal(ctx._nbaTeamKey('uta'), 'UTAH');
    assert.equal(ctx._nbaTeamKey('was'), 'WSH');
    assert.equal(ctx._nbaTeamKey('nyk'), 'NY');
    assert.equal(ctx._nbaTeamKey('nop'), 'NO');
    assert.equal(ctx._nbaTeamKey('lal'), 'LAL');
});

const row = (abbr) => ctx._nbaStandingRow(FX.standings[abbr].entry);
const chipsOf = (r) => Object.fromEntries(ctx._nbaTeamRecordChips(r).map(([k, v]) => [k, v]));

test('record: read from the standings row, with home/road/L10/PPG kept', () => {
    const r = row('SA');
    assert.equal(r.overall, '9-2');
    assert.equal(r.home, '4-2');
    assert.equal(r.road, '5-0');
    assert.equal(r.l10, '9-1');
    assert.equal(r.seed, 2);
    const c = chipsOf(r);
    assert.equal(c.Record, '9-2');
    assert.equal(c.PCT, '.818');
    assert.equal(c.Streak, 'W9');
    assert.equal(c.PPG, '118.7');
    assert.equal(c['Opp PPG'], '107.0');
    assert.equal(c.Diff, '+11.7');
    const m = chipsOf(row('MIL'));
    assert.equal(m.Record, '1-10');
    assert.equal(m.Streak, 'L7');
    assert.ok(m.Diff.startsWith('-'));
});

test('record: no games played yet means no record card, not a 0-0 card', () => {
    const e = JSON.parse(JSON.stringify(FX.standings.SA.entry));
    for (const st of e.stats) if (st.name === 'wins' || st.name === 'losses') st.value = 0;
    assert.equal(ctx._nbaTeamRecordChips(ctx._nbaStandingRow(e)).length, 0);
    assert.equal(ctx._nbaTeamRecordChips(null).length, 0);
});

test('standings lookup: finds the team and its division under either spelling', () => {
    const confs = [{ name: FX.standings.SA.division, teams: [row('SA')] }, { name: FX.standings.MIL.division, teams: [row('MIL')] }];
    assert.equal(ctx._nbaFindStanding(confs, 'SA').division, 'Western Conference — Southwest');
    assert.equal(ctx._nbaFindStanding(confs, ctx._nbaTeamKey('sas')).row.abbr, 'SA');
    assert.equal(ctx._nbaFindStanding(confs, 'LAL'), null);
});

test('roster: grouped Guards/Forwards/Centers with ESPN injury status', () => {
    const groups = ctx._nbaRosterGroups(FX.roster.athletes);
    assert.equal(groups.map(g => g.label).join(), 'Guards,Forwards,Centers');
    const total = groups.reduce((n, g) => n + g.players.length, 0);
    assert.equal(total, FX.roster.athletes.length);
    const all = groups.flatMap(g => g.players);
    const wemby = all.find(p => p.name === 'Victor Wembanyama');
    assert.equal(wemby.pos, 'F');
    assert.equal(wemby.injury, '');
    assert.equal(all.find(p => p.name === 'Tobias Harris').injury, 'Out');
    const odd = ctx._nbaRosterGroups([{ id: '1', fullName: 'X', position: { abbreviation: '' }, injuries: [] }]);
    assert.equal(odd.map(g => g.label).join(), 'Other');
});

test('schedule: last five finals newest first, next three unfinished oldest first', () => {
    const g = ctx._nbaTeamGames(FX.schedule.events, FX.roster.team.id);
    assert.equal(g.recent.length, 5);
    assert.equal(g.upcoming.length, 3);
    const ts = r => new Date(r.date).getTime();
    for (let i = 1; i < g.recent.length; i++) assert.ok(ts(g.recent[i - 1]) >= ts(g.recent[i]));
    for (let i = 1; i < g.upcoming.length; i++) assert.ok(ts(g.upcoming[i - 1]) <= ts(g.upcoming[i]));
    assert.ok(ts(g.recent[0]) < ts(g.upcoming[0]));
    for (const r of g.recent) {
        assert.equal(typeof r.my, 'number');
        assert.equal(r.won, r.my > r.opp);
        assert.notEqual(r.oppAbbr, 'SA');
    }
    const wins = FX.schedule.events.filter(e => e.competitions[0].competitors.find(c => c.id === FX.roster.team.id).winner === true).length;
    assert.equal(wins, 9);
});

test('render: team page shows record, roster, games and links to player and game pages', () => {
    const { ctx: c, els } = load(['nba.js', 'nfl.js'], { renderFollowStar: (s, t, a) => `<star ${s}:${t}:${a}>` });
    const std = { row: c._nbaStandingRow(FX.standings.SA.entry), division: FX.standings.SA.division };
    c.displayNBATeamDetail(FX.roster.team, FX.roster, FX.schedule, std);
    const html = els.playersGrid.innerHTML;
    assert.match(html, /San Antonio Spurs/);
    assert.match(html, /Western Conference — Southwest/);
    assert.match(html, /<star nba:team:SA>/);
    assert.match(html, /Team Record/);
    assert.match(html, /Last 10/);
    assert.match(html, /2026-27 Season/);
    assert.match(html, /Recent Results/);
    assert.match(html, /Upcoming/);
    assert.match(html, />Roster</);
    assert.doesNotMatch(html, /Depth Chart/);
    assert.match(html, /Head Coach/);
    assert.match(html, /navigateTo\('nba-player-\d+'\)/);
    assert.match(html, /navigateTo\('nba-game-\d+'\)/);
    assert.match(html, /navigateTo\('nba-teams'\)/);
});

test('render: standings unavailable still renders identity, roster and games', () => {
    const { ctx: c, els } = load(['nba.js', 'nfl.js']);
    c.displayNBATeamDetail(FX.roster.team, FX.roster, FX.schedule, null);
    const html = els.playersGrid.innerHTML;
    assert.match(html, /San Antonio Spurs/);
    assert.match(html, /9-2/);
    assert.doesNotMatch(html, /Team Record/);
    assert.match(html, /Recent Results/);
});
