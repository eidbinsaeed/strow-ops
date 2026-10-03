/**
 * Strow Ops service worker - app shell + static asset cache only.
 *
 * Auth-protected pages and database-driven views are NOT cached - they
 * must always come from the network. The offline submit queue lives in
 * IndexedDB on the client side (src/lib/offline/queue.ts) and is replayed
 * on the next foreground when the network returns.
 *
 * Cache versioning: bump CACHE_VERSION to invalidate the cache on deploy.
 */
const CACHE_VERSION = "strow-ops-v2"; // v2: stop caching pages (stale pages after a deploy crashed the app)
const PRECACHE_URLS = [
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Only cache files whose name changes on every build (safe forever) and the
  // icons/manifest. Pages, page data (?_rsc=) and API calls ALWAYS come from the
  // network: serving an old cached page after a deploy points at code that no
  // longer exists and shows "Application error: a client-side exception".
  const immutable = url.pathname.startsWith("/_next/static/");
  const appAsset = /^\/(icon-[\w-]+\.png|manifest\.webmanifest|brand\/.*)$/.test(url.pathname);
  if (!immutable && !appAsset) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached && immutable) return cached;
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
        return res;
      } catch (e) {
        if (cached) return cached;
        throw e;
      }
    }),
  );
});

// Listen for "replay-queue" messages from the page after network returns.
self.addEventListener("message", (event) => {
  if (event.data?.type === "ping") {
    event.source?.postMessage({ type: "pong" });
  }
});

// ---------- Lock-screen notifications (Web Push) ----------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Strow", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/owner" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/owner", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          await w.focus();
          if ("navigate" in w) {
            try {
              await w.navigate(target);
            } catch (e) {
              /* focused is enough */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    }),
  );
});
