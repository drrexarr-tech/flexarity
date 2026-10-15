// Runs the deployed bundle for real in a DOM and checks the app mounts.
//
// Everything else in the suite fetched files and statuses. That is exactly how a
// white screen reached production: 200, correct hashed name, healthy API, and a
// blank screen, because React threw during render and nothing was executing it.
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SITE = process.argv[2] || 'https://veheys.online';

const html = await (await fetch(SITE)).text();
const src = /<script[^>]+src="([^"]+)"[^>]*type="module"|<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html);
const bundleUrl = new URL(src?.[1] || src?.[2] || '/assets/index.js', SITE).toString();

const code = await (await fetch(bundleUrl)).text();
console.log(`  bundle: ${bundleUrl} (${code.length} bytes)`);

const dir = mkdtempSync(join(tmpdir(), 'flex-render-'));
const file = join(dir, 'bundle.mjs');
writeFileSync(file, code, 'utf8');

// The entry pulls its lazy routes in with relative dynamic imports. Node has to
// resolve those from disk, so the chunks are fetched next to the entry.
const chunkRefs = [...new Set([...code.matchAll(/["']\.\/(assets\/[A-Za-z0-9._-]+\.js)["']/g)].map((m) => m[1]))];
mkdirSync(join(dir, 'assets'), { recursive: true });
for (const ref of chunkRefs) {
  const body = await (await fetch(new URL('/' + ref, SITE))).text();
  writeFileSync(join(dir, ref), body, 'utf8');
}
console.log(`  pulled ${chunkRefs.length} lazy chunk(s)`);

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: SITE + '/',
  pretendToBeVisual: true,
});

const { window } = dom;
// The bundle reaches for these on load.
window.fetch = async (url, init) => {
  const target = String(url);
  if (target.includes('/api/')) {
    return new window.Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('unexpected fetch: ' + target);
};
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false,
}));
window.scrollTo = () => {};
window.alert = () => {};
// jsdom already provides localStorage on the window; defining it again needs the
// right realm and is not worth the trouble.

for (const key of ['window', 'document', 'navigator', 'location', 'HTMLElement', 'Element',
  'Node', 'SVGElement', 'MutationObserver', 'CustomEvent', 'Event', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'fetch']) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

let error = null;
try {
  await import('file:///' + file.replace(/\\/g, '/'));
} catch (err) {
  error = err;
}

// React renders on a microtask; give it a moment before judging.
await new Promise((r) => setTimeout(r, 1500));

const root = window.document.getElementById('root');
const html2 = root?.innerHTML || '';
const text = (root?.textContent || '').trim();

if (error) {
  console.log('  FAIL  the bundle threw while loading:');
  console.log('        ' + String(error.message).split('\n')[0]);
  process.exit(1);
}
if (html2.length === 0) {
  console.log('  FAIL  the bundle loaded but rendered nothing into #root');
  process.exit(1);
}
if (/may be used only in the context of a|Invalid hook call|Minified React error #/.test(text)) {
  console.log('  FAIL  a React error reached the screen: ' + text.slice(0, 120));
  process.exit(1);
}

console.log('  ok    the deployed app mounts and renders');
console.log(`  ok    ${html2.length} chars of markup, text starts: "${text.slice(0, 60)}"`);
process.exit(0);
