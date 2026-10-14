import { api } from './api';

/**
 * Browser push, from the user's side.
 *
 * Everything here degrades quietly: an iPhone that has not been added to the
 * home screen cannot hold a push subscription, a Safari that refused the
 * permission cannot be asked again behind the screen, and a browser without
 * Notification support should not break the settings page it lives on.
 */

function base64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushState = 'unsupported' | 'denied' | 'default' | 'granted' | 'subscribed';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function pushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

/** What the browser already holds for this origin, if anything. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function serverKey(): Promise<{ key: string; enabled: boolean } | null> {
  try {
    return await api.push.publicKey();
  } catch {
    return null;
  }
}

/**
 * Ask for permission and register this browser.
 *
 * Returns the resulting state rather than throwing, because the caller is a
 * settings toggle and a refusal is an ordinary outcome, not an error.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';

  const config = await serverKey();
  if (!config?.enabled || !config.key) return 'granted';

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8Array(config.key) as BufferSource,
  });

  const json = subscription.toJSON() as any;
  await api.push.subscribe({ endpoint: json.endpoint, keys: json.keys });

  return 'subscribed';
}

/** Stop notifications on this browser only, leaving other devices alone. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  // Tell the server first: if this throws the browser subscription is dropped
  // anyway and the server would keep pushing to an endpoint that answers 410.
  try {
    await api.push.unsubscribe(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
}

/** True when the browser is signed in for push *and* has permission. */
export async function isPushActive(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    return !!(await currentSubscription());
  } catch {
    return false;
  }
}