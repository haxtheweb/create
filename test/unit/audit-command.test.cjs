'use strict'

// Covers auditCommandDetected()'s top-level envelope in src/lib/programs/
// audit.js: the auditing intro, the .dddignore debug dump (commandRun.options
// .debug), the process-completed outro, and the process.cwd() default when
// no path argument is supplied. @clack/prompts is ESM-only (not assignable),
// so the shared clack-stub helper is installed first; console.table and
// console.error are captured; the process.exit sentinel intercepts
// returnCode(). checksPassed is module-level state, so the clean cases run
// before the violating one.
const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

require('@babel/register')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const test = require('node:test')
const assert = require('node:assert/strict')

const intros = []
stub.intro = (msg) => { intros.push(String(msg)) }
const notes = []
stub.note = (msg) => { notes.push(String(msg)) }
const outros = []
stub.outro = (msg) => { outros.push(String(msg)) }
const tableCalls = []
const originalTable = console.table
console.table = (data) => { tableCalls.push(data) }

const { auditCommandDetected } = require('../../src/lib/programs/audit.js')

function runAudit(commandRun, auditPath) {
  const originalExit = process.exit
  let exitCode = null
  process.exit = (code) => {
    exitCode = code
    throw new Error('__process_exit__')
  }
  try {
    assert.throws(() => auditCommandDetected(commandRun, auditPath), /__process_exit__/)
    return exitCode
  } finally {
    process.exit = originalExit
  }
}

function makeProject(css = 'div { color: var(--ddd-theme-default-white); }\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-cmd-'))
  fs.writeFileSync(path.join(root, 'styles.css'), css)
  return root
}

test('prints the auditing intro and process-completed outro for the target path', () => {
  const root = makeProject()
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.ok(intros.some((m) => m.includes('Auditing DDD Compliance')))
    assert.ok(intros.some((m) => m.includes(root)), 'intro names the project root')
    assert.ok(intros.some((m) => m.includes('styles.css')), 'per-file auditing intro recorded')
    assert.equal(outros.length, 1)
    assert.ok(outros[0].includes('Process Completed'))
    assert.ok(outros[0].includes('https://haxtheweb.org/documentation/ddd'))
    assert.ok(notes.some((n) => n.includes('No changes needed!')))
    assert.equal(exitCode, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('the debug option dumps the interpreted .dddignore via console.table', () => {
  const root = makeProject()
  fs.writeFileSync(path.join(root, '.dddignore'), [
    '/sub',              // directory entry (leading slash stripped)
    '*.png',             // extension entry (asterisk stripped)
    'notes.md # inline', // inline comment stripped
    '# full comment',    // skipped entirely
    '',
  ].join('\n'))
  fs.mkdirSync(path.join(root, 'sub'))
  tableCalls.length = 0
  try {
    const exitCode = runAudit({ options: { debug: true } }, root)
    // first table is the dddignore dump, second is the (empty) violations
    // table never happens; audit still completes with the outro
    assert.ok(tableCalls.length >= 1, 'dddignore table dumped')
    const dump = tableCalls[0]
    assert.ok(Array.isArray(dump))
    const entries = dump.map((e) => `${e.type}:${e.name}`)
    assert.ok(entries.includes('directory:sub'))
    // the interpreter strips just the `*` qualifier, so the entry name is `.png`
    assert.ok(entries.includes('extension:.png'))
    assert.ok(entries.includes('file:notes.md'))
    assert.ok(!entries.some((e) => e.includes('full comment')), 'comments dropped')
    for (const entry of dump) {
      assert.equal(entry.highestPath, root)
    }
    assert.equal(exitCode, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('uses process.cwd() when no path argument is supplied', () => {
  const root = makeProject()
  const originalCwd = process.cwd()
  try {
    process.chdir(root)
    intros.length = 0
    const exitCode = runAudit({ options: {} }, undefined)
    assert.ok(intros.some((m) => m.includes(root)), 'intro names cwd as the root')
    assert.equal(exitCode, 0)
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a violating file under the audited path exits 1 after the outro', () => {
  const root = makeProject('div {\n  margin: 10px;\n}\n')
  tableCalls.length = 0
  outros.length = 0
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.equal(outros.length, 1)
    assert.equal(exitCode, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
