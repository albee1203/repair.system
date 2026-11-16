const cachePrefix = `repair-shell:${self.registration.scope}:`;
const cacheName = `${cachePrefix}v4`;
const indexUrl = new URL("index.html", self.registration.scope).href;
const files = new Set([
  "index.html", "style.css", "app.js", "config.js", "manifest.webmanifest",
  "icons/repair-180.png", "icons/repair-192.png", "icons/repair-512.png",
].map((path) => new URL(path, self.registration.scope).href));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...files].map((url) => new Request(url, { cache: "reload" })));
    await self.skipWaiting(); // 新版立即接手，不必等所有視窗關閉
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

  // 先連網取得最新版並更新快取；離線時才使用快取。
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const key = home ? indexUrl : url.href;
    try {
      const response = await fetch(key, { cache: "no-cache" });
      if (response.ok) await cache.put(key, response.clone());
      return response;
    } catch (error) {
      return (await cache.match(key)) ?? Promise.reject(error);
    }
  })());
});
