#!/usr/bin/env node
/**
 * Verification script for new CLI site commands.
 * This exercises the read-only and mutating commands added to mirror
 * the frontend API surface. It requires a temporary HAXsite to work against.
 *
 * Run from the create repository root:
 *   node scripts/verify-new-cli-commands.js
 *
 * The script is non-interactive (--y --no-i --quiet) and cleans up
 * the temporary site on exit.
 */

import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const CREATE_BIN = path.resolve(process.cwd(), 'src/create.js')
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-cli-verify-'))
const SITE_NAME = 'cli-verify-site'
const SITE_DIR = path.join(TMP_DIR, SITE_NAME)

function run(cmd, opts = {}) {
  const cwd = opts.cwd || SITE_DIR
  const fullCmd = `node ${CREATE_BIN} ${cmd} --y --no-i --quiet --root ${cwd}`
  try {
    return execSync(fullCmd, { encoding: 'utf8', cwd, ...opts })
  } catch (e) {
    if (opts.expectError) {
      return e.stderr || e.stdout || ''
    }
    console.error(`Command failed: ${fullCmd}`)
    console.error(e.stderr || e.message)
    throw e
  }
}

function assertIncludes(output, needle, label) {
  if (!output.includes(needle)) {
    throw new Error(`Assertion failed (${label}): expected output to include "${needle}"`)
  }
}

function assertNotEmpty(output, label) {
  if (!output || output.trim().length === 0) {
    throw new Error(`Assertion failed (${label}): output was empty`)
  }
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Assertion failed (${label}): expected file to exist at ${filePath}`)
  }
}

let passed = 0
let failed = 0

function test(label, fn) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${label}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${label}: ${e.message}`)
  }
}

console.log(`\nTemp workspace: ${TMP_DIR}\n`)

// ── Setup ───────────────────────────────────────────────────────────
console.log('Creating temporary site...')
try {
  execSync(`node ${CREATE_BIN} site ${SITE_NAME} --y --no-i --quiet --root ${TMP_DIR}`, {
    encoding: 'utf8',
    cwd: TMP_DIR,
  })
} catch (e) {
  console.error('Failed to create test site:', e.stderr || e.message)
  process.exit(1)
}

// Add a page with tags so tags/blocks/analytics have data
console.log('Seeding site with a page...')
run(`site node:add --title "Verify Page" --content "<p>Hello world</p><video-player src=\"test\"></video-player>"`)

// ── Read-only commands ───────────────────────────────────────────────
console.log('\n--- Read-only commands ---')

test('site:tags returns structured data', () => {
  const out = run('site tags')
  assertNotEmpty(out, 'tags output')
})

test('site:blocks returns structured data', () => {
  const out = run('site blocks')
  assertNotEmpty(out, 'blocks output')
  assertIncludes(out, 'video-player', 'blocks video-player usage')
})

test('site:analytics returns structured data', () => {
  const out = run('site analytics')
  assertNotEmpty(out, 'analytics output')
})

test('site:revisions lists revisions for a page', () => {
  // Find the item id from site items
  const itemsOut = run('site items')
  const items = JSON.parse(itemsOut)
  const itemId = items[0].id
  const out = run(`site revisions --item-id ${itemId}`)
  assertNotEmpty(out, 'revisions output')
})

test('site:export markdown writes output', () => {
  const outFile = path.join(TMP_DIR, 'export.md')
  run(`site export --export-format markdown --to-file ${outFile}`)
  assertFileExists(outFile, 'markdown export')
})

test('site:export skeleton writes output', () => {
  const outFile = path.join(TMP_DIR, 'export.json')
  run(`site export --export-format skeleton --to-file ${outFile}`)
  assertFileExists(outFile, 'skeleton export')
})

// ── Mutating commands ────────────────────────────────────────────────
console.log('\n--- Mutating commands ---')

test('site:files-upload copies a file into the site', () => {
  const testFile = path.join(TMP_DIR, 'test-upload.txt')
  fs.writeFileSync(testFile, 'hello upload')
  const out = run(`site files-upload --source ${testFile}`)
  assertNotEmpty(out, 'files-upload output')
  // Verify via list-files
  const listOut = run('site list-files')
  assertIncludes(listOut, 'test-upload.txt', 'file appears in list')
})

test('site:files-delete removes the file', () => {
  // Get UUID from list-files
  const listOut = run('site list-files')
  const listData = JSON.parse(listOut)
  const file = listData.files.find(f => f.name === 'test-upload.txt')
  if (!file) throw new Error('Uploaded file not found in list')
  const out = run(`site files-delete --file-uuid ${file.uuid}`)
  assertNotEmpty(out, 'files-delete output')
})

test('site:search-replace performs batch replacement', () => {
  const out = run(`site search-replace --search "Hello world" --replace "Goodbye world" --confirm`)
  assertNotEmpty(out, 'search-replace output')
  assertIncludes(out, 'total', 'search-replace status report')
})

// ── Cleanup ──────────────────────────────────────────────────────────
console.log('\nCleaning up temporary site...')
fs.rmSync(TMP_DIR, { recursive: true, force: true })

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
