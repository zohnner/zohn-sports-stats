'use strict';
const L = require('../contract-lib.cjs');

const scoreboard = d => `/api/nfl?path=/scoreboard&dates=${d.yyyymmdd}`;

module.exports = {
    sport: 'nfl',
    gameDay: 0,
    probe: { route: scoreboard, read: L.readEspnScoreboard },
    contracts: [
        {
            id: 'nfl-scoreboard',
            needs: 'probe',
            mirrors: 'js/nfl.js fetchNFLScoreboard',
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
                'events[].competitions[0].competitors[].records[].summary',
                'events[].competitions[0].competitors[].linescores[].value',
            ],
            invariants: [
                // Floor of 8 assumes a full Sunday slate; a Christmas-on-Sunday
                // (2022: 3 games moved off-slot; next recurrence 2033) will warn/fail — revisit then.
                L.minCount('events', 8, { fullSlateOnly: true }),
                L.numeric('events[].competitions[0].competitors[].score'),
            ],
        },
        {
            id: 'nfl-summary',
            needs: 'final',
            mirrors: 'js/nflLiveGame.js fetchNFLSummary',
            route: c => `/api/nfl?path=/summary&event=${c.finalId}`,
            paths: [
                'header.competitions[0].status.type.state',
                'header.competitions[0].competitors[].homeAway',
                'header.competitions[0].competitors[].team.abbreviation',
                'header.competitions[0].competitors[].score',
                'boxscore.teams[].statistics[].name',
                'boxscore.teams[].statistics[].displayValue',
                'boxscore.players[].statistics[].athletes',
                'leaders[].leaders',
                'drives.previous',
                'winprobability[].homeWinPercentage',
            ],
            invariants: [L.exactCount('boxscore.teams', 2), L.minCount('drives.previous', 1)],
        },
        {
            id: 'nfl-standings',
            mirrors: 'js/nflStandings.js fetchNFLStandings',
            route: c => c.season == null ? '/api/nflstandings' : `/api/nflstandings?season=${c.season}`,
            paths: [],
            invariants: [L.deepCount('entries', 32, { exact: true, each: 'team.abbreviation' })],
        },
        {
            id: 'nfl-leaders',
            mirrors: 'js/nfl.js /api/nflstats leaders loader',
            route: () => '/api/nflstats',
            paths: ['categories[].key', 'categories[].leaders[].id', 'categories[].leaders[].name', 'categories[].leaders[].value'],
            invariants: [L.minCount('categories', 5), L.eachNonEmpty('categories[].leaders')],
        },
        {
            id: 'sleeper-players',
            mirrors: 'js/fantasy.js + js/nfl.js /api/sleeper players pool',
            route: () => '/api/sleeper?path=/v1/players/nfl',
            paths: [],
            invariants: [L.predicate('>= 1500 active players with full_name + position', data => {
                if (!data || typeof data !== 'object' || Array.isArray(data)) return 'not an object keyed by player id';
                const active = Object.values(data).filter(p => p && p.active && p.full_name && p.position);
                return active.length >= 1500 ? null : `only ${active.length} active players with full_name + position`;
            })],
        },
        {
            id: 'sleeper-trending',
            mirrors: 'js/nfl.js trending add/drop loader',
            route: () => '/api/sleeper?path=/v1/players/nfl/trending/add',
            paths: [],
            invariants: [L.predicate('non-empty array of {player_id, count}', data => {
                if (!Array.isArray(data) || data.length === 0) return 'empty or not an array';
                const bad = data.filter(x => !x || !x.player_id || typeof x.count !== 'number').length;
                return bad ? `${bad} entries missing player_id/count` : null;
            })],
        },
    ],
};
