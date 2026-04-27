# MLB Stats Expansion Roadmap

> Tracks which stats to add to the MLB section, where to get them, how they map to
> the MLB Stats API response shape, and the implementation priority.
> All endpoints are from `https://statsapi.mlb.com/api/v1` unless noted otherwise.

---

## Current State (as of 2026-04-27)

Both stat groups fully fetched and augmented with computed rates. All Phase 1 and 2 stats are live in leaderboards and player detail.

| Endpoint | What we use |
|---|---|
| `/stats?stats=season&group=hitting` | AVG, OBP, SLG, OPS, HR, RBI, R, H, 2B, 3B, SB, BB, TB, GIDP + computed ISO, BABIP, BB%, K%, RC, SB% |
| `/stats?stats=season&group=pitching` | ERA, WHIP, W, SO, BB, IP, SV, HLD, BSV, QS, K/9, BB/9, H/9, HR/9, K/BB + computed FIP, K-BB%, LOB% |
| `/schedule` | Game scores, status, inning indicator, pitcher matchups |

---

## Phase 1 — High Value, Same Endpoint (add immediately)

These stats already exist in the current API responses; we just aren't displaying them.
No new fetches required.

### Batting (hitting group)

| Stat | API field | Description | Priority |
|---|---|---|---|
| OBP | `obp` | On-base percentage | P1 |
| SLG | `slg` | Slugging percentage | P1 |
| OPS | `ops` | OBP + SLG | P1 |
| BB | `baseOnBalls` | Walks | P1 |
| SO | `strikeOuts` | Strikeouts | P1 |
| HBP | `hitByPitch` | Hit by pitch | P2 |
| SF | `sacFlies` | Sacrifice flies | P2 |
| AVG | `avg` | Batting average (already have) | ✅ |
| G | `gamesPlayed` | Games played | P2 |
| AB | `atBats` | At bats | P2 |
| GIDP | `groundIntoDoublePlay` | GIDP | P3 |
| CS | `caughtStealing` | Caught stealing | P3 |

**Implementation:** In `displayMLBPlayerCard` and `displayMLBPlayerTable`, destructure
additional fields from the existing `p.stats` object. The `/stats` response already
returns them under `splits[*].stat`.

### Pitching (pitching group)

| Stat | API field | Description | Priority |
|---|---|---|---|
| WHIP | `whip` | Walks + Hits per IP | P1 |
| K/9 | `strikeoutsPer9Inn` | Strikeouts per 9 IP | P1 |
| BB/9 | `walksPer9Inn` | Walks per 9 IP | P1 |
| H/9 | `hitsPer9Inn` | Hits per 9 IP | P2 |
| HR/9 | `homeRunsPer9` | HR per 9 IP | P2 |
| K/BB | `strikeoutWalkRatio` | K-to-BB ratio | P2 |
| QS | `qualityStarts` | Quality starts | P2 |
| SV | `saves` | Saves | P1 |
| HLD | `holds` | Holds | P2 |
| BS | `blownSaves` | Blown saves | P3 |
| BF | `battersFaced` | Batters faced | P3 |

---

## Phase 2 — Advanced Stats, New Endpoint Parameters

These require different endpoint params or additional fields in the request.

### Batting — Rate / Advanced

| Stat | How to get | Notes |
|---|---|---|
| ISO | Compute: `slg - avg` | Isolated power — how hard the player hits |
| BABIP | Compute: `(H - HR) / (AB - SO - HR + SF)` | Luck-neutral batting average |
| PA | `plateAppearances` in API response | Plate appearances (already returned) |
| BB% | Compute: `baseOnBalls / plateAppearances` | Walk rate |
| K% | Compute: `strikeOuts / plateAppearances` | Strikeout rate |
| HR/FB% | Not in MLB Stats API — Statcast only | See Phase 3 |

**Implementation:** All computable from Phase 1 fields. Add a `_computeBattingRates(stat)`
helper in `mlb.js` that returns derived stats object. Call it after parsing the `/stats` response.

```js
function _computeBattingRates(s) {
    const pa = s.plateAppearances || 1;
    const ab = s.atBats || 1;
    const sf = s.sacFlies || 0;
    return {
        iso:   s.slg && s.avg ? (parseFloat(s.slg) - parseFloat(s.avg)).toFixed(3) : null,
        babip: s.hits && s.homeRuns && s.strikeOuts
            ? ((s.hits - s.homeRuns) / (ab - s.strikeOuts - s.homeRuns + sf)).toFixed(3)
            : null,
        bbPct: (s.baseOnBalls / pa * 100).toFixed(1),
        kPct:  (s.strikeOuts  / pa * 100).toFixed(1),
    };
}
```

### Pitching — Advanced

