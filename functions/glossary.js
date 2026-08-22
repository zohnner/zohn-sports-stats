// Pages Function: /glossary — crawlable MLB stat glossary (D-041 Phase 2, finally built).
// Pure content page: every term already lives in js/glossary.js (StatGlossary.MLB),
// used today for in-app tooltips. No API call, no data freshness concern, no drift
// risk — the definitions ARE the source of truth already shipped to users. This just
// makes them indexable. Mirrors the team/leaders templates: real SPA shell + per-page
// <head> + a crawlable snapshot + DefinedTermSet JSON-LD. Fail-safe to the shell.
//
// Design note (flagged, not silently decided): this page does NOT set window.__SS_ROUTE.
// Unlike team/player/leaders pages, there's no interactive SPA view behind it yet — the
// prerendered snapshot below IS the page, for humans and crawlers alike. A future
// interactive glossary (search/filter/grouping) is a Kael+Vera visual/UX call, not an
// SEO-plumbing one; this ships the indexable content now rather than waiting on that.
//
// D-114 update: added back-links to / and /mlb (and /mlb/leaders) — this page
// previously had zero outbound links, a dead end for any crawler that reached it.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

// Mirrors StatGlossary.MLB in js/glossary.js. Duplicated deliberately — Pages Functions
// run in an isolated edge worker with no access to the client JS bundle, so there is no
// way to `require`/`import` js/glossary.js here. If MLB stat definitions change, both
// copies need updating; flagged in ISSUES.md so this doesn't silently drift (Folio note).
const MLB_TERMS = {
    AVG: 'Batting Average — hits divided by at-bats.',
    HR: 'Home Runs.',
    RBI: 'Runs Batted In.',
    OBP: 'On-Base Percentage — how often a batter reaches base per plate appearance.',
    SLG: 'Slugging Percentage — total bases per at-bat.',
    OPS: 'On-Base Plus Slugging (OBP + SLG).',
    SB: 'Stolen Bases.',
    ERA: 'Earned Run Average — earned runs allowed per 9 innings pitched.',
    WHIP: 'Walks Plus Hits per Inning Pitched.',
    IP: 'Innings Pitched.',
    'K/9': 'Strikeouts per 9 innings pitched.',
    FIP: 'Fielding Independent Pitching — an ERA estimator using only home runs, walks, and strikeouts. Removes team defense from the equation.',
    xBA: 'Expected Batting Average based on exit velocity and launch angle (Statcast).',
    xSLG: 'Expected Slugging Percentage based on quality of contact (Statcast).',
    xwOBA: 'Expected Weighted On-Base Average based on quality of contact (Statcast).',
    EV: 'Exit Velocity — average speed of the ball off the bat, in mph.',
    'Barrel%': 'Barrel Percentage — share of batted balls classified as "barrels" (the optimal combination of exit velocity and launch angle).',
    LA: 'Launch Angle — average vertical angle of batted balls, in degrees.',
    'Sprint Speed': 'Sprint Speed — feet per second in a player’s best running situations.',
    ISO: 'Isolated Power — extra-base power. Formula: Slugging Percentage minus Batting Average.',
    BABIP: 'Batting Average on Balls In Play — how often balls put in play fall for hits. Formula: (Hits minus Home Runs) divided by (At-Bats minus Strikeouts minus Home Runs plus Sacrifice Flies).',
    'K%': 'Strikeout Percentage — share of plate appearances that end in a strikeout.',
    'BB%': 'Walk Percentage — share of plate appearances that end in a walk.',
    'BB/9': 'Walks per 9 Innings — walks allowed per 9 innings pitched.',
    'K-BB%': 'Strikeout Percentage minus Walk Percentage — a composite command-and-stuff metric.',
    QS: 'Quality Start — a start of at least 6 innings pitched with 3 or fewer earned runs allowed.',
    'QS%': 'Quality Start Percentage — share of a pitcher’s starts that qualify as quality starts.',
    RC: 'Runs Created — a Bill James formula estimating a hitter’s offensive contribution: (Hits plus Walks) times Total Bases, divided by (At-Bats plus Walks).',
    'SB%': 'Stolen Base Percentage — share of steal attempts that succeed.',
    wOBA: 'Weighted On-Base Average — weights every way of reaching base by its actual run value. A more accurate offensive measure than on-base percentage alone.',
    'LOB%': 'Left on Base Percentage — the share of a pitcher’s baserunners who do not score. Higher means a better ability to strand runners.',
    'HH%': 'Hard Hit Percentage — share of batted balls hit with an exit velocity of 95 mph or higher (Statcast).',
    'SS%': 'Sweet Spot Percentage — share of batted balls hit with a launch angle between 8 and 32 degrees, the optimal contact zone.',
    'Whiff%': 'Whiff Percentage — share of swings that miss entirely. Higher means more swing-and-miss stuff.',
    'CSW%': 'Called Strike plus Whiff Percentage — share of pitches that result in either a called strike or a swinging strike. A composite command-and-stuff metric.',
    RDIFF: 'Run Differential — a team’s runs scored minus runs allowed.',
};

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);

        const terms = Object.keys(MLB_TERMS).sort((a, b) => a.localeCompare(b));
        const rows = terms.map(t =>
            `<dt id="${esc(t.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${esc(t)}</dt><dd>${esc(MLB_TERMS[t])}</dd>`
        ).join('');

        const canonical = 'https://sportstrata.cc/glossary';
        const title = 'MLB Stat Glossary — What FIP, wRC+, WHIP, xwOBA & Every Stat Actually Means | SportStrata';
        const desc = 'Plain-language definitions for every MLB stat SportStrata tracks — batting average to wRC+, ERA to xwOBA, BABIP to barrel rate. Free, no login, no ads.';

        const jsonld = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'DefinedTermSet',
            name: 'SportStrata MLB Stat Glossary',
            description: desc,
            url: canonical,
            hasDefinedTerm: terms.map(t => ({
                '@type': 'DefinedTerm',
                name: t,
                description: MLB_TERMS[t],
                inDefinedTermSet: canonical
            }))
        });

        const snapshot =
            `<section class="ss-prerender"><h1>MLB Stat Glossary</h1>` +
            `<p>Plain-language definitions for every stat SportStrata tracks, from basic counting stats to advanced Statcast metrics. Free, no login required.</p>` +
            `<p><a href="/">SportStrata Home</a> · <a href="/mlb">MLB Stats</a> · <a href="/mlb/leaders">MLB Stat Leaders</a></p>` +
            `<dl>${rows}</dl></section>`;

        let html = await (await shell(env, request.url)).text();
        html = html
            .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, `$1${canonical}$2`)
            .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, `$1${canonical}$2`)
            .replace(/(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/', 302); }
    }
}
