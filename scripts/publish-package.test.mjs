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

const defaultRegistry = 'https://registry.npmjs.org/'

function npmFailure(code, message = code) {
  return Object.assign(new Error(`npm failed: ${message}`), {
    status: 1,
    stderr: Buffer.from(JSON.stringify({ error: { code, summary: message } })),
  })
}

function isPreparationCheck({ command, args }) {
  return command === 'pnpm' && !['config', 'view', 'publish'].includes(args[0])
}

function assertNoPreparation(release) {
  assert.equal(release.readManifest(), release.originalManifest)
  assert.equal(release.calls.some(isPreparationCheck), false)
  assert.equal(release.calls.some(({ args }) => args[0] === 'view' || args[0] === 'publish'), false)
}

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
      ...(item.target === pkg.target ? overrides.manifest : {}),
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
      interactive: overrides.interactive ?? true,
      run: (command, args, options) => {
        calls.push({ command, args, options, version: JSON.parse(readFileSync(manifestPath, 'utf8')).version })
        if (command === 'npm') {
          if (overrides.authRun) return overrides.authRun(args, options)
          if (args[0] === 'whoami') return JSON.stringify('publisher')
          if (args[0] === 'login') return ''
          assert.fail(`Unexpected npm command: ${args.join(' ')}`)
        }
        assert.equal(command, 'pnpm')
        if (args[0] === 'config') {
          if (overrides.configRun) return overrides.configRun(args, options)
          return args[2] === 'registry' ? `${defaultRegistry}\n` : 'undefined\n'
        }
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
      'publish', '--access', 'public', '--no-git-checks', '--ignore-scripts', '--registry', defaultRegistry, '--otp', '123456',
    ])
    assert.equal(publishCall.options.cwd, join(release.rootDir, 'packages', pkg.directory))
    const checks = release.calls.filter(isPreparationCheck)
    assert.ok(checks.some(({ args }) => args[1] === pkg.name && args[2] === 'test'))
    assert.ok(checks.some(({ args }) => args[0] === pkg.build))
    assert.ok(checks.every(({ version, options }) => version === '1.0.1' && options.cwd === release.rootDir))
    const authCalls = release.calls.filter(({ command }) => command === 'npm')
    assert.equal(authCalls.length, 1)
    assert.deepEqual(authCalls[0].args, ['whoami', '--registry', defaultRegistry, '--json'])
    assert.equal(authCalls[0].version, '1.0.0')
    assert.equal(authCalls[0].options.cwd, release.rootDir)
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
    assert.equal(release.calls.filter(({ args }) => args[0] === 'publish').length, 1)
    assert.equal(release.calls.some(({ args }) => args[0] === 'login'), false)
  })
}

const reactPackage = packages.find(({ target }) => target === 'spot-react')

