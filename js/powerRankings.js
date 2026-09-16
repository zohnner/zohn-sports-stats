// ============================================================
// In-house Power Rankings — opponent-adjusted SRS engine, all 6 sports.
// Replaces the old MLB (_mlbComputePowerRankings) and NFL (_nflPowerScore)
// composite scores, which had no strength-of-schedule adjustment at all.
//
// computeSRS solves rating[team] = weighted-mean(margin + opponent's rating)
// iteratively — a team's rating factors in who it played, not just what it
// did. See DECISIONS.md for the full build record.
// ============================================================

function _prClamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
}

function _prDaysAgo(dateStr, now) {
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) return 0;
    return Math.max(0, (now - t) / 86400000);
}

// Pure function: no DOM, no fetch. games = [{home, away, homeScore, awayScore, date}]
// (already filtered to completed/final games by the caller). teamList = every
// team abbr that should appear in the output, including teams with zero games.
function computeSRS(games, teamList, opts) {
    const {
        marginCap = Infinity,
        homeAdvantage = 0,
        recencyHalfLifeDays = 30,
        damping = 0.6,
        // Live-verified 2026-09-15: early-season sub-graphs (few games per
        // team, small connected components) converge correctly but slowly --
        // a real 29-team NCAAF component needed 373-933 iterations depending
        // on damping before max|delta| < tolerance, all converging to the
        // same fixed point. 100 was tuned for the offline synthetic tests
        // (which converge in single digits) and was never checked against a
        // real, sparse, early-season graph before this. Pure math, no I/O --
        // 3000 iterations over a full ~220-team sport still runs in well
        // under a second, so there's no real cost to a generous ceiling.
        maxIterations = 3000,
        tolerance = 0.001,
        now = Date.now(),
    } = opts || {};

    const teams = new Set(Array.isArray(teamList) ? teamList : []);
    (games || []).forEach(g => { teams.add(g.home); teams.add(g.away); });

    // Per-team list of {opponent, margin, weight}. Home-field adjustment is a
    // fixed scalar subtracted from the raw margin before capping -- clamping
    // a symmetric ±X value and its negation always yields negatives of each
    // other, so the away side is just the negation, not a second clamp call.
    const teamGames = new Map();
    teams.forEach(t => teamGames.set(t, []));
    const gamesPlayed = new Map();
    teams.forEach(t => gamesPlayed.set(t, 0));

    (games || []).forEach(g => {
        if (g.homeScore == null || g.awayScore == null) return;
        if (!teamGames.has(g.home)) teamGames.set(g.home, []);
        if (!teamGames.has(g.away)) teamGames.set(g.away, []);
        const rawMargin = g.homeScore - g.awayScore;
        const homeMargin = _prClamp(rawMargin - homeAdvantage, -marginCap, marginCap);
        const weight = Math.pow(0.5, _prDaysAgo(g.date, now) / recencyHalfLifeDays);
        teamGames.get(g.home).push({ opponent: g.away, margin: homeMargin, weight });
        teamGames.get(g.away).push({ opponent: g.home, margin: -homeMargin, weight });
        gamesPlayed.set(g.home, (gamesPlayed.get(g.home) || 0) + 1);
        gamesPlayed.set(g.away, (gamesPlayed.get(g.away) || 0) + 1);
    });

    let rating = new Map();
    teams.forEach(t => rating.set(t, 0));
    // Teams with zero games stay at exactly 0 and never enter the active set
    // below -- they don't participate in the iteration or the re-centering,
    // since they have no games to average and shouldn't drag the league mean.
    const activeTeams = [...teamGames.keys()].filter(t => teamGames.get(t).length > 0);

    // Connected components, found once via BFS over the team-game graph (who
    // played whom, not ratings, so this doesn't change across iterations).
    // Live-verified 2026-09-15: with only 1-3 weeks of a season played,
    // NCAAF's ~220-team pool is NOT one connected graph -- most teams sit in
    // small, mutually-disconnected clusters (a real check found the single
    // largest component held only 12 of 218 teams). A single global zero-mean
    // constraint across teams that share no common opponent, directly or
    // transitively, is both meaningless (there's no data linking their
    // absolute levels) and was the actual cause of a real non-convergence
    // warning + wildly inflated ratings (a 2-game team at +58) seen on that
    // live data -- forcing many independent components to share one mean
    // couples them through a slow-mixing feedback loop with no real fixed
    // point. Re-centering each connected component to its own zero mean is
    // both the mathematically correct treatment (you can only compare teams
    // that are connected by a chain of shared opponents) and what fixed the
    // non-convergence, verified against the same real data below.
    const componentOf = new Map();
    const components = [];
    activeTeams.forEach(start => {
        if (componentOf.has(start)) return;
        const comp = [];
        const queue = [start];
        componentOf.set(start, components.length);
        while (queue.length) {
            const t = queue.pop();
            comp.push(t);
            teamGames.get(t).forEach(gm => {
                if (!componentOf.has(gm.opponent) && teamGames.has(gm.opponent)) {
                    componentOf.set(gm.opponent, components.length);
                    queue.push(gm.opponent);
                }
            });
        }
        components.push(comp);
    });

    let converged = activeTeams.length === 0;
    let lastIteration = 0;
    for (let iter = 0; iter < maxIterations && !converged; iter++) {
        lastIteration = iter + 1;
        const target = new Map();
        activeTeams.forEach(t => {
            let wSum = 0, vSum = 0;
            teamGames.get(t).forEach(gm => {
                const oppRating = rating.get(gm.opponent) ?? 0;
                vSum += gm.weight * (gm.margin + oppRating);
                wSum += gm.weight;
            });
            target.set(t, wSum > 0 ? vSum / wSum : 0);
        });

        const newRating = new Map(rating);
        activeTeams.forEach(t => {
            const prev = rating.get(t) ?? 0;
            newRating.set(t, prev + damping * (target.get(t) - prev));
        });

        components.forEach(comp => {
            const mean = comp.reduce((s, t) => s + newRating.get(t), 0) / comp.length;
            comp.forEach(t => newRating.set(t, newRating.get(t) - mean));
        });

        let maxDelta = 0;
        activeTeams.forEach(t => {
            maxDelta = Math.max(maxDelta, Math.abs(newRating.get(t) - rating.get(t)));
        });
        rating = newRating;
        if (maxDelta < tolerance) converged = true;
    }

    if (!converged && typeof Logger !== 'undefined' && Logger.warn) {
        Logger.warn(`computeSRS did not converge after ${lastIteration} iterations`, null, 'POWERRANKINGS');
    }

    return [...teams].map(t => ({
        team: t,
        rating: Math.round((rating.get(t) || 0) * 1000) / 1000,
        gamesPlayed: gamesPlayed.get(t) || 0,
    })).sort((a, b) => b.rating - a.rating);
}

