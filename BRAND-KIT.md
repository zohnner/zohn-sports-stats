# SportStrata — Brand Kit for AI Prompting
**Reference sheet for prompting AI image/video tools (Midjourney, Runway, Sora, Kling, Pika, etc.) to make on-brand intros, outros, and clip overlays.** Pulled directly from `DESIGN.md` and `css/variables.css` — the same tokens the live site is built on, so anything generated from this stays consistent with sportstrata.cc itself.

---

## Brand snapshot

- **Name:** SportStrata — always the full word, never "ZohnStats" or abbreviations.
- **Tagline:** "Serious stats for serious fans."
- **Posture:** broadcast-grade authority, zero premium friction. Think **Baseball Savant crossed with a broadcast lower-third system** — dense, legible, trustworthy, precise. A professional data tool that happens to be free.
- **What it's not:** not a consumer sports app, not a fantasy casino, not gradient-soaked or "AI-flavored." If a visual would look at home in a sportsbook promo, it's off-brand.
- **Voice:** no hype words ("AI-powered," "smart," "magic"). Confident and plain, announcer-register, not database-register.

**Note on the YouTube channel specifically:** the channel intentionally runs a louder, separate voice from the site (confirmed direction, D-084) — clickbait-adjacent titles are fine there. This brand kit describes the *visual* identity (colors, type, logo), which should stay consistent even when the copy voice gets looser.

---

## Colors

Primary palette is **dark** — this is the default and should be the base for any intro/outro background.

| Role | Hex | Use |
|---|---|---|
| Background (base) | `#0d1014` | Engineered near-black — the canvas. Not pure black, not navy. |
| Background (surface) | `#14181d` | Panels, cards, slightly lifted off base. |
| Background (raised) | `#1d232b` | Further-lifted elements. |
| Text — primary | `#f5f7fa` | Headlines, wordmark. |
| Text — secondary | `#c5cbd3` | Subheads, captions. |
| Text — muted | `#8a93a3` | Timestamps, fine print. |
| **Accent (brand orange)** | `#ff7a00` | The signature color. Logo, wordmark accent, primary CTA only — never decorative, never a full background wash. Scarcity is what makes it read as "the brand is speaking." |
| Accent — light | `#ffb347` | Hover/glow states of the accent. |
| Accent — dark | `#d96a00` | Pressed/deep variant. |
| Win / positive | `#16c784` | Green — states only, never decoration. |
| Loss / negative | `#e5484d` | Red — states only. |
| Live | `#ff006e` | Hot pink/magenta — "this is happening now." Distinct from the brand orange on purpose. |

Light-theme variant exists (`#f5f7fa` background, `#d96a00` deepened accent for contrast) but dark is the brand's default face — use it unless a specific light-background deliverable is needed.

**Rule for prompts:** describe the background as "engineered near-black, not pure black" and the accent as "a single scarce orange highlight, not a wash of color." Over-saturating orange is the single most common way an AI generation drifts off-brand.

---

## Typography

| Font | Role | Where it's used |
|---|---|---|
| **Space Grotesk** (weight 700) | Brand/display headlines — the wordmark, big titles | "SportStrata," episode titles |
| **Barlow Semi Condensed** (weight 500–600) | Numbers and eyebrow/kicker labels — anything where a number is the point | Scores, stat values, small caps labels above a headline |
| **JetBrains Mono** | Tabular data, aligned columns | Odds, stat tables — rarely needed in an intro/outro |
| **Inter** | Interface/body voice | Supporting text, captions |

Vendored font files (no CDN dependency) already exist at:
`videocreation/tokens/fonts/` — `space-grotesk-700.woff2`, `barlow-semi-condensed-600.woff2`, `inter-400.woff2` through `900.woff2`, `jetbrains-mono-400/600.woff2`.

**Rule for prompts:** if the AI tool can take a font reference, name Space Grotesk for the wordmark and Barlow Semi Condensed for numerals/labels. If it can't use real fonts (most video-gen tools can't), describe the look instead: "a tight, geometric grotesque sans for the headline, semi-condensed for any numbers — nothing rounded or playful."

---

## Logo & asset files

All paths below are on this machine, in the project folder — attach the actual file when a tool supports image upload rather than describing the mark from scratch.

| Asset | Path |
|---|---|
| Primary logo (full color) | `assets/PrimaryLogo.PNG` |
| Secondary logo | `assets/SecondaryLogo.PNG` |
| Wordmark, mono white (for dark backgrounds) | `assets/brand/mark-on-dark.svg` |
| Wordmark, mono black (for light backgrounds) | `assets/brand/mark-on-light.svg` |
| Icon only, SVG | `assets/icon.svg` |
| Icon, PNG (512px) | `assets/icon-512.png` |

**Wordmark rule:** the "SportStrata" text itself is never re-colored or themed — it stays neutral text-primary. Only the small brand icon/mark may carry the orange accent. Don't let an AI tool render "SportStrata" entirely in orange.

---

## Existing intro/outro precedent

There's already a native title-card and outro built (in the paused Draft Instincts pipeline, `videocreation/scenes/templates/title-card.html` and `outro.html`) — useful as a visual reference even if you're generating new ones with AI:

- **Intro:** near-black background with a soft radial orange glow centered behind the text (`radial-gradient` from `--accent-subtle` fading to transparent). Small tracked-out kicker label up top, then the big Space Grotesk wordmark, then an episode badge + subtitle row, then a thin orange rule line that draws in left-to-right. Bottom-right corner: a small "● sportstrata.cc" watermark, dot in accent orange.
- **Outro:** same near-black background, centered "SportStrata" wordmark (orange only on the "Strata" half, per the theme's tribute styling — most renders keep the whole wordmark neutral per the rule above), a CTA line, a "Subscribe" badge, and the URL in monospace with the `.cc` in orange.
- **Motion:** everything fades/slides up gently (120–150ms-class easing, nothing bouncy or flashy) — elements arrive staggered, not all at once. No spinning logos, no lens flares, no particle effects.

---

## Copy-paste prompt base

Use this as a starting block, then add the specific ask (e.g., "...for a 3-second outro card with a subscribe CTA"):

> Broadcast-grade sports data brand, SportStrata. Background: engineered near-black (#0d1014), not pure black. Single accent color: a scarce, confident orange (#ff7a00) — used only for one highlight element, never a wash. Primary text in off-white (#f5f7fa). Typography feel: tight geometric grotesque for headlines (Space Grotesk), semi-condensed for any numbers (Barlow Semi Condensed) — no rounded, playful, or "AI-generated-looking" fonts. Mood: a professional broadcast lower-third / trading-terminal aesthetic, precise and trustworthy — not a consumer app, not gradient-heavy, not a sportsbook promo. Motion (if video): gentle fades and slide-ins, ~150ms, staggered — no bounce, no lens flare, no particles.

---

*Maintained by Kael's domain (visual system) per the project's team protocol — DESIGN.md is the full source of truth; this file is the condensed, prompt-ready subset of it.*
