'use strict'

// Isolate HOME before requiring the module (via the canary) — webcomponent.js
// imports HAXCMS.js which inits a configDirectory on load.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-test-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { probeModule } = require('../_helpers/module-canary.cjs')
const { available, skipReason, module: wcModule } = probeModule('src/lib/programs/webcomponent.js')

const {
  HAXWiring,
  getInputMethodFromType,
} = available ? wcModule : {}

const opts = { skip: skipReason, timeout: 15000 }

// --- getInputMethodFromType: pure type -> HAX inputMethod mapper ---

test('getInputMethodFromType maps primitive types to HAX input methods', opts, () => {
  assert.equal(getInputMethodFromType('string'), 'textfield')
  assert.equal(getInputMethodFromType('number'), 'number')
  assert.equal(getInputMethodFromType('boolean'), 'boolean')
})

test('getInputMethodFromType returns false for unmapped types', opts, () => {
  assert.equal(getInputMethodFromType('object'), false)
  assert.equal(getInputMethodFromType('array'), false)
  assert.equal(getInputMethodFromType(undefined), false)
  assert.equal(getInputMethodFromType(''), false)
})

// --- HAXWiring.prototypeHaxProperties: pure factory for the haxProperties shape ---

test('prototypeHaxProperties returns a valid haxProperties scaffold', opts, () => {
  const wiring = new HAXWiring()
  const props = wiring.prototypeHaxProperties()

  assert.equal(props.api, '1')
  assert.equal(props.type, 'element')
  assert.equal(props.editingElement, 'core')
  assert.equal(props.hideDefaultSettings, false)

  assert.ok(props.gizmo, 'gizmo object present')
  assert.equal(props.gizmo.title, 'Tag name')
  assert.equal(props.gizmo.icon, 'icons:android')
  assert.equal(props.gizmo.color, 'purple')
  assert.ok(Array.isArray(props.gizmo.tags), 'gizmo.tags is an array')
  assert.ok(Array.isArray(props.gizmo.handles), 'gizmo.handles is an array')

  assert.ok(props.settings, 'settings object present')
  assert.ok(Array.isArray(props.settings.configure), 'settings.configure is an array')
  assert.ok(Array.isArray(props.settings.advanced), 'settings.advanced is an array')
  assert.ok(Array.isArray(props.settings.developer), 'settings.developer is an array')
  // configure slots/properties have the required HAXSchema fields
  const firstConfigure = props.settings.configure[0]
  assert.ok(firstConfigure.slot !== undefined, 'configure entry has slot/property')
  assert.ok(firstConfigure.title, 'configure entry has a title')
  assert.ok(firstConfigure.inputMethod, 'configure entry has an inputMethod')

  assert.ok(props.saveOptions, 'saveOptions present')
  assert.ok(
    props.saveOptions.unsetAttributes.includes('end-point'),
    'saveOptions.unsetAttributes includes end-point',
  )
  assert.ok(
    props.saveOptions.unsetAttributes.includes('secondary-color'),
    'saveOptions.unsetAttributes includes secondary-color',
  )

  assert.ok(props.documentation, 'documentation present')
  assert.equal(props.documentation.howTo, 'https://haxtheweb.org/welcome')
  assert.equal(props.documentation.purpose, 'https://haxtheweb.org/welcome')
})

test('prototypeHaxProperties demoSchema ships a worked example', opts, () => {
  const props = new HAXWiring().prototypeHaxProperties()
  assert.ok(Array.isArray(props.demoSchema), 'demoSchema is an array')
  assert.equal(props.demoSchema.length, 1)
  // Known-good literal straight from the source factory
  assert.equal(props.demoSchema[0].tag, 'my-tag')
  assert.equal(props.demoSchema[0].content, '<p>inner html</p>')
  assert.equal(
    props.demoSchema[0].properties.endPoint,
    'https://cdn2.thecatapi.com/images/9j5.jpg',
  )
  assert.equal(props.demoSchema[0].properties.primaryColor, 'yellow')
  assert.equal(props.demoSchema[0].properties.title, 'A cat')
})

test('prototypeHaxProperties returns a fresh object each call (no shared state)', opts, () => {
  const a = new HAXWiring().prototypeHaxProperties()
  const b = new HAXWiring().prototypeHaxProperties()
  assert.notEqual(a, b)
  assert.notEqual(a.settings.configure, b.settings.configure)
  assert.notEqual(a.demoSchema, b.demoSchema)
  // mutating one must not affect the other
  a.gizmo.title = 'mutated'
  assert.equal(b.gizmo.title, 'Tag name')
})
