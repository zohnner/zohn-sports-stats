// ============================================================
// D-196: server-side ESPN reads (functions/_espnSource.js) and every
// consumer routed through it, run against simulated upstream failures.
// The real onRequest/runAlerts code runs; only fetch, the Cache API,
// env.ASSETS, D1 and the web-push library are stubbed. Synthetic data only.
// Run: node --test tests/espnSource.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

// Mirror an ESM file and its relative .js imports into a temp dir as .mjs,
// so any Node version imports it without ESM syntax detection. Bare
// specifiers listed in STUBS resolve to stub modules; other relative imports
// (.cjs) resolve to the original file.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'espn-source-'));
const PUSH_STUB = path.join(TMP, 'push-stub.mjs');
fs.writeFileSync(PUSH_STUB, [
    'export const sent = [];',
    'export async function buildPushPayload(message) { sent.push(message); return { method: "POST", body: "x" }; }',
].join('\n'));
const STUBS = { '@block65/webcrypto-web-push': PUSH_STUB };
const mirrored = new Map();
function mirror(abs) {
    if (mirrored.has(abs)) return mirrored.get(abs);
    const out = path.join(TMP, path.relative(ROOT, abs)).replace(/\.js$/, '.mjs');
    mirrored.set(abs, out);
    let src = fs.readFileSync(abs, 'utf8');
    src = src.replace(/(from\s+)(['"])([^'"]+)\2/g, (m, from, q, spec) => {
        if (STUBS[spec]) return `${from}${q}${pathToFileURL(STUBS[spec]).href}${q}`;
        if (!spec.startsWith('.')) return m;
        const target = path.resolve(path.dirname(abs), spec);
        const url = pathToFileURL(target.endsWith('.js') ? mirror(target) : target).href;
        return `${from}${q}${url}${q}`;
    });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, src);
    return out;
}
const load = rel => import(pathToFileURL(mirror(path.join(ROOT, rel))).href);

// ---- fake Cache API ---------------------------------------------------
function fakeCaches() {
    const m = new Map();
    return {
        m,
        default: {
            async match(req) { const v = m.get(typeof req === 'string' ? req : req.url); return v == null ? undefined : new Response(v); },
            async put(req, res) { m.set(req.url, await res.text()); },
        },
    };
}
// Move every stored snapshot back in time (simulates a last-good copy aging).
function ageSnapshots(c, ms) {
    for (const [k, v] of c.m) {
        try { const s = JSON.parse(v); if (s.fetchedAt) { s.fetchedAt -= ms; c.m.set(k, JSON.stringify(s)); } } catch (_) { /* not a snapshot */ }
    }
}

