> **ARCHIVED 2026-07-06** — point-in-time document, preserved for history. It reflects the project at its original date and is now superseded: current direction lives in GOALS.md and DECISIONS.md, architecture in CLAUDE.md. Do not treat as current.

---

# analysis.md

# SportStrata – Claude Code Improvement Specification

## 1. Project Overview

**Current URL:** `https://zohn-sports-stats.pages.dev`  
**Tech Stack:** Static HTML/CSS/JS, client‑side rendering, external MLB API consumption (statsapi.mlb.com, baseballsavant.mlb.com)  
**Primary Issues:** Broken navigation, missing data on key tabs (Standings, Team pages), CORS failures, poor mobile experience, state management bugs, and missing core features that competitors offer.

**Goal:** Transform SportStrata into a reliable, fast, competitive MLB analytics platform with unique gamification and personalization features.

---

## 2. Critical Bug Fixes (Priority 1)

### 2.1 Unusable Responsive Layout
- **Problem:** Desktop‑only CSS breaks on mobile/tablet. Content overflows, columns collapse incorrectly.
- **Solution:**  
  - Replace custom CSS with **TailwindCSS** (or rewrite with CSS Grid + flexbox and proper `@media` queries).  
  - Implement a mobile‑first breakpoint system:  
    - `sm:` (640px) – single column, collapsed navigation menu.  
    - `md:` (768px) – two columns for tables.  
    - `lg:` (1024px) – full desktop layout.  
  - Add a responsive `<select>` dropdown for tab navigation on small screens.

### 2.2 “Loading players…” Loop on Players Tab
- **Root cause:** Race condition or unresolved promise. `loadingPlayers` state never flips to `false` after API error or empty response.
- **Fix:**  
  - Wrap all data fetches in `try/catch` with a final `finally` block that sets `loading = false`.  
  - Add a timeout (e.g., 10s) to force‑reset loading state.  
  - Display a specific error message when fetch fails, not an eternal spinner.

### 2.3 Standings & Team Pages Build Failure
- **Problem:** Route `/standings` and `/team/:id` return generic “Build Failed” because of unhandled API exceptions.
- **Solution:**  
  - For Standings: fetch from `statsapi.mlb.com/api/v1/standings?leagueId=103,104` (AL/NL) and display division tables.  
  - For Team page: fetch `statsapi.mlb.com/api/v1/teams/{teamId}` and roster endpoint.  
  - Implement error boundaries (e.g., `<ErrorFallback />`) to show “Unable to load data – try again later” instead of build failure.

### 2.4 Global Navigation Failures
- **Problem:** “Home” and “Scores” links either do nothing or point to dead routes.
- **Fix:**  
  - Rewrite routing to use **hash‑based navigation** (e.g., `#players`, `#standings`) or a lightweight router that updates content without page reload.  
  - Ensure each tab’s URL can be bookmarked and back/forward works correctly (see State Persistence below).

### 2.5 “Hot Right Now” Stale Data
- **Problem:** Player cards often show old or incorrect stats.
- **Solution:**  
  - Invalidate cache every 60 minutes for the “hot” list.  
  - Calculate “hotness” using last 7/15 days of weighted stats (wOBA, ERA, etc.).  
  - Add a timestamp on the widget: “Updated 5 min ago”.

### 2.6 Modal Focus Trap & Rendering Glitches
- **Problem:** Keyboard focus stuck in FAQ modal; Chrome/Edge rendering artifacts on Windows.
- **Solution:**  
  - Use inert polyfill or native `inert` attribute when modal is closed.  
  - For jagged text, add `-webkit-font-smoothing: antialiased` and `transform: translateZ(0)` to headers.  
  - Ensure FAQ modal close button is first focusable element on open.

### 2.7 Print‑Ready View Column Alignment
- **Problem:** Exported game prep view cuts off columns.
- **Fix:**  
  - Create a separate `@media print` stylesheet that forces full width, removes interactive elements, and sets table layout to `fixed` with percentage widths.

### 2.8 Dark Mode Theme Inconsistencies
- **Problem:** Percentile circles remain in light mode.
- **Solution:**  
  - Use CSS custom properties (variables) for background/border colors.  
  - Ensure dark mode class triggers variable overrides for all chart elements.

---

## 3. Technical Improvements (Priority 2)

### 3.1 Proxy API to Bypass CORS
- **Current:** Direct browser calls to `statsapi.mlb.com` are blocked by CORS.  
- **Solution:** Deploy a **Cloudflare Worker** (or simple Netlify function) that proxies requests:
  ```javascript
  // worker.js example
  addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const proxyUrl = `https://statsapi.mlb.com${url.pathname}${url.search}`;
    event.respondWith(fetch(proxyUrl));
  });
