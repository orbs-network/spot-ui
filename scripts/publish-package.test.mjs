import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { publishPackage } from './publish-package.mjs'

const packages = [
  { target: 'spot-ui', directory: 'spot-ui', name: '@orbs-network/spot-ui', build: 'build:spot-ui' },
  { target: 'spot-react', directory: 'spot-react', name: '@orbs-network/spot-react', build: 'build:spot-react' },
  { target: 'liquidity-hub', directory: 'liquidity-hub-ui', name: '@orbs-network/liquidity-hub-sdk', build: 'build:liquidity-hub' },
]

function setup(t, pkg, overrides = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), 'spot-publish-test-'))
  t.after(() => rmSync(rootDir, { recursive: true, force: true }))
  for (const item of packages) {
    const directory = join(rootDir, 'packages', item.directory)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({
      name: item.name,
      version: '1.0.0',
      dependencies: item.target === 'spot-react' ? { '@orbs-network/spot-ui': 'workspace:*' } : {},
    }, null, 4) + '\n')
  }
  const manifestPath = join(rootDir, 'packages', pkg.directory, 'package.json')
  const originalManifest = readFileSync(manifestPath, 'utf8')
  const calls = []
  const prompts = {
    selectVersion: async () => '1.0.1',
    confirmPublish: async () => true,
    promptOtp: async () => '123456',
    ...overrides.prompts,
  }
  return {
    calls,
    rootDir,
    originalManifest,
    readManifest: () => readFileSync(manifestPath, 'utf8'),
    publish: () => publishPackage(pkg.target, {
      rootDir,
      prompts,
      log: () => {},
      run: (command, args, options) => {
        assert.equal(command, 'pnpm')
        calls.push({ args, options, version: JSON.parse(readFileSync(manifestPath, 'utf8')).version })
        if (overrides.run) return overrides.run(args, options)
        if (args[0] === 'view') return JSON.stringify('1.0.0')
      },
    }),
  }
}

for (const pkg of packages) {
  test(`${pkg.target}: cancellation before preparation leaves the manifest untouched`, async (t) => {
    for (const prompts of [
      { selectVersion: async () => null },
      { confirmPublish: async () => false },
    ]) {
      const release = setup(t, pkg, { prompts })
      await release.publish()
      assert.equal(release.readManifest(), release.originalManifest)
      assert.deepEqual(release.calls, [])
    }
  })

  test(`${pkg.target}: cancelling OTP restores the original manifest without uploading`, async (t) => {
    const release = setup(t, pkg, {
      prompts: { promptOtp: async () => { throw new Error('User cancelled OTP prompt') } },
    })
    await assert.rejects(release.publish(), /restored the original package version.*User cancelled OTP prompt/)
    assert.equal(release.readManifest(), release.originalManifest)
    assert.equal(release.calls.some(({ args }) => args[0] === 'publish'), false)
    assert.equal(release.calls.some(({ args }) => args[0] === pkg.build), true)
  })

  for (const stage of ['test', 'build']) {
    test(`${pkg.target}: a ${stage} failure prevents publishing and restores the manifest`, async (t) => {
      let promptedForOtp = false
      const release = setup(t, pkg, {
        prompts: { promptOtp: async () => { promptedForOtp = true; return '' } },
        run: (args) => {
          if (args[0] === 'view') return JSON.stringify('1.0.0')
          const isTargetTest = args[1] === pkg.name && args[2] === 'test'
          const isTargetBuild = args[0] === pkg.build
          if ((stage === 'test' && isTargetTest) || (stage === 'build' && isTargetBuild)) {
            throw new Error(`${stage} failed`)
          }
        },
      })
      await assert.rejects(release.publish(), /restored the original package version/)
      assert.equal(release.readManifest(), release.originalManifest)
      assert.equal(promptedForOtp, false)
      assert.equal(release.calls.some(({ args }) => args[0] === 'publish'), false)
    })
  }

  test(`${pkg.target}: successful releases test and build with the new version before uploading`, async (t) => {
    const release = setup(t, pkg)
    await release.publish()
    const publishCall = release.calls.at(-1)
    assert.deepEqual(publishCall.args, [
      'publish', '--access', 'public', '--no-git-checks', '--ignore-scripts', '--otp', '123456',
    ])
    assert.equal(publishCall.options.cwd, join(release.rootDir, 'packages', pkg.directory))
    const checks = release.calls.filter(({ args }) => args[0] !== 'view' && args[0] !== 'publish')
    assert.ok(checks.some(({ args }) => args[1] === pkg.name && args[2] === 'test'))
    assert.ok(checks.some(({ args }) => args[0] === pkg.build))
    assert.ok(checks.every(({ version, options }) => version === '1.0.1' && options.cwd === release.rootDir))
    assert.equal(JSON.parse(release.readManifest()).version, '1.0.1')
  })

  test(`${pkg.target}: an ambiguous publish failure keeps the release version`, async (t) => {
    const release = setup(t, pkg, {
      run: (args) => {
        if (args[0] === 'view') return JSON.stringify('1.0.0')
        if (args[0] === 'publish') throw new Error('Connection lost after upload')
      },
    })
    await assert.rejects(release.publish(), /Local version remains 1\.0\.1/)
    assert.equal(JSON.parse(release.readManifest()).version, '1.0.1')
  })
}

