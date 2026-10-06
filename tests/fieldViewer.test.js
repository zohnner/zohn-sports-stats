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
