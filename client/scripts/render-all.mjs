// Runs the signed-in render check over every screen.
//
// Doing this by hand meant typing eleven near-identical commands and reading
// eleven answers. The routes are the ones behind the bottom navigation, so a
// new screen that is never opened here is a screen nobody looks at.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const site = process.argv[2] || 'https://veheys.online';

const routes = [
  '/', '/tasks', '/calendar', '/profile', '/notes',
  '/plans', '/wishes', '/shopping', '/family', '/recipes', '/chats',
];

let failed = 0;
for (const route of routes) {
  const run = spawnSync(
    process.execPath,
    [join(here, 'render-auth.mjs'), site, route],
    { encoding: 'utf8' },
  );
  const out = `${run.stdout || ''}${run.stderr || ''}`;
  const good = out.includes('ok    signed in app renders');
  const reason = (out.split('\n').find((l) => l.includes('FAIL')) || '').trim();
  if (!good) failed++;
  console.log(`  ${good ? 'ok   ' : 'FAIL '}${route}${reason ? `  ${reason}` : ''}`);
}

console.log(`\n=== ${routes.length - failed} of ${routes.length} screens render with a session ===`);
process.exit(failed ? 1 : 0);