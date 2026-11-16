// 匯率換算 App：介面與匯率資料都先連網取得最新版，離線時改用上次下載的版本。
const cachePrefix = `exchange-app:${self.registration.scope}:`;
const cacheName = `${cachePrefix}v4`;
const shell = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "icons/exchange-180.png", "icons/exchange-192.png", "icons/exchange-512.png"]
  .map((p) => new URL(p, self.registration.scope).href);
const indexUrl = new URL("index.html", self.registration.scope).href;
const dataUrls = ["../rates/latest.json", "../rates/history.json"].map((p) => new URL(p, self.registration.scope).href);

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

  if (dataUrls.includes(url.href)) {
    const dataUrl = url.href;
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      try {
        const res = await fetch(event.request);
        if (res.ok) await cache.put(dataUrl, res.clone());
        return res;
      } catch (error) {
        const cached = await cache.match(dataUrl);
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
    try {
      const response = await fetch(key, { cache: "no-cache" });
      if (response.ok) await cache.put(key, response.clone());
      return response;
    } catch (error) {
      return (await cache.match(key)) ?? Promise.reject(error);
    }
  })());
});
