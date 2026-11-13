'use strict';
const L = require('../contract-lib.cjs');
const fields = require('../fields/field-core.cjs');

const ESPN = 'https://site.web.api.espn.com/apis';
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
            sources: [/sports\/football\/nfl\/scoreboard/, /\/api\/nfl\?path=\/scoreboard/],
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
            sources: [/sports\/football\/nfl\/standings/, /\/api\/nflstandings/],
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
        {
            id: 'nfl-team-schedule',
            mirrors: 'js/nfl.js team page schedule (/teams/{abbr}/schedule); story source',
            sources: [/sports\/football\/nfl\/teams\/[^/?\s]+\/schedule/],
            route: () => '/api/nfl?path=/teams/kc/schedule',
            paths: [
                'team.abbreviation',
                'events[].id',
                'events[].date',
                'events[].competitions[0].competitors[].team.abbreviation',
                'events[].competitions[0].status.type.completed',
            ],
            invariants: [L.minCount('events', 16), L.completedScores()],
        },
        {
            id: 'nfl-team-statistics',
            mirrors: 'story source: ESPN team statistics',
            sources: [/sports\/football\/nfl\/teams\/[^/?\s]+\/statistics/],
            route: () => `${ESPN}/site/v2/sports/football/nfl/teams/kc/statistics`,
            paths: [
                'team.abbreviation',
                'results.stats.categories[].name',
                'results.stats.categories[].stats[].name',
                'results.stats.categories[].stats[].displayValue',
                'results.opponent[].name',
                'results.opponent[].stats[].name',
            ],
            invariants: [L.hasNames('results.stats.categories', ['passing', 'rushing', 'receiving', 'scoring'])],
        },
        {
            id: 'nflverse-games',
            mirrors: 'functions/_nflverse.js games.csv reader; story source',
            sources: [/nflverse-data\/releases\/download\/schedules\/games\.csv/],
            route: () => 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',
            paths: [],
            invariants: [
                L.csvColumns(['game_id', 'season', 'game_type', 'week', 'gameday', 'away_team', 'away_score', 'home_team', 'home_score']),
                L.predicate('every regular season since 1999 is present with scored games', data => {
                    const scored = {};
                    for (const g of data?.rows || []) {
                        if (g.game_type === 'REG' && g.home_score !== '' && g.away_score !== '' && Number.isFinite(Number(g.home_score))) scored[g.season] = (scored[g.season] || 0) + 1;
                    }
                    const years = Object.keys(scored).map(Number);
                    if (!years.length) return 'no scored regular-season games';
                    const last = Math.max(...years);
                    for (let y = 1999; y < last; y++) if ((scored[y] || 0) < 240) return `season ${y} has ${scored[y] || 0} scored regular-season games`;
                    return null;
                }),
            ],
        },
        {
            id: 'nflverse-player-week',
            needs: 'probe',
            mirrors: 'story source: nflverse weekly player stats',
            sources: [/nflverse-data\/releases\/download\/stats_player\/stats_player_week_\d{4}\.csv/],
            route: c => `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${c.season}.csv`,
            paths: [],
            invariants: [
                L.csvColumns(['player_id', 'player_display_name', 'position', 'season', 'week', 'season_type', 'team', 'attempts', 'passing_yards', 'passing_tds', 'rushing_yards', 'receiving_yards']),
                L.predicate('has quarterback rows for the season', data => {
                    const qbs = (data?.rows || []).filter(r => r.position === 'QB' && r.season_type === 'REG').length;
                    return qbs >= 32 ? null : `only ${qbs} regular-season QB rows`;
                }),
            ],
        },
        {
            id: 'nfl-fields-venues',
            needs: 'probe',
            mirrors: 'js/nflLiveGame.js _nlgFieldProfileFor (content/nfl/fields/index.json lookup)',
            route: scoreboard,
            paths: ['events[].competitions[0].venue.id'],
            invariants: [L.predicate('every non-neutral home venue has a researched field profile', data => {
                const missing = fields.missingFieldProfiles(data, fields.readFieldIndex());
                return missing.length ? `no field profile for ${missing.join(', ')}` : null;
            })],
        },
        {
            id: 'nfl-fields-surface',
            needs: 'final',
            mirrors: 'content/nfl/fields/*.json surface (cross-checked against ESPN gameInfo.venue.grass)',
            route: c => `/api/nfl?path=/summary&event=${c.finalId}`,
            paths: ['gameInfo.venue.id'],
            invariants: [L.predicate('field profile surface agrees with ESPN grass flag', data => fields.surfaceMismatch(data, fields.readFieldIndex()))],
        },
    ],
};
