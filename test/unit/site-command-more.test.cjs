'use strict'

// Covers the remaining testable siteCommandDetected() branches in
// src/lib/programs/site.js that site-command-simple.test.cjs does not:
// the site-scoped GET routes (list-files/search/tags/blocks/analytics),
// skeleton export/install, sync/rsync, theme switching, site:element,
// the surge/netlify/vercel publish flows (with their static-publish
// prepare/restore cycle), the setup:github-actions/gitlab-ci scaffolds,
// site:html/md/schema output, node:edit/add/delete, revisions, export,
// files upload/delete and search-replace. The rest of the giant switch
// stays covered by the smoke tests per the plan's out-of-scope section.
//
// Mocking follows the same conventions as site-command-simple.test.cjs,
// plus: the haxcms-nodejs route handlers are replaced on the raw allRoutes
// module BEFORE site.js is required, and the cliBridge export of the
// haxcms-nodejs dist cli.js (dynamically imported by site.js) is replaced
// with a recorder BEFORE site.js is required (babel's dynamic-import
// transform snapshots it into the interop copy on first call).
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-more-'))
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
const outros = []
stub.outro = (msg) => { outros.push(String(msg)) }
stub.cancel = (msg) => { /* quiet */ }
stub.spinner = () => ({ start() {}, stop() {} })
let groupResponse = { action: 'quit' }
stub.group = async () => groupResponse
stub.select = async () => null
stub.text = async () => 'placeholder'
stub.confirm = async () => true

// silence structured logging output
const logging = require('../../src/lib/logging.js')
logging.log = () => {}

// --- patched haxcms-nodejs route handlers (BEFORE site.js is required) ---
const allRoutesModule = require('@haxtheweb/haxcms-nodejs/dist/lib/allRoutes.js')
const allRoutes = allRoutesModule.allRoutes
const routeHandlerCalls = []
function recordAndRespond(name, payloadFactory) {
  return (req, res) => {
    routeHandlerCalls.push({ name, body: req.body, query: req.query, params: req.params })
    res.status(200)
    res.json(payloadFactory())
  }
}
allRoutes.site.map.get['v1/files'] = recordAndRespond('v1/files', () => ({
  status: 200,
  data: { files: ['a.png', 'b.jpg'] },
}))
allRoutes.site.map.get['v1/search'] = recordAndRespond('v1/search', () => ({
  status: 200,
  data: { items: [{ title: 'result' }] },
}))
allRoutes.site.map.get['v1/tags'] = recordAndRespond('v1/tags', () => ({
  status: 200,
  data: { tags: ['intro', 'lesson'] },
}))
allRoutes.site.map.get['v1/blocks'] = recordAndRespond('v1/blocks', () => ({
  status: 200,
  data: { blocks: ['video'] },
}))
allRoutes.site.map.get['v1/analytics'] = recordAndRespond('v1/analytics', () => ({
  status: 200,
  data: { analytics: { pages: 2 } },
}))
// mutable so the failure path can be driven per test; the route response
// envelope is {status, data: {skeleton, filename}} as read by the branch
let skeletonExportPayload = {
  status: 200,
  data: {
    skeleton: { meta: { name: 'exported' }, site: {}, build: { items: [] } },
    filename: 'exported-skeleton.json',
  },
}
allRoutes.system.map.post['sites/:siteName/download-skeleton'] = recordAndRespond(
  'download-skeleton',
  () => skeletonExportPayload,
)
allRoutes.system.map.post['sites/:siteName/save-as-template'] = recordAndRespond(
  'save-as-template',
  () => ({ status: 200, data: { name: 'saved-template', machineName: 'saved-template' } }),
)
allRoutes.system.map.post['actions/html-to-md'] = recordAndRespond('html-to-md', () => ({
  status: 200,
  data: { contents: '# markdown output' },
}))

