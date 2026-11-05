/* UniversityHub Service Worker — PWA offline shell + notification routing
 * v6: bump whenever the shell changes so existing installs refresh caches */
const CACHE = "universityhub-v6";
const OFFLINE_ASSETS = [
 "/",
 "/offline.html",
 "/manifest.json",
 "/icons/icon-192x192.png",
 "/icons/icon-512x512.png",
 "/notification.mp3",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* Strategies:
   - API ............ network-first (offline → JSON 503)
   - Navigations .... network-first (offline → cached shell)
   - Static assets .. cache-first (immutable _next/static, icons, fonts) */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: network-first — never serve stale data
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(JSON.stringify({ success: false, error: "You are offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  // Page navigations: network-first so users always get the newest UI,
  // cached shell only when actually offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("/")).then((c) => c || caches.match("/offline.html")))
    );
    return;
  }

  // Static assets: cache-first (hashed/immutable)
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});

/* Focus an open tab when a notification is clicked.
   lastPushLink carries the deep link from the most recent push payload
   (if any) so the click opens the relevant page, not always "/". */
let lastPushLink = null;

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = lastPushLink || "/";
  lastPushLink = null;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })
  );
});

/* Web-push support: show the pushed message as a notification.
   (Currently notifications are delivered by in-page polling; this
   handler makes the PWA push-ready for a future push server.) */
self.addEventListener("push", (event) => {
  let payload = { title: "UniversityHub", body: "You have a new update." };
  lastPushLink = null;
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        title: parsed.title || payload.title,
        body: parsed.body || parsed.message || payload.body,
      };
      if (typeof parsed.link === "string" && parsed.link) {
        lastPushLink = parsed.link;
      }
    }
  } catch {
    /* plain-text push — keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      tag: "universityhub-push",
      renotify: true,
    })
  );
});
