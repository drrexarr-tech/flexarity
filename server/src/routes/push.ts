import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { isPushConfigured, vapidPublicKey, sendPush } from '../lib/push';
import { authenticate, AuthRequest } from '../middleware/auth';

export const pushRouter = Router();

/**
 * Public key and readiness. Unauthenticated on purpose: the browser asks for
 * this before it has a session when the app is opened from the home screen.
 */
pushRouter.get('/public-key', (_req: Request, res: Response) => {
  const key = vapidPublicKey();
  res.json({ key, enabled: isPushConfigured() && !!key });
});

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

/**
 * Register this browser.
 *
 * The endpoint is the natural key, so signing in on a second device adds a row
 * rather than replacing the first, and the userId is refreshed on every login:
 * a subscription handed over by logging out and back in as somebody else would
 * otherwise keep delivering to whoever registered it first.
 */
pushRouter.post('/subscribe', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Некорректная подписка на уведомления' });
  }
  const { endpoint, keys } = parsed.data;

  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  if (existing) {
    // Somebody else may have registered it from a shared browser profile before.
    const now = await prisma.pushSubscription.update({
      where: { endpoint },
      data: { userId: req.userId!, p256dh: keys.p256dh, auth: keys.auth },
      select: { id: true },
    });
    return res.json({ ok: true, id: now.id });
  }

  const created = await prisma.pushSubscription.create({
    data: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: req.userId!,
      userAgent: (req.get('user-agent') || '').slice(0, 300),
    },
    select: { id: true },
  });
  res.status(201).json({ ok: true, id: created.id });
});

/** Turn this browser off. Scoped to the caller, so nobody can unsubscribe another device. */
pushRouter.delete('/subscribe', authenticate, async (req: AuthRequest, res: Response) => {
  const endpoint = z.object({ endpoint: z.string().url().max(2048) }).parse(req.body).endpoint;
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId } });
  res.json({ ok: true });
});

/** Used by the settings screen to prove the subscription actually works. */
pushRouter.post('/test', authenticate, async (req: AuthRequest, res: Response) => {
  const delivered = await sendPush(req.userId!, {
    title: 'Уведомления работают',
    body: 'Так будет выглядеть напоминание.',
    link: '/',
    tag: 'push-test',
  });
  res.json({ delivered });
});