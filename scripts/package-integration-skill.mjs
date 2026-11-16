#!/usr/bin/env node

import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skills = {
  'spot-ui': [
    'spot-swap-integration',
    'spot-advanced-orders-integration',
    'liquidity-hub-to-spot-swap-migration',
  ],
  'spot-react': ['spot-advanced-orders-react-integration'],
};
const packageDirectory = process.argv[2];
const skillNames = skills[packageDirectory];
if (!skillNames) {
  throw new Error('Specify spot-ui or spot-react to package its integration skills.');
}

const repository = fileURLToPath(new URL('../', import.meta.url));
const packagePath = resolve(repository, 'packages', packageDirectory);
const destination = resolve(packagePath, 'dist', 'integration-skills');
const packageJson = JSON.parse(await readFile(resolve(packagePath, 'package.json'), 'utf8'));
// Validate every skill and resource before replacing the previously built collection.
const guides = await Promise.all(skillNames.map(async (skillName) => {
  const source = resolve(repository, 'skills', skillName);
  const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
  if (manifest.name !== skillName || manifest.package !== packageJson.name) {
    throw new Error(`${skillName} must describe itself and ${packageJson.name}.`);
  }
  await Promise.all([manifest.entrypoint, ...manifest.references, ...manifest.assets]
    .map((resource) => access(resolve(source, resource))));
  return { skillName, source, manifest };
}));

await mkdir(resolve(packagePath, 'dist'), { recursive: true });
await rm(destination, { recursive: true, force: true });
for (const { skillName, source, manifest } of guides) {
  const skillDestination = resolve(destination, skillName);
  await cp(source, skillDestination, { recursive: true });
  await writeFile(
    resolve(skillDestination, 'manifest.json'),
    JSON.stringify({ ...manifest, sdkVersion: packageJson.version }, null, 2) + '\n',
  );
  console.log(`Bundled ${skillName} for ${packageJson.name}@${packageJson.version}`);
}
await rm(resolve(packagePath, 'dist', 'integration-skill'), { recursive: true, force: true });
