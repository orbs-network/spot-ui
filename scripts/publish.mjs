#!/usr/bin/env node

import { execSync } from 'child_process'
import { createInterface } from 'readline'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
})

const question = (q) => new Promise((resolve) => rl.question(q, resolve))

const packages = [
  { name: '@orbs-network/spot-ui', path: 'packages/spot-ui' },
  { name: '@orbs-network/spot-react', path: 'packages/spot-react' },
]

function getPackageJson(pkgPath) {
  const fullPath = join(rootDir, pkgPath, 'package.json')
  return JSON.parse(readFileSync(fullPath, 'utf-8'))
}

function writePackageJson(pkgPath, data) {
  const fullPath = join(rootDir, pkgPath, 'package.json')
  writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n')
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number)
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      return version
  }
}

async function main() {
  console.log('\n🚀 Spot Packages Publisher\n')

  // Show current versions
  console.log('Current versions:')
  for (const pkg of packages) {
    const pkgJson = getPackageJson(pkg.path)
    console.log(`  ${pkg.name}: ${pkgJson.version}`)
  }
  console.log()

  // Ask for version bump type
  console.log('Select version bump type:')
  console.log('  1) patch  (bug fixes)')
  console.log('  2) minor  (new features)')
  console.log('  3) major  (breaking changes)')
  console.log('  4) custom (enter version manually)')
  console.log('  0) cancel')
  console.log()

  const choice = await question('Enter choice [1-4, 0 to cancel]: ')

  if (choice === '0') {
    console.log('\n❌ Cancelled\n')
    rl.close()
    process.exit(0)
  }

  let bumpType = null
  let customVersion = null

  switch (choice) {
    case '1':
      bumpType = 'patch'
      break
    case '2':
      bumpType = 'minor'
      break
    case '3':
      bumpType = 'major'
      break
    case '4':
      customVersion = await question('Enter custom version (e.g., 1.2.3): ')
      break
    default:
      console.log('\n❌ Invalid choice\n')
      rl.close()
      process.exit(1)
  }

  // Calculate new versions
  const updates = []
  for (const pkg of packages) {
    const pkgJson = getPackageJson(pkg.path)
    const currentVersion = pkgJson.version
    const newVersion = customVersion || bumpVersion(currentVersion, bumpType)
    updates.push({ ...pkg, currentVersion, newVersion, pkgJson })
  }

  // Show what will be updated
  console.log('\nVersion updates:')
  for (const update of updates) {
    console.log(`  ${update.name}: ${update.currentVersion} → ${update.newVersion}`)
  }
  console.log()

  const confirm = await question('Proceed with publish? [y/N]: ')
  if (confirm.toLowerCase() !== 'y') {
    console.log('\n❌ Cancelled\n')
    rl.close()
    process.exit(0)
  }

  // Update versions
  console.log('\n📝 Updating versions...')
  for (const update of updates) {
    update.pkgJson.version = update.newVersion
    writePackageJson(update.path, update.pkgJson)
    console.log(`  ✓ ${update.name}`)
  }

  // Build packages
  console.log('\n🔨 Building packages...')
  try {
    execSync('pnpm build', { cwd: rootDir, stdio: 'inherit' })
  } catch (error) {
    console.error('\n❌ Build failed\n')
    rl.close()
    process.exit(1)
  }

  // Ask for OTP once
  const otp = await question('\n🔐 Enter npm OTP code (or press Enter to skip): ')
  const otpFlag = otp.trim() ? `--otp ${otp.trim()}` : ''

  // Publish packages
  console.log('\n📦 Publishing packages...')
  for (const update of updates) {
    console.log(`\nPublishing ${update.name}...`)
    try {
      execSync(`pnpm publish --access public --no-git-checks ${otpFlag}`, {
        cwd: join(rootDir, update.path),
        stdio: 'inherit',
      })
      console.log(`  ✓ ${update.name}@${update.newVersion} published!`)
    } catch (error) {
      console.error(`  ❌ Failed to publish ${update.name}`)
    }
  }

  console.log('\n✅ Done!\n')
  rl.close()
}

main().catch((err) => {
  console.error(err)
  rl.close()
  process.exit(1)
})

