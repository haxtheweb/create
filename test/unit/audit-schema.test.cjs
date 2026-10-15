'use strict'

// Covers src/lib/programs/audit-schema.js: target discovery, the schema
// audit report (pass / fail / --strict / --format json) with an injected
// validator runner, local validator resolution, and `hax audit [type]`
// routing. No validator packages are needed: runValidator is injected.
const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

require('@babel/register')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const logs = []
stub.intro = (m) => logs.push(['intro', String(m)])
stub.outro = (m) => logs.push(['outro', String(m)])
stub.note = (m) => logs.push(['note', String(m)])
stub.log = {
  success: (m) => logs.push(['success', String(m)]),
  error: (m) => logs.push(['error', String(m)]),
  message: (m) => logs.push(['message', String(m)]),
  warn: (m) => logs.push(['warn', String(m)]),
  info: (m) => logs.push(['info', String(m)]),
}

const {
  discoverSchemaTargets,
  auditSchemaCommand,
  runAuditCommand,
  resolveLocalValidator,
  SCHEMA_VALIDATORS,
} = require('../../src/lib/programs/audit-schema.js')

function write(root, rel, content) {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content))
  return full
}

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-schema-'))
  write(root, 'site.json', { id: 'x', title: 'x', items: [] })
  write(root, '_config/skeletons/course.json', { meta: {}, site: {}, build: { items: [] } })
  write(root, 'custom/lib/my-el.haxProperties.json', { settings: { configure: [] } })
  write(root, 'custom/locales/my-el.es.haxProperties.json', {})
  write(root, 'appstore.json', { status: 200 })
  write(root, 'custom/my-el.js', 'SuperDaemonInstance.defineOption({ title: "x" })')
  write(root, 'custom/other.js', 'export const nothing = 1')
  write(root, 'node_modules/pkg/lib/ignored.haxProperties.json', {})
  write(root, 'dist/appstore.json', {})
  write(root, 'test/fixtures.test.js', 'el.defineOption({ broken: true })')
  return root
}

test('discoverSchemaTargets groups files by validator and skips build output', () => {
  const root = makeProject()
  try {
    const t = discoverSchemaTargets(root)
    const rel = (list) => list.map((f) => path.relative(root, f)).sort()
    assert.deepEqual(rel(t.site), ['site.json'])
    assert.deepEqual(rel(t.skeleton), [path.join('_config', 'skeletons', 'course.json')])
    assert.deepEqual(rel(t.haxProperties), [path.join('custom', 'lib', 'my-el.haxProperties.json'), path.join('custom', 'locales', 'my-el.es.haxProperties.json')])
    // locale overlays are not demoSchema sources
    assert.deepEqual(rel(t.demoSchema), [path.join('custom', 'lib', 'my-el.haxProperties.json')])
    assert.deepEqual(rel(t.appstore), ['appstore.json'])
    assert.deepEqual(rel(t.merlin), [path.join('custom', 'my-el.js')])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function fakeRunner(byKind) {
  const calls = []
  const run = (kind, files) => {
    calls.push({ kind, files })
    return byKind[kind] || { ok: true, via: 'local', reports: files.map((file) => ({ file, errors: [], warnings: [] })) }
  }
  return { run, calls }
}

test('auditSchemaCommand passes when every validator reports no errors', () => {
  const root = makeProject()
  try {
    logs.length = 0
    const { run, calls } = fakeRunner({})
    const r = auditSchemaCommand({ options: {} }, root, { runValidator: run })
    assert.equal(r.passed, true)
    assert.deepEqual(calls.map((c) => c.kind).sort(), Object.keys(SCHEMA_VALIDATORS).sort())
    assert.ok(logs.some(([k, m]) => k === 'outro' && m.includes('passed')))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('auditSchemaCommand fails on errors, and on warnings only with --strict', () => {
  const root = makeProject()
  try {
    const withWarning = { appstore: { ok: true, via: 'local', reports: [{ file: path.join(root, 'appstore.json'), errors: [], warnings: [{ path: '/x', message: 'w' }] }] } }
    assert.equal(auditSchemaCommand({ options: {} }, root, { runValidator: fakeRunner(withWarning).run }).passed, true)
    assert.equal(auditSchemaCommand({ options: { strict: true } }, root, { runValidator: fakeRunner(withWarning).run }).passed, false)
    logs.length = 0
    const withError = { site: { ok: true, via: 'local', reports: [{ file: path.join(root, 'site.json'), errors: [{ path: '/items/0/parent', message: 'parent "x" does not match any item id' }], warnings: [] }] } }
    const r = auditSchemaCommand({ options: {} }, root, { runValidator: fakeRunner(withError).run })
    assert.equal(r.passed, false)
    assert.ok(logs.some(([k, m]) => k === 'message' && m.includes('site.json /items/0/parent')))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a validator that cannot run counts as a failure with its reason', () => {
  const root = makeProject()
  try {
    logs.length = 0
    const unavailable = { merlin: { ok: false, via: 'npx', error: 'could not run @haxtheweb/merlin-schema through npx' } }
    const r = auditSchemaCommand({ options: {} }, root, { runValidator: fakeRunner(unavailable).run })
    assert.equal(r.passed, false)
    assert.ok(logs.some(([k, m]) => k === 'error' && m.includes('could not run @haxtheweb/merlin-schema')))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('--format json writes one parseable summary and no prompts output', () => {
  const root = makeProject()
  try {
    logs.length = 0
    let written = ''
    auditSchemaCommand({ options: { format: 'json' } }, root, { runValidator: fakeRunner({}).run, write: (t) => { written += t } })
    const parsed = JSON.parse(written)
    assert.equal(parsed.passed, true)
    assert.equal(parsed.results.site.files, 1)
    assert.equal(logs.length, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('resolveLocalValidator finds a package bin next to the audited project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-resolve-'))
  try {
    write(root, 'node_modules/@haxtheweb/hax-schema/package.json', { name: '@haxtheweb/hax-schema', bin: { 'haxproperties-validate': 'scripts/validate.js' } })
    write(root, 'node_modules/@haxtheweb/hax-schema/scripts/validate.js', '')
    const found = resolveLocalValidator('@haxtheweb/hax-schema', 'haxproperties-validate', [path.join(root, 'noop.js')])
    assert.equal(found, path.join(root, 'node_modules', '@haxtheweb', 'hax-schema', 'scripts', 'validate.js'))
    assert.equal(resolveLocalValidator('@haxtheweb/not-installed', 'x', [path.join(root, 'noop.js')]), null)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('runAuditCommand routes ddd, schema and all', () => {
  const calls = []
  const deps = {
    auditDDD: (cr, p, exit) => { calls.push(['ddd', exit]); return exit === false ? true : 'ddd-exited' },
    auditSchema: () => { calls.push(['schema']); return { passed: false } },
    exit: (code) => code,
  }
  assert.equal(runAuditCommand({ arguments: {} , options: {} }, null, '/x', deps), 'ddd-exited')
  assert.deepEqual(calls.pop(), ['ddd', undefined])
  assert.equal(runAuditCommand({ arguments: { type: 'schema' }, options: {} }, null, '/x', deps), 1)
  calls.length = 0
  assert.equal(runAuditCommand({ arguments: { type: 'all' }, options: {} }, null, '/x', deps), 1)
  assert.deepEqual(calls, [['ddd', false], ['schema']])
  const origError = console.error
  console.error = () => {}
  try {
    assert.equal(runAuditCommand({ arguments: { type: 'nope' }, options: {} }, null, '/x', deps), 1)
  } finally {
    console.error = origError
  }
})
