# SportsStrata — Improvements & Feature Roadmap
> **Claude Code Working Document** — Cross-reference with `CLAUDE.md` for project schema, file structure, and agent conventions before executing any task.

---

## Project Snapshot (as observed)

**Live URL:** https://zohn-sports-stats.pages.dev  
**Stack:** Vanilla JS · No build tools · No framework · Cloudflare Pages  
**Current Data APIs:** Ball Don't Lie (NBA) · MLB data layer (active per header)  
**UI Pattern:** Glassmorphism dark theme · SPA with tab-based routing  
**Tabs visible:** Players · Leaders · Teams · Scores · Standings · Builder · Prep · Arcade  
**Known issues observed on load:** "Loading scores…" stuck in header · "Loading players…" stuck in main pane  

---

## Section 1 — Critical Bugs (Fix First)

These are breaking or near-breaking issues that degrade the core experience.

---

### BUG-01 · Hash-Based Routing Not Implemented (or broken)

**Problem:** The site is a vanilla JS SPA. If routing is handled via `showTab()` style JS functions with no URL hash sync, then:
- Refreshing any tab resets to the default view
- Browser back/forward buttons don't work
- Tabs can't be deep-linked or bookmarked
- Shared URLs always land on home

**Fix:**  
Implement `window.location.hash` routing.

```js
// On tab click
function navigateTo(tab) {
  window.location.hash = tab;
  showTab(tab);
}

// On page load / hashchange
window.addEventListener('hashchange', () => {
  const tab = window.location.hash.replace('#', '') || 'players';
  showTab(tab);
});
window.addEventListener('DOMContentLoaded', () => {
  const tab = window.location.hash.replace('#', '') || 'players';
  showTab(tab);
});
```

**Agent:** Single-agent task. Ask Claude Code to audit all tab navigation calls and wire `window.location.hash` bidirectionally. Low complexity, high value.

---

### BUG-02 · Score Banner Stuck on "Loading scores…"

**Problem:** The header score ticker shows "Loading scores…" and never resolves. Possible causes:
- API endpoint changed or rate-limited
- CORS block on the fetch (Cloudflare Pages has no proxy)
- Async timing issue — scores appended to DOM before container is ready
- MLB score API endpoint not configured (site transitioned from NBA to MLB without wiring scores)

**Fix:**  
1. Open browser DevTools → Network tab → identify which fetch is failing
2. If CORS: route through a Cloudflare Worker proxy (see BUG-05)
3. Add a proper error state: `"Scores unavailable"` with a retry button instead of infinite spinner
4. Add timeout fallback: if no response in 5s, show fallback UI

```js
async function loadScores() {
  try {
    const res = await Promise.race([
      fetch(SCORES_API_URL),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderScores(data);
  } catch (err) {
    document.getElementById('score-banner').textContent = 'Scores unavailable — retry';
  }
}
```

**Agent:** Requires Claude Code to inspect the actual fetch call, diagnose the failure mode, then apply the correct fix. May need a Worker if it's a CORS issue.

---

### BUG-03 · "Loading players…" Never Resolves

**Problem:** The Players pane is stuck on its loading state. Root causes likely mirror BUG-02 — wrong endpoint, API key missing/expired, or transition from Ball Don't Lie (NBA) to an MLB data source was never completed in the player fetch logic.

