#!/usr/bin/env node
// ============================================================
// SportStrata — theme contrast checker (D-037, zero deps)
// The theme contract: every [data-theme] block is checked for WCAG
// contrast on the core text/bg token pairs. Default = report only
// (existing themes have known debts — THEME_REVIEW.md); --strict
// exits 1 on any ERROR so it can gate CI once debts are cleared.
// Run: node tools/check-themes.cjs [--strict]
// ============================================================
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'variables.css'), 'utf8');

// ── parse token blocks ──
function blockTokens(selectorRe) {
    const m = css.match(selectorRe);
    if (!m) return null;
    let depth = 0, i = css.indexOf('{', m.index), start = i + 1;
    for (; i < css.length; i++) { if (css[i] === '{') depth++; if (css[i] === '}' && --depth === 0) break; }
    const body = css.slice(start, i);
    const tokens = {};
    for (const t of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[t[1]] = t[2].trim();
    return tokens;
}
const root = blockTokens(/:root\s*/) || {};
const themeNames = [...new Set([...css.matchAll(/\[data-theme="([\w-]+)"\]/g)].map(m => m[1]))];

// ── color math ──
function parseColor(v, ctx) {
    if (!v) return null;
    v = v.trim();
    const varm = v.match(/^var\((--[\w-]+)\)$/);
    if (varm) return parseColor(ctx[varm[1]] || root[varm[1]], ctx);
    let m = v.match(/^#([0-9a-f]{3})$/i);
    if (m) return [...m[1]].map(c => parseInt(c + c, 16)).concat(1);
    m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) return [0, 2, 4].map(o => parseInt(m[1].slice(o, o + 2), 16)).concat(m[2] ? parseInt(m[2], 16) / 255 : 1);
    m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    return null; // gradients / unsupported — skip
}
const over = (fg, bg) => fg[3] >= 1 ? fg : [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
function lum([r, g, b]) {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };

// ── the contract: token pairs and minimums ──
const PAIRS = [
    ['--text-primary',   '--bg-base',    4.5],
    ['--text-primary',   '--bg-card',    4.5],
    ['--text-secondary', '--bg-surface', 4.5],
    ['--text-muted',     '--bg-card',    3.0],
    ['--accent',         '--bg-base',    3.0],
];
const REQUIRED = [...new Set(PAIRS.flat().filter(t => String(t).startsWith('--')))];

const strict = process.argv.includes('--strict');
let errors = 0, warns = 0;
for (const name of ['(root/dark)', ...themeNames]) {
    const ctx = name === '(root/dark)' ? root
        : { ...root, ...blockTokens(new RegExp(`\\[data-theme="${name}"\\]\\s*`)) };
    const missing = REQUIRED.filter(t => !ctx[t]);
    if (missing.length) { console.log(`⚠️  ${name}: missing tokens (inherit :root): ${missing.join(', ')}`); }
    for (const [fgT, bgT, min] of PAIRS) {
        const bgBase = parseColor(ctx['--bg-base'], ctx) || [0, 0, 0, 1];
        const bgRaw = parseColor(ctx[bgT], ctx);
        const fgRaw = parseColor(ctx[fgT], ctx);
        if (!bgRaw || !fgRaw) continue; // unsupported format — skip silently
        const bg = over(bgRaw, bgBase);
        const fg = over(fgRaw, bg);
        const r = ratio(fg, bg);
        if (r < min) {
            const sev = r < min - 1 ? 'ERROR' : 'WARN ';
            sev === 'ERROR' ? errors++ : warns++;
            console.log(`${sev === 'ERROR' ? '❌' : '⚠️ '} ${sev} ${name}: ${fgT} on ${bgT} = ${r.toFixed(2)} (min ${min})`);
        }
    }
}
console.log(`\n${errors} errors, ${warns} warnings across ${themeNames.length + 1} themes`);
if (strict && errors) process.exit(1);
