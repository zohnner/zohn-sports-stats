#!/usr/bin/env node
// Ink + Ice rebrand guard: fails if any orange-family color appears outside team-color data.
// Orange family = hue 12-40deg with saturation >= 0.45 and lightness 0.2-0.85.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['css', 'js', 'functions', 'assets'];
const SCAN_ROOT_EXT = /\.(html|json|webmanifest)$/;
const EXT = /\.(css|js|cjs|mjs|html|svg|json|webmanifest)$/;
const SKIP = [/^js\/math\.min\.js$/, /^css\/themes-retired\//, /^assets\/themes\//, /^content\//];
// Files/regions holding team colors (data, exempt by owner decision 2026-11-20).
const TEAM_DATA_MARK = /ss-team-colors:(start|end)/;

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
function isOrange(r, g, b) {
  const { h, s, l } = hsl(r, g, b);
  return h >= 12 && h <= 40 && s >= 0.45 && l >= 0.2 && l <= 0.85;
}
const RE = /#([0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;
function colorsIn(line) {
  const out = [];
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(line))) {
    let r, g, b;
    if (m[1]) {
      const hx = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
      r = parseInt(hx.slice(0, 2), 16); g = parseInt(hx.slice(2, 4), 16); b = parseInt(hx.slice(4, 6), 16);
    } else { r = +m[2]; g = +m[3]; b = +m[4]; }
    if (isOrange(r, g, b)) out.push(m[0]);
  }
  return out;
}
function walk(dir, files) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files); else if (EXT.test(e.name)) files.push(p);
  }
}
function scanText(rel, text) {
  const hits = [];
  let inTeam = false;
  text.split('\n').forEach((line, i) => {
    const mk = line.match(TEAM_DATA_MARK);
    if (mk) { inTeam = mk[1] === 'start'; return; }
    if (inTeam) return;
    for (const c of colorsIn(line)) hits.push(`${rel}:${i + 1}  ${c}`);
  });
  return hits;
}
function scan(root = ROOT) {
  const files = [];
  for (const d of SCAN_DIRS) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d), files);
  for (const f of fs.readdirSync(root)) if (SCAN_ROOT_EXT.test(f)) files.push(path.join(root, f));
  const hits = [];
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    if (!SKIP.some(re => re.test(rel))) hits.push(...scanText(rel, fs.readFileSync(f, 'utf8')));
  }
  return hits;
}
module.exports = { isOrange, colorsIn, scanText, scan };
if (require.main === module) {
  const hits = scan();
  if (hits.length) { console.log(hits.join('\n')); console.log(`\n${hits.length} orange-family color(s) found.`); process.exitCode = 1; }
  else console.log('check-orange: zero orange-family colors outside team-color data.');
}
