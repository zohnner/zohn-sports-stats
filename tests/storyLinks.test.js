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
    vm.runInContext(`${src}\n;globalThis.__out = { readStories, readAllStories, storiesForTeam, siblingStories, storyListHtml };`, ctx);
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

test('storiesForTeam matches any named team, case-insensitively', () => {
    assert.deepEqual(plain(L.storiesForTeam(NFL, 'min')).map(s => s.slug), ['c', 'a']);
    assert.deepEqual(plain(L.storiesForTeam(NFL, '')), []);
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
    const fn = nav.match(/^function _viewPath\([\s\S]*?^}/m)[0];
    const ctx = { URL, Response };
    vm.createContext(ctx);
    vm.runInContext(`${extra}\n${set}\n${fn}\n;globalThis.__v = _viewPath;`, ctx);
    return ctx;
}

test('hash views map to the path URL their edge template serves', () => {
    const ctx = loadViewPath();
    const cases = {
        home: '/', 'nfl-home': '/nfl', 'nba-standings': '/nba/standings', 'nfl-pickem': '/nfl/pickem',
        'nfl-team-JAX': '/nfl/team/jax', 'nfl-player-4046': '/nfl/player/4046', 'ncaaf-game-401864494': '/ncaaf/game/401864494',
        'mlb-live-776543': '/mlb/game/776543', 'mlb-player-592450': '/mlb/player/592450', 'wnba-player-12': '/wnba/player/12',
        'mlb-builder': null, 'nfl-mock': null, 'mlb-team-147': null,
    };
    for (const [view, want] of Object.entries(cases)) assert.equal(ctx.__v(view), want, view);
});

test('every mapped path round-trips through the edge fail-safe route table', () => {
    const shellSrc = fs.readFileSync(path.join(ROOT, 'functions', '_shell.js'), 'utf8').replace(/^export /gm, '');
    const ctx = loadViewPath(`${shellSrc}\n;globalThis.__r = failSafeRoute;`);
    for (const view of ['nfl-home', 'mlb-leaders', 'ncaab-standings', 'nfl-team-JAX', 'ncaaf-team-333', 'mlb-live-1', 'nba-player-9']) {
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
