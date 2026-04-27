Run a pre-deployment checklist for SportsStrata (Cloudflare Pages). Check each item and report pass/fail.

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

## Output format

Print a table:
```
✅ PASS  BDL key not hardcoded in source
❌ FAIL  _headers missing
✅ PASS  CSP consistent between _headers and index.html
...
```

End with a summary count and the next recommended action.
