'use strict'

// Covers src/lib/api-messages.js and translateOnly in src/lib/i18n.js:
// backend messages carry a `code` + `params` (haxtheweb/issues#3157) and the
// CLI shows them in its language, falling back to the server's English.
require('@babel/register')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const { setLanguage, registerNamespace, translateOnly } = require('../../src/lib/i18n.js')
const {
  apiMessage,
  apiMessageParts,
  annotateApiBody,
  _resetApiMessages,
} = require('../../src/lib/api-messages.js')

// a stand-in for the haxcms-api locale files bundled with haxcms-nodejs
function fakeLocales() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-api-locales-'))
  fs.writeFileSync(path.join(dir, 'haxcms-api.en.json'), JSON.stringify({
    ITEM_NOT_FOUND: 'Page not found.',
    UPLOAD_TOO_LARGE: 'The file is larger than the {maxMb} MB upload limit.',
  }))
  fs.writeFileSync(path.join(dir, 'haxcms-api.de.json'), JSON.stringify({
    ITEM_NOT_FOUND: 'Seite nicht gefunden.',
    UPLOAD_TOO_LARGE: 'Die Datei ist größer als das Limit von {maxMb} MB.',
  }))
  return dir
}

test.afterEach(() => {
  setLanguage(null)
})

test('apiMessageParts finds message, code and params in each envelope shape', () => {
  assert.deepEqual(
    apiMessageParts({ status: 404, data: { message: 'Item not found for idOrSlug "x"', code: 'ITEM_NOT_FOUND', params: { idOrSlug: 'x' } } }),
    { code: 'ITEM_NOT_FOUND', params: { idOrSlug: 'x' }, message: 'Item not found for idOrSlug "x"' },
  )
  assert.equal(apiMessageParts({ status: 413, message: 'File too large or too many files', code: 'REQUEST_TOO_LARGE' }).code, 'REQUEST_TOO_LARGE')
  assert.equal(apiMessageParts({ __failed: { status: 403, message: 'invalid site token' } }).message, 'invalid site token')
  assert.equal(apiMessageParts({ status: 400, data: { error: 'Conversion failed: x' } }).message, 'Conversion failed: x')
  assert.equal(apiMessageParts('plain').message, 'plain')
  assert.deepEqual(apiMessageParts(null), { code: '', params: {}, message: '' })
})

test('English keeps the server message; other languages get the translation', () => {
  registerNamespace('haxcms-api', fakeLocales())
  const body = { status: 404, data: { message: 'Item not found for idOrSlug "intro"', code: 'ITEM_NOT_FOUND', params: { idOrSlug: 'intro' } } }
  setLanguage('en')
  assert.equal(apiMessage(body, 'fallback'), 'Item not found for idOrSlug "intro"')
  setLanguage('de-AT')
  assert.equal(apiMessage(body, 'fallback'), 'Seite nicht gefunden.')
  const big = { status: 400, data: { message: 'File exceeds the maximum upload size of 25MB', code: 'UPLOAD_TOO_LARGE', params: { maxMb: '25' } } }
  assert.equal(apiMessage(big), 'Die Datei ist größer als das Limit von 25 MB.')
})

test('missing params, unknown codes and missing languages fall back to the English message', () => {
  registerNamespace('haxcms-api', fakeLocales())
  setLanguage('de')
  assert.equal(apiMessage({ status: 400, data: { message: 'Too big', code: 'UPLOAD_TOO_LARGE' } }), 'Too big')
  assert.equal(apiMessage({ status: 400, data: { message: 'Odd', code: 'NOPE' } }), 'Odd')
  setLanguage('ja')
  assert.equal(apiMessage({ status: 404, data: { message: 'Node not found', code: 'ITEM_NOT_FOUND' } }), 'Node not found')
  assert.equal(apiMessage({ status: 500 }, 'No response'), 'No response')
})

test('translateOnly returns null for English and for unresolved placeholders', () => {
  registerNamespace('haxcms-api', fakeLocales())
  setLanguage('en')
  assert.equal(translateOnly('haxcms-api', 'ITEM_NOT_FOUND'), null)
  setLanguage('de')
  assert.equal(translateOnly('haxcms-api', 'ITEM_NOT_FOUND'), 'Seite nicht gefunden.')
  assert.equal(translateOnly('haxcms-api', 'UPLOAD_TOO_LARGE', {}), null)
  assert.equal(translateOnly('haxcms-api', 'UPLOAD_TOO_LARGE', { maxMb: 5 }), 'Die Datei ist größer als das Limit von 5 MB.')
  assert.equal(translateOnly('haxcms-api', 'NOT_THERE'), null)
})

test('annotateApiBody uses haxcms-nodejs when it has message codes, and is a no-op otherwise', () => {
  _resetApiMessages()
  const calls = []
  const fakeRequire = () => ({
    annotateApiResponse(body, status) {
      calls.push(status)
      body.data.code = 'ACCESS_DENIED'
      return body
    },
  })
  const body = annotateApiBody({ status: 403, data: { message: 'Access denied' } }, 403, fakeRequire)
  assert.equal(body.data.code, 'ACCESS_DENIED')
  assert.deepEqual(calls, [403])
  _resetApiMessages()
  const missing = () => { throw new Error('Cannot find module') }
  const plain = { status: 403, data: { message: 'Access denied' } }
  assert.equal(annotateApiBody(plain, 403, missing), plain)
  assert.equal(Object.prototype.hasOwnProperty.call(plain.data, 'code'), false)
  _resetApiMessages()
})
