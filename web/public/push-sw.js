// Siteline's push service worker (PRD section 7), registered with the scope /push/ next to
// Angular's service worker. It shows the data-only messages Firebase Cloud Messaging delivers
// ({ title, body, link }) and opens the link when the notification is tapped.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Not JSON: show a plain notification.
  }
  const data = payload.data || payload;
  const notification = payload.notification || {};
  event.waitUntil(
    self.registration.showNotification(data.title || notification.title || 'Siteline', {
      body: data.body || notification.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { link: data.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then((w) => w.navigate(link));
      return self.clients.openWindow(link);
    }),
  );
});
