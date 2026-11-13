'use strict';
const L = require('../contract-lib.cjs');

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
            resolve: topScorer,
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
            ],
        },
    ],
};
