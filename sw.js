// Service worker: оболочка кешируется, остальное — stale-while-revalidate. Сеть для WebRTC не затрагивается.
const VERSION = 'hoc-v1.0.0';
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
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  })());
});
