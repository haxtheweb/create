'use strict'

// Transpile ESM src on the fly so .cjs tests can require() it.
require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const { dddignoreInterpreter } = require('../../src/lib/programs/audit.js')

// dddignoreInterpreter walks a project root, reads every .dddignore it finds
// (skipping node_modules/.git/dist/assets/build/public), and returns a flat
// list of { highestPath, name, type } ignore entries. Extension names keep
// their leading dot (e.g. *.css -> name '.css') because auditNavigator matches
// via item.endsWith(ignore.name). These tests build a fixture tree in a temp
// dir and assert the returned list — no order assumed.

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-dddignore-'))
  // root .dddignore: directory, extension, file, inline-comment, and a
  // full-line comment that must produce no entry.
  fs.writeFileSync(
    path.join(root, '.dddignore'),
    [
      '# full-line comment, no entry',
      '/dist',
      '*.css',
      'my-secret.js',
      'keep.js  # inline comment, stripped to keep.js',
      '',
    ].join('\n'),
  )
  // a regular source file (not read, just present so the dir is non-empty)
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'my-el.js'), ':host { color: red; }')
  // nested .dddignore in src/sub
  fs.mkdirSync(path.join(root, 'src', 'sub'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'sub', '.dddignore'), '*.png\n')
  // node_modules/.dddignore must NEVER be read (node_modules is skipped)
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', '.dddignore'), '*.txt\n')
  return root
}

function findEntry(list, type, name, highestPath) {
  return list.find(
    (e) => e.type === type && e.name === name && e.highestPath === highestPath,
  )
}

test('dddignoreInterpreter classifies directory entries (leading slash stripped)', () => {
  const root = makeFixture()
  try {
    const list = dddignoreInterpreter(root)
    const distEntry = findEntry(list, 'directory', 'dist', root)
    assert.ok(distEntry, 'expected a directory entry for /dist')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('dddignoreInterpreter classifies extension entries (leading * stripped)', () => {
  const root = makeFixture()
  try {
    const list = dddignoreInterpreter(root)
    assert.ok(findEntry(list, 'extension', '.css', root), 'root *.css -> extension .css')
    assert.ok(
      findEntry(list, 'extension', '.png', path.join(root, 'src', 'sub')),
      'nested *.png -> extension .png with nested highestPath',
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('dddignoreInterpreter classifies file entries and strips inline comments', () => {
  const root = makeFixture()
  try {
    const list = dddignoreInterpreter(root)
    assert.ok(findEntry(list, 'file', 'my-secret.js', root), 'plain file entry')
    // "keep.js  # inline comment" must be stripped to "keep.js"
    assert.ok(findEntry(list, 'file', 'keep.js', root), 'inline comment stripped to keep.js')
    // the full-line comment must NOT have produced any entry
    assert.ok(!list.some((e) => e.name.startsWith('#')), 'no entry from full-line comment')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('dddignoreInterpreter skips node_modules and never reads its .dddignore', () => {
  const root = makeFixture()
  try {
    const list = dddignoreInterpreter(root)
    assert.ok(
      !list.some((e) => e.name === 'txt'),
      'node_modules/.dddignore (*.txt) must not be read',
    )
    // total: /dist, *.css, my-secret.js, keep.js (root) + *.png (nested) = 5
    assert.equal(list.length, 5, `expected 5 entries, got ${list.length}: ${JSON.stringify(list)}`)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('dddignoreInterpreter returns [] for an empty directory with no .dddignore', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-dddignore-empty-'))
  try {
    const list = dddignoreInterpreter(root)
    assert.deepEqual(list, [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
