// ============================================================
// October Odds (D-039 Track 2c) — client-side Monte Carlo playoff
// odds. Zero inference cost: a transparent statistical model run in
// the user's browser.
//   strength  = pythagorean win% (runs^1.83), regressed 30% to .500
//   game prob = log5(home, away) + 3.5% home bump, clamped [.25,.75]
//   4,000 sims of the remaining schedule; field = 3 division winners
//   + 3 wild cards per league; ties broken by random jitter (v1
//   simplification — real MLB tiebreakers are head-to-head).
// Pure sim core is seeded (mulberry32) so tests are deterministic.
// ============================================================

const _ODDS_SIMS = 4000;
const _ODDS_WC_PER_LEAGUE = 3;

function _oddsMulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function _oddsStrength(rs, ra, gp) {
    if (!rs || !ra || !gp) return 0.5;
    const e = 1.83;
    const pythag = Math.pow(rs, e) / (Math.pow(rs, e) + Math.pow(ra, e));
    return pythag * 0.7 + 0.5 * 0.3;      // 30% regression to .500 — sample-size honesty
}

function _oddsGameProb(sHome, sAway) {
    // log5 (Bill James): P = (A - A*B) / (A + B - 2*A*B), then home bump
    const p = (sHome - sHome * sAway) / (sHome + sAway - 2 * sHome * sAway);
    return Math.min(0.75, Math.max(0.25, p + 0.035));
}

// teams: [{ id, league, division, wins, strength }] · games: [[homeIdx, awayIdx]]
// Returns { [id]: { div: 0-100, oct: 0-100 } }
function _mlbOddsSim(teams, games, nSims = _ODDS_SIMS, rng = Math.random, wcPerLeague = _ODDS_WC_PER_LEAGUE) {
    const n = teams.length;
    const pHome = games.map(([h, a]) => _oddsGameProb(teams[h].strength, teams[a].strength));
    const divWins = new Float64Array(n), octWins = new Float64Array(n);
    const wins = new Float64Array(n);

    // Group indices once
    const byDiv = {}, byLeague = {};
    teams.forEach((t, i) => {
        (byDiv[t.division] = byDiv[t.division] || []).push(i);
        (byLeague[t.league] = byLeague[t.league] || []).push(i);
    });

    for (let s = 0; s < nSims; s++) {
        for (let i = 0; i < n; i++) wins[i] = teams[i].wins + rng() * 0.01; // jitter = coin-flip ties
        for (let g = 0; g < games.length; g++) {
            if (rng() < pHome[g]) wins[games[g][0]]++; else wins[games[g][1]]++;
        }
        const winners = new Set();
        for (const div in byDiv) {
            let best = byDiv[div][0];
            for (const i of byDiv[div]) if (wins[i] > wins[best]) best = i;
            winners.add(best);
            divWins[best]++;
        }
        for (const lg in byLeague) {
            const rest = byLeague[lg].filter(i => !winners.has(i)).sort((a, b) => wins[b] - wins[a]);
            for (let k = 0; k < Math.min(wcPerLeague, rest.length); k++) winners.add(rest[k]);
        }
        winners.forEach(i => { octWins[i]++; });
    }

    const out = {};
    teams.forEach((t, i) => {
        out[t.id] = { div: divWins[i] / nSims * 100, oct: octWins[i] / nSims * 100 };
    });
    return out;
}

// ── Data assembly + public hooks ─────────────────────────────
let _oddsPromise = null;

function _oddsFmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function _mlbOddsEnsure(divisions) {
    if (AppState.mlbOdds && Date.now() - AppState.mlbOdds.ts < 30 * 60 * 1000) return false;
    if (_oddsPromise) return _oddsPromise;
    _oddsPromise = (async () => {
        const teams = [];
        const idx = {};
        (divisions || []).forEach(d => (d.teams || []).forEach(t => {
            if (t.teamId == null) return;
            idx[t.teamId] = teams.length;
            teams.push({
                id: t.teamId, league: d.league, division: d.division,
                wins: t.wins || 0,
                strength: _oddsStrength(parseFloat(t.rs), parseFloat(t.ra), (t.wins || 0) + (t.losses || 0)),
            });
        }));
        if (teams.length < 24) return false;   // partial standings — don't fabricate

        const today = new Date();
        const sched = await mlbFetch('/schedule', {
            sportId: 1, gameTypes: 'R',
            startDate: _oddsFmtDate(today),
            endDate: `${MLB_SEASON}-10-05`,
        }, ApiCache.TTL.DAILY);

        const games = [];
        (sched.dates || []).forEach(d => (d.games || []).forEach(g => {
            if (g.status?.abstractGameState !== 'Preview') return;
            const h = idx[g.teams?.home?.team?.id], a = idx[g.teams?.away?.team?.id];
            if (h !== undefined && a !== undefined) games.push([h, a]);
        }));

        const result = _mlbOddsSim(teams, games);
        AppState.mlbOdds = { byTeam: result, ts: Date.now(), sims: _ODDS_SIMS, gamesLeft: games.length };
        Logger.info(`October odds simulated: ${_ODDS_SIMS} seasons × ${games.length} games`, undefined, 'MLB');
        return true;
    })().finally(() => { _oddsPromise = null; });
    return _oddsPromise;
}

function _oddsFmtPct(v) {
    // Inclusive boundaries — 99.5 exactly must NOT round to "100" (a Monte
    // Carlo estimate never renders certainty; DESIGN.md no-false-precision).
    if (v >= 99.5 && v < 100) return '&gt;99';
    if (v > 0 && v <= 0.5) return '&lt;1';
    return String(Math.round(v));
}

function _mlbOddsCell(teamId, kind) {
    const o = AppState.mlbOdds?.byTeam?.[teamId];
    if (!o) return '—';
    const v = kind === 'div' ? o.div : o.oct;
    const cls = v >= 75 ? 'standings-odds--high' : v < 5 ? 'standings-odds--low' : '';
    return `<span class="standings-odds ${cls}">${_oddsFmtPct(v)}</span>`;
}
