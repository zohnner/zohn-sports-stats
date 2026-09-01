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
//
// Uses an isolated browser context (Target.createBrowserContext) per call, not
// the browser's default tab. Verified 2026-08-31 while checking a real JS fix:
// reusing the same tab across many navigations in one long-running headless
// Chrome process let this site's service worker (sw.js precaches /js/*) start
// shadowing every subsequent request for an edited file with the SW's cached
// copy -- Network.setCacheDisabled does NOT stop this, since a service worker
// intercepts at a layer above the HTTP cache. A code edit kept reading as
// "not applied" for several navigations in a row until switching to a fresh
// isolated context, which has no SW registration at all. If you ever see a
// screenshot that doesn't reflect a file you just changed, suspect the SW
// before the edit -- confirm by diffing `curl localhost:PORT/js/whatever.js`
// (ground truth: what the server actually serves) against what the page shows.
const fs = require('fs');
async function main() {
  const [, , outFile, url, w, h, waitMs] = process.argv;
  const width = Number(w) || 390, height = Number(h) || 844;
  const wait = Number(waitMs) || 6000;

  const ver = await (await fetch('http://localhost:9333/json/version')).json();
  const browserWs = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { browserWs.onopen = res; browserWs.onerror = rej; });
  let bidc = 0;
  function bsend(method, params) {
    return new Promise(resolve => {
      const id = ++bidc;
      const h = ev => { const m = JSON.parse(ev.data); if (m.id === id) { browserWs.removeEventListener('message', h); resolve(m.result); } };
      browserWs.addEventListener('message', h);
      browserWs.send(JSON.stringify({ id, method, params }));
    });
  }

  const { browserContextId } = await bsend('Target.createBrowserContext', {});
  const { targetId } = await bsend('Target.createTarget', { url: 'about:blank', browserContextId });
  const tab = (await (await fetch('http://localhost:9333/json')).json()).find(t => t.id === targetId);
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

  await send('Network.enable', {});
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Page.navigate', { url });
  await new Promise(res => setTimeout(res, wait)); // let the SPA boot + fetch -- pages chaining several fetches (e.g. Draft HQ) can need 10-15s+, not the old 3.5s default
  // clip to width×height so you get the visible viewport, not the full scrollable page
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
  fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
  console.log('saved', outFile, `${width}x${height} wait=${wait}ms`);
  ws.close();
  await bsend('Target.disposeBrowserContext', { browserContextId });
  browserWs.close();
}
main().catch(e => { console.error('ERROR', e); process.exit(1); });
```

```bash
# c) Run it. Pass a longer wait (ms) for pages that chain several fetches.
node cdp_screenshot.js "$TEMP/ss_mobile.png" "http://localhost:3001/#some-view" 390 844 6000
```

If you need to sanity-check the viewport itself (not just eyeball the screenshot), the same CDP connection can `Runtime.evaluate` `window.innerWidth`/`document.body.scrollWidth` vs. a target element's `scrollWidth` — a scrollWidth exceeding innerWidth is real overflow; don't conclude overflow from a screenshot's visual proportions alone, since that's exactly what produced the false positive this note is warning about.

**Full-page vs. viewport-only:** the script above clips to the viewport. For a long page (e.g. a team roster), either bump `height` well past the content (`captureBeyondViewport: true` in the `captureScreenshot` call instead of `clip` also works, but pair it with a *small* window height passed to `setDeviceMetricsOverride` or you'll get a giant image that's hard to read at any zoom — better to request a specific tall `height` like 3000 and clip to that).

**4. View screenshots** using the Read tool.

**5. Report** what you see: header layout, nav surface correct for breakpoint, content area, any overflow/clipping/overlap issues — but if something looks like overflow at a narrow width, confirm it with the CDP `scrollWidth` check before reporting it as a bug.

## Notes
- If port 3001 (or 8792, or 9333) is in use, try the next port up.
- Desktop: should show sub-nav row in header, no menu button.
- Mobile (verified 2026-08-31 at a true, CDP-forced 390px width): shows the sport-switch trigger (not the full pill row), search icon, auth control, and a grid/menu button in the header, plus a 5-item bottom tab bar — no overflow, no clipping. If a "mobile" screenshot ever shows something narrower/more cramped than that, suspect the measurement first, not the site.
- `window.devicePixelRatio` in this environment is 1, not 2 — don't assume a `--window-size` value needs doubling for a target CSS width (this was also wrong in an earlier version of this file; both DPR *and* raw viewport-size assumptions from `--window-size` turned out to be unreliable here, which is why step 3 uses CDP instead of trusting either).
