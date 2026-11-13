// ============================================================
// Route crawl (tools/audit/route-crawl.cjs): the judging half.
// Every case here is a planted fault the crawl must report, or a
// correct landing it must not.
// Run: node --test tests/routeCrawl.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { judge, summarize, teamUrls, nbaTeamUrls, judgeTeamPage, judgeAlias, crawlHttp } = require('../tools/audit/route-crawl.cjs');

const at = (view, hash = '#' + view, path = '/') => ({ view, hash, path });

test('a game card that opens its game is not a finding', () => {
    assert.equal(judge({ surface: 'home All tab', sport: 'ncaaf', kind: 'game', id: '401864494', landed: at('ncaaf-game-401864494') }), null);
    assert.equal(judge({ surface: 'ticker', sport: 'mlb', kind: 'game', id: '849849', landed: at('mlb-live-849849') }), null);
    assert.equal(judge({ surface: 'ticker', sport: 'nfl', kind: 'game', id: '401772510', landed: at('nfl-game-401772510-boxscore') }), null);
});

test('planted fault: an NCAAF card that opens the scores list is a mis-route', () => {
    const f = judge({ surface: 'home NCAAF tab', sport: 'ncaaf', kind: 'game', id: '401864494', landed: at('ncaaf-scores') });
    assert.equal(f.kind, 'misroute');
    assert.match(f.detail, /expected the ncaaf game view for 401864494, landed on ncaaf-scores/);
});

test('planted fault: a card that opens another game, another sport, or home is a mis-route', () => {
    assert.ok(judge({ sport: 'nba', kind: 'game', id: '401909958', landed: at('nba-game-401909877') }));
    assert.ok(judge({ sport: 'ncaab', kind: 'game', id: '401800001', landed: at('ncaaf-game-401800001') }));
    assert.ok(judge({ sport: 'nfl', kind: 'game', id: '401772510', landed: at('home', '', '/') }));
});

test('a team link must land on the team view of its own sport', () => {
    assert.equal(judge({ sport: 'nba', kind: 'team', id: 'SA', landed: at('nba-team-SA') }), null);
    assert.equal(judge({ sport: 'mlb', kind: 'team', id: '145', landed: at('mlb-teams', '#mlb-team-145') }), null);
    assert.equal(judge({ sport: 'nba', kind: 'team', id: 'NY', landed: at('nba-team-NY', '', '/nba/team/ny/new-york-knicks') }), null);
    assert.ok(judge({ sport: 'nba', kind: 'team', id: 'SA', landed: at('nba-teams') }));
    assert.ok(judge({ sport: 'nfl', kind: 'team', id: 'KC', landed: at('nfl-team-BUF') }));
});

test('a link that vanished before the click is not judged', () => {
    assert.equal(judge({ sport: 'nba', kind: 'game', id: '1', vanished: true }), null);
});

test('summarize counts per surface, lists what was not exercised, and reports the plant', () => {
    const clicks = [
        { surface: 'home All tab', sport: 'ncaaf', kind: 'game', id: '1', landed: at('ncaaf-game-1') },
        { surface: 'home All tab', sport: 'ncaaf', kind: 'game', id: '2', landed: at('ncaaf-scores') },
        { plant: true, surface: 'plant', sport: 'ncaaf', kind: 'game', id: 'PLANT000', landed: at('ncaaf-scores') },
    ];
    const cells = [{ surface: 'home All tab', sport: 'ncaaf', found: 2 }, { surface: 'home All tab', sport: 'mlb', found: 0 }];
    const s = summarize(clicks, cells);
    assert.equal(s.clicks, 2);
    assert.equal(s.misroutes, 1);
    assert.deepEqual(s.table[0], { surface: 'home All tab', sport: 'ncaaf', found: 2, clicked: 2, misrouted: 1 });
    assert.deepEqual(s.notExercised, ['home All tab / mlb: nothing on screen to click']);
    assert.equal(s.plant.caught, true);
});

