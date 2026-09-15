import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { runPublish, StagedPublishError } from './run-publish.mjs'
import { AlreadyPublishedError } from './verify-published-version.mjs'

function harness() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  const output = []
  const promise = runPublish('@orbs-network/spot-react', '2.1.9', '/tmp/package', '123456', {
    start(command, args, options) {
      assert.equal(command, 'pnpm')
      assert.deepEqual(args, ['publish', '--access', 'public', '--no-git-checks', '--otp', '123456'])
      assert.equal(options.cwd, '/tmp/package')
      return child
    },
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: (chunk) => output.push(chunk) },
  })
  return { child, promise, output }
}

test('recognizes a staged conflict split across output chunks', async () => {
  const { child, promise, output } = harness()
  const rejected = assert.rejects(promise, (error) => {
    assert.ok(error instanceof StagedPublishError)
    assert.match(error.message, /2.1.9 is already staged/)
    assert.match(error.message, /Keeping the local version/)
    assert.match(error.message, /approve it with 2FA/)
    return true
  })
  child.stderr.emit('data', 'npm error 409 Conflict - Cannot publish over previously ')
  child.stderr.emit('data', 'staged version "2.1.9".')
  assert.equal(output.length, 2)
  child.emit('close', 1)
  await rejected
})

test('ordinary publish errors remain failures', async () => {
  const { child, promise } = harness()
  const rejected = assert.rejects(promise, (error) => {
    assert.equal(error instanceof StagedPublishError, false)
    return true
  })
  child.stderr.emit('data', 'npm error E401 Unauthorized')
  child.emit('close', 1)
  await rejected
})

test('successful command proceeds to registry verification', async () => {
  const { child, promise } = harness()
  child.emit('close', 0)
  await promise
})

test('reports a command that cannot start', async () => {
  const { child, promise } = harness()
  const rejected = assert.rejects(promise, /ENOENT/)
  child.emit('error', new Error('ENOENT'))
  await rejected
})

test('recognizes an already published version without treating it as an ordinary failure', async () => {
  const { child, promise } = harness()
  const rejected = assert.rejects(promise, AlreadyPublishedError)
  child.stderr.emit('data', 'npm error 403 Forbidden - You cannot publish over the previously published versions: 2.1.9.')
  child.emit('close', 1)
  await rejected
})
