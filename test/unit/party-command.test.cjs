'use strict'

// Covers partyCommandDetected() in src/lib/programs/party.js: the
// community-link branches (docs/playground/psu/issues/discord/club, each of
// which opens a URL), the party:status default branch, the quit branch
// reached through the interactive loop, and the github branch driving
// cloneHAXRepositories() with its gh-auth/yarn-clone/install sequence.
//
// Mocking setup (installed BEFORE party.js is required):
//  - @clack/prompts is ESM-only (not assignable), so the shared clack-stub
//    helper is installed and intro/outro/note/cancel/spinner/group/etc are
//    patched on the live stub;
//  - the `open` package is ESM-only too (frozen namespace, default not
//    patchable), so the 'open' specifier is redirected via
//    Module._resolveFilename to a stub .cjs file that records URLs — no
//    browser tabs are ever opened from tests;
//  - utils.exec / utils.interactiveExec are monkey-patched (live writable
//    bindings) so the module-load `which git`/`which gh` probes and the
//    whole clone flow run against recorded stubs (sysGit/sysGh stay true);
//  - process.exit is intercepted per test with the established sentinel
//    pattern since every party run ends in an exit.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

// stub for the ESM-only `open` package: records calls, opens nothing
const OPEN_STUB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-open-stub-'))
const OPEN_STUB_PATH = path.join(OPEN_STUB_DIR, 'open-stub.cjs')
fs.writeFileSync(
  OPEN_STUB_PATH,
  "module.exports = { __esModule: true, default: async function stubOpen(url) { (globalThis.__haxOpenCalls = globalThis.__haxOpenCalls || []).push(url); } };\n",
)
const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  if (request === 'open') {
    return OPEN_STUB_PATH
  }
  return originalResolveFilename.call(this, request, ...args)
}

const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const intros = []
stub.intro = (msg) => { intros.push(String(msg)) }
const outros = []
stub.outro = (msg) => { outros.push(String(msg)) }
const notes = []
stub.note = (msg) => { notes.push(String(msg)) }
stub.cancel = (msg) => { /* quiet */ }
const spinnerMessages = []
stub.spinner = () => ({
  start(msg) { spinnerMessages.push(String(msg)) },
  stop(msg) { /* quiet */ },
})
let groupResponse = { action: 'quit' }
stub.group = async () => groupResponse
stub.select = async (opts) => (opts.options && opts.options[0] ? opts.options[0].value : null)
stub.text = async () => '/tmp'
stub.confirm = async () => true
stub.multiselect = async () => []

// no real subprocesses: module-load probes and the whole clone flow
const utils = require('../../src/lib/utils.js')
const execCalls = []
utils.exec = async (cmd) => {
  execCalls.push(cmd)
  return { stdout: '', stderr: '' }
}
utils.interactiveExec = async (cmd, args) => {
  execCalls.push(`${cmd} ${args.join(' ')}`)
}

const { partyCommandDetected } = require('../../src/lib/programs/party.js')

// drop the module-load `which git` / `which gh` probes
execCalls.length = 0

async function runParty(commandRun) {
  const originalExit = process.exit
  let exitCode = null
  process.exit = (code) => {
    exitCode = code
    throw new Error('__process_exit__')
  }
  try {
    await assert.rejects(() => partyCommandDetected(commandRun), /__process_exit__/)
    return exitCode
  } finally {
    process.exit = originalExit
  }
}

function openCalls() {
  return globalThis.__haxOpenCalls || []
}

function resetMocks() {
  execCalls.length = 0
  intros.length = 0
  outros.length = 0
  notes.length = 0
  spinnerMessages.length = 0
  groupResponse = { action: 'quit' }
  globalThis.__haxOpenCalls = []
}

// --- community-link branches: each opens exactly its own URL ---

const LINK_BRANCHES = [
  ['docs', 'https://haxtheweb.org/'],
  ['playground', 'https://hax.cloud/'],
  ['psu', 'https://hax.psu.edu/'],
  ['issues', 'https://github.com/haxtheweb/issues/issues'],
  ['discord', 'https://discord.gg/aCGxmRHEJP'],
  ['club', 'https://orgcentral.psu.edu/organization/hax-the-club'],
]

for (const [action, expectedUrl] of LINK_BRANCHES) {
  test(`the ${action} branch opens ${expectedUrl}`, async () => {
    resetMocks()
    const exitCode = await runParty({
      command: 'party',
      arguments: { action },
      options: { quiet: false },
    })
    assert.deepEqual(openCalls(), [expectedUrl])
    assert.ok(intros.some((m) => m.includes(`hax party ${action}`)))
    assert.equal(exitCode, 0)
  })
}

// --- party:status default branch ---

test('default action is party:status and prints quietly with --quiet', async () => {
  resetMocks()
  const exitCode = await runParty({
    command: 'party',
    arguments: {},
    options: { quiet: true, y: true },
  })
  assert.equal(openCalls().length, 0)
  assert.equal(exitCode, 0)
})

// --- quit branch via the interactive loop ---

test('the interactive loop can select quit, which exits cleanly', async () => {
  resetMocks()
  groupResponse = { action: 'quit' }
  const exitCode = await runParty({
    command: 'party',
    arguments: {},
    // no y + interactive so the loop iterates and consults p.group
    options: { quiet: true, i: true },
  })
  assert.equal(exitCode, 0)
  assert.ok(intros.some((m) => m.includes('hax party quit')))
})

// --- github branch: cloneHAXRepositories flow ---

test('the github branch clones the selected repo and runs its install commands', async () => {
  resetMocks()
  const exitCode = await runParty({
    command: 'party',
    arguments: { action: 'github' },
    options: { quiet: true, auto: true, author: 'testuser', npmClient: 'npm' },
  })
  assert.equal(exitCode, 0)
  // dependency checks: gh auth status + yarn availability
  assert.ok(execCalls.includes('gh auth status'), 'gh auth status checked')
  assert.ok(execCalls.includes('yarn --version'), 'yarn availability checked')
  // clone from the user's fork via ssh
  assert.ok(
    execCalls.includes('git clone git@github.com:testuser/webcomponents.git'),
    'clone command executed',
  )
  // webcomponents repo install sequence (the monorepo install is hardcoded
  // to yarn regardless of --npm-client)
  assert.ok(execCalls.includes('yarn global add lerna web-component-analyzer'))
  assert.ok(execCalls.some((c) => c === `cd ${process.cwd()}/webcomponents && yarn install`))
  assert.ok(spinnerMessages.some((m) => m.includes('Cloning')), 'clone spinner used')
})