test('a plant that lands on the game view means the control is broken', () => {
    const s = summarize([{ plant: true, surface: 'plant', sport: 'ncaaf', kind: 'game', id: 'PLANT000', landed: at('ncaaf-game-PLANT000') }], []);
    assert.equal(s.plant.caught, false);
    assert.equal(summarize([], []).plant.caught, false);
});

const SITEMAP = `<urlset>
<url><loc>https://sportstrata.cc/nba/team/sa/san-antonio-spurs</loc></url>
<url><loc>https://sportstrata.cc/mlb/team/cws</loc></url>
<url><loc>https://sportstrata.cc/nba/player/3136195/karl-anthony-towns</loc></url>
</urlset>`;

test('teamUrls reads team pages, and only team pages, from a sitemap', () => {
    assert.deepEqual(teamUrls(SITEMAP), [
        { url: 'https://sportstrata.cc/nba/team/sa/san-antonio-spurs', sport: 'nba', id: 'sa' },
        { url: 'https://sportstrata.cc/mlb/team/cws', sport: 'mlb', id: 'cws' },
    ]);
});

test('nbaTeamUrls reads all 30 teams from the edge template table', () => {
    const urls = nbaTeamUrls('https://x.test');
    assert.equal(urls.length, 30);
    assert.ok(urls.some(u => u.url === 'https://x.test/nba/team/utah'));
});

test('planted fault: a team page that 404s or hydrates the wrong view', () => {
    const t = { url: 'https://x.test/nba/team/ny', sport: 'nba', id: 'ny' };
    assert.equal(judgeTeamPage(t, { status: 200, body: '<script>window.__SS_ROUTE = "nba-team-NY";</script>' }), null);
    assert.equal(judgeTeamPage(t, { status: 404, body: '' }).kind, 'bad-status');
    assert.equal(judgeTeamPage(t, { status: 200, body: '<script>window.__SS_ROUTE = "nba-home";</script>' }).kind, 'misroute');
    assert.equal(judgeTeamPage(t, { status: 200, body: '<html></html>' }).kind, 'misroute');
});

test('planted fault: a long-form NBA abbreviation that does not redirect to the ESPN form', () => {
    assert.equal(judgeAlias('https://x.test', 'sas', 'sa', { status: 301, location: 'https://x.test/nba/team/sa/san-antonio-spurs' }), null);
    assert.equal(judgeAlias('https://x.test', 'sas', 'sa', { status: 200, location: '' }).kind, 'bad-redirect');
    assert.equal(judgeAlias('https://x.test', 'sas', 'sa', { status: 301, location: 'https://x.test/nba/team/sac/sacramento-kings' }).kind, 'bad-redirect');
});

test('crawlHttp checks NBA teams the sitemap has not listed yet, and says so', async () => {
    const seen = [];
    const fetcher = async url => {
        seen.push(url);
        if (url.endsWith('/sitemap.xml')) return { status: 200, body: SITEMAP.replace(/sportstrata\.cc/g, 'x.test') };
        if (/\/nba\/team\/(sas|gsw|nyk|nop|uta|was)$/.test(url)) return { status: 404, location: '' };
        const m = /\/(mlb|nba)\/team\/([a-z]+)/.exec(url);
        return { status: 200, body: `<script>window.__SS_ROUTE = '${m[1]}-team-${m[2].toUpperCase()}';</script>` };
    };
    const nba = [{ url: 'https://x.test/nba/team/sa', sport: 'nba', id: 'sa' }, { url: 'https://x.test/nba/team/ny', sport: 'nba', id: 'ny' }];
    const r = await crawlHttp('https://x.test', fetcher, nba);
    assert.equal(r.teamPages, 3);
    assert.ok(seen.includes('https://x.test/nba/team/ny'));
    assert.deepEqual(r.notes, ['sitemap.xml lists 1 of 2 NBA team pages (checked all 2 directly)']);
    assert.equal(r.findings.length, 6);
    assert.ok(r.findings.every(f => f.kind === 'bad-redirect'));
});
