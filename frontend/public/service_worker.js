const CACHE_NAME = 'scouting-static-__BUILD_ID__';
const IS_DEV = self.location.hostname === 'localhost' && self.location.port === '5173';

self.addEventListener('install', event => {
  if (!IS_DEV) event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(['/', '/index.html'])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => (key.startsWith('scouting-static-') || key.startsWith('app-shell-')) && key !== CACHE_NAME)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (IS_DEV || event.request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/api/') || ['/service_worker.js', '/offline-assets.json'].includes(url.pathname)) return;
  const navigation = event.request.mode === 'navigate';
  const staticAsset = url.pathname.startsWith('/assets/');
  if (!navigation && !staticAsset && url.pathname !== '/index.html' && url.pathname !== '/') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (staticAsset) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(event.request, { signal: controller.signal });
      if (!response.ok) throw new Error(`Navigation failed: ${response.status}`);
      await cache.put('/index.html', response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match('/index.html');
      if (cached) return cached;
      throw error;
    } finally { clearTimeout(timer); }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_OFFLINE' || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const manifest = await fetch('/offline-assets.json', { cache: 'no-store' });
      if (!manifest.ok) throw new Error('Offline download requires a production build.');
      const assets = ['/', '/index.html', ...await manifest.json()];
      for (let i = 0; i < assets.length; i++) {
        const url = new URL(assets[i], self.location.origin);
        if (url.origin !== self.location.origin) throw new Error('Invalid offline asset');
        if (!(await cache.match(url.href))) {
          const response = await fetch(url.href);
          if (!response.ok) throw new Error(`Could not download ${url.pathname}`);
          await cache.put(url.href, response);
        }
        port.postMessage({ completed: i + 1, total: assets.length });
      }
      port.postMessage({ done: true });
    } catch (error) { port.postMessage({ error: error.message }); }
  })());
});
