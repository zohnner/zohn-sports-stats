#!/usr/bin/env node
// ============================================================
// SportStrata — upstream contract monitor (zero deps, LIVE).
// Checks production /api/* proxies against tools/contracts/*.cjs:
// required fields the client parsers read, plus count invariants
// that catch silent subsets (the D-135 groups=80 class).
//
//   node tools/contract-check.cjs https://sportstrata.cc [--json report.json]
//
// Exit 0 pass · 1 warn · 2 fail (incl. malformed contracts).
// Spec: docs/superpowers/specs/2026-09-28-contract-monitor-design.md
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ContractError, parsePath, checkPath } = require('./contract-lib.cjs');

const SPORT_FILES = ['nfl', 'ncaaf', 'mlb'];
const WALK_BACK_DAYS = 10;

const looksLikeHtml = snippet => /^\s*</.test(snippet || '');

const inWeekRange = (range, week, lastRegularWeek) => !range || (
    typeof week === 'number' && typeof lastRegularWeek === 'number' &&
    week >= range.from && week <= lastRegularWeek - range.lastMinus
);

function dateBack(today, n) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n));
    const iso = d.toISOString().slice(0, 10);
    return { iso, yyyymmdd: iso.replace(/-/g, ''), dow: d.getUTCDay() };
}

async function getJson(url) {
    try {
        const r = await fetch(url, {
            headers: { 'User-Agent': 'SportStrata-ContractCheck/1.0' },
            signal: AbortSignal.timeout(20000),
        });
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch { json = null; }
        return { ok: r.ok, status: r.status, contentType: r.headers.get('content-type') || '', json, bodySnippet: text.slice(0, 200) };
    } catch (e) {
        return { ok: false, status: 0, contentType: '', json: null, bodySnippet: String(e && e.message) };
    }
}

// While ESPN blocks Cloudflare egress (D-176), readers get NFL/NCAAF data from
// js/config.js _espnFetch: proxy first, then ESPN directly from the browser
// (leaders rebuilt from site/v3). Running that real function here keeps this
// check on the code readers run, not a copy that can drift from it.
const ESPN_ROUTE = /^\/api\/(nfl|ncaaf)(standings|stats)?(\?|$)/;

