// ============================================================
// MLB season and phase from statsapi's calendar (D-206).
// Run: node --test tests/mlbSeason.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'js', 'mlbSeason.js'), 'utf8');
const EDGE = fs.readFileSync(path.join(ROOT, 'functions', '_mlbSeason.js'), 'utf8');

function loadClient(storage = {}) {
    const localStorage = {
        getItem: k => (k in storage ? storage[k] : null),
        setItem: (k, v) => { storage[k] = String(v); },
    };
    const ctx = { localStorage, JSON, Date, Number, String };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(CLIENT, ctx, { filename: 'mlbSeason.js' });
    return { M: vm.runInContext('MLBSeason', ctx), storage };
}
function loadEdge() {
    const ctx = { Intl, Date, Number, fetch: async () => ({ ok: false }) };
    vm.createContext(ctx);
    vm.runInContext(EDGE.replace(/^export /gm, ''), ctx, { filename: '_mlbSeason.js' });
    return vm.runInContext('({ resolveMlbSeason, mlbSeason })', ctx);
}

// statsapi /seasons/2026?sportId=1, checked 2026-11-17.
const D2026 = {
    seasonId: '2026', springStartDate: '2026-02-20', seasonStartDate: '2026-02-20',
    regularSeasonStartDate: '2026-03-25', regularSeasonEndDate: '2026-09-27',
    postSeasonStartDate: '2026-09-28', postSeasonEndDate: '2026-10-28',
};
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test('resolve: each phase of 2026 from the real calendar', () => {
    const { M } = loadClient();
    const r = today => { const x = M.resolve(D2026, 2026, today); return `${x.season} ${x.phase}`; };
    assert.equal(r('2026-01-15'), '2025 offseason');
    assert.equal(r('2026-02-25'), '2025 preseason');
    assert.equal(r('2026-03-24'), '2025 preseason');
    assert.equal(r('2026-03-25'), '2026 regular');
    assert.equal(r('2026-09-27'), '2026 regular');
    assert.equal(r('2026-09-28'), '2026 postseason');
    assert.equal(r('2026-10-28'), '2026 postseason');
    // The day after the last World Series game the season is over -- and the
    // season shown stays 2026, the one that just ended (it read 2025 before).
    assert.equal(r('2026-10-29'), '2026 offseason');
    assert.equal(r('2026-11-17'), '2026 offseason');
    assert.equal(r('2026-12-31'), '2026 offseason');
});

test('resolve: a World Series that ends early ends the season early', () => {
    const { M } = loadClient();
    const sweep = { ...D2026, postSeasonEndDate: '2026-10-24' };
    assert.equal(M.resolve(sweep, 2026, '2026-10-25').phase, 'offseason');
    assert.equal(M.resolve(D2026, 2026, '2026-10-25').phase, 'postseason');
});

test('resolve: missing or wrong-year dates fall back to the calendar guess', () => {
    const { M } = loadClient();
    assert.equal(M.resolve(null, 2026, '2026-11-17').source, 'calendar');
    assert.equal(M.resolve(null, 2026, '2026-11-17').season, 2026);
    assert.equal(M.resolve(D2026, 2027, '2027-02-01').source, 'calendar');
    assert.equal(M.resolve(D2026, 2027, '2027-02-01').season, 2026);
    assert.equal(M.resolve({ seasonId: '2026' }, 2026, '2026-07-01').source, 'calendar');
});

test('client and edge resolve agree on every day of the year, with and without dates', () => {
    const { M } = loadClient();
    const E = loadEdge();
    for (const dates of [D2026, null]) {
        for (let t = at(2026, 1, 1); t <= at(2026, 12, 31); t += 864e5) {
            const today = M.ymd(new Date(t));
            assert.deepEqual({ ...E.resolveMlbSeason(dates, 2026, today) }, { ...M.resolve(dates, 2026, today) }, today);
        }
    }
});

test('edge mlbSeason fails open to the calendar when statsapi does not answer', async () => {
    const E = loadEdge();
    const r = await E.mlbSeason(new Date('2026-11-17T17:00:00Z'));
    assert.equal(r.source, 'calendar');
    assert.equal(r.season, 2026);
});

test('refresh: stores the dates and current() reads them from then on', async () => {
    const { M, storage } = loadClient();
    const now = at(2026, 11, 17);
    assert.equal(M.current(now).source, 'calendar');
    let calls = 0;
    const r = await M.refresh(async y => { calls++; assert.equal(y, 2026); return { seasons: [D2026] }; }, now);
    assert.equal(calls, 1);
    assert.equal(`${r.season} ${r.phase} ${r.source}`, '2026 offseason api');
    assert.ok(storage.zs_mlb_season_dates);
    // A new page load reads the stored dates synchronously.
    const again = loadClient(storage).M;
    assert.equal(again.current(now).source, 'api');
});

test('refresh: skips the fetch while fresh, re-checks hourly in the postseason', async () => {
    const storage = {};
    const { M } = loadClient(storage);
    let calls = 0;
    const fetchSeason = async () => { calls++; return { seasons: [D2026] }; };
    await M.refresh(fetchSeason, at(2026, 7, 1, 9));
    await M.refresh(fetchSeason, at(2026, 7, 1, 20));
    assert.equal(calls, 1, 'regular season: 12h');
    await M.refresh(fetchSeason, at(2026, 10, 20, 9));
    await M.refresh(fetchSeason, at(2026, 10, 20, 9) + 30 * 60e3);
    assert.equal(calls, 2);
    await M.refresh(fetchSeason, at(2026, 10, 20, 9) + 61 * 60e3);
    assert.equal(calls, 3, 'postseason: 1h');
});

test('refresh: a new calendar year fetches that year; a bad answer keeps the guess', async () => {
    const storage = {};
    const { M } = loadClient(storage);
    await M.refresh(async () => ({ seasons: [D2026] }), at(2026, 11, 17));
    let asked = null;
    const r = await M.refresh(async y => { asked = y; return { seasons: [] }; }, at(2027, 1, 5));
    assert.equal(asked, 2027);
    assert.equal(`${r.season} ${r.phase} ${r.source}`, '2026 offseason calendar');
    await assert.rejects(M.refresh(async () => { throw new Error('down'); }, at(2027, 1, 5)));
});
