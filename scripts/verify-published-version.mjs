import { execFileSync } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'

export class AlreadyPublishedError extends Error {
  constructor(name, version) {
    super(`${name}@${version} is already published on npm. Choose a new version for another release.`)
  }
}

export function assertVersionUnpublished(name, version, cwd, { run = execFileSync } = {}) {
  let output
  try {
    output = run('npm', [
      'view', `${name}@${version}`, 'version', '--json', '--prefer-online',
      '--fetch-retries=0', '--fetch-timeout=10000',
    ], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    })
  } catch (error) {
    let registryError
    try { registryError = JSON.parse(error.stdout?.toString() || '{}') } catch {}
    if (registryError?.error?.code === 'E404') return
    throw new Error('Could not check whether the release already exists. Publication stopped.', { cause: error })
  }
  if (JSON.parse(output) === version) throw new AlreadyPublishedError(name, version)
  throw new Error(`Unexpected registry response for ${name}@${version}. Publication stopped.`)
}

// Registry reads may lag a successful upload. Check the exact release, never
// `latest`, and revalidate cached metadata before announcing success.
export async function verifyPublishedVersion(
  name,
  version,
  cwd,
  { run = execFileSync, wait = setTimeout } = {},
) {
  const release = `${name}@${version}`
  let lastError

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const output = run('npm', [
        'view', release, 'version', '--json', '--prefer-online',
        '--fetch-retries=0', '--fetch-timeout=10000',
      ], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
      })
      const publishedVersion = JSON.parse(output)
      if (publishedVersion !== version) {
        throw new Error(`Registry returned ${JSON.stringify(publishedVersion)} instead of ${version}`)
      }
      return
    } catch (error) {
      lastError = error
      if (attempt < 3) await wait(2000)
    }
  }

  throw new Error(
    `Could not verify ${release} on npm. The publish command completed, but the release is unconfirmed. ` +
    'Keeping the local version; check the registry and the Staged Packages tab on npmjs.com before retrying publication.',
    { cause: lastError },
  )
}
