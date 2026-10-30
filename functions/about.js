// Pages Function: /about — About & Methodology (D-189). Who runs the site,
// where every sport's data comes from, how the computed numbers (playoff odds,
// power rankings, Stories) are made, and how to reach us. Static content in the
// SPA shell, same pattern as functions/glossary.js; __SS_ROUTE='static-page-home'
// keeps the SPA from overwriting it (D-167). Method numbers here mirror
// js/odds.js and js/powerRankings.js — change them together.
import core from '../tools/stories/story-core.cjs';
import { shell, rawShell } from './_shell.js';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

const CANON = 'https://sportstrata.cc/about';
const TITLE = 'About SportStrata — Data Sources & Methodology';
const DESC  = 'Who runs SportStrata, where every stat comes from, how the playoff odds and power rankings are computed, and how SportStrata Stories are written. Free, no login, no ads.';

// [sport, sources]. Each source: [name, url, what it supplies].
const SOURCES = [
    ['MLB', [
        ['MLB Stats API', 'https://statsapi.mlb.com', 'scores, schedules, box scores, play-by-play, standings, rosters and season stats'],
        ['Baseball Savant', 'https://baseballsavant.mlb.com', 'Statcast percentile rankings and pitch data'],
    ]],
    ['NFL', [
        ['ESPN', 'https://www.espn.com/nfl/', 'scores, standings, stat leaders, game summaries, win probability and the betting lines shown on game previews'],
        ['Sleeper', 'https://sleeper.com', 'player pool, average draft position, depth charts, injury status and add/drop trends for the fantasy tools'],
        ['nflverse', 'https://github.com/nflverse', 'Next Gen Stats, plus standings, leaders and teams when ESPN is unreachable (CC-BY 4.0)'],
    ]],
    ['College football', [['ESPN', 'https://www.espn.com/college-football/', 'scores, rankings, standings, stat leaders, players and game summaries']]],
    ['College basketball', [['ESPN', 'https://www.espn.com/mens-college-basketball/', 'scores, rankings, standings and game summaries']]],
    ['NBA', [
        ['ESPN', 'https://www.espn.com/nba/', 'scores, standings, stat leaders, players and game summaries'],
        ['balldontlie', 'https://www.balldontlie.io', 'win-loss standings when ESPN is unreachable'],
    ]],
    ['WNBA', [['ESPN', 'https://www.espn.com/wnba/', 'scores, standings, stat leaders, players and game summaries']]],
];

function sourcesHtml() {
    return SOURCES.map(([sport, list]) =>
        `<h3>${esc(sport)}</h3><ul>` +
        list.map(([name, url, what]) => `<li><a href="${esc(url)}" rel="noopener">${esc(name)}</a>: ${esc(what)}.</li>`).join('') +
        `</ul>`).join('');
}

function snapshotHtml() {
    return `<section class="ss-prerender ss-about">` +
        `<h1>About SportStrata</h1>` +
        `<p>SportStrata is a free sports statistics site for MLB, the NFL, college football, college basketball, the NBA and the WNBA. ` +
        `It is an independent project, built and run by one person. It has no ads, no paywall, and every page works without an account. ` +
        `It is not affiliated with or endorsed by any league, team or data provider.</p>` +

        `<h2 id="sources">Where the data comes from</h2>` +
        `<p>Every number on the site is read from the sources below or computed from them; nothing is typed in by hand. ` +
        `Scores and stats belong to their respective owners. Standings, the home page and live game pages show when their data was last fetched ("Updated 2m 10s ago"), ` +
        `and live pages poll again on their own.</p>` +
        sourcesHtml() +

        `<h2 id="playoff-odds">How the MLB playoff odds work</h2>` +
        `<p>The DIV% and OCT% columns on MLB standings come from a Monte Carlo simulation that runs in your browser:</p><ol>` +
        `<li>Each team's strength is its Pythagorean win percentage (runs scored and allowed, exponent 1.83), regressed 30% toward .500 because early-season samples are small.</li>` +
        `<li>Each remaining game's win probability uses Bill James's log5 formula on the two strengths, plus 3.5 points for the home team, held between 25% and 75%.</li>` +
        `<li>The rest of the schedule is played out 4,000 times. Each run takes 3 division winners and 3 wild cards per league; DIV% and OCT% are the share of runs in which a team won its division or made the field.</li>` +
        `</ol><p>Known simplification: ties are broken at random, not by MLB's head-to-head tiebreakers.</p>` +

        `<h2 id="power-rankings">How the power rankings work</h2>` +
        `<p>Power rankings in every sport use a Simple Rating System (SRS): a team's rating is its average scoring margin, adjusted for the ratings of the teams it played, solved iteratively until the ratings settle.</p><ul>` +
        `<li>Margins are capped (8 runs in MLB, 20 points in the NBA and WNBA, 24 in the NFL and college basketball, 28 in college football) so a blowout counts no more than a decisive win.</li>` +
        `<li>Home-field advantage is removed first: 2.5 points in the NFL, college football, college basketball and the NBA, 2 in the WNBA, none in MLB.</li>` +
        `<li>Recent games count more, with weights that halve every 22 to 50 days depending on the sport.</li>` +
        `<li>Teams with no common opponents yet are rated within their own group, not against a league average that doesn't connect them.</li>` +
        `<li>In the first weeks of the NFL and college football seasons, each team's rating is blended with its own regressed rating from last season (computed the same way, never a poll), so one game doesn't decide the order.</li>` +
        `</ul>` +

        `<h2 id="stories">How SportStrata Stories are written</h2>` +
        `<p>SportStrata Stories are short data analyses written with AI assistance from SportStrata's own numbers, under the byline ${esc(core.BYLINE)}. ` +
        `Every number in a story is listed, with the exact source it came from, in a data file linked at the end of the story, and an automated check refuses to publish a story with a number that isn't in that file. ` +
        `Stories analyze numbers rather than report news; a story may link the news event that prompted it. Each story carries this disclosure: "${esc(core.DISCLOSURE)}"</p>` +

        `<h2 id="contact">Contact</h2>` +
        `<p>Corrections, data questions, press and partnerships: <a href="mailto:sportstrata@proton.me">sportstrata@proton.me</a>. ` +
        `If a number looks wrong, send the page link and it will be checked against the source.</p>` +

        `<p><a href="/">SportStrata Home</a> · <a href="/glossary">MLB Stat Glossary</a> · <a href="/nfl/glossary">NFL &amp; Fantasy Glossary</a></p>` +
        `</section>`;
}

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'AboutPage',
            name: TITLE, url: CANON, description: DESC,
            mainEntity: { '@type': 'Organization', name: 'SportStrata', url: 'https://sportstrata.cc', email: 'sportstrata@proton.me' },
        });
        let html = await (await rawShell(env, request.url)).text();
        html = html
            .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(TITLE)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(DESC)}$2`)
            .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, `$1${CANON}$2`)
            .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, `$1${CANON}$2`)
            .replace(/(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, `$1${esc(TITLE)}$2`)
            .replace(/(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, `$1${esc(DESC)}$2`)
            .replace(/(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, `$1${esc(TITLE)}$2`)
            .replace(/(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, `$1${esc(DESC)}$2`)
            .replace('</head>', () => `<script type="application/ld+json">${jsonld.replace(/</g, '\\u003c')}</script><script>window.__SS_ROUTE=${JSON.stringify('static-page-home')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', () => `<div id="playersGrid" class="players-grid">${snapshotHtml()}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/', 302); }
    }
}
