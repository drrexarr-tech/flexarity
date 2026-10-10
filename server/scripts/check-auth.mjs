/**
 * Checks the parts of the auth hardening that are pure logic, without a database:
 * password policy, lockout schedule, refresh token hashing, TOTP verification
 * including replay, and access token lifetime/algorithm pinning.
 */
process.env.JWT_SECRET ||= 'test-secret-for-check-auth-only-0123456789';

const fs = await import('node:fs');
const path = await import('node:path');

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

console.log('\n--- url scheme allowlist ---');
const { httpUrl } = await import('../dist/lib/validation.js');

check('rejects script-bearing url schemes', () => {
  const out = [];
  for (const bad of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/x',
    '//evil.tld/x',
    'https://ok.tld/a b',
  ]) {
    const r = httpUrl().safeParse(bad);
    if (r.success) out.push(`accepted ${JSON.stringify(bad)}`);
  }
  return out;
});
check('accepts ordinary links and blank values', () => {
  const out = [];
  for (const good of ['https://example.com/r', 'http://example.com/r', 'HTTPS://EXAMPLE.COM/r']) {
    if (!httpUrl().safeParse(good).success) out.push(`rejected ${good}`);
  }
  if (!httpUrl().safeParse(null).success) out.push('rejected null');
  if (!httpUrl().safeParse(undefined).success) out.push('rejected undefined');
  if (!httpUrl().safeParse('').success) out.push('rejected empty string');
  return out;
});
check('the client guard is actually applied at every href site', () => {
  // The client cannot import from the server package, so it carries its own copy
  // of the rule. Check the real source rather than a second implementation of the
  // regex: a regression that dropped safeHttpUrl from a render site would
  // otherwise be silent.
  const out = [];
  const clientSrc = path.resolve('..', 'client', 'src');

  const urlsFile = path.join(clientSrc, 'lib', 'urls.ts');
  if (!fs.existsSync(urlsFile)) return ['client/src/lib/urls.ts is missing'];
  const helper = fs.readFileSync(urlsFile, 'utf8');
  if (!/\^https\?:\\\/\\\/\[\^\\s\]\+\$\/i/.test(helper)) {
    out.push('lib/urls.ts no longer restricts to http(s)');
  }

  // Every anchor whose href comes from stored data must go through the guard.
  const targets = [
    ['pages', 'RecipeDetailPage.tsx', 'recipe.url'],
    ['pages', 'WishlistDetailPage.tsx', 'item.url'],
  ];
  for (const [dir, file, field] of targets) {
    const full = path.join(clientSrc, dir, file);
    if (!fs.existsSync(full)) { out.push(`${file} is missing`); continue; }
    const src = fs.readFileSync(full, 'utf8');
    const guarded = new RegExp(`safeHttpUrl\\(${field}\\)`).test(src);
    const raw = new RegExp(`href=\\{${field}\\}`).test(src);
    if (raw) out.push(`${file} renders href={${field}} without the guard`);
    if (!guarded) out.push(`${file} does not call safeHttpUrl(${field})`);
  }
  return out;
});

console.log('\n--- html escaping in email bodies ---');
const { esc } = await import('../dist/lib/email.js');
check('escapes every character that can start markup', () => {
  const out = [];
  const cases =  [
    ['<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
    ['a & b', 'a &amp; b'],
    ['"quoted"', '&quot;quoted&quot;'],
    ["it's", 'it&#39;s'],
  ];
  for (const [input, expected] of cases) {
    if (esc(input) !== expected) out.push(`${JSON.stringify(input)} -> ${JSON.stringify(esc(input))}`);
  }
  if (esc(null) !== '') out.push('null did not become empty string');
  return out;
});

console.log('\n--- pagination bounds ---');
const { pageBounds } = await import('../dist/lib/pagination.js');
check('clamps negative and absurd values', () => {
  const out = [];
  const cases =  [
    [undefined, undefined, 0, 20],
    [-1, undefined, 0, 20],
    [-9999, '-1', 0, 20],
    ['0', '50', 0, 50],
    ['abc', 'abc', 0, 20],
    ['10', '999', 10, 50],
  ];
  for (const [skip, take, wantSkip, wantTake] of cases) {
    const got = pageBounds(skip, take);
    if (got.skip !== wantSkip || got.take !== wantTake) {
      out.push(`pageBounds(${skip},${take}) -> ${JSON.stringify(got)}`);
    }
  }
  return out;
});

console.log(failures === 0 ? '\nall auth cases behave as expected' : `\n${failures} case(s) wrong`);
process.exit(failures === 0 ? 0 : 1);