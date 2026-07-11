const CACHE = "secret-garden-v13";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
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
const NO_STORE = ["tilecache.rainviewer.com", "gibs.earthdata.nasa.gov"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== CACHE + "-data").map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
    return;
  }
  if (NO_STORE.some((h) => url.hostname === h)) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE + "-data").then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
