// ============================================================
// NFL live viewer — break card + annotated win-probability chart.
// Fixture: real ESPN /summary for NE @ BUF (event 401872971), captured
// 2026-10-04 during the official timeout right after BUF's Q2 TD.
// Run: node --test tests/nflBreakCard.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'nflLiveGame.js'), 'utf8');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nfl-summary-ne-buf-break.json'), 'utf8'));

function load() {
    const noop = () => {};
    const ctx = {
        console, Math, Date, JSON, Map, Set, Array, String, Number, Object, RegExp,
        Logger: { info: noop, warn: noop, debug: noop, error: noop },
        _escHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        _matchupTeamColors: (a, h) => ({ away: a && a.primary, home: h && h.primary }),
        getNFLTeamColor: (abbr) => ({ BUF: '#00338D', NE: '#C60C30' })[abbr] || null,
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'nflLiveGame.js' });
    return ctx;
}

const fixture = () => JSON.parse(JSON.stringify(FIXTURE));
const sides = (data) => {
    const comp = data.header.competitions[0];
    return {
        home: comp.competitors.find(c => c.homeAway === 'home'),
        away: comp.competitors.find(c => c.homeAway === 'away'),
    };
};
// Scoreboard situation during the post-TD official timeout (live-observed: down -1).
const TIMEOUT_SIT = { down: -1, yardLine: 15, distance: 0, possession: '2' };
const LIVE_SIT = { down: 1, yardLine: 65, distance: 10, possession: '17' };