Change frontend API base URL to /api/proxy?endpoint=....

3.2 Server‑Side Rendering (SSR) or Static Generation
Problem: Long initial “Loading…” because all data is client‑fetched.

Approach: Migrate to Astro (static + islands) or Next.js (SSG/SSR hybrid).

Minimum viable: Pre‑render the layout and first view (e.g., default tab) on the server. Remaining tabs hydrate client‑side.

3.3 State Persistence with URL Parameters
Solution: Use URLSearchParams to store filters, search queries, and active tab.

Example: ?tab=players&search=Judge&sort=avg&order=desc.

On page load, read params and restore state.

Update URL without full refresh using history.pushState.

3.4 Robust Caching Strategy
Implementation:

Cache API responses in IndexedDB (via idb library) with TTL.

Cache key = endpoint + query string.

TTL: 5 minutes for live game data, 1 hour for standings, 24 hours for team info.

Show stale‑while‑revalidate indicator: “Showing data from X minutes ago – refreshing”.

3.5 Error Boundaries & Graceful Degradation
Wrap each major component (PlayersTable, Standings, TeamView) in a custom error boundary:

javascript
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div>⚠️ Failed to load. Retry?</div>;
    return this.props.children;
  }
}
4. New Features to Build (Priority 3)
4.1 Head‑to‑Head Player Compare
UI: Two searchable dropdowns.

Metrics displayed: AVG, HR, RBI, OPS, xwOBA, Barrel%, K%, BB%, WAR.

Visual: Side‑by‑side bar charts using Chart.js or D3.

Implementation: Fetch both players’ season stats from /people/{id}/stats and /statcast endpoints.

4.2 Spray Chart & Pitch Heat Map
Data source: Baseball Savant’s Statcast CSV endpoints (via proxy).

UI: Embed an <iframe> to Savant’s public heat maps, or use CanvasJS to draw pitch locations.

Feature: Toggle between hitter spray chart and pitcher zone command.

4.3 “My SportStrata” Personalized Dashboard
Functionality:

Users can “star” players (localStorage or optional account).

Pinned players appear at top of leaderboards and a dedicated “Favorites” tab.

Show real‑time game log only for favorite players.

Storage: IndexedDB or localStorage with sync to backend if user registers.

4.4 AI Game Summaries (Generative AI)
Data Input: Raw play‑by‑play from statsapi.mlb.com/api/v1/game/{gamePk}/playByPlay.

LLM Backend: Use OpenAI GPT‑4o mini or a local fine‑tuned model (via Cloudflare Workers AI).

Output: “The Yankees jumped ahead early on a Judge 2‑run HR. Cole struck out 10 over 7 innings…”

Cache summaries per game to avoid repeated API costs.

4.5 Fantasy League Sync (Yahoo / ESPN)
OAuth Flow: Allow users to connect ESPN or Yahoo fantasy account.

Data fetched: Roster, opponent, scoring settings.

Feature: Weekly matchup projection based on SportStrata’s advanced metrics.

Implementation: Use each platform’s API (Yahoo Fantasy Sports API, ESPN private API via reverse‑engineering libraries like espn‑fantasy‑api).

4.6 Pitcher vs. Hitter Matchup Database
Input: Select a batter and a pitcher.

Output: Career head‑to‑head stats (AB, H, HR, K, BB) plus Statcast metrics like launch speed and xBA in those matchups.

Data source: Combine statsapi /people and Statcast search. Cache results.

4.7 CSV/JSON Export & REST API
Export: Add a “Download as CSV” button on every table (Players, Standings, etc.).

API (future): Rate‑limited public endpoints returning JSON for power users.

5. Differentiation Strategy (From Competitors)
5.1 Gamification – Daily Quests
Concept: Users receive a new quest each day:

“Find a batter with xBA > .300 and K% < 15%”

“Which pitcher has the highest whiff rate on sliders?”

Rewards: Badges, streak counters, leaderboard.

Implementation:

Predefine quest templates and randomly pick one per day.

Verify completion client‑side (or server side for integrity).

Store user progress in localStorage / optional backend.

5.2 “Bloomberg Terminal” Aesthetic & Professional Branding
Visual style: High contrast, dark background, green/red market‑style deltas, monospaced fonts for stats.

Unique selling point: “Serious stats for serious fans” – no ads, no fluff.

Components:

