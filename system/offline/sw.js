const CACHE_NAME = 'btled-pubmat-camera-v1';

// Assets we know we need up front. Fonts referenced by remixicon.css and the
// page itself get picked up automatically by the runtime cache-on-fetch logic
// below the first time they're requested, so we don't need to guess their exact URLs here.
const PRECACHE_URLS = [
  './',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/remixicon@4.5.0/fonts/remixicon.css',
  '../resources/image/pubmats/generic.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache each URL independently so one missing/failed asset
      // doesn't stop the rest from being precached.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url)
            .then((res) => { if (res && res.ok) return cache.put(url, res); })
            .catch(() => {})
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: serve from cache instantly when we have it
// (fast + works offline), and refresh the cache in the background when online.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
