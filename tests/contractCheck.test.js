// ============================================================
// Upstream contract monitor (tools/contract-*.cjs).
// Run: node --test tests/contractCheck.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../tools/contract-lib.cjs');

test('parsePath accepts keys, fixed indexes and [] steps', () => {
    assert.deepEqual(lib.parsePath('events[].competitions[0].id'), [
        { key: 'events' }, { each: true }, { key: 'competitions' }, { index: 0 }, { key: 'id' },
    ]);
});

test('parsePath rejects malformed paths with ContractError', () => {
    for (const bad of ['', 'a..b', 'a[x]', '.a', 'a.', '[0]', 'a[0', 5]) {
        assert.throws(() => lib.parsePath(bad), lib.ContractError, String(bad));
    }
});

test('checkPath passes when every element has the value', () => {
    const data = { events: [{ status: { state: 'post' } }, { status: { state: 'in' } }] };
    assert.deepEqual(lib.checkPath(data, 'events[].status.state'), []);
});

test('checkPath reports each missing location', () => {
    const data = { events: [{ status: { state: 'post' } }, { status: {} }, {}] };
    assert.deepEqual(lib.checkPath(data, 'events[].status.state'), [
        'events[1].status.state', 'events[2].status',
    ]);
});

test('checkPath treats null as missing but 0, false and "" as present', () => {
    assert.deepEqual(lib.checkPath({ a: 0, b: false, c: '' }, 'a'), []);
    assert.deepEqual(lib.checkPath({ a: 0, b: false, c: '' }, 'b'), []);
    assert.deepEqual(lib.checkPath({ a: 0, b: false, c: '' }, 'c'), []);
    assert.deepEqual(lib.checkPath({ a: null }, 'a'), ['a']);
});

test('checkPath passes vacuously on an empty [] step', () => {
    assert.deepEqual(lib.checkPath({ events: [] }, 'events[].id'), []);
});

test('checkPath flags a non-array at a [] step', () => {
    assert.deepEqual(lib.checkPath({ events: {} }, 'events[].id'), ['events (not an array)']);
});

test('checkPath follows fixed indexes and reports a missing index', () => {
    assert.deepEqual(lib.checkPath({ c: [{ id: 1 }] }, 'c[0].id'), []);
    assert.deepEqual(lib.checkPath({ c: [] }, 'c[0].id'), ['c[0]']);
});

test('getAt resolves keys and indexes, rejects []', () => {
    assert.equal(lib.getAt({ d: [{ g: [1, 2] }] }, 'd[0].g').length, 2);
    assert.equal(lib.getAt({}, 'd[0].g'), undefined);
    assert.throws(() => lib.getAt({}, 'd[].g'), lib.ContractError);
});

test('deepCollect gathers every array under a key at any depth', () => {
    const tree = { children: [
        { standings: { entries: [1, 2] } },
        { children: [{ standings: { entries: [3] } }, { standings: { entries: [4, 5] } }] },
    ] };
    assert.deepEqual(lib.deepCollect(tree, 'entries'), [1, 2, 3, 4, 5]);
});

test('minCount enforces the floor only on a full slate when fullSlateOnly', () => {
    const inv = lib.minCount('events', 8, { fullSlateOnly: true });
    const three = { events: [1, 2, 3] };
    assert.match(inv.check(three, { fullSlate: true }), /has 3, expected >= 8/);
    assert.equal(inv.check(three, { fullSlate: false }), null);
    assert.match(inv.check({ events: [] }, { fullSlate: false }), /has 0, expected >= 1/);
    assert.match(inv.check({}, {}), /not an array/);
    assert.equal(inv.severity, 'fail');
});

test('minCount rejects [] paths at definition time', () => {
    assert.throws(() => lib.minCount('events[].id', 1), lib.ContractError);
});

test('exactCount', () => {
    const inv = lib.exactCount('boxscore.teams', 2);
    assert.equal(inv.check({ boxscore: { teams: [1, 2] } }, {}), null);
    assert.match(inv.check({ boxscore: { teams: [1] } }, {}), /has 1, expected exactly 2/);
});

test('deepCount min, exact, and per-element path', () => {
    const tree = { children: [{ standings: { entries: [{ team: { abbreviation: 'BUF' } }, { team: {} }] } }] };
    assert.equal(lib.deepCount('entries', 2).check(tree, {}), null);
    assert.match(lib.deepCount('entries', 3).check(tree, {}), /found 2 "entries", expected >= 3/);
    assert.match(lib.deepCount('entries', 1, { exact: true }).check(tree, {}), /expected exactly 1/);
    assert.match(lib.deepCount('entries', 2, { each: 'team.abbreviation' }).check(tree, {}),
        /1 of 2 "entries" missing team.abbreviation/);
});

