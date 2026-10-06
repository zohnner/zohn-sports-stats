// ============================================================
// NFL field viewer — pure geometry, layout, resolution, static SVG.
// Run: node --test tests/fieldViewer.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'fieldViewer.js'), 'utf8');

function load() {
    const ctx = {
        console, Math, JSON, Array, String, Number, Object,
        _escHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    };
    ctx.globalThis = ctx; ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'fieldViewer.js' });
    return ctx.FieldViewer;
}

const SIZES = [[421, 190], [773, 240], [1148, 240]];
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);

// The D-148 renderer: 1000x400 viewBox stretched with preserveAspectRatio="none".
function oldProjPx(xF, yF, w, h) {
    const halfW = 486 + (284 - 486) * yF;
    const x = 500 - halfW + ((xF + 10) / 120) * halfW * 2;
    const y = 378 + (150 - 378) * yF;
    return { x: x * w / 1000, y: y * h / 400 };
}

test('pixel-space projection lands every point exactly where the stretched viewBox did', () => {
    const FV = load();
    for (const [w, h] of SIZES) {
        const g = FV.geometry(w, h);
        for (const xF of [-10, 0, 23, 50, 77.5, 100, 110]) {
            for (const yF of [0, 0.28, 0.5, 1]) {
                const a = g.proj(xF, yF), b = oldProjPx(xF, yF, w, h);
                close(a.x, b.x); close(a.y, b.y);
            }
        }
    }
});

test('lineTransform maps the reference line onto the projected yard line at both ends', () => {
    const FV = load();
    for (const [w, h] of SIZES) {
        const g = FV.geometry(w, h);
        for (const xF of [0, 35, 50, 91]) {
            const t = FV.lineTransform(g, xF);
            const k = Math.tan(t.skewDeg * Math.PI / 180);
            const map = (y) => g.cx + k * y + t.tx;
            close(map(g.bottomY), g.proj(xF, 0).x, 1e-6);
            close(map(g.topY), g.proj(xF, 1).x, 1e-6);
            close(t.bottomX, g.proj(xF, 0).x);
        }
    }
});

test('glideMs scales with distance and clamps to 220..640', () => {
    const FV = load();
    assert.equal(FV.glideMs(0), 220);
    assert.equal(FV.glideMs(400), 640);
    assert.equal(FV.glideMs(5000), 640);
    assert.equal(FV.glideMs(-200), 430);
});

test('midfield art is ~12 yards and never more than a quarter of the field depth', () => {
    const FV = load();
    for (const [w, h] of SIZES) {
        const g = FV.geometry(w, h);
        const m = FV.midfieldPlacement(g);
        close(m.size, FV.MIDFIELD_YARDS * g.lengthPxPerYard(0.5));
        const footprintH = m.size * m.squash;
        assert.ok(footprintH <= 0.25 * (g.bottomY - g.topY), `${w}x${h}: ${footprintH}`);
        close(m.x, g.proj(50, 0.5).x); close(m.y, g.proj(50, 0.5).y);
    }
});

