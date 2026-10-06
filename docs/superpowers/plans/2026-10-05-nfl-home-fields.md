# NFL Home Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every NFL live game draws the home team's real field (end zone paint, turf, mow pattern, midfield art, border) on a rebuilt pixel-space field renderer that also fixes the oversized midfield logo.

**Architecture:** A new `js/fieldViewer.js` owns all field geometry and drawing: pure functions (projection, end zone glyph layout, profile resolution, static SVG builder) plus a `mount/update/destroy` instance with a static layer (built once) and a dynamic layer (moved by CSS transitions). Field facts live as content files under `content/nfl/fields/`, validated and collected into a committed `index.json` by `tools/fields/build-index.cjs`, whose `--check` mode is the CI launch gate (all 32 researched, sourced, owner-approved). `js/nflLiveGame.js` keeps the field in a persistent slot instead of rebuilding it every poll.

**Tech Stack:** Vanilla JS (classic `<script>` globals, no bundler), SVG, CSS transitions, Node `node:test` + `vm` for tests, CommonJS CLIs under `tools/`.

**Spec:** `docs/superpowers/specs/2026-10-05-nfl-home-fields-design.md`

## Global Constraints

- Vanilla JS/CSS only; no framework, bundler, or build step (the index is a committed generated file, like Stories).
- Any API/profile string written into `innerHTML` goes through `_escHtml()`.
- No inline `onerror=` on images; use `data-hide-on-error`.
- Never use `innerHTML +=`.
- Comments only where the WHY is non-obvious; no incident logs in code (history goes in DECISIONS.md).
- Every new `js/` file is added to BOTH `index.html` and `sw.js` `STATIC_ASSETS` (`tools/check-manifest.cjs` enforces it).
- Fidelity: SportStrata display font for end zone text, never official team fonts.
- Launch bar: all 32 team profiles researched, every attribute sourced, every profile owner-approved before merge.
- Both end zones are painted the home team's way. The away team keeps a small logo badge at the goal it defends.
- Neutral-site games: researched per-game profile if present, else a generated neutral field. Never present invented paint as real.
- Profile `midfieldImage` URLs must be on `https://a.espncdn.com/` (already CSP-allowlisted). Anything else requires a CSP change in both `_headers` and `index.html`; this plan does not plan for one.
- Work happens in the worktree `../zohn-sports-stats-fields` on branch `feat/nfl-home-fields`. Never touch the `fix/private-paths` checkout.
- `sw.js` `CACHE_NAME` is bumped exactly once, in the final task, against the latest `origin/main` (versions collide across parallel PRs).

## File Map

| File | Responsibility |
|---|---|
| `js/fieldViewer.js` (create) | `FieldViewer` global: geometry, glyph layout, midfield placement, glide timing, dynamic state, profile resolution, generated profiles, static SVG builder, `mount()` instance |
| `css/nflLiveGame.css` (modify) | New-renderer rules (`.fv-dyn`, `.fv-motion`, `.fv-ez-glyph`, `.fv-yardnum`, `.fv-fd-flash`, `.fv-ball--turnover`, `.fv-field3d--indoor`, `.fv-venue`); delete `.fv-ez-logo`/`.fv-mid-logo` |
| `js/nflLiveGame.js` (modify) | Persistent field slot, `_nlgEnsureField`, `_nlgFieldProfileFor`, `_nlgLoadFieldIndex`, `_nlgTeamLogo`; delete `_FV`, `_nlgGlideDuration`, `_nlgAnimateFieldMotion`, `_nlgFieldViewerHtml`, `_nlgPlayArrowSvg` |
| `js/nfl.js` (modify) | `fetchNFLLiveSituation` also returns `venueIndoor` |
| `tools/fields/field-core.cjs` (create) | Schema constants, `validateProfile`, `validateFacts`, `lowConfidenceCount`, `missingFieldProfiles`, `surfaceMismatch` |
| `tools/fields/build-index.cjs` (create) | Build `content/nfl/fields/index.json`; `--check` launch gate; `--gallery` data dump |
| `tools/fields/approve.cjs` (create) | Owner-run approval stamp into a facts file |
| `tools/fields/gallery.html` (create) | Local-only review gallery (real renderer + source photo + facts) |
| `content/nfl/fields/` (create) | `<venue-slug>--<team>.json` + `.facts.json` per field; `neutral/`; generated `index.json` |
| `tools/contracts/nfl.cjs` (modify) | `nfl-fields-venues` and `nfl-fields-surface` drift contracts |
| `tests/fieldViewer.test.js` (create) | Geometry parity, glyph layout, midfield size, glide, dynamic state, resolution, static SVG |
| `tests/fields.test.js` (create) | Schema validation, index build/check, approve, drift helpers |
| `index.html`, `sw.js`, `.github/workflows/ci.yml`, `.gitignore`, `.claude/commands/deploy-check.md`, `CLAUDE.md`, `DECISIONS.md` (modify) | Wiring + docs |

All paths below are relative to the worktree root `c:\Users\zohnw\Documents\Projects\zohn-sports-stats-fields`.

---

### Task 1: Pixel-space geometry, glyph layout, and the end zone text prototype (owner checkpoint)

**Files:**
- Create: `js/fieldViewer.js`
- Create: `tests/fieldViewer.test.js`
- Modify: `index.html` (script chain), `sw.js` (`STATIC_ASSETS`), `.github/workflows/ci.yml` (unit test line)
- Throwaway (never committed): `tools/fields/proto.html`

**Interfaces:**
- Produces (all on `window.FieldViewer`):
  - `geometry(w, h)` → `{ w, h, cx, unit, bottomY, topY, proj(xF, yF) → {x, y}, scaleAt(yF) → number, lengthPxPerYard(yF) → number, depthPxPerYard: number }`. `xF` is display-space yards (−10..110, away goal line at 0), `yF` is 0 (near sideline) to 1 (far sideline).
  - `lineTransform(g, xF)` → `{ tx, skewDeg, bottomX }`
  - `lineCss(t)` → CSS transform string
  - `glideMs(px)` → integer ms in [220, 640]
  - `layoutEndzoneText(g, text, side)` → `Array<{ ch, x, y, angle, sx, sy }>`; `side` is `'left' | 'right'`
  - `midfieldPlacement(g)` → `{ x, y, size, squash }`
  - Constants: `GLYPH_REF` (100), `MIDFIELD_YARDS` (12)

- [ ] **Step 1: Write the failing tests**

Create `tests/fieldViewer.test.js`:

```js
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
        for (const t of left) {
            const yF = (t.y - g.bottomY) / (g.topY - g.bottomY);
            assert.ok(t.x > g.proj(-10, yF).x && t.x < g.proj(0, yF).x, `left glyph ${t.ch} outside end zone`);
            assert.ok(t.angle < -45 && t.angle > -135, `left reads upward, got ${t.angle}`);
        }
        for (let i = 1; i < left.length; i++) {
            assert.ok(left[i].y < left[i - 1].y, 'left glyphs advance toward the far sideline');
            assert.ok(left[i].sy < left[i - 1].sy, 'left glyphs shrink with depth');
        }
        const right = FV.layoutEndzoneText(g, 'PACKERS', 'right');
        assert.equal(right.length, 7);
        for (const t of right) {
            const yF = (t.y - g.bottomY) / (g.topY - g.bottomY);
            assert.ok(t.x > g.proj(100, yF).x && t.x < g.proj(110, yF).x, `right glyph ${t.ch} outside end zone`);
            assert.ok(t.angle > 45 && t.angle < 135, `right reads downward, got ${t.angle}`);
        }
        for (let i = 1; i < right.length; i++) assert.ok(right[i].y > right[i - 1].y, 'right glyphs advance toward the near sideline');
    }
    assert.deepEqual(Array.from(FV.layoutEndzoneText(FV.geometry(800, 240), '', 'left')), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/fieldViewer.test.js`
Expected: FAIL with `ENOENT` (no `js/fieldViewer.js`).

- [ ] **Step 3: Write the minimal implementation**

Create `js/fieldViewer.js`:

```js
// ============================================================
// NFL live field viewer — drawn in real pixels (1 SVG unit = 1 CSS px).
// The D-148 renderer drew in a fixed 1000x400 viewBox stretched with
// preserveAspectRatio="none"; the trapezoid constants below are that
// shape expressed as fractions of the box, so every point lands exactly
// where it did, but logos and painted text are no longer stretched.
// ============================================================
const FieldViewer = (() => {
    const BOTTOM_Y = 378 / 400, TOP_Y = 150 / 400;
    const BOTTOM_HALF_W = 486 / 1000, TOP_HALF_W = 284 / 1000;
    const FIELD_WIDTH_YDS = 160 / 3;
    const MIDFIELD_YARDS = 12;
    // Glyph cells are laid out at font-size GLYPH_REF, then scaled; ADV/CAP
    // are the display font's approximate caps advance and cap height there.
    const GLYPH_REF = 100, GLYPH_ADV = 55, GLYPH_CAP = 70;
    const EZ_TEXT_Y0 = 0.1, EZ_TEXT_Y1 = 0.9, EZ_LETTER_YDS = 6;
    const GLIDE_MIN_MS = 220, GLIDE_MAX_MS = 640, GLIDE_REF_PX = 400;

    function geometry(w, h) {
        const cx = w / 2;
        const halfW = (yF) => (BOTTOM_HALF_W + (TOP_HALF_W - BOTTOM_HALF_W) * yF) * w;
        const yAt = (yF) => (BOTTOM_Y + (TOP_Y - BOTTOM_Y) * yF) * h;
        const proj = (xF, yF) => {
            const hw = halfW(yF);
            return { x: cx - hw + ((xF + 10) / 120) * hw * 2, y: yAt(yF) };
        };
        return {
            w, h, cx,
            unit: Math.sqrt((w / 1000) * (h / 400)),
            bottomY: yAt(0), topY: yAt(1),
            proj,
            scaleAt: (yF) => halfW(yF) / halfW(0),
            lengthPxPerYard: (yF) => (halfW(yF) * 2) / 120,
            depthPxPerYard: ((BOTTOM_Y - TOP_Y) * h) / FIELD_WIDTH_YDS,
        };
    }

    // Any yard line is the reference line at x = cx, slid by tx and slanted by
    // skewX -- so a CSS transition on transform glides it exactly, end to end.
    function lineTransform(g, xF) {
        const b = g.proj(xF, 0), t = g.proj(xF, 1);
        const k = (t.x - b.x) / (t.y - b.y);
        return { tx: b.x - g.cx - k * b.y, skewDeg: Math.atan(k) * 180 / Math.PI, bottomX: b.x };
    }
    const lineCss = (t) => `translate(${t.tx.toFixed(2)}px,0px) skewX(${t.skewDeg.toFixed(4)}deg)`;

    function glideMs(px) {
        const t = Math.min(1, Math.abs(px) / GLIDE_REF_PX);
        return Math.round(GLIDE_MIN_MS + (GLIDE_MAX_MS - GLIDE_MIN_MS) * t);
    }

    // Lettering runs sideline to sideline with letter tops toward the end
    // line: the left end zone reads near->far, the right far->near.
    function layoutEndzoneText(g, text, side) {
        const chars = Array.from(String(text || '').toUpperCase());
        if (!chars.length) return [];
        const xF = side === 'left' ? -5 : 105;
        const dir = side === 'left' ? 1 : -1;
        const step = (EZ_TEXT_Y1 - EZ_TEXT_Y0) / chars.length;
        const out = [];
        chars.forEach((ch, i) => {
            if (ch === ' ') return;
            const yF = side === 'left' ? EZ_TEXT_Y0 + (i + 0.5) * step : EZ_TEXT_Y1 - (i + 0.5) * step;
            const c = g.proj(xF, yF);
            const a = g.proj(xF, yF - (step / 2) * dir), b = g.proj(xF, yF + (step / 2) * dir);
            const cellPx = Math.hypot(b.x - a.x, b.y - a.y);
            out.push({
                ch, x: c.x, y: c.y,
                angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI,
                sx: (cellPx * 0.82) / GLYPH_ADV,
                sy: (EZ_LETTER_YDS * g.lengthPxPerYard(yF)) / GLYPH_CAP,
            });
        });
        return out;
    }

    // Square of MIDFIELD_YARDS along the field length, squashed vertically by
    // the projection's depth/length ratio -- paint on the ground, not a sticker.
    function midfieldPlacement(g) {
        const c = g.proj(50, 0.5);
        return { x: c.x, y: c.y, size: MIDFIELD_YARDS * g.lengthPxPerYard(0.5), squash: g.depthPxPerYard / g.lengthPxPerYard(0.5) };
    }

    return { GLYPH_REF, MIDFIELD_YARDS, geometry, lineTransform, lineCss, glideMs, layoutEndzoneText, midfieldPlacement };
})();
window.FieldViewer = FieldViewer;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/fieldViewer.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the file into the delivery manifest and CI**

In `index.html`, immediately before the existing line `<script defer src="js/nflLiveGame.js"></script>`, add:

```html
    <script defer src="js/fieldViewer.js"></script>
