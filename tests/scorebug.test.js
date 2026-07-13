// ============================================================
// SportStrata — scorebug unit tests (node:test, zero deps) — D-047 S2
// Loads js/scorebug.js in a vm sandbox with browser stubs and asserts the
// sport-agnostic normalizers + builders. Guards the cohesion contract:
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
// Football fixtures (NFL/NCAAF share the shape)
const nflFinal = { id: '401', isFinal: true, isLive: false,
    homeTeam: { abbr: 'KC', name: 'Chiefs', score: 38, logo: 'kc.png', winner: true },
    awayTeam: { abbr: 'BUF', name: 'Bills', score: 35, logo: 'buf.png', winner: false } };
const nflLive = { id: '402', isLive: true, clock: 'Q3 5:20',
    homeTeam: { abbr: 'DAL', score: 14, logo: 'dal.png' }, awayTeam: { abbr: 'PHI', score: 10, logo: 'phi.png' } };
const ncaafFinal = { id: 'g99', isFinal: true, isLive: false,
    homeTeam: { abbr: 'UGA', name: 'Georgia', score: 42, logo: 'uga.png', winner: true, rank: 1 },
    awayTeam: { abbr: 'BAMA', name: 'Alabama', score: 38, logo: 'bama.png', winner: false, rank: 4 } };

test('normalizeMLBGame: live game', () => {
    const S = load(); const m = S.normalizeMLBGame(liveGame);
    assert.equal(m.status, 'live'); assert.equal(m.pillLabel, '▼8');
    assert.match(m.liveHtml, /hgc-base--on/);
    assert.match(m.matchHtml, /P Williams · AB Davis/);
});
test('normalizeMLBGame: final winner', () => {
    const S = load(); const m = S.normalizeMLBGame(finalGame);
    assert.equal(m.status, 'final'); assert.equal(m.away.winner, true); assert.equal(m.liveHtml, '');
});
test('normalizeMLBGame: upcoming probables', () => {
    const S = load(); const m = S.normalizeMLBGame(upcomingGame);
    assert.equal(m.status, 'upcoming'); assert.match(m.matchHtml, /Javier vs Gore/); assert.match(m.pillLabel, /ET$/);
});
test('renderScoreCard: anatomy + fav star hook', () => {
    const S = load(); const html = S.renderScoreCard(S.normalizeMLBGame(liveGame), { favStar: ab => `<button data-fav="${ab}">*</button>` });
    assert.match(html, /home-game-card home-game-card--live/);
    assert.match(html, /data-game-key="mlb-1"/); assert.match(html, /data-fav="MIL"/); assert.match(html, /data-fav="PIT"/);
});
test('renderTickerItem: MLB keeps data-game-pk', () => {
    const S = load(); const html = S.renderTickerItem(S.normalizeMLBGame(finalGame));
    assert.match(html, /ticker__item ticker__item--final/);
    assert.match(html, /data-game-pk="2"/); assert.doesNotMatch(html, /data-game-id/);
    assert.match(html, /data-sport="mlb"/);
});
test('normalizeNFLGame: final + live', () => {
    const S = load();
    const f = S.normalizeNFLGame(nflFinal);
    assert.equal(f.sport, 'nfl'); assert.equal(f.status, 'final'); assert.equal(f.key, 'nfl-401');
    assert.equal(f.home.abbr, 'KC'); assert.equal(f.home.winner, true);
    const l = S.normalizeNFLGame(nflLive);
    assert.equal(l.status, 'live'); assert.equal(l.pillLabel, 'Q3 5:20');
});
test('renderTickerItem: NFL uses data-game-id', () => {
    const S = load(); const html = S.renderTickerItem(S.normalizeNFLGame(nflFinal));
    assert.match(html, /data-game-id="401"/); assert.doesNotMatch(html, /data-game-pk/);
    assert.match(html, /data-sport="nfl"/); assert.match(html, /ticker-logo/);
});
test('normalizeNCAAFGame + ticker: id, logo, sport', () => {
    const S = load(); const m = S.normalizeNCAAFGame(ncaafFinal);
    assert.equal(m.sport, 'ncaaf'); assert.equal(m.id, 'g99'); assert.equal(m.home.logo, 'uga.png');
    const html = S.renderTickerItem(m);
    assert.match(html, /data-game-id="g99"/); assert.match(html, /data-sport="ncaaf"/);
    assert.match(html, /src="uga.png"/);
});
