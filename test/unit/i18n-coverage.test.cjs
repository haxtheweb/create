"use strict";

// Keeps the hax CLI translatable:
// - text people read (prompts, notes, logs, help) goes through t(), not literals
// - every t('key') exists in create.en.json, and every English key is used
// - every create.<lang>.json only has known keys and keeps the {placeholders}
// Mark deliberate English with an `i18n-ignore` comment on the line or the line above.
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const acorn = require("acorn");
const walk = require("acorn-walk");

const SRC = path.join(__dirname, "../../src");
const LOCALES = path.join(SRC, "locales");
const SKIP = new Set(["art.js", "i18n.js"]);

function sourceFiles() {
  const out = [path.join(SRC, "create.js")];
  for (const dir of [path.join(SRC, "lib"), path.join(SRC, "lib/programs")]) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".js") && !SKIP.has(f)) out.push(path.join(dir, f));
    }
  }
  return out;
}

// prose: two words separated by spaces, or one capitalized word ("Cancel").
// Example values, identifiers, paths, emails, URLs, acronyms ("PDF") and
// commands ("hax site") are not prose.
function isProse(text) {
  const s = String(text).trim();
  if (/^hax(\s+[\w:{}-]+)+$/.test(s)) return false;
  if (/\p{L}{2,}\S*[^\S\r\n]+\S*\p{L}{2,}/u.test(s)) return true;
  return /^\p{Lu}\p{Ll}+[.!?:]?$/u.test(s);
}

// literal text a person would read; ${...} parts count as a placeholder
function literalText(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string")
    return isProse(node.value) ? node.value : null;
  if (node.type === "TemplateLiteral") {
    const text = node.quasis.map((q) => q.value.cooked || "").join("{}");
    return isProse(text) ? text.trim() : null;
  }
  return null;
}

function memberPath(node) {
  const parts = [];
  while (node && node.type === "MemberExpression" && !node.computed) {
    parts.unshift(node.property.name);
    node = node.object;
  }
  if (node && node.type === "Identifier") parts.unshift(node.name);
  return parts.join(".");
}

const PROMPTS = new Set([
  "p.text",
  "p.select",
  "p.multiselect",
  "p.confirm",
  "p.password",
  "p.groupMultiselect",
  "p.selectKey",
]);
const PROMPT_FIELDS = new Set(["message", "placeholder", "label", "hint"]);

function findUntranslated(file) {
  const source = fs.readFileSync(file, "utf8");
  const lines = source.split("\n");
  const ast = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
  });
  const found = [];
  const flag = (node, text) => {
    const line = node.loc.start.line;
    if (
      (lines[line - 1] || "").includes("i18n-ignore") ||
      (lines[line - 2] || "").includes("i18n-ignore")
    )
      return;
    found.push(
      `${path.relative(SRC, file)}:${line} ${JSON.stringify(text.slice(0, 70))}`,
    );
  };
  const checkArg = (node) => {
    const text = literalText(node);
    if (text) flag(node, text);
  };
  walk.full(ast, (node) => {
    if (node.type !== "CallExpression") return;
    const callee = memberPath(node.callee);
    const method =
      node.callee.type === "MemberExpression" && !node.callee.computed
        ? node.callee.property.name
        : null;
    // clack notes and logs
    if (
      /^p\.(intro|outro|note|cancel)$/.test(callee) ||
      /^p\.log\.\w+$/.test(callee)
    ) {
      node.arguments.forEach(checkArg);
    }
    // console output and program errors
    if (
      /^console\.(log|error|warn|info)$/.test(callee) ||
      callee === "program.error"
    ) {
      checkArg(node.arguments[0]);
    }
    // commander help text
    if (method === "description" || method === "summary")
      checkArg(node.arguments[0]);
    if (
      method === "option" ||
      method === "requiredOption" ||
      method === "argument"
    )
      checkArg(node.arguments[1]);
    if (method === "addHelpText") checkArg(node.arguments[1]);
    // prompt messages, placeholders, option labels and hints
    if (PROMPTS.has(callee)) {
      walk.full(node.arguments[0] || { type: "EmptyStatement" }, (n) => {
        if (
          n.type === "Property" &&
          !n.computed &&
          n.key &&
          PROMPT_FIELDS.has(n.key.name || n.key.value)
        ) {
          checkArg(n.value);
        }
      });
    }
  });
  return found;
}

function usedKeys(file) {
  const source = fs.readFileSync(file, "utf8");
  const keys = new Set();
  // t('key') calls, plus keys looked up indirectly (e.g. labelKey: 'auditSchemaLabelSite')
  for (const m of source.matchAll(/['"]([A-Za-z][\w.-]*)['"]/g)) keys.add(m[1]);
  return keys;
}

const placeholders = (s) =>
  [...String(s).matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");

test("CLI text people read goes through t()", () => {
  const found = sourceFiles().flatMap(findUntranslated);
  assert.deepEqual(
    found,
    [],
    `Wrap these in t() (add the English to src/locales/create.en.json), or mark deliberate English with an i18n-ignore comment:\n${found.join("\n")}`,
  );
});

test("every t() key exists in create.en.json and every English key is used", () => {
  const en = JSON.parse(
    fs.readFileSync(path.join(LOCALES, "create.en.json"), "utf8"),
  );
  const used = new Set();
  for (const f of sourceFiles()) for (const k of usedKeys(f)) used.add(k);
  const called = new Set();
  for (const f of sourceFiles()) {
    for (const m of fs
      .readFileSync(f, "utf8")
      .matchAll(/\bt\(\s*['"]([\w.-]+)['"]/g))
      called.add(m[1]);
  }
  const missing = [...called].filter((k) => !(k in en));
  assert.deepEqual(
    missing,
    [],
    "keys used in code but missing from create.en.json",
  );
  const unused = Object.keys(en).filter((k) => !used.has(k));
  assert.deepEqual(unused, [], "keys in create.en.json that no code uses");
});

test("translations only use known keys and keep the placeholders", () => {
  const en = JSON.parse(
    fs.readFileSync(path.join(LOCALES, "create.en.json"), "utf8"),
  );
  const problems = [];
  for (const f of fs.readdirSync(LOCALES)) {
    const m = f.match(/^create\.([\w-]+)\.json$/);
    if (!m || m[1] === "en") continue;
    const data = JSON.parse(fs.readFileSync(path.join(LOCALES, f), "utf8"));
    for (const [k, v] of Object.entries(data)) {
      if (!(k in en)) problems.push(`${f}: unknown key ${k}`);
      else if (typeof v !== "string" || !v) problems.push(`${f}: empty ${k}`);
      else if (placeholders(v) !== placeholders(en[k]))
        problems.push(
          `${f}: ${k} placeholders {${placeholders(v)}} vs {${placeholders(en[k])}}`,
        );
    }
  }
  assert.deepEqual(problems, []);
});
