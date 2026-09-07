#!/usr/bin/env node

import { execFileSync, execSync } from 'child_process'
import { createHash } from 'crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { selectVersion, confirmPublish, promptOtp } from './publish-version.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const pkg = { name: '@orbs-network/spot-react', path: 'packages/spot-react' }
const spotUiPkg = { name: '@orbs-network/spot-ui', path: 'packages/spot-ui' }

function getPackageJson(pkgPath) {
  const fullPath = join(rootDir, pkgPath, 'package.json')
  return JSON.parse(readFileSync(fullPath, 'utf-8'))
}

function writePackageJson(pkgPath, data) {
  const fullPath = join(rootDir, pkgPath, 'package.json')
  writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n')
}

function assertPublishedSpotUiMatchesLocalBuild() {
  const spotUiPackageJson = getPackageJson(spotUiPkg.path)
  const packageVersion = `${spotUiPkg.name}@${spotUiPackageJson.version}`
  let packDirectory
  let failureReason

  try {
    const publishedVersion = execFileSync(
      'npm',
      ['view', packageVersion, 'version'],
      {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      },
    ).trim()
    if (publishedVersion !== spotUiPackageJson.version) {
      throw new Error(`npm returned version ${publishedVersion || 'unknown'}`)
    }

    // Compare the same tarball format that `pnpm publish` uploads. `npm diff`
    // compares the development package.json against pnpm's normalized manifest
    // and reports a false mismatch because pnpm omits `prepublishOnly`.
    packDirectory = mkdtempSync(join(tmpdir(), 'spot-ui-publish-check-'))
    const packOutput = execFileSync(
      'pnpm',
      ['pack', '--json', '--pack-destination', packDirectory],
      {
        cwd: join(rootDir, spotUiPkg.path),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      },
    )
    const packedPackage = JSON.parse(packOutput)
    const localShasum = createHash('sha1')
      .update(readFileSync(packedPackage.filename))
      .digest('hex')
    const publishedShasum = execFileSync(
      'npm',
      ['view', packageVersion, 'dist.shasum'],
      {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      },
    ).trim()

    if (!publishedShasum || localShasum !== publishedShasum) {
      throw new Error(
        `${packageVersion} exists, but its published contents differ from the local build`,
      )
    }
  } catch (error) {
    failureReason = error instanceof Error ? error.message : String(error)
  } finally {
    if (packDirectory) {
      rmSync(packDirectory, { recursive: true, force: true })
    }
  }

  if (failureReason) {
    console.error(
      `\n❌ spot-react cannot be published until the exact local ${packageVersion} build is published (${failureReason}).\n`,
    )
    process.exit(1)
  }
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

  const ok = await confirmPublish(pkg.name, pkgJson.version, newVersion)
  if (!ok) {
    console.log('\n❌ Cancelled\n')
    process.exit(0)
  }

  // Build first with the current version so a build failure never leaves the
  // working tree with a bumped-but-unpublished version.
  // (spot-react depends on spot-ui)
  console.log('\n🔨 Building packages...')
  try {
    execSync('pnpm build:spot-ui && pnpm build:spot-react', { cwd: rootDir, stdio: 'inherit' })
  } catch (error) {
    console.error('\n❌ Build failed\n')
    process.exit(1)
  }

  // A workspace dependency is rewritten to the local spot-ui version during
  // publish. Verify that npm has that exact build, not merely the same version
  // string, before a spot-react release can reference it.
  assertPublishedSpotUiMatchesLocalBuild()

  // Update version only after a successful build.
  console.log('\n📝 Updating version...')
  const originalPkgJson = getPackageJson(pkg.path)
  pkgJson.version = newVersion
  writePackageJson(pkg.path, pkgJson)
  console.log(`  ✓ ${pkg.name}`)

  const otp = await promptOtp()
  const otpFlag = otp ? `--otp ${otp}` : ''

  // Publish package
  console.log('\n📦 Publishing package...')
  try {
    execSync(`pnpm publish --access public --no-git-checks ${otpFlag}`, {
      cwd: join(rootDir, pkg.path),
      stdio: 'inherit',
    })
    console.log(`\n✅ ${pkg.name}@${newVersion} published!\n`)
  } catch (error) {
    console.error(`\n❌ Failed to publish ${pkg.name}, reverting version\n`)
    writePackageJson(pkg.path, originalPkgJson)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