**Fix:**  
1. Verify which API is being called for players (`console.log` the URL and response)
2. Confirm API key is set (if Ball Don't Lie — free tier has rate limits; MLB API may require different auth)
3. Add skeleton loading cards with a real error fallback
4. Consider paginating results — loading all players at once will always be slow

```js
function renderPlayerSkeleton(count = 12) {
  return Array.from({ length: count }, () => `
    <div class="player-card skeleton">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-name"></div>
      <div class="skeleton-stat"></div>
    </div>
  `).join('');
}
```

**Agent:** Single-agent task. Audit the player fetch pipeline end-to-end: URL → fetch → parse → render. Add error and empty states.

---

### BUG-04 · No Error Boundaries or Empty States

**Problem:** Every tab that touches an API has the same issue — there is no visible error state. Users see infinite spinners with no feedback and no way to retry.

**Fix:** Create a reusable error component and apply it everywhere.

```js
function renderError(container, message, retryFn) {
  container.innerHTML = `
    <div class="error-state">
      <span class="error-icon">⚠️</span>
      <p>${message}</p>
      ${retryFn ? `<button class="btn-retry" onclick="(${retryFn})()">Retry</button>` : ''}
    </div>
  `;
}
```

**Agent:** Low complexity. Apply globally across all fetch-dependent render functions.

---

### BUG-05 · CORS / API Proxy Architecture Missing

**Problem:** Vanilla JS SPAs running on Cloudflare Pages cannot proxy API requests, meaning every API call is exposed client-side (API keys in JS source) and subject to CORS restrictions from third-party sports APIs.

**Fix:** Set up a **Cloudflare Worker** as a thin API proxy layer.

```js
// wrangler.toml
name = "sportsstrata-proxy"
main = "worker.js"

// worker.js
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const target = url.searchParams.get('endpoint');
    const apiRes = await fetch(`https://api.balldontlie.io/v1/${target}`, {
      headers: { 'Authorization': env.BDL_API_KEY }
    });
    return new Response(await apiRes.text(), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
```

Deploy at `sportsstrata-proxy.{account}.workers.dev` and update all fetch URLs to point to the Worker instead of directly to APIs. API keys move from client JS into Worker `env` secrets.

**Agent:** Infrastructure task. Instruct Claude Code to scaffold a `worker/` directory, write `worker.js` and `wrangler.toml`, and update all fetch base URLs in the main JS.

---

## Section 2 — UX & Performance Improvements

---

### UX-01 · Player Headshots via ESPN CDN

**Problem:** Player cards likely show placeholder avatars or initials. ESPN CDN exposes headshots for free with no auth.

**Implementation:**
```js
function getESPNHeadshot(playerId) {
  // ESPN athlete ID must be known or mapped
  return `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`;
}

// Fallback on error
img.onerror = () => { img.src = '/assets/default-player.svg'; };
```

For MLB: map player names/IDs to ESPN athlete IDs using a cached lookup table or a one-time scrape. For NBA: Ball Don't Lie returns `espn_id` in some endpoints.

**Agent:** Moderate complexity. Requires mapping logic. Ask Claude Code to build an `espn-id-map.js` lookup module and apply headshots across player cards and the Leaders board.

---

### UX-02 · Per-36 / Per-Game Stat Toggle

**Problem:** Stats are shown in one mode only. Power users (fantasy sports, saber nerds) want per-36 minutes normalized stats for fair comparison.

**Implementation:**
```js
const statMode = { current: 'perGame' }; // or 'per36' | 'season'

function normalizeStats(player, mode) {
  if (mode === 'per36') {
    const scale = 36 / (player.min || 36);
    return { pts: player.pts * scale, reb: player.reb * scale, ast: player.ast * scale };
  }
  return player; // raw
}

// Toggle button
document.getElementById('stat-toggle').addEventListener('click', () => {
  statMode.current = statMode.current === 'perGame' ? 'per36' : 'perGame';
  renderPlayers(); // re-render with new mode
});
```

**Agent:** Single-agent task. Add a toggle button to the Players and Leaders tabs, add `normalizeStats()` utility, and re-render on toggle. No API changes needed.

---

### UX-03 · Keyboard Navigation Polish (Command Palette)

**Observation:** The site has a command palette with `↑↓ ↵ Esc` keyboard bindings — that's already strong. But likely missing:
- `Ctrl+K` / `Cmd+K` shortcut to open it
- Result grouping (Players / Tabs / Actions)
- Recent searches memory (`localStorage`)
- Fuzzy matching (current is probably exact substring)

**Implementation for fuzzy match:**
```js
function fuzzyMatch(query, str) {
  const q = query.toLowerCase();
  const s = str.toLowerCase();
  let qi = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) qi++;
  }
  return qi === q.length;
}
```

**Agent:** Single-agent polish task. Enhance the existing palette — don't rewrite it.

---

### UX-04 · Light Mode CSS Variables Audit

**Observation:** Light mode toggle exists (☀️ button) but glassmorphism themes often have poorly-tested light mode — backgrounds turn grey instead of white, blur effects disappear, text contrast fails WCAG AA.

**Fix:** Audit CSS custom properties and ensure every `--color-*` and `--bg-*` variable has a clean light-mode override in `[data-theme="light"]` selectors. Run Lighthouse or axe for contrast failures.

**Agent:** Quick audit task. Ask Claude Code to list all CSS variables, generate a light-mode override block, and flag any contrast ratios below 4.5:1.

---

### UX-05 · CSV Export for Stats Tables

**Problem:** Users can view stats but can't take the data anywhere — no export for fantasy research, spreadsheet analysis, etc.

**Implementation:**
```js
function exportCSV(data, filename) {
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(r => Object.values(r).join(',')).join('\n');
  const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
```

Add an "Export CSV" button to Leaders, Teams, and Standings tabs. Put it in the top-right of each table header.

**Agent:** Low complexity, high value. Single-agent task.

---

### UX-06 · Mobile Responsiveness Audit

**Problem:** Glassmorphism layouts with absolute positioning and backdrop-filter often break on mobile — cards overflow, nav tabs wrap badly, the command palette may be unusable on small screens.

**Fix:**  
- Ensure `meta viewport` is set correctly
- Test nav tab overflow behavior on 375px width → consider a bottom tab bar on mobile or a hamburger collapse
- All stat tables need horizontal scroll: `overflow-x: auto` on the wrapper
- Player grid should go 1-column on mobile, 2 on tablet, 3+ on desktop using CSS Grid `auto-fill`

```css
.player-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}
```

**Agent:** CSS-heavy task. Ask Claude Code to audit and fix all media query breakpoints. Use Chrome DevTools device emulation as the target.

---

## Section 3 — Missing Features (High Value)

---

### FEAT-01 · Chart.js Visualizations via CDN

**Current state:** Stats are probably shown in plain text tables. No visual layer.

**What to add:**
- Radar/spider chart per player (pts / reb / ast / stl / blk normalized)
- Bar chart on Leaders tab (top 10 in any stat category)
- Line chart for season trend (game-by-game) on player profile
- Win/loss chart on Standings tab

**Implementation (no build tools, CDN only):**
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
```

