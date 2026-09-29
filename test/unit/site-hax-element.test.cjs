'use strict'

// Covers nodeToHaxElement() in src/lib/programs/site.js (exported for
// testability) — the @fork of the hax core util that converts DOM nodes into
// HAX element schema objects. Tested against plain fake node objects shaped
// like node-html-parser nodes (getAttribute / tagName / _attrs / innerHTML)
// plus __data property maps, which avoids any real DOM API differences.
// HOME is isolated before the canary because site.js imports HAXCMS which
// inits a configDirectory on load.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-element-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')
const { nodeToHaxElement } = available ? siteModule : {}

const opts = { skip: skipReason, timeout: 15000 }

test('returns null for a null node', opts, async () => {
  assert.equal(await nodeToHaxElement(null), null)
})

test('maps style/class/id attributes and strips hax-active from the class', opts, async () => {
  const node = {
    tagName: 'my-el',
    getAttribute(attr) {
      if (attr === 'style') return 'color: red;'
      if (attr === 'class') return 'hax-active bold'
      if (attr === 'id') return 'el1'
      return undefined
    },
    __data: {},
    _attrs: {},
    innerHTML: 'inner stuff',
    innerText: '',
  }
  const element = await nodeToHaxElement(node)
  assert.equal(element.tag, 'my-el')
  assert.equal(element.properties.style, 'color: red;')
  assert.equal(element.properties.class, ' bold')
  assert.equal(element.properties.id, 'el1')
  assert.equal(element.content, 'inner stuff')
  assert.equal(element.eventName, 'insert-element')
})

test('deletes a null style attribute instead of setting it', opts, async () => {
  const node = {
    tagName: 'p',
    getAttribute(attr) {
      if (attr === 'style') return null
      return undefined
    },
    __data: {},
    _attrs: {},
    innerHTML: 'text',
    innerText: '',
  }
  const element = await nodeToHaxElement(node)
  assert.ok(!('style' in element.properties))
  assert.equal(element.content, 'text')
})

test('copies __data property values including false/true/0 special cases', opts, async () => {
  const node = {
    tagName: 'complex-el',
    getAttribute() { return undefined },
    // __data drives the property loop; values are read off the node itself
    __data: { title: 'Hello', disabled: false, visible: true, count: 0 },
    title: 'Hello',
    disabled: false,
    visible: true,
    count: 0,
    _attrs: { 'data-source': 'unit-test', width: '12' },
    innerHTML: '',
    innerText: 'fallback text',
  }
  const element = await nodeToHaxElement(node)
  assert.equal(element.properties.title, 'Hello')
  assert.equal(element.properties.disabled, false)
  assert.equal(element.properties.visible, true)
  assert.equal(element.properties.count, 0)
  // non class/style/id attributes are copied too
  assert.equal(element.properties['data-source'], 'unit-test')
  assert.equal(element.properties.width, '12')
  // empty innerHTML falls back to innerText
  assert.equal(element.content, 'fallback text')
})

test('nodes without __data use the simpler attributes-only loop', opts, async () => {
  const node = {
    tagName: 'p',
    getAttribute() { return undefined },
    __data: undefined,
    _attrs: { align: 'center' },
    innerHTML: '',
    innerText: 'plain paragraph',
  }
  const element = await nodeToHaxElement(node)
  assert.equal(element.properties.align, 'center')
  assert.equal(element.content, 'plain paragraph')
})

test('eventName null omits the eventName key entirely', opts, async () => {
  const node = {
    tagName: 'p',
    getAttribute() { return undefined },
    __data: {},
    _attrs: {},
    innerHTML: 'x',
    innerText: '',
  }
  const element = await nodeToHaxElement(node, null)
  assert.ok(!('eventName' in element))
  assert.equal(element.content, 'x')
})

test('sandboxed HaxStore converts iframe tags to webview and sources slot content', opts, async () => {
  globalThis.HaxStore = {
    instance: {
      _isSandboxed: true,
      async getHAXSlot(node) {
        return 'slot content from store'
      },
    },
  }
  try {
    const node = {
      tagName: 'IFRAME',
      getAttribute() { return undefined },
      __data: {},
      _attrs: { src: 'https://example.com' },
      innerHTML: '',
      innerText: '',
    }
    const element = await nodeToHaxElement(node)
    assert.equal(element.tag, 'webview')
    assert.equal(element.content, 'slot content from store')
    assert.equal(element.properties.src, 'https://example.com')
  } finally {
    delete globalThis.HaxStore
  }
})

test('a present HaxStore instance sources slot content through it', opts, async () => {
  globalThis.HaxStore = {
    instance: {
      _isSandboxed: false,
      async getHAXSlot(node) {
        return `store slot for ${node.tagName}`
      },
    },
  }
  try {
    const node = {
      tagName: 'video',
      getAttribute() { return undefined },
      __data: {},
      _attrs: {},
      innerHTML: 'fallback',
      innerText: '',
    }
    const element = await nodeToHaxElement(node)
    assert.equal(element.tag, 'video')
    assert.equal(element.content, 'store slot for video')
  } finally {
    delete globalThis.HaxStore
  }
})
