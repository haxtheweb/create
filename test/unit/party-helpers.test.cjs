'use strict'

// Transpile ESM src on the fly so .cjs tests can require() it.
require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  partyActions,
  isRepoAlreadyExistsError,
  resolveInstallCommands,
} = require('../../src/lib/programs/party.js')

// --- partyActions: fixed menu list ---

test('partyActions returns the expected fixed list of actions', () => {
  const actions = partyActions()
  assert.ok(Array.isArray(actions))
  const values = actions.map((a) => a.value)
  assert.deepEqual(values, [
    'docs',
    'playground',
    'psu',
    'issues',
    'discord',
    'club',
    'github',
  ])
  for (const action of actions) {
    assert.equal(typeof action.value, 'string')
    assert.equal(typeof action.label, 'string')
    assert.ok(action.label.length > 0)
  }
})

test('partyActions returns a fresh array each call (no shared state)', () => {
  const a = partyActions()
  const b = partyActions()
  assert.notEqual(a, b)
  a.push({ value: 'mutated', label: 'mutated' })
  assert.equal(b.length, 7)
})

// --- isRepoAlreadyExistsError ---

test('isRepoAlreadyExistsError is true when stderr reports an existing non-empty directory', () => {
  const error = { stderr: "fatal: destination path 'webcomponents' already exists and is not an empty directory." }
  assert.equal(isRepoAlreadyExistsError(error), true)
})

test('isRepoAlreadyExistsError is false for other errors', () => {
  assert.equal(isRepoAlreadyExistsError({ stderr: 'Repository not found.' }), false)
  assert.equal(isRepoAlreadyExistsError({ stderr: '' }), false)
  assert.equal(isRepoAlreadyExistsError({}), false)
  assert.equal(isRepoAlreadyExistsError(null), false)
  assert.equal(isRepoAlreadyExistsError(undefined), false)
})

test('isRepoAlreadyExistsError is false when stderr is not a string', () => {
  assert.equal(isRepoAlreadyExistsError({ stderr: 123 }), false)
  assert.equal(isRepoAlreadyExistsError({ stderr: null }), false)
})

// --- resolveInstallCommands ---

test('resolveInstallCommands returns lerna+yarn install commands for webcomponents', () => {
  const commands = resolveInstallCommands('webcomponents', 'yarn', '/home/user/projects')
  assert.deepEqual(commands, [
    'yarn global add lerna web-component-analyzer',
    'cd /home/user/projects/webcomponents && yarn install',
  ])
})

test('resolveInstallCommands returns a single npmClient install for simple repos', () => {
  for (const repo of ['create', 'hax-the-club', 'haxcms-nodejs', 'desktop']) {
    const commands = resolveInstallCommands(repo, 'pnpm', '/base')
    assert.deepEqual(commands, [`cd /base/${repo} && pnpm install`])
  }
})

test('resolveInstallCommands returns no commands for haxcms-php and HAXiam', () => {
  assert.deepEqual(resolveInstallCommands('haxcms-php', 'npm', '/base'), [])
  assert.deepEqual(resolveInstallCommands('HAXiam', 'npm', '/base'), [])
})

test('resolveInstallCommands returns no commands for an unrecognized repo', () => {
  assert.deepEqual(resolveInstallCommands('some-unknown-repo', 'npm', '/base'), [])
})
