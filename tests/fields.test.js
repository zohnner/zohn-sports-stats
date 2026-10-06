// ============================================================
// NFL home fields — profile schema, facts sourcing, index gate, approve, drift helpers.
// Run: node --test tests/fields.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../tools/fields/field-core.cjs');

const profile = (over = {}) => ({
    venueId: '3798', homeTeam: 'GB', name: 'Lambeau Field', surface: 'hybrid', mow: 'stripes-5',
    endzones: {
        left: { fill: '#203731', text: 'GREEN BAY', textColor: '#FFFFFF' },
        right: { fill: '#203731', text: 'PACKERS', textColor: '#FFFFFF' },
    },
    midfield: 'primary-logo', border: '#203731', signature: [], ...over,
});
const fact = (paint) => paint
    ? { source: 'https://example.com/a', photo: 'https://example.com/p.jpg', photoDate: '2026-09-14', checked: '2026-10-06', confidence: 'high' }
    : { source: 'https://example.com/a', checked: '2026-10-06', confidence: 'high' };
const facts = () => ({
    approved: null,
    facts: Object.fromEntries(core.REQUIRED_FACTS.map(k => [k, fact(core.PAINT_FACTS.includes(k))])),
});

test('a complete profile validates', () => {
    assert.deepEqual(core.validateProfile(profile()), []);
});

test('profile rejects bad enums, colors, text and team', () => {
    const p = core.validateProfile(profile({ surface: 'astroturf', mow: 'diagonal', border: 'green', homeTeam: 'XXX',
        endzones: { left: { fill: '#203731', text: 'green bay!', textColor: '#FFF' }, right: { fill: '#203731', text: 'PACKERS', textColor: '#FFFFFF' } } }));
    assert.ok(p.some(m => m.includes('surface')));
    assert.ok(p.some(m => m.includes('mow')));
    assert.ok(p.some(m => m.includes('border')));
    assert.ok(p.some(m => m.includes('homeTeam')));
    assert.ok(p.some(m => m.includes('endzones.left.text')));
    assert.ok(p.some(m => m.includes('endzones.left.textColor')));
});

test('alt-logo and wordmark require an a.espncdn.com image', () => {
    assert.ok(core.validateProfile(profile({ midfield: 'alt-logo' })).some(m => m.includes('midfieldImage')));
    assert.ok(core.validateProfile(profile({ midfield: 'wordmark', midfieldImage: 'https://evil.example/x.png' })).some(m => m.includes('midfieldImage')));
    assert.deepEqual(core.validateProfile(profile({ midfield: 'wordmark', midfieldImage: 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png' })), []);
});

test('NFL_TEAMS is the 32 ESPN abbreviations', () => {
    assert.equal(core.NFL_TEAMS.length, 32);
    assert.equal(new Set(core.NFL_TEAMS).size, 32);
    assert.ok(core.NFL_TEAMS.includes('WSH') && core.NFL_TEAMS.includes('LAR'));
});

test('complete facts validate; every required attribute must be sourced', () => {
    assert.deepEqual(core.validateFacts(facts()), []);
    const f = facts(); delete f.facts.mow;
    assert.ok(core.validateFacts(f).some(m => m.includes('mow')));
});

test('paint facts need a current-season photo', () => {
    const f = facts(); f.facts['endzones.left.fill'].photoDate = '2025-12-01';
    assert.ok(core.validateFacts(f).some(m => m.includes('endzones.left.fill') && m.includes('season')));
    const g = facts(); delete g.facts.border.photo;
    assert.ok(core.validateFacts(g).some(m => m.includes('border') && m.includes('photo')));
});

test('season start follows the NFL calendar', () => {
    assert.equal(core.nflSeasonStart('2026-10-06'), '2026-08-01');
    assert.equal(core.nflSeasonStart('2027-01-20'), '2026-08-01');
    assert.equal(core.nflSeasonStart('2027-03-02'), '2027-08-01');
});

test('lowConfidenceCount counts low facts', () => {
    const f = facts(); f.facts.mow.confidence = 'low'; f.facts.border.confidence = 'low';
    assert.equal(core.lowConfidenceCount(f), 2);
});