Stock‑ticker like live updates for scores.

Data grids with resizable columns (like Ag‑Grid).

5.3 Automated Scouting Reports (One‑click)
Button: “Generate Scouting Report” on any player page.

Logic: Extract percentile ranks for exit velocity, sprint speed, etc., and write natural language summary:

“Elite power (98th percentile EV), but struggles with breaking balls (32nd percentile whiff%).”

Model: Can be template‑based or GPT.

5.4 Flawless Print‑Ready Game Prep
Promise: Every printed page is perfectly formatted for coaches, bettors, and beat writers.

Implementation:

Dedicated “Print View” mode that strips all interactive elements, uses large fonts, avoids wasted space.

Auto‑pagination of long tables.

5.5 Multi‑Sport Roadmap (Future)
Announce: SportStrata will add NHL (hockey) and NBA (basketball) using identical UI patterns.

Tech preparation: Refactor data fetching to be sport‑agnostic (adapter pattern for each league’s API).

6. Implementation Roadmap (Claude Code Execution Order)
Week 1 – Stability & Core Bug Fixes
Fix “Loading players…” loop (add try/catch, timeout).

Repair Standings and Team pages (error boundaries + API fallback).

Correct navigation links (home, scores, tab switching).

Patch modal focus trap and dark mode percentile circles.

Week 2 – Technical Backend Proxy & Caching
Deploy Cloudflare Worker to proxy MLB API (resolve CORS).

Implement IndexedDB caching for all API responses.

Add URL state persistence (filters, search, tab).

Week 3 – Responsive Design & Print Styling
Replace CSS with Tailwind + mobile‑first breakpoints.

Create print‑ready stylesheet for game prep view.

Test on real devices (iPhone, iPad, various Android).

Week 4 – Core New Features
Build Head‑to‑Head Compare tool.

Add “My SportStrata” (localStorage favorites).

Implement CSV export for all tables.

Week 5 – Differentiation Features
Daily quests system (gamification).

Automated scouting report button (template version).

Professional “Bloomberg” theming and layout polish.

Week 6 – AI & Advanced Integrations
AI game summaries (integrate OpenAI or Cloudflare AI).

Fantasy sync (Yahoo/ESPN OAuth proof‑of‑concept).

Pitcher vs. hitter matchup database.

7. Code Examples for Claude
7.1 Proxy Worker (Cloudflare)
javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = `https://statsapi.mlb.com${url.pathname}${url.search}`;
    const response = await fetch(targetUrl);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(response.body, { status: response.status, headers: newHeaders });
  }
}
7.2 Tailwind Config for Responsive Tables
javascript
// tailwind.config.js
module.exports = {
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
    },
  },
}
7.3 Caching with IndexedDB (idb)
javascript
import { openDB } from 'idb';

const dbPromise = openDB('SportStrataCache', 1, {
  upgrade(db) {
    db.createObjectStore('api', { keyPath: 'url' });
  },
});

async function getCachedOrFetch(url, ttl = 300000) {
  const db = await dbPromise;
  const cached = await db.get('api', url);
  if (cached && (Date.now() - cached.timestamp) < ttl) {
    return cached.data;
  }
  const response = await fetch(url);
  const data = await response.json();
  await db.put('api', { url, data, timestamp: Date.now() });
  return data;
}
7.4 Daily Quest Example (Client‑side)
javascript
const quests = [
  { id: 1, text: "Find a batter with xBA > .300 and K% < 15%", check: (player) => player.xBA > 0.300 && player.Kpct < 15 },
  { id: 2, text: "Which pitcher has the highest whiff% on sliders?" , check: (leaderboard) => leaderboard[0].pitcher }
];
const todayQuest = quests[Math.floor(Math.random() * quests.length)];
localStorage.setItem('dailyQuest', JSON.stringify({ ...todayQuest, date: new Date().toDateString() }));
8. Success Metrics
After implementing the above:

Bug reduction: Zero “Build Failed” errors, “Loading players…” does not stall >5s.

Performance: First meaningful paint <1.5s (cached) and <3s (cold).

Mobile usability: Lighthouse mobile score >80.

User engagement: Daily active users increase by 30% after gamification.

Differentiation: Unique features (quests, scouting reports, print ready) mentioned in user feedback.

9. Final Notes for Claude Code
Use incremental delivery – fix one bug or feature at a time and test thoroughly.

Prefer vanilla JavaScript with progressive enhancement; only introduce React/Astro if necessary for state complexity.

Write unit tests for caching and error boundaries.

Document all new API proxy endpoints in a README.md.