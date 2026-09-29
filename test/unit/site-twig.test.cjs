'use strict'

// Covers ensureTwigConstantFunction() in src/lib/programs/site.js (exported
// for testability): it registers the security-hardened `constant` Twig
// function exactly once (idempotent via the module-level
// twigConstantFunctionRegistered flag) and resolves PHP constants from the
// static TWIG_PHP_CONSTANTS allowlist only. Twig.extendFunction is
// monkey-patched on the writable twig CJS module BEFORE site.js is required
// so the registration can be captured. HOME is isolated before the canary
// because site.js imports HAXCMS which inits a configDirectory on load.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-twig-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const Twig = require('twig')
const registrations = []
Twig.extendFunction = (name, fn) => {
  registrations.push({ name, fn })
}

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')
const { ensureTwigConstantFunction } = available ? siteModule : {}

const opts = { skip: skipReason, timeout: 15000 }

test('registers the constant Twig function exactly once (idempotent)', opts, () => {
  ensureTwigConstantFunction()
  ensureTwigConstantFunction()
  ensureTwigConstantFunction()
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].name, 'constant')
  assert.equal(typeof registrations[0].fn, 'function')
})

test('the registered function resolves only the static PHP constant allowlist', opts, () => {
  ensureTwigConstantFunction()
  const constantFn = registrations[0].fn
  assert.equal(constantFn('JSON_PRETTY_PRINT'), 128)
  assert.equal(constantFn('JSON_HEX_TAG'), 1)
  assert.equal(constantFn('JSON_HEX_AMP'), 2)
  assert.equal(constantFn('JSON_HEX_APOS'), 4)
  assert.equal(constantFn('JSON_HEX_QUOT'), 8)
  assert.equal(constantFn('JSON_FORCE_OBJECT'), 16)
  assert.equal(constantFn('JSON_NUMERIC_CHECK'), 32)
  assert.equal(constantFn('JSON_UNESCAPED_SLASHES'), 64)
  assert.equal(constantFn('JSON_UNESCAPED_UNICODE'), 256)
})

test('the registered function returns null for non-allowlisted or non-string names', opts, () => {
  ensureTwigConstantFunction()
  const constantFn = registrations[0].fn
  // no arbitrary env/global access: anything off the allowlist is null
  assert.equal(constantFn('PATH'), null)
  assert.equal(constantFn('SOME_UNDEFINED_THING'), null)
  assert.equal(constantFn(''), null)
  assert.equal(constantFn(123), null)
  assert.equal(constantFn(null), null)
  assert.equal(constantFn(undefined), null)
  assert.equal(constantFn({ name: 'JSON_PRETTY_PRINT' }), null)
})
