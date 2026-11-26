// ============================================================
// Crawlable Stories links (functions/_storyLinks.js), the client's
// hash-view → path canonical (js/navigation.js _viewPath) and the
// sitemap story-gap check (tools/sitemap-missing-stories.cjs).
// Synthetic data only. Run: node --test tests/storyLinks.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Same strip-`export` loading as edgeFallback.test.js; the one import is
// story-core.cjs, handed in as `core`.
function loadStoryLinks() {
    const src = fs.readFileSync(path.join(ROOT, 'functions', '_storyLinks.js'), 'utf8')
        .replace(/^import core from .*$/m, '')
        .replace(/^export /gm, '');
    const ctx = { URL, core: require(path.join(ROOT, 'tools', 'stories', 'story-core.cjs')) };
    vm.createContext(ctx);
    vm.runInContext(`${src}\n;globalThis.__out = { readStories, isPublished, readAllStories, storiesForTeam, siblingStories, storyListHtml, RETIRED_STORIES, retiredStoryTarget };`, ctx);
    return ctx.__out;
}
const L = loadStoryLinks();
const plain = v => JSON.parse(JSON.stringify(v));

const S = (slug, date, teams) => ({ slug, date, teams, title: `T ${slug}`, dek: 'd', url: `/nfl/stories/${slug}` });
const NFL = [S('c', '2026-10-27', ['TB', 'MIN']), S('b', '2026-10-13', ['TEN']), S('a', '2026-09-30', ['JAX', 'MIN'])];

function assetsEnv(files) {
    return { ASSETS: { fetch: async u => {
        const body = files[new URL(u).pathname];
        return body == null ? { ok: false } : { ok: true, json: async () => JSON.parse(body) };
    } } };
}

test('readStories tags each story with its sport and fails open', async () => {
    const env = assetsEnv({ '/content/nfl/stories/index.json': JSON.stringify({ stories: NFL }) });
    const got = plain(await L.readStories(env, 'https://sportstrata.cc/', 'nfl'));
    assert.deepEqual(got.map(s => [s.slug, s.sport]), [['c', 'nfl'], ['b', 'nfl'], ['a', 'nfl']]);
    assert.deepEqual(plain(await L.readStories(env, 'https://sportstrata.cc/', 'mlb')), []);
    assert.deepEqual(plain(await L.readStories(env, 'https://sportstrata.cc/', 'wnba')), [], 'not a story sport');
    const broken = { ASSETS: { fetch: async () => { throw new Error('down'); } } };
    assert.deepEqual(plain(await L.readStories(broken, 'https://sportstrata.cc/', 'nfl')), []);
});

test('readAllStories merges every sport newest first', async () => {
    const env = assetsEnv({
        '/content/nfl/stories/index.json': JSON.stringify({ stories: NFL }),
        '/content/mlb/stories/index.json': JSON.stringify({ stories: [S('m', '2026-10-20', ['CLE'])] }),
    });
    const got = plain(await L.readAllStories(env, 'https://sportstrata.cc/'));
    assert.deepEqual(got.map(s => s.slug), ['c', 'm', 'b', 'a']);
});

test('storiesForTeam lists only stories whose subject (first team) is that team', () => {
    assert.deepEqual(plain(L.storiesForTeam(NFL, 'tb')).map(s => s.slug), ['c']);
    assert.deepEqual(plain(L.storiesForTeam(NFL, 'jax')).map(s => s.slug), ['a']);
    assert.deepEqual(plain(L.storiesForTeam(NFL, 'min')), [], 'MIN is only ever the opponent here');
    assert.deepEqual(plain(L.storiesForTeam(NFL, '')), []);
});

// The team-page rail (js/news.js storiesAboutTeam) must apply the same rule as
// the edge snapshot, or the crawlable page and the app list different stories.
function loadNewsHelper() {
    const ctx = { window: {}, fetch: () => Promise.resolve({ ok: false }) };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'news.js'), 'utf8') + '\n;globalThis.__f = storiesAboutTeam;', ctx);
    return ctx.__f;
}

test('team-page rail: subject team only, same answer as the edge for every team', () => {
    const about = loadNewsHelper();
    for (const t of ['TB', 'MIN', 'JAX', 'TEN', 'jax', '']) {
        assert.deepEqual(plain(about(NFL, t)).map(s => s.slug), plain(L.storiesForTeam(NFL, t)).map(s => s.slug), t);
    }
    const nba = [S('x', '2026-11-01', ['SAS', 'SAC'])];
    const norm = t => ({ SAS: 'SA' }[String(t).toUpperCase()] || String(t).toUpperCase());
    assert.deepEqual(plain(about(nba, 'SA', norm)).map(s => s.slug), ['x']);
    assert.deepEqual(plain(about(nba, 'SAC', norm)), []);
});

test('planted fault: the old any-named-team rule fails the subject test', () => {
    const anyTeam = (stories, abbr) => stories.filter(s => (s.teams || []).includes(abbr));
    assert.notDeepEqual(anyTeam(NFL, 'MIN').map(s => s.slug), []);
});

test('siblingStories excludes itself and ranks shared-team stories first', () => {
    assert.deepEqual(plain(L.siblingStories(NFL, 'c')).map(s => s.slug), ['a', 'b']);
    assert.deepEqual(plain(L.siblingStories(NFL, 'b', 1)).map(s => s.slug), ['c']);
});

