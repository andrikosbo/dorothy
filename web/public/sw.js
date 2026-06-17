const CACHE_PREFIX = "dorothy-";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Dorothy depends on the Mac backend, so stale offline UI is misleading.
  // Keep the PWA installable while always asking the network for current files.
  e.respondWith(fetch(new Request(e.request, { cache: "no-store" })));
});
