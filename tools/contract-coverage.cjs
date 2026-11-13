#!/usr/bin/env node
// ============================================================
// SportStrata — story coverage (zero deps, offline).
// A published story is under contract when every upstream route its
// .facts.json cites is one a nightly contract checks (the contract's
// `sources` patterns). Printed at the end of every Contract Check run;
// one uncovered story fails the run.
//
//   node tools/contract-coverage.cjs            report, exit 2 if any uncovered
//   node tools/contract-coverage.cjs --json     the same as JSON
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Every sport with a contract file. The story sports must all be in here.
const SPORT_FILES = ['nfl', 'ncaaf', 'mlb', 'nba', 'ncaab'];

// Feeds a contract can reach. A URL anywhere else is a third-party page
// (Basketball-Reference, a news article): it can't be put under contract,
// so it is counted and listed on its own line instead of passing silently.
const FEED_HOST = /(^|\.)(espn\.com|statsapi\.mlb\.com|github\.com)$/;

// A fact computed from the story's other facts has no upstream of its own.
const DERIVED = /^\s*(derived\b|content\/[a-z]+\/stories\/\S+\.facts\.json)/i;

function hostOf(source) {
    const m = /^\s*https?:\/\/([^/\s?#]+)/i.exec(source);
    return m ? m[1].toLowerCase() : null;
}

// One fact source -> { state: 'covered' | 'derived' | 'external' | 'uncovered', contract?, host? }
function classify(source, contracts) {
    const src = String(source == null ? '' : source).trim();
    if (!src || DERIVED.test(src)) return { state: 'derived' };
    for (const c of contracts) {
        if ((c.sources || []).some(re => re.test(src))) return { state: 'covered', contract: c.id };
    }
    const host = hostOf(src);
    if (host && !FEED_HOST.test(host)) return { state: 'external', host: host.replace(/^www\./, '') };
    return { state: 'uncovered' };
}

function readStories(root, sport) {
    const dir = path.join(root, 'content', sport, 'stories');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md') && !f.endsWith('.social.md'))
        .sort()
        .map(f => {
            const slug = f.slice(0, -3);
            const factsFile = path.join(dir, `${slug}.facts.json`);
            let facts = null;
            try { facts = JSON.parse(fs.readFileSync(factsFile, 'utf8')).facts; } catch { facts = null; }
            return { sport, slug, facts: Array.isArray(facts) ? facts : null };
        });
}

function storySports(root) {
    const dir = path.join(root, 'content');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(s => fs.existsSync(path.join(dir, s, 'stories'))).sort();
}

// sports: the loaded contract modules ({ sport, contracts }).
function storyCoverage(root, sports, stories = null) {
    const bySport = Object.fromEntries(sports.map(s => [s.sport, s.contracts]));
    const all = stories || storySports(root).flatMap(s => readStories(root, s));
    const report = { published: 0, underContract: 0, uncovered: 0, externalFacts: 0, sports: {}, uncoveredStories: [], externalStories: [] };
    for (const st of all) {
        const row = report.sports[st.sport] = report.sports[st.sport] || { published: 0, underContract: 0, uncovered: 0 };
        row.published++; report.published++;
        const contracts = bySport[st.sport];
        const missing = new Set();
        const external = {};
        if (!contracts) missing.add(`no contract file for ${st.sport}`);
        else if (!st.facts) missing.add('no readable .facts.json');
        else {
            for (const f of st.facts) {
                const c = classify(f.source, contracts);
                if (c.state === 'uncovered') missing.add(String(f.source || '').replace(/\s+/g, ' ').slice(0, 140));
                if (c.state === 'external') external[c.host] = (external[c.host] || 0) + 1;
            }
        }
        if (missing.size) {
            row.uncovered++; report.uncovered++;
            report.uncoveredStories.push({ sport: st.sport, slug: st.slug, sources: [...missing] });
        } else {
            row.underContract++; report.underContract++;
        }
        const ext = Object.entries(external);
        if (ext.length) {
            report.externalFacts += ext.reduce((n, [, k]) => n + k, 0);
            report.externalStories.push({ sport: st.sport, slug: st.slug, hosts: external });
        }
    }
    return report;
}

function format(r) {
    const out = ['STORY COVERAGE  (published / under contract / uncovered)'];
    for (const [sport, row] of Object.entries(r.sports)) {
        out.push(`  ${row.uncovered ? '❌' : '✅'} ${sport.toUpperCase().padEnd(6)} ${row.published} / ${row.underContract} / ${row.uncovered}`);
    }
    out.push(`  Published: ${r.published}   Under contract: ${r.underContract}   Uncovered: ${r.uncovered}`);
    for (const u of r.uncoveredStories) {
        out.push(`      FAIL ${u.sport}/${u.slug}`);
        for (const s of u.sources) out.push(`           no contract for: ${s}`);
    }
    if (r.externalStories.length) {
        out.push(`  Third-party citations (no feed a contract can reach): ${r.externalFacts} fact(s) in ${r.externalStories.length} story(ies)`);
        for (const e of r.externalStories) {
            out.push(`      note ${e.sport}/${e.slug}: ${Object.entries(e.hosts).map(([h, n]) => `${h} (${n})`).join(', ')}`);
        }
    }
    return out.join('\n');
}

function loadSports() {
    return SPORT_FILES.map(f => require(path.join(__dirname, 'contracts', `${f}.cjs`)));
}

if (require.main === module) {
    const report = storyCoverage(path.join(__dirname, '..'), loadSports());
    console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) : format(report));
    process.exit(report.uncovered ? 2 : 0);
}

module.exports = { SPORT_FILES, classify, readStories, storySports, storyCoverage, format, loadSports };
