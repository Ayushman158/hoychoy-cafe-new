self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', () => { clients.claim(); });
self.addEventListener('fetch', () => {});