```js
function renderRadarChart(canvasId, player) {
  new Chart(document.getElementById(canvasId), {
    type: 'radar',
    data: {
      labels: ['PTS', 'REB', 'AST', 'STL', 'BLK'],
      datasets: [{
        label: player.name,
        data: [player.pts, player.reb, player.ast, player.stl, player.blk],
        backgroundColor: 'rgba(99,102,241,0.2)',
        borderColor: '#6366f1'
      }]
    },
    options: { scales: { r: { suggestedMin: 0 } } }
  });
}
```

**Agent:** Multi-step task. First add CDN link. Then build chart render functions per tab type. Then wire them to existing data. Keep Chart.js instances in a `window.charts` registry to properly destroy/recreate on re-render.

---

### FEAT-02 · Service Worker + Offline Support

**Problem:** Every page refresh hits the API cold. There's no caching layer — slow on repeat visits, completely broken with no network.

**Implementation:**
```js
// sw.js — register in main JS
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// sw.js
const CACHE = 'sportsstrata-v1';
const STATIC = ['/', '/index.html', '/styles.css', '/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
```

Cache API responses with a 5-minute TTL so returning users see data instantly even on slow connections.

**Agent:** Infrastructure task. Ask Claude Code to scaffold `sw.js`, register it, and implement a network-first strategy for API calls with a stale-while-revalidate pattern for static assets.

---

### FEAT-03 · Player Profile Modal / Drill-Down

**Problem:** Clicking a player card likely does nothing, or opens a flat stats table. There's no deep profile view.

**What a profile modal should contain:**
- Headshot (ESPN CDN)
- Team, position, age, height/weight, draft info
- Season stats (all categories)
- Per-36 stats (toggle)
- Radar chart (FEAT-01)
- Recent game log (last 10 games, mini table)
- Back button / ESC to close

**Implementation:**
```js
function openPlayerModal(playerId) {
  const modal = document.getElementById('player-modal');
  modal.classList.add('active');
  modal.innerHTML = renderPlayerSkeleton();
  fetchPlayerDetails(playerId).then(data => {
    modal.innerHTML = renderPlayerProfile(data);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePlayerModal();
  });
}
```

