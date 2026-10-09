/**
 * The importer fetches URLs supplied by users, so it must refuse to reach
 * anything on or behind this host: PostgreSQL, the API, xray, and the cloud
 * metadata endpoint.
 */
const { safeFetchHtml, BlockedUrlError } = require('../dist/lib/safeFetch');

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