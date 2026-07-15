const CACHE = "secret-garden-v30";
// unversioned on purpose: the radar/tile history must SURVIVE app updates — the old
// CACHE+"-data" name was wiped by every version bump, killing offline radar each release
const DATA = "secret-garden-data";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./build-stamp.js",
  "./garden-elements.js",
  "./constellations.js",
  "./verses.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.png",
  "./icons/favicon.svg",
  "./fonts/fonts.css",
  "./fonts/dm-sans-400.woff2",
  "./fonts/dm-sans-500.woff2",
  "./fonts/dm-sans-600.woff2",
  "./fonts/dm-sans-700.woff2",
  "./fonts/playfair-500.woff2",
  "./fonts/playfair-500-italic.woff2",
  "./fonts/playfair-600.woff2",
  "./fonts/playfair-600-italic.woff2"
];
// radar frame paths are immutable (timestamped ids), so caching tiles is safe and stops the
// scrub from re-fetching every tile on every frame — the whole 2-hour history stays available
const NO_STORE = ["gibs.earthdata.nasa.gov"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== DATA).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).catch((err) => {
      // offline with an evicted/missing cache entry: at least hand navigations the shell
      if (e.request.mode === "navigate") return caches.match("./index.html");
      throw err;
    })));
    return;
  }
  if (NO_STORE.some((h) => url.hostname === h)) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(DATA).then((c) => c.put(e.request, copy).then(() => trimData(c))).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// Opaque tile responses carry heavy quota padding, and radar frame URLs rotate every
// ~10 minutes — unbounded, this cache eventually trips origin quota and the browser
// can evict EVERYTHING (shell included: app won't start offline). Cap it.
// ponytail: FIFO trim, no LRU — the oldest entries are expired radar frames anyway
const MAX_DATA = 600;
let trimming = false;
function trimData(c) {
  if (trimming) return;
  trimming = true;
  c.keys()
    .then((keys) => Promise.all(keys.slice(0, keys.length - MAX_DATA).map((k) => c.delete(k))))
    .catch(() => {})
    .then(() => { trimming = false; });
}
