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

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cli = require('../tools/fields/build-index.cjs');
const approveCli = require('../tools/fields/approve.cjs');

function writeField(dir, slug, p, f) {
    fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify(p, null, 2));
    fs.writeFileSync(path.join(dir, `${slug}.facts.json`), JSON.stringify(f, null, 2));
}
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'fields-')); }
const approvedFacts = () => ({ ...facts(), approved: { date: '2026-10-07' } });

test('index includes approved profiles only, keyed venueId--TEAM', () => {
    const dir = tmpDir();
    writeField(dir, 'lambeau-field--gb', profile(), approvedFacts());
    writeField(dir, 'soldier-field--chi', profile({ venueId: '3933', homeTeam: 'CHI', name: 'Soldier Field' }), facts());
    const loaded = cli.loadFields(dir);
    assert.deepEqual(loaded.problems, []);
    const idx = cli.buildIndex(loaded);
    assert.deepEqual(Object.keys(idx.teams), ['3798--GB']);
    assert.equal(idx.teams['3798--GB'].name, 'Lambeau Field');
});

test('filename team must match homeTeam, and facts must exist', () => {
    const dir = tmpDir();
    writeField(dir, 'lambeau-field--chi', profile(), approvedFacts());
    fs.writeFileSync(path.join(dir, 'soldier-field--chi.json'), JSON.stringify(profile({ venueId: '3933', homeTeam: 'CHI' })));
    const { problems } = cli.loadFields(dir);
    assert.ok(problems.some(m => m.includes('lambeau-field--chi') && m.includes('homeTeam')));
    assert.ok(problems.some(m => m.includes('soldier-field--chi') && m.includes('facts')));
});

test('coverage requires every team exactly once and approved', () => {
    const dir = tmpDir();
    writeField(dir, 'lambeau-field--gb', profile(), facts());
    const probs = cli.coverageProblems(cli.loadFields(dir), ['GB', 'CHI']);
    assert.ok(probs.some(m => m.includes('CHI') && m.includes('no field profile')));
    assert.ok(probs.some(m => m.includes('GB') && m.includes('not approved')));
});

test('neutral profiles are keyed by event id and validated only when present', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'neutral'));
    writeField(path.join(dir, 'neutral'), '401872965', profile({ venueId: '5534', homeTeam: 'WSH', name: 'Tottenham Hotspur Stadium' }), approvedFacts());
    const idx = cli.buildIndex(cli.loadFields(dir));
    assert.equal(idx.neutral['401872965'].name, 'Tottenham Hotspur Stadium');
});

test('--check fails on missing coverage and on a stale index, passes once written', () => {
    const dir = tmpDir();
    for (const t of core.NFL_TEAMS) {
        writeField(dir, `stadium-${t.toLowerCase()}--${t.toLowerCase()}`, profile({ homeTeam: t, venueId: String(1000 + core.NFL_TEAMS.indexOf(t)) }), approvedFacts());
    }
    assert.equal(cli.main(['--check', '--dir', dir]), 2);
    assert.equal(cli.main(['--dir', dir]), 0);
    assert.equal(cli.main(['--check', '--dir', dir]), 0);
    fs.unlinkSync(path.join(dir, 'stadium-gb--gb.json'));
    assert.equal(cli.main(['--check', '--dir', dir]), 2);
});

test('approve stamps a valid facts file and refuses an invalid one', () => {
    const dir = tmpDir();
    writeField(dir, 'lambeau-field--gb', profile(), facts());
    assert.equal(approveCli.approve(dir, 'lambeau-field--gb', '2026-10-08'), 0);
    const f = JSON.parse(fs.readFileSync(path.join(dir, 'lambeau-field--gb.facts.json'), 'utf8'));
    assert.deepEqual(f.approved, { date: '2026-10-08' });
    const bad = facts(); delete bad.facts.border;
    writeField(dir, 'soldier-field--chi', profile({ venueId: '3933', homeTeam: 'CHI' }), bad);
    assert.equal(approveCli.approve(dir, 'soldier-field--chi', '2026-10-08'), 2);
});

const IDX = { version: 1, teams: { '3798--GB': profile({ surface: 'hybrid' }), '3933--CHI': profile({ venueId: '3933', homeTeam: 'CHI', surface: 'artificial', name: 'Soldier Field' }) }, neutral: {} };
const ev = (venueId, home, neutralSite = false) => ({ competitions: [{ neutralSite, venue: { id: venueId }, competitors: [{ homeAway: 'home', team: { abbreviation: home } }] }] });

test('missingFieldProfiles skips neutral games and reports unknown venue/home pairs', () => {
    const sb = { events: [ev('3798', 'GB'), ev('5534', 'WSH', true), ev('3839', 'NYG')] };
    assert.deepEqual(core.missingFieldProfiles(sb, IDX), ['3839--NYG']);
});

test('surfaceMismatch compares ESPN grass with profile surface', () => {
    const sum = (venueId, home, grass, neutralSite = false) => ({ gameInfo: { venue: { id: venueId, grass } }, header: { competitions: [{ neutralSite, competitors: [{ homeAway: 'home', team: { abbreviation: home } }] }] } });
    assert.equal(core.surfaceMismatch(sum('3798', 'GB', true), IDX), null);
    assert.match(core.surfaceMismatch(sum('3933', 'CHI', true), IDX), /Soldier Field/);
    assert.equal(core.surfaceMismatch(sum('3933', 'CHI', undefined), IDX), null);
    assert.equal(core.surfaceMismatch(sum('3933', 'CHI', true, true), IDX), null);
    assert.equal(core.surfaceMismatch(sum('1', 'ARI', true), IDX), null);
});