const reactPackage = packages.find(({ target }) => target === 'spot-react')

test('spot-react: checks the exact SDK version before changing its manifest', async (t) => {
  const release = setup(t, reactPackage)
  await release.publish()
  assert.deepEqual(release.calls[0].args, [
    'view', '@orbs-network/spot-ui@1.0.0', 'version', '--json',
  ])
  assert.equal(release.calls[0].version, '1.0.0')
  assert.equal(release.calls[0].options.cwd, join(release.rootDir, 'packages/spot-react'))
  const sdkTest = release.calls.findIndex(({ args }) => args[1] === '@orbs-network/spot-ui' && args[2] === 'test')
  const sdkBuild = release.calls.findIndex(({ args }) => args[0] === 'build:spot-ui')
  const reactTest = release.calls.findIndex(({ args }) => args[1] === '@orbs-network/spot-react' && args[2] === 'test')
  assert.ok(sdkTest > 0 && sdkBuild > sdkTest && reactTest > sdkBuild)
})

for (const [scenario, lookup] of [
  ['missing SDK version', () => { throw new Error('E404') }],
  ['registry connection failure', () => { throw new Error('ETIMEDOUT') }],
  ['wrong SDK version', () => JSON.stringify('0.9.0')],
  ['invalid registry response', () => 'not json'],
]) {
  test(`spot-react: a ${scenario} stops before changing the manifest or publishing`, async (t) => {
    const release = setup(t, reactPackage, { run: lookup })
    await assert.rejects(release.publish(), /@orbs-network\/spot-ui@1\.0\.0/)
    assert.equal(release.readManifest(), release.originalManifest)
    assert.equal(release.calls.length, 1)
  })
}

test('spot-react: failing SDK tests blocks the dependent release', async (t) => {
  const release = setup(t, reactPackage, {
    run: (args) => {
      if (args[0] === 'view') return JSON.stringify('1.0.0')
      if (args[1] === '@orbs-network/spot-ui' && args[2] === 'test') throw new Error('SDK tests failed')
    },
  })
  await assert.rejects(release.publish(), /SDK tests failed/)
  assert.equal(release.readManifest(), release.originalManifest)
  assert.equal(release.calls.some(({ args }) => args[0] === 'publish'), false)
})

test('an empty OTP omits the publish OTP flag', async (t) => {
  const release = setup(t, packages[0], { prompts: { promptOtp: async () => '' } })
  await release.publish()
  assert.equal(release.calls.at(-1).args.includes('--otp'), false)
})
