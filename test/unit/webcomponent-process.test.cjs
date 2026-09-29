'use strict'

// Covers webcomponentProcess() in src/lib/programs/webcomponent.js — the
// scaffold orchestration (template copy, dotfile + name renames, ejs
// rendering, optional git init, install and launch). HAXCMS.recurseCopy is
// replaced with a mock that materializes a mini template tree (with the
// dotfile names and ejs placeholders the real templates use) into the
// destination, utils.exec is monkey-patched (live writable binding) so no
// real git/npm subprocesses run, and p.spinner/p.note/p.outro are patched
// via the shared clack stub (an un-stopped @clack spinner keeps handles
// open and hangs the process, so it must never be real here).
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-process-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const spinnerStarts = []
stub.spinner = () => ({
  start(msg) { spinnerStarts.push(String(msg)) },
  stop(msg) { /* quiet */ },
})
const notes = []
stub.note = (msg) => { notes.push(String(msg)) }
const outros = []
stub.outro = (msg) => { outros.push(String(msg)) }
stub.intro = (msg) => { /* quiet */ }
stub.text = async (msg) => 'https://github.com/tester/my-cool-el.git'

// no real git/npm subprocesses
const utils = require('../../src/lib/utils.js')
const execCalls = []
utils.exec = async (cmd) => {
  execCalls.push(cmd)
  return { stdout: '', stderr: '' }
}

// replace recurseCopy with a mock that builds the mini template tree
const haxcmsLib = require('@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js')
const recurseCalls = []
haxcmsLib.HAXCMS.recurseCopy = async (src, dest) => {
  recurseCalls.push({ src, dest })
  // ejs.render(ejsString, project) exposes the project's properties as
  // top-level locals, so templates reference `name` / `className` directly
  const files = {
    '_github/workflow.yml': 'name: <%= name %>\n',
    _gitignore: 'node_modules\n',
    _dddignore: '/dist\n',
    _editorconfig: 'root = true\n',
    '_vscode/settings.json': '{}\n',
    _nojekyll: '',
    _npmignore: 'node_modules\n',
    _surgeignore: 'CNAME\n',
    '_travis.yml': 'language: node_js\n',
    'webcomponent.js': 'export class <%= className %> extends HTMLElement {}\n',
    'lib/webcomponent.haxProperties.json': '{"tag": "<%= name %>"}\n',
    'locales/webcomponent.es.json': '{"name": "<%= name %>"}\n',
    'test/webcomponent.test.js': "import '../<%= name %>.js';\n",
    'image.jpg': 'not-an-ejs-template',
  }
  fs.mkdirSync(dest, { recursive: true })
  for (const rel of Object.keys(files)) {
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true })
    fs.writeFileSync(path.join(dest, rel), files[rel])
  }
}

const { probeModule } = require('../_helpers/module-canary.cjs')
const { available, skipReason, module: wcModule } = probeModule('src/lib/programs/webcomponent.js')
const { webcomponentProcess } = available ? wcModule : {}

const opts = { skip: skipReason, timeout: 30000 }

function makeCommandRun(options) {
  return { command: 'webcomponent', arguments: {}, options }
}

test('copies templates, renames dotfiles and element names, and renders ejs', opts, async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-proj-'))
  // drop the module-load `which git` probe recorded during the canary require
  execCalls.length = 0
  outros.length = 0
  try {
    const commandRun = makeCommandRun({ extras: false, npmClient: 'npm', quiet: false })
    const project = {
      name: 'my-cool-el',
      type: 'webcomponent',
      path: projectRoot,
      author: 'tester',
    }
    await webcomponentProcess(commandRun, project)

    // recurseCopy got the template source for the compliant webcomponent type
    assert.equal(recurseCalls.length, 1)
    assert.ok(recurseCalls[0].src.includes('/templates/webcomponent/compliant/'), recurseCalls[0].src)
    assert.equal(recurseCalls[0].dest, path.join(projectRoot, 'my-cool-el'))

    const scaffold = path.join(projectRoot, 'my-cool-el')
    // dotfiles renamed
    for (const dotfile of [
      '.github/workflow.yml',
      '.gitignore',
      '.dddignore',
      '.editorconfig',
      '.vscode/settings.json',
      '.nojekyll',
      '.npmignore',
      '.surgeignore',
      '.travis.yml',
    ]) {
      assert.ok(fs.existsSync(path.join(scaffold, dotfile)), `${dotfile} renamed`)
    }
    // element-name renames
    assert.ok(fs.existsSync(path.join(scaffold, 'my-cool-el.js')))
    assert.ok(fs.existsSync(path.join(scaffold, 'lib', 'my-cool-el.haxProperties.json')))
    assert.ok(fs.existsSync(path.join(scaffold, 'locales', 'my-cool-el.es.json')))
    assert.ok(fs.existsSync(path.join(scaffold, 'test', 'my-cool-el.test.js')))
    assert.ok(!fs.existsSync(path.join(scaffold, 'webcomponent.js')))

    // ejs rendered project data into the renamed files
    assert.ok(fs.readFileSync(path.join(scaffold, 'my-cool-el.js'), 'utf8').includes('MyCoolEl'))
    assert.equal(
      fs.readFileSync(path.join(scaffold, 'lib', 'my-cool-el.haxProperties.json'), 'utf8'),
      '{"tag": "my-cool-el"}\n',
    )
    // images are skipped by the render loop
    assert.equal(fs.readFileSync(path.join(scaffold, 'image.jpg'), 'utf8'), 'not-an-ejs-template')

    // no extras: no git init, no install, no launch; next steps are noted
    assert.equal(execCalls.length, 0)
    assert.equal(outros.length, 1)
    assert.ok(outros[0].includes('cd'), 'next steps outro recorded')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('launch extra installs dependencies and launches the start script', opts, async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-launch-'))
  execCalls.length = 0
  spinnerStarts.length = 0
  try {
    const commandRun = makeCommandRun({ npmClient: 'yarn', isMonorepo: false })
    const project = {
      name: 'launch-el',
      type: 'webcomponent',
      path: projectRoot,
      author: 'tester',
      extras: ['launch'],
    }
    await webcomponentProcess(commandRun, project)

    const scaffold = path.join(projectRoot, 'launch-el')
    assert.ok(execCalls.some((c) => c === `cd ${scaffold} && yarn install`), 'install ran')
    assert.ok(
      execCalls.some((c) => c === `cd ${scaffold} && yarn start && yarn run analyze`),
      'launch ran',
    )
    assert.ok(notes.some((n) => n.includes('sub-process daemon')), 'launch note recorded')
    assert.ok(spinnerStarts.length >= 2, 'spinner used for copy + install')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('git extra with --auto builds the repo link and initializes git', opts, async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-git-'))
  execCalls.length = 0
  try {
    const commandRun = makeCommandRun({ npmClient: 'npm', auto: true, quiet: false })
    const project = {
      name: 'versioned-el',
      type: 'webcomponent',
      path: projectRoot,
      author: 'tester',
      extras: ['git'],
    }
    await webcomponentProcess(commandRun, project)

    const scaffold = path.join(projectRoot, 'versioned-el')
    const gitInit = execCalls.find((c) => c.includes('git init'))
    assert.ok(gitInit, 'git init executed')
    assert.ok(gitInit.includes(`git remote add origin https://github.com/tester/versioned-el.git`))
    // install/launch extras not requested
    assert.ok(!execCalls.some((c) => c.includes('npm install')))
    // next steps outro still printed since quiet was not set
    assert.equal(outros.length, 2)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})
