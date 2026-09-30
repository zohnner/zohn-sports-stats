# SportStrata Stories — Publishing Path Implementation Plan (rollout step 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish human-reviewed, number-checked NFL stories as crawlable pages at `/nfl/stories/<slug>` (plus an index), surfaced on the home rail, NFL landing, NFL team pages and NFL News — proven end to end with one hand-written story.

**Architecture:** Stories are committed Markdown files with a facts file beside each. One zero-dependency CommonJS module (`tools/stories/story-core.cjs`) parses, validates, renders and number-checks them; it is shared by the Node CLIs, the unit tests, and the Pages Functions (the Functions bundler imports `.cjs` — verified 2026-09-29 with `wrangler pages functions build`). A committed `index.json` (built by a CLI, verified in CI) feeds every client surface.

**Tech Stack:** Node 20 CommonJS + `node:test`; Cloudflare Pages Functions (ESM, `env.ASSETS`); vanilla JS client; CSS custom properties. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-nfl-stories-design.md` (rollout step 2 of 4; detectors and the scheduled routine are separate plans).

## Global Constraints

- No npm dependencies. Node built-ins only in tools/tests; Functions may import only `tools/stories/story-core.cjs` beyond what they already import.
- No runtime LLM on the site. Stories are static committed files.
- Every numeric token in a story's title, dek, hero_stat, body and social draft must match a value in that story's `.facts.json` (rules in Task 2); spelled-out numbers from "two" up are rejected.
- Story Markdown subset only: paragraphs, `## ` headings, `- ` lists, `**bold**`, `[text](url)` with `url` starting `https://` or a single `/`. Everything else is escaped as text.
- Byline is exactly `SportStrata Data Desk`. Disclosure text is exactly `Written with AI assistance from SportStrata's own data; every number above is listed with its source in this story's data file.` followed by a link to the facts file.
- Story pages set `window.__SS_ROUTE='static-page-nfl'` (D-167).
- House rules (CLAUDE.md): escape all API/content strings with `_escHtml` / `esc`; no inline `onerror`; batch DOM writes via one `innerHTML`; comments only for non-obvious WHY; use `Logger`, never bare `console.log`, in client code; grep `css/` for a selector before adding it (Code Style Rule 9).
- Team codes in story frontmatter are the site's NFL team-URL codes, uppercase (e.g. `DET`, `WSH`), matching `/nfl/team/:abbr`.
- Never push to `main`, never merge.

## Branch setup (before Task 1)

This work lives on branch `spec/nfl-stories` (holds the spec commit 497c4aa and this plan). It depends on PR #3 (`static-page` hint):
- If PR #3 is merged: `git checkout spec/nfl-stories && git rebase origin/main`.
- If not: `git checkout spec/nfl-stories && git rebase fix/static-page-hint`.
Record which in the ledger.

## Verified facts this plan relies on (2026-09-29)

- `functions/nfl/` has no catch-all route; `/nfl/stories` and `/nfl/stories/:slug` are free. `/nfl/*` is already in `_routes.json`.
- A missing static file returns HTTP 404 (repo has `404.html`), not the SPA shell — `env.ASSETS.fetch` → `!r.ok` means "no such story".
- `sw.js` serves every same-origin non-`/api/` GET stale-while-revalidate (`sw.js:151-165`); `/content/` must be network-only like `/api/` or a new story list lags one load.
- No `.ss-prerender` CSS exists anywhere — prerendered pages (glossaries, now visible after D-167) render as browser-default HTML. Task 4 adds the base style.
- `js/news.js:132` labels every non-MLB/NCAAF sport "NFL" (`sport === 'mlb' ? 'MLB' : sport === 'ncaaf' ? 'NCAAF' : 'NFL'`), so NBA/WNBA/NCAAB News pages read "NFL — Latest". Task 5 fixes it via `SPORTS_META[sport].label`.
- OG card URL pattern: `functions/mlb/player/[id]/[[slug]].js:80-85,115-116` (`/api/og?eyebrow=&title=&subtitle=&stat=`; `ogImage`/`twImage` meta regexes).
- CI unit-test line on `main` runs 59 tests. PR #1 also edits that line in `ci.yml` — whichever merges second resolves a one-line conflict. PR #2/#3 each bump `sw.js` `CACHE_NAME`; use the next number above the highest in any open PR or `main` at execution time.

## File Structure

| File | Responsibility |
|---|---|
| `tools/stories/story-core.cjs` (create) | Pure core: `parseStory`, `validateMeta`, `renderBody`, `checkStory`, `indexEntry`, `storyUrl`, `SLUG_RE`, `BYLINE`, `DISCLOSURE`, `StoryError` |
| `tools/stories/check-numbers.cjs` (create) | CLI: check one story against its facts + social files |
| `tools/stories/build-index.cjs` (create) | CLI: validate + number-check every story, write/verify `content/nfl/stories/index.json` |
| `tests/stories.test.js` (create) | `node:test` suite for the three tools above |
| `functions/nfl/stories/[slug].js` (create) | Edge-render one story |
| `functions/nfl/stories/index.js` (create) | Edge-render the stories index |
| `css/components.css` (modify, append) | `.ss-prerender` base + `.ss-story*`, `.ss-stories__list`, `.stories-block*`, `.story-row*` |
| `js/news.js` (modify) | `fetchStoriesIndex`, `storiesBlockHtml`; News page label fix + NFL stories block + wire caption |
| `js/app.js` (modify) | Home rail stories block + "Wire · via ESPN"; NFL landing `#slStories` + `_loadLandingStories` |
| `js/nfl.js` (modify) | Team page `#nflTeamStories` + `_loadNFLTeamStories` |
| `sw.js` (modify) | `/content/` network-only; `CACHE_NAME` bump |
| `_headers` (modify) | `/content/*` short cache + `X-Robots-Tag: noindex` |
| `tools/gen-sitemap.cjs` (modify) | `/nfl/stories` + each story from `index.json` |
| `content/nfl/stories/<date>-<slug>.{md,facts.json,social.md}` + `index.json` (create) | The first real story |
| `.github/workflows/ci.yml`, `.claude/commands/deploy-check.md`, `CLAUDE.md`, `DECISIONS.md` (modify) | CI wiring + doc sync + D-166 |

### Story file format (used by every task)

```
---
title: <headline stating the finding>
dek: <one sentence>
date: 2026-09-30
season: 2026
week: 4
teams: [DET, NYJ]
players: []
hero_stat: <short stat line for the OG card>
---

Body paragraphs in the Markdown subset.
```

Facts file: `{ "facts": [ { "key": "det_rz_td", "value": 9, "label": "DET red-zone TDs, Weeks 1-3", "source": "/api/..." } ] }` — `key` string, `value` finite number, `source` non-empty string.

`index.json`: `{ "stories": [ { "slug", "title", "dek", "date", "season", "week", "teams", "players", "hero_stat", "url" } ] }`, newest date first, ties by slug ascending, written with 2-space indent and a trailing newline.

---

### Task 1: Story core — parse, validate, render

**Files:**
- Create: `tools/stories/story-core.cjs`
- Test: `tests/stories.test.js`

**Interfaces:**
- Produces: `StoryError`; `SLUG_RE`; `BYLINE`; `DISCLOSURE`; `parseStory(text) → { meta, body }` (throws `StoryError`); `validateMeta(meta) → string[]`; `renderBody(md) → string` (HTML); `storyUrl(slug) → '/nfl/stories/<slug>'`; `indexEntry(slug, meta) → object` (index.json row).

- [ ] **Step 1: Write the failing tests** — create `tests/stories.test.js`:

