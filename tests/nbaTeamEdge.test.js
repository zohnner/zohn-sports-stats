// ============================================================
// /nba/team/:abbr edge template (parity #87 Phase B) and its helpers
// (functions/_nbaTeams.js). The standings fixture is trimmed from a live
// ESPN response (tests/fixtures/nba-standings-ny-trim.json, 2026-11-12).
// Run: node --test tests/nbaTeamEdge.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const STANDINGS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nba-standings-ny-trim.json'), 'utf8'));
const FALLBACK = {
    seasonLabel: '2026-27', throughDate: '2026-11-10',
    sections: [{ name: 'Eastern Conference — Atlantic', teams: [{ name: 'New York Knicks', record: '6-4' }] }],
};
const STORIES = { stories: [
    { slug: '2026-11-12-towns', title: 'Towns story', dek: 'd', date: '2026-11-12', teams: ['NY', 'CLE'] },
    { slug: '2026-11-03-old', title: 'Long-form spelling', dek: 'd', date: '2026-11-03', teams: ['NYK'] },
    { slug: '2026-11-07-spurs', title: 'Spurs story', dek: 'd', date: '2026-11-07', teams: ['SAS'] },
] };

// Mirror the template and its relative imports as .mjs so any Node imports them.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-team-edge-'));
const mirrored = new Map();
function mirror(abs) {
    if (mirrored.has(abs)) return mirrored.get(abs);
    const out = path.join(TMP, path.relative(ROOT, abs)).replace(/\.js$/, '.mjs');
    mirrored.set(abs, out);
    const src = fs.readFileSync(abs, 'utf8').replace(/(from\s+)(['"])(\.[^'"]+)\2/g, (m, from, q, spec) => {
        const target = path.resolve(path.dirname(abs), spec);
        return `${from}${q}${pathToFileURL(target.endsWith('.js') ? mirror(target) : target).href}${q}`;
    });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, src);
    return out;
}
const load = rel => import(pathToFileURL(mirror(path.join(ROOT, rel))).href);
const TEMPLATE = 'functions/nba/team/[abbr]/[[slug]].js';

const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

async function render(abbr, { espn = 'live', fallback = true } = {}) {
    const store = new Map();
    globalThis.caches = { default: {
        async match(r) { const v = store.get(r.url || r); return v == null ? undefined : new Response(v); },
        async put(r, res) { store.set(r.url || r, await res.text()); },
    } };
    globalThis.fetch = async (input) => {
        const url = String(input && input.url ? input.url : input);
        if (/\/api\/nbastandings/.test(url)) return espn === 'live' ? json(STANDINGS) : json('<html>403</html>', 403);
        return new Response('not found', { status: 404 });
    };
    const ASSETS = { fetch: async (u) => {
        const p = new URL(String(u.url || u)).pathname;
        if (p === '/index.html') return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html' } });
        if (p === '/content/nba/standings.json' && fallback) return json(FALLBACK);
        if (p === '/content/nba/stories/index.json') return json(STORIES);
        return new Response('nf', { status: 404 });
    } };
    const mod = await load(TEMPLATE);
    const pending = [];
    const res = await mod.onRequest({
        request: new Request(`https://sportstrata.cc/nba/team/${abbr}`), env: { ASSETS }, params: { abbr },
        waitUntil: p => pending.push(p),
    });
    await Promise.all(pending);
    return { res, html: res.status === 200 ? await res.text() : '' };
}

test('helpers: ESPN keys, the six long-form aliases, and slugs', async () => {
    const T = await load('functions/_nbaTeams.js');
    assert.equal(T.NBA_TEAMS.length, 30);
    assert.equal(new Set(T.NBA_TEAMS.map(t => t.abbr)).size, 30);
    for (const [alias, key] of Object.entries({ sas: 'SA', gsw: 'GS', nyk: 'NY', nop: 'NO', uta: 'UTAH', was: 'WSH' })) {
        assert.equal(T.findNBATeam(alias).abbr, key, alias);
    }
    assert.equal(T.nbaTeamPath(T.findNBATeam('phi')), '/nba/team/phi/philadelphia-76ers');
    assert.equal(T.findNBATeam('xyz'), null);
});

test('helpers: record from the ESPN standings tree and from the fallback file', async () => {
    const T = await load('functions/_nbaTeams.js');
    const ny = T.nbaStandingFromTree(STANDINGS, 'NYK');
    assert.equal(ny.record, '6-5');
    assert.equal(ny.division, 'Eastern Conference — Atlantic');
    assert.deepEqual([ny.pct, ny.seed, ny.streak, ny.home, ny.road, ny.lastTen, ny.ppg, ny.oppg],
        ['.545', '5', 'L1', '4-3', '2-2', '6-4', '110.3', '103.5']);
    assert.equal(T.nbaStandingFromTree(STANDINGS, 'LAL'), null);
    assert.deepEqual(T.nbaStandingFromFallback(FALLBACK, 'New York Knicks'), { record: '6-4', division: 'Eastern Conference — Atlantic' });
    assert.deepEqual(T.nbaStoriesFor(STORIES.stories, 'NY').map(s => s.slug), ['2026-11-12-towns', '2026-11-03-old']);
});

test('page: ESPN live renders the record, stories, directory and route', async () => {
    const { res, html } = await render('ny');
    assert.equal(res.status, 200);
    assert.match(html, /<title>New York Knicks — Record, Schedule &amp; Roster \| SportStrata<\/title>/);
    assert.match(html, /rel="canonical"\s*href="https:\/\/sportstrata\.cc\/nba\/team\/ny\/new-york-knicks"/);
    assert.match(html, /window\.__SS_ROUTE="nba-team-NY"/);
    assert.match(html, /<h2>Record<\/h2><p>6-5 \(\.545\) · Eastern Conference — Atlantic · Conference seed 5 · Streak L1/);
    assert.match(html, /Towns story/);
    assert.match(html, /Long-form spelling/, 'stories tagged NYK still match');
    assert.doesNotMatch(html, /Spurs story/);
    assert.match(html, /<a href="\/nba\/team\/sa\/san-antonio-spurs">San Antonio Spurs<\/a>/);
    assert.doesNotMatch(html, /<li><a href="\/nba\/team\/ny\//, 'directory leaves out the team itself');
    assert.equal((html.match(/<li><a href="\/nba\/team\//g) || []).length, 29);
});

test('page: ESPN blocked falls back to the daily standings file, then omits the record', async () => {
    const fb = await render('ny', { espn: 'http403' });
    assert.match(fb.html, /<h2>Record<\/h2><p>6-4 · Eastern Conference — Atlantic<\/p>/);
    assert.match(fb.html, /games through 2026-11-10/);
    assert.match(fb.html, /class="ss-prerender"/);

    const none = await render('ny', { espn: 'http403', fallback: false });
    assert.match(none.html, /class="ss-prerender"/, 'the page still renders without any record source');
    assert.doesNotMatch(none.html, /<h2>Record<\/h2>/);
    assert.match(none.html, /window\.__SS_ROUTE="nba-team-NY"/);
});

test('page: long forms 301 to the ESPN key; unknown teams get the fail-safe shell', async () => {
    const { res } = await render('sas');
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://sportstrata.cc/nba/team/sa/san-antonio-spurs');

    const bad = await render('zzz');
    assert.equal(bad.res.status, 200);
    assert.doesNotMatch(bad.html, /class="ss-prerender"/);
});