// Per-sport tuning -- the numbers that actually make this "real metrics" per
// sport rather than one generic formula. fetchSeasonGames/teamColorFn/
// teamLogoFn are wired in as each sport's adapter ships (see DECISIONS.md).
// fetchSeasonGames/fetchTeamMeta reference each sport's own adapter functions
// by name -- safe because this file loads after every per-sport file in the
// script chain (index.html), so those globals already exist by the time this
// object literal evaluates. MLB has no entry here for those two: its power
// rankings are a tab embedded in Standings (displayMLBPowerRankings, js/mlb.js),
// not routed through the shared _prShow, so it calls fetchMLBSeasonGames
// directly instead.
const _PWR_SPORTS = {
    mlb:   { label: 'MLB',   navRoute: 'mlb-powerrankings',   marginCap: 8,  homeAdvantage: 0,   recencyHalfLifeDays: 30 },
    nfl:   { label: 'NFL',   navRoute: 'nfl-powerrankings',   marginCap: 24, homeAdvantage: 2.5, recencyHalfLifeDays: 50,
             fetchSeasonGames: () => fetchNFLSeasonGames(), fetchTeamMeta: () => fetchNFLPowerTeamMeta() },
    ncaaf: { label: 'NCAAF', navRoute: 'ncaaf-powerrankings', marginCap: 28, homeAdvantage: 2.5, recencyHalfLifeDays: 45,
             fetchSeasonGames: () => fetchNCAAFSeasonGames(), fetchTeamMeta: () => fetchNCAAFPowerTeamMeta() },
    nba:   { label: 'NBA',   navRoute: 'nba-powerrankings',   marginCap: 20, homeAdvantage: 2.5, recencyHalfLifeDays: 22,
             fetchSeasonGames: () => fetchNBASeasonGames(), fetchTeamMeta: () => fetchNBAPowerTeamMeta() },
    wnba:  { label: 'WNBA',  navRoute: 'wnba-powerrankings',  marginCap: 20, homeAdvantage: 2,   recencyHalfLifeDays: 22,
             fetchSeasonGames: () => fetchWNBASeasonGames(), fetchTeamMeta: () => fetchWNBAPowerTeamMeta() },
    ncaab: { label: 'NCAAB', navRoute: 'ncaab-powerrankings', marginCap: 24, homeAdvantage: 2.5, recencyHalfLifeDays: 25,
             fetchSeasonGames: () => fetchNCAABSeasonGames(), fetchTeamMeta: () => fetchNCAABPowerTeamMeta() },
};