```

In `sw.js` `STATIC_ASSETS`, immediately before `'/js/nflLiveGame.js',`, add:

```js
    '/js/fieldViewer.js',
```

In `.github/workflows/ci.yml`, append ` tests/fieldViewer.test.js` to the end of the `Unit tests (deploy-check #9)` `run:` line.

Run: `node tools/check-manifest.cjs`
Expected: no `FAIL` lines.

- [ ] **Step 6: Commit**

```bash
git add js/fieldViewer.js tests/fieldViewer.test.js index.html sw.js .github/workflows/ci.yml
git commit -m "feat(fields): pixel-space field geometry and end zone glyph layout"
```

- [ ] **Step 7: Build the throwaway end zone prototype (do NOT commit)**

Create `tools/fields/proto.html`:

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>End zone prototype</title>
<link rel="stylesheet" href="../../css/variables.css">
<style>
  body { background: #111; color: #ddd; font: 13px system-ui; padding: 16px; }
  .box { position: relative; height: 240px; margin: 0 0 24px; background: #0c1a10; }
  svg text { font-family: var(--font-display); font-weight: 800; }
</style></head><body>
<div id="out"></div>
<script>window._escHtml = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');</script>
<script src="../../js/fieldViewer.js"></script>
<script>
const SAMPLES = [['GREEN BAY', 'PACKERS', '#203731'], ['SAN FRANCISCO', '49ERS', '#AA0000'], ['KANSAS CITY', 'CHIEFS', '#E31837']];
const out = document.getElementById('out');
for (const w of [421, 773, 1148]) {
  for (const [l, r, fill] of SAMPLES) {
    const h = w <= 640 ? 190 : 240, g = FieldViewer.geometry(w, h);
    const quad = (x0, x1) => [g.proj(x0,0), g.proj(x1,0), g.proj(x1,1), g.proj(x0,1)].map(p => `${p.x},${p.y}`).join(' ');
    const glyphs = (t, side) => FieldViewer.layoutEndzoneText(g, t, side).map(c =>
      `<text font-size="${FieldViewer.GLYPH_REF}" text-anchor="middle" dominant-baseline="central" fill="#fff" transform="translate(${c.x},${c.y}) rotate(${c.angle}) scale(${c.sx},${c.sy})">${c.ch}</text>`).join('');
    const m = FieldViewer.midfieldPlacement(g);
    out.insertAdjacentHTML('beforeend', `<p>${w}px — ${l} / ${r}</p><div class="box" style="width:${w}px;height:${h}px"><svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <polygon points="${quad(-10,110)}" fill="#1f6f37"/>
      <polygon points="${quad(-10,0)}" fill="${fill}"/><polygon points="${quad(100,110)}" fill="${fill}"/>
      ${glyphs(l,'left')}${glyphs(r,'right')}
      <g transform="translate(${m.x},${m.y}) scale(1,${m.squash})"><rect x="${-m.size/2}" y="${-m.size/2}" width="${m.size}" height="${m.size}" fill="rgba(255,255,255,0.35)"/></g>
    </svg></div>`);
  }
}
</script></body></html>
```

Serve the worktree root (`python -m http.server 8765` from the worktree root), open `http://localhost:8765/tools/fields/proto.html` in Chrome, and screenshot each width (the `/screenshot` skill's headless-Chrome approach, or a real window).

- [ ] **Step 8: Owner checkpoint — STOP**

Report to the owner with the screenshots and a plain verdict on: (a) are 13-character names ("SAN FRANCISCO") legible at 421px, (b) do letter tops face the end line in both end zones, (c) does the midfield square's size read right. If (a) fails, apply the spec fallback: change `EZ_TEXT_Y0 = 0.1, EZ_TEXT_Y1 = 0.9` to `EZ_TEXT_Y0 = 0.08, EZ_TEXT_Y1 = 0.5` (near half only), update the glyph test's bounds if needed, re-run Step 4, re-screenshot, and report again. **Do not start Task 2 until the owner says the prototype is acceptable.** Delete `tools/fields/proto.html` afterwards.

---

### Task 2: Field profile schema and validation

**Files:**
- Create: `tools/fields/field-core.cjs`
- Create: `tests/fields.test.js`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces (`require('./field-core.cjs')`):
  - `NFL_TEAMS: string[]` (32 ESPN abbreviations), `REQUIRED_FACTS: string[]`, `PAINT_FACTS: string[]`, `PROFILE_FILE: RegExp` (captures `[1]` venue slug, `[2]` lowercase team)
  - `validateProfile(p) → string[]` (problems; empty = valid)
  - `validateFacts(facts) → string[]`
  - `lowConfidenceCount(facts) → number`
  - `nflSeasonStart(dateStr) → 'YYYY-08-01'`

Profile shape (exact; values are illustrative schema examples, not researched facts):

```json
{
  "venueId": "3798",
  "homeTeam": "GB",
  "name": "Lambeau Field",
  "surface": "hybrid",
  "mow": "stripes-5",
  "endzones": {
    "left":  { "fill": "#203731", "text": "GREEN BAY", "textColor": "#FFFFFF" },
    "right": { "fill": "#203731", "text": "PACKERS",   "textColor": "#FFFFFF" }
  },
  "midfield": "primary-logo",
  "border": "#203731",
  "signature": []
}
```

`midfieldImage` is required only when `midfield` is `alt-logo` or `wordmark`.

Facts shape (exact):

```json
{
  "approved": null,
  "facts": {
    "surface": { "source": "https://example.com/stadium", "checked": "2026-10-06", "confidence": "high" },
    "endzones.left.fill": { "source": "https://example.com/recap", "photo": "https://example.com/p.jpg", "photoDate": "2026-09-14", "checked": "2026-10-06", "confidence": "medium" }
  }
}
```

- [ ] **Step 1: Write the failing tests**

Create `tests/fields.test.js`:

```js
// ============================================================
// NFL home fields — profile schema, facts sourcing, index gate, approve, drift helpers.
// Run: node --test tests/fields.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../tools/fields/field-core.cjs');

const profile = (over = {}) => ({
    venueId: '3798', homeTeam: 'GB', name: 'Lambeau Field', surface: 'hybrid', mow: 'stripes-5',
    endzones: {
        left: { fill: '#203731', text: 'GREEN BAY', textColor: '#FFFFFF' },
        right: { fill: '#203731', text: 'PACKERS', textColor: '#FFFFFF' },
    },
    midfield: 'primary-logo', border: '#203731', signature: [], ...over,
});
const fact = (paint) => paint
    ? { source: 'https://example.com/a', photo: 'https://example.com/p.jpg', photoDate: '2026-09-14', checked: '2026-10-06', confidence: 'high' }
    : { source: 'https://example.com/a', checked: '2026-10-06', confidence: 'high' };
const facts = () => ({
    approved: null,
    facts: Object.fromEntries(core.REQUIRED_FACTS.map(k => [k, fact(core.PAINT_FACTS.includes(k))])),
});

test('a complete profile validates', () => {
    assert.deepEqual(core.validateProfile(profile()), []);
});

test('profile rejects bad enums, colors, text and team', () => {
    const p = core.validateProfile(profile({ surface: 'astroturf', mow: 'diagonal', border: 'green', homeTeam: 'XXX',
        endzones: { left: { fill: '#203731', text: 'green bay!', textColor: '#FFF' }, right: { fill: '#203731', text: 'PACKERS', textColor: '#FFFFFF' } } }));
    assert.ok(p.some(m => m.includes('surface')));
    assert.ok(p.some(m => m.includes('mow')));
    assert.ok(p.some(m => m.includes('border')));
    assert.ok(p.some(m => m.includes('homeTeam')));
    assert.ok(p.some(m => m.includes('endzones.left.text')));
    assert.ok(p.some(m => m.includes('endzones.left.textColor')));
});

test('alt-logo and wordmark require an a.espncdn.com image', () => {
    assert.ok(core.validateProfile(profile({ midfield: 'alt-logo' })).some(m => m.includes('midfieldImage')));
    assert.ok(core.validateProfile(profile({ midfield: 'wordmark', midfieldImage: 'https://evil.example/x.png' })).some(m => m.includes('midfieldImage')));
    assert.deepEqual(core.validateProfile(profile({ midfield: 'wordmark', midfieldImage: 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png' })), []);
});

test('NFL_TEAMS is the 32 ESPN abbreviations', () => {
    assert.equal(core.NFL_TEAMS.length, 32);
    assert.equal(new Set(core.NFL_TEAMS).size, 32);
    assert.ok(core.NFL_TEAMS.includes('WSH') && core.NFL_TEAMS.includes('LAR'));
});

test('complete facts validate; every required attribute must be sourced', () => {
    assert.deepEqual(core.validateFacts(facts()), []);
    const f = facts(); delete f.facts.mow;
    assert.ok(core.validateFacts(f).some(m => m.includes('mow')));
});

test('paint facts need a current-season photo', () => {
    const f = facts(); f.facts['endzones.left.fill'].photoDate = '2025-12-01';
    assert.ok(core.validateFacts(f).some(m => m.includes('endzones.left.fill') && m.includes('season')));
    const g = facts(); delete g.facts.border.photo;
    assert.ok(core.validateFacts(g).some(m => m.includes('border') && m.includes('photo')));
});

test('season start follows the NFL calendar', () => {
    assert.equal(core.nflSeasonStart('2026-10-06'), '2026-08-01');
    assert.equal(core.nflSeasonStart('2027-01-20'), '2026-08-01');
    assert.equal(core.nflSeasonStart('2027-03-02'), '2027-08-01');
});

test('lowConfidenceCount counts low facts', () => {
    const f = facts(); f.facts.mow.confidence = 'low'; f.facts.border.confidence = 'low';
    assert.equal(core.lowConfidenceCount(f), 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/fields.test.js`
Expected: FAIL with `Cannot find module '../tools/fields/field-core.cjs'`.

- [ ] **Step 3: Write the implementation**

Create `tools/fields/field-core.cjs`:

```js
'use strict';
// NFL home fields — profile schema + facts sourcing rules (spec 2026-10-05).

const NFL_TEAMS = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
    'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
    'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WSH'];
const SURFACES = ['natural', 'artificial', 'hybrid'];
const MOWS = ['stripes-5', 'stripes-10', 'checker', 'none'];
const MIDFIELDS = ['primary-logo', 'alt-logo', 'wordmark', 'none'];
const CONFIDENCE = ['high', 'medium', 'low'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EZ_TEXT = /^[A-Z0-9 .'&-]{1,16}$/;
const PROFILE_FILE = /^([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z]{2,3})\.json$/;
const PAINT_FACTS = ['mow',
    'endzones.left.fill', 'endzones.left.text', 'endzones.left.textColor',
    'endzones.right.fill', 'endzones.right.text', 'endzones.right.textColor',
    'midfield', 'border'];
const REQUIRED_FACTS = ['name', 'surface', ...PAINT_FACTS];

function validateProfile(p) {
    const out = [];
    if (!p || typeof p !== 'object') return ['profile is not an object'];
    if (typeof p.venueId !== 'string' || !/^\d+$/.test(p.venueId)) out.push('venueId must be a numeric string (ESPN gameInfo.venue.id)');
    if (!NFL_TEAMS.includes(p.homeTeam)) out.push(`homeTeam "${p.homeTeam}" is not an ESPN NFL abbreviation`);
    if (typeof p.name !== 'string' || !p.name.trim()) out.push('name is required');
    if (!SURFACES.includes(p.surface)) out.push(`surface must be one of ${SURFACES.join('|')}`);
    if (!MOWS.includes(p.mow)) out.push(`mow must be one of ${MOWS.join('|')}`);
    for (const side of ['left', 'right']) {
        const ez = p.endzones && p.endzones[side];
        if (!ez) { out.push(`endzones.${side} is required`); continue; }
        if (!HEX.test(ez.fill || '')) out.push(`endzones.${side}.fill must be #RRGGBB`);
        if (!HEX.test(ez.textColor || '')) out.push(`endzones.${side}.textColor must be #RRGGBB`);
        if (!EZ_TEXT.test(ez.text || '')) out.push(`endzones.${side}.text must be 1-16 uppercase letters/digits/space/.'&-`);
    }
    if (!MIDFIELDS.includes(p.midfield)) out.push(`midfield must be one of ${MIDFIELDS.join('|')}`);
    if ((p.midfield === 'alt-logo' || p.midfield === 'wordmark') && !/^https:\/\/a\.espncdn\.com\//.test(p.midfieldImage || '')) {
        out.push('midfieldImage must be an https://a.espncdn.com/ URL when midfield is alt-logo or wordmark');
    }
    if (!HEX.test(p.border || '')) out.push('border must be #RRGGBB');
    if (!Array.isArray(p.signature)) out.push('signature must be an array');
    return out;
}

function nflSeasonStart(dateStr) {
    const [y, m] = dateStr.split('-').map(Number);
    return `${m >= 3 ? y : y - 1}-08-01`;
}

function validateFacts(f) {
    const out = [];
    const facts = (f && f.facts) || {};
    for (const key of REQUIRED_FACTS) {
        const x = facts[key];
        if (!x) { out.push(`${key}: no source`); continue; }
        if (!/^https:\/\//.test(x.source || '')) out.push(`${key}: source must be an https URL`);
        if (!DATE.test(x.checked || '')) out.push(`${key}: checked must be YYYY-MM-DD`);
        if (!CONFIDENCE.includes(x.confidence)) out.push(`${key}: confidence must be ${CONFIDENCE.join('|')}`);
        if (PAINT_FACTS.includes(key)) {
            if (!/^https:\/\//.test(x.photo || '')) out.push(`${key}: paint facts need an https photo`);
            if (!DATE.test(x.photoDate || '')) out.push(`${key}: photoDate must be YYYY-MM-DD`);
            else if (DATE.test(x.checked || '') && x.photoDate < nflSeasonStart(x.checked)) {
                out.push(`${key}: photo predates the ${nflSeasonStart(x.checked).slice(0, 4)} season`);
            }
        }
    }
    if (f && f.approved != null && !DATE.test((f.approved && f.approved.date) || '')) out.push('approved.date must be YYYY-MM-DD');
    return out;
}

function lowConfidenceCount(f) {
    return Object.values((f && f.facts) || {}).filter(x => x && x.confidence === 'low').length;
}

module.exports = { NFL_TEAMS, SURFACES, MOWS, MIDFIELDS, REQUIRED_FACTS, PAINT_FACTS, PROFILE_FILE, validateProfile, validateFacts, lowConfidenceCount, nflSeasonStart };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/fields.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Verify NFL_TEAMS against live ESPN**

Run: `curl -s -A "Mozilla/5.0" "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/teams" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s).sports[0].leagues[0].teams.map(x=>x.team.abbreviation).sort();console.log(t.length,t.join(' '))})"`
Expected: `32` and the same set as `NFL_TEAMS`. If any differ, fix `NFL_TEAMS` and re-run Step 4.

- [ ] **Step 6: Add to CI and commit**

Append ` tests/fields.test.js` to the CI `Unit tests (deploy-check #9)` `run:` line.

```bash
git add tools/fields/field-core.cjs tests/fields.test.js .github/workflows/ci.yml
git commit -m "feat(fields): field profile schema and facts sourcing rules"
```

---

### Task 3: Index builder, launch gate, and approval stamp

**Files:**
- Create: `tools/fields/build-index.cjs`, `tools/fields/approve.cjs`
- Create: `content/nfl/fields/index.json`
- Modify: `tests/fields.test.js`, `.github/workflows/ci.yml`, `.gitignore`

**Interfaces:**
- Consumes: everything from Task 2's `field-core.cjs`.
- Produces:
  - `build-index.cjs` exports `loadFields(dir) → { teams: Entry[], neutral: Entry[], problems: string[] }` where `Entry = { key, slug, profile, facts, file }`; `buildIndex(loaded) → { version: 1, teams: {[key]: profile}, neutral: {[eventId]: profile} }` (approved entries only); `coverageProblems(loaded, teams = NFL_TEAMS) → string[]`; `main(argv) → 0 | 2`.
  - Team index key: `` `${venueId}--${homeTeam}` `` (e.g. `3798--GB`). Neutral key: the ESPN event id (filename stem under `neutral/`).
  - `approve.cjs` exports `approve(dir, slug, today) → 0 | 2`; CLI `node tools/fields/approve.cjs <slug>`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fields.test.js`:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cli = require('../tools/fields/build-index.cjs');
const approveCli = require('../tools/fields/approve.cjs');

function writeField(dir, slug, p, f) {
    fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify(p, null, 2));
    fs.writeFileSync(path.join(dir, `${slug}.facts.json`), JSON.stringify(f, null, 2));
}
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'fields-')); }
const approvedFacts = () => ({ ...facts(), approved: { date: '2026-10-07' } });

test('index includes approved profiles only, keyed venueId--TEAM', () => {
    const dir = tmpDir();
    writeField(dir, 'lambeau-field--gb', profile(), approvedFacts());
    writeField(dir, 'soldier-field--chi', profile({ venueId: '3933', homeTeam: 'CHI', name: 'Soldier Field' }), facts());
    const loaded = cli.loadFields(dir);
    assert.deepEqual(loaded.problems, []);
    const idx = cli.buildIndex(loaded);
    assert.deepEqual(Object.keys(idx.teams), ['3798--GB']);
    assert.equal(idx.teams['3798--GB'].name, 'Lambeau Field');
});

test('filename team must match homeTeam, and facts must exist', () => {
    const dir = tmpDir();
    writeField(dir, 'lambeau-field--chi', profile(), approvedFacts());
    fs.writeFileSync(path.join(dir, 'soldier-field--chi.json'), JSON.stringify(profile({ venueId: '3933', homeTeam: 'CHI' })));
    const { problems } = cli.loadFields(dir);
    assert.ok(problems.some(m => m.includes('lambeau-field--chi') && m.includes('homeTeam')));
    assert.ok(problems.some(m => m.includes('soldier-field--chi') && m.includes('facts')));
});

test('coverage requires every team exactly once and approved', () => {
    const dir = tmpDir();
    writeField(dir, 'lambeau-field--gb', profile(), facts());
    const probs = cli.coverageProblems(cli.loadFields(dir), ['GB', 'CHI']);
    assert.ok(probs.some(m => m.includes('CHI') && m.includes('no field profile')));
    assert.ok(probs.some(m => m.includes('GB') && m.includes('not approved')));
});

test('neutral profiles are keyed by event id and validated only when present', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'neutral'));
    writeField(path.join(dir, 'neutral'), '401872965', profile({ venueId: '5534', homeTeam: 'WSH', name: 'Tottenham Hotspur Stadium' }), approvedFacts());
    const idx = cli.buildIndex(cli.loadFields(dir));
    assert.equal(idx.neutral['401872965'].name, 'Tottenham Hotspur Stadium');
});

test('--check fails on missing coverage and on a stale index, passes once written', () => {
    const dir = tmpDir();
    for (const t of core.NFL_TEAMS) {
        writeField(dir, `stadium-${t.toLowerCase()}--${t.toLowerCase()}`, profile({ homeTeam: t, venueId: String(1000 + core.NFL_TEAMS.indexOf(t)) }), approvedFacts());
    }
    assert.equal(cli.main(['--check', '--dir', dir]), 2);
    assert.equal(cli.main(['--dir', dir]), 0);
    assert.equal(cli.main(['--check', '--dir', dir]), 0);
    fs.unlinkSync(path.join(dir, 'stadium-gb--gb.json'));
    assert.equal(cli.main(['--check', '--dir', dir]), 2);
});

test('approve stamps a valid facts file and refuses an invalid one', () => {
    const dir = tmpDir();
    writeField(dir, 'lambeau-field--gb', profile(), facts());
    assert.equal(approveCli.approve(dir, 'lambeau-field--gb', '2026-10-08'), 0);
    const f = JSON.parse(fs.readFileSync(path.join(dir, 'lambeau-field--gb.facts.json'), 'utf8'));
    assert.deepEqual(f.approved, { date: '2026-10-08' });
    const bad = facts(); delete bad.facts.border;
    writeField(dir, 'soldier-field--chi', profile({ venueId: '3933', homeTeam: 'CHI' }), bad);
    assert.equal(approveCli.approve(dir, 'soldier-field--chi', '2026-10-08'), 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/fields.test.js`
Expected: FAIL with `Cannot find module '../tools/fields/build-index.cjs'`.

- [ ] **Step 3: Write `tools/fields/build-index.cjs`**

```js
#!/usr/bin/env node
// ============================================================
// NFL home fields — index builder + launch gate (spec 2026-10-05).
//   node tools/fields/build-index.cjs            write content/nfl/fields/index.json
//   node tools/fields/build-index.cjs --check    CI gate: every team covered once,
//                                                every profile valid, sourced and
//                                                approved, committed index current
//   node tools/fields/build-index.cjs --gallery  write tools/fields/gallery-data.json
// Exit 0 / 2. Optional --dir <path> for tests.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('./field-core.cjs');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'content', 'nfl', 'fields');
const GALLERY_OUT = path.join(__dirname, 'gallery-data.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function loadDir(dir, neutral, problems) {
    if (!fs.existsSync(dir)) return [];
    const entries = [];
    for (const f of fs.readdirSync(dir).sort()) {
        if (!f.endsWith('.json') || f.endsWith('.facts.json') || f === 'index.json') continue;
        const slug = f.slice(0, -5);
        const m = neutral ? /^\d+$/.exec(slug) : core.PROFILE_FILE.exec(f);
        if (!m) { problems.push(`${f}: bad filename (expected ${neutral ? '<espnEventId>.json' : '<venue-slug>--<team>.json'})`); continue; }
        try {
            const profile = readJson(path.join(dir, f));
            core.validateProfile(profile).forEach(p => problems.push(`${slug}: ${p}`));
            if (!neutral && profile.homeTeam && m[2] !== profile.homeTeam.toLowerCase()) problems.push(`${slug}: filename team "${m[2]}" does not match homeTeam "${profile.homeTeam}"`);
            const factsFile = path.join(dir, `${slug}.facts.json`);
            if (!fs.existsSync(factsFile)) { problems.push(`${slug}: missing ${slug}.facts.json`); continue; }
            const facts = readJson(factsFile);
            core.validateFacts(facts).forEach(p => problems.push(`${slug}: ${p}`));
            const key = neutral ? slug : `${profile.venueId}--${profile.homeTeam}`;
            entries.push({ key, slug, profile, facts, file: path.join(dir, f) });
        } catch (e) {
            problems.push(`${slug}: ${e.message}`);
        }
    }
    return entries;
}

function loadFields(dir = DEFAULT_DIR) {
    const problems = [];
    const teams = loadDir(dir, false, problems);
    const neutral = loadDir(path.join(dir, 'neutral'), true, problems);
    return { teams, neutral, problems };
}

const isApproved = (e) => !!(e.facts && e.facts.approved && e.facts.approved.date);

function buildIndex(loaded) {
    const pick = (list) => Object.fromEntries(list.filter(isApproved).sort((a, b) => a.key.localeCompare(b.key)).map(e => [e.key, e.profile]));
    return { version: 1, teams: pick(loaded.teams), neutral: pick(loaded.neutral) };
}

function coverageProblems(loaded, teams = core.NFL_TEAMS) {
    const out = [];
    for (const t of teams) {
        const mine = loaded.teams.filter(e => e.profile.homeTeam === t);
        if (!mine.length) out.push(`${t}: no field profile`);
        else if (mine.length > 1) out.push(`${t}: ${mine.length} field profiles (expected 1)`);
        else if (!isApproved(mine[0])) out.push(`${t}: ${mine[0].slug} not approved`);
    }
    for (const e of loaded.neutral) if (!isApproved(e)) out.push(`neutral/${e.slug}: not approved`);
    return out;
}

const serialize = (idx) => JSON.stringify(idx, null, 2) + '\n';

function main(argv) {
    const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
    const dir = flag('--dir') || DEFAULT_DIR;
    const loaded = loadFields(dir);
    const indexFile = path.join(dir, 'index.json');
    if (argv.includes('--gallery')) {
        const rows = [...loaded.teams, ...loaded.neutral].map(e => ({ slug: e.slug, key: e.key, profile: e.profile, facts: e.facts, low: core.lowConfidenceCount(e.facts) }));
        rows.sort((a, b) => b.low - a.low || a.slug.localeCompare(b.slug));
        fs.writeFileSync(GALLERY_OUT, JSON.stringify({ rows }, null, 2));
        console.log(`gallery: ${rows.length} fields -> ${GALLERY_OUT}`);
        return 0;
    }
    if (argv.includes('--check')) {
        const problems = [...loaded.problems, ...coverageProblems(loaded)];
        const committed = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : null;
        if (committed !== serialize(buildIndex(loaded))) problems.push('index.json is missing or stale: run node tools/fields/build-index.cjs');
        problems.forEach(p => console.error(`✗ ${p}`));
        if (!problems.length) console.log(`fields: ${loaded.teams.length} team + ${loaded.neutral.length} neutral profiles, all valid, sourced and approved`);
        return problems.length ? 2 : 0;
    }
    if (loaded.problems.length) { loaded.problems.forEach(p => console.error(`✗ ${p}`)); return 2; }
    fs.writeFileSync(indexFile, serialize(buildIndex(loaded)));
    console.log(`wrote ${indexFile}`);
    return 0;
}

module.exports = { loadFields, buildIndex, coverageProblems, main };
if (require.main === module) process.exit(main(process.argv.slice(2)));
```

- [ ] **Step 4: Write `tools/fields/approve.cjs`**

```js
#!/usr/bin/env node
// Owner approval stamp: node tools/fields/approve.cjs <slug>   (e.g. lambeau-field--gb, or neutral/401872965)
// Run only after comparing the rendered field to its photo in the review gallery.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('./field-core.cjs');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'content', 'nfl', 'fields');

function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function approve(dir, slug, today = localToday()) {
    const file = path.join(dir, `${slug}.facts.json`);
    if (!fs.existsSync(file)) { console.error(`✗ no ${file}`); return 2; }
    const facts = JSON.parse(fs.readFileSync(file, 'utf8'));
    const problems = core.validateFacts({ ...facts, approved: null });
    if (problems.length) { problems.forEach(p => console.error(`✗ ${slug}: ${p}`)); return 2; }
    facts.approved = { date: today };
    fs.writeFileSync(file, JSON.stringify(facts, null, 2) + '\n');
    console.log(`approved ${slug} (${today})`);
    return 0;
}

module.exports = { approve };
if (require.main === module) {
    const slug = process.argv[2];
    if (!slug) { console.error('usage: node tools/fields/approve.cjs <slug>'); process.exit(2); }
    process.exit(approve(DEFAULT_DIR, slug));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/fields.test.js`
Expected: PASS (14 tests).

- [ ] **Step 6: Seed the empty index, gitignore gallery data, add the CI gate**

Run: `node tools/fields/build-index.cjs`
Expected: `wrote …content/nfl/fields/index.json` containing exactly:

```json
{
  "version": 1,
  "teams": {},
  "neutral": {}
}
```

Append to `.gitignore`:

```
tools/fields/gallery-data.json
```

In `.github/workflows/ci.yml`, add as the LAST step (after the NUL-byte scan, so the other checks still report while research is in progress):

```yaml
      - name: NFL home fields — all 32 researched, sourced, approved; index current
        run: node tools/fields/build-index.cjs --check
```

Run: `node tools/fields/build-index.cjs --check`
Expected: exit 2 with 32 `no field profile` lines. **This is the intended state until research completes; it is the launch gate.**

- [ ] **Step 7: Commit**

```bash
git add tools/fields/build-index.cjs tools/fields/approve.cjs tests/fields.test.js content/nfl/fields/index.json .gitignore .github/workflows/ci.yml
git commit -m "feat(fields): index builder, 32-field launch gate, and approval stamp"
```

---

### Task 4: Profile resolution and generated fallbacks

**Files:**
- Modify: `js/fieldViewer.js`
- Modify: `tests/fieldViewer.test.js`

**Interfaces:**
- Consumes: index shape from Task 3 (`{ version, teams: {'<venueId>--<ABBR>': profile}, neutral: {'<eventId>': profile} }`).
- Produces (on `FieldViewer`):
  - `resolveField({ index, venueId, homeAbbr, eventId, neutralSite })` → `{ source: 'neutral-researched' | 'neutral-generated' | 'team' | 'generated', profile: object | null }`
  - `generatedProfile({ homeLocation, homeName, homeColor, neutral })` → profile object (Task 2 shape) plus `generated: true`

- [ ] **Step 1: Write the failing tests**

Append to `tests/fieldViewer.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/fieldViewer.test.js`
Expected: FAIL with `FV.resolveField is not a function`.

- [ ] **Step 3: Implement**

In `js/fieldViewer.js`, insert immediately above the `return {` line:

```js
    function resolveField({ index, venueId, homeAbbr, eventId, neutralSite }) {
        if (neutralSite) {
            const p = index && index.neutral && index.neutral[String(eventId)];
            return p ? { source: 'neutral-researched', profile: p } : { source: 'neutral-generated', profile: null };
        }
        const p = index && index.teams && index.teams[`${venueId}--${homeAbbr}`];
        return p ? { source: 'team', profile: p } : { source: 'generated', profile: null };
    }

    // Built only from facts true of any team's field (its colors, names, logo),
    // so it never claims stadium-specific paint.
    function generatedProfile({ homeLocation, homeName, homeColor, neutral }) {
        const ez = (text) => ({ fill: homeColor || '#3a3f47', text: String(text || '').toUpperCase(), textColor: '#ffffff' });
        return {
            generated: true,
            surface: 'natural',
            mow: neutral ? 'none' : 'stripes-5',
            endzones: { left: ez(homeLocation), right: ez(homeName) },
            midfield: neutral ? 'none' : 'primary-logo',
            border: '#2a2f37',
            signature: [],
        };
    }
```

Replace the `return {` line with:

```js
    return { GLYPH_REF, MIDFIELD_YARDS, geometry, lineTransform, lineCss, glideMs, layoutEndzoneText, midfieldPlacement, resolveField, generatedProfile };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/fieldViewer.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add js/fieldViewer.js tests/fieldViewer.test.js
git commit -m "feat(fields): profile resolution and generated fallback fields"
```

---

### Task 5: Static field SVG builder, dynamic state, play arrow

**Files:**
- Modify: `js/fieldViewer.js`
- Modify: `tests/fieldViewer.test.js`

**Interfaces:**
- Consumes: `geometry`, `layoutEndzoneText`, `midfieldPlacement`, `lineTransform` (Task 1); profile shape (Task 2).
- Produces (on `FieldViewer`):
  - `buildStaticSvg(g, profile, opts)` → SVG inner markup string. `opts = { idp: string, homeLogo: string, awayLogo: string }`. Contains placeholders the instance fills: `[data-fv="rz"]`, `[data-fv="rz-clip"]`, `[data-fv="fd"]` (contains `[data-fv="fd-line"]`), `[data-fv="scrim"]`, `[data-fv="arrow"]`, `[data-fv="ball"]` (contains `[data-fv="ball-fill"]`). Every `id` starts with `opts.idp`.
  - `dynamicState(g, sit, homeTeamId)` → `{ possHome, scrim, firstDown, ball: {x, y, scale}, redZone: [{x,y}×4] | null, isDown4 }` (`scrim`/`firstDown` are `lineTransform` results)
  - `arrowSvg(g, sit, isNew, markerId)` → markup string (`''` when there is nothing to draw)

- [ ] **Step 1: Write the failing tests**

Append to `tests/fieldViewer.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/fieldViewer.test.js`
Expected: FAIL with `FV.buildStaticSvg is not a function`.

- [ ] **Step 3: Implement**

In `js/fieldViewer.js`, insert immediately above the `return {` line:

```js
    const TURF = {
        natural:    { base: '#1a5c2c', light: '#1f6f37', dark: '#184f26' },
        hybrid:     { base: '#1a5c2c', light: '#1f6f37', dark: '#184f26' },
        artificial: { base: '#1b6331', light: '#22723b', dark: '#1d6634' },
    };
    const f1 = (n) => n.toFixed(1);
    const pts = (list) => list.map(p => `${f1(p.x)},${f1(p.y)}`).join(' ');
    const quad = (g, x0, x1, y0, y1) => pts([g.proj(x0, y0), g.proj(x1, y0), g.proj(x1, y1), g.proj(x0, y1)]);
    const line = (a, b, stroke, w) => `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${stroke}" stroke-width="${w.toFixed(2)}"/>`;

    function mowBands(mow) {
        if (mow === 'none') return [];
        const step = mow === 'stripes-10' ? 10 : 5, rows = mow === 'checker' ? 4 : 1;
        const bands = [];
        for (let x0 = 0, i = 0; x0 < 100; x0 += step, i++) {
            for (let r = 0; r < rows; r++) bands.push({ x0, x1: x0 + step, y0: r / rows, y1: (r + 1) / rows, dark: (i + r) % 2 === 0 });
        }
        return bands;
    }

    function endzoneSvg(g, ez, side, clipId, hatchId) {
        const [x0, x1] = side === 'left' ? [-10, 0] : [100, 110];
        const glyphs = layoutEndzoneText(g, ez.text, side).map(t =>
            `<text class="fv-ez-glyph" font-size="${GLYPH_REF}" text-anchor="middle" dominant-baseline="central" transform="translate(${f1(t.x)},${f1(t.y)}) rotate(${t.angle.toFixed(2)}) scale(${t.sx.toFixed(4)},${t.sy.toFixed(4)})">${_escHtml(t.ch)}</text>`).join('');
        return `<polygon points="${quad(g, x0, x1, 0, 1)}" fill="${_escHtml(ez.fill)}"/>`
            + `<rect width="${g.w}" height="${g.h}" fill="url(#${hatchId})" clip-path="url(#${clipId})"/>`
            + `<g class="fv-ez-text" fill="${_escHtml(ez.textColor)}">${glyphs}</g>`;
    }

    function midfieldSvg(g, profile, opts) {
        const href = profile.midfield === 'primary-logo' ? opts.homeLogo
            : (profile.midfield === 'alt-logo' || profile.midfield === 'wordmark') ? profile.midfieldImage : '';
        if (!href) return '';
        const m = midfieldPlacement(g);
        return `<g transform="translate(${f1(m.x)},${f1(m.y)}) scale(1,${m.squash.toFixed(4)})"><image class="fv-midfield" href="${_escHtml(href)}" x="${f1(-m.size / 2)}" y="${f1(-m.size / 2)}" width="${f1(m.size)}" height="${f1(m.size)}" preserveAspectRatio="xMidYMid meet"/></g>`;
    }

    function linesSvg(g) {
        const u = g.unit;
        let s = '';
        [0, 1].forEach(yF => { s += line(g.proj(-10, yF), g.proj(110, yF), 'rgba(255,255,255,0.85)', 3 * u); });
        for (let x = 0; x <= 100; x += 10) {
            const goal = x === 0 || x === 100;
            s += line(g.proj(x, 0), g.proj(x, 1), `rgba(255,255,255,${goal ? 0.85 : 0.45})`, (goal ? 3 : 1.6) * u);
        }
        // Real hash marks sit 70'9" apart on a 160'-wide field: 27.9% in from each sideline.
        for (let x = 5; x < 100; x += 10) {
            [0.28, 0.72].forEach(yF => {
                const c = g.proj(x, yF), k = g.scaleAt(yF) * u;
                s += line({ x: c.x - 5 * k, y: c.y }, { x: c.x + 5 * k, y: c.y }, 'rgba(255,255,255,0.4)', 2 * k);
            });
        }
        return s;
    }

    // The 50 is equidistant from both goals, so it gets no direction chevron.
    function numbersSvg(g) {
        const ty = g.h / 400;
        let s = '';
        for (let x = 10; x <= 90; x += 10) {
            const num = x <= 50 ? x : 100 - x;
            const dir = x === 50 ? 0 : (x < 50 ? -1 : 1);
            [{ yF: 0.1, size: 34 }, { yF: 0.9, size: 18 }].forEach(({ yF, size }) => {
                const p = g.proj(x, yF), fs = size * ty;
                s += `<text class="fv-yardnum" x="${f1(p.x)}" y="${f1(p.y)}" font-size="${f1(fs)}" text-anchor="middle" dominant-baseline="middle">${num}</text>`;
                if (!dir) return;
                const cx = p.x + dir * 0.75 * fs, cw = 0.18 * fs, ch = 0.24 * fs;
                s += `<polygon points="${f1(cx + dir * cw)},${f1(p.y)} ${f1(cx - dir * cw)},${f1(p.y - ch)} ${f1(cx - dir * cw)},${f1(p.y + ch)}" fill="rgba(255,255,255,0.55)"/>`;
            });
        }
        return s;
    }

    function pylonsSvg(g) {
        const u = g.unit;
        return [0, -10, 100, 110].map(xF => [0, 1].map(yF => {
            const b = g.proj(xF, yF), k = g.scaleAt(yF) * u, h = 14 * k, w = 5 * k;
            return `<polygon points="${f1(b.x - w)},${f1(b.y)} ${f1(b.x + w)},${f1(b.y)} ${f1(b.x)},${f1(b.y - h)}" fill="var(--accent)" stroke="rgba(0,0,0,0.35)" stroke-width="${(0.6 * u).toFixed(2)}"/>`;
        }).join('')).join('');
    }

    // The crossbar follows the back line's projected slope (it is parallel to
    // the end line in real life); uprights and the post rise straight up.
    function goalpostSvg(g, xF) {
        const p0 = g.proj(xF, 0), p1 = g.proj(xF, 1);
        const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
        const ux = (p1.x - p0.x) / len, uy = (p1.y - p0.y) / len;
        const base = g.proj(xF, 0.5), k = g.scaleAt(0.5), ty = g.h / 400, u = g.unit;
        const postH = 105 * k * ty, crossW = 62 * k * u, uprightH = 70 * k * ty;
        const cC = { x: base.x, y: base.y - postH };
        const cL = { x: cC.x - ux * crossW / 2, y: cC.y - uy * crossW / 2 };
        const cR = { x: cC.x + ux * crossW / 2, y: cC.y + uy * crossW / 2 };
        const seg = (a, b) => `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}"/>`;
        return `<g stroke="#ffd21f" stroke-width="${(4 * k * u).toFixed(2)}" fill="none" stroke-linecap="round">`
            + seg(base, cC) + seg(cL, cR) + seg(cL, { x: cL.x, y: cL.y - uprightH }) + seg(cR, { x: cR.x, y: cR.y - uprightH }) + '</g>';
    }

    function ballSvg(sheenId) {
        return `<g class="fv-dyn" data-fv="ball">`
            + `<ellipse data-fv="ball-fill" cx="0" cy="0" rx="17" ry="10.5" stroke="var(--bg-card)" stroke-width="2"/>`
            + `<ellipse cx="0" cy="0" rx="17" ry="10.5" fill="url(#${sheenId})"/>`
            + `<path d="M-11,0 Q0,-8 11,0" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.9"/>`
            + `<path d="M-11,0 Q0,8 11,0" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.9"/>`
            + `<line x1="-3.5" y1="0" x2="3.5" y2="0" stroke="#fff" stroke-width="1.1" stroke-opacity="0.9"/>`
            + [-1.5, 0, 1.5].map(x => `<line x1="${x}" y1="-2" x2="${x}" y2="2" stroke="#fff" stroke-width="0.8" stroke-opacity="0.9"/>`).join('')
            + `</g>`;
    }

    function buildStaticSvg(g, profile, opts) {
        const id = (s) => `${opts.idp}${s}`;
        const u = g.unit;
        const turf = TURF[profile.surface] || TURF.natural;
        const refLine = (key, stroke, w) => `<g class="fv-dyn" data-fv="${key}"><line${key === 'fd' ? ' data-fv="fd-line"' : ''} x1="${f1(g.cx)}" y1="${f1(g.bottomY)}" x2="${f1(g.cx)}" y2="${f1(g.topY)}" stroke="${stroke}" stroke-width="${(w * u).toFixed(2)}"/></g>`;
        const badge = opts.awayLogo ? (() => {
            const p = g.proj(-5, 1), size = Math.max(16, 22 * u);
            return `<image class="fv-away-badge" href="${_escHtml(opts.awayLogo)}" x="${f1(p.x - size / 2)}" y="${f1(p.y - size - 4 * u)}" width="${f1(size)}" height="${f1(size)}" preserveAspectRatio="xMidYMid meet"/>`;
        })() : '';
        return `<defs>`
            + `<pattern id="${id('hatch')}" width="${f1(14 * u)}" height="${f1(14 * u)}" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="${f1(7 * u)}" height="${f1(14 * u)}" fill="rgba(255,255,255,0.09)"/></pattern>`
            + `<clipPath id="${id('ezL')}"><polygon points="${quad(g, -10, 0, 0, 1)}"/></clipPath>`
            + `<clipPath id="${id('ezR')}"><polygon points="${quad(g, 100, 110, 0, 1)}"/></clipPath>`
            + `<clipPath id="${id('rz')}"><polygon data-fv="rz-clip" points=""/></clipPath>`
            + `<linearGradient id="${id('sheen')}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fff" stop-opacity="0.4"/><stop offset="45%" stop-color="#fff" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.28"/></linearGradient>`
            + `<marker id="${id('arrow')}" markerUnits="userSpaceOnUse" markerWidth="${f1(14 * u)}" markerHeight="${f1(14 * u)}" refX="${f1(10.5 * u)}" refY="${f1(7 * u)}" orient="auto"><path d="M0,0 L${f1(14 * u)},${f1(7 * u)} L0,${f1(14 * u)} Z" class="fv-arrow-head"/></marker>`
            + `</defs>`
            + `<polygon points="${quad(g, -11, 111, -0.05, 1.05)}" fill="${_escHtml(profile.border)}"/>`
            + `<polygon points="${quad(g, -10, 110, 0, 1)}" fill="${turf.base}"/>`
            + mowBands(profile.mow).map(b => `<polygon data-fv-band points="${quad(g, b.x0, b.x1, b.y0, b.y1)}" fill="${b.dark ? turf.dark : turf.light}"/>`).join('')
            + endzoneSvg(g, profile.endzones.left, 'left', id('ezL'), id('hatch'))
            + endzoneSvg(g, profile.endzones.right, 'right', id('ezR'), id('hatch'))
            + midfieldSvg(g, profile, opts)
            + `<g data-fv="rz"></g>`
            + linesSvg(g) + numbersSvg(g)
            + refLine('fd', 'var(--color-first-down)', 3.5)
            + refLine('scrim', 'var(--color-scrimmage)', 3)
            + `<g data-fv="arrow"></g>`
            + pylonsSvg(g) + goalpostSvg(g, -10) + goalpostSvg(g, 110)
            + ballSvg(id('sheen'))
            + badge;
    }

    // yardLine is anchored to the HOME goal (0 = home goal, 100 = away goal);
    // display space mirrors it so the away goal sits on the left, matching the
    // score header's away-left/home-right order.
    function dynamicState(g, sit, homeTeamId) {
        const possHome = String(sit.possession) === String(homeTeamId);
        const disp = (v) => 100 - v;
        const fd = possHome ? Math.min(100, sit.yardLine + (sit.distance || 0)) : Math.max(0, sit.yardLine - (sit.distance || 0));
        const ball = g.proj(disp(sit.yardLine), 0.5);
        const rz = sit.isRedZone ? (possHome ? [disp(100), disp(80)] : [disp(20), disp(0)]) : null;
        return {
            possHome,
            scrim: lineTransform(g, disp(sit.yardLine)),
            firstDown: lineTransform(g, disp(fd)),
            ball: { x: ball.x, y: ball.y, scale: g.scaleAt(0.5) * g.unit },
            redZone: rz ? [g.proj(rz[0], 0), g.proj(rz[1], 0), g.proj(rz[1], 1), g.proj(rz[0], 1)] : null,
            isDown4: sit.down === 4,
        };
    }

    function arrowSvg(g, sit, isNew, markerId) {
        const lp = sit.lastPlay;
        if (!lp || !lp.type || typeof lp.start?.yardLine !== 'number' || typeof lp.end?.yardLine !== 'number') return '';
        const label = (lp.type.text || '').toLowerCase();
        if (/timeout|two-minute|end of|coin toss|kneel|spike|penalty/.test(label)) return '';
        const cls = 'fv-arrow' + (isNew ? ' fv-arrow--entering' : '');
        const p1 = g.proj(100 - lp.start.yardLine, 0.5), p2 = g.proj(100 - lp.end.yardLine, 0.5);
        const u = g.unit, ty = g.h / 400;
        if (/incomplet/.test(label)) {
            const r = 4.2 * u;
            return `<g class="${cls}" transform="translate(${f1(p1.x)},${f1(p1.y)})"><circle r="${f1(9 * u)}" class="fv-arrow-badge-ring"/><path d="M${f1(-r)},${f1(-r)} L${f1(r)},${f1(r)} M${f1(-r)},${f1(r)} L${f1(r)},${f1(-r)}" class="fv-arrow-badge-x"/></g>`;
        }
        let kind = 'run', apex = 0;
        if (/sack/.test(label)) kind = 'sack';
        else if (/interception|fumble/.test(label)) kind = 'turnover';
        else if (/punt|kickoff/.test(label)) { kind = 'kick'; apex = 70; }
        else if (/field goal|extra point/.test(label)) { kind = 'kick'; apex = 40; }
        else if (/pass/.test(label)) { kind = 'pass'; apex = 26; }
        const d = apex === 0
            ? `M${f1(p1.x)},${f1(p1.y)} L${f1(p2.x)},${f1(p2.y)}`
            : `M${f1(p1.x)},${f1(p1.y)} Q${f1((p1.x + p2.x) / 2)},${f1(p1.y - apex * ty)} ${f1(p2.x)},${f1(p2.y)}`;
        return `<g class="${cls} fv-arrow--${kind}"><path d="${d}" class="fv-arrow-path" marker-end="url(#${markerId})"/></g>`;
    }
```

Replace the `return {` line with:

```js
    return { GLYPH_REF, MIDFIELD_YARDS, geometry, lineTransform, lineCss, glideMs, layoutEndzoneText, midfieldPlacement, resolveField, generatedProfile, buildStaticSvg, dynamicState, arrowSvg };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/fieldViewer.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add js/fieldViewer.js tests/fieldViewer.test.js
git commit -m "feat(fields): static field SVG builder, dynamic state, play arrow"
```

---

### Task 6: The mountable instance and its CSS

**Files:**
- Modify: `js/fieldViewer.js`
- Modify: `css/nflLiveGame.css`

**Interfaces:**
- Consumes: everything in `FieldViewer` from Tasks 1, 4 and 5.
- Produces: `FieldViewer.mount(host, o)` → `{ host, update(sit), setProfile(profile), destroy() }` where
  `o = { profile, home: {abbr, name, logo, color}, away: {abbr, name, logo, color}, homeTeamId, indoor: boolean, venueLabel: string }`.
  `sit` is ESPN's `/scoreboard` `competitions[0].situation` (`down, distance, yardLine, possession, isRedZone, downDistanceText, shortDownDistanceText, possessionText, homeTimeouts, awayTimeouts, lastPlay`).

This task is DOM code; its pure parts are already tested. It is verified in the browser in Task 7 and in the gallery in Task 9.

- [ ] **Step 1: Implement the instance**

In `js/fieldViewer.js`, insert immediately above the `return {` line:

```js
    let seq = 0;

    function retrigger(el, cls) {
        el.classList.remove(cls);
        void el.getBoundingClientRect();
        el.classList.add(cls);
    }

    function toplineHtml(sit, o, possHome) {
        const t = possHome ? o.home : o.away;
        const mark = t.logo
            ? `<img class="fv-poss-logo" src="${_escHtml(t.logo)}" alt="" data-hide-on-error>`
            : `<span class="fv-poss-dot" style="background:${_escHtml(t.color)}"></span>`;
        const label = t.name ? `${_escHtml(t.name)} ball` : _escHtml(sit.possessionText || '');
        return `<span class="fv-dd">${_escHtml(sit.downDistanceText || sit.shortDownDistanceText || '')}</span><span class="fv-poss">${mark}${label}</span>`;
    }

    // A burned timeout flashes once (count dropped since the last render).
    function legendHtml(sit, o, st) {
        const dots = (n, team) => {
            const prev = st.lastTimeouts[team];
            const used = (typeof n === 'number' && typeof prev === 'number' && n < prev) ? n : -1;
            if (typeof n === 'number') st.lastTimeouts[team] = n;
            return Array.from({ length: 3 }, (_, i) =>
                `<div class="fv-to-dot${i < (n ?? 3) ? ' fv-to-dot--on' : ''}${i === used ? ' fv-to-dot--used' : ''}"></div>`).join('');
        };
        return `<div class="fv-timeouts"><span class="fv-to-label">${_escHtml(o.away.abbr)} TO</span><div class="fv-to-dots">${dots(sit.awayTimeouts, 'away')}</div></div>`
            + `<div class="fv-key"><span><i style="background:var(--color-scrimmage)"></i>Scrimmage</span>`
            + (sit.isRedZone ? `<span><i style="background:var(--color-loss)"></i>Red zone</span>` : `<span><i style="background:var(--color-first-down)"></i>1st down</span>`)
            + (o.venueLabel ? `<span class="fv-venue">${_escHtml(o.venueLabel)}</span>` : '')
            + `</div>`
            + `<div class="fv-timeouts"><div class="fv-to-dots">${dots(sit.homeTimeouts, 'home')}</div><span class="fv-to-label">${_escHtml(o.home.abbr)} TO</span></div>`;
    }

    function mount(host, o) {
        const idp = `fv${++seq}-`;
        const id = (s) => `${idp}${s}`;
        host.innerHTML = `<div class="field-viewer">`
            + `<div class="fv-topline"></div>`
            + `<div class="fv-field3d${o.indoor ? ' fv-field3d--indoor' : ''}"><svg class="fv-field3d-svg" xmlns="http://www.w3.org/2000/svg"></svg></div>`
            + `<div class="fv-legend"></div></div>`;
        const root = host.firstElementChild;
        const box = root.querySelector('.fv-field3d'), svg = root.querySelector('svg');
        const topEl = root.querySelector('.fv-topline'), legEl = root.querySelector('.fv-legend');
        const $ = (key) => svg.querySelector(`[data-fv="${key}"]`);
        const st = { profile: o.profile, g: null, sit: null, prev: null, lastTimeouts: { home: null, away: null }, lastDown: null, lastPlayId: null };
        let lastW = 0, lastH = 0, raf = 0;

        function apply(sit, instant) {
            const g = st.g;
            if (!g || !sit) return;
            const d = dynamicState(g, sit, o.homeTeamId);
            const move = (key, transform, distPx) => {
                const el = $(key);
                el.style.setProperty('--fv-glide', `${glideMs(distPx)}ms`);
                el.style.transform = transform;
            };
            const p = st.prev;
            move('scrim', lineCss(d.scrim), p ? d.scrim.bottomX - p.scrimX : 0);
            move('fd', lineCss(d.firstDown), p ? d.firstDown.bottomX - p.fdX : 0);
            move('ball', `translate(${f1(d.ball.x)}px,${f1(d.ball.y)}px) scale(${d.ball.scale.toFixed(3)})`, p ? Math.hypot(d.ball.x - p.ballX, d.ball.y - p.ballY) : 0);
            st.prev = { scrimX: d.scrim.bottomX, fdX: d.firstDown.bottomX, ballX: d.ball.x, ballY: d.ball.y };

            const fdLine = $('fd-line');
            fdLine.setAttribute('stroke', d.isDown4 ? 'var(--color-loss)' : 'var(--color-first-down)');
            fdLine.classList.toggle('fv-down4-line', d.isDown4);
            $('ball-fill').setAttribute('fill', d.possHome ? o.home.color : o.away.color);

            if (d.redZone) {
                const rp = pts(d.redZone), u = g.unit;
                $('rz-clip').setAttribute('points', rp);
                $('rz').innerHTML = `<polygon points="${rp}" fill="rgba(229,72,77,0.22)"/>`
                    + `<rect width="${g.w}" height="${g.h}" fill="url(#${id('hatch')})" clip-path="url(#${id('rz')})"/>`
                    + `<polygon points="${rp}" fill="none" stroke="rgba(229,72,77,0.6)" stroke-width="${(2 * u).toFixed(2)}" stroke-dasharray="${f1(6 * u)} ${f1(5 * u)}"/>`;
            } else {
                $('rz').innerHTML = '';
            }

            const playId = sit.lastPlay && sit.lastPlay.id;
            const isNewPlay = !instant && !!playId && st.lastPlayId !== null && playId !== st.lastPlayId;
            $('arrow').innerHTML = arrowSvg(g, sit, isNewPlay, id('arrow'));
            if (!instant) {
                if (sit.down === 1 && st.lastDown != null && st.lastDown !== 1) retrigger($('fd'), 'fv-fd-flash');
                if (isNewPlay && /interception|fumble/.test((sit.lastPlay.type?.text || '').toLowerCase())) retrigger($('ball'), 'fv-ball--turnover');
            }
            if (playId) st.lastPlayId = playId;
            if (typeof sit.down === 'number') st.lastDown = sit.down;

            topEl.innerHTML = toplineHtml(sit, o, d.possHome);
            legEl.innerHTML = legendHtml(sit, o, st);
        }

        function build() {
            const w = Math.round(box.clientWidth), h = Math.round(box.clientHeight);
            if (!w || !h) return;
            lastW = w; lastH = h;
            st.g = geometry(w, h);
            st.prev = null;
            root.classList.remove('fv-motion');
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            svg.setAttribute('width', String(w));
            svg.setAttribute('height', String(h));
            svg.innerHTML = buildStaticSvg(st.g, st.profile, { idp, homeLogo: o.home.logo, awayLogo: o.away.logo });
            apply(st.sit, true);
            requestAnimationFrame(() => root.classList.add('fv-motion'));
        }

        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                if (Math.round(box.clientWidth) !== lastW || Math.round(box.clientHeight) !== lastH) build();
            });
        }) : null;
        if (ro) ro.observe(box);
        build();

        return {
            host,
            update(sit) { st.sit = sit; if (!st.g) build(); else apply(sit, false); },
            setProfile(profile) { st.profile = profile; build(); },
            destroy() { if (ro) ro.disconnect(); cancelAnimationFrame(raf); host.innerHTML = ''; },
        };
    }
```

Replace the `return {` line with:

```js
    return { GLYPH_REF, MIDFIELD_YARDS, geometry, lineTransform, lineCss, glideMs, layoutEndzoneText, midfieldPlacement, resolveField, generatedProfile, buildStaticSvg, dynamicState, arrowSvg, mount };
```

- [ ] **Step 2: Run the tests (no regressions)**

Run: `node --test tests/fieldViewer.test.js`
Expected: PASS (11 tests). `mount` is not called in Node; the file must still load in `vm`.

- [ ] **Step 3: Add the new-renderer CSS**

First run `grep -n "fv-dyn\|fv-motion\|fv-ez-glyph\|fv-yardnum\|fv-fd-flash\|fv-ball--turnover\|fv-field3d--indoor\|fv-venue\|fv-midfield\|fv-away-badge" css/*.css` (CLAUDE.md rule 9, cascade safety). Expected: no matches. Then in `css/nflLiveGame.css`, append directly after the existing `.fv-field3d::after { … }` rule:

```css
/* Pixel-space renderer (js/fieldViewer.js): dynamic markers are persistent and
   moved by transform, so a CSS transition does the glide. transform-box/origin
   pin SVG transforms to the field's own px coordinates. */
.fv-dyn { transform-box: view-box; transform-origin: 0 0; }
.fv-motion .fv-dyn { transition: transform var(--fv-glide, 420ms) cubic-bezier(0.16, 1, 0.3, 1); }
.fv-ez-glyph, .fv-yardnum { font-family: var(--font-display); font-weight: 800; }
.fv-yardnum { fill: rgba(255,255,255,0.78); }
.fv-fd-flash line { animation: fvFdFlash 900ms ease-out; }
@keyframes fvFdFlash { 30% { filter: drop-shadow(0 0 8px var(--color-first-down-glow)); } }
.fv-ball--turnover [data-fv="ball-fill"] { animation: fvTurnover 900ms ease-out; }
@keyframes fvTurnover { from { fill: var(--color-loss); } }
.fv-field3d--indoor::after { background: radial-gradient(ellipse 80% 100% at 50% 0%, rgba(255,255,255,0.06), transparent 70%), linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, transparent 30%, transparent 75%, rgba(0,0,0,0.30) 100%); }
.fv-venue { color: var(--text-subtle); font-weight: 700; }
@media (prefers-reduced-motion: reduce) {
    .fv-motion .fv-dyn { transition: none; }
    .fv-fd-flash line, .fv-ball--turnover [data-fv="ball-fill"] { animation: none; }
}
```

- [ ] **Step 4: Commit**

```bash
git add js/fieldViewer.js css/nflLiveGame.css
git commit -m "feat(fields): mountable field instance with static/dynamic layers"
```

---

### Task 7: Integrate into the NFL live game page and delete the old renderer

**Files:**
- Modify: `js/nflLiveGame.js`, `js/nfl.js`, `css/nflLiveGame.css`

**Interfaces:**
- Consumes: `FieldViewer.mount/resolveField/generatedProfile` (Tasks 4, 6); index at `/content/nfl/fields/index.json` (Task 3).
- Produces (globals in `js/nflLiveGame.js`): `_nlgTeamLogo(team) → string`, `_nlgFieldProfileFor(data) → {source, profile}`, `_nlgEnsureField(home, away, homeTeamId, tc) → instance | null`, `_nlgLoadFieldIndex() → Promise<void>`. `_nlg` gains `field`, `fieldSource`, `fieldIndex`.
- `fetchNFLLiveSituation` return gains `venueIndoor: boolean`.

- [ ] **Step 1: Confirm what the old renderer's names touch**

Run: `grep -rn "_FV\b\|_FV\.\|_FV_GLIDE\|_nlgGlideDuration\|_nlgAnimateFieldMotion\|_nlgFieldViewerHtml\|_nlgPlayArrowSvg\|fvLastPositions\|fvPendingPositions\|lastPlayArrowId\|lastTimeouts\|lastDown\b" js/ tests/`
Expected: matches only inside `js/nflLiveGame.js` — the definitions being deleted, the `_nlg` state literal (line ~28), the `isNewGame` reset (line ~141), and `_nlgRenderHeader`. `js/ncaafLiveGame.js` may mention `_nlgFieldViewerHtml` in a comment; that is fine. **If any other code references one of these names, stop and report it before deleting.**

- [ ] **Step 2: Return `venueIndoor` from the situation fetch**

In `js/nfl.js` `fetchNFLLiveSituation`, change the returned object to:

```js
    return {
        situation:  comp.situation || null,
        homeTeamId: home?.team?.id || null,
        awayTeamId: away?.team?.id || null,
        venueIndoor: comp.venue?.indoor === true,
    };
```

- [ ] **Step 3: Update `_nlg` state and the new-game reset**

In the `const _nlg = { … }` literal, delete `lastPlayArrowId: null, `, `lastTimeouts: { home: null, away: null }, `, `lastDown: null, `, `fvLastPositions: null, `, `fvPendingPositions: null, ` and add `field: null, fieldSource: null, fieldIndex: null, `.

In the `if (isNewGame) { … }` reset in `showNFLGame`, delete `_nlg.lastTimeouts = { home: null, away: null }; `, `_nlg.lastDown = null; `, `_nlg.fvLastPositions = null; `, `_nlg.fvPendingPositions = null; ` and add at the start of that block:

```js
if (_nlg.field) { _nlg.field.destroy(); _nlg.field = null; } _nlg.fieldSource = null;
```

Directly after that `if (isNewGame) { … }` line, add:

```js
    _nlgLoadFieldIndex();
```

- [ ] **Step 4: Give the field a persistent slot in the shell**

In `_nlgRender`'s first-render shell template, replace `<div class="nlg-header"></div>` with:

```html
            <div class="nlg-header"><div class="nlg-header-pin"></div><div class="nlg-field-host"><div class="nlg-field-slot" hidden></div><div class="nlg-break-slot"></div></div></div>
```

(The field stays inside `.nlg-header` so the sticky `.nlg-header-pin` keeps the same parent box; only the pin's contents are rewritten per poll.)

- [ ] **Step 5: Rewrite the field part of `_nlgRenderHeader`**

Replace the `const fieldHtml = breakInfo ? … : '';` statement with:

```js
    const showField = !breakInfo && !!sit && typeof sit.down === 'number' && sit.down >= 1 && typeof sit.yardLine === 'number' && !!possResolves;
```

In the `sitLine` expression, replace `(fieldHtml && !breakInfo` with `(showField`.

Replace the whole `headerEl.innerHTML = \`…\`;` assignment and the following `if (fieldHtml && !breakInfo) _nlgAnimateFieldMotion();` line with:

```js
    const pinEl = headerEl.querySelector('.nlg-header-pin');
    if (pinEl) pinEl.innerHTML = `
          <div class="nlg-score ${live ? 'nlg-score--live' : ''}${isBattle ? ' nlg-score--battle' : ''}">
            ${teamBlock(away, 'away')}
            <div class="nlg-center">
              <div class="nlg-status ${live ? 'nlg-status--live' : ''}">${_escHtml(statusText)}${live ? ' <span class="nlg-livebadge">● LIVE</span>' : ''}</div>
              ${countdown ? `<div class="nlg-countdown">${_escHtml(countdown)}</div>` : ''}
              <div class="nlg-vs">@</div>
            </div>
            ${teamBlock(home, 'home')}
          </div>
          ${sitLine}`;
    const breakSlot = headerEl.querySelector('.nlg-break-slot');
    if (breakSlot) breakSlot.innerHTML = breakInfo ? _nlgBreakCardHtml(breakInfo, _nlg.lastData, home, away, tc) : '';
    const fieldSlot = headerEl.querySelector('.nlg-field-slot');
    if (fieldSlot) {
        fieldSlot.hidden = !showField;
        if (showField) {
            const fv = _nlgEnsureField(home, away, homeTeamId, tc);
            if (fv) fv.update(sit);
        }
    }
```

- [ ] **Step 6: Add the field helpers and delete the old renderer**

Delete these blocks entirely, including their leading comment blocks: the `_FV` IIFE, `_FV_GLIDE_MIN_MS`…`_nlgGlideDuration`, `_nlgAnimateFieldMotion`, `_nlgFieldViewerHtml`, `_nlgPlayArrowSvg`. Where `_FV` was, add:

```js
// Field viewer wiring. The renderer lives in js/fieldViewer.js; this page owns
// which profile a game gets and keeps one instance alive across polls.
function _nlgTeamLogo(t) {
    return (t?.logos && t.logos[0] && t.logos[0].href) || (typeof getNFLTeamLogoUrl === 'function' ? getNFLTeamLogoUrl(t?.abbreviation) : '') || '';
}

function _nlgFieldProfileFor(data) {
    if (typeof FieldViewer === 'undefined' || !data) return { source: 'generated', profile: null };
    const comp = _nlgComp(data) || {};
    const home = _nlgSide(comp, 'home');
    return FieldViewer.resolveField({
        index: _nlg.fieldIndex,
        venueId: data.gameInfo?.venue?.id,
        homeAbbr: home?.team?.abbreviation,
        eventId: _nlg.eventId,
        neutralSite: !!comp.neutralSite,
    });
}

function _nlgEnsureField(home, away, homeTeamId, tc) {
    const slot = document.querySelector('.nlg-field-slot');
    if (!slot || typeof FieldViewer === 'undefined') return null;
    if (_nlg.field && _nlg.field.host === slot && slot.isConnected) return _nlg.field;
    if (_nlg.field) _nlg.field.destroy();
    const data = _nlg.lastData || {};
    const resolved = _nlgFieldProfileFor(data);
    const side = (c) => {
        const t = c?.team || {};
        return { abbr: t.abbreviation || '', name: t.shortDisplayName || t.name || '', logo: _nlgTeamLogo(t), color: tc(t.abbreviation) };
    };
    const h = side(home);
    const profile = resolved.profile || FieldViewer.generatedProfile({
        homeLocation: home?.team?.location, homeName: home?.team?.name || h.name, homeColor: h.color,
        neutral: resolved.source === 'neutral-generated',
    });
    _nlg.field = FieldViewer.mount(slot, {
        profile, home: h, away: side(away), homeTeamId,
        indoor: !!_nlg.situation?.venueIndoor,
        venueLabel: resolved.source === 'neutral-generated' ? (data.gameInfo?.venue?.fullName || '') : '',
    });
    _nlg.fieldSource = resolved.source;
    return _nlg.field;
}

// Never blocks first paint: a field drawn from the generated fallback is
// re-skinned in place once the researched profile arrives.
async function _nlgLoadFieldIndex() {
    if (_nlg.fieldIndex) return;
    let idx = ApiCache.get('nfl-field-index');
    if (!idx) {
        try {
            const r = await fetch('/content/nfl/fields/index.json');
            if (!r.ok) return;
            idx = await r.json();
            ApiCache.set('nfl-field-index', idx, ApiCache.TTL.DAILY);
        } catch (_) { return; }
    }
    _nlg.fieldIndex = idx;
    if (_nlg.field && _nlg.lastData) {
        const r = _nlgFieldProfileFor(_nlg.lastData);
        if (r.profile && r.source !== _nlg.fieldSource) { _nlg.field.setProfile(r.profile); _nlg.fieldSource = r.source; }
    }
}
```

- [ ] **Step 7: Use the researched venue name in the caption**

In `_nlgRender`, replace `const venue = (data.gameInfo && data.gameInfo.venue && data.gameInfo.venue.fullName) || '';` with:

```js
    const venue = (_nlgFieldProfileFor(data).profile?.name) || data.gameInfo?.venue?.fullName || '';
```

- [ ] **Step 8: Delete the old overlay CSS**

In `css/nflLiveGame.css`, delete the `.fv-ez-logo { … }` rule, the `.fv-mid-logo { … }` rule, and both of their leading comment blocks. Change the line `@media (max-width: 640px) { .fv-field3d { height: 190px; } .fv-mid-logo { width: 22%; } }` to:

```css
@media (max-width: 640px) { .fv-field3d { height: 190px; } }
```

Run: `grep -rn "fv-ez-logo\|fv-mid-logo" js/ css/`
Expected: no matches.

- [ ] **Step 9: Run every test and the syntax check**

Run: `node --test tests/*.test.js && node --check js/fieldViewer.js && node --check js/nflLiveGame.js && node --check js/nfl.js && node tools/check-manifest.cjs`
Expected: all tests pass (including `tests/nflBreakCard.test.js`, which loads `nflLiveGame.js` in a sandbox without `FieldViewer` — the new helpers only reference it inside functions), no syntax errors, no manifest `FAIL`.

- [ ] **Step 10: Verify in a real browser**

`/api/*` and `/content/*` need Pages Functions, so run `npx wrangler pages dev . --port 8788` from the worktree root (or use the branch's Cloudflare Pages preview deploy). Open a live or recently live NFL game (`#nfl-game-<eventId>` from today's scoreboard). At DevTools widths 421, 773 and 1148px, confirm each and keep a screenshot:
1. The field renders from the generated fallback (index is still empty): both end zones in home colors with city + nickname, readable, letter tops toward the end line.
2. The midfield logo is small and flat on the turf (squashed), under the yard lines.
3. Ball, scrimmage line, first-down line and red zone sit on the same yard lines as production's current field for the same game state (open production side by side).
4. On the next poll the ball and lines glide; a window resize re-lays the field without animating.
5. The sticky score bar still pins when scrolling, and the field scrolls away under it.
6. Reduced motion (DevTools → Rendering → emulate `prefers-reduced-motion`): no glide, no flashes.
7. Light theme: field unchanged, legend legible.
8. Neutral site: if no neutral game is live, in the console run `_nlg.lastData.header.competitions[0].neutralSite = true; _nlg.field.destroy(); _nlg.field = null;` and wait one poll — neutral turf, no midfield art, venue label in the legend.
9. Console: no errors.

- [ ] **Step 11: Commit**

```bash
git add js/nflLiveGame.js js/nfl.js css/nflLiveGame.css
git commit -m "feat(fields): persistent field slot on the NFL game page; remove the stretched-viewBox renderer"
```

---

### Task 8: Drift contracts

**Files:**
- Modify: `tools/fields/field-core.cjs`, `tools/contracts/nfl.cjs`, `tests/fields.test.js`

**Interfaces:**
- Produces (in `field-core.cjs`): `missingFieldProfiles(scoreboardJson, index) → string[]` (keys with no profile), `surfaceMismatch(summaryJson, index) → string | null`, `readFieldIndex() → index` (repo file; empty index on error).
- Contract ids: `nfl-fields-venues`, `nfl-fields-surface`. Invariants return `null` on pass and a message string on failure (the `tools/contract-lib.cjs` convention).

- [ ] **Step 1: Write the failing tests**

Append to `tests/fields.test.js`:

```js
const IDX = { version: 1, teams: { '3798--GB': profile({ surface: 'hybrid' }), '3933--CHI': profile({ venueId: '3933', homeTeam: 'CHI', surface: 'artificial', name: 'Soldier Field' }) }, neutral: {} };
const ev = (venueId, home, neutralSite = false) => ({ competitions: [{ neutralSite, venue: { id: venueId }, competitors: [{ homeAway: 'home', team: { abbreviation: home } }] }] });

test('missingFieldProfiles skips neutral games and reports unknown venue/home pairs', () => {
    const sb = { events: [ev('3798', 'GB'), ev('5534', 'WSH', true), ev('3839', 'NYG')] };
    assert.deepEqual(core.missingFieldProfiles(sb, IDX), ['3839--NYG']);
});

test('surfaceMismatch compares ESPN grass with profile surface', () => {
    const sum = (venueId, home, grass, neutralSite = false) => ({ gameInfo: { venue: { id: venueId, grass } }, header: { competitions: [{ neutralSite, competitors: [{ homeAway: 'home', team: { abbreviation: home } }] }] } });
    assert.equal(core.surfaceMismatch(sum('3798', 'GB', true), IDX), null);
    assert.match(core.surfaceMismatch(sum('3933', 'CHI', true), IDX), /Soldier Field/);
    assert.equal(core.surfaceMismatch(sum('3933', 'CHI', undefined), IDX), null);
    assert.equal(core.surfaceMismatch(sum('3933', 'CHI', true, true), IDX), null);
    assert.equal(core.surfaceMismatch(sum('1', 'ARI', true), IDX), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/fields.test.js`
Expected: FAIL with `core.missingFieldProfiles is not a function`.

- [ ] **Step 3: Implement the helpers**

In `tools/fields/field-core.cjs`, add above `module.exports`:

```js
const fs = require('node:fs');
const path = require('node:path');

function readFieldIndex() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'content', 'nfl', 'fields', 'index.json'), 'utf8')); }
    catch (_) { return { version: 1, teams: {}, neutral: {} }; }
}

const homeAbbr = (comp) => ((comp && comp.competitors) || []).find(t => t.homeAway === 'home')?.team?.abbreviation;

function missingFieldProfiles(scoreboard, index) {
    const missing = [];
    for (const e of (scoreboard && scoreboard.events) || []) {
        const c = e.competitions && e.competitions[0];
        if (!c || c.neutralSite) continue;
        const key = `${c.venue && c.venue.id}--${homeAbbr(c)}`;
        if (!(index.teams || {})[key]) missing.push(key);
    }
    return missing;
}

// natural and hybrid are grass to ESPN; artificial is not.
function surfaceMismatch(summary, index) {
    const comp = summary && summary.header && summary.header.competitions && summary.header.competitions[0];
    const venue = summary && summary.gameInfo && summary.gameInfo.venue;
    if (!comp || comp.neutralSite || !venue || typeof venue.grass !== 'boolean') return null;
    const p = (index.teams || {})[`${venue.id}--${homeAbbr(comp)}`];
    if (!p) return null;
    return (p.surface !== 'artificial') === venue.grass ? null : `${p.name}: profile surface "${p.surface}" but ESPN grass=${venue.grass}`;
}
```

Extend `module.exports` with `readFieldIndex, missingFieldProfiles, surfaceMismatch`.

- [ ] **Step 4: Add the contracts**

In `tools/contracts/nfl.cjs`, below `const L = require('../contract-lib.cjs');`, add:

```js
const fields = require('../fields/field-core.cjs');
```

Append these two entries to the `contracts` array:

```js
        {
            id: 'nfl-fields-venues',
            needs: 'probe',
            mirrors: 'js/nflLiveGame.js _nlgFieldProfileFor (content/nfl/fields/index.json lookup)',
            route: scoreboard,
            paths: ['events[].competitions[0].venue.id'],
            invariants: [L.predicate('every non-neutral home venue has a researched field profile', data => {
                const missing = fields.missingFieldProfiles(data, fields.readFieldIndex());
                return missing.length ? `no field profile for ${missing.join(', ')}` : null;
            })],
        },
        {
            id: 'nfl-fields-surface',
            needs: 'final',
            mirrors: 'content/nfl/fields/*.json surface (cross-checked against ESPN gameInfo.venue.grass)',
            route: c => `/api/nfl?path=/summary&event=${c.finalId}`,
            paths: ['gameInfo.venue.id'],
            invariants: [L.predicate('field profile surface agrees with ESPN grass flag', data => fields.surfaceMismatch(data, fields.readFieldIndex()))],
        },
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/fields.test.js tests/contractCheck.test.js`
Expected: PASS (both files).

- [ ] **Step 6: Commit**

```bash
git add tools/fields/field-core.cjs tools/contracts/nfl.cjs tests/fields.test.js
git commit -m "feat(fields): nightly drift contracts for venue coverage and turf type"
```

---

### Task 9: Review gallery

**Files:**
- Create: `tools/fields/gallery.html`

**Interfaces:**
- Consumes: `tools/fields/gallery-data.json` from `node tools/fields/build-index.cjs --gallery` (Task 3); `FieldViewer.mount` (Task 6).

- [ ] **Step 1: Write the gallery**

Create `tools/fields/gallery.html`:

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Field Review Gallery</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="../../css/variables.css">
<link rel="stylesheet" href="../../css/nflLiveGame.css">
<style>
  body { background: var(--bg-base); color: var(--text-primary); font: 14px/1.45 system-ui, sans-serif; margin: 0; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .note { color: var(--text-muted); margin: 0 0 16px; }
  .row { border: 1px solid var(--border-default); border-radius: 8px; padding: 14px; margin: 0 0 20px; background: var(--bg-card); }
  .row h2 { font-size: 16px; margin: 0 0 8px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  .low { color: var(--color-loss); font-size: 12px; font-weight: 700; }
  .ok { color: var(--color-win); font-size: 12px; font-weight: 700; }
  .widths button { margin: 0 6px 8px 0; }
  .pair { display: grid; grid-template-columns: 1fr; gap: 12px; }
  .stage { overflow-x: auto; }
  .photo img { max-width: 100%; border-radius: 6px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 10px; }
  td, th { border-top: 1px solid var(--border-default); padding: 4px 6px; text-align: left; vertical-align: top; word-break: break-word; }
  tr.lowrow td { background: color-mix(in srgb, var(--color-loss) 12%, transparent); }
  code { font-size: 12px; }
</style></head><body>
<h1>NFL Home Fields — Review</h1>
<p class="note">Compare each render to its photo. Approve by running the command shown (it stamps the facts file). Sorted by low-confidence facts first.</p>
<div id="rows"></div>
<script>
window._escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
</script>
<script src="../../js/fieldViewer.js"></script>
<script>
const esc = window._escHtml;
const logo = (abbr) => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
const SAMPLE = { down: 2, distance: 7, yardLine: 63, possession: 'H', isRedZone: false, downDistanceText: '2nd & 7 at OPP 37', homeTimeouts: 3, awayTimeouts: 2,
  lastPlay: { id: 'x', type: { text: 'Pass Reception' }, start: { yardLine: 55 }, end: { yardLine: 63 } } };

function render(row, host, width) {
  host.style.width = width + 'px';
  if (host._fv) host._fv.destroy();
  const away = row.profile.homeTeam === 'DAL' ? 'NYG' : 'DAL';
  host._fv = FieldViewer.mount(host, {
    profile: row.profile, homeTeamId: 'H', indoor: false, venueLabel: '',
    home: { abbr: row.profile.homeTeam, name: row.profile.homeTeam, logo: logo(row.profile.homeTeam), color: row.profile.endzones.left.fill },
    away: { abbr: away, name: away, logo: logo(away), color: '#888888' },
  });
  host._fv.update(SAMPLE);
}

fetch('gallery-data.json').then(r => r.json()).then(({ rows }) => {
  const out = document.getElementById('rows');
  out.innerHTML = rows.map((row, i) => {
    const f = row.facts.facts || {};
    const photos = [...new Set(Object.values(f).map(x => x.photo).filter(Boolean))];
    const factRows = Object.entries(f).map(([k, x]) => `<tr class="${x.confidence === 'low' ? 'lowrow' : ''}"><td>${esc(k)}</td><td>${esc(JSON.stringify(k.split('.').reduce((o, p) => o && o[p], row.profile)))}</td><td>${esc(x.confidence)}</td><td><a href="${esc(x.source)}" target="_blank" rel="noopener">source</a>${x.photo ? ` · <a href="${esc(x.photo)}" target="_blank" rel="noopener">photo ${esc(x.photoDate || '')}</a>` : ''}</td></tr>`).join('');
    const approved = row.facts.approved ? `<span class="ok">approved ${esc(row.facts.approved.date)}</span>` : `<code>node tools/fields/approve.cjs ${esc(row.slug)}</code>`;
    return `<section class="row"><h2>${esc(row.profile.name)} <small>${esc(row.key)}</small> ${row.low ? `<span class="low">${row.low} low-confidence</span>` : ''} ${approved}</h2>
      <div class="widths">${[421, 773, 1148].map(w => `<button type="button" data-i="${i}" data-w="${w}">${w}px</button>`).join('')}</div>
      <div class="pair"><div class="stage"><div class="fvhost" id="fv${i}"></div></div>
      <div class="photo">${photos.map(p => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="source photo" loading="lazy" data-hide-on-error></a>`).join('')}</div></div>
      <table><tr><th>attribute</th><th>value</th><th>confidence</th><th>evidence</th></tr>${factRows}</table></section>`;
  }).join('');
  rows.forEach((row, i) => render(row, document.getElementById('fv' + i), 773));
  out.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-w]');
    if (b) render(rows[+b.dataset.i], document.getElementById('fv' + b.dataset.i), +b.dataset.w);
  });
  document.addEventListener('error', (e) => {
    if (e.target.matches && e.target.matches('img[data-hide-on-error]')) {
      e.target.replaceWith(Object.assign(document.createElement('span'), { textContent: 'photo blocked hotlinking — use the link' }));
    }
  }, true);
});
</script></body></html>
```

- [ ] **Step 2: Verify with a fixture field**

Create a temporary, uncommitted fixture: write `content/nfl/fields/lambeau-field--gb.json` with the Task 2 example profile and a matching `.facts.json` whose sources are obviously fake `https://example.com/...` URLs (every `REQUIRED_FACTS` key, `photoDate` this season). Run `node tools/fields/build-index.cjs --gallery`, serve the worktree root (`python -m http.server 8765`), open `http://localhost:8765/tools/fields/gallery.html`. Confirm the field renders at 421/773/1148 (the buttons switch widths), the facts table shows, and the approve command is printed. Then delete both fixture files and re-run `node tools/fields/build-index.cjs --gallery`.

Run: `git status --short content/`
Expected: no changes under `content/`.

- [ ] **Step 3: Commit**

```bash
git add tools/fields/gallery.html
git commit -m "feat(fields): local review gallery"
```

---

### Task 10: Research all 32 fields (batched, owner-approved)

**Files:**
- Create: `content/nfl/fields/<venue-slug>--<team>.json` + `.facts.json` × 32
- Modify: `content/nfl/fields/index.json` (regenerated)

This task has no code. Repeat the procedure below in batches of 8 until `node tools/fields/build-index.cjs --check` passes. The owner approves every field (full review).

**Batch order:** decide at the start of each batch. Fetch the next three weeks of the schedule (`https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYYMMDD-YYYYMMDD` with a browser User-Agent) and take the 8 not-yet-researched home teams with the soonest home games. Each event's `competitions[0].venue.id` is that team's `venueId`. The shared stadiums (MetLife: NYG and NYJ; SoFi: LAR and LAC) are researched per team, because the paint changes with the home team.

**Procedure per field:**

- [ ] **Step 1: Find evidence.** Use WebSearch/WebFetch. Required: (a) an official team or stadium page stating the playing surface (natural / artificial / hybrid); (b) at least one photo taken at a home game **this season** (team photo galleries, wire photos in game recaps) that shows the end zones, mow pattern, midfield and border. Download each photo to the scratchpad and look at it with the Read tool. **Never record a fact you did not see in a source.**
- [ ] **Step 2: Write the profile** `content/nfl/fields/<venue-slug>--<team>.json` (Task 2 schema). `venueId` from ESPN. `name` is the venue's current official name (not ESPN's). End zone `left`/`right` are display sides (away goal on the left), not compass ends, because which physical end the away team defends changes every quarter: put the end zone that reads as the city name on `left` unless both read the same. `fill`/`textColor`/`border` are hex values: when a team publishes official colors and the paint matches them, use and cite that page; otherwise sample from the photo and mark the fact `medium`. Use `midfield: "alt-logo"` or `"wordmark"` only if an `https://a.espncdn.com/` image matches what is painted; otherwise use the closest of `primary-logo`/`none` and mark that fact `low`.
- [ ] **Step 3: Write the facts file** `<same-slug>.facts.json` with `"approved": null` and one entry per `REQUIRED_FACTS` key: `source`, `checked` (today), `confidence`, plus `photo` and `photoDate` for paint facts. Confidence: `high` = directly visible in a clear photo or stated by an official source; `medium` = visible but small, partly blocked, or color judged under stadium lighting; `low` = inferred, sources disagree (put both URLs in `source`, space-separated), or no current-season photo shows it.
- [ ] **Step 4: Validate.** Run `node tools/fields/build-index.cjs` (expected: no `✗` lines for this slug), then `node tools/fields/build-index.cjs --gallery`.
- [ ] **Step 5: After all 8 in the batch: owner review.** Ask the owner to open the gallery (`python -m http.server 8765` from the worktree root, then `http://localhost:8765/tools/fields/gallery.html`) and compare every field to its photo. Fix anything they flag and regenerate. **Only the owner approves:** they either run `node tools/fields/approve.cjs <slug>` themselves or tell you, field by field, to run it. Never run `approve.cjs` on your own judgment.
- [ ] **Step 6: Regenerate and commit the batch.**

```bash
node tools/fields/build-index.cjs
git add content/nfl/fields/
git commit -m "content(fields): research batch N (<team list>)"
```

- [ ] **Step 7: Report pace and finish.** After batch 1, report actual time per field to the owner (the spec's estimate is unverified). After batch 4, `node tools/fields/build-index.cjs --check` must exit 0 and print `fields: 32 team + 0 neutral profiles, all valid, sourced and approved`.

---

### Task 11: Docs, final verification, and the PR

**Files:**
- Modify: `CLAUDE.md`, `DECISIONS.md`, `.claude/commands/deploy-check.md`, `sw.js`

- [ ] **Step 1: Assign the decision number.** Run `git fetch origin && grep -o "D-[0-9]\+" DECISIONS.md | sort -t- -k2 -n | uniq | tail -3`, then `git show origin/main:DECISIONS.md | grep -o "D-[0-9]\+" | sort -t- -k2 -n | uniq | tail -3`, and check open PRs (`gh pr list --state open`) for D-numbers in flight. Take the next free number; it is D-NNN below.

- [ ] **Step 2: DECISIONS.md.** Append a `D-NNN — NFL home fields` entry: the problem (oversized midfield logo; root cause `preserveAspectRatio="none"`; whole-SVG rebuild every poll), the owner decisions table from the spec, the architecture (pixel-space renderer, static/dynamic layers, content profiles + committed index, CI launch gate, drift contracts), the yearly pre-season photo re-check, and the spec path.

- [ ] **Step 3: CLAUDE.md (same commit, doc-sync rule).**
  - Script load order: insert `fieldViewer.js` before `nflLiveGame.js`.
  - Key Files: add rows for `js/fieldViewer.js`, `content/nfl/fields/`, `tools/fields/field-core.cjs` + `build-index.cjs` + `approve.cjs`, and `tools/fields/gallery.html` (local-only review tool).
  - In the `js/nflLiveGame.js` row, replace the paragraph that begins "**D-148 (2026-09-09):** the live field-position graphic" (through its `.fv-field3d` isolation note) with one sentence: the field is rendered by `js/fieldViewer.js` (D-NNN) in a persistent `.nlg-field-slot`; `_nlgFieldProfileFor` picks the profile.
  - Deployment → "Before any push": add `tests/fieldViewer.test.js tests/fields.test.js` to the unit-test list and `node tools/fields/build-index.cjs --check` to the checks.
  - Upstream contract monitor paragraph: mention `nfl-fields-venues` and `nfl-fields-surface`.

- [ ] **Step 4: deploy-check command.** In `.claude/commands/deploy-check.md`, add `tests/fieldViewer.test.js tests/fields.test.js` to the unit test command and a check line for `node tools/fields/build-index.cjs --check`.

- [ ] **Step 5: Bump the service worker cache once.** `git show origin/main:sw.js | grep CACHE_NAME` — set this branch's `CACHE_NAME` to one above the higher of that value and the branch's current value.

- [ ] **Step 6: Full local verification.**

Run: `node --test tests/*.test.js && node tools/fields/build-index.cjs --check && node tools/stories/build-index.cjs --check && node tools/check-manifest.cjs && node tools/check-themes.cjs --strict`
Expected: every command exits 0. Then run the `/deploy-check` skill and resolve anything it reports.

- [ ] **Step 7: Commit, merge main, push, PR.**

```bash
git add CLAUDE.md DECISIONS.md .claude/commands/deploy-check.md sw.js
git commit -m "docs(fields): D-NNN NFL home fields; doc-sync + cache bump"
git fetch origin && git merge origin/main
node --test tests/*.test.js && node tools/fields/build-index.cjs --check
git push -u origin feat/nfl-home-fields
gh pr create --title "NFL home fields: every game drawn on the home team's real field" --body "<summary of D-NNN, the 32-field gate result, verification screenshots>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

If the merge brings a newer `CACHE_NAME` or D-number, redo Steps 1 and 5 before pushing.

- [ ] **Step 8: Production verification after the owner merges.** Confirm the deploy landed (`curl -s https://sportstrata.cc/sw.js | grep CACHE_NAME` shows the new value and `https://sportstrata.cc/js/fieldViewer.js` returns 200), then open a live NFL game on production at 421 and 1148px and confirm the home team's researched field renders (the venue caption shows the profile `name`, and the paint matches the gallery). Over the following game days also confirm: one dome game (indoor lighting variant), MetLife as NYG and as NYJ (different paint, same venue id), and a neutral-site game if one is scheduled. Report the result with screenshots.
