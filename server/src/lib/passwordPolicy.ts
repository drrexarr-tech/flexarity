/**
 * Password rules. Length is what actually raises the cost of guessing, so the
 * minimum is 10 characters and composition rules are kept light enough not to
 * push people towards "Password1!".
 */

/** The passwords that show up first in any credential stuffing list. */
const COMMON = new Set([
  'password', 'passw0rd', 'password1', 'password123', 'qwerty', 'qwerty123', '12345678',
  '123456789', '1234567890', '11111111', '00000000', 'iloveyou', 'sunshine', 'princess',
  'football', 'baseball', 'master', 'shadow', 'superman', 'trustno1', 'letmein',
  'welcome', 'admin', 'admin123', 'administrator', 'root', 'toor', 'guest',
  'secret', 'changeme', 'default', 'test', 'test123', 'user', 'user123',
  'пароль', 'парол123', 'пароль123', 'йцукен', 'йцукенг', 'привет', 'россия', 'любовь',
  'мама', 'папа', 'борись', 'заря', 'свет', 'звезда', 'дракон', 'вася', 'vasya',
]);

/**
 * Credential lists are full of a good word with digits stuck on the end
 * ("Пароль1234", "qwerty1234", "admin12345"), so an exact set lookup misses
 * exactly the passwords that get tried first. Trailing digits and the usual
 * punctuation are stripped before the lookup.
 */
function isCommon(lower: string): boolean {
  if (COMMON.has(lower)) return true;
  const stripped = lower.replace(/[0-9!@#$%^&*._-]+$/, '');
  return !!stripped && COMMON.has(stripped);
}

export const MIN_PASSWORD_LENGTH = 10;

export interface PasswordProblem {
  rule: string;
  message: string;
}

export function checkPassword(password: string, email?: string, name?: string): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  const lower = password.toLowerCase();

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push({
      rule: 'length',
      message: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`,
    });
  }

  if (isCommon(lower)) {
    problems.push({ rule: 'common', message: 'Этот пароль слишком распространённый' });
  }

  // A password that contains the account details is guessable from public data.
  const localPart = (email || '').split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    problems.push({ rule: 'containsEmail', message: 'Пароль не должен содержать email' });
  }
  if (name && name.length >= 4 && lower.includes(name.toLowerCase())) {
    problems.push({ rule: 'containsName', message: 'Пароль не должен содержать имя' });
  }

  if (/^(.)\1+$/.test(password)) {
    problems.push({ rule: 'repeated', message: 'Пароль не может состоять из одного повторяющегося символа' });
  }

  if (/^(0123456789|1234567890|abcdefghij|qwertyuiop)/.test(lower)) {
    problems.push({ rule: 'sequence', message: 'Пароль не может быть последовательностью символов' });
  }

  return problems;
}

/**
 * Lockout schedule. A short delay first so ordinary typos are forgiving, then a
 * real lockout once the guesses look deliberate, then a full day so that a
 * patient attacker cannot simply wait out the cooldown.
 */
const MAX_FREE_ATTEMPTS = 3;
const MAX_ATTEMPTS = 10;
const EXTENDED_UNTIL = 20;

export function delayForAttempt(attempt: number): number {
  if (attempt <= MAX_FREE_ATTEMPTS) return 0;
  if (attempt <= MAX_ATTEMPTS) return (attempt - MAX_FREE_ATTEMPTS) * 30_000;
  if (attempt <= EXTENDED_UNTIL) return 15 * 60_000;
  return 24 * 60 * 60_000;
}

export function lockoutDurationMs(attempt: number): number {
  return delayForAttempt(attempt);
}