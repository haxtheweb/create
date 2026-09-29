'use strict'

// Covers returnCode() inside src/lib/programs/audit.js — the automation exit
// code (0 = DDD compliant, 1 = not compliant) that ends every audit run. It is
// module-private, so these tests drive it through the exported
// auditCommandDetected() entry point using the established process.exit
// sentinel pattern (reassign process.exit, throw a sentinel error, restore in
// finally) from webcomponent-generate.test.cjs. checksPassed is module-level
// state, so the compliant case runs before the non-compliant one.
const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

require('@babel/register')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const test = require('node:test')
const assert = require('node:assert/strict')

stub.intro = (msg) => { /* quiet */ }
stub.note = (msg) => { /* quiet */ }
stub.outro = (msg) => { /* quiet */ }
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

test('compliant project exits with code 0', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-rc-ok-'))
  fs.writeFileSync(path.join(root, 'styles.css'), 'div { color: var(--ddd-theme-default-white); }\n')
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.equal(exitCode, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('non-compliant project exits with code 1 after reporting violations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-rc-bad-'))
  fs.writeFileSync(path.join(root, 'styles.css'), 'div {\n  color: red;\n}\n')
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.ok(tableCalls.length >= 1, 'violation table was reported')
    assert.equal(exitCode, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
