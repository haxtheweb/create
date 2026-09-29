'use strict'

// Covers auditNavigator (directory walker) inside src/lib/programs/audit.js.
// It is module-private, so these tests drive it through the exported
// auditCommandDetected() entry point against real temp directory trees and
// assert which files got audited via the recorded p.intro("Auditing: X")
// calls. @clack/prompts is ESM-only (not assignable), so the shared
// clack-stub helper is installed first; console.table is captured; the
// established process.exit sentinel pattern (from webcomponent-generate
// .test.cjs) intercepts returnCode()'s exit.
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
stub.note = (msg) => { /* quiet */ }
stub.outro = (msg) => { /* quiet */ }
const tableCalls = []
const originalTable = console.table
console.table = (data) => { tableCalls.push(data) }

const { auditCommandDetected } = require('../../src/lib/programs/audit.js')

const auditedFiles = () => intros.filter((m) => m.includes('Auditing:'))

// run auditCommandDetected with the process.exit sentinel; returns exit code
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

// violating CSS so a file being audited is observable in exit codes; each
// declaration must sit on its own line ending with `;` — auditFile ignores
// everything else (one-line `div { color: red; }` matches nothing)
const VIOLATING_CSS = 'div {\n  color: red;\n}\n'
const CLEAN_CSS = 'div {\n  color: var(--ddd-theme-default-white);\n}\n'

function makeProject({ cleanRoot = false, dddignore = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-nav-'))
  fs.writeFileSync(path.join(root, 'a.css'), cleanRoot ? CLEAN_CSS : VIOLATING_CSS)
  fs.mkdirSync(path.join(root, 'sub'))
  fs.writeFileSync(path.join(root, 'sub', 'b.css'), VIOLATING_CSS)
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'c.css'), VIOLATING_CSS)
  fs.mkdirSync(path.join(root, '.git'))
  fs.writeFileSync(path.join(root, '.git', 'd.css'), VIOLATING_CSS)
  fs.mkdirSync(path.join(root, 'dist'))
  fs.writeFileSync(path.join(root, 'dist', 'e.css'), VIOLATING_CSS)
  fs.mkdirSync(path.join(root, 'public'))
  fs.writeFileSync(path.join(root, 'public', 'f.css'), VIOLATING_CSS)
  if (dddignore !== null) {
    fs.writeFileSync(path.join(root, '.dddignore'), dddignore)
  }
  return root
}

test('extension entries in .dddignore skip matching files entirely', () => {
  intros.length = 0
  const root = makeProject({ dddignore: '*.css\n# a full line comment\n' })
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.equal(auditedFiles().filter((m) => m.includes('.css')).length, 0)
    assert.equal(exitCode, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('directory entries in .dddignore prevent recursion into that directory', () => {
  intros.length = 0
  const root = makeProject({ cleanRoot: true, dddignore: '/sub\n' })
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.ok(auditedFiles().some((m) => m.includes('a.css')), 'root file audited')
    assert.ok(!auditedFiles().some((m) => m.includes('b.css')), 'ignored dir not recursed')
    assert.equal(exitCode, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('navigator recurses nested dirs but skips node_modules/.git/dist/public', () => {
  intros.length = 0
  const root = makeProject()
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.ok(auditedFiles().some((m) => m.includes('a.css')), 'root file audited')
    assert.ok(auditedFiles().some((m) => m.includes('b.css')), 'nested file audited')
    assert.ok(!auditedFiles().some((m) => m.includes('c.css')), 'node_modules skipped')
    assert.ok(!auditedFiles().some((m) => m.includes('d.css')), '.git skipped')
    assert.ok(!auditedFiles().some((m) => m.includes('e.css')), 'dist skipped')
    assert.ok(!auditedFiles().some((m) => m.includes('f.css')), 'public skipped')
    assert.equal(exitCode, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('file entries in .dddignore skip just the named file', () => {
  intros.length = 0
  const root = makeProject({ dddignore: 'a.css\n' })
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.ok(!auditedFiles().some((m) => m.includes('a.css')), 'ignored file not audited')
    assert.ok(auditedFiles().some((m) => m.includes('b.css')), 'other file still audited')
    assert.equal(exitCode, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('directory ignore is scoped to the hierarchy it was found in', () => {
  intros.length = 0
  // build: root/.dddignore ignores /sub; another .dddignore inside nested
  // folder is also interpreted (dddignoreInterpreter recurses to find it)
  const root = makeProject({ cleanRoot: true, dddignore: '/sub\n' })
  const nested = path.join(root, 'nested', 'inner')
  fs.mkdirSync(nested, { recursive: true })
  fs.writeFileSync(path.join(nested, 'g.css'), VIOLATING_CSS)
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.ok(auditedFiles().some((m) => m.includes('g.css')), 'unrelated nested dir audited')
    assert.ok(!auditedFiles().some((m) => m.includes('b.css')), 'ignored dir not recursed')
    assert.equal(exitCode, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
