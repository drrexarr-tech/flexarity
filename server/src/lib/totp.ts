import * as OTPAuth from 'otpauth';

/**
 * Time-based one-time passwords (RFC 6238). This is the part that actually
 * protects an account once a password has leaked: a stolen password alone is
 * not enough to get in.
 *
 * window: 1 accepts the neighbouring codes too, which matters because phone
 * clocks drift and a strict window rejects codes that are correct on screen.
 */
const WINDOW = 1;

export function buildTotp(secret: string, account: string, issuer = 'Flex'): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer,
    label: account,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/**
 * Returns the timestep the code matched, so the caller can refuse a code that
 * has already been spent. Without that an observer who reads a code over a
 * shoulder can replay it for the rest of its window.
 */
export function verifyTotp(secretBase32: string, code: string): number | null {
  const normalized = code.replace(/\D/g, '');
  if (normalized.length !== 6) return null;

  const token = buildTotp(secretBase32, 'user');
  const delta = token.validate({ token: normalized, window: WINDOW });
  if (delta === null) return null;

  return Math.floor(Date.now() / 1000 / 30) + delta;
}

export function totpUri(secretBase32: string, account: string, issuer = 'Flex'): string {
  return buildTotp(secretBase32, account, issuer).toString();
}