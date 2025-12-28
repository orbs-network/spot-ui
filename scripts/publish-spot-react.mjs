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

const pkg = { name: '@orbs-network/spot-react', path: 'packages/spot-react' }

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
  console.log(`\n🚀 ${pkg.name} Publisher\n`)

  const pkgJson = getPackageJson(pkg.path)
  console.log(`Current version: ${pkgJson.version}\n`)

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

  let newVersion = null

  switch (choice) {
    case '1':
      newVersion = bumpVersion(pkgJson.version, 'patch')
      break
    case '2':
      newVersion = bumpVersion(pkgJson.version, 'minor')
      break
    case '3':
      newVersion = bumpVersion(pkgJson.version, 'major')
      break
    case '4':
      newVersion = await question('Enter custom version (e.g., 1.2.3): ')
      break
    default:
      console.log('\n❌ Invalid choice\n')
      rl.close()
      process.exit(1)
  }

  console.log(`\n${pkg.name}: ${pkgJson.version} → ${newVersion}\n`)

  const confirm = await question('Proceed with publish? [y/N]: ')
  if (confirm.toLowerCase() !== 'y') {
    console.log('\n❌ Cancelled\n')
    rl.close()
    process.exit(0)
  }

  // Update version
  console.log('\n📝 Updating version...')
  pkgJson.version = newVersion
  writePackageJson(pkg.path, pkgJson)
  console.log(`  ✓ ${pkg.name}`)

  // Build packages (spot-react depends on spot-ui)
  // NODE_ENV=production ensures spot-react uses node_modules instead of local source
  console.log('\n🔨 Building packages...')
  try {
    execSync('pnpm build:spot-ui && NODE_ENV=production pnpm build:spot-react', { cwd: rootDir, stdio: 'inherit' })
  } catch (error) {
    console.error('\n❌ Build failed\n')
    rl.close()
    process.exit(1)
  }

  // Ask for OTP
  const otp = await question('\n🔐 Enter npm OTP code (or press Enter to skip): ')
  const otpFlag = otp.trim() ? `--otp ${otp.trim()}` : ''

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
  }

  rl.close()
}

main().catch((err) => {
  console.error(err)
  rl.close()
  process.exit(1)
})

