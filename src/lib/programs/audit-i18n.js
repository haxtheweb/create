import * as p from '@clack/prompts';
import { existsSync, readdirSync, readFileSync, statSync, writeSync } from 'node:fs';
import path from 'node:path';
import color from 'picocolors';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

/**
 * `hax audit i18n`: find English hardcoded in Lit html`` templates so new
 * UI text goes through this.t and stays translatable.
 *
 * Flags literal text nodes and literal values of user-facing attributes
 * (aria-label, title, placeholder, alt...). Bound values (${...}) are fine.
 *
 * Opt out:
 *   - a line containing `i18n-ignore` (or the line above it)
 *   - a file containing `i18n-ignore-file`
 *   - an .i18nignore file (same format as .dddignore: `/dir`, `*.ext`, `file.js`)
 */

// attributes people read or hear
export const I18N_ATTRIBUTES = [
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'alt',
  'title',
  'placeholder',
  'label',
  'tooltip',
  'button-label',
];

// never audited: dependencies, build output, tests, demos, translations
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'public',
  'test',
  'tests',
  'demo',
  'locales',
  'coverage',
  'stories',
]);

const ATTRIBUTE_RE = new RegExp(
  `(?<![\\w.:@?-])(${I18N_ATTRIBUTES.join('|')})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
  'g',
);

/**
 * @description Is this literal text something a person would need translated?
 * Skips whitespace, numbers and punctuation, entities, icon names, URLs,
 * file names, CSS and kebab-case identifiers.
 * @returns the cleaned-up text, or null when it needs no translation
 */
export function translatableText(value) {
  const text = String(value)
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 2) {
    return null;
  }
  // needs at least two letters in a row, in any script
  if (!/\p{L}{2,}/u.test(text)) {
    return null;
  }
  if (/^[a-z0-9]+:[\w-]+$/i.test(text)) {
    return null; // icon names like hax:wizard-hat
  }
  if (/^(https?:|mailto:|tel:|\/|\.\.?\/|#)/i.test(text)) {
    return null;
  }
  if (/^[\w-]+\.(js|json|css|html|png|svg|jpe?g|gif|webp|mp3|mp4)$/i.test(text)) {
    return null;
  }
  if (/^--[\w-]+$/.test(text) || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(text)) {
    return null; // CSS variables, kebab-case ids / tag names
  }
  if (/[{};]/.test(text)) {
    return null; // code or CSS, not prose
  }
  return text;
}

function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function position(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return { line: lo + 1, column: offset - starts[lo] + 1 };
}

const BLANK = (text) => text.replace(/[^\n]/g, ' ');

/**
 * @description Blank out comments and style / script / code / pre / kbd /
 * samp / var blocks in
 * one static part of a template. Blocks can span ${} bindings, so the open
 * block (if any) carries over to the next part.
 * @param raw the static template text
 * @param open the block still open from the previous part: null, 'comment' or a tag name
 * @returns {{text: string, open: string|null}}
 */
export function scrubTemplatePart(raw, open = null) {
  let out = '';
  let rest = raw;
  while (rest.length) {
    if (open) {
      const close = open === 'comment' ? /-->/ : new RegExp(`</${open}\\s*>`, 'i');
      const m = rest.match(close);
      if (!m) {
        return { text: out + BLANK(rest), open };
      }
      const end = m.index + m[0].length;
      out += BLANK(rest.slice(0, end));
      rest = rest.slice(end);
      open = null;
      continue;
    }
    const m = rest.match(/<!--|<(style|script|code|pre|kbd|samp|var)\b[^>]*>/i);
    if (!m) {
      return { text: out + rest, open: null };
    }
    out += rest.slice(0, m.index) + BLANK(m[0]);
    rest = rest.slice(m.index + m[0].length);
    open = m[1] ? m[1].toLowerCase() : 'comment';
  }
  return { text: out, open };
}

function isHtmlTag(tag) {
  // html`` and lit's svg-free variants like this.html`` / lit.html``
  if (tag.type === 'Identifier') {
    return tag.name === 'html';
  }
  return tag.type === 'MemberExpression' && !tag.computed && tag.property && tag.property.name === 'html';
}

/**
 * @description Find hardcoded user-facing strings in Lit templates
 * @param source JavaScript source
 * @returns {{findings: Array, error: string|null}}
 *   findings: { line, column, kind: 'text'|'attribute', attribute?, text }
 */
export function findHardcodedStrings(source) {
  if (source.includes('i18n-ignore-file')) {
    return { findings: [], error: null };
  }
  if (!source.includes('html`')) {
    return { findings: [], error: null };
  }
  let ast;
  try {
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  } catch (e) {
    return { findings: [], error: e.message };
  }
  const starts = lineStarts(source);
  const lines = source.split('\n');
  const ignored = (line) =>
    (lines[line - 1] || '').includes('i18n-ignore') || (lines[line - 2] || '').includes('i18n-ignore');
  const findings = [];
  const add = (offset, kind, text, attribute) => {
    const pos = position(starts, offset);
    if (ignored(pos.line)) {
      return;
    }
    const finding = { line: pos.line, column: pos.column, kind, text };
    if (attribute) {
      finding.attribute = attribute;
    }
    findings.push(finding);
  };
  walk.full(ast, (node) => {
    if (node.type !== 'TaggedTemplateExpression' || !isHtmlTag(node.tag)) {
      return;
    }
    const quasis = node.quasi.quasis;
    let open = null;
    quasis.forEach((quasi, index) => {
      const raw = quasi.value.raw;
      // blank out style / script / code blocks so CSS and samples aren't read as text
      const part = scrubTemplatePart(raw, open);
      const scrubbed = part.text;
      open = part.open;
      for (const m of scrubbed.matchAll(ATTRIBUTE_RE)) {
        const value = m[2] !== undefined ? m[2] : m[3];
        const text = translatableText(value);
        if (text) {
          add(quasi.start + m.index, 'attribute', text, m[1]);
        }
      }
      // attribute text that runs into a binding, e.g. title="Edit ${name}"
      if (index < quasis.length - 1) {
        const open = scrubbed.match(new RegExp(`(?<![\\w.:@?-])(${I18N_ATTRIBUTES.join('|')})\\s*=\\s*["']([^"'<>]*)$`));
        if (open) {
          const text = translatableText(open[2]);
          if (text) {
            add(quasi.start + open.index, 'attribute', text, open[1]);
          }
        }
      }
      // text between tags, inside this static part of the template
      for (const m of scrubbed.matchAll(/>([^<>]+)</g)) {
        const text = translatableText(m[1]);
        if (text) {
          add(quasi.start + m.index + 1, 'text', text);
        }
      }
      // text that runs into a ${} binding, e.g. <p>Hello ${name}</p>
      if (index < quasis.length - 1) {
        const tail = scrubbed.match(/>([^<>]+)$/);
        if (tail) {
          const text = translatableText(tail[1]);
          if (text) {
            add(quasi.start + scrubbed.length - tail[1].length, 'text', text);
          }
        }
      }
      // text after a ${} binding, e.g. <p>${count} items</p>
      if (index > 0) {
        const head = scrubbed.match(/^([^<>]+)</);
        if (head) {
          const text = translatableText(head[1]);
          if (text) {
            add(quasi.start, 'text', text);
          }
        }
      }
    });
  });
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return { findings, error: null };
}

