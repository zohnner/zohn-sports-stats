# Agent Numbers Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the site's anonymous visit log trustworthy and readable by scheduled agents: count TikTok as its own channel, keep our own audit browsers out of the log, and serve aggregates from a key-gated route.

**Architecture:** Three independent changes to existing code. The channel bucket lists in `js/visitBeacon.js` (client) and `functions/api/track.js` (server) gain `tiktok`. A new helper stops Playwright pages from sending page-view beacons, and both audit tools call it. A new Pages Function, `functions/api/stats.js`, runs five fixed read-only aggregate queries on `USER_DB` behind a shared-secret header.

**Tech Stack:** Vanilla JS (classic scripts, no bundler), Cloudflare Pages Functions (ES modules), D1, `node:test`, Playwright (audit tools only).

**Spec:** `docs/superpowers/specs/2026-11-15-agent-roster-design.md` (Part 1).

## Global Constraints

- No framework, bundler or build step. No new external hosts. No new npm dependencies.
- Work on a branch off fresh `origin/main` in its own worktree. Never push to `main`, never merge; the owner merges.
- Any shipped js/css change bumps `CACHE_NAME` in `sw.js` (currently `sportstrata-v344`). Run `git fetch origin && git show origin/main:sw.js | grep CACHE_NAME` and check open PRs first; use the next free number.
- No comments in code unless the reason is non-obvious.
- A new control needs a test whose name starts `planted fault`, and its file added to `PLANT_TESTS` in `tools/audit/integrity-audit.cjs`.
- The stats route returns aggregates only. It never returns a row, and it never writes.
- `CLAUDE.md` is updated in the same commit as any change to key files or rules.
- Full check before the last commit: `node --test tests/*.test.js`, `node tools/check-manifest.cjs`, `node tools/check-themes.cjs --strict`, `node tools/stories/build-index.cjs --check`.
- Commits end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

---

### Task 1: TikTok channel bucket

**Files:**
- Modify: `js/visitBeacon.js` (`HOST_BUCKETS`, `UTM_BUCKETS`)
- Modify: `functions/api/track.js` (`REF_BUCKETS`)
- Modify: `sw.js` (`CACHE_NAME`)
- Modify: `CLAUDE.md` (the `functions/api/track.js` row in Key Files)
- Test: `tests/visitBeacon.test.js`

**Interfaces:**
- Produces: the string `'tiktok'` as a value of `page_views.ref`. Task 3's channel query reports it with no further change.

- [ ] **Step 1: Write the failing tests**

Append to `tests/visitBeacon.test.js`:

```js
test('refBucket: TikTok by referrer host and by utm_source', () => {
    const V = load();
    assert.equal(V.refBucket('https://www.tiktok.com/@sportstrata', 'sportstrata.cc', ''), 'tiktok');
    assert.equal(V.refBucket('https://vm.tiktok.com/abc', 'sportstrata.cc', ''), 'tiktok');
    // The in-app browser often sends no referrer; the profile link's utm is what counts it.
    assert.equal(V.refBucket('', 'sportstrata.cc', '?utm_source=tiktok'), 'tiktok');
    assert.equal(V.refBucket('', 'sportstrata.cc', '?utm_source=TikTok'), 'tiktok');
    assert.equal(V.refBucket('https://nottiktok.com/', 'sportstrata.cc', ''), 'other');
});

test('track.js parseRow: keeps a tiktok ref on the entry row', async () => {
    const { parseRow, REF_BUCKETS } = await import(pathToFileURL(path.join(__dirname, '..', 'functions', 'api', 'track.js')).href);
    assert.equal(REF_BUCKETS.has('tiktok'), true);
    assert.equal(parseRow({ sport: 'home', view: 'home', seq: 1, isNew: 1, ref: 'tiktok', path: '/' }).ref, 'tiktok');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/visitBeacon.test.js`
Expected: the two new tests FAIL (`'other' !== 'tiktok'`, `false !== true`); the existing tests pass.

- [ ] **Step 3: Add the bucket in both lists**

In `js/visitBeacon.js`, add one line to `HOST_BUCKETS` after the `meta` line:

