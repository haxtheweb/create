'use strict'

// Thin wrapper over the generic module-canary for tests that need site.js.
// Kept so site-fs.test.cjs / site-skeleton.test.cjs don't change.
const { probeModule } = require('./module-canary.cjs')
module.exports = probeModule('src/lib/programs/site.js')
