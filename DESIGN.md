# SportStrata — DESIGN.md
**The house style, written down and enforceable. Owner: Kael. Maintained with Folio. (D-040 3b, 2026-07-03)**
This page is what visual review checks against. If a change violates a rule here, either the change is wrong or this page gets amended in the same commit — never neither.

---

## Posture

Broadcast-grade authority with zero premium friction. The reference is **Baseball Savant crossed with a broadcast lower-third system** — dense, legible, trustworthy. A professional data tool that happens to be free.

When a user finishes any interaction they should feel *capable and informed*, never marketed to. We are not a consumer sports app, not a fantasy casino, not a gradient-soaked AI product. If a design choice would look at home in a sportsbook promo, it's wrong here.

## The brand is the default dark theme

Orange-gold (`--accent #ff8100`) on deep navy, Barlow numerals, minimal chrome — that is SportStrata's face. There is no "brand refresh" to chase; there is only sharpening this.

- The **City Connect themes are collectibles** — opt-in flavor, frozen at the current set (D-038). They are never the argument; the default is.
- **The wordmark is never themed.** The brand icon may wear team colors (jersey rule); "SportStrata" does not (D-038 identity rule).
- Light mode is a first-class citizen, not an afterthought — every new component ships verified in both.

## Color is a language with a small vocabulary

All color through `css/variables.css` tokens — a hex literal in a style attribute is a defect (tracked debt: D-038 K3). The vocabulary:

- **Accent** (`--accent`) means *SportStrata is speaking*: primary actions, active nav, the brand. Scarcity is what makes it audible.
- **Stat-category colors** mark *category, never importance* (2026-05-17 rule). A number is never colored to shout.
- **Semantic trio:** `--color-win` green, `--color-loss` red, `--color-live` amber — states, nowhere else. Thresholded values (odds ≥75%, streaks) may borrow win/loss; decoration may not.
- **Border = identity, badge = state** (D-038 K2). Card borders belong to teams; liveness/status lives in badges and glows. Never encode state in the border channel.
- **Team colors are data**, injected inline at render — the one sanctioned inline-style use.

## Typography does the heavy lifting

- **Inter** — the interface voice: labels, body, controls.
- **Barlow Semi Condensed** (`--font-display`) — numbers on display: scores, leaderboard values, stat tiles, view titles. If a number is the point of the component, it's Barlow.
- **JetBrains Mono** — tabular receipts: aligned columns of values (odds, VORP), where digit alignment is meaning.
- Rate stats drop the leading zero (`.338`, never `0.338`). IP strings honor thirds. These are craft signals our audience notices.

## The four house patterns

1. **Receipts.** Every computed number carries its provenance, visibly: the `est` chip, the `†` dagger, "Understood as:" echo chips, "4,000 simulated seasons · simulated 12:15 AM." If we computed it, we show the receipt. This is the trust brand made visible — apply to every new computed surface, no exceptions.
2. **Border = identity, badge = state.** (Above; repeated because it's violated most.)
3. **Skeletons speak.** Loading is shimmer skeletons matching the real layout's dimensions — never spinners, never blank. The wait is part of the design.
4. **Category color discipline.** The stat palette is semantic; the moment it decorates, it's noise (and the posture slides toward gamification).

## Copy voice

- No hype. Nothing is ever labeled "AI-powered," "smart," or "magic" — intelligence reads through precision and speed, not adjectives.
- **Numbers never lie about precision:** `>99`, `<1`, `~245`, `†`. A Monte Carlo estimate never renders "100%".
- Empty states name their threshold and the way out ("No qualified SP yet (min 15 IP)").
- Errors say what failed and what to try. "Something went wrong" is banned.
- Baseball speaks in its own register (announcer-plain: "slipping 6 spots past ADP"), never database register.

## Motion

Motion communicates state — loading, transition, liveness — never decorates. Standard: **120–150ms ease-out** for state changes; CSS only; the ticker scrolls and the live dot pulses because those ARE state. A component that animates for delight must justify itself in review.

## Density and space

Data is the hero; chrome is minimal. Dense tables are the product, not a problem — but density needs rhythm: consistent row heights, aligned numerals, breathing room between panels. **Column priority is a design decision:** at constrained widths, what a fan checks daily (record, GB, odds) out-earns what they check monthly (home/away splits). Wide-only columns (`standings-col--wide`) are the pressure valve.

## Enforcement

- `tools/check-themes.cjs` — token contrast contract (strict once debts clear; new themes pass clean or don't ship).
- `tools/check-manifest.cjs` — delivery discipline.
- Cascade-safety rule: grep before adding any selector to shared CSS (CLAUDE.md code rule #9).
- Kael reviews visual output against **this page**; findings are named ISSUES.md entries.
- The inline-style→class migration (D-038 K3, with the CSP nonce work) is the path to making the color rule mechanically checkable.
