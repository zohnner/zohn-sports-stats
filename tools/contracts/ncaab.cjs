'use strict';
const L = require('../contract-lib.cjs');

// groups=50 is Division I. Without it ESPN returns a ranked-leaning subset
// (17 games instead of 132 on a real Saturday), the same class as D-135.
const scoreboard = d => `/api/ncaab?path=/scoreboard&groups=50&limit=400&dates=${d.yyyymmdd}`;

module.exports = {
    sport: 'ncaab',
    gameDay: 6,
    probe: { route: scoreboard, read: L.readEspnScoreboard },
    contracts: [
        {
            id: 'ncaab-scoreboard',
            needs: 'probe',
            mirrors: 'js/ncaab.js fetchNCAABScoreboard (groups=50)',
            sources: [/mens-college-basketball\/scoreboard/, /\/api\/ncaab\?path=\/scoreboard/],
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
                // A regular-season Saturday runs 60-150 Division I games; holiday
                // Saturdays run far fewer, so the floor only warns.
                L.minCount('events', 30, { fullSlateOnly: true, severity: 'warn' }),
                L.numeric('events[].competitions[0].competitors[].score'),
            ],
        },
        {
            id: 'ncaab-summary',
            needs: 'final',
            mirrors: 'js/ncaab.js fetchNCAABGameSummary (js/bballLiveGame.js)',
            sources: [/mens-college-basketball\/summary/, /\/api\/ncaab\?path=\/summary/],
            route: c => `/api/ncaab?path=/summary&event=${c.finalId}`,
            paths: [
                'header.competitions[0].status.type.state',
                'header.competitions[0].competitors[].homeAway',
                'header.competitions[0].competitors[].team.abbreviation',
                'header.competitions[0].competitors[].score',
                'boxscore.teams[].team.abbreviation',
            ],
            invariants: [L.exactCount('boxscore.teams', 2)],
        },
        {
            id: 'ncaab-rankings',
            mirrors: 'js/ncaab.js fetchNCAABRankings',
            sources: [/mens-college-basketball\/rankings/, /\/api\/ncaab\?path=\/rankings/],
            route: () => '/api/ncaab?path=/rankings',
            paths: ['rankings[].name', 'rankings[].ranks[].current', 'rankings[].ranks[].team.id'],
            invariants: [
                L.minCount('rankings', 1),
                L.predicate('the AP poll lists 25 teams', data => {
                    const ap = (data?.rankings || []).find(r => r.type === 'ap' || /AP/.test(r.name || ''));
                    if (!ap) return 'no AP poll in the response';
                    return (ap.ranks || []).length === 25 ? null : `AP poll has ${(ap.ranks || []).length} teams`;
                }, { severity: 'warn' }),
            ],
        },
        {
            id: 'ncaab-team-schedule',
            mirrors: 'story source: ESPN team schedule (js/ncaab.js power-rankings meta reads the same route family)',
            sources: [/mens-college-basketball\/teams\/[^/?\s]+\/schedule/],
            route: () => '/api/ncaab?path=/teams/150/schedule',
            paths: [
                'team.abbreviation',
                'events[].id',
                'events[].date',
                'events[].competitions[0].competitors[].team.id',
                'events[].competitions[0].status.type.completed',
            ],
            invariants: [L.minCount('events', 20), L.completedScores()],
        },
        {
            id: 'ncaab-standings',
            mirrors: 'js/ncaab.js fetchNCAABStandings',
            sources: [/mens-college-basketball\/standings/, /\/api\/ncaabstandings/],
            route: c => (c.season == null ? '/api/ncaabstandings' : `/api/ncaabstandings?season=${c.season}`),
            paths: [],
            invariants: [L.deepCount('entries', 300, { each: 'team.id' })],
        },
    ],
};