```js
// ============================================================
// SportStrata Stories core + CLIs (tools/stories/*.cjs, D-166).
// Run: node --test tests/stories.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../tools/stories/story-core.cjs');

const STORY = [
    '---',
    'title: Detroit keeps finishing drives',
    'dek: The Lions turn red-zone trips into touchdowns.',
    'date: 2026-09-30',
    'season: 2026',
    'week: 4',
    'teams: [DET, NYJ]',
    'players: []',
    'hero_stat: 9 of 10 red-zone trips',
    '---',
    '',
    'First paragraph.',
    '',
    '## A heading',
    '',
    '- one item',
    '- two item',
].join('\n');

test('parseStory reads frontmatter types and body', () => {
    const { meta, body } = core.parseStory(STORY);
    assert.equal(meta.title, 'Detroit keeps finishing drives');
    assert.equal(meta.season, 2026);
    assert.equal(meta.week, 4);
    assert.deepEqual(meta.teams, ['DET', 'NYJ']);
    assert.deepEqual(meta.players, []);
    assert.equal(meta.hero_stat, '9 of 10 red-zone trips');
    assert.match(body, /^First paragraph\./);
});

test('parseStory accepts CRLF line endings', () => {
    assert.equal(core.parseStory(STORY.replace(/\n/g, '\r\n')).meta.week, 4);
});

test('parseStory rejects missing frontmatter and malformed lines', () => {
    assert.throws(() => core.parseStory('no frontmatter here'), core.StoryError);
    assert.throws(() => core.parseStory('---\nTitle Case: x\n---\nbody'), core.StoryError);
});

test('validateMeta passes a complete story and names each problem', () => {
    assert.deepEqual(core.validateMeta(core.parseStory(STORY).meta), []);
    const probs = core.validateMeta({ title: 'x', date: '9/30/2026', season: '2026', week: 4, teams: 'DET' });
    assert.ok(probs.includes('missing dek'));
    assert.ok(probs.includes('missing hero_stat'));
    assert.ok(probs.includes('date must be YYYY-MM-DD'));
    assert.ok(probs.includes('season must be an integer'));
    assert.ok(probs.includes('teams must be a [list]'));
});

test('renderBody renders the allowed subset', () => {
    assert.equal(core.renderBody('Hello **world**.\n\n## Head\n\n- a\n- b'),
        '<p>Hello <strong>world</strong>.</p><h2>Head</h2><ul><li>a</li><li>b</li></ul>');
});

test('renderBody joins wrapped lines into one paragraph', () => {
    assert.equal(core.renderBody('line one\nline two'), '<p>line one line two</p>');
});

test('renderBody escapes raw HTML', () => {
    assert.equal(core.renderBody('<script>alert(1)</script> & "q"'),
        '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;</p>');
});

test('renderBody keeps safe links and neutralizes unsafe ones', () => {
    assert.equal(core.renderBody('[site](/nfl/team/det) [ext](https://x.com/a?b=1&c=2)'),
        '<p><a href="/nfl/team/det">site</a> <a href="https://x.com/a?b=1&amp;c=2">ext</a></p>');
    assert.equal(core.renderBody('[bad](javascript:alert(1)) [proto](//evil.com) [http](http://x.com)'),
        '<p>bad) proto http</p>');
});

test('slug, url and index-entry helpers', () => {
    assert.ok(core.SLUG_RE.test('2026-09-30-detroit-red-zone'));
    assert.ok(!core.SLUG_RE.test('../etc/passwd'));
    assert.ok(!core.SLUG_RE.test('2026-09-30-Detroit'));
    assert.equal(core.storyUrl('2026-09-30-x'), '/nfl/stories/2026-09-30-x');
    assert.deepEqual(core.indexEntry('2026-09-30-x', core.parseStory(STORY).meta), {
        slug: '2026-09-30-x', title: 'Detroit keeps finishing drives',
        dek: 'The Lions turn red-zone trips into touchdowns.', date: '2026-09-30',
        season: 2026, week: 4, teams: ['DET', 'NYJ'], players: [],
        hero_stat: '9 of 10 red-zone trips', url: '/nfl/stories/2026-09-30-x',
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/stories.test.js`
Expected: FAIL — `Cannot find module '../tools/stories/story-core.cjs'`.

- [ ] **Step 3: Implement** — create `tools/stories/story-core.cjs`:

```js
#!/usr/bin/env node
// ============================================================
// SportStrata Stories core (D-166) — zero deps, CommonJS.
// Shared by tools/stories/*.cjs, tests/stories.test.js and the
// Pages Functions in functions/nfl/stories/ (the Functions bundler
// imports .cjs). Spec: docs/superpowers/specs/2026-09-29-nfl-stories-design.md
// ============================================================
'use strict';

class StoryError extends Error {}

const SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED = ['title', 'dek', 'date', 'season', 'week', 'teams', 'hero_stat'];
const BYLINE = 'SportStrata Data Desk';
const DISCLOSURE = "Written with AI assistance from SportStrata's own data; every number above is listed with its source in this story's data file.";
const SAFE_URL = /^(?:https:\/\/|\/)[^\s<>"']*$/;

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function parseValue(raw) {
    const v = raw.trim();
    if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    if (/^-?\d+$/.test(v)) return Number(v);
    return v;
}

function parseStory(text) {
    const src = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
    if (!m) throw new StoryError('missing frontmatter (file must start with ---)');
    const meta = {};
    for (const line of m[1].split('\n')) {
        if (!line.trim()) continue;
        const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
        if (!kv) throw new StoryError(`bad frontmatter line: ${line}`);
        meta[kv[1]] = parseValue(kv[2]);
    }
    return { meta, body: m[2].trim() };
}

function validateMeta(meta) {
    const problems = [];
    for (const k of REQUIRED) if (meta[k] === undefined || meta[k] === '') problems.push(`missing ${k}`);
    if (meta.date !== undefined && !DATE_RE.test(String(meta.date))) problems.push('date must be YYYY-MM-DD');
    if (meta.season !== undefined && !Number.isInteger(meta.season)) problems.push('season must be an integer');
    if (meta.week !== undefined && !Number.isInteger(meta.week)) problems.push('week must be an integer');
    if (meta.teams !== undefined && !Array.isArray(meta.teams)) problems.push('teams must be a [list]');
    if (meta.players !== undefined && !Array.isArray(meta.players)) problems.push('players must be a [list]');
    return problems;
}

function renderBold(escaped) {
    return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderInline(text) {
    const links = [];
    const withSlots = String(text).replace(/\u0000/g, '').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
        const safe = SAFE_URL.test(url) && !url.startsWith('//');
        links.push(safe ? `<a href="${esc(url)}">${renderBold(esc(label))}</a>` : renderBold(esc(label)));
        return `\u0000${links.length - 1}\u0000`;
    });
    return renderBold(esc(withSlots)).replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

function renderBody(md) {
    return String(md == null ? '' : md).replace(/\r\n/g, '\n').split(/\n{2,}/)
        .map(block => block.trim()).filter(Boolean)
        .map(block => {
            if (block.startsWith('## ')) return `<h2>${renderInline(block.slice(3).trim())}</h2>`;
            const lines = block.split('\n');
            if (lines.every(l => /^- /.test(l))) {
                return `<ul>${lines.map(l => `<li>${renderInline(l.slice(2).trim())}</li>`).join('')}</ul>`;
            }
            return `<p>${renderInline(lines.map(l => l.trim()).join(' '))}</p>`;
        }).join('');
}

function storyUrl(slug) {
    return `/nfl/stories/${slug}`;
}

function indexEntry(slug, meta) {
    return {
        slug, title: meta.title, dek: meta.dek, date: String(meta.date),
        season: meta.season, week: meta.week, teams: meta.teams || [], players: meta.players || [],
        hero_stat: meta.hero_stat, url: storyUrl(slug),
    };
}

module.exports = {
    StoryError, SLUG_RE, BYLINE, DISCLOSURE,
    parseStory, validateMeta, renderBody, storyUrl, indexEntry,
};
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/stories.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/stories/story-core.cjs tests/stories.test.js
git commit -m "Stories: core parser, validator and safe Markdown-subset renderer (D-166)"
```

