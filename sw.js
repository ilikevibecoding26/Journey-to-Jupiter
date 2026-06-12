// Service Worker — v3 (network-first for core files, cache for offline fallback)
const CACHE_NAME = 'journey-to-jupiter-v7';

const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/game.js',
  '/style.css',
  '/manifest.json',
];

// Install: cache all files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate: delete ALL old caches so stale code never gets served
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for HTML and JS so updates land immediately.
// Falls back to cache only when offline.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isCore = url.pathname.endsWith('.js') ||
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/';

  if (isCore) {
    // Network-first: always try to get the freshest version
    event.respondWith(
      fetch(event.request)
        .then(networkResp => {
          // Update cache with fresh copy
          const clone = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return networkResp;
        })
        .catch(() => caches.match(event.request)) // offline fallback
    );
  } else {
    // Cache-first for images, icons, fonts etc.
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
