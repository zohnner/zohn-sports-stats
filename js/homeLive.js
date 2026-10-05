// ============================================================
// HomeLive — pure decisions behind the home page's live refresh (D-171).
// No DOM, no fetch: setupHomeTickerPolling (js/app.js) asks these two
// questions every tick, and they're kept here so they can be unit-tested
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

    return { liveSports, signature };
})();
