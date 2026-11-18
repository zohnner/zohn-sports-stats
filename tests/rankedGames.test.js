// ============================================================
// Ranked games (#169): the season adapters keep each side's rank at
// kickoff, and rankedGames() lists the games with a ranked team in them.
// Fixtures are trimmed live ESPN payloads: NCAAF 2026 Week 6 (Oklahoma 27,
// No. 1 Texas 24) and NCAAB 2026-11-15. Expected tallies were counted by
// hand from those payloads.
// Run: node --test tests/rankedGames.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const NOW = Date.parse('2026-11-17T12:00:00Z');
const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const CFB_W6 = fixture('ncaaf-scoreboard-2026-w6-trim.json');
const CBB_DAY = fixture('ncaab-scoreboard-20261115-trim.json');

class FixedDate extends Date {
    constructor(...a) { super(...(a.length ? a : [NOW])); }
    static now() { return NOW; }
}

function sandbox(files, route, presetCache = {}) {
    const noop = () => {};
    const storage = () => ({ getItem: () => null, setItem: noop, removeItem: noop });
    const cache = new Map(Object.entries(presetCache));
    const ctx = {
        console, Math, JSON, Map, Set, Array, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Promise,
        Date: FixedDate,
        sessionStorage: storage(), localStorage: storage(),
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        location: { origin: 'https://sportstrata.test' },
        ApiCache: {
            TTL: { SHORT: 300000, MEDIUM: 1800000, LONG: 3600000, DAILY: 43200000, SEASON: 1500000 },
            get: k => (cache.has(k) ? cache.get(k) : null),
            set: (k, v) => { cache.set(k, v); },
            getTimestamp: () => null,
        },
        fetch: async u => ({ ok: true, json: async () => route(String(u)) }),
        noteFetched: noop,
    };
    ctx._espnFetch = (u, init) => ctx.fetch(u, init);
    ctx.__cacheKeys = () => [...cache.keys()];
    ctx._escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    for (const f of files) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
    }
    return ctx;
}

const cfbRoute = u => (/[?&]week=6(&|$)/.test(u) ? CFB_W6 : { events: [] });
const cbbRoute = u => (/[?&]dates=20261115(&|$)/.test(u) ? CBB_DAY : { events: [] });

async function cfbGames(preset) {
    const ctx = sandbox(['ncaaf.js', 'powerRankings.js'], cfbRoute, preset);
    return { ctx, games: await ctx.fetchNCAAFSeasonGames() };
}

test('NCAAF season adapter keeps each side\'s rank at kickoff', async () => {
    const { games } = await cfbGames();
    const g = games.find(x => x.home === 'OU' && x.away === 'TEX');
    assert.ok(g, 'OU vs TEX present');
    assert.equal(g.awayRank, 1);
    assert.equal(g.homeRank, null, 'rank 99 means unranked');
    assert.equal(g.homeScore, 27);
    assert.equal(g.awayScore, 24);
});

test('regression: an old cached season array without ranks is not served', async () => {
    const stale = [{ home: 'OU', away: 'TEX', homeScore: 27, awayScore: 24, date: '2026-10-11' }];
    const { games } = await cfbGames({ ncaafSeasonGames2026: stale });
    assert.ok(games.length > 1, 'fetched fresh instead of the pre-rank cache entry');
    assert.ok(games.some(g => g.awayRank === 1), 'ranks present');
});

test('NCAAF Week 6: every ranked game listed, ranked teams 13-4 against unranked', async () => {
    const { ctx, games } = await cfbGames();
    const r = ctx.rankedGames(games);
    assert.equal(r.rows.length, 19);
    assert.deepEqual({ ...r.vsUnranked }, { w: 13, l: 4 });
    assert.equal(r.teamRecord, null);
});

test('NCAAF Week 6: upsets, No. 1 and top-10 filters', async () => {
    const { ctx, games } = await cfbGames();
    const upsets = ctx.rankedGames(games, { filter: 'upsets' }).rows.map(g => g.winner).sort();
    assert.deepEqual(upsets, ['OU', 'SC', 'UCLA', 'UK', 'UNC']);

    const no1 = ctx.rankedGames(games, { filter: 'no1' }).rows;
    assert.equal(no1.length, 1);
    assert.equal(no1[0].winner, 'OU');
    assert.equal(no1[0].loserRank, 1);
    assert.equal(no1[0].winnerRank, null);
    assert.equal(no1[0].margin, 3);
    assert.equal(no1[0].upset, true);

    const top10 = ctx.rankedGames(games, { filter: 'top10' }).rows;
    assert.equal(top10.length, 1);
    assert.equal(top10[0].winner, 'UGA');
    assert.equal(top10[0].upset, false, 'No. 2 beating No. 6 is not an upset');
});

