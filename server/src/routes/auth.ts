import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalText } from '../lib/validation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  signAccessToken, signTwoFactorChallenge, verifyTwoFactorChallenge,
  hashRefreshToken, newRefreshToken, encryptSecret, decryptSecret,
  REFRESH_TTL_DAYS,
} from '../lib/tokens';
import { checkPassword, delayForAttempt, lockoutDurationMs } from '../lib/passwordPolicy';
import { newTotpSecret, totpUri, verifyTotp } from '../lib/totp';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Введите пароль'),
  name: z.string().min(2, 'Минимум 2 символа'),
});

const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Введите пароль'),
});

const USER_SELECT = {
  id: true, email: true, name: true, telegramId: true, vkId: true,
  avatarUrl: true, dateOfBirth: true, publicKey: true, totpEnabled: true,
} as const;

function formatLockout(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  if (minutes >= 60) return `${Math.round(minutes / 60)} ч`;
  return `${minutes} мин`;
}

async function issueSession(user: { id: string; tokenVersion: number }, req: Request) {
  const accessToken = signAccessToken(user.id, user.tokenVersion);
  const refreshToken = newRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
      userAgent: req.get('user-agent')?.slice(0, 250) ?? null,
      ip: req.ip ?? null,
    },
  });

  return { accessToken, refreshToken, expiresAt };
}

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = registerSchema.parse(req.body);

  const problems = checkPassword(password, email, name);
  if (problems.length) {
    throw new AppError(400, problems.map((p) => p.message).join('; '));
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(400, 'Пользователь с таким email уже существует');
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name },
  });

  await prisma.taskColumn.createMany({
    data: [
      { title: 'Нужно сделать', color: '#3B82F6', order: 0, userId: user.id },
      { title: 'В процессе', color: '#F59E0B', order: 1, userId: user.id },
      { title: 'Готово', color: '#10B981', order: 2, userId: user.id },
    ],
  });

  const { accessToken, refreshToken } = await issueSession(user, req);
  const created = await prisma.user.findUnique({
    where: { id: user.id },
    select: USER_SELECT,
  });

  res.status(201).json({ token: accessToken, refreshToken, user: created });
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });

  // Spend the same work whether or not the address exists, so response time
  // does not reveal which emails are registered.
  if (!user) {
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
    throw new AppError(400, 'Неверный email или пароль');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(
      429,
      `Вход заблокирован из-за слишком многочисленных неудачных попыток. Повторите через ${formatLockout(user.lockedUntil.getTime() - Date.now())}.`
    );
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    const attempts = user.failedLogins + 1;
    const shouldLock = attempts > 3;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: attempts,
        ...(shouldLock
          ? { lockedUntil: new Date(Date.now() + lockoutDurationMs(attempts)) }
          : {}),
      },
    });
    const wait = delayForAttempt(attempts);
    if (wait > 0) {
      throw new AppError(429, `Слишком много попыток. Повторите через ${formatLockout(wait)}.`);
    }
    throw new AppError(400, 'Неверный email или пароль');
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });

  // The password is correct but a second factor is still owed. Hand back a
  // short-lived ticket, not a session.
  if (user.totpEnabled && user.totpSecret) {
    const profile = await prisma.user.findUnique({ where: { id: user.id }, select: USER_SELECT });
    return res.json({
      requiresTwoFactor: true,
      twoFactorToken: signTwoFactorChallenge(user.id, user.tokenVersion),
      user: profile,
    });
  }

  const { accessToken, refreshToken } = await issueSession(user, req);
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: USER_SELECT });

  res.json({ token: accessToken, refreshToken, user: profile });
});

/** Second step of login: the ticket alone grants nothing without a valid code. */
authRouter.post('/login/2fa', async (req: Request, res: Response) => {
  const { twoFactorToken, code } = z.object({
    twoFactorToken: z.string().min(1),
    code: z.string().min(6).max(8),
  }).parse(req.body);

  const claims = verifyTwoFactorChallenge(twoFactorToken);
  if (!claims) throw new AppError(401, 'Сессия входа истекла, войдите заново');

  const user = await prisma.user.findUnique({ where: { id: claims.userId } });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    throw new AppError(400, 'Двухфакторная аутентификация не включена');
  }
  if (user.tokenVersion !== claims.ver) {
    throw new AppError(401, 'Сессия входа истекла, войдите заново');
  }

  const secret = decryptSecret(user.totpSecret);
  if (!secret) throw new AppError(500, 'Секрет не удалось прочитать');

  const step = verifyTotp(secret, code);
  if (step === null) {
    throw new AppError(400, 'Неверный код подтверждения');
  }
  if (user.totpLastStep !== null && step <= user.totpLastStep) {
    throw new AppError(400, 'Этот код уже использован, дождитесь следующего');
  }
  await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });

  const { accessToken, refreshToken } = await issueSession(user, req);
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: USER_SELECT });
  res.json({ token: accessToken, refreshToken, user: profile });
});

