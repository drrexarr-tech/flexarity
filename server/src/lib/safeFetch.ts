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

export async function safeFetchHtml(
  rawUrl: string,
  { timeoutMs = 15000, maxBytes = 3_000_000, maxRedirects = 5 }: SafeFetchOptions = {}
): Promise<string> {
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
    if (!reader) return await response.text();

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
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  }

  throw new Error('Слишком много перенаправлений');
}