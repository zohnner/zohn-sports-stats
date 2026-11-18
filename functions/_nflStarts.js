// How an NFL team's start compares with every start since 1999 (D-201).
// Import-free and pure so tests and the nightly contract can run it.
//
// Input rows are nflverse games.csv records (CC-BY 4.0): season, game_type,
// week, gameday, home_team, away_team, home_score, away_score. Only finished
// regular-season games count. "Through N games" means a team's first N games
// in week order, so a bye never shifts the comparison.

// /nfl/team/:abbr and ESPN use LAR and WSH; nflverse uses LA and WAS.
export const TO_NFLVERSE = { LAR: 'LA', WSH: 'WAS' };

export function teamSeasons(games) {
    const map = new Map();
    for (const g of games) {
        if (g.game_type !== 'REG' || g.home_score === '' || g.away_score === '') continue;
        const hs = Number(g.home_score), as = Number(g.away_score);
        if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
        const season = Number(g.season), week = Number(g.week);
        const add = (team, pf, pa) => {
            const key = `${season}|${team}`;
            if (!map.has(key)) map.set(key, { season, team, games: [] });
            map.get(key).games.push({ week, day: g.gameday || '', pf, pa });
        };
        add(g.home_team, hs, as);
        add(g.away_team, as, hs);
    }
    const out = [...map.values()];
    for (const ts of out) ts.games.sort((a, b) => a.week - b.week || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    return out;
}

function tally(games) {
    let w = 0, l = 0, t = 0, pf = 0, pa = 0, sequence = '';
    for (const g of games) {
        pf += g.pf; pa += g.pa;
        if (g.pf > g.pa) { w++; sequence += 'W'; } else if (g.pf < g.pa) { l++; sequence += 'L'; } else { t++; sequence += 'T'; }
    }
    return { w, l, t, pf, pa, diff: pf - pa, sequence };
}

const recordText = r => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;

// team: an nflverse or ESPN abbreviation. through: games to compare over
// (default: every game the team has played). Returns null when the team has
// no finished game that season.
export function startComps(games, team, season, through) {
    const abbr = TO_NFLVERSE[String(team).toUpperCase()] || String(team).toUpperCase();
    const all = teamSeasons(games);
    const me = all.find(ts => ts.season === Number(season) && ts.team === abbr);
    if (!me || !me.games.length) return null;
    const n = Math.max(1, Math.min(Number(through) || me.games.length, me.games.length));
    const mine = tally(me.games.slice(0, n));

    const others = all.filter(ts => ts !== me && ts.games.length >= n)
        .map(ts => ({ season: ts.season, team: ts.team, ...tally(ts.games.slice(0, n)), final: recordText(tally(ts.games)) }));
    const bySeason = (a, b) => a.season - b.season || (a.team < b.team ? -1 : 1);
    const brief = (o, value) => ({ season: o.season, team: o.team, value });

    // Peers: every other team-season with at least as many wins through N games.
    const peers = others.filter(o => o.w >= mine.w);
    const fewerPoints = peers.filter(o => o.pf <= mine.pf).sort(bySeason);
    const smallerDiff = peers.filter(o => o.diff <= mine.diff).sort(bySeason);
    const nextFewest = peers.filter(o => o.pf > mine.pf).sort((a, b) => a.pf - b.pf || bySeason(a, b))[0];
    const sameSequence = others.filter(o => o.sequence === mine.sequence).sort(bySeason);

    return {
        team: abbr, season: Number(season), through: n, since: Math.min(...all.map(ts => ts.season)),
        record: { w: mine.w, l: mine.l, t: mine.t }, pf: mine.pf, pa: mine.pa, diff: mine.diff, sequence: mine.sequence,
        // Counts below include this team, so "26 of 880" reads the way a story would write it.
        pool: others.length + 1,
        diffAtLeast: others.filter(o => o.diff >= mine.diff).length + 1,
        diffAtMost: others.filter(o => o.diff <= mine.diff).length + 1,
        peers: peers.length + 1,
        fewerPoints: { count: fewerPoints.length, teams: fewerPoints.slice(0, 8).map(o => brief(o, o.pf)) },
        nextFewestPoints: nextFewest ? brief(nextFewest, nextFewest.pf) : null,
        smallerDiff: { count: smallerDiff.length, teams: smallerDiff.slice(0, 8).map(o => brief(o, o.diff)) },
        sameSequence: {
            count: sameSequence.length,
            teams: sameSequence.slice(0, 12).map(o => ({ season: o.season, team: o.team, final: o.season < Number(season) ? o.final : null })),
        },
    };
}
