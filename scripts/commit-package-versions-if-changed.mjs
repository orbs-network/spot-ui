#!/usr/bin/env node
/**
 * If package.json version files (spot-ui, spot-react, liquidity-hub-ui) have
 * uncommitted changes, stage and commit them. Used by pre-push hook.
 */

import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir =
  process.env.GIT_ROOT ||
  execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();

const VERSION_FILES = [
  'packages/spot-ui/package.json',
  'packages/spot-react/package.json',
  'packages/liquidity-hub-ui/package.json',
];

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', ...opts });
}

function hasUncommittedChanges() {
  try {
    const status = run('git status --porcelain -- ' + VERSION_FILES.join(' ')).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

function main() {
  if (!hasUncommittedChanges()) {
    return 0;
  }
  console.log('[pre-push] Committing package version changes...');
  run('git add ' + VERSION_FILES.join(' '));
  try {
    run('git commit -m "chore: commit package versions [spot-ui, spot-react, liquidity-hub-sdk]"', {
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
