# SportStrata Landing Page — Gap Analysis vs. Industry Standard (ESPN)

**Purpose:** Documentation for Claude Code. This compares sportstrata.cc's home landing page against ESPN.com's homepage patterns and defines a prioritized roadmap to close the gap toward an industry-standard sports landing page — while preserving SportStrata's analytics-first identity.

**Audit date:** July 12, 2026
**Reference screenshots:** ESPN.com homepage vs. SportStrata home (both captured same day)

---

## 1. What SportStrata Already Does Well (Do Not Regress)

These are strengths relative to ESPN. Protect them in any redesign:

- **Score ticker with finals** at the top — comparable to ESPN's, and cleaner (no ad interruptions mid-ticker).
- **Probable pitchers on game cards** — ESPN's homepage doesn't surface this. It's a genuine analytics differentiator.
- **Pennant Races strip** (division leaders, games back, division odds %) — no ESPN homepage equivalent. This is a signature module; make it more prominent, not less.
- **Prominent search** ("Search 900+ MLB players, teams…") with keyboard shortcut hint — ESPN buries search in the corner.
- **Sport status cards** (MLB Regular Season / NFL Draft Season / NCAAF Preview) — good seasonal orientation.
- **Zero ad clutter** — currently a UX advantage; monetization (Section 7) must be added carefully to preserve this feel.
- **Consistent dark theme** — distinct visual identity vs. ESPN's white/red.

**Design principle for everything below:** SportStrata should not become an ESPN clone (editorial-first). It should become the analytics-first equivalent — every module ESPN fills with *stories*, SportStrata fills with *data narratives*.

---

## 2. Gap Analysis Summary

| Element | ESPN | SportStrata | Gap Severity |
|---|---|---|---|
| Hero / featured module | Large editorial hero w/ image, headline, byline | None — page opens with search bar | 🔴 Critical |
| Live game states | Live scores, AET/Final states, win prob in ticker | Cards show "–" until game starts; no live treatment visible | 🔴 Critical |
| News / headlines | "Top Headlines" sidebar (9–10 items, timestamped) | News exists in nav but absent from landing page | 🔴 Critical |
| Imagery | Photos on every story card | Zero images anywhere | 🟠 High |
| Visual hierarchy | Clear F-pattern: hero → secondary cards → rail | Uniform density; every module same visual weight | 🟠 High |
| Personalization | Favorites, "SportsCenter For You" | None — no favorite team pinning | 🟠 High |
| Monetization surfaces | Display ads, ESPN+ upsell, subscribe CTAs | None | 🟡 Medium (ties to premium tier plans) |
| Multi-sport ticker | Cross-sport (World Cup, MLB, tennis) w/ category filter | MLB-only finals | 🟡 Medium |
| Footer / SEO content | Full sitemap footer, deep links | Not visible / minimal | 🟡 Medium |
| Bylines / freshness signals | "32m • Author" timestamps everywhere | No freshness indicators | 🟡 Medium |

---

## 3. Critical Priority — Above-the-Fold Restructure

### 3.1 Hero Module ("Data Story of the Day")

**Problem:** ESPN's page opens with a focal point (Argentina 3–1 Switzerland, hero photo, headline). SportStrata opens with a search bar and three identical status cards — nothing tells the user what matters *today*.

**Build:** A hero module that auto-selects the day's most significant data narrative:

- **Selection logic (priority order):**
  1. Live game with highest leverage (closest score × latest inning × playoff implications)
  2. Upcoming marquee matchup (best combined pitcher WAR, division rivals, streak on the line)
  3. Yesterday's most statistically anomalous performance (e.g., player exceeded xwOBA expectation by largest margin)
- **Layout:** ~60% width, left-aligned. Large stat visualization or team matchup graphic (see 4.1 — no licensed photos needed), auto-generated headline ("TEX–HOU: Javier vs. Gore with the AL West lead 1.5 back"), one-line data hook, timestamp.
- **This replaces nothing** — search bar moves below hero or into the sticky header.

### 3.2 Live Game States

**Problem:** Game cards show "–" for scores pre-game. During games, the landing page must feel *alive* — this is the #1 reason users return to ESPN mid-day.

**Build:**
- Three card states: `UPCOMING` (current design), `LIVE`, `FINAL`.
- `LIVE` card requirements: score, inning + half (▲7 / ▼3), outs indicator, base state (diamond icon), current pitcher/batter, and **live win probability %** — the analytics angle ESPN's homepage lacks.
- Visual treatment: subtle pulsing border or "LIVE" badge in accent orange; live cards auto-sort to the front of the Today's Games grid.
- Polling/WebSocket refresh ≤30s for live cards. (Reuse existing live data infra from the Live Game Expanded View spec if applicable.)
- Ticker parity: ticker should show live games with inning state, not just finals.

### 3.3 Headlines / Insights Rail

**Problem:** ESPN's right rail ("Top Headlines") delivers 9–10 scannable items — massive engagement surface. SportStrata's landing page has no news despite having a News section.

**Build:** Right rail (desktop) / below-fold section (mobile) with two tabs:
- **Headlines:** Pull top 8–10 items from the existing News pipeline, each with relative timestamp ("32m ago"). Link into News section.
- **Insights (differentiator):** Auto-generated stat bullets — "Misiorowski's whiff rate up 6pts over last 3 starts," "TB bullpen leads AL in WPA since June 1." These can be templated from the analytics DB; no editorial staff required.

---

## 4. High Priority — Visual Hierarchy & Identity

### 4.1 Imagery Without Licensing Costs

ESPN uses wire photos; SportStrata can't (Getty licensing is expensive). Alternatives, in order of preference:

1. **Generated data graphics** — matchup cards with team colors/logos, spray charts, win probability sparklines. On-brand and free.
2. **Team logo lockups** — already in use on game cards; scale up for hero (e.g., split-diagonal two-logo hero background).
3. **MLB headshot API** — player headshots are available via MLB's static content endpoints (verify current terms of use before shipping).

**Rule:** Every module above the fold should have at least one visual element that isn't text. Currently the page is ~100% typography.

### 4.2 Break Uniform Density

ESPN's page has 4–5 distinct visual weights (hero > secondary story > headline list > ticker > quick links). SportStrata has essentially one.

- Hero module: largest, one per page.
- Today's Games: keep grid, but live games get 1.5× card size or front-sorted with badge.
- Pennant Races: promote from thin strip to a visualized module (mini bar charts of division gaps) — it's a signature feature rendered like an afterthought.
- Sport status cards (MLB/NFL/NCAAF): demote to compact pills or tabs; they currently occupy premium real estate to say very little.

### 4.3 Freshness Signals

Add timestamps everywhere data appears: "Updated 2m ago" on scores, "as of today's games" on standings/odds. ESPN does this on every story; it builds trust that the page is current — critical for an analytics product.

---

## 5. High Priority — Personalization

ESPN offers "SportsCenter For You" and favorites. For SportStrata:

- **Favorite team selection** (localStorage first; account-based when auth exists).
- Effects: favorite team's game pinned first in ticker and grid; hero selection logic weights favorite team; headlines rail filters a "My Team" tab; pennant race strip defaults to favorite team's division.
- Low-effort MVP: a star icon on any game card → persists to localStorage → reorders on next visit. Ship this before building accounts.

---

## 6. Medium Priority

### 6.1 Multi-Sport Ticker Readiness
NFL/NCAAF tabs exist but the ticker is MLB-only. Architect the ticker as sport-agnostic now (score object schema with `sport`, `status`, `period`, `clock`) so NFL season doesn't require a rewrite. Add a "Top Events" style filter dropdown like ESPN's when 2+ sports are live.

### 6.2 Monetization Surfaces (aligns with premium tier roadmap)
- Reserve **two ad slots**: one 970×250 leaderboard below the hero, one 300×600 in the right rail below headlines. Build them as feature-flagged placeholder components now so layout doesn't reflow when ads ship.
- **Premium upsell card** in the right rail (ESPN's "Sign Up Now" pattern): tease a premium-only insight ("Unlock full win probability history →").
- Do NOT interrupt the ticker or game grid with ads — preserve the clean-data advantage.

### 6.3 Footer & SEO
- Full footer: links to every team page, standings, analytics tools, about, contact (LLC name when formed), privacy/terms.
- Landing page `<title>`/meta should be dynamic-date aware ("MLB Scores & Analytics — July 12, 2026") for freshness in SERPs.
- Server-render (or pre-render) the headlines and games grid — an SPA that ships an empty shell to crawlers will never rank against ESPN. If the SPA is client-only today, this is the single biggest SEO lever available.

### 6.4 Navigation Polish
- Sticky header on scroll (ESPN's ticker + nav persist).
- Add subtle hover states and an active-page indicator in the nav (Players/Teams/Standings/Analytics/News).
- Settings gear is orphaned top-right — fold it into a profile/settings menu that will later hold favorites + account.

---

## 7. What NOT to Copy from ESPN

- **Ad density** — ESPN runs the same Barclays creative twice above the fold. This is a weakness, not a standard.
- **Editorial dependence** — don't build a newsroom; build templated data narratives (3.3 Insights).
- **Autoplay video** — engagement-hostile, hurts Core Web Vitals.
- **Cluttered quick links rail** — ESPN's left rail is legacy cruft. SportStrata's cleaner layout is better.

---

## 8. Suggested Implementation Order

| Phase | Items | Rationale |
|---|---|---|
| 1 | 3.2 Live game states + ticker live parity | Highest engagement ROI; core product credibility |
| 2 | 3.1 Hero module | Fixes the "no focal point" problem above the fold |
| 3 | 3.3 Headlines + Insights rail | Fills the dead right side; reuses existing News pipeline |
| 4 | 4.2 Density/hierarchy pass + 4.3 freshness timestamps | Mostly CSS/layout; do alongside Phase 2–3 |
| 5 | 5 Favorites MVP (localStorage) | Small build, big retention lever |
| 6 | 6.3 SEO/footer + 6.1 ticker schema refactor | Foundation work before NFL season traffic |
| 7 | 6.2 Monetization placeholders → live ads/premium | After traffic and layout stabilize |

---

## 9. Acceptance Criteria (per phase, for Claude Code)

- **Phase 1:** During any live MLB game, landing page shows score/inning/outs/base-state within 30s of reality; live cards sorted first; no layout shift when cards change state.
- **Phase 2:** Hero renders one of the three selection-logic cases on every load; degrades gracefully on days with no games (falls back to standings/odds narrative).
- **Phase 3:** Rail shows ≥8 headline items with relative timestamps; Insights tab renders ≥3 templated stat bullets from live DB queries.
- **Phase 4:** Lighthouse CLS < 0.1 maintained; visual regression screenshots approved for desktop (1440px) and mobile (390px).
- **Phase 5:** Favorite persists across sessions; reorder verified in ticker + grid.
- **Phase 6:** View-source (no JS) contains today's games and headlines; footer links crawlable.
- **Phase 7:** Ad slots render behind feature flag with zero CLS when toggled.

---

*Cross-references: Live Game Expanded View spec (live data infra reuse), THEME_REVIEW.md (14 themes — hero module must be tested against all active themes), improvements.md (merge Phase list into existing backlog rather than duplicating).*