test('all-plays flat list does not duplicate the in-progress drive ESPN repeats as drives.current', () => {
    const ctx = load();
    const plays = ctx._nlgAllPlaysFlat(fixture());
    const ids = plays.map(p => String(p.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(plays.length, 5 + 13 + 18);
});

test('key-play swings: top 5, ranked by win-probability delta, numbered 1..5', () => {
    const ctx = load();
    const swings = ctx._nlgKeyPlaySwings(fixture());
    assert.equal(swings.length, 5);
    assert.deepEqual(Array.from(swings, s => s.rank), [1, 2, 3, 4, 5]);
    for (let i = 1; i < swings.length; i++) assert.ok(swings[i - 1].delta >= swings[i].delta);
    swings.forEach(s => assert.ok(s.play && s.play.id && typeof s.wpIndex === 'number'));
});

test('break info: null while a real down is in play', () => {
    const ctx = load();
    assert.equal(ctx._nlgBreakInfo(fixture(), LIVE_SIT), null);
});

test('break info after a touchdown: headline, drive line, WP swing, next possession', () => {
    const ctx = load();
    const info = ctx._nlgBreakInfo(fixture(), TIMEOUT_SIT);
    assert.equal(info.headline, 'BUF TOUCHDOWN');
    assert.equal(info.driveId, '4018729713');
    assert.equal(info.driveLine, '13 plays · 62 yards · 7:46 · from BUF 38');
    assert.equal(info.leaderAbbr, 'BUF');
    assert.equal(info.wpBeforePct, 53);
    assert.equal(info.wpAfterPct, 66);
    assert.equal(info.nextPoss, 'NE receives');
    assert.ok(info.swingPlay && info.swingPlay.text);
});

test('break info when the scoreboard lags the summary: a just-scored play forces the break even with a stale live down', () => {
    const ctx = load();
    const data = fixture();
    // Drop the trailing official timeout so the summary's last play is the TD itself,
    // while the scoreboard situation still shows the pre-snap 1st & Goal.
    // ESPN repeats this drive as drives.current too, which wins the dedup.
    for (const drive of [data.drives.previous[2], data.drives.current]) {
        drive.plays = drive.plays.filter(p => p.type.text !== 'Official Timeout');
    }
    const info = ctx._nlgBreakInfo(data, { down: 1, yardLine: 8, distance: 8, possession: '2' });
    assert.ok(info);
    assert.equal(info.headline, 'BUF TOUCHDOWN');
});

test('break info at halftime uses a status headline and omits next possession', () => {
    const ctx = load();
    const data = fixture();
    data.header.competitions[0].status.type.name = 'STATUS_HALFTIME';
    const info = ctx._nlgBreakInfo(data, null);
    assert.equal(info.headline, 'HALFTIME');
    assert.equal(info.nextPoss, null);
    // The status headline no longer names the drive, so the drive line must.
    assert.equal(info.driveLine, 'Last drive: BUF Touchdown · 13 plays · 62 yards · 7:46 · from BUF 38');
});

test('break info at end of a quarter names the quarter', () => {
    const ctx = load();
    const data = fixture();
    data.header.competitions[0].status.type.name = 'STATUS_END_PERIOD';
    data.header.competitions[0].status.period = 1;
    const info = ctx._nlgBreakInfo(data, null);
    assert.equal(info.headline, 'END OF 1ST');
});

test('break info: null before any drive has finished (opening kickoff)', () => {
    const ctx = load();
    const data = fixture();
    data.drives = { previous: [], current: null };
    assert.equal(ctx._nlgBreakInfo(data, TIMEOUT_SIT), null);
});

test('break info after a punt: next possession is the other team\'s ball, no "receives"', () => {
    const ctx = load();
    const data = fixture();
    data.drives.previous = data.drives.previous.slice(0, 1);
    data.drives.current = null;
    const info = ctx._nlgBreakInfo(data, TIMEOUT_SIT);
    assert.equal(info.headline, 'BUF PUNT');
    assert.equal(info.nextPoss, 'NE ball');
});

test('WP chart: one numbered dot per key play, matching the Key Plays ranks', () => {
    const ctx = load();
    const data = fixture();
    const { home, away } = sides(data);
    const svg = ctx._nlgWpChartSvg(data, home, away, { size: 'large' });
    const dots = svg.match(/class="nlg-wp-dot"/g) || [];
    assert.equal(dots.length, 5);
    for (let r = 1; r <= 5; r++) assert.ok(svg.includes(`data-rank="${r}"`), `rank ${r} dot`);
});

test('WP chart: one quarter tick per quarter boundary crossed', () => {
    const ctx = load();
    const data = fixture();
    const { home, away } = sides(data);
    const svg = ctx._nlgWpChartSvg(data, home, away, { size: 'small' });
    // Fixture spans Q1 -> Q2: exactly one boundary.
    assert.equal((svg.match(/class="nlg-wp-qtick"/g) || []).length, 1);
});

test('WP chart (large) shades the drive span when given one', () => {
    const ctx = load();
    const data = fixture();
    const { home, away } = sides(data);
    const svg = ctx._nlgWpChartSvg(data, home, away, { size: 'large', driveId: '4018729713' });
    assert.ok(svg.includes('class="nlg-wp-drive"'));
});

test('WP chart: a dot that crowds an earlier one is nudged off it', () => {
    const ctx = load();
    const data = fixture();
    // Force crowding: make two adjacent entries the two biggest swings.
    const wp = data.winprobability;
    const k = 10;
    wp[k].homeWinPercentage = 0.95;
    wp[k + 1].homeWinPercentage = 0.05;
    wp[k + 2].homeWinPercentage = 0.95;
    const { home, away } = sides(data);
    const html = ctx._nlgWpChartSvg(data, home, away, { size: 'small' });
    const dots = [...html.matchAll(/left:([\d.]+)%;top:([\d.]+)%;--nudge:(-?\d+)/g)]
        .map(m => ({ left: +m[1], top: +m[2], nudge: +m[3] }));
    assert.equal(dots.length, 5);
    const crowded = dots.filter((d, i) => dots.slice(0, i).some(p => Math.abs(p.left - d.left) < 9 && Math.abs(p.top - d.top) < 30));
    assert.ok(crowded.length > 0, 'fixture edit should produce at least one crowded dot');
    crowded.forEach(d => assert.notEqual(d.nudge, 0));
});

test('WP chart: empty string when fewer than 2 entries', () => {
    const ctx = load();
    const data = fixture();
    data.winprobability = data.winprobability.slice(0, 1);
    const { home, away } = sides(data);
    assert.equal(ctx._nlgWpChartSvg(data, home, away, { size: 'small' }), '');
});

// ---- Two-minute warning (D-172) ---------------------------------------
// Real DET @ CAR summary (event 401872978), 2026-10-04, cut at the moment
// of the Q2 two-minute warning: CAR's drive in progress (kickoff, one
// 11-yard snap, then the warning). ESPN keeps a live down through it, so
// the "no valid down" rule alone never fired -- the field stayed up
// through what is effectively a TV timeout.
const TWO_MIN = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nfl-summary-det-car-2min.json'), 'utf8'));
const twoMin = () => JSON.parse(JSON.stringify(TWO_MIN));
const LIVE_DOWN_2MW = { down: 1, yardLine: 59, distance: 10, possession: '29' };

test('two-minute warning forces a break even though ESPN still reports a live down', () => {
    const ctx = load();
    const info = ctx._nlgBreakInfo(twoMin(), LIVE_DOWN_2MW);
    assert.ok(info);
    assert.equal(info.headline, 'TWO-MINUTE WARNING');
});

test('two-minute warning recaps the drive in progress, not the last finished one', () => {
    const ctx = load();
    const data = twoMin();
    const info = ctx._nlgBreakInfo(data, LIVE_DOWN_2MW);
    assert.equal(info.driveId, String(data.drives.current.id));
    assert.match(info.driveLine, /^CAR drive so far: 1 play · 11 yards/);
    assert.equal(info.nextPoss, null);
});

test('two-minute warning keeps the down-and-distance line visible', () => {
    const ctx = load();
    const info = ctx._nlgBreakInfo(twoMin(), LIVE_DOWN_2MW);
    assert.equal(info.keepSituation, true);
});

test('two-minute warning: WP swing is measured across the drive so far', () => {
    const ctx = load();
    const info = ctx._nlgBreakInfo(twoMin(), LIVE_DOWN_2MW);
    assert.equal(typeof info.wpBeforePct, 'number');
    assert.equal(typeof info.wpAfterPct, 'number');
    assert.ok(info.leaderAbbr === 'CAR' || info.leaderAbbr === 'DET');
});

test('once play resumes after the warning, the field comes back', () => {
    const ctx = load();
    const data = twoMin();
    data.drives.current.plays = data.drives.current.plays.filter(p => p.type.id !== '75');
    assert.equal(ctx._nlgBreakInfo(data, LIVE_DOWN_2MW), null);
});

test('ordinary breaks do not keep the situation line', () => {
    const ctx = load();
    const info = ctx._nlgBreakInfo(fixture(), TIMEOUT_SIT);
    assert.ok(!info.keepSituation);
});
