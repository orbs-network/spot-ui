import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { publishPackage, publishPackages } from './publish-package.mjs'

const useDefault = Symbol('use default mock response')
const npmRegistry = 'https://registry.npmjs.org/'
const uiName = '@orbs-network/spot-ui'
const reactName = '@orbs-network/spot-react'

function fixture(t, {
  versions = ['1.2.4', '4.5.7'],
  confirmations = [],
  scopedRegistry,
  registry = npmRegistry,
  uiManifest = {},
  reactManifest = {},
  npmrcPackages = [],
  onRun = () => useDefault,
} = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), 'spot-publish-test-'))
  t.after(() => rmSync(rootDir, { recursive: true, force: true }))
  const manifests = {
    'spot-ui': { name: uiName, version: '1.2.3', ...uiManifest },
    'spot-react': {
      name: reactName,
      version: '4.5.6',
      dependencies: { [uiName]: 'workspace:*' },
      ...reactManifest,
    },
  }
  for (const [target, manifest] of Object.entries(manifests)) {
    const directory = join(rootDir, 'packages', target)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
    if (npmrcPackages.includes(target)) writeFileSync(join(directory, '.npmrc'), 'access=public\n')
  }

  const calls = []
  const waits = []
  const selections = []
  let elapsed = 0
  const selectedVersions = [...versions]
  const confirmAnswers = [...confirmations]
  const read = (target) => JSON.parse(readFileSync(join(rootDir, 'packages', target, 'package.json'), 'utf8'))
  const state = {
    rootDir,
    calls,
    waits,
    selections,
    read,
    advance: (millis) => { elapsed += millis },
    get elapsed() { return elapsed },
  }
  state.options = {
    rootDir,
    interactive: false,
    log: () => {},
    now: () => elapsed,
    wait: async (millis) => {
      waits.push(millis)
      elapsed += millis
    },
    prompts: {
      selectVersion: async (currentVersion) => {
        selections.push(currentVersion)
        assert.ok(selectedVersions.length, 'Unexpected version prompt')
        return selectedVersions.shift()
      },
      confirmPublish: async () => confirmAnswers.length ? confirmAnswers.shift() : true,
      promptOtp: async () => '',
    },
    run: (command, args, options) => {
      const call = {
        command,
        args: [...args],
        options,
        uiVersion: read('spot-ui').version,
        reactVersion: read('spot-react').version,
      }
      calls.push(call)
      const override = onRun(call, state)
      if (override !== useDefault) return override
      if (command === 'pnpm' && args[0] === 'config') {
        assert.equal(args[1], 'get')
        return args[2] === '@orbs-network:registry' ? scopedRegistry ?? 'undefined\n' : registry
      }
      if (command === 'npm' && args[0] === 'whoami') return JSON.stringify('test-publisher')
      if (command === 'pnpm' && args[0] === 'view') return JSON.stringify(read('spot-ui').version)
      if (command === 'pnpm' && (args[0] === 'publish' || args[0].startsWith('build:'))) return ''
      assert.fail(`Unexpected command: ${command} ${args.join(' ')}`)
    },
  }
  return state
}

const commands = (state, name) => state.calls.filter(call => call.args[0] === name)
const buildCalls = (state) => state.calls.filter(call => call.args[0].startsWith('build:'))
const registryArgument = (call) => call.args[call.args.indexOf('--registry') + 1]
const registryError = (code) => Object.assign(new Error(code), { code })

