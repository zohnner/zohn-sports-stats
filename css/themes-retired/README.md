# Retired themes (D-047)

These `[data-theme]` blocks were removed from `css/variables.css` in the D-047 brand-cohesion prune (2026-07-12). The live theme set is now **dark (`:root`), light, and `nl-monarchs`** only — see `INQUISITION_RESPONSES.md` §I/§X and the brand-cohesion directive S1.

**Why archived, not deleted:** zero runtime cost (not linked anywhere), and they're candidates for future **premium unlockables**. Each file is a self-contained `[data-theme="…"]` block that overrides the dark base; to restore one, paste its block back into `css/variables.css`, re-add its `_CC_TEAM_LOGOS`/`_CC_THEME_ALTS` entries in `js/app.js` and a `.theme-swatch` button in `index.html`, and confirm `node tools/check-themes.cjs --strict` stays green.

Retired: cc-braves, cc-orioles, cc-reds, cc-royals, cc-brewers, cc-pirates, cc-padres, cc-rangers (City Connect 2026); cc-bananas, retro-expos, aa-trash-pandas (tribute). Retained tribute: nl-monarchs (Kansas City Monarchs — Negro Leagues).