// --- patched cliBridge (BEFORE site.js is required) ---
const cliModule = require('@haxtheweb/haxcms-nodejs/dist/cli.js')
const cliBridgeCalls = []
let cliBridgeResponse = { res: { statusCode: 200, status: 200, data: { status: 200 } } }
cliModule.cliBridge = async (route, body, method, fileObj) => {
  cliBridgeCalls.push({ route, body, method, fileObj })
  return cliBridgeResponse
}

// --- fake active HAXsite served by the patched systemStructureContext ---
const SITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-more-site-'))
// static-publish fixtures: ghpages.html swap + build/ + wc-registry cleanup
fs.writeFileSync(path.join(SITE_DIR, 'index.html'), 'original index')
fs.writeFileSync(path.join(SITE_DIR, 'ghpages.html'), 'ghpages entry')
fs.mkdirSync(path.join(SITE_DIR, 'build'), { recursive: true })
fs.writeFileSync(path.join(SITE_DIR, 'build', 'artifact.js'), 'x')
fs.writeFileSync(path.join(SITE_DIR, 'wc-registry.json'), '{}')
fs.mkdirSync(path.join(SITE_DIR, 'assets'), { recursive: true })
fs.writeFileSync(path.join(SITE_DIR, 'assets', 'babel-polyfill.js'), 'x')
// site:element + theme flows write into custom/src
fs.mkdirSync(path.join(SITE_DIR, 'custom', 'src'), { recursive: true })

const updateNodeCalls = []
const writeLocationCalls = []
const fakeItems = [
  { id: 'item-1', title: 'Page One', indent: 0, parent: null, order: 1, slug: 'page-one', location: 'pages/page-1/index.html', metadata: {} },
  { id: 'item-2', title: 'Page Two', indent: 1, parent: 'item-1', order: 2, slug: 'page-two', location: 'pages/page-2/index.html', metadata: {} },
]
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
    findBranch(id) { return fakeItems.filter((item) => item.id === id) },
    orderTree(items) { return items },
    save() {},
  },
  loadNode(id) {
    const item = fakeItems.find((entry) => entry.id === id)
    if (!item) { return undefined }
    return {
      ...item,
      writeLocation: async (content) => {
        writeLocationCalls.push(content)
        return true
      },
    }
  },
  async getPageContent(page) {
    return '<p>hello world</p><my-widget title="w">deep content</my-widget>'
  },
  async updateNode(page) {
    updateNodeCalls.push(JSON.parse(JSON.stringify(page)))
    return { res: { statusCode: 200, data: { status: 200 } } }
  },
}
const haxcmsLib = require('@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js')
haxcmsLib.systemStructureContext = async () => fakeHaxsite
haxcmsLib.HAXCMS.getThemes = async () => ({
  'clean-one': { element: 'clean-one', path: './themes/clean-one.js', name: 'CleanOne' },
})

// --- no real subprocesses (module-load version probes included) ---
const utils = require('../../src/lib/utils.js')
const execCalls = []
utils.exec = async (cmd, cmdOpts) => {
  execCalls.push({ cmd, opts: cmdOpts })
  return { stdout: '', stderr: '' }
}
utils.interactiveExec = async (cmd, args, cmdOpts) => {
  execCalls.push({ cmd: `${cmd} ${args.join(' ')}`, opts: cmdOpts })
}

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')
const { siteCommandDetected } = available ? siteModule : {}

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
    // failure paths set process.exitCode; never let it leak into the runner
    process.exitCode = 0
  }
}

function resetMocks() {
  execCalls.length = 0
  intros.length = 0
  notes.length = 0
  outros.length = 0
  routeHandlerCalls.length = 0
  cliBridgeCalls.length = 0
  updateNodeCalls.length = 0
  writeLocationCalls.length = 0
  groupResponse = { action: 'quit' }
  skeletonExportPayload = {
    status: 200,
    data: {
      skeleton: { meta: { name: 'exported' }, site: {}, build: { items: [] } },
      filename: 'exported-skeleton.json',
    },
  }
  cliBridgeResponse = { res: { statusCode: 200, status: 200, data: { status: 200 } } }
}

const calledRoute = (name) => routeHandlerCalls.find((call) => call.name === name)

