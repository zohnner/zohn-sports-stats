// Shared OG-image renderer (D-127 continuation). Underscore-prefixed so Cloudflare
// Pages Functions does NOT treat this as a route -- it's imported by functions/api/og.js
// only. Real per-entity share cards: satori (JSX-like tree -> self-contained SVG, no
// external font resolution needed downstream) + @resvg/resvg-wasm (SVG -> PNG).
//
// Fonts are fetched via env.ASSETS at request time, NOT bundled via a JS import --
// this site's live deploy is the Cloudflare Pages dashboard's git-integrated build
// (see wrangler.toml's own comment), which does not honor this repo's wrangler.toml
// [[rules]] the way a `wrangler publish` CLI deploy would. env.ASSETS.fetch() against
// a real static-site path (same trick every edge-render Function already uses to fetch
// /index.html) works identically regardless of build path, so it's the only reliable
// option here. The .wasm import below is different: Cloudflare's Pages Functions
// bundler has *native*, build-path-independent support for `import x from '*.wasm'`
// (produces a WebAssembly.Module directly), so that one is safe to import normally.
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import RESVG_WASM from '@resvg/resvg-wasm/index_bg.wasm';
// Pinned to satori 0.32.0, deliberately NOT the latest (0.33+): 0.33.0 added HarfBuzz
// text shaping, which bundles `harfbuzzjs` as a top-level import with a Node-`fs`-
// relative WASM auto-loader -- that breaks Cloudflare Pages Functions' bundled Worker
// at import time (confirmed live via `wrangler pages dev`; matches the open upstream
// report at github.com/vercel/satori/issues/794, unresolved as of this writing). 0.32.0
// predates HarfBuzz entirely, so plain `satori` (not the `/standalone` build) just
// works -- no complex-script/ligature shaping is needed here anyway (player/team names,
// stat lines, all plain Latin text).
import satori from 'satori';

const WIDTH = 1200;
const HEIGHT = 630;
const BRAND_ACCENT = '#ff8100';
const BRAND_GOLD = '#ffd200';
const FONT_FILES = ['BarlowSemiCondensed-Bold.ttf', 'BarlowSemiCondensed-SemiBold.ttf', 'BarlowSemiCondensed-Regular.ttf'];
const FONT_WEIGHTS = [700, 600, 400];

let resvgWasmReady = null;
function ensureResvgWasm() {
    if (!resvgWasmReady) resvgWasmReady = initWasm(RESVG_WASM);
    return resvgWasmReady;
}

// Isolate-scope cache -- persists across warm requests in the same Worker instance,
// same reasoning as every other module-level cache in this codebase.
let fontCache = null;
async function loadFonts(env, url) {
    if (fontCache) return fontCache;
    const bufs = await Promise.all(FONT_FILES.map(async (name) => {
        const res = await env.ASSETS.fetch(new URL(`/assets/fonts/${name}`, url));
        if (!res.ok) throw new Error(`font fetch failed: ${name} (${res.status})`);
        return res.arrayBuffer();
    }));
    fontCache = bufs.map((data, i) => ({ name: 'Barlow', data, weight: FONT_WEIGHTS[i], style: 'normal' }));
    return fontCache;
}

// Team/brand colors are frequently too dark to read against this card's near-black
// background (e.g. Yankees navy #0c2340) -- lift low-luminance accents toward white
// rather than rendering them essentially invisible.
function visibleAccent(hex) {
    if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) return BRAND_ACCENT;
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luminance >= 0.35) return `#${h}`;
    const mix = (c) => Math.round(c + (255 - c) * 0.55).toString(16).padStart(2, '0');
    return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function buildTree({ eyebrow, title, subtitle, statLine, accentColor }) {
    const accent = visibleAccent(accentColor);
    const content = [];
    if (eyebrow) {
        content.push({ type: 'div', props: {
            style: { display: 'flex', fontSize: 26, color: accent, fontWeight: 600, letterSpacing: 3 },
            children: String(eyebrow).toUpperCase(),
        } });
    }
    content.push({ type: 'div', props: {
        style: { display: 'flex', fontSize: title && title.length > 20 ? 66 : 84, fontWeight: 700, marginTop: 22, lineHeight: 1.05 },
        children: title || 'SportStrata',
    } });
    if (subtitle) {
        content.push({ type: 'div', props: {
            style: { display: 'flex', fontSize: 32, fontWeight: 400, color: '#a0a8b8', marginTop: 14 },
            children: subtitle,
        } });
    }
    if (statLine) {
        content.push({ type: 'div', props: {
            style: { display: 'flex', fontSize: 36, fontWeight: 600, color: BRAND_GOLD, marginTop: 34 },
            children: statLine,
        } });
    }

    return {
        type: 'div',
        props: {
            style: { width: WIDTH, height: HEIGHT, display: 'flex', background: '#0b0d12', fontFamily: 'Barlow' },
            children: [
                { type: 'div', props: { style: { display: 'flex', width: 14, height: HEIGHT, background: accent }, children: [] } },
                { type: 'div', props: {
                    style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, padding: '64px 70px', color: 'white' },
                    children: [
                        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column' }, children: content } },
                        { type: 'div', props: { style: { display: 'flex', fontSize: 22, color: '#5a6272', fontWeight: 600, letterSpacing: 1 }, children: 'SPORTSTRATA.CC' } },
                    ],
                } },
            ],
        },
    };
}

// eyebrow/title/subtitle/statLine are plain strings only -- caller is responsible for
// keeping them short; satori has no text overflow/ellipsis handling of its own.
export async function renderOgPng({ env, url, eyebrow, title, subtitle, statLine, accentColor }) {
    const [fonts] = await Promise.all([loadFonts(env, url), ensureResvgWasm()]);
    const svg = await satori(buildTree({ eyebrow, title, subtitle, statLine, accentColor }), { width: WIDTH, height: HEIGHT, fonts });
    const resvg = new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'width', value: WIDTH } });
    return resvg.render().asPng();
}
