'use strict'

// Isolate HOME BEFORE requiring site.js (via the canary) so HAXCMS init and any
// config writes land in a temp dir, not the real ~/.haxtheweb.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-sitefs-test-'))
process.env.HOME = ISOLATED_HOME
process.env.USERPROFILE = ISOLATED_HOME

const test = require('node:test')
const assert = require('node:assert/strict')

const { available, skipReason, module: siteModule } = require('../_helpers/site-canary.cjs')

const {
  cleanupSiteForPublish,
  fixLegacyIgnoreFile,
  prepareSiteForStaticPublish,
  restoreSiteAfterStaticPublish,
} = available ? siteModule : {}

const opts = { skip: skipReason, timeout: 15000 }

// --- cleanupSiteForPublish: broken-symlink finder/unlinker ---

test('cleanupSiteForPublish returns [] for a nonexistent directory', opts, () => {
  assert.deepEqual(cleanupSiteForPublish(path.join(ISOLATED_HOME, 'no-such-dir')), [])
})

test('cleanupSiteForPublish finds and unlinks broken symlinks, leaves valid ones', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-cleanup-'))
  try {
    const broken = path.join(root, 'broken-link')
    const valid = path.join(root, 'valid-link')
    const realFile = path.join(root, 'real.txt')
    fs.writeFileSync(realFile, 'hi')
    fs.symlinkSync(path.join(root, 'does-not-exist'), broken)
    fs.symlinkSync(realFile, valid)

    const found = cleanupSiteForPublish(root)

    assert.equal(found.length, 1, 'only the broken symlink is reported')
    assert.equal(found[0], broken)
    assert.ok(!fs.existsSync(broken), 'broken symlink was unlinked')
    assert.ok(fs.existsSync(valid), 'valid symlink is untouched')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('cleanupSiteForPublish does not recurse into node_modules (broken links there are left)', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-cleanup-nm-'))
  try {
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
    const nmBroken = path.join(root, 'node_modules', 'nm-broken')
    fs.symlinkSync(path.join(root, 'nope'), nmBroken)

    const found = cleanupSiteForPublish(root)

    assert.ok(!found.includes(nmBroken), 'broken symlink inside node_modules is NOT reported')
    // existsSync follows the symlink and returns false for any broken symlink,
    // so use lstatSync to prove the symlink entry itself is still present
    // (i.e. it was NOT unlinked). lstatSync throws if the entry was removed.
    let stillPresent = false
    try {
      stillPresent = fs.lstatSync(nmBroken).isSymbolicLink()
    } catch (e) {
      stillPresent = false
    }
    assert.ok(stillPresent, 'broken symlink inside node_modules is left in place')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// --- fixLegacyIgnoreFile: rewrites legacy !node_modules/ ignore files ---

test('fixLegacyIgnoreFile returns false when the file does not exist', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-ignore-missing-'))
  try {
    assert.equal(fixLegacyIgnoreFile(root, '.surgeignore'), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('fixLegacyIgnoreFile rewrites a legacy .surgeignore and returns true', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-ignore-surge-'))
  try {
    const file = path.join(root, '.surgeignore')
    fs.writeFileSync(file, '!node_modules/\nsome-other\n')
    assert.equal(fixLegacyIgnoreFile(root, '.surgeignore'), true)
    const after = fs.readFileSync(file, 'utf8')
    assert.ok(after.startsWith('node_modules\ndist\n'), 'rewritten with the modern header')
    assert.ok(!after.includes('!node_modules/'), 'legacy line is gone')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('fixLegacyIgnoreFile rewrites .netlifyignore and .vercelignore', opts, () => {
  for (const name of ['.netlifyignore', '.vercelignore']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-ignore-' + name.slice(1) + '-'))
    try {
      const file = path.join(root, name)
      fs.writeFileSync(file, '!node_modules/\nfoo\n')
      assert.equal(fixLegacyIgnoreFile(root, name), true)
      const after = fs.readFileSync(file, 'utf8')
      assert.ok(after.startsWith('node_modules\ndist\n'), name + ' rewritten with modern header')
      assert.ok(!after.includes('!node_modules/'), name + ' legacy line gone')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }
})

test('fixLegacyIgnoreFile returns false when contents have no legacy line', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-ignore-clean-'))
  try {
    const file = path.join(root, '.surgeignore')
    const original = 'node_modules\ndist\n'
    fs.writeFileSync(file, original)
    assert.equal(fixLegacyIgnoreFile(root, '.surgeignore'), false)
    assert.equal(fs.readFileSync(file, 'utf8'), original, 'file unchanged')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// --- prepareSiteForStaticPublish / restoreSiteAfterStaticPublish round-trip ---

test('prepareSiteForStaticPublish returns false when there is no ghpages.html', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-prep-nogh-'))
  try {
    fs.writeFileSync(path.join(root, 'index.html'), 'original index')
    assert.equal(prepareSiteForStaticPublish(root), false)
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), 'original index')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('prepare/restore round-trip swaps ghpages.html in and restores the original index', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-prep-rt-'))
  try {
    fs.writeFileSync(path.join(root, 'index.html'), 'ORIGINAL INDEX')
    fs.writeFileSync(path.join(root, 'ghpages.html'), 'GHPAGES ENTRY')

    // prepare: back up index, copy ghpages -> index
    assert.equal(prepareSiteForStaticPublish(root), true)
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), 'GHPAGES ENTRY')
    assert.equal(fs.readFileSync(path.join(root, 'index.html.bak'), 'utf8'), 'ORIGINAL INDEX')

    // restore: copy bak back over index, remove bak
    assert.equal(restoreSiteAfterStaticPublish(root), true)
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), 'ORIGINAL INDEX')
    assert.ok(!fs.existsSync(path.join(root, 'index.html.bak')), 'backup removed after restore')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('prepareSiteForStaticPublish removes build/ and wc-registry.json', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-prep-artifacts-'))
  try {
    fs.writeFileSync(path.join(root, 'ghpages.html'), 'entry')
    fs.mkdirSync(path.join(root, 'build'), { recursive: true })
    fs.writeFileSync(path.join(root, 'build', 'x.js'), 'x')
    fs.writeFileSync(path.join(root, 'wc-registry.json'), '{}')

    prepareSiteForStaticPublish(root)

    assert.ok(!fs.existsSync(path.join(root, 'build')), 'build/ removed')
    assert.ok(!fs.existsSync(path.join(root, 'wc-registry.json')), 'wc-registry.json removed')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('restoreSiteAfterStaticPublish returns false when there is no backup', opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-restore-nobak-'))
  try {
    fs.writeFileSync(path.join(root, 'index.html'), 'x')
    assert.equal(restoreSiteAfterStaticPublish(root), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
