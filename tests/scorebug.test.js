// ============================================================
// SportStrata — scorebug unit tests (node:test, zero deps) — D-047 S2
// Loads js/scorebug.js in a vm sandbox with browser stubs and asserts the
// sport-agnostic normalizer + builders. Guards the cohesion contract:
// the model shape and card/ticker anatomy that every sport shares.
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'scorebug.js'), 'utf8');
function load() {
    const ctx = {
        console, Date, Math, JSON, String, Number,
        _escHtml: v => String(v == null ? '' : v),
        getMLBTeamColors: ab => ({ primary: '#123456', name: ab + ' Club' }),
        getMLBTeamLogoById: id => id ? `logo/${id}.svg` : '',
    };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'scorebug.js' });
    return ctx.Scorebug;
}

const liveGame = {
    gamePk: 1, gameDate: '2026-07-12T18:10:00Z',
    status: { detailedState: 'In Progress', abstractGameState: 'Live' },
    teams: {
        away: { team: { abbreviation: 'MIL', id: 158 }, score: 6 },
        home: { team: { abbreviation: 'PIT', id: 134 }, score: 3 },
    },
    linescore: { currentInning: 8, inningState: 'Bottom', isTopInning: false, outs: 2, balls: 3, strikes: 2,
        offense: { first: { id: 1 }, third: { id: 3 }, batter: { fullName: 'Henry Davis' } },
        defense: { pitcher: { fullName: 'Devin Williams' } } },
};
const finalGame = {
    gamePk: 2, status: { detailedState: 'Final', abstractGameState: 'Final' },
    teams: { away: { team: { abbreviation: 'NYY', id: 147 }, score: 5 }, home: { team: { abbreviation: 'BOS', id: 111 }, score: 2 } },
};
const upcomingGame = {
    gamePk: 3, gameDate: '2026-07-12T23:05:00Z',
    status: { detailedState: 'Scheduled', abstractGameState: 'Preview' },
    teams: {
        away: { team: { abbreviation: 'HOU', id: 117 }, score: 0, probablePitcher: { fullName: 'Cristian Javier' } },
        home: { team: { abbreviation: 'TEX', id: 140 }, score: 0, probablePitcher: { fullName: 'MacKenzie Gore' } },
    },
    linescore: { scheduledInnings: 9 },
};

test('normalizeMLBGame: live game', () => {
    const S = load(); const m = S.normalizeMLBGame(liveGame);
    assert.equal(m.status, 'live');
    assert.equal(m.pillCls, 'live');
    assert.equal(m.pillLabel, '▼8');              // bottom 8th
    assert.match(m.liveHtml, /hgc-live/);
    assert.match(m.liveHtml, /hgc-base--on/);     // runners on (1st + 3rd)
    assert.match(m.matchHtml, /P Williams · AB Davis/);
    assert.equal(m.home.color, '#123456');
    assert.equal(m.home.logo, 'logo/134.svg');
});
test('normalizeMLBGame: final sets winner', () => {
    const S = load(); const m = S.normalizeMLBGame(finalGame);
    assert.equal(m.status, 'final');
    assert.equal(m.pillLabel, 'Final');
    assert.equal(m.away.winner, true);            // NYY 5 > BOS 2
    assert.equal(m.home.winner, false);
    assert.equal(m.liveHtml, '');
});
test('normalizeMLBGame: upcoming shows probables, no live', () => {
    const S = load(); const m = S.normalizeMLBGame(upcomingGame);
    assert.equal(m.status, 'upcoming');
    assert.equal(m.pillCls, 'sched');
    assert.equal(m.liveHtml, '');
    assert.match(m.matchHtml, /Javier vs Gore/);
    assert.match(m.pillLabel, /ET$/);             // a time pill
});
test('renderScoreCard: anatomy + fav star hook', () => {
    const S = load(); const m = S.normalizeMLBGame(liveGame);
    const html = S.renderScoreCard(m, { favStar: ab => `<button data-fav="${ab}">*</button>` });
    assert.match(html, /home-game-card home-game-card--live/);
    assert.match(html, /data-game-key="mlb-1"/);
    assert.match(html, /hgc-pill--live/);
    assert.match(html, /data-fav="MIL"/);         // star hook invoked per team
    assert.match(html, /data-fav="PIT"/);
});
test('renderTickerItem: anatomy', () => {
    const S = load(); const m = S.normalizeMLBGame(finalGame);
    const html = S.renderTickerItem(m);
    assert.match(html, /ticker__item ticker__item--final/);
    assert.match(html, /data-game-pk="2"/);
    assert.match(html, /data-sport="mlb"/);
    assert.match(html, /ticker-status-pill--final/);
});
