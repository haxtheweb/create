'use strict'

// Covers the remaining src/lib/logging.js gaps: the VERCEL_ENV log-path
// branch evaluated at module load, haxCliEnvOptions(), log(), and
// commandString()'s env-centric option exclusion plus regular option
// interpolation. VERCEL_ENV is set BEFORE requiring the module because
// baseLogPath is resolved once at load; /tmp/.haxtheweb is created up front
// so the winston file transport has a directory to write into.
require('@babel/register')

const fs = require('node:fs')
const path = require('node:path')

const test = require('node:test')
const assert = require('node:assert/strict')

process.env.VERCEL_ENV = 'production'
fs.mkdirSync(path.join('/tmp', '.haxtheweb'), { recursive: true })

const { haxCliEnvOptions, log, commandString } = require('../../src/lib/logging.js')

// --- haxCliEnvOptions ---

test('haxCliEnvOptions returns the env-centric option allowlist', () => {
  assert.deepEqual(haxCliEnvOptions(), [
    'skip',
    'npmClient',
    'i',
    'extras',
    'root',
    'path',
    'org',
    'author',
    'y',
    'auto',
    'domain',
  ])
})

// --- log ---

test('log writes without throwing for default and explicit levels', () => {
  assert.doesNotThrow(() => log('unit test log message'))
  assert.doesNotThrow(() => log('unit test log message', 'debug'))
  assert.doesNotThrow(() => log('unit test log message', 'info', { extra: true }))
})

// --- commandString ---

test('commandString interpolates non-env options as dashed flags with values', () => {
  const commandRun = {
    command: 'site',
    arguments: { action: 'site:stats' },
    options: { title: 'New Page', nodeOp: 'details', quiet: true },
  }
  assert.equal(
    commandString(commandRun),
    'hax site site:stats --title "New Page" --node-op "details" --quiet "true"',
  )
})

test('commandString excludes env-centric options from the command string', () => {
  const commandRun = {
    command: 'site',
    arguments: { action: 'site:export' },
    options: {
      // every one of these is in haxCliEnvOptions() and must not appear
      skip: true,
      npmClient: 'yarn',
      i: true,
      extras: false,
      root: '/tmp/root',
      path: '/tmp/path',
      org: '@haxtheweb',
      author: 'tester',
      y: true,
      auto: true,
      domain: 'my-site.surge.sh',
    },
  }
  assert.equal(commandString(commandRun), 'hax site site:export')
})

test('commandString camelCases convert to dashed option names', () => {
  const commandRun = {
    command: 'party',
    arguments: { action: 'github' },
    options: { repos: ['webcomponents'] },
  }
  assert.equal(
    commandString(commandRun),
    'hax party github --repos "webcomponents"',
  )
})
