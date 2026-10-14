/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

/**
 * The service worker also delivers push.
 *
 * vite-plugin-pwa was generating a bare Workbox worker, and Workbox has no
 * opinion about push at all: there was no way to turn one on, and the reason a
 * notification never arrived was invisible. This is the same precaching the
 * generated worker did, plus the push and notificationclick handlers.
 *
 * The private-data rule from the plugin config still holds here: nothing under
 * /api is cached, because the Cache API keys by URL and a bearer token decides
 * who the response belongs to.
 */

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();

// The app shell. Anything under /api is deliberately absent: see above.
precacheAndRoute(self.__WB_MANIFEST as any);
cleanupOutdatedCaches();


/** Shown when the payload has no icon of its own. */
const FALLBACK_ICON = '/icon-192.png';

self.addEventListener('push', (event: PushEvent) => {
  let payload: any = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A malformed payload is still worth showing; only the extras are lost.
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = String(payload.title || 'Flex');
  const options: NotificationOptions = {
    body: String(payload.body || ''),
    icon: payload.icon || FALLBACK_ICON,
    badge: payload.badge || FALLBACK_ICON,
    // A tag makes a second notification replace the first instead of stacking,
    // so a repeated sweep cannot bury the app under copies of itself.
    tag: payload.tag || undefined,
    data: { link: payload.link || '/' },
    lang: 'ru',
  };

  // Without a tag, showNow matters: on iOS a background push is delivered
  // silently unless it is asked to be shown immediately.
  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Tapping a notification opens the app where the thing happened.
 *
 * Any existing window is focused and told to navigate, because the app is a
 * single-page router: opening a second window for the same task and leaving the
 * first one behind is how two copies end up disagreeing about the state.
 */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const link = String((event.notification.data as any)?.link || '/');

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'navigate', link });
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(link);
    })(),
  );
});

function clientsClaim() {
  self.addEventListener('activate', (event: ExtendableEvent) => {
    event.waitUntil(self.clients.claim());
  });
}