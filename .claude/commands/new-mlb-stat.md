Add a new stat to the MLB leaderboards. The user will specify the stat name (e.g. "BABIP", "K%", "FIP").

## Steps

**1. Find the API field name**
Check the MLB Stats API field reference in CLAUDE.md. Map the stat to its exact field name in the `/stats` response (e.g. `babip`, `strikeOuts`, `whip`).

If it's a computed/derived stat (ISO, BABIP, K%, BB%, FIP, K-BB%), it must be added to `_computeBattingRates(s)` or `_computePitchingRates(s)` in `mlb.js`, then stored on `AppState.mlbPlayerStats[id]` under a new key.

**2. Add to `MLB_LEADER_CATS` in `mlb.js`**

Use this shape exactly:
```js
{ key: 'fieldOrComputedKey',
  label: 'Full Display Name',
  unit: 'SHORT',
  color: '#hexcolor',
  group: 'hitting',   // or 'pitching'
  desc: true,         // false if lower = better (ERA, WHIP, FIP, K%)
  decimals: 3 }       // 0 for counting stats, 1 for rates, 2-3 for averages
```

Insert at a logical position in the array (group hitting stats together, pitching stats together).

**3. Verify the stat populates**
The stat key must exist on `AppState.mlbPlayerStats[id]` after `_initMLBStatsCache()` runs. If it's a computed stat, confirm `_computeBattingRates` / `_computePitchingRates` is called and its result is merged in.

**4. Run syntax check**
```bash
node --check js/mlb.js
```

**5. Report**
State the new category object added and whether it uses an existing API field or a computed value.
