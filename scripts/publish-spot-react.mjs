#!/usr/bin/env node

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { selectVersion, confirmPublish, promptOtp } from './publish-version.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const pkg = { name: '@orbs-network/spot-react', path: 'packages/spot-react' }

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

  const ok = await confirmPublish(pkg.name, pkgJson.version, newVersion)
  if (!ok) {
    console.log('\n❌ Cancelled\n')
    process.exit(0)
  }

  // Update version
  console.log('\n📝 Updating version...')
  pkgJson.version = newVersion
  writePackageJson(pkg.path, pkgJson)
  console.log(`  ✓ ${pkg.name}`)

  // Build packages (spot-react depends on spot-ui)
  console.log('\n🔨 Building packages...')
  try {
    execSync('pnpm build:spot-ui && pnpm build:spot-react', { cwd: rootDir, stdio: 'inherit' })
  } catch (error) {
    console.error('\n❌ Build failed\n')
    process.exit(1)
  }

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
    console.error(`\n❌ Failed to publish ${pkg.name}\n`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

