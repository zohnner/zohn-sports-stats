/**
 * Pages Function: /api/nflstarts
 * How a team's start compares with every NFL start since 1999 (D-201).
 * Same-origin, no keys, no D1. Source: nflverse games.csv (CC-BY 4.0), read
 * from GitHub releases, which Cloudflare can reach (ESPN it cannot, D-176).
 *
 * Usage: /api/nflstarts?team=JAX              through the team's games so far
 *        /api/nflstarts?team=JAX&through=8    through its first 8 games
 *        /api/nflstarts?team=JAX&season=2026&through=8
 *
 * Returns { ok, team, season, through, since, record:{w,l,t}, pf, pa, diff,
 *   sequence, pool, diffAtLeast, diffAtMost, peers, fewerPoints, nextFewestPoints,
 *   smallerDiff, sameSequence, source }. Field meanings: functions/_nflStarts.js.
 */
import { allRegularSeasonGames, nflverseSeason } from '../_nflverse.js';
import { startComps } from '../_nflStarts.js';

function json(obj, status = 200, ttl = 3600) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` },
    });
}

export async function onRequestGet({ request }) {
    const q = new URL(request.url).searchParams;
    const team = (q.get('team') || '').toUpperCase();
    if (!/^[A-Z]{2,3}$/.test(team)) return json({ ok: false, error: 'team must be a 2-3 letter abbreviation' }, 400, 60);
    const season = /^\d{4}$/.test(q.get('season') || '') ? Number(q.get('season')) : nflverseSeason();
    const through = /^\d{1,2}$/.test(q.get('through') || '') ? Number(q.get('through')) : undefined;
    try {
        const comps = startComps(await allRegularSeasonGames(), team, season, through);
        if (!comps) return json({ ok: false, error: `no finished ${season} games for ${team}` }, 404, 300);
        return json({ ok: true, ...comps, source: 'nflverse games.csv (CC-BY 4.0)' });
    } catch (e) {
        return json({ ok: false, error: 'nflverse games file unavailable' }, 502, 60);
    }
}
