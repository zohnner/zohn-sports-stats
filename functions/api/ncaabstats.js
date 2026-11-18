/**
 * Pages Function: /api/ncaabstats
 * NCAA men's basketball statistical leaders (#191), in the same payload shape
 * as /api/nbastats. Reads ESPN site/v3 /leaders, which carries each leader's
 * name, position, team and headshot inline, so one request covers it (the
 * core-API route nbastats.js uses would need a team-id table for ~360 schools).
 * The browser fallback in js/config.js (_espnLeadersResponse) builds the same
 * shape from the same URL while ESPN blocks Cloudflare (D-176).
 *
 * FG% and FT% are left out on purpose: ESPN applies no attempts minimum to
 * college leaders (2026-11-17: FG% led at 85.7%, every FT% leader at 100%) and
 * the feed carries no attempt counts to filter on.
 *
 * Usage: /api/ncaabstats            -> ESPN's current season
 *        /api/ncaabstats?season=2027 (end-year label, like the rest of js/ncaab.js)
 */
const V3 = 'https://site.web.api.espn.com/apis/site/v3/sports/basketball/mens-college-basketball/leaders';

export const NCAAB_LEADER_CATS = [
    { key: 'pointsPerGame',      label: 'Points Per Game',          unit: 'PPG' },
    { key: 'reboundsPerGame',    label: 'Rebounds Per Game',        unit: 'RPG' },
    { key: 'assistsPerGame',     label: 'Assists Per Game',         unit: 'APG' },
    { key: 'stealsPerGame',      label: 'Steals Per Game',          unit: 'SPG' },
    { key: 'blocksPerGame',      label: 'Blocks Per Game',          unit: 'BPG' },
    { key: '3PointsMadePerGame', label: '3-Pointers Made Per Game', unit: '3PM' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function json(obj, status = 200, ttl = 3600) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${ttl}`,
            'Access-Control-Allow-Origin': '*',
        },
    });
}

export function shapeLeaders(j, season) {
    const byKey = new Map(((j && j.leaders && j.leaders.categories) || []).map(c => [c.name, c]));
    const categories = NCAAB_LEADER_CATS.map(c => ({
        key: c.key, label: c.label, unit: c.unit,
        leaders: ((byKey.get(c.key) || {}).leaders || []).slice(0, 5).map(l => {
            const a = l.athlete || {};
            const t = l.team || a.team || {};
            return {
                id: a.id ? String(a.id) : '',
                name: a.displayName || a.fullName || '',
                pos: (a.position && a.position.abbreviation) || '',
                team: t.abbreviation || '',
                logo: (t.logos && t.logos[0] && t.logos[0].href) || '',
                headshot: (a.headshot && a.headshot.href) || '',
                value: l.displayValue,
            };
        }).filter(x => x.name),
    })).filter(c => c.leaders.length);
    const yr = Number(season || (j && j.requestedSeason && j.requestedSeason.year) || (j && j.currentSeason && j.currentSeason.year));
    return { season: yr, categories };
}

export async function onRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: {
            'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400',
        }});
    }
    const qs = new URL(request.url).searchParams.get('season');
    const season = /^\d{4}$/.test(qs || '') ? qs : '';
    const base = `${V3}?seasontype=2${season ? `&season=${season}` : ''}`;
    const get = url => fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': UA },
        cf: { cacheTtl: 3600, cacheEverything: true },
    });
    try {
        // v3 intermittently 500s per query variant (D-181): try the other once.
        let r = await get(`${base}&limit=5`);
        if (!r.ok) r = await get(base);
        if (!r.ok) return json({ error: 'leaders fetch failed', detail: 'status ' + r.status }, 502, 60);
        const body = shapeLeaders(await r.json(), season);
        if (!body.categories.length) return json({ error: 'no leaders', season: body.season }, 502, 60);
        return json(body);
    } catch (e) {
        return json({ error: 'leaders fetch failed', detail: e.message }, 502, 60);
    }
}
