// ============================================================
// HomeLive — pure decisions behind the home page's live refresh (D-173).
// No DOM, no fetch: setupHomeTickerPolling (js/app.js) asks liveSports and
// signature every tick, and _renderHomeHero asks pickHero which game leads.
// They're kept here so they can be unit-tested
// (tests/homeLive.test.js) — app.js itself can't load outside a browser.
//
// Input everywhere is { sport: games[] } using the normalized game shape
// every ESPN-backed sport file already produces: { id, isLive, isFinal,
// statusText, homeTeam: { score }, awayTeam: { score } }.
// ============================================================
const HomeLive = (() => {
    // Sports with a game in progress right now. Only these are worth a fresh
    // (cache-bypassing) fetch each tick; idle sports ride the 5-minute cache,
    // whose natural expiry is what discovers a game that just kicked off.
    function liveSports(gamesBySport) {
        return Object.keys(gamesBySport || {})
            .filter(sport => Array.isArray(gamesBySport[sport]) && gamesBySport[sport].some(g => g && g.isLive));
    }

    // A compact fingerprint of everything the hero can show: status, clock
    // text, and score per game. The hero is rebuilt from innerHTML, so
    // re-rendering it on a tick where nothing changed would flicker for no
    // reason -- the poll compares this before re-rendering.
    function signature(gamesBySport) {
        return Object.keys(gamesBySport || {}).sort().map(sport => {
            const games = Array.isArray(gamesBySport[sport]) ? gamesBySport[sport] : [];
            return sport + ':' + games.map(g => [
                g.id, g.isLive ? 'L' : g.isFinal ? 'F' : 'P', g.statusText || '',
                g.homeTeam && g.homeTeam.score, g.awayTeam && g.awayTeam.score,
            ].join(',')).join(';');
        }).join('|');
    }

    // Hero ranking. How much a game matters comes before whether it's live: a
    // World Series game an hour from first pitch beats an unranked live
    // college game, which "live always wins" used to get backwards. Tier 0 is
    // the regular season; only MLB's postseason round is wired in so far,
    // because it's the one sport whose scoreboard data was checked to say so.
    const MLB_ROUND_TIER = { F: 1, D: 2, L: 3, W: 4 };
    const PREEMPT_MS = 3 * 3600 * 1000;

    function mlbTier(g) { return MLB_ROUND_TIER[g && g.gameType] || 0; }

    // Either team is one win from taking the series. In the postseason,
    // statsapi's leagueRecord holds the series W-L, not the season's.
    function mlbCanClinch(g) {
        if (!mlbTier(g) || !g.gamesInSeries) return false;
        const need = Math.ceil(g.gamesInSeries / 2);
        const wins = side => (g.teams && g.teams[side] && g.teams[side].leagueRecord && g.teams[side].leagueRecord.wins) || 0;
        return wins('away') === need - 1 || wins('home') === need - 1;
    }

    // candidates: [{ live, start (epoch ms, NaN if unknown), tier, score, ... }].
    // Upcoming games count only if they start today (local), so a Saturday
    // game can't outrank Tuesday night. A tiered upcoming game competes at its
    // tier only within PREEMPT_MS of its start; until then it waits behind
    // whatever is live. Within a tier, live beats upcoming, then the score.
    function pickHero(candidates, now) {
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        const rankOf = c => c.live ? c.tier : (c.start - now <= PREEMPT_MS ? c.tier : 0);
        const eligible = (candidates || []).filter(c => c.live || !(c.start > endOfDay.getTime()));
        return eligible
            .map((c, i) => ({ c, i, rank: rankOf(c) }))
            .sort((a, b) => b.rank - a.rank || (b.c.live ? 1 : 0) - (a.c.live ? 1 : 0) || b.c.score - a.c.score || a.i - b.i)
            .map(x => x.c)[0] || null;
    }

    return { liveSports, signature, mlbTier, mlbCanClinch, pickHero };
})();