test('end zone glyphs: one per non-space char, inside the end zone, shrinking toward the far sideline', () => {
    const FV = load();
    for (const [w, h] of SIZES) {
        const g = FV.geometry(w, h);
        const left = FV.layoutEndzoneText(g, 'GREEN BAY', 'left');
        assert.equal(left.length, 8);
        // The angle flattens on wide fields (~33deg at 1148x240), so only its sign/quadrant is asserted.
        for (const t of left) assert.ok(t.angle < -20 && t.angle > -135, `left reads upward, got ${t.angle}`);
        for (let i = 1; i < left.length; i++) {
            assert.ok(left[i].y < left[i - 1].y, 'left glyphs advance toward the far sideline');
            assert.ok(Math.abs(left[i].m[2]) < Math.abs(left[i - 1].m[2]), 'left glyphs shrink with depth');
        }
        const right = FV.layoutEndzoneText(g, 'PACKERS', 'right');
        assert.equal(right.length, 7);
        for (const t of right) assert.ok(t.angle > 20 && t.angle < 135, `right reads downward, got ${t.angle}`);
        // Every corner of every glyph cell (font-size 100 cell: 55 wide x 70 tall,
        // centered) must land inside its end zone -- the bug the prototype caught.
        for (const [glyphs, x0, x1] of [[left, -10, 0], [right, 100, 110]]) {
            for (const t of glyphs) {
                const [a, b, c, d] = t.m;
                for (const [lx, ly] of [[-27.5, -35], [27.5, -35], [-27.5, 35], [27.5, 35]]) {
                    const X = t.x + a * lx + c * ly, Y = t.y + b * lx + d * ly;
                    const yF = (Y - g.bottomY) / (g.topY - g.bottomY);
                    assert.ok(yF > 0 && yF < 1, `${t.ch} corner off the field depth at ${w}px`);
                    assert.ok(X > g.proj(x0, yF).x && X < g.proj(x1, yF).x, `${t.ch} corner outside end zone at ${w}px`);
                }
            }
        }
        for (let i = 1; i < right.length; i++) assert.ok(right[i].y > right[i - 1].y, 'right glyphs advance toward the near sideline');
    }
    assert.deepEqual(Array.from(FV.layoutEndzoneText(FV.geometry(800, 240), '', 'left')), []);
});

const INDEX = {
    version: 1,
    teams: { '3798--GB': { name: 'Lambeau Field' }, '3839--NYG': { name: 'MetLife (NYG)' }, '3839--NYJ': { name: 'MetLife (NYJ)' } },
    neutral: { '401872965': { name: 'Tottenham (game paint)' } },
};

test('resolveField: researched neutral, generated neutral, team, generated — in that order', () => {
    const FV = load();
    const r = (o) => FV.resolveField({ index: INDEX, venueId: '3798', homeAbbr: 'GB', eventId: '1', neutralSite: false, ...o });
    assert.equal(r({ neutralSite: true, eventId: '401872965' }).source, 'neutral-researched');
    assert.equal(r({ neutralSite: true, eventId: '401872965' }).profile.name, 'Tottenham (game paint)');
    assert.equal(r({ neutralSite: true, eventId: '999' }).source, 'neutral-generated');
    assert.equal(r({ neutralSite: true, eventId: '999' }).profile, null);
    assert.equal(r({}).profile.name, 'Lambeau Field');
    assert.equal(r({ venueId: '3839', homeAbbr: 'NYJ' }).profile.name, 'MetLife (NYJ)');
    assert.equal(r({ venueId: '9999' }).source, 'generated');
    assert.equal(FV.resolveField({ index: null, venueId: '3798', homeAbbr: 'GB', eventId: '1', neutralSite: false }).source, 'generated');
});

test('generatedProfile paints both end zones in home colors with city and nickname', () => {
    const FV = load();
    const p = FV.generatedProfile({ homeLocation: 'Green Bay', homeName: 'Packers', homeColor: '#203731', neutral: false });
    assert.equal(p.generated, true);
    assert.equal(p.endzones.left.text, 'GREEN BAY');
    assert.equal(p.endzones.right.text, 'PACKERS');
    assert.equal(p.endzones.left.fill, '#203731');
    assert.equal(p.endzones.right.fill, '#203731');
    assert.equal(p.midfield, 'primary-logo');
    const n = FV.generatedProfile({ homeLocation: 'Washington', homeName: 'Commanders', homeColor: '#5A1414', neutral: true });
    assert.equal(n.midfield, 'none');
    assert.equal(n.mow, 'none');
});

const PROFILE = {
    surface: 'artificial', mow: 'checker', border: '#123456', midfield: 'primary-logo', signature: [],
    endzones: { left: { fill: '#203731', text: 'GREEN BAY', textColor: '#FFFFFF' }, right: { fill: '#203731', text: 'PACK<ERS', textColor: '#FFB612' } },
};

