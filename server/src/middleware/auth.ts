import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokens';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Verifies the access token, its algorithm and its expiry, then checks that the
 * user's tokenVersion still matches. That last comparison is what makes
 * "log out everywhere" and password changes actually revoke access: bumping
 * tokenVersion invalidates every token already in circulation.
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const claims = verifyAccessToken(authHeader.slice(7));
  if (!claims) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, tokenVersion: true },
  });
  if (!user || user.tokenVersion !== claims.ver) {
    return res.status(401).json({ error: 'Сессия истекла, войдите заново' });
  }

  req.userId = user.id;
  next();
}