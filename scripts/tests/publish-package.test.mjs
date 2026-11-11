import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { publishPackage } from '../publish-package.mjs'

function releaseFixture(t, target, { failChecks = false, confirm = true } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), 'spot-publisher-test-'))
  t.after(() => rmSync(rootDir, { recursive: true, force: true }))
  for (const name of ['spot-ui', 'spot-react']) {
    const directory = join(rootDir, 'packages', name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({
      name: `@orbs-network/${name}`, version: '2.0.0',
    }, null, 2) + '\n')
  }
  const manifestPath = join(rootDir, 'packages', target, 'package.json')
  const originalManifest = readFileSync(manifestPath, 'utf8')
  const events = []
  const run = (command, args, options) => {
    if (command === 'pnpm' && args[0] === 'config') return 'undefined\n'
    if (command === 'npm' && args[0] === 'whoami') return JSON.stringify('test-user')
    if (command === 'pnpm' && args[0] === 'view') return JSON.stringify('2.0.0')
    if (command === 'pnpm' && args[0] === 'check:spot') {
      events.push('checks')
      assert.equal(options.cwd, rootDir)
      assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).version, '3.0.0')
      if (failChecks) throw new Error('Consumer typecheck failed')
      return ''
    }
    if (command === 'pnpm' && args[0] === 'publish') {
      events.push('publish')
      assert.equal(options.cwd, join(rootDir, 'packages', target))
      assert.ok(args.includes('--ignore-scripts'))
      return ''
    }
    throw new Error(`Unexpected release command: ${command} ${args.join(' ')}`)
  }
  const options = {
    rootDir, run, interactive: false, log: () => {},
    prompts: {
      selectVersion: async () => '3.0.0',
      confirmPublish: async () => confirm,
      promptOtp: async () => { events.push('otp'); return '' },
    },
  }
  return { options, manifestPath, originalManifest, events }
}

for (const target of ['spot-ui', 'spot-react']) {
  test(`${target} stops before upload and restores its version when release checks fail`, async t => {
    const fixture = releaseFixture(t, target, { failChecks: true })
    await assert.rejects(publishPackage(target, fixture.options), /restored the original package version.*Consumer typecheck failed/)
    assert.deepEqual(fixture.events, ['checks'])
    assert.equal(readFileSync(fixture.manifestPath, 'utf8'), fixture.originalManifest)
  })

  test(`${target} validates consumers with the release version before requesting an upload`, async t => {
    const fixture = releaseFixture(t, target)
    const result = await publishPackage(target, fixture.options)
    assert.deepEqual(fixture.events, ['checks', 'otp', 'publish'])
    assert.equal(result.version, '3.0.0')
    assert.equal(JSON.parse(readFileSync(fixture.manifestPath, 'utf8')).version, '3.0.0')
  })
}

test('a cancelled release leaves its manifest unchanged and never runs checks or uploads', async t => {
  const fixture = releaseFixture(t, 'spot-ui', { confirm: false })
  assert.equal(await publishPackage('spot-ui', fixture.options), undefined)
  assert.deepEqual(fixture.events, [])
  assert.equal(readFileSync(fixture.manifestPath, 'utf8'), fixture.originalManifest)
})