// --- site-scoped GET routes ---

test('site:list-files and site:file-list hit the v1/files route for the active site', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'site:list-files' },
    options: { quiet: true, i: true },
  })
  assert.equal(exitCode, 0)
  assert.ok(calledRoute('v1/files'), 'v1/files route invoked')
  assert.equal(calledRoute('v1/files').query.siteName, 'fakesite')
  // the alias case label drives the same route
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'site:file-list' },
    options: { quiet: true, i: true },
  })
  assert.ok(calledRoute('v1/files'), 'alias also invokes v1/files')
})

test('site:search forwards the query, fields, and limit to the v1/search route', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'site:search' },
    options: { quiet: true, i: true, search: 'lesson', searchField: 'title,slug', searchLimit: '10' },
  })
  const call = calledRoute('v1/search')
  assert.ok(call, 'v1/search route invoked')
  assert.equal(call.query.q, 'lesson')
  assert.equal(call.query.fields, 'title,slug')
  assert.equal(call.query['page.limit'], '10')
  assert.equal(call.query.siteName, 'fakesite')
})

test('site:tags, site:blocks, and site:analytics hit their routes', opts, async () => {
  resetMocks()
  for (const action of ['site:tags', 'site:blocks', 'site:analytics']) {
    routeHandlerCalls.length = 0
    await runSite({
      command: 'site',
      arguments: { action },
      options: { quiet: true, i: true },
    })
    assert.ok(routeHandlerCalls.length >= 1, `${action} invoked a route`)
    assert.equal(routeHandlerCalls[0].query.siteName, 'fakesite')
  }
})

// --- skeleton export / install ---

test('site:skeleton-export writes the exported skeleton to --to-file', opts, async () => {
  resetMocks()
  const target = path.join(os.tmpdir(), 'hax-skel-export-test.json')
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'site:skeleton-export' },
    options: { quiet: false, i: true, toFile: target },
  })
  assert.equal(exitCode, 0)
  assert.ok(calledRoute('download-skeleton'), 'download-skeleton route invoked')
  const written = JSON.parse(fs.readFileSync(target, 'utf8'))
  assert.equal(written.meta.name, 'exported')
  assert.ok(outros.some((m) => m.includes('Skeleton exported to')), 'success outro recorded')
  fs.rmSync(target, { force: true })
})

test('site:skeleton-export reports the failure when the route errors', opts, async () => {
  resetMocks()
  skeletonExportPayload = { status: 500, data: { message: 'nope' } }
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'site:skeleton-export' },
    options: { quiet: false, i: true },
  })
  assert.equal(exitCode, 0)
  assert.ok(outros.some((m) => m.includes('Failed to export skeleton')), 'failure outro recorded')
})

test('site:skeleton-install with --skeleton-file installs it for the user', opts, async () => {
  resetMocks()
  const skeletonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-skel-install-'))
  const skeletonPath = path.join(skeletonDir, 'installable.json')
  fs.writeFileSync(
    skeletonPath,
    JSON.stringify({
      meta: { name: 'Installable Template' },
      site: {},
      build: { structure: 'from-skeleton', type: 'skeleton', items: [], files: [] },
    }),
  )
  // HAXCMS.configDirectory points into node_modules by default; redirect it
  // to a temp dir (snapshot + restore) so the install writes nowhere else —
  // the same pattern as site-skeleton.test.cjs
  const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-skel-install-cfg-'))
  const origConfigDir = haxcmsLib.HAXCMS.configDirectory
  haxcmsLib.HAXCMS.configDirectory = configRoot
  try {
    const exitCode = await runSite({
      command: 'site',
      arguments: { action: 'site:skeleton-install' },
      options: { quiet: true, i: true, skeletonFile: skeletonPath },
    })
    assert.equal(exitCode, 0)
    const skeletonsDir = path.join(configRoot, 'user', 'skeletons')
    const installed = fs.readdirSync(skeletonsDir)
    assert.equal(installed.length, 1, 'skeleton installed into user skeletons dir')
    assert.ok(installed[0].endsWith('.json'))
  } finally {
    haxcmsLib.HAXCMS.configDirectory = origConfigDir
    fs.rmSync(skeletonDir, { recursive: true, force: true })
    fs.rmSync(configRoot, { recursive: true, force: true })
  }
})