---

### Task 2: Number checker + `check-numbers` CLI

**Files:**
- Modify: `tools/stories/story-core.cjs` (add checker, extend exports)
- Create: `tools/stories/check-numbers.cjs`
- Test: `tests/stories.test.js` (append)

**Interfaces:**
- Consumes: `parseStory`, `validateMeta`, `StoryError` (Task 1).
- Produces: `checkStory(story, factsDoc, socialText) → [{ where, token, message }]` where `where ∈ 'facts'|'title'|'dek'|'hero_stat'|'body'|'social'`; throws `StoryError` if `factsDoc.facts` is not an array. CLI: `node tools/stories/check-numbers.cjs <path>/<slug>.md` → exit 0 / 2.

Matching rules (implemented and tested below):
- Scanned: `meta.title`, `meta.dek`, `meta.hero_stat`, `body`, `socialText`. Before scanning: Markdown link targets `](...)` removed, bare `http(s)://` URLs removed, and these phrases removed: `1st|2nd|3rd|4th` + ` down`/`-down`/` quarter`/`-quarter`; `1st..4th-and-N`; `Week N` / `Weeks N-M`; ISO dates; `Q1..Q4`; `two-point`, `two-minute`, `four-down`.
- Tokens: integers, `1,234`, decimals, `.905` rates, optional leading `#`, optional `%` / `st|nd|rd|th`. Not inside words (`49ers` is not a token).
- A token matches if some fact value `f` satisfies `|f − v| ≤ 0.5·10^−decimals` (so `6` matches `6.4`; `6.4` does not match `6.5`), or, for `%` tokens, `|100f − v|` within the same tolerance.
- `meta.season` and `meta.week` are allowed as plain integers.
- Spelled-out `two`…`twenty`, tens, `hundred`, `thousand`, `million`, `dozen` are rejected.
- Facts: each needs string `key`, finite numeric `value`, non-empty string `source`.

- [ ] **Step 1: Write the failing tests** — append to `tests/stories.test.js`:

```js
const FACTS = { facts: [
    { key: 'rz_td', value: 9, source: '/api/x' },
    { key: 'rz_trips', value: 10, source: '/api/x' },
    { key: 'rz_rate', value: 0.9048, source: '/api/x' },
    { key: 'rating', value: 6.4, source: 'computeSRS' },
    { key: 'yards', value: 1234, source: '/api/x' },
    { key: 'rank', value: 3, source: '/api/x' },
] };
const draft = (body, meta = {}) => ({ meta: { title: 'T', dek: 'D', hero_stat: 'H', season: 2026, week: 4, ...meta }, body });
const tokensOf = probs => probs.map(p => p.token);

test('checkStory passes when every number is a fact', () => {
    assert.deepEqual(core.checkStory(draft('Detroit scored on 9 of 10 trips, 1,234 yards, #3 overall.'), FACTS, ''), []);
});

test('checkStory matches percents, rates and rounding within the stated precision', () => {
    assert.deepEqual(core.checkStory(draft('That is 90%, or 90.5%, a .905 clip, with a 6.4 rating (about 6).'), FACTS, ''), []);
    assert.deepEqual(tokensOf(core.checkStory(draft('A 7 rating and 91%.'), FACTS, '')), ['7', '91%']);
});

test('checkStory ignores week refs, the season, link targets, football phrases and team names', () => {
    const body = 'In Week 4 of the 2026 season the [49ers](/nfl/team/sf?v=77) faced a 3rd down, then a 4th-and-2, and went for two-point. See https://x.com/12345.';
    assert.deepEqual(core.checkStory(draft(body), FACTS, ''), []);
});

test('checkStory rejects spelled-out numbers', () => {
    assert.deepEqual(tokensOf(core.checkStory(draft('They won three straight and ten of eleven.'), FACTS, '')), ['three', 'ten', 'eleven']);
});

test('checkStory checks title, dek, hero_stat and social too', () => {
    const probs = core.checkStory(draft('ok', { title: 'Up 12 spots', dek: 'A 5-game run', hero_stat: '44 yards' }), FACTS, 'Reddit: 88 points');
    assert.deepEqual(probs.map(p => [p.where, p.token]), [['title', '12'], ['dek', '5'], ['hero_stat', '44'], ['social', '88']]);
});

test('checkStory requires a well-formed facts file with sources', () => {
    assert.throws(() => core.checkStory(draft('x'), { nope: [] }, ''), core.StoryError);
    const probs = core.checkStory(draft('9 trips'), { facts: [{ key: 'a', value: 9 }] }, '');
    assert.deepEqual(probs.map(p => p.where), ['facts']);
});

test('check-numbers CLI exits 0 on a clean story and 2 on an unsourced number', (t) => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const cli = require('../tools/stories/check-numbers.cjs');
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stories-'));
    const md = path.join(dir, '2026-09-30-x.md');
    fs.writeFileSync(md, STORY);
    fs.writeFileSync(path.join(dir, '2026-09-30-x.facts.json'), JSON.stringify(FACTS));
    fs.writeFileSync(path.join(dir, '2026-09-30-x.social.md'), 'Detroit: 9 of 10.');
    assert.equal(cli.main([md]), 0);
    fs.writeFileSync(path.join(dir, '2026-09-30-x.social.md'), 'Detroit: 11 of 12.');
    assert.equal(cli.main([md]), 2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/stories.test.js`
Expected: FAIL — `core.checkStory is not a function`; the 9 Task 1 tests still pass.

- [ ] **Step 3: Implement the checker** — in `tools/stories/story-core.cjs`, insert before `module.exports`:

```js
const ALLOWED_PHRASES = [
    /\b[1-4](?:st|nd|rd|th)[- ](?:down|quarter)\b/gi,
    /\b[1-4](?:st|nd|rd|th)-and-\d+\b/gi,
    /\bweeks? \d+(?:\s?[-–]\s?\d+)?\b/gi,
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\bQ[1-4]\b/g,
    /\b(?:two-point|two-minute|four-down)\b/gi,
];
const SPELLED_RE = /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen)\b/gi;
const NUM_RE = /(?<![\w.])(#)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(%|st|nd|rd|th)?(?!\w)/g;

function scrubText(text) {
    let t = String(text).replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ');
    for (const re of ALLOWED_PHRASES) t = t.replace(re, ' ');
    return t;
}

function factProblems(factsDoc) {
    if (!factsDoc || !Array.isArray(factsDoc.facts)) throw new StoryError('facts file must be {"facts":[...]}');
    const problems = [];
    factsDoc.facts.forEach((f, i) => {
        const ok = f && typeof f.key === 'string' && typeof f.value === 'number' && Number.isFinite(f.value)
            && typeof f.source === 'string' && f.source.trim() !== '';
        if (!ok) problems.push({ where: 'facts', token: String((f && f.key) || `#${i}`), message: `fact ${i} needs key, numeric value and source` });
    });
    return problems;
}

