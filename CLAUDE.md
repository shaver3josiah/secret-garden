# Secret Garden — project rules for Claude

One web bundle (`web/`) wrapped by three shells: Android WebView (APK), iOS WKWebView
(TestFlight via `Ship-iOS.ps1` → GitHub Actions macOS runner), and a PWA. `web/` is the
single source of truth; a fix there ships to all three.

## Hard-won rules (from the radar saga, 5 failed builds — see MISTAKES.md)

### Rendering
- **Images that must change in unison go on ONE canvas.** An `<img>` keeps painting its
  old bitmap until a newly assigned `src` finishes downloading + decoding, so N imgs can
  never swap in step. The radar map is two inline-styled canvases (base + radar) for this
  reason — do not regress it to per-tile `<img>` grids, and avoid CSS grid for the map
  (its tracks blew out on a real device's WebKit even with `minmax(0,1fr)`).
- **Never position dynamically created elements via stylesheet rules** that might be
  stale-cached; use inline styles for layout-critical created nodes.

### iOS (WKWebView, `file://`) vs web/Android
- No service worker on `file://` — every network fetch is cold. Designs that assume the
  SW tile cache (many small fetches) trip third-party rate limits (RainViewer 429s show
  as random blank tiles). Prefer few large fetches; the radar uses 4 z5/512px tiles per
  frame, whole history prefetched (~76 requests).
- WKWebView asynchronously wipes a sheet's scroll position (to 0,0, no event) for a while
  after the sheet opens. One-shot centering writes get eaten; `centerRadar()` re-asserts
  per animation frame until the value survives 5 consecutive frames.
- WKWebView can hand out pre-layout viewport bounds at launch and never fire a resize;
  the scene self-heals via visualViewport listener + a 2s canvas/viewport sanity check
  in `init()`. Don't remove it.

### Verifying changes
- **Verify what the user sees, not proxies.** Checking `src` attributes / state markers
  "passed" twice while devices showed torn pixels. If it can't be observed here, say so.
- **The desktop preview pane runs pages as a HIDDEN document**: `requestAnimationFrame`
  never fires, timers throttle to ~1Hz, screenshots time out. Never test rAF/timer code
  there. It also serves stale cached files — always hard-bypass (`fetch(url,
  {cache:'reload'})` + SW unregister) before trusting it, and `resize_window` first
  (a 0×0 viewport collapses the whole layout).
- **Remote-device bugs: instrument first, iterate second.** The About sheet shows
  `Build <tag> (<run>) · WxH @DPRx` (CI stamps `web/build-stamp.js`). Every glitch
  report starts with that line — never debug a screenshot without knowing its build.
- After the **second** failed fix for one symptom, stop patching: re-derive the design
  from requirements and question the architecture.

## Shipping
- `./Ship-iOS.ps1` commits, pushes, tags `ios-v*`; CI archives → signs → uploads to
  TestFlight. Bump `web/sw.js` CACHE version whenever `web/` files change.
- Each cloud-signed build mints a throwaway "Created via API" dev cert; the account cap
  fills after ~6 ships and archives fail with "maximum number of certificates". Free
  slots: `python scripts/asc_api.py revoke-api-dev-certs ...` (keeps human-named +
  distribution certs). Permanent fix (manual distribution signing) still TODO.
- Apple setup / secrets: `ios/SETUP-WINDOWS.md`; API helper: `scripts/asc_api.py`.
