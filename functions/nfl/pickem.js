// Pages Function: /nfl/pickem — crawlable, prerendered landing for the NFL
// Pick'em Confidence Helper (D-146). Clones the D-051/D-056 leaders.js
// pattern (real SPA shell + per-page <head> + a crawlable snapshot +
// __SS_ROUTE=nfl-pickem), with one deliberate difference: the explainer
// content below is NOT gated on live data existing. leaders.js gives up and
// falls back to the plain shell if its data fetch comes back empty (correct
// for a leaderboard, which is meaningless with no data) — a pick'em helper's
// explanation of what it does and how the ranking works is true and useful
// every single day of the year, offseason included, so that part always
// renders. The live "this week's blended rankings" section is strictly
// additive on top of it and silently omits itself if the current week has no
// games (bye weeks between seasons, the one week between postseason rounds
// with no games on the slate yet, etc.) rather than blanking the whole page.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

// -- Same probability math as js/nflPickem.js (client) -- duplicated, not
// imported: every Pages Function in this repo is self-contained, no shared
// module between functions/ and js/. Keep both in sync if the algorithm ever
// changes (see DECISIONS.md D-146).
function mlToProb(ml) {
    const n = Number(ml);
    if (!isFinite(n) || n === 0) return null;
    return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100);
}
function devig(pA, pB) {
    if (pA == null || pB == null) return [pA, pB];
    const sum = pA + pB;
    if (!sum) return [pA, pB];
    return [pA / sum, pB / sum];
}
function normalizePair(a, b) {
    const x = Number(a), y = Number(b);
    if (!isFinite(x) || !isFinite(y)) return [null, null];
    const sum = x + y;
    if (!sum) return [null, null];
    return [x / sum, y / sum];
}
function blend(a, b) {
    const vals = [a, b].filter(v => v != null);
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
}
function pct(p) { return p == null ? null : Math.round(p * 100); }

// Best-effort: returns a rendered snapshot section, or null if there's
// nothing live to show right now. Never throws -- any upstream hiccup here
// should just omit this section, not break the always-true explainer above it.
async function buildWeekSnapshot(request) {
    try {
        const sbRes = await fetch(new URL('/api/nfl?path=/scoreboard', request.url), { cf: { cacheTtl: 900, cacheEverything: true } });
        if (!sbRes.ok) return null;
        const sb = await sbRes.json();
        const events = (sb.events || []).slice(0, 16);
        if (!events.length) return null;

        const games = await Promise.all(events.map(async ev => {
            const comp = (ev.competitions && ev.competitions[0]) || {};
            const competitors = comp.competitors || [];
            const home = competitors.find(c => c.homeAway === 'home') || {};
            const away = competitors.find(c => c.homeAway === 'away') || {};
            const odds = (comp.odds && comp.odds[0]) || null;
            const ml = odds && odds.moneyline;
            const dkPair = devig(
                ml ? mlToProb(ml.home && ml.home.close && ml.home.close.odds) : null,
                ml ? mlToProb(ml.away && ml.away.close && ml.away.close.odds) : null
            );

            let espnHome = null, espnAway = null;
            try {
                const sumRes = await fetch(new URL(`/api/nfl?path=/summary&event=${ev.id}`, request.url), { cf: { cacheTtl: 900, cacheEverything: true } });
                if (sumRes.ok) {
                    const sum = await sumRes.json();
                    const pr = sum && sum.predictor;
                    if (pr && pr.homeTeam && pr.awayTeam) {
                        const pair = normalizePair(pr.homeTeam.gameProjection, pr.awayTeam.gameProjection);
                        espnHome = pair[0]; espnAway = pair[1];
                    }
                }
            } catch (_) { /* model probability just won't be available for this game */ }

            const blendHome = blend(dkPair[0], espnHome);
            const blendAway = blend(dkPair[1], espnAway);
            const homeHigher = (blendHome || 0) >= (blendAway || 0);
            return {
                homeAbbr: (home.team && home.team.abbreviation) || '',
                awayAbbr: (away.team && away.team.abbreviation) || '',
                pickAbbr: homeHigher ? (home.team && home.team.abbreviation) : (away.team && away.team.abbreviation),
                prob: pct(homeHigher ? blendHome : blendAway),
                spread: odds ? odds.details : null,
            };
        }));

        const ranked = games
            .filter(g => g.prob != null)
            .sort((a, b) => b.prob - a.prob);
        if (!ranked.length) return null;

        const n = ranked.length;
        const week = sb.week ? sb.week.number : null;
        const rows = ranked.map((g, i) => (
            `<tr><td>${n - i}</td><td>${esc(g.awayAbbr)} @ ${esc(g.homeAbbr)}</td><td>${esc(g.pickAbbr)}</td><td>${g.prob}%</td></tr>`
        )).join('');

        return `<h2>This Week's Blended Confidence Rankings${week ? ` — Week ${esc(week)}` : ''}</h2>` +
            `<p>Default ranking for ${n} games, blending DraftKings' line with ESPN's own model. Points 1&ndash;${n}, highest confidence first. ` +
            `Open the tool above to drag-reorder, flip any pick, and save your own version.</p>` +
            `<table><thead><tr><th>Confidence</th><th>Matchup</th><th>Pick</th><th>Win Prob.</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch (e) {
        return null;
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);

        const canonical = 'https://sportstrata.cc/nfl/pickem';
        const title = "NFL Pick'em Confidence Pool Helper — Free Rankings Tool | SportStrata";
        const desc  = "Rank your NFL confidence pool picks 1-16 with a free helper that blends DraftKings' line with ESPN's own model, flags games where they disagree, and lets you drag-reorder and flip any pick. No login, no ads.";

        const jsonld = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: "NFL Pick'em Confidence Pool Helper",
            applicationCategory: 'SportsApplication',
            operatingSystem: 'Any',
            url: canonical,
            description: desc,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        });

        const weekSnapshot = await buildWeekSnapshot(request);

        const snapshot =
            `<section class="ss-prerender"><h1>NFL Pick'em Confidence Pool Helper</h1>` +
            `<p>In a confidence pool, you don't just pick the winner of every NFL game — you rank all of them by how sure you are, assigning your most confident pick the highest point value (1 through however many games are on the week's slate). Get a high-confidence pick right and it's worth far more than a low-confidence one, so the ranking matters as much as the picks themselves.</p>` +
            `<p>This free tool builds a starting ranking for you by blending two independent signals: DraftKings' own line (moneyline, with the bookmaker's built-in vig removed) and ESPN's own Matchup Predictor model, which is built independently of any sportsbook. Games where the two sources disagree by a lot are flagged — those are the ones worth applying your own judgment to, not the safe chalk picks everyone gets right anyway.</p>` +
            `<h2>How to use it</h2><ul>` +
            `<li>Drag any game (or use the arrows) to move it up or down the confidence order.</li>` +
            `<li>Click either team in a matchup to flip your pick.</li>` +
            `<li>Your picks and season results save locally in your browser — no account needed.</li>` +
            `</ul>` +
            (weekSnapshot || '') +
            `<p><a href="/nfl">NFL Home</a></p></section>`;

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
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script><script>window.__SS_ROUTE=${JSON.stringify('nfl-pickem')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=900' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#nfl-pickem', 302); }
    }
}
