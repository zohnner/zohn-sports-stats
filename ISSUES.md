# Issues

Active issues in priority order. When fixed, delete the row — the fix lives in the code and the git message.

## P1 — Critical

| ID | File | Description |
|---|---|---|
| P1-006 | [`js/api.js:11`](js/api.js#L11) | `BDL_API_KEY` is plaintext in source — any public push leaks it. Fix: deploy `worker/bdl-proxy.js`, set `BDL_PROXY_URL` in `api.js`, remove the raw key. |

## P3 — Improvements

| ID | File | Description |
|---|---|---|
| P3-001 | [`js/mlb.js`](js/mlb.js) | Remaining a11y gaps: game card tiles and MLB team cards are `<div>` with onclick but no `role`/`tabindex`. Review all remaining onclick divs in the games and teams list views. |

