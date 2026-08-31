Take headless Chrome screenshots of the local dev server to visually verify layout.

## Steps

**1. Start a dev server** — pick based on what you're checking:
- **Pure static/layout check** (no live sport data needed): `python -m http.server 3001 &`. Fast, but it only serves static files — any page whose data comes through `/api/*` (NCAAF/NCAAB/WNBA scores, standings, leaders, etc.) will show a "Couldn't load" error under this server, since there's no Pages Function backing those routes. That is a test-environment artifact, not a real bug — don't report it as one.
- **Anything that fetches `/api/*`**: use `wrangler pages dev . --port 8792 --compatibility-date 2026-08-01 &` instead. Slower to boot (~10-15s — wait for `[wrangler:info] Ready on http://127.0.0.1:8792` in its log before screenshotting) but runs the real Pages Functions locally, so ESPN/MLB proxy data actually loads.

**2. Desktop screenshot** (1280×900) — the plain CLI flag approach is fine at this size:
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu --screenshot="$env:TEMP\ss_desktop.png" --window-size=1280,900 "http://localhost:3001"
```

**3. Mobile/narrow-viewport screenshot — use the CDP method, not `--window-size`.** Verified 2026-08-31: `--window-size=390,844` does **not** reliably produce a 390px viewport on this machine — a direct measurement of `window.innerWidth` under that flag came back 500px, and a screenshot taken that way visually looked like real content overflow (content designed for the wider actual viewport, scaled into a narrow output image) when the true, CDP-forced 390px render had zero overflow. Trust CDP's `Emulation.setDeviceMetricsOverride`, not the launch flag, for any viewport under roughly 800px.

```bash
# a) Launch Chrome with remote debugging (background), pointed at any starting page
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu --remote-debugging-port=9333 "http://localhost:3001" &
sleep 2
```

```javascript
// b) cdp_screenshot.js — write this once, reuse for any URL/viewport. Run with: node cdp_screenshot.js <outfile.png> <url> [width] [height]
const fs = require('fs');
async function main() {
  const [, , outFile, url, w, h] = process.argv;
  const width = Number(w) || 390, height = Number(h) || 844;
  const r = await fetch('http://localhost:9333/json');
  const tab = (await r.json()).find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let idc = 0;
  function send(method, params) {
    return new Promise(resolve => {
      const id = ++idc;
      const h = ev => { const m = JSON.parse(ev.data); if (m.id === id) { ws.removeEventListener('message', h); resolve(m.result); } };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Page.navigate', { url });
  await new Promise(res => setTimeout(res, 3500)); // let the SPA boot + fetch
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
  console.log('saved', outFile, `${width}x${height}`);
  ws.close();
}
main().catch(e => { console.error('ERROR', e); process.exit(1); });
```

```bash
# c) Run it
node cdp_screenshot.js "$TEMP/ss_mobile.png" "http://localhost:3001/#some-view" 390 844
```

If you need to sanity-check the viewport itself (not just eyeball the screenshot), the same CDP connection can `Runtime.evaluate` `window.innerWidth`/`document.body.scrollWidth` vs. a target element's `scrollWidth` — a scrollWidth exceeding innerWidth is real overflow; don't conclude overflow from a screenshot's visual proportions alone, since that's exactly what produced the false positive this note is warning about.

**4. View screenshots** using the Read tool.

**5. Report** what you see: header layout, nav surface correct for breakpoint, content area, any overflow/clipping/overlap issues — but if something looks like overflow at a narrow width, confirm it with the CDP `scrollWidth` check before reporting it as a bug.

## Notes
- If port 3001 (or 8792, or 9333) is in use, try the next port up.
- Desktop: should show sub-nav row in header, no menu button.
- Mobile (verified 2026-08-31 at a true, CDP-forced 390px width): shows the sport-switch trigger (not the full pill row), search icon, auth control, and a grid/menu button in the header, plus a 5-item bottom tab bar — no overflow, no clipping. If a "mobile" screenshot ever shows something narrower/more cramped than that, suspect the measurement first, not the site.
- `window.devicePixelRatio` in this environment is 1, not 2 — don't assume a `--window-size` value needs doubling for a target CSS width (this was also wrong in an earlier version of this file; both DPR *and* raw viewport-size assumptions from `--window-size` turned out to be unreliable here, which is why step 3 uses CDP instead of trusting either).
