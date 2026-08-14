'use strict'

// Transpile ESM src on the fly so .cjs tests can require() it.
// (create's src is ESM-syntax, compiled to CJS by Babel for dist/; tests hit src directly.)
require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  validateNpmClient,
  rejectShellMetacharacters,
  validateDomain,
  validateWebcomponentName,
  dashToCamel,
  camelToDash,
  capitalizeFirstLetter,
  getTimeDifference,
  generateUUID,
} = require('../../src/lib/utils.js')

// --- Security validators: a regression = command injection ---

test('validateNpmClient accepts the allowlisted clients', () => {
  assert.equal(validateNpmClient('npm'), 'npm')
  assert.equal(validateNpmClient('yarn'), 'yarn')
  assert.equal(validateNpmClient('pnpm'), 'pnpm')
})

test('validateNpmClient rejects non-allowlisted values, including injection attempts', () => {
  assert.throws(() => validateNpmClient('npm; rm -rf ~'), /Invalid --npm-client/)
  assert.throws(() => validateNpmClient(''), /Invalid --npm-client/)
  assert.throws(() => validateNpmClient(undefined), /Invalid --npm-client/)
  assert.throws(() => validateNpmClient(123), /Invalid --npm-client/)
})

test('rejectShellMetacharacters passes through safe values', () => {
  assert.equal(rejectShellMetacharacters('my-site', 'domain'), 'my-site')
  assert.equal(rejectShellMetacharacters('sub.example.com', 'domain'), 'sub.example.com')
})

test('rejectShellMetacharacters allows empty / undefined / null', () => {
  assert.equal(rejectShellMetacharacters('', 'name'), '')
  assert.equal(rejectShellMetacharacters(undefined, 'name'), undefined)
  assert.equal(rejectShellMetacharacters(null, 'name'), null)
})

test('rejectShellMetacharacters rejects every dangerous metacharacter', () => {
  const dangerous = ['a; b', 'a && b', 'a | b', 'a`b', 'a$(b)', 'a > b', 'a!b', 'a\nb', 'a\\b']
  for (const bad of dangerous) {
    assert.throws(
      () => rejectShellMetacharacters(bad, 'name'),
      /shell metacharacters are not allowed/,
      `expected rejection for: ${JSON.stringify(bad)}`,
    )
  }
})

test('rejectShellMetacharacters rejects non-string values', () => {
  assert.throws(() => rejectShellMetacharacters(123, 'name'), /shell metacharacters are not allowed/)
})

test('validateDomain accepts hostnames and host:port', () => {
  assert.equal(validateDomain('example.com'), 'example.com')
  assert.equal(validateDomain('sub.example.com:8080'), 'sub.example.com:8080')
  assert.equal(validateDomain('my-site'), 'my-site')
})

test('validateDomain allows empty / undefined / null', () => {
  assert.equal(validateDomain(''), '')
  assert.equal(validateDomain(undefined), undefined)
  assert.equal(validateDomain(null), null)
})

test('validateDomain rejects values outside the hostname charset', () => {
  assert.throws(() => validateDomain('example.com; rm'), /Invalid --domain/)
  assert.throws(() => validateDomain('a$b'), /Invalid --domain/)
  assert.throws(() => validateDomain('a b'), /Invalid --domain/)
})

// --- Web component name validator (spec-style: error string | null) ---

test('validateWebcomponentName returns null for valid names', () => {
  assert.equal(validateWebcomponentName('my-component'), null)
  assert.equal(validateWebcomponentName('a11y-collapse'), null)
  assert.equal(validateWebcomponentName('my-amazing-element'), null)
})

test('validateWebcomponentName flags missing, reserved, uppercase, leading-digit names', () => {
  assert.match(validateWebcomponentName(''), /Name is required/)
  assert.match(validateWebcomponentName('font-face'), /Reserved name font-face cannot be used/)
  assert.match(validateWebcomponentName('My-Component'), /must be lowercase/)
  assert.match(validateWebcomponentName('1-thing'), /cannot start with a number/)
})

test('validateWebcomponentName rejects special characters and spaces', () => {
  assert.match(validateWebcomponentName('my$comp'), /No special characters allowed/)
  assert.match(validateWebcomponentName('my comp'), /No spaces allowed/)
})

test('validateWebcomponentName requires a hyphen and forbids leading/trailing hyphen', () => {
  assert.match(validateWebcomponentName('mycomponent'), /must include at least one `-`/)
  assert.match(validateWebcomponentName('-mycomp'), /must include at least one `-`/)
  assert.match(validateWebcomponentName('mycomp-'), /must include at least one `-`/)
})

test('validateWebcomponentName reports registry collisions unless force is set', () => {
  const wcReg = { 'my-component': {} }
  assert.match(
    validateWebcomponentName('my-component', { wcReg, force: false }),
    /already a web component in the wc-registry/,
  )
  // force bypasses the collision check
  assert.equal(validateWebcomponentName('my-component', { wcReg, force: true }), null)
})

// --- Pure string / time / id helpers ---

test('dashToCamel capitalizes and removes hyphens', () => {
  assert.equal(dashToCamel('my-component'), 'MyComponent')
  assert.equal(dashToCamel('a11y-collapse'), 'A11yCollapse')
})

test('camelToDash lowercases and inserts hyphens', () => {
  assert.equal(camelToDash('MyComponent'), 'my-component')
  assert.equal(camelToDash('A11yCollapse'), 'a11y-collapse')
})

test('capitalizeFirstLetter uppercases only the first character', () => {
  assert.equal(capitalizeFirstLetter('hello'), 'Hello')
  assert.equal(capitalizeFirstLetter(''), '')
  assert.equal(capitalizeFirstLetter('aBC'), 'ABC')
})

test('getTimeDifference breaks an interval into day/hour/minute/second', () => {
  // exactly 1 day, 1 hour, 1 minute, 1 second
  assert.deepEqual(
    getTimeDifference('2020-01-01T00:00:00Z', '2020-01-02T01:01:01Z'),
    { days: 1, hours: 1, minutes: 1, seconds: 1 },
  )
})

test('getTimeDifference reports invalid dates', () => {
  assert.equal(getTimeDifference('not-a-date', '2020-01-01'), 'Invalid date format')
})

test('generateUUID returns unique UUIDv4-shaped strings', () => {
  assert.match(
    generateUUID(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  )
  assert.notEqual(generateUUID(), generateUUID())
})
