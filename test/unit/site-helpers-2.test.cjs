'use strict'

// Isolate HOME BEFORE requiring site.js (via the canary) so HAXCMS init lands in
// a temp dir, not the real ~/.haxtheweb. Same pattern as site-skeleton.test.cjs.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-helpers2-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')

const {
  formatStructuredOutput,
  formatErrorForLogging,
  applyImportedSiteMetadata,
  siteNodeStatsOperations,
  siteNodeOperations,
  siteItemsOptionsList,
  siteThemeList,
  siteSkeletonList,
} = available ? siteModule : {}

const opts = { skip: skipReason, timeout: 15000 }

// --- formatStructuredOutput ---

test('formatStructuredOutput returns pretty JSON by default for objects', opts, () => {
  const result = formatStructuredOutput({ options: {} }, { a: 1, b: 'x' })
  assert.equal(result, JSON.stringify({ a: 1, b: 'x' }, null, 2))
})

test('formatStructuredOutput returns strings unchanged when format is not yaml', opts, () => {
  const result = formatStructuredOutput({ options: {} }, 'plain string')
  assert.equal(result, 'plain string')
})

test('formatStructuredOutput returns YAML when format option is "yaml"', opts, () => {
  const result = formatStructuredOutput({ options: { format: 'yaml' } }, { a: 1, b: 'x' })
  assert.equal(result, 'a: 1\nb: x\n')
})

test('formatStructuredOutput yaml-encodes strings too when format is yaml', opts, () => {
  const result = formatStructuredOutput({ options: { format: 'yaml' } }, 'plain string')
  assert.equal(result, 'plain string\n')
})

// --- formatErrorForLogging ---

test('formatErrorForLogging prefers a non-empty stderr', opts, () => {
  assert.equal(
    formatErrorForLogging({ stderr: '  boom stderr  ', stdout: 'out', message: 'msg' }),
    'boom stderr',
  )
})

test('formatErrorForLogging falls back to stdout when stderr is empty', opts, () => {
  assert.equal(
    formatErrorForLogging({ stderr: '', stdout: '  boom stdout  ', message: 'msg' }),
    'boom stdout',
  )
})

test('formatErrorForLogging falls back to message when stderr/stdout are empty', opts, () => {
  assert.equal(
    formatErrorForLogging({ stderr: '', stdout: '', message: '  boom message  ' }),
    'boom message',
  )
})

test('formatErrorForLogging handles plain string errors', opts, () => {
  assert.equal(formatErrorForLogging('  plain error  '), 'plain error')
})

test('formatErrorForLogging falls back to JSON serialization for plain objects', opts, () => {
  assert.equal(formatErrorForLogging({ code: 'EFAIL' }), JSON.stringify({ code: 'EFAIL' }))
})

test('formatErrorForLogging returns "Unknown error" for empty/unserializable input', opts, () => {
  assert.equal(formatErrorForLogging({}), 'Unknown error')
  assert.equal(formatErrorForLogging(null), 'Unknown error')
  assert.equal(formatErrorForLogging(undefined), 'Unknown error')
})

// --- applyImportedSiteMetadata ---

test('applyImportedSiteMetadata copies a non-empty license onto siteRequest.site', opts, () => {
  const siteRequest = { site: {} }
  applyImportedSiteMetadata(siteRequest, { license: '  MIT  ' })
  assert.equal(siteRequest.site.license, 'MIT')
})

test('applyImportedSiteMetadata is a no-op when siteRequest/site is missing', opts, () => {
  assert.doesNotThrow(() => applyImportedSiteMetadata(null, { license: 'MIT' }))
  assert.doesNotThrow(() => applyImportedSiteMetadata({}, { license: 'MIT' }))
  const siteRequest = { site: { license: 'existing' } }
  applyImportedSiteMetadata(siteRequest, null)
  assert.equal(siteRequest.site.license, 'existing')
})

