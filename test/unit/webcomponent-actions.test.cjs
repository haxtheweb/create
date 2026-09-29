'use strict'

// Covers webcomponentActions() in src/lib/programs/webcomponent.js — the
// fixed menu list behind `hax webcomponent`. Same conventions as the
// partyActions() tests. HOME is isolated BEFORE requiring webcomponent.js
// (via the canary) because it imports HAXCMS which inits a configDirectory
// on load; the canary keeps the file CI-safe when the haxcms-nodejs dist
// dep is missing.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-actions-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { probeModule } = require('../_helpers/module-canary.cjs')
const { available, skipReason, module: wcModule } = probeModule('src/lib/programs/webcomponent.js')

const { webcomponentActions } = available ? wcModule : {}

const opts = { skip: skipReason, timeout: 15000 }

// --- webcomponentActions: fixed menu list ---

test('webcomponentActions returns the expected fixed list of actions', opts, () => {
  const actions = webcomponentActions()
  assert.ok(Array.isArray(actions))
  const values = actions.map((a) => a.value)
  assert.deepEqual(values, [
    'start',
    'wc:stats',
    'wc:element',
    'wc:haxproperties',
    'wc:rename',
  ])
  for (const action of actions) {
    assert.equal(typeof action.value, 'string')
    assert.equal(typeof action.label, 'string')
    assert.ok(action.label.length > 0)
  }
})

test('webcomponentActions returns a fresh array each call (no shared state)', opts, () => {
  const a = webcomponentActions()
  const b = webcomponentActions()
  assert.notEqual(a, b)
  a.push({ value: 'mutated', label: 'mutated' })
  assert.equal(b.length, 5)
})
