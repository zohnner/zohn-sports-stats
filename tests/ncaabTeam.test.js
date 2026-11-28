// ============================================================
// NCAAB team page (parity #116). js/ncaab.js feeds NCAAB data into NBA's team
// page helpers (js/nba.js) and the shared _renderTeamPage (js/nfl.js).
// tests/fixtures/ncaab-team-msu-trim.json is trimmed from live ESPN responses
// for Michigan State (id 127) fetched 2026-11-18: /teams/127/roster,
// /teams/127/schedule and the season=2027 standings entry (4-1, 418 PF, 326 PA).
// Run: node --test tests/ncaabTeam.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ncaab-team-msu-trim.json'), 'utf8'));

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

const { ctx } = load(['ncaab.js', 'nba.js']);
const row = () => ctx._ncaabStandingRow(FX.standing.entry);

test('standing row: conference record is read from ESPN type "vsconf"', () => {
    // ESPN names it "vs. Conf." with type "vsconf"; the old lookup missed both
    // and the Standings page's Conf column read a dash for every team.
    assert.equal(row().conf, '0-0');
});

test('record card: overall, home/away, vs AP Top 25 and per-game points', () => {
    const r = row();
    assert.equal(r.overall, '4-1');
    const c = Object.fromEntries(ctx._ncaabTeamRecordChips(r));
    assert.equal(c.Record, '4-1');
    assert.equal(c.Home, '3-0');
    assert.equal(c.Away, '0-1');
    assert.equal(c['vs AP Top 25'], '1-1');
    assert.equal(c.PPG, '83.6');
    assert.equal(c['Opp PPG'], '65.2');
    assert.equal(c.Diff, '+18.4');
    assert.equal(c.Streak, 'L1');
});

test('record card: a team with no games gets no card', () => {
    const e = JSON.parse(JSON.stringify(FX.standing.entry));
    for (const st of e.stats) if (st.type === 'wins' || st.type === 'losses') st.value = 0;
    assert.equal(ctx._ncaabTeamRecordChips(ctx._ncaabStandingRow(e)).length, 0);
});

test('game log: the schedule totals match the standings feed', () => {
    const { log, upcoming } = ctx._nbaTeamGames(FX.schedule.events, '127');
    assert.equal(log.length, 5);
    assert.equal(log[0].oppAbbr, 'TENN');
    assert.equal(log[0].record, '4-1');
    assert.equal(log[0].margin, -15);
    const all = ctx._nbaTeamSplit(log, null);
    assert.equal(all.pf, 83.6);
    assert.equal(all.pa, 65.2);
    assert.equal(upcoming.length, 3);
});

test('poll rank: found by abbreviation in the first poll, else null', () => {
    const polls = [{ name: 'AP Top 25', ranks: [{ current: 6, abbr: 'MSU' }] }, { name: 'Coaches', ranks: [{ current: 5, abbr: 'MSU' }] }];
    assert.equal(JSON.stringify(ctx._ncaabPollRank(polls, 'MSU')), JSON.stringify({ rank: 6, poll: 'AP Top 25' }));
    assert.equal(ctx._ncaabPollRank(polls, 'QUIN'), null);
    assert.equal(ctx._ncaabPollRank([], 'MSU'), null);
});

test('find standing: by id, or by abbreviation for the follow rail', () => {
    const confs = [{ name: 'Big Ten Conference', teams: [row()] }];
    assert.equal(ctx._ncaabFindStanding(confs, '127', null).conference, 'Big Ten Conference');
    assert.equal(ctx._ncaabFindStanding(confs, null, 'MSU').row.id, '127');
    assert.equal(ctx._ncaabFindStanding(confs, '999', 'XYZ'), null);
});

test('render: team page links games to the NCAAB game view and leaves players unlinked', () => {
    const { ctx: c, els } = load(['teamPage.js', 'ncaab.js', 'nba.js', 'nfl.js'], { renderFollowStar: (s, t, a) => `<star ${s}:${t}:${a}>` });
    const std = { row: c._ncaabStandingRow(FX.standing.entry), conference: FX.standing.conference };
    c.displayNCAABTeamDetail(FX.roster.team, FX.roster, FX.schedule, std, { rank: 6, poll: 'AP Top 25' });
    const html = els.playersGrid.innerHTML;
    assert.match(html, /Michigan State Spartans/);
    assert.match(html, /Big Ten Conference/);
    assert.match(html, /<star ncaab:team:MSU>/);
    assert.match(html, /AP Top 25/);
    assert.match(html, />#6</);
    assert.match(html, /Tom Izzo/);
    assert.match(html, /Team Record/);
    assert.match(html, /Game Log/);
    assert.match(html, />Roster</);
    assert.match(html, /navigateTo\('ncaab-game-\d+'\)/);
    assert.doesNotMatch(html, /nba-game-/);
    assert.doesNotMatch(html, /navigateTo\('\d+'\)/, 'roster rows must not link while NCAAB has no player page');
    assert.match(html, /navigateTo\('ncaab-teams'\)/);
});

test('render: no standings still shows identity, roster and game log', () => {
    const { ctx: c, els } = load(['teamPage.js', 'ncaab.js', 'nba.js', 'nfl.js']);
    c.displayNCAABTeamDetail(FX.roster.team, FX.roster, FX.schedule, null, null);
    const html = els.playersGrid.innerHTML;
    assert.match(html, /Michigan State Spartans/);
    assert.match(html, /4-1/);
    assert.doesNotMatch(html, /Team Record/);
    assert.match(html, /Game Log/);
});

test('routing: hash, view dispatch, follow sync and the follow rail know ncaab-team', () => {
    const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.match(src('js/navigation.js'), /hash\.match\(\/\^ncaab-team-\(\\d\+\)\$\/\)/);
    assert.match(src('js/navigation.js'), /navigateTo\('ncaab-team-' \+ found\.row\.id\)/);
    assert.match(src('js/ncaab.js'), /view\.startsWith\('ncaab-team-'\)/);
    assert.match(src('functions/api/follows.js'), /VALID_SPORTS = new Set\(\[[^\]]*'ncaab'/);
});