test('applyImportedSiteMetadata ignores a blank or non-string license', opts, () => {
  const siteRequest = { site: { license: 'existing' } }
  applyImportedSiteMetadata(siteRequest, { license: '   ' })
  assert.equal(siteRequest.site.license, 'existing')
  applyImportedSiteMetadata(siteRequest, { license: 123 })
  assert.equal(siteRequest.site.license, 'existing')
})

// --- siteNodeStatsOperations ---

test('siteNodeStatsOperations returns the full options list when called with no search', opts, () => {
  const ops = siteNodeStatsOperations()
  assert.ok(Array.isArray(ops))
  assert.deepEqual(ops.map((o) => o.value), ['details', 'html', 'schema', 'md'])
})

test('siteNodeStatsOperations returns true/false when searching for a known/unknown value', opts, () => {
  assert.equal(siteNodeStatsOperations('html'), true)
  assert.equal(siteNodeStatsOperations('nonexistent'), false)
})

// --- siteNodeOperations ---

test('siteNodeOperations returns the full options list when called with no search', opts, () => {
  const ops = siteNodeOperations()
  assert.ok(Array.isArray(ops))
  assert.deepEqual(ops.map((o) => o.value), [
    'title',
    'content',
    'slug',
    'published',
    'tags',
    'parent',
    'order',
    'theme',
    'hideInMenu',
  ])
})

test('siteNodeOperations returns true/false when searching for a known/unknown value', opts, () => {
  assert.equal(siteNodeOperations('slug'), true)
  assert.equal(siteNodeOperations('nonexistent'), false)
})

// --- siteItemsOptionsList ---

test('siteItemsOptionsList builds indented labels and skips the given id', opts, async () => {
  const items = [
    { id: '1', title: 'Home', indent: 0 },
    { id: '2', title: 'Child', indent: 1 },
    { id: '3', title: 'Grandchild', indent: 2 },
  ]
  const activeHaxsite = {
    manifest: {
      items,
      orderTree(providedItems) {
        return providedItems
      },
    },
  }
  const result = await siteItemsOptionsList(activeHaxsite)
  assert.deepEqual(result, [
    { value: '1', label: ' Home' },
    { value: '2', label: ' -Child' },
    { value: '3', label: ' --Grandchild' },
  ])
})

test('siteItemsOptionsList excludes the skipId entry', opts, async () => {
  const items = [
    { id: '1', title: 'Home', indent: 0 },
    { id: '2', title: 'Child', indent: 1 },
  ]
  const activeHaxsite = {
    manifest: {
      items,
      orderTree(providedItems) {
        return providedItems
      },
    },
  }
  const result = await siteItemsOptionsList(activeHaxsite, '2')
  assert.deepEqual(result, [{ value: '1', label: ' Home' }])
})

// --- siteThemeList ---

test('siteThemeList returns a non-empty list including the custom-theme entry when coreOnly', opts, async () => {
  const themes = await siteThemeList(true)
  assert.ok(Array.isArray(themes))
  assert.ok(themes.length > 0)
  assert.ok(themes.some((t) => t.value === 'custom-theme'))
  for (const theme of themes) {
    assert.equal(typeof theme.value, 'string')
    assert.equal(typeof theme.label, 'string')
  }
})

test('siteThemeList without coreOnly does not append the custom-theme entry', opts, async () => {
  const themes = await siteThemeList(false)
  assert.ok(Array.isArray(themes))
  assert.ok(!themes.some((t) => t.value === 'custom-theme'))
})

// --- siteSkeletonList ---

test('siteSkeletonList returns a non-empty array of skeleton records by default', opts, async () => {
  const skeletons = await siteSkeletonList()
  assert.ok(Array.isArray(skeletons))
  assert.ok(skeletons.length > 0)
})

test('siteSkeletonList as options returns value/label pairs', opts, async () => {
  const options = await siteSkeletonList(true)
  assert.ok(Array.isArray(options))
  assert.ok(options.length > 0)
  for (const option of options) {
    assert.equal(typeof option.value, 'string')
    assert.equal(typeof option.label, 'string')
  }
})
