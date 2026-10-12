import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as defaultPrompts from './publish-version.mjs'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const targets = {
  'spot-ui': {
    directory: 'packages/spot-ui',
    checks: [
      ['--filter', '@orbs-network/spot-ui', 'test'],
      ['build:spot-ui'],
    ],
  },
  'spot-react': {
    directory: 'packages/spot-react',
    dependencies: ['packages/spot-ui'],
    checks: [
      ['--filter', '@orbs-network/spot-ui', 'test'],
      ['build:spot-ui'],
      ['--filter', '@orbs-network/spot-react', 'test'],
      ['build:spot-react'],
    ],
  },
  'liquidity-hub': {
    directory: 'packages/liquidity-hub-ui',
    checks: [
      ['--filter', '@orbs-network/liquidity-hub-sdk', 'test'],
      ['build:liquidity-hub'],
    ],
  },
}

function assertPublishedDependency(dependency, packageDir, run) {
  const spec = `${dependency.name}@${dependency.version}`
  let publishedVersion
  try {
    publishedVersion = JSON.parse(run('pnpm', ['view', spec, 'version', '--json'], {
      cwd: packageDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }))
  } catch (cause) {
    throw new Error(
      `Could not verify ${spec} in the registry. Publish that dependency version first, or resolve registry access, then retry.`,
      { cause },
    )
  }
  if (publishedVersion !== dependency.version) {
    throw new Error(`The registry did not confirm ${spec}. Publish that dependency version before continuing.`)
  }
}

/** The injectable command runner and prompts let tests exercise releases without uploading. */
export async function publishPackage(targetName, {
  rootDir = repositoryRoot,
  run = execFileSync,
  prompts = defaultPrompts,
  log = console.log,
} = {}) {
  const target = targets[targetName]
  if (!target) throw new Error(`Unknown publish target: ${targetName}`)
  const packageDir = join(rootDir, target.directory)
  const manifestPath = join(packageDir, 'package.json')
  const originalManifest = readFileSync(manifestPath, 'utf8')
  const manifest = JSON.parse(originalManifest)
  log(`\n${manifest.name} Publisher\nCurrent version: ${manifest.version}\n`)

  const version = await prompts.selectVersion(manifest.version)
  if (version === null || !await prompts.confirmPublish(manifest.name, manifest.version, version)) {
    log('Cancelled')
    return
  }

  // pnpm replaces workspace:* with the exact local version when publishing.
  // A successful local build does not establish that consumers can install it.
  for (const directory of target.dependencies ?? []) {
    const dependency = JSON.parse(readFileSync(join(rootDir, directory, 'package.json'), 'utf8'))
    log(`Checking published dependency ${dependency.name}@${dependency.version}...`)
    assertPublishedDependency(dependency, packageDir, run)
  }

  let otp
  try {
    // Build with the release version so it is also correct inside the bundle.
    manifest.version = version
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    log('\nTesting and building...')
    for (const args of target.checks) {
      run('pnpm', args, { cwd: rootDir, stdio: 'inherit' })
    }
    otp = await prompts.promptOtp()
  } catch (cause) {
    // No upload has started: tests, builds, and prompt cancellation are safe to roll back.
    writeFileSync(manifestPath, originalManifest)
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`Release preparation stopped; restored the original package version. ${reason}`, { cause })
  }

  // Builds and tests have already run; skip duplicate lifecycle scripts.
  const args = ['publish', '--access', 'public', '--no-git-checks', '--ignore-scripts']
  if (otp) args.push('--otp', otp)
  log(`\nPublishing ${manifest.name}@${version}...`)
  try {
    run('pnpm', args, { cwd: packageDir, stdio: 'inherit' })
  } catch (cause) {
    // The registry may have accepted the upload before the command failed.
    throw new Error(`Publish command failed. Local version remains ${version}; see npm output above.`, { cause })
  }
  log('\nPublish command completed. See npm output above for release status.\n')
}

export async function runPublisher(targetName) {
  try {
    await publishPackage(targetName)
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
