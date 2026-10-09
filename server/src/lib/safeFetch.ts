import dns from 'node:dns/promises';
import net from 'node:net';

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export class BlockedUrlError extends Error {}

/**
 * True for addresses that must never be reachable through a user-supplied URL.
 * The VPS hosts PostgreSQL, the API itself and xray on loopback, plus private
 * ranges, so an unguarded fetch would let anyone read them or use the box as a
 * proxy.
 *
 * Exported so it can be tested without touching DNS.
 */
export function isPrivateAddress(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (type === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    // IPv4-mapped and IPv4-compatible forms inherit the IPv4 verdict.
    const mapped = /^::(ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[2]);
    const head = lower.split(':')[0];
    if (/^f[cd][0-9a-f]{0,2}$/.test(head)) return true; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]?$/.test(head)) return true; // fe80::/10 link local
    return false;
  }
  return true;
}

/**
 * Reject the URL unless every address the hostname resolves to is publicly
 * routable.
 *
 * Residual risk: this is a DNS-rebinding gap, since the name is validated once
 * but fetch resolves it again when connecting. Closing it fully needs a
 * dispatcher pinned to the validated IP; that is not worth the complexity here,
 * and the reachable targets on this host are already password-protected.
 */
/**
 * URL.hostname keeps the brackets around IPv6 literals ("[::1]"), so net.isIP
 * and dns.lookup both reject the value and the address would fall through to a
 * DNS lookup instead of being refused outright.
 *
 * Exported for the same reason as isPrivateAddress: the bracket case is exactly
 * what made this test fail only inside the image.
 */
export function bareHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = bareHostname(hostname);
  const literal = net.isIP(host) ? host : null;
  const addresses = literal
    ? [{ address: literal, family: literal.includes(':') ? 6 : 4 }]
    : await dns.lookup(host, { all: true });

  if (!addresses.length) {
    throw new BlockedUrlError('Не удалось разрешить адрес сайта');
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new BlockedUrlError('Запрещено обращаться к внутренним адресам');
    }
  }
}

async function assertAllowedUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('Некорректная ссылка');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Поддерживаются только http и https');
  }
  if (url.username || url.password) {
    throw new BlockedUrlError('Ссылки с логином и паролем не поддерживаются');
  }
  await assertPublicHost(url.hostname);
  return url;
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; FlexRecipeBot/1.0)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'ru,en;q=0.8',
};

export interface SafeFetchResult {
  html: string;
  charset: string;
  /** True only when nothing declared the encoding and it had to be inferred. */
  guessed: boolean;
}

/** Labels browsers accept, mapped onto names TextDecoder knows. */
const CHARSET_ALIASES: Record<string, string> = {
  'cp-1251': 'windows-1251',
  'cp1251': 'windows-1251',
  'win-1251': 'windows-1251',
  '1251': 'windows-1251',
  'windows1251': 'windows-1251',
  koi8r: 'koi8-r',
  koi_ru: 'koi8-r',
  utf8: 'utf-8',
};

function normalizeCharset(label: string): string | null {
  const cleaned = label.trim().toLowerCase().replace(/["']/g, '');
  if (!cleaned) return null;
  return CHARSET_ALIASES[cleaned] ?? cleaned;
}

function decodeWith(bytes: Buffer, charset: string): string | null {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

/** First `<meta charset>` / `<meta http-equiv>` declaration in the raw head. */
function sniffMetaCharset(bytes: Buffer): string | null {
  const head = bytes.subarray(0, 4096).toString('latin1');
  const patterns = [
    /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i,
    /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(head);
    if (match) {
      const normalized = normalizeCharset(match[1]);
      if (normalized) return normalized;
    }
  }
  return null;
}

/**
 * Many Russian recipe sites still ship Windows-1251, and some declare it in the
 * HTTP header only, or not at all. Decoding those as UTF-8 replaces every
 * Cyrillic letter with U+FFFD, which is exactly what a user would see as rows of
 * diamonds. So: trust a declared charset, then the meta tag, then fall back to
 * UTF-8 only when the bytes really are valid UTF-8.
 */
export function decodeHtml(bytes: Buffer, contentType: string): SafeFetchResult {
  const fromHeader = normalizeCharset(/charset=([\w-]+)/i.exec(contentType)?.[1] ?? '');

  if (fromHeader) {
    const decoded = decodeWith(bytes, fromHeader);
    if (decoded) return { html: decoded, charset: fromHeader, guessed: false };
  }

  const fromMeta = sniffMetaCharset(bytes);
  if (fromMeta) {
    const decoded = decodeWith(bytes, fromMeta);
    // The page states its encoding, so this is not a guess even though the
    // HTTP header was silent.
    if (decoded) return { html: decoded, charset: fromMeta, guessed: false };
  }

  // No usable declaration: if the bytes decode cleanly as UTF-8, that is what
  // they are. Otherwise single-byte Cyrillic is the overwhelmingly likely case.
  const utf8 = decodeWith(bytes, 'utf-8');
  if (utf8 !== null && !utf8.includes('\uFFFD')) {
    return { html: utf8, charset: 'utf-8', guessed: true };
  }

  const fallback = decodeWith(bytes, 'windows-1251') ?? utf8 ?? '';
  return { html: fallback, charset: 'windows-1251', guessed: true };
}

export async function safeFetchHtml(
  rawUrl: string,
  { timeoutMs = 15000, maxBytes = 3_000_000, maxRedirects = 5 }: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertAllowedUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') throw new Error('Сайт не ответил вовремя');
      throw new Error('Не удалось загрузить страницу');
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Сайт вернул некорректное перенаправление');
      current = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) throw new Error(`Сайт вернул ошибку ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      throw new Error('Ссылка ведёт не на HTML-страницу');
    }

    // Cap the body so a hostile page cannot exhaust server memory.
    const reader = response.body?.getReader();
    if (!reader) {
      const bytes = Buffer.from(await response.text(), 'utf8');
      return decodeHtml(bytes, contentType);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Страница слишком большая');
      }
      chunks.push(value);
    }

    return decodeHtml(Buffer.concat(chunks), contentType);
  }

  throw new Error('Слишком много перенаправлений');
}