# Upstream Contract Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nightly GitHub Action that checks SportStrata's production `/api/*` proxies against hand-written contracts (required fields + count invariants) and files one self-closing GitHub issue per broken route.

**Architecture:** A zero-dependency Node library (`tools/contract-lib.cjs`: path engine, invariants, probe readers) feeds a runner (`tools/contract-check.cjs`: probe-date discovery, per-route checks, report, exit code), driven by per-sport contract files (`tools/contracts/*.cjs`). A second script (`tools/contract-issues.cjs`) turns the JSON report into GitHub issue create/comment/close actions via the `gh` CLI. A workflow runs both daily.

**Tech Stack:** Node 20 (built-in `fetch`, `node:test`), CommonJS `.cjs`, GitHub Actions, `gh` CLI. No npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-28-contract-monitor-design.md`

## Global Constraints

- Zero npm dependencies. Node built-ins only (`node:test`, `node:assert/strict`, `node:child_process`, `node:fs`, `node:path`, global `fetch`).
- CommonJS `.cjs` files, matching `tools/join-health.cjs` / `tools/check-manifest.cjs`.
- Exit codes: `0` pass, `1` warn, `2` fail (including malformed contracts).
- Runs against production `https://sportstrata.cc`, never localhost.
- Requests are sequential (no `Promise.all` across routes); budget stays under the 120 req/min/IP `/api/*` limit.
- House code style (CLAUDE.md "Code Style Rules" #8): no comments except where the WHY is non-obvious.
- Workflow permissions exactly `contents: read`, `issues: write`.
- Issue titles are exactly `contract-drift: <id>`; label is exactly `contract-drift`.
- Never push to `main` without the owner's explicit go-ahead — `main` auto-deploys the site. Work on branch `spec/contract-monitor` (already exists, holds the spec commit).

## Verified live facts this plan relies on (2026-09-28, production)

- `/api/nfl` forwards every query param (`functions/api/nfl.js:57`), so `path=/scoreboard&dates=YYYYMMDD` works: `dates=20260927` → 14 events, all `post`. A disallowed path returns HTTP 400 with `application/json`.
- Dated ESPN scoreboards have **no top-level `season`**; the season is on each event: `events[0].season = {year:2026, type:2, slug:'regular-season'}` (`type` 2 = regular season).
- `/api/ncaaf?path=/scoreboard&groups=80&dates=20260926` → 65 events (Saturday).
- `/api/nfl?path=/summary&event=401872953` keys include `header, boxscore, leaders, drives, winprobability`; `header.competitions[0]` has `competitors` (2, each with `team, score, homeAway`) and `status`; `boxscore.teams` = 2, each `statistics[]` of `{name, displayValue, value, label}`; `boxscore.players[].statistics[]` has `athletes`; `drives.previous` = 22; `leaders[]` has `team, leaders`; `winprobability[]` has `homeWinPercentage`.
- `/api/ncaaf?path=/summary` has the same top-level keys minus `injuries`; `boxscore.teams` = 2.
- `/api/nflstandings?season=2026` is a tree `children[].children[].standings.entries[]`; recursive count of `entries` = **32**, each entry `{team:{abbreviation,...}, stats}`.
- `/api/ncaafstandings?season=2026` is a mixed-depth tree (some conferences have divisions); recursive `entries` count = **138**.
- `/api/nflstats` → `{season, categories[9]}`, each `{key,label,unit,leaders[5]}`, leader `{id,name,pos,team,headshot,value}`.
- `/api/ncaafstats?season=2026` → `categories[10]`; leader counts `5,5,5,5,5,5,5,5,5,1` — so the rule is "non-empty", not "exactly 5".
- `/api/sleeper?path=/v1/players/nfl` → object keyed by player id, 12,229 players, 9,422 `active`. `/api/sleeper?path=/v1/players/nfl/trending/add` → array of 25 `{player_id, count}`.
- `/api/mlb?url=<encoded statsapi URL>`: schedule for 2026-09-26 → `dates[0].games` = 13, game has `gamePk, gameDate, gameType:'R', season:'2026', status.abstractGameState:'Final', teams.home.team.abbreviation, teams.home.score (number), linescore`. Standings (`leagueId=103,104&standingsTypes=regularSeason`) → `records[6].teamRecords[]`, total **30**, each with `team.id, wins, losses, leagueRecord.pct`.
- Existing test runner lists have drifted: `.github/workflows/ci.yml:69` omits `tests/teamColors.test.js`; `.claude/commands/deploy-check.md:65` omits `tests/scorebug.test.js` and `tests/entitlement.test.js`. This plan appends the new test to both lists but does **not** fix that pre-existing drift (flag it to the owner in the final report).

## File Structure

| File | Responsibility |
|---|---|
| `tools/contract-lib.cjs` (create) | Pure library: path syntax + resolver, invariant factories, ESPN/MLB probe readers, `ContractError` |
| `tools/contract-check.cjs` (create) | Runner + CLI: date helper, `fetchJson`, `resolveProbe`, `runContract`, `runSport`, `exitCodeFor`, report printing, `--json` output |
| `tools/contracts/nfl.cjs` (create) | NFL + Sleeper sport definition (6 contracts) |
| `tools/contracts/ncaaf.cjs` (create) | NCAAF sport definition (4 contracts) |
| `tools/contracts/mlb.cjs` (create) | MLB sport definition (2 contracts) |
| `tools/contract-issues.cjs` (create) | Pure `planIssueActions` + `gh`-backed executor for create/comment/close |
| `tests/contractCheck.test.js` (create) | `node:test` suite for all pure parts |
| `.github/workflows/contract-check.yml` (create) | Nightly + manual workflow |
| `.github/workflows/ci.yml:69` (modify) | Append new test file |
| `.claude/commands/deploy-check.md:65` (modify) | Append new test file |
| `CLAUDE.md` (modify) | Deployment section + test list (doc-sync rule) |

### Sport definition shape (used by Tasks 3-5)

```js
{
  sport: 'nfl',                 // report + issue id prefix
  gameDay: 0,                   // UTC day-of-week of the main slate (0=Sun, 6=Sat) or null
  probe: {
    route: date => '/api/...',  // date = { iso:'2026-09-27', yyyymmdd:'20260927', dow:0 }
    read: json => ({ finalIds: [...], season: 2026|undefined, regularSeason: bool }),
  },
  contracts: [{
    id: 'nfl-scoreboard',
    needs: 'probe' | 'final' | undefined,  // skipped in offseason when set
    mirrors: 'js/nfl.js fetchNFLScoreboard',
    route: ctx => '/api/...',   // ctx = { iso, yyyymmdd, dow, season, finalId, fullSlate, offseason }
    paths: ['events[].id', ...],
    invariants: [minCount('events', 8, { fullSlateOnly: true }), ...],
  }],
}
```

### Result shape (used by Tasks 3, 5)

```js
{ id: 'nfl-scoreboard', url: '/api/...' | null, status: 'pass'|'warn'|'fail'|'skip',
  failures: [string], warnings: [string], notes: [string] }
```

Report (written by `--json`): `{ generatedAt: ISOString, base: string, exitCode: 0|1|2, sports: [{ sport, probe: string, results: [Result] }] }`. Every sport's `results[0]` is its probe result with id `<sport>-probe`.

---

### Task 1: Path engine

**Files:**
- Create: `tools/contract-lib.cjs`
- Test: `tests/contractCheck.test.js`

**Interfaces:**
- Produces: `ContractError` (class), `parsePath(path) → Token[]` (throws `ContractError`), `collect(root, path) → [{loc, value}]`, `checkPath(root, path) → string[]` (missing locations; empty = pass), `getAt(root, path) → any` (no `[]` allowed; throws `ContractError`), `deepCollect(root, key) → any[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/contractCheck.test.js`:

```js
// ============================================================
// Upstream contract monitor (tools/contract-*.cjs).
// Run: node --test tests/contractCheck.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../tools/contract-lib.cjs');

test('parsePath accepts keys, fixed indexes and [] steps', () => {
    assert.deepEqual(lib.parsePath('events[].competitions[0].id'), [
        { key: 'events' }, { each: true }, { key: 'competitions' }, { index: 0 }, { key: 'id' },
    ]);
});

test('parsePath rejects malformed paths with ContractError', () => {
    for (const bad of ['', 'a..b', 'a[x]', '.a', 'a.', '[0]', 'a[0', 5]) {
        assert.throws(() => lib.parsePath(bad), lib.ContractError, String(bad));
    }
});

test('checkPath passes when every element has the value', () => {
    const data = { events: [{ status: { state: 'post' } }, { status: { state: 'in' } }] };
    assert.deepEqual(lib.checkPath(data, 'events[].status.state'), []);
});

test('checkPath reports each missing location', () => {
    const data = { events: [{ status: { state: 'post' } }, { status: {} }, {}] };
    assert.deepEqual(lib.checkPath(data, 'events[].status.state'), [
        'events[1].status.state', 'events[2].status',
    ]);
});

test('checkPath treats null as missing but 0, false and "" as present', () => {
    assert.deepEqual(lib.checkPath({ a: 0, b: false, c: '' }, 'a'), []);
    assert.deepEqual(lib.checkPath({ a: 0, b: false, c: '' }, 'b'), []);
    assert.deepEqual(lib.checkPath({ a: 0, b: false, c: '' }, 'c'), []);
    assert.deepEqual(lib.checkPath({ a: null }, 'a'), ['a']);
});

test('checkPath passes vacuously on an empty [] step', () => {
    assert.deepEqual(lib.checkPath({ events: [] }, 'events[].id'), []);
});

test('checkPath flags a non-array at a [] step', () => {
    assert.deepEqual(lib.checkPath({ events: {} }, 'events[].id'), ['events (not an array)']);
});

test('checkPath follows fixed indexes and reports a missing index', () => {
    assert.deepEqual(lib.checkPath({ c: [{ id: 1 }] }, 'c[0].id'), []);
    assert.deepEqual(lib.checkPath({ c: [] }, 'c[0].id'), ['c[0]']);
});

test('getAt resolves keys and indexes, rejects []', () => {
    assert.equal(lib.getAt({ d: [{ g: [1, 2] }] }, 'd[0].g').length, 2);
    assert.equal(lib.getAt({}, 'd[0].g'), undefined);
    assert.throws(() => lib.getAt({}, 'd[].g'), lib.ContractError);
});

test('deepCollect gathers every array under a key at any depth', () => {
    const tree = { children: [
        { standings: { entries: [1, 2] } },
        { children: [{ standings: { entries: [3] } }, { standings: { entries: [4, 5] } }] },
    ] };
    assert.deepEqual(lib.deepCollect(tree, 'entries'), [1, 2, 3, 4, 5]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/contractCheck.test.js`
Expected: FAIL — `Cannot find module '../tools/contract-lib.cjs'`

- [ ] **Step 3: Implement the path engine**

Create `tools/contract-lib.cjs`:

```js
#!/usr/bin/env node
// ============================================================
// SportStrata — upstream contract library (zero deps).
// Path engine + invariants + probe readers for tools/contract-check.cjs.
// Spec: docs/superpowers/specs/2026-09-28-contract-monitor-design.md
// ============================================================
'use strict';

class ContractError extends Error {}

const SEG = /^([A-Za-z_$][\w$]*)(?:\[(\d*)\])?$/;

function parsePath(path) {
    if (typeof path !== 'string' || path === '') throw new ContractError(`bad path syntax: ${String(path)}`);
    const tokens = [];
    for (const seg of path.split('.')) {
        const m = seg.match(SEG);
        if (!m) throw new ContractError(`bad path syntax: ${path}`);
        tokens.push({ key: m[1] });
        if (m[2] !== undefined) tokens.push(m[2] === '' ? { each: true } : { index: Number(m[2]) });
    }
    return tokens;
}

function collect(root, path) {
    const tokens = parsePath(path);
    const out = [];
    const walk = (node, i, loc) => {
        if (i === tokens.length || node === undefined || node === null) {
            out.push({ loc, value: i === tokens.length ? node : undefined });
            return;
        }
        const t = tokens[i];
        if (t.each) {
            if (!Array.isArray(node)) { out.push({ loc: `${loc} (not an array)`, value: undefined }); return; }
            node.forEach((el, n) => walk(el, i + 1, `${loc}[${n}]`));
        } else if ('index' in t) {
            walk(Array.isArray(node) ? node[t.index] : undefined, i + 1, `${loc}[${t.index}]`);
        } else {
            walk(node[t.key], i + 1, loc ? `${loc}.${t.key}` : t.key);
        }
    };
    walk(root, 0, '');
    return out;
}

function checkPath(root, path) {
    return collect(root, path)
        .filter(r => r.value === undefined || r.value === null)
        .map(r => r.loc || '(root)');
}

function getAt(root, path) {
    let node = root;
    for (const t of parsePath(path)) {
        if (t.each) throw new ContractError(`[] not allowed here: ${path}`);
        if (node === undefined || node === null) return undefined;
        node = 'index' in t ? node[t.index] : node[t.key];
    }
    return node;
}

function deepCollect(root, key, acc = []) {
    if (Array.isArray(root)) root.forEach(x => deepCollect(x, key, acc));
    else if (root && typeof root === 'object') {
        for (const [k, v] of Object.entries(root)) {
            if (k === key && Array.isArray(v)) acc.push(...v);
            else deepCollect(v, key, acc);
        }
    }
    return acc;
}

module.exports = { ContractError, parsePath, collect, checkPath, getAt, deepCollect };
```

How the reported location works: when a step's value is missing, `walk` has already appended that step to `loc`, so the report names the *first* missing step (`events[2].status`), not the full requested path — the most useful thing to show.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/contractCheck.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/contract-lib.cjs tests/contractCheck.test.js
git commit -m "Contract monitor: path engine (parse, collect, checkPath, getAt, deepCollect)"
```

---

### Task 2: Invariants and probe readers

**Files:**
- Modify: `tools/contract-lib.cjs` (add functions, extend `module.exports`)
- Test: `tests/contractCheck.test.js` (append)

**Interfaces:**
- Consumes: `parsePath`, `collect`, `checkPath`, `getAt`, `deepCollect`, `ContractError` from Task 1.
- Produces: invariant factories, each returning `{ name: string, severity: 'fail'|'warn', check(data, ctx) → string|null }` (null = pass):
  - `minCount(path, n, { fullSlateOnly?, severity? })` — `path` must not contain `[]`; floor drops to 1 when `fullSlateOnly && !ctx.fullSlate`.
  - `exactCount(path, n, { severity? })`
  - `deepCount(key, n, { exact?, each?, severity? })` — counts `deepCollect(data, key)`; `each` is a path checked on every collected element.
  - `numeric(path, { severity? })` — every value at `path` (which may use `[]`) is a finite number or numeric string.
  - `eachNonEmpty(path, { severity? })` — every value at `path` is a non-empty array.
  - `predicate(name, fn, { severity? })` — `fn(data, ctx) → string|null`.
  - Readers: `readEspnScoreboard(json)` and `readMlbSchedule(json)`, both `→ { finalIds: array, season: number|undefined, regularSeason: boolean }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/contractCheck.test.js`:

```js
test('minCount enforces the floor only on a full slate when fullSlateOnly', () => {
    const inv = lib.minCount('events', 8, { fullSlateOnly: true });
    const three = { events: [1, 2, 3] };
    assert.match(inv.check(three, { fullSlate: true }), /has 3, expected >= 8/);
    assert.equal(inv.check(three, { fullSlate: false }), null);
    assert.match(inv.check({ events: [] }, { fullSlate: false }), /has 0, expected >= 1/);
    assert.match(inv.check({}, {}), /not an array/);
    assert.equal(inv.severity, 'fail');
});

test('minCount rejects [] paths at definition time', () => {
    assert.throws(() => lib.minCount('events[].id', 1), lib.ContractError);
});

test('exactCount', () => {
    const inv = lib.exactCount('boxscore.teams', 2);
    assert.equal(inv.check({ boxscore: { teams: [1, 2] } }, {}), null);
    assert.match(inv.check({ boxscore: { teams: [1] } }, {}), /has 1, expected exactly 2/);
});

test('deepCount min, exact, and per-element path', () => {
    const tree = { children: [{ standings: { entries: [{ team: { abbreviation: 'BUF' } }, { team: {} }] } }] };
    assert.equal(lib.deepCount('entries', 2).check(tree, {}), null);
    assert.match(lib.deepCount('entries', 3).check(tree, {}), /found 2 "entries", expected >= 3/);
    assert.match(lib.deepCount('entries', 1, { exact: true }).check(tree, {}), /expected exactly 1/);
    assert.match(lib.deepCount('entries', 2, { each: 'team.abbreviation' }).check(tree, {}),
        /1 of 2 "entries" missing team.abbreviation/);
});

test('numeric accepts numbers and numeric strings, rejects the rest', () => {
    const inv = lib.numeric('c[].score');
    assert.equal(inv.check({ c: [{ score: 3 }, { score: '14' }, { score: 0 }] }, {}), null);
    assert.match(inv.check({ c: [{ score: 'N/A' }, { score: '' }] }, {}), /2 non-numeric/);
});

test('eachNonEmpty', () => {
    const inv = lib.eachNonEmpty('categories[].leaders');
    assert.equal(inv.check({ categories: [{ leaders: [1] }, { leaders: [1, 2] }] }, {}), null);
    assert.match(inv.check({ categories: [{ leaders: [] }, {}] }, {}), /2 empty or missing/);
});

test('predicate wraps a custom check and carries severity', () => {
    const inv = lib.predicate('is array', d => (Array.isArray(d) ? null : 'not an array'), { severity: 'warn' });
    assert.equal(inv.check([], {}), null);
    assert.equal(inv.check({}, {}), 'not an array');
    assert.equal(inv.severity, 'warn');
    assert.equal(inv.name, 'is array');
});

test('readEspnScoreboard reads finals and season from events', () => {
    const json = { events: [
        { id: '1', season: { year: 2026, type: 2 }, status: { type: { state: 'post' } } },
        { id: '2', season: { year: 2026, type: 2 }, status: { type: { state: 'pre' } } },
    ] };
    assert.deepEqual(lib.readEspnScoreboard(json), { finalIds: ['1'], season: 2026, regularSeason: true });
    assert.deepEqual(lib.readEspnScoreboard({}), { finalIds: [], season: undefined, regularSeason: false });
});

test('readMlbSchedule reads finals, season and regular-season flag', () => {
    const json = { dates: [{ games: [
        { gamePk: 9, season: '2026', gameType: 'R', status: { abstractGameState: 'Final' } },
        { gamePk: 8, season: '2026', gameType: 'R', status: { abstractGameState: 'Preview' } },
    ] }] };
    assert.deepEqual(lib.readMlbSchedule(json), { finalIds: [9], season: 2026, regularSeason: true });
    const post = { dates: [{ games: [{ gamePk: 1, season: '2026', gameType: 'F', status: { abstractGameState: 'Final' } }] }] };
    assert.equal(lib.readMlbSchedule(post).regularSeason, false);
    assert.deepEqual(lib.readMlbSchedule({ dates: [] }), { finalIds: [], season: undefined, regularSeason: false });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/contractCheck.test.js`
Expected: FAIL — `lib.minCount is not a function` (and similar for the others); Task 1's 10 tests still pass.

- [ ] **Step 3: Implement invariants and readers**

In `tools/contract-lib.cjs`, insert before `module.exports`:

```js
function assertNoEach(path) {
    if (parsePath(path).some(t => t.each)) throw new ContractError(`[] not allowed in count path: ${path}`);
}

function minCount(path, n, opts = {}) {
    assertNoEach(path);
    return {
        name: `minCount(${path}, ${n})`,
        severity: opts.severity || 'fail',
        check(data, ctx) {
            const arr = getAt(data, path);
            if (!Array.isArray(arr)) return `${path} is not an array`;
            const floor = opts.fullSlateOnly && !ctx.fullSlate ? 1 : n;
            return arr.length >= floor ? null : `${path} has ${arr.length}, expected >= ${floor}`;
        },
    };
}

function exactCount(path, n, opts = {}) {
    assertNoEach(path);
    return {
        name: `exactCount(${path}, ${n})`,
        severity: opts.severity || 'fail',
        check(data) {
            const arr = getAt(data, path);
            if (!Array.isArray(arr)) return `${path} is not an array`;
            return arr.length === n ? null : `${path} has ${arr.length}, expected exactly ${n}`;
        },
    };
}

function deepCount(key, n, opts = {}) {
    if (opts.each) parsePath(opts.each);
    return {
        name: `deepCount(${key}, ${opts.exact ? '=' : '>='}${n})`,
        severity: opts.severity || 'fail',
        check(data) {
            const items = deepCollect(data, key);
            if (opts.exact ? items.length !== n : items.length < n) {
                return `found ${items.length} "${key}", expected ${opts.exact ? 'exactly' : '>='} ${n}`;
            }
            if (opts.each) {
                const bad = items.filter(it => checkPath(it, opts.each).length).length;
                if (bad) return `${bad} of ${items.length} "${key}" missing ${opts.each}`;
            }
            return null;
        },
    };
}

function numeric(path, opts = {}) {
    parsePath(path);
    return {
        name: `numeric(${path})`,
        severity: opts.severity || 'fail',
        check(data) {
            const bad = collect(data, path).filter(({ value }) =>
                value === undefined || value === null || value === '' || !Number.isFinite(Number(value)));
            return bad.length ? `${bad.length} non-numeric value(s), e.g. ${bad[0].loc}` : null;
        },
    };
}

function eachNonEmpty(path, opts = {}) {
    parsePath(path);
    return {
        name: `eachNonEmpty(${path})`,
        severity: opts.severity || 'fail',
        check(data) {
            const bad = collect(data, path).filter(({ value }) => !Array.isArray(value) || value.length === 0);
            return bad.length ? `${bad.length} empty or missing, e.g. ${bad[0].loc}` : null;
        },
    };
}

function predicate(name, fn, opts = {}) {
    return { name, severity: opts.severity || 'fail', check: (data, ctx) => fn(data, ctx) };
}

function readEspnScoreboard(json) {
    const events = Array.isArray(json?.events) ? json.events : [];
    const season = events[0]?.season;
    return {
        finalIds: events.filter(e => e?.status?.type?.state === 'post').map(e => e.id),
        season: season?.year,
        regularSeason: season?.type === 2,
    };
}

function readMlbSchedule(json) {
    const games = json?.dates?.[0]?.games || [];
    return {
        finalIds: games.filter(g => g?.status?.abstractGameState === 'Final').map(g => g.gamePk),
        season: games[0] ? Number(games[0].season) : undefined,
        regularSeason: games.length > 0 && games.every(g => g.gameType === 'R'),
    };
}
```

Replace the `module.exports` line with:

```js
module.exports = {
    ContractError, parsePath, collect, checkPath, getAt, deepCollect,
    minCount, exactCount, deepCount, numeric, eachNonEmpty, predicate,
    readEspnScoreboard, readMlbSchedule,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/contractCheck.test.js`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/contract-lib.cjs tests/contractCheck.test.js
git commit -m "Contract monitor: invariants (min/exact/deep count, numeric, non-empty) + probe readers"
```

---

### Task 3: Runner and CLI

**Files:**
- Create: `tools/contract-check.cjs`
- Test: `tests/contractCheck.test.js` (append)

**Interfaces:**
- Consumes: everything exported by `tools/contract-lib.cjs` (Tasks 1-2); sport definition shape and result shape from the File Structure section.
- Produces (exported for tests; CLI runs only when `require.main === module`):
  - `dateBack(today: Date, n: number) → { iso, yyyymmdd, dow }`
  - `fetchJsonFrom(base: string) → async (path) → { ok, status, contentType, json|null, bodySnippet }`
  - `resolveProbe(sport, fetchJson, today) → { date, finalIds, season, regularSeason, isGameDay } | { offseason: true } | { unreachable: true }`
  - `runContract(contract, ctx, fetchJson) → Result`
  - `runSport(sport, fetchJson, today) → { sport, probe: string, results: Result[] }`
  - `validateSports(sports)` (throws `ContractError`)
  - `exitCodeFor(sportReports) → 0|1|2`
  - CLI: `node tools/contract-check.cjs <base-url> [--json <file>]`

- [ ] **Step 1: Write the failing tests**

Append to `tests/contractCheck.test.js`:

```js
const check = require('../tools/contract-check.cjs');

const stubFetch = map => async path => {
    const hit = map[path];
    if (hit === undefined) return { ok: false, status: 404, contentType: 'application/json', json: null, bodySnippet: 'not stubbed' };
    if (typeof hit === 'string') return { ok: true, status: 200, contentType: 'text/html', json: null, bodySnippet: hit.slice(0, 200) };
    return { ok: true, status: 200, contentType: 'application/json', json: hit, bodySnippet: '' };
};
const sb = (ids, state = 'post', type = 2) => ({
    events: ids.map(id => ({ id, season: { year: 2026, type }, status: { type: { state } } })),
});
const TUE = new Date('2026-09-29T11:00:00Z');
const nflLike = extra => ({
    sport: 'nfl',
    gameDay: 0,
    probe: { route: d => `/sb?d=${d.yyyymmdd}`, read: lib.readEspnScoreboard },
    contracts: [],
    ...extra,
});
const allDates = value => {
    const all = {};
    for (let n = 1; n <= 10; n++) all[`/sb?d=${check.dateBack(TUE, n).yyyymmdd}`] = value;
    return all;
};

test('dateBack walks back in UTC and formats both date styles', () => {
    assert.deepEqual(check.dateBack(TUE, 2), { iso: '2026-09-27', yyyymmdd: '20260927', dow: 0 });
    assert.deepEqual(check.dateBack(new Date('2026-03-01T01:00:00Z'), 1), { iso: '2026-02-28', yyyymmdd: '20260228', dow: 6 });
});

test('resolveProbe prefers the most recent game day over a nearer off-day final', async () => {
    const fetchJson = stubFetch({ '/sb?d=20260928': sb(['mnf']), '/sb?d=20260927': sb(['a', 'b']) });
    const p = await check.resolveProbe(nflLike(), fetchJson, TUE);
    assert.equal(p.date.iso, '2026-09-27');
    assert.deepEqual(p.finalIds, ['a', 'b']);
    assert.equal(p.isGameDay, true);
    assert.equal(p.regularSeason, true);
});

test('resolveProbe falls back to the nearest final when no game day has one', async () => {
    const all = allDates(sb([]));
    all['/sb?d=20260928'] = sb(['mnf']);
    const p = await check.resolveProbe(nflLike(), stubFetch(all), TUE);
    assert.equal(p.date.iso, '2026-09-28');
    assert.equal(p.isGameDay, false);
});

test('resolveProbe reports offseason when reachable but no finals in 10 days', async () => {
    assert.deepEqual(await check.resolveProbe(nflLike(), stubFetch(allDates(sb([]))), TUE), { offseason: true });
});

test('resolveProbe reports unreachable when every date is HTML or an error', async () => {
    const all = allDates('<html>blocked</html>');
    assert.deepEqual(await check.resolveProbe(nflLike(), stubFetch(all), TUE), { unreachable: true });
});

test('runContract: pass, missing path, HTML block, HTTP error', async () => {
    const c = { id: 'x', route: () => '/x', paths: ['events[].id'], invariants: [lib.minCount('events', 1)] };
    let r = await check.runContract(c, {}, stubFetch({ '/x': { events: [{ id: 1 }] } }));
    assert.equal(r.status, 'pass');
    r = await check.runContract(c, {}, stubFetch({ '/x': { events: [{}] } }));
    assert.equal(r.status, 'fail');
    assert.match(r.failures[0], /missing events\[\]\.id at 1 location\(s\), e\.g\. events\[0\]\.id/);
    r = await check.runContract(c, {}, stubFetch({ '/x': '<!DOCTYPE html><title>Access Denied</title>' }));
    assert.equal(r.status, 'fail');
    assert.match(r.failures[0], /likely WAF block/);
    r = await check.runContract(c, {}, stubFetch({}));
    assert.match(r.failures[0], /^HTTP 404/);
});

test('runContract: warn-severity and offseason invariant failures become warnings', async () => {
    const c = { id: 'x', route: () => '/x', paths: [], invariants: [
        lib.minCount('events', 5, { severity: 'warn' }),
    ] };
    let r = await check.runContract(c, {}, stubFetch({ '/x': { events: [] } }));
    assert.equal(r.status, 'warn');
    const c2 = { id: 'y', route: () => '/y', paths: [], invariants: [lib.exactCount('teams', 32)] };
    r = await check.runContract(c2, { offseason: true }, stubFetch({ '/y': { teams: [] } }));
    assert.equal(r.status, 'warn');
});

test('runSport: offseason skips probe/final contracts but runs the rest', async () => {
    const all = allDates(sb([]));
    all['/standings?season=2026'] = { teams: [] };
    const sport = nflLike({ contracts: [
        { id: 'nfl-scoreboard', needs: 'probe', route: c => `/sb?d=${c.yyyymmdd}`, paths: [], invariants: [] },
        { id: 'nfl-standings', route: c => `/standings?season=${c.season}`, paths: [], invariants: [lib.exactCount('teams', 32)] },
    ] });
    const out = await check.runSport(sport, stubFetch(all), TUE);
    assert.deepEqual(out.results.map(r => [r.id, r.status]), [
        ['nfl-probe', 'pass'], ['nfl-scoreboard', 'skip'], ['nfl-standings', 'warn'],
    ]);
    assert.match(out.probe, /offseason/);
});

test('runSport: unreachable probe is a single failing result', async () => {
    const out = await check.runSport(nflLike({ contracts: [
        { id: 'nfl-standings', route: () => '/s', paths: [], invariants: [] },
    ] }), stubFetch({}), TUE);
    assert.deepEqual(out.results.map(r => [r.id, r.status]), [['nfl-probe', 'fail']]);
    assert.match(out.results[0].failures[0], /could not establish probe date/);
});

test('runSport: in-season builds ctx with season, finalId and fullSlate', async () => {
    const all = { '/sb?d=20260928': sb([]), '/sb?d=20260927': sb(['g1']), '/sum': {} };
    let seen;
    const sport = nflLike({ contracts: [{ id: 'nfl-summary', needs: 'final',
        route: c => { seen = c; return '/sum'; }, paths: [], invariants: [] }] });
    await check.runSport(sport, stubFetch(all), TUE);
    assert.equal(seen.finalId, 'g1');
    assert.equal(seen.season, 2026);
    assert.equal(seen.fullSlate, true);
    assert.equal(seen.yyyymmdd, '20260927');
});

test('validateSports throws on a malformed contract path', () => {
    assert.throws(() => check.validateSports([nflLike({ contracts: [
        { id: 'bad', route: () => '/', paths: ['a..b'], invariants: [] },
    ] })]), lib.ContractError);
});

test('exitCodeFor: fail beats warn beats pass; skip is neutral', () => {
    const rep = statuses => [{ results: statuses.map(status => ({ status })) }];
    assert.equal(check.exitCodeFor(rep(['pass', 'skip'])), 0);
    assert.equal(check.exitCodeFor(rep(['pass', 'warn'])), 1);
    assert.equal(check.exitCodeFor(rep(['warn', 'fail'])), 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/contractCheck.test.js`
Expected: FAIL — `Cannot find module '../tools/contract-check.cjs'`.

- [ ] **Step 3: Implement the runner**

Create `tools/contract-check.cjs`:

```js
#!/usr/bin/env node
// ============================================================
// SportStrata — upstream contract monitor (zero deps, LIVE).
// Checks production /api/* proxies against tools/contracts/*.cjs:
// required fields the client parsers read, plus count invariants
// that catch silent subsets (the D-135 groups=80 class).
//
//   node tools/contract-check.cjs https://sportstrata.cc [--json report.json]
//
// Exit 0 pass · 1 warn · 2 fail (incl. malformed contracts).
// Spec: docs/superpowers/specs/2026-09-28-contract-monitor-design.md
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ContractError, parsePath, checkPath } = require('./contract-lib.cjs');

const SPORT_FILES = ['nfl', 'ncaaf', 'mlb'];
const WALK_BACK_DAYS = 10;

function dateBack(today, n) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n));
    const iso = d.toISOString().slice(0, 10);
    return { iso, yyyymmdd: iso.replace(/-/g, ''), dow: d.getUTCDay() };
}

function fetchJsonFrom(base) {
    return async p => {
        try {
            const r = await fetch(base + p, { headers: { 'User-Agent': 'SportStrata-ContractCheck/1.0' } });
            const text = await r.text();
            let json = null;
            try { json = JSON.parse(text); } catch { json = null; }
            return { ok: r.ok, status: r.status, contentType: r.headers.get('content-type') || '', json, bodySnippet: text.slice(0, 200) };
        } catch (e) {
            return { ok: false, status: 0, contentType: '', json: null, bodySnippet: String(e && e.message) };
        }
    };
}

async function resolveProbe(sport, fetchJson, today) {
    let reachable = 0;
    let fallback = null;
    for (let n = 1; n <= WALK_BACK_DAYS; n++) {
        const date = dateBack(today, n);
        const res = await fetchJson(sport.probe.route(date));
        if (!res.ok || !res.json) continue;
        reachable++;
        const info = sport.probe.read(res.json);
        if (!info.finalIds.length) continue;
        const isGameDay = sport.gameDay === null || sport.gameDay === undefined || date.dow === sport.gameDay;
        const probe = { date, ...info, isGameDay };
        if (isGameDay) return probe;
        if (!fallback) fallback = probe;
    }
    if (fallback) return fallback;
    return reachable ? { offseason: true } : { unreachable: true };
}

function result(id, url) {
    return { id, url, status: 'pass', failures: [], warnings: [], notes: [] };
}

function settle(r) {
    r.status = r.failures.length ? 'fail' : r.warnings.length ? 'warn' : 'pass';
    return r;
}

async function runContract(c, ctx, fetchJson) {
    const url = c.route(ctx);
    const r = result(c.id, url);
    const res = await fetchJson(url);
    if (!res.ok) {
        r.failures.push(`HTTP ${res.status}: ${res.bodySnippet}`);
        return settle(r);
    }
    if (!res.json) {
        r.failures.push(`upstream returned ${res.contentType || 'non-JSON'} (likely WAF block): ${res.bodySnippet}`);
        return settle(r);
    }
    for (const p of c.paths || []) {
        const miss = checkPath(res.json, p);
        if (miss.length) r.failures.push(`missing ${p} at ${miss.length} location(s), e.g. ${miss.slice(0, 3).join(', ')}`);
    }
    for (const inv of c.invariants || []) {
        const msg = inv.check(res.json, ctx);
        if (!msg) continue;
        (inv.severity === 'warn' || ctx.offseason ? r.warnings : r.failures).push(`${inv.name}: ${msg}`);
    }
    return settle(r);
}

async function runSport(sport, fetchJson, today) {
    const probe = await resolveProbe(sport, fetchJson, today);
    const probeResult = result(`${sport.sport}-probe`, sport.probe.route(dateBack(today, 1)));
    if (probe.unreachable) {
        probeResult.failures.push(`could not establish probe date: scoreboard unreachable or non-JSON on all ${WALK_BACK_DAYS} dates tried`);
        return { sport: sport.sport, probe: 'unreachable', results: [settle(probeResult)] };
    }
    let ctx;
    let label;
    if (probe.offseason) {
        ctx = { offseason: true, fullSlate: false, season: today.getUTCFullYear() };
        label = `offseason (no finals in the last ${WALK_BACK_DAYS} days)`;
        probeResult.notes.push(label);
    } else {
        ctx = {
            ...probe.date,
            season: probe.season ?? today.getUTCFullYear(),
            finalId: probe.finalIds[0],
            fullSlate: probe.isGameDay && probe.regularSeason,
            offseason: false,
        };
        probeResult.url = sport.probe.route(probe.date);
        label = `${probe.date.iso} (${probe.isGameDay ? 'game day' : 'off day'}, ${probe.regularSeason ? 'regular season' : 'non-regular season'}) · ${probe.finalIds.length} final(s)`;
    }
    const results = [probeResult];
    for (const c of sport.contracts) {
        if (ctx.offseason && c.needs) {
            const skip = result(c.id, null);
            skip.status = 'skip';
            skip.notes.push('skipped: offseason');
            results.push(skip);
            continue;
        }
        results.push(await runContract(c, ctx, fetchJson));
    }
    return { sport: sport.sport, probe: label, results };
}

function validateSports(sports) {
    for (const s of sports) {
        for (const c of s.contracts) {
            if (!c.id || typeof c.route !== 'function') throw new ContractError(`contract missing id/route in ${s.sport}`);
            for (const p of c.paths || []) {
                try { parsePath(p); } catch (e) { throw new ContractError(`${c.id}: ${e.message}`); }
            }
        }
    }
}

function exitCodeFor(sportReports) {
    const statuses = sportReports.flatMap(s => s.results.map(r => r.status));
    if (statuses.includes('fail')) return 2;
    if (statuses.includes('warn')) return 1;
    return 0;
}

const ICON = { pass: '✅', warn: '⚠️ ', fail: '❌', skip: '⏭️ ' };

function printReport(sportReports) {
    for (const s of sportReports) {
        console.log(`\n${s.sport.toUpperCase()}  probe: ${s.probe}`);
        for (const r of s.results) {
            console.log(`  ${ICON[r.status]} ${r.id}${r.url ? `  ${r.url}` : ''}`);
            for (const f of r.failures) console.log(`      FAIL ${f}`);
            for (const w of r.warnings) console.log(`      WARN ${w}`);
            for (const n of r.notes) console.log(`      note ${n}`);
        }
    }
}

async function main(argv) {
    const base = argv[0];
    const jsonIdx = argv.indexOf('--json');
    const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
    if (!base || base.startsWith('--')) {
        console.error('usage: node tools/contract-check.cjs <site-base-url> [--json <file>]');
        return 2;
    }
    let sports;
    try {
        sports = SPORT_FILES.map(f => require(path.join(__dirname, 'contracts', `${f}.cjs`)));
        validateSports(sports);
    } catch (e) {
        console.error(`malformed contract: ${e.message}`);
        return 2;
    }
    const fetchJson = fetchJsonFrom(base.replace(/\/$/, ''));
    const today = new Date();
    const reports = [];
    for (const s of sports) reports.push(await runSport(s, fetchJson, today));
    printReport(reports);
    const exitCode = exitCodeFor(reports);
    if (jsonOut) {
        fs.writeFileSync(jsonOut, JSON.stringify({ generatedAt: today.toISOString(), base, exitCode, sports: reports }, null, 2));
    }
    console.log(`\n${['✅ PASS', '⚠️  WARN', '❌ FAIL'][exitCode]}`);
    return exitCode;
}

if (require.main === module) {
    main(process.argv.slice(2)).then(code => process.exit(code), e => {
        console.error('contract check crashed:', e);
        process.exit(2);
    });
}

module.exports = { dateBack, fetchJsonFrom, resolveProbe, runContract, runSport, validateSports, exitCodeFor, main };
```

Why `fetchJsonFrom` parses JSON regardless of `content-type`: the check that matters is "is the body JSON", and a WAF block page is HTML whatever header it claims; the content type is kept only to make the failure message readable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/contractCheck.test.js`
Expected: PASS, 31 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/contract-check.cjs tests/contractCheck.test.js
git commit -m "Contract monitor: runner (probe walk-back, per-route checks, exit codes, --json report)"
```

---

### Task 4: Contract files + first live run

**Files:**
- Create: `tools/contracts/nfl.cjs`, `tools/contracts/ncaaf.cjs`, `tools/contracts/mlb.cjs`
- Test: `tests/contractCheck.test.js` (append one structural test)

**Interfaces:**
- Consumes: invariant factories + readers (Task 2); sport definition shape (File Structure).
- Produces: three sport definitions loaded by `SPORT_FILES` in `tools/contract-check.cjs`.

Every path below was confirmed against live production responses on 2026-09-28 (see "Verified live facts") and corresponds to a property the mirrored client function reads.

- [ ] **Step 1: Write the failing structural test**

Append to `tests/contractCheck.test.js`:

```js
test('shipped contract files load, validate, and use unique ids', () => {
    const sports = ['nfl', 'ncaaf', 'mlb'].map(f => require(`../tools/contracts/${f}.cjs`));
    check.validateSports(sports);
    const ids = sports.flatMap(s => s.contracts.map(c => c.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, 12);
    for (const s of sports) for (const c of s.contracts) assert.ok(c.mirrors, `${c.id} needs a mirrors note`);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/contractCheck.test.js`
Expected: FAIL — `Cannot find module '../tools/contracts/nfl.cjs'`.

- [ ] **Step 3: Create `tools/contracts/nfl.cjs`**

```js
'use strict';
const L = require('../contract-lib.cjs');

const scoreboard = d => `/api/nfl?path=/scoreboard&dates=${d.yyyymmdd}`;

module.exports = {
    sport: 'nfl',
    gameDay: 0,
    probe: { route: scoreboard, read: L.readEspnScoreboard },
    contracts: [
        {
            id: 'nfl-scoreboard',
            needs: 'probe',
            mirrors: 'js/nfl.js fetchNFLScoreboard',
            route: scoreboard,
            paths: [
                'events[].id',
                'events[].date',
                'events[].status.type.state',
                'events[].status.type.shortDetail',
                'events[].competitions[0].competitors[].homeAway',
                'events[].competitions[0].competitors[].team.abbreviation',
                'events[].competitions[0].competitors[].team.displayName',
                'events[].competitions[0].competitors[].score',
                'events[].competitions[0].competitors[].records[].summary',
                'events[].competitions[0].competitors[].linescores[].value',
            ],
            invariants: [
                L.minCount('events', 8, { fullSlateOnly: true }),
                L.numeric('events[].competitions[0].competitors[].score'),
            ],
        },
        {
            id: 'nfl-summary',
            needs: 'final',
            mirrors: 'js/nflLiveGame.js fetchNFLSummary',
            route: c => `/api/nfl?path=/summary&event=${c.finalId}`,
            paths: [
                'header.competitions[0].status.type.state',
                'header.competitions[0].competitors[].homeAway',
                'header.competitions[0].competitors[].team.abbreviation',
                'header.competitions[0].competitors[].score',
                'boxscore.teams[].statistics[].name',
                'boxscore.teams[].statistics[].displayValue',
                'boxscore.players[].statistics[].athletes',
                'leaders[].leaders',
                'drives.previous',
                'winprobability[].homeWinPercentage',
            ],
            invariants: [L.exactCount('boxscore.teams', 2), L.minCount('drives.previous', 1)],
        },
        {
            id: 'nfl-standings',
            mirrors: 'js/nflStandings.js fetchNFLStandings',
            route: c => `/api/nflstandings?season=${c.season}`,
            paths: [],
            invariants: [L.deepCount('entries', 32, { exact: true, each: 'team.abbreviation' })],
        },
        {
            id: 'nfl-leaders',
            mirrors: 'js/nfl.js /api/nflstats leaders loader',
            route: () => '/api/nflstats',
            paths: ['categories[].key', 'categories[].leaders[].id', 'categories[].leaders[].name', 'categories[].leaders[].value'],
            invariants: [L.minCount('categories', 5), L.eachNonEmpty('categories[].leaders')],
        },
        {
            id: 'sleeper-players',
            mirrors: 'js/fantasy.js + js/nfl.js /api/sleeper players pool',
            route: () => '/api/sleeper?path=/v1/players/nfl',
            paths: [],
            invariants: [L.predicate('>= 1500 active players with full_name + position', data => {
                if (!data || typeof data !== 'object' || Array.isArray(data)) return 'not an object keyed by player id';
                const active = Object.values(data).filter(p => p && p.active && p.full_name && p.position);
                return active.length >= 1500 ? null : `only ${active.length} active players with full_name + position`;
            })],
        },
        {
            id: 'sleeper-trending',
            mirrors: 'js/nfl.js trending add/drop loader',
            route: () => '/api/sleeper?path=/v1/players/nfl/trending/add',
            paths: [],
            invariants: [L.predicate('non-empty array of {player_id, count}', data => {
                if (!Array.isArray(data) || data.length === 0) return 'empty or not an array';
                const bad = data.filter(x => !x || !x.player_id || typeof x.count !== 'number').length;
                return bad ? `${bad} entries missing player_id/count` : null;
            })],
        },
    ],
};
```

- [ ] **Step 4: Create `tools/contracts/ncaaf.cjs`**

```js
'use strict';
const L = require('../contract-lib.cjs');

const scoreboard = d => `/api/ncaaf?path=/scoreboard&groups=80&dates=${d.yyyymmdd}`;

module.exports = {
    sport: 'ncaaf',
    gameDay: 6,
    probe: { route: scoreboard, read: L.readEspnScoreboard },
    contracts: [
        {
            id: 'ncaaf-scoreboard',
            needs: 'probe',
            mirrors: 'js/ncaaf.js fetchNCAAFScoreboard (groups=80, D-135)',
            route: scoreboard,
            paths: [
                'events[].id',
                'events[].date',
                'events[].status.type.state',
                'events[].status.type.shortDetail',
                'events[].competitions[0].competitors[].homeAway',
                'events[].competitions[0].competitors[].team.abbreviation',
                'events[].competitions[0].competitors[].team.displayName',
                'events[].competitions[0].competitors[].score',
            ],
            invariants: [
                L.minCount('events', 50, { fullSlateOnly: true }),
                L.numeric('events[].competitions[0].competitors[].score'),
            ],
        },
        {
            id: 'ncaaf-summary',
            needs: 'final',
            mirrors: 'js/ncaafLiveGame.js fetchNCAAFSummary',
            route: c => `/api/ncaaf?path=/summary&event=${c.finalId}`,
            paths: [
                'header.competitions[0].status.type.state',
                'header.competitions[0].competitors[].team.abbreviation',
                'header.competitions[0].competitors[].score',
                'boxscore.teams[].statistics[].name',
                'boxscore.teams[].statistics[].displayValue',
            ],
            invariants: [L.exactCount('boxscore.teams', 2)],
        },
        {
            id: 'ncaaf-standings',
            mirrors: 'js/ncaaf.js fetchNCAAFStandings',
            route: c => `/api/ncaafstandings?season=${c.season}`,
            paths: [],
            invariants: [L.deepCount('entries', 120, { each: 'team.abbreviation' })],
        },
        {
            id: 'ncaaf-leaders',
            mirrors: 'js/ncaaf.js /api/ncaafstats leaders loader',
            route: c => `/api/ncaafstats?season=${c.season}`,
            paths: ['categories[].key', 'categories[].leaders[].id', 'categories[].leaders[].name', 'categories[].leaders[].value'],
            invariants: [L.minCount('categories', 5), L.eachNonEmpty('categories[].leaders')],
        },
    ],
};
```

- [ ] **Step 5: Create `tools/contracts/mlb.cjs`**

```js
'use strict';
const L = require('../contract-lib.cjs');

const mlbUrl = (endpoint, params) => {
    const u = new URL(`https://statsapi.mlb.com/api/v1${endpoint}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return `/api/mlb?url=${encodeURIComponent(u.toString())}`;
};
const schedule = d => mlbUrl('/schedule', {
    sportId: 1, startDate: d.iso, endDate: d.iso, hydrate: 'team,probablePitcher,linescore',
});

module.exports = {
    sport: 'mlb',
    gameDay: null,
    probe: { route: schedule, read: L.readMlbSchedule },
    contracts: [
        {
            id: 'mlb-schedule',
            needs: 'probe',
            mirrors: 'js/mlb.js fetchMLBSchedule (same hydrate, single day)',
            route: schedule,
            paths: [
                'dates[0].games[].gamePk',
                'dates[0].games[].gameDate',
                'dates[0].games[].status.abstractGameState',
                'dates[0].games[].teams.home.team.abbreviation',
                'dates[0].games[].teams.away.team.abbreviation',
            ],
            invariants: [
                L.minCount('dates[0].games', 8, { fullSlateOnly: true, severity: 'warn' }),
                L.predicate('every Final game has numeric home/away scores', data => {
                    const finals = (data.dates?.[0]?.games || []).filter(g => g.status?.abstractGameState === 'Final');
                    const bad = finals.filter(g => typeof g.teams?.home?.score !== 'number' || typeof g.teams?.away?.score !== 'number');
                    return bad.length ? `${bad.length} Final game(s) without numeric scores, e.g. gamePk ${bad[0].gamePk}` : null;
                }),
            ],
        },
        {
            id: 'mlb-standings',
            mirrors: 'js/mlb.js fetchMLBStandings',
            route: c => mlbUrl('/standings', { leagueId: '103,104', season: c.season, standingsTypes: 'regularSeason' }),
            paths: [
                'records[].teamRecords[].team.id',
                'records[].teamRecords[].wins',
                'records[].teamRecords[].losses',
                'records[].teamRecords[].leagueRecord.pct',
            ],
            invariants: [L.deepCount('teamRecords', 30, { exact: true })],
        },
    ],
};
```

Why the MLB count floor is `severity: 'warn'`: MLB days with few real games (Opening Day, the day after the All-Star break) are legitimate, and `gameType` alone doesn't distinguish them from a truncated response. Scores are checked only on Finals because postponed/suspended games legitimately carry no score.

- [ ] **Step 6: Run the unit tests**

Run: `node --test tests/contractCheck.test.js`
Expected: PASS, 32 tests.

- [ ] **Step 7: First live run against production**

Run (Git Bash, from repo root): `node tools/contract-check.cjs https://sportstrata.cc --json "<scratchpad>/contract-report.json"` — use the session scratchpad directory, not the repo, so the report is never committed.
Expected: exit code `0`. NFL probe resolves to the most recent Sunday (e.g. `2026-09-27 (game day, regular season)`), NCAAF to the most recent Saturday, MLB to yesterday. Every row ✅.
If a row fails: fetch the failing route with `curl` and decide whether the contract is wrong (fix the contract, citing the live response in the commit message) or the site is broken (stop and report to the owner — that is the monitor working). Do **not** loosen an invariant just to get green without recording why in the contract file.

- [ ] **Step 8: Deliberate-failure check**

Temporarily change `'events[].id'` in `tools/contracts/nfl.cjs` to `'events[].idx'`, re-run Step 7's command.
Expected: exit code `2`, `❌ nfl-scoreboard` with `FAIL missing events[].idx at N location(s)` (N = that Sunday's game count). Revert and re-run; expect exit `0`.
Then temporarily change the same path to `'events[]..id'` and re-run. Expected: `malformed contract: nfl-scoreboard: bad path syntax: events[]..id`, exit `2`. Revert.

- [ ] **Step 9: Commit**

```bash
git add tools/contracts tests/contractCheck.test.js
git commit -m "Contract monitor: NFL/NCAAF/MLB contracts (12 routes), live-verified against production"
```

---

### Task 5: GitHub issue sync

**Files:**
- Create: `tools/contract-issues.cjs`
- Test: `tests/contractCheck.test.js` (append)

**Interfaces:**
- Consumes: the `--json` report shape from Task 3.
- Produces:
  - `planIssueActions(report, openIssues: [{number, title}], runUrl: string|null) → [{type:'create', title, body} | {type:'comment', number, body} | {type:'close', number, body}]` (pure)
  - CLI: `node tools/contract-issues.cjs <report.json>` — requires `gh` on PATH with `GH_TOKEN` set.

- [ ] **Step 1: Write the failing tests**

Append to `tests/contractCheck.test.js`:

```js
const issues = require('../tools/contract-issues.cjs');

const report = results => ({
    generatedAt: '2026-09-29T11:00:05.000Z',
    base: 'https://sportstrata.cc',
    exitCode: 2,
    sports: [{ sport: 'nfl', probe: 'x', results }],
});
const R = (id, status, failures = []) => ({ id, url: `/api/${id}`, status, failures, warnings: [], notes: [] });

test('planIssueActions creates an issue for a new failure', () => {
    const acts = issues.planIssueActions(report([R('nfl-scoreboard', 'fail', ['missing events[].id'])]), [], 'https://run/1');
    assert.equal(acts.length, 1);
    assert.equal(acts[0].type, 'create');
    assert.equal(acts[0].title, 'contract-drift: nfl-scoreboard');
    assert.match(acts[0].body, /2026-09-29/);
    assert.match(acts[0].body, /- missing events\[\]\.id/);
    assert.match(acts[0].body, /https:\/\/run\/1/);
});

test('planIssueActions comments on an already-open issue instead of duplicating', () => {
    const acts = issues.planIssueActions(report([R('nfl-scoreboard', 'fail', ['x'])]),
        [{ number: 7, title: 'contract-drift: nfl-scoreboard' }], null);
    assert.deepEqual(acts.map(a => [a.type, a.number]), [['comment', 7]]);
});

test('planIssueActions closes an open issue once the route passes or only warns', () => {
    const open = [{ number: 7, title: 'contract-drift: nfl-scoreboard' }, { number: 8, title: 'contract-drift: nfl-probe' }];
    const acts = issues.planIssueActions(report([R('nfl-probe', 'pass'), R('nfl-scoreboard', 'warn')]), open, null);
    assert.deepEqual(acts.map(a => [a.type, a.number]), [['close', 8], ['close', 7]]);
    assert.match(acts[0].body, /Passing again as of 2026-09-29/);
});

test('planIssueActions leaves skipped routes and unrelated issues alone', () => {
    const open = [{ number: 9, title: 'contract-drift: nfl-summary' }, { number: 10, title: 'something else' }];
    assert.deepEqual(issues.planIssueActions(report([R('nfl-summary', 'skip')]), open, null), []);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/contractCheck.test.js`
Expected: FAIL — `Cannot find module '../tools/contract-issues.cjs'`.

- [ ] **Step 3: Implement**

Create `tools/contract-issues.cjs`:

```js
#!/usr/bin/env node
// ============================================================
// SportStrata — contract-drift issue sync (zero deps; needs `gh`).
// One open issue per failing route, updated not duplicated, closed
// automatically when the route passes again.
//
//   node tools/contract-issues.cjs contract-report.json
// ============================================================
'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const LABEL = 'contract-drift';
const titleFor = id => `${LABEL}: ${id}`;

function failureBody(r, report, runUrl) {
    return [
        `**${report.generatedAt.slice(0, 10)}** — \`${r.id}\` failed against ${report.base}`,
        '',
        r.url ? `Route: \`${r.url}\`` : null,
        '',
        ...r.failures.map(f => `- ${f}`),
        runUrl ? `\nRun: ${runUrl}` : null,
    ].filter(line => line !== null).join('\n');
}

function planIssueActions(report, openIssues, runUrl) {
    const open = new Map(openIssues.map(i => [i.title, i.number]));
    const actions = [];
    for (const s of report.sports) {
        for (const r of s.results) {
            const title = titleFor(r.id);
            const number = open.get(title);
            if (r.status === 'fail') {
                const body = failureBody(r, report, runUrl);
                actions.push(number ? { type: 'comment', number, body } : { type: 'create', title, body });
            } else if ((r.status === 'pass' || r.status === 'warn') && number) {
                actions.push({ type: 'close', number, body: `Passing again as of ${report.generatedAt.slice(0, 10)}. Closing.` });
            }
        }
    }
    return actions;
}

function gh(args) {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function main(argv) {
    const file = argv[0];
    if (!file) {
        console.error('usage: node tools/contract-issues.cjs <report.json>');
        return 2;
    }
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    gh(['label', 'create', LABEL, '--color', 'B60205', '--description', 'Nightly upstream contract check failure', '--force']);
    const openIssues = JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number,title', '--limit', '100']));
    const runUrl = process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null;
    for (const a of planIssueActions(report, openIssues, runUrl)) {
        if (a.type === 'create') gh(['issue', 'create', '--title', a.title, '--label', LABEL, '--body', a.body]);
        else if (a.type === 'comment') gh(['issue', 'comment', String(a.number), '--body', a.body]);
        else gh(['issue', 'close', String(a.number), '--comment', a.body]);
        console.log(`${a.type} ${a.title || `#${a.number}`}`);
    }
    return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { planIssueActions };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/contractCheck.test.js`
Expected: PASS, 36 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/contract-issues.cjs tests/contractCheck.test.js
git commit -m "Contract monitor: self-closing contract-drift issue sync via gh"
```

---

### Task 6: Workflow, test-list wiring, doc sync

**Files:**
- Create: `.github/workflows/contract-check.yml`
- Modify: `.github/workflows/ci.yml:69`, `.claude/commands/deploy-check.md:65`, `CLAUDE.md` (Deployment section; `**Before any push:**` paragraph, ~line 458)

**Interfaces:**
- Consumes: CLIs from Tasks 3 and 5.
- Produces: nightly workflow; new test file in both unit-test runners.

- [ ] **Step 1: Create the workflow**

`.github/workflows/contract-check.yml`:

```yaml
name: Contract Check

# Nightly check of production /api/* proxies against tools/contracts/*.cjs.
# Spec: docs/superpowers/specs/2026-09-28-contract-monitor-design.md
# 11:00 UTC = after overnight finals settle (last West Coast MLB/NFL games).

on:
  schedule:
    - cron: '0 11 * * *'
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  contracts:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run contract check
        id: check
        run: |
          set +e
          node tools/contract-check.cjs https://sportstrata.cc --json contract-report.json
          echo "code=$?" >> "$GITHUB_OUTPUT"

      - name: Sync contract-drift issues
        if: always() && hashFiles('contract-report.json') != ''
        env:
          GH_TOKEN: ${{ github.token }}
        run: node tools/contract-issues.cjs contract-report.json

      - name: Set job result
        if: always()
        run: |
          code='${{ steps.check.outputs.code }}'
          if [ "$code" = "1" ]; then echo "::warning::Contract warnings — see the 'Run contract check' step log"; fi
          if [ "$code" != "0" ] && [ "$code" != "1" ]; then exit 1; fi
```

- [ ] **Step 2: Add the test file to both runners**

In `.github/workflows/ci.yml:69`, append ` tests/contractCheck.test.js` to the end of the `node --test ...` line.
In `.claude/commands/deploy-check.md:65`, append ` tests/contractCheck.test.js` to the end of the `node --test ...` line.

- [ ] **Step 3: Doc sync in CLAUDE.md**

In the "Deployment" section's `**Before any push:**` paragraph, append ` tests/contractCheck.test.js` inside the backticked `node --test ...` list. Then add this bullet to the Deployment bullet list, directly after the "First-party page-view log (D-149, …)" bullet:

```markdown
- **Upstream contract monitor (2026-09-28)** — `.github/workflows/contract-check.yml` runs `tools/contract-check.cjs https://sportstrata.cc` nightly (11:00 UTC) against hand-written contracts in `tools/contracts/{nfl,ncaaf,mlb}.cjs`: required fields each client parser reads, plus count invariants (e.g. NCAAF Saturday ≥ 50 events — the D-135 `groups=80` class; NFL standings = 32). Season-aware without calendar code: walks back ≤10 days to the most recent completed game day and probes that; no finals → "offseason" (probe-dependent routes skipped, count invariants downgraded to warnings). Failures open/update one `contract-drift: <id>` issue per route via `tools/contract-issues.cjs`, auto-closed on recovery. **When you change a mirrored client fetch (added param, new field read), update its contract in the same commit** — each contract's `mirrors` field names the call site. Live-only fields (`situation`, in-progress drives) are deliberately out of scope. Spec: `docs/superpowers/specs/2026-09-28-contract-monitor-design.md`.
```

- [ ] **Step 4: Verify locally**

Run: `node --test tests/contractCheck.test.js` → PASS, 36 tests.
Run: `node --check tools/contract-lib.cjs && node --check tools/contract-check.cjs && node --check tools/contract-issues.cjs && node --check tools/contracts/nfl.cjs && node --check tools/contracts/ncaaf.cjs && node --check tools/contracts/mlb.cjs` → no output.
Run the full CI unit-test line from `.github/workflows/ci.yml:69` verbatim → all PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/contract-check.yml .github/workflows/ci.yml .claude/commands/deploy-check.md CLAUDE.md
git commit -m "Contract monitor: nightly workflow + test wiring + CLAUDE.md doc sync"
```

- [ ] **Step 6: Hand off for push (owner decision — do not push unprompted)**

`workflow_dispatch` only appears once the workflow file is on the default branch, and pushing to `main` deploys the site (no site-facing files change here, but it is still a deploy). Report to the owner:
1. Branch `spec/contract-monitor` is ready; merging it deploys nothing user-visible.
2. After merge, run the workflow manually once (Actions → Contract Check → Run workflow) and check: job green, zero issues created. Proving the issue path end-to-end in Actions (it will create, then close, one real `contract-drift` issue) is optional and only on the owner's say-so.
3. Pre-existing drift found, not fixed here: `ci.yml` omits `tests/teamColors.test.js`; `deploy-check.md` omits `tests/scorebug.test.js` and `tests/entitlement.test.js`.
