# Server-side ESPN reads: inventory, failure matrix, and the LIVE/STALE/DOWN layer (D-196)

2026-11-03. Branch `feat/espn-source-health`. Claims are labelled **verified** (observed or tested), **inferred** (read from code, not run) or **untested**.

## What production looks like today (verified, curl from outside Cloudflare, 2026-11-03)

| Proxy | Answer |
|---|---|
| `/api/{nfl,ncaaf,nba}?path=/scoreboard`, `/api/ncaaf?path=/rankings`, `/api/news` | 403, nginx "403 Forbidden" HTML served as `application/json` |
| `/api/nflstats`, `/api/wnbastats` | 502, Cloudflare's own `error code: 502` plain text |
| `/api/{nfl,ncaaf,nba}standings` | 200 `{"ok":false,"reason":"upstream 403"}` |
| `/api/{ncaaf,nba}athlete` | 200 `{"found":false,"reason":"athlete not found"}`: the block reads as a missing player |
| `/api/nflplayer` | 200 `{"found":false,"reason":"not on roster"}`: same misreport |

The same ESPN URLs return 200 JSON to a residential IP (verified), so the block is specific to Cloudflare egress, as D-176 recorded.

## Consumer inventory and failure matrix

"Server-side" means anything that reads ESPN without a reader's browser. The browser fallback (`_espnFetch`, `js/config.js`) is out of scope and unchanged.

### Runs on Cloudflare egress (hit by the block)

