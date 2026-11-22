// D-212 part 2: one type scale, one radius, no glass, two fonts. Export-card styles are exempt
// because they lay out a fixed-size PNG (css/shareCard.css and the .hcs-* Highlight Card rules).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readdirSync(path.join(ROOT, 'css')).filter(f => f.endsWith('.css') && f !== 'shareCard.css' && f !== 'variables.css');

function offenders(re, text, file) {
    return text.split('\n').flatMap((line, i) => (re.test(line) && !/\.hcs-/.test(line)) ? [`${file}:${i + 1}  ${line.trim().slice(0, 90)}`] : []);
}
function scan(re) {
    return CSS.flatMap(f => offenders(re, fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'), 'css/' + f));
}

test('every font-size uses a --text-* step', () => {
    assert.deepStrictEqual(scan(/font-size:\s*[\d.]+(px|rem)\b/), []);
});

test('every border-radius is --radius, --radius-full, 50% or 0', () => {
    assert.deepStrictEqual(scan(/border(-[a-z]+-[a-z]+)?-radius:\s*[^;]*\b[\d.]*[1-9][\d.]*(px|rem)\b/), []);
});

test('no glass: backdrop-filter only through the --blur-* tokens, which are none', () => {
    assert.deepStrictEqual(scan(/backdrop-filter:\s*blur\(/), []);
    const vars = fs.readFileSync(path.join(ROOT, 'css', 'variables.css'), 'utf8');
    for (const m of vars.matchAll(/--blur-[a-z]+:\s*([^;]+);/g)) assert.strictEqual(m[1].trim(), 'none');
});

test('only Inter and JetBrains Mono are loaded or named', () => {
    const files = ['index.html', '404.html', 'ask.html', 'draft-kit.html', 'mock-draft.html', 'pickem.html', 'playoff-odds.html'];
    for (const f of files) {
        const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
        for (const fam of html.matchAll(/family=([A-Za-z+]+)/g)) assert.ok(['Inter', 'JetBrains+Mono'].includes(fam[1]), `${f}: ${fam[1]}`);
    }
    assert.deepStrictEqual(scan(/Barlow|Space Grotesk|--font-display|--font-brand/), []);
});

test('planted fault: a raw font-size is reported', () => {
    assert.strictEqual(offenders(/font-size:\s*[\d.]+(px|rem)\b/, '.x { font-size: 0.8rem; }', 'css/planted.css').length, 1);
});

test('no token is defined twice in one theme block (a later copy silently wins)', () => {
    const css = fs.readFileSync(path.join(ROOT, 'css', 'variables.css'), 'utf8');
    for (const m of css.matchAll(/(:root|\[data-theme="[\w-]+"\])\s*\{/g)) {
        let i = css.indexOf('{', m.index), depth = 0;
        const start = i;
        for (; i < css.length; i++) { if (css[i] === '{') depth++; if (css[i] === '}' && --depth === 0) break; }
        const names = [...css.slice(start, i).matchAll(/(--[\w-]+)\s*:/g)].map(t => t[1]);
        const dupes = names.filter((n, k) => names.indexOf(n) !== k);
        assert.deepStrictEqual(dupes, [], m[1]);
    }
});