test('site:skeleton-install without a file saves the active site as a template', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'site:skeleton-install' },
    options: { quiet: false, i: true },
  })
  assert.equal(exitCode, 0)
  assert.ok(calledRoute('save-as-template'), 'save-as-template route invoked')
  assert.ok(outros.some((m) => m.includes('Template installed as saved-template')), 'install outro recorded')
})

// --- sync / rsync ---

test('site:sync pulls and pushes the site repo', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'site:sync' },
    options: { quiet: true, i: true },
  })
  assert.ok(
    execCalls.some((c) => c.cmd === `cd ${SITE_DIR} && git pull && git push`),
    'git pull/push executed',
  )
})

test('site:rsync builds the rsync command from the CLI options', opts, async () => {
  resetMocks()
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-rsync-dest-'))
  try {
    const exitCode = await runSite({
      command: 'site',
      arguments: { action: 'site:rsync' },
      options: {
        quiet: true,
        i: false,
        y: true,
        source: SITE_DIR,
        destination,
        exclude: 'node_modules,dist',
        dryRun: true,
      },
    })
    assert.equal(exitCode, 0)
    const rsync = execCalls.find((c) => c.cmd.includes('rsync -avz'))
    assert.ok(rsync, 'rsync executed')
    assert.ok(rsync.cmd.includes('--dry-run'), 'dry run flag included')
    assert.ok(rsync.cmd.includes('--exclude node_modules --exclude dist'), 'exclude patterns included')
    assert.ok(rsync.cmd.includes(`${SITE_DIR}/ ${destination}`), 'source with trailing slash + destination')
  } finally {
    fs.rmSync(destination, { recursive: true, force: true })
  }
})

// --- theme / element ---

test('site:theme switches to a known core theme and saves the manifest', opts, async () => {
  resetMocks()
  fakeHaxsite.manifest.save = () => { fakeHaxsite.manifest.__saved = true }
  await runSite({
    command: 'site',
    arguments: { action: 'site:theme' },
    options: { quiet: true, i: true, theme: 'clean-one' },
  })
  assert.equal(fakeHaxsite.manifest.metadata.theme.element, 'clean-one')
  assert.ok(fakeHaxsite.manifest.__saved, 'manifest saved')
})

test('site:theme records an unknown theme as a custom entry', opts, async () => {
  resetMocks()
  fakeHaxsite.manifest.__saved = false
  await runSite({
    command: 'site',
    arguments: { action: 'site:theme' },
    options: { quiet: true, i: true, theme: 'brand-new-theme' },
  })
  assert.equal(fakeHaxsite.manifest.metadata.theme.element, 'brand-new-theme')
  assert.equal(fakeHaxsite.manifest.metadata.theme.name, 'BrandNewTheme')
  assert.ok(fakeHaxsite.manifest.__saved, 'manifest saved')
})

test('site:element writes the rendered element into custom/src', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'site:element' },
    options: { quiet: true, i: true, name: 'brand-new-el' },
  })
  assert.equal(exitCode, 0)
  const elementPath = path.join(SITE_DIR, 'custom', 'src', 'brand-new-el.js')
  assert.ok(fs.existsSync(elementPath), 'element file written')
  assert.ok(fs.readFileSync(elementPath, 'utf8').includes('brand-new-el'), 'rendered into the file')
  assert.ok(notes.some((n) => n.includes('Add to another web component')), 'usage note recorded')
})

// --- surge / netlify / vercel publish flows ---