test('spot-react: checks the exact SDK version before changing its manifest', async (t) => {
  const release = setup(t, reactPackage)
  await release.publish()
  const lookup = release.calls.find(({ args }) => args[0] === 'view')
  assert.deepEqual(lookup.args, [
    'view', '@orbs-network/spot-ui@1.0.0', 'version', '--json', '--registry', defaultRegistry,
  ])
  assert.equal(lookup.version, '1.0.0')
  assert.equal(lookup.options.cwd, join(release.rootDir, 'packages/spot-react'))
  assert.ok(release.calls.findIndex(({ args }) => args[0] === 'whoami') < release.calls.indexOf(lookup))
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
    assert.equal(release.calls.filter(({ command, args }) => command === 'pnpm' && args[0] !== 'config').length, 1)
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

for (const pkg of packages) {
  test(`${pkg.target}: expired authentication logs in and rechecks before changing the version`, async (t) => {
    let probes = 0
    const release = setup(t, pkg, {
      authRun: (args) => {
        if (args[0] === 'whoami' && probes++ === 0) throw npmFailure('E401', 'Token expired')
        return args[0] === 'whoami' ? JSON.stringify('publisher') : ''
      },
    })
    await release.publish()
    const authCalls = release.calls.filter(({ command }) => command === 'npm')
    assert.deepEqual(authCalls.map(({ args }) => args), [
      ['whoami', '--registry', defaultRegistry, '--json'],
      ['login', '--registry', defaultRegistry, '--auth-type=web'],
      ['whoami', '--registry', defaultRegistry, '--json'],
    ])
    assert.ok(authCalls.every(({ version, options }) => version === '1.0.0'
      && options.cwd === release.rootDir))
    assert.equal(authCalls[1].options.stdio, 'inherit')
    assert.deepEqual(authCalls[0].options.stdio, ['ignore', 'pipe', 'pipe'])
    assert.equal(authCalls[0].options.timeout, 30_000)
    assert.equal(authCalls[2].options.timeout, 30_000)
    const lastProbe = release.calls.indexOf(authCalls[2])
    assert.ok(release.calls.findIndex(isPreparationCheck) > lastProbe)
    if (pkg.target === 'spot-react') {
      assert.ok(release.calls.findIndex(({ args }) => args[0] === 'view') > lastProbe)
    }
  })

  test(`${pkg.target}: noninteractive missing authentication gives a login command without modifying files`, async (t) => {
    const release = setup(t, pkg, {
      interactive: false,
      authRun: () => { throw npmFailure('ENEEDAUTH') },
    })
    await assert.rejects(release.publish(), (error) => {
      assert.match(error.message, /npm login/)
      assert.ok(error.message.includes(defaultRegistry))
      return true
    })
    assertNoPreparation(release)
    assert.equal(release.calls.some(({ args }) => args[0] === 'login'), false)
  })

  test(`${pkg.target}: failed login stops before dependency lookup, tests, or version changes`, async (t) => {
    const release = setup(t, pkg, {
      authRun: (args) => {
        if (args[0] === 'whoami') throw npmFailure('ENEEDAUTH')
        throw new Error('Login cancelled')
      },
    })
    await assert.rejects(release.publish(), /login/i)
    assertNoPreparation(release)
    assert.deepEqual(release.calls.filter(({ command }) => command === 'npm').map(({ args }) => args[0]), ['whoami', 'login'])
  })

  test(`${pkg.target}: login without a verified session stops before preparation`, async (t) => {
    const release = setup(t, pkg, {
      authRun: (args) => {
        if (args[0] === 'whoami') throw npmFailure('E401')
        return ''
      },
    })
    await assert.rejects(release.publish())
    assertNoPreparation(release)
    assert.deepEqual(release.calls.filter(({ command }) => command === 'npm').map(({ args }) => args[0]), ['whoami', 'login', 'whoami'])
  })

  test(`${pkg.target}: a registry connection failure does not trigger login or preparation`, async (t) => {
    const release = setup(t, pkg, {
      authRun: () => { throw npmFailure('ECONNREFUSED', 'Registry connection refused') },
    })
    await assert.rejects(release.publish())
    assertNoPreparation(release)
    assert.deepEqual(release.calls.filter(({ command }) => command === 'npm').map(({ args }) => args[0]), ['whoami'])
  })
}

for (const code of ['ENEEDAUTH', 'E401', 'E403', 'EAUTH']) {
  test(`npm authentication code ${code} can be recovered with one interactive login`, async (t) => {
    let probes = 0
    const release = setup(t, packages[0], {
      authRun: (args) => {
        if (args[0] === 'whoami' && probes++ === 0) throw npmFailure(code)
        return args[0] === 'whoami' ? JSON.stringify('publisher') : ''
      },
    })
    await release.publish()
    assert.equal(release.calls.filter(({ args }) => args[0] === 'login').length, 1)
  })
}

for (const message of ['Access token expired or revoked. Please try logging in again.', 'The npm token has been revoked']) {
  test(`explicit token expiry or revocation triggers login: ${message}`, async (t) => {
    let probes = 0
    const release = setup(t, packages[0], {
      authRun: (args) => {
        if (args[0] === 'whoami' && probes++ === 0) {
          throw Object.assign(new Error('npm failed'), { stderr: Buffer.from(message) })
        }
        return args[0] === 'whoami' ? JSON.stringify('publisher') : ''
      },
    })
    await release.publish()
    assert.equal(release.calls.filter(({ args }) => args[0] === 'login').length, 1)
  })
}

for (const code of ['ETIMEDOUT', 'ENOTFOUND', 'E500', 'E503']) {
  test(`npm ${code} does not prompt login or change the manifest`, async (t) => {
    const release = setup(t, packages[0], {
      authRun: () => { throw npmFailure(code) },
    })
    await assert.rejects(release.publish())
    assertNoPreparation(release)
    assert.equal(release.calls.some(({ args }) => args[0] === 'login'), false)
  })
}

for (const result of ['', 'not json', JSON.stringify(''), JSON.stringify({ username: 'publisher' }), 'null']) {
  test(`an invalid whoami response stops without login: ${JSON.stringify(result)}`, async (t) => {
    const release = setup(t, packages[0], { authRun: () => result })
    await assert.rejects(release.publish())
    assertNoPreparation(release)
    assert.equal(release.calls.some(({ args }) => args[0] === 'login'), false)
  })
}

test('a valid session can publish noninteractively without opening login', async (t) => {
  const release = setup(t, packages[0], { interactive: false })
  await release.publish()
  assert.equal(release.calls.some(({ args }) => args[0] === 'login'), false)
  assert.equal(release.calls.filter(({ args }) => args[0] === 'publish').length, 1)
})

for (const source of ['scope', 'publishConfig']) {
  test(`a custom ${source} registry is shared by authentication, dependency lookup, and publishing`, async (t) => {
    const registry = 'https://packages.example.test/npm/'
    let probes = 0
    const release = setup(t, reactPackage, {
      manifest: source === 'publishConfig' ? { publishConfig: { registry } } : {},
      configRun: (args) => {
        assert.deepEqual(args, ['config', 'get', '@orbs-network:registry'])
        return source === 'scope' ? `${registry}\n` : 'undefined\n'
      },
      authRun: (args) => {
        if (args[0] === 'whoami' && probes++ === 0) throw npmFailure('ENEEDAUTH')
        return args[0] === 'whoami' ? JSON.stringify('publisher') : ''
      },
    })
    await release.publish()
    const registryCalls = release.calls.filter(({ command, args }) => command === 'npm' || args[0] === 'view' || args[0] === 'publish')
    assert.deepEqual(registryCalls.map(({ args }) => args[0]), ['whoami', 'login', 'whoami', 'view', 'publish'])
    for (const { args } of registryCalls) {
      assert.equal(args[args.indexOf('--registry') + 1], registry)
    }
  })
}

test('a configured scope registry takes precedence over publishConfig.registry for all registry requests', async (t) => {
  const registry = 'https://scope.example.test/npm/'
  let probes = 0
  const release = setup(t, reactPackage, {
    manifest: { publishConfig: { registry: 'https://publish-config.example.test/npm/' } },
    configRun: (args) => {
      assert.deepEqual(args, ['config', 'get', '@orbs-network:registry'])
      return registry
    },
    authRun: (args) => {
      if (args[0] === 'whoami' && probes++ === 0) throw npmFailure('ENEEDAUTH')
      return args[0] === 'whoami' ? JSON.stringify('publisher') : ''
    },
  })
  await release.publish()
  const registryCalls = release.calls.filter(({ command, args }) => command === 'npm' || args[0] === 'view' || args[0] === 'publish')
  assert.deepEqual(registryCalls.map(({ args }) => args[0]), ['whoami', 'login', 'whoami', 'view', 'publish'])
  for (const { args } of registryCalls) {
    assert.equal(args[args.indexOf('--registry') + 1], registry)
  }
})

test('an unset scope registry falls back to the configured default registry', async (t) => {
  const registry = 'https://registry.example.test/'
  const release = setup(t, packages[0], {
    configRun: (args, options) => {
      assert.equal(options.cwd, join(release.rootDir, 'packages', packages[0].directory))
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe'])
      assert.equal(options.timeout, 30_000)
      return args[2] === 'registry' ? registry : 'undefined\n'
    },
  })
  await release.publish()
  assert.deepEqual(release.calls.filter(({ args }) => args[0] === 'config').map(({ args }) => args), [
    ['config', 'get', '@orbs-network:registry'],
    ['config', 'get', 'registry'],
  ])
  for (const { command, args } of release.calls) {
    if (command === 'npm' || args[0] === 'publish') assert.equal(args[args.indexOf('--registry') + 1], registry)
  }
})

for (const configured of ['', 'undefined\n', 'null\n']) {
  test(`unset registry configuration ${JSON.stringify(configured)} falls back to npmjs`, async (t) => {
    const release = setup(t, packages[0], { configRun: () => configured })
    await release.publish()
    const whoami = release.calls.find(({ args }) => args[0] === 'whoami')
    assert.equal(whoami.args[whoami.args.indexOf('--registry') + 1], defaultRegistry)
  })
}

test('registry configuration failure stops before authentication or manifest changes', async (t) => {
  const release = setup(t, reactPackage, {
    configRun: () => { throw new Error('Configuration unavailable') },
  })
  await assert.rejects(release.publish())
  assertNoPreparation(release)
  assert.equal(release.calls.some(({ command }) => command === 'npm'), false)
})

for (const packageConfig of [false, true]) {
  test(`${packageConfig ? 'package' : 'workspace'} .npmrc is used consistently for login, recheck, and publishing`, async (t) => {
    const workspaceRegistry = 'https://workspace.example.test/npm/'
    const packageRegistry = 'https://package.example.test/npm/'
    const registry = packageConfig ? packageRegistry : workspaceRegistry
    let probes = 0
    const release = setup(t, reactPackage, {
      configRun: () => registry,
      authRun: (args, options) => {
        const expectedDirectory = packageConfig
          ? join(release.rootDir, 'packages', reactPackage.directory)
          : release.rootDir
        assert.equal(options.cwd, expectedDirectory)
        assert.equal(readFileSync(join(options.cwd, '.npmrc'), 'utf8'), `@orbs-network:registry=${registry}\n`)
        assert.equal(args[args.indexOf('--registry') + 1], registry)
        if (args[0] === 'whoami' && probes++ === 0) throw npmFailure('ENEEDAUTH')
        return args[0] === 'whoami' ? JSON.stringify('publisher') : ''
      },
    })
    writeFileSync(join(release.rootDir, '.npmrc'), `@orbs-network:registry=${workspaceRegistry}\n`)
    if (packageConfig) {
      writeFileSync(join(release.rootDir, 'packages', reactPackage.directory, '.npmrc'), `@orbs-network:registry=${packageRegistry}\n`)
    }
    await release.publish()
    const registryCalls = release.calls.filter(({ command, args }) => command === 'npm' || args[0] === 'view' || args[0] === 'publish')
    assert.deepEqual(registryCalls.map(({ args }) => args[0]), ['whoami', 'login', 'whoami', 'view', 'publish'])
    for (const { args } of registryCalls) {
      assert.equal(args[args.indexOf('--registry') + 1], registry)
    }
  })
}
