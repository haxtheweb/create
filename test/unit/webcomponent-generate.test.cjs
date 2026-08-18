'use strict'

// Isolate HOME before requiring the module (via the canary) — webcomponent.js
// imports HAXCMS.js which inits a configDirectory on load.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-gen-test-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { probeModule } = require('../_helpers/module-canary.cjs')
const { available, skipReason, module: wcModule } = probeModule('src/lib/programs/webcomponent.js')

const { webcomponentGenerateHAXSchema, webcomponentRename } = available ? wcModule : {}

const opts = { skip: skipReason, timeout: 15000 }

// --- webcomponentGenerateHAXSchema: reads customElements manifest, writes haxProperties.json ---

test('webcomponentGenerateHAXSchema maps attributes into settings.configure and demoSchema defaults', opts, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-genschema-'))
  const originalCwd = process.cwd()
  try {
    fs.mkdirSync(path.join(root, 'lib'))
    const customElementsPath = path.join(root, 'custom-elements.json')
    fs.writeFileSync(
      customElementsPath,
      JSON.stringify({
        modules: [
          {
            declarations: [
              {
                tagName: 'my-test-el',
                attributes: [
                  { fieldName: 'myProp', name: 'myProp', type: { text: 'string' }, default: 'hello' },
                  { fieldName: 'count', name: 'count', type: { text: 'number' } },
                  { fieldName: 't', name: 't' },
                ],
              },
            ],
          },
        ],
      }),
    )
    process.chdir(root)

    const commandRun = { options: {} }
    const packageData = { scripts: {}, customElements: 'custom-elements.json' }

    await webcomponentGenerateHAXSchema(commandRun, packageData)

    const outputPath = path.join(root, 'lib', 'my-test-el.haxProperties.json')
    assert.ok(fs.existsSync(outputPath), 'haxProperties.json was written')
    const props = JSON.parse(fs.readFileSync(outputPath, 'utf8'))

    // Source uses tagName.replace('-', ' ') which only replaces the first dash.
    assert.equal(props.gizmo.title, 'my test-el')
    assert.deepEqual(props.gizmo.tags, ['Other'])
    assert.deepEqual(props.gizmo.handles, [])

    const configuredProps = props.settings.configure.map((c) => c.property)
    assert.ok(configuredProps.includes('myProp'))
    assert.ok(configuredProps.includes('count'))
    assert.ok(!configuredProps.includes('t'), '"t" is excluded via unsetAttributes')

    assert.ok(props.saveOptions.unsetAttributes.includes('t'))
    assert.equal(props.demoSchema[0].tag, 'my-test-el')
    assert.equal(props.demoSchema[0].properties.myProp, 'hello')
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('webcomponentGenerateHAXSchema is a no-op when the customElements manifest is missing', opts, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-genschema-missing-'))
  const originalCwd = process.cwd()
  try {
    process.chdir(root)
    const commandRun = { options: {} }
    const packageData = { scripts: {}, customElements: 'does-not-exist.json' }
    await assert.doesNotReject(() => webcomponentGenerateHAXSchema(commandRun, packageData))
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// --- webcomponentRename: rewrites content, filenames, package.json, then renames the directory ---

test('webcomponentRename renames files, package.json, and the project directory', opts, async () => {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-rename-parent-'))
  const oldName = 'zzz-rename-source-el'
  const newName = 'zzz-rename-target-el'
  const oldDir = path.join(parentDir, oldName)
  fs.mkdirSync(oldDir)
  fs.mkdirSync(path.join(oldDir, 'test'))
  fs.writeFileSync(
    path.join(oldDir, 'package.json'),
    JSON.stringify({ name: oldName, version: '1.0.0', main: `${oldName}.js` }),
  )
  fs.writeFileSync(
    path.join(oldDir, `${oldName}.js`),
    `export class ZzzRenameSourceEl extends HTMLElement {}\ncustomElements.define('${oldName}', ZzzRenameSourceEl);\n`,
  )
  fs.writeFileSync(
    path.join(oldDir, 'test', `${oldName}.test.js`),
    `import '../${oldName}.js';\n`,
  )

  const originalCwd = process.cwd()
  try {
    process.chdir(oldDir)
    const commandRun = { options: { name: newName, quiet: true } }
    const packageData = { name: oldName, version: '1.0.0' }

    await webcomponentRename(commandRun, packageData)

    const newDir = path.join(parentDir, newName)
    assert.ok(fs.existsSync(newDir), 'renamed directory exists')
    assert.ok(!fs.existsSync(oldDir), 'old directory no longer exists')

    const pkg = JSON.parse(fs.readFileSync(path.join(newDir, 'package.json'), 'utf8'))
    assert.equal(pkg.name, newName)
    assert.equal(pkg.main, `${newName}.js`)

    assert.ok(fs.existsSync(path.join(newDir, `${newName}.js`)), 'main file renamed')
    assert.ok(
      fs.existsSync(path.join(newDir, 'test', `${newName}.test.js`)),
      'test file renamed',
    )
    const rewrittenSource = fs.readFileSync(path.join(newDir, `${newName}.js`), 'utf8')
    assert.ok(rewrittenSource.includes('ZzzRenameTargetEl'), 'class name rewritten')
    assert.ok(rewrittenSource.includes(newName), 'tag name rewritten')
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
})

test('webcomponentRename exits when run non-interactively without --name', opts, async () => {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-rename-noname-'))
  const oldDir = path.join(parentDir, 'zzz-noname-source-el')
  fs.mkdirSync(oldDir)
  fs.writeFileSync(
    path.join(oldDir, 'package.json'),
    JSON.stringify({ name: 'zzz-noname-source-el', version: '1.0.0' }),
  )

  const originalCwd = process.cwd()
  const originalExit = process.exit
  let exitCode = null
  process.exit = (code) => {
    exitCode = code
    throw new Error('__process_exit__')
  }
  try {
    process.chdir(oldDir)
    const commandRun = { options: { y: true, quiet: true } }
    const packageData = { name: 'zzz-noname-source-el', version: '1.0.0' }
    await assert.rejects(() => webcomponentRename(commandRun, packageData), /__process_exit__/)
    assert.equal(exitCode, 1)
  } finally {
    process.exit = originalExit
    process.chdir(originalCwd)
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
})
