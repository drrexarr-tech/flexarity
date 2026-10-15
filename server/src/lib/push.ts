import webpush from 'web-push';
import { prisma } from './prisma';

/**
 * Web push delivery.
 *
 * VAPID keys live in the environment. The public key is handed to the browser to
 * subscribe with, and the private one signs every request; neither is ever sent
 * to a client. Without them push is simply off: every helper here resolves to a
 * no-op rather than throwing, because a missing push key must not take down an
 * invite or a task assignment.
 */

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@veheys.online';
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (err) {
    // A malformed pair must not be fatal for the whole process either.
    console.error('[PUSH] VAPID keys rejected:', err);
    return false;
  }
  return true;
}

export const isPushConfigured = (): boolean => configure();

export const vapidPublicKey = (): string => process.env.VAPID_PUBLIC_KEY || '';

/** 404 and 410 mean the browser dropped the subscription; anything else is transient. */
function isGone(status: number): boolean {
  return status === 404 || status === 410;
}

export type PushPayload = {
  title: string;
  body: string;
  /** In-app route to open when the notification is tapped. */
  link?: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag?: string;
  icon?: string;
  badge?: string;
};

/**
 * Send to every device of one user.
 *
 * A device that reports 404/410 is deleted rather than retried forever: the
 * browser has already dropped it and it will never succeed. Failures are
 * swallowed on purpose, because the notification row is the record of truth and
 * a push that cannot be delivered must not fail the request that caused it.
 */
export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  // This is called as `void sendPush(...)` from request handlers and from the
  // reminder sweep, which means a rejection here is an unhandled one - and an
  // unhandled rejection ends the process. A push that cannot be looked up or
  // sent must cost the notification nothing.
  try {
    return await deliver(userId, payload);
  } catch (err) {
    console.error('[PUSH] delivery aborted:', err);
    return 0;
  }
}

async function deliver(userId: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    link: payload.link || '/',
    tag: payload.tag || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
  });

  const dead: string[] = [];
  let delivered = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 * 12, urgency: 'normal' },
        );
        delivered++;
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastSentAt: new Date() },
        });
      } catch (err: any) {
        const status = err?.statusCode;
        if (isGone(status)) dead.push(sub.id);
        // 401 means our keys and the subscription disagree; it is not fixed by
        // retrying, but the browser still owns the subscription, so it is kept.
        else console.error(`[PUSH] delivery failed (${status ?? 'no status'}):`, err?.message || err);
      }
    }),
  );

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
    console.log(`[PUSH] dropped ${dead.length} dead subscription(s)`);
  }

  return delivered;
}

/** The same payload for many users at once, used by the daily sweep. */
export async function sendPushToMany(
  userIds: string[],
  build: (userId: string) => PushPayload,
): Promise<number> {
  let total = 0;
  for (const userId of userIds) {
    total += await sendPush(userId, build(userId));
  }
  return total;
}