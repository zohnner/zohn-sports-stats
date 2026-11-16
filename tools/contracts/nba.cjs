'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../contract-lib.cjs');

// js/bballGameMath.js is a browser script; load the real file so the contract
// checks the math readers get, not a copy of it.
let _site = null;
function siteMath() {
    if (!_site) {
        const ctx = {};
        ctx.globalThis = ctx;
        vm.createContext(ctx);
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'bballGameMath.js'), 'utf8'), ctx);
        _site = vm.runInContext('BballMath', ctx);
    }
    return _site;
}

let _rankings = null;
function siteRankings() {
    if (!_rankings) {
        const ctx = { console };
        ctx.globalThis = ctx;
        vm.createContext(ctx);
        vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'powerRankings.js'), 'utf8')}\n;globalThis.__lm = largestMargins;`, ctx);
        _rankings = { largestMargins: ctx.__lm };
    }
    return _rankings;
}

// ESPN team ids 1-30.
const TEAM_IDS = Array.from({ length: 30 }, (_, i) => i + 1);

const ESPN = 'https://site.web.api.espn.com/apis';
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const scoreboard = d => `/api/nba?path=/scoreboard&dates=${d.yyyymmdd}`;
const seasonQs = c => (c.season == null ? '' : `?season=${c.season}&seasontype=2`);
const leadersV3 = c => `${ESPN}/site/v3/sports/basketball/nba/leaders${seasonQs(c)}`;

// The league's top scorer, so the per-athlete routes are checked against a
// player who is certain to have games this season.
async function topScorer(ctx, fetchJson) {
    const res = await fetchJson(leadersV3(ctx));
    const cat = (res.json?.leaders?.categories || []).find(c => c.name === 'pointsPerGame');
    const id = cat?.leaders?.[0]?.athlete?.id;
    return id ? { athleteId: id } : null;
}

module.exports = {
    sport: 'nba',
    gameDay: null,
    probe: { route: scoreboard, read: L.readEspnScoreboard },
    contracts: [
        {
            id: 'nba-scoreboard',
            needs: 'probe',
            mirrors: 'js/nba.js fetchNBAScoreboard',
            sources: [/sports\/basketball\/nba\/scoreboard/, /\/api\/nba\?path=\/scoreboard/],
            route: scoreboard,
            paths: [
                'events[].id',
                'events[].date',
                'events[].status.type.state',
                'events[].status.type.shortDetail',
                'events[].competitions[0].competitors[].homeAway',
                'events[].competitions[0].competitors[].team.abbreviation',
                'events[].competitions[0].competitors[].team.displayName',
                'events[].competitions[0].competitors[].score',
            ],
            invariants: [
                L.minCount('events', 1),
                L.numeric('events[].competitions[0].competitors[].score'),
            ],
        },
        {
            id: 'nba-summary',
            needs: 'final',
            mirrors: 'js/nba.js fetchNBAGameSummary (js/bballLiveGame.js, js/bballGameCenter.js)',
            sources: [/sports\/basketball\/nba\/summary/, /\/api\/nba\?path=\/summary/],
            route: c => `/api/nba?path=/summary&event=${c.finalId}`,
            paths: [
                'header.competitions[0].status.type.state',
                'header.competitions[0].competitors[].homeAway',
                'header.competitions[0].competitors[].team.abbreviation',
                'header.competitions[0].competitors[].score',
                'boxscore.teams[].statistics[].name',
                'boxscore.teams[].statistics[].displayValue',
                'boxscore.players[].statistics[].athletes[].athlete.id',
                'boxscore.players[].statistics[].athletes[].athlete.displayName',
                'plays[].type.id',
                'winprobability[].homeWinPercentage',
            ],
            invariants: [
                L.exactCount('boxscore.teams', 2),
                L.exactCount('boxscore.players', 2),
                L.minCount('plays', 50),
                // Stories read a player's line by position in `keys` (minutes, points).
                L.hasNames('boxscore.players[].statistics[].keys', ['minutes', 'points', 'rebounds', 'assists']),
                L.predicate('every player who played has one stat per key', data => {
                    for (const team of data?.boxscore?.players || []) {
                        for (const group of team.statistics || []) {
                            const bad = (group.athletes || []).find(a => !a.didNotPlay && Array.isArray(a.stats) && a.stats.length && a.stats.length !== (group.keys || []).length);
                            if (bad) return `${bad.athlete?.displayName || 'a player'} has ${bad.stats.length} stats for ${group.keys.length} keys`;
                        }
                    }
                    return null;
                }),
            ],
        },
        {
            id: 'nba-standings',
            mirrors: 'js/nba.js fetchNBAStandings',
            sources: [/sports\/basketball\/nba\/standings/, /\/api\/nbastandings/],
            route: c => (c.season == null ? '/api/nbastandings' : `/api/nbastandings?season=${c.season}`),
            paths: [],
            invariants: [
                L.deepCount('entries', 30, { exact: true, each: 'team.abbreviation' }),
                L.predicate('every team row has wins, losses, pointsFor, pointsAgainst', data => {
                    const need = ['wins', 'losses', 'pointsFor', 'pointsAgainst'];
                    const bad = L.deepCollect(data, 'entries').find(e => {
                        const have = new Set((e.stats || []).map(s => s.name));
                        return need.some(n => !have.has(n));
                    });
                    return bad ? `${bad.team?.abbreviation || 'a team'} is missing one of ${need.join(', ')}` : null;
                }),
            ],
        },
        {
            id: 'nba-leaders',
            mirrors: 'js/nba.js /api/nbastats leaders loader',
            route: c => (c.season == null ? '/api/nbastats' : `/api/nbastats?season=${c.season}`),
            paths: ['categories[].key', 'categories[].leaders[].id', 'categories[].leaders[].name', 'categories[].leaders[].value'],
            invariants: [L.minCount('categories', 5), L.eachNonEmpty('categories[].leaders')],
        },
        {
            id: 'nba-leaders-v3',
            mirrors: 'story source: ESPN site/v3 leaders (also what js/config.js _espnFetch rebuilds /api/nbastats from)',
            sources: [/site\/v3\/sports\/basketball\/nba\/leaders/],
            route: leadersV3,
            paths: [
                'leaders.categories[].name',
                'leaders.categories[].leaders[].value',
                'leaders.categories[].leaders[].athlete.id',
                'leaders.categories[].leaders[].athlete.displayName',
            ],
            invariants: [
                L.hasNames('leaders.categories', ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame', 'doubleDouble']),
                L.eachNonEmpty('leaders.categories[].leaders'),
            ],
        },
        {
            id: 'nba-team-schedule',
            mirrors: 'js/nba.js showNBATeam + fetchNBASeasonGames (/teams/{abbr}/schedule)',
            sources: [/sports\/basketball\/nba\/teams\/[^/?\s]+\/schedule/],
            route: () => '/api/nba?path=/teams/lal/schedule',
            paths: [
                'team.abbreviation',
                'events[].id',
                'events[].date',
                'events[].competitions[0].competitors[].team.abbreviation',
                'events[].competitions[0].status.type.completed',
            ],
            invariants: [L.minCount('events', 41), L.completedScores()],
        },
        {
            // Derived stat #106. The Power Rankings page lists the season's
            // largest margins from all 30 team schedules (js/powerRankings.js
            // largestMargins). This reads the same 30 schedules, runs the site's
            // function, and compares it with a plain maximum computed here.
            id: 'nba-largest-margin',
            needs: 'probe',
            mirrors: 'js/powerRankings.js largestMargins over js/nba.js fetchNBASeasonGames',
            resolve: async (c, fetchJson) => {
                const lists = await Promise.all(TEAM_IDS.map(id => fetchJson(`${ESPN}/site/v2/sports/basketball/nba/teams/${id}/schedule?season=${c.season}&seasontype=2`)));
                if (lists.some(r => !r.ok || !Array.isArray(r.json?.events))) return null;
                const seen = new Set(), games = [];
                let max = 0;
                for (const r of lists) {
                    for (const ev of r.json.events) {
                        const comp = ev.competitions?.[0];
                        if (seen.has(ev.id) || !comp?.status?.type?.completed) continue;
                        seen.add(ev.id);
                        const home = comp.competitors.find(t => t.homeAway === 'home'), away = comp.competitors.find(t => t.homeAway === 'away');
                        games.push({ home: home.team.abbreviation, away: away.team.abbreviation, homeScore: home.score?.value, awayScore: away.score?.value, date: ev.date });
                        const diff = Math.abs(Number(home.score?.value) - Number(away.score?.value));
                        if (diff > max) max = diff;
                    }
                }
                return { seasonGames: games, maxMargin: max };
            },
            route: c => `${ESPN}/site/v2/sports/basketball/nba/teams/1/schedule?season=${c.season}&seasontype=2`,
            paths: ['events[].id', 'events[].competitions[0].competitors[].homeAway'],
            invariants: [
                L.predicate('the site largest margin equals the maximum over all 30 schedules', (data, ctx) => {
                    const top = siteRankings().largestMargins(ctx.seasonGames || [], 5);
                    if (!top.length) return 'no finished games across the 30 schedules';
                    if (top[0].margin !== ctx.maxMargin) return `site says ${top[0].margin}, the schedules give ${ctx.maxMargin}`;
                    if (top[0].winnerScore - top[0].loserScore !== top[0].margin) return 'the top game does not add up';
                    return top.every((g, i) => i === 0 || top[i - 1].margin >= g.margin) ? null : 'the list is not in order';
                }),
            ],
        },
        {
            id: 'nba-athlete-statistics',
            mirrors: 'story source: ESPN core athlete statistics (also read by functions/api/nbaathlete.js)',
            sources: [/leagues\/nba\/seasons\/\d+\/types\/\d+\/athletes\/\d+\/statistics/],
            needs: 'probe',
            resolve: topScorer,
            route: c => `${CORE}/seasons/${c.season}/types/2/athletes/${c.athleteId}/statistics`,
            paths: ['splits.categories[].name', 'splits.categories[].stats[].name', 'splits.categories[].stats[].value'],
            invariants: [
                L.predicate('general has gamesPlayed + doubleDouble, offensive has points + avgPoints', data => {
                    const names = cat => new Set(((data?.splits?.categories || []).find(c => c.name === cat)?.stats || []).map(s => s.name));
                    const g = names('general'), o = names('offensive');
                    const missing = [...['gamesPlayed', 'doubleDouble', 'minutes'].filter(n => !g.has(n)), ...['points', 'avgPoints'].filter(n => !o.has(n))];
                    return missing.length ? `missing ${missing.join(', ')}` : null;
                }),
            ],
        },
        {
            id: 'nba-athlete-gamelog',
            mirrors: 'story source: ESPN common/v3 athlete game log',
            sources: [/sports\/basketball\/nba\/athletes\/\d+\/gamelog/],
            needs: 'probe',
            // Also reads ESPN's own season totals for the same player, so the
            // site's game-log math can be checked against a second source.
            resolve: async (c, fetchJson) => {
                const top = await topScorer(c, fetchJson);
                if (!top) return null;
                const res = await fetchJson(`${CORE}/seasons/${c.season}/types/2/athletes/${top.athleteId}/statistics`);
                const stat = (cat, name) => ((res.json?.splits?.categories || []).find(x => x.name === cat)?.stats || []).find(s => s.name === name)?.value;
                const core = { games: stat('general', 'gamesPlayed'), points: stat('offensive', 'points'), doubleDoubles: stat('general', 'doubleDouble') };
                return Object.values(core).every(Number.isFinite) ? { ...top, core } : null;
            },
            route: c => `${ESPN}/common/v3/sports/basketball/nba/athletes/${c.athleteId}/gamelog?season=${c.season}`,
            paths: ['labels', 'names', 'seasonTypes[].displayName', 'seasonTypes[].categories[].events[].eventId', 'seasonTypes[].categories[].events[].stats'],
            invariants: [
                L.hasNames('labels', ['MIN', 'PTS', 'REB', 'AST']),
                L.hasNames('names', ['minutes', 'points', 'totalRebounds', 'assists']),
                L.predicate('every game row has one stat per label and a dated event', data => {
                    const width = (data?.labels || []).length;
                    let rows = 0;
                    for (const st of data?.seasonTypes || []) {
                        for (const cat of st.categories || []) {
                            for (const ev of cat.events || []) {
                                rows++;
                                if (!Array.isArray(ev.stats) || ev.stats.length !== width) return `event ${ev.eventId} has ${ev.stats?.length} stats for ${width} labels`;
                                const meta = data.events?.[ev.eventId];
                                if (!meta?.gameDate || !meta?.opponent?.abbreviation) return `event ${ev.eventId} has no date or opponent`;
                            }
                        }
                    }
                    return rows ? null : 'no game rows for the league scoring leader';
                }),
                // Derived stats #92, #107, #126: the player page's game-log totals
                // (js/bballGameMath.js, the code readers run) against ESPN's season
                // totals for the same player. Minutes are left out: ESPN rounds
                // them per game in one feed and per season in the other.
                L.predicate('the site game-log totals match ESPN season totals', (data, ctx) => {
                    if (!ctx.core) return 'no season totals to compare against';
                    const s = siteMath().gameLogSummary(siteMath().gameLog(data));
                    if (!s) return 'the site math found no regular-season games';
                    const bad = ['games', 'points', 'doubleDoubles'].filter(k => s[k] !== ctx.core[k])
                        .map(k => `${k}: game log gives ${s[k]}, season totals say ${ctx.core[k]}`);
                    return bad.length ? bad.join('; ') : null;
                }),
            ],
        },
    ],
};