/**
 * @description Read .i18nignore files (same format as .dddignore)
 * @returns Array of { highestPath, name, type: 'file'|'directory'|'extension' }
 */
export function i18nignoreInterpreter(root) {
  let list = [];
  if (!existsSync(root)) {
    return list;
  }
  for (const item of readdirSync(root)) {
    const full = path.join(root, item);
    let stats;
    try {
      stats = statSync(full);
    } catch (e) {
      continue;
    }
    if (stats.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(item)) {
        list = list.concat(i18nignoreInterpreter(full));
      }
    } else if (item === '.i18nignore') {
      for (const rawLine of readFileSync(full, 'utf-8').split('\n')) {
        let line = rawLine.split('#')[0].trim();
        if (!line) {
          continue;
        }
        let type = 'file';
        if (line.startsWith('/') || line.startsWith('\\')) {
          line = line.substring(1);
          type = 'directory';
        } else if (line.startsWith('*')) {
          line = line.substring(1);
          type = 'extension';
        }
        list.push({ highestPath: root, name: line, type });
      }
    }
  }
  return list;
}

function isIgnored(full, isDirectory, ignore) {
  const name = path.basename(full);
  return ignore.some((rule) => {
    if (!full.startsWith(rule.highestPath)) {
      return false;
    }
    if (rule.type === 'directory') {
      return isDirectory && name === rule.name;
    }
    if (rule.type === 'extension') {
      return !isDirectory && name.endsWith(rule.name);
    }
    return !isDirectory && name === rule.name;
  });
}

