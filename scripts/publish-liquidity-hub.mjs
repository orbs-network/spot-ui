#!/usr/bin/env node

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { selectVersion, confirmPublish, promptOtp } from './publish-version.mjs'
import { verifyPublishedVersion, assertVersionUnpublished, AlreadyPublishedError } from './verify-published-version.mjs'
import { runPublish, StagedPublishError } from './run-publish.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const pkg = { name: '@orbs-network/liquidity-hub-sdk', path: 'packages/liquidity-hub-ui' }

function getPackageJson(pkgPath) {
  const fullPath = join(rootDir, pkgPath, 'package.json')
  return JSON.parse(readFileSync(fullPath, 'utf-8'))
}

function writePackageJson(pkgPath, data) {
  const fullPath = join(rootDir, pkgPath, 'package.json')
  writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n')
}

async function main() {
  console.log(`\n🚀 ${pkg.name} Publisher\n`)

  const pkgJson = getPackageJson(pkg.path)
  console.log(`Current version: ${pkgJson.version}\n`)

  const newVersion = await selectVersion(pkgJson.version)
  if (newVersion === null) {
    console.log('\n❌ Cancelled\n')
    process.exit(0)
  }

  assertVersionUnpublished(pkg.name, newVersion, join(rootDir, pkg.path))

  const ok = await confirmPublish(pkg.name, pkgJson.version, newVersion)
  if (!ok) {
    console.log('\n❌ Cancelled\n')
    process.exit(0)
  }

  // Build first with the current version so a build failure never leaves the
  // working tree with a bumped-but-unpublished version.
  console.log('\n🔨 Building package...')
  try {
    execSync('pnpm build:liquidity-hub', { cwd: rootDir, stdio: 'inherit' })
  } catch (error) {
    console.error('\n❌ Build failed\n')
    process.exit(1)
  }

  // Update version only after a successful build.
  console.log('\n📝 Updating version...')
  const originalPkgJson = getPackageJson(pkg.path)
  pkgJson.version = newVersion
  writePackageJson(pkg.path, pkgJson)
  console.log(`  ✓ ${pkg.name}`)

  const otp = await promptOtp()

  // Publish package
  console.log('\n📦 Publishing package...')
  try {
    await runPublish(pkg.name, newVersion, join(rootDir, pkg.path), otp)
  } catch (error) {
    if (error instanceof StagedPublishError || error instanceof AlreadyPublishedError) throw error
    console.error(`\n❌ Failed to publish ${pkg.name}, reverting version\n`)
    writePackageJson(pkg.path, originalPkgJson)
    process.exit(1)
  }

  // Verification failures must not roll back a version that may already be
  // published: npm publication cannot be undone by editing package.json.
  console.log('\n🔎 Verifying published version...')
  await verifyPublishedVersion(pkg.name, newVersion, join(rootDir, pkg.path))
  console.log(`\n✅ ${pkg.name}@${newVersion} published!\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

