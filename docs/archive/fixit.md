# SportsStrata — fixit.md
> Claude Code improvement prompts. Run these one at a time. Each is scoped to a single concern.

---

## 🔴 Priority 1 — Loading & First Impression

### Skeleton Loaders
```
Replace all "Loading…" text placeholders in the Players, Scores, and Standings
sections with animated skeleton cards. Each skeleton should match the exact
dimensions of the real card it replaces (same height, same column layout).
Use a CSS shimmer animation: a gradient that sweeps left-to-right on a
slightly lighter background than the card base. No external libraries.
Pure CSS keyframe animation. Remove the skeletons as soon as real data
populates, with a 150ms fade-in on the real content.
```

### Hash-Based Routing
```
Implement hash-based client-side routing across all nav sections (Players,
Leaders, Teams, Scores, Standings, Builder, Prep, Arcade). Each tab should
update window.location.hash when activated, e.g. /#/players, /#/scores.
On page load, read the hash and activate the correct tab automatically so
deep links and bookmarks work. Also update the <title> tag dynamically to
reflect the active section, e.g. "SportsStrata — Scores".
```

### Service Worker + Offline Cache
```
Add a service worker (sw.js) registered from index.html. On first load,
cache all static assets (HTML, CSS, JS, fonts). For API responses from the
stats data source, use a stale-while-revalidate strategy: serve the cached
response immediately, then fetch fresh data in the background and update
the cache. If the user is fully offline, show a subtle banner:
"Showing cached data — reconnect to refresh" rather than a broken state.
```

---

## 🟠 Priority 2 — Design Polish

### Live Score Ticker Pulse
```
On the top score ticker bar, identify games that are currently in-progress
(status === "live" or equivalent from the data source). For those games,
add a small pulsing green dot (CSS keyframe: opacity 1 → 0.3 → 1, 1.5s
infinite) before the score. Final scores should show in muted color.
Upcoming games show in normal color with the start time. No layout changes —
just layer in these status indicators.
```

### Card Hover Micro-animations
```
Add hover states to all player cards and stat cards across the app.
On hover: translate Y by -3px, increase box-shadow depth, and add a 1px
border glow using the existing accent color variable. Transitions should
be 150ms ease-out. Do not change any card dimensions or content — purely
CSS transform and shadow changes. Ensure reduced-motion media query
disables all transforms for accessibility.
```

### Tabular Number Alignment
```
Find every table and stat grid in the app. Apply font-variant-numeric:
tabular-nums to all cells containing numerical values. This ensures stat
columns align vertically regardless of digit count. Also audit for any
stat number that should be right-aligned in its column and correct those.
Do not change fonts — apply only the numeric variant and text-align fixes.
```

### Background Texture Layer
```
Add a subtle noise texture overlay to the main app background. Generate
an SVG noise filter or use a CSS background-image with a base64-encoded
4x4 PNG noise tile at 3-5% opacity, blended with the existing background
color using mix-blend-mode: overlay. The effect should be nearly invisible
but add tactile depth. Must not affect readability of any text or cards.
Test in both light and dark modes.
```

---

## 🟡 Priority 3 — Data Features

### Weather Overlay on Game Cards
```
For each game card in the Scores section, fetch current weather for the
stadium city using the Open-Meteo API (free, no key required):
https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit

Hardcode a lookup table of MLB stadium lat/lon coordinates. Display
wind speed + direction icon and temperature as a small secondary line on
each game card. For dome/retractable-roof stadiums, show "Dome" instead.
Cache weather per stadium for 30 minutes in sessionStorage to avoid
hammering the API.
```

### Player Stat Trend Sparklines
```
On each player's profile or card, add a small sparkline (inline SVG, no
library) showing their last 7 game performance for their primary stat
(batting average for hitters, ERA for pitchers). The sparkline should be
60px wide, 24px tall, rendered as a polyline with a subtle area fill.
Color the line green if the trend is positive, red if declining, gray if
flat. Tooltip on hover showing each game's value and date. Data should
come from the same source already powering player stats — just slice the
last 7 entries.
```

