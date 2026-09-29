'use strict'

// Covers the issue #2993 offline-fix helpers exported from
// src/lib/programs/site.js: resolveHaxcmsNodejsBin(),
// execNpxHaxcmsNodejsFallback(), and spawnHaxcmsNodejs() — the local-bin
// spawn path with its clean-exit/signal/non-zero/failure-to-spawn
// branches. utils.exec / utils.spawn are monkey-patched on the babel-built
// module object (writable, live bindings) before site.js is required via
// the canary so the module-load `which X`-style probes never spawn real
// subprocesses. The unresolvable-bin branch is driven by redirecting
// Module._resolveFilename to throw for the local.js specifier.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-bin-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

require('@babel/register')

const Module = require('node:module')

const test = require('node:test')
const assert = require('node:assert/strict')

// silence prompt output; nothing here should prompt, but be safe
stub.intro = (msg) => { /* quiet */ }
stub.note = (msg) => { /* quiet */ }
stub.outro = (msg) => { /* quiet */ }

// patch utils.exec / utils.spawn on the live module object BEFORE site.js
const utils = require('../../src/lib/utils.js')
const execCalls = []
utils.exec = async (cmd, cmdOpts) => {
  execCalls.push({ cmd, opts: cmdOpts })
  return { stdout: 'stub-stdout', stderr: '' }
}
const spawnCalls = []
utils.spawn = (cmd, args, spawnOpts) => {
  spawnCalls.push({ cmd, args, opts: spawnOpts })
  return makeFakeChild(spawnCalls[spawnCalls.length - 1])
}

// a fake ChildProcess that records registered handlers; `emit` drives them
function makeFakeChild(record) {
  const handlers = {}
  record.handlers = handlers
  return {
    on(event, cb) {
      handlers[event] = cb
      return this
    },
  }
}

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')
const { resolveHaxcmsNodejsBin, execNpxHaxcmsNodejsFallback, spawnHaxcmsNodejs } = available ? siteModule : {}

const opts = { skip: skipReason, timeout: 15000 }

test('resolveHaxcmsNodejsBin returns the locally installed dist/local.js path', opts, () => {
  const resolved = resolveHaxcmsNodejsBin()
  assert.equal(typeof resolved, 'string')
  assert.ok(resolved.includes('haxcms-nodejs'), `unexpected path: ${resolved}`)
  assert.ok(resolved.endsWith('dist/local.js'))
})

test('resolveHaxcmsNodejsBin returns null when local resolution fails', opts, () => {
  const originalResolveFilename = Module._resolveFilename
  Module._resolveFilename = function (request, ...args) {
    if (request === '@haxtheweb/haxcms-nodejs/dist/local.js') {
      throw new Error(`Cannot find module '${request}'`)
    }
    return originalResolveFilename.call(this, request, ...args)
  }
  try {
    assert.equal(resolveHaxcmsNodejsBin(), null)
  } finally {
    Module._resolveFilename = originalResolveFilename
  }
})

test('execNpxHaxcmsNodejsFallback delegates to exec with the npx command and cwd/env', opts, async () => {
  execCalls.length = 0
  await execNpxHaxcmsNodejsFallback('/some/cwd', { PORT: '8080' })
  assert.equal(execCalls.length, 1)
  assert.equal(execCalls[0].cmd, 'npx @haxtheweb/haxcms-nodejs')
  assert.deepEqual(execCalls[0].opts, { cwd: '/some/cwd', env: { PORT: '8080' } })
})

test('spawnHaxcmsNodejs spawns node with the resolved bin and resolves on clean exit', opts, async () => {
  spawnCalls.length = 0
  const promise = spawnHaxcmsNodejs('/site/cwd', { PORT: '3000', HOST: '127.0.0.1' })
  // handlers are registered synchronously, so a next tick can fire them
  process.nextTick(() => {
    spawnCalls[0].handlers.exit(0, null)
  })
  await promise
  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0].cmd, process.execPath)
  assert.equal(spawnCalls[0].args.length, 1)
  assert.ok(spawnCalls[0].args[0].endsWith('dist/local.js'))
  assert.equal(spawnCalls[0].opts.cwd, '/site/cwd')
  assert.equal(spawnCalls[0].opts.env.PORT, '3000')
  assert.equal(spawnCalls[0].opts.env.HOST, '127.0.0.1')
  assert.equal(spawnCalls[0].opts.stdio, 'inherit')
})

test('spawnHaxcmsNodejs resolves on signal exit (code null)', opts, async () => {
  spawnCalls.length = 0
  const promise = spawnHaxcmsNodejs('/site/cwd', {})
  // fire the exit handler with a null code (Ctrl+C signal shutdown)
  process.nextTick(() => {
    spawnCalls[0].handlers.exit(null, 'SIGINT')
  })
  await promise
})

test('spawnHaxcmsNodejs rejects when the server exits non-zero', opts, async () => {
  spawnCalls.length = 0
  const promise = spawnHaxcmsNodejs('/site/cwd', {})
  process.nextTick(() => {
    spawnCalls[0].handlers.exit(1, null)
  })
  await assert.rejects(promise, /haxcms-nodejs exited with code 1/)
})

test('spawnHaxcmsNodejs falls back to the npx invocation when the direct spawn errors', opts, async () => {
  execCalls.length = 0
  spawnCalls.length = 0
  const promise = spawnHaxcmsNodejs('/site/cwd', { PORT: '3001' })
  process.nextTick(() => {
    spawnCalls[0].handlers.error(new Error('spawn failed'))
  })
  await promise
  assert.equal(execCalls.length, 1)
  assert.equal(execCalls[0].cmd, 'npx @haxtheweb/haxcms-nodejs')
  assert.equal(execCalls[0].opts.cwd, '/site/cwd')
})

test('spawnHaxcmsNodejs falls back to npx when the local bin cannot be resolved', opts, async () => {
  execCalls.length = 0
  spawnCalls.length = 0
  const originalResolveFilename = Module._resolveFilename
  Module._resolveFilename = function (request, ...args) {
    if (request === '@haxtheweb/haxcms-nodejs/dist/local.js') {
      throw new Error(`Cannot find module '${request}'`)
    }
    return originalResolveFilename.call(this, request, ...args)
  }
  try {
    await spawnHaxcmsNodejs('/site/cwd', { PORT: '3002' })
    assert.equal(spawnCalls.length, 0, 'no direct spawn attempted')
    assert.equal(execCalls.length, 1)
    assert.equal(execCalls[0].cmd, 'npx @haxtheweb/haxcms-nodejs')
  } finally {
    Module._resolveFilename = originalResolveFilename
  }
})
