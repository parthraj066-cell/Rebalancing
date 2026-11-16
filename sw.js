/* Rebalancing service worker.
   Page: network first, so a new version arrives; cached copy when offline.
   photos/index.json: network first, so new photos show up.
   photos/*: cache first in their own cache, which survives app updates. */
const VERSION = 'rebalancing-3.0.3';
const PHOTOS = 'rebalancing-photos';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== PHOTOS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function networkFirst(req, cacheName, key) {
  return fetch(req).then(r => {
    if (r && r.ok) { const copy = r.clone(); caches.open(cacheName).then(c => c.put(key || req, copy)); }
    return r;
  }).catch(() => caches.match(key || req));
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin === location.origin && (req.mode === 'navigate' || url.pathname.endsWith('/index.html'))) {
    e.respondWith(networkFirst(req, VERSION, 'index.html'));
    return;
  }
  if (url.origin === location.origin && url.pathname.endsWith('/photos/index.json')) {
    e.respondWith(networkFirst(req, PHOTOS));
    return;
  }
  if (url.origin === location.origin && url.pathname.includes('/photos/')) {
    /* a new ?r= revision replaces the old copy of the same file */
    e.respondWith(caches.open(PHOTOS).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
      if (r && r.ok) {
        const copy = r.clone();
        c.keys().then(ks => ks.forEach(k => { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) c.delete(k); }));
        c.put(req, copy);
      }
      return r;
    }))));
    return;
  }
  if (url.hostname === 'i.ytimg.com') {
    /* a video still: cache only a CORS-readable 200, never an opaque response (no status to check, about 7 MB of quota
       each in Chrome) and never the 120 x 90 placeholder, which the page swaps for mqdefault anyway */
    e.respondWith(caches.open(PHOTOS).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
      if (r && r.ok && r.type === 'cors') { const copy = r.clone(); c.put(req, copy); }
      return r;
    }))));
    return;
  }
  if (url.origin === location.origin || isFont) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return r;
    })));
  }
});
