// ============================================================
// NFL playoff bracket: which postseason games count as played between
// real teams. During the season ESPN already lists the playoff slots as
// "TBD v TBD"; those rendered as two "TBD 0" rows linking to nfl-team-TBD.
// Runs the real check from js/nflStandings.js.
// Run: node --test tests/nflBracketPlaceholders.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'nflStandings.js'), 'utf8');
const m = SRC.match(/^function _nstdRealGame\([\s\S]*?^}/m);
assert.ok(m, '_nstdRealGame not found in js/nflStandings.js');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[0], ctx);
const real = teams => ctx._nstdRealGame({ teams: teams.map(abbr => ({ abbr })) });

test('a game between two real teams counts', () => {
    assert.equal(real(['KC', 'BUF']), true);
    assert.equal(real(['SF', 'PHI']), true);
});

test('a TBD v TBD placeholder is not a game', () => {
    assert.equal(real(['TBD', 'TBD']), false);
});

test('one known team against a TBD slot is not a game yet', () => {
    assert.equal(real(['KC', 'TBD']), false);
});

test('the Pro Bowl (AFC v NFC) is still dropped', () => {
    assert.equal(real(['AFC', 'NFC']), false);
});

test('a missing game or a team with no abbreviation is dropped', () => {
    assert.equal(ctx._nstdRealGame(null), false);
    assert.equal(real(['KC', '']), false);
});