Use `position: fixed` with backdrop blur and a smooth slide-up animation. No router change needed — keep hash intact.

**Agent:** Medium complexity, multi-part. Build the modal shell, then the profile render function, then wire it to player card click events.

---

### FEAT-04 · Multi-Sport Toggle (MLB ↔ NBA ↔ NFL)

**Observation:** The header says "MLB Analytics" — the site was originally NBA (Ball Don't Lie API) and has partially migrated or been extended to MLB. The nav tab structure already seems designed for multiple sports.

**What to build:**  
A sport selector in the header (or sidebar) that switches the entire data layer:

```js
const SPORT_CONFIG = {
  mlb: { label: 'MLB', api: 'https://...', tabs: ['Players','Scores','Standings','Teams'] },
  nba: { label: 'NBA', api: 'https://...', tabs: ['Players','Leaders','Scores','Standings','Teams'] },
  nfl: { label: 'NFL', api: 'https://...', tabs: ['Players','Scores','Standings','Teams'] }
};

function switchSport(sport) {
  window.activeSport = sport;
  document.getElementById('sport-label').textContent = SPORT_CONFIG[sport].label;
  renderTabsForSport(sport);
  loadDefaultTab(sport);
}
```

This is the single biggest architectural decision — a multi-sport platform is far more valuable as a portfolio piece and a real tool than a single-sport one.

**Agent:** Architectural task. Should be broken into sub-tasks: (1) define sport config schema, (2) refactor API layer to be sport-agnostic, (3) build the sport switcher UI, (4) wire tabs per sport. Reference `CLAUDE.md` for the project's data layer conventions before touching this.

---

### FEAT-05 · "Builder" Tab — Lineup / Stat Comparison Builder

**Observation:** The "Builder" tab exists in the nav but its contents are unknown from the outside. If it's empty or minimal, this is the highest-value feature to build for differentiation.

**What it should be:**  
A drag-and-drop stat comparison tool:
- Add up to 6 players to a comparison board
- Side-by-side stat table
- Overlay radar chart (all 6 players on one chart with legend)
- Export the comparison as an image (html2canvas) or CSV

```js
// Comparison state
const compareList = [];

function addToCompare(player) {
  if (compareList.length >= 6) return alert('Max 6 players');
  if (compareList.find(p => p.id === player.id)) return;
  compareList.push(player);
  renderCompareBoard();
}
```

**Agent:** The most complex standalone feature. Multi-step — build the compare state, the side-by-side table, the radar overlay, then export. Do NOT start this until BUG-01 through BUG-03 are resolved.

---

### FEAT-06 · "Prep" Tab — Fantasy Sports Matchup Analyzer

**Observation:** "Prep" is a tab that clearly implies pre-game or pre-week preparation. This is a natural home for a fantasy sports tool.

**What to build:**
- Input: two players or a player vs. team matchup
- Output: recent form (last 5 games avg), home/away splits, opponent defensive rank
- Injury status flag (pull from free API or manual override)
- A simple recommendation badge: 🟢 Start / 🟡 Flex / 🔴 Sit

This differentiates SportsStrata from every generic stats site — it gives an *action* recommendation, not just raw data.

**Agent:** Medium complexity. Requires aggregating multiple API calls per player. Build a `matchup-analyzer.js` module. Keep it stateless — input goes in, analysis comes out.

---

### FEAT-07 · "Arcade" Tab — Trivia / Mini-Games

**Observation:** "Arcade" exists but its content is unknown externally. This is a major retention hook if built well.

**Game ideas:**
1. **Higher or Lower** — "Who averages more points? Luka or Tatum?" → uses live season stats
2. **Guess the Player** — blurred headshot + 3 stat clues → reveal on guess
3. **Stat Scramble** — match 10 players to their correct stat line
4. **Draft Order Quiz** — "Which pick was Player X in the 20XX draft?"

All of these use existing API data — no additional data sources needed.

**Agent:** Build one game at a time. Start with Higher or Lower as it's purely data-driven and has no render complexity. Each game should be self-contained in its own JS file.

---

## Section 4 — Differentiation (What Makes It Stand Out)

These are the features that separate SportsStrata from ESPN, Basketball Reference, and every other stats site.

---

### DIFF-01 · AI-Powered Stat Summaries (Claude API Integration)

SportsStrata already has access to the Anthropic ecosystem. Use it.

When a player profile opens, add an **"AI Analysis"** section:

```js
async function generatePlayerSummary(player, stats) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({
      prompt: `Analyze ${player.name}'s 2025 season: ${JSON.stringify(stats)}. 
               Give a 2-sentence scout's take on their current form, strengths, and one concern.`
    })
  });
  const { summary } = await res.json();
  document.getElementById('ai-summary').textContent = summary;
}
```

Route through a Cloudflare Worker to keep the Anthropic API key server-side. This is a massive differentiator — no other free stats site does this.

**Agent:** Requires the Worker from BUG-05 to already be deployed. Add an `/analyze` endpoint to the Worker, wire it to the player profile modal, display with a typewriter animation.

---

### DIFF-02 · Starred Players Dashboard (Personalized Home)

**Observation:** The star/favorite system exists (♥ Starred visible in UI). If starring is already working, the starred view needs to become the app's personalized home screen — show a quick stat snapshot of all starred players in one glance, updated on load.

**What to add:**
- Starred players grid on load (if any are starred)
- Today's game status for each starred player (is their team playing tonight?)
- Quick stat trend arrow (▲▼ vs. season avg based on last 3 games)

**Agent:** Build on top of existing star logic. Requires reading localStorage star list, fetching those specific players, and rendering a personalized dashboard grid.

---

### DIFF-03 · Dark Terminal Aesthetic — Push It Further

The glassmorphism dark theme is a good foundation. Push the identity harder to make it feel like a war room, not a website:

- Subtle scanline CSS overlay (pure CSS, no image)
- Monospace font for all stat numbers (`font-family: 'JetBrains Mono', monospace` via Google Fonts)
- Score ticker as a true horizontal marquee (CSS `@keyframes` scroll, not JS)
- Team color accents — when viewing a player, their team's primary color bleeds into the card border and chart color
- Sound effects on Arcade interactions (optional, toggle-able)

```css
/* Scanline overlay */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px
  );
  pointer-events: none;
  z-index: 9999;
}
```

**Agent:** CSS-only task. All of these are visual polish — no logic changes. Fast to implement, very high visual impact.

---

### DIFF-04 · Share / Social Cards (Screenshot API)

Allow users to share a player's stat line as a styled image card — like the boxes you see on sports social media.

**Implementation:**
```js
// html2canvas via CDN
// https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js

