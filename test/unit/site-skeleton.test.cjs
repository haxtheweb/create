'use strict'

// Isolate HOME BEFORE requiring site.js (via the canary) so HAXCMS init lands in
// a temp dir, not the real ~/.haxtheweb.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-skel-test-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')

const {
  isObjectLike,
  normalizeSkeletonMachineName,
  resolveAbsolutePath,
  extractSkeletonPayload,
  loadSkeletonFileData,
  installSkeletonFile,
} = available ? siteModule : {}

// Same HAXCMS singleton site.js uses, so we can redirect configDirectory for the
// install test without touching the real config tree.
let HAXCMS = null
if (available) {
  HAXCMS = require('@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js').HAXCMS
}

const opts = { skip: skipReason, timeout: 15000 }

// --- isObjectLike ---

test('isObjectLike is true for plain objects and false for arrays/null/scalars', opts, () => {
  assert.equal(isObjectLike({}), true)
  assert.equal(isObjectLike({ a: 1 }), true)
  assert.equal(isObjectLike([]), false)
  assert.equal(isObjectLike(null), false)
  assert.equal(isObjectLike(undefined), false)
  assert.equal(isObjectLike('x'), false)
  assert.equal(isObjectLike(123), false)
})

// --- normalizeSkeletonMachineName (uses real HAXCMS.generateMachineName) ---

test('normalizeSkeletonMachineName machine-names + lowercases a human name', opts, () => {
  // known-good: HAXCMS.generateMachineName('My Cool Site') -> 'my-cool-site'
  assert.equal(normalizeSkeletonMachineName('My Cool Site'), 'my-cool-site')
})

test('normalizeSkeletonMachineName returns "" for non-strings', opts, () => {
  assert.equal(normalizeSkeletonMachineName(123), '')
  assert.equal(normalizeSkeletonMachineName(null), '')
  assert.equal(normalizeSkeletonMachineName(undefined), '')
})

// --- resolveAbsolutePath ---

test('resolveAbsolutePath returns "" for empty / non-string', opts, () => {
  assert.equal(resolveAbsolutePath(''), '')
  assert.equal(resolveAbsolutePath(null), '')
  assert.equal(resolveAbsolutePath(undefined), '')
})

test('resolveAbsolutePath returns absolute paths unchanged', opts, () => {
  assert.equal(resolveAbsolutePath('/usr/local/bin'), '/usr/local/bin')
})

test('resolveAbsolutePath joins relative paths against cwd', opts, () => {
  const result = resolveAbsolutePath('foo/bar.json')
  assert.ok(path.isAbsolute(result), 'result is absolute')
  assert.ok(result.endsWith('foo/bar.json'))
})

// --- extractSkeletonPayload ---

test('extractSkeletonPayload unwraps rawData.data.skeleton and normalizes shape', opts, () => {
  const input = {
    data: {
      skeleton: {
        meta: { machineName: 'My Cool Site' },
        site: { name: 'demo' },
        build: { items: [{ id: '1' }] },
      },
    },
  }
  const { skeleton, machineName } = extractSkeletonPayload(input)
  assert.equal(machineName, 'my-cool-site')
  assert.equal(skeleton.meta.machineName, 'my-cool-site')
  assert.equal(skeleton.meta.name, 'my-cool-site')
  assert.equal(skeleton.build.structure, 'from-skeleton')
  assert.equal(skeleton.build.type, 'skeleton')
  assert.deepEqual(skeleton.build.files, [])
})

test('extractSkeletonPayload defaults machineName to site-template when meta is empty', opts, () => {
  const { skeleton, machineName } = extractSkeletonPayload({ meta: {}, site: {}, build: {} })
  assert.equal(machineName, 'site-template')
  assert.equal(skeleton.meta.machineName, 'site-template')
  assert.equal(skeleton.meta.name, 'site-template')
  assert.deepEqual(skeleton.build.items, [])
})

test('extractSkeletonPayload throws on a non-object skeleton', opts, () => {
  assert.throws(() => extractSkeletonPayload(null), /Invalid skeleton JSON structure/)
  assert.throws(() => extractSkeletonPayload('not an object'), /Invalid skeleton JSON structure/)
  assert.throws(() => extractSkeletonPayload(123), /Invalid skeleton JSON structure/)
})

// --- loadSkeletonFileData ---

test('loadSkeletonFileData throws for an empty / missing path', opts, () => {
  assert.throws(() => loadSkeletonFileData(''), /Skeleton file path is required/)
  assert.throws(() => loadSkeletonFileData('/no/such/file.json'), /Skeleton file does not exist/)
})

test('loadSkeletonFileData reads + parses a skeleton file and returns the payload + path', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-loadskel-'))
  try {
    const file = path.join(root, 'skel.json')
    fs.writeFileSync(
      file,
      JSON.stringify({ data: { skeleton: { meta: { machineName: 'Course One' } } } }),
    )
    const result = loadSkeletonFileData(file)
    assert.equal(result.machineName, 'course-one')
    assert.equal(result.absolutePath, file)
    assert.equal(result.skeleton.meta.machineName, 'course-one')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// --- installSkeletonFile (redirects HAXCMS.configDirectory to a temp dir) ---

test('installSkeletonFile writes the skeleton to <configDir>/user/skeletons/<name>.json', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-instskel-src-'))
  const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-instskel-cfg-'))
  // snapshot + redirect the singleton's configDirectory
  const origConfigDir = HAXCMS.configDirectory
  HAXCMS.configDirectory = configRoot
  try {
    const file = path.join(root, 'skel.json')
    fs.writeFileSync(
      file,
      JSON.stringify({ data: { skeleton: { meta: { machineName: 'Awesome Course' } } } }),
    )
    const result = installSkeletonFile(file)
    assert.equal(result.machineName, 'awesome-course')
    assert.equal(
      result.installPath,
      path.join(configRoot, 'user', 'skeletons', 'awesome-course.json'),
    )
    assert.ok(fs.existsSync(result.installPath), 'skeleton file was written')
    const written = JSON.parse(fs.readFileSync(result.installPath, 'utf8'))
    assert.equal(written.meta.machineName, 'awesome-course')
  } finally {
    HAXCMS.configDirectory = origConfigDir
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(configRoot, { recursive: true, force: true })
  }
})

test('installSkeletonFile honors a machineName override', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-instskel-ovr-'))
  const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-instskel-cfgovr-'))
  const origConfigDir = HAXCMS.configDirectory
  HAXCMS.configDirectory = configRoot
  try {
    const file = path.join(root, 'skel.json')
    fs.writeFileSync(file, JSON.stringify({ meta: { name: 'Ignored Name' } }))
    const result = installSkeletonFile(file, 'override-name')
    assert.equal(result.machineName, 'override-name')
    assert.ok(fs.existsSync(path.join(configRoot, 'user', 'skeletons', 'override-name.json')))
  } finally {
    HAXCMS.configDirectory = origConfigDir
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(configRoot, { recursive: true, force: true })
  }
})
