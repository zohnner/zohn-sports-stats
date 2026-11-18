# SportsStrata Theme System — Review & Recommendations

**Scope:** All 14 themes across variables.css, atmospheric layers, settings panel, and logo/accent systems.
**Format:** Issues flagged by category, severity-tagged, with actionable fixes.

---

## Severity Key

- `[CRIT]` — Likely breaking or severely degrading UX (contrast failures, flash of wrong theme, broken states)
- `[HIGH]` — Noticeably wrong to most users; should fix before shipping
- `[MED]` — Polish-level issues; visible to attentive users
- `[LOW]` — Refinement opportunities; won't hurt if deferred

---

## 1. Initialization & Anti-Flash

### [HIGH] `prefers-color-scheme` fallback order is ambiguous

The doc says: if no `localStorage` key, check `prefers-color-scheme` and default to light or dark. The risk is that "default to light or dark accordingly" leaves the actual precedence unspecified in implementation. If the OS reports `no-preference` (older browsers), you may land on neither branch and fall through to whatever CSS `:root` defines — which is `dark`. That's a silent mismatch for users on no-preference systems who expect light.

**Fix:** Make the fallback chain explicit in the inline script:
```js
const stored = localStorage.getItem('zs_theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = stored ?? (prefersDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', theme);
```
This covers: stored → OS dark → OS light/no-preference. No ambiguous branch.

---

### [MED] Inline script has no error boundary

If `localStorage` is unavailable (private browsing in Firefox, some embedded contexts), `localStorage.getItem()` throws a `SecurityError`, not returns null. The page will flash unstyled or the wrong theme.

**Fix:** Wrap in try/catch with a safe fallback:
```js
let theme = 'dark';
try {
  theme = localStorage.getItem('zs_theme')
    ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch (_) {}
document.documentElement.setAttribute('data-theme', theme);
```

---

### [LOW] `_applyTheme()` does four things — consider splitting responsibilities

The function currently: sets the attribute, writes localStorage, syncs `aria-pressed`, and swaps the logo. Logo swap is a side effect unrelated to theme application — if the logo ever needs to update independently (e.g. responsive breakpoint swap), you'll need to duplicate logic.

**Fix:** Extract `_syncLogo(theme)` as a standalone function called by `_applyTheme()`. Easier to test and reuse.

---

## 2. Base Themes — Token Values

### [CRIT] Light mode accent contrast may fail WCAG AA on some surfaces

The light theme shifts accent from `#ff8100` to `#d96a00` for contrast against white. `#d96a00` on `#ffffff` is approximately 3.2:1 — below the 4.5:1 minimum for normal text (WCAG AA). This matters if the accent is used on any text links or labels in light mode.

**Fix options:**
- Darken the light-mode accent to `#b85800` (~5.1:1 on white) and use the original `#d96a00` only for large/bold text (3:1 is acceptable there).
- Or gate: use `#d96a00` only on interactive elements (buttons, badges) where the surrounding context provides additional affordance, and introduce a separate `--accent-text` token strictly for inline text color.

---

### [HIGH] Dark mode border opacity stack is thin at the bottom

`rgba(255,255,255,0.07)` on `#060c18` produces a very subtle border — by spec that's intentional. The issue is that on Surface (`#0c1629`) and Raised (`#111e38`) backgrounds, 0.07 opacity white borders become nearly invisible because the delta between the border color and background is too small. You essentially have a white border at 7% that's sitting on a near-white-tinted dark surface.

**Fix:** Audit which surface level each border token is primarily used on. Consider:
- `--border-subtle`: `rgba(255,255,255,0.07)` — base background only
- `--border-default`: `rgba(255,255,255,0.11)` — surface/raised
- `--border-strong`: `rgba(255,255,255,0.18)` — raised + interactive states

If this mapping is already your intent, make it explicit in a comment so Claude Code applies them correctly by context rather than by whim.

---

