self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', () => {})

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async()=>{
    const all = await clients.matchAll({ type:'window', includeUncontrolled:true });
    for(const c of all){ if(c.url && /\/admin(\/|$)/.test(new URL(c.url).pathname)){ await c.focus(); return; } }
    await clients.openWindow('/admin');
  })());
});
