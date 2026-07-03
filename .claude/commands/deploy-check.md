Run a pre-deployment checklist for SportStrata (Cloudflare Pages). Check each item and report pass/fail.

## Checks to perform

**1. BDL API key not hardcoded**
```bash
grep -n "BDL_API_KEY\s*=" js/api.js
```
FAIL if the line contains an actual key value (non-empty string). The key at `api.js:11` must be empty or the file must use `BDL_PROXY_URL` only.

**2. `_headers` file present**
```bash
ls _headers
```
FAIL if missing.

**3. CSP in `_headers` matches CSP in `index.html`**
Read both and compare the `connect-src` and `img-src` directives. Flag any domain present in one but not the other.

**4. Deployment-critical files committed**
```bash
git status --short -- index.html _headers functions/api/mlb.js js/navigation.js js/app.js
```
FAIL if any of those specific files show as modified or untracked. Other uncommitted work-in-progress files are advisory only — note them but do not fail the check.

**5. `BDL_PROXY_URL` status**
Check `js/api.js` — is `BDL_PROXY_URL` set to a Worker URL or left empty? Report which mode is active (development vs production).

**6. `.env` not in repo**
```bash
git ls-files .env
```
FAIL if `.env` is tracked.

**7. `worker/wrangler.toml` present**
```bash
ls worker/wrangler.toml
```
Report present/missing.

**8. Service-worker cache version bumped when cached assets change**
The SW (`sw.js`) precaches the static shell under `CACHE_NAME` (`sportstrata-vN`). If any precached asset changed in this deploy but `CACHE_NAME` was NOT bumped, returning visitors keep the old cached copy for a revalidation cycle. Auto-bump it:
```bash
# precached assets (must match STATIC_ASSETS in sw.js): index.html, css/*, js/*
CHANGED=$(git diff --name-only origin/HEAD -- index.html "css/*.css" "js/*.js" | grep -v "^sw.js$")
SW_BUMPED=$(git diff --name-only origin/HEAD -- sw.js)
CUR=$(grep -oE "sportstrata-v[0-9]+" sw.js | head -1)
```
If `CHANGED` is non-empty and `SW_BUMPED` is empty, increment the version: replace `sportstrata-vN` -> `sportstrata-v(N+1)` in BOTH the header comment and `CACHE_NAME` in `sw.js`, then `git add sw.js`. Report the bump (e.g. `v4 -> v5`). If `CHANGED` is empty, no bump needed (PASS). If already bumped this deploy, PASS.

## Output format

Print a table:
```
✅ PASS  BDL key not hardcoded in source
❌ FAIL  _headers missing
✅ PASS  CSP consistent between _headers and index.html
...
```

End with a summary count and the next recommended action.

**9. Unit tests pass**
```bash
node --test tests/stats.test.js tests/vbd.test.js
```
FAIL if any test fails. These guard the computed-stat math (wOBA/wRC+/FIP) and the VBD implied-value model against regressions.

**10. Delivery manifest in sync**
```bash
node tools/check-manifest.cjs
```
FAIL on exit 1 — a file referenced by index.html is missing from `sw.js` STATIC_ASSETS (or from disk). This catches the "shipped a view, forgot the precache entry" drift class (fantasy.js and sos.js were missing for weeks before this check existed).

**11. Theme contrast contract**
```bash
node tools/check-themes.cjs
```
Report-only for now (advisory). Once existing theme debts are cleared, switch to `--strict` and FAIL on errors. Any NEW theme must pass clean before merge.

**12. NUL-byte corruption scan (mount-write hazard)**
```bash
git diff --name-only origin/HEAD -- '*.js' '*.css' '*.html' '*.md' | while read f; do [ -f "$f" ] && n=$(tr -cd '\000' < "$f" | wc -c) && [ "$n" -gt 0 ] && echo "CORRUPT: $f ($n NUL bytes)"; done
```
FAIL if any file reports NUL bytes — this working tree has a history of corrupted writes (see ISSUES.md).

**13. Post-deploy: name-join health (live, optional but recommended weekly in-season)**
```bash
node tools/join-health.cjs https://zohn-sports-stats.pages.dev
```
Measures the Sleeper⇄nflverse veteran name-join rate on the deployed Functions. WARN < 90%, FAIL < 80% — a drop means roster churn broke the normalized-name bridge and player stat/advanced cards are silently emptying.
