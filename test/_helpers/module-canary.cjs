'use strict'

// Generic load-canary factory. A test file probes its target src module via
// probeModule('<path relative to repo root>'); if the module (or any transitive
// import, e.g. @haxtheweb/haxcms-nodejs/dist/lib/*) cannot be required, the
// probe returns { available: false, skipReason } so every test() in the file
// can { skip: skipReason } instead of erroring the whole file.
//
// This is what makes the suite CI-safe: when the published haxcms-nodejs lacks
// dist files the local dev checkout has, affected tests SKIP with a clear
// reason and auto-activate once the dep is aligned/linked.

require('@babel/register')
const path = require('node:path')

const cache = new Map()

function probeModule(repoRelativePath) {
  const resolved = path.resolve(__dirname, '..', '..', repoRelativePath)
  if (cache.has(resolved)) return cache.get(resolved)
  try {
    const mod = require(resolved)
    const result = { available: true, skipReason: false, module: mod }
    cache.set(resolved, result)
    return result
  } catch (e) {
    const missing = (e && e.message && e.message.match(/Cannot find module '([^']+)'/)) || null
    const result = {
      available: false,
      skipReason: missing
        ? `module unavailable — missing dependency: ${missing[1]} (align/link @haxtheweb/haxcms-nodejs to enable)`
        : `module unavailable — ${e && e.message ? e.message.slice(0, 200) : 'unknown error'}`,
      module: null,
    }
    cache.set(resolved, result)
    return result
  }
}

module.exports = { probeModule }
