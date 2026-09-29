'use strict'

// Patchable stand-in for @clack/prompts.
//
// @clack/prompts is ESM-only, so `require('@clack/prompts')` returns a frozen
// module namespace whose properties CANNOT be reassigned — assignments
// silently fail in sloppy mode and throw in strict mode. That blocks the
// repo's usual monkey-patch mocking strategy (the one that works for the
// babel-transpiled src modules like utils.js, whose exports are writable).
//
// This helper seeds require.cache with a plain-object stand-in (copies of the
// real exports plus `__esModule: true`) and redirects the '@clack/prompts'
// specifier to it via Module._resolveFilename. Babel-compiled src modules
// then hold the live stub object itself, so test files can override
// individual functions (`stub.intro = ...`, `stub.group = ...`) at any time —
// before or after the module under test is required — while unpatched
// functions keep behaving exactly like the real ones.
//
// MUST be installed BEFORE requiring any src module that imports
// @clack/prompts, so the module under test binds to the stub.

// Deterministic, color-free recorded output. picocolors (pulled in by
// @clack/prompts and every src module) only disables colors when stdout is
// NOT a TTY, so these tests would record inline ANSI codes (e.g.
// `hax wc <esc>[1mquit<esc>[22m`) when run from an interactive terminal and
// break content assertions. NO_COLOR forces colors off regardless of
// TTY/FORCE_COLOR/CI, and must be set before picocolors is first required
// because it decides at module load time.
process.env.NO_COLOR = '1'

const Module = require('node:module')
const path = require('node:path')

// a cache key that will never collide with a real file
const STUB_KEY = path.join(__dirname, '__clack-prompt-stub__.js')

function installClackStub() {
  if (globalThis.__haxClackStub) {
    return globalThis.__haxClackStub
  }
  // load the real module BEFORE installing the redirect, so the stub copies
  // the genuine exports
  const real = require('@clack/prompts')
  const stub = { __esModule: true }
  for (const key of Object.keys(real)) {
    stub[key] = real[key]
  }
  // seed the loader cache so the (nonexistent) stub file path is never read
  require.cache[STUB_KEY] = {
    id: STUB_KEY,
    filename: STUB_KEY,
    loaded: true,
    exports: stub,
  }
  const originalResolveFilename = Module._resolveFilename
  Module._resolveFilename = function (request, ...args) {
    if (request === '@clack/prompts') {
      return STUB_KEY
    }
    return originalResolveFilename.call(this, request, ...args)
  }
  globalThis.__haxClackStub = stub
  return stub
}

module.exports = { installClackStub }