### [MED] Light mode card backdrop opacity at 0.92 causes problems on saturated backgrounds

`rgba(255,255,255,0.92)` cards work fine on `#f0f4f9`. But if a CC theme is ever extended to light mode, or if a background image/gradient is introduced, 0.92 opacity means the card tints slightly — and 8% of a saturated color bleeds through onto white card content areas. Either commit to `1.0` for cards in light mode or document the 0.92 as intentional atmospheric bleed.

**Recommendation:** Set light-mode cards to `rgba(255,255,255,1.0)` unless you have a specific reason for the bleed. The 0.92 is doing nothing on a flat `#f0f4f9` background.

---

### [LOW] No `--text-on-accent` token

When accent-colored backgrounds are used (buttons, badges, active states), text needs to be readable on top of `#ff8100`. There's no documented token for this. In dark mode, dark text on orange works; in light mode it may not. Without a `--text-on-accent` token, every component that puts text on an accent background has to make an independent color decision, which will drift.

**Fix:** Add `--text-on-accent: #0f172a` (dark mode) / `#ffffff` (light mode, on `#b85800`). Document it.

---

## 3. City Connect Themes — Atmospherics

### [HIGH] body::before z-index not documented — risk of layering over content

The atmospheric pseudo-element gradients are described as large and soft but their `z-index` behavior relative to content layers isn't specified. If `body` has `position: relative` and a child has `position: absolute` or `fixed` with no explicit z-index, the `::before` gradient can clip on top of dropdowns, modals, or the settings panel itself.

**Fix:** Explicitly set:
```css
body::before, body::after {
  z-index: 0;
  pointer-events: none;
}
```
And ensure all layout children have `position: relative; z-index: 1` or higher. The settings panel (`position: fixed`) needs `z-index` above the atmospheric layer regardless.

---

### [HIGH] cc-reds pinstripe opacity is probably too low to render correctly cross-browser

`rgba(165,0,21,0.07)` at 1px width — 7% opacity on a 1px line — is below the threshold that some GPU-accelerated compositors render accurately, especially on non-retina displays. The line will appear to blink in and out depending on subpixel positioning.

**Fix:** Raise to `rgba(165,0,21,0.12)` minimum, or double the stripe to 2px at 0.07. Also verify the `repeating-linear-gradient` syntax includes a `background-size` declaration — without it, the pattern may tile incorrectly across viewport widths.

---

### [HIGH] cc-padres three-gradient atmosphere may produce visible banding on low-end displays

Three simultaneous radial gradients with different origin points create complex compositing regions. On integrated GPUs (common in laptops) with 8-bit color panels, the gradient math in the overlap zones will quantize and show visible color banding — the purple-aqua-marigold intersection is particularly susceptible.

**Fix:** Add `will-change: background` to `body` for CC themes only, which promotes the layer to GPU compositing and uses full-precision rendering. Alternatively, limit to two gradients and achieve the third hue via a `::after` pseudo with `mix-blend-mode: screen` at low opacity.

---

### [MED] cc-brewers gradient split at midscreen is too abrupt without a midpoint stop

"Wild Mango burns across 90% of the top edge, Great Lakes blue swells across 100% of the bottom" — without a defined midpoint gradient stop, the two colors meet at the center and may clash depending on screen height. On tall viewports, the blend zone is very narrow.

**Fix:** Add a transparent or near-black midpoint at 45–55%:
```css
background: radial-gradient(ellipse 90% 50% at 50% -10%, rgba(255,122,0,0.18) 0%, transparent 100%),
            radial-gradient(ellipse 100% 50% at 50% 110%, rgba(35,107,142,0.22) 0%, transparent 100%);
```
The explicit `transparent` stop at 100% ensures both gradients fade out before they collide.

---

### [MED] cc-orioles header shadow uses Camden green instead of accent orange — undocumented divergence

