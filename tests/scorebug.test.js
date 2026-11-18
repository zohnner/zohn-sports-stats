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
        _iconSvg: (key, size) => `<svg data-icon="${key}" width="${size || 16}"></svg>`,
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
// Real NFL scoreboard shapes (live-observed 2026-10-04): g.clock is ESPN's bare
// displayClock, which reads "0:00" through halftime and quarter breaks;
// g.statusText is ESPN's shortDetail ("Halftime", "End of 1st", "12:42 - 3rd").
const nflBreak = (clock, statusText) => ({ id: '403', isLive: true, clock, statusText,
    homeTeam: { abbr: 'BUF', score: 17, logo: 'buf.png' }, awayTeam: { abbr: 'NE', score: 14, logo: 'ne.png' } });
test('normalizeNFLGame: halftime pill says HALF, not the 0:00 clock', () => {
    const S = load();
    assert.equal(S.normalizeNFLGame(nflBreak('0:00', 'Halftime')).pillLabel, 'HALF');
});
test('normalizeNFLGame: end-of-quarter pill names the quarter', () => {
    const S = load();
    assert.equal(S.normalizeNFLGame(nflBreak('0:00', 'End of 1st')).pillLabel, 'END 1ST');
    assert.equal(S.normalizeNFLGame(nflBreak('0:00', 'End of 3rd')).pillLabel, 'END 3RD');
});
test('normalizeNFLGame: a running clock still shows as-is', () => {
    const S = load();
    assert.equal(S.normalizeNFLGame(nflBreak('12:42', '12:42 - 3rd')).pillLabel, '12:42');
});
test('normalizeNFLGame: 0:00 with no recognizable status falls back to LIVE, never 0:00', () => {
    const S = load();
    assert.equal(S.normalizeNFLGame(nflBreak('0:00', '')).pillLabel, 'LIVE');
});
test('renderTickerItem: NFL uses data-game-id', () => {
    const S = load(); const html = S.renderTickerItem(S.normalizeNFLGame(nflFinal));
    assert.match(html, /data-game-id="401"/); assert.doesNotMatch(html, /data-game-pk/);
    assert.match(html, /data-sport="nfl"/); assert.match(html, /ticker-logo/);
});
// An unplayed game has no score yet. ESPN sends score 0 before tip, which
// rendered as 0-0 on the home cards and in every ticker.
const nbaUpcoming = { id: 'n1', isLive: false, isFinal: false, date: '2026-11-18T00:30:00Z', statusText: '7:30 PM EST',
    homeTeam: { abbr: 'BOS', score: 0, logo: 'bos.png' }, awayTeam: { abbr: 'NY', score: 0, logo: 'ny.png' } };
const nflUpcoming = { id: '404', isLive: false, isFinal: false, date: '2026-11-23T18:00:00Z', statusText: 'Sun, November 23rd at 1:00 PM EST',
    homeTeam: { abbr: 'DET', score: 0 }, awayTeam: { abbr: 'GB', score: 0 } };
const mlbPostponed = { ...upcomingGame, status: { detailedState: 'Postponed', abstractGameState: 'Final' } };

test('planted fault: an unplayed game shows its start time, never 0-0', () => {
    const S = load();
    for (const m of [S.normalizeNBAGame(nbaUpcoming), S.normalizeNFLGame(nflUpcoming), S.normalizeMLBGame(upcomingGame), S.normalizeMLBGame(mlbPostponed)]) {
        assert.equal(m.hasScore, false, m.key);
        const card = S.renderScoreCard(m);
        assert.doesNotMatch(card, /class="hgc-score[^"]*">0</, `${m.key} card`);
        assert.doesNotMatch(card, /aria-label="[^"]* 0 at /, `${m.key} aria`);
        const tick = S.renderTickerItem(m);
        assert.doesNotMatch(tick, /ticker-score/, `${m.key} ticker`);
        assert.doesNotMatch(tick, />SCH</, `${m.key} ticker pill`);
    }
});

