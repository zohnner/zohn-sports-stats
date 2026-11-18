// ============================================================
// The home nav set, the sport switch that keeps your section, and the
// all-sports /stories hub (functions/_stories.js). Synthetic data only.
// Run: node --test tests/homeNavStoriesHub.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const nav = read('js/navigation.js');
const SPORT_RE = /^(mlb|nfl|ncaaf|ncaab|wnba|nba|nhl)-|^\/(mlb|nfl|ncaaf|ncaab|wnba|nba)(\/|$)/;

function navTables() {
    const grab = name => nav.match(new RegExp(`^const ${name} = \\{[\\s\\S]*?^\\};`, 'm'))[0];
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(`${grab('SUB_NAV_TABS')}\n${grab('MENU_TABS')}\n${grab('BOTTOM_NAV_TABS')}
        ;globalThis.__t = { SUB_NAV_TABS, MENU_TABS, BOTTOM_NAV_TABS };`, ctx);
    return JSON.parse(JSON.stringify(ctx.__t));
}
const T = navTables();

test('planted fault: nothing in the home nav is scoped to one sport', () => {
    for (const [name, table] of Object.entries(T)) {
        assert.ok(Array.isArray(table.home) && table.home.length, `${name}.home exists`);
        for (const item of table.home) {
            const dest = item.v || item.href || '';
            assert.doesNotMatch(dest, SPORT_RE, `${name}.home → ${dest}`);
        }
    }
    assert.ok(T.SUB_NAV_TABS.home.some(t => t.href === '/stories'), 'home Stories is the all-sports hub');
});

test('home renders the home set, and the search prompt names no sport', () => {
    const home = nav.match(/if \(sport === 'home'\) \{[\s\S]*?return;\s*\}/)[0];
    for (const fn of ['_renderSubNav', '_renderBottomNav', '_renderMenuPanel']) assert.match(home, new RegExp(`${fn}\\('home'\\)`));
    const ph = nav.match(/^function _applySportSearchPlaceholder\([\s\S]*?^}/m)[0];
    assert.match(ph, /'Search players, teams, stats…'/);
    assert.doesNotMatch(ph, /SPORTS\.find/);
});

test('every bottom bar has five slots, the mobile grid width', () => {
    for (const [sport, tabs] of Object.entries(T.BOTTOM_NAV_TABS)) assert.equal(tabs.length, 5, sport);
});

function switchFns() {
    const fn = name => nav.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm'))[0];
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(`${nav.match(/^const SUB_NAV_TABS = \{[\s\S]*?^\};/m)[0]}
        ${nav.match(/^const _SPORT_SCORES_VIEW = \{[\s\S]*?^\};/m)[0]}
        const SPORTS_META = Object.fromEntries(['mlb','nfl','ncaaf','ncaab','wnba','nba'].map(s => [s, { defaultView: s + '-home' }]));
        ${fn('_viewSection')}\n${fn('_switchTarget')}\n${fn('_switchStoriesHref')}
        ;globalThis.__f = { _switchTarget, _switchStoriesHref };`, ctx);
    return ctx.__f;
}
const F = switchFns();

test('a sport switch keeps the section when the new sport has it', () => {
    assert.equal(F._switchTarget('nfl', 'mlb-standings'), 'nfl-standings');
    assert.equal(F._switchTarget('nba', 'nfl-teams'), 'nba-teams');
    assert.equal(F._switchTarget('nfl', 'ncaaf-leaders'), 'nfl-leaders');
    assert.equal(F._switchTarget('nfl', 'nba-scores'), 'nfl-games');
    assert.equal(F._switchTarget('ncaaf', 'mlb-games'), 'ncaaf-scores');
    assert.equal(F._switchTarget('nfl', 'ncaab-powerrankings'), 'nfl-powerrankings');
    assert.equal(F._switchTarget('wnba', 'news'), 'news');
});

test('a sport switch falls back to the landing page when there is no equivalent', () => {
    assert.equal(F._switchTarget('nfl', 'mlb-players'), 'nfl-home');
    assert.equal(F._switchTarget('mlb', 'ncaaf-rankings'), 'mlb-home');
    assert.equal(F._switchTarget('nfl', 'mlb-player-660271'), 'nfl-home');
    assert.equal(F._switchTarget('nba', 'nfl-game-401772'), 'nba-home');
    assert.equal(F._switchTarget('nfl', 'home'), 'nfl-home');
    assert.equal(F._switchTarget('nfl', 'mlb-home'), 'nfl-home');
});

test('on a stories page the switcher goes to the new sport\'s stories', () => {
    assert.equal(F._switchStoriesHref('nfl', '/mlb/stories', 'static-page'), '/nfl/stories');
    assert.equal(F._switchStoriesHref('nfl', '/mlb/stories/2026-10-01-some-story', 'static-page'), '/nfl/stories');
    assert.equal(F._switchStoriesHref('nba', '/stories', 'static-page'), '/nba/stories');
    assert.equal(F._switchStoriesHref('wnba', '/mlb/stories', 'static-page'), null, 'WNBA has no stories link');
    assert.equal(F._switchStoriesHref('nfl', '/about', 'static-page'), null);
    assert.equal(F._switchStoriesHref('nfl', '/mlb/stories', 'nfl-home'), null, 'only while the stories page is what is on screen');
});

