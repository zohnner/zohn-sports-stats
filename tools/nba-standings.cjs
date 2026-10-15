#!/usr/bin/env node
// NBA standings from Ball Don't Lie, for /nba/standings while ESPN blocks
// Cloudflare (D-176, D-181). Run by .github/workflows/nba-standings.yml.
//
// BDL's free tier serves /teams and /games but rate-limits the key at about
// 5 requests a minute (measured 2026-10-14: 429 on the 5th call), and a full
// season is ~13 pages of games. That rules out fetching per page view, so this
// runs once a day, paced, and commits content/nba/standings.json, which
// functions/nba/standings.js reads when ESPN fails. Goes through the existing
// Worker proxy, which holds the key; the same key serves Arcade, hence the pacing.
//
// Usage: node tools/nba-standings.cjs [--out content/nba/standings.json] [--season <BDL start year>]

const fs = require('fs');
const path = require('path');

const BDL = 'https://sportsstrata-proxy.zohnwheeler.workers.dev/bdl';
const PACE_MS = 13000;
const RETRY_429_MS = 65000;
const CONF_NAME = { East: 'Eastern Conference', West: 'Western Conference' };
const DIV_ORDER = { East: ['Atlantic', 'Central', 'Southeast'], West: ['Northwest', 'Pacific', 'Southwest'] };

// BDL labels a season by its start year; the site (ESPN) by its end year.
// Oct-Dec is the new season; Jan-Sep is the one that started last October
// (Jul-Sep keeps the finished season's final standings, matching js/nba.js).
function bdlSeason(now = new Date()) {
    const y = now.getUTCFullYear();
    return now.getUTCMonth() + 1 >= 10 ? y : y - 1;
}

const SEASON_GAMES = 82;

// BDL marks neither play-in games nor the NBA Cup championship as postseason,
// and neither counts in the standings (checked against ESPN's final 2025-26
// standings: counting them put 10 teams off by a game). The Cup final carries
// ist_stage 'Championship'; the play-in has no flag at all, but it always comes
// after every team's 82nd game, so a game counts only while both teams are short
// of 82. Returns the counted games in date order.
function regularSeasonGames(games, teamIds) {
    const played = new Map([...teamIds].map(id => [id, 0]));
    const counted = [];
    const finals = games
        .filter(g => !g.postseason && g.status === 'Final' && g.ist_stage !== 'Championship')
        .sort((a, b) => String(a.datetime || a.date).localeCompare(String(b.datetime || b.date)));
    for (const g of finals) {
        const h = g.home_team && g.home_team.id, v = g.visitor_team && g.visitor_team.id;
        if (!played.has(h) || !played.has(v)) continue;
        if (played.get(h) >= SEASON_GAMES || played.get(v) >= SEASON_GAMES) continue;
        played.set(h, played.get(h) + 1); played.set(v, played.get(v) + 1);
        counted.push(g);
    }
    return counted;
}

function currentTeams(teams) {
    return teams.filter(t => t.conference && t.conference.trim() && t.division && t.division.trim());
}

// Pure: BDL teams + games -> the {name, teams:[{name, record}]} sections the
// edge template renders. Exported for tests.
function buildSections(teams, games) {
    const current = currentTeams(teams);
    const rec = new Map(current.map(t => [t.id, { w: 0, l: 0 }]));
    for (const g of regularSeasonGames(games, rec.keys())) {
        const h = rec.get(g.home_team.id), v = rec.get(g.visitor_team.id);
        if (g.home_team_score === g.visitor_team_score) continue;
        if (g.home_team_score > g.visitor_team_score) { h.w++; v.l++; } else { v.w++; h.l++; }
    }
    const pct = r => (r.w + r.l) ? r.w / (r.w + r.l) : 0;
    const sections = [];
    for (const conf of ['East', 'West']) {
        for (const div of DIV_ORDER[conf]) {
            const rows = current.filter(t => t.conference === conf && t.division === div)
                .map(t => ({ name: t.full_name, r: rec.get(t.id) }))
                .sort((a, b) => pct(b.r) - pct(a.r) || b.r.w - a.r.w || a.name.localeCompare(b.name));
            if (rows.length) sections.push({ name: `${CONF_NAME[conf]} — ${div}`, teams: rows.map(x => ({ name: x.name, record: `${x.r.w}-${x.r.l}` })) });
        }
    }
    return sections;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function bdl(pathAndQuery) {
    for (let attempt = 1; attempt <= 5; attempt++) {
        const r = await fetch(`${BDL}${pathAndQuery}`);
        if (r.status === 429) { console.log(`429 on ${pathAndQuery}, waiting ${RETRY_429_MS / 1000}s (attempt ${attempt})`); await sleep(RETRY_429_MS); continue; }
        if (!r.ok) throw new Error(`BDL ${pathAndQuery}: ${r.status}`);
        return r.json();
    }
    throw new Error(`BDL ${pathAndQuery}: still rate-limited after 5 attempts`);
}

async function main() {
    const outArg = process.argv.indexOf('--out');
    const out = path.resolve(outArg > -1 ? process.argv[outArg + 1] : 'content/nba/standings.json');
    const seasonArg = process.argv.indexOf('--season');
    const season = seasonArg > -1 ? Number(process.argv[seasonArg + 1]) : bdlSeason();

    const teams = (await bdl('/teams')).data;
    const games = [];
    let cursor = null, pages = 0;
    do {
        await sleep(PACE_MS);
        const j = await bdl(`/games?seasons[]=${season}&postseason=false&per_page=100${cursor ? `&cursor=${cursor}` : ''}`);
        games.push(...j.data);
        cursor = j.meta && j.meta.next_cursor;
        pages++;
    } while (cursor && pages < 40);

    const sections = buildSections(teams, games);
    const teamCount = sections.reduce((n, s) => n + s.teams.length, 0);
    if (teamCount !== 30) throw new Error(`expected 30 teams, got ${teamCount}; not writing`);

    const finals = regularSeasonGames(games, currentTeams(teams).map(t => t.id));
    const body = {
        season: season + 1,
        seasonLabel: `${season}-${String(season + 1).slice(2)}`,
        throughDate: finals.map(g => g.date).sort().pop() || null,
        gamesCounted: finals.length,
        source: 'balldontlie',
        sections,
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(body, null, 2) + '\n');
    console.log(`Wrote ${out}: ${body.seasonLabel}, ${finals.length} final games through ${body.throughDate}, ${pages} page(s)`);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });

module.exports = { buildSections, bdlSeason, regularSeasonGames };
