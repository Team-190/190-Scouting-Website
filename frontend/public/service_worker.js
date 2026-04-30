const SW_VERSION = new URL(self.location.href).searchParams.get('v') || 'v2';
const CACHE_NAME = `app-shell-${SW_VERSION}`;
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

  // Let API calls through untouched. The service worker should never cache API
  // responses because stale JSON can break newer client/server contracts.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);

      // Always try to fetch a fresh version in the background
      const fetchPromise = fetch(event.request).then(response => {
        // Only cache GET requests (Cache API limitation)
        if (event.request.method === 'GET' && response.status === 200) {
          try {
            cache.put(event.request, response.clone());
          } catch (err) {
            console.error('Failed to cache:', err);
          }
        }
        return response;
      }).catch(err => {
        console.error('Fetch failed:', err);
        return null;
      });

      // Return cached immediately if available, otherwise wait for network
      return cached ?? await fetchPromise;
    })
  );
});
