// ============================================================
// NCAAF team page: where the team's identity comes from.
// ESPN's /teams/{id} sends no CORS header, so while the proxy is blocked
// (D-176) the browser can't read it and the page said "Couldn't load this
// team." The roster route does allow it and carries the same identity.
// Runs the real loader from js/ncaaf.js with a fake fetch.
// Run: node --test tests/ncaafTeamLoad.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'ncaaf.js'), 'utf8');
function extract(re, what) {
    const m = SRC.match(re);
    assert.ok(m, `${what} not found in js/ncaaf.js`);
    return m[0];
}

// Trimmed from the live roster response for Ball State, 2026-11-12.
const ROSTER = {
    athletes: [{ position: 'Offense', items: [{ id: '1' }] }],
    team: {
        id: '2050', abbreviation: 'BALL', location: 'Ball State', name: 'Cardinals',
        displayName: 'Ball State Cardinals', color: 'ba0c2f',
        logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2050.png',
        recordSummary: '3-7', seasonSummary: '2026', standingSummary: '9th in MAC',
    },
};

function load(routes) {
    const asked = [];
    const ctx = {
        ApiCache: { TTL: { LONG: 1, MEDIUM: 1 } },
        Logger: { warn: () => {} },
        espnNCAAFFetch: async (p) => {
            asked.push(p);
            if (!(p in routes)) throw new Error('blocked');
            return routes[p];
        },
    };
    vm.createContext(ctx);
    vm.runInContext([
        extract(/^function _ncaafTeamFromRoster\([\s\S]*?^}/m, '_ncaafTeamFromRoster'),
        extract(/^async function _ncaafTeamAndRoster\([\s\S]*?^}/m, '_ncaafTeamAndRoster'),
    ].join('\n'), ctx);
    return { get: id => ctx._ncaafTeamAndRoster(id), asked };
}

test('with /teams/{id} unreadable, the team still loads from the roster response', async () => {
    const { get, asked } = load({ '/teams/2050/roster': ROSTER });
    const { team, roster } = await get('2050');
    assert.equal(team.id, '2050');
    assert.equal(team.displayName, 'Ball State Cardinals');
    assert.equal(team.abbreviation, 'BALL');
    assert.equal(team.color, 'ba0c2f');
    assert.equal(team.standingSummary, '9th in MAC');
    assert.equal(team.record.items[0].summary, '3-7');
    assert.equal(team.logos[0].href, 'https://a.espncdn.com/i/teamlogos/ncaa/500/2050.png');
    assert.equal(roster.length, 1);
    assert.equal(asked.includes('/teams/2050'), false, 'the route the browser cannot read is not requested');
});

test('if the roster has no team block, /teams/{id} is still used', async () => {
    const { get } = load({
        '/teams/2050/roster': { athletes: [] },
        '/teams/2050': { team: { id: '2050', displayName: 'Ball State Cardinals' } },
    });
    const { team } = await get('2050');
    assert.equal(team.displayName, 'Ball State Cardinals');
});

test('if the roster fails, /teams/{id} is still used', async () => {
    const { get } = load({ '/teams/2050': { team: { id: '2050', displayName: 'Ball State Cardinals' } } });
    const { team, roster } = await get('2050');
    assert.equal(team.displayName, 'Ball State Cardinals');
    assert.equal(roster.length, 0);
});

test('when neither route answers, the loader fails so the page can say so', async () => {
    const { get } = load({});
    await assert.rejects(get('2050'), /blocked/);
});