| Stat | How to get | Notes |
|---|---|---|
| FIP | Compute: `(13*HR + 3*(BB+HBP) - 2*SO) / IP + FIP_const` | FIP constant ≈ 3.10 (varies by year) |
| K-BB% | Compute: `(SO - BB) / BF` | Skill indicator |
| LOB% | Compute: `(H + BB + HBP - R) / (H + BB + HBP - 1.4*HR)` | Left-on-base rate |
| GB% | Not in MLB Stats API — Statcast only | See Phase 3 |

**Implementation:** Add `_computePitchingRates(s)` in `mlb.js`.

```js
function _computePitchingRates(s) {
    const ip  = parseFloat(s.inningsPitched) || 1;
    const bf  = s.battersFaced || 1;
    const fip = s.homeRunsAllowed && s.strikeOuts && s.baseOnBalls
        ? ((13 * s.homeRunsAllowed + 3 * (s.baseOnBalls + (s.hitByPitch || 0)) - 2 * s.strikeOuts) / ip + 3.10).toFixed(2)
        : null;
    return {
        fip,
        kBbPct: (((s.strikeOuts - s.baseOnBalls) / bf) * 100).toFixed(1),
    };
}
```

### Fielding Stats

Fetch via: `GET /stats?stats=season&group=fielding&sportId=1&season=YYYY`

| Stat | API field | Description |
|---|---|---|
| E | `errors` | Errors |
| FPCT | `fielding` | Fielding percentage |
| TC | `chances` | Total chances |
| A | `assists` | Assists |
| PO | `putOuts` | Put outs |
| RF/G | `rangeFactorPerGame` | Range factor per game |
| DRS | Not in MLB Stats API — FanGraphs only | See Phase 3 |

**Implementation:** Add `fetchMLBFieldingStats(season)` to `mlb.js`:
```js
async function fetchMLBFieldingStats(season = MLB_SEASON) {
    return mlbFetch('/stats', {
        stats:      'season',
        group:      'fielding',
        sportId:    1,
        season,
        playerPool: 'All',
        limit:      300,
    });
}
```

---

## Phase 3 — Statcast / External Sources

These require the Baseball Savant API (`baseballsavant.mlb.com`).
Statcast data is richer but needs CORS-friendly access (may require a Cloudflare Worker proxy).

### Statcast Batting

| Stat | Endpoint | Description |
|---|---|---|
| Hard Hit % | `/statcast_search/csv?...` | Balls hit ≥ 95 mph exit velo |
| Avg Exit Velocity | Same | Mean EV on contact |
| Avg Launch Angle | Same | Mean LA on contact |
| Barrel % | Same | Optimal EV + LA combos |
| Sprint Speed | `sprint_speed.csv` | Ft/sec running speed |
| xBA / xSLG / xwOBA | `expected_stats.csv` | Expected stats from contact quality |

### Statcast Pitching

| Stat | Endpoint | Description |
|---|---|---|
| Avg Fastball Velo | `/statcast_search/csv` | Pitch velocity by type |
| Spin Rate | Same | RPM by pitch type |
| Whiff % | Same | Swing-and-miss rate |
| Chase % | Same | O-zone swing rate |
| xERA | `expected_stats.csv` | Expected ERA from contact quality |
| CSW% | Same | Called strike + whiff rate |

**Baseball Savant API note:** Requests are CSV-based and require specific query params.
A Cloudflare Worker proxy is the recommended path since the CDN may block direct
browser fetches (CORS). This aligns with PLAN-003 (shared proxy infrastructure).

**Cloudflare Worker pattern:**
```js
// Worker at savant.your-domain.workers.dev
export default {
  async fetch(req) {
    const url = new URL(req.url);
    const target = `https://baseballsavant.mlb.com${url.pathname}${url.search}`;
    const resp = await fetch(target, { headers: { 'User-Agent': 'ZohnStats/1.0' } });
    return new Response(resp.body, {
      headers: { 'Content-Type': resp.headers.get('Content-Type'), 'Access-Control-Allow-Origin': '*' },
    });
  }
};
```

---

## Phase 4 — Display Enhancements

Once the data is available, these UI upgrades make it useful:

### Player Detail Page (MLB)

Currently shows basic split stats. Expand to include:

- **Batting:** OPS, OBP, SLG displayed prominently with league-rank badges
  (same pattern as NBA `_computeLeagueRanks` — sort all players, find rank by position)
- **Hitting zones chart:** Use a canvas element to draw a spray chart or a zones grid
  (Statcast Phase 3)
- **Pitch mix chart:** Pie chart (Chart.js) showing pitch type distribution if Statcast data available
- **Splits table:** vs LHP / vs RHP, home / away, by month
  — endpoint: `/stats?stats=vsTeamTotal&group=hitting&opposingTeamId=...`

### Leaderboard Additions

New categories to add to `LEADERBOARD_CATEGORIES` in `mlb.js`:

```js
// Batting additions
{ key: 'ops',   label: 'OPS',   unit: 'OPS', color: '#fbbf24', decimals: 3 },
{ key: 'obp',   label: 'OBP',   unit: 'OBP', color: '#34d399', decimals: 3 },
{ key: 'slg',   label: 'SLG',   unit: 'SLG', color: '#60a5fa', decimals: 3 },
{ key: 'bb_pct',label: 'BB%',   unit: 'BB%', color: '#a78bfa', decimals: 1 },

