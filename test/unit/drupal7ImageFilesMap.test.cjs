'use strict'

// Regression tests for the drupal7-book-print-html importer's build.files map
// construction (Workstream C of the post-#40/#41/#633 parity follow-up,
// haxtheweb/issues#3064).
//
// The importer scrapes a Drupal7 book-print-html page and records each
// <img src="/..."> as files[imgSrc] = absoluteImgUrl. Previously imgSrc kept
// its leading '/', so both backends' normalizeBulkImportName() rejected the
// key (normalized.startsWith('/') -> invalid) and the image was silently
// dropped. buildDrupalImageFilesMap now strips the leading slash so the key
// is files/-relative and accepted by both backends' bulk-import path.
//
// Constraints honored: CommonJS (.cjs), require(), globalThis (not window),
// NO optional chaining (explicit && guards), node:test + node:assert/strict.

const test = require('node:test')
const assert = require('node:assert/strict')

const { probeModule } = require('../_helpers/module-canary.cjs')
const { available, skipReason, module: siteModule } = probeModule('src/lib/programs/site.js')

const { buildDrupalImageFilesMap } = available ? siteModule : {}

const opts = { skip: skipReason, timeout: 15000 }

// Drupal7 book-print-html shape: section-2 wrappers with body field-items and
// absolute-path <img> srcs (the selector is img[src^='/']).
const DRUPAL_HTML = `
<div class="section-2" id="page-1">
  <h1>Page 1</h1>
  <div class="field field-name-body"><div class="field-item">
    <p>body</p>
    <img src="/sites/default/files/img/a.png" alt="a">
    <img src="/sites/default/files/img/b.jpg" alt="b">
    <img src="//cdn.example.org/protocol-relative.png" alt="rel">
    <img src="relative/path.png" alt="relpath">
  </div></div>
</div>`

test('strips the leading slash from each absolute-path img src key', opts, async () => {
  const { files, skipped } = await buildDrupalImageFilesMap(
    DRUPAL_HTML,
    'https://drupal.example.org',
    { assertUrlNotSSRF: async () => {} },
  )
  const keys = Object.keys(files)
  assert.ok(keys.length > 0, 'at least one image recorded')
  for (const k of keys) {
    assert.equal(k.startsWith('/'), false, `key has no leading slash: ${k}`)
    assert.ok(k.length > 0, 'key is non-empty')
  }
  assert.ok(files['sites/default/files/img/a.png'], 'leading slash stripped from a.png key')
  assert.ok(files['sites/default/files/img/b.jpg'], 'leading slash stripped from b.jpg key')
})

test('records the absolute image URL (origin + src) as the value', opts, async () => {
  const { files } = await buildDrupalImageFilesMap(
    DRUPAL_HTML,
    'https://drupal.example.org',
    { assertUrlNotSSRF: async () => {} },
  )
  assert.equal(
    files['sites/default/files/img/a.png'],
    'https://drupal.example.org/sites/default/files/img/a.png',
  )
})

test('skips protocol-relative // img srcs (they are not absolute-path)', opts, async () => {
  const { files, skipped } = await buildDrupalImageFilesMap(
    DRUPAL_HTML,
    'https://drupal.example.org',
    { assertUrlNotSSRF: async () => {} },
  )
  // the selector img[src^='/'] matches //cdn... too, but the helper explicitly
  // skips srcs that start with '//' so they don't get recorded with a bogus
  // origin-prefixed URL.
  assert.equal(files['/cdn.example.org/protocol-relative.png'], undefined)
  assert.equal(files['cdn.example.org/protocol-relative.png'], undefined)
})

test('does not record relative (non-leading-slash) img srcs', opts, async () => {
  const { files } = await buildDrupalImageFilesMap(
    DRUPAL_HTML,
    'https://drupal.example.org',
    { assertUrlNotSSRF: async () => {} },
  )
  // the DOM selector img[src^='/'] only matches absolute-path srcs, so a
  // relative src like 'relative/path.png' is never considered.
  assert.equal(files['relative/path.png'], undefined)
})

test('SSRF-rejected image URLs are skipped and reported, not recorded', opts, async () => {
  const stub = async (url) => {
    if (url.indexOf('169.254.169.254') !== -1) {
      const err = new Error('SSRF_PRIVATE')
      err.code = 'SSRF_PRIVATE'
      throw err
    }
  }
  const html = `
    <img src="/sites/default/files/ok.png">
    <img src="/169.254.169.254/latest/meta-data/secret.png">
  `
  const { files, skipped } = await buildDrupalImageFilesMap(
    html,
    'https://drupal.example.org',
    { assertUrlNotSSRF: stub },
  )
  assert.ok(files['sites/default/files/ok.png'], 'public image is recorded')
  assert.equal(
    files['169.254.169.254/latest/meta-data/secret.png'],
    undefined,
    'metadata image is not recorded',
  )
  assert.deepEqual(
    skipped,
    ['https://drupal.example.org/169.254.169.254/latest/meta-data/secret.png'],
    'SSRF-rejected URL is reported in skipped',
  )
})

test('returns empty files for empty or non-string html', opts, async () => {
  const empty = await buildDrupalImageFilesMap('', 'https://x.example.org')
  assert.deepEqual(empty.files, {})
  assert.deepEqual(empty.skipped, [])
  const nonString = await buildDrupalImageFilesMap(null, 'https://x.example.org')
  assert.deepEqual(nonString.files, {})
})

test('no leading-slash key would be rejected by normalizeBulkImportName shape', opts, async () => {
  // Mirror the normalizeBulkImportName contract: a key must not start with '/',
  // must not include '..', must not include a null byte, and must be non-empty.
  // This test documents that the helper's output satisfies that gate so both
  // backends accept the files map.
  const { files } = await buildDrupalImageFilesMap(
    DRUPAL_HTML,
    'https://drupal.example.org',
    { assertUrlNotSSRF: async () => {} },
  )
  for (const k of Object.keys(files)) {
    assert.equal(k.startsWith('/'), false, `normalizeBulkImportName would reject leading '/': ${k}`)
    assert.equal(k.indexOf('..') === -1, true, `no traversal in key: ${k}`)
    assert.equal(k.indexOf('\0') === -1, true, `no null byte in key: ${k}`)
  }
})