test('numeric accepts numbers and numeric strings, rejects the rest', () => {
    const inv = lib.numeric('c[].score');
    assert.equal(inv.check({ c: [{ score: 3 }, { score: '14' }, { score: 0 }] }, {}), null);
    assert.match(inv.check({ c: [{ score: 'N/A' }, { score: '' }] }, {}), /2 non-numeric/);
});

test('eachNonEmpty', () => {
    const inv = lib.eachNonEmpty('categories[].leaders');
    assert.equal(inv.check({ categories: [{ leaders: [1] }, { leaders: [1, 2] }] }, {}), null);
    assert.match(inv.check({ categories: [{ leaders: [] }, {}] }, {}), /2 empty or missing/);
});

test('predicate wraps a custom check and carries severity', () => {
    const inv = lib.predicate('is array', d => (Array.isArray(d) ? null : 'not an array'), { severity: 'warn' });
    assert.equal(inv.check([], {}), null);
    assert.equal(inv.check({}, {}), 'not an array');
    assert.equal(inv.severity, 'warn');
    assert.equal(inv.name, 'is array');
});

test('readEspnScoreboard reads finals and season from events', () => {
    const json = { events: [
        { id: '1', season: { year: 2026, type: 2 }, status: { type: { state: 'post' } } },
        { id: '2', season: { year: 2026, type: 2 }, status: { type: { state: 'pre' } } },
    ] };
    assert.deepEqual(lib.readEspnScoreboard(json), { finalIds: ['1'], season: 2026, regularSeason: true });
    assert.deepEqual(lib.readEspnScoreboard({}), { finalIds: [], season: undefined, regularSeason: false });
});

test('readMlbSchedule reads finals, season and regular-season flag', () => {
    const json = { dates: [{ games: [
        { gamePk: 9, season: '2026', gameType: 'R', status: { abstractGameState: 'Final' } },
        { gamePk: 8, season: '2026', gameType: 'R', status: { abstractGameState: 'Preview' } },
    ] }] };
    assert.deepEqual(lib.readMlbSchedule(json), { finalIds: [9], season: 2026, regularSeason: true });
    const post = { dates: [{ games: [{ gamePk: 1, season: '2026', gameType: 'F', status: { abstractGameState: 'Final' } }] }] };
    assert.equal(lib.readMlbSchedule(post).regularSeason, false);
    assert.deepEqual(lib.readMlbSchedule({ dates: [] }), { finalIds: [], season: undefined, regularSeason: false });
});

const check = require('../tools/contract-check.cjs');

const stubFetch = map => async path => {
    const hit = map[path];
    if (hit === undefined) return { ok: false, status: 404, contentType: 'application/json', json: null, bodySnippet: 'not stubbed' };
    if (typeof hit === 'string') return { ok: true, status: 200, contentType: 'text/html', json: null, bodySnippet: hit.slice(0, 200) };
    return { ok: true, status: 200, contentType: 'application/json', json: hit, bodySnippet: '' };
};
const sb = (ids, state = 'post', type = 2) => ({
    events: ids.map(id => ({ id, season: { year: 2026, type }, status: { type: { state } } })),
});
const TUE = new Date('2026-09-29T11:00:00Z');
const nflLike = extra => ({
    sport: 'nfl',
    gameDay: 0,
    probe: { route: d => `/sb?d=${d.yyyymmdd}`, read: lib.readEspnScoreboard },
    contracts: [],
    ...extra,
});
const allDates = value => {
    const all = {};
    for (let n = 1; n <= 10; n++) all[`/sb?d=${check.dateBack(TUE, n).yyyymmdd}`] = value;
    return all;
};

test('dateBack walks back in UTC and formats both date styles', () => {
    assert.deepEqual(check.dateBack(TUE, 2), { iso: '2026-09-27', yyyymmdd: '20260927', dow: 0 });
    assert.deepEqual(check.dateBack(new Date('2026-03-01T01:00:00Z'), 1), { iso: '2026-02-28', yyyymmdd: '20260228', dow: 6 });
});

test('resolveProbe prefers the most recent game day over a nearer off-day final', async () => {
    const fetchJson = stubFetch({ '/sb?d=20260928': sb(['mnf']), '/sb?d=20260927': sb(['a', 'b']) });
    const p = await check.resolveProbe(nflLike(), fetchJson, TUE);
    assert.equal(p.date.iso, '2026-09-27');
    assert.deepEqual(p.finalIds, ['a', 'b']);
    assert.equal(p.isGameDay, true);
    assert.equal(p.regularSeason, true);
});

test('resolveProbe falls back to the nearest final when no game day has one', async () => {
    const all = allDates(sb([]));
    all['/sb?d=20260928'] = sb(['mnf']);
    const p = await check.resolveProbe(nflLike(), stubFetch(all), TUE);
    assert.equal(p.date.iso, '2026-09-28');
    assert.equal(p.isGameDay, false);
});

