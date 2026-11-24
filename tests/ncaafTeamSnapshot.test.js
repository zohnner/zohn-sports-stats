// ============================================================
// NCAAF team snapshot (tools/ncaaf-teams.cjs) and the /ncaaf/team/:id edge
// template's fallback to it while ESPN refuses Cloudflare (D-176). The fixture
// is trimmed from a live ESPN standings response (2026-11-21): two FBS
// Independents, two SEC teams, and both Sun Belt divisions.
// Run: node --test tests/ncaafTeamSnapshot.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { buildTeams, cfbSeason, MIN_TEAMS } = require('../tools/ncaaf-teams.cjs');

const ROOT = path.join(__dirname, '..');
const TREE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ncaaf-standings-trim.json'), 'utf8'));
const SNAP = buildTeams(TREE, { season: 2026, asOf: '2026-11-21' });

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ncaaf-team-edge-'));
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
const TEMPLATE = 'functions/ncaaf/team/[id]/[[slug]].js';
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

async function render(id, { espn = 'down', snapshot = SNAP } = {}) {
    const store = new Map();
    globalThis.caches = { default: {
        async match(r) { const v = store.get(r.url || r); return v == null ? undefined : new Response(v); },
        async put(r, res) { store.set(r.url || r, await res.text()); },
    } };
    globalThis.fetch = async (input) => {
        const url = String(input && input.url ? input.url : input);
        if (/college-football\/teams\//.test(url)) {
            return espn === 'live'
                ? json({ team: { id, displayName: 'Georgia Bulldogs', abbreviation: 'UGA', standingSummary: '1st in SEC' } })
                : new Response('<html>403</html>', { status: 403 });
        }
        return new Response('not found', { status: 404 });
    };
    const ASSETS = { fetch: async (u) => {
        const p = new URL(String(u.url || u)).pathname;
        if (p === '/index.html') return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html' } });
        if (p === '/content/ncaaf/teams.json' && snapshot) return json(snapshot);
        if (p === '/content/ncaaf/stories/index.json') return json({ stories: [] });
        return new Response('nf', { status: 404 });
    } };
    const mod = await import(pathToFileURL(mirror(path.join(ROOT, TEMPLATE))).href);
    const pending = [];
    const res = await mod.onRequest({
        request: new Request(`https://sportstrata.cc/ncaaf/team/${id}`), env: { ASSETS }, params: { id },
        waitUntil: p => pending.push(p),
    });
    await Promise.all(pending);
    return { res, html: res.status === 200 ? await res.text() : '' };
}

test('buildTeams: every FBS team, conference names, and Sun Belt divisions folded into the conference', () => {
    assert.equal(Object.keys(SNAP.teams).length, 8);
    assert.deepEqual(SNAP.teams['61'], {
        name: 'Georgia Bulldogs', abbr: 'UGA', conference: 'Southeastern Conference',
        overall: '10-1', conf: '8-1', home: '5-1', away: '4-0', streak: 'W4', pf: '452', pa: '153',
    });
    assert.equal(SNAP.teams['2348'].conference, 'Sun Belt Conference');
    assert.equal(SNAP.teams['87'].conference, 'FBS Independents');
    assert.equal(SNAP.season, 2026);
    assert.equal(SNAP.asOf, '2026-11-21');
});

test('buildTeams: an empty or malformed tree yields no teams (the CLI then refuses to write)', () => {
    assert.deepEqual(buildTeams(null, { season: 2026, asOf: 'x' }).teams, {});
    assert.deepEqual(buildTeams({ children: [{ standings: { entries: [{ team: {} }] } }] }, { season: 2026, asOf: 'x' }).teams, {});
    assert.ok(MIN_TEAMS >= 120);
});

test('cfbSeason: August starts the new season, July still belongs to the last one', () => {
    assert.equal(cfbSeason(new Date('2026-08-01T12:00Z')), 2026);
    assert.equal(cfbSeason(new Date('2027-01-10T12:00Z')), 2026);
    assert.equal(cfbSeason(new Date('2027-07-31T12:00Z')), 2026);
});

test('page: ESPN down renders the team from the snapshot, not the empty shell', async () => {
    const { res, html } = await render('309');
    assert.equal(res.status, 200);
    assert.match(html, /<title>Louisiana Ragin&#39; Cajuns — College Football Stats &amp; Roster \| SportStrata<\/title>/);
    assert.match(html, /<h1>Louisiana Ragin&#39; Cajuns<\/h1>/);
    assert.match(html, /<li>Overall: 8-3<\/li>/);
    assert.match(html, /<li>Conference: 5-2<\/li>/);
    assert.match(html, /Sun Belt Conference · regular season, as of 2026-11-21/);
    assert.match(html, /rel="canonical"\s*href="https:\/\/sportstrata\.cc\/ncaaf\/team\/309\/louisiana-ragin-cajuns"/);
    assert.match(html, /window\.__SS_ROUTE="ncaaf-team-309"/);
});

test('page: ESPN live renders as before, with no snapshot record block', async () => {
    const { html } = await render('61', { espn: 'live' });
    assert.match(html, /<h1>Georgia Bulldogs<\/h1>/);
    assert.match(html, /UGA · 1st in SEC/);
    assert.doesNotMatch(html, /<li>Overall:/);
});

test('page: a team missing from the snapshot still falls back to the routed shell', async () => {
    const { res, html } = await render('99999');
    assert.equal(res.status, 200);
    assert.match(html, /<title>SportStrata — Serious Stats for Serious Fans<\/title>/);
    assert.match(html, /window\.__SS_ROUTE="ncaaf-team-99999"/);
});

test('planted fault: with no snapshot file the page is the empty shell this fix exists to replace', async () => {
    const { html } = await render('309', { snapshot: null });
    assert.doesNotMatch(html, /Louisiana Ragin/);
    assert.match(html, /<title>SportStrata — Serious Stats for Serious Fans<\/title>/);
});