```js
        [/(^|\.)tiktok\.com$/, 'tiktok'],
```

and add `tiktok: 'tiktok'` to `UTM_BUCKETS`:

```js
    const UTM_BUCKETS = { google: 'google', reddit: 'reddit', x: 'x', twitter: 'x', facebook: 'meta', instagram: 'meta', threads: 'meta', bing: 'search', tiktok: 'tiktok' };
```

In `functions/api/track.js`:

```js
export const REF_BUCKETS = new Set(['direct', 'internal', 'google', 'search', 'reddit', 'x', 'meta', 'tiktok', 'ai', 'other']);
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/visitBeacon.test.js`
Expected: all PASS.

- [ ] **Step 5: Bump the service worker and update CLAUDE.md**

In `sw.js`, set `CACHE_NAME` to the next free number (see Global Constraints). In `CLAUDE.md`, in the `functions/api/track.js` row, after "`REF_BUCKETS` mirrors `js/visitBeacon.js`" add: "TikTok is its own bucket; its in-app browser often sends no referrer, so the profile link carries `?utm_source=tiktok`".

- [ ] **Step 6: Commit**

```bash
git add js/visitBeacon.js functions/api/track.js tests/visitBeacon.test.js sw.js CLAUDE.md
git commit -m "feat(analytics): count TikTok as its own visit channel"
```

---

### Task 2: Keep the audit browsers out of the visit log

**Files:**
- Create: `tools/audit/no-track.cjs`
- Modify: `tools/audit/page-walk.cjs` (inside `run`, between `browser.newPage(...)` and `page.goto(...)`)
- Modify: `tools/audit/route-crawl.cjs` (inside `crawlBrowser`, between `browser.newPage(...)` and `page.goto(...)`)
- Modify: `tools/audit/integrity-audit.cjs` (`PLANT_TESTS`)
- Modify: `tools/audit/RUNBOOK.md`
- Test: `tests/auditNoTrack.test.js`

**Interfaces:**
- Produces: `blockTracking(page) → Promise<void>` and `TRACK_RE` (a `RegExp`) from `tools/audit/no-track.cjs`. `page` is a Playwright `Page`; the helper uses only `page.route(urlOrRegExp, handler)` and `page.addInitScript(fn)`.

Two layers on purpose: the route abort stops the request, and the init script replaces `navigator.sendBeacon`, which is the only way `_trackPageView()` sends. Either alone would do; the second covers a browser that does not route beacon requests.

- [ ] **Step 1: Write the failing test**

Create `tests/auditNoTrack.test.js`:

```js
// Our own audit browsers must never write to the page_views log.
// Run: node --test tests/auditNoTrack.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { blockTracking, TRACK_RE } = require('../tools/audit/no-track.cjs');

function fakePage() {
    const p = { routes: [], inits: [] };
    p.route = async (re, handler) => { p.routes.push({ re, handler }); };
    p.addInitScript = async fn => { p.inits.push(fn); };
    return p;
}

test('TRACK_RE matches the page-view route and nothing else under /api', () => {
    assert.equal(TRACK_RE.test('https://sportstrata.cc/api/track'), true);
    assert.equal(TRACK_RE.test('https://sportstrata.cc/api/track?x=1'), true);
    assert.equal(TRACK_RE.test('https://sportstrata.cc/api/nba?path=/scoreboard'), false);
    assert.equal(TRACK_RE.test('https://sportstrata.cc/api/tracker'), false);
});

test('planted fault: a beacon sent from an audit page is aborted and sendBeacon is replaced', async () => {
    const page = fakePage();
    await blockTracking(page);
    assert.equal(page.routes.length, 1);
    assert.equal(page.routes[0].re, TRACK_RE);
    let aborted = 0;
    await page.routes[0].handler({ abort: async () => { aborted++; } });
    assert.equal(aborted, 1);
    const nav = { sendBeacon: () => { throw new Error('sent'); } };
    const saved = global.navigator;
    Object.defineProperty(global, 'navigator', { value: nav, configurable: true, writable: true });
    try { page.inits[0](); assert.equal(nav.sendBeacon('/api/track', 'x'), true); }
    finally { Object.defineProperty(global, 'navigator', { value: saved, configurable: true, writable: true }); }
});

test('planted fault: an audit tool that opens a page without blockTracking fails here', () => {
    for (const file of ['page-walk.cjs', 'route-crawl.cjs']) {
        const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'audit', file), 'utf8');
        const opened = src.indexOf('browser.newPage(');
        const blocked = src.indexOf('await blockTracking(page)');
        const went = src.indexOf('page.goto(');
        assert.ok(opened > -1 && went > -1, `${file} opens a page`);
        assert.ok(blocked > opened && blocked < went, `${file} must call blockTracking(page) before its first page.goto`);
    }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test tests/auditNoTrack.test.js`
