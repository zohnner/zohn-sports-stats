# SportStrata — DESIGN.md
**The house style, written down and enforceable. Owner: Kael. Maintained with Folio. (D-040 3b, 2026-07-03)**
This page is what visual review checks against. If a change violates a rule here, either the change is wrong or this page gets amended in the same commit — never neither.

---

## Posture

Broadcast-grade authority with zero premium friction. The reference is **Baseball Savant crossed with a broadcast lower-third system** — dense, legible, trustworthy. A professional data tool that happens to be free.

When a user finishes any interaction they should feel *capable and informed*, never marketed to. We are not a consumer sports app, not a fantasy casino, not a gradient-soaked AI product. If a design choice would look at home in a sportsbook promo, it's wrong here.

## The brand is the default dark theme

**Ice on ink** (D-212, Ink + Ice rebrand 2026-11-20: `--bg` #070B16, `--surface` #0F182A, `--accent` #4CC9F0, `--text` #F2F7FC, `--muted` #8FA3BF; the mark is the Strata S) — Inter for everything you read, JetBrains Mono for live scores and receipts, flat surfaces, minimal chrome — that is SportStrata's face. **Amended by D-048 (phased redesign migration, underway):** the base moved off deep navy to a neutral, temperature-controlled dark so the product reads as a precision instrument, not a consumer app. The prior "no brand refresh to chase" line is superseded — the refresh *is* the D-048 palette/type/motion migration, executed as value-swaps on existing tokens, one gated phase at a time.

- The **theme set is deliberately small (D-047, supersedes D-038's "frozen at the current set"):** dark (default) + light + one tribute, `nl-monarchs`. The 8 City Connect + Bananas/Expos/Trash-Pandas themes were **retired** — archived in `css/themes-retired/` as candidates for future premium unlockables. The default is always the argument; themes are never it.
- **The wordmark is never themed.** The brand icon may wear team colors (jersey rule); "SportStrata" does not (D-038 identity rule).
- Light mode is a first-class citizen, not an afterthought — every new component ships verified in both.

## Brand invariants (D-047 — the cohesion contract)

SportStrata reads as *a broadcast graphics package meets a trading terminal* — live, precise, quantitative; one visual voice regardless of sport. **The cohesion test:** a scorebug screenshot from any sport (MLB grid card, NFL ticker, NCAAF row) should be indistinguishable by sport except by its content — same anatomy, type, state language, accent logic. These never vary by sport or theme:

1. **State language.** live = `--color-live` + pulse + a LIVE badge; final = muted/receded; upcoming = **neutral** scheduled pill (`--bg-subtle`/`--text-muted`, distinguished by its time/"Scheduled" label). Identical vocabulary in ticker, grid, hero, and landings. *(D-047 S3c amended this from "accent scheduled pill" — that conflicted with invariant #3, "orange = brand only"; the owner-approved accent re-scope resolves it in favor of #3.)*
2. **Numeric voice.** live scores and aligned receipts render in `--font-mono`; stat values render in Inter with `tabular-nums` (tables get it by default). Prose keeps proportional figures, so "26-3" in a sentence never looks spaced out.
3. **Ice is a scalpel, not a wash (D-212).** Ice marks data emphasis, state (active nav, selected, primary CTA) and wayfinding (links). Headlines and the wordmark stay text-colored. No orange anywhere: `tools/check-orange.cjs` (run by `tests/inkIce.test.js`) fails on any orange-family color outside the `ss-team-colors` fences, because team colors are data.
4. **Eyebrow labels.** one `.eyebrow` utility, one recipe, everywhere (S4).
5. **Logos are never naked on a surface.** every team mark gets the container/chip treatment (S5).

Migration order to reach this: DECISIONS.md D-047 (S1 done → S6).

## Color is a language with a small vocabulary

All color through `css/variables.css` tokens — a hex literal in a style attribute is a defect (tracked debt: D-038 K3). The vocabulary:

- **Accent** (`--accent`, ice) means *data, state, wayfinding*: primary actions, active nav, links, the one focal series in a chart. Never a headline color, never a wash. Scarcity is what makes it audible. Text-bearing uses clear 4.5:1 in both themes (`tools/check-themes.cjs`); light theme uses the deepened ice `#0B6F91`.
- **Stat-category colors** mark *category, never importance* (2026-05-17 rule). A number is never colored to shout.
- **Semantic trio:** `--color-win` green, `--color-loss` red, `--color-live` hot pink/magenta (`#ff006e`) — states, nowhere else. (Corrected 2026-08-08 — this line said "amber" for weeks after the token itself was fixed 2026-08-02 during N-17's injury-badge work; CLAUDE.md had the right value, this page didn't. Per this page's own enforcement rule, the correction belongs here in the same pass it's noticed, not deferred.) Thresholded values (odds ≥75%, streaks) may borrow win/loss; decoration may not.
- **Border = identity, badge = state** (D-038 K2). Card borders belong to teams; liveness/status lives in badges and glows. Never encode state in the border channel.
- **Team colors are data**, injected inline at render — the one sanctioned inline-style use.

## Typography does the heavy lifting

- **Two fonts, no third (D-212).** Inter is the voice for labels, body, controls, headlines and stat values. JetBrains Mono is for live scores and tabular receipts: aligned columns of values (odds, VORP), where digit alignment is meaning. `button`/`input`/`select` inherit the page font; nothing renders in a browser default.
- **One type scale.** Every `font-size` is a `--text-*` step (`2xs` 10px through `5xl`); `tests/designSystem.test.js` fails on a raw size. Export cards (stat share card, Highlight Card) keep fixed sizes because they lay out a fixed PNG.
- Rate stats drop the leading zero (`.338`, never `0.338`). IP strings honor thirds. These are craft signals our audience notices.

## Iconography (added 2026-09-07, site-wide emoji removal)

No pictographic/colorful emoji anywhere in the product — icons are hand-drawn SVG, monochrome, functional. Emoji read as a shortcut; they also can't be recolored, sized, or aligned the way the rest of the visual system demands, and they undercut the "broadcast graphics package meets a trading terminal" posture this page opens with. This codifies a convention that already existed in practice (`_SL_ICON` in js/app.js, `_NAV_ICONS` in js/navigation.js) before it had anywhere written down.

- **One grid, one stroke.** `viewBox="0 0 16 16"`, `stroke="currentColor"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"` (a filled dot is fine for a small functional mark, e.g. a gamepad button, never for the icon's main shape). Outer `width`/`height` scales per context (14–20px is the current range) — the drawing itself never changes.
- **`currentColor` only, never a hex literal** — same rule as every other color in the system (D-038 K3). An icon inherits its container's color; it does not carry its own.
- **Shared home:** `js/config.js`'s `_ICON` map (bare shape data) + `_iconSvg(key, size)` (the full wrapper) is the one place new icons get added, since config.js loads first in the script chain and everything else can reference it. `_SL_ICON`/`_NAV_ICONS` predate this and stay where they are — not a second standard, just two call sites that already drew to the same spec before it was named.
- **Exactly one documented exception:** clipboard/share text that leaves the app as plain text (e.g. a Wordle-style result grid copied to a text message) has no SVG equivalent that survives the paste — those specific strings keep literal emoji/Unicode characters, called out inline with a comment explaining why. Plain monochrome symbols that were never pictographic to begin with (✕ close, ♥ favorite) were never in scope for this rule and don't need one.

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

Data is the hero; chrome is minimal. **Flat surfaces (D-212):** no gradients, glows or glass; cards, header and nav are solid `--bg-surface`/`--bg-base`. Gradients survive only where they encode data (legend scales, field markings). **One radius** (`--radius`, 8px) plus `--radius-full` for pills and 50% for circles. **One spacing scale** (`--space-*`, 4px steps plus a 2px hairline); negative margins and `calc()` are the only raw lengths. Dense tables are the product, not a problem — but density needs rhythm: consistent row heights, aligned numerals, breathing room between panels. **Column priority is a design decision:** at constrained widths, what a fan checks daily (record, GB, odds) out-earns what they check monthly (home/away splits). Wide-only columns (`standings-col--wide`) are the pressure valve.

## Enforcement

- `tools/check-themes.cjs` — token contrast contract (strict once debts clear; new themes pass clean or don't ship).
- `tools/check-manifest.cjs` — delivery discipline.
- Cascade-safety rule: grep before adding any selector to shared CSS (CLAUDE.md code rule #9).
- Kael reviews visual output against **this page**; findings are named ISSUES.md entries.
- The inline-style→class migration (D-038 K3, with the CSP nonce work) is the path to making the color rule mechanically checkable.
