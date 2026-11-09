#!/usr/bin/env node

import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skills = {
  'spot-ui': 'spot-integration',
  'spot-react': 'spot-react-integration',
};
const packageDirectory = process.argv[2];
const skillName = skills[packageDirectory];
if (!skillName) {
  throw new Error('Specify spot-ui or spot-react to package its integration guide.');
}

const repository = fileURLToPath(new URL('../', import.meta.url));
const packagePath = resolve(repository, 'packages', packageDirectory);
const source = resolve(repository, 'skills', skillName);
const destination = resolve(packagePath, 'dist', 'integration-skill');
const packageJson = JSON.parse(await readFile(resolve(packagePath, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));

if (manifest.package !== packageJson.name) {
  throw new Error(`${skillName} describes ${manifest.package}, not ${packageJson.name}.`);
}
// Validate every declared resource before replacing the previously built guide.
for (const resource of [manifest.entrypoint, ...manifest.references, ...manifest.assets]) {
  await access(resolve(source, resource));
}

await mkdir(resolve(packagePath, 'dist'), { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
await writeFile(
  resolve(destination, 'manifest.json'),
  JSON.stringify({ ...manifest, sdkVersion: packageJson.version }, null, 2) + '\n',
);
console.log(`Bundled ${skillName} for ${packageJson.name}@${packageJson.version}`);
