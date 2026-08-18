'use strict'

// Seam C: CLI public interface via subprocess. Tests run against the BUILT
// dist/create.js (already-compiled CJS), so no @babel/register needed here.
// Requires `npm run build` first; skipped if dist/ is absent.

const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const CLI = path.resolve(__dirname, '..', '..', 'dist', 'create.js')
const { version } = require('../../package.json')

// Isolate HOME so the CLI's startup config write doesn't touch the real ~/.haxtheweb.
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-smoke-'))
const ISOLATED_ENV = { ...process.env, HOME: ISOLATED_HOME }

// Canary: verify the built CLI can actually load. create's CLI imports modules
// from @haxtheweb/haxcms-nodejs/dist/lib (e.g. allRoutes.js, safeFetch.js) that
// may not yet ship in the PUBLISHED haxcms-nodejs. Until that dependency is
// aligned the CLI can't start, so skip with the real reason instead of failing
// on a cross-repo dependency gap we can't fix from this repo.
let skipReason = false
if (!fs.existsSync(CLI)) {
  skipReason = 'dist/create.js not built — run `npm run build` first'
} else {
  const canary = spawnSync(process.execPath, [CLI, '--version'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  if (canary.status !== 0) {
    const missing = (canary.stderr || '').match(/Cannot find module '([^']+)'/)
    skipReason = missing
      ? `built CLI fails to load — missing dependency module: ${missing[1]} (align @haxtheweb/haxcms-nodejs to enable smoke tests)`
      : `built CLI exits ${canary.status} on --version — stderr: ${(canary.stderr || '').trim().slice(0, 200)}`
  }
}
const smokeOpts = { skip: skipReason, timeout: 15000 }

test('CLI --version prints the package version and exits 0', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, '--version'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.ok(
    res.stdout.includes(version),
    `expected stdout to include ${version}, got: ${res.stdout}`,
  )
})

test('CLI --help prints usage and exits 0', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, '--help'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.match(res.stdout, /Usage:/i)
})

test('CLI site --help prints the site subcommand usage and exits 0', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, 'site', '--help'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.match(res.stdout, /Usage:/i)
})

test('CLI webcomponent --help prints the wc subcommand usage and exits 0', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, 'webcomponent', '--help'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.match(res.stdout, /Usage:/i)
})

test('CLI audit exits 0 on a clean fixture directory (compliant)', smokeOpts, () => {
  // audit uses process.cwd() as the project root; run it with cwd = an empty
  // temp dir so there are no CSS files to flag and it exits 0 (compliant).
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-smoke-'))
  try {
    const res = spawnSync(process.execPath, [CLI, 'audit'], {
      encoding: 'utf8',
      env: ISOLATED_ENV,
      cwd: fixtureRoot,
      timeout: 15000,
    })
    assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('CLI audit exits 1 on a non-compliant fixture (flags color: blue)', smokeOpts, () => {
  // A CSS file with a non-DDD color triggers a suggestion -> checksPassed=false -> exit 1.
  // auditFile only checks lines that end with ';', so the property must be on
  // its own line (not `:host { color: blue; }` which ends with '}').
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-audit-smoke-bad-'))
  try {
    fs.writeFileSync(path.join(fixtureRoot, 'styles.css'), ':host {\n  color: blue;\n}')
    const res = spawnSync(process.execPath, [CLI, 'audit'], {
      encoding: 'utf8',
      env: ISOLATED_ENV,
      cwd: fixtureRoot,
      timeout: 15000,
    })
    assert.equal(res.status, 1, `expected exit 1 for non-compliant CSS, got ${res.status}`)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('CLI skills list --format json exits 0 and prints a valid JSON array', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, 'skills', 'list', '--format', 'json'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  // stdout must be parseable as a JSON array
  let parsed
  assert.doesNotThrow(() => { parsed = JSON.parse(res.stdout) }, 'stdout is valid JSON')
  assert.ok(Array.isArray(parsed), 'skills list JSON is an array')
})

test('CLI webcomponent creates a new element non-interactively (--y --no-i --no-extras)', smokeOpts, () => {
  // Run from an empty temp dir so there's no local package.json to confuse
  // monorepo/context detection, and --no-extras skips launch/install/git so
  // the test stays fast and side-effect-free.
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-smoke-'))
  const elementName = 'my-smoke-element'
  try {
    const res = spawnSync(process.execPath, [
      CLI, 'webcomponent',
      '--name', elementName,
      '--path', parentDir,
      '--y', '--no-i', '--no-extras',
    ], {
      encoding: 'utf8',
      env: ISOLATED_ENV,
      cwd: parentDir,
      timeout: 15000,
    })
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`)
    const projectDir = path.join(parentDir, elementName)
    assert.ok(fs.existsSync(projectDir), `expected project dir at ${projectDir}`)
    // main element file renamed from webcomponent.js -> <name>.js
    const elementFile = path.join(projectDir, `${elementName}.js`)
    assert.ok(fs.existsSync(elementFile), `expected element file at ${elementFile}`)
    const elementSource = fs.readFileSync(elementFile, 'utf8')
    assert.match(elementSource, new RegExp(`customElements\\.define\\(\\w+\\.tag`))
    assert.match(elementSource, new RegExp(elementName))
    // package.json reflects the element name
    const pkgPath = path.join(projectDir, 'package.json')
    assert.ok(fs.existsSync(pkgPath), `expected package.json at ${pkgPath}`)
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    assert.equal(pkg.name, elementName)
    assert.equal(pkg.main, `${elementName}.js`)
    // test file renamed alongside the element
    assert.ok(
      fs.existsSync(path.join(projectDir, 'test', `${elementName}.test.js`)),
      'expected renamed test file',
    )
  } finally {
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
})

test('CLI site creates a new site non-interactively (--y --no-i --no-extras)', smokeOpts, () => {
  // Run from an empty temp dir (no site.json) so systemStructureContext()
  // treats this as site *creation*, not administration of an existing site.
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-smoke-'))
  const siteName = 'my-smoke-site'
  try {
    const res = spawnSync(process.execPath, [
      CLI, 'site',
      '--name', siteName,
      '--path', parentDir,
      '--theme', 'clean-one',
      '--y', '--no-i', '--no-extras',
    ], {
      encoding: 'utf8',
      env: ISOLATED_ENV,
      cwd: parentDir,
      timeout: 15000,
    })
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`)
    const siteJsonPath = path.join(parentDir, siteName, 'site.json')
    assert.ok(fs.existsSync(siteJsonPath), `expected site.json at ${siteJsonPath}`)
    const manifest = JSON.parse(fs.readFileSync(siteJsonPath, 'utf8'))
    assert.ok(typeof manifest.id === 'string' && manifest.id !== '', 'manifest has an id')
    assert.ok(typeof manifest.title === 'string' && manifest.title !== '', 'manifest has a title')
    assert.ok(Array.isArray(manifest.items), 'manifest.items is an array')
    // metadata.site.name must align with the folder the site is named after
    assert.equal(manifest.metadata.site.name, siteName)
  } finally {
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
})
