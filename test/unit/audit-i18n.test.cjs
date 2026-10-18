'use strict'

// Covers src/lib/programs/audit-i18n.js: finding English hardcoded in Lit
// templates, what counts as translatable, opt-outs (i18n-ignore comments,
// .i18nignore), file discovery and the report (text and --format json).
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
  findHardcodedStrings,
  translatableText,
  discoverI18nTargets,
  i18nignoreInterpreter,
  auditI18nCommand,
} = require('../../src/lib/programs/audit-i18n.js')

function write(root, rel, content) {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
  return full
}

const texts = (src) => findHardcodedStrings(src).findings.map((f) => f.text)

test('flags literal text nodes in html templates', () => {
  const src = 'const t = html`<div>\n  <h2>Settings</h2>\n  <p>${this.t.ok}</p>\n</div>`;'
  const { findings, error } = findHardcodedStrings(src)
  assert.equal(error, null)
  assert.equal(findings.length, 1)
  assert.deepEqual(findings[0], { line: 2, column: 7, kind: 'text', text: 'Settings' })
})

test('flags literal user-facing attributes, not bound ones', () => {
  const src = [
    'class X { render() { return html`',
    '<button aria-label="Close dialog" title=${this.t.close}></button>',
    '<input placeholder=\'Search sites\' .value=${v}>',
    '<img alt="${this.t.logo}" src="logo.png">',
    '<div class="card-title" data-label="Not checked"></div>',
    '`; } }',
  ].join('\n')
  const found = findHardcodedStrings(src).findings
  assert.deepEqual(found.map((f) => [f.attribute, f.text]), [
    ['aria-label', 'Close dialog'],
    ['placeholder', 'Search sites'],
  ])
})

test('flags text next to bindings', () => {
  assert.deepEqual(texts('html`<p>${count} results found</p>`'), ['results found'])
  assert.deepEqual(texts('html`<p>Hello ${name}</p>`'), ['Hello'])
  assert.deepEqual(texts('html`<a title="Edit ${name}">x</a>`'), ['Edit'])
})

test('ignores CSS, code samples, comments and non-html templates', () => {
  const src = [
    'const a = css`.x { content: "Hello there"; }`;',
    'const b = `<p>Plain template string</p>`;',
    'const c = html`<style>.y::after { content: "Words here"; }</style>',
    '<pre>Example output text</pre><code>npm install thing</code>',
    '<!-- a comment with words -->`;',
  ].join('\n')
  assert.deepEqual(texts(src), [])
})

test('supports member-expression html tags', () => {
  assert.deepEqual(texts('lit.html`<span>Loading</span>`'), ['Loading'])
})

test('translatableText skips things that are not prose', () => {
  for (const value of ['', ' ', 'x', '42', '…', '&nbsp;', ':', 'hax:wizard-hat', 'https://hax.psu.edu',
    './file.js', 'image.png', '--ddd-spacing-4', 'my-element', 'a { color: red; }']) {
    assert.equal(translatableText(value), null, value)
  }
  assert.equal(translatableText('  Save   changes '), 'Save changes')
  assert.equal(translatableText('Enregistrer'), 'Enregistrer')
  assert.equal(translatableText('保存する'), '保存する')
})

test('i18n-ignore on the line or the line above skips a finding', () => {
  const src = [
    'html`',
    '<span>BibTeX</span><!-- i18n-ignore -->',
    '<hr>',
    '<span>Real text</span>',
    '`;',
    '// i18n-ignore: brand name',
    'html`<b>HAXcms</b>`;',
  ].join('\n')
  assert.deepEqual(texts(src), ['Real text'])
  assert.deepEqual(texts('/* i18n-ignore-file */\nhtml`<p>Anything</p>`'), [])
})

test('reports a parse error instead of throwing', () => {
  const r = findHardcodedStrings('html`<p>x</p>`; this is not javascript {')
  assert.equal(r.findings.length, 0)
  assert.ok(r.error)
})

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-i18n-'))
  write(root, 'my-el.js', 'export class MyEl { render() { return html`<p>Hardcoded</p>`; } }')
  write(root, 'lib/clean.js', 'export const r = () => html`<p>${this.t.ok}</p>`;')
  write(root, 'lib/skip-me.js', 'html`<p>Skipped by file rule</p>`;')
  write(root, 'samples/page.js', 'html`<p>Skipped by directory rule</p>`;')
  write(root, 'other.min.js', 'html`<p>Skipped by extension rule</p>`;')
  write(root, '.i18nignore', '/samples\n*.min.js\nskip-me.js # generated\n')
  write(root, 'node_modules/pkg/index.js', 'html`<p>Dependency</p>`;')
  write(root, 'test/my-el.test.js', 'html`<p>Test</p>`;')
  write(root, 'demo/index.js', 'html`<p>Demo</p>`;')
  write(root, 'my-el.stories.js', 'html`<p>Story</p>`;')
  write(root, 'rollup.config.js', 'export default {}')
  return root
}

test('discoverI18nTargets skips build output, tests, demos and .i18nignore rules', () => {
  const root = makeProject()
  const rules = i18nignoreInterpreter(root)
  assert.deepEqual(rules.map((r) => [r.type, r.name]), [
    ['directory', 'samples'],
    ['extension', '.min.js'],
    ['file', 'skip-me.js'],
  ])
  const files = discoverI18nTargets(root).map((f) => path.relative(root, f)).sort()
  assert.deepEqual(files, ['lib/clean.js', 'my-el.js'])
})

test('auditI18nCommand reports findings and fails', () => {
  const root = makeProject()
  logs.length = 0
  const r = auditI18nCommand({ options: {} }, root)
  assert.equal(r.passed, false)
  assert.equal(r.files, 2)
  assert.deepEqual(r.findings, [{ file: 'my-el.js', line: 1, column: 47, kind: 'text', text: 'Hardcoded' }])
  assert.ok(logs.some(([k, m]) => k === 'error' && m.includes('my-el.js')))
  assert.ok(logs.some(([k, m]) => k === 'message' && m.includes('"Hardcoded"')))
  assert.ok(logs.some(([k, m]) => k === 'outro' && m.includes('1 hardcoded string(s)')))
})

test('auditI18nCommand passes a clean project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-i18n-clean-'))
  write(root, 'el.js', 'html`<p>${this.t.hello}</p>`;')
  logs.length = 0
  const r = auditI18nCommand({ options: {} }, root)
  assert.equal(r.passed, true)
  assert.ok(logs.some(([k, m]) => k === 'outro' && m.includes('No hardcoded text in 1 file(s)')))
})

test('auditI18nCommand --format json writes one JSON report', () => {
  const root = makeProject()
  let out = ''
  logs.length = 0
  const r = auditI18nCommand({ options: { format: 'json' } }, root, { write: (s) => { out += s } })
  const parsed = JSON.parse(out)
  assert.equal(parsed.passed, false)
  assert.equal(parsed.files, 2)
  assert.equal(parsed.findings[0].text, 'Hardcoded')
  assert.deepEqual(parsed.errors, [])
  assert.equal(r.passed, false)
  assert.equal(logs.length, 0)
})
