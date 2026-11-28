// ============================================================
// Layout shift guards (measured on production, throttled phone, 2026-11-25).
// - main is at least a screen tall, so the footer starts below the fold: views
//   swap the edge snapshot for a shorter skeleton and then real content, and a
//   footer inside the first screen jumped up and back (NBA standings CLS 0.52,
//   MLB team 1.01, NCAAF standings 0.47, NFL team 0.27 → each ≤ 0.08).
// - #searchBar starts hidden, so a snapshot doesn't paint under a 152px bar
//   the first view removes.
// - 'Inter Fallback' is Arial sized to Inter, so fallback text wraps the same
//   way and doesn't reflow when Inter swaps in.
// - The home Stories zone starts with a placeholder of about its height.
// Run: node --test tests/layoutShift.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ruleBody = (css, sel) => (css.match(new RegExp(`^${sel.replace(/[.#]/g, '\\$&')} \\{([^}]*)\\}`, 'm')) || [])[1] || '';

test('main is at least one screen tall, and print drops that', () => {
    const css = read('css/main.css');
    assert.match(ruleBody(css, 'main'), /min-height:\s*100vh/);
    assert.match(css, /main \{ padding: 0 !important; margin: 0 !important; min-height: 0 !important; \}/);
});

test('the search bar starts hidden in the shell every edge page is built from', () => {
    assert.match(read('index.html'), /<div class="search-container" id="searchBar" style="display:none">/);
});

