/* ECHO Service Worker — оболочка в кеше, config.json никогда не кешируем */
const CACHE = 'echo-v3';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './static/app.js',
  './static/style.css',
  './static/icon-180.png',
  './static/icon-192.png',
  './static/icon-512.png',
  './static/echo-title.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // координаты — всегда сеть, без кеша SW
  if (url.pathname.endsWith('/config.json') || url.pathname.endsWith('config.json')) {
    event.respondWith(
      fetch(new Request(req, { cache: 'no-store' })).catch(() => caches.match(req))
    );
    return;
  }

  // всё остальное — cache-first, офлайн оболочка
  event.respondWith(
    caches.match(req).then((hit) => {
      const fetchPromise = fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => hit);
      return hit || fetchPromise;
    })
  );
});