Expected: FAIL with `Cannot find module '../tools/audit/no-track.cjs'`.

- [ ] **Step 3: Write the helper**

Create `tools/audit/no-track.cjs`:

```js
// The audit tools load production in a real browser. Without this, every run
// writes rows to page_views that read as new direct visitors.
const TRACK_RE = /\/api\/track(\?|$)/;

async function blockTracking(page) {
    await page.route(TRACK_RE, route => route.abort());
    await page.addInitScript(() => { navigator.sendBeacon = () => true; });
}

module.exports = { TRACK_RE, blockTracking };
```

- [ ] **Step 4: Call it from both tools**

In `tools/audit/page-walk.cjs`, add to the requires at the top:

```js
const { blockTracking } = require('./no-track.cjs');
```

and in `run`, directly after `const page = await browser.newPage({ ignoreHTTPSErrors: !!proxy });`:

```js
    await blockTracking(page);
```

In `tools/audit/route-crawl.cjs`, add the same require, and in `crawlBrowser`, directly after `const page = await browser.newPage({ ignoreHTTPSErrors: !!proxy, viewport: { width: 1280, height: 900 } });`:

```js
        await blockTracking(page);
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `node --test tests/auditNoTrack.test.js tests/auditWalk.test.js tests/routeCrawl.test.js`
Expected: all PASS.

- [ ] **Step 6: Prove the test catches the fault**

Delete the `await blockTracking(page);` line from `tools/audit/page-walk.cjs`, run `node --test tests/auditNoTrack.test.js`, and confirm the third test FAILS naming `page-walk.cjs`. Restore the line and re-run to green.

- [ ] **Step 7: Register the planted faults and document the rule**

In `tools/audit/integrity-audit.cjs`, add `'tests/auditNoTrack.test.js'` to the `PLANT_TESTS` array. In `tools/audit/RUNBOOK.md`, under "What the tools can't see", add:

```
- The walk and the crawl block the page-view beacon (`tools/audit/no-track.cjs`), so their visits are not in `page_views`. Any new tool that opens the live site in a browser must call `blockTracking(page)` before its first `goto`.
```

- [ ] **Step 8: Check against the live site (where Playwright is installed)**

Run: `node tools/audit/route-crawl.cjs https://sportstrata.cc`
Expected: the same result as before the change (no new findings). If Playwright is not installed locally, say so in the PR body; the Route Crawl workflow will exercise it after merge.

- [ ] **Step 9: Commit**

```bash
git add tools/audit/no-track.cjs tools/audit/page-walk.cjs tools/audit/route-crawl.cjs tools/audit/integrity-audit.cjs tools/audit/RUNBOOK.md tests/auditNoTrack.test.js
git commit -m "fix(audit): the page walk and route crawl no longer log page views"
```

---

### Task 3: Key-gated stats route

**Files:**
- Create: `functions/api/stats.js`
- Modify: `CLAUDE.md` (Key Files row; Deployment section, the "First-party page-view log" bullet)
- Modify: `DECISIONS.md` (new entry, next free D-number)
- Test: `tests/statsRoute.test.js`

