'use strict';
const L = require('../contract-lib.cjs');

const scoreboard = d => `/api/ncaaf?path=/scoreboard&groups=80&dates=${d.yyyymmdd}`;

module.exports = {
    sport: 'ncaaf',
    gameDay: 6,
    // Live-confirmed regular-season Saturday event counts vary a lot outside the
    // meat of the schedule: week 1 (2025-08-30) had 62, but week 1 also covers the
    // ~5-game Week 0 Saturday (2025-08-23). ESPN's week numbering itself shifts by
    // year (2025-11-29 scoreboard: 16 regular-season weeks in leagues[0].calendar,
    // week 14 = rivalry Saturday/51 events, 15 = championships/6, 16 = Army-Navy/2;
    // 2026-09-26 scoreboard: only 15 regular-season weeks, so week 14 there is
    // championship Saturday 2026-12-05, ~6-12 events) — a fixed [2,14] would
    // false-FAIL in 2026. Championship week is always lastRegularWeek - 1, so the
    // reliable full-slate window is weeks 2 .. lastRegularWeek - 2 (2025: 2-14,
    // 2026: 2-13); 40 still catches the D-135 groups=80 regression (which returned ~25).
    fullSlateWeeks: { from: 2, lastMinus: 2 },
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
                L.minCount('events', 40, { fullSlateOnly: true }),
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
            route: c => c.season == null ? '/api/ncaafstandings' : `/api/ncaafstandings?season=${c.season}`,
            paths: [],
            invariants: [L.deepCount('entries', 120, { each: 'team.abbreviation' })],
        },
        {
            id: 'ncaaf-leaders',
            mirrors: 'js/ncaaf.js /api/ncaafstats leaders loader',
            route: c => c.season == null ? '/api/ncaafstats' : `/api/ncaafstats?season=${c.season}`,
            paths: ['categories[].key', 'categories[].leaders[].id', 'categories[].leaders[].name', 'categories[].leaders[].value'],
            invariants: [L.minCount('categories', 5), L.eachNonEmpty('categories[].leaders')],
        },
    ],
};
