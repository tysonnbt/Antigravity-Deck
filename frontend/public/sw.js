// === Antigravity Deck — Service Worker ===
// Handles: PWA install, app shell caching, notification display, notification click

const SW_VERSION = '1.1.0';
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

// === Fetch — stale-while-revalidate for app shell, network-first for API ===
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API calls or WebSocket upgrades
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

  // Next.js static assets (/_next/static/...) — immutable, hashed filenames → cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // App shell (HTML pages, /_next/data/...) — stale-while-revalidate
  // Serve cached version instantly, update cache in background
  const isNavigationOrData = event.request.mode === 'navigate' ||
    url.pathname.startsWith('/_next/data/') ||
    url.pathname.startsWith('/_next/') ||
    event.request.destination === 'script' ||
    event.request.destination === 'style';

  // Sound files and icons — cache-first (unchanged)
  const cachePatterns = ['/sounds/', '/favicon'];
  const isStaticAsset = cachePatterns.some((p) => url.pathname.includes(p));

  if (isNavigationOrData || isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached); // fallback to cache if offline
          // Stale-while-revalidate: return cached immediately, update in background
          return cached || fetchPromise;
        })
      )
    );
    return;
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

// === Web Push — notification from server (works even when tab is closed) ===
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'Antigravity Deck', body: event.data?.text() || 'New notification' };
  }

  const title = data.title || 'Antigravity Deck';
  const options = {
    body: data.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'ag-push',
    renotify: true,
    requireInteraction: false,
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
