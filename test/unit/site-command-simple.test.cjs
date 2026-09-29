'use strict'

// Covers a focused set of siteCommandDetected() branches in src/lib/programs/
// site.js (the ~2000-line interactive switch is intentionally NOT exhaustively
// unit tested — the remaining branches stay covered by the smoke tests):
// site:status (stats build + nodeToHaxElement over parsed page content),
// site:items (ordering, per-item content, to-file json/yaml output),
// node:stats details/schema operations, start (local haxcms-nodejs spawn),
// site:items-import from a local JSON file (parent remapping + addPage), and
// the quit branch.
//
// systemStructureContext is replaced on the raw haxcms-nodejs module BEFORE
// site.js is required (site.js captures it as a const at load time) with a
// fake activeHaxsite; utils.exec/utils.spawn are monkey-patched (live
// bindings) so nothing shells out; @clack/prompts is patched via the shared
// clack stub; log() is silenced; and process.exit is intercepted per test
// with the established sentinel pattern (every non-quit action run ends in
// an exit).
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-command-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME
fs.mkdirSync(path.join(ISOLATED_HOME, '.haxtheweb'), { recursive: true })

const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const intros = []
stub.intro = (msg) => { intros.push(String(msg)) }
const notes = []
stub.note = (msg) => { notes.push(String(msg)) }
stub.outro = (msg) => { /* quiet */ }
stub.cancel = (msg) => { /* quiet */ }
stub.spinner = () => ({ start() {}, stop() {} })
let groupResponse = { action: 'quit' }
stub.group = async () => groupResponse
stub.select = async () => null
stub.text = async () => 'placeholder'
stub.confirm = async () => true

// silence structured logging output (winston console transport noise)
const logging = require('../../src/lib/logging.js')
logging.log = () => {}

// fake active HAXsite served by the patched systemStructureContext
const SITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-fake-site-'))
const addPageCalls = []
const manifestSaves = []
const fakeItems = [
  {
    id: 'item-1',
    title: 'Page One',
    indent: 0,
    parent: null,
    order: 1,
    slug: 'page-one',
    location: 'pages/page-1/index.html',
    metadata: {},
  },
  {
    id: 'item-2',
    title: 'Page Two',
    indent: 1,
    parent: 'item-1',
    order: 2,
    slug: 'page-two',
    location: 'pages/page-2/index.html',
    metadata: {},
  },
]
const fakePages = {
  'item-1': {
    id: 'item-1',
    title: 'Page One',
    slug: 'page-one',
    indent: 0,
    location: 'pages/page-1/index.html',
    metadata: {},
  },
  'item-2': {
    id: 'item-2',
    title: 'Page Two',
    slug: 'page-two',
    indent: 1,
    location: 'pages/page-2/index.html',
    metadata: {},
  },
}
const fakeHaxsite = {
  name: 'fakesite',
  directory: SITE_DIR,
  manifest: {
    title: 'Fake Site',
    description: 'A fake site',
    items: fakeItems,
    metadata: {
      site: { updated: 1717000000 },
      theme: { name: 'clean-one', element: 'clean-one' },
    },
    findBranch(id) {
      return fakeItems.filter((item) => item.id === id)
    },
    orderTree(items) {
      return items
    },
    save() {
      manifestSaves.push(true)
    },
  },
  loadNode(id) {
    return fakePages[id]
  },
  async getPageContent(page) {
    return '<p>hello world</p><my-widget title="w">deep content</my-widget>'
  },
  async addPage(parent, title, format, slug, unused, indent, content, order, metadata) {
    const call = { parent, title, format, slug, indent, content, order, metadata }
    addPageCalls.push(call)
    return { id: `new-${addPageCalls.length}` }
  },
}

// patch BEFORE the canary requires site.js (const capture at load time)
const haxcmsLib = require('@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js')
haxcmsLib.systemStructureContext = async () => fakeHaxsite

// no real subprocesses (site.js module-load `surge/netlify/vercel/rsync
// --version` probes included)
const utils = require('../../src/lib/utils.js')
const execCalls = []
utils.exec = async (cmd, cmdOpts) => {
  execCalls.push({ cmd, opts: cmdOpts })
  return { stdout: '', stderr: '' }
}
const spawnCalls = []
utils.spawn = (cmd, args, spawnOpts) => {
  const record = { cmd, args, opts: spawnOpts, handlers: {} }
  spawnCalls.push(record)
  return {
    on(event, cb) {
      record.handlers[event] = cb
      if (event === 'exit') {
        // settle the pending server promise (clean exit) once both handlers
        // are wired, otherwise the awaited spawn never resolves
        setTimeout(() => cb(0, null), 0)
      }
      return this
    },
  }
}

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')
const { siteCommandDetected } = available ? siteModule : {}

