// ============================================================
// NFL live viewer parity pass (D-194): JSON-LD, team stats, play-by-play
// filters and swings, Game Flow, game info, pregame labels, tab routes.
// Fixtures: real ESPN /summary payloads captured 2026-10-29, trimmed (news,
// odds, video and play $refs dropped):
//   nfl-summary-car-gb-live.json  CAR @ GB, event 401873023, live Q2 6:33
//   nfl-summary-ari-dal-pre.json  ARI @ DAL, event 401873024, pregame
// Run: node --test tests/nflGameParity.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'nflLiveGame.js'), 'utf8');
const NAV = fs.readFileSync(path.join(ROOT, 'js', 'navigation.js'), 'utf8');
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const LIVE = fixture('nfl-summary-car-gb-live.json');
const PRE = fixture('nfl-summary-ari-dal-pre.json');

function load() {
    const noop = () => {};
    const ctx = {
        console, Math, Date, JSON, Map, Set, Array, String, Number, Object, RegExp,
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        _escHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        _matchupTeamColors: (a, h) => ({ away: a && a.primary, home: h && h.primary }),
        getNFLTeamColor: (abbr) => ({ GB: '#203731', CAR: '#0085CA', DAL: '#003594', ARI: '#97233F' })[abbr] || null,
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'nflLiveGame.js' });
    return ctx;
}

const sides = (ctx, data) => {
    const comp = ctx._nlgComp(data);
    return { comp, home: ctx._nlgSide(comp, 'home'), away: ctx._nlgSide(comp, 'away') };
};
const count = (html, needle) => html.split(needle).length - 1;

test('JSON-LD describes the game from the rendered payload', () => {
    const ctx = load();
    const ld = ctx._nlgEventJsonLd(LIVE, '401873023');
    assert.equal(ld['@type'], 'SportsEvent');
    assert.equal(ld.name, 'Carolina Panthers at Green Bay Packers');
    assert.equal(ld.url, 'https://sportstrata.cc/nfl/game/401873023');
    assert.equal(ld.location.name, 'Lambeau Field');
    assert.equal(ld.location.address.addressLocality, 'Green Bay');
    assert.equal(ld.homeTeam.url, 'https://sportstrata.cc/nfl/team/gb');
    assert.equal(JSON.stringify(ld.competitor.map(t => t.name)), JSON.stringify(['Carolina Panthers', 'Green Bay Packers']));
    assert.equal(ld.eventStatus, 'https://schema.org/EventScheduled');
});

test('JSON-LD for a final game drops eventStatus and states the score', () => {
    const ctx = load();
    const done = structuredClone(LIVE);
    done.header.competitions[0].status.type.state = 'post';
    const ld = ctx._nlgEventJsonLd(done, '401873023');
    assert.equal(ld.eventStatus, undefined);
    assert.match(ld.description, /Final: Carolina Panthers 10, Green Bay Packers 13\./);
});

test('stat magnitude: plain numbers and clocks get bars, conversions do not', () => {
    const ctx = load();
    assert.equal(ctx._nlgStatMagnitude({ displayValue: '3.2' }), 3.2);
    assert.equal(ctx._nlgStatMagnitude({ displayValue: '10:59' }), 659);
    assert.equal(ctx._nlgStatMagnitude({ displayValue: '2-6' }), null);
    assert.equal(ctx._nlgStatMagnitude({ displayValue: '1-17' }), null);
    assert.equal(ctx._nlgStatMagnitude(undefined), null);
});

test('team stats render every stat once, grouped, without the duplicate interceptions row', () => {
    const ctx = load();
    const { home, away } = sides(ctx, LIVE);
    const html = ctx._nlgTeamStats(LIVE, home, away);
    const names = LIVE.boxscore.teams[0].statistics.map(s => s.name);
    assert.equal(count(html, 'class="nlg-ts-row"'), new Set(names).size);
    assert.equal(count(html, 'Interceptions thrown'), 1);
    for (const sec of ['Offense', 'Passing', 'Rushing', 'Situational', 'Turnovers &amp; penalties']) assert.ok(html.includes(`>${sec}<`), sec);
    assert.ok(!html.includes('>More<'), 'every live stat name is mapped to a section');
});

test('pregame season averages use the same renderer and land unsectioned', () => {
    const ctx = load();
    const { home, away } = sides(ctx, PRE);
    const html = ctx._nlgSeasonMatchupCard(PRE, home, away);
    assert.ok(html.includes('Season averages'));
    assert.equal(count(html, 'class="nlg-ts-row"'), 8);
    assert.equal(count(html, 'class="nlg-ts-sec"'), 0);
});

