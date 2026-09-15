import { spawn } from 'node:child_process'
import { AlreadyPublishedError } from './verify-published-version.mjs'

export class StagedPublishError extends Error {
  constructor(name, version) {
    super(
      `${name}@${version} is already staged on npm and awaits approval. ` +
      'Keeping the local version. Review this release in the Staged Packages tab on npmjs.com and approve it with 2FA. ' +
      'With npm >= 11.15.0, you can also use npm stage list and npm stage approve <stage-id>.',
    )
  }
}

// Forward prompts and notices live, while retaining the registry error so a
// staged upload cannot be mistaken for a failure that should undo the bump.
export function runPublish(
  name,
  version,
  cwd,
  otp,
  { start = spawn, stdout = process.stdout, stderr = process.stderr } = {},
) {
  return new Promise((resolve, reject) => {
    const args = ['publish', '--access', 'public', '--no-git-checks']
    if (otp) args.push('--otp', otp)
    const child = start('pnpm', args, { cwd, stdio: ['inherit', 'pipe', 'pipe'] })
    let output = ''
    for (const [source, destination] of [[child.stdout, stdout], [child.stderr, stderr]]) {
      source.on('data', (chunk) => {
        output = (output + chunk.toString()).slice(-64_000)
        destination.write(chunk)
      })
    }
    child.on('error', reject)
    child.on('close', (code) => {
      if (/Cannot publish over previously staged version/i.test(output)) {
        reject(new StagedPublishError(name, version))
      } else if (/cannot publish over the previously published versions/i.test(output)) {
        reject(new AlreadyPublishedError(name, version))
      } else if (code === 0) {
        resolve()
      } else {
        reject(new Error(`pnpm publish exited with code ${code}`))
      }
    })
  })
}
