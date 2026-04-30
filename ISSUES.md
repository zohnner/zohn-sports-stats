# Issues

Active issues in priority order. When fixed, delete the row — the fix lives in the code and the git message.

## P1 — Critical

| ID | File | Description |
|---|---|---|
| P1-006 | [`js/api.js:11`](js/api.js#L11) | `BDL_API_KEY` is plaintext in source — any public push leaks it. Fix: deploy `worker/bdl-proxy.js`, set `BDL_PROXY_URL` in `api.js`, remove the raw key. |