test('switchSport itself still lands on the landing page for code that calls it', () => {
    const src = nav.match(/^function switchSport\([\s\S]*?^}/m)[0];
    assert.match(src, /navigateTo\(view \|\| cfg\.defaultView, push\)/);
    assert.doesNotMatch(src, /location\.assign/);
});

// ── /stories hub ─────────────────────────────────────────────
const SHELL = '<html><head><title>x</title><link id="canonicalLink" rel="canonical" href="https://sportstrata.cc/"></head><body><div id="playersGrid" class="players-grid"></div></body></html>';
const entry = (sport, slug, date, extra) => ({ slug, date, title: `${sport} ${slug}`, dek: 'dek', teams: [], season: 2026, url: `/${sport}/stories/${slug}`, ...extra });
const INDEX = {
    nfl: [entry('nfl', '2026-11-16-b-story', '2026-11-16', { week: 10 }), entry('nfl', '2026-11-02-a-story', '2026-11-02', { week: 8 })],
    mlb: [entry('mlb', '2026-11-09-c-story', '2026-11-09')],
};
const STORY_MD = `---
title: A test story
dek: A test dek.
date: 2026-11-16
season: 2026
week: 10
teams: [MIN]
players: []
hero_stat: a stat
---

Body text.
`;

function loadStories() {
    const strip = f => read(f).replace(/^import .*$/gm, '').replace(/^export /gm, '');
    const ctx = {
        URL, URLSearchParams, Response, Date,
        core: require(path.join(ROOT, 'tools', 'stories', 'story-core.cjs')),
        shell: async () => new Response(SHELL), rawShell: async () => new Response(SHELL),
    };
    vm.createContext(ctx);
    vm.runInContext(strip('functions/_storyLinks.js'), ctx);
    vm.runInContext(`${strip('functions/_stories.js')}\n;globalThis.__out = { renderStoriesHub, renderStoriesIndex, renderStoryPage };`, ctx);
    return ctx.__out;
}
const R = loadStories();
const env = { ASSETS: { fetch: async (u) => {
    const p = new URL(u).pathname;
    const m = /^\/content\/([a-z]+)\/stories\/index\.json$/.exec(p);
    if (m && INDEX[m[1]]) return new Response(JSON.stringify({ stories: INDEX[m[1]] }));
    if (p === '/content/nfl/stories/2026-11-16-b-story.md') return new Response(STORY_MD);
    return new Response('', { status: 404 });
} } };
const ctxFor = (p, params) => ({ request: new Request(`https://sportstrata.cc${p}`), env, params: params || {} });

test('/stories lists every sport newest first, each row tagged with its sport', async () => {
    const html = await (await R.renderStoriesHub(ctxFor('/stories'))).text();
    const order = [...html.matchAll(/<li><a href="(\/[a-z]+\/stories\/[a-z0-9-]+)"/g)].map(m => m[1]);
    assert.deepEqual(order, ['/nfl/stories/2026-11-16-b-story', '/mlb/stories/2026-11-09-c-story', '/nfl/stories/2026-11-02-a-story']);
    assert.match(html, /NFL Week 10/);
    assert.match(html, /MLB · 2026 Season/);
    assert.match(html, /rel="canonical" href="https:\/\/sportstrata\.cc\/stories"/);
    assert.match(html, /window\.__SS_ROUTE="static-page-home"/);
});

test('the sport row marks the current page and links only sports that have stories', async () => {
    const hub = await (await R.renderStoriesHub(ctxFor('/stories'))).text();
    const row = hub.match(/<nav class="ss-stories__sports"[\s\S]*?<\/nav>/)[0];
    assert.match(row, /<strong aria-current="page">All<\/strong>/);
    assert.match(row, /<a href="\/nfl\/stories">NFL<\/a>/);
    assert.match(row, /<a href="\/mlb\/stories">MLB<\/a>/);
    assert.doesNotMatch(row, /\/nba\/stories|\/ncaaf\/stories/);

    const nfl = await (await R.renderStoriesIndex(ctxFor('/nfl/stories'), 'nfl')).text();
    const nflRow = nfl.match(/<nav class="ss-stories__sports"[\s\S]*?<\/nav>/)[0];
    assert.match(nflRow, /<a href="\/stories">All<\/a>/);
    assert.match(nflRow, /<strong aria-current="page">NFL<\/strong>/);
    assert.match(nflRow, /<a href="\/mlb\/stories">MLB<\/a>/);
});

test('a story page links sideways to every sport with stories and to the hub', async () => {
    const html = await (await R.renderStoryPage(ctxFor('/nfl/stories/2026-11-16-b-story', { slug: '2026-11-16-b-story' }), 'nfl')).text();
    const more = html.match(/<p class="ss-story__more">[\s\S]*?<\/p>/)[0];
    assert.match(more, /<a href="\/nfl\/stories">NFL<\/a>/);
    assert.match(more, /<a href="\/mlb\/stories">MLB<\/a>/);
    assert.match(more, /<a href="\/stories">All stories<\/a>/);
});

test('/stories is routed to Functions and listed in the sitemap generator', () => {
    assert.ok(JSON.parse(read('_routes.json')).include.includes('/stories'));
    assert.match(read('tools/gen-sitemap.cjs'), /urlTag\('\/stories'/);
    assert.match(read('functions/stories/index.js'), /renderStoriesHub/);
});