/**
 * Refresh rotates: the presented token is revoked and a new one issued, so a
 * stolen refresh token is usable at most once. Replaying an old one also clears
 * every session for that user, since it means the token leaked.
 */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { user: { select: { id: true, tokenVersion: true, lockedUntil: true } } },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError(401, 'Сессия истекла, войдите заново');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, tokenVersion: true },
  });
  if (!user || user.tokenVersion !== session.user.tokenVersion) {
    await prisma.session.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(401, 'Сессия истекла, войдите заново');
  }

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  const issued = await issueSession(user, req);
  res.json({ token: issued.accessToken, refreshToken: issued.refreshToken });
});

/** Step 1 of enrolment: hand back a secret to scan. Nothing is enabled yet. */
authRouter.post('/2fa/setup', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, totpEnabled: true },
  });
  if (!user) throw new AppError(404, 'Пользователь не найден');
  if (user.totpEnabled) throw new AppError(400, 'Двухфакторная аутентификация уже включена');

  const secret = newTotpSecret();
  // Stored encrypted but still inactive: a lost phone must not lock anyone out
  // before they confirm they can produce a valid code.
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: encryptSecret(secret), totpLastStep: null } });

  res.json({ secret, otpauthUri: totpUri(secret, user.email) });
});

/** Step 2: confirm the code actually works before switching it on. */
authRouter.post('/2fa/enable', authenticate, async (req: AuthRequest, res: Response) => {
  const { code } = z.object({ code: z.string().min(6).max(8) }).parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.totpSecret) throw new AppError(400, 'Сначала получите секрет');
  if (user.totpEnabled) throw new AppError(400, 'Двухфакторная аутентификация уже включена');

  const secret = decryptSecret(user.totpSecret);
  if (!secret) throw new AppError(500, 'Секрет не удалось прочитать');

  const step = verifyTotp(secret, code);
  if (step === null) throw new AppError(400, 'Неверный код подтверждения');

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, totpLastStep: step },
  });

  res.json({ message: 'Двухфакторная аутентификация включена' });
});

/**
 * Turning it off needs the password again. An attacker who steals a session must
 * not be able to remove the second factor and then log in with just a password.
 */
authRouter.post('/2fa/disable', authenticate, async (req: AuthRequest, res: Response) => {
  const { password, code } = z.object({
    password: z.string().min(1),
    code: z.string().min(6).max(8),
  }).parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new AppError(404, 'Пользователь не найден');
  if (!user.totpEnabled) throw new AppError(400, 'Двухфакторная аутентификация не включена');

  if (!(await bcrypt.compare(password, user.password))) {
    throw new AppError(400, 'Неверный пароль');
  }

  const secret = user.totpSecret ? decryptSecret(user.totpSecret) : null;
  if (!secret || verifyTotp(secret, code) === null) {
    throw new AppError(400, 'Неверный код подтверждения');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, totpLastStep: null },
  });

  res.json({ message: 'Двухфакторная аутентификация отключена' });
});

authRouter.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  const { refreshToken } = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {});
  if (refreshToken) {
    await prisma.session.updateMany({
      where: { userId: req.userId, tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.json({ message: 'Вы вышли' });
});

/** Invalidates every session on every device, then re-issues this one. */
authRouter.post('/logout-all', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, tokenVersion: true },
  });
  if (!user) throw new AppError(404, 'Пользователь не найден');

  await prisma.session.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { tokenVersion: { increment: 1 } },
  });

  const refreshed = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, tokenVersion: true } });
  const issued = await issueSession(refreshed!, req);
  res.json({ token: issued.accessToken, refreshToken: issued.refreshToken });
});

const oauthSchema = z.object({
  provider: z.enum(['telegram', 'vk']),
  data: z.record(z.any()),
});

import crypto from 'crypto';

/**
 * Verify a Telegram Login Widget payload.
 *
 * Telegram signs the fields with a key derived from the bot token, so the token
 * is mandatory here: without it there is no signature to check and accepting the
 * payload would let anyone claim any Telegram id. auth_date is also bounded so a
 * captured payload cannot be replayed indefinitely.
 */
