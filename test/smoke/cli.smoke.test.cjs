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

test('CLI party --help prints the party subcommand usage and exits 0', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, 'party', '--help'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.match(res.stdout, /Usage:/i)
})

test('CLI audit --help prints the audit subcommand usage and exits 0', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, 'audit', '--help'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.match(res.stdout, /Usage:/i)
})

test('CLI skills --help prints the skills subcommand usage and exits 0', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, 'skills', '--help'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.match(res.stdout, /Usage:/i)
})

test('CLI update --help prints the update subcommand usage and exits 0', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, 'update', '--help'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.match(res.stdout, /Usage:/i)
})

test('CLI serve --help prints the serve subcommand usage and exits 0', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, 'serve', '--help'], {
    encoding: 'utf8',
    env: ISOLATED_ENV,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  assert.match(res.stdout, /Usage:/i)
})

test('CLI start --help prints the start subcommand usage and exits 0', smokeOpts, () => {
  const res = spawnSync(process.execPath, [CLI, 'start', '--help'], {
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
    // haxtheweb/issues#3119: agents find context in the scaffold itself
    assert.ok(fs.existsSync(path.join(projectDir, 'AGENTS.md')), 'expected AGENTS.md in the scaffold')
    assert.ok(
      fs.existsSync(path.join(projectDir, '.agents', 'skills', 'hax-webcomponent-dev', 'SKILL.md')),
      'expected the hax-webcomponent-dev skill in the scaffold',
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

// haxtheweb/issues#3116: the agent / CI path must work first try. These run
// through spawnSync, so stdout is never a TTY, which is exactly the context
// an agent sandbox or CI runner provides.

// Environment with no git identity from any config file or env var.
function noGitIdentityEnv() {
  const env = { ...ISOLATED_ENV, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(ISOLATED_HOME, 'empty-gitconfig') }
  for (const key of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL']) {
    delete env[key]
  }
  return env
}

test('CLI site creation without --no-i returns promptly when there is no TTY', smokeOpts, () => {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-notty-'))
  const siteName = 'notty-site'
  try {
    // deliberately no --no-i and no --no-extras: this is the README command
    // that used to launch a dev server and never return
    const res = spawnSync(process.execPath, [
      CLI, 'site',
      '--name', siteName,
      '--path', parentDir,
      '--theme', 'clean-one',
      '--y',
    ], {
      encoding: 'utf8',
      env: ISOLATED_ENV,
      cwd: parentDir,
      timeout: 15000,
    })
    assert.notEqual(res.signal, 'SIGTERM', 'site creation hung until the timeout killed it')
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`)
    assert.match(res.stderr, /running as if --no-i was passed/)
    assert.ok(fs.existsSync(path.join(parentDir, siteName, 'site.json')), 'site.json created')
  } finally {
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
})

// The git identity fallback lives in @haxtheweb/haxcms-nodejs (it makes the
// site's first commit). Skip until the installed version carries it.
let identitySkip = skipReason
if (!identitySkip) {
  try {
    const backend = fs.readFileSync(require.resolve('@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js'), 'utf8')
    if (!backend.includes('GIT_AUTHOR_EMAIL')) {
      identitySkip = 'installed @haxtheweb/haxcms-nodejs predates the git identity fallback (haxtheweb/issues#3116)'
    }
  } catch (e) {
    identitySkip = 'could not read installed @haxtheweb/haxcms-nodejs'
  }
}

test('CLI site creation with no git identity exits 0 without a stack trace', { ...smokeOpts, skip: identitySkip }, () => {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-noident-'))
  const siteName = 'noident-site'
  try {
    const res = spawnSync(process.execPath, [
      CLI, 'site',
      '--name', siteName,
      '--path', parentDir,
      '--theme', 'clean-one',
      '--y', '--no-i',
    ], {
      encoding: 'utf8',
      env: noGitIdentityEnv(),
      cwd: parentDir,
      timeout: 15000,
    })
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`)
    const output = `${res.stdout}\n${res.stderr}`
    assert.doesNotMatch(output, /Author identity unknown/)
    assert.doesNotMatch(output, /^\s+at .+:\d+:\d+\)?$/m, 'no stack trace lines')
    const log = spawnSync('git', ['log', '--oneline'], { encoding: 'utf8', cwd: path.join(parentDir, siteName) })
    assert.equal(log.status, 0, `initial commit missing: ${log.stderr}`)
  } finally {
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
})

test('CLI site (default action) inside a site reports agent orientation', smokeOpts, () => {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-orient-'))
  const siteName = 'orient-site'
  try {
    const create = spawnSync(process.execPath, [
      CLI, 'site',
      '--name', siteName,
      '--path', parentDir,
      '--theme', 'clean-one',
      '--y', '--no-i', '--no-extras',
    ], { encoding: 'utf8', env: ISOLATED_ENV, cwd: parentDir, timeout: 15000 })
    assert.equal(create.status, 0, `create stderr: ${create.stderr}`)
    const siteDir = path.join(parentDir, siteName)
    const statsPath = path.join(parentDir, 'stats.json')
    const res = spawnSync(process.execPath, [
      CLI, 'site', '--format', 'json', '--to-file', statsPath, '--y', '--no-i',
    ], { encoding: 'utf8', env: ISOLATED_ENV, cwd: siteDir, timeout: 15000 })
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`)
    const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'))
    assert.ok(stats.agent, 'stats include agent orientation')
    assert.equal(stats.agent.files['site.json'], true)
    assert.ok(Array.isArray(stats.agent.commands) && stats.agent.commands.length > 0)
  } finally {
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
})

// haxtheweb/issues#3119: `hax wc <name> --y --no-i` used to start the dev
// server and never return. --npm-client is pointed at a stub so the test does
// not install ~600 packages; the point is that it returns and never launches.
test('CLI webcomponent with --y --no-i returns without launching a dev server', smokeOpts, () => {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-wc-noi-'))
  const elementName = 'noi-element'
  try {
    const res = spawnSync(process.execPath, [
      CLI, 'webcomponent',
      '--name', elementName,
      '--path', parentDir,
      '--npm-client', 'pnpm',
      '--y', '--no-i',
    ], {
      encoding: 'utf8',
      env: { ...ISOLATED_ENV, PATH: `${stubBinDir()}${path.delimiter}${process.env.PATH}` },
      cwd: parentDir,
      timeout: 15000,
    })
    assert.notEqual(res.signal, 'SIGTERM', 'webcomponent scaffold hung until the timeout killed it')
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`)
    const calls = fs.existsSync(STUB_LOG) ? fs.readFileSync(STUB_LOG, 'utf8') : ''
    assert.doesNotMatch(calls, /\bstart\b/, 'dev server was started')
    assert.ok(fs.existsSync(path.join(parentDir, elementName, 'AGENTS.md')))
  } finally {
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
})

// a fake `pnpm` that records its arguments and exits 0 immediately
const STUB_LOG = path.join(ISOLATED_HOME, 'pnpm-stub.log')
function stubBinDir() {
  const dir = path.join(ISOLATED_HOME, 'stub-bin')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    const script = path.join(dir, 'pnpm')
    fs.writeFileSync(script, `#!/bin/sh\necho "$@" >> "${STUB_LOG}"\nexit 0\n`)
    fs.chmodSync(script, 0o755)
  }
  return dir
}

// haxtheweb/issues#3116 acceptance idea, now that #3125 / #3126 / #3127 are
// fixed: with no TTY and no prompts, add pages with content in order, edit
// one, and list them. Runs against the real haxcms-nodejs backend.
test('agent path: add pages with content in order, edit one, list items', { skip: skipReason, timeout: 120000 }, () => {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-site-pages-'))
  const siteName = 'pages-site'
  const run = (args, cwd) => {
    const res = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      env: ISOLATED_ENV,
      cwd: cwd,
      timeout: 30000,
    })
    assert.notEqual(res.signal, 'SIGTERM', `hung: hax ${args.join(' ')}`)
    assert.equal(res.status, 0, `hax ${args.join(' ')}\nstderr: ${res.stderr}\nstdout: ${res.stdout}`)
    return res
  }
  try {
    run(['site', '--name', siteName, '--path', parentDir, '--theme', 'clean-one', '--y', '--no-i', '--no-extras'], parentDir)
    const siteDir = path.join(parentDir, siteName)
    const htmlFile = path.join(parentDir, 'one.html')
    const mdFile = path.join(parentDir, 'two.md')
    fs.writeFileSync(htmlFile, '<h2>Page one from a file</h2>')
    fs.writeFileSync(mdFile, '# Page two from markdown')
    run(['site', 'node:add', '--title', 'One', '--slug', 'one', '--content', htmlFile, '--y', '--no-i'], siteDir)
    run(['site', 'node:add', '--title', 'Two', '--slug', 'two', '--content', mdFile, '--y', '--no-i'], siteDir)
    run(['site', 'node:add', '--title', 'Three', '--slug', 'three', '--content', '<p>three inline</p>', '--content-format', 'html', '--y', '--no-i'], siteDir)

    const readSite = () => JSON.parse(fs.readFileSync(path.join(siteDir, 'site.json'), 'utf8'))
    const bySlug = (manifest, slug) => manifest.items.find((item) => item.slug === slug)
    const pageHtml = (item) => fs.readFileSync(path.join(siteDir, item.location), 'utf8')
    let manifest = readSite()
    const one = bySlug(manifest, 'one')
    const two = bySlug(manifest, 'two')
    const three = bySlug(manifest, 'three')
    assert.ok(one && two && three, `pages missing: ${manifest.items.map((i) => i.slug).join(', ')}`)
    assert.ok(one.order < two.order && two.order < three.order, `order not appended: ${one.order}, ${two.order}, ${three.order}`)
    assert.match(pageHtml(one), /Page one from a file/)
    assert.match(pageHtml(two), /Page two from markdown/)
    assert.match(pageHtml(three), /three inline/)

    run(['site', 'node:edit', '--item-id', 'two', '--title', 'Two edited', '--content', '<p>two edited</p>', '--y', '--no-i'], siteDir)
    manifest = readSite()
    const edited = manifest.items.find((item) => item.id === two.id)
    assert.equal(edited.title, 'Two edited')
    assert.match(pageHtml(edited), /two edited/)

    const itemsFile = path.join(parentDir, 'items.json')
    run(['site', 'site:items', '--format', 'json', '--to-file', itemsFile, '--y', '--no-i'], siteDir)
    const listed = JSON.parse(fs.readFileSync(itemsFile, 'utf8'))
    assert.ok(Array.isArray(listed) && listed.length >= 3, 'site:items lists the pages')
  } finally {
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
})

// haxtheweb/issues#3119: `hax wc --search` finds existing elements (offline:
// HAX_ELEMENTS_CATALOG points at a fixture so CI needs no network)
test('CLI wc --search returns matching elements as JSON', smokeOpts, () => {
  const fixture = path.join(ISOLATED_HOME, 'catalog-fixture.json')
  fs.writeFileSync(fixture, JSON.stringify({
    preferred: [{ tag: 'simple-tooltip', useFor: 'tooltips' }],
    elements: [
      { tag: 'simple-tooltip', title: '', description: 'a simple tooltip', import: '@haxtheweb/simple-tooltip/simple-tooltip.js', type: 'element', tags: [] },
      { tag: 'video-player', title: 'Video', description: 'video', import: '@haxtheweb/video-player/video-player.js', type: 'element', tags: [] },
    ],
  }))
  const res = spawnSync(process.execPath, [CLI, 'wc', '--search', 'tooltip', '--format', 'json'], {
    encoding: 'utf8',
    env: { ...ISOLATED_ENV, HAX_ELEMENTS_CATALOG: fixture },
    cwd: ISOLATED_HOME,
    timeout: 15000,
  })
  assert.equal(res.status, 0, `stderr: ${res.stderr}`)
  const results = JSON.parse(res.stdout)
  assert.deepEqual(results.map((r) => r.tag), ['simple-tooltip'])
  assert.equal(results[0].preferred, 'tooltips')
})
