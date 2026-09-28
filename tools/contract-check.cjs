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
const { ContractError, parsePath, checkPath } = require('./contract-lib.cjs');

const SPORT_FILES = ['nfl', 'ncaaf', 'mlb'];
const WALK_BACK_DAYS = 10;

const looksLikeHtml = snippet => /^\s*</.test(snippet || '');

function dateBack(today, n) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n));
    const iso = d.toISOString().slice(0, 10);
    return { iso, yyyymmdd: iso.replace(/-/g, ''), dow: d.getUTCDay() };
}

function fetchJsonFrom(base) {
    return async p => {
        try {
            const r = await fetch(base + p, { headers: { 'User-Agent': 'SportStrata-ContractCheck/1.0' } });
            const text = await r.text();
            let json = null;
            try { json = JSON.parse(text); } catch { json = null; }
            return { ok: r.ok, status: r.status, contentType: r.headers.get('content-type') || '', json, bodySnippet: text.slice(0, 200) };
        } catch (e) {
            return { ok: false, status: 0, contentType: '', json: null, bodySnippet: String(e && e.message) };
        }
    };
}

async function resolveProbe(sport, fetchJson, today) {
    let reachable = 0;
    let fallback = null;
    for (let n = 1; n <= WALK_BACK_DAYS; n++) {
        const date = dateBack(today, n);
        const res = await fetchJson(sport.probe.route(date));
        if (!res.ok || !res.json) continue;
        reachable++;
        const info = sport.probe.read(res.json);
        if (!info.finalIds.length) continue;
        const isGameDay = sport.gameDay === null || sport.gameDay === undefined || date.dow === sport.gameDay;
        const probe = { date, ...info, isGameDay };
        if (isGameDay) return probe;
        if (!fallback) fallback = probe;
    }
    if (fallback) return fallback;
    return reachable ? { offseason: true } : { unreachable: true };
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
    for (const p of c.paths || []) {
        const miss = checkPath(res.json, p);
        if (miss.length) r.failures.push(`missing ${p} at ${miss.length} location(s), e.g. ${miss.slice(0, 3).join(', ')}`);
    }
    for (const inv of c.invariants || []) {
        const msg = inv.check(res.json, ctx);
        if (!msg) continue;
        (inv.severity === 'warn' || ctx.offseason ? r.warnings : r.failures).push(`${inv.name}: ${msg}`);
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
        ctx = { offseason: true, fullSlate: false, season: today.getUTCFullYear() };
        label = `offseason (no finals in the last ${WALK_BACK_DAYS} days)`;
        probeResult.notes.push(label);
    } else {
        ctx = {
            ...probe.date,
            season: probe.season ?? today.getUTCFullYear(),
            finalId: probe.finalIds[0],
            fullSlate: probe.isGameDay && probe.regularSeason,
            offseason: false,
        };
        probeResult.url = sport.probe.route(probe.date);
        label = `${probe.date.iso} (${probe.isGameDay ? 'game day' : 'off day'}, ${probe.regularSeason ? 'regular season' : 'non-regular season'}) · ${probe.finalIds.length} final(s)`;
    }
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
    for (const s of sports) reports.push(await runSport(s, fetchJson, today));
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

module.exports = { dateBack, fetchJsonFrom, resolveProbe, runContract, runSport, validateSports, exitCodeFor, main };
