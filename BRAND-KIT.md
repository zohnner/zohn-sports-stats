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

## Colors (Ink + Ice, D-212, 2026-11-20)

SportStrata dropped black + orange entirely. Dark is the default face and the base for any intro/outro background. Surfaces are flat: no gradients, no glows, no glassmorphism.

| Token | Hex | Use |
|---|---|---|
| `--bg` (ink) | `#070B16` | Page background, the canvas. |
| `--surface` | `#0F182A` | Cards, panels, nav. |
| `--accent` (ice) | `#4CC9F0` | Data emphasis, state (active, selected, primary CTA) and wayfinding (links). A scalpel, not a wash. |
| `--text` | `#F2F7FC` | Primary text, headlines, the wordmark. |
| `--muted` | `#8FA3BF` | Secondary text and labels only, never body copy at small sizes. |
| Win / positive | `#16C784` | States only. |
| Loss / negative | `#E5484D` | States only. |
| Live | `#FF006E` | "This is happening now." |

Contrast: ice on ink is 10.2:1, text on ink 18.2:1, muted on ink 7.6:1. The light theme uses a deepened ice (`#0B6F91`, 5.7:1 on white) because `#4CC9F0` on white is only about 1.9:1.

**Rule for prompts:** describe the background as "deep ink navy, nearly black, flat" and the accent as "one cool ice-blue highlight on data, never a wash". Headlines are white, not ice.

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
| Strata S mark, source of record (1080 square, on ink) | `assets/brand/strata-s-1080.png` |
| Strata S mark, SVG (transparent, for dark backgrounds) | `assets/brand/strata-s.svg` |
| App icon / favicon, SVG (mark on an ink tile) | `assets/icon.svg` |
| Icon, PNG (512px) | `assets/icon-512.png` |

The mark is five stacked bars forming a digital S: ice bars with the middle one in text white. Don't redraw it; the SVGs transcribe the PNG's measured geometry.

**Wordmark rule:** "SPORTSTRATA" is set in one color, text-primary, next to the mark. It is never split into two colors and never rendered in ice.

---

## Existing intro/outro precedent

*(Orange-era, superseded by D-212: recolor before reuse.)* There's already a native title-card and outro built (in the paused Draft Instincts pipeline, `videocreation/scenes/templates/title-card.html` and `outro.html`) — useful as a visual reference even if you're generating new ones with AI:

- **Intro:** near-black background with a soft radial orange glow centered behind the text (`radial-gradient` from `--accent-subtle` fading to transparent). Small tracked-out kicker label up top, then the big Space Grotesk wordmark, then an episode badge + subtitle row, then a thin orange rule line that draws in left-to-right. Bottom-right corner: a small "● sportstrata.cc" watermark, dot in accent orange.
- **Outro:** same near-black background, centered "SportStrata" wordmark (orange only on the "Strata" half, per the theme's tribute styling — most renders keep the whole wordmark neutral per the rule above), a CTA line, a "Subscribe" badge, and the URL in monospace with the `.cc` in orange.
- **Motion:** everything fades/slides up gently (120–150ms-class easing, nothing bouncy or flashy) — elements arrive staggered, not all at once. No spinning logos, no lens flares, no particle effects.

---

## Copy-paste prompt base

Use this as a starting block, then add the specific ask (e.g., "...for a 3-second outro card with a subscribe CTA"):

> Broadcast-grade sports data brand, SportStrata. Background: flat deep ink navy (#070B16), nearly black, no gradients or glows. Single accent color: cool ice blue (#4CC9F0), used only on data and one highlight element, never a wash. Primary text in off-white (#F2F7FC); secondary text in slate (#8FA3BF). Mood: a professional broadcast lower-third / trading-terminal aesthetic, precise and trustworthy, not a consumer app, not a sportsbook promo. Motion (if video): gentle fades and slide-ins, ~150ms, staggered, no bounce, no lens flare, no particles.

---

*Maintained by Kael's domain (visual system) per the project's team protocol — DESIGN.md is the full source of truth; this file is the condensed, prompt-ready subset of it.*
