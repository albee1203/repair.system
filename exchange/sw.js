// 匯率換算 App：介面檔案優先用快取；匯率資料先連網，離線時改用上次下載的版本。
const cachePrefix = `exchange-app:${self.registration.scope}:`;
const cacheName = `${cachePrefix}v1`;
const shell = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "icons/exchange-180.png", "icons/exchange-192.png", "icons/exchange-512.png"]
  .map((p) => new URL(p, self.registration.scope).href);
const indexUrl = new URL("index.html", self.registration.scope).href;
const ratesUrl = new URL("../rates/latest.json", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(shell.map((url) => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(cachePrefix) && n !== cacheName).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";

  if (url.href === ratesUrl) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      try {
        const res = await fetch(event.request);
        if (res.ok) await cache.put(ratesUrl, res.clone());
        return res;
      } catch (error) {
        const cached = await cache.match(ratesUrl);
        if (!cached) throw error;
        const headers = new Headers(cached.headers);
        headers.set("x-from-cache", "1");
        return new Response(await cached.blob(), { status: 200, headers });
      }
    })());
    return;
  }

  if (!shell.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const key = event.request.mode === "navigate" ? indexUrl : url.href;
    return (await cache.match(key)) ?? fetch(event.request);
  })());
});
