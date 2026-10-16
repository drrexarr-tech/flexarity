// Renders the deployed bundle while signed in.
//
// Everything else checked the app as a stranger: a token is absent, so the shell
// lands on the login form and none of the authenticated screens are ever built.
// A white screen on a signed-in phone has twice come from code that only runs
// once a session exists, so this is the half that matters.
import { JSDOM, VirtualConsole } from 'jsdom';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SITE = process.argv[2] || 'https://veheys.online';
const route = process.argv[3] || '/';

const html = await (await fetch(SITE + route)).text();
const src = /<script[^>]+src="([^"]+)"[^>]*type="module"|<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html);
const bundleUrl = new URL(src?.[1] || src?.[2] || '/assets/index.js', SITE).toString();
const code = await (await fetch(bundleUrl)).text();
console.log(`  bundle: ${bundleUrl} (${code.length} bytes)`);

const dir = mkdtempSync(join(tmpdir(), 'flex-auth-'));
const file = join(dir, 'bundle.mjs');
writeFileSync(file, code, 'utf8');

const consoleErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('error', (...a) => consoleErrors.push(a.map(String).join(' ').slice(0, 400)));
virtualConsole.on('jsdomError', (e) => consoleErrors.push('jsdomError: ' + String(e.message).slice(0, 300)));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: SITE + route,
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'render@example.com',
  name: 'Проверка',
  totpEnabled: false,
  publicKey: null,
  dateOfBirth: null,
  avatarUrl: null,
  telegramId: null,
};

// Anything under /api answers with something shaped like the real thing, so a
// page that indexes into a field it expects does not fail here for the wrong
// reason.
const answers = [
  ['/api/auth/me', USER],
  ['/api/push/public-key', { key: 'x'.repeat(80), enabled: true }],
  ['/api/push/status', { configured: true, devices: 1, lastSentAt: null, registeredAt: null }],
  ['/api/notifications/unread-count', { count: 0 }],
  ['/api/calendar', []],
  ['/api/tasks', []],
  ['/api/tasks/columns', { columns: [], assignedTasks: [], familyTasks: [] }],
  ['/api/family', []],
  ['/api/notes', { notes: [], total: 0, skip: 0, take: 20 }],
  ['/api/plans', []],
  ['/api/shopping', []],
  ['/api/wishes', []],
  ['/api/recipes', []],
];

window.fetch = async (url) => {
  const target = String(url);
  const hit = answers.find(([prefix]) => target.includes(prefix));
  const payload = hit ? hit[1] : [];
  return new window.Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false,
}));
// The bundle calls matchMedia bare, not as window.matchMedia, so the global has
// to exist too. Two screens were reported as broken by this script until it did.
globalThis.matchMedia = window.matchMedia;
window.scrollTo = () => {};
window.alert = () => {};

// The session the app looks for on boot.
window.localStorage.setItem('token', 'render-access-token');
window.localStorage.setItem('refreshToken', 'render-refresh-token');
window.localStorage.setItem('user', JSON.stringify(USER));

for (const key of ['window', 'document', 'navigator', 'location', 'HTMLElement', 'Element',
  'Node', 'SVGElement', 'MutationObserver', 'CustomEvent', 'Event', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage',
  'Storage', 'fetch', 'IntersectionObserver', 'ResizeObserver', 'matchMedia',
  'DocumentFragment', 'Text', 'Comment', 'HTMLInputElement', 'HTMLTextAreaElement',
  'HTMLSelectElement', 'HTMLButtonElement', 'HTMLFormElement', 'HTMLAnchorElement',
  'HTMLImageElement', 'SVGElement', 'DOMParser', 'NodeList', 'HTMLCollection',
  'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'TouchEvent', 'FocusEvent',
  'ClipboardEvent', 'DragEvent', 'FileReader', 'Blob', 'FormData', 'URL', 'AbortController']) {
  if (window[key] !== undefined) {
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

let error = null;
try {
  await import('file:///' + file.replace(/\\/g, '/'));
} catch (err) {
  error = err;
}

await new Promise((r) => setTimeout(r, 2500));

const root = window.document.getElementById('root');
const out = (root?.innerHTML || '').trim();
const text = (root?.textContent || '').trim();

if (error) {
  console.log('  FAIL  the bundle threw while loading:');
  console.log('        ' + String(error.message).split('\n')[0]);
  process.exit(1);
}
if (out.length === 0) {
  console.log('  FAIL  signed in, nothing rendered into #root');
  process.exit(1);
}
if (/may be used only in the context of a|Invalid hook call|Minified React error #/.test(text)) {
  console.log('  FAIL  a React error reached the screen: ' + text.slice(0, 140));
  process.exit(1);
}
if (/login|войти|почта/i.test(text.slice(0, 400)) && text.length < 400) {
  console.log('  FAIL  still on the login form: ' + text.slice(0, 120));
  process.exit(1);
}

if (/Что-то пошло не так/.test(text)) {
  console.log('  FAIL  the error boundary is on screen at ' + route);
  for (const line of consoleErrors.slice(0, 3)) console.log('        ' + line);
  process.exit(1);
}

console.log(`  ok    signed in app renders at ${route}`);
console.log(`  ok    ${out.length} chars of markup, text starts: "${text.slice(0, 70)}"`);
process.exit(0);