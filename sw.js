// Offline: die App-Dateien kommen aus dem Zwischenspeicher, die Vereinsdaten liegen in IndexedDB (app.js).
const CACHE = "ttv08-app-v7";
const DATEIEN = ["./", "index.html", "app.css?v=7", "app.js?v=7", "config.js?v=7", "manifest.webmanifest",
  "icon-192.png", "apple-touch-icon.png", "wappen.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // Google-Zugriffe nie zwischenspeichern
  // Erst das Netz (neue Fassung der App), ohne Netz der Zwischenspeicher
  e.respondWith(fetch(e.request).then((antwort) => {
    if (antwort.ok) { const kopie = antwort.clone(); caches.open(CACHE).then((c) => c.put(e.request, kopie)); }
    return antwort;
  }).catch(() => caches.match(e.request, { ignoreSearch: false }).then((t) => t || caches.match("index.html"))));
});
