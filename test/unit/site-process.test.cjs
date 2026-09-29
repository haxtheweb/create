'use strict'

// Covers siteProcess() in src/lib/programs/site.js (the exported site-creation
// orchestration) including the private customSiteTheme() flow it triggers:
// plain creation, launch extra, git init extra, custom theme creation, the
// skeleton machine-name/file request building, the conflicting-sources
// errors, and the --import-site platform/docx import flows.
//
// Mocking: the system `sites` and import route handlers are replaced on the
// raw haxcms-nodejs allRoutes module BEFORE site.js is required (site.js binds
// via babel namespace snapshots at load); systemStructureContext is patched
// to a fake activeHaxsite (customSiteTheme re-reads it at its end);
// utils.exec/utils.spawn are monkey-patched so nothing shells out;
// @clack/prompts is patched via the shared clack stub; log() is silenced.
// siteProcess never calls process.exit, so no exit sentinel is needed.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-process-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME
fs.mkdirSync(path.join(ISOLATED_HOME, '.haxtheweb'), { recursive: true })

const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

stub.intro = (msg) => { /* quiet */ }
const notes = []
stub.note = (msg) => { notes.push(String(msg)) }
const outros = []
stub.outro = (msg) => { outros.push(String(msg)) }
stub.spinner = () => ({ start() {}, stop() {} })

// silence structured logging output
const logging = require('../../src/lib/logging.js')
logging.log = () => {}

// patch route handlers BEFORE the canary requires site.js
const allRoutesModule = require('@haxtheweb/haxcms-nodejs/dist/lib/allRoutes.js')
const allRoutes = allRoutesModule.allRoutes
const sitesHandlerCalls = []
let sitesHandlerResponse = { status: 200, data: { name: 'created' } }
allRoutes.system.map.post['sites'] = (req, res) => {
  sitesHandlerCalls.push(JSON.parse(JSON.stringify(req.body)))
  res.status(200)
  res.json(sitesHandlerResponse)
}
const importHandlerCalls = []
allRoutes.system.map.post['site/import/:platform'] = (req, res) => {
  importHandlerCalls.push({ body: req.body, params: req.params })
  res.status(200)
  res.json({
    status: 200,
    data: {
      items: [{ id: 'imp-1', title: 'Imported Page', order: 1, indent: 0, parent: null }],
      files: ['files/imported.png'],
      site: { license: 'CC-BY-4.0' },
    },
  })
}
allRoutes.system.map.post['actions/import-docx'] = (req, res) => {
  importHandlerCalls.push({ body: req.body, params: req.params })
  res.status(200)
  res.json({
    status: 200,
    data: { items: [{ id: 'docx-1', title: 'Docx Page', order: 1, indent: 0, parent: null }] },
  })
}

// fake activeHaxsite for customSiteTheme's systemStructureContext() call
const manifestSaves = []
const fakeHaxsite = {
  name: 'fakesite',
  directory: '/tmp/fakesite',
  manifest: {
    metadata: { site: {}, theme: {} },
    save() { manifestSaves.push(true) },
  },
}
const haxcmsLib = require('@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js')
haxcmsLib.systemStructureContext = async () => fakeHaxsite

// no real subprocesses
const utils = require('../../src/lib/utils.js')
const execCalls = []
utils.exec = async (cmd, cmdOpts) => {
  execCalls.push({ cmd, opts: cmdOpts })
  return { stdout: 'git-user', stderr: '' }
}
const spawnCalls = []
utils.spawn = (cmd, args, spawnOpts) => {
  const record = { cmd, args, opts: spawnOpts, handlers: {} }
  spawnCalls.push(record)
  return {
    on(event, cb) {
      record.handlers[event] = cb
      if (event === 'exit') {
        setTimeout(() => cb(0, null), 0)
      }
      return this
    },
  }
}

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')
const { siteProcess } = available ? siteModule : {}

execCalls.length = 0

const opts = { skip: skipReason, timeout: 30000 }

// creates the site directory skeleton so the dotfile/theme copies succeed
function makeSiteDir(root, name) {
  const siteDir = path.join(root, name)
  fs.mkdirSync(path.join(siteDir, 'custom', 'src'), { recursive: true })
  return siteDir
}

function resetMocks() {
  sitesHandlerCalls.length = 0
  importHandlerCalls.length = 0
  execCalls.length = 0
  spawnCalls.length = 0
  manifestSaves.length = 0
  notes.length = 0
  outros.length = 0
  sitesHandlerResponse = { status: 200, data: { name: 'created' } }
}

