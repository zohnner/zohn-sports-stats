// Pages Function: /nba/team/:abbr(/:slug) — crawlable, prerendered NBA team
// page (parity #87 Phase B). Same pattern as /nfl/team/:abbr: SPA shell + per-
// team head (SportsTeam JSON-LD) + crawlable snapshot + __SS_ROUTE=nba-team-{ABBR},
// which hydrates js/nba.js showNBATeam. Same HTML for humans and bots; fail-safe.
//
// Identity comes from functions/_nbaTeams.js, not ESPN, so the page renders
// while ESPN blocks Cloudflare (D-176). The record line reads ESPN standings
// through readSource, then the daily Ball Don't Lie standings file (D-181), and
// is left out when neither answers. The long forms of ESPN's six non-standard
// abbreviations (sas, gsw, nyk, nop, uta, was) 301 to ESPN's (owner decision on #87).
import { shell, rawShell } from '../../../_shell.js';
import { readSource, TOLERANCE, SHAPES, staleNote, pageCacheControl } from '../../../_espnSource.js';
import { readStories, storyListHtml } from '../../../_storyLinks.js';
import { NBA_TEAMS, NBA_TEAM_ALIASES, findNBATeam, nbaTeamPath, nbaStandingFromTree, nbaStandingFromFallback, nbaStoriesFor } from '../../../_nbaTeams.js';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

async function teamRecord(context, team) {
    const { request, env } = context;
    const src = await readSource('standings:nba', new URL('/api/nbastandings', request.url), {
        maxStaleMs: TOLERANCE.standings, validate: SHAPES.standings, waitUntil: p => context.waitUntil(p),
        init: { cf: { cacheTtl: 1800, cacheEverything: true } },
    });
    const espn = src.data && src.data.ok !== false ? nbaStandingFromTree(src.data, team.abbr) : null;
    if (espn) return { src, row: espn, credit: '' };
    const fb = await env.ASSETS.fetch(new URL('/content/nba/standings.json', request.url))
        .then(r => r.ok ? r.json() : null).catch(() => null);
    const row = nbaStandingFromFallback(fb, team.name);
    if (!row) return { src, row: null, credit: '' };
    const credit = `<p>${esc(fb.seasonLabel || '')} regular season${fb.throughDate ? `, games through ${esc(fb.throughDate)}` : ''}. ` +
        `Data: <a href="https://www.balldontlie.io">balldontlie</a>.</p>`;
    return { src: null, row, credit };
}

function recordHtml(row) {
    if (!row) return '';
    const bits = [
        `${row.record}${row.pct ? ` (${row.pct})` : ''}`,
        row.division,
        row.seed ? `Conference seed ${row.seed}` : '',
        row.streak ? `Streak ${row.streak}` : '',
        row.home ? `Home ${row.home}` : '',
        row.road ? `Road ${row.road}` : '',
        row.lastTen ? `Last 10 ${row.lastTen}` : '',
        row.ppg && row.oppg ? `${row.ppg} points per game, ${row.oppg} allowed` : '',
    ].filter(Boolean);
    return `<h2>Record</h2><p>${esc(bits.join(' · '))}</p>`;
}

export async function onRequest(context) {
    const { request, env, params } = context;
    try {
        const raw = String(params.abbr || '').toUpperCase().replace(/[^A-Z]/g, '');
        const team = findNBATeam(raw);
        if (!team || !env.ASSETS) return shell(env, request.url);
        if (NBA_TEAM_ALIASES[raw]) return Response.redirect(`https://sportstrata.cc${nbaTeamPath(team)}`, 301);

        const { name, abbr } = team;
        const canonical = `https://sportstrata.cc${nbaTeamPath(team)}`;
        const route = 'nba-team-' + abbr;
        const { src, row, credit } = await teamRecord(context, team);
        const title = `${name} — Record, Schedule & Roster | SportStrata`;
        const desc = `${name}${row ? ` (${row.record})` : ''} — NBA record, recent results, upcoming games and roster with injury status. Free, no login.`;
        const jsonld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'SportsTeam', name, sport: 'Basketball', url: canonical });

        const others = NBA_TEAMS.filter(t => t.abbr !== abbr).slice().sort((a, b) => a.name.localeCompare(b.name))
            .map(t => `<li><a href="${nbaTeamPath(t)}">${esc(t.name)}</a></li>`).join('');
        const stories = storyListHtml(nbaStoriesFor(await readStories(env, request.url, 'nba'), abbr).slice(0, 5),
            `SportStrata Stories featuring the ${name}`, { sport: 'nba' });
        const snapshot =
            `<section class="ss-prerender"><h1>${esc(name)}</h1>` +
            `<p>${esc(name)} record, recent results, upcoming games and roster on SportStrata — free, no login, no ads.</p>` +
            recordHtml(row) + credit +
            `<p><a href="/nba">NBA Home</a> · <a href="/nba/standings">NBA Standings</a> · <a href="/nba/leaders">NBA Stat Leaders</a></p>` +
            stories +
            `<h2>Other NBA Teams</h2><ul>${others}</ul>` + staleNote(src, 'Standings') + `</section>`;

        let html = await (await rawShell(env, request.url)).text();
        html = html
            .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, `$1${canonical}$2`)
            .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, `$1${canonical}$2`)
            .replace(/(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script><script>window.__SS_ROUTE=${JSON.stringify(route)};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`)
            .replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': pageCacheControl(src, 300) } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#nba-teams', 302); }
    }
}