// drop the module-load version probes
execCalls.length = 0

const opts = { skip: skipReason, timeout: 30000 }

async function runSite(commandRun) {
  const originalExit = process.exit
  let exitCode = null
  process.exit = (code) => {
    exitCode = code
    throw new Error('__process_exit__')
  }
  try {
    await assert.rejects(() => siteCommandDetected(commandRun), /__process_exit__/)
    return exitCode
  } finally {
    process.exit = originalExit
  }
}

function resetMocks() {
  execCalls.length = 0
  spawnCalls.length = 0
  intros.length = 0
  notes.length = 0
  addPageCalls.length = 0
  manifestSaves.length = 0
  groupResponse = { action: 'quit' }
}

// --- site:status (the default action) ---

test('site:status reports title, theme, page count, and tag usage', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: {},
    options: { quiet: false, i: true },
  })
  assert.equal(exitCode, 0)
  assert.ok(intros.some((m) => m.includes('Title: Fake Site')), 'title intro')
  assert.ok(intros.some((m) => m.includes('Description: A fake site')), 'description intro')
  assert.ok(intros.some((m) => m.includes('clean-one')), 'theme intro')
  assert.ok(intros.some((m) => m.includes('Pages: 2')), 'page count intro')
  assert.ok(intros.some((m) => m.includes('Last updated:')), 'last updated intro')
  // tag usage counts parsed page content elements (p + my-widget)
  assert.ok(intros.some((m) => m.includes('"my-widget": 2')), 'tag usage intro')
})

test('site:status can redirect the stats to a file', opts, async () => {
  resetMocks()
  const statsPath = path.join(os.tmpdir(), 'hax-site-stats-test.json')
  const exitCode = await runSite({
    command: 'site',
    arguments: {},
    options: { quiet: false, i: true, toFile: statsPath },
  })
  assert.equal(exitCode, 0)
  const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'))
  assert.equal(stats.title, 'Fake Site')
  assert.equal(stats.pageCount, 2)
  assert.equal(stats.tagUsage['my-widget'], 2)
  assert.equal(stats.themeName, 'clean-one')
  fs.rmSync(statsPath, { force: true })
})

// --- site:items ---

test('site:items writes the ordered items with content as yaml', opts, async () => {
  resetMocks()
  const itemsPath = path.join(os.tmpdir(), 'hax-site-items-test.yaml')
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'site:items' },
    options: { format: 'yaml', toFile: itemsPath, quiet: true, i: true },
  })
  assert.equal(exitCode, 0)
  const contents = fs.readFileSync(itemsPath, 'utf8')
  assert.ok(contents.includes('title: Page One'), 'first item present')
  assert.ok(contents.includes('title: Page Two'), 'second item present')
  assert.ok(contents.includes('hello world'), 'item content included')
  fs.rmSync(itemsPath, { force: true })
})

test('site:items can filter to a single branch via --item-id', opts, async () => {
  resetMocks()
  const itemsPath = path.join(os.tmpdir(), 'hax-site-items-branch-test.json')
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'site:items' },
    options: { itemId: 'item-2', toFile: itemsPath, quiet: true, i: true },
  })
  assert.equal(exitCode, 0)
  const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'))
  assert.equal(items.length, 1)
  assert.equal(items[0].title, 'Page Two')
  fs.rmSync(itemsPath, { force: true })
})

// --- node:stats details / schema operations ---

test('node:stats details writes the page record to a file', opts, async () => {
  resetMocks()
  const pagePath = path.join(os.tmpdir(), 'hax-node-details-test.json')
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'node:stats' },
    options: {
      itemId: 'item-1',
      nodeOp: 'details',
      toFile: pagePath,
      quiet: true,
      i: true,
    },
  })
  assert.equal(exitCode, 0)
  const page = JSON.parse(fs.readFileSync(pagePath, 'utf8'))
  assert.equal(page.title, 'Page One')
  assert.equal(page.id, 'item-1')
  fs.rmSync(pagePath, { force: true })
})

