'use strict'

// Transpile ESM src on the fly so .cjs tests can require() it.
require('@babel/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

// Suppress @clack/prompts output during installSkills calls
process.env.haxquiet = '1'

const {
  listBundledSkills,
  copySkillDir,
  installSkills,
} = require('../../src/lib/programs/skills.js')

// --- copySkillDir: recursive directory copy ---

test('copySkillDir copies a directory tree recursively (files + subdirs)', () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-copyskill-src-'))
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-copyskill-dest-'))
  try {
    // build a small tree: a.js, sub/b.js, sub/deep/c.js
    fs.mkdirSync(path.join(src, 'sub', 'deep'), { recursive: true })
    fs.writeFileSync(path.join(src, 'a.js'), 'a')
    fs.writeFileSync(path.join(src, 'sub', 'b.js'), 'b')
    fs.writeFileSync(path.join(src, 'sub', 'deep', 'c.js'), 'c')
    fs.writeFileSync(path.join(src, 'SKILL.md'), '---\nname: test\n---\n')

    copySkillDir(src, dest)

    assert.ok(fs.existsSync(path.join(dest, 'a.js')), 'a.js copied')
    assert.equal(fs.readFileSync(path.join(dest, 'a.js'), 'utf8'), 'a')
    assert.ok(fs.existsSync(path.join(dest, 'sub', 'b.js')), 'sub/b.js copied')
    assert.equal(fs.readFileSync(path.join(dest, 'sub', 'b.js'), 'utf8'), 'b')
    assert.ok(fs.existsSync(path.join(dest, 'sub', 'deep', 'c.js')), 'sub/deep/c.js copied')
    assert.equal(fs.readFileSync(path.join(dest, 'sub', 'deep', 'c.js'), 'utf8'), 'c')
    assert.ok(fs.existsSync(path.join(dest, 'SKILL.md')), 'SKILL.md copied')
  } finally {
    fs.rmSync(src, { recursive: true, force: true })
    fs.rmSync(dest, { recursive: true, force: true })
  }
})

test('copySkillDir creates the destination if it does not exist', () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-copyskill-src2-'))
  const dest = path.join(os.tmpdir(), 'hax-copyskill-dest-new-' + Date.now())
  try {
    fs.writeFileSync(path.join(src, 'file.txt'), 'content')
    copySkillDir(src, dest)
    assert.ok(fs.existsSync(path.join(dest, 'file.txt')), 'file copied into newly-created dest')
  } finally {
    fs.rmSync(src, { recursive: true, force: true })
    fs.rmSync(dest, { recursive: true, force: true })
  }
})

// --- listBundledSkills: reads SKILL.md frontmatter from dist/skills/ ---

test('listBundledSkills returns an array of skill objects with expected shape', () => {
  const skills = listBundledSkills()
  assert.ok(Array.isArray(skills), 'returns an array')

  // The repo ships bundled skills in src/skills/ (and dist/skills/ after build).
  // If the directory is empty or missing in this env, the array is [] — but in
  // practice the create package ships several skills.
  if (skills.length > 0) {
    const first = skills[0]
    assert.ok(typeof first.name === 'string', 'skill has a name')
    assert.ok(typeof first.dir === 'string', 'skill has a dir')
    assert.ok(typeof first.path === 'string', 'skill has a path')
    assert.ok(fs.existsSync(first.path), 'skill path points to a real SKILL.md')
  }
})

// --- installSkills: copies bundled skills into a target .agents/skills/ ---

test('installSkills copies a specific skill by name into the target path', (t) => {
  const skills = listBundledSkills()
  if (skills.length === 0) {
    t.skip('no bundled skills available to install')
    return
  }
  const targetPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-installskills-'))
  try {
    const skillName = skills[0].name
    const installed = installSkills(skills, skillName, targetPath)
    assert.equal(installed.length, 1, 'one skill installed')
    assert.equal(installed[0].name, skillName, 'correct skill installed')
    // the skill directory should exist in the target
    const installedDir = path.join(targetPath, skills[0].dir)
    assert.ok(fs.existsSync(installedDir), 'skill directory created in target')
    assert.ok(fs.existsSync(path.join(installedDir, 'SKILL.md')), 'SKILL.md present in target')
  } finally {
    fs.rmSync(targetPath, { recursive: true, force: true })
  }
})

test('installSkills installs all skills when skillName is "all"', (t) => {
  const skills = listBundledSkills()
  if (skills.length === 0) {
    t.skip('no bundled skills available to install')
    return
  }
  const targetPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-installskills-all-'))
  try {
    const installed = installSkills(skills, 'all', targetPath)
    assert.equal(installed.length, skills.length, 'all skills installed')
    for (const skill of skills) {
      assert.ok(
        fs.existsSync(path.join(targetPath, skill.dir, 'SKILL.md')),
        `${skill.name} SKILL.md present in target`,
      )
    }
  } finally {
    fs.rmSync(targetPath, { recursive: true, force: true })
  }
})

test('installSkills returns [] and logs an error for an unknown skill name', () => {
  const skills = listBundledSkills()
  const targetPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hax-installskills-bad-'))
  try {
    const installed = installSkills(skills, 'no-such-skill-name', targetPath)
    assert.deepEqual(installed, [], 'no skills installed for unknown name')
  } finally {
    fs.rmSync(targetPath, { recursive: true, force: true })
  }
})
