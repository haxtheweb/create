import * as p from "@clack/prompts";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import color from "picocolors";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { t } from "../i18n.js";

/**
 * `hax audit fuzz`: report-only list of sanitizer / parser code that no
 * property-based (fuzz) test exercises (haxtheweb/issues#3386).
 *
 * Code that takes text from outside (an attribute, a slot, a file, a URL)
 * and decides what it means is where a hand-picked example misses the input
 * nobody thought of. This finds the functions that do that work by name
 * (sanitize*, parse*, escape*, ...) and checks whether a test file that uses
 * fast-check names them. It never fails a build: the report says where a
 * property test is missing, and `hax webcomponent wc:fuzz` writes a starter
 * one. Fuzz convention: https://github.com/haxtheweb/issues/issues/3272
 */

// a function whose name starts with one of these reads or rewrites input
export const FUZZ_NAME_PREFIXES = [
  "sanitize",
  "sanitise",
  "parse",
  "escape",
  "unescape",
  "decode",
  "encode",
  "strip",
  "purify",
  "normalize",
  "normalise",
  "tokenize",
  "deserialize",
  "slugify",
  "clean",
  "validate",
];

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "public",
  "coverage",
  "locales",
  "demo",
  "templates",
  "vendor",
]);
const TEST_DIRECTORIES = new Set(["test", "tests", "__tests__"]);
const SOURCE_EXTENSIONS = [".js", ".mjs", ".cjs"];
// files larger than this are bundles or data, not hand-written parsers
const MAX_SOURCE_BYTES = 512 * 1024;

/**
 * @description Is this the name of sanitizer / parser code?
 */
export function isInputHandlingName(name) {
  if (typeof name !== "string") {
    return false;
  }
  const bare = name.replace(/^[_#]+/, "").toLowerCase();
  return FUZZ_NAME_PREFIXES.some(
    (prefix) => bare.startsWith(prefix) && bare !== prefix + "d",
  );
}

/**
 * @description Does this test source use fast-check?
 */
export function isPropertyTestSource(source) {
  return (
    source.includes('"fast-check"') ||
    source.includes("'fast-check'") ||
    source.includes("@fast-check/")
  );
}

function isTestFile(relativePath) {
  const parts = relativePath.split(path.sep);
  const file = parts[parts.length - 1];
  return (
    parts.slice(0, -1).some((part) => TEST_DIRECTORIES.has(part)) ||
    file.includes(".test.") ||
    file.includes(".spec.")
  );
}

function functionNode(node) {
  return (
    node &&
    (node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression")
  );
}

function keyName(key, computed) {
  if (computed || !key) {
    return null;
  }
  if (key.type === "Identifier" || key.type === "PrivateIdentifier") {
    return key.name;
  }
  return typeof key.value === "string" ? key.value : null;
}

/**
 * @description The functions a source file declares whose names say they
 * handle input: [{ name, line, kind }]. A file acorn cannot parse (JSX, a
 * syntax newer than the parser) is read line by line instead.
 */
export function inputHandlingFunctions(source) {
  const found = [];
  const add = (name, node, kind) => {
    if (isInputHandlingName(name)) {
      found.push({ name, line: node.loc ? node.loc.start.line : 0, kind });
    }
  };
  let ast = null;
  for (const sourceType of ["module", "script"]) {
    try {
      ast = acorn.parse(source, {
        ecmaVersion: "latest",
        sourceType,
        locations: true,
        allowHashBang: true,
        allowReturnOutsideFunction: true,
      });
      break;
    } catch {
      ast = null;
    }
  }
  if (!ast) {
    const declaration =
      /^(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\())/;
    source.split("\n").forEach((text, index) => {
      // long lines are minified code, never a declaration someone wrote
      if (text.length > 400) {
        return;
      }
      const match = declaration.exec(text.trimStart());
      const name = match && (match[1] || match[2]);
      if (isInputHandlingName(name)) {
        found.push({ name, line: index + 1, kind: "function" });
      }
    });
    return found;
  }
  walk.simple(ast, {
    FunctionDeclaration(node) {
      if (node.id) {
        add(node.id.name, node, "function");
      }
    },
    VariableDeclarator(node) {
      if (node.id.type === "Identifier" && functionNode(node.init)) {
        add(node.id.name, node, "function");
      }
    },
    MethodDefinition(node) {
      if (node.kind === "method") {
        add(keyName(node.key, node.computed), node, "method");
      }
    },
    PropertyDefinition(node) {
      if (functionNode(node.value)) {
        add(keyName(node.key, node.computed), node, "method");
      }
    },
    Property(node) {
      if (functionNode(node.value)) {
        add(keyName(node.key, node.computed), node, "method");
      }
    },
    AssignmentExpression(node) {
      if (node.left.type === "MemberExpression" && functionNode(node.right)) {
        add(keyName(node.left.property, node.left.computed), node, "function");
      }
    },
  });
  return found;
}

// identifiers a test file mentions; a name counts as tested when a
// property test in the same package has it among them
function identifiersIn(source) {
  return new Set(source.match(/[A-Za-z_$][\w$]*/g) || []);
}

/**
 * @description Walk a project: source files, and the property tests of each
 * package (the nearest folder up that has a package.json).
 */
export function collectFuzzTargets(root) {
  const sources = [];
  const propertyTests = [];
  const visit = (dir, packageRoot) => {
    let entries = [];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    const pkg = existsSync(path.join(dir, "package.json")) ? dir : packageRoot;
    for (const entry of entries) {
      if (SKIP_DIRECTORIES.has(entry) || entry.startsWith(".")) {
        continue;
      }
      const full = path.join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        visit(full, pkg);
        continue;
      }
      if (
        !SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext)) ||
        entry.endsWith(".min.js") ||
        stat.size > MAX_SOURCE_BYTES
      ) {
        continue;
      }
      const relative = path.relative(root, full);
      if (isTestFile(relative)) {
        propertyTests.push({ file: relative, packageRoot: pkg, full });
      } else {
        sources.push({ file: relative, packageRoot: pkg, full });
      }
    }
  };
  visit(root, root);
  return { sources, propertyTests };
}

