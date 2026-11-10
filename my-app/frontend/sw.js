// Kakuma Creative Zone — service worker
// Network-first for HTML/CSS/JS/API (always fresh when online),
// cache-first for images/fonts/uploads (fast + offline-friendly).
const CACHE = "kcz-shell-v6";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/manifest.webmanifest",
  "/Copilot_20260612_155234.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

function isStatic(url) {
  return /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf)$/i.test(url.pathname)
      || url.pathname.startsWith("/uploads/");
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Skip cross-origin requests — let the browser handle them directly
  if (url.origin !== self.location.origin) return;

  // Cache-first for static binary assets
  if (isStatic(url)) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return resp;
        }).catch(() => cached)
      )
    );
    return;
  }

  // Network-first for everything else (HTML, CSS, JS, API) — always fresh online
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok && (url.pathname === "/" || /\.(html|css|js|webmanifest)$/.test(url.pathname))) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then(c => c || caches.match("/index.html")))
  );
});
