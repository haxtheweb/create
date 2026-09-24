'use strict'

// Isolate HOME BEFORE requiring site.js (via the canary) so HAXCMS init lands in
// a temp dir, not the real ~/.haxtheweb. Same pattern as site-helpers-2.test.cjs.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-imports-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')

const { IMPORT_STRUCTURE_MAP } = available ? siteModule : {}

const opts = { skip: skipReason, timeout: 15000 }

// --- IMPORT_STRUCTURE_MAP ---
// --import-structure names resolve to on-prem haxcms-nodejs routes: platform
// converters through the site/import/:platform dispatcher, docx/xlsx through
// their own actions routes. A converter missing from this map is unreachable
// from the CLI even when the backend route exists, which is what happened to
// the OpenStax importer from haxtheweb/issues#2912.

test('every platform importer maps to its dispatcher platform', opts, () => {
  const platforms = {}
  Object.keys(IMPORT_STRUCTURE_MAP).forEach((name) => {
    if (IMPORT_STRUCTURE_MAP[name].platform) {
      platforms[name] = IMPORT_STRUCTURE_MAP[name].platform
    }
  })
  assert.deepEqual(platforms, {
    haxcmsToSite: 'haxcms',
    pressbooksToSite: 'pressbooks',
    gitbookToSite: 'gitbook',
    notionToSite: 'notion',
    elmslnToSite: 'elmsln',
    ploneToSite: 'plone',
    wordpressPagesToSite: 'wordpress',
    drupalBookToSite: 'drupal-book',
    openstaxToSite: 'openstax',
    htmlToSite: 'html',
  })
})

test('openstaxToSite reaches the openstax dispatcher case', opts, () => {
  assert.deepEqual(IMPORT_STRUCTURE_MAP.openstaxToSite, { platform: 'openstax' })
})

test('docx and xlsx keep their own action routes', opts, () => {
  assert.deepEqual(IMPORT_STRUCTURE_MAP.docxToSite, { routeKey: 'actions/import-docx' })
  assert.deepEqual(IMPORT_STRUCTURE_MAP.xlsxToSite, { routeKey: 'actions/import-xlsx' })
})

test('the --import-structure help and man page list every mapped importer', opts, () => {
  const root = path.join(__dirname, '..', '..')
  const help = fs.readFileSync(path.join(root, 'src', 'create.js'), 'utf8')
  const manPage = fs.readFileSync(path.join(root, 'src', 'docs', 'hax.1'), 'utf8')
  Object.keys(IMPORT_STRUCTURE_MAP).forEach((name) => {
    assert.ok(help.includes(name), name + ' is offered by --import-structure')
    assert.ok(manPage.includes(name), name + ' is documented in the man page')
  })
})
