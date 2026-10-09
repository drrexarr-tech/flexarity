/**
 * The importer fetches URLs supplied by users, so it must refuse to reach
 * anything on or behind this host: PostgreSQL, the API, xray, and the cloud
 * metadata endpoint.
 *
 * The IPv6 cases matter more than they look. They passed on Windows only
 * because dns.lookup('[::1]') happened to resolve there; inside the alpine
 * image the same call failed with ENOTFOUND, which surfaced as a network error
 * instead of a refusal. A URL literal must be recognised without consulting DNS,
 * so these cases now pass identically on every platform.
 */
const { safeFetchHtml, BlockedUrlError, isPrivateAddress, bareHostname, decodeHtml } = require('../dist/lib/safeFetch');

// Pure checks first. The IPv6 bug shipped because dns.lookup('[::1]') resolves
// on Windows but fails with ENOTFOUND in alpine, so an end-to-end assertion on
// that case only ever failed in CI. These assertions need no resolver and hold
// on every platform.
const pure = [
  ['bareHostname strips IPv6 brackets', bareHostname('[::1]'), '::1'],
  ['bareHostname strips ULA brackets', bareHostname('[fd00::1]'), 'fd00::1'],
  ['bareHostname keeps normal names', bareHostname('example.com'), 'example.com'],
  ['bareHostname keeps bare IPv4', bareHostname('127.0.0.1'), '127.0.0.1'],
  ['loopback v4 is private', isPrivateAddress('127.0.0.1'), true],
  ['loopback v6 is private', isPrivateAddress('::1'), true],
  ['ULA v6 is private', isPrivateAddress('fd00::1'), true],
  ['link-local v6 is private', isPrivateAddress('fe80::1'), true],
  ['mapped v4 inherits verdict', isPrivateAddress('::ffff:127.0.0.1'), true],
  ['metadata is private', isPrivateAddress('169.254.169.254'), true],
  ['public v4 is public', isPrivateAddress('8.8.8.8'), false],
  ['public v6 is public', isPrivateAddress('2606:4700::1111'), false],
];

const targets = [
  ['loopback by name', 'http://localhost:3001/api/health'],
  ['loopback IPv4', 'http://127.0.0.1:3001/'],
  ['loopback IPv6', 'http://[::1]:5432/'],
  ['private 10/8', 'http://10.0.0.5/'],
  ['private 172.16/12', 'http://172.20.1.1/'],
  ['private 192.168/16', 'http://192.168.1.1/admin'],
  ['link-local metadata', 'http://169.254.169.254/latest/meta-data/'],
  ['carrier NAT', 'http://100.64.0.1/'],
  ['zero address', 'http://0.0.0.0/'],
  ['file scheme', 'file:///etc/passwd'],
  ['gopher scheme', 'gopher://127.0.0.1:6379/_'],
  ['credentials in url', 'http://user:pass@example.com/'],
  ['unique local v6', 'http://[fd00::1]/'],
];

(async () => {
  let failed = 0;

  // Russian recipe sites still ship single-byte encodings, and decoding those as
  // UTF-8 turns every Cyrillic letter into U+FFFD, which is what the user saw
  // as rows of diamonds. The bytes are written out by hand because Node has no
  // windows-1251 encoder: in that codepage Б=0x91, о=0xEE, р=0xF0, щ=0xF9.
  const ascii = (s) => Buffer.from(s, 'latin1');
  // Cyrillic letters in windows-1251: uppercase А..я occupy 0xC0..0xDF and
  // lowercase а..я occupy 0xE0..0xFF, so Б=0xC1, о=0xEE, р=0xF0, щ=0xF9.
  const BORSCH = Buffer.from([0xc1, 0xee, 0xf0, 0xf9]);
  const cp1251Borsch = Buffer.concat([
    ascii('<title>'), BORSCH,
    ascii('</title><meta charset="windows-1251"><h1>'), BORSCH,
    ascii('</h1>'),
  ]);
  const cp1251NoMeta = Buffer.concat([
    ascii('<title>'), BORSCH,
    ascii('</title><h1>'), BORSCH,
    ascii('</h1>'),
  ]);

  const encoding = [
    ['honours charset from the meta tag', decodeHtml(cp1251Borsch, 'text/html'), 'windows-1251', false],
    ['honours charset from the http header', decodeHtml(cp1251NoMeta, 'text/html; charset=windows-1251'), 'windows-1251', false],
    ['accepts cp1251 alias in the header', decodeHtml(cp1251NoMeta, 'text/html; charset=cp1251'), 'windows-1251', false],
    ['falls back to windows-1251 when bytes are not utf-8', decodeHtml(cp1251NoMeta, 'text/html'), 'windows-1251', true],
  ];

  for (const [name, got, wantCharset, wantGuessed] of encoding) {
    const decodedOk = got.html.includes('Борщ');
    const charsetOk = got.charset === wantCharset;
    const guessedOk = got.guessed === wantGuessed;
    const ok = decodedOk && charsetOk && guessedOk;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name} -> ${got.charset} (guessed=${got.guessed})`);
    if (!ok) {
      failed++;
      if (!decodedOk) console.log(`        cyrillic survived: ${decodedOk}, got: ${JSON.stringify(got.html)}`);
    }
  }

  const utf8Page = decodeHtml(Buffer.from('<h1>Борщ</h1>', 'utf8'), 'text/html');
  const utf8Ok = utf8Page.html.includes('Борщ') && utf8Page.charset === 'utf-8';
  console.log(`  ${utf8Ok ? 'ok  ' : 'FAIL'}  keeps genuine utf-8 as utf-8 -> ${utf8Page.charset}`);
  if (!utf8Ok) failed++;

  console.log('');
  for (const [name, got, want] of pure) {
    const ok = got === want;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name} -> ${JSON.stringify(got)}${ok ? '' : ` (expected ${JSON.stringify(want)})`}`);
    if (!ok) failed++;
  }
  console.log('');
  for (const [name, url] of targets) {
    try {
      await safeFetchHtml(url, { timeoutMs: 2500 });
      console.log(`  FAIL  ${name} -> was allowed through`);
      failed++;
    } catch (err) {
      const blocked = err instanceof BlockedUrlError;
      console.log(`  ${blocked ? 'ok  ' : 'WARN'}  ${name} -> ${blocked ? 'blocked' : 'failed as network error'}: ${err.message}`);
      if (!blocked) failed++;
    }
  }
  console.log(failed === 0 ? '\nall internal targets are refused' : `\n${failed} target(s) not blocked as intended`);
  process.exit(failed === 0 ? 0 : 1);
})();