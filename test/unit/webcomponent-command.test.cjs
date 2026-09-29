'use strict'

// Covers webcomponentCommandDetected() in src/lib/programs/webcomponent.js
// for a handful of self-contained branches (the full interactive switch is
// intentionally not exhaustively unit tested — the giant loops stay covered
// by the smoke tests): wc:stats (custom-elements.json reading), wc:element
// (name validation + template copy + ejs render), start / serve (npm
// script execution), and quit via the interactive loop. HOME is isolated
// before the canary (webcomponent.js imports HAXCMS); @clack/prompts is
// patched via the shared clack stub; utils.exec is monkey-patched so no
// real npm subprocesses run; the log() import is silenced; and process.exit
// is intercepted per test with the established sentinel pattern.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-command-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const intros = []
stub.intro = (msg) => { intros.push(String(msg)) }
const notes = []
stub.note = (msg) => { notes.push(String(msg)) }
stub.outro = (msg) => { /* quiet */ }
stub.cancel = (msg) => { /* quiet */ }
const spinnerMessages = []
stub.spinner = () => ({
  start(msg) { spinnerMessages.push(String(msg)) },
  stop(msg) { /* quiet */ },
})
let groupResponse = { action: 'quit' }
stub.group = async () => groupResponse
stub.text = async () => 'placeholder-name'
stub.select = async () => null
stub.confirm = async () => true

// silence structured logging output
const logging = require('../../src/lib/logging.js')
logging.log = () => {}

// no real npm subprocesses (module-load `which git` probe included)
const utils = require('../../src/lib/utils.js')
const execCalls = []
utils.exec = async (cmd) => {
  execCalls.push(cmd)
  return { stdout: '', stderr: '' }
}

const { probeModule } = require('../_helpers/module-canary.cjs')
const { available, skipReason, module: wcModule } = probeModule('src/lib/programs/webcomponent.js')
const { webcomponentCommandDetected } = available ? wcModule : {}

execCalls.length = 0

const opts = { skip: skipReason, timeout: 20000 }

async function runWebcomponent(commandRun, packageData = {}) {
  const originalExit = process.exit
  const exitCodes = []
  process.exit = (code) => {
    exitCodes.push(code)
    // Throw only on the terminal exit(0) outside the source's per-case
    // try/catch blocks — a mid-case exit(1) sentinel would be swallowed by
    // the case's own catch and continue running.
    if (code === 0) {
      throw new Error('__process_exit__')
    }
  }
  try {
    await assert.rejects(
      () => webcomponentCommandDetected(commandRun, packageData),
      /__process_exit__/,
    )
    return exitCodes
  } finally {
    process.exit = originalExit
  }
}

function resetMocks() {
  execCalls.length = 0
  intros.length = 0
  notes.length = 0
  spinnerMessages.length = 0
  groupResponse = { action: 'quit' }
}

// --- wc:stats / wc:status: reads custom-elements.json ---