/**
 * @description List the JavaScript files the i18n audit reads
 */
export function discoverI18nTargets(root, ignore = i18nignoreInterpreter(root)) {
  const files = [];
  if (!existsSync(root)) {
    return files;
  }
  for (const item of readdirSync(root)) {
    if (item.startsWith('.')) {
      continue;
    }
    const full = path.join(root, item);
    let stats;
    try {
      stats = statSync(full);
    } catch (e) {
      continue;
    }
    if (stats.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(item) && !isIgnored(full, true, ignore)) {
        files.push(...discoverI18nTargets(full, ignore));
      }
    } else if (
      /\.(js|mjs)$/.test(item) &&
      !/\.(test|spec|stories)\.m?js$/.test(item) &&
      !/(rollup|vite|webpack|babel|eslint|prettier|web-test-runner|wds|custom-elements)[\w.-]*\.(config\.)?m?js$/.test(item) &&
      !isIgnored(full, false, ignore)
    ) {
      files.push(full);
    }
  }
  return files;
}

function writeAllSync(text) {
  const buf = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < buf.length) {
    try {
      offset += writeSync(1, buf, offset, buf.length - offset);
    } catch (e) {
      if (e.code !== 'EAGAIN') {
        throw e;
      }
    }
  }
}

/**
 * @description Run the i18n audit and report; does not exit the process
 * @param commandRun CLI state (options.format === 'json' for machine output)
 * @param root directory to audit (defaults to cwd)
 * @param deps injectable { write } for tests
 * @returns {{passed: boolean, files: number, findings: Array, errors: Array}}
 */
export function auditI18nCommand(commandRun, root = null, deps = {}) {
  const options = (commandRun && commandRun.options) || {};
  const projectRoot = root || process.cwd();
  const asJson = options.format === 'json';
  const files = discoverI18nTargets(projectRoot);
  const findings = [];
  const errors = [];
  for (const file of files) {
    const result = findHardcodedStrings(readFileSync(file, 'utf8'));
    const rel = path.relative(projectRoot, file) || file;
    if (result.error) {
      errors.push({ file: rel, error: result.error });
    }
    for (const f of result.findings) {
      findings.push({ file: rel, ...f });
    }
  }
  const passed = findings.length === 0;
  if (asJson) {
    const out = deps.write || writeAllSync;
    out(JSON.stringify({ passed, files: files.length, findings, errors }, null, 2) + '\n');
    return { passed, files: files.length, findings, errors };
  }
  p.intro(`${color.bgBlack(` 🌐 Auditing translatable text: ${color.underline(color.bold(color.yellow(projectRoot)))} `)}`);
  let current = null;
  for (const f of findings) {
    if (f.file !== current) {
      current = f.file;
      p.log.error(color.bold(f.file));
    }
    const what = f.kind === 'attribute' ? `${f.attribute}="${f.text}"` : `"${f.text}"`;
    p.log.message(`${color.dim(`${f.line}:${f.column}`)} ${what}`);
  }
  if (options.debug) {
    for (const e of errors) {
      p.log.warn(`Could not parse ${e.file}: ${e.error}`);
    }
  }
  p.outro(passed
    ? `🎉 No hardcoded text in ${files.length} file(s)`
    : `${findings.length} hardcoded string(s) in ${new Set(findings.map((f) => f.file)).size} file(s). Move each into this.t and render it as \${this.t.key} so it can be translated; mark intentional ones with an i18n-ignore comment.`);
  return { passed, files: files.length, findings, errors };
}
