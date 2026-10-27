// Sleeper player ids for the NFL edge templates. /nfl/player/:id is keyed by
// Sleeper id, but leaders arrive from ESPN or nflverse with only a name and a
// team, and Sleeper's own espn_id/gsis_id fields are too sparse to join on.
// So the join is by normalized name (+team), the same bridge the client uses.

const SLEEPER = 'https://api.sleeper.app/v1/players/nfl';

// Sleeper's legacy codes -> the ESPN abbreviations /nfl/team/:abbr uses.
const TEAM_ALIAS = { WAS: 'WSH', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR', LA: 'LAR' };
const teamKey = t => { const u = String(t || '').toUpperCase(); return TEAM_ALIAS[u] || u; };

export function nameKey(name) {
    return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[\s,]+(jr|sr|ii|iii|iv|v)\.?$/, '')
        .replace(/[^a-z]/g, '');
}

// Pure: Sleeper's players map + [{name, team}] -> Sleeper id per person, or null.
// A name+team pair (or, failing that, a bare name) that matches two active
// players links to neither, so an ambiguous name never points at the wrong page.
export function sleeperIds(players, people) {
    const byNameTeam = new Map(), byName = new Map();
    for (const [id, p] of Object.entries(players || {})) {
        if (!p || !p.full_name || p.active === false) continue;
        const k = nameKey(p.full_name);
        if (!k) continue;
        const nt = `${k}|${teamKey(p.team)}`;
        byNameTeam.set(nt, byNameTeam.has(nt) ? null : id);
        byName.set(k, byName.has(k) ? null : id);
    }
    return people.map(({ name, team }) => {
        const k = nameKey(name);
        if (!k) return null;
        const nt = `${k}|${teamKey(team)}`;
        return byNameTeam.has(nt) ? byNameTeam.get(nt) : (byName.get(k) ?? null);
    });
}

export const playerSlug = name => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Same 24h-cached fetch /nfl/player/:id makes, so the edge serves both from one copy.
export async function fetchSleeperPlayers() {
    const r = await fetch(SLEEPER, { cf: { cacheTtl: 86400, cacheEverything: true } }).catch(() => null);
    return r && r.ok ? r.json().catch(() => null) : null;
}
