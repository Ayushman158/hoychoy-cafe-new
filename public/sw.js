const CACHE_NAME = 'hc-static-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/manifest.webmanifest',
        '/icons/icon-32.png',
        '/icons/icon-96.png',
        '/icons/icon-192-maskable.png',
        '/icons/icon-512-maskable.png',
        '/icons/icon-120.png',
        '/icons/icon-152.png',
        '/icons/icon-167.png',
        '/icons/icon-180.png'
      ]);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.startsWith(self.location.origin + '/icons/')){
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        try{
          const resp = await fetch(event.request);
          cache.put(event.request, resp.clone());
          return resp;
        }catch{
          return fetch(event.request);
        }
      })
    );
    return;
  }
});