for (const publisher of ['surge', 'netlify', 'vercel']) {
  test(`site:${publisher} prepares the static site, publishes, and restores index.html`, opts, async () => {
    resetMocks()
    const exitCode = await runSite({
      command: 'site',
      arguments: { action: `site:${publisher}` },
      options: { quiet: true, i: true, y: true, domain: 'my-site.example.com' },
    })
    assert.equal(exitCode, 0)
    const publish = execCalls.find((c) => c.cmd.includes(publisher))
    assert.ok(publish, `${publisher} publish executed`)
    // the publish swapped ghpages.html in; the finally block restored it
    // (restore copies the .bak back over index.html and removes the .bak)
    assert.equal(fs.readFileSync(path.join(SITE_DIR, 'index.html'), 'utf8'), 'original index')
    assert.ok(!fs.existsSync(path.join(SITE_DIR, 'index.html.bak')), 'backup cleaned up by restore')
    // local build artifacts were cleaned for the static publish
    assert.ok(!fs.existsSync(path.join(SITE_DIR, 'wc-registry.json')), 'wc-registry removed')
  })
}

// --- surge 0.40+ grammar: scripted / interactive publish targeting ---
// surge 0.40 stopped publishing on a bare `surge .` (it only prints project
// info now), so the publish flow must always resolve a target: --domain,
// then the domain surge remembered in the project's CNAME, then (with --y)
// the deterministic haxcli-<name>.surge.sh default for scripted first publishes

test('site:surge --y without --domain or CNAME publishes to the haxcli- default domain', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'site:surge' },
    options: { quiet: true, i: true, y: true },
  })
  assert.equal(exitCode, 0)
  const publish = execCalls.find((c) => c.cmd.includes('surge .'))
  assert.ok(publish, 'surge publish executed')
  assert.ok(
    publish.cmd.endsWith('surge . haxcli-fakesite.surge.sh'),
    'deterministic haxcli-<name>.surge.sh default used for the scripted first publish',
  )
})

test('site:surge --y republishes to the domain remembered in the project CNAME', opts, async () => {
  resetMocks()
  fs.writeFileSync(path.join(SITE_DIR, 'CNAME'), 'previous-domain.surge.sh\n')
  try {
    const exitCode = await runSite({
      command: 'site',
      arguments: { action: 'site:surge' },
      options: { quiet: true, i: true, y: true },
    })
    assert.equal(exitCode, 0)
    const publish = execCalls.find((c) => c.cmd.includes('surge .'))
    assert.ok(publish, 'surge publish executed')
    assert.ok(
      publish.cmd.endsWith('surge . previous-domain.surge.sh'),
      'CNAME-remembered domain wins over the haxcli- default',
    )
  } finally {
    fs.rmSync(path.join(SITE_DIR, 'CNAME'), { force: true })
  }
})

test('site:surge interactive first publish uses the surge 0.40 publish verb, not a bare surge .', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'site:surge' },
    options: { quiet: true, i: true },
  })
  assert.equal(exitCode, 0)
  // the interactiveExec mock records `${cmd} ${args.join(' ')}`; on
  // surge >= 0.40 a bare `surge .` only prints project info instead of
  // publishing, so the first interactive publish needs the publish verb
  assert.ok(
    execCalls.some((c) => c.cmd === 'surge . publish'),
    'surge . publish invoked for the interactive no-domain publish',
  )
})

test('site:surge interactive republish passes the CNAME domain through without prompting', opts, async () => {
  resetMocks()
  fs.writeFileSync(path.join(SITE_DIR, 'CNAME'), 'previous-domain.surge.sh')
  try {
    const exitCode = await runSite({
      command: 'site',
      arguments: { action: 'site:surge' },
      options: { quiet: true, i: true },
    })
    assert.equal(exitCode, 0)
    assert.ok(
      execCalls.some((c) => c.cmd === 'surge . previous-domain.surge.sh'),
      'CNAME domain passed as the publish target (path + domain publishes unprompted)',
    )
  } finally {
    fs.rmSync(path.join(SITE_DIR, 'CNAME'), { force: true })
  }
})

// --- setup scaffolds ---