test('combined publisher waits for the exact newly published UI version before publishing React', async (t) => {
  let lookup = 0
  const state = fixture(t, {
    onRun: (call) => {
      if (call.args[0] !== 'view') return useDefault
      lookup += 1
      if (lookup === 1) throw registryError('E404')
      if (lookup === 2) return JSON.stringify('1.2.3')
      return JSON.stringify('1.2.4')
    },
  })

  await publishPackages(['spot-ui', 'spot-react'], state.options)

  const publishes = commands(state, 'publish')
  const views = commands(state, 'view')
  assert.equal(publishes.length, 2)
  assert.equal(publishes[0].options.cwd, join(state.rootDir, 'packages/spot-ui'))
  assert.equal(publishes[0].uiVersion, '1.2.4')
  assert.equal(publishes[1].options.cwd, join(state.rootDir, 'packages/spot-react'))
  assert.equal(publishes[1].reactVersion, '4.5.7')
  assert.ok(state.calls.indexOf(publishes[0]) < state.calls.indexOf(views[0]))
  assert.ok(state.calls.indexOf(views.at(-1)) < state.calls.indexOf(publishes[1]))
  assert.deepEqual(views.map(call => call.args[1]), Array(3).fill(`${uiName}@1.2.4`))
  assert.ok(views.every(call => call.args.includes('--prefer-online')))
  assert.ok(views.every(call => call.reactVersion === '4.5.6'))
  assert.deepEqual(state.waits, [5_000, 5_000])
  assert.deepEqual(buildCalls(state).map(call => call.args[0]), [
    'build:spot-ui', 'build:spot-ui', 'build:spot-react',
  ])
  assert.equal(state.read('spot-ui').version, '1.2.4')
  assert.equal(state.read('spot-react').version, '4.5.7')
})

test('dependency polling stops at its deadline before changing or building React', async (t) => {
  const state = fixture(t, {
    versions: ['4.5.7'],
    onRun: (call, current) => {
      if (call.args[0] !== 'view') return useDefault
      current.advance(Math.min(28_000, call.options.timeout))
      throw registryError('E404')
    },
  })
  const originalReact = readFileSync(join(state.rootDir, 'packages/spot-react/package.json'), 'utf8')

  await assert.rejects(publishPackage('spot-react', state.options), /Timed out after 5 minutes/)

  const views = commands(state, 'view')
  assert.equal(state.elapsed, 300_000)
  assert.equal(views.length, 10)
  assert.equal(views[0].options.timeout, 30_000)
  assert.equal(views.at(-1).options.timeout, 3_000)
  assert.ok(state.waits.every(delay => delay > 0 && delay <= 5_000))
  assert.equal(buildCalls(state).length, 0)
  assert.equal(commands(state, 'publish').length, 0)
  assert.equal(readFileSync(join(state.rootDir, 'packages/spot-react/package.json'), 'utf8'), originalReact)
})

test('cancelling the UI version selection stops the combined publisher', async (t) => {
  const state = fixture(t, { versions: [null] })

  await publishPackages(['spot-ui', 'spot-react'], state.options)

  assert.deepEqual(state.selections, ['1.2.3'])
  assert.equal(state.calls.length, 0)
  assert.equal(state.read('spot-ui').version, '1.2.3')
  assert.equal(state.read('spot-react').version, '4.5.6')
})

test('a failed UI upload stops the combined publisher and preserves the attempted UI version', async (t) => {
  const state = fixture(t, {
    onRun: (call) => {
      if (call.args[0] === 'publish') throw new Error('upload failed')
      return useDefault
    },
  })

  await assert.rejects(publishPackages(['spot-ui', 'spot-react'], state.options), /Publish command failed/)

  assert.deepEqual(state.selections, ['1.2.3'])
  assert.equal(commands(state, 'publish').length, 1)
  assert.equal(commands(state, 'view').length, 0)
  assert.equal(state.read('spot-ui').version, '1.2.4')
  assert.equal(state.read('spot-react').version, '4.5.6')
})

test('declining React publication preserves the already published UI version', async (t) => {
  const state = fixture(t, { confirmations: [true, false] })

  await publishPackages(['spot-ui', 'spot-react'], state.options)

  assert.deepEqual(state.selections, ['1.2.3', '4.5.6'])
  assert.equal(commands(state, 'publish').length, 1)
  assert.equal(commands(state, 'view').length, 0)
  assert.equal(state.read('spot-ui').version, '1.2.4')
  assert.equal(state.read('spot-react').version, '4.5.6')
})

test('React upload failure keeps both attempted versions without rolling back the UI release', async (t) => {
  const state = fixture(t, {
    onRun: (call) => {
      if (call.args[0] === 'publish' && call.options.cwd.endsWith('spot-react')) {
        throw new Error('React upload failed')
      }
      return useDefault
    },
  })

  await assert.rejects(publishPackages(['spot-ui', 'spot-react'], state.options), /Publish command failed/)

  assert.equal(commands(state, 'publish').length, 2)
  assert.equal(state.read('spot-ui').version, '1.2.4')
  assert.equal(state.read('spot-react').version, '4.5.7')
})