test('node:stats schema converts the page content into HAX element schema', opts, async () => {
  resetMocks()
  const schemaPath = path.join(os.tmpdir(), 'hax-node-schema-test.json')
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'node:stats' },
    options: {
      itemId: 'item-1',
      nodeOp: 'schema',
      toFile: schemaPath,
      quiet: true,
      i: true,
    },
  })
  assert.equal(exitCode, 0)
  const els = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
  const tags = els.map((el) => el.tag)
  assert.ok(tags.includes('p'), 'paragraph converted')
  assert.ok(tags.includes('my-widget'), 'custom element converted')
  const widget = els.find((el) => el.tag === 'my-widget')
  assert.equal(widget.properties.title, 'w')
  assert.equal(widget.content, 'deep content')
  fs.rmSync(schemaPath, { force: true })
})

// --- start: local haxcms-nodejs spawn with loopback binding ---

test('start spawns the local haxcms-nodejs bin on an available port', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'start' },
    options: { quiet: true, i: true },
  })
  assert.equal(exitCode, 0)
  assert.equal(spawnCalls.length, 1, 'server spawned exactly once')
  const record = spawnCalls[0]
  assert.equal(record.cmd, process.execPath)
  assert.ok(record.args[0].endsWith('dist/local.js'), 'local haxcms bin used')
  assert.equal(record.opts.cwd, SITE_DIR)
  assert.equal(record.opts.env.HOST, '127.0.0.1')
  assert.equal(record.opts.env.HAXCMS_DISABLE_JWT_CHECKS, 'true')
  assert.ok(parseInt(record.opts.env.PORT, 10) > 0, 'a port was selected')
})

// --- site:items-import from a local JSON file ---

test('site:items-import imports a local item export and remaps parents', opts, async () => {
  resetMocks()
  const importDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-items-import-'))
  const importPath = path.join(importDir, 'items.json')
  fs.writeFileSync(
    importPath,
    JSON.stringify([
      {
        id: 'imp-1',
        title: 'Imported One',
        parent: null,
        indent: 0,
        order: 1,
        slug: 'imported-one',
        content: '<p>imported content one</p>',
      },
      {
        id: 'imp-2',
        title: 'Imported Two',
        parent: 'imp-1',
        indent: 1,
        order: 2,
        slug: 'imported-two',
        content: '<p>imported content two</p>',
      },
    ]),
  )
  try {
    const exitCode = await runSite({
      command: 'site',
      arguments: { action: 'site:items-import' },
      options: { itemsImport: importPath, parentId: 'item-1', quiet: true, i: true },
    })
    assert.equal(exitCode, 0)
    assert.equal(addPageCalls.length, 2)
    // top-level import got --parent-id as its parent
    assert.equal(addPageCalls[0].parent, 'item-1')
    assert.equal(addPageCalls[0].title, 'Imported One')
    assert.equal(addPageCalls[0].slug, 'imported-one')
    assert.equal(addPageCalls[0].content, '<p>imported content one</p>')
    // nested import was remapped to the new id of its imported parent
    assert.equal(addPageCalls[1].parent, 'new-1')
    assert.equal(addPageCalls[1].title, 'Imported Two')
  } finally {
    fs.rmSync(importDir, { recursive: true, force: true })
  }
})

test('site:items-import without --items-import reports the requirement', opts, async () => {
  resetMocks()
  // logging is silenced via the log() patch, so assert on addPage instead
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'site:items-import' },
    options: { quiet: true, i: true },
  })
  assert.equal(exitCode, 0)
  assert.equal(addPageCalls.length, 0)
})

// --- quit ---

test('the quit action skips the loop entirely and resolves without exiting', opts, async () => {
  resetMocks()
  await assert.doesNotReject(() =>
    siteCommandDetected({
      command: 'site',
      arguments: { action: 'quit' },
      options: { quiet: true, i: true },
    }),
  )
  assert.equal(addPageCalls.length, 0)
  assert.equal(spawnCalls.length, 0)
})

// --- interactive loop: p.group can select quit ---

test('the interactive loop can select quit, which exits cleanly', opts, async () => {
  resetMocks()
  groupResponse = { action: 'quit' }
  const exitCode = await runSite({
    command: 'site',
    arguments: {},
    options: { quiet: true, i: true },
  })
  assert.equal(exitCode, 0)
  assert.ok(intros.some((m) => m.includes('hax site quit')), 'quit intro recorded')
})