test('setup:github-actions copies the workflow into the site', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'setup:github-actions' },
    options: { quiet: true, i: true, y: true },
  })
  assert.equal(exitCode, 0)
  const workflow = path.join(SITE_DIR, '.github', 'workflows', 'deploy.yml')
  assert.ok(fs.existsSync(workflow), 'workflow file created')
})

test('setup:gitlab-ci copies the CI file into the site', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'setup:gitlab-ci' },
    options: { quiet: true, i: true, y: true },
  })
  assert.equal(exitCode, 0)
  assert.ok(fs.existsSync(path.join(SITE_DIR, '.gitlab-ci.yml')), 'CI file created')
})

// --- site:html / site:md / site:schema ---

test('site:html writes the whole site as HTML to --to-file', opts, async () => {
  resetMocks()
  const target = path.join(os.tmpdir(), 'hax-site-html-test.html')
  await runSite({
    command: 'site',
    arguments: { action: 'site:html' },
    options: { quiet: true, i: true, toFile: target },
  })
  const contents = fs.readFileSync(target, 'utf8')
  assert.ok(contents.includes('<h1>Page One</h1>'), 'first page title included')
  assert.ok(contents.includes('hello world'), 'page content included')
  fs.rmSync(target, { force: true })
})

test('site:md converts the site HTML through the html-to-md route', opts, async () => {
  resetMocks()
  const target = path.join(os.tmpdir(), 'hax-site-md-test.md')
  await runSite({
    command: 'site',
    arguments: { action: 'site:md' },
    options: { quiet: true, i: true, toFile: target },
  })
  assert.ok(calledRoute('html-to-md'), 'html-to-md route invoked')
  assert.equal(fs.readFileSync(target, 'utf8'), '# markdown output')
  fs.rmSync(target, { force: true })
})

test('site:schema converts the site into HAX element schema', opts, async () => {
  resetMocks()
  const target = path.join(os.tmpdir(), 'hax-site-schema-test.json')
  await runSite({
    command: 'site',
    arguments: { action: 'site:schema' },
    options: { quiet: true, i: true, toFile: target },
  })
  const els = JSON.parse(fs.readFileSync(target, 'utf8'))
  assert.ok(els.some((el) => el.tag === 'h1' && el.content === 'Page One'), 'page headings included')
  assert.ok(els.some((el) => el.tag === 'my-widget'), 'content elements converted')
  fs.rmSync(target, { force: true })
})

// --- node operations ---

test('node:edit updates a plain field through updateNode', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'node:edit' },
    options: { quiet: true, i: true, itemId: 'item-1', nodeOp: 'title', title: 'Renamed Page' },
  })
  assert.equal(updateNodeCalls.length, 1)
  assert.equal(updateNodeCalls[0].title, 'Renamed Page')
})

test('node:edit updates metadata tags', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'node:edit' },
    options: { quiet: true, i: true, itemId: 'item-1', nodeOp: 'tags', tags: 'intro,lesson' },
  })
  assert.equal(updateNodeCalls.length, 1)
  assert.equal(updateNodeCalls[0].metadata.tags, 'intro,lesson')
})

test('node:edit writes page content through writeLocation', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'node:edit' },
    options: { quiet: true, i: true, itemId: 'item-1', nodeOp: 'content', content: '<p>updated</p>' },
  })
  assert.equal(writeLocationCalls.length, 1)
  assert.equal(writeLocationCalls[0], '<p>updated</p>')
})

test('node:add posts a new item through the cliBridge', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'node:add' },
    options: { quiet: true, i: true, title: 'A New Page', slug: 'a-new-page', order: '3' },
  })
  const call = cliBridgeCalls[0]
  assert.equal(call.route, 'v1/items')
  assert.equal(call.method, 'post')
  assert.equal(call.body.node.title, 'A New Page')
  assert.equal(call.body.node.location, 'a-new-page')
  assert.equal(call.body.order, 3)
})

// --- haxtheweb/issues#3125 / #3126 / #3127 ---

