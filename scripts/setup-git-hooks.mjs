#!/usr/bin/env node
/**
 * Set git hooks path to .githooks so pre-push etc. run from the repo.
 * Run on prepare (pnpm install). No-op if not in a git repo.
 */

import { accessSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

try {
  accessSync(join(rootDir, '.git'));
  execSync('git config core.hooksPath .githooks', { cwd: rootDir, stdio: 'inherit' });
} catch {
  // not a git repo or git not available
}