test('React preparation failure restores only React and retains the published UI version', async (t) => {
  const state = fixture(t, {
    onRun: (call) => {
      if (call.args[0] === 'build:spot-react') throw new Error('React build failed')
      return useDefault
    },
  })
  const originalReact = readFileSync(join(state.rootDir, 'packages/spot-react/package.json'), 'utf8')

  await assert.rejects(publishPackages(['spot-ui', 'spot-react'], state.options), /restored the original package version.*React build failed/)

  assert.equal(commands(state, 'publish').length, 1)
  assert.equal(state.read('spot-ui').version, '1.2.4')
  assert.equal(readFileSync(join(state.rootDir, 'packages/spot-react/package.json'), 'utf8'), originalReact)
})

test('registry authentication failures stop dependency polling immediately', async (t) => {
  const state = fixture(t, {
    versions: ['4.5.7'],
    onRun: (call) => {
      if (call.args[0] === 'view') throw registryError('E403')
      return useDefault
    },
  })

  await assert.rejects(publishPackage('spot-react', state.options), /Check your registry credentials/)

  assert.equal(commands(state, 'view').length, 1)
  assert.deepEqual(state.waits, [])
  assert.equal(buildCalls(state).length, 0)
  assert.equal(commands(state, 'publish').length, 0)
  assert.equal(state.read('spot-react').version, '4.5.6')
})

test('standalone UI publishing preserves scoped registry precedence and package authentication cwd', async (t) => {
  const scopedRegistry = 'https://scope.example.test/'
  const state = fixture(t, {
    versions: ['1.2.4'],
    scopedRegistry,
    uiManifest: { publishConfig: { registry: 'https://manifest.example.test/' } },
    npmrcPackages: ['spot-ui'],
  })

  const result = await publishPackage('spot-ui', state.options)

  const packageDir = join(state.rootDir, 'packages/spot-ui')
  assert.deepEqual(result, { name: uiName, version: '1.2.4', registry: scopedRegistry })
  assert.equal(commands(state, 'whoami')[0].options.cwd, packageDir)
  assert.equal(registryArgument(commands(state, 'whoami')[0]), scopedRegistry)
  assert.equal(commands(state, 'publish')[0].options.cwd, packageDir)
  assert.equal(registryArgument(commands(state, 'publish')[0]), scopedRegistry)
  assert.ok(commands(state, 'publish')[0].args.includes('--ignore-scripts'))
  assert.equal(buildCalls(state)[0].options.cwd, state.rootDir)
  assert.equal(commands(state, 'view').length, 0)
})

test('standalone React publishing checks the dependency in its configured registry and package cwd', async (t) => {
  const manifestRegistry = 'https://react.example.test/'
  const state = fixture(t, {
    versions: ['4.5.7'],
    reactManifest: { publishConfig: { registry: manifestRegistry } },
    uiManifest: { publishConfig: { registry: 'https://ui.example.test/' } },
  })

  const result = await publishPackage('spot-react', state.options)

  const packageDir = join(state.rootDir, 'packages/spot-react')
  const view = commands(state, 'view')[0]
  assert.deepEqual(result, { name: reactName, version: '4.5.7', registry: manifestRegistry })
  assert.equal(commands(state, 'whoami')[0].options.cwd, state.rootDir)
  assert.equal(registryArgument(commands(state, 'whoami')[0]), manifestRegistry)
  assert.equal(view.args[1], `${uiName}@1.2.3`)
  assert.equal(view.options.cwd, packageDir)
  assert.equal(registryArgument(view), manifestRegistry)
  assert.equal(commands(state, 'publish')[0].options.cwd, packageDir)
  assert.equal(registryArgument(commands(state, 'publish')[0]), manifestRegistry)
  assert.ok(buildCalls(state).every(call => call.options.cwd === state.rootDir))
  assert.equal(state.read('spot-ui').version, '1.2.3')
  assert.deepEqual(state.waits, [])
})
