// Offline support: network first (always fresh when online), cache as fallback.
const CACHE = "palli-v9.0";
const FILES = ["./", "index.html", "css/app.css?v=9", "config.js?v=9", "stores.js?v=9", "receipt.js?v=9", "js/main.js?v=9",
  "js/util.js", "js/cats.js", "js/api.js", "js/media.js", "js/store.js", "js/ui.js", "js/create.js", "js/views.js", "js/views2.js", "js/importer.js", "js/importview.js",
  "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  // Android share sheet → Palli: a bank SMS (text) or a statement file
  if (e.request.method === "POST" && new URL(e.request.url).pathname.endsWith("/share")) {
    e.respondWith((async () => {
      const f = await e.request.formData(), file = f.get("file"), base = new URL("./", self.registration.scope).href;
      if (file && file.size) {
        const c = await caches.open("palli-share");
        await c.put("shared-file", new Response(file, { headers: { "content-type": file.type || "application/octet-stream", "x-name": encodeURIComponent(file.name || "statement") } }));
        return Response.redirect(base + "?shared=1", 303);
      }
      const txt = [f.get("title"), f.get("text")].filter(Boolean).join("\n");
      if (txt) await (await caches.open("palli-share")).put("shared-text", new Response(txt));   // kept out of URLs and the page cache
      return Response.redirect(base + "?shared=1", 303);
    })().catch(() => Response.redirect(new URL("./", self.registration.scope).href, 303)));
    return;
  }
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || (u.search && !/^\?v=[\w.]+$/.test(u.search))) return;   // never cache URLs with data in them (?sms=…)
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match(e.request, { ignoreSearch: true }))));
});
