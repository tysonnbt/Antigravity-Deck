// === Antigravity Deck — Service Worker ===
// Handles: PWA install, notification display, notification click

const SW_VERSION = '1.0.0';
const CACHE_NAME = `ag-deck-${SW_VERSION}`;

// === Install ===
self.addEventListener('install', (event) => {
  console.log('[SW] Install v' + SW_VERSION);
  self.skipWaiting(); // activate immediately
});

// === Activate ===
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate v' + SW_VERSION);
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// === Fetch — network-first (real-time app, not offline-first) ===
self.addEventListener('fetch', (event) => {
  // Only cache same-origin GET requests for static assets
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Cache sound files and icons for offline notification playback
  const cachePatterns = ['/sounds/', '/favicon'];
  const shouldCache = cachePatterns.some((p) => url.pathname.includes(p));

  if (shouldCache) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached); // fallback to cache if offline
          return cached || fetchPromise;
        })
      )
    );
  }
  // For everything else, let the browser handle it normally (no interception)
});

// === Message from main thread — show notification ===
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, data } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: tag || 'ag-deck-notification',
      renotify: true,
      requireInteraction: false,
      data: data || {},
    });
  }
});

// === Notification click — focus or open the app ===
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if found
      for (const client of clients) {
        if (new URL(client.url).pathname === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise focus any existing tab
      if (clients.length > 0 && 'focus' in clients[0]) {
        return clients[0].focus();
      }
      // Last resort: open a new window
      return self.clients.openWindow(targetUrl);
    })
  );
});
