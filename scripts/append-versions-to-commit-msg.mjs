#!/usr/bin/env node
/**
 * If the commit has the package version files staged, append their versions
 * to the commit message. Called from prepare-commit-msg hook.
 * Usage: node append-versions-to-commit-msg.mjs <path-to-commit-msg-file>
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
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

const msgPath = process.argv[2];
if (!msgPath) process.exit(0);

const staged = run('git diff --cached --name-only').trim().split('\n').filter(Boolean);
const versionPaths = new Set(VERSION_FILES.map((f) => f.path));
const hasVersionFilesStaged = staged.some((f) => versionPaths.has(f));
if (!hasVersionFilesStaged) process.exit(0);

const parts = VERSION_FILES.map(({ path, name }) => {
  const pkg = JSON.parse(readFileSync(join(rootDir, path), 'utf-8'));
  return `${name}@${pkg.version}`;
});
const suffix = ` [${parts.join(', ')}]`;

const content = readFileSync(msgPath, 'utf-8');
const lines = content.split('\n');
const firstLine = lines[0];
if (firstLine.includes(']') && /\[.*@[\d.]+\]/.test(firstLine)) process.exit(0); // already has versions
lines[0] = firstLine.trimEnd() + suffix;
writeFileSync(msgPath, lines.join('\n'));