test('resolveProbe reports offseason when reachable but no finals in 10 days', async () => {
    assert.deepEqual(await check.resolveProbe(nflLike(), stubFetch(allDates(sb([]))), TUE), { offseason: true });
});

test('resolveProbe reports unreachable when every date is HTML or an error', async () => {
    const all = allDates('<html>blocked</html>');
    assert.deepEqual(await check.resolveProbe(nflLike(), stubFetch(all), TUE), { unreachable: true });
});

test('runContract: pass, missing path, HTML block, HTTP error', async () => {
    const c = { id: 'x', route: () => '/x', paths: ['events[].id'], invariants: [lib.minCount('events', 1)] };
    let r = await check.runContract(c, {}, stubFetch({ '/x': { events: [{ id: 1 }] } }));
    assert.equal(r.status, 'pass');
    r = await check.runContract(c, {}, stubFetch({ '/x': { events: [{}] } }));
    assert.equal(r.status, 'fail');
    assert.match(r.failures[0], /missing events\[\]\.id at 1 location\(s\), e\.g\. events\[0\]\.id/);
    r = await check.runContract(c, {}, stubFetch({ '/x': '<!DOCTYPE html><title>Access Denied</title>' }));
    assert.equal(r.status, 'fail');
    assert.match(r.failures[0], /likely WAF block/);
    r = await check.runContract(c, {}, stubFetch({}));
    assert.match(r.failures[0], /^HTTP 404/);
});

test('runContract: warn-severity and offseason invariant failures become warnings', async () => {
    const c = { id: 'x', route: () => '/x', paths: [], invariants: [
        lib.minCount('events', 5, { severity: 'warn' }),
    ] };
    let r = await check.runContract(c, {}, stubFetch({ '/x': { events: [] } }));
    assert.equal(r.status, 'warn');
    const c2 = { id: 'y', route: () => '/y', paths: [], invariants: [lib.exactCount('teams', 32)] };
    r = await check.runContract(c2, { offseason: true }, stubFetch({ '/y': { teams: [] } }));
    assert.equal(r.status, 'warn');
});

test('runSport: offseason skips probe/final contracts but runs the rest', async () => {
    const all = allDates(sb([]));
    all['/standings?season=2026'] = { teams: [] };
    const sport = nflLike({ contracts: [
        { id: 'nfl-scoreboard', needs: 'probe', route: c => `/sb?d=${c.yyyymmdd}`, paths: [], invariants: [] },
        { id: 'nfl-standings', route: c => `/standings?season=${c.season}`, paths: [], invariants: [lib.exactCount('teams', 32)] },
    ] });
    const out = await check.runSport(sport, stubFetch(all), TUE);
    assert.deepEqual(out.results.map(r => [r.id, r.status]), [
        ['nfl-probe', 'pass'], ['nfl-scoreboard', 'skip'], ['nfl-standings', 'warn'],
    ]);
    assert.match(out.probe, /offseason/);
});

test('runSport: unreachable probe is a single failing result', async () => {
    const out = await check.runSport(nflLike({ contracts: [
        { id: 'nfl-standings', route: () => '/s', paths: [], invariants: [] },
    ] }), stubFetch({}), TUE);
    assert.deepEqual(out.results.map(r => [r.id, r.status]), [['nfl-probe', 'fail']]);
    assert.match(out.results[0].failures[0], /could not establish probe date/);
});

test('runSport: in-season builds ctx with season, finalId and fullSlate', async () => {
    const all = { '/sb?d=20260928': sb([]), '/sb?d=20260927': sb(['g1']), '/sum': {} };
    let seen;
    const sport = nflLike({ contracts: [{ id: 'nfl-summary', needs: 'final',
        route: c => { seen = c; return '/sum'; }, paths: [], invariants: [] }] });
    await check.runSport(sport, stubFetch(all), TUE);
    assert.equal(seen.finalId, 'g1');
    assert.equal(seen.season, 2026);
    assert.equal(seen.fullSlate, true);
    assert.equal(seen.yyyymmdd, '20260927');
});

test('validateSports throws on a malformed contract path', () => {
    assert.throws(() => check.validateSports([nflLike({ contracts: [
        { id: 'bad', route: () => '/', paths: ['a..b'], invariants: [] },
    ] })]), lib.ContractError);
});

test('exitCodeFor: fail beats warn beats pass; skip is neutral', () => {
    const rep = statuses => [{ results: statuses.map(status => ({ status })) }];
    assert.equal(check.exitCodeFor(rep(['pass', 'skip'])), 0);
    assert.equal(check.exitCodeFor(rep(['pass', 'warn'])), 1);
    assert.equal(check.exitCodeFor(rep(['warn', 'fail'])), 2);
});
