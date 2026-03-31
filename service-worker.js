const CACHE_NAME = "rc-transport-cache-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./Booking/booking.html",
  "./Dispatch/Dispatch.html",
  "./Dispatch/dispatch.css",
  "./Index/index.css",
  "./Booking/booking.css",
  "./Index/app.js",
  "./Dispatch/Dispatch.js",
  "./Preview/preview.html",
  "./Preview/preview.css",
  "./Preview/preview.js",
  "./Preview/godown-preview.html",
  "./Preview/godown-preview.js",
  "./employee/employee.html",
  "./employee/employee.css",
  "./employee/employee.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-16x16.png",
  "./icons/favicon-32x32.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request)
        .then(networkResponse => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            event.request.url.startsWith(self.location.origin)
          ) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
