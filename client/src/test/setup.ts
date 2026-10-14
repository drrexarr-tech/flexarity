import { afterEach, beforeEach, vi } from 'vitest';

/**
 * jsdom has no service worker, no push manager and no real network. The app
 * talks to all three on load, so they are stubbed here rather than in each
 * test: a missing stub would show up as a render error and hide the thing the
 * test is actually about.
 */

if (!('serviceWorker' in navigator)) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      addEventListener: () => {},
      removeEventListener: () => {},
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => null,
          subscribe: async () => ({ toJSON: () => ({}) }),
        },
      }),
    },
  });
}

if (!('PushManager' in window)) {
  (window as any).PushManager = class {};
}

if (!('Notification' in window)) {
  (window as any).Notification = class {
    static permission = 'default';
    static requestPermission = async () => 'default';
  };
}

if (!('matchMedia' in window)) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Anything the app fetches on load answers empty rather than hitting a network
// the test does not have.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});