test('static SVG: instance-prefixed ids, escaped text, one glyph per letter, midfield image, all placeholders', () => {
    const FV = load();
    const g = FV.geometry(773, 240);
    const s = FV.buildStaticSvg(g, PROFILE, { idp: 'fv7-', homeLogo: 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png', awayLogo: 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png' });
    for (const m of s.matchAll(/\bid="([^"]+)"/g)) assert.ok(m[1].startsWith('fv7-'), `unprefixed id ${m[1]}`);
    assert.ok(!/preserveAspectRatio="none"/.test(s));
    assert.ok(s.includes('&lt;'), 'end zone text escaped');
    assert.ok(!s.includes('PACK<ERS'));
    assert.equal((s.match(/<text class="fv-ez-glyph"/g) || []).length, 8 + 8);
    assert.ok(s.includes('class="fv-midfield"') && s.includes('gb.png'));
    assert.ok(s.includes('chi.png'), 'away defended-goal badge');
    for (const k of ['rz', 'rz-clip', 'fd', 'fd-line', 'scrim', 'arrow', 'ball', 'ball-fill']) assert.ok(s.includes(`data-fv="${k}"`), `placeholder ${k}`);
    assert.ok(s.includes('fill="#123456"'), 'border color');
    assert.ok(!s.includes('url(#fv7-hatch)'), 'end zones are flat paint, no hatch overlay');
    assert.ok(!s.includes('fv7-ezL') && !s.includes('fv7-ezR'), 'unused end zone clip paths removed');
});

test('static SVG: midfield none draws no midfield image; mow none draws no bands', () => {
    const FV = load();
    const g = FV.geometry(773, 240);
    const s = FV.buildStaticSvg(g, { ...PROFILE, midfield: 'none', mow: 'none' }, { idp: 'a-', homeLogo: 'x', awayLogo: '' });
    assert.ok(!s.includes('fv-midfield'));
    assert.ok(!s.includes('data-fv-band'));
});

test('dynamicState matches the D-148 positions for both possessions', () => {
    const FV = load();
    const [w, h] = [1148, 240];
    const g = FV.geometry(w, h);
    // Home (id 9) has the ball at yardLine 58 (home-anchored), driving toward 100; 1st & 10.
    const homeSit = { yardLine: 58, distance: 10, possession: '9', down: 1, isRedZone: false };
    const d = FV.dynamicState(g, homeSit, '9');
    assert.equal(d.possHome, true);
    close(d.ball.x, oldProjPx(100 - 58, 0.5, w, h).x);
    close(d.firstDown.bottomX, oldProjPx(100 - 68, 0, w, h).x);
    assert.equal(d.redZone, null);
    // Away has the ball, 1st & Goal at the home 19: first down clamps to the home goal line.
    const awaySit = { yardLine: 19, distance: 19, possession: '3', down: 1, isRedZone: true };
    const a = FV.dynamicState(g, awaySit, '9');
    assert.equal(a.possHome, false);
    close(a.firstDown.bottomX, oldProjPx(100, 0, w, h).x);
    close(a.redZone[0].x, oldProjPx(80, 0, w, h).x);
    close(a.redZone[1].x, oldProjPx(100, 0, w, h).x);
    assert.equal(FV.dynamicState(g, { ...awaySit, down: 4 }, '9').isDown4, true);
});

test('arrowSvg skips administrative plays and badges incompletions', () => {
    const FV = load();
    const g = FV.geometry(773, 240);
    const play = (text) => ({ lastPlay: { id: 'p1', type: { text }, start: { yardLine: 30 }, end: { yardLine: 42 } } });
    assert.equal(FV.arrowSvg(g, play('Timeout'), false, 'm'), '');
    assert.equal(FV.arrowSvg(g, play('Penalty'), false, 'm'), '');
    assert.ok(FV.arrowSvg(g, play('Pass Incompletion'), false, 'm').includes('fv-arrow-badge-ring'));
    const pass = FV.arrowSvg(g, play('Pass Reception'), true, 'fv1-arrow');
    assert.ok(pass.includes('fv-arrow--pass') && pass.includes('fv-arrow--entering') && pass.includes('url(#fv1-arrow)'));
    assert.equal(FV.arrowSvg(g, {}, false, 'm'), '');
});
