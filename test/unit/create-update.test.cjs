'use strict'

// Covers testForUpdates() in src/create.js (exported for testability): the
// npm-registry update check with its offline/unreachable branch, the
// up-to-date branch, the update-available confirmation flow (p.group ->
// answer true/false), the --y automatic flow, and the cancel flow.
//
// Requiring src/create.js executes main() at module load, so this file:
//  - isolates HOME first (create.js writes ~/.haxtheweb/hax-cli-last-run and
//    logging.js points its winston file transport there on load);
//  - installs the clack stub and patches p.intro/p.outro/p.cancel/p.group;
//  - patches utils.exec / utils.interactiveExec (live writable bindings);
//  - patches haxcmsLib.systemStructureContext to return null BEFORE the
//    module is required (create.js captures it as a const at load time);
//  - sets a benign argv (--no-i) so main() takes the non-interactive
//    process.exit(0) path immediately;
//  - uses a self-restoring one-shot process.exit thrower for that require-
//    time exit (main().catch(console.error) swallows it; a filtered
//    console.error keeps it out of the test output).
// After that main() is settled and each test patches process.exit itself
// using the established sentinel pattern.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-create-update-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME
fs.mkdirSync(path.join(ISOLATED_HOME, '.haxtheweb'), { recursive: true })

const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

// transpile ESM src on the fly so .cjs tests can require() it (must come
// before requiring src modules so their exports are writable CJS bindings)
require('@babel/register')

const intros = []
stub.intro = (msg) => { intros.push(String(msg)) }
const outros = []
stub.outro = (msg) => { outros.push(String(msg)) }
const cancels = []
stub.cancel = (msg) => { cancels.push(String(msg)) }
let groupResponse = { answer: false }
let groupCancel = false
let groupCallCount = 0
stub.group = async (prompts, groupOpts) => {
  groupCallCount++
  if (groupCancel && groupOpts && typeof groupOpts.onCancel === 'function') {
    groupOpts.onCancel()
    return {}
  }
  return groupResponse
}

// patch utils.exec / utils.interactiveExec on the live module object
const utils = require('../../src/lib/utils.js')
const execCalls = []
const interactiveCalls = []
let execResult = { stdout: '', stderr: '' }
let execError = null
utils.exec = async (cmd, cmdOpts) => {
  execCalls.push({ cmd, opts: cmdOpts })
  if (execError) {
    throw execError
  }
  return execResult
}
utils.interactiveExec = async (cmd, args, cmdOpts) => {
  interactiveCalls.push({ cmd, args, opts: cmdOpts })
}

// systemStructureContext is captured as a const at create.js load time
const haxcmsLib = require('@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js')
haxcmsLib.systemStructureContext = async () => null

// benign argv so main() (invoked at require time) exits non-interactively
process.argv = [process.argv[0], process.argv[1], '--no-i']

// one-shot thrower for main()'s require-time process.exit(0); restores the
// real process.exit immediately so per-test patches start from a clean base
const originalExit = process.exit
process.exit = function oneShotExit() {
  process.exit = originalExit
  throw new Error('__main_process_exit__')
}
// keep the expected main() sentinel out of the test output only
const originalConsoleError = console.error
console.error = function filteredConsoleError(...args) {
  if (args[0] instanceof Error && /__main_process_exit__/.test(args[0].message)) {
    return
  }
  return originalConsoleError.call(console, ...args)
}

const { probeModule } = require('../_helpers/module-canary.cjs')
const { available, skipReason, module: createModule } = probeModule('src/create.js')
const { testForUpdates } = available ? createModule : {}

const test = require('node:test')
const assert = require('node:assert/strict')

const packageJson = require('../../package.json')

const opts = { skip: skipReason, timeout: 15000 }

function resetMocks() {
  execCalls.length = 0
  interactiveCalls.length = 0
  intros.length = 0
  outros.length = 0
  cancels.length = 0
  groupCallCount = 0
  groupResponse = { answer: false }
  groupCancel = false
  execResult = { stdout: '', stderr: '' }
  execError = null
}

test('offline registry failure returns without throwing (quiet)', opts, async () => {
  resetMocks()
  execError = new Error('network unreachable')
  await testForUpdates({ options: { quiet: true } })
  assert.equal(execCalls.length, 1)
  assert.ok(execCalls[0].cmd.includes('npm view @haxtheweb/create version'))
  assert.ok(!intros.some((m) => m.includes('Unable to check for updates')))
  assert.equal(interactiveCalls.length, 0)
})

test('offline registry failure reports the friendly message (non-quiet)', opts, async () => {
  resetMocks()
  execError = new Error('network unreachable')
  await testForUpdates({ options: {} })
  assert.ok(intros.some((m) => m.includes('Unable to check for updates')))
  assert.ok(intros.some((m) => m.includes('Could not reach the npm registry')))
  assert.equal(interactiveCalls.length, 0)
})

test('matching registry version reports the CLI is up to date', opts, async () => {
  resetMocks()
  execResult = { stdout: `${packageJson.version}\n`, stderr: '' }
  await testForUpdates({ options: {} })
  assert.ok(intros.some((m) => m.includes('is up to date')))
  assert.equal(interactiveCalls.length, 0)
  assert.equal(groupCallCount, 0)
})

test('newer registry version with --y installs the update automatically', opts, async () => {
  resetMocks()
  execResult = { stdout: '999.999.999\n', stderr: '' }
  await testForUpdates({ options: { y: true } })
  assert.ok(intros.some((m) => m.includes('HAX cli updates available!')))
  assert.equal(groupCallCount, 0, '--y skips the confirmation group')
  assert.equal(interactiveCalls.length, 1)
  assert.equal(interactiveCalls[0].cmd, 'npm')
  assert.deepEqual(interactiveCalls[0].args, ['install', '--global', '@haxtheweb/create'])
})

test('newer registry version installs the update when confirmed', opts, async () => {
  resetMocks()
  execResult = { stdout: '999.999.999\n', stderr: '' }
  groupResponse = { answer: true }
  await testForUpdates({ options: {} })
  assert.equal(groupCallCount, 1)
  assert.equal(interactiveCalls.length, 1)
  assert.deepEqual(interactiveCalls[0].args, ['install', '--global', '@haxtheweb/create'])
})

test('newer registry version skips installing when declined', opts, async () => {
  resetMocks()
  execResult = { stdout: '999.999.999\n', stderr: '' }
  groupResponse = { answer: false }
  await testForUpdates({ options: {} })
  assert.equal(groupCallCount, 1)
  assert.equal(interactiveCalls.length, 0)
  assert.ok(outros.some((m) => m.includes('Upgrade at any time')))
})

test('canceling the update prompt exits cleanly', opts, async () => {
  resetMocks()
  execResult = { stdout: '999.999.999\n', stderr: '' }
  groupCancel = true
  const originalTestExit = process.exit
  let exitCode = null
  process.exit = (code) => {
    exitCode = code
    throw new Error('__process_exit__')
  }
  try {
    await assert.rejects(() => testForUpdates({ options: {} }), /__process_exit__/)
    assert.equal(exitCode, 0)
    assert.equal(cancels.length, 1)
  } finally {
    process.exit = originalTestExit
  }
})