function browserFallbackFrom(base) {
    const noop = () => {};
    const inert = new Proxy(function () {}, { get: () => inert, apply: () => inert });
    let calls = [];
    const ctx = {
        URL, URLSearchParams, Response, Headers, AbortSignal, AbortController, setTimeout, clearTimeout,
        location: { origin: base, href: base + '/' },
        Logger: { warn: noop, info: noop, debug: noop, error: noop },
        document: inert, navigator: {}, localStorage: { getItem: () => null, setItem: noop },
        fetch: async (u, init) => {
            const own = String(u).startsWith(base);
            try {
                const r = await fetch(u, {
                    ...init,
                    headers: own ? { 'User-Agent': 'SportStrata-ContractCheck/1.0' } : undefined,
                    signal: AbortSignal.timeout(20000),
                });
                calls.push({ own, status: r.status });
                return r;
            } catch (e) {
                calls.push({ own, status: 0 });
                throw e;
            }
        },
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');
    vm.runInContext(`${src}\n;globalThis.__espnFetch = _espnFetch;`, ctx, { filename: 'js/config.js' });
    return async url => {
        calls = [];
        try {
            const r = await ctx.__espnFetch(url);
            const text = await r.text();
            let json = null;
            try { json = JSON.parse(text); } catch { json = null; }
            const proxy = calls.find(c => c.own);
            return {
                ok: r.ok, status: r.status, contentType: r.headers.get('content-type') || '', json,
                bodySnippet: text.slice(0, 200),
                viaDirect: calls.some(c => !c.own), proxyStatus: proxy ? proxy.status : 0,
            };
        } catch (e) {
            return { ok: false, status: 0, contentType: '', json: null, bodySnippet: String(e && e.message) };
        }
    };
}

function fetchJsonFrom(base, get = getJson, espn = null) {
    return async p => {
        if (!ESPN_ROUTE.test(p)) return get(base + p);
        espn = espn || browserFallbackFrom(base);
        return espn(base + p);
    };
}

const blockedNote = status => `proxy failed (${status === 200 ? 'upstream error inside a 200' : status ? `HTTP ${status}` : 'network error'}); checked via the browser fallback readers get (D-176)`;

async function resolveProbe(sport, fetchJson, today) {
    let reachable = 0;
    let fallback = null;
    let blocked = null;
    for (let n = 1; n <= WALK_BACK_DAYS; n++) {
        const date = dateBack(today, n);
        const res = await fetchJson(sport.probe.route(date));
        if (!res.ok || !res.json) continue;
        reachable++;
        if (res.viaDirect) blocked = res.proxyStatus;
        const info = sport.probe.read(res.json);
        if (!info.finalIds.length) continue;
        const isGameDay = sport.gameDay === null || sport.gameDay === undefined || date.dow === sport.gameDay;
        const probe = { date, ...info, isGameDay, ...(blocked != null && { blocked }) };
        if (isGameDay) return probe;
        if (!fallback) fallback = probe;
    }
    if (fallback) return fallback;
    return reachable ? { offseason: true, ...(blocked != null && { blocked }) } : { unreachable: true };
}

function result(id, url) {
    return { id, url, status: 'pass', failures: [], warnings: [], notes: [] };
}

function settle(r) {
    r.status = r.failures.length ? 'fail' : r.warnings.length ? 'warn' : 'pass';
    return r;
}

async function runContract(c, ctx, fetchJson) {
    const url = c.route(ctx);
    const r = result(c.id, url);
    const res = await fetchJson(url);
    if (!res.ok) {
        if (looksLikeHtml(res.bodySnippet)) {
            r.failures.push(`HTTP ${res.status}: upstream returned HTML (likely WAF block): ${res.bodySnippet}`);
        } else {
            r.failures.push(`HTTP ${res.status}: ${res.bodySnippet}`);
        }
        return settle(r);
    }
    if (!res.json) {
        r.failures.push(`upstream returned ${res.contentType || 'non-JSON'} (likely WAF block): ${res.bodySnippet}`);
        return settle(r);
    }
    if (res.viaDirect) {
        r.warnings.push(blockedNote(res.proxyStatus));
        r.proxyBlocked = true;
    }
    for (const p of c.paths || []) {
        const miss = checkPath(res.json, p);
        if (miss.length) r.failures.push(`missing ${p} at ${miss.length} location(s), e.g. ${miss.slice(0, 3).join(', ')}`);
    }
    for (const inv of c.invariants || []) {
        const msg = inv.check(res.json, ctx);
        if (!msg) continue;
        const downgrade = inv.severity === 'warn' ||
            (inv.kind === 'count' && (ctx.offseason || ctx.regularSeason === false));
        (downgrade ? r.warnings : r.failures).push(`${inv.name}: ${msg}`);
    }
    return settle(r);
}

async function runSport(sport, fetchJson, today) {
    const probe = await resolveProbe(sport, fetchJson, today);
    const probeResult = result(`${sport.sport}-probe`, sport.probe.route(dateBack(today, 1)));
    if (probe.unreachable) {
        probeResult.failures.push(`could not establish probe date: scoreboard unreachable or non-JSON on all ${WALK_BACK_DAYS} dates tried`);
        return { sport: sport.sport, probe: 'unreachable', results: [settle(probeResult)] };
    }
    let ctx;
    let label;
    if (probe.offseason) {
        // No live season signal available — a guessed year sends real requests to
        // routes that 502/empty on an out-of-range season (F2); contract routes
        // treat ctx.season == null as "omit the param".
        ctx = { offseason: true, fullSlate: false, regularSeason: false, season: null };
        label = `offseason (no finals in the last ${WALK_BACK_DAYS} days)`;
        probeResult.notes.push(label);
    } else {
        ctx = {
            ...probe.date,
            season: probe.season ?? today.getUTCFullYear(),
            finalId: probe.finalIds[0],
            fullSlate: probe.isGameDay && probe.regularSeason && inWeekRange(sport.fullSlateWeeks, probe.week, probe.lastRegularWeek),
            offseason: false,
            regularSeason: probe.regularSeason,
        };
        if (sport.fullSlateWeeks && probe.isGameDay && probe.regularSeason &&
            (typeof probe.week !== 'number' || typeof probe.lastRegularWeek !== 'number')) {
            probeResult.warnings.push(`full-slate floor disabled: ESPN week/calendar missing (week=${probe.week}, lastRegularWeek=${probe.lastRegularWeek})`);
        }
        probeResult.url = sport.probe.route(probe.date);
        label = `${probe.date.iso} (${probe.isGameDay ? 'game day' : 'off day'}, ${probe.regularSeason ? 'regular season' : 'non-regular season'}) · ${probe.finalIds.length} final(s) · full slate: ${ctx.fullSlate ? 'on' : 'off'}`;
    }
    if (probe.blocked != null) {
        probeResult.warnings.push(blockedNote(probe.blocked));
        probeResult.proxyBlocked = true;
    }
    settle(probeResult);
    const results = [probeResult];
    for (const c of sport.contracts) {
        if (ctx.offseason && c.needs) {
            const skip = result(c.id, null);
            skip.status = 'skip';
            skip.notes.push('skipped: offseason');
            results.push(skip);
            continue;
        }
        results.push(await runContract(c, ctx, fetchJson));
    }
    return { sport: sport.sport, probe: label, results };
}

function validateSports(sports) {
    for (const s of sports) {
        for (const c of s.contracts) {
            if (!c.id || typeof c.route !== 'function') throw new ContractError(`contract missing id/route in ${s.sport}`);
            for (const p of c.paths || []) {
                try { parsePath(p); } catch (e) { throw new ContractError(`${c.id}: ${e.message}`); }
            }
        }
    }
}

function exitCodeFor(sportReports) {
    const statuses = sportReports.flatMap(s => s.results.map(r => r.status));
    if (statuses.includes('fail')) return 2;
    if (statuses.includes('warn')) return 1;
    return 0;
}

const ICON = { pass: '✅', warn: '⚠️ ', fail: '❌', skip: '⏭️ ' };

function printReport(sportReports) {
    for (const s of sportReports) {
        console.log(`\n${s.sport.toUpperCase()}  probe: ${s.probe}`);
        for (const r of s.results) {
            console.log(`  ${ICON[r.status]} ${r.id}${r.url ? `  ${r.url}` : ''}`);
            for (const f of r.failures) console.log(`      FAIL ${f}`);
            for (const w of r.warnings) console.log(`      WARN ${w}`);
            for (const n of r.notes) console.log(`      note ${n}`);
        }
    }
}

async function main(argv) {
    const base = argv[0];
    const jsonIdx = argv.indexOf('--json');
    const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
    if (!base || base.startsWith('--')) {
        console.error('usage: node tools/contract-check.cjs <site-base-url> [--json <file>]');
        return 2;
    }
    let sports;
    try {
        sports = SPORT_FILES.map(f => require(path.join(__dirname, 'contracts', `${f}.cjs`)));
        validateSports(sports);
    } catch (e) {
        console.error(`malformed contract: ${e.message}`);
        return 2;
    }
    const fetchJson = fetchJsonFrom(base.replace(/\/$/, ''));
    const today = new Date();
    const reports = [];
    for (const s of sports) {
        try {
            reports.push(await runSport(s, fetchJson, today));
        } catch (e) {
            reports.push({ sport: s.sport, probe: 'crashed', results: [{
                id: `${s.sport}-probe`, url: null, status: 'fail',
                failures: [`runner crashed: ${e && e.message}`], warnings: [], notes: [],
            }] });
        }
    }
    printReport(reports);
    const exitCode = exitCodeFor(reports);
    if (jsonOut) {
        fs.writeFileSync(jsonOut, JSON.stringify({ generatedAt: today.toISOString(), base, exitCode, sports: reports }, null, 2));
    }
    console.log(`\n${['✅ PASS', '⚠️  WARN', '❌ FAIL'][exitCode]}`);
    return exitCode;
}

if (require.main === module) {
    main(process.argv.slice(2)).then(code => process.exit(code), e => {
        console.error('contract check crashed:', e);
        process.exit(2);
    });
}

module.exports = { dateBack, browserFallbackFrom, fetchJsonFrom, resolveProbe, runContract, runSport, validateSports, exitCodeFor, main };
