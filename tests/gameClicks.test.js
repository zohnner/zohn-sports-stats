// ============================================================
// Game clicks: where a score card or a ticker item takes you.
// Runs the two real handlers from js/app.js against a fake DOM, the way
// tests/todayFrontDoor.test.js runs _myTeamGame. Both must open the game
// for every sport that has a game view. NCAAF opened its scores list from
// both until 2026-11-11.
// Run: node --test tests/gameClicks.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
function extract(re, what) {
    const m = APP.match(re);
    assert.ok(m, `${what} not found in js/app.js`);
    return m[0];
}
const CARD_WIRING = extract(/^function _wireHomeGameCardClicks\([\s\S]*?^}/m, '_wireHomeGameCardClicks');
const TICKER_WIRING = extract(/^\(function setupTickerClicks\(\) \{[\s\S]*?^\}\)\(\);/m, 'setupTickerClicks');

// Records what a click makes the page do, in order.
function page(currentSport) {
    const calls = [];
    const ctx = {
        AppState: { currentSport },
        switchSport: sport => calls.push(['switchSport', sport]),
        navigateTo: view => calls.push(['navigateTo', view]),
        openMLBGame: (gamePk, live) => calls.push(['openMLBGame', gamePk, live]),
    };
    vm.createContext(ctx);
    return { ctx, calls };
}

function clickCard(gameKey, { currentSport = 'mlb', live = false } = {}) {
    const { ctx, calls } = page(currentSport);
    const listeners = {};
    const card = {
        dataset: { gameKey },
        classList: { contains: cls => live && cls === 'home-game-card--live' },
        addEventListener: (type, fn) => { listeners[type] = fn; },
    };
    ctx.grid = { querySelectorAll: sel => (sel === '.home-game-card' ? [card] : []) };
    vm.runInContext(`${CARD_WIRING}\n_wireHomeGameCardClicks(grid);`, ctx);
    listeners.click();
    return calls;
}

function clickTicker(dataset, { currentSport = 'mlb', live = false } = {}) {
    const { ctx, calls } = page(currentSport);
    let onClick = null;
    const ticker = { addEventListener: (type, fn) => { if (type === 'click') onClick = fn; } };
    ctx.document = { getElementById: id => (id === 'scoreTicker' ? ticker : null) };
    vm.runInContext(TICKER_WIRING, ctx);
    const item = { dataset, classList: { contains: cls => live && cls === 'ticker__item--live' } };
    // Only an item that carries an id matches the handler's own selector.
    onClick({ target: { closest: () => (dataset.gameId || dataset.gamePk ? item : null) } });
    return calls;
}

const GAME_ID = '401873038';
const GAME_VIEW = {
    nfl: 'nfl-game-401873038', ncaaf: 'ncaaf-game-401873038', ncaab: 'ncaab-game-401873038',
    nba: 'nba-game-401873038', wnba: 'wnba-game-401873038',
};

test('home card: an NCAAF game opens that game, not the scores list', () => {
    assert.deepEqual(clickCard('ncaaf-401864494'), [
        ['switchSport', 'ncaaf'], ['navigateTo', 'ncaaf-game-401864494'],
    ]);
});

test('home card: every sport with a game view opens the game', () => {
    for (const sport of Object.keys(GAME_VIEW)) {
        assert.deepEqual(clickCard(`${sport}-${GAME_ID}`, { currentSport: sport }), [['navigateTo', GAME_VIEW[sport]]], sport);
    }
});

test('home card: an MLB game opens through openMLBGame, live or not', () => {
    assert.deepEqual(clickCard('mlb-776123', { live: true }), [['openMLBGame', 776123, true]]);
    assert.deepEqual(clickCard('mlb-776123'), [['openMLBGame', 776123, false]]);
});

test('home card: an NCAAF card with no game id falls back to the scores list', () => {
    assert.deepEqual(clickCard('ncaaf-', { currentSport: 'ncaaf' }), [['navigateTo', 'ncaaf-scores']]);
});

test('ticker: an NCAAF game opens that game, not the scores list', () => {
    assert.deepEqual(clickTicker({ sport: 'ncaaf', gameId: '401864494' }), [
        ['switchSport', 'ncaaf'], ['navigateTo', 'ncaaf-game-401864494'],
    ]);
});

test('ticker: every sport with a game view opens the game', () => {
    for (const sport of Object.keys(GAME_VIEW)) {
        assert.deepEqual(clickTicker({ sport, gameId: GAME_ID }, { currentSport: sport }), [['navigateTo', GAME_VIEW[sport]]], sport);
    }
});

test('ticker: an MLB game opens through openMLBGame', () => {
    assert.deepEqual(clickTicker({ sport: 'mlb', gamePk: '776123' }, { live: true }), [['openMLBGame', 776123, true]]);
});