test('wc:stats reports title, description, modules, and superclasses', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-stats-'))
  const originalCwd = process.cwd()
  try {
    fs.writeFileSync(
      path.join(root, 'custom-elements.json'),
      JSON.stringify({
        modules: [
          {
            path: 'lib/my-test-el.js',
            declarations: [
              {
                tagName: 'my-test-el',
                name: 'MyTestEl',
                superclass: { name: 'LitElement' },
              },
            ],
          },
          {
            path: 'lib/other-el.js',
            declarations: [
              {
                tagName: 'other-el',
                name: 'OtherEl',
                superclass: { name: 'LitElement' },
              },
            ],
          },
        ],
      }),
    )
    process.chdir(root)
    const exitCode = await runWebcomponent(
      { arguments: { action: 'wc:stats' }, options: { quiet: false, i: true } },
      {
        name: 'stats-pkg',
        description: 'a stats package',
        repository: { url: 'https://github.com/tester/stats-pkg' },
        scripts: {},
      },
    )
    assert.deepEqual(exitCode, [0])
    assert.ok(intros.some((m) => m.includes('Title: stats-pkg')), 'title intro')
    assert.ok(intros.some((m) => m.includes('Description: a stats package')), 'description intro')
    assert.ok(intros.some((m) => m.includes('Git: https://github.com/tester/stats-pkg')), 'git intro')
    assert.ok(intros.some((m) => m.includes('my-test-el.js')), 'modules intro')
    assert.ok(intros.some((m) => m.includes('Number of modules: 2')), 'module count intro')
    assert.ok(intros.some((m) => m.includes('LitElement')), 'superclass intro')
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('wc:stats stays quiet when --quiet is set', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-stats-quiet-'))
  const originalCwd = process.cwd()
  try {
    process.chdir(root)
    const exitCode = await runWebcomponent(
      { arguments: { action: 'wc:stats' }, options: { quiet: true, i: true } },
      { name: 'quiet-pkg', scripts: {} },
    )
    assert.deepEqual(exitCode, [0])
    assert.ok(!intros.some((m) => m.includes('Title:')), 'no title intro when quiet')
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// --- wc:element: name validation, template copy, ejs render ---

test('wc:element with a valid --name writes the rendered element file', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-element-'))
  const originalCwd = process.cwd()
  try {
    process.chdir(root)
    const exitCode = await runWebcomponent(
      { arguments: { action: 'wc:element' }, options: { name: 'brand-new-el', quiet: true, i: true } },
      { name: 'host-pkg', version: '1.0.0' },
    )
    assert.deepEqual(exitCode, [0])
    const elementPath = path.join(root, 'brand-new-el.js')
    assert.ok(fs.existsSync(elementPath), 'element file written')
    const content = fs.readFileSync(elementPath, 'utf8')
    assert.ok(content.includes('brand-new-el'), 'name rendered into the file')
    assert.ok(content.includes('BrandNewEl'), 'className rendered into the file')
    assert.ok(notes.some((n) => n.includes('Add to another web component')), 'usage note recorded')
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('wc:element rejects an invalid --name and calls exit with 1', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-element-bad-'))
  const originalCwd = process.cwd()
  try {
    process.chdir(root)
    const exitCodes = await runWebcomponent(
      { arguments: { action: 'wc:element' }, options: { name: 'BAD NAME', quiet: true, i: true } },
      { name: 'host-pkg', version: '1.0.0' },
    )
    // the validation branch reported the name problem and requested exit(1);
    // the recorded sequence ends with the loop's terminal exit(0)
    assert.ok(exitCodes.includes(1), `exit codes: ${exitCodes.join(',')}`)
    assert.equal(exitCodes[exitCodes.length - 1], 0)
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// --- start: install (if node_modules missing) then start ---

test('start installs dependencies first when node_modules is missing', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-start-'))
  const originalCwd = process.cwd()
  try {
    process.chdir(root)
    const exitCode = await runWebcomponent(
      { arguments: { action: 'start' }, options: { quiet: false, i: true, npmClient: 'npm' } },
      { name: 'start-pkg', scripts: {} },
    )
    assert.deepEqual(exitCode, [0])
    assert.ok(execCalls.includes('npm install'), 'install ran')
    assert.ok(execCalls.includes('npm start'), 'start ran')
    assert.ok(notes.some((n) => n.includes('sub-process daemon')), 'launch note recorded')
    assert.ok(spinnerMessages.some((m) => m.includes('Installation magic')), 'install spinner')
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// --- serve: with and without a serve script ---

test('serve runs the serve script when one exists', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-serve-'))
  const originalCwd = process.cwd()
  try {
    process.chdir(root)
    const exitCode = await runWebcomponent(
      { arguments: { action: 'serve' }, options: { quiet: false, i: true, npmClient: 'yarn' } },
      { name: 'serve-pkg', scripts: { serve: 'webpack serve' } },
    )
    assert.deepEqual(exitCode, [0])
    assert.ok(execCalls.includes('yarn run serve'), 'serve script ran')
    assert.ok(notes.some((n) => n.includes('development mode')), 'serve note recorded')
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('serve falls back to the start script when no serve script exists', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-serve-fallback-'))
  const originalCwd = process.cwd()
  try {
    process.chdir(root)
    const exitCode = await runWebcomponent(
      { arguments: { action: 'serve' }, options: { quiet: false, i: true, npmClient: 'npm' } },
      { name: 'no-serve-pkg', scripts: {} },
    )
    assert.deepEqual(exitCode, [0])
    assert.ok(execCalls.includes('npm start'), 'start fallback ran')
    assert.ok(!execCalls.includes('npm run serve'), 'no serve script invocation')
    assert.ok(notes.some((n) => n.includes('No')), 'fallback note recorded')
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// --- quit via the interactive loop ---

test('the interactive loop can select quit, which exits cleanly', opts, async () => {
  resetMocks()
  groupResponse = { action: 'quit' }
  const exitCode = await runWebcomponent(
    { arguments: {}, options: { quiet: true, i: true } },
    {},
  )
  assert.deepEqual(exitCode, [0])
  assert.ok(intros.some((m) => m.includes('hax wc quit')), 'quit intro recorded')
})
