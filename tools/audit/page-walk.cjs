#!/usr/bin/env node
// Page walk: open every list view of every sport in a real browser, then one
// team, player and game page per sport found on those views, and report what
// a reader would see go wrong.
//
//   node tools/audit/page-walk.cjs https://sportstrata.cc     JSON report on stdout
//
// Needs `playwright` (not a repo dependency; the cloud sandbox has it). Walk
// production: a local static server has no /api proxies, so pages that need
// a non-ESPN proxy (Sleeper for NFL teams) fail there and nowhere else.
//
// It reports; it never fails a build. tools/audit/RUNBOOK.md says what to do
// with the findings.
const path = require('node:path');
const { buildMatrix, repoReader } = require('./matrix.cjs');

const MIN_TEXT = 80;
// A message saying the page failed, and one saying there is simply nothing
// on right now. Passed into the page as strings (walkInPage is serialized).
const EMPTY_RE = /[^.\n]*(unavailable|couldn['’]t (be loaded|load)|failed to load|went wrong)[^.\n]*\.?/i;
const IDLE_RE = /offseason|between seasons|no [a-z ]*games scheduled/i;
const SEVERITY =['script-error', 'fell-home', 'misroute', 'stuck-loading', 'empty', 'unavailable'];

// One visit -> findings. A view that landed elsewhere is judged on that
// alone: the content on screen belongs to another page.
function classify(v) {
    const out = [...new Set(v.errors || [])].map(detail => ({ kind: 'script-error', view: v.target, detail }));
    if (v.landed !== v.target) {
        out.push(v.landed === 'home'
            ? { kind: 'fell-home', view: v.target, detail: 'landed on home' }
            : { kind: 'misroute', view: v.target, detail: `landed on ${v.landed}` });
        return out;
    }
    if (v.offseason) return out;
    if (v.skeleton) out.push({ kind: 'stuck-loading', view: v.target, detail: 'skeleton still on screen' });
    else if (v.emptyText) out.push({ kind: 'unavailable', view: v.target, detail: v.emptyText });
    else if (v.textLength < MIN_TEXT) out.push({ kind: 'empty', view: v.target, detail: `${v.textLength} characters of content` });
    return out;
}

function summarize(visits) {
    const findings = visits.flatMap(classify)
        .sort((a, b) => SEVERITY.indexOf(a.kind) - SEVERITY.indexOf(b.kind));
    const counts = {};
    for (const f of findings) counts[f.kind] = (counts[f.kind] || 0) + 1;
    return { visited: visits.length, counts, findings };
}

// From every link a walk saw, the first team, player and game page per sport.
function pickSamples(targets) {
    const seen = new Set(), out = [];
    for (const t of targets) {
        const m = /^([a-z]+)-(team|player|game|live)-/.exec(t);
        if (!m || seen.has(m[1] + m[2])) continue;
        seen.add(m[1] + m[2]);
        out.push(t);
    }
    return out;
}

// The list views to open, from the parity matrix, so a new sport or page
// type is walked without editing this file.
function listViews(matrix) {
    const name = { scores: s => (s === 'mlb' || s === 'nfl' ? 'games' : 'scores'), standings: () => 'standings', teams: () => 'teams', leaders: () => 'leaders', rankings: () => 'rankings' };
    const out = [];
    for (const s of matrix.sports) {
        for (const row of matrix.rows) {
            if (name[row.id] && row.cells[s] === 'yes') out.push(`${s}-${name[row.id](s)}`);
        }
    }
    return out;
}

// Runs inside the page (serialized with toString), so it can use nothing
// from this file. Visits each target and records what is on screen.
async function walkInPage(targets, opts) {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const errors = [];
    const onError = e => errors.push(String((e.error && e.error.message) || e.message || (e.reason && e.reason.message) || e.reason || 'error').slice(0, 200));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    // The content host, not all of <main>: the page chrome around it carries
    // enough text to make an empty view look filled.
    const main = () => {
        const grid = document.getElementById('playersGrid');
        return (grid && grid.offsetParent !== null) ? grid : (document.querySelector('main') || document.body);
    };
    const visits = [];
    for (const target of targets) {
        const sport = target.split('-')[0];
        errors.length = 0;
        navigateTo(target);
        let last = -1, stable = 0;
        for (let waited = 0; waited < opts.waitMs; waited += 500) {
            await sleep(500);
            const len = main().innerText.length;
            const loading = !!main().querySelector('[class*="skeleton"]');
            stable = (len === last && !loading) ? stable + 1 : 0;
            last = len;
            if (stable >= 3) break;
        }
        const text = main().innerText;
        const links = new Set();
        main().querySelectorAll('[onclick]').forEach(el => {
            const m = /navigateTo\('([a-z]+-(?:team|player|game|live)-[^']+)'\)/.exec(el.getAttribute('onclick') || '');
            if (m) links.add(m[1]);
        });
        main().querySelectorAll('[data-game-key]').forEach(el => {
            const k = el.dataset.gameKey, cut = k.indexOf('-');
            if (cut > 0 && k.length > cut + 1) links.add(k.startsWith('mlb-') ? 'mlb-live-' + k.slice(cut + 1) : k.slice(0, cut) + '-game-' + k.slice(cut + 1));
        });
        // Views wired by event delegation carry ids in data attributes instead.
        main().querySelectorAll('[data-game-id]').forEach(el => { if (el.dataset.gameId) links.add(`${sport}-game-${el.dataset.gameId}`); });
        main().querySelectorAll('[data-team-abbr]').forEach(el => { if (el.dataset.teamAbbr) links.add(`${sport}-team-${el.dataset.teamAbbr}`); });
        visits.push({
            target,
            landed: AppState.currentView,
            textLength: text.length,
            skeleton: !!main().querySelector('[class*="skeleton"]'),
            emptyText: ((new RegExp(opts.emptyRe, 'i').exec(text) || [''])[0]).trim().slice(0, 160),
            offseason: new RegExp(opts.idleRe, 'i').test(text),
            errors: errors.slice(),
            links: [...links],
        });
    }
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onError);
    return visits;
}

async function run(baseUrl, opts = {}) {
    let chromium;
    try { ({ chromium } = require('playwright')); } catch {
        throw new Error('playwright is not installed here; run this where it is (the cloud sandbox), or use walkInPage through another browser driver');
    }
    const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
    const browser = await chromium.launch({ proxy });
    const page = await browser.newPage({ ignoreHTTPSErrors: !!proxy });
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.waitForFunction('typeof navigateTo === "function" && typeof AppState === "object"');
    const walk = targets => page.evaluate(`(${walkInPage.toString()})(${JSON.stringify(targets)}, ${JSON.stringify({ waitMs: opts.waitMs || 8000, emptyRe: EMPTY_RE.source, idleRe: IDLE_RE.source })})`);
    const lists = await walk(listViews(buildMatrix(repoReader(path.join(__dirname, '..', '..')))));
    const details = await walk(pickSamples(lists.flatMap(v => v.links)));
    await browser.close();
    return summarize([...lists, ...details]);
}

if (require.main === module) {
    const base = process.argv[2];
    if (!base) { console.error('usage: node tools/audit/page-walk.cjs <base-url>'); process.exit(2); }
    run(base).then(r => console.log(JSON.stringify(r, null, 2)), e => { console.error(e.message); process.exit(2); });
}

module.exports = { EMPTY_RE, IDLE_RE, classify, summarize, pickSamples, listViews, walkInPage, run };
