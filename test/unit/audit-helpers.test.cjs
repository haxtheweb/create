'use strict'

// Transpile ESM src on the fly so .cjs tests can require() it.
require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  helpAuditBorderShorthands,
  helpAuditBorderThickness,
  helpAuditBoxShadow,
  helpAuditColors,
  helpAuditFontFamily,
  helpAuditFontSize,
  helpAuditFontWeight,
  helpAuditLetterSpacing,
  helpAuditLineHeight,
  helpAuditRadius,
  helpAuditSpacing,
} = require('../../src/lib/programs/audit.js')

// These are characterization tests: they pin CURRENT behavior. A few cases
// below assert known-buggy output (marked) so the bugs are visible and locked;
// when someone fixes them, update the expectation here.

test('helpAuditBorderShorthands maps px presets to ddd border tokens', () => {
  assert.equal(helpAuditBorderShorthands('1px solid grey'), '--ddd-border-xs')
  assert.equal(helpAuditBorderShorthands('2px solid grey'), '--ddd-border-sm')
  assert.equal(helpAuditBorderShorthands('3px solid grey'), '--ddd-border-md')
  assert.equal(helpAuditBorderShorthands('4px solid grey'), '--ddd-border-lg')
})

test('helpAuditBorderShorthands only reads the first character (known bug, pinned)', () => {
  // charAt(0) means 10px is parsed as 1px -> xs. Fix the parser, then fix this.
  assert.equal(helpAuditBorderShorthands('10px solid grey'), '--ddd-border-xs')
})

test('helpAuditBorderShorthands returns no-suggestions without px', () => {
  assert.equal(
    helpAuditBorderShorthands('thin solid grey'),
    'No available suggestions. Check DDD documentation.',
  )
})

test('helpAuditBorderThickness maps px thicknesses to ddd border-size tokens', () => {
  assert.equal(helpAuditBorderThickness('1px'), '--ddd-border-size-xs')
  assert.equal(helpAuditBorderThickness('2px'), '--ddd-border-size-sm')
  assert.equal(helpAuditBorderThickness('3px'), '--ddd-border-size-md')
  assert.equal(helpAuditBorderThickness('4px'), '--ddd-border-size-lg')
  assert.equal(helpAuditBorderThickness('10px'), '--ddd-border-size-lg')
})

test('helpAuditBorderThickness returns no-suggestions without px', () => {
  assert.equal(
    helpAuditBorderThickness('thin'),
    'No available suggestions. Check DDD documentation.',
  )
})

test('helpAuditBoxShadow classifies by largest offset present', () => {
  assert.equal(helpAuditBoxShadow('0px 0px 0px 0px'), '--ddd-boxShadow-0')
  assert.equal(helpAuditBoxShadow('0px 1px 2px'), '--ddd-boxShadow-sm')
  assert.equal(helpAuditBoxShadow('0px 5px 6px'), '--ddd-boxShadow-md')
  assert.equal(helpAuditBoxShadow('0px 9px 10px'), '--ddd-boxShadow-lg')
  assert.equal(helpAuditBoxShadow('0px 13px 14px'), '--ddd-boxShadow-xl')
})

test('helpAuditBoxShadow returns no-suggestions without px', () => {
  assert.equal(
    helpAuditBoxShadow('none'),
    'No available suggestions. Check DDD documentation.',
  )
})

test('helpAuditColors maps named colors to ddd theme tokens, case-insensitively', () => {
  assert.equal(helpAuditColors('blue'), '--ddd-theme-default-beaverBlue')
  assert.equal(helpAuditColors('Blue'), '--ddd-theme-default-beaverBlue')
  assert.equal(helpAuditColors('red'), '--ddd-theme-default-original87Pink')
  assert.equal(helpAuditColors('transparent'), '--ddd-theme-default-potential0')
  assert.equal(helpAuditColors('white'), '--ddd-theme-default-white')
})

test('helpAuditColors returns no-suggestions for unknown colors', () => {
  assert.equal(
    helpAuditColors('notacolor'),
    'No available suggestions. Check DDD documentation.',
  )
})

test('helpAuditColors has two broken token values in its table (known typos, pinned)', () => {
  // darkkhaki -> "--ddd-theme-default=alertAllClear" (typo: '=' instead of '-')
  // mediumspringgreen -> "-ddd-theme-default-futureLime" (missing leading '-')
  // These CSS vars won't resolve. Fix the table, then fix these expectations.
  assert.equal(helpAuditColors('darkkhaki'), '--ddd-theme-default=alertAllClear')
  assert.equal(helpAuditColors('mediumspringgreen'), '-ddd-theme-default-futureLime')
})

test('helpAuditFontFamily maps known families, defaulting to primary', () => {
  assert.equal(helpAuditFontFamily('roboto'), '--ddd-font-primary')
  assert.equal(helpAuditFontFamily('Roboto'), '--ddd-font-primary')
  assert.equal(helpAuditFontFamily('serif'), '--ddd-font-secondary')
  assert.equal(helpAuditFontFamily('roboto condensed'), '--ddd-font-navigation')
  // unknown family falls back to primary
  assert.equal(helpAuditFontFamily('comic sans'), '--ddd-font-primary')
})

