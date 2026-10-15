'use strict'

// Covers src/lib/login-link.js — the URL / TTL helpers behind
// `hax site site:login-link` (haxtheweb/issues#2854).
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-login-link-test-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { probeModule } = require('../_helpers/module-canary.cjs')
const { available, skipReason, module: mod } = probeModule('src/lib/login-link.js')

const {
  MAGIC_LINK_ROUTE,
  resolveLoginLinkBase,
  buildLoginLinkUrl,
  buildLoginLinkPath,
  parseLoginLinkTtl,
  loadMagicLinkStore,
} = available ? mod : {}

const opts = { skip: skipReason, timeout: 15000 }
const TOKEN = 'abcdefghijklmnop.' + 'Z'.repeat(43)

test('--domain wins over the site manifest domain', opts, () => {
  assert.equal(resolveLoginLinkBase('https://cms.example.org', 'https://site.example.org'), 'https://cms.example.org')
})

test('falls back to the manifest domain, adding https:// to bare hosts', opts, () => {
  assert.equal(resolveLoginLinkBase(undefined, 'site.example.org'), 'https://site.example.org')
  assert.equal(resolveLoginLinkBase('', 'http://localhost:8080/'), 'http://localhost:8080')
})

test('bare loopback hosts default to http, everything else to https', opts, () => {
  assert.equal(resolveLoginLinkBase('localhost:8080', ''), 'http://localhost:8080')
  assert.equal(resolveLoginLinkBase('127.0.0.1:3000', ''), 'http://127.0.0.1:3000')
  assert.equal(resolveLoginLinkBase('cms.example.org', ''), 'https://cms.example.org')
})

test('keeps a subdirectory install path and drops trailing slashes', opts, () => {
  assert.equal(resolveLoginLinkBase('https://example.org/haxcms/', ''), 'https://example.org/haxcms')
})

test('returns empty when no usable base is known', opts, () => {
  assert.equal(resolveLoginLinkBase(undefined, undefined), '')
  assert.equal(resolveLoginLinkBase('   ', ''), '')
  assert.equal(resolveLoginLinkBase(true, null), '')
})

test('builds the consume URL against the system session route', opts, () => {
  assert.equal(MAGIC_LINK_ROUTE, 'system/api/v1/session/magic-link')
  assert.equal(buildLoginLinkPath(TOKEN), '/system/api/v1/session/magic-link?token=' + TOKEN)
  assert.equal(buildLoginLinkUrl('https://a.example', TOKEN), 'https://a.example/system/api/v1/session/magic-link?token=' + TOKEN)
  assert.equal(buildLoginLinkUrl('', TOKEN), buildLoginLinkPath(TOKEN))
})

test('parseLoginLinkTtl accepts seconds, minutes and hours', opts, () => {
  assert.equal(parseLoginLinkTtl(undefined), undefined)
  assert.equal(parseLoginLinkTtl(''), undefined)
  assert.equal(parseLoginLinkTtl('600'), 600)
  assert.equal(parseLoginLinkTtl('15m'), 900)
  assert.equal(parseLoginLinkTtl('2H'), 7200)
  assert.equal(parseLoginLinkTtl('90s'), 90)
})

test('parseLoginLinkTtl rejects junk', opts, () => {
  assert.throws(() => parseLoginLinkTtl('soon'), /Invalid --ttl/)
  assert.throws(() => parseLoginLinkTtl('-5'), /Invalid --ttl/)
})

test('loadMagicLinkStore returns the store or a clear upgrade error', opts, async () => {
  try {
    const store = await loadMagicLinkStore()
    assert.equal(typeof store.issueMagicLink, 'function')
    assert.equal(typeof store.consumeMagicLink, 'function')
  }
  catch (e) {
    // older @haxtheweb/haxcms-nodejs without magicLinks.js
    assert.equal(e.code, 'MAGIC_LINK_UNSUPPORTED')
    assert.match(e.message, /npm install --global @haxtheweb\/create@latest/)
  }
})
