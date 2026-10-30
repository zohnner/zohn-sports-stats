// Pages Function: / — crawlable, prerendered home (D-046 P6), the cross-sport
// "Today" front door since D-190 (was an MLB snapshot; MLB's hub is /mlb).
// Same proven D-041/D-045 edge-render pattern as the sport landings: serve the
// real SPA shell with dynamic-date <head> + a crawlable snapshot injected into
// #playersGrid: live games first across every sport, then today's games, then
// the latest SportStrata Stories, then each sport's hub. Same HTML for humans
// and bots. Every upstream is best-effort; any error fails safe to the app.

import { shell, rawShell } from './_shell.js';
import { readAllStories, storyListHtml } from './_storyLinks.js';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

const CANON = 'https://sportstrata.cc/';
const H1    = 'Today in Sports';
const ESPN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// [sport, label, hub, ESPN scoreboard path + params, game page prefix or null].
// site.web.api, not site.api (D-062). ESPN blocks Cloudflare egress at times
// (D-176); these then return nothing and the page shows MLB plus the rest.
const ESPN_SPORTS = [
    ['nfl',   'NFL',                '/nfl',   'football/nfl/scoreboard',                               '/nfl/game/'],
    ['ncaaf', 'College Football',   '/ncaaf', 'football/college-football/scoreboard?groups=80',         '/ncaaf/game/'],
    ['nba',   'NBA',                '/nba',   'basketball/nba/scoreboard',                              null],
    ['ncaab', 'College Basketball', '/ncaab', 'basketball/mens-college-basketball/scoreboard?groups=50', null],
    ['wnba',  'WNBA',               '/wnba',  'basketball/wnba/scoreboard',                             null],
];

// ET calendar day (schedule dates are ET-based).
function etDate(ms = Date.now()) {
    const et = new Date(ms - 5 * 3600 * 1000);
    return {
        iso: et.toISOString().slice(0, 10),
        pretty: et.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    };
}

// One game row: { sport, label, live, line, href }.
export function mlbGames(json) {
    const games = ((json && json.dates) || [])[0]?.games || [];
    return games.map(g => {
        const a = g.teams?.away, h = g.teams?.home;
        const an = a?.team?.name || 'Away', hn = h?.team?.name || 'Home';
        const st = g.status?.detailedState || '';
        const scored = a?.score != null && h?.score != null;
        return {
            sport: 'mlb', label: 'MLB',
            live: g.status?.abstractGameState === 'Live' && !/final/i.test(st),
            line: scored ? `${an} ${a.score}, ${hn} ${h.score} — ${st}` : `${an} at ${hn} — ${st}`,
            href: g.gamePk != null ? `/mlb/game/${g.gamePk}` : null,
        };
    });
}

// ESPN scoreboards: live games, plus games dated today (ET). NFL/NCAAF default
// to the whole week, so the date filter keeps "today" honest.
export function espnGames(json, [sport, label, , , prefix], todayIso) {
    return ((json && json.events) || []).flatMap(e => {
        const state = e.status?.type?.state;
        if (state !== 'in' && etDate(Date.parse(e.date)).iso !== todayIso) return [];
        const c = e.competitions?.[0]?.competitors || [];
        const away = c.find(x => x.homeAway === 'away'), home = c.find(x => x.homeAway === 'home');
        if (!away || !home) return [];
        const an = away.team?.displayName || 'Away', hn = home.team?.displayName || 'Home';
        const st = e.status?.type?.shortDetail || '';
        return [{
            sport, label, live: state === 'in',
            line: state === 'pre' ? `${an} at ${hn} — ${st}` : `${an} ${away.score}, ${hn} ${home.score} — ${st}`,
            href: prefix && e.id ? `${prefix}${e.id}` : null,
        }];
    });
}

async function getJson(url, headers = {}) {
    try {
        const r = await fetch(url, { headers: { Accept: 'application/json', ...headers }, cf: { cacheTtl: 60, cacheEverything: true } });
        return r.ok ? await r.json() : null;
    } catch (_) { return null; }
}

async function todaysGames(iso) {
    const [mlb, ...espn] = await Promise.all([
        getJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${iso}&hydrate=team,linescore`),
        ...ESPN_SPORTS.map(cfg => getJson(`https://site.web.api.espn.com/apis/site/v2/sports/${cfg[3]}`, { 'User-Agent': ESPN_UA })),
    ]);
    return [mlbGames(mlb), ...espn.map((j, i) => espnGames(j, ESPN_SPORTS[i], iso))].flat();
}

function gameList(rows) {
    return `<ul>${rows.map(r => {
        const text = `${r.label}: ${r.line}`;
        return `<li>${r.href ? `<a href="${esc(r.href)}">${esc(text)}</a>` : esc(text)}</li>`;
    }).join('')}</ul>`;
}

// Live first (every sport), then today's games, capped per sport so one
// 16-game MLB slate can't bury the rest.
export function gamesSnapshot(rows, pretty) {
    const live = rows.filter(r => r.live);
    const perSport = {};
    const rest = rows.filter(r => !r.live && (perSport[r.sport] = (perSport[r.sport] || 0) + 1) <= 8);
    let html = '';
    if (live.length) html += `<h2>Live now</h2>${gameList(live)}`;
    html += `<h2>Today's games — ${esc(pretty)}</h2>`;
    html += rest.length ? gameList(rest) : (live.length ? '' : '<p>No games on today’s schedule yet.</p>');
    return html;
}

const HUBS = [
    ['MLB', '/mlb'], ['NFL', '/nfl'], ['College Football', '/ncaaf'], ['NBA', '/nba'],
    ['College Basketball', '/ncaab'], ['WNBA', '/wnba'],
];

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const d = etDate();
        const title = `Today in Sports: Live Scores, Stats & Stories — ${d.pretty} | SportStrata`;
        const desc  = `Live scores and today's games across MLB, the NFL, college football, the NBA, college basketball and the WNBA, with standings, stat leaders and SportStrata's own data stories. Free, no login, no ads. Updated ${d.pretty}.`;
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'WebSite',
            name: 'SportStrata', url: CANON, description: desc,
            potentialAction: { '@type': 'SearchAction', target: 'https://sportstrata.cc/#mlb-players?q={q}', 'query-input': 'required name=q' }
        });
        const [rows, stories] = await Promise.all([todaysGames(d.iso), readAllStories(env, request.url)]);
        const snapshot =
            `<section class="ss-prerender"><h1>${esc(H1)}</h1>` +
            `<p>${esc(desc)}</p>` +
            gamesSnapshot(rows, d.pretty) +
            storyListHtml(stories.slice(0, 6), 'Latest SportStrata Stories') +
            `<h2>Every sport</h2><ul>${HUBS.map(([l, h]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul>` +
            `<ul><li><a href="/mlb/leaders">MLB Stat Leaders</a></li>` +
            `<li><a href="/mlb/standings">MLB Standings &amp; Playoff Odds</a></li>` +
            `<li><a href="/nfl/standings">NFL Standings</a></li>` +
            `<li><a href="/glossary">Stat Glossary</a></li>` +
            `<li><a href="/about">About &amp; Methodology</a></li></ul></section>`;

        let html = await (await rawShell(env, request.url)).text();
        html = html
            .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, `$1${CANON}$2`)
            .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, `$1${CANON}$2`)
            .replace(/(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace('</head>', () => `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', () => `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#home', 302); }
    }
}