// ---- fixtures: one valid ESPN/proxy body per URL family ---------------
const SOON = () => new Date(Date.now() + 5 * 60 * 1000).toISOString();
const scoreboard = (state = 'in') => ({
    events: [{
        id: '401', date: SOON(),
        status: { type: { state, name: state === 'pre' ? 'STATUS_SCHEDULED' : 'STATUS_IN_PROGRESS', shortDetail: 'Q2 4:10' } },
        competitions: [{
            competitors: [
                { homeAway: 'home', team: { displayName: 'Home Team', abbreviation: 'HOM' }, score: '14' },
                { homeAway: 'away', team: { displayName: 'Away Team', abbreviation: 'AWY' }, score: '10' },
            ],
        }],
    }],
});
const FIX = {
    standings: { children: [{ name: 'East', standings: { entries: [{ team: { displayName: 'Alpha State', abbreviation: 'ALP' }, stats: [{ name: 'wins', displayValue: '5' }, { name: 'losses', displayValue: '1' }] }] } }] },
    leaders: { season: 2026, categories: [{ key: 'pts', label: 'Points', unit: 'PPG', leaders: [{ id: '7', name: 'Pat Leader', team: 'NYL', value: '25.1' }] }] },
    rankings: { rankings: [{ name: 'AP Top 25', shortName: 'AP Poll', ranks: [{ current: 1, team: { displayName: 'Alpha State' }, recordSummary: '5-0' }] }] },
    athlete: { found: true, season: 2027, bio: { name: 'Pat Player', pos: 'G', team: 'NYK' } },
    coreAthlete: { id: '9', fullName: 'Pat Player', position: { displayName: 'Quarterback' } },
    summary: {
        predictor: { homeTeam: { gameProjection: '61' }, awayTeam: { gameProjection: '39' } },
        header: { competitions: [{ date: SOON(), status: { type: { state: 'in', shortDetail: 'Q2' } }, competitors: scoreboard().events[0].competitions[0].competitors }] },
    },
    team: { team: { id: '1', displayName: 'Alpha State', abbreviation: 'ALP' } },
    teams: { sports: [{ leagues: [{ teams: [{ team: { abbreviation: 'KC', displayName: 'Kansas City Chiefs' } }] }] }] },
    league: { id: '28', name: 'National Football League' },
    news: { articles: [] },
};
function fixtureFor(url, sbState) {
    if (/\/scoreboard/.test(url) || /path=%2Fscoreboard|path=\/scoreboard/.test(url)) return scoreboard(sbState);
    if (/summary/.test(url)) return FIX.summary;
    if (/standings/.test(url)) return FIX.standings;
    if (/\/api\/\w+stats/.test(url)) return FIX.leaders;
    if (/rankings/.test(url)) return FIX.rankings;
    if (/\/api\/\w+athlete/.test(url)) return FIX.athlete;
    if (/sports\.core\.api.*\/athletes\//.test(url)) return FIX.coreAthlete;
    if (/sports\.core\.api.*\/leagues\/\w+$/.test(url)) return FIX.league;
    if (/\/teams\/\d+/.test(url)) return FIX.team;
    if (/\/teams/.test(url)) return FIX.teams;
    if (/\/news/.test(url)) return FIX.news;
    return null;
}

const json = (body, status = 200, ct = 'application/json') => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': ct } });
const BLOCK_HTML = '<html><head><title>403 Forbidden</title></head><body><center><h1>403 Forbidden</h1></center></body></html>';

// Each upstream failure observed live on 2026-11-03 (see the design note),
// plus the two data-shape cases.
const ANSWER = {
    live: url => json(fixtureFor(url)),
    http403: () => json(BLOCK_HTML, 403, 'application/json; charset=utf-8'),
    http502: () => json('error code: 502', 502, 'text/plain'),
    // A JSON error body behind a non-2xx status. The pre-D-196 push reader
    // parsed any JSON without checking status, so this read as an off day.
    http403Json: () => json({ code: 403, message: 'Forbidden' }, 403),
    nonJson: () => json(BLOCK_HTML, 200, 'application/json; charset=utf-8'),
    errorIn200: url => json(/athlete/.test(url) ? { found: false, reason: 'upstream 403', season: 2027 } : { ok: false, reason: 'upstream 403', season: 2026 }),
    emptyShape: url => json(/scoreboard/.test(url) ? { events: [] } : {}),
    network: () => { throw new TypeError('fetch failed'); },
};
const isEspn = url => /espn\.com/.test(url) || /sportstrata\.cc\/api\/(nfl|ncaaf|ncaab|wnba|nba)(standings|stats|athlete)?(\?|$)/.test(url);

const pushLog = [];
function installFetch(mode, { sbState } = {}) {
    globalThis.fetch = async (input) => {
        const url = String(input && input.url ? input.url : input);
        if (isEspn(url)) {
            if (mode === 'live') return json(fixtureFor(url, sbState));
            return ANSWER[mode](url);
        }
        if (/statsapi\.mlb\.com\/api\/v1\/schedule/.test(url)) return json({ dates: [] });
        if (/statsapi\.mlb\.com\/api\/v1\/teams/.test(url)) return json({ teams: [] });
        if (/push\.example/.test(url)) { pushLog.push(url); return new Response(null, { status: 201 }); }
        return new Response('not found', { status: 404 });
    };
}

const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ASSETS = { fetch: async (u) => (new URL(String(u.url || u)).pathname === '/index.html' ? new Response(INDEX_HTML, { headers: { 'content-type': 'text/html' } }) : new Response('nf', { status: 404 })) };

async function render(rel, reqPath, params = {}) {
    const mod = await load(rel);
    const pending = [];
    const ctx = { request: new Request(`https://sportstrata.cc${reqPath}`), env: { ASSETS }, params, waitUntil: p => pending.push(p) };
    const res = await mod.onRequest(ctx);
    await Promise.all(pending);
    return { html: await res.text(), cc: res.headers.get('cache-control') || '' };
}

// ============================================================
// 1. The classifier and the adapter
// ============================================================
test('classify: every failure shape is DOWN, real answers are LIVE', async () => {
    const S = await load('functions/_espnSource.js');
    const c = (status, body, v) => S.classify(status, typeof body === 'string' ? body : JSON.stringify(body), v);
    assert.equal(c(403, BLOCK_HTML).reason, 'HTTP 403');
    assert.equal(c(502, 'error code: 502').reason, 'HTTP 502');
    assert.equal(c(200, BLOCK_HTML).reason, 'non-JSON body (HTTP 200)');
    assert.match(c(200, { ok: false, reason: 'upstream 403' }).reason, /upstream error inside 200: upstream 403/);
    assert.match(c(200, { error: 'leaders fetch failed' }).reason, /upstream error inside 200/);
    assert.match(c(200, { found: false, reason: 'upstream 403' }).reason, /upstream error inside 200/);
    assert.match(c(200, {}, S.SHAPES.scoreboard).reason, /no events array/);
    assert.equal(c(200, 'null').reason, 'empty body');
    // Real answers: an off day, and a genuinely unknown player.
    assert.deepEqual(c(200, { events: [] }, S.SHAPES.scoreboard).data, { events: [] });
    assert.equal(c(200, { found: false, reason: 'athlete not found' }, S.SHAPES.athlete).data.found, false);
});

test('readSource: LIVE, STALE within tolerance, DOWN past it, DOWN with no copy', async () => {
    const S = await load('functions/_espnSource.js');
    const store = new Map();
    const mem = { get: async k => store.get(k) || null, put: async (k, v) => { store.set(k, v); } };
    const ok = async () => json({ events: [] });
    const blocked = async () => json(BLOCK_HTML, 403);
    const t0 = Date.UTC(2026, 10, 3, 20, 0);
    const opts = (fetchImpl, now, maxStaleMs) => ({ fetchImpl, now, maxStaleMs, store: mem, validate: S.SHAPES.scoreboard });

    const live = await S.readSource('k', 'u', opts(ok, t0, 60000));
    assert.equal(live.state, 'LIVE');
    assert.equal(store.get('k').fetchedAt, t0);

    const stale = await S.readSource('k', 'u', opts(blocked, t0 + 30000, 60000));
    assert.deepEqual([stale.state, stale.ageMs, stale.reason], ['STALE', 30000, 'HTTP 403']);
    assert.deepEqual(stale.data, { events: [] });

    const old = await S.readSource('k', 'u', opts(blocked, t0 + 120000, 60000));
    assert.deepEqual([old.state, old.data, old.ageMs, old.fetchedAt], ['DOWN', null, 120000, t0]);
    assert.match(old.reason, /last good copy too old/);

    const none = await S.readSource('other', 'u', opts(blocked, t0, 60000));
    assert.deepEqual([none.state, none.fetchedAt, none.ageMs], ['DOWN', null, null]);

    // Tolerance 0 never serves a copy, even one written this millisecond.
    await S.readSource('z', 'u', opts(ok, t0, 0));
    const strict = await S.readSource('z', 'u', opts(blocked, t0, 0));
    assert.deepEqual([strict.state, strict.reason], ['DOWN', 'HTTP 403; caller accepts live data only']);
});

test('readSource: callers must declare a tolerance; a broken store never breaks a read', async () => {
    const S = await load('functions/_espnSource.js');
    await assert.rejects(S.readSource('k', 'u', { fetchImpl: async () => json({}) }), /maxStaleMs is required/);
    const broken = { get: async () => { throw new Error('evicted'); }, put: async () => { throw new Error('full'); } };
    const live = await S.readSource('k', 'u', { maxStaleMs: 1, store: broken, fetchImpl: async () => json({ a: 1 }) });
    assert.equal(live.state, 'LIVE');
    const down = await S.readSource('k', 'u', { maxStaleMs: 1, store: broken, fetchImpl: async () => { throw new Error('reset'); } });
    assert.deepEqual([down.state, down.reason], ['DOWN', 'network: reset']);
});

test('staleNote / pageCacheControl: only STALE carries a receipt and a short cache', async () => {
    const S = await load('functions/_espnSource.js');
    const t = Date.UTC(2026, 10, 3, 0, 42);
    assert.equal(S.staleNote({ state: 'LIVE', fetchedAt: t }, 'Standings'), '');
    assert.equal(S.staleNote({ state: 'DOWN', fetchedAt: t }, 'Standings'), '');
    const note = S.staleNote({ state: 'STALE', fetchedAt: t, ageMs: 1 }, 'Standings');
    assert.match(note, /data-source-state="stale"/);
    assert.match(note, /Standings as of Nov 2, 7:42 PM ET/);
    assert.equal(S.pageCacheControl({ state: 'STALE' }, 1800), 'public, max-age=60');
    assert.equal(S.pageCacheControl({ state: 'LIVE' }, 1800), 'public, max-age=1800');
});

test('home page and health probes share scoreboard URLs (one snapshot per sport)', async () => {
    const S = await load('functions/_espnSource.js');
    const src = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
    for (const [sport, p] of Object.entries(S.SCOREBOARD_PATH)) {
        assert.ok(src.includes(`['${sport}',`) && src.includes(`'${p}'`), `functions/index.js ESPN_SPORTS should carry ${sport} -> ${p}`);
    }
});

// ============================================================
// 2. Every edge template under every failure mode
// ============================================================
// outcome: LIVE = snapshot rendered from fresh data, STALE = rendered with
// the stale receipt, SHELL = fail-safe app shell (the reader's browser then
// fetches ESPN itself), OMIT = page rendered without the ESPN-backed section.
const TEMPLATES = [
    ['functions/nfl/standings.js', '/nfl/standings'],
    ['functions/ncaaf/standings.js', '/ncaaf/standings'],
    ['functions/ncaab/standings.js', '/ncaab/standings'],
    ['functions/wnba/standings.js', '/wnba/standings'],
    ['functions/nba/standings.js', '/nba/standings'],
    ['functions/nfl/leaders.js', '/nfl/leaders'],
    ['functions/wnba/leaders.js', '/wnba/leaders'],
    ['functions/nba/leaders.js', '/nba/leaders'],
    ['functions/ncaaf/rankings.js', '/ncaaf/rankings'],
    ['functions/wnba/player/[id]/[[slug]].js', '/wnba/player/7/pat', { id: '7' }],
    ['functions/nba/player/[id]/[[slug]].js', '/nba/player/7/pat', { id: '7' }],
    ['functions/ncaaf/player/[id]/[[slug]].js', '/ncaaf/player/9/pat', { id: '9' }],
    ['functions/nfl/game/[id].js', '/nfl/game/401', { id: '401' }],
    ['functions/ncaaf/game/[id].js', '/ncaaf/game/401', { id: '401' }],
    ['functions/nfl/team/[abbr]/[[slug]].js', '/nfl/team/kc', { abbr: 'kc' }],
    ['functions/ncaaf/team/[id]/[[slug]].js', '/ncaaf/team/1', { id: '1' }],
    ['functions/nfl/index.js', '/nfl', {}, 'All 32 NFL Teams'],
    ['functions/nfl/pickem.js', '/nfl/pickem', {}, 'Blended Confidence Rankings', 'pickem'],
];
const MODES = ['live', 'http403', 'http502', 'nonJson', 'errorIn200', 'emptyShape', 'network', 'staleCopy', 'tooOldCopy', 'noCopy'];

function outcomeOf(html, marker) {
    const stale = html.includes('data-source-state="stale"');
    if (marker) return !html.includes(marker) ? 'OMIT' : stale ? 'STALE' : 'LIVE';
    if (stale) return 'STALE';
    return html.includes('class="ss-prerender"') ? 'LIVE' : 'SHELL';
}

async function runMode(rel, reqPath, params, mode) {
    const c = fakeCaches();
    globalThis.caches = c;
    if (['staleCopy', 'tooOldCopy'].includes(mode)) {
        installFetch('live');
        await render(rel, reqPath, params);
        if (mode === 'tooOldCopy') ageSnapshots(c, 30 * 24 * 3600 * 1000);
        installFetch('http403');
    } else {
        installFetch(mode === 'noCopy' ? 'http403' : mode);
    }
    return render(rel, reqPath, params);
}

const matrix = {};
test('edge templates: LIVE renders, STALE is labelled, every failure fails safe', async () => {
    for (const [rel, reqPath, params = {}, marker, kind] of TEMPLATES) {
        const row = matrix[rel] = {};
        for (const mode of MODES) {
            const { html, cc } = await runMode(rel, reqPath, params, mode);
            row[mode] = outcomeOf(html, marker);
            const down = marker ? 'OMIT' : 'SHELL';
            const want = mode === 'live' ? 'LIVE'
                : mode === 'staleCopy' ? (kind === 'pickem' ? 'OMIT' : 'STALE')
                : down;
            assert.equal(row[mode], want, `${rel} under ${mode}`);
            if (row[mode] === 'STALE' && !marker) assert.equal(cc, 'public, max-age=60', `${rel} stale page must re-check every minute`);
            if (row[mode] === 'STALE') assert.match(html, /as of [A-Z][a-z]{2} \d+, \d+:\d\d [AP]M ET/, `${rel} stale receipt carries a time`);
        }
    }
    const pad = (s, n) => String(s).padEnd(n);
    const lines = [pad('consumer', 42) + MODES.map(m => pad(m, 11)).join('')];
    for (const [rel, row] of Object.entries(matrix)) lines.push(pad(rel.replace('functions/', ''), 42) + MODES.map(m => pad(row[m], 11)).join(''));
    console.log('\n' + lines.join('\n'));
});

// ============================================================
// 3. Home page: per-sport receipts, never a stale "Live now"
// ============================================================
test('home: LIVE lists the game live, STALE labels each row and drops it from Live now, DOWN says so', async () => {
    const out = {};
    for (const mode of ['live', 'http403', 'nonJson', 'emptyShape', 'staleCopy', 'tooOldCopy']) {
        const { html, cc } = await runMode('functions/index.js', '/', {}, mode);
        out[mode] = { html, cc };
    }
    const nfl = h => (h.match(/NFL: [^<]*/) || [''])[0];
    assert.match(out.live.html, /<h2>Live now<\/h2>/);
    assert.equal(nfl(out.live.html), 'NFL: Away Team 10, Home Team 14 — Q2 4:10');
    assert.equal(out.live.cc, 'public, max-age=120');

    assert.doesNotMatch(out.staleCopy.html, /<h2>Live now<\/h2>/, 'a stale live score must not be called live');
    assert.match(nfl(out.staleCopy.html), /^NFL: Away Team 10, Home Team 14 — Q2 4:10 \(as of [A-Z][a-z]{2} \d+, \d+:\d\d [AP]M ET\)$/);
    assert.match(out.staleCopy.html, /NFL, College Football, NBA, College Basketball, WNBA scores are the last copy/);
    assert.equal(out.staleCopy.cc, 'public, max-age=60');

    for (const m of ['http403', 'nonJson', 'tooOldCopy']) {
        assert.match(out[m].html, /Scores for <a href="\/nfl">NFL<\/a>.*couldn’t be loaded/, `home under ${m}`);
        assert.doesNotMatch(out[m].html, /No games on today/, `home under ${m} must not claim "no games"`);
    }
    // ESPN answered with an empty slate: a real "no games" for those sports.
    assert.doesNotMatch(out.emptyShape.html, /couldn’t be loaded/);
});

// ============================================================
// 4. Push alerts: LIVE only, never on STALE or DOWN
// ============================================================
function fakeDb() {
    return {
        prepare(sql) {
            return {
                bind() {
                    return {
                        all: async () => ({ results: sql.includes('FROM follows') ? [{ sub_id: 1, user_id: 'u1', endpoint: 'https://push.example/s1', p256dh: 'k', auth: 'a' }] : [] }),
                        first: async () => null,
                        run: async () => ({}),
                    };
                },
            };
        },
    };
}
async function runPush(mode) {
    const worker = await load('worker/push-game-alerts.js');
    const stub = await import(pathToFileURL(PUSH_STUB).href);
    stub.sent.length = 0;
    pushLog.length = 0;
    const c = fakeCaches();
    globalThis.caches = c;
    if (mode === 'staleCopy') {
        // A fresh last-good scoreboard sits in the Cache API (written by the
        // home page or the health probe), then ESPN starts refusing.
        const S = await load('functions/_espnSource.js');
        for (const sport of ['nfl', 'ncaaf', 'ncaab', 'wnba', 'nba']) {
            await S.cacheStore().put(`scoreboard:${sport}`, { data: scoreboard('pre'), fetchedAt: Date.now() - 60000 });
        }
        installFetch('http403');
    } else {
        installFetch(mode === 'noCopy' ? 'http403' : mode, { sbState: 'pre' });
    }
    const env = { USER_DB: fakeDb(), PUSH_RUN_SECRET: 's3cret', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };
    const res = await worker.default.fetch(new Request('https://w.example/__run', { headers: { 'X-Push-Secret': 's3cret' } }), env);
    return { result: await res.json(), built: stub.sent.length, delivered: pushLog.length };
}

test('push: sends on LIVE; sends nothing on STALE, DOWN or an empty slate', async () => {
    const live = await runPush('live');
    assert.deepEqual([live.result.sent, live.built, live.delivered], [5, 5, 5], 'control: one alert per ESPN sport when LIVE');
    assert.deepEqual(live.result.errors, []);

    for (const mode of ['http403', 'http403Json', 'http502', 'nonJson', 'errorIn200', 'network', 'staleCopy', 'noCopy']) {
        const r = await runPush(mode);
        assert.deepEqual([r.result.sent, r.built, r.delivered], [0, 0, 0], `push must not fire under ${mode}`);
        assert.equal(r.result.errors.length, 5, `push under ${mode} reports each ESPN sport`);
        for (const e of r.result.errors) assert.match(e, /scoreboard DOWN: .*\(no alerts sent\)/, e);
    }
    const empty = await runPush('emptyShape');
    assert.deepEqual([empty.result.sent, empty.result.errors], [0, []], 'an empty slate is an off day, not an outage');
});

test('push: _liveOnly refuses a STALE read even if one were handed to it', async () => {
    const worker = await load('worker/push-game-alerts.js');
    const staleSrc = { state: 'STALE', data: scoreboard('pre'), fetchedAt: Date.now() - 1000, ageMs: 1000, reason: 'HTTP 403' };
    assert.throws(() => worker._liveOnly('nfl', staleSrc), /nfl-scoreboard STALE: HTTP 403 \(no alerts sent\)/);
    assert.throws(() => worker._liveOnly('nfl', null), /DOWN/);
    assert.deepEqual(worker._liveOnly('nfl', { state: 'LIVE', data: { events: [] } }), { events: [] });
});

// ============================================================
// 5. Health view
// ============================================================
test('sourcehealth: reports each source, overall state and last-good age honestly', async () => {
    const H = await load('functions/api/sourcehealth.js');
    globalThis.caches = fakeCaches();
    installFetch('live');
    const up = await H.probeAll();
    assert.equal(up.overall, 'LIVE');
    assert.ok(up.sources.every(s => s.upstream === 'LIVE' && s.lastGoodAgeMin === 0));

    installFetch('http403');
    const down = await H.probeAll({ now: Date.now() + 10 * 60000 });
    assert.equal(down.overall, 'DOWN');
    for (const s of down.sources) {
        assert.deepEqual([s.upstream, s.lastGoodAgeMin], ['DOWN', 10], s.key);
        assert.match(s.reason, /^HTTP 403/);
    }
    assert.equal(down.toleranceMin.push, 0);

    globalThis.caches = fakeCaches();
    globalThis.fetch = async (u) => (/scoreboard/.test(String(u)) ? json(fixtureFor(String(u))) : json('error code: 502', 502));
    const mixed = await H.probeAll();
    assert.equal(mixed.overall, 'DEGRADED');
    const std = mixed.sources.find(s => s.key === 'standings:nfl');
    assert.deepEqual([std.upstream, std.reason, std.lastGoodAt], ['DOWN', 'HTTP 502', null]);
});

// ============================================================
// 6. Coverage guard: no server-side ESPN read bypasses the layer
// ============================================================
test('every non-proxy Function that reads ESPN goes through _espnSource.js', () => {
    const files = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!(d === path.join(ROOT, 'functions') && e.name === 'api')) walk(p); }
            else if (p.endsWith('.js')) files.push(p);
        }
    })(path.join(ROOT, 'functions'));
    files.push(path.join(ROOT, 'functions', 'api', 'sourcehealth.js'), path.join(ROOT, 'worker', 'push-game-alerts.js'));
    const readsEspn = /(site\.web\.api|sports\.core\.api|site\.api)\.espn\.com|['`]\/api\/(nfl|ncaaf|ncaab|wnba|nba)(standings|stats|athlete)?[?'`]/;
    const offenders = files.filter(f => !f.endsWith('_espnSource.js')
        && readsEspn.test(fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, ''))
        && !fs.readFileSync(f, 'utf8').includes('_espnSource.js\''));
    assert.deepEqual(offenders.map(f => path.relative(ROOT, f)), []);
});