/**
 * @description Build the report for a project root.
 * @returns {{passed: boolean, summary: object, findings: object[], covered: object[], propertyTests: string[]}}
 */
export function auditFuzzProject(root) {
  const { sources, propertyTests } = collectFuzzTargets(root);
  const testedNames = new Map();
  const propertyTestFiles = [];
  for (const test of propertyTests) {
    const source = readFileSync(test.full, "utf8");
    if (!isPropertyTestSource(source)) {
      continue;
    }
    propertyTestFiles.push(test.file);
    if (!testedNames.has(test.packageRoot)) {
      testedNames.set(test.packageRoot, new Set());
    }
    const names = testedNames.get(test.packageRoot);
    identifiersIn(source).forEach((name) => names.add(name));
  }
  const findings = [];
  const covered = [];
  for (const file of sources) {
    const tested = testedNames.get(file.packageRoot) || new Set();
    const seen = new Set();
    for (const fn of inputHandlingFunctions(readFileSync(file.full, "utf8"))) {
      // an overload or a re-declared helper is one name to test
      if (seen.has(fn.name)) {
        continue;
      }
      seen.add(fn.name);
      const entry = { file: file.file, ...fn };
      if (tested.has(fn.name) || tested.has(fn.name.replace(/^[_#]+/, ""))) {
        covered.push(entry);
      } else {
        findings.push(entry);
      }
    }
  }
  return {
    // report-only: a missing property test is never a failed check
    passed: true,
    summary: {
      candidates: findings.length + covered.length,
      covered: covered.length,
      uncovered: findings.length,
      propertyTestFiles: propertyTestFiles.length,
    },
    findings,
    covered,
    propertyTests: propertyTestFiles,
  };
}

// process.stdout.write can cut a large report short when the process exits
function writeAllSync(text) {
  const buffer = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buffer.length) {
    try {
      offset += writeSync(1, buffer, offset, buffer.length - offset);
    } catch (e) {
      if (e.code !== "EAGAIN") {
        throw e;
      }
    }
  }
}

/**
 * @description `hax audit fuzz`
 * @param commandRun command line flags (--format json, --debug)
 * @param root directory to report on (defaults to cwd)
 */
export function auditFuzzCommand(commandRun, root = null, deps = {}) {
  const options = (commandRun && commandRun.options) || {};
  const projectRoot = root || process.cwd();
  const report = auditFuzzProject(projectRoot);
  if (options.format === "json") {
    (deps.write || writeAllSync)(JSON.stringify(report, null, 2) + "\n");
    return report;
  }
  p.intro(
    `${color.bgBlack(` 🎲 ${t("auditFuzzStart", { path: color.underline(color.bold(color.yellow(projectRoot))) })} `)}`,
  );
  if (report.summary.candidates === 0) {
    p.outro(t("auditFuzzNothing"));
    return report;
  }
  let current = null;
  for (const f of report.findings) {
    if (f.file !== current) {
      current = f.file;
      p.log.info(color.bold(f.file));
    }
    p.log.warn(`${color.dim(`${f.line} `)}${f.name}()`);
  }
  if (options.debug) {
    for (const f of report.covered) {
      p.log.success(`${f.file}:${f.line} ${f.name}()`);
    }
  }
  p.log.info(
    t("auditFuzzTotals", {
      candidates: report.summary.candidates,
      covered: report.summary.covered,
      uncovered: report.summary.uncovered,
      tests: report.summary.propertyTestFiles,
    }),
  );
  p.outro(
    report.summary.uncovered === 0
      ? `🎉 ${t("auditFuzzAllCovered")}`
      : t("auditFuzzOutro", {
          command: color.bold("hax webcomponent wc:fuzz"),
          json: color.bold("--format json"),
        }),
  );
  return report;
}
