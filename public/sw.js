// Service Worker for Web Push Notifications

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activated');
  event.waitUntil(clients.claim());
});

// Handle incoming push notification even when the page is closed
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push event received!', event);

  let data = {
    title: '🔔 Notification Alert',
    body: 'You have a new update!',
    icon: '/icon.png',
    badge: '/icon.png',
    url: 'http://localhost:3000'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon.png',
    badge: data.badge || '/icon.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || 'http://localhost:3000',
      timestamp: data.timestamp || Date.now()
    },
    actions: [
      { action: 'open', title: '👉 Open' },
      { action: 'close', title: '✕ Close' }
    ],
    requireInteraction: true, // Keep notification visible until user interacts with it
    tag: 'demo-web-push-' + Date.now(),
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click (when user clicks the notification banner or 'Open' button)
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click received:', event.action);
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab with this origin is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            if ('navigate' in client) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
      }
      // Otherwise, open a new browser tab/window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
