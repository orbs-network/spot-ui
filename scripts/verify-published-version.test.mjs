import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyPublishedVersion, assertVersionUnpublished, AlreadyPublishedError } from './verify-published-version.mjs'

const name = '@orbs-network/spot-react'
const version = '2.1.9'
const cwd = '/tmp/package'

test('checks the exact selected release with fresh registry metadata', async () => {
  await verifyPublishedVersion(name, version, cwd, {
    run(command, args, options) {
      assert.equal(command, 'npm')
      assert.deepEqual(args.slice(0, 3), ['view', `${name}@${version}`, 'version'])
      assert.ok(args.includes('--prefer-online'))
      assert.equal(options.cwd, cwd)
      return '"2.1.9"\n'
    },
    wait() { assert.fail('A confirmed release should not retry') },
  })
})

test('does not confirm 2.1.9 when the registry returns 2.1.8', async () => {
  let calls = 0
  const delays = []
  await assert.rejects(verifyPublishedVersion(name, version, cwd, {
    run() { calls++; return '"2.1.8"' },
    async wait(delay) { delays.push(delay) },
  }), (error) => {
    assert.match(error.message, /release is unconfirmed/)
    assert.match(error.message, /Keeping the local version/)
    assert.match(error.cause.message, /2.1.8.*instead of 2.1.9/)
    return true
  })
  assert.equal(calls, 4)
  assert.deepEqual(delays, [2000, 2000, 2000])
})

test('retries a release that is not visible immediately after upload', async () => {
  let calls = 0
  await verifyPublishedVersion(name, version, cwd, {
    run() {
      if (++calls === 1) throw new Error('E404')
      return '"2.1.9"'
    },
    async wait() {},
  })
  assert.equal(calls, 2)
})

test('fails verification when the registry remains unavailable', async () => {
  const failure = new Error('Network unavailable')
  await assert.rejects(verifyPublishedVersion(name, version, cwd, {
    run() { throw failure },
    async wait() {},
  }), (error) => {
    assert.equal(error.cause, failure)
    assert.match(error.message, /Could not verify @orbs-network\/spot-react@2.1.9/)
    return true
  })
})

test('preflight blocks an already published release', () => {
  assert.throws(() => assertVersionUnpublished(name, version, cwd, {
    run: () => '\"2.1.9\"',
  }), AlreadyPublishedError)
})

test('preflight permits a version that npm reports as missing', () => {
  assertVersionUnpublished(name, version, cwd, {
    run() { throw Object.assign(new Error('not found'), { stdout: JSON.stringify({ error: { code: 'E404' } }) }) },
  })
})

test('preflight blocks publication on network or authentication failures', () => {
  for (const code of ['ENOTFOUND', 'E401', 'E403']) {
    assert.throws(() => assertVersionUnpublished(name, version, cwd, {
      run() { throw Object.assign(new Error(code), { stdout: JSON.stringify({ error: { code } }) }) },
    }), /Could not check whether the release already exists/)
  }
})
