const CACHE_NAME = 'hc-static-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/manifest.webmanifest',
        'https://i.ibb.co/TDMPWZ2c/playstore.jpg'
      ]);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('i.ibb.co/TDMPWZ2c/playstore.jpg')){
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        try{
          const resp = await fetch(event.request, { mode: 'no-cors' });
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
