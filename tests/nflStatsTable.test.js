// ============================================================
// NFL Stats table — pure logic behind #nfl-leaders (js/nflStatsTable.js).
// Fixture: a trimmed real ESPN byathlete passing response (2026, top 6).
// Run: node --test tests/nflStatsTable.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'nflStatsTable.js'), 'utf8');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nfl-byathlete-passing-trim.json'), 'utf8'));
function load() {
    const ctx = { console, JSON, Array, Object, String, Number, Math, Set, Map, URLSearchParams };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'nflStatsTable.js' });
    return vm.runInContext('NFLStatsTable', ctx);
}
const T = load();
const clone = x => JSON.parse(JSON.stringify(x));
const raw = (json, ath, group, field) => {
    const g = json.categories.find(c => c.name === group);
    return ath.categories.find(c => c.name === group).totals[g.names.indexOf(field)];
};
const row = (id, v, o = {}) => ({ id, name: o.name || 'P' + id, team: o.team || 'AAA', pos: o.pos || 'QB', headshot: '', v: { 'general.gamesPlayed': 10, ...v } });

test('num strips separators, trailing t, and treats dashes as missing', () => {
    assert.equal(T.num('2,618'), 2618);
    assert.equal(T.num('81t'), 81);
    assert.equal(T.num('9.5'), 9.5);
    assert.equal(T.num('-'), null);
    assert.equal(T.num(''), null);
    assert.equal(T.num(null), null);
});

test('parse reads every column by ESPN names, not position', () => {
    const { cols, dropped, rows } = T.parse(FIX, 'passing');
    assert.equal(dropped.length, 0);
    assert.equal(rows.length, FIX.athletes.length);
    FIX.athletes.forEach((a, i) => {
        assert.equal(rows[i].id, String(a.athlete.id));
        assert.equal(rows[i].team, a.athlete.teamShortName);
        for (const c of cols) {
            const [g, f] = c.k.split('.');
            assert.equal(rows[i].v[c.k], T.num(raw(FIX, a, g, f)), `${a.athlete.displayName} ${c.k}`);
        }
    });
});

test('parse drops a column ESPN stopped sending and keeps the rest aligned', () => {
    const j = clone(FIX);
    const g = j.categories.find(c => c.name === 'passing');
    const at = g.names.indexOf('adjQBR');
    g.names.splice(at, 1); g.labels.splice(at, 1);
    j.athletes.forEach(a => a.categories.find(c => c.name === 'passing').totals.splice(at, 1));
    const { cols, dropped, rows } = T.parse(j, 'passing');
    assert.deepEqual([...dropped], ['passing.adjQBR']);
    assert.ok(!cols.some(c => c.k === 'passing.adjQBR'));
    assert.equal(rows[0].v['passing.QBRating'], T.num(raw(FIX, FIX.athletes[0], 'passing', 'QBRating')));
});

test('sortRows orders both ways and always puts missing values last', () => {
    const rows = [row('1', { x: 5 }), row('2', { x: null }), row('3', { x: 9 }), row('4', { x: 1 })];
    // Array.from: the module builds arrays in the vm realm, which deepEqual treats as a different prototype.
    assert.deepEqual(Array.from(T.sortRows(rows, 'x', 'desc'), r => r.id), ['3', '1', '4', '2']);
    assert.deepEqual(Array.from(T.sortRows(rows, 'x', 'asc'), r => r.id), ['4', '1', '3', '2']);
});

test('defaultDir sorts lower-is-better columns ascending first', () => {
    const cols = T.category('passing').cols;
    assert.equal(T.defaultDir(cols.find(c => c.k === 'passing.interceptions')), 'asc');
    assert.equal(T.defaultDir(cols.find(c => c.k === 'passing.passingYards')), 'desc');
});

test('perGame divides counting columns by GP and leaves rates and GP alone', () => {
    const cols = T.category('passing').cols;
    const [r] = T.perGame([row('1', { 'passing.passingYards': 2500, 'passing.completionPct': 65.2 })], cols);
    assert.equal(r.v['passing.passingYards'], 250);
    assert.equal(r.v['passing.completionPct'], 65.2);
    assert.equal(r.v['general.gamesPlayed'], 10);
});

