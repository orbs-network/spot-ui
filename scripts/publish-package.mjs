import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as defaultPrompts from './publish-version.mjs'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const defaultRegistry = 'https://registry.npmjs.org/'

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

function resolveRegistry(manifest, packageDir, run) {
  const configuredValue = (value) => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text && text !== 'undefined' && text !== 'null' ? text : undefined
  }
  const readConfig = (key) => configuredValue(run('pnpm', ['config', 'get', key], {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  }))

  let registry
  try {
    const scope = manifest.name.startsWith('@') ? manifest.name.split('/')[0] : undefined
    registry = (scope ? readConfig(`${scope}:registry`) : undefined)
      ?? configuredValue(manifest.publishConfig?.registry)
      ?? readConfig('registry')
      ?? defaultRegistry
    if (!['https:', 'http:'].includes(new URL(registry).protocol)) {
      throw new Error('Unsupported registry protocol')
    }
  } catch (cause) {
    throw new Error('Could not resolve the npm publish registry. Check your npm/pnpm registry settings and retry.', { cause })
  }
  return registry
}

function isAuthenticationFailure(error) {
  const text = [error?.code, error?.stdout, error?.stderr, error?.message]
    .filter(value => typeof value === 'string' || Buffer.isBuffer(value))
    .map(value => value.toString())
    .join('\n')
  return /\b(?:ENEEDAUTH|EAUTH|E401|E403)\b|(?:access\s+)?token[^\n]*(?:expired|revoked)|not logged in|not authenticated/i.test(text)
}

function ensureNpmAuthentication(authDir, registry, run, interactive, log) {
  const whoami = () => {
    const username = JSON.parse(run('npm', ['whoami', '--registry', registry, '--json'], {
      cwd: authDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }))
    if (typeof username !== 'string' || !username.trim()) {
      throw new Error('npm did not return an authenticated username')
    }
  }

  log('Checking npm authentication...')
  try {
    whoami()
    return
  } catch (cause) {
    if (!isAuthenticationFailure(cause)) {
      throw new Error('Could not verify npm authentication. Check registry connectivity and try again.', { cause })
    }
    if (!interactive) {
      const loginRegistry = new URL(registry)
      loginRegistry.username = ''
      loginRegistry.password = ''
      throw new Error(`npm authentication is required. Run npm login --registry ${loginRegistry} --auth-type=web in an interactive terminal, or configure an npm publish token, then retry.`, { cause })
    }
  }

  log('npm login is required. Complete the browser login to continue.')
  try {
    run('npm', ['login', '--registry', registry, '--auth-type=web'], { cwd: authDir, stdio: 'inherit' })
  } catch (cause) {
    throw new Error('npm login did not complete. Complete npm login and retry the release.', { cause })
  }
  try {
    whoami()
  } catch (cause) {
    throw new Error('npm login completed, but authentication could not be verified. Check your registry credentials and retry.', { cause })
  }
}

function assertPublishedDependency(dependency, packageDir, registry, run) {
  const spec = `${dependency.name}@${dependency.version}`
  let publishedVersion
  try {
    publishedVersion = JSON.parse(run('pnpm', ['view', spec, 'version', '--json', '--registry', registry], {
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
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI,
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

  const registry = resolveRegistry(manifest, packageDir, run)
  // pnpm publish uses the package .npmrc when present, otherwise the workspace's.
  // Run npm in that same project so authentication sees the same credentials.
  const authDir = existsSync(join(packageDir, '.npmrc')) ? packageDir : rootDir
  ensureNpmAuthentication(authDir, registry, run, interactive, log)

  // pnpm replaces workspace:* with the exact local version when publishing.
  // A successful local build does not establish that consumers can install it.
  for (const directory of target.dependencies ?? []) {
    const dependency = JSON.parse(readFileSync(join(rootDir, directory, 'package.json'), 'utf8'))
    log(`Checking published dependency ${dependency.name}@${dependency.version}...`)
    assertPublishedDependency(dependency, packageDir, registry, run)
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
  const args = ['publish', '--access', 'public', '--no-git-checks', '--ignore-scripts', '--registry', registry]
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