async function sharePlayerCard(cardElement) {
  const canvas = await html2canvas(cardElement, { backgroundColor: '#0f0f0f' });
  const link = document.createElement('a');
  link.download = 'player-card.png';
  link.href = canvas.toDataURL();
  link.click();
}
```

**Agent:** Medium complexity. Requires html2canvas via CDN. Build a dedicated `stat-card` styled component first, then wire the screenshot export.

---

## Section 5 — Architecture & Code Health

---

### ARCH-01 · Module Structure

If all JS is in one file (common for vanilla JS projects), it needs to be split. Suggested structure:

```
/js
  app.js          — entry point, tab routing, global state
  api.js          — all fetch calls, centralized base URL, error handling
  players.js      — player card render, search, filter
  leaders.js      — leaderboard render, sort logic
  scores.js       — score ticker, live scores render
  standings.js    — standings table render
  charts.js       — all Chart.js instances
  builder.js      — comparison builder
  arcade.js       — mini-games
  utils.js        — shared helpers (formatStat, formatDate, fuzzyMatch, exportCSV)
  sw.js           — service worker (at root)
```

All files load via `<script type="module" src="/js/app.js">` — modern browsers handle ES module imports with no build step needed.

**Agent:** Refactor task. Do NOT change functionality — only reorganize. Use Claude Code's multi-file edit capability to split the file and verify imports work correctly.

---

### ARCH-02 · State Management

Vanilla JS SPAs drift toward global variables. Introduce a minimal reactive store:

```js
// store.js
const store = {
  _state: { sport: 'mlb', players: [], starred: [], currentTab: 'players' },
  _listeners: [],
  get: (key) => store._state[key],
  set: (key, value) => {
    store._state[key] = value;
    store._listeners.forEach(fn => fn(key, value));
  },
  subscribe: (fn) => store._listeners.push(fn)
};