test('pregame leaders are labeled season leaders, live ones game leaders', () => {
    const ctx = load();
    assert.ok(ctx._nlgSidebarLeaders(PRE).includes('>Season Leaders<'));
    assert.ok(ctx._nlgSidebarLeaders(LIVE).includes('>Game Leaders<'));
});

test('play-by-play turnovers filter shows exactly the plays ESPN flags', () => {
    const ctx = load();
    vm.runInContext(`_nlg.pbpFilter = 'turnovers'`, ctx);
    const html = ctx._nlgRenderPbp(LIVE);
    const flagged = ctx._nlgAllPlaysFlat(LIVE).filter(p => p.isTurnover).length;
    assert.ok(flagged >= 1);
    assert.equal(count(html, 'class="nlg-pbp-play '), flagged);
    assert.equal(count(html, 'nlg-pbp-tag--to'), flagged);
});

test('administrative plays never carry a WP swing, even when ESPN moved WP on them', () => {
    const ctx = load();
    const deltas = ctx._nlgWpDeltaById(LIVE);
    const timeouts = ctx._nlgAllPlaysFlat(LIVE).filter(p => /Timeout/.test(p.type && p.type.text));
    assert.ok(timeouts.some(p => Math.abs(deltas.get(String(p.id)) || 0) >= 0.01), 'fixture holds a timeout ESPN re-scored');
    for (const p of timeouts) assert.equal(ctx._nlgPlaySwing(p, deltas), null);
});

test('big swings filter is the >= 5 point plays, excluding admin plays', () => {
    const ctx = load();
    const deltas = ctx._nlgWpDeltaById(LIVE);
    const want = ctx._nlgAllPlaysFlat(LIVE).filter(p => !ctx._nlgIsAdminPlay(p) && Math.abs(deltas.get(String(p.id)) || 0) >= 0.05).length;
    vm.runInContext(`_nlg.pbpFilter = 'swings'`, ctx);
    assert.equal(count(ctx._nlgRenderPbp(LIVE), 'class="nlg-pbp-play '), want);
});

test('all-plays view keeps one card per drive and shows quarter + clock on plays', () => {
    const ctx = load();
    vm.runInContext(`_nlg.pbpFilter = 'all'`, ctx);
    const html = ctx._nlgRenderPbp(LIVE);
    assert.equal(count(html, '<details class="nlg-card"'), ctx._nlgDrivesChrono(LIVE).length);
    assert.match(html, /class="nlg-pbp-when">Q[1-4] \d{1,2}:\d{2}</);
});

test('game flow sums string linescores numerically and dashes the away line', () => {
    const ctx = load();
    const { comp, home, away } = sides(ctx, LIVE);
    const html = ctx._nlgGameFlow(comp, home, away);
    assert.match(html, /CAR 10<\/span>/);
    assert.match(html, /GB 13<\/span>/);
    assert.ok(html.includes('stroke-dasharray'));
});

test('win-probability chart gives the away line a dash, not just a color', () => {
    const ctx = load();
    const { home, away } = sides(ctx, LIVE);
    const svg = ctx._nlgWpChartSvg(LIVE, home, away, { size: 'small' });
    assert.equal(count(svg, 'stroke-dasharray="5 3"'), 1);
    assert.equal(count(svg, 'class="nlg-linekey"'), 2);
});

test('game info names the venue, surface and outside conditions while live', () => {
    const ctx = load();
    const html = ctx._nlgGameInfoCard(LIVE, 'in');
    assert.ok(html.includes('Lambeau Field · Green Bay, WI'));
    assert.ok(html.includes('Natural grass'));
    assert.match(html, />Outside<.*°F/s);
    assert.ok(html.includes('Scott Novak'));
    assert.ok(!ctx._nlgGameInfoCard(LIVE, 'post').includes('>Outside<'));
});

test('game routes accept an optional tab suffix and nothing else', () => {
    const src = NAV.match(/const _NFL_GAME_VIEW_RE = (\/.+\/);/)[1];
    const re = vm.runInNewContext(src);
    assert.deepEqual([...re.exec('nfl-game-401873023')].slice(1), ['401873023', undefined]);
    assert.deepEqual([...re.exec('nfl-game-401873023-box')].slice(1), ['401873023', 'box']);
    assert.equal(re.exec('nfl-game-401873023-summary'), null, 'summary is the bare route');
    assert.equal(re.exec('nfl-game-401873023-nope'), null);
    const tabs = vm.runInNewContext(SRC.match(/const _NLG_TABS = (\[[\s\S]*?\]);/)[1]).map(t => t.id).filter(t => t !== 'summary');
    for (const t of tabs) assert.ok(re.test(`nfl-game-1-${t}`), `route accepts tab ${t}`);
});
