/* Service worker: makes the whole app work with no internet.
 * Every file the app needs is saved on the phone the first time it opens (see ASSETS).
 * Files are then served from that saved copy; when the phone is online they are quietly refreshed for next time.
 * To publish an update, change VERSION below so phones pick up the new files. */
const VERSION = 'v1.0.0';
const CACHE = 'cosmetics-pos-' + VERSION;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './app.css',
  './app.js', './pdf.js', './exports.js', './finder.js', './pwa.js',
  './xlsx.min.js',
  './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('cosmetics-pos-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // pages: always answer with the saved index.html (the app is a single page)
    const key = req.mode === 'navigate' ? './index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    const refresh = fetch(req, { cache: 'no-cache' }).then(resp => {
      if (resp && resp.ok && resp.type === 'basic') cache.put(key, resp.clone());
      return resp;
    }).catch(() => null);
    if (cached) { event.waitUntil(refresh); return cached; }       // offline-first
    const net = await refresh;
    if (net) return net;
    if (req.mode === 'navigate') { const home = await cache.match('./index.html'); if (home) return home; }
    return new Response('Offline and this file was not saved yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
