// ============================================================
// Edge-template fail-safe (functions/_shell.js) and the nflverse
// fallback (functions/_nflverse.js) — D-180. Synthetic data only.
// Run: node --test tests/edgeFallback.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Both modules are import-free ESM; strip `export` and evaluate, the same way
// entitlement.test.js loads functions/api/_entitlement.js, so CI's Node version
// doesn't need ESM syntax detection.
function load(file, names) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'functions', file), 'utf8').replace(/^export /gm, '');
    const ctx = { URL, Response, DecompressionStream, fetch: () => { throw new Error('no network in tests'); } };
    vm.createContext(ctx);
    vm.runInContext(`${src}\n;globalThis.__out = { ${names.join(', ')} };`, ctx);
    // Values built inside the vm carry its Object/Array prototypes, which strict
    // deepEqual rejects; round-trip them into this realm.
    const plain = v => (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
    return Object.fromEntries(names.map(n => [n, (...a) => plain(ctx.__out[n](...a))]));
}

const { failSafeRoute, absolutize } = load('_shell.js', ['failSafeRoute', 'absolutize']);
const { buildStandingsSections, buildLeaderCategories, computeRecords, parseCSV, nflverseSeason } =
    load('_nflverse.js', ['buildStandingsSections', 'buildLeaderCategories', 'computeRecords', 'parseCSV', 'nflverseSeason']);

test('fail-safe route matches each template\'s own success route', () => {
    const cases = {
        '/nfl': 'nfl-home', '/nba/': 'nba-home',
        '/nfl/leaders': 'nfl-leaders', '/nfl/standings': 'nfl-standings', '/nba/leaders': 'nba-leaders',
        '/ncaaf/rankings': 'ncaaf-rankings', '/wnba/standings': 'wnba-standings',
        '/nfl/team/jax': 'nfl-team-JAX', '/nfl/team/lar/los-angeles-rams': 'nfl-team-LAR',
        '/nfl/game/401873182': 'nfl-game-401873182', '/ncaaf/team/2/auburn': 'ncaaf-team-2',
        '/mlb/game/776543': 'mlb-live-776543', '/nba/player/1966/lebron-james': 'nba-player-1966',
    };
    for (const [p, want] of Object.entries(cases)) assert.equal(failSafeRoute(p), want, p);
});

test('fail-safe route is null for pages with no matching SPA view', () => {
    for (const p of ['/', '/glossary', '/nfl/stories/some-story', '/mlb/team/nyy', '/nfl/team/<x>', '/nhl']) {
        assert.equal(failSafeRoute(p), null, p);
    }
});

test('absolutize rewrites relative asset refs only', () => {
    const html = '<link href="css/main.css"><script src="js/app.js"></script><a href="/nfl">x</a><a href="https://x.y">y</a><a href="#top">z</a>';
    assert.equal(absolutize(html),
        '<link href="/css/main.css"><script src="/js/app.js"></script><a href="/nfl">x</a><a href="https://x.y">y</a><a href="#top">z</a>');
});

test('parseCSV keeps quoted commas inside one field', () => {
    const rows = parseCSV('a,b,c\n1,"x,y",3\n');
    assert.deepEqual(rows[1], ['1', 'x,y', '3']);
});

const G = (home_team, away_team, home_score, away_score, game_type = 'REG') =>
    ({ home_team, away_team, home_score: String(home_score), away_score: String(away_score), game_type });

test('computeRecords counts wins, losses, ties and skips unplayed and postseason games', () => {
    const rec = computeRecords([
        G('JAX', 'PHI', 19, 17), G('PHI', 'JAX', 20, 20), G('JAX', 'TEN', '', ''), G('JAX', 'PHI', 3, 30, 'WC'),
    ]);
    assert.deepEqual(rec.JAX, { w: 1, l: 0, t: 1, pf: 39, pa: 37 });
    assert.deepEqual(rec.PHI, { w: 0, l: 1, t: 1, pf: 37, pa: 39 });
    assert.deepEqual(rec.TEN, { w: 0, l: 0, t: 0, pf: 0, pa: 0 });
});

test('standings group by division and order by win% then point differential', () => {
    const teams = [
        { team_abbr: 'JAX', team_name: 'Jacksonville Jaguars', team_division: 'AFC South' },
        { team_abbr: 'HOU', team_name: 'Houston Texans', team_division: 'AFC South' },
        { team_abbr: 'TEN', team_name: 'Tennessee Titans', team_division: 'AFC South' },
        { team_abbr: 'LA', team_name: 'Los Angeles Rams', team_division: 'NFC West' },
        { team_abbr: 'STL', team_name: 'St. Louis Rams', team_division: 'NFC West' },
    ];
    const sections = buildStandingsSections([
        G('JAX', 'LA', 10, 3), G('HOU', 'TEN', 30, 0), G('TEN', 'JAX', 0, 0),
    ], teams);
    assert.deepEqual(sections.map(s => s.name), ['AFC South', 'NFC West']);
    assert.deepEqual(sections[0].teams, [
        { name: 'Houston Texans', record: '1-0' },
        { name: 'Jacksonville Jaguars', record: '1-0-1' },
        { name: 'Tennessee Titans', record: '0-1-1' },
    ]);
    // A franchise with no game this season (STL) is left out.
    assert.deepEqual(sections[1].teams, [{ name: 'Los Angeles Rams', record: '0-1' }]);
});

test('leaders drop unattributed aggregate rows and map nflverse team codes to ESPN URL codes', () => {
    const P = (player_id, name, team, passing_yards, def_sacks = '0') =>
        ({ player_id, player_display_name: name, recent_team: team, season_type: 'REG', passing_yards, def_sacks });
    const cats = buildLeaderCategories([
        P('', '', 'BUF', '9999'),
        P('00-1', 'Matthew Stafford', 'LA', '1572'),
        P('00-2', 'Jayden Daniels', 'WAS', '1201'),
        P('00-3', 'Will Anderson Jr.', 'HOU', '0', '7.5'),
    ]);
    const pass = cats.find(c => c.key === 'passingYards');
    assert.deepEqual(pass.leaders, [
        { name: 'Matthew Stafford', team: 'LAR', value: '1,572' },
        { name: 'Jayden Daniels', team: 'WSH', value: '1,201' },
    ]);
    assert.equal(cats.find(c => c.key === 'sacks').leaders[0].value, '7.5');
    assert.equal(cats.find(c => c.key === 'rushingYards'), undefined);
});

test('nflverse season follows the /api/nflstats calendar', () => {
    assert.equal(nflverseSeason(new Date(Date.UTC(2026, 9, 14))), 2026);
    assert.equal(nflverseSeason(new Date(Date.UTC(2027, 0, 20))), 2026);
    assert.equal(nflverseSeason(new Date(Date.UTC(2027, 7, 31))), 2026);
});