function verifyTelegramLogin(data: Record<string, any>): { id: string; name: string } {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new AppError(503, 'Вход через Telegram не настроен на сервере');
  }

  const { hash, auth_date: authDate, ...rest } = data;
  if (typeof hash !== 'string' || !hash) {
    throw new AppError(400, 'Отсутствует подпись Telegram');
  }

  const checkArr = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(checkArr).digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(hash, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AppError(400, 'Недействительные данные Telegram');
  }

  // 24h matches Telegram's own guidance for treating a login payload as stale.
  const age = Date.now() / 1000 - Number(authDate);
  if (!Number.isFinite(age) || age < 0 || age > 86400) {
    throw new AppError(400, 'Данные Telegram устарели, попробуйте войти заново');
  }

  const id = String(rest.id ?? '');
  if (!/^-?\d+$/.test(id)) {
    throw new AppError(400, 'Некорректный идентификатор Telegram');
  }

  const name = [rest.first_name, rest.last_name].filter(Boolean).join(' ');
  return { id, name };
}

authRouter.post('/oauth', async (req: Request, res: Response) => {
  const { provider, data } = oauthSchema.parse(req.body);

  if (provider === 'vk') {
    // A VK login cannot be trusted without a server-side code exchange, and the
    // app id / service key are not configured. The previous implementation
    // looked accounts up by the client-supplied data.email, which let anyone
    // take over any registered address:
    //   POST /api/auth/oauth {"provider":"vk","data":{"id":"1","email":"victim@x"}}
    throw new AppError(503, 'Вход через VK пока не настроен на сервере');
  }

  if (provider === 'telegram') {
    const { id: telegramId, name } = verifyTelegramLogin(data);

    // Only ever resolve by the verified Telegram id. Falling back to an email
    // would let a verified login of one account bind itself to another.
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: `tg_${telegramId}@telegram.placeholder`, password: '', name, telegramId },
      });
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: USER_SELECT,
    });
    const issued = await issueSession(user, req);
    return res.json({ token: issued.accessToken, refreshToken: issued.refreshToken, user: profile });
  }

  throw new AppError(400, 'Неподдерживаемый провайдер');
});

// Link Telegram/VK to existing account
const linkSchema = z.object({
  provider: z.enum(['telegram', 'vk']),
  data: z.record(z.any()),
});

authRouter.post('/link', authenticate, async (req: AuthRequest, res: Response) => {
  const { provider, data } = linkSchema.parse(req.body);

  if (data.id === 'undefined' || data.id === 'null') {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { [provider === 'telegram' ? 'telegramId' : 'vkId']: null },
      select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
    });
    return res.json(user);
  }

  if (data.remove) {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { [provider === 'telegram' ? 'telegramId' : 'vkId']: null },
      select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
    });
    return res.json(user);
  }

  if (provider === 'vk') {
    throw new AppError(503, 'Вход через VK пока не настроен на сервере');
  }

  if (provider === 'telegram') {
    // Binding was previously authenticated but unverified: any logged-in user
    // could claim any Telegram id, and the real owner would then be logged into
    // the attacker's account. The same signature check as /oauth applies here.
    const { id: telegramId } = verifyTelegramLogin(data);
    const existing = await prisma.user.findUnique({ where: { telegramId } });
    if (existing && existing.id !== req.userId) {
      throw new AppError(400, 'Telegram уже привязан к другому аккаунту');
    }
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { telegramId },
      select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
    });
    return res.json(user);
  }

  throw new AppError(400, 'Неподдерживаемый провайдер');
});

authRouter.put('/public-key', authenticate, async (req: AuthRequest, res: Response) => {
  const { publicKey } = z.object({ publicKey: z.string() }).parse(req.body);
  await prisma.user.update({
    where: { id: req.userId },
    data: { publicKey },
  });
  res.json({ message: 'OK' });
});

authRouter.get('/public-key/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = String(req.params.userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { publicKey: true },
  });
  if (!user || !user.publicKey) throw new AppError(404, 'Пользователь не найден');
  res.json({ publicKey: user.publicKey });
});

// Update profile
const updateProfileSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    avatarUrl: optionalText(),
    dateOfBirth: optionalText(),
  });

authRouter.put('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  const data = updateProfileSchema.parse(req.body);
  const updateData: any = {};
  if (data.name) updateData.name = data.name;
  if (data.email) updateData.email = data.email;
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
  if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: updateData,
    select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
  });
  res.json(user);
});

// Uses authenticate rather than verifying the token inline: a malformed or
// expired token used to throw synchronously and surface as a 500 instead of a 401.
authRouter.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: USER_SELECT,
  });

  if (!user) {
    throw new AppError(404, 'Пользователь не найден');
  }

  res.json(user);
});
