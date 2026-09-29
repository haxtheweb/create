'use strict'

// Covers src/lib/statements.js: merlinSays() (pure string builder) and
// communityStatement() (prints the community links through p.outro).
// @clack/prompts is ESM-only so its namespace is not assignable; the shared
// clack-stub helper installs a live, patchable stand-in first.
const { installClackStub } = require('../_helpers/clack-stub.cjs')
const stub = installClackStub()

require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const outros = []
stub.outro = (msg) => { outros.push(String(msg)) }
const introMessages = []
stub.intro = (msg) => { introMessages.push(String(msg)) }

const { communityStatement, merlinSays, haxIntro } = require('../../src/lib/statements.js')

// --- merlinSays ---

test('merlinSays wraps the given text with the Merlin banner', () => {
  const output = merlinSays('Welcome wary web wanderer')
  assert.equal(typeof output, 'string')
  assert.ok(output.includes('🧙 Merlin:'))
  assert.ok(output.includes('Welcome wary web wanderer'))
})

test('merlinSays keeps distinct messages distinct', () => {
  assert.notEqual(merlinSays('one'), merlinSays('two'))
  assert.ok(merlinSays('with spaces').includes('with spaces'))
})

// --- communityStatement ---

test('communityStatement prints the community links through p.outro', () => {
  communityStatement()
  assert.equal(outros.length, 1)
  const msg = outros[0]
  assert.ok(msg.includes('https://hax.psu.edu'))
  assert.ok(msg.includes('https://github.com/haxtheweb/issues/issues'))
  assert.ok(msg.includes('https://bit.ly/hax-the-linkedin'))
  assert.ok(msg.includes('https://bit.ly/hax-the-x'))
  assert.ok(msg.includes('https://discord.gg/aCGxmRHEJP'))
  assert.ok(msg.includes('Never. Stop. Innovating.'))
})

// --- haxIntro (the animated banner; real timers, ~3s) ---

test('haxIntro plays the animated banner and ends with the CLI title', { timeout: 30000 }, async () => {
  const originalClear = console.clear
  console.clear = () => {}
  try {
    await haxIntro()
    assert.ok(introMessages.length >= 5, 'banner lines were introduced')
    assert.ok(introMessages.some((m) => m.includes('Better future loading..')), 'loading frames shown')
    assert.ok(introMessages.some((m) => m.includes('The Web : CLI')), 'final CLI title shown')
    assert.ok(
      introMessages.some((m) => m.includes('Welcome wary web wanderer')),
      'merlin welcome shown',
    )
  } finally {
    console.clear = originalClear
  }
})
