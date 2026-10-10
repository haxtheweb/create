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
const { searchElementsCatalog, loadElementsCatalog } = available ? wcModule : {}

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
