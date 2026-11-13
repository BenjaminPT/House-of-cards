// Service worker: сеть в приоритете, кеш — офлайн-запас. Сеть для WebRTC не затрагивается.
const VERSION = 'hoc-v1.0.1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'js/app.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE).catch(() => {});
    try {
      const list = await (await fetch('asset-manifest.json', { cache: 'no-cache' })).json();
      await Promise.all(list.map((u) => c.add(u).catch(() => {})));
    } catch { /* манифест может отсутствовать */ }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // PeerJS CDN и сигнальный сервер — напрямую
  e.respondWith((async () => {
    // сеть в приоритете (чтобы обновления доходили сразу), кеш — запасной вариант офлайн
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([fetch(req, { cache: 'no-cache' }), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