test('storyListHtml escapes, links, and tags mixed-sport lists', () => {
    assert.equal(L.storyListHtml([], 'X'), '');
    const evil = [{ ...S('e', '2026-10-01', []), title: '<b>&"', sport: 'nfl' }];
    const mixed = L.storyListHtml(evil, 'Latest');
    assert.match(mixed, /<li>NFL: <a href="\/nfl\/stories\/e">&lt;b&gt;&amp;&quot;<\/a>/);
    assert.doesNotMatch(mixed, /All .* stories/);
    const one = L.storyListHtml(evil, 'Latest', { sport: 'nfl' });
    assert.match(one, /<li><a href/);
    assert.match(one, /<a href="\/nfl\/stories">All NFL stories<\/a>/);
    assert.doesNotMatch(L.storyListHtml(evil, 'More', { sport: 'nfl', more: false }), /All NFL stories/);
});

function loadViewPath(extra = '') {
    const nav = fs.readFileSync(path.join(ROOT, 'js', 'navigation.js'), 'utf8');
    const set = nav.match(/^const _PATH_SINGLE_VIEWS = [\s\S]*?\]\);/m)[0];
    const gameRe = nav.match(/^const _NFL_GAME_VIEW_RE = .*$/m)[0];
    const fn = nav.match(/^function _viewPath\([\s\S]*?^}/m)[0];
    const ctx = { URL, Response };
    vm.createContext(ctx);
    vm.runInContext(`${extra}\n${set}\n${gameRe}\n${fn}\n;globalThis.__v = _viewPath;`, ctx);
    return ctx;
}

test('hash views map to the path URL their edge template serves', () => {
    const ctx = loadViewPath();
    const cases = {
        home: '/', 'nfl-home': '/nfl', 'nba-standings': '/nba/standings', 'nfl-pickem': '/nfl/pickem',
        'nfl-team-JAX': '/nfl/team/jax', 'nfl-player-4046': '/nfl/player/4046', 'ncaaf-game-401864494': '/ncaaf/game/401864494',
        'mlb-live-776543': '/mlb/game/776543', 'mlb-player-592450': '/mlb/player/592450', 'wnba-player-12': '/wnba/player/12',
        'nba-team-SA': '/nba/team/sa', 'nba-team-UTAH': '/nba/team/utah',
        'mlb-builder': null, 'nfl-mock': null, 'mlb-team-147': null,
    };
    for (const [view, want] of Object.entries(cases)) assert.equal(ctx.__v(view), want, view);
});

test('NFL Stats tab and sort variants canonicalize to /nfl/leaders', () => {
    const ctx = loadViewPath();
    for (const view of ['nfl-leaders', 'nfl-leaders-receiving', 'nfl-leaders-defense~defensive.sacks-desc', 'nfl-leaders~passing.interceptions-asc']) {
        assert.equal(ctx.__v(view), '/nfl/leaders', view);
    }
});

test('every mapped path round-trips through the edge fail-safe route table', () => {
    const shellSrc = fs.readFileSync(path.join(ROOT, 'functions', '_shell.js'), 'utf8').replace(/^export /gm, '');
    const ctx = loadViewPath(`${shellSrc}\n;globalThis.__r = failSafeRoute;`);
    for (const view of ['nfl-home', 'mlb-leaders', 'ncaab-standings', 'nfl-team-JAX', 'ncaaf-team-333', 'mlb-live-1', 'nba-player-9', 'nba-team-UTAH']) {
        assert.equal(ctx.__r(ctx.__v(view)), view, view);
    }
});

test('sitemap gap check lists only story URLs the sitemap lacks', () => {
    const { missingStoryUrls } = require(path.join(ROOT, 'tools', 'sitemap-missing-stories.cjs'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-sitemap-'));
    fs.mkdirSync(path.join(dir, 'content', 'nfl', 'stories'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'content', 'nfl', 'stories', 'index.json'), JSON.stringify({ stories: NFL }));
    fs.writeFileSync(path.join(dir, 'sitemap.xml'), '<urlset><url><loc>https://sportstrata.cc/nfl/stories/a</loc></url></urlset>');
    assert.deepEqual(missingStoryUrls(dir), ['/nfl/stories/c', '/nfl/stories/b']);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('an unpublished story is not served: a slug missing from the index is not published', () => {
    const index = [S('2026-11-09-a', '2026-11-09', ['DEN']), S('2026-11-10-b', '2026-11-10', ['MIN'])];
    assert.equal(L.isPublished(index, '2026-11-09-a'), true);
    assert.equal(L.isPublished(index, '2026-11-10-deleted'), false);
    // An index that could not be read must not take every story down with it.
    assert.equal(L.isPublished([], '2026-11-10-deleted'), true);
});

test('a retired story 301s to the page with the corrected numbers, and is never also published', () => {
    assert.equal(L.retiredStoryTarget('nfl', '2026-11-10-vikings-6-2-fewest-points-scored'), '/nfl/team/min/minnesota-vikings');
    assert.equal(L.retiredStoryTarget('nfl', '2026-11-09-a'), null);
    assert.equal(L.retiredStoryTarget('mlb', '2026-11-10-vikings-6-2-fewest-points-scored'), null);
    assert.equal(L.retiredStoryTarget('nfl', 'constructor'), null);
    for (const [sport, slugs] of Object.entries(L.RETIRED_STORIES)) {
        const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', sport, 'stories', 'index.json'), 'utf8')).stories;
        for (const [slug, target] of Object.entries(slugs)) {
            assert.ok(!index.some(s => s.slug === slug), `${slug} is retired but still published`);
            assert.match(target, /^\/[a-z]/, `${slug} target must be a site path`);
        }
    }
});
