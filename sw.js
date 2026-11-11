const cachePrefix = `repair-shell:${self.registration.scope}:`;
const cacheName = `${cachePrefix}v1`;
const indexUrl = new URL("index.html", self.registration.scope).href;
const files = new Set([
  "index.html", "style.css", "app.js", "config.js", "manifest.webmanifest",
  "icons/repair-180.png", "icons/repair-192.png", "icons/repair-512.png",
].map((path) => new URL(path, self.registration.scope).href));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...files].map((url) => new Request(url, { cache: "reload" })));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(cachePrefix) && name !== cacheName)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";
  const home = event.request.mode === "navigate"
    && (url.href === self.registration.scope || url.href === indexUrl);
  if (!home && !files.has(url.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(home ? indexUrl : url.href) ?? fetch(event.request);
  })());
});
