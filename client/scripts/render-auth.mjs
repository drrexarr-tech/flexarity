// Renders the deployed bundle while signed in.
//
// Everything else checked the app as a stranger: with no token the shell lands
// on the login form and none of the authenticated screens are ever built. A
// white screen on a signed-in phone comes from code that only runs once a
// session exists, so this is the half that matters.
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
virtualConsole.on('error', (...a) => consoleErrors.push(a.map(String).join(' ').slice(0, 300)));
virtualConsole.on('jsdomError', (e) => consoleErrors.push('jsdomError: ' + String(e.message).slice(0, 200)));

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

const OTHER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'other@example.com',
  name: 'Собеседник',
  avatarUrl: null,
};

// Chats need a second person to exist at all: the list draws a row per chat out
// of its participants, so an empty array means the page renders its empty state
// and none of that code runs.
const CHAT = {
  id: '33333333-3333-4333-8333-333333333333',
  unreadCount: 2,
  keys: [],
  messages: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  participants: [
    { userId: USER.id, user: USER },
    { userId: OTHER.id, user: OTHER },
  ],
};

// Anything under /api answers with something shaped like the real thing, so a
// page that indexes into a field it expects fails for its own reason rather
// than this harness's.
const answers = [
  ['/api/auth/me', USER],
  ['/api/auth/public-key', { publicKey: null }],
  ['/api/push/public-key', { key: 'x'.repeat(80), enabled: true }],
  ['/api/push/status', { configured: true, devices: 1, lastSentAt: null, registeredAt: null }],
  ['/api/notifications/unread-count', { count: 0 }],
  ['/api/tasks/columns', { columns: [], assignedTasks: [], familyTasks: [] }],
  ['/api/notes', { notes: [], total: 0, skip: 0, take: 20 }],
  // The month endpoint wraps its result; getting this shape wrong made the
  // calendar look broken when it was the harness that was.
  ['/api/calendar/events', { events: [], birthdays: [] }],
  ['/api/calendar/upcoming', []],
  ['/api/chat', [CHAT]],
  ['/api/tasks', []],
  ['/api/family', []],
  ['/api/plans', []],
  ['/api/shopping', []],
  ['/api/wishes', []],
  ['/api/recipes', []],
];

// Longest prefix first, so /api/chat/.../messages does not match /api/chat.
answers.sort((a, b) => b[0].length - a[0].length);

const requestLog = [];
window.fetch = async (url, init) => {
  const target = String(url);
  const method = (init && init.method) || 'GET';
  requestLog.push(`${method} ${target.replace(/^https?:\/\/[^/]+/, '')}`);
  const hit = answers.find(([prefix]) => target.includes(prefix));
  const payload = hit ? hit[1] : [];
  // Deliberately not a real Response: jsdom does not ship a usable one, and
  // the API client only ever reads status, ok and json().
  return {
    status: 200,
    ok: true,
    json: async () => JSON.parse(JSON.stringify(payload)),
  };
};

window.matchMedia = (q) => ({
  matches: false, media: q, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false,
});
window.scrollTo = () => {};
window.alert = () => {};

// The bundle calls this bare rather than through window. Node already provides
// a global crypto with subtle, but it is a getter-only property.
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// The session the app looks for on boot.
window.localStorage.setItem('token', 'render-access-token');
window.localStorage.setItem('refreshToken', 'render-refresh-token');
window.localStorage.setItem('user', JSON.stringify(USER));
window.localStorage.setItem('userId', USER.id);

