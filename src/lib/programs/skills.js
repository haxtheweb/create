import * as fs from 'node:fs';
import * as path from 'node:path';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { log, writeData } from '../logging.js';
import { t } from '../i18n.js';

/**
 * @description Actions available for the skills command
 * @returns Array of action objects
 */
export function skillsActions() {
  return [
    { value: 'list', label: t('skillsActionList') },
    { value: 'install', label: t('skillsActionInstall', { path: '.agents/skills/' }) },
  ];
}

/**
 * @description Returns the path to the bundled skills directory (dist/skills/)
 * @returns string path to bundled skills
 */
function getBundledSkillsPath() {
  // __dirname is dist/lib/programs/ in the built CLI, so skills are at ../../skills/
  return path.resolve(__dirname, '../../skills');
}

/**
 * @description Lists all bundled skills by reading SKILL.md frontmatter from dist/skills/
 * @returns Array of skill objects with name, description, version
 */
export function listBundledSkills() {
  const skillsPath = getBundledSkillsPath();
  let skills = [];
  if (fs.existsSync(skillsPath)) {
    const dirs = fs.readdirSync(skillsPath).filter(d =>
      fs.statSync(path.join(skillsPath, d)).isDirectory() &&
      fs.existsSync(path.join(skillsPath, d, 'SKILL.md'))
    );
    for (const dir of dirs) {
      const skillPath = path.join(skillsPath, dir, 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf-8');
      // parse YAML frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let skill = { name: dir, dir, path: skillPath };
      if (fmMatch) {
        const fm = fmMatch[1];
        const nameMatch = fm.match(/^name:\s*(.+)/m);
        const versionMatch = fm.match(/^version:\s*(.+)/m);
        const descMatch = fm.match(/description:\s*>\s*\n([\s\S]*?)(?=\n[a-z]|\n---)/m);
        if (nameMatch) skill.name = nameMatch[1].trim();
        if (versionMatch) skill.version = versionMatch[1].trim();
        if (descMatch) {
          skill.description = descMatch[1].replace(/^\s+/gm, ' ').trim();
        }
      }
      skills.push(skill);
    }
  }
  return skills;
}

/**
 * @description Copies a skill directory recursively to a target
 * @param src source skill directory
 * @param dest destination skill directory
 */
export function copySkillDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copySkillDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * @description Installs one or all bundled skills into a target .agents/skills/ directory
 * @param skills list of bundled skill objects
 * @param skillName name of skill to install, or 'all' for all
 * @param targetPath target directory (default ~/.agents/skills/)
 */
export function installSkills(skills, skillName, targetPath) {
  const bundledPath = getBundledSkillsPath();
  if (!targetPath) {
    targetPath = path.join(process.env.HOME || process.env.USERPROFILE, '.agents', 'skills');
  }
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
  let toInstall = skills;
  if (skillName && skillName !== 'all') {
    toInstall = skills.filter(s => s.name === skillName || s.dir === skillName);
    if (toInstall.length === 0) {
      log(`Skill "${skillName}" not found in bundled skills. Run \`hax skills list\` to see what is available.`, 'error');
      return [];
    }
  }
  let installed = [];
  for (const skill of toInstall) {
    const srcDir = path.join(bundledPath, skill.dir);
    const destDir = path.join(targetPath, skill.dir);
    copySkillDir(srcDir, destDir);
    installed.push(skill);
    if (!process.env.haxquiet) {
      p.intro(`${color.bgGreen(color.black(` ✓ ${t('skillsInstalled', { name: skill.name, path: destDir })} `))}`);
    }
  }
  return installed;
}

/**
 * @description Runs the skills command, called when `hax skills` is run
 * @param commandRun CLI command state
 */
export async function skillsCommandDetected(commandRun) {
  const action = commandRun.arguments && commandRun.arguments.action;
  const skills = listBundledSkills();

  if (skills.length === 0) {
    const bundledPath = getBundledSkillsPath();
    if (!process.env.haxquiet) {
      p.intro(`${color.bgBlack(color.white(` ${t('skillsNoneFound', { path: bundledPath })} `))}`);
    }
    return;
  }

  if (action === 'list') {
    if (commandRun.options && commandRun.options.format === 'json') {
      const out = skills.map(s => ({ name: s.name, version: s.version, description: s.description }));
      writeData(JSON.stringify(out, null, 2));
    } else {
      p.intro(`${color.bgBlack(color.white(` ${t('skillsBundledList', { count: skills.length })} `))}`);
      for (const skill of skills) {
        p.intro(`${color.cyan(skill.name)} v${skill.version || '?'} — ${skill.description || ''}`);
      }
      p.outro(t('skillsInstallWith', { all: color.bold('hax skills install --all'), one: color.bold('hax skills install <name>') }));
    }
  }
  else if (action === 'install') {
    const options = commandRun.options || {};
    // accepted forms: --all, --skill-name <name|all>, or `hax skills install <name>`
    let skillName = options.all ? 'all' : (options.skillName || (commandRun.arguments && commandRun.arguments.name));
    const targetPath = options.path;
    if (!skillName) {
      if (options.y) {
        skillName = 'all';
      } else if (options.i === false) {
        // nobody can answer a picker without a terminal
        log('Specify which skills to install: hax skills install --all, hax skills install <name>, or --skill-name <name>', 'error');
        process.exitCode = 1;
        return;
      } else {
        const choices = [
          { value: 'all', label: t('skillsAllBundled') },
          ...skills.map(s => ({ value: s.name, label: `${s.name} v${s.version || '?'}` })),
        ];
        skillName = await p.select({
          message: t('skillsWhichToInstall'),
          options: choices,
        });
      }
    }
    if (p.isCancel(skillName)) {
      return;
    }
    const installed = installSkills(skills, skillName, targetPath);
    if (installed.length === 0) {
      process.exitCode = 1;
      return;
    }
    if (!process.env.haxquiet) {
      p.outro(t('skillsInstalledCount', { count: color.green(installed.length) }));
    }
  }
  else {
    // no action specified — show list
    if (commandRun.options && commandRun.options.format === 'json') {
      const out = skills.map(s => ({ name: s.name, version: s.version, description: s.description }));
      writeData(JSON.stringify(out, null, 2));
    } else {
      p.intro(`${color.bgBlack(color.white(` ${t('skillsBundledList', { count: skills.length })} `))}`);
      for (const skill of skills) {
        p.intro(`${color.cyan(skill.name)} v${skill.version || '?'} — ${skill.description || ''}`);
      }
      p.outro(t('skillsInstallWith', { all: color.bold('hax skills install --all'), one: color.bold('hax skills install <name>') }));
    }
  }
}