test('live and final games still show their scores', () => {
    const S = load();
    assert.match(S.renderScoreCard(S.normalizeNFLGame(nflLive)), /class="hgc-score[^"]*">14</);
    assert.match(S.renderTickerItem(S.normalizeNFLGame(nflFinal)), /ticker-score[^>]*>38</);
});

test('planted fault: start times are right in winter, not an hour late', () => {
    const S = load();
    const nov17 = Date.parse('2026-11-17T20:00:00Z');
    assert.equal(S.startLabel('2026-11-18T00:00:00Z', nov17), '7:00 PM ET', 'EST is UTC-5');
    assert.equal(S.startLabel('2026-07-12T23:05:00Z', Date.parse('2026-07-12T16:00:00Z')), '7:05 PM ET', 'EDT is UTC-4');
});

test('startLabel: another Eastern day carries its weekday; short form drops ET', () => {
    const S = load();
    const nov17 = Date.parse('2026-11-17T20:00:00Z');
    assert.equal(S.startLabel('2026-11-23T18:00:00Z', nov17), 'Mon 1:00 PM ET');
    // 11:30 PM ET on the 17th is 04:30Z on the 18th: still today in Eastern.
    assert.equal(S.startLabel('2026-11-18T04:30:00Z', nov17), '11:30 PM ET');
    assert.equal(S.startLabel('2026-11-18T00:00:00Z', nov17, true), '7:00 PM');
    assert.equal(S.startLabel('', nov17), 'Scheduled');
});

test('a postponed or TBD game says so instead of a time or a Final', () => {
    const S = load();
    assert.equal(S.normalizeNBAGame({ ...nbaUpcoming, statusText: 'Postponed' }).pillLabel, 'Postponed');
    const nbaPpd = S.normalizeNBAGame({ ...nbaUpcoming, isFinal: true, statusText: 'Postponed' });
    assert.equal(nbaPpd.status, 'upcoming', 'NBA isFinal is ESPN state "post", which a postponement has');
    assert.equal(nbaPpd.hasScore, false);
    assert.equal(S.normalizeNFLGame({ ...nflUpcoming, statusText: 'TBD' }).startShort, 'TBD');
    const mlbTbd = { ...upcomingGame, status: { detailedState: 'Scheduled', abstractGameState: 'Preview', startTimeTBD: true } };
    assert.equal(S.normalizeMLBGame(mlbTbd).pillLabel, 'TBD');
    const ppd = S.normalizeMLBGame(mlbPostponed);
    assert.equal(ppd.pillLabel, 'Postponed', 'statsapi marks a postponement abstractGameState Final');
    assert.notEqual(ppd.status, 'final');
});

test('one card for the basketball Scores pages: ranking, click target, badge slot', () => {
    const S = load();
    const g = { ...nbaUpcoming, id: 'c7', homeTeam: { ...nbaUpcoming.homeTeam, abbr: 'DUKE', rank: 5 }, awayTeam: { ...nbaUpcoming.awayTeam, abbr: 'ILL', rank: 10 } };
    const html = S.renderScoreCard(S.normalizeNCAABGame(g), { go: 'ncaab-game-c7', badge: '<span class="nba-close-badge">Close</span>' });
    assert.match(html, /<span class="hgc-rank">5<\/span>DUKE/);
    assert.match(html, /aria-label="No\. 10 [^"]* at No\. 5 /);
    assert.match(html, /onclick="navigateTo\('ncaab-game-c7'\)"/);
    assert.match(html, /nba-close-badge/);
    assert.doesNotMatch(S.renderScoreCard(S.normalizeNCAABGame(nbaUpcoming)), /hgc-rank|onclick/);
});

test('normalizeNCAAFGame + ticker: id, logo, sport', () => {
    const S = load(); const m = S.normalizeNCAAFGame(ncaafFinal);
    assert.equal(m.sport, 'ncaaf'); assert.equal(m.id, 'g99'); assert.equal(m.home.logo, 'uga.png');
    const html = S.renderTickerItem(m);
    assert.match(html, /data-game-id="g99"/); assert.match(html, /data-sport="ncaaf"/);
    assert.match(html, /src="uga.png"/);
});
