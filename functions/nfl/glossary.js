// Pages Function: /nfl/glossary — crawlable NFL/fantasy stat glossary (D-149).
// Same pattern as functions/glossary.js (D-041 Phase 2): pure content page, no API
// call, no data freshness concern. Every term here is verified against a real,
// shipped feature (js/fantasy.js's VBD engine, js/sos.js, js/nflLiveGame.js's
// Analytics tab) rather than written speculatively -- deliberately excludes terms
// like EPA/CPOE/target share/snap share that this site does not actually compute
// or display yet (EPA/CPOE are an explicit future build per D-081; the others were
// never found in the NFL surface at all), so this page never promises data the
// product doesn't have.
//
// Fail-safe to the shell. Does NOT set window.__SS_ROUTE -- same reasoning as
// functions/glossary.js: no interactive SPA view behind it, the snapshot IS the page.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

// Duplicated deliberately, same convention as functions/glossary.js's MLB_TERMS --
// Pages Functions can't import js/fantasy.js's client bundle.
const NFL_TERMS = {
    ADP: 'Average Draft Position — where a player is typically taken across real fantasy drafts (Sleeper data on SportStrata). The baseline every mock-draft grade and value comparison is measured against.',
    VORP: 'Value Over Replacement Player — how much better a player projects to be than a freely available replacement at the same position, given your league\'s size and scoring. SportStrata\'s Draft HQ value board ranks every player by VORP rather than raw projected points, since raw points overrates positions with less draft-day scarcity (a QB1 and a QB12 are often close; an RB1 and an RB12 rarely are).',
    PPR: 'Points Per Reception — a scoring format awarding a full point for every catch, on top of yardage/touchdown points. Raises the value of pass-catching backs and possession receivers relative to non-PPR scoring.',
    'Half-PPR': 'Half Points Per Reception — a middle-ground scoring format awarding 0.5 points per catch instead of PPR\'s full point. The most common format in casual redraft leagues.',
    Standard: 'Standard (non-PPR) scoring — no points awarded for receptions, only yardage and touchdowns. Shifts value toward touchdown-dependent players and away from high-volume, low-touchdown pass catchers.',
    Superflex: 'A roster format allowing a second starting quarterback (or any position) in the FLEX slot, instead of the usual RB/WR/TE-only flex. Dramatically raises quarterback value in drafts, since two QBs must start instead of one.',
    SOS: 'Strength of Schedule — how difficult a team\'s (or player\'s) remaining or full-season schedule is, based on opponent quality. SportStrata\'s Schedule tool ranks every team\'s matchups week by week for draft and season-long planning.',
    'Waiver Wire': 'The pool of unrostered players available for any team to claim after the season starts. SportStrata\'s Waiver Wire tool ranks trending adds and correlates them with same-team injury news, so a spike in adds can be read against *why* a player is suddenly available.',
    'Success Rate': 'The share of a team\'s plays that meaningfully advance the offense — by SportStrata\'s definition, gaining at least 40% of needed yardage on 1st down, 60% on 2nd down, or the full distance on 3rd/4th down. A more stable measure of offensive effectiveness than yards-per-play, since it doesn\'t let one long gain hide a series of failed plays.',
    'Drive Efficiency': 'How often a team\'s offensive drives end in points (touchdown or field goal) rather than a punt, turnover, or turnover on downs. Computed live for any in-progress or completed game on SportStrata\'s live game viewer.',
    'Next Gen Stats': 'NGS — player-tracking-derived advanced metrics (sourced from nflverse, 2016 season onward on SportStrata), shown as percentile bars against the rest of the league on player pages. Built from real on-field tracking data, not box-score totals.',
    'Bye Week': 'The one week each regular season a team does not play. A core fantasy-draft planning constraint — rostering two starters at the same position with the same bye week can leave a lineup short a player for a week.',
};

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);

        const terms = Object.keys(NFL_TERMS).sort((a, b) => a.localeCompare(b));
        const rows = terms.map(t =>
            `<dt id="${esc(t.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${esc(t)}</dt><dd>${esc(NFL_TERMS[t])}</dd>`
        ).join('');

        const canonical = 'https://sportstrata.cc/nfl/glossary';
        const title = 'NFL Fantasy Glossary — What ADP, VORP, Superflex & PPR Actually Mean | SportStrata';
        const desc = 'Plain-language definitions for every NFL fantasy term SportStrata uses — ADP, VORP, PPR, Superflex, Strength of Schedule, Waiver Wire, Success Rate and more. Free, no login, no ads.';

        const jsonld = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'DefinedTermSet',
            name: 'SportStrata NFL Fantasy Glossary',
            description: desc,
            url: canonical,
            hasDefinedTerm: terms.map(t => ({
                '@type': 'DefinedTerm',
                name: t,
                description: NFL_TERMS[t],
                inDefinedTermSet: canonical
            }))
        });

        const snapshot =
            `<section class="ss-prerender"><h1>NFL Fantasy Glossary</h1>` +
            `<p>Plain-language definitions for the fantasy and analytics terms SportStrata uses across Draft HQ, Mock Draft, Schedule, Waiver Wire, and the live game viewer. Free, no login required.</p>` +
            `<p><a href="/">SportStrata Home</a> · <a href="/nfl">NFL Home</a> · <a href="/nfl/leaders">NFL Stat Leaders</a></p>` +
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
