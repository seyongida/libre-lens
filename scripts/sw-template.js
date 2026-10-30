const CACHE = "libre-lens-__VERSION__";
const ASSETS = __ASSETS__;
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("libre-lens-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      // Network-first document: updates are discovered even with an old offline shell.
      if (event.request.mode === "navigate") {
        try {
          const response = await fetch(event.request);
          if (response.ok) return response;
        } catch {}
        return (
          (await caches.match(event.request)) ||
          (await caches.match(new URL("./", self.registration.scope).href))
        );
      }
      return (await caches.match(event.request)) || fetch(event.request);
    })(),
  );
});