// Shared row-list renderer — every sport's power rankings page (MLB's
// tab-embedded UI included) renders through this one component instead of
// each sport carrying its own bespoke markup (the old MLB `.power-*` and NFL
// `.nstd-pwr-*` CSS were two unrelated systems with no shared classes at
// all). `cfg.getMeta(abbr)` resolves each team's {name, logo, color, record,
// onClick} -- the one piece every sport supplies differently, since MLB/NFL/
// ESPN sports don't share a team-lookup shape.
function _prRenderRows(scored, cfg) {
    const withGames = scored.filter(s => s.gamesPlayed > 0);
    if (!withGames.length) return null;
    const maxRating = withGames[0].rating;
    const minRating = withGames[withGames.length - 1].rating;
    const span = Math.max(maxRating - minRating, 0.01);
    const esc = typeof _escHtml === 'function' ? _escHtml : (s) => s;

    const rowsHtml = withGames.map((s, i) => {
        const meta = cfg.getMeta(s.team) || {};
        const pct = Math.max(4, Math.round(((s.rating - minRating) / span) * 100));
        const sign = s.rating > 0 ? '+' : '';
        const ratingColor = s.rating > 0 ? 'var(--color-win)' : s.rating < 0 ? 'var(--color-loss)' : 'var(--text-muted)';
        return `
            <div class="pwr-row" style="--tc:${meta.color || 'var(--border-default)'}" role="button" tabindex="0" onclick="${meta.onClick || ''}" onkeydown="if(event.key==='Enter')this.click()">
                <div class="pwr-rank">${i + 1}</div>
                ${meta.logo ? `<img class="pwr-logo" src="${esc(meta.logo)}" alt="" loading="lazy" data-hide-on-error>` : '<div class="pwr-logo"></div>'}
                <div class="pwr-team">
                    <div class="pwr-team-name">${esc(meta.name || s.team)}</div>
                    <div class="pwr-bar-wrap"><div class="pwr-bar-fill" style="width:${pct}%"></div></div>
                </div>
                <div class="pwr-record">${esc(meta.record || '')}</div>
                <div class="pwr-rating" style="color:${ratingColor}">${sign}${s.rating.toFixed(1)}</div>
            </div>`;
    }).join('');

    return `
        <div class="pwr-header-row">
            <div></div><div></div>
            <div class="pwr-col-label">Team</div>
            <div class="pwr-col-label">Record</div>
            <div class="pwr-col-label">Rating</div>
        </div>
        <div class="pwr-list">${rowsHtml}</div>
        <p class="pwr-note">Rating is an opponent-adjusted power score computed from this season's real results (strength of schedule, not just win%), weighted toward recent form. Click a team for its page.</p>
    `;
}

// Generic standalone-page renderer, used by every sport whose power rankings
// live at their own nav route (NFL, and the 4 sports newly getting one).
// MLB keeps its own wrapper (displayMLBPowerRankings, js/mlb.js) since its
// power rankings are a tab embedded in Standings, not a standalone route --
// but it still calls computeSRS/_prRenderRows, the same shared core.
async function _prShow(sport) {
    const cfg = _PWR_SPORTS[sport];
    const grid = document.getElementById('playersGrid');
    if (!cfg || !grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="pwr-loading"><div class="skeleton-line" style="height:48px;width:60%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Computing power rankings…</p></div>`;

    try {
        const [games, teamMeta] = await Promise.all([cfg.fetchSeasonGames(), cfg.fetchTeamMeta()]);
        const teamList = Object.keys(teamMeta);
        const scored = computeSRS(games, teamList, {
            marginCap: cfg.marginCap,
            homeAdvantage: cfg.homeAdvantage,
            recencyHalfLifeDays: cfg.recencyHalfLifeDays,
        });
        const listHtml = _prRenderRows(scored, { getMeta: (abbr) => teamMeta[abbr] });
        if (!listHtml) {
            grid.innerHTML = `<div class="pwr-wrap">
                <div class="pwr-head"><h1 class="md-title" style="margin:0">${cfg.label} Power Rankings</h1></div>
                <div class="pwr-empty"><p>Power rankings need real results to mean anything — no games have been played yet this season.</p></div>
            </div>`;
            return;
        }
        grid.innerHTML = `
            <div class="pwr-wrap">
                <div class="pwr-head">
                    <h1 class="md-title" style="margin:0">${cfg.label} Power Rankings</h1>
                    <p class="md-note">Opponent-adjusted rating from this season's actual results — computed, not editorial.</p>
                </div>
                ${listHtml}
            </div>`;
    } catch (err) {
        if (typeof Logger !== 'undefined') Logger.error(`${sport} power rankings failed`, err && err.message, 'POWERRANKINGS');
        grid.innerHTML = '<p style="padding:2rem;color:var(--text-muted);text-align:center">Couldn\'t load power rankings right now.</p>';
    }
}

if (typeof window !== 'undefined') {
    window.computeSRS = computeSRS;
    window._PWR_SPORTS = _PWR_SPORTS;
    window._prRenderRows = _prRenderRows;
    window._prShow = _prShow;
}
