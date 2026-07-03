#!/usr/bin/env node
// ============================================================
// SportStrata — delivery-manifest checker (D-037, zero deps)
// Verifies the three hand-maintained lists stay in sync:
//   index.html <script>/<link> chain  ⇄  sw.js STATIC_ASSETS  ⇄  files on disk
// Run: node tools/check-manifest.cjs   (exit 1 on hard failures)
// ============================================================
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = f => fs.existsSync(path.join(ROOT, f));

const html = read('index.html');
const sw = read('sw.js');

const htmlJs = [...html.matchAll(/src="(js\/[^"]+\.js)"/g)].map(m => m[1]);
const htmlCss = [...html.matchAll(/href="(css\/[^"]+\.css)"/g)].map(m => m[1]);
const swBlock = sw.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/);
const swAssets = swBlock ? [...swBlock[1].matchAll(/'\/((?:js|css)\/[^']+)'/g)].map(m => m[1]) : [];

// math.min.js is deliberately NOT in the script chain (lazy-loaded by
// statBuilder.js per D-011) but IS precached for offline Builder use.
const LAZY_OK = new Set(['js/math.min.js']);

let fails = 0, warns = 0;
const fail = m => { console.log('❌ FAIL  ' + m); fails++; };
const warn = m => { console.log('⚠️  WARN  ' + m); warns++; };
const pass = m => console.log('✅ PASS  ' + m);

// 1. every referenced file exists on disk
const missing = [...htmlJs, ...htmlCss, ...swAssets].filter(f => !exists(f));
missing.length ? missing.forEach(f => fail(`referenced but missing on disk: ${f}`))
               : pass(`all ${htmlJs.length + htmlCss.length} index.html assets + ${swAssets.length} SW assets exist on disk`);

// 2. every index.html js/css is precached in sw.js
const notCached = [...htmlJs, ...htmlCss].filter(f => !swAssets.includes(f));
notCached.length ? notCached.forEach(f => fail(`in index.html but NOT in sw.js STATIC_ASSETS: ${f}`))
                 : pass('every index.html script/stylesheet is in STATIC_ASSETS');

// 3. every precached js/css is actually referenced (dead-weight guard)
const unreferenced = swAssets.filter(f => !htmlJs.includes(f) && !htmlCss.includes(f) && !LAZY_OK.has(f));
unreferenced.length ? unreferenced.forEach(f => warn(`precached but not referenced in index.html: ${f}`))
                    : pass('no unreferenced precached assets');

// 4. every js file on disk is either loaded or a known exception
const onDisk = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
const orphans = onDisk.filter(f => !htmlJs.includes(f) && !LAZY_OK.has(f));
orphans.length ? orphans.forEach(f => warn(`js file on disk but not in the script chain: ${f}`))
               : pass('no orphaned js files');

console.log(`\n${fails} failures, ${warns} warnings`);
process.exit(fails ? 1 : 0);
