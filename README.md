# Secret Garden

A living garden and river that breathe with real weather, sky, and the moon, with scripture drifting through the clouds. The scene follows the actual sky at your location. A sailing mode turns the ground into a river with a procedural sloop crossing under sun and moon glades; tools cover an hourly rain, wind, and satellite sheet, a geocoded sailing route planner, and her own verses added to the rotation. Verses from the public domain Berean Standard Bible drift across the sky, chosen to echo the mood of the scene.

Live web app: https://shaver3josiah.github.io/secret-garden/

Android APK: download `secret-garden.apk` from the [latest release](https://github.com/shaver3josiah/secret-garden/releases/tag/latest).

## Data sources

All realtime data comes from open sources that need no account or API key. Weather and air quality come from Open-Meteo. Road-trip routes come from the OSRM demo server, with towns along the way named by BigDataCloud. The moon phase and the compass and star finder are computed on the device and work offline. After the first launch the app works fully offline, with live data returning whenever a connection exists.

## Architecture

The repo is one source tree with two delivery targets.

`web/` is the complete dependency free PWA: one canvas scene, token based CSS with bundled OFL fonts, a service worker for offline shell caching, and the BSB verse set. GitHub Pages serves this folder directly.

`android/` is a thin Kotlin shell: a single activity hosting a WebView served through WebViewAssetLoader, with a native geolocation permission bridge, a branded splash screen, and external links handed to the system browser. A Gradle copy task syncs `web/` into the APK assets at build time, so the web app is the single source of truth.

`.github/workflows/` builds everything. `deploy-pages.yml` publishes `web/` to GitHub Pages on every push. `build-apk.yml` bootstraps the Gradle wrapper, signs, builds, and attaches `secret-garden.apk` to the rolling `latest` release.

## Installing the APK

Download `secret-garden.apk` from Releases on your phone, open it, and allow installation from your browser when Android asks. No store account is needed.

## Signing

If the repository secret `KEYSTORE_PASSPHRASE` is set, the first CI run generates a release keystore, encrypts it with AES-256, and commits `keystore.jks.enc` back to the repo. Every later build decrypts and reuses it, so the signature stays stable and updates install in place. Without the secret, builds are debug signed and each new build must be uninstalled before reinstalling.

## Building locally

Requires JDK 17 and Android SDK 34. From `android/`, run `gradle wrapper --gradle-version 8.7` once, then `./gradlew assembleRelease`.

## iOS

`ios/` is a thin SwiftUI shell mirroring `android/`: a WKWebView serving the bundled `web/` app, so the web app stays the single source of truth. `.github/workflows/ios-release.yml` builds, signs, and uploads it to TestFlight on every `ios-v*` tag, entirely on a GitHub macOS runner — no Mac needed. The one-time Apple account setup lives in [`ios/APPLE-SETUP.md`](ios/APPLE-SETUP.md).

## Provenance

The garden itself is painted by `web/garden-elements.js`, an original procedural element library from a Claude Design session: five tree species (including the weeping willow that carries the robin's nest), five flower species planted in golden-angle clusters by a Poisson-disc layout, grass, a koi-and-lily pond, a nesting robin on a forty-second feeding loop, butterflies, and a paper-cutout sloop, all tinted by continuous time-of-day palettes. The app mark — a sailboat cradled in a ring of daisies — is original vector art in `design/logo/`. `scripts/render_master.py` rasterizes it with headless Chrome and `scripts/generate_icons.py` composites every icon, splash, and adaptive-launcher size from that master; `scripts/` also holds the font bundler. `design/art-brief.md` records the art direction behind the archway, wisteria, and lantern scene elements, which are original procedural drawing. Fonts are DM Sans and Playfair Display under the SIL Open Font License. Scripture text is the Berean Standard Bible, public domain. Code is MIT licensed.