| Consumer | Calls | 403 / 502 / non-JSON | 200 with error inside | Empty or malformed | Valid but stale | After D-196 |
|---|---|---|---|---|---|---|
| Passthrough proxies `/api/{nfl,ncaaf,ncaab,wnba,nba,news}` | `site.web.api` | Forward status and body (verified) | n/a | Forwarded | Edge cache 20s to 1h, bucket-salted (inferred) | **Unchanged on purpose** (see "never in a proxy") |
| Standings proxies (5) | `site.web.api /standings` | Wrapped in 200 `{ok:false}` (verified) | That *is* their failure shape | Forwarded | 10 min cache on the error | Unchanged |
| Stats proxies (4) | `sports.core.api` | JSON 502 `{error}` in code; Cloudflare 502 text live (verified) | n/a | Forwarded | 6h cf cache (inferred) | Unchanged |
| Athlete proxies `ncaaf/wnba/nba` | `sports.core.api` | **Misreported as "athlete not found"** (verified) | That is the shape | — | 1 day cf cache | **Fixed:** reason is now `upstream <status>` or `upstream fetch failed`; a real 404 keeps "athlete not found". `found:false` is unchanged, so the browser fallback still fires |
| NFL-only proxies with no browser fallback (`nflplayer`, `nflgamelog`, `nflcareer`, `nflathlete`, `nflsos`, `nflsearch`, `ncaafgamelog`) | ESPN rosters, gamelog, core | Reader sees an empty panel; `nflplayer` says "not on roster" (verified) | — | — | — | **Not covered.** A reader-facing gap, outside this brief |
| Home `/` (`functions/index.js`) | 5 `site.web.api` scoreboards, cf 60s | Names the sport as unreachable (D-193, measured) | Same (non-2xx or unparseable gives null) | Empty `events` reads as "no games" (correct for an off day) | Up to 60s cf cache | LIVE/STALE/DOWN per sport. A STALE sport keeps its rows, each with "(as of 7:42 PM ET)", and is **never listed under Live now**; page cache drops to 60s |
| 18 edge templates (standings ×5, leaders ×3, NCAAF rankings, players ×3, games ×2, teams ×2, `/nfl` team directory, Pick'em) | Own `/api/*` proxy or ESPN direct | Fail safe to the SPA shell; NFL tries nflverse first; `/nba/standings` tries the BDL snapshot first (measured: every template, every mode) | Same | Same (shape check) | 2 min to 1 day cf cache | DOWN behaviour **identical** (measured). New: STALE renders the last good copy with a receipt and a 60s page cache. Pick'em is LIVE-only |
| Push alerts (`worker/push-game-alerts.js`, cron every 10 min) | 5 `site.web.api` scoreboards, no cache | No alert, error logged (measured) | **Silent**: zero errors, indistinguishable from an off day (measured) | Missing `events`: **silent** (measured). A JSON body behind a 403 was also silent, since the old reader never checked status (inferred, now tested) | n/a (no cache) | Every failure is DOWN with a reason; tolerance 0, no snapshot store, plus a second LIVE-only lock (`_liveOnly`). An empty slate still means "no games", no error |

### Runs off Cloudflare (the block only reaches them through a `sportstrata.cc/api/*` call)

| Consumer | Today | Covered? |
|---|---|---|
| Contract Check (`tools/contract-check.cjs`, GitHub runner) | A proxy failure is a warning; checks the browser-fallback data instead (D-182). Issues #15/#16 stay open | Unchanged. Proposal below |
| Sitemap (`tools/gen-sitemap.cjs`, daily) | Calls `site.api.espn.com` directly (whether runners are blocked is **untested**); `/api/ncaafstats` falls back to core; `/api/wnbastats` 502 means WNBA player URLs are skipped with a log line; an 800-URL floor stops a collapse | Not covered (Node on GitHub, not Cloudflare) |
| `bot/content_engine.py` (content-queue workflow) | `site.api.espn.com` direct from a runner | Not covered |
| Muse Stories agent | Fetches ESPN directly per PLAYBOOK step 3 | Not covered |

## Design

**One adapter:** `functions/_espnSource.js`, `readSource(key, url, {maxStaleMs, validate, ...})`. It returns `{state, data, fetchedAt, ageMs, reason}`.

- **LIVE**: 2xx, parseable JSON, no wrapped error (`ok:false`, `error`, or `found:false` with an `upstream…` reason), and the caller's shape check passes. Writes a last-good snapshot.
- **STALE**: the read failed, a snapshot exists, and its age is within the caller's tolerance. `data` is the snapshot; `fetchedAt` says when.
- **DOWN**: anything else. `data` is null; `reason` says why ("HTTP 403", "non-JSON body (HTTP 200)", "upstream error inside 200: upstream 403", "unexpected shape: no events array", "network: …"). When an expired snapshot exists, its age is still reported.

`maxStaleMs` is required; a call without it throws. `0` means LIVE or nothing, even with a snapshot written this millisecond.

**Snapshots** live in the Cache API (`caches.default`) under a synthetic host, kept 8 days. It's free and needs no binding (the Pages project is a dashboard build, so a KV binding would be owner setup). The costs: it is per-data-center and evictable, so a missing snapshot is normal and simply means DOWN.

**Tolerances** (`TOLERANCE` in the module):

| Consumer | Tolerance | Why |
|---|---|---|
| Push alerts | 0, no store | An alert from an old scoreboard can announce a postponed or already-started game, and a notification can't carry a receipt |
| Pick'em week table | 0, no store | A confidence ranking from old lines reads as a current pick |
| Home scores | 15 min | Beyond that, "couldn't be loaded" is more honest than an old score |
| Game pages | 30 min | The crawlable snapshot; the SPA replaces it with live data in the browser |
| Standings, leaders | 1 day | They move at most once a game day |
| Rankings, team, player | 7 days | Weekly polls and bios |

**Labelling:** `staleNote(src, what)` prints "Standings as of Nov 3, 7:42 PM ET: ESPN isn't answering our server, so this is the last copy we got." It uses an absolute time, not "12 min ago", because the page itself is edge-cached. `pageCacheControl` drops a STALE page to `max-age=60`. This is DESIGN.md's receipts rule applied to staleness.

**Health view:** `GET /api/sourcehealth`, JSON. It probes 8 upstreams (5 scoreboards, NFL standings, the core API, news) through the same `readSource` and reports per-source `upstream: LIVE|DOWN`, `reason`, `lastGoodAt` and `lastGoodAgeMin`, plus `overall: LIVE|DEGRADED|DOWN` and the tolerance table. It is always HTTP 200: it's a report, and "ESPN is down" is a valid one. The answer is edge-cached for 60s, so the endpoint can't be used to make the site hammer ESPN; it's also under `/api/*` rate limiting. I chose an endpoint over a page section because its readers are the owner and the contract monitor, and a page section would put eight upstream probes inside some reader's render. The scoreboard probes share keys and URLs with the home page, so a LIVE probe also refreshes home's last-good copy.

**Never in a proxy.** `_espnFetch` takes any 2xx from a passthrough proxy as final (`js/config.js:461-462`, verified by reading). A proxy that served a snapshot would keep readers on old data when their own browser could fetch live ESPN. The proxies keep returning honest failures; only server-rendered consumers use snapshots.

## What this deliberately does not do

- **STALE is dormant in production today** (inferred from the design, and the most important caveat here). Snapshots are written only on a LIVE read, and every Cloudflare-egress read is DOWN right now, so no snapshot exists to serve. What ships and matters now is honest classification, the health view, the push reasons and the athlete-proxy fix. STALE starts working after the first LIVE read once ESPN answers again, and then covers a later relapse.
- **No seeding of snapshots from outside Cloudflare.** A GitHub job could fetch ESPN from a runner and commit snapshots (the D-181 `content/nba/standings.json` pattern), which would make STALE real today. I didn't build it: deliberately routing ESPN data around a Cloudflare-specific block is close to the evasion the brief rules out, so it's the owner's call.
- **No snapshots in `/api/*` proxies** (see above), and no change to their status codes.
- **Not covered:** the seven NFL-only proxies without a browser fallback, the sitemap generator, the Python bot, and the Muse agent. None runs server-rendered on Cloudflare except the proxies, and those have readers as their consumer.
- **cf edge caching is invisible to the layer.** LIVE means "fresh within that fetch's `cf.cacheTtl`": 60s for home, 120s for games, 900s for Pick'em. The layer can't see the edge cache's age.
- **Enrichment sub-fetches stay raw:** the NCAAF player's team-name lookup and the NFL leaders' Sleeper id join. Both degrade to blank fields, not wrong ones.
- **No CSS.** `.ss-stale` is a plain `<p>` inside `.ss-prerender` and inherits its styles, so `sw.js` needs no bump.

## Contract Check: proposed, not changed

Today a proxy failure is a WARN (`proxyBlocked`), and #15/#16 stay open as the record. I propose that the nightly run also fetch `/api/sourcehealth` and print one informational line: "server-side ESPN: DOWN (8/8), last good copy none". The WARN would then carry the server's own view and the age of what it could serve. It should not change pass/fail or close issues. Owner decision; nothing in `tools/contract-check.cjs` was touched.

## If ESPN unblocks the proxies tomorrow

Nothing special happens: reads start coming back 2xx with valid JSON, so `readSource` returns LIVE everywhere. Templates render exactly as their LIVE column did before this change (measured: identical), push sends as before (5/5 in the test control), and `/api/sourcehealth` reports `overall: LIVE`. There are no flags to flip and no code to remove. The one lasting difference is that LIVE reads now leave snapshots behind, so a later relapse shows labelled STALE pages for a while before falling to DOWN.

## Tests

`tests/espnSource.test.js` runs the real `onRequest`/`runAlerts` code with only fetch, the Cache API, `env.ASSETS`, D1 and the web-push library stubbed. Ten modes: live, 403 HTML, 403 JSON (push), 502 text, non-JSON 200, error-in-200, empty or malformed shape, network error, stale copy, too-old copy, no copy. Mutation-checked: making push tolerate a 15-minute copy, dropping the stale receipt, or leaving stale rows "live" each fails the suite. The same matrix run against origin/main's templates gives identical LIVE and DOWN columns, which shows the change is additive.
