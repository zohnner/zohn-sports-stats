#!/usr/bin/env node
// FBS team records for /ncaaf/team/:id while ESPN blocks Cloudflare (D-176).
// Run daily by .github/workflows/ncaaf-teams.yml; ESPN answers GitHub's runners.
//
// Every NCAAF team page fetched ESPN from the edge, got a 403, and served the
// empty SPA shell (generic title, no body), so none of them could be indexed.
// One standings call carries all FBS teams with their records; this commits it
// as content/ncaaf/teams.json, which the team template reads when ESPN fails
// and tools/gen-sitemap.cjs reads to list FBS team pages only.
//
// Usage: node tools/ncaaf-teams.cjs [--out content/ncaaf/teams.json] [--season YYYY]

const fs = require('fs');
const path = require('path');

const STANDINGS = 'https://site.web.api.espn.com/apis/v2/sports/football/college-football/standings';
const MIN_TEAMS = 120;

// College football seasons are labeled by start year; Jan-Jul is last season.
function cfbSeason(now = new Date()) {
    const y = now.getUTCFullYear();
    return now.getUTCMonth() + 1 >= 8 ? y : y - 1;
}

function stat(entry, type) {
    const s = (entry.stats || []).find(x => x.type === type);
    return s ? String(s.displayValue != null ? s.displayValue : s.summary || '') : '';
}

// Pure: ESPN standings tree -> { season, asOf, teams: { [id]: {...} } }.
// Conferences are the root's children; Sun Belt nests East/West divisions.
function buildTeams(tree, { season, asOf }) {
    const teams = {};
    for (const conf of (tree && tree.children) || []) {
        for (const g of [conf, ...(conf.children || [])]) {
            for (const e of (g.standings && g.standings.entries) || []) {
                const t = e.team || {};
                const name = t.displayName || t.name;
                if (!t.id || !name) continue;
                teams[t.id] = {
                    name,
                    abbr: t.abbreviation || '',
                    conference: conf.name || '',
                    overall: stat(e, 'total'),
                    conf: stat(e, 'vsconf'),
                    home: stat(e, 'homerecord'),
                    away: stat(e, 'awayrecord'),
                    streak: stat(e, 'streak'),
                    pf: stat(e, 'pointsfor'),
                    pa: stat(e, 'pointsagainst'),
                };
            }
        }
    }
    return { season, asOf, teams };
}

function slug(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
    const args = process.argv.slice(2);
    const arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
    const out = path.resolve(arg('--out') || path.join(__dirname, '..', 'content', 'ncaaf', 'teams.json'));
    const season = parseInt(arg('--season'), 10) || cfbSeason();

    const u = new URL(STANDINGS);
    for (const [k, v] of Object.entries({ region: 'us', lang: 'en', contentorigin: 'espn', season, seasontype: 2, level: 3 })) u.searchParams.set(k, String(v));
    const res = await fetch(u, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`ESPN standings HTTP ${res.status}`);

    const snap = buildTeams(await res.json(), { season, asOf: new Date().toISOString().slice(0, 10) });
    const n = Object.keys(snap.teams).length;
    if (n < MIN_TEAMS) throw new Error(`only ${n} FBS teams in the standings (need ${MIN_TEAMS}); not writing`);

    // asOf changes daily; leave the file alone when no record moved, so the job commits only real changes.
    try {
        const prev = JSON.parse(fs.readFileSync(out, 'utf8'));
        if (prev.season === snap.season && JSON.stringify(prev.teams) === JSON.stringify(snap.teams)) {
            console.log(`${n} FBS teams, unchanged`);
            return;
        }
    } catch (_) { /* first run */ }

    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(snap, null, 1) + '\n');
    console.log(`wrote ${n} FBS teams to ${path.relative(process.cwd(), out)}`);
}

module.exports = { buildTeams, cfbSeason, slug, MIN_TEAMS };

if (require.main === module) {
    main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