test('plain site creation posts the site request and writes the dotfiles', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-proc-plain-'))
  try {
    const siteDir = makeSiteDir(root, 'plain-site')
    await siteProcess(
      { command: 'site', arguments: {}, options: { quiet: true, npmClient: 'npm', i: false } },
      { name: 'plain-site', type: 'site', path: root, theme: 'clean-one', extras: [] },
    )
    assert.equal(sitesHandlerCalls.length, 1)
    const siteRequest = sitesHandlerCalls[0]
    assert.equal(siteRequest.site.name, 'plain-site')
    assert.equal(siteRequest.site.theme, 'clean-one')
    assert.equal(siteRequest.site.description, 'own course')
    assert.equal(siteRequest.build.structure, 'course')
    assert.equal(siteRequest.build.type, 'own')
    // dotfiles are ensured for the new site
    for (const dotfile of ['.gitignore', '.npmignore', '.surgeignore', '.netlifyignore', '.vercelignore']) {
      assert.ok(fs.existsSync(path.join(siteDir, dotfile)), `${dotfile} copied`)
    }
    // no extras and quiet: no launch, no git, no next-steps outro
    assert.equal(spawnCalls.length, 0)
    assert.equal(execCalls.length, 0)
    assert.equal(outros.length, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('launch extra summons the local haxcms-nodejs server', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-proc-launch-'))
  try {
    makeSiteDir(root, 'launch-site')
    await siteProcess(
      { command: 'site', arguments: {}, options: { quiet: true, npmClient: 'npm', i: false } },
      { name: 'launch-site', type: 'site', path: root, theme: 'clean-one', extras: ['launch'] },
    )
    assert.equal(spawnCalls.length, 1)
    assert.equal(spawnCalls[0].opts.cwd, path.join(root, 'launch-site'))
    assert.equal(spawnCalls[0].opts.env.HOST, '127.0.0.1')
    assert.equal(spawnCalls[0].opts.env.HAXCMS_DISABLE_JWT_CHECKS, 'true')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('gitRepo extra initializes the repo with a remote', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-proc-git-'))
  try {
    makeSiteDir(root, 'git-site')
    await siteProcess(
      { command: 'site', arguments: {}, options: { quiet: true, npmClient: 'npm', i: false } },
      {
        name: 'git-site',
        type: 'site',
        path: root,
        theme: 'clean-one',
        extras: [],
        gitRepo: 'https://github.com/tester/git-site.git',
      },
    )
    const gitInit = execCalls.find((c) => c.cmd.includes('git init'))
    assert.ok(gitInit, 'git init executed')
    assert.ok(gitInit.cmd.includes('git remote add origin https://github.com/tester/git-site.git'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('custom theme request renders the theme template and updates the manifest', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-proc-theme-'))
  try {
    makeSiteDir(root, 'themed-site')
    await siteProcess(
      { command: 'site', arguments: {}, options: { quiet: true, npmClient: 'npm', i: false } },
      {
        name: 'themed-site',
        type: 'site',
        path: root,
        theme: 'custom-theme',
        customThemeName: 'custom-cool-theme',
        customThemeTemplate: 'base',
        extras: [],
      },
    )
    const siteDir = path.join(root, 'themed-site')
    const themeFile = path.join(siteDir, 'custom', 'src', 'custom-cool-theme.js')
    assert.ok(fs.existsSync(themeFile), 'theme file written')
    // custom.js gains the import of the new theme
    assert.ok(
      fs.readFileSync(path.join(siteDir, 'custom', 'src', 'custom.js'), 'utf8').includes(
        'import "./custom-cool-theme.js";',
      ),
      'custom.js import appended',
    )
    // manifest theme swapped to the custom theme and saved
    assert.equal(fakeHaxsite.manifest.metadata.theme.element, 'custom-cool-theme')
    assert.ok(manifestSaves.length >= 1, 'manifest saved')
    // install/build command issued for the theme
    assert.ok(
      execCalls.some((c) => c.cmd === `cd ${siteDir}/custom/ && npm install && npm run build && npm run analyze && cd ${siteDir}`),
      'theme install command executed',
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('skeleton machine name builds a from-skeleton site request', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-proc-skel-'))
  try {
    makeSiteDir(root, 'skeleton-site')
    await siteProcess(
      {
        command: 'site',
        arguments: {},
        options: { quiet: true, npmClient: 'npm', i: false, skeletonMachineName: 'My Course Template' },
      },
      { name: 'skeleton-site', type: 'site', path: root, theme: 'clean-one', extras: [] },
    )
    const siteRequest = sitesHandlerCalls[0]
    assert.equal(siteRequest.build.structure, 'from-skeleton')
    assert.equal(siteRequest.build.type, 'skeleton')
    assert.deepEqual(siteRequest.build.items, [])
    assert.deepEqual(siteRequest.build.files, [])
    assert.ok(siteRequest.build.skeletonMachineName.length > 0, 'machine name normalized')
    assert.ok(/^[a-z0-9-]+$/.test(siteRequest.build.skeletonMachineName))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('skeleton file data is applied to the site request', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-proc-skelfile-'))
  const skeletonPath = path.join(root, 'template.json')
  fs.writeFileSync(
    skeletonPath,
    JSON.stringify({
      meta: { name: 'Test Skeleton', machineName: 'test-skeleton' },
      site: { theme: 'clean-two', description: 'A skeleton based site', license: 'MIT' },
      build: {
        structure: 'from-skeleton',
        type: 'skeleton',
        items: [
          {
            id: 'sk-1',
            title: 'Skeleton Page',
            order: 1,
            indent: 0,
            parent: null,
            slug: 'skeleton-page',
            location: 'pages/sk-1/index.html',
          },
        ],
        files: ['files/img.png'],
      },
    }),
  )
  try {
    makeSiteDir(root, 'skelfile-site')
    await siteProcess(
      { command: 'site', arguments: {}, options: { quiet: true, npmClient: 'npm', i: false, skeletonFile: skeletonPath } },
      { name: 'skelfile-site', type: 'site', path: root, theme: 'clean-one', extras: [] },
    )
    const siteRequest = sitesHandlerCalls[0]
    assert.equal(siteRequest.build.structure, 'from-skeleton')
    assert.equal(siteRequest.site.theme, 'clean-two', 'skeleton theme applied')
    assert.equal(siteRequest.site.description, 'A skeleton based site', 'skeleton description applied')
    assert.equal(siteRequest.site.license, 'MIT', 'skeleton license applied via applyImportedSiteMetadata')
    assert.equal(siteRequest.build.items[0].title, 'Skeleton Page')
    assert.deepEqual(siteRequest.build.files, ['files/img.png'])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('conflicting skeleton sources and skeleton+import both reject', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-proc-conflict-'))
  try {
    makeSiteDir(root, 'conflict-site')
    await assert.rejects(
      () =>
        siteProcess(
          {
            command: 'site',
            arguments: {},
            options: {
              quiet: true,
              npmClient: 'npm',
              skeletonFile: 'template.json',
              skeletonMachineName: 'template',
            },
          },
          { name: 'conflict-site', type: 'site', path: root, extras: [] },
        ),
      /only pass one skeleton source/,
    )
    await assert.rejects(
      () =>
        siteProcess(
          {
            command: 'site',
            arguments: {},
            options: { quiet: true, npmClient: 'npm', skeletonFile: 'template.json', importSite: 'https://x.example' },
          },
          { name: 'conflict-site', type: 'site', path: root, extras: [] },
        ),
      /cannot be combined with --import-site/,
    )
    assert.equal(sitesHandlerCalls.length, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('--import-site with a platform structure imports items, files and site metadata', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-proc-import-'))
  try {
    makeSiteDir(root, 'import-site')
    await siteProcess(
      {
        command: 'site',
        arguments: {},
        options: {
          quiet: true,
          npmClient: 'npm',
          importSite: 'https://source.example/course',
          importStructure: 'htmlToSite',
        },
      },
      { name: 'import-site', type: 'site', path: root, theme: 'clean-one', extras: [] },
    )
    // platform converter route received the repo url + platform param
    assert.equal(importHandlerCalls.length, 1)
    assert.equal(importHandlerCalls[0].body.repoUrl, 'https://source.example/course')
    assert.equal(importHandlerCalls[0].params.platform, 'html')
    // the sites request got the imported items/files and license metadata
    const siteRequest = sitesHandlerCalls[0]
    assert.equal(siteRequest.build.structure, 'import')
    assert.equal(siteRequest.build.items[0].title, 'Imported Page')
    assert.deepEqual(siteRequest.build.files, ['files/imported.png'])
    assert.equal(siteRequest.site.license, 'CC-BY-4.0')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('--import-site with docxToSite routes through the actions import route', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-proc-docx-'))
  try {
    makeSiteDir(root, 'docx-site')
    await siteProcess(
      {
        command: 'site',
        arguments: {},
        options: {
          quiet: true,
          npmClient: 'npm',
          importSite: 'https://source.example/doc.docx',
          importStructure: 'docxToSite',
        },
      },
      { name: 'docx-site', type: 'site', path: root, theme: 'clean-one', extras: [] },
    )
    assert.equal(importHandlerCalls.length, 1)
    assert.equal(importHandlerCalls[0].body.repoUrl, 'https://source.example/doc.docx')
    assert.equal(sitesHandlerCalls[0].build.items[0].title, 'Docx Page')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('an unknown import structure falls through to plain creation', opts, async () => {
  resetMocks()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-proc-unknown-'))
  try {
    makeSiteDir(root, 'unknown-site')
    await siteProcess(
      {
        command: 'site',
        arguments: {},
        options: {
          quiet: true,
          npmClient: 'npm',
          importSite: 'https://source.example/whatever',
          importStructure: 'evolutionToSite',
        },
      },
      { name: 'unknown-site', type: 'site', path: root, theme: 'clean-one', extras: [] },
    )
    assert.equal(importHandlerCalls.length, 0, 'no converter invoked')
    assert.equal(sitesHandlerCalls.length, 1, 'plain sites request still issued')
    assert.equal(sitesHandlerCalls[0].build.structure, 'course')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