### Park Factors Badge on Player Cards
```
Add a "park factor" badge to player stat lines in the Prep section.
Use a hardcoded park factor table (hitter-friendliness score 0.85–1.15
for each MLB stadium based on 2024 data). When a player's upcoming game
is at a hitter-friendly park (>1.05), show a green "🏟 +" badge. At
pitcher-friendly parks (<0.95), show a red "🏟 −" badge. Neutral parks
show nothing. The badge should appear inline next to the player's name,
with a tooltip explaining the park factor on hover.
```

---

## 🟢 Priority 4 — Growth Features

### Share Card Export
```
Add a "Share" button to each player's stat panel. When clicked, use the
Canvas API (no html2canvas — native only) to render a styled 1200x630px
share card containing: player name, team, position, and their top 5 stats
for the current season in a clean two-column layout. Use the app's dark
theme colors and the SportsStrata logo/wordmark. Trigger a PNG download
via a temporary <a> element with download attribute. Label the button
with a share icon. Keep the implementation in a single exportShareCard(playerData)
function in a new share.js module.
```

### Daily "Statdle" Game (Arcade)
```
Build a daily player-guessing game in the Arcade tab. Each day (keyed by
date in localStorage), a random MLB player is selected as the answer.
The user sees 5 blank stat lines revealed one at a time (5 guesses max).
Each stat line shows: G, AB, HR, RBI, AVG for a single recent game.
After each guess, show correct/incorrect feedback. On win or loss, show
the player's name, headshot (via ESPN CDN pattern), and a shareable result
emoji grid (like Wordle). Seed the daily player deterministically from
the date so all users get the same puzzle. Store win/loss streak in
localStorage. Wire this to the existing Arcade tab — no new pages.
```

### SEO Meta Tags via Router
```
In the hash-based router, add a updateMeta(section, detail) function that
sets the following tags dynamically whenever the route changes:
- <title>: "SportsStrata — {Section Name}"
- <meta name="description">: a short description per section
- <meta property="og:title"> and <meta property="og:description">
- <meta property="og:url"> with the current hash URL
- <link rel="canonical"> pointing to the hash URL

For player profile views, include the player name in the title and
description. For the default/home state, use generic SportsStrata branding.
All tags should already exist in <head> on load — the router just updates
their content attributes.
```

---

## ⚙️ Priority 5 — Builder Tab (DFS Optimizer)

### Salary Cap Lineup Optimizer
```
In the Builder tab, add a DFS mode toggle for DraftKings and FanDuel formats.
When enabled:
1. Show a salary input next to each player (default populated if you have
   salary data; otherwise manual entry)
2. Add a salary cap display (DK: $50,000 / FD: $35,000) with a running
   total as players are added
3. Add an "Optimize" button that uses a greedy knapsack algorithm to find
   the highest projected-stat lineup within the cap from the user's
   starred player pool
4. Highlight cap violations in red, show remaining salary in green/yellow/red
   based on headroom

Implement the optimizer as a pure function optimizeLineup(players, cap, slots)
in builder.js. No external libraries.
```

---

## 🏁 Stretch — Custom Domain Setup

```
The app is deployed on Cloudflare Pages at zohn-sports-stats.pages.dev.
Generate a step-by-step checklist (as a new DOMAIN.md file) for pointing
a custom domain like sportstrata.gg or sportstrata.io to this deployment.
Cover: purchasing the domain, adding it in the Cloudflare Pages dashboard,
DNS propagation, SSL cert (auto via Cloudflare), and updating any hardcoded
URLs in the codebase. Also add a _redirects file to the project root that
redirects the old .pages.dev URL to the custom domain with a 301.
```

---

> **Usage tip:** Paste each prompt block directly into Claude Code from the project root. Run them sequentially — some later prompts (Statdle, Share Card) assume the router and skeleton work is already in place.
