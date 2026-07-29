#!/usr/bin/env node
/**
 * Shared version bump + interactive select for publish scripts.
 * Usage: import { selectVersion, bumpVersion } from './publish-version.mjs'
 */

import { select, input, confirm } from '@inquirer/prompts';

export async function confirmPublish(pkgName, currentVersion, newVersion) {
  return confirm({
    message: `Publish ${pkgName} ${currentVersion} → ${newVersion}?`,
    default: false,
  });
}

/** Prompt for npm OTP (optional). Use inquirer so stdin stays consistent after select/confirm. */
export async function promptOtp() {
  const value = await input({
    message: 'Enter npm OTP code (or press Enter to skip)',
    default: '',
    validate: (v) =>
      v.trim() === '' || /^\d{6,}$/.test(v.trim()) || 'OTP must be digits only',
  });
  return value.trim();
}

export function bumpVersion(version, type) {
  // Parse only the core "major.minor.patch", ignoring any prerelease/build
  // metadata (e.g. "1.2.3-beta.0") so Number() never yields NaN.
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Invalid semver version: "${version}"`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
}

/**
 * Interactive version select (arrow keys). Returns new version string or null if cancelled.
 */
export async function selectVersion(currentVersion) {
  const patch = bumpVersion(currentVersion, 'patch');
  const minor = bumpVersion(currentVersion, 'minor');
  const major = bumpVersion(currentVersion, 'major');

  const choice = await select({
    message: 'Version bump',
    default: 'patch',
    choices: [
      {
        name: `patch  → ${patch}  (bug fixes)`,
        value: 'patch',
        description: `${currentVersion} → ${patch}`,
      },
      {
        name: `minor  → ${minor}  (new features)`,
        value: 'minor',
        description: `${currentVersion} → ${minor}`,
      },
      {
        name: `major  → ${major}  (breaking changes)`,
        value: 'major',
        description: `${currentVersion} → ${major}`,
      },
      {
        name: 'custom (enter version manually)',
        value: 'custom',
      },
      {
        name: 'Cancel',
        value: 'cancel',
      },
    ],
  });

  if (choice === 'cancel') return null;
  if (choice === 'custom') {
    const custom = await input({
      message: 'Enter version (e.g. 1.2.3)',
      default: currentVersion,
      validate: (v) => /^\d+\.\d+\.\d+$/.test(v.trim()) || 'Use semver: major.minor.patch',
    });
    return custom.trim();
  }
  return bumpVersion(currentVersion, choice);
}
