// Cache-first shell so the app opens instantly and works with no signal.
// Bump CACHE when shipping changes, otherwise phones keep the old copy.
const CACHE = 'vocab-v3';

const SHELL = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'assets/css/app.css',
  'assets/js/main.js',
  'assets/js/store.js',
  'assets/js/auth.js',
  'assets/js/i18n.js',
  'assets/js/deck.js',
  'assets/js/practice.js',
  'assets/js/quiz.js',
  'assets/js/settings.js',
  'assets/js/favorites.js',
  'assets/js/speech.js',
  'assets/js/stats.js',
  'assets/js/awards.js',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'data/words-a-b.json',
  'data/words-c-d.json',
  'data/words-e-g.json',
  'data/words-h-l.json',
  'data/words-m-p.json',
  'data/words-q-s.json',
  'data/words-t-z.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
        // Serve instantly, then quietly refresh for next time.
        event.waitUntil(
          fetch(request)
            .then((res) => res.ok && caches.open(CACHE).then((c) => c.put(request, res.clone())))
            .catch(() => {})
        );
        return hit;
      }
      return fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match('index.html'));
    })
  );
});
