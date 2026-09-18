/*
 * The service worker.
 *
 * It does two jobs and deliberately not a third.
 *
 *   1. Receives pushes and shows them.
 *   2. Opens the right page when one is tapped, focusing a tab that is
 *      already there rather than opening a second one.
 *
 * What it does not do is cache anything private. A service worker cache
 * survives signing out and is shared by everybody who uses that browser
 * profile, so a cached `/cont/firma` is somebody else's company details
 * waiting for the next person. Only the offline page and the icons are
 * pre-cached, and every fetch of anything else goes to the network.
 *
 * Plain JavaScript in `public/` rather than a bundled route: a service
 * worker has to be served from the scope it controls, and the root is the
 * scope. It is not processed by the build, so there is nothing here that
 * needs processing.
 */

const CACHE = 'coridor-shell-v1';
const OFFLINE_URL = '/offline.html';

const SHELL = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A worker that refuses to install because one icon 404'd is a
      // worker that never receives a push either.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/*
 * Navigation requests only, and only to fall back when the network is
 * gone. Everything else — pages, API calls, anything with a session —
 * goes straight to the network and is never stored.
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
    ),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Coridor', body: event.data.text() };
  }

  const title = payload.title || 'Coridor';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192-maskable.png',
    // The tag is what makes a second notification of the same kind replace
    // the first instead of stacking six of them.
    tag: payload.tag || 'coridor',
    renotify: true,
    data: { url: payload.deep_link || '/cont' },
    lang: 'ro',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/cont';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // A tab already open on this origin is focused and navigated rather
      // than left behind a new one. Somebody who taps three notifications
      // should not end up with three windows.
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) return client.navigate(url);
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('notificationclose', (event) => {
  // Nothing is reported anywhere. A dismissal is not our business, and a
  // beacon here would be tracking somebody's attention without asking.
  void event;
});
