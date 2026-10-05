// Offline support: network first (always fresh when online), cache as fallback.
const CACHE = "expenses-v6.1";
const FILES = ["./", "index.html", "css/app.css?v=6", "config.js?v=6", "stores.js?v=6", "receipt.js?v=6", "js/main.js?v=6",
  "js/util.js", "js/cats.js", "js/api.js", "js/media.js", "js/store.js", "js/ui.js", "js/create.js", "js/views.js", "js/views2.js",
  "manifest.webmanifest", "icon.svg"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match(e.request, { ignoreSearch: true }))));
});
