// Health Tracker PWA Service Worker
// NOTE: __BUILD_ID__ will be replaced by GitHub Actions during deploy
const CACHE = 'health-tracker-__BUILD_ID__';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sw.js'
];

// Guards
const isHttp = (url) => url.protocol === 'http:' || url.protocol === 'https:';
const isSameOrigin = (url) => url.origin === self.location.origin;

async function safeCachePut(request, response) {
  try {
    const url = new URL(request.url);
    if (!isHttp(url)) return;
    if (!response || (!response.ok && response.type !== 'opaque' && response.type !== 'opaqueredirect')) return;
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  } catch { /* ignore caching errors */ }
}

// Messages
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;
  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (msg.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'VERSION', cache: CACHE });
  }
});

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

// Fetch: same-origin cache-first; cross-origin network-first
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!isHttp(url)) return;

  if (isSameOrigin(url)) {
    event.respondWith((async ()=>{
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        safeCachePut(req, net.clone());
        return net;
      } catch {
        const shell = await caches.match('./index.html');
        return shell || Response.error();
      }
    })());
  } else {
    event.respondWith((async ()=>{
      try {
        const net = await fetch(req);
        safeCachePut(req, net.clone());
        return net;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return Response.error();
      }
    })());
  }
});