export default store;
```

This is ~20 lines, no dependencies, and eliminates scattered `let` globals.

**Agent:** Foundational refactor. Do after ARCH-01. All global state references get migrated to `store.get/set`.

---

### ARCH-03 · API Key Security Audit

**Problem:** In a vanilla JS SPA, any `const API_KEY = '...'` in source is publicly readable in browser DevTools.

**Immediate actions:**
1. Move all API keys to the Cloudflare Worker (see BUG-05) — the Worker holds secrets, the frontend calls the Worker
2. If Ball Don't Lie free tier is being used (no key required), no issue there
3. Audit the deployed source for any exposed keys right now

**Agent:** Security audit first — read all JS files for string patterns matching API key formats. Then migrate to Worker env. This is a prerequisite before any public sharing of the site.

---

## Section 6 — Execution Order for Claude Code

Work in this order. Each item is a discrete agentic task that can be handed to Claude Code with the task title as the prompt prefix.

| Priority | ID | Task | Complexity | Agent Notes |
|---|---|---|---|---|
| 🔴 P0 | BUG-03 | Fix players API | Low | Start here — most visible issue |
| 🔴 P0 | BUG-02 | Fix scores banner | Low | Quick win |
| 🔴 P0 | BUG-04 | Add error/empty states globally | Low | Apply everywhere |
| 🟠 P1 | BUG-01 | Hash-based routing | Low | Unlocks all deep links |
| 🟠 P1 | ARCH-01 | Module file split | Medium | Do before adding features |
| 🟠 P1 | BUG-05 | Cloudflare Worker proxy | Medium | Required before DIFF-01 |
| 🟠 P1 | ARCH-03 | API key security audit | Low | Do before any public sharing |
| 🟡 P2 | UX-01 | ESPN headshots | Medium | Visual upgrade |
| 🟡 P2 | UX-02 | Per-36 toggle | Low | Power user feature |
| 🟡 P2 | UX-05 | CSV export | Low | Quick win |
| 🟡 P2 | UX-06 | Mobile audit | Medium | Must test on real device |
| 🟡 P2 | FEAT-01 | Chart.js visualizations | Medium | High visual impact |
| 🟢 P3 | FEAT-03 | Player profile modal | High | Major feature |
| 🟢 P3 | FEAT-05 | Builder tab — comparison | High | Portfolio centerpiece |
| 🟢 P3 | FEAT-02 | Service worker / offline | Medium | Infrastructure |
| 🟢 P3 | DIFF-01 | Claude AI summaries | Medium | Killer differentiator |
| 🟢 P3 | FEAT-04 | Multi-sport toggle | High | Architectural — do last |
| ⚪ P4 | FEAT-06 | Prep tab / fantasy analyzer | Medium | After multi-sport |
| ⚪ P4 | FEAT-07 | Arcade games | High | One game at a time |
| ⚪ P4 | DIFF-03 | Visual polish (scanlines, etc.) | Low | Any time |
| ⚪ P4 | DIFF-04 | Share / social cards | Medium | After profile modal |

---

## Claude Code Agent Prompt Templates

Use these when kicking off tasks in Claude Code. Paste the relevant one as the opening prompt.

**For bug fixes:**
```
Using the schema in CLAUDE.md, fix [BUG-ID]: [description]. 
Do not change any functionality outside the scope of this bug. 
After the fix, confirm the error state renders correctly and the happy path still works.
```

**For new features:**
```
Using the schema in CLAUDE.md, implement [FEAT-ID]: [description].
Build it as a standalone module in /js/[module-name].js.
Wire it to app.js via the existing tab routing pattern.
Do not use any build tools or npm packages — CDN only.
```

**For refactors:**
```
Using the schema in CLAUDE.md, perform [ARCH-ID]: [description].
This is a structural change only — do not alter behavior.
After refactoring, verify all existing features still work by tracing the call graph.
```

---

*Last updated: 2026-04-27 | Observed from: https://zohn-sports-stats.pages.dev | Author: Claude*
