'use strict'

// Isolate HOME before requiring the module (via the canary) so any transitive
// init lands in a temp dir, not the real ~/.haxtheweb.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-sec-test-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { probeModule } = require('../_helpers/module-canary.cjs')
const { available, skipReason, module: secModule } = probeModule('src/lib/site-security.js')

const {
  isSSRFError,
  sanitizeIfString,
  resolveLocalPath,
} = available ? secModule : {}

const opts = { skip: skipReason, timeout: 15000 }

// Control chars are built with String.fromCharCode (not '\n'/'\0' literals) so
// the test exercises the REAL newline/CR/null-byte rejection, not a backslash.

test('isSSRFError is true only for errors with an SSRF_ code prefix', opts, () => {
  assert.equal(isSSRFError({ code: 'SSRF_BLOCKED' }), true)
  assert.equal(isSSRFError({ code: 'SSRF_PRIVATE_IP' }), true)
  assert.equal(isSSRFError({ code: 'ECONNREFUSED' }), false)
  assert.equal(isSSRFError(new Error('boom')), false)
  assert.equal(isSSRFError(null), false)
  assert.equal(isSSRFError(undefined), false)
  assert.equal(isSSRFError({}), false)
})

test('sanitizeIfString passes non-strings and empty strings through unchanged', opts, () => {
  assert.equal(sanitizeIfString(123), 123)
  assert.equal(sanitizeIfString(null), null)
  assert.equal(sanitizeIfString(''), '')
  const obj = { a: 1 }
  assert.equal(sanitizeIfString(obj), obj)
})

test('sanitizeIfString strips <script> blocks from string HTML', opts, () => {
  const dirty = '<p>hi</p><script>alert(1)</script>'
  const clean = sanitizeIfString(dirty)
  assert.equal(typeof clean, 'string')
  assert.ok(!clean.includes('<script'), 'script tag must be stripped')
  assert.ok(clean.includes('<p>hi</p>'), 'non-script content is preserved')
})

test('resolveLocalPath canonicalizes and normalizes absolute paths', opts, () => {
  // worked example: /foo/../bar normalizes to /bar
  assert.equal(resolveLocalPath('/foo/../bar'), '/bar')
  assert.equal(resolveLocalPath('/usr/local/bin'), '/usr/local/bin')
})

test('resolveLocalPath resolves relative paths against cwd', opts, () => {
  const result = resolveLocalPath('foo/bar')
  assert.ok(path.isAbsolute(result), 'result is absolute')
  assert.ok(result.endsWith('foo/bar'))
})

test('resolveLocalPath rejects a real null byte (path-injection vector)', opts, () => {
  const NUL = String.fromCharCode(0)
  assert.throws(() => resolveLocalPath('foo' + NUL + 'bar'), /Invalid local path/)
})

test('resolveLocalPath rejects non-string values', opts, () => {
  assert.throws(() => resolveLocalPath(123), /Invalid local path/)
  assert.throws(() => resolveLocalPath(null), /Invalid local path/)
  assert.throws(() => resolveLocalPath(undefined), /Invalid local path/)
})
