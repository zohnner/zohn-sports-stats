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
            core.validateFacts(facts, profile).forEach(p => problems.push(`${slug}: ${p}`));
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
