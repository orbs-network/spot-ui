#!/usr/bin/env node
/**
 * If package.json version files (spot-ui, spot-react, liquidity-hub-ui) have
 * uncommitted changes, stage and commit them. Used by pre-push hook.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir =
  process.env.GIT_ROOT ||
  execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();

const VERSION_FILES = [
  { path: 'packages/spot-ui/package.json', name: 'spot-ui' },
  { path: 'packages/spot-react/package.json', name: 'spot-react' },
  { path: 'packages/liquidity-hub-ui/package.json', name: 'liquidity-hub-sdk' },
];

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', ...opts });
}

function hasUncommittedChanges() {
  try {
    const paths = VERSION_FILES.map((f) => f.path).join(' ');
    const status = run('git status --porcelain -- ' + paths).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

function getVersionMessage() {
  const parts = VERSION_FILES.map(({ path, name }) => {
    const pkg = JSON.parse(readFileSync(join(rootDir, path), 'utf-8'));
    return `${name}@${pkg.version}`;
  });
  return parts.join(', ');
}

function main() {
  if (!hasUncommittedChanges()) {
    return 0;
  }
  console.log('[pre-push] Committing package version changes...');
  run('git add ' + VERSION_FILES.map((f) => f.path).join(' '));
  const versionMsg = getVersionMessage();
  const commitMsg = `chore: commit package versions [${versionMsg}]`;
  try {
    run(`git commit -m ${JSON.stringify(commitMsg)}`, {
      stdio: 'inherit',
    });
  } catch {
    process.exit(1);
  }
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error(err);
  process.exit(1);
}