**Interfaces:**
- Consumes: the `page_views` table: `sport TEXT`, `view TEXT`, `created_at INTEGER` (epoch milliseconds), `is_new INTEGER` (0/1/NULL), `seq INTEGER`, `ref TEXT`, `entry_path TEXT`. Entry rows have `seq = 1`. Story pages log `view = 'story:<slug>'`.
- Produces: `GET /api/stats?days=N` with header `X-Stats-Key`. JSON body (values here are made up):

```json
{
  "days": 14,
  "since": 1762300800000,
  "generatedAt": 1763510400000,
  "bySport":   [{ "sport": "nba", "views": 100, "newSessions": 20 }],
  "byChannel": [{ "channel": "direct", "entries": 50 }],
  "topEntries":[{ "path": "/", "entries": 30 }],
  "stories":   [{ "slug": "2026-01-01-example-story", "views": 12, "entries": 7 }],
  "daily":     [{ "day": "2026-01-01", "views": 40, "entries": 9 }]
}
```

  Status codes: 405 not GET, 503 `STATS_KEY` unset, 401 wrong or missing key, 502 database error, 200 otherwise. Exports for tests: `windowDays(value) → number`, `QUERIES` (object of five SQL strings), `shape(days, since, now, results) → body`, `onRequest(context)`.

`/api/*` is already in `_routes.json` and already rate-limited by `functions/api/_middleware.js`, so neither needs a change.

- [ ] **Step 1: Write the failing tests**

Create `tests/statsRoute.test.js`:

```js
// GET /api/stats: key-gated, read-only aggregates over page_views.
// Run: node --test tests/statsRoute.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const mod = () => import(pathToFileURL(path.join(__dirname, '..', 'functions', 'api', 'stats.js')).href);

const ROWS = {
    bySport: [{ sport: 'nba', views: 100, new_sessions: 20 }],
    byChannel: [{ channel: 'direct', entries: 50 }, { channel: 'tiktok', entries: 9 }],
    topEntries: [{ path: '/', entries: 30 }],
    stories: [{ view: 'story:2026-01-01-example-story', views: 12, entries: 7 }],
    daily: [{ day: '2026-01-01', views: 40, entries: 9 }],
};

function fakeDb(log = []) {
    return {
        prepare(sql) { return { sql, bind(...args) { return { sql, args }; } }; },
        async batch(stmts) {
            log.push(...stmts);
            return Object.keys(ROWS).map(k => ({ results: ROWS[k] }));
        },
    };
}
const req = (url, headers = {}, method = 'GET') => new Request(url, { method, headers });
const call = async (request, env) => (await mod()).onRequest({ request, env });

test('windowDays: default 14, clamped to 1..90, junk falls back', async () => {
    const { windowDays } = await mod();
    assert.equal(windowDays(null), 14);
    assert.equal(windowDays('7'), 7);
    assert.equal(windowDays('0'), 1);
    assert.equal(windowDays('9999'), 90);
    assert.equal(windowDays('abc'), 14);
    assert.equal(windowDays('7.9'), 7);
});

test('every query is a single read-only aggregate bound to the window', async () => {
    const { QUERIES } = await mod();
    assert.deepEqual(Object.keys(QUERIES), ['bySport', 'byChannel', 'topEntries', 'stories', 'daily']);
    for (const [name, sql] of Object.entries(QUERIES)) {
        assert.match(sql, /^SELECT /, name);
        assert.match(sql, /GROUP BY/, `${name} aggregates`);
        assert.equal((sql.match(/\?/g) || []).length, 1, `${name} binds the window once`);
        assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|DROP|ALTER|;/i, name);
    }
});

test('fails closed: 503 with no key configured, 401 on a wrong or missing key', async () => {
    assert.equal((await call(req('https://x/api/stats'), { USER_DB: fakeDb() })).status, 503);
    assert.equal((await call(req('https://x/api/stats'), { USER_DB: fakeDb(), STATS_KEY: 'k' })).status, 401);
    assert.equal((await call(req('https://x/api/stats', { 'X-Stats-Key': 'kk' }), { USER_DB: fakeDb(), STATS_KEY: 'k' })).status, 401);
    assert.equal((await call(req('https://x/api/stats', { 'X-Stats-Key': 'k' }, 'POST'), { USER_DB: fakeDb(), STATS_KEY: 'k' })).status, 405);
});

test('a good key returns the five aggregates, shaped, and never cached', async () => {
    const log = [];
    const before = Date.now();
    const res = await call(req('https://x/api/stats?days=7', { 'X-Stats-Key': 'k' }), { USER_DB: fakeDb(log), STATS_KEY: 'k' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const body = await res.json();
    assert.equal(body.days, 7);
    assert.ok(Math.abs(body.since - (before - 7 * 86400000)) < 5000);
    assert.equal(log.length, 5);
    for (const s of log) assert.deepEqual(s.args, [body.since]);
    assert.deepEqual(body.bySport, [{ sport: 'nba', views: 100, newSessions: 20 }]);
    assert.deepEqual(body.byChannel[1], { channel: 'tiktok', entries: 9 });
    assert.deepEqual(body.topEntries, [{ path: '/', entries: 30 }]);
    assert.deepEqual(body.stories, [{ slug: '2026-01-01-example-story', views: 12, entries: 7 }]);
    assert.deepEqual(body.daily, [{ day: '2026-01-01', views: 40, entries: 9 }]);
});

test('a database error is a 502, not a crash and not a leak', async () => {
    const db = { prepare: () => ({ bind: () => ({}) }), batch: async () => { throw new Error('no such column: ref'); } };
    const res = await call(req('https://x/api/stats', { 'X-Stats-Key': 'k' }), { USER_DB: db, STATS_KEY: 'k' });
    assert.equal(res.status, 502);
    assert.doesNotMatch(await res.text(), /no such column/);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/statsRoute.test.js`
