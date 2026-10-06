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
    url: '/'
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
      body: data.body,
      url: data.url || '/',
      timestamp: data.timestamp || Date.now()
    },
    actions: [
      { action: 'open', title: '👉 Open' },
      { action: 'close', title: '✕ Close' }
    ],
    requireInteraction: true,
    tag: 'demo-web-push-' + Date.now(),
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click received:', event.action);
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const title = event.notification.title;
  const body = (event.notification.data && event.notification.data.body) || event.notification.body || '';
  const timestamp = (event.notification.data && event.notification.data.timestamp) || Date.now();

  const rawUrl = (event.notification.data && event.notification.data.url) || '/';
  const urlObj = new URL(rawUrl, self.location.origin);
  urlObj.searchParams.set('notify_title', title);
  urlObj.searchParams.set('notify_body', body);
  urlObj.searchParams.set('notify_time', timestamp);
  const targetUrl = urlObj.href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab with this origin is already open, focus it and notify
      for (const client of clientList) {
        if ('focus' in client && client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({
            type: 'NEW_NOTIFICATION',
            title,
            body,
            timestamp
          });
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      // Otherwise, open a new browser window/tab with the notification params
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
