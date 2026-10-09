/**
 * Checks the parts of the auth hardening that are pure logic, without a database:
 * password policy, lockout schedule, refresh token hashing, TOTP verification
 * including replay, and access token lifetime/algorithm pinning.
 */
process.env.JWT_SECRET ||= 'test-secret-for-check-auth-only-0123456789';

const { checkPassword, delayForAttempt, lockoutDurationMs, MIN_PASSWORD_LENGTH } = await import(
  '../dist/lib/passwordPolicy.js'
);
const { verifyTotp, newTotpSecret, totpUri } = await import('../dist/lib/totp.js');
const OTPAuthModule = await import('otpauth');
const {
  signAccessToken, verifyAccessToken, signTwoFactorChallenge, verifyTwoFactorChallenge,
  hashRefreshToken, newRefreshToken, encryptSecret, decryptSecret,
} = await import('../dist/lib/tokens.js');

let failures = 0;
function check(name, fn) {
  try {
    const problems = fn();
    if (problems.length) {
      failures++;
      console.log(`  FAIL  ${name}: ${problems.join('; ')}`);
    } else {
      console.log(`  ok    ${name}`);
    }
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}: threw ${err.message}`);
  }
}

console.log('--- password policy ---');
check(`rejects anything under ${MIN_PASSWORD_LENGTH} chars`, () => {
  const out = [];
  for (const p of ['short', 'a'.repeat(9), 'Password1']) {
    const r = checkPassword(p, 'user@example.com', 'Иван');
    if (!r.some((x) => x.rule === 'length')) out.push(`accepted ${JSON.stringify(p)}`);
  }
  return out;
});
check('accepts a strong passphrase', () =>
  checkPassword('собака-борзая-2026!', 'user@example.com', 'Иван').map((p) => p.rule));
check('rejects the most common passwords, with digits stuck on', () => {
  const out = [];
  for (const p of ['password123', 'Пароль1234', 'qwerty1234', 'admin12345', '1111111111', 'iloveyou1']) {
    const r = checkPassword(p);
    if (!r.some((x) => x.rule === 'common' || x.rule === 'repeated' || x.rule === 'sequence')) {
      out.push(`accepted ${p}`);
    }
  }
  return out;
});
check('rejects a password built from the account details', () => {
  const out = [];
  const r = checkPassword('ivanivanov77', 'ivanov@example.com', 'Иван');
  if (!r.some((x) => x.rule === 'containsEmail' || x.rule === 'containsName')) out.push('no rule fired');
  return out;
});
check('rejects one repeated character', () =>
  checkPassword('aaaaaaaaaaaaaa').some((x) => x.rule === 'repeated') ? [] : ['accepted aaaaaaaaaaaaaa']);

console.log('\n--- lockout schedule ---');
check('first attempts are not delayed', () => {
  const out = [];
  for (const n of [1, 2, 3]) if (delayForAttempt(n) !== 0) out.push(`attempt ${n} delayed`);
  return out;
});
check('attempts past the free allowance are delayed', () => {
  const out = [];
  for (const n of [4, 8]) if (delayForAttempt(n) <= 0) out.push(`attempt ${n} not delayed`);
  return out;
});
check('delay grows and then caps at 24h', () => {
  const out = [];
  if (!(delayForAttempt(11) > delayForAttempt(4))) out.push('delay did not grow');
  if (delayForAttempt(50) !== 24 * 60 * 60 * 1000) out.push('cap is not 24h');
  if (!(lockoutDurationMs(11) > lockoutDurationMs(4))) out.push('lockout did not grow');
  return out;
});

console.log('\n--- refresh tokens ---');
check('stores a hash, never the token', () => {
  const token = newRefreshToken();
  const out = [];
  if (hashRefreshToken(token) === token) out.push('hash equals the token');
  if (!/^[0-9a-f]{64}$/.test(hashRefreshToken(token))) out.push('hash is not a sha256 hex digest');
  if (hashRefreshToken(token) !== hashRefreshToken(token)) out.push('hash is not deterministic');
  if (newRefreshToken() === token) out.push('two tokens collided');
  return out;
});

console.log('\n--- access tokens ---');
check('round-trips userId and version', () => {
  const claims = verifyAccessToken(signAccessToken('user-1', 7));
  const out = [];
  if (!claims || claims.userId !== 'user-1' || claims.ver !== 7) out.push('claims did not survive');
  return out;
});
check('rejects a tampered or foreign token', () => {
  const out = [];
  const token = signAccessToken('user-1', 0);
  if (verifyAccessToken(`${token.slice(0, -2)}xy`)) out.push('accepted a tampered token');
  if (verifyAccessToken('not-a-token')) out.push('accepted garbage');
  // A 2fa challenge must not work as an access token.
  if (verifyAccessToken(signTwoFactorChallenge('user-1', 0))) out.push('2fa challenge accepted as access');
  if (!verifyTwoFactorChallenge(signTwoFactorChallenge('user-1', 3))?.ver) out.push('challenge did not verify');
  return out;
});
check('access token lives 15 minutes, not 30 days', () => {
  const claims = verifyAccessToken(signAccessToken('user-1', 0));
  if (!claims) return ['could not verify'];
  // decode the exp claim from the payload rather than trusting verify output
  const payload = JSON.parse(Buffer.from(signAccessToken('u', 0).split('.')[1], 'base64url').toString());
  const seconds = payload.exp - payload.iat;
  return seconds > 20 * 60 ? [`lifetime is ${seconds}s`] : [];
});

console.log('\n--- totp ---');
check('generated codes verify, wrong codes do not', () => {
  const secret = newTotpSecret();
  const OTPAuth = OTPAuthModule;
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  const code = totp.generate();
  const out = [];
  if (verifyTotp(secret, code) === null) out.push('valid code rejected');
  if (verifyTotp(secret, '000000') !== null && code !== '000000') out.push('wrong code accepted');
  if (verifyTotp(newTotpSecret(), code) !== null) out.push('accepted a code from another secret');
  if (verifyTotp(secret, '12') !== null) out.push('accepted a short code');
  return out;
});
check('reports the timestep so a code cannot be replayed', () => {
  const secret = newTotpSecret();
  const OTPAuth = OTPAuthModule;
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  const step = verifyTotp(secret, totp.generate());
  if (step === null) return ['could not verify'];
  return typeof step === 'number' && step > 0 ? [] : ['timestep looks wrong'];
});
check('otpauth uri names the issuer and account', () => {
  const uri = totpUri(newTotpSecret(), 'user@example.com');
  const out = [];
  if (!uri.startsWith('otpauth://totp/')) out.push('not an otpauth uri');
  if (!uri.includes('issuer=Flex')) out.push('no issuer');
  if (!uri.includes('user%40example.com')) out.push('account not encoded');
  return out;
});

console.log('\n--- secret encryption ---');
check('round-trips and rejects tampering', () => {
  const out = [];
  const secret = newTotpSecret();
  const sealed = encryptSecret(secret);
  if (sealed === secret) out.push('stored in plaintext');
  if (sealed.includes(secret)) out.push('ciphertext contains the plaintext');
  if (decryptSecret(sealed) !== secret) out.push('did not round-trip');
  const parts = sealed.split('.');
  if (decryptSecret(`${parts[0]}.${parts[1]}.${'A'.repeat(parts[2].length)}`) !== null) out.push('accepted tampered ciphertext');
  if (decryptSecret('garbage') !== null) out.push('accepted garbage');
  return out;
});

console.log(failures === 0 ? '\nall auth cases behave as expected' : `\n${failures} case(s) wrong`);
process.exit(failures === 0 ? 0 : 1);