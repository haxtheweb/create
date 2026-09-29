'use strict'

// Covers siteActions() in src/lib/programs/site.js — the fixed menu list
// behind `hax site`. Same conventions as the partyActions() tests in
// party-helpers.test.cjs. HOME is isolated BEFORE requiring site.js (via the
// canary) because site.js imports HAXCMS which inits a configDirectory on
// load; the canary keeps the file CI-safe when the haxcms-nodejs dist dep
// is missing.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-actions-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')

const { siteActions } = available ? siteModule : {}

const opts = { skip: skipReason, timeout: 15000 }

// --- siteActions: fixed menu list ---

test('siteActions returns the expected fixed list of actions', opts, () => {
  const actions = siteActions()
  assert.ok(Array.isArray(actions))
  const values = actions.map((a) => a.value)
  assert.deepEqual(values, [
    'start',
    'serve',
    'node:stats',
    'node:add',
    'node:edit',
    'node:delete',
    'site:stats',
    'site:items',
    'site:items-import',
    'site:list-files',
    'site:search',
    'site:tags',
    'site:blocks',
    'site:analytics',
    'site:revisions',
    'site:export',
    'site:theme',
    'site:element',
    'site:html',
    'site:md',
    'site:schema',
    'site:skeleton-export',
    'site:skeleton-install',
    'site:sync',
    'site:rsync',
    'site:surge',
    'site:netlify',
    'site:vercel',
    'setup:github-actions',
    'setup:gitlab-ci',
    'issue:general',
    'issue:theme',
  ])
  for (const action of actions) {
    assert.equal(typeof action.value, 'string')
    assert.equal(typeof action.label, 'string')
    assert.ok(action.label.length > 0)
  }
})

test('siteActions returns a fresh array each call (no shared state)', opts, () => {
  const a = siteActions()
  const b = siteActions()
  assert.notEqual(a, b)
  a.push({ value: 'mutated', label: 'mutated' })
  assert.equal(b.length, 32)
})
