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
const { safeFetchHtml, BlockedUrlError, isPrivateAddress, bareHostname } = require('../dist/lib/safeFetch');

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