test('helpAuditFontSize maps px sizes to ddd font-size tokens', () => {
  assert.equal(helpAuditFontSize('16px'), '--ddd-font-size-4xs')
  assert.equal(helpAuditFontSize('18px'), '--ddd-font-size-3xs')
  assert.equal(helpAuditFontSize('24px'), '--ddd-font-size-s')
  assert.equal(helpAuditFontSize('200px'), '--ddd-font-size-type1-l')
})

test('helpAuditFontSize has a typo for the 32px tier (known bug, pinned)', () => {
  // 32px -> "--ddd=font-size-m" (typo: '=' instead of '-'). Fix, then fix this.
  assert.equal(helpAuditFontSize('32px'), '--ddd=font-size-m')
})

test('helpAuditFontSize returns no-suggestions without px', () => {
  assert.equal(
    helpAuditFontSize('1rem'),
    'No available suggestions. Check DDD documentation.',
  )
})

test('helpAuditFontWeight maps numeric weights', () => {
  assert.equal(helpAuditFontWeight('300'), '--ddd-font-weight-light')
  assert.equal(helpAuditFontWeight('400'), '--ddd-font-weight-regular')
  assert.equal(helpAuditFontWeight('500'), '--ddd-font-weight-medium')
})

test('helpAuditFontWeight numeric branch returns font-SIZE tokens (known bug, pinned)', () => {
  // 700/900 say --ddd-font-size-bold/black (copy-paste from font-size). Fix, then fix this.
  assert.equal(helpAuditFontWeight('700'), '--ddd-font-size-bold')
  assert.equal(helpAuditFontWeight('900'), '--ddd-font-size-black')
})

test('helpAuditFontWeight maps named weights', () => {
  assert.equal(helpAuditFontWeight('lighter'), '--ddd-font-weight-light')
  assert.equal(helpAuditFontWeight('normal'), '--ddd-font-weight-regular')
  assert.equal(helpAuditFontWeight('bold'), '--ddd-font-weight-bold')
  assert.equal(helpAuditFontWeight('bolder'), '--ddd-font-weight-black')
  assert.equal(
    helpAuditFontWeight('weird'),
    'No available suggestions. Check DDD documentation.',
  )
})

test('helpAuditLetterSpacing maps px values to ddd ls tokens', () => {
  assert.equal(helpAuditLetterSpacing('0.08px'), '--ddd-ls-16-sm')
  assert.equal(helpAuditLetterSpacing('0.1px'), '--ddd-ls-20-sm')
  assert.equal(helpAuditLetterSpacing('1px'), '--ddd-ls-72-lg')
})

test('helpAuditLetterSpacing returns no-suggestions without px', () => {
  assert.equal(
    helpAuditLetterSpacing('normal'),
    'No available suggestions. Check DDD documentation.',
  )
})

test('helpAuditLineHeight maps % values to ddd lh tokens', () => {
  assert.equal(helpAuditLineHeight('120%'), '--ddd-lh-120')
  assert.equal(helpAuditLineHeight('130%'), '--ddd-lh-140')
  assert.equal(helpAuditLineHeight('150%'), '--ddd-lh-150')
})

test('helpAuditLineHeight returns no-suggestions without %', () => {
  assert.equal(
    helpAuditLineHeight('1.5'),
    'No available suggestions. Check DDD documentation.',
  )
})

test('helpAuditRadius maps px and % radii to ddd radius tokens', () => {
  assert.equal(helpAuditRadius('0px'), '--ddd-radius-0')
  assert.equal(helpAuditRadius('4px'), '--ddd-radius-xs')
  assert.equal(helpAuditRadius('8px'), '--ddd-radius-sm')
  assert.equal(helpAuditRadius('12px'), '--ddd-radius-md')
  assert.equal(helpAuditRadius('16px'), '--ddd-radius-lg')
  assert.equal(helpAuditRadius('20px'), '--ddd-radius-xl')
  assert.equal(helpAuditRadius('100px'), '--ddd-radius-rounded')
  assert.equal(helpAuditRadius('100%'), '--ddd-radius-circle')
})

test('helpAuditRadius returns no-suggestions for non-circle % and unitless', () => {
  assert.equal(
    helpAuditRadius('50%'),
    'No available suggestions. Check DDD documentation.',
  )
  assert.equal(
    helpAuditRadius('round'),
    'No available suggestions. Check DDD documentation.',
  )
})

test('helpAuditSpacing maps px values to ddd spacing tokens', () => {
  assert.equal(helpAuditSpacing('0px'), '--ddd-spacing-0')
  assert.equal(helpAuditSpacing('4px'), '--ddd-spacing-1')
  assert.equal(helpAuditSpacing('8px'), '--ddd-spacing-2')
  assert.equal(helpAuditSpacing('100px'), '--ddd-spacing-25')
  assert.equal(helpAuditSpacing('120px'), '--ddd-spacing-30')
})

test('helpAuditSpacing treats unitless "0" as 0px via loose equality', () => {
  // `spacing == 0` (== not ===) coerces "0" to 0 -> spacing-0
  assert.equal(helpAuditSpacing('0'), '--ddd-spacing-0')
  assert.equal(
    helpAuditSpacing('5'),
    'No available suggestions. Check DDD documentation.',
  )
})
