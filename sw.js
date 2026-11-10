// Ruang service worker: makes the installed app work offline.
// Bump VERSION when shipping so phones fetch the new files.
const VERSION = 'ruang-1.1.0';
const PRECACHE = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "assets/icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "js/app.js",
  "js/architect.js",
  "js/data.js",
  "js/geom.js",
  "js/i18n.js",
  "js/models.js",
  "js/photo.js",
  "js/viewer.js",
  "js/i18n/en.js",
  "js/i18n/es.js",
  "js/i18n/id.js",
  "js/i18n/ja.js",
  "js/i18n/ko.js",
  "js/i18n/zh-CN.js",
  "js/i18n/zh-TW.js",
  "vendor/three/three.module.js",
  "vendor/three/addons/BufferGeometryUtils.js",
  "vendor/three/addons/GLTFExporter.js",
  "vendor/three/addons/OrbitControls.js",
  "vendor/three/addons/OutlineEffect.js",
  "vendor/three/addons/RoomEnvironment.js",
  "vendor/three/utils/TextureUtils.js",
  "assets/sample-room.jpg",
  "assets/sample-room.json",
  "assets/styles/blueprint.jpg",
  "assets/styles/cartoon.jpg",
  "assets/styles/clay.jpg",
  "assets/styles/miniature.jpg",
  "assets/styles/pixel.jpg",
  "assets/styles/realistic.jpg",
  "assets/styles/sketch.jpg"
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Pages: try the network first so updates arrive, fall back to the cached shell offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('index.html', copy));
          return response;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }
  // Files: serve from cache at once, refresh it in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
