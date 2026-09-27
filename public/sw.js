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
const CACHE_VERSION = "strow-ops-v1";
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

  // Skip auth-sensitive routes - always go to network
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/owner/") ||
    url.pathname === "/login" ||
    url.pathname === "/today"
  ) {
    return;
  }

  // Stale-while-revalidate for static assets and shell pages
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
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
