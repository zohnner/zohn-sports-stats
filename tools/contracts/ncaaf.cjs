'use strict';
const L = require('../contract-lib.cjs');

const scoreboard = d => `/api/ncaaf?path=/scoreboard&groups=80&dates=${d.yyyymmdd}`;

module.exports = {
    sport: 'ncaaf',
    gameDay: 6,
    probe: { route: scoreboard, read: L.readEspnScoreboard },
    contracts: [
        {
            id: 'ncaaf-scoreboard',
            needs: 'probe',
            mirrors: 'js/ncaaf.js fetchNCAAFScoreboard (groups=80, D-135)',
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
                L.minCount('events', 50, { fullSlateOnly: true }),
                L.numeric('events[].competitions[0].competitors[].score'),
            ],
        },
        {
            id: 'ncaaf-summary',
            needs: 'final',
            mirrors: 'js/ncaafLiveGame.js fetchNCAAFSummary',
            route: c => `/api/ncaaf?path=/summary&event=${c.finalId}`,
            paths: [
                'header.competitions[0].status.type.state',
                'header.competitions[0].competitors[].team.abbreviation',
                'header.competitions[0].competitors[].score',
                'boxscore.teams[].statistics[].name',
                'boxscore.teams[].statistics[].displayValue',
            ],
            invariants: [L.exactCount('boxscore.teams', 2)],
        },
        {
            id: 'ncaaf-standings',
            mirrors: 'js/ncaaf.js fetchNCAAFStandings',
            route: c => `/api/ncaafstandings?season=${c.season}`,
            paths: [],
            invariants: [L.deepCount('entries', 120, { each: 'team.abbreviation' })],
        },
        {
            id: 'ncaaf-leaders',
            mirrors: 'js/ncaaf.js /api/ncaafstats leaders loader',
            route: c => `/api/ncaafstats?season=${c.season}`,
            paths: ['categories[].key', 'categories[].leaders[].id', 'categories[].leaders[].name', 'categories[].leaders[].value'],
            invariants: [L.minCount('categories', 5), L.eachNonEmpty('categories[].leaders')],
        },
    ],
};
