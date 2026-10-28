// ============================================================
// Trust surfaces (D-189): the About & Methodology page must describe the
// models the code actually runs, the sitewide footer must link it, and the
// shared freshness receipt must format ages the Game Center way.
// Run: node --test tests/trustSurfaces.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const about = read('functions/about.js');

test('About page playoff-odds numbers match js/odds.js', () => {
    const odds = read('js/odds.js');
    const sims = Number(odds.match(/const _ODDS_SIMS = (\d+)/)[1]);
    const exp = odds.match(/const e = ([\d.]+);/)[1];
    const wc = odds.match(/const _ODDS_WC_PER_LEAGUE = (\d+)/)[1];
    assert.match(about, new RegExp(`played out ${sims.toLocaleString('en-US')} times`));
    assert.match(about, new RegExp(`exponent ${exp.replace('.', '\\.')}`));
    assert.match(about, new RegExp(`${wc} wild cards per league`));
    assert.match(odds, /pythag \* 0\.7 \+ 0\.5 \* 0\.3/, 'about.js says "regressed 30%"');
    assert.match(about, /regressed 30% toward \.500/);
    assert.match(odds, /p \+ 0\.035/); assert.match(about, /plus 3\.5 points for the home team/);
    assert.match(odds, /Math\.min\(0\.75, Math\.max\(0\.25/); assert.match(about, /between 25% and 75%/);
});

test('About page power-ranking caps and home edges match _PWR_SPORTS', () => {
    const pr = read('js/powerRankings.js');
    const cfg = {};
    for (const m of pr.matchAll(/^\s+(mlb|nfl|ncaaf|nba|wnba|ncaab):\s+\{[^}]*?marginCap: (\d+),\s+homeAdvantage: ([\d.]+),\s+recencyHalfLifeDays: (\d+)/gm)) {
        cfg[m[1]] = { cap: +m[2], hfa: +m[3], half: +m[4] };
    }
    assert.equal(Object.keys(cfg).length, 6);
    assert.deepEqual([cfg.mlb.cap, cfg.nba.cap, cfg.wnba.cap, cfg.nfl.cap, cfg.ncaab.cap, cfg.ncaaf.cap], [8, 20, 20, 24, 24, 28]);
    assert.match(about, /8 runs in MLB, 20 points in the NBA and WNBA, 24 in the NFL and college basketball, 28 in college football/);
    assert.deepEqual([cfg.nfl.hfa, cfg.ncaaf.hfa, cfg.ncaab.hfa, cfg.nba.hfa, cfg.wnba.hfa, cfg.mlb.hfa], [2.5, 2.5, 2.5, 2.5, 2, 0]);
    assert.match(about, /2\.5 points in the NFL, college football, college basketball and the NBA, 2 in the WNBA, none in MLB/);
    const halves = Object.values(cfg).map(c => c.half);
    assert.equal(Math.min(...halves), 22); assert.equal(Math.max(...halves), 50);
    assert.match(about, /halve every 22 to 50 days/);
});

test('About is routed, in the sitemap, and linked from the sitewide footer', () => {
    assert.ok(JSON.parse(read('_routes.json')).include.includes('/about'));
    assert.match(read('tools/gen-sitemap.cjs'), /urlTag\('\/about'/);
    const html = read('index.html');
    const footer = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0];
    assert.ok(html.indexOf('</main>') < html.indexOf('<footer class="site-footer">'), 'footer sits outside <main>');
    assert.match(footer, /href="\/about"/);
    assert.match(footer, /nflverse[\s\S]*CC-BY 4\.0/);
    assert.match(read('js/navigation.js'), /static-page-\(home\|/);
});

test('shared freshness receipt formats ages like the Game Center did', () => {
    const src = read('js/config.js');
    const pick = name => src.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm'))[0];
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(`${pick('_freshAgo')}\n${pick('_freshText')}\n${pick('freshnessHtml')}\n;globalThis.o = { _freshAgo, _freshText, freshnessHtml };`, ctx);
    const { _freshAgo, _freshText, freshnessHtml } = ctx.o;
    assert.equal(_freshAgo(12_400), '12s');
    assert.equal(_freshAgo(130_000), '2m 10s');
    assert.equal(_freshAgo(2 * 3600_000 + 5 * 60_000), '2h 5m');
    assert.equal(_freshAgo(-5000), '0s', 'clock skew never goes negative');
    assert.equal(_freshText(1_000, 61_000), 'Updated 1m 0s ago');
    assert.equal(_freshText(0), '');
    assert.equal(freshnessHtml(null), '');
    assert.match(freshnessHtml(1700000000000, 60000), /^<span class="ss-fresh" data-fresh-ts="1700000000000" data-fresh-stale="60000">Updated /);
});
