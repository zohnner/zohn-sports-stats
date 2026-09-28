'use strict';
const L = require('../contract-lib.cjs');

const mlbUrl = (endpoint, params) => {
    const u = new URL(`https://statsapi.mlb.com/api/v1${endpoint}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return `/api/mlb?url=${encodeURIComponent(u.toString())}`;
};
const schedule = d => mlbUrl('/schedule', {
    sportId: 1, startDate: d.iso, endDate: d.iso, hydrate: 'team,probablePitcher,linescore',
});

module.exports = {
    sport: 'mlb',
    gameDay: null,
    probe: { route: schedule, read: L.readMlbSchedule },
    contracts: [
        {
            id: 'mlb-schedule',
            needs: 'probe',
            mirrors: 'js/mlb.js fetchMLBSchedule (same hydrate, single day)',
            route: schedule,
            paths: [
                'dates[0].games[].gamePk',
                'dates[0].games[].gameDate',
                'dates[0].games[].status.abstractGameState',
                'dates[0].games[].teams.home.team.abbreviation',
                'dates[0].games[].teams.away.team.abbreviation',
            ],
            invariants: [
                L.minCount('dates[0].games', 8, { fullSlateOnly: true, severity: 'warn' }),
                // abstractGameState 'Final' also covers a game that was rained out and never
                // played (detailedState 'Cancelled', codedGameState 'C') — live-confirmed
                // 2026-09-28 against gamePk 823490 (NYY/BAL, 2026-09-27, reason "Rain"), which
                // has no teams.home/away.score at all. Only detailedState 'Final' means the
                // game was actually completed with a score.
                L.predicate('every completed (detailedState=Final) game has numeric home/away scores', data => {
                    const finals = (data.dates?.[0]?.games || []).filter(g => g.status?.detailedState === 'Final');
                    const bad = finals.filter(g => typeof g.teams?.home?.score !== 'number' || typeof g.teams?.away?.score !== 'number');
                    return bad.length ? `${bad.length} completed game(s) without numeric scores, e.g. gamePk ${bad[0].gamePk}` : null;
                }),
            ],
        },
        {
            id: 'mlb-standings',
            mirrors: 'js/mlb.js fetchMLBStandings',
            route: c => mlbUrl('/standings', { leagueId: '103,104', season: c.season, standingsTypes: 'regularSeason' }),
            paths: [
                'records[].teamRecords[].team.id',
                'records[].teamRecords[].wins',
                'records[].teamRecords[].losses',
                'records[].teamRecords[].leagueRecord.pct',
            ],
            invariants: [L.deepCount('teamRecords', 30, { exact: true })],
        },
    ],
};
