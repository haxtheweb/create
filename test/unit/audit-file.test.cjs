'use strict'

// Covers auditFile (per-file CSS line auditor) inside src/lib/programs/
// audit.js. It is module-private, so these tests drive it through the
// exported auditCommandDetected() against fixture CSS files and assert the
// data[] rows that reach console.table (line number, CSS property, current
// attribute, and the suggested DDD replacement from the helpAudit* mappers
// that are already unit tested in audit-helpers.test.cjs). console.table is
// captured; @clack/prompts output is silenced via the shared clack stub;
// the process.exit sentinel intercepts returnCode(). NOTE: checksPassed is
// module-level state, so the clean-file test runs first.
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
stub.outro = (msg) => { /* quiet */ }
const tableCalls = []
const originalTable = console.table
console.table = (data) => { tableCalls.push(data) }

const { auditCommandDetected } = require('../../src/lib/programs/audit.js')

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

function makeProject(css) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-file-'))
  fs.writeFileSync(path.join(root, 'styles.css'), css)
  return root
}

// fixture with exactly one violation per audited category, unique lines so
// lines.indexOf() line numbers stay stable, plus one compliant ddd-var value
const VIOLATING_CSS = [
  ':host {',
  '  border: 2px solid grey;',
  '  border-width: 3px;',
  '  box-shadow: 10px 10px;',
  '  color: red;',
  '  font-family: Roboto;',
  '  font-size: 22px;',
  '  font-weight: 400;',
  '  letter-spacing: 0.1px;',
  '  line-height: 140%;',
  '  border-radius: 4px;',
  '  margin: 12px;',
  '  background-color: var(--ddd-theme-default-white);',
  '}',
].join('\n')

test('a compliant file produces no table rows and reports no changes needed', () => {
  const root = makeProject('div { color: var(--ddd-theme-default-white); padding: var(--ddd-spacing-4); }\n')
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.equal(tableCalls.length, 0)
    assert.ok(notes.some((n) => n.includes('No changes needed!')))
    assert.equal(exitCode, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('violating CSS is reported per line with the suggested DDD replacement', () => {
  tableCalls.length = 0
  notes.length = 0
  const root = makeProject(VIOLATING_CSS)
  try {
    const exitCode = runAudit({ options: {} }, root)
    assert.equal(tableCalls.length, 1)
    const rows = tableCalls[0]
    assert.equal(rows.length, 11)

    const byProperty = {}
    for (const row of rows) {
      byProperty[row['CSS Property']] = row
    }
    // one row per category with expected suggestion + 1-indexed line number
    assert.equal(byProperty['border']['Suggested Replacement Attribute'], '--ddd-border-sm')
    assert.equal(byProperty['border']['Line Number'], 2)
    assert.equal(byProperty['border-width']['Suggested Replacement Attribute'], '--ddd-border-size-md')
    assert.equal(byProperty['border-width']['Line Number'], 3)
    assert.equal(byProperty['box-shadow']['Suggested Replacement Attribute'], '--ddd-boxShadow-lg')
    assert.equal(byProperty['box-shadow']['Line Number'], 4)
    assert.equal(byProperty['color']['Suggested Replacement Attribute'], '--ddd-theme-default-original87Pink')
    assert.equal(byProperty['color']['Line Number'], 5)
    assert.equal(byProperty['color']['Current Attribute'], 'red')
    assert.equal(byProperty['font-family']['Suggested Replacement Attribute'], '--ddd-font-primary')
    assert.equal(byProperty['font-family']['Line Number'], 6)
    assert.equal(byProperty['font-size']['Suggested Replacement Attribute'], '--ddd-font-size-xs')
    assert.equal(byProperty['font-size']['Line Number'], 7)
    assert.equal(byProperty['font-weight']['Suggested Replacement Attribute'], '--ddd-font-weight-regular')
    assert.equal(byProperty['font-weight']['Line Number'], 8)
    assert.equal(byProperty['letter-spacing']['Suggested Replacement Attribute'], '--ddd-ls-20-sm')
    assert.equal(byProperty['letter-spacing']['Line Number'], 9)
    assert.equal(byProperty['line-height']['Suggested Replacement Attribute'], '--ddd-lh-140')
    assert.equal(byProperty['line-height']['Line Number'], 10)
    assert.equal(byProperty['border-radius']['Suggested Replacement Attribute'], '--ddd-radius-xs')
    assert.equal(byProperty['border-radius']['Line Number'], 11)
    assert.equal(byProperty['margin']['Suggested Replacement Attribute'], '--ddd-spacing-3')
    assert.equal(byProperty['margin']['Line Number'], 12)
    // values already using ddd vars are not reported
    assert.equal(byProperty['background-color'], undefined)
    assert.equal(exitCode, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('non-CSS declarations that lack the `prop: value;` shape are ignored', () => {
  tableCalls.length = 0
  notes.length = 0
  const root = makeProject('const nothing = 1;\n@import url("./x.css");\n/* comment: not a rule; */\n')
  try {
    runAudit({ options: {} }, root)
    assert.equal(tableCalls.length, 0)
    assert.ok(notes.some((n) => n.includes('No changes needed!')))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// haxtheweb/issues#3119: hard-coded paint colors used to pass the audit
test('fill / stroke / background with color literals are reported; tokens and keywords are not', () => {
  tableCalls.length = 0
  notes.length = 0
  const root = makeProject([
    ':host {',
    '  fill: #000;',
    '  stroke: currentColor;',
    '  background: #ffffff;',
    '  background: none;',
    '  background: var(--ddd-theme-default-white);',
    '}',
  ].join('\n'))
  try {
    runAudit({ options: {} }, root)
    assert.equal(tableCalls.length, 1)
    const rows = tableCalls[0]
    assert.deepEqual(rows.map((r) => [r['Line Number'], r['CSS Property']]), [[2, 'fill'], [4, 'background']])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