for (const key of ['window', 'document', 'navigator', 'location', 'HTMLElement', 'Element',
  'Node', 'SVGElement', 'MutationObserver', 'CustomEvent', 'Event', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage',
  'Storage', 'fetch', 'IntersectionObserver', 'ResizeObserver', 'matchMedia',
  'DocumentFragment', 'Text', 'Comment', 'HTMLInputElement', 'HTMLTextAreaElement',
  'HTMLSelectElement', 'HTMLButtonElement', 'HTMLFormElement', 'HTMLAnchorElement',
  'HTMLImageElement', 'DOMParser', 'NodeList', 'HTMLCollection', 'KeyboardEvent',
  'MouseEvent', 'PointerEvent', 'TouchEvent', 'FocusEvent', 'ClipboardEvent', 'DragEvent',
  'FileReader', 'Blob', 'FormData', 'URL', 'AbortController', 'matchMedia']) {
  if (window[key] !== undefined) {
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

let error = null;
// A page whose load rejects asynchronously would otherwise kill the process
// before any of the checks below run, and the only thing visible is Node's
// own dump of the minified bundle.
process.on('unhandledRejection', (reason) => {
  console.log('  FAIL  an unhandled rejection escaped the page');
  console.log('        ' + String(reason?.message || reason).slice(0, 140));
  console.log('        last requests: ' + requestLog.slice(-8).join(' | '));
  console.log('        stub failures: ' + (requestLog.filter((r) => r.startsWith('STUB FAILED')).join(' | ') || 'none'));
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.log('  FAIL  an uncaught exception escaped the page');
  console.log('        ' + String(err?.message || err).slice(0, 140));
  console.log('        last requests: ' + requestLog.slice(-8).join(' | '));
  process.exit(1);
});

try {
  await import('file:///' + file.replace(/\\/g, '/'));
} catch (err) {
  error = err;
}

await new Promise((r) => setTimeout(r, 2500));

const root = window.document.getElementById('root');
const out = (root?.innerHTML || '').trim();
const text = (root?.textContent || '').trim();

const BOUNDARY = 'Что-то пошло не так';
const failed = (why) => {
  console.log('  FAIL  ' + why);
  if (error) console.log('        load error: ' + String(error.message).split('\n')[0]);
  for (const line of consoleErrors.slice(0, 2)) console.log('        ' + line);
  console.log('        last requests: ' + requestLog.slice(-6).join(' | '));
  process.exit(1);
};

if (error) failed('the bundle threw while loading');
if (out.length === 0) failed('signed in, nothing rendered into #root');
if (text.includes(BOUNDARY)) failed('the error boundary is on screen at ' + route);
if (/may be used only in the context of a|Invalid hook call|Minified React error #/.test(text)) {
  failed('a React error reached the screen: ' + text.slice(0, 120));
}
if (text.length < 400 && /войти|почта/i.test(text)) failed('still on the login form: ' + text.slice(0, 100));

console.log(`  ok    signed in app renders at ${route}`);
console.log(`  ok    ${out.length} chars of markup, text starts: "${text.slice(0, 60)}"`);

// Rendering the shell is not the same as rendering the page: an empty state
// proves the boundary never fired and nothing more. Each of these is a string
// that only exists once that page's own content has been built.
const contentByRoute = {
  '/': 'Дела',
  '/tasks': 'Задачи',
  '/calendar': null, // the month header is a localised word; the grid is enough
  '/profile': 'Уведомления',
  '/notes': 'Заметки',
  '/shopping': 'Покупки',
  '/wishes': 'Хотелки',
  '/plans': 'Накопления',
  '/family': 'Семья',
  '/chats': null, // covered by the chat row check below
};
const expected = contentByRoute[route];
if (expected && !text.includes(expected)) {
  console.log(`  FAIL  ${route} rendered without "${expected}" - only the shell came up`);
  process.exit(1);
}
if (expected) {
  console.log(`  ok    ${route} content is on screen ("${expected}")`);
}

// The chat list draws a row per chat from its participants. Without this the
// page renders its empty state and passes, which proves nothing about the code
// that actually runs for a signed-in person with a conversation.
if (route === '/chats' && !text.includes(OTHER.name)) {
  console.log(`  FAIL  the chat row for "${OTHER.name}" is not on screen`);
  process.exit(1);
}
if (route === '/chats') {
  console.log(`  ok    the chat row is drawn, not just the empty state`);
}

process.exit(0);