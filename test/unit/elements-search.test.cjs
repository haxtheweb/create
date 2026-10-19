'use strict'

// haxtheweb/issues#3119: `hax wc --search` over the webcomponents elements
// catalog (searchElementsCatalog / loadElementsCatalog in webcomponent.js).
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-search-test-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { probeModule } = require('../_helpers/module-canary.cjs')
const { available, skipReason, module: wcModule } = probeModule('src/lib/programs/webcomponent.js')
const { searchElementsCatalog, searchElementsCatalogPartial, elementsSearchCommand, loadElementsCatalog } = available ? wcModule : {}

const opts = { skip: skipReason, timeout: 15000 }

const CATALOG = {
  preferred: [{ tag: 'simple-fields-field', useFor: 'form inputs instead of raw <input>' }],
  elements: [
    { tag: 'paper-input-flagged', title: '', description: 'feedback on input', tags: [], type: 'element' },
    { tag: 'simple-fields-field', title: '', description: 'HTML inputs with label and validation', tags: [], type: 'element' },
    { tag: 'simple-tooltip', title: '', description: 'a simple tooltip', tags: [], type: 'element' },
    { tag: 'ddd-steps-list', title: 'Steps list', description: 'Numerical steps', tags: ['Content', 'list', 'step'], type: 'grid' },
  ],
}

test('searchElementsCatalog ranks preferred and tag matches first', opts, () => {
  const results = searchElementsCatalog(CATALOG, 'input')
  assert.deepEqual(results.map((r) => r.tag), ['simple-fields-field', 'paper-input-flagged'])
  assert.equal(results[0].preferred, 'form inputs instead of raw <input>')
})

test('searchElementsCatalog requires every term and matches gizmo tags', opts, () => {
  assert.deepEqual(searchElementsCatalog(CATALOG, 'steps list').map((r) => r.tag), ['ddd-steps-list'])
  assert.deepEqual(searchElementsCatalog(CATALOG, 'tooltip input'), [])
  assert.deepEqual(searchElementsCatalog(CATALOG, ''), [])
  assert.equal(searchElementsCatalog(CATALOG, 'simple', 1).length, 1)
})

test('loadElementsCatalog reads HAX_ELEMENTS_CATALOG and falls back to the bundled registry', opts, async () => {
  const previous = process.env.HAX_ELEMENTS_CATALOG
  const file = path.join(ISOLATED_HOME, 'catalog.json')
  fs.writeFileSync(file, JSON.stringify(CATALOG))
  try {
    process.env.HAX_ELEMENTS_CATALOG = file
    const loaded = await loadElementsCatalog()
    assert.equal(loaded.source, file)
    assert.equal(loaded.catalog.elements.length, 4)
    process.env.HAX_ELEMENTS_CATALOG = path.join(ISOLATED_HOME, 'missing.json')
    const fallback = await loadElementsCatalog()
    assert.ok(fallback.fallbackReason, 'reports why it fell back')
    assert.match(fallback.source, /wc-registry/)
  } finally {
    if (previous === undefined) {
      delete process.env.HAX_ELEMENTS_CATALOG
    } else {
      process.env.HAX_ELEMENTS_CATALOG = previous
    }
  }
})

test('searchElementsCatalogPartial matches any term and ranks more matched terms first', opts, () => {
  // strict search finds nothing for a descriptive phrase...
  assert.deepEqual(searchElementsCatalog(CATALOG, 'tooltip steps'), [])
  // ...partial still surfaces the nearest elements
  const results = searchElementsCatalogPartial(CATALOG, 'tooltip steps')
  assert.deepEqual(results.map((r) => r.tag).sort(), ['ddd-steps-list', 'simple-tooltip'])
  assert.ok(results.every((r) => r.matchedTerms === 1))
  const ranked = searchElementsCatalogPartial(CATALOG, 'inputs validation list')
  assert.equal(ranked[0].tag, 'simple-fields-field', 'two matched terms outrank one')
  assert.equal(ranked[0].matchedTerms, 2)
  assert.deepEqual(searchElementsCatalogPartial(CATALOG, ''), [])
  assert.deepEqual(searchElementsCatalogPartial(CATALOG, 'zzzz qqqq'), [])
})

test('hax wc --search falls back to labeled partial matches for multi-word queries only', opts, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-search-partial-'))
  const file = path.join(dir, 'catalog.json')
  fs.writeFileSync(file, JSON.stringify(CATALOG))
  const previous = process.env.HAX_ELEMENTS_CATALOG
  process.env.HAX_ELEMENTS_CATALOG = file
  const lines = []
  const originalLog = console.log
  console.log = (...args) => lines.push(args.join(' '))
  try {
    const partial = await elementsSearchCommand({ options: { search: 'tooltip steps', quiet: true } })
    assert.deepEqual(partial.map((r) => r.tag).sort(), ['ddd-steps-list', 'simple-tooltip'])
    assert.match(lines.join('\n'), /No element matches every word in "tooltip steps"/)

    lines.length = 0
    const single = await elementsSearchCommand({ options: { search: 'zzzz', quiet: true } })
    assert.deepEqual(single, [], 'single-word queries are not widened')
    assert.match(lines.join('\n'), /No existing elements match "zzzz"/)

    lines.length = 0
    const strict = await elementsSearchCommand({ options: { search: 'steps list', quiet: true } })
    assert.deepEqual(strict.map((r) => r.tag), ['ddd-steps-list'])
    assert.match(lines.join('\n'), /Existing elements matching "steps list"/, 'strict hits keep the normal heading')
  } finally {
    console.log = originalLog
    if (previous === undefined) delete process.env.HAX_ELEMENTS_CATALOG
    else process.env.HAX_ELEMENTS_CATALOG = previous
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