test('Inter falls back to a metric-matched Arial before any system font', () => {
    const css = read('css/variables.css');
    assert.match(css, /--font-sans:\s*'Inter', 'Inter Fallback', /);
    const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map(m => m[1]).filter(f => /'Inter Fallback'/.test(f));
    assert.equal(faces.length, 3, 'one face per weight band');
    for (const f of faces) {
        assert.match(f, /src: local\('Arial/);
        assert.match(f, /size-adjust: [\d.]+%/);
        assert.match(f, /ascent-override: [\d.]+%; descent-override: [\d.]+%; line-gap-override: 0%/);
    }
    const weights = faces.map(f => f.match(/font-weight: ([\d ]+);/)[1]);
    assert.deepEqual(weights, ['100 500', '600', '700 900']);
});

test('the home Stories zone is rendered with a sized placeholder', () => {
    assert.match(read('js/app.js'), /id="homeStories"><section class="stories-block home-stories__skel" aria-busy="true">/);
    const css = read('css/main.css');
    assert.match(css, /^\.home-stories__skel \{ min-height: \d+px; \}/m);
    assert.match(css, /@media \(max-width: 768px\) \{ \.home-stories__skel \{ min-height: \d+px; \} \}/);
});

// _renderHomeStories, run with a fake host and stubbed story fetches.
function renderStories(fetchAllStories) {
    const src = read('js/app.js').match(/^async function _renderHomeStories\(\) \{[\s\S]*?^\}/m)[0];
    const host = { isConnected: true, innerHTML: 'PLACEHOLDER' };
    const ctx = {
        document: { getElementById: id => (id === 'homeStories' ? host : null) },
        AppState: { _homeHeroStory: '/lead' },
        storiesBlockHtml: (s, h) => (s.length ? `${h}:${s.map(x => x.url).join(',')}` : ''),
        fetchAllStories,
    };
    vm.createContext(ctx);
    vm.runInContext(`${src}\nglobalThis.run = _renderHomeStories;`, ctx);
    return ctx.run().then(() => host.innerHTML);
}

test('stories replace the placeholder, leaving out the hero story', async () => {
    const html = await renderStories(async () => [{ url: '/lead' }, { url: '/a' }, { url: '/b' }]);
    assert.equal(html, 'Latest SportStrata Stories:/a,/b');
});

test('the home hero starts as a sized placeholder, taller on phones', () => {
    assert.match(read('js/app.js'), /<div class="home-hero home-hero--skel" id="homeHero" aria-busy="true"><\/div>/);
    const css = read('css/main.css');
    assert.match(css, /^\.home-hero--skel \{ min-height: \d+px;/m);
    assert.match(css, /@media \(max-width: 560px\) \{ \.home-hero--skel \{ min-height: \d+px; \} \}/);
});

// _renderHomeHero with _pickHomeHero stubbed.
function renderHero(pick) {
    const src = read('js/app.js').match(/^async function _renderHomeHero\(games\) \{[\s\S]*?^\}/m)[0];
    const attrs = { 'aria-busy': 'true' };
    const host = {
        hidden: false, className: 'home-hero home-hero--skel', innerHTML: '',
        removeAttribute: k => { delete attrs[k]; }, setAttribute: (k, v) => { attrs[k] = v; },
    };
    const ctx = { document: { getElementById: () => host }, Logger: { warn() {} }, _pickHomeHero: pick };
    vm.createContext(ctx);
    vm.runInContext(`${src}\nglobalThis.run = _renderHomeHero;`, ctx);
    return ctx.run().then(() => ({ host, attrs }));
}

test('a chosen hero replaces the placeholder', async () => {
    const { host, attrs } = await renderHero(async () => ({ kind: 'live', html: '<b>game</b>', onClick() {} }));
    assert.equal(host.className, 'home-hero home-hero--live');
    assert.equal(host.innerHTML, '<b>game</b>');
    assert.equal(host.hidden, false);
    assert.equal(attrs['aria-busy'], undefined);
});

test('no hero, or a failure choosing one, hides the placeholder instead of leaving an empty box', async () => {
    for (const pick of [async () => null, async () => { throw new Error('scoreboard down'); }]) {
        const { host, attrs } = await renderHero(pick);
        assert.equal(host.hidden, true);
        assert.equal(host.className, 'home-hero');
        assert.equal(attrs['aria-busy'], undefined);
    }
});

// _loadHomeTodayGames on the All tab with an empty MLB schedule (offseason).
function loadToday(appState, opts) {
    const app = read('js/app.js');
    const fn = name => app.match(new RegExp(`^(async )?function ${name}\\([\\s\\S]*?^\\}`, 'm'))[0];
    const grid = { isConnected: true, innerHTML: 'SKELETON', parentNode: { querySelectorAll: () => [] } };
    const ctx = {
        AppState: { _homeSportTab: 'all', ...appState },
        document: { getElementById: () => grid, querySelectorAll: () => [] },
        fetchMLBSchedule: async () => [],
        _homeSportTabCfg: () => ({ normalize: g => g }),
        Scorebug: { renderScoreCard: m => `<card ${m.id}>` },
        _escHtml: s => String(s), Logger: { warn() {}, info() {} },
    };
    vm.createContext(ctx);
    vm.runInContext(`${fn('_homeLoadedGames')}\n${fn('_loadHomeTodayGames')}\nglobalThis.run = _loadHomeTodayGames;`, ctx);
    return ctx.run(opts).then(() => grid.innerHTML);
}

test('Today keeps its skeleton while other sports are still loading, instead of saying no games', async () => {
    assert.equal(await loadToday({}), 'SKELETON');
});

test('Today says no games once the ticker has settled every sport', async () => {
    assert.match(await loadToday({}, { guestsSettled: true }), /No games scheduled today/);
    const empty = { nflGames: [], ncaafGames: [], ncaabGames: [], nbaGames: [], wnbaGames: [] };
    assert.match(await loadToday(empty), /No games scheduled today/);
});

test('the home ticker re-renders Today with the settled flag', () => {
    assert.match(read('js/app.js'), /_loadHomeTodayGames\(\{ guestsSettled: true \}\)/);
});

test('with no stories, or a failed fetch, the zone empties so :empty hides it', async () => {
    assert.equal(await renderStories(async () => []), '');
    assert.equal(await renderStories(async () => { throw new Error('offline'); }), '');
});
