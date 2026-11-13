'use strict';
const L = require('../contract-lib.cjs');

const mlbUrl = (endpoint, params) => {
    const u = new URL(`https://statsapi.mlb.com/api/v1${endpoint}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return `/api/mlb?url=${encodeURIComponent(u.toString())}`;
};
const ESPN = 'https://site.web.api.espn.com/apis';
// c.season == null (offseason probe): MLB's calendar year hasn't flipped to the
// new season yet in Jan/Feb, so the prior year is still the live one.
const seasonOf = c => c.season ?? (new Date().getUTCMonth() < 2 ? new Date().getUTCFullYear() - 1 : new Date().getUTCFullYear());
// Stories cite finished games, which never change. In the offseason the game
// contracts check this pinned 2026 Wild Card game instead of being skipped.
const PINNED = { gamePk: 849849, yyyymmdd: '20260929' };
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
            sources: [/statsapi\S*\s*\/api\/v1\/schedule/],
            route: schedule,
            paths: [
                'dates[0].games[].gamePk',
                'dates[0].games[].gameDate',
                'dates[0].games[].status.abstractGameState',
                'dates[0].games[].teams.home.team.abbreviation',
                'dates[0].games[].teams.away.team.abbreviation',
            ],
            invariants: [
                // 8 → 4: cuts routine Monday/Thursday (fewer scheduled MLB games) noise; still warn severity.
                L.minCount('dates[0].games', 4, { fullSlateOnly: true, severity: 'warn' }),
                // abstractGameState 'Final' also covers cancelled (codedGameState 'C'),
                // postponed ('D') and forfeited ('Q'/'R') games that carry no score —
                // live-confirmed on gamePk 823490 (NYY/BAL rainout, 2026-09-27). Only 'F'
                // (Final) and 'O' (Game Over) mean the game was actually completed.
                L.predicate('every completed (codedGameState F/O) game has numeric home/away scores', data => {
                    const finals = (data.dates?.[0]?.games || [])
                        .filter(g => g.status?.abstractGameState === 'Final' && ['F', 'O'].includes(g.status?.codedGameState));
                    const bad = finals.filter(g => typeof g.teams?.home?.score !== 'number' || typeof g.teams?.away?.score !== 'number');
                    return bad.length ? `${bad.length} completed game(s) without numeric scores, e.g. gamePk ${bad[0].gamePk}` : null;
                }),
            ],
        },
        {
            id: 'mlb-standings',
            mirrors: 'js/mlb.js fetchMLBStandings',
            sources: [/statsapi\S*\s*\/api\/v1\/standings/],
            // c.season == null (offseason probe) — MLB's calendar year hasn't flipped
            // to the new season yet in Jan/Feb, so the prior year is still the live one.
            route: c => mlbUrl('/standings', {
                leagueId: '103,104',
                season: c.season ?? (new Date().getUTCMonth() < 2 ? new Date().getUTCFullYear() - 1 : new Date().getUTCFullYear()),
                standingsTypes: 'regularSeason',
            }),
            paths: [
                'records[].teamRecords[].team.id',
                'records[].teamRecords[].wins',
                'records[].teamRecords[].losses',
                'records[].teamRecords[].leagueRecord.pct',
            ],
            invariants: [L.deepCount('teamRecords', 30, { exact: true })],
        },
        {
            id: 'mlb-boxscore',
            mirrors: 'js/mlb.js showMLBGameDetail boxscore; story source',
            sources: [/statsapi\S*\s*\/api\/v1\/game\/\d+\/boxscore/, /^boxscores? \d+/],
            route: c => mlbUrl(`/game/${c.finalId ?? PINNED.gamePk}/boxscore`, {}),
            paths: [
                'teams.away.team.id',
                'teams.home.team.id',
                'teams.away.teamStats.batting.runs',
                'teams.home.teamStats.batting.runs',
                'teams.away.teamStats.pitching.inningsPitched',
                'teams.home.teamStats.pitching.earnedRuns',
                'teams.away.pitchers',
                'teams.home.batters',
            ],
            invariants: [
                L.predicate('every pitcher listed has a pitching line', data => {
                    for (const side of ['away', 'home']) {
                        const t = data?.teams?.[side];
                        const bad = (t?.pitchers || []).find(id => t.players?.[`ID${id}`]?.stats?.pitching?.inningsPitched === undefined);
                        if (bad) return `${side} pitcher ${bad} has no pitching.inningsPitched`;
                    }
                    return null;
                }),
            ],
        },
        {
            id: 'mlb-feed-live',
            mirrors: 'js/liveGame.js live feed (v1.1 feed/live); story source',
            sources: [/statsapi\.mlb\.com\/api\/v1\.1\/game\/\d+\/feed\/live/],
            route: c => `https://statsapi.mlb.com/api/v1.1/game/${c.finalId ?? PINNED.gamePk}/feed/live`,
            paths: [
                'gameData.status.abstractGameState',
                'gameData.teams.away.abbreviation',
                'gameData.teams.home.abbreviation',
                'liveData.linescore.teams.away.runs',
                'liveData.linescore.teams.home.runs',
                'liveData.boxscore.teams.away.teamStats.batting.runs',
                'liveData.plays.allPlays[].result.event',
            ],
            invariants: [L.minCount('liveData.plays.allPlays', 40)],
        },
        {
            id: 'mlb-team-stats',
            mirrors: 'js/mlb.js team season stats; story source',
            sources: [/statsapi\S*\s*\/api\/v1\/teams\/(\d+\/)?stats/],
            route: c => mlbUrl('/teams/145/stats', { stats: 'season', group: 'pitching', season: seasonOf(c) }),
            paths: ['stats[0].splits[0].stat.era', 'stats[0].splits[0].stat.inningsPitched', 'stats[0].splits[0].stat.earnedRuns'],
        },
        {
            id: 'mlb-espn-scoreboard',
            mirrors: 'story source: ESPN MLB scoreboard (also the home edge snapshot)',
            sources: [/sports\/baseball\/mlb\/scoreboard/],
            route: c => `${ESPN}/site/v2/sports/baseball/mlb/scoreboard?dates=${c.yyyymmdd ?? PINNED.yyyymmdd}`,
            paths: [
                'events[].id',
                'events[].status.type.state',
                'events[].competitions[0].competitors[].team.abbreviation',
                'events[].competitions[0].competitors[].score',
            ],
            invariants: [L.minCount('events', 1), L.numeric('events[].competitions[0].competitors[].score')],
        },
        {
            id: 'mlb-espn-summary',
            mirrors: 'story source: ESPN MLB game summary',
            sources: [/sports\/baseball\/mlb\/summary/],
            // The probe's final id is an MLB gamePk; ESPN keys the same game differently.
            resolve: async (c, fetchJson) => {
                const res = await fetchJson(`${ESPN}/site/v2/sports/baseball/mlb/scoreboard?dates=${c.yyyymmdd ?? PINNED.yyyymmdd}`);
                const ev = (res.json?.events || []).find(e => e?.status?.type?.state === 'post');
                return ev ? { espnEventId: ev.id } : null;
            },
            route: c => `${ESPN}/site/v2/sports/baseball/mlb/summary?event=${c.espnEventId}`,
            paths: [
                'header.competitions[0].competitors[].team.abbreviation',
                'header.competitions[0].competitors[].score',
                'boxscore.teams[].statistics[].name',
                'boxscore.players[].statistics[].athletes[].athlete.id',
            ],
            invariants: [L.exactCount('boxscore.teams', 2)],
        },
    ],
};
