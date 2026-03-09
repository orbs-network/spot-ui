#!/usr/bin/env node
/**
 * If any of the package version files (spot-ui, spot-react, liquidity-hub-ui)
 * have changes, stage them so they are included in the current commit.
 * Used by pre-commit hook.
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
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

if (hasUncommittedChanges()) {
  run('git add ' + VERSION_FILES.join(' '));
}