function tokenOf(m) {
    const numStr = m[2].replace(/,/g, '');
    return { raw: m[0], value: Number(numStr), decimals: (numStr.split('.')[1] || '').length, percent: m[3] === '%' };
}

function matchesFact(tok, values) {
    const tol = 0.5 * Math.pow(10, -tok.decimals) + 1e-9;
    return values.some(f => Math.abs(f - tok.value) <= tol || (tok.percent && Math.abs(f * 100 - tok.value) <= tol));
}

function checkStory(story, factsDoc, socialText) {
    const problems = factProblems(factsDoc);
    const values = factsDoc.facts.map(f => f && f.value).filter(v => typeof v === 'number' && Number.isFinite(v));
    const allowed = [story.meta.season, story.meta.week].filter(Number.isInteger);
    const fields = [['title', story.meta.title], ['dek', story.meta.dek], ['hero_stat', story.meta.hero_stat], ['body', story.body], ['social', socialText]];
    for (const [where, text] of fields) {
        const clean = scrubText(text == null ? '' : text);
        for (const w of clean.match(SPELLED_RE) || []) {
            problems.push({ where, token: w, message: `spelled-out number "${w}" — use numerals` });
        }
        for (const m of clean.matchAll(NUM_RE)) {
            const tok = tokenOf(m);
            if (!tok.percent && tok.decimals === 0 && allowed.includes(tok.value)) continue;
            if (!matchesFact(tok, values)) problems.push({ where, token: tok.raw, message: `"${tok.raw}" is not in the facts file` });
        }
    }
    return problems;
}
```

and add `checkStory` to the `module.exports` object.

- [ ] **Step 4: Create the CLI** — `tools/stories/check-numbers.cjs`:

```js
#!/usr/bin/env node
// ============================================================
// SportStrata Stories — number checker CLI (D-166).
//   node tools/stories/check-numbers.cjs content/nfl/stories/<slug>.md
// Reads <slug>.facts.json and <slug>.social.md beside it.
// Exit 0: every number is in the facts file. Exit 2: problems listed.
// ============================================================
'use strict';
const fs = require('node:fs');
const core = require('./story-core.cjs');

