// ============================================================
// NBA standings from Ball Don't Lie (tools/nba-standings.cjs) — D-181.
// Synthetic data only. Run: node --test tests/nbaStandings.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSections, bdlSeason, regularSeasonGames } = require('../tools/nba-standings.cjs');

const T = (id, conference, division, full_name) => ({ id, conference, division, full_name });
const G = (home, visitor, hs, vs, extra = {}) => ({
    home_team: { id: home }, visitor_team: { id: visitor },
    home_team_score: hs, visitor_team_score: vs, status: 'Final', postseason: false, ...extra,
});

const TEAMS = [
    T(1, 'East', 'Atlantic', 'Boston Celtics'), T(2, 'East', 'Atlantic', 'New York Knicks'),
    T(3, 'West', 'Pacific', 'Los Angeles Lakers'),
    T(40, '', '', 'Seattle SuperSonics'),
];

test('counts only final regular-season games and orders by win%', () => {
    const sections = buildSections(TEAMS, [
        G(1, 2, 110, 100), G(2, 1, 99, 120), G(2, 3, 101, 100),
        G(1, 2, 90, 130, { postseason: true }),
        G(3, 1, 0, 0, { status: '7:30 pm ET' }),
    ]);
    assert.deepEqual(sections, [
        { name: 'Eastern Conference — Atlantic', teams: [
            { name: 'Boston Celtics', record: '2-0' }, { name: 'New York Knicks', record: '1-2' }] },
        { name: 'Western Conference — Pacific', teams: [{ name: 'Los Angeles Lakers', record: '0-1' }] },
    ]);
});

test('defunct franchises (no conference/division) are dropped, and games involving them ignored', () => {
    const sections = buildSections(TEAMS, [G(40, 1, 100, 90)]);
    const names = sections.flatMap(s => s.teams.map(t => t.name));
    assert.ok(!names.includes('Seattle SuperSonics'));
    assert.equal(sections[0].teams.find(t => t.name === 'Boston Celtics').record, '0-0');
});

test('before any games, every team is 0-0 in alphabetical order', () => {
    const sections = buildSections(TEAMS, []);
    assert.deepEqual(sections[0].teams.map(t => t.record), ['0-0', '0-0']);
    assert.deepEqual(sections[0].teams.map(t => t.name), ['Boston Celtics', 'New York Knicks']);
});

test('the NBA Cup championship does not count, earlier Cup rounds do', () => {
    const sections = buildSections(TEAMS, [
        G(1, 2, 120, 100, { ist_stage: 'East Semifinal', date: '2025-12-13' }),
        G(2, 1, 124, 113, { ist_stage: 'Championship', date: '2025-12-16' }),
    ]);
    assert.deepEqual(sections[0].teams, [
        { name: 'Boston Celtics', record: '1-0' }, { name: 'New York Knicks', record: '0-1' }]);
});

test('games after a team\'s 82nd (the play-in) are not counted', () => {
    const season = [];
    for (let i = 0; i < 82; i++) {
        const d = `2026-01-${String(1 + (i % 28)).padStart(2, '0')}T${String(i).padStart(3, '0')}`;
        season.push(G(1, 2, 100, 90, { datetime: d }));
    }
    season.push(G(2, 1, 100, 90, { datetime: '2026-04-15T00:00:00Z' }));
    const counted = regularSeasonGames(season, [1, 2, 3]);
    assert.equal(counted.length, 82);
    assert.equal(buildSections(TEAMS, season)[0].teams[0].record, '82-0');
});

test('BDL season is the start year; Jul-Sep keep the finished season', () => {
    assert.equal(bdlSeason(new Date(Date.UTC(2026, 9, 14))), 2026);
    assert.equal(bdlSeason(new Date(Date.UTC(2027, 2, 1))), 2026);
    assert.equal(bdlSeason(new Date(Date.UTC(2027, 7, 1))), 2026);
});