Expected: FAIL, module `functions/api/stats.js` not found.

- [ ] **Step 3: Write the route**

Create `functions/api/stats.js`:

```js
// Read-only aggregates over the anonymous page_views log, for the scheduled
// desk and audit runs, which cannot reach D1. Gated by a shared secret because
// the numbers are the owner's, not because any row is personal: the table
// holds no user id, IP or user agent, and this route never returns a row.
const DAY_MS = 86400000;

export const QUERIES = {
    bySport: 'SELECT sport, COUNT(*) AS views, SUM(CASE WHEN seq = 1 AND is_new = 1 THEN 1 ELSE 0 END) AS new_sessions FROM page_views WHERE created_at > ? GROUP BY sport ORDER BY views DESC',
    byChannel: "SELECT COALESCE(ref, 'unknown') AS channel, COUNT(*) AS entries FROM page_views WHERE seq = 1 AND created_at > ? GROUP BY channel ORDER BY entries DESC",
    topEntries: 'SELECT entry_path AS path, COUNT(*) AS entries FROM page_views WHERE seq = 1 AND entry_path IS NOT NULL AND created_at > ? GROUP BY entry_path ORDER BY entries DESC LIMIT 25',
    stories: "SELECT view, COUNT(*) AS views, SUM(CASE WHEN seq = 1 THEN 1 ELSE 0 END) AS entries FROM page_views WHERE view LIKE 'story:%' AND created_at > ? GROUP BY view ORDER BY views DESC LIMIT 100",
    daily: "SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS views, SUM(CASE WHEN seq = 1 THEN 1 ELSE 0 END) AS entries FROM page_views WHERE created_at > ? GROUP BY day ORDER BY day",
};

export function windowDays(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return 14;
    return Math.min(Math.max(n, 1), 90);
}

export function shape(days, since, now, results) {
    const [bySport, byChannel, topEntries, stories, daily] = results.map(r => (r && r.results) || []);
    return {
        days, since, generatedAt: now,
        bySport: bySport.map(r => ({ sport: r.sport, views: r.views, newSessions: r.new_sessions || 0 })),
        byChannel: byChannel.map(r => ({ channel: r.channel, entries: r.entries })),
        topEntries: topEntries.map(r => ({ path: r.path, entries: r.entries })),
        stories: stories.map(r => ({ slug: String(r.view).slice(6), views: r.views, entries: r.entries || 0 })),
        daily: daily.map(r => ({ day: r.day, views: r.views, entries: r.entries || 0 })),
    };
}

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (!env.STATS_KEY) return json({ error: 'STATS_KEY not configured' }, 503);
    if (!timingSafeEqual(request.headers.get('X-Stats-Key') || '', env.STATS_KEY)) return json({ error: 'unauthorized' }, 401);

    const days = windowDays(new URL(request.url).searchParams.get('days'));
    const now = Date.now();
    const since = now - days * DAY_MS;
    try {
        const db = env.USER_DB;
        const results = await db.batch(Object.values(QUERIES).map(sql => db.prepare(sql).bind(since)));
        return json(shape(days, since, now, results));
    } catch {
        return json({ error: 'stats unavailable' }, 502);
    }
}

function timingSafeEqual(a, b) {
    const bufA = new TextEncoder().encode(a);
    const bufB = new TextEncoder().encode(b);
    const len = Math.max(bufA.length, bufB.length, 1);
    let diff = bufA.length ^ bufB.length;
    for (let i = 0; i < len; i++) diff |= (bufA[i] || 0) ^ (bufB[i] || 0);
    return diff === 0;
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/statsRoute.test.js`
Expected: all PASS.

