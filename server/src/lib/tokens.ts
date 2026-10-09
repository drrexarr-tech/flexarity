import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Access tokens stay short lived so a leaked one (via XSS, a shared link, a
 * stolen device) stops working quickly. Session continuity is carried by a
 * rotating refresh token instead of a 30 day bearer token.
 */
export const ACCESS_TTL = '15m';
export const REFRESH_TTL_DAYS = 30;

/** Pin the algorithm: without this jwt.verify will accept whatever alg the token declares. */
export const JWT_ALGORITHM = 'HS256' as const;

const SECRET = process.env.JWT_SECRET!;

export function signAccessToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ userId, ver: tokenVersion, typ: 'access' }, SECRET, {
    expiresIn: ACCESS_TTL,
    algorithm: JWT_ALGORITHM,
  });
}

/**
 * Short lived ticket returned when the password was correct but a second factor
 * is still required. It is not a session: it grants nothing on its own.
 */
export function signTwoFactorChallenge(userId: string, tokenVersion: number): string {
  return jwt.sign({ userId, ver: tokenVersion, typ: '2fa' }, SECRET, {
    expiresIn: '5m',
    algorithm: JWT_ALGORITHM,
  });
}

export interface AccessClaims {
  userId: string;
  ver: number;
}

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, SECRET, { algorithms: [JWT_ALGORITHM] }) as Record<string, unknown>;
    if (payload.typ !== 'access' || typeof payload.userId !== 'string') return null;
    return { userId: payload.userId, ver: Number(payload.ver) || 0 };
  } catch {
    return null;
  }
}

export function verifyTwoFactorChallenge(token: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, SECRET, { algorithms: [JWT_ALGORITHM] }) as Record<string, unknown>;
    if (payload.typ !== '2fa' || typeof payload.userId !== 'string') return null;
    return { userId: payload.userId, ver: Number(payload.ver) || 0 };
  } catch {
    return null;
  }
}

/** Only the hash is stored, so reading the database does not yield a usable token. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * TOTP seeds are shared secrets: they are the second factor itself, so anyone
 * reading them can generate valid codes forever. Encrypt at rest with a key
 * derived from JWT_SECRET, which is never written to the database.
 */
function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(`${SECRET}:totp`).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload: string): string | null {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}