// Pitching additions
{ key: 'whip',  label: 'WHIP',  unit: 'WHIP', color: '#f472b6', decimals: 2 },
{ key: 'k9',    label: 'K/9',   unit: 'K9',   color: '#fb923c', decimals: 1 },
{ key: 'fip',   label: 'FIP',   unit: 'FIP',  color: '#818cf8', decimals: 2, lowerBetter: true },
```

Note: `lowerBetter: true` flag needed so leaderboard sorts ascending for ERA/WHIP/FIP.
Update `_buildPanel` to handle this flag:
```js
.sort((a, b) => cat.lowerBetter
    ? AppState.mlbPlayerStats[a.id][cat.key] - AppState.mlbPlayerStats[b.id][cat.key]
    : AppState.mlbPlayerStats[b.id][cat.key] - AppState.mlbPlayerStats[a.id][cat.key])
```

### Team Stats View

Currently shows only player-level stats. Add a team aggregates panel:
- Team OPS, ERA, WHIP, K%, BB%, FIP
- Endpoint: `/stats?stats=season&group=hitting&teamId=X&playerPool=All`
- Endpoint: `/stats?stats=season&group=pitching&teamId=X&playerPool=All`

---

## Implementation Order

```
Phase 1 (no new API calls)     → 1–2 sessions
  ├─ Add OBP, SLG, OPS to batting cards and tables
  ├─ Add WHIP, K/9, SV to pitching cards
  └─ Add lowerBetter flag to leaderboard

Phase 2 (computed rates)       → 1 session
  ├─ _computeBattingRates helper
  ├─ _computePitchingRates helper
  └─ Fielding endpoint + display

Phase 3 (Statcast / Worker)    → 2–3 sessions
  ├─ Cloudflare Worker proxy for baseballsavant
  ├─ Statcast batting: EV, barrel%, xBA, xSLG
  └─ Statcast pitching: velo, spin, whiff%, xERA

Phase 4 (UI)                   → 1–2 sessions
  ├─ MLB player detail expansion (rank badges, charts)
  ├─ Splits table (vs L/R, home/away)
  └─ Team aggregate stats panel
```

---

## CSP Updates Required for Phase 3

When Statcast proxy goes live, add to both `_headers` and the CSP meta tag:

```
connect-src ... https://savant.your-domain.workers.dev
```

If hitting Savant directly (no proxy) — not recommended due to CORS:
```
connect-src ... https://baseballsavant.mlb.com
```

---

## API Field Reference

Full field list from `/stats?stats=season&group=hitting`:
`gamesPlayed`, `groundOuts`, `airOuts`, `runs`, `doubles`, `triples`,
`homeRuns`, `strikeOuts`, `baseOnBalls`, `intentionalWalks`, `hits`,
`hitByPitch`, `avg`, `atBats`, `obp`, `slg`, `ops`, `caughtStealing`,
`stolenBases`, `stolenBasePercentage`, `groundIntoDoublePlay`,
`numberOfPitches`, `plateAppearances`, `totalBases`, `rbi`,
`leftOnBase`, `sacBunts`, `sacFlies`, `babip`, `groundOutsToAirouts`,
`atBatsPerHomeRun`

Full field list from `/stats?stats=season&group=pitching`:
`gamesPlayed`, `gamesStarted`, `groundOuts`, `airOuts`, `runs`, `doubles`,
`triples`, `homeRuns`, `strikeOuts`, `baseOnBalls`, `intentionalWalks`,
`hits`, `hitByPitch`, `avg`, `atBats`, `obp`, `slg`, `ops`, `stolenBases`,
`caughtStealing`, `groundIntoDoublePlay`, `numberOfPitches`, `era`,
`inningsPitched`, `wins`, `losses`, `saves`, `saveOpportunities`, `holds`,
`blownSaves`, `earnedRuns`, `whip`, `battersFaced`, `gamesPitched`,
`completeGames`, `shutouts`, `strikes`, `strikePercentage`,
`hitBatsmen`, `balks`, `wildPitches`, `pickoffs`, `groundOutsToAirouts`,
`rbi`, `winPercentage`, `pitchesPerInning`, `gamesFinished`,
`strikeoutWalkRatio`, `strikeoutsPer9Inn`, `walksPer9Inn`,
`hitsPer9Inn`, `runsScoredPer9`, `homeRunsPer9`, `inheritedRunners`,
`inheritedRunnersScored`, `qualityStarts`, `qualityStartPercentage`