- [ ] **Step 5: Run each query against the real table, read-only**

The unit tests use a fake database, so they do not prove the SQL runs on D1. From the repo root, for each of the five strings in `QUERIES`, replace `?` with `(strftime('%s','now') - 14*86400) * 1000` and run:

```bash
npx wrangler d1 execute sportstrata-users --remote --json --command "<the query>"
```

Expected: `"success": true` and rows for each, with `bySport` totals in the low hundreds per sport over 14 days. These are reads; do not run anything else against production. If wrangler auth fails, say so in the PR body and do not look for another credential.

- [ ] **Step 6: Document it**

In `CLAUDE.md`, add a Key Files row directly under the `functions/api/track.js` row:

```
| `functions/api/stats.js` | `GET /api/stats?days=N` (default 14, max 90) with header `X-Stats-Key`: read-only aggregates over `page_views` (views and new sessions by sport, entries by channel, top 25 entry paths, per-story views and entries, daily totals). For the scheduled desk and audit runs, which cannot reach D1. Fails closed (503) until the owner sets `STATS_KEY`. Aggregates only: it never returns a row and never writes. Tests: `tests/statsRoute.test.js` |
```

In the Deployment section's "First-party page-view log" bullet, append: "Agents read it through `GET /api/stats` (key-gated); the audit tools block the beacon (`tools/audit/no-track.cjs`), so their browser visits are not counted. Rows before this change include those visits."

In `DECISIONS.md`, add an entry under the next free D-number (re-check `origin/main` and open PRs), status `accepted`, titled "Agent numbers layer: TikTok channel, audit tools out of the visit log, key-gated stats route", pointing at the spec and recording the owner's 2026-11-15 decisions: four-agent roster approved, raw counts stay out of the public brief issue, share queue to go manual in a later PR.

- [ ] **Step 7: Run the full check**

```bash
node --test tests/*.test.js
node tools/check-manifest.cjs
node tools/check-themes.cjs --strict
node tools/stories/build-index.cjs --check
```

Expected: all pass. `tests/publicSurface.test.js` must pass unchanged, since no top-level entry was added.

- [ ] **Step 8: Commit**

```bash
git add functions/api/stats.js tests/statsRoute.test.js CLAUDE.md DECISIONS.md
git commit -m "feat(analytics): key-gated /api/stats for the scheduled runs"
```

---

## After the PR merges (owner steps, not agent steps)

1. In Cloudflare Pages → Settings → Environment variables, add `STATS_KEY` as a Secret (any long random string), then redeploy.
2. Set the TikTok profile's website link to `https://sportstrata.cc/?utm_source=tiktok`.
3. Check: `curl -s -H "X-Stats-Key: <key>" "https://sportstrata.cc/api/stats?days=1"` returns JSON with the five lists; the same call without the header returns 401.

The key is added to the desk and audit routines' environments when those run books are written (spec Parts 2 and 4).
