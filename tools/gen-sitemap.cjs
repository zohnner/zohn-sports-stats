#!/usr/bin/env node
/**
 * Regenerate sitemap.xml from live data (D-045 P2 — discovery for the edge-render
 * path URLs). Run from the repo root; needs outbound network (ESPN / MLB Stats API /
 * the live site's /api). The sandbox can't reach those, so this is owner/CI-run,
 * like tools/join-health.cjs.
 *
 *   node tools/gen-sitemap.cjs            # writes sitemap.xml
 *   node tools/gen-sitemap.cjs --dry      # prints the url count, writes nothing
 *
 * Only lists paths that have a real edge-render template today:
 *   landings /mlb /nfl /ncaaf · the 4 static stubs · /mlb/standings
 *   /mlb/team/{abbr} · /mlb/player/{id}/{slug}
 *   /ncaaf/team/{id}/{slug} · /ncaaf/player/{id}/{slug}
 *   /nfl/team/{abbr}/{slug} · /nfl/player/{sleeperId}/{slug}
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://sportstrata.cc';
const now = new Date();
const MLB_SEASON  = (now.getUTCMonth() + 1 >= 3 && now.getUTCMonth() + 1 <= 11) ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const CFB_SEASON  = (now.getUTCMonth() + 1 >= 8) ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const DRY = process.argv.includes('--dry');

function slug(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function urlTag(loc, changefreq = 'weekly', priority = '0.6') {
    return `    <url><loc>${BASE}${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}
async function jget(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.json();
}
function idFromRef(ref) { const m = /\/athletes\/(\d+)/.exec(ref || ''); return m ? m[1] : null; }

async function main() {
    const urls = [];
    const seen = new Set();
    const add = (tag) => { if (!seen.has(tag)) { seen.add(tag); urls.push(tag); } };

    // 1) static / landings / stubs
    add(urlTag('/', 'daily', '1.0'));
    for (const s of ['mlb', 'nfl', 'ncaaf']) add(urlTag('/' + s, 'daily', '0.9'));
    for (const s of ['mock-draft', 'draft-kit', 'playoff-odds', 'ask']) add(urlTag('/' + s, 'weekly', '0.7'));
    add(urlTag('/mlb/standings', 'daily', '0.7'));

    // 2) MLB teams
    try {
        const mt = await jget(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${MLB_SEASON}`);
        for (const t of (mt.teams || [])) {
            if (t.abbreviation) add(urlTag(`/mlb/team/${t.abbreviation.toLowerCase()}`, 'daily', '0.6'));
        }
    } catch (e) { console.error('MLB teams:', e.message); }

    // 3) MLB players (top hitting + pitching qualifiers, names inline)
    for (const group of ['hitting', 'pitching']) {
        try {
            const st = await jget(`https://statsapi.mlb.com/api/v1/stats?stats=season&season=${MLB_SEASON}&group=${group}&sportId=1&limit=80`);
            const splits = (st.stats && st.stats[0] && st.stats[0].splits) || [];
            for (const sp of splits) {
                const p = sp.player;
                if (p && p.id && p.fullName) add(urlTag(`/mlb/player/${p.id}/${slug(p.fullName)}`, 'weekly', '0.5'));
            }
        } catch (e) { console.error(`MLB ${group}:`, e.message); }
    }

    // 4) NCAAF teams (all FBS)
    try {
        const ct = await jget('https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=400');
        const teams = (ct.sports && ct.sports[0] && ct.sports[0].leagues && ct.sports[0].leagues[0] && ct.sports[0].leagues[0].teams) || [];
        for (const w of teams) {
            const t = w.team;
            if (t && t.id) add(urlTag(`/ncaaf/team/${t.id}/${slug(t.displayName || t.name)}`, 'weekly', '0.6'));
        }
    } catch (e) { console.error('NCAAF teams:', e.message); }

    // 5) NCAAF players — the site's own compact leaders endpoint (names+ids in one call)
    try {
        const cl = await jget(`${BASE}/api/ncaafstats?season=${CFB_SEASON}`);
        for (const cat of (cl.categories || [])) {
            for (const l of (cat.leaders || [])) {
                if (l.id && l.name) add(urlTag(`/ncaaf/player/${l.id}/${slug(l.name)}`, 'weekly', '0.5'));
            }
        }
    } catch (e) {
        // fallback: ESPN core leaders (ids only; canonical adds the slug)
        try {
            const cl = await jget(`https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${CFB_SEASON}/types/2/leaders?lang=en&region=us`);
            for (const cat of (cl.categories || [])) {
                for (const l of (cat.leaders || []).slice(0, 5)) {
                    const id = idFromRef(l.athlete && l.athlete.$ref);
                    if (id) add(urlTag(`/ncaaf/player/${id}`, 'weekly', '0.5'));
                }
            }
        } catch (e2) { console.error('NCAAF players:', e.message, '/', e2.message); }
    }

    // 6) NFL teams
    try {
        const nt = await jget('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams');
        const teams = (nt.sports && nt.sports[0] && nt.sports[0].leagues && nt.sports[0].leagues[0] && nt.sports[0].leagues[0].teams) || [];
        for (const w of teams) {
            const t = w.team;
            if (t && t.abbreviation) add(urlTag(`/nfl/team/${t.abbreviation.toLowerCase()}/${slug(t.displayName || t.name)}`, 'daily', '0.6'));
        }
    } catch (e) { console.error('NFL teams:', e.message); }

    // 7) NFL players (top fantasy-relevant by Sleeper search_rank)
    try {
        const players = await jget('https://api.sleeper.app/v1/players/nfl');
        const rows = Object.values(players)
            .filter(p => p && p.player_id && p.full_name && p.search_rank && p.search_rank < 400 && p.position && p.position !== 'DEF')
            .sort((a, b) => a.search_rank - b.search_rank);
        for (const p of rows) add(urlTag(`/nfl/player/${p.player_id}/${slug(p.full_name)}`, 'weekly', '0.5'));
    } catch (e) { console.error('NFL players:', e.message); }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    if (DRY) { console.log(`[dry] ${urls.length} urls (nothing written)`); return; }
    const out = path.join(process.cwd(), 'sitemap.xml');
    fs.writeFileSync(out, xml);
    console.log(`wrote ${out} — ${urls.length} urls (MLB season ${MLB_SEASON}, CFB ${CFB_SEASON})`);
}

main().catch(e => { console.error('gen-sitemap failed:', e); process.exit(1); });