test('node:edit applies several fields at once without prompting (by slug)', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'node:edit' },
    options: {
      quiet: true, i: false, y: true, itemId: 'page-one',
      title: 'Edited Title', description: 'Edited description', order: '5',
      hideInMenu: 'false', content: '<p>edited body</p>',
    },
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(writeLocationCalls, ['<p>edited body</p>'])
  assert.equal(updateNodeCalls.length, 1, 'one site.json update for all fields')
  const saved = updateNodeCalls[0]
  assert.equal(saved.id, 'item-1')
  assert.equal(saved.title, 'Edited Title')
  assert.equal(saved.description, 'Edited description')
  assert.equal(saved.order, 5)
  assert.equal(saved.metadata.hideInMenu, false)
})

test('node:edit non-interactive without --item-id fails instead of prompting', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'node:edit' },
    options: { quiet: true, i: false, y: true, title: 'Anything' },
  })
  assert.equal(exitCode, 1)
  assert.equal(updateNodeCalls.length, 0)
})

test('node:edit non-interactive with nothing to change fails (default title is not an edit)', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'node:edit' },
    options: { quiet: true, i: false, y: true, itemId: 'item-1' },
  })
  assert.equal(exitCode, 1)
  assert.equal(updateNodeCalls.length, 0)
  assert.equal(writeLocationCalls.length, 0)
})

test('node:edit reports an unknown item id or slug', opts, async () => {
  resetMocks()
  const exitCode = await runSite({
    command: 'site',
    arguments: { action: 'node:edit' },
    options: { quiet: true, i: false, y: true, itemId: 'nope', slug: 'x' },
  })
  assert.equal(exitCode, 1)
  assert.equal(updateNodeCalls.length, 0)
})

test('node:add without --order appends after the last sibling', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'node:add' },
    options: { quiet: true, i: true, title: 'Top Level' },
  })
  // top-level siblings: item-1 (order 1)
  assert.equal(cliBridgeCalls[0].body.order, 2)
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'node:add' },
    options: { quiet: true, i: true, title: 'Child', parent: 'page-one' },
  })
  // parent given by slug resolves to item-1; its children: item-2 (order 2)
  assert.equal(cliBridgeCalls[0].body.parent, 'item-1')
  assert.equal(cliBridgeCalls[0].body.order, 3)
})

test('node:add reads --content files as text (not a Buffer)', opts, async () => {
  resetMocks()
  const file = path.join(SITE_DIR, 'probe.html')
  fs.writeFileSync(file, '<h2>From a file</h2>')
  try {
    await runSite({
      command: 'site',
      arguments: { action: 'node:add' },
      options: { quiet: true, i: true, title: 'Probe', content: file, format: 'html' },
    })
    assert.equal(typeof cliBridgeCalls[0].body.node.contents, 'string')
    assert.equal(cliBridgeCalls[0].body.node.contents, '<h2>From a file</h2>')
  } finally {
    fs.rmSync(file, { force: true })
  }
})

test('node:add keeps inline --content when a format is given', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'node:add' },
    options: { quiet: true, i: true, title: 'Inline', content: '<h2>inline</h2>', contentFormat: 'html' },
  })
  assert.equal(cliBridgeCalls[0].body.node.contents, '<h2>inline</h2>')
})

test('node:add exits 1 when the site API reports a failure', opts, async () => {
  resetMocks()
  const previous = cliBridgeResponse
  cliBridgeResponse = { res: { statusCode: 500, data: { status: 500, data: { message: 'nope' } } } }
  try {
    const exitCode = await runSite({
      command: 'site',
      arguments: { action: 'node:add' },
      options: { quiet: true, i: false, y: true, title: 'Fails' },
    })
    assert.equal(exitCode, 1)
  } finally {
    cliBridgeResponse = previous
  }
})

test('node:delete confirms and deletes through the cliBridge', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'node:delete' },
    options: { quiet: true, i: true, y: true, itemId: 'item-2' },
  })
  const call = cliBridgeCalls[0]
  assert.equal(call.route, 'v1/items/item-2')
  assert.equal(call.method, 'delete')
  assert.equal(call.body.node.id, 'item-2')
})

