# Secret Garden

A living garden that breathes with real weather, sky, and the moon, with scripture at its heart. The scene follows the actual sky at your location: sunrise warms the canvas, rain wets the stone archway, wisteria sways with the measured wind, and five paper lanterns ignite at dusk. Verses from the public domain King James Version rotate at the center, chosen to echo the mood of the garden.

Live web app: https://shaver3josiah.github.io/secret-garden/

Android APK: download `secret-garden.apk` from the [latest release](https://github.com/shaver3josiah/secret-garden/releases/tag/latest).

## Data sources

All realtime data comes from open sources that need no account or API key. Weather and air quality come from Open-Meteo. The space station position comes from wheretheiss.at. The moon phase is computed on the device and works offline. After the first launch the app works fully offline, with live data returning whenever a connection exists.

## Architecture

The repo is one source tree with two delivery targets.

`web/` is the complete dependency free PWA: one canvas scene, token based CSS with bundled OFL fonts, a service worker for offline shell caching, and the KJV verse set. GitHub Pages serves this folder directly.

`android/` is a thin Kotlin shell: a single activity hosting a WebView served through WebViewAssetLoader, with a native geolocation permission bridge, a branded splash screen, and external links handed to the system browser. A Gradle copy task syncs `web/` into the APK assets at build time, so the web app is the single source of truth.

`.github/workflows/` builds everything. `deploy-pages.yml` publishes `web/` to GitHub Pages on every push. `build-apk.yml` bootstraps the Gradle wrapper, signs, builds, and attaches `secret-garden.apk` to the rolling `latest` release.

## Installing the APK

Download `secret-garden.apk` from Releases on your phone, open it, and allow installation from your browser when Android asks. No store account is needed.

## Signing

If the repository secret `KEYSTORE_PASSPHRASE` is set, the first CI run generates a release keystore, encrypts it with AES-256, and commits `keystore.jks.enc` back to the repo. Every later build decrypts and reuses it, so the signature stays stable and updates install in place. Without the secret, builds are debug signed and each new build must be uninstalled before reinstalling.

## Building locally

Requires JDK 17 and Android SDK 34. From `android/`, run `gradle wrapper --gradle-version 8.7` once, then `./gradlew assembleRelease`.

## Provenance

`scripts/` holds the Pillow generators that produced every icon and the font bundler. `design/art-brief.md` records the art direction behind the archway, wisteria, and lantern scene elements. All artwork is original procedural drawing. Fonts are DM Sans and Playfair Display under the SIL Open Font License. Scripture text is the King James Version, public domain. Code is MIT licensed.