test('percentiles rank against the qualified pool, flip lower-is-better, skip the rest', () => {
    const cols = T.category('passing').cols;
    const rows = [2, 4, 6, 8, 10, 12].map((n, i) => row(String(i), { 'passing.interceptions': n }));
    rows.push(row('bench', { 'passing.interceptions': 0 }));
    rows.push(row('short', { 'passing.interceptions': 0, 'general.gamesPlayed': 3 }));
    const p = T.percentiles(rows, cols, new Set(['0', '1', '2', '3', '4', '5', 'short']));
    assert.ok(p['0']['passing.interceptions'] > p['5']['passing.interceptions'], 'fewest INT ranks highest');
    assert.equal(p.bench, undefined, 'not qualified: unshaded');
    assert.equal(p.short, undefined, 'under 5 GP: unshaded');
    assert.equal(T.tier(p['0']['passing.interceptions']), 'hi2');
    assert.equal(T.tier(p['5']['passing.interceptions']), 'lo2');
});

test('filterRows matches name, team and grouped defensive positions', () => {
    const rows = [
        row('1', {}, { name: 'Will Anderson Jr.', pos: 'DE', team: 'HOU' }),
        row('2', {}, { name: 'T.J. Watt', pos: 'OLB', team: 'PIT' }),
        row('3', {}, { name: 'Patrick Surtain II', pos: 'CB', team: 'DEN' }),
    ];
    assert.deepEqual(T.filterRows(rows, { cat: 'defense', pos: 'DL' }).map(r => r.id), ['1']);
    assert.deepEqual(T.filterRows(rows, { cat: 'defense', pos: 'LB' }).map(r => r.id), ['2']);
    assert.deepEqual(T.filterRows(rows, { cat: 'defense', q: 'tj wat' }).map(r => r.id), ['2']);
    assert.deepEqual(T.filterRows(rows, { cat: 'defense', team: 'DEN' }).map(r => r.id), ['3']);
});

test('defense keeps defensive positions only, so special-teams tackles never set the curve', () => {
    const j = clone(FIX);
    j.athletes[0].athlete.position.abbreviation = 'LB';
    j.athletes[1].athlete.position.abbreviation = 'WR';
    j.athletes[2].athlete.position.abbreviation = 'CB';
    const ids = Array.from(T.parse(j, 'defense').rows, r => r.id);
    assert.deepEqual(ids, [String(j.athletes[0].athlete.id), String(j.athletes[2].athlete.id)]);
    assert.equal(T.parse(j, 'passing').rows.length, j.athletes.length, 'other tabs keep every position');
});

test('url pages past ESPN\'s 1,000-row cap', () => {
    assert.doesNotMatch(T.url('defense', 2026, true), /page=/);
    assert.match(T.url('defense', 2026, true, 2), /page=2/);
});

test('leaders gives the top three qualified players per headline stat', () => {
    const { rows } = T.parse(FIX, 'passing');
    const groups = T.leaders(rows, 'passing', new Set(rows.map(r => r.id)));
    const yds = groups.find(g => g.col.k === 'passing.passingYards');
    assert.equal(yds.top.length, 3);
    assert.ok(yds.top[0].v['passing.passingYards'] >= yds.top[1].v['passing.passingYards']);
    assert.equal(T.leaders(rows, 'passing', new Set()).length, 0, 'nobody qualified: no strip');
});

test('view hash round-trips and rejects unknown categories', () => {
    for (const s of [
        { cat: 'passing', sort: null, dir: null },
        { cat: 'receiving', sort: null, dir: null },
        { cat: 'defense', sort: 'defensive.sacks', dir: 'desc' },
        { cat: 'passing', sort: 'passing.interceptions', dir: 'asc' },
    ]) assert.deepEqual({ ...T.parseView(T.viewFor(s)) }, s);
    assert.equal(T.viewFor({ cat: 'passing' }), 'nfl-leaders');
    assert.equal(T.parseView('nfl-leaders-hockey'), null);
    assert.equal(T.parseView('nfl-players'), null);
});

test('url asks for the whole category, qualified flag and season', () => {
    const u = T.url('kicking', 2024, true);
    assert.ok(u.startsWith(T.ENDPOINT + '?'));
    assert.match(u, /category=specialTeams%3Akicking/);
    assert.match(u, /season=2024/);
    assert.match(u, /isqualified=true/);
    assert.match(u, /limit=1000/);
});

test('fmt shows dashes for missing, decimals for rates, one place per game', () => {
    const cols = T.category('passing').cols;
    const yds = cols.find(c => c.k === 'passing.passingYards');
    const pct = cols.find(c => c.k === 'passing.completionPct');
    assert.equal(T.fmt(yds, null, false), '—');
    assert.equal(T.fmt(yds, 4710, false), '4,710');
    assert.equal(T.fmt(yds, 290.94, true), '290.9');
    assert.equal(T.fmt(pct, 63, false), '63.0');
    assert.equal(T.fmt(pct, 63, true), '63.0');
    assert.equal(T.fmt({ k: 'defensive.sacks', l: 'SACK' }, 9.5, false), '9.5');
});