The header shadow `rgba(0,90,60,0.30)` is thematically intentional (ivy overhead vs warm brick below) but this means the header's shadow hue doesn't match any of the token system's accent-derived values. If `--shadow-accent` is ever computed from `--accent`, the Orioles theme will silently revert to orange shadow and lose the intentional green.

**Fix:** Explicitly define a `--shadow-header` token in the cc-orioles block that overrides `--shadow-accent`. Don't let the header shadow be implicit.

---

### [MED] cc-royals shadow opacity values (45%, 55%, 70%) are heavier than any other theme — but not documented as intentional

If another dev or Claude Code session adjusts shadows for visual consistency across themes, they'll normalize the Royals shadows down without knowing the 45/55/70 was a deliberate design choice to evoke an "oppressive" environment.

**Fix:** Add a comment in the token block: `/* intentionally heavier — oppressive night-at-The-K atmosphere */`

---

### [LOW] cc-bananas "banana yellow at full saturation" (#FFE033) may cause eye fatigue in extended use

`#FFE033` is high-chroma high-luminance. As an accent on near-black (#0d0c00), it reads as pure neon — great for glancing at, rough for extended reading sessions. If this theme is used for stats browsing (i.e., actually reading tables and numbers), the high-chroma accent on interactive elements like active tabs, selected rows, or focus rings will be visually exhausting.

**Recommendation:** Keep `#FFE033` as the brand accent for logos and decorative elements. Define a secondary `--accent-interactive: #D4B200` (same hue, lower luminance) specifically for focus rings, active states, and table row highlights.

---

### [LOW] cc-pirates diagonal crosshatch is at `-45deg` — confirm this reads as steel geometry, not noise

At 23px repeat, `-45deg` crosshatch at 4% gold opacity will read differently depending on screen resolution. On retina, it's a visible geometric pattern. On 1x displays at small text sizes, it may just look like a slight texture grain — not structured geometry. The intended "steel beam" read requires the pattern to be resolved enough to perceive direction.

**Recommendation:** Test on a 1080p display. If the geometry is lost, increase repeat to 28px and opacity to 6%.

---

## 4. Tribute Themes

### [HIGH] nl-monarchs warm-tinted borders (`rgba(245,230,200,...)`) will conflict with any component that hardcodes `rgba(255,255,255,...)` for borders

The Monarchs theme intentionally shifts border tint from white-based to warm-parchment. But any component CSS that hardcodes `rgba(255,255,255,0.07)` instead of using the `--border-subtle` token will ignore the override and display cold white borders — a jarring mix of warm and cold on the same surface.

**Fix:** Audit every border declaration in component CSS. Replace any hardcoded `rgba(255,255,255,...)` border values with the token. This is a token hygiene issue that only surfaces on Monarchs.

---

### [MED] retro-expos "deep Olympic Stadium blue" base (#04071e) is darker than the dark base (#060c18)

The Expos base at `#04071e` is 3 luminance points darker than the standard dark base. This means the Expos theme has less surface layer contrast (the step from base to surface to raised is compressed). Cards on `--bg-surface` will have less separation than in any other theme.

**Fix:** Either lighten the Expos base to ~`#06091f` to restore surface contrast, or slightly increase the surface and raised values for this theme specifically to maintain the step gradient.

---

### [MED] aa-trash-pandas "true void" base (#02030e) is the darkest in the set — shadow tokens need recalibration

The Trash Pandas base at `#02030e` with 80% black shadows means shadow elements have essentially zero visual contrast against the background at the darkest extreme. The shadow is meant to convey "deep space" but on this base it reads as nothing — the surface just disappears.

**Fix:** For the Trash Pandas theme specifically, replace black-based shadows with accent-tinted shadows: `rgba(232,104,48,0.15)` (rocket orange at 15%) will read as a subtle glow edge — more evocative of "illuminated by engine exhaust" than "crushed into void."

---

### [LOW] cc-bananas is labeled in the settings panel as a "Tribute Theme" but is in the CC section of the doc

The document groups cc-bananas under "tribute themes" conceptually (independent org, not MLB) but the key prefix is `cc-` suggesting it may be categorized with CC themes in the panel. Clarify which section it belongs to in the UI. The Bananas are not a CC uniform and shouldn't sit next to Braves/Orioles/Reds without a visual divider or section label distinction.

---

## 5. Settings Panel

### [HIGH] Drawer z-index must beat body::before atmospheric layers AND any fixed-position overlays

The settings panel is `position: fixed`, right-edge mounted. Since the atmospheric gradients on `body::before` may be promoted to their own compositing layer, you need to ensure the drawer has an explicit z-index high enough to consistently clear them — and clear any future fixed-position tooltips or notification banners.

**Fix:** Set `#settingsPanel { z-index: 1000; }` (or whatever your z-index scale top is). Document the z-index scale.

---

### [HIGH] `aria-pressed` sync on swatch buttons requires all swatches to be in the DOM when `_applyTheme()` fires

If the settings panel is lazy-rendered (not in DOM until the drawer opens), `document.querySelectorAll('[data-theme-set]')` will return an empty NodeList on the initial page load sync. The `aria-pressed` state will be wrong until the panel is opened.

**Fix:** Either (a) always render the settings panel in the DOM (just hide it visually), or (b) move the `aria-pressed` sync to a function that runs when the panel opens, not inside `_applyTheme()`. Option (a) is simpler.

---

### [MED] Three-section drawer (Appearance / City Connect / Tribute) has no visual indicator of currently active theme category

A user on cc-royals opens the panel — the active swatch is highlighted inside City Connect, but there's no section-level affordance showing "you're currently in City Connect." On a long drawer with 14 options, users have to scan all three sections to find the active one.

**Fix:** When a CC or tribute theme is active, visually accent the section header (e.g., a left-border rule in the active accent color, or an active dot on the section label).

---

### [MED] No keyboard navigation documented for the swatch grid

The swatches are `<button>` elements which are natively focusable, but a grid of buttons requires arrow-key navigation (ARIA roving tabindex pattern) to be accessible. Tab-through on 14 buttons is annoying; the standard pattern for button grids is: first button tabindex=0, rest tabindex=-1, arrow keys move focus and update tabindex.

**Recommendation:** Implement roving tabindex on the swatch grid. This is a one-time ~30-line JS addition and makes the panel keyboard-navigable.

---

### [LOW] No "reset to system default" option in the panel

Users who want to go back to OS-preference-based theming have no path — they can only choose dark or light explicitly. Storing the OS preference means the theme won't follow system changes.

**Recommendation:** Add a "System" swatch (sun/moon icon, perhaps) in the Appearance section that: sets `data-theme` to the current OS preference AND removes `zs_theme` from localStorage so the inline script picks up OS changes on future loads.

---

## 6. Logo Swap System

### [MED] `_CC_TEAM_LOGOS` map uses `mlbstatic.com` SVG URLs — these are not versioned and can silently break

`mlbstatic.com` assets are not guaranteed to be stable. MLB periodically restructures their CDN. An unversioned URL like `https://www.mlbstatic.com/team-logos/team-cap-on-light/XXX.svg` may return 404 after a league site refresh without any warning.

**Fix:** Either (a) self-host the SVGs in `/assets/logos/` and reference them locally, or (b) wrap every logo swap in an error handler that falls back to `assets/Icon.PNG` on 404. Option (b) is a quick safety net; option (a) is the correct long-term fix and avoids external dependency entirely.

```js
const img = document.getElementById('brandLogoImg');
img.onerror = () => { img.src = 'assets/Icon.PNG'; img.onerror = null; };
img.src = _CC_TEAM_LOGOS[theme] ?? 'assets/Icon.PNG';
```

---

### [LOW] Accent ring box-shadow (`0 0 0 2px var(--accent), 0 0 10px var(--accent-glow)`) is not removed when switching back to base dark/light

If a user switches from cc-royals to dark, and the base dark theme doesn't explicitly clear the ring, the logo element retains its last CC ring style. This depends on whether `--accent-glow` is defined in the base themes.

**Fix:** In the base `dark` and `light` theme blocks, either (a) explicitly set `--accent-glow: transparent`, or (b) have `_applyTheme()` conditionally add/remove a class (e.g., `logo--special-theme`) that carries the ring CSS, and remove it when switching to base themes.

---

## 7. Token Hygiene & Cross-Cutting Issues

### [HIGH] `--bg-header` and `--bg-waffle-panel` are CC-only overrides — no base-theme fallbacks documented

The doc mentions these as surface-specific vars in CC themes. If a component references `var(--bg-header)` and the user is on the `light` base theme, they'll get an empty/invalid value unless these tokens are defined in `:root`.

**Fix:** Define fallback values for all CC-specific tokens in `:root` (the dark base):
```css
:root {
  --bg-header: var(--bg-surface); /* default to surface */
  --bg-waffle-panel: var(--bg-raised);
}
```
Then CC themes override them. This prevents undefined variable inheritance.

---

### [MED] Scorecard fixed tokens are in the same file as themed tokens — risk of accidental override

The doc states scorecard paper tokens (`--scorecard-paper`, `--scorecard-ink`, etc.) are theme-invariant. If they're defined in `variables.css` in `:root` and a developer adds a CC theme that inadvertently includes a `--scorecard-paper` override (e.g., by copy-paste), the scorecard's "physical artifact" quality silently breaks.

**Fix:** Move scorecard tokens to a separate `scorecard-tokens.css` loaded after `variables.css`. Their isolation from the theme override structure makes accidental overwriting structurally impossible, not just conventionally prohibited.

---

### [MED] Stat-category color tokens are documented as theme-invariant but may not be enforced structurally

Same issue as scorecard tokens — if `--color-pts`, `--color-reb`, etc. live in `variables.css`, they can be overridden in a CC theme block. Without structural enforcement, this is convention-only protection.

**Fix:** Same as above — move invariant tokens to a `data-tokens.css` that is imported after the theme file. Or at minimum, add a comment block in `variables.css` clearly marking the invariant section and listing token names.

---

### [LOW] No dark-mode test matrix for CC themes on non-standard display profiles

Each CC theme is a dark-base derivative. But on displays with "warm" Night Shift / f.lux color temperature shift active (very common in evening use, which is when sports apps get most traffic), the warm-shifted CC themes — cc-royals, cc-rangers, cc-bananas — will look significantly different than designed. The blue-cast themes (cc-braves, retro-expos) will look closer to neutral.

**Recommendation:** Not a code fix, but a design note: test the warm-shifted themes in f.lux or equivalent before locking values. The Royals crown gold (#C09A5B) under a 3400K Night Shift becomes almost indistinguishable from white text.

---

## Priority Punch List (for Claude Code)

| Priority | File | Action |
|---|---|---|
| 1 | inline `<script>` | Add try/catch + explicit fallback chain |
| 2 | `variables.css` | Add `:root` fallbacks for `--bg-header`, `--bg-waffle-panel` |
| 3 | `variables.css` | Audit + replace any hardcoded border rgba values in component CSS |
| 4 | `app.js` | Add `img.onerror` handler to logo swap |
| 5 | `app.js` | Ensure `aria-pressed` sync runs at panel open, not only at `_applyTheme()` |
| 6 | `variables.css` | Add `--text-on-accent` token to dark + light base |
| 7 | `body::before` CSS | Add `z-index: 0; pointer-events: none` to all atmospheric pseudo-elements |
| 8 | cc-reds | Raise pinstripe opacity to 0.12 minimum |
| 9 | cc-royals | Add comment marking intentionally heavy shadows |
| 10 | scorecard-tokens.css | Extract invariant tokens to separate file |
