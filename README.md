# SportStrata

**Serious stats for serious fans.**

A free, no-login sports analytics platform — deep MLB analytics plus a full NFL
draft-and-stats suite — built as a vanilla JavaScript SPA with **no framework and
no build step**. Content pages are edge-prerendered on Cloudflare so the site is
fully indexable by search and AI crawlers.

**Live:** [https://sportstrata.cc](https://sportstrata.cc)

---

## What it is

Two products under one roof (the "barbell"): **MLB** — the deepest surface, live
all season — and **NFL** — a public beta centered on year-round fantasy draft
tools. No accounts, no paywall, no ads. Every computed number shows its
provenance — "the receipt" — so broadcast professionals can trust and cite it.

- **MLB** — primary product, full depth.
- **NFL** — public beta: live scores/standings/teams in season, historical stat
  leaders back to 2000, Next Gen Stats, and a no-login Mock Draft simulator + Draft HQ.
- **NBA / NHL** — preview only (accessible, no active feature work).

---

## MLB

### Players & leaderboards
- Hitters and pitchers with client-computed advanced rates (ISO, BABIP, FIP,
  K-BB%, wOBA, wRC+); position filter, favorites, recently viewed.
- Leaderboards across hitting and pitching, plus Statcast leaderboards (xBA,
  xSLG, xwOBA, EV, Barrel%, HH%, Whiff%, CSW%, K%, BB%).
- League-rank badges on individual player stats (top-30 MLB).

### Player detail
- Season stats + computed advanced rates; Statcast percentile card (Baseball Savant).
- Pitch arsenal for pitchers; career year-by-year table with trend chart.
- Splits (L/R, Home/Away, L7/L14/L30, month-by-month); spray chart; H2H matchup card.
- Two-player side-by-side compare (stat bars, radar overlay, shareable URL).

### Game prep (broadcast)
- Probable-pitcher cards, team batting/pitching comparison, handedness splits,
  park factor, key hitters, bullpen tracker, weather, and pitcher-vs-team history.
- Printable game-prep sheet (`⌘P`).

### Scores, live games & scorecard
- Date navigation, linescore, box score, probable pitchers.
- Live Game expanded view — diff-based linescore polling, play-by-play, box score.
- Baseball Scorecard — interactive historical + live modes, PNG export.

### Teams & standings
- Team drill-down — roster, aggregate stats, upcoming schedule, IL status, and a
  **Playoff Odds** hero stat.
- Standings with L10 form, run differential, power rankings, magic numbers, and
  **October Odds** (DIV% / OCT%).

### Playoff odds, Ask bar & intelligence without metered inference
- **October Odds** — client-side Monte Carlo (4,000 simulated seasons) division
  and playoff odds, updated daily; surfaced on standings, team detail, and the home page.
- **Ask bar (⌘K)** — natural-language stat queries ("hr leaders", "dodgers ops",
  "era leaders min 50 ip") answered by a deterministic grammar over the stat
  engine — instant, no model, zero inference cost.
- **Stat Builder** — custom stat formulas (math.js, lazy-loaded).
- **Shareable stat cards** — branded 1200x630 PNG cards for any leaderboard stat.

---

## NFL (public beta)

- **Season-aware home** — draft-season hero with a kickoff countdown in the
  offseason; live gameweek in season.
- **Scores, standings, teams** — live from ESPN; multi-season.
- **Stat leaders back to 2000** (ESPN) and **Next Gen Stats, 2016+** (nflverse).
- **Player & team pages** — profiles, season stats, game logs, advanced metrics.
- **Draft HQ** — rankings, a VORP-based value board (rookie-inclusive,
  market-implied projections), tiers, and strength-of-schedule.
- **Mock Draft simulator** — no-login snake draft against ADP-based AI opponents,
  Monte Carlo pick-survival, roster grade, Superflex (Sleeper ADP data).

The NFL season model auto-rolls every year — no hardcoded season in client copy.

---

## Intelligence without metered inference

"AI" ships from three free places (see `DECISIONS.md` D-039), so nothing meters
per user action and one viral day never decides the bill:

1. **Authoring time** — generated in subscription-covered sessions, committed as static data.
2. **Training time** — models fit offline, shipped as coefficient JSON evaluated client-side.
3. **Client time** — the user's own compute (Monte Carlo, the Ask-bar grammar).

Shipped today: the Ask bar and October Odds. On the roadmap: trained
rest-of-season projections and player-similarity comps.

---

## SEO & discoverability

The app is a hash-routed SPA, but key content is **also served at real,
crawlable path URLs** via Cloudflare Pages Functions that return prerendered
HTML (title, description, canonical, JSON-LD, and a content snapshot) to every
client, then hydrate into the SPA for humans — no user-agent sniffing.

- `/mlb/team/{abbr}` · `/mlb/player/{id}/{slug}` · `/mlb/standings` (edge-prerendered)
- Static landing pages: `/mock-draft`, `/draft-kit`, `/playoff-odds`, `/ask`
- `sitemap.xml`, `robots.txt`, per-page 1200x630 Open Graph cards, and JSON-LD
  (`Organization`, `WebSite`, `SportsTeam`, `Person`, `Dataset`).

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla JS / HTML / CSS — ES2022+, no framework, no build step |
| Routing | Hash-based SPA + edge-prerendered path URLs |
| Charts | Chart.js 4 |
| Math | math.js (Stat Builder, lazy-loaded) |
| Export | html2canvas (scorecards, share cards; dynamic load) |
| Hosting | Cloudflare Pages + Pages Functions |
| Edge cache | Cloudflare D1 (MLB Stats API / Savant proxy) |
| Offline | Service worker (`sw.js`) — SWR for assets, network-first for navigation |

### Data sources
- **MLB Stats API** (`statsapi.mlb.com`) — free, no key.
- **Baseball Savant** — Statcast percentiles, leaderboards, arsenals.
- **ESPN public API** — NFL scores/standings/teams/stats; NBA/NHL preview.
- **Sleeper** — NFL players, ADP, trending (`/api/sleeper`).
- **nflverse** (CC-BY-4.0) — NFL Next Gen Stats.
- **Open-Meteo** — game-prep weather.

No secret ever lives in committed source; provider keys go through Cloudflare
Worker/secrets.

---

## Getting started

No build step. Serve the folder with any static server for the MLB surface:

```bash
npx serve .
# or
python -m http.server 3001
```

MLB features work with **zero configuration** — the MLB Stats API is free and
keyless. The NFL surface reads through the `/api/*` Pages Functions
(ESPN / Sleeper / nflverse), so to exercise it locally run it under Pages:

```bash
npx wrangler pages dev .
```

---

## Project structure

```
/
├── index.html                 # SPA shell — script load order, 3-row header, CSP meta
├── sw.js                      # Service worker (versioned cache; bump per deploy)
├── _headers                   # Cloudflare Pages — CSP + security headers (mirror index.html CSP)
├── manifest.json              # PWA manifest
├── sitemap.xml / robots.txt   # SEO
├── mock-draft.html · draft-kit.html · playoff-odds.html · ask.html   # static SEO landing pages
├── css/                       # variables (tokens) · main · components · ticker · animations
│                              #   scorecard · liveGame · shareCard · nflStandings · nflLiveGame · arcade
├── js/
│   ├── config · errorHandler · cache · schema · api · glossary   # core + AppState + utilities
│   ├── mlb · odds · scorecard · liveGame · shareCard · statBuilder · query   # MLB surface + October Odds + Ask bar
│   ├── nfl · nflStandings · nflLiveGame · fantasy · sos          # NFL surface + Mock Draft + Draft HQ
│   ├── players · leaderboards · teams · games · playerDetail     # NBA preview
│   ├── nhl · arcade · news · charts · standings · db             # NHL preview, arcade, shared
│   ├── search · navigation · app                                 # ⌘K, routing/sport switch, bootstrap
│   └── math.min.js                                               # vendored (lazy-loaded by Stat Builder)
├── functions/
│   ├── api/                   # Pages Functions: mlb, nfl, sleeper, nflstats, nfladv, nflplayer,
│   │                          #   nflgamelog, nflcareer, nflstandings, nflsos, nflsearch, news …
│   │                          #   (_middleware.js rate-limits /api/*)
│   └── mlb/                   # edge-prerender routes: team/[abbr], player/[id]/[[slug]], standings
├── worker/                    # Cloudflare Workers (bdl-proxy; broadcast-blurb is deferred)
├── migrations/                # D1 schema (accounts groundwork — not yet launched)
├── tools/                     # check-manifest · check-themes · join-health (the /deploy-check suite)
├── tests/                     # node --test: stats · odds · query · vbd
└── assets/                    # icons, OG cards, theme images
```

Deeper docs live at the repo root: `CLAUDE.md` (architecture + conventions),
`DESIGN.md` (house style), `DECISIONS.md` (ADR log), `GOALS.md`, `ISSUES.md`.

---

## Development

- **Tests:** `node --test tests/stats.test.js tests/odds.test.js tests/query.test.js tests/vbd.test.js`
- **Pre-deploy:** run the `tools/` checks (delivery-manifest sync, theme contrast,
  name-join health) — bundled as the `/deploy-check` routine. Never add a JS/CSS
  file without adding it to **both** `index.html` and `sw.js`.
- **Adding an external domain** requires updating **both** the CSP `<meta>` in
  `index.html` and `_headers`.
- Bump `CACHE_NAME` in `sw.js` on every deploy so returning clients get fresh code.

---

## Deployment

Hosted on **Cloudflare Pages** (static assets + Pages Functions).

1. Push to GitHub; Cloudflare Pages builds automatically.
2. Build command: *(none)*; output directory: `/`.
3. `_headers` applies CSP and security headers; `functions/` deploy as Pages Functions;
   the MLB edge cache uses a D1 binding (`DB`).

---

## License

MIT