// --- revisions / export / files / search-replace (cliBridge based) ---

test('site:revisions lists revisions for an item', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'site:revisions' },
    options: { quiet: true, i: true, itemId: 'item-1' },
  })
  assert.equal(cliBridgeCalls[0].route, 'v1/items/item-1/revisions')
  assert.equal(cliBridgeCalls[0].method, 'get')
})

test('site:revisions restores a revision non-interactively', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'site:revisions' },
    options: { quiet: true, i: true, y: true, itemId: 'item-1', restore: true, revisionId: 'abc123' },
  })
  assert.equal(cliBridgeCalls[0].route, 'v1/items/item-1/revisions/abc123/restore')
  assert.equal(cliBridgeCalls[0].method, 'post')
})

test('site:export html writes the downloaded document to --to-file', opts, async () => {
  resetMocks()
  cliBridgeResponse = { res: { statusCode: 200, status: 200, data: '<html>exported site</html>' } }
  const target = path.join(os.tmpdir(), 'hax-site-export-test.html')
  await runSite({
    command: 'site',
    arguments: { action: 'site:export' },
    options: { quiet: false, i: true, y: true, exportFormat: 'html', toFile: target },
  })
  assert.equal(cliBridgeCalls[0].route, 'v1/site/export/html')
  assert.equal(fs.readFileSync(target, 'utf8'), '<html>exported site</html>')
  assert.ok(outros.some((m) => m.includes('Exported to')), 'export outro recorded')
  fs.rmSync(target, { force: true })
})

test('site:export markdown writes the JSON descriptor to --to-file', opts, async () => {
  resetMocks()
  cliBridgeResponse = {
    res: { statusCode: 200, status: 200, data: { export: { href: '/download/x.md' } } },
  }
  const target = path.join(os.tmpdir(), 'hax-site-export-test.json')
  await runSite({
    command: 'site',
    arguments: { action: 'site:export' },
    options: { quiet: true, i: true, y: true, exportFormat: 'markdown', toFile: target },
  })
  assert.equal(cliBridgeCalls[0].route, 'v1/site/export/markdown')
  const descriptor = JSON.parse(fs.readFileSync(target, 'utf8'))
  assert.equal(descriptor.export.href, '/download/x.md')
  fs.rmSync(target, { force: true })
})

test('site:search-replace patches content with confirmed replacements', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'site:search-replace' },
    options: { quiet: true, i: true, y: true, search: 'old text', replace: 'new text' },
  })
  const call = cliBridgeCalls[0]
  assert.equal(call.route, 'v1/content')
  assert.equal(call.method, 'patch')
  assert.equal(call.body.search, 'old text')
  assert.equal(call.body.replace, 'new text')
  assert.equal(call.body.replaceConfirm, true)
})

test('site:files-delete removes a file through the cliBridge', opts, async () => {
  resetMocks()
  await runSite({
    command: 'site',
    arguments: { action: 'site:files-delete' },
    options: { quiet: true, i: true, y: true, fileUuid: 'uuid-1234' },
  })
  assert.equal(cliBridgeCalls[0].route, 'v1/files/uuid-1234')
  assert.equal(cliBridgeCalls[0].method, 'delete')
})

test('site:files-upload uploads a single file through the cliBridge', opts, async () => {
  resetMocks()
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-files-upload-'))
  const source = path.join(uploadDir, 'diagram.png')
  fs.writeFileSync(source, 'not-really-a-png')
  try {
    await runSite({
      command: 'site',
      arguments: { action: 'site:files-upload' },
      options: { quiet: true, i: true, source },
    })
    const call = cliBridgeCalls[0]
    assert.equal(call.route, 'v1/files')
    assert.equal(call.method, 'post')
    assert.equal(call.fileObj.originalname, 'diagram.png')
    assert.equal(call.fileObj.size, fs.statSync(source).size)
  } finally {
    fs.rmSync(uploadDir, { recursive: true, force: true })
  }
})
