#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { selectVersion, confirmPublish, promptOtp } from './publish-version.mjs'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = join(rootDir, 'packages/spot-react')
const manifestPath = join(packageDir, 'package.json')

async function main() {
  const originalManifest = readFileSync(manifestPath, 'utf8')
  const manifest = JSON.parse(originalManifest)
  console.log(`\n🚀 ${manifest.name} Publisher\nCurrent version: ${manifest.version}\n`)

  const version = await selectVersion(manifest.version)
  if (version === null || !await confirmPublish(manifest.name, manifest.version, version)) {
    console.log('Cancelled')
    return
  }

  // Build with the release version so it is also correct inside the bundle.
  manifest.version = version
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log('\n🔨 Building...')
  try {
    execFileSync('pnpm', ['build:spot-ui'], { cwd: rootDir, stdio: 'inherit' })
    execFileSync('pnpm', ['build:spot-react'], { cwd: rootDir, stdio: 'inherit' })
  } catch {
    writeFileSync(manifestPath, originalManifest)
    throw new Error('Build failed; restored the original package version.')
  }

  const otp = await promptOtp()
  // The build has already run; skip the duplicate prepublishOnly build.
  const args = ['publish', '--access', 'public', '--no-git-checks', '--ignore-scripts']
  if (otp) args.push('--otp', otp)

  console.log(`\n📦 Publishing ${manifest.name}@${version}...`)
  try {
    execFileSync('pnpm', args, { cwd: packageDir, stdio: 'inherit' })
  } catch {
    // An upload may already be accepted even if the command fails afterward.
    throw new Error(`Publish command failed. Local version remains ${version}; see npm output above.`)
  }
  console.log('\nPublish command completed. See npm output above for release status.\n')
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
