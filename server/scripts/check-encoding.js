/**
 * Fails the build when a tracked file starts with a UTF-8 BOM. A BOM is valid
 * in most editors but breaks JSON consumers: Prisma aborted with
 * 'Unexpected token "\u{feff}" is not valid JSON' while reading package.json,
 * which only showed up on the VPS because the edit happened on Windows.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');

let tracked;
try {
  tracked = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
} catch {
  console.log('  skip  not a git checkout, cannot list tracked files');
  process.exit(0);
}

const offenders = [];
for (const file of tracked) {
  const full = path.join(repoRoot, file);
  let fd;
  try {
    fd = fs.openSync(full, 'r');
    const head = Buffer.alloc(3);
    const read = fs.readSync(fd, head, 0, 3, 0);
    if (read === 3 && head.equals(Buffer.from([0xef, 0xbb, 0xbf]))) offenders.push(file);
  } catch {
    // File missing locally (sparse checkout, or removed on this branch).
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

console.log(`  checked ${tracked.length} tracked files for a UTF-8 BOM`);
if (offenders.length > 0) {
  console.error('  FAIL  BOM found in: ' + offenders.join(', '));
  console.error('  Rewrite the file without a BOM (PowerShell: use [System.IO.File]::WriteAllText,');
  console.error('  or [System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding $false)))');
  process.exit(1);
}