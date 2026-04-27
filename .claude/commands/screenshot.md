Take headless Chrome screenshots of the local dev server to visually verify layout.

## Steps

**1. Start dev server** (pick an unused port — try 3001, increment if busy):
```bash
python -m http.server 3001 &
```
Wait ~1 second before proceeding.

**2. Desktop screenshot** (1280×900):
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu --screenshot="$env:TEMP\ss_desktop.png" --window-size=1280,900 "http://localhost:3001"
```

**3. Mobile screenshot** (780×1600 → ~390px CSS width at DPR 2):
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu --screenshot="$env:TEMP\ss_mobile.png" --window-size=780,1600 "http://localhost:3001"
```

**4. View screenshots** using the Read tool:
- `C:\Users\zohnw\AppData\Local\Temp\ss_desktop.png`
- `C:\Users\zohnw\AppData\Local\Temp\ss_mobile.png`

**5. Report** what you see: header layout, nav surface correct for breakpoint, content area, any overflow/clipping/overlap issues.

## Notes
- If port 3001 is in use, try 3002, 3003, etc.
- Desktop: should show sub-nav row in header, no menu button.
- Mobile: should show menu button (grid icon) in header, bottom tab bar, no sub-nav.
- Chrome headless renders at DPR=2 by default; the 780px window-size gives ~390px CSS viewport.