function main(argv) {
    const file = argv[0];
    if (!file || !file.endsWith('.md') || file.endsWith('.social.md')) {
        console.error('usage: node tools/stories/check-numbers.cjs content/nfl/stories/<slug>.md');
        return 2;
    }
    const base = file.slice(0, -3);
    try {
        const story = core.parseStory(fs.readFileSync(file, 'utf8'));
        const facts = JSON.parse(fs.readFileSync(`${base}.facts.json`, 'utf8'));
        const social = fs.existsSync(`${base}.social.md`) ? fs.readFileSync(`${base}.social.md`, 'utf8') : '';
        const problems = [
            ...core.validateMeta(story.meta).map(message => ({ where: 'frontmatter', message })),
            ...core.checkStory(story, facts, social),
        ];
        for (const p of problems) console.error(`✗ [${p.where}] ${p.message}`);
        if (problems.length) return 2;
        console.log('✓ every number is in the facts file');
        return 0;
    } catch (e) {
        console.error(`✗ ${e.message}`);
        return 2;
    }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/stories.test.js`
Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
git add tools/stories/story-core.cjs tools/stories/check-numbers.cjs tests/stories.test.js
git commit -m "Stories: number checker — every number must be in the facts file (D-166)"
```

---

### Task 3: `build-index` CLI

**Files:**
- Create: `tools/stories/build-index.cjs`
- Test: `tests/stories.test.js` (append)

**Interfaces:**
- Consumes: `parseStory`, `validateMeta`, `checkStory`, `indexEntry` (Tasks 1-2).
- Produces: `loadStories(dir) → { stories: IndexEntry[], problems: string[] }`; `main(argv) → 0|2`. CLI: `node tools/stories/build-index.cjs [--check] [--dir <path>]` (default dir `content/nfl/stories`). Without `--check` it writes `index.json` only when there are no problems. With `--check` it writes nothing and exits 2 if any story has a problem or `index.json` differs from what would be written (CRLF-normalized).

- [ ] **Step 1: Write the failing tests** — append:

```js
const indexCli = require('../tools/stories/build-index.cjs');

function storyDir(files) {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stories-idx-'));
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    return dir;
}
const storyAt = (date, title) => STORY.replace('date: 2026-09-30', `date: ${date}`).replace('Detroit keeps finishing drives', title);

test('loadStories indexes valid stories newest first and ignores non-story files', () => {
    const dir = storyDir({
        '2026-09-23-older.md': storyAt('2026-09-23', 'Older'), '2026-09-23-older.facts.json': JSON.stringify(FACTS), '2026-09-23-older.social.md': 'x',
        '2026-09-30-newer.md': storyAt('2026-09-30', 'Newer'), '2026-09-30-newer.facts.json': JSON.stringify(FACTS), '2026-09-30-newer.social.md': 'x',
        'README.md': '# not a story',
    });
    const { stories, problems } = indexCli.loadStories(dir);
    assert.deepEqual(problems, []);
    assert.deepEqual(stories.map(s => s.slug), ['2026-09-30-newer', '2026-09-23-older']);
});

test('loadStories reports missing files, unsourced numbers and a filename/date mismatch', () => {
    const dir = storyDir({
        '2026-09-30-nofacts.md': STORY,
        '2026-09-30-badnum.md': STORY.replace('First paragraph.', 'They scored 77 points.'), '2026-09-30-badnum.facts.json': JSON.stringify(FACTS), '2026-09-30-badnum.social.md': 'x',
        '2026-10-01-wrongdate.md': STORY, '2026-10-01-wrongdate.facts.json': JSON.stringify(FACTS), '2026-10-01-wrongdate.social.md': 'x',
    });
    const { problems } = indexCli.loadStories(dir);
    assert.ok(problems.some(p => p.startsWith('2026-09-30-nofacts: missing 2026-09-30-nofacts.facts.json')));
    assert.ok(problems.some(p => p.startsWith('2026-09-30-badnum: [body]') && p.includes('"77"')));
    assert.ok(problems.some(p => p.startsWith('2026-10-01-wrongdate: filename date must match')));
});

test('main --check fails on a stale index and passes after a rebuild', (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    const dir = storyDir({ '2026-09-30-x.md': STORY, '2026-09-30-x.facts.json': JSON.stringify(FACTS), '2026-09-30-x.social.md': 'x' });
    assert.equal(indexCli.main(['--check', '--dir', dir]), 2);
    assert.equal(indexCli.main(['--dir', dir]), 0);
    assert.equal(indexCli.main(['--check', '--dir', dir]), 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/stories.test.js`
Expected: FAIL — `Cannot find module '../tools/stories/build-index.cjs'`.

- [ ] **Step 3: Implement** — `tools/stories/build-index.cjs`:

```js
#!/usr/bin/env node
// ============================================================
// SportStrata Stories — index builder + CI gate (D-166).
//   node tools/stories/build-index.cjs            write content/nfl/stories/index.json
//   node tools/stories/build-index.cjs --check    CI: fail if any story is invalid,
//                                                 has an unsourced number, or the
//                                                 committed index.json is stale
// Exit 0 / 2. Optional --dir <path> for tests.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('./story-core.cjs');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'content', 'nfl', 'stories');
const STORY_FILE = /^(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

function loadStories(dir) {
    const problems = [];
    const stories = [];
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => STORY_FILE.test(f)).sort() : [];
    for (const file of files) {
        const slug = STORY_FILE.exec(file)[1];
        const read = ext => {
            const p = path.join(dir, slug + ext);
            return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
        };
        try {
            const story = core.parseStory(read('.md'));
            const metaProblems = core.validateMeta(story.meta);
            metaProblems.forEach(p => problems.push(`${slug}: ${p}`));
            if (!slug.startsWith(`${story.meta.date}-`)) problems.push(`${slug}: filename date must match frontmatter date ${story.meta.date}`);
            const factsText = read('.facts.json');
            const social = read('.social.md');
            if (factsText == null) { problems.push(`${slug}: missing ${slug}.facts.json`); continue; }
            if (social == null) problems.push(`${slug}: missing ${slug}.social.md`);
            for (const p of core.checkStory(story, JSON.parse(factsText), social || '')) {
                problems.push(`${slug}: [${p.where}] ${p.message}`);
            }
            if (!metaProblems.length) stories.push(core.indexEntry(slug, story.meta));
        } catch (e) {
            problems.push(`${slug}: ${e.message}`);
        }
    }
    stories.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
    return { stories, problems };
}

function main(argv) {
    const check = argv.includes('--check');
    const dirIdx = argv.indexOf('--dir');
    const dir = dirIdx >= 0 ? argv[dirIdx + 1] : DEFAULT_DIR;
    const { stories, problems } = loadStories(dir);
    for (const p of problems) console.error(`✗ ${p}`);
    if (problems.length) return 2;
    const json = `${JSON.stringify({ stories }, null, 2)}\n`;
    const indexPath = path.join(dir, 'index.json');
    if (check) {
        const current = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n') : null;
        if (current !== json) {
            console.error('✗ index.json is stale — run: node tools/stories/build-index.cjs');
            return 2;
        }
        console.log(`✓ ${stories.length} stories; every number sourced; index.json current`);
        return 0;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(indexPath, json);
    console.log(`✓ wrote index.json (${stories.length} stories)`);
    return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { loadStories, main };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/stories.test.js`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/stories/build-index.cjs tests/stories.test.js
git commit -m "Stories: index builder + CI gate for invalid or unsourced stories (D-166)"
```

---

### Task 4: Edge rendering — story + index Functions, base prerender CSS, headers

**Files:**
- Create: `functions/nfl/stories/[slug].js`, `functions/nfl/stories/index.js`
- Modify: `css/components.css` (append), `_headers` (add block after the `/data/*` block)

**Interfaces:**
- Consumes: `core.SLUG_RE`, `core.parseStory`, `core.validateMeta`, `core.renderBody`, `core.storyUrl`, `core.BYLINE`, `core.DISCLOSURE` (Tasks 1-2), imported as `import core from '../../../tools/stories/story-core.cjs';`. Reads `/content/nfl/stories/<slug>.md` and `/content/nfl/stories/index.json` via `env.ASSETS`.
- Produces: `/nfl/stories/<slug>` (200 story page, 404 shell for unknown slug) and `/nfl/stories` (index page); CSS classes `.ss-prerender`, `.ss-story`, `.ss-story__eyebrow`, `.ss-story__dek`, `.ss-story__meta`, `.ss-story__body`, `.ss-story__disclosure`, `.ss-story__more`, `.ss-stories__list`, `.stories-block`, `.stories-block__hdr`, `.stories-block__more`, `.story-row`, `.story-row__title`, `.story-row__dek` (used by Task 5).

- [ ] **Step 1: Create `functions/nfl/stories/[slug].js`**

```js
// Pages Function: /nfl/stories/:slug — one SportStrata Story (D-166).
// Renders a committed, human-reviewed content/nfl/stories/<slug>.md into the SPA
// shell with a per-story <head>, NewsArticle JSON-LD and an /api/og stat card.
// Sets __SS_ROUTE='static-page-nfl' (D-167) so the SPA leaves the story in place.
// Unknown slug → the shell with HTTP 404. Any other error → the plain shell.
import core from '../../../tools/stories/story-core.cjs';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }
async function notFound(env, url) {
    const html = await (await shell(env, url)).text();
    return new Response(html, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
function prettyDate(iso) {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export async function onRequest(context) {
    const { request, env, params } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const slug = String(params.slug || '');
        if (!core.SLUG_RE.test(slug)) return notFound(env, request.url);
        const r = await env.ASSETS.fetch(new URL(`/content/nfl/stories/${slug}.md`, request.url));
        if (!r.ok) return notFound(env, request.url);
        const { meta, body } = core.parseStory(await r.text());
        if (core.validateMeta(meta).length) return shell(env, request.url);

        const canonical = `https://sportstrata.cc${core.storyUrl(slug)}`;
        const title = `${meta.title} | SportStrata`;
        const desc = String(meta.dek);
        const ogImage = 'https://sportstrata.cc/api/og?' + new URLSearchParams({
            eyebrow: `SportStrata Stories · NFL Week ${meta.week}`,
            title: String(meta.title),
            stat: String(meta.hero_stat),
        }).toString();
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'NewsArticle',
            headline: String(meta.title).slice(0, 110), description: desc,
            datePublished: String(meta.date), dateModified: String(meta.date),
            image: [ogImage], mainEntityOfPage: canonical,
            author: { '@type': 'Organization', name: core.BYLINE, url: 'https://sportstrata.cc/nfl/stories' },
            publisher: { '@type': 'Organization', name: 'SportStrata', url: 'https://sportstrata.cc' },
        });
        const snapshot =
            `<article class="ss-prerender ss-story">` +
            `<p class="ss-story__eyebrow"><a href="/nfl/stories">SportStrata Stories</a> · NFL · Week ${esc(meta.week)}</p>` +
            `<h1>${esc(meta.title)}</h1>` +
            `<p class="ss-story__dek">${esc(meta.dek)}</p>` +
            `<p class="ss-story__meta">By ${esc(core.BYLINE)} · <time datetime="${esc(meta.date)}">${esc(prettyDate(meta.date))}</time></p>` +
            `<div class="ss-story__body">${core.renderBody(body)}</div>` +
            `<p class="ss-story__disclosure">${esc(core.DISCLOSURE)} <a href="/content/nfl/stories/${esc(slug)}.facts.json">See the data behind this story</a>.</p>` +
            `<p class="ss-story__more"><a href="/nfl/stories">More SportStrata Stories</a> · <a href="/nfl">NFL Home</a></p>` +
            `</article>`;

        let html = await (await shell(env, request.url)).text();
        html = html
            .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, `$1${canonical}$2`)
            .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, `$1${canonical}$2`)
            .replace(/(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<meta id="ogImage"\s*property="og:image"\s*content=")[^"]*(">)/, `$1${esc(ogImage)}$2`)
            .replace(/(<meta id="twImage" name="twitter:image" content=")[^"]*(">)/, `$1${esc(ogImage)}$2`)
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, '\\u003c')}</script><script>window.__SS_ROUTE=${JSON.stringify('static-page-nfl')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/nfl', 302); }
    }
}
```

- [ ] **Step 2: Create `functions/nfl/stories/index.js`**

```js
// Pages Function: /nfl/stories — SportStrata Stories index (D-166).
// Lists content/nfl/stories/index.json (built by tools/stories/build-index.cjs),
// newest first, with ItemList JSON-LD. Sets __SS_ROUTE='static-page-nfl' (D-167).
// Renders an honest "first stories on the way" page when the index is empty.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }
function prettyDate(iso) {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const r = await env.ASSETS.fetch(new URL('/content/nfl/stories/index.json', request.url));
        const stories = r.ok ? (((await r.json()) || {}).stories || []) : [];

        const canonical = 'https://sportstrata.cc/nfl/stories';
        const title = 'SportStrata Stories — Data-Driven NFL Analysis | SportStrata';
        const desc = "Original NFL analysis built from SportStrata's own numbers — every stat listed with its source. Free, no login, no ads.";
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList', name: 'SportStrata Stories', url: canonical,
            itemListElement: stories.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `https://sportstrata.cc${s.url}`, name: s.title })),
        });
        const items = stories.map(s =>
            `<li><a href="${esc(s.url)}">${esc(s.title)}</a>` +
            `<p class="ss-story__dek">${esc(s.dek)}</p>` +
            `<p class="ss-story__meta"><time datetime="${esc(s.date)}">${esc(prettyDate(s.date))}</time> · NFL Week ${esc(s.week)}</p></li>`
        ).join('');
        const snapshot =
            `<section class="ss-prerender ss-stories"><h1>SportStrata Stories</h1>` +
            `<p>Original NFL analysis built from SportStrata's own numbers. Every stat in every story is listed with its source.</p>` +
            (stories.length ? `<ol class="ss-stories__list">${items}</ol>` : `<p>The first stories are on the way.</p>`) +
            `<p><a href="/nfl">NFL Home</a></p></section>`;

        let html = await (await shell(env, request.url)).text();
        html = html
            .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, `$1${canonical}$2`)
            .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, `$1${canonical}$2`)
            .replace(/(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, '\\u003c')}</script><script>window.__SS_ROUTE=${JSON.stringify('static-page-nfl')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/nfl', 302); }
    }
}
```

- [ ] **Step 3: CSS cascade check, then append the styles**

Run: `grep -rn "ss-prerender\|ss-story\|ss-stories\|stories-block\|story-row" css/` — Expected: no matches (confirmed absent 2026-09-29). If anything matches, stop and report.

Append to the end of `css/components.css`:

```css
/* ── Edge-rendered content pages (D-166/D-167): glossaries, SportStrata Stories ── */
.ss-prerender { max-width: 720px; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-12); color: var(--text-primary); font-family: var(--font-sans); line-height: 1.6; }
.ss-prerender h1 { font-family: var(--font-display); font-size: var(--text-3xl); line-height: 1.15; margin: 0 0 var(--space-3); }
.ss-prerender h2 { font-size: var(--text-xl); margin: var(--space-8) 0 var(--space-3); }
.ss-prerender p, .ss-prerender ul, .ss-prerender ol, .ss-prerender dl { margin: 0 0 var(--space-4); }
.ss-prerender a { color: var(--accent); }
.ss-prerender dt { font-weight: 700; margin-top: var(--space-4); }
.ss-prerender dd { margin: var(--space-1) 0 0; color: var(--text-secondary); }
.ss-story__eyebrow { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.ss-story__eyebrow a { color: inherit; }
.ss-story__dek { font-size: var(--text-lg); color: var(--text-secondary); }
.ss-story__meta { font-size: var(--text-sm); color: var(--text-muted); border-bottom: 1px solid var(--border-default); padding-bottom: var(--space-4); }
.ss-story__disclosure { font-size: var(--text-sm); color: var(--text-muted); border-top: 1px solid var(--border-default); padding-top: var(--space-4); margin-top: var(--space-8); }
.ss-stories__list { list-style: none; padding: 0; }
.ss-stories__list li { padding: var(--space-4) 0; border-bottom: 1px solid var(--border-default); }
.ss-stories__list li > a { font-weight: 700; font-size: var(--text-lg); text-decoration: none; }
.stories-block { margin-bottom: var(--space-4); }
.stories-block__hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-2); }
.stories-block__more { font-size: var(--text-sm); color: var(--accent); text-decoration: none; }
.story-row { display: block; padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle); text-decoration: none; color: inherit; }
.story-row:hover .story-row__title { color: var(--accent); }
.story-row__title { display: block; font-weight: 600; color: var(--text-primary); }
.story-row__dek { display: block; font-size: var(--text-sm); color: var(--text-secondary); }
```

- [ ] **Step 4: `_headers`** — insert directly after the `/data/*` block (blank line before and after):

```
# SportStrata Stories source files (D-166). Served so each story page can link
# its facts file, but kept out of search results -- the rendered
# /nfl/stories/<slug> page is the canonical, indexable version.
/content/*
  Cache-Control: public, max-age=300, must-revalidate
  X-Robots-Tag: noindex
```

- [ ] **Step 5: Verify the Functions bundle compiles**

Run from the repo root: `npx wrangler pages functions build --outdir <session-scratchpad-dir>/fn-build` (any scratch directory outside the repo).
Expected: `Compiled Worker successfully`. A failure here (e.g. the `.cjs` import) blocks the task — report it with the output.

- [ ] **Step 6: Verify rendering locally**

Put a throwaway story in place (NOT committed): write the `STORY` fixture text from `tests/stories.test.js` to `content/nfl/stories/2026-09-30-test-story.md`, the `FACTS` object to `content/nfl/stories/2026-09-30-test-story.facts.json`, and `Detroit: 9 of 10.` to `content/nfl/stories/2026-09-30-test-story.social.md`; run `node tools/stories/build-index.cjs`.
Start `npx wrangler pages dev . --port 8791` in the background (port 8788 is used by another local project on this machine). Then:
- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8791/nfl/stories/2026-09-30-test-story` → `200`; its body contains `Detroit keeps finishing drives`, `static-page-nfl`, `NewsArticle`, `ss-story__disclosure`.
- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8791/nfl/stories/2026-09-30-nope` → `404`.
- `curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8791/nfl/stories/..%2Fetc"` → `404`.
- `curl -s http://127.0.0.1:8791/nfl/stories` → contains the story title and `ItemList`.
If `wrangler pages dev` cannot run Functions on this machine, record that in the report and rely on Step 5 plus the post-merge production check in Task 6; do not skip Step 5.
Then delete the four throwaway files (`.md`, `.facts.json`, `.social.md`, `index.json`), confirm `git status --short content/` is empty, and stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add "functions/nfl/stories/[slug].js" functions/nfl/stories/index.js css/components.css _headers
git commit -m "Stories: edge-rendered story + index pages, base prerender styles, /content headers (D-166)"
```

---

### Task 5: Client surfaces — home rail, NFL landing, team pages, News page, service worker

**Files:**
- Modify: `js/news.js`, `js/app.js`, `js/nfl.js`, `sw.js`

**Interfaces:**
- Consumes: CSS classes from Task 4; `index.json` shape (File Structure).
- Produces (globals in `js/news.js`): `fetchStoriesIndex() → Promise<IndexEntry[]>` (one shared promise per page load, `[]` on any failure); `storiesBlockHtml(stories, heading) → string` (`''` when empty). `js/app.js`: `_loadLandingStories()`. `js/nfl.js`: `_loadNFLTeamStories(abbr)`.

- [ ] **Step 1: `js/news.js` — add the shared helpers** (append at the end of the file):

```js
// ── SportStrata Stories (D-166) ──────────────────────────────
// Committed, human-reviewed stories listed in /content/nfl/stories/index.json
// (built by tools/stories/build-index.cjs). One shared promise per page load;
// every surface (home rail, NFL landing, team pages, News) reads it.
let _storiesIndexPromise = null;
function fetchStoriesIndex() {
    if (!_storiesIndexPromise) {
        _storiesIndexPromise = fetch('/content/nfl/stories/index.json')
            .then(r => (r.ok ? r.json() : { stories: [] }))
            .then(d => (d && Array.isArray(d.stories) ? d.stories : []))
            .catch(err => { Logger.warn('stories index unavailable', err && err.message, 'NEWS'); return []; });
    }
    return _storiesIndexPromise;
}

function storiesBlockHtml(stories, heading) {
    if (!stories || !stories.length) return '';
    const rows = stories.map(s => `<a class="story-row" href="${_escHtml(s.url)}">
            <span class="story-row__title">${_escHtml(s.title)}</span>
            <span class="story-row__dek">${_escHtml(s.dek)}</span>
        </a>`).join('');
    return `<section class="stories-block">
        <div class="stories-block__hdr"><span class="eyebrow">${_escHtml(heading)}</span><a class="stories-block__more" href="/nfl/stories">All stories →</a></div>
        ${rows}
    </section>`;
}
```

- [ ] **Step 2: `js/news.js` — `displayNews` label fix, wire caption, NFL stories block**

Replace line 132's label expression with:

```js
    const label = (typeof SPORTS_META !== 'undefined' && SPORTS_META[sport] && SPORTS_META[sport].label) || String(sport || '').toUpperCase();
```

In the `grid.innerHTML` template (lines ~140-145): insert `<div id="newsStories"></div>` directly after the `<h2 class="news-page__title">…</h2>` line, and change the caption's leading `Headlines via ESPN` to `Wire headlines via ESPN` (the rest of the caption, including the NCAAF injury note, unchanged). Immediately after that `grid.innerHTML = …;` statement add:

```js
    if (sport === 'nfl' && typeof fetchStoriesIndex === 'function') {
        fetchStoriesIndex().then(stories => {
            const host = document.getElementById('newsStories');
            if (host && host.isConnected) host.innerHTML = storiesBlockHtml(stories.slice(0, 3), 'SportStrata Stories');
        });
    }
```

- [ ] **Step 3: `js/app.js` — home Headlines rail** (`_renderHomeHeadlines`, ~line 2586). Keep its first lines (`host` lookup, `_ago`) and its `catch`; replace the body of its `try { … }` block with:

```js
        const [allArticles, stories] = await Promise.all([
            _fetchHomeNewsArticles(),
            typeof fetchStoriesIndex === 'function' ? fetchStoriesIndex() : Promise.resolve([]),
        ]);
        const articles = allArticles
            .filter(a => a && a.headline && a.links?.web?.href)
            .sort((a, b) => new Date(b.published || b.lastModified) - new Date(a.published || a.lastModified))
            .slice(0, 8);
        if (!host.isConnected) return;
        const storiesHtml = typeof storiesBlockHtml === 'function' ? storiesBlockHtml(stories.slice(0, 3), 'SportStrata Stories') : '';
        if (!articles.length) { host.innerHTML = `${storiesHtml}<p class="pct-caption">No wire headlines right now.</p>`; return; }
        host.innerHTML = storiesHtml + `<div class="stories-block__hdr"><span class="eyebrow">Wire · via ESPN</span></div>` + articles.map(a => {
            const when = _ago(a.published || a.lastModified);
            const meta = (typeof SPORTS_META !== 'undefined' && SPORTS_META[a._sport]) || {};
            return `<a class="rail-headline" href="${_escHtml(a.links.web.href)}" target="_blank" rel="noopener">
                <span class="rail-hl-sport" style="color:${meta.accent || 'var(--text-muted)'}">${_escHtml((a._sport || '').toUpperCase())}</span>
                <span class="rail-hl-text">${_escHtml(a.headline)}</span>
                ${when ? `<span class="rail-hl-time">${_escHtml(when)}</span>` : ''}
            </a>`;
        }).join('') + `<p class="pct-caption">Wire headlines via ESPN &amp; MLB Stats API · tap to read the full story</p>`;
```

- [ ] **Step 4: `js/app.js` — NFL landing stories module**

In `_renderEditorialLanding` (~line 280), change the line `${slots.news ? `<div id="slNews"></div>` : ''}` to:

```js
                ${sport === 'nfl' ? `<div id="slStories"></div>` : ''}
                ${slots.news ? `<div id="slNews"></div>` : ''}
```

Add this function directly above `async function _loadSportLandingNews` (~line 3800):

```js
// SportStrata Stories on the NFL landing (D-166) -- above the ESPN wire module.
// Removes its host when there are no stories rather than showing an empty box.
async function _loadLandingStories() {
    const host = document.getElementById('slStories');
    if (!host || typeof fetchStoriesIndex !== 'function') return;
    const stories = await fetchStoriesIndex();
    if (!host.isConnected) return;
    if (!stories.length) { host.remove(); return; }
    host.innerHTML = `<section class="sl-section sl-section--flush">${storiesBlockHtml(stories.slice(0, 3), 'SportStrata Stories')}</section>`;
}
```

In the NFL landing loader object (~line 192, the `nfl: () => { … }` entry), add as the line before `_loadSportLandingNews('nfl', 'Latest NFL')`:

```js
        if (typeof _loadLandingStories === 'function') _loadLandingStories();
```

- [ ] **Step 5: `js/nfl.js` — team page stories**

At ~line 2328, change the builder's return to append a host:

```js
    return `${header}${recordCard}${m.scheduleHtmlTop || ''}${assetsCard}${rosterCard}${m.scheduleHtml || ''}<div class="nfl-team-stories" id="nflTeamStories" style="grid-column:1/-1"></div>`;
```

Add this function directly after that builder function ends:

```js
// SportStrata Stories that name this team in their frontmatter (D-166).
async function _loadNFLTeamStories(abbr) {
    const host = document.getElementById('nflTeamStories');
    if (!host || typeof fetchStoriesIndex !== 'function') return;
    const code = String(abbr || '').toUpperCase();
    const stories = (await fetchStoriesIndex()).filter(s => (s.teams || []).includes(code)).slice(0, 3);
    if (!host.isConnected) return;
    if (!stories.length) { host.remove(); return; }
    host.innerHTML = storiesBlockHtml(stories, 'SportStrata Stories');
}
```

Find where `showNFLTeamDetail(abbr)` (~line 2194) writes the builder's output into the page (grep the builder's function name inside `showNFLTeamDetail` to find its `innerHTML =` assignment) and call `_loadNFLTeamStories(abbr);` on the line immediately after that assignment. If there is more than one such assignment, add the call after each one that renders the full team page (not the skeleton).

- [ ] **Step 6: `sw.js`** — change the `/api/` network-only condition (line ~151) to also cover `/content/`, adding two comment lines above it:

```js
    // /content/ (SportStrata Stories source files + index.json, D-166) is the same
    // kind of data: a newly published story must appear on the next load, not the one after.
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/content/')) {
```

Bump `CACHE_NAME` to one above the highest `sportstrata-vNNN` found on `main` or in any open PR (`gh pr diff 2 | grep CACHE_NAME`, `gh pr diff 3 | grep CACHE_NAME`, `grep CACHE_NAME sw.js`).

- [ ] **Step 7: Verify**

Run: `node --check js/news.js && node --check js/app.js && node --check js/nfl.js && node --check sw.js && node tools/check-manifest.cjs` → no syntax errors; manifest `0 failures`.
Serve the repo statically (`python -m http.server 8799 --bind 127.0.0.1`, background) with a throwaway `content/nfl/stories/index.json` containing `{"stories":[{"slug":"2026-09-30-test","title":"Test story","dek":"Test dek.","date":"2026-09-30","season":2026,"week":4,"teams":["DET"],"players":[],"hero_stat":"x","url":"/nfl/stories/2026-09-30-test"}]}`. In a real browser (Chrome DevTools tools) check:
- `http://127.0.0.1:8799/index.html` → the Headlines tab shows "SportStrata Stories" with "Test story" above "Wire · via ESPN" (the wire list may be empty locally — a static server doesn't serve `/api/news`; expected).
- `#nfl-home` → a "SportStrata Stories" section appears.
- `#nfl-team-det` → a "SportStrata Stories" block lists "Test story"; `#nfl-team-kc` → no stories block.
- `#news` with NFL selected → title "NFL — Latest" plus the stories block; with NBA selected → title "NBA — Latest" (was "NFL — Latest").
Delete the throwaway `index.json`, confirm `git status --short content/` is empty, stop the server.

- [ ] **Step 8: Commit**

```bash
git add js/news.js js/app.js js/nfl.js sw.js
git commit -m "Stories: surface on home rail, NFL landing, team pages and News; label ESPN as wire; fix non-NFL News titles (D-166)"
```

---

### Task 6: First real story, sitemap, CI, docs

**Files:**
- Create: `content/nfl/stories/<date>-<slug>.md`, `.facts.json`, `.social.md`, `content/nfl/stories/index.json`
- Modify: `tools/gen-sitemap.cjs`, `.github/workflows/ci.yml`, `.claude/commands/deploy-check.md`, `CLAUDE.md`, `DECISIONS.md`

**Interfaces:**
- Consumes: every CLI and surface from Tasks 1-5.

- [ ] **Step 1: Write the first story from live data** (needs judgment; the owner reviews it in the PR before anything publishes)

1. Fetch real, current data from production: `curl -s "https://sportstrata.cc/api/nflstandings?season=2026"` (each entry's `stats[]` has named stats such as point differential, points for/against, streak). `/api/nflstats` gives leaders if useful.
2. Find ONE genuinely notable, verifiable fact through the latest completed week (e.g. an outlier point differential relative to record, or a notable streak). It must be true as of the data fetched — not a guess, not news (no injuries/trades/quotes).
3. Write `content/nfl/stories/<today YYYY-MM-DD>-<short-slug>.md` in the story format: headline states the finding; one-sentence dek; 300–450 words; numerals only; attribute stats ("per SportStrata's standings data"); link team names to `/nfl/team/<lowercase code>` where useful; `teams:` lists every team named (uppercase site codes); `hero_stat:` a short stat line; `week:` the latest completed week.
4. Write `<same>.facts.json` listing EVERY number used (title, dek, hero_stat, body, social) with `key`, `value`, `label`, and `source` (the exact `/api/...` route fetched). Numbers derived by arithmetic are facts too — include them with a `source` naming the inputs, e.g. `"/api/nflstandings?season=2026 (pointsFor − pointsAgainst)"`.
5. Write `<same>.social.md` with two sections: `## Reddit` (value first, link last, reads fine without a click) and `## X` (≤ 280 characters including `https://sportstrata.cc/nfl/stories/<slug>`).
6. Run `node tools/stories/check-numbers.cjs content/nfl/stories/<slug>.md` → `✓`. Fix the story (never loosen the facts) until it passes.
7. Run `node tools/stories/build-index.cjs` → writes `index.json` with 1 story.

- [ ] **Step 2: Sitemap** — in `tools/gen-sitemap.cjs`, directly after `add(urlTag('/nfl/glossary', 'monthly', '0.6'));`:

```js
    add(urlTag('/nfl/stories', 'daily', '0.7'));
    try {
        const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'nfl', 'stories', 'index.json'), 'utf8'));
        for (const s of idx.stories || []) add(urlTag(s.url, 'monthly', '0.6'));
    } catch (e) {
        console.warn(`stories index unreadable, skipping story URLs: ${e.message}`);
    }
```

Add `/nfl/stories` to the file's header comment list of static pages (lines ~14-16). Verify with `node --check tools/gen-sitemap.cjs`. Do not run the full generator (it hits live upstreams and rewrites `sitemap.xml`; the daily workflow does that).

- [ ] **Step 3: CI + deploy-check**

`.github/workflows/ci.yml`: append ` tests/stories.test.js` to the `node --test …` line, and add a step directly after the unit-test step, matching the file's indentation:

```yaml
      - name: SportStrata Stories — valid, every number sourced, index current (D-166)
        run: node tools/stories/build-index.cjs --check
```

`.claude/commands/deploy-check.md`: append ` tests/stories.test.js` to its `node --test …` line, and add `node tools/stories/build-index.cjs --check` to the same checklist item.

- [ ] **Step 4: Docs**

`DECISIONS.md` — append:

```markdown

## D-166 — SportStrata Stories: original data-driven NFL editorial, reviewed PRs, no runtime LLM
**Status:** shipping (publishing path) | **Date:** 2026-09-29

Traffic is minimal and the only editorial surface was ESPN's wire, which every site carries. Stories publish original analysis built from SportStrata's own data as crawlable pages (`/nfl/stories/<slug>`, `NewsArticle` JSON-LD, `/api/og` stat card) meant to be cited and linked. Hard rules: not news (no injuries/trades/quotes); every number in a story must appear in its committed `.facts.json` (enforced by `tools/stories/check-numbers.cjs`, and in CI by `build-index.cjs --check`); 0-4 stories per run, never volume; every story human-reviewed in a PR (merge = publish); byline "SportStrata Data Desk" with an AI-assistance disclosure linking the facts file. **Vendor:** drafting (rollout step 4) will run as a scheduled Claude Code routine that opens PRs — a scoped exception to the 2026-08-08 "Gemini is the one LLM vendor" decision, which was about not maintaining a second credential on the site; this adds no key and no runtime model call. Spec: `docs/superpowers/specs/2026-09-29-nfl-stories-design.md`.
```

`CLAUDE.md`:
- Key Files table — add rows: `tools/stories/story-core.cjs` (shared parse/validate/render/number-check core, imported by the Functions and tools), `tools/stories/build-index.cjs` + `check-numbers.cjs` (CLIs; `--check` is the CI gate), `functions/nfl/stories/[slug].js` + `index.js` (edge-rendered story/index pages, `static-page-nfl`), `content/nfl/stories/` (committed stories + `.facts.json` + `.social.md` + `index.json`; `/content/*` is `noindex` and network-only in `sw.js`).
- Path URLs & Edge Rendering section — add one bullet: `**SportStrata Stories (D-166):** /nfl/stories + /nfl/stories/<slug> render committed content/nfl/stories/*.md; every number must be in the story's .facts.json (CI: node tools/stories/build-index.cjs --check); after adding a story run node tools/stories/build-index.cjs to regenerate index.json.`
- The `**Before any push:**` test list — append ` tests/stories.test.js`.

- [ ] **Step 5: Verify everything**

Run the full CI unit-test line from `.github/workflows/ci.yml` verbatim → all pass (59 + 19 = 78 on a `main` base; more if PR #1 is already merged).
Run `node tools/stories/build-index.cjs --check` → `✓ 1 stories; every number sourced; index.json current`.
Run `node tools/check-manifest.cjs` → `0 failures`.

- [ ] **Step 6: Commit**

```bash
git add content/nfl/stories tools/gen-sitemap.cjs .github/workflows/ci.yml .claude/commands/deploy-check.md CLAUDE.md DECISIONS.md
git commit -m "Stories: first NFL story, sitemap, CI gate and docs (D-166)"
```

- [ ] **Step 7: Hand off (do not push or merge)** — report to the controller: branch ready; a PR against `main` is needed for the owner to review the story itself; post-merge checks on sportstrata.cc: `/nfl/stories/<slug>` renders the story and keeps it after the SPA boots, `/nfl/stories` lists it, `/content/nfl/stories/<slug>.facts.json` returns JSON with `X-Robots-Tag: noindex`, and the OG image URL renders the stat card.
