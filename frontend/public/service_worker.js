const CACHE_NAME = 'app-shell-v1';
const IS_DEV = self.location.hostname === 'localhost';
const APP_SHELL = ['/', '/index.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (IS_DEV) return;
  const url = new URL(event.request.url);

  // Let API calls through untouched
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);

      // Always try to fetch a fresh version in the background
      const fetchPromise = fetch(event.request).then(response => {
        cache.put(event.request, response.clone());
        return response;
      }).catch(() => null); // if network fails, silently fall back

      // Return cached immediately if available, otherwise wait for network
      return cached ?? await fetchPromise;
    })
  );
});