test('team box: a team\'s record against ranked opponents, case-insensitive', async () => {
    const { ctx, games } = await cfbGames();
    const ou = ctx.rankedGames(games, { team: 'ou' });
    assert.deepEqual({ ...ou.teamRecord }, { w: 1, l: 0 }, 'OU beat No. 1 TEX');
    assert.equal(ou.rows.length, 1);
    const tex = ctx.rankedGames(games, { team: 'TEX' });
    assert.deepEqual({ ...tex.teamRecord }, { w: 0, l: 0 }, 'TEX\'s only opponent, OU, was unranked');
    assert.equal(tex.rows.length, 1, 'but the game still lists under TEX');
});

test('NCAAB adapter keeps ranks; Nov 15 ranked teams 5-1 against unranked', async () => {
    const ctx = sandbox(['ncaab.js', 'powerRankings.js'], cbbRoute);
    const games = await ctx.fetchNCAABSeasonGames();
    const r = ctx.rankedGames(games);
    assert.equal(r.rows.length, 6);
    assert.deepEqual({ ...r.vsUnranked }, { w: 5, l: 1 });
    const up = ctx.rankedGames(games, { filter: 'upsets' }).rows;
    assert.equal(up.length, 1);
    assert.equal(up[0].winner, 'MEM');
    assert.equal(up[0].loserRank, 10);
});

test('rankedGames: newest first; skips ties, unranked-only games and bad input', () => {
    const ctx = sandbox(['powerRankings.js'], () => ({}));
    assert.equal(ctx.rankedGames(undefined).rows.length, 0);
    const r = ctx.rankedGames([
        { home: 'A', away: 'B', homeScore: 10, awayScore: 7, date: '2026-09-01', homeRank: 5, awayRank: null },
        { home: 'C', away: 'D', homeScore: 14, awayScore: 14, date: '2026-09-02', homeRank: 3, awayRank: null },
        { home: 'E', away: 'F', homeScore: 21, awayScore: 3, date: '2026-09-03', homeRank: null, awayRank: null },
        { home: 'G', away: 'H', homeScore: 3, awayScore: 30, date: '2026-09-08', homeRank: 9, awayRank: 12 },
    ]);
    assert.deepEqual(r.rows.map(g => g.winner), ['H', 'A']);
    assert.equal(r.rows[0].upset, true, 'No. 12 beat No. 9');
    assert.deepEqual({ ...r.vsUnranked }, { w: 1, l: 0 });
});

test('section HTML: summary line, escaped names, upset tag', async () => {
    const { ctx, games } = await cfbGames();
    const html = ctx._rankedGamesHtml(games, { filter: 'all', team: '<x>' });
    assert.ok(!html.includes('<x>'), 'team text escaped');
    const all = ctx._rankedGamesHtml(games, { filter: 'all', team: '' });
    assert.match(all, /Ranked teams are 13-4 against unranked opponents/);
    assert.match(all, /OU 27, No\. 1 TEX 24/);
    assert.match(all, /Upset/);
});

// A season load fetches 15 NCAAF weeks (1.7-2.5 MB each) or one NCAAB
// scoreboard per day. Saving each raw payload filled localStorage (~10 MB
// measured 2026-11-18) and raised the "Caching off" toast; only the
// flattened season array is worth keeping.
const rawScoreboardKeys = ctx => ctx.__cacheKeys().filter(k => /^ncaa[fb]:\/scoreboard:/.test(k));

test('season loads keep raw scoreboard payloads out of storage', async () => {
    const { ctx } = await cfbGames();
    assert.deepEqual(rawScoreboardKeys(ctx), [], 'NCAAF season');
    assert.ok(ctx.__cacheKeys().some(k => k.startsWith('ncaafSeasonGames')), 'the flattened season array is still cached');

    const prior = sandbox(['ncaaf.js'], cfbRoute);
    await prior.fetchNCAAFPriorSeasonGames();
    assert.deepEqual(rawScoreboardKeys(prior), [], 'NCAAF prior season');

    const cbb = sandbox(['ncaab.js'], cbbRoute);
    await cbb.fetchNCAABSeasonGames();
    assert.deepEqual(rawScoreboardKeys(cbb), [], 'NCAAB season');
});

test('the Scores page still caches the scoreboard it shows', async () => {
    const f = sandbox(['ncaaf.js'], cfbRoute);
    await f.fetchNCAAFScoreboard({ seasontype: 2, week: 6 });
    assert.equal(rawScoreboardKeys(f).length, 1);
    const b = sandbox(['ncaab.js'], cbbRoute);
    await b.fetchNCAABScoreboard({ dates: '20261115' });
    assert.equal(rawScoreboardKeys(b).length, 1);
});
