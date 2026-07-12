const STATIC_CACHE = "blackwater-static-v1";
const GENERATED_CACHE = "blackwater-generated-v1";

self.addEventListener("install", () => {
  // Match state is authoritative and online-only. Installation deliberately
  // does not pre-cache HTML or invent an offline game mode.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("blackwater-"))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode === "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/socket.io/") ||
    url.pathname.startsWith("/health/") ||
    url.pathname === "/sw.js" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    return;
  }

  if (
    url.pathname.startsWith("/assets/") &&
    /[.-][a-f0-9]{8,}\./i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (
    url.pathname.startsWith("/sprites/") ||
    url.pathname.startsWith("/water/") ||
    url.pathname.startsWith("/audio/") ||
    url.pathname.startsWith("/pwa/")
  ) {
    event.respondWith(staleWhileRevalidate(request, GENERATED_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  if (!cached) return network;
  void network.catch(() => undefined);
  return cached;
}
