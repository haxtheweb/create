"use strict";

// Covers `hax audit fuzz` (src/lib/programs/audit-fuzz.js) and
// `hax webcomponent wc:fuzz` (src/lib/programs/webcomponent-fuzz.js),
// haxtheweb/issues#3386: the report lists sanitizer / parser code no
// property test names and never fails; the scaffold writes a starter fuzz
// test that follows the HAX fuzz convention, for a standalone element and
// for an element of the monorepo.
const { installClackStub } = require("../_helpers/clack-stub.cjs");
const stub = installClackStub();

require("@babel/register");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const acorn = require("acorn");
const fc = require("fast-check");
const { fuzzConfig } = require("../_helpers/fuzz-config.cjs");

const logs = [];
stub.intro = (m) => logs.push(["intro", String(m)]);
stub.outro = (m) => logs.push(["outro", String(m)]);
stub.note = (m, title) => logs.push(["note", String(m), String(title)]);
stub.log = {
  success: (m) => logs.push(["success", String(m)]),
  error: (m) => logs.push(["error", String(m)]),
  message: (m) => logs.push(["message", String(m)]),
  warn: (m) => logs.push(["warn", String(m)]),
  info: (m) => logs.push(["info", String(m)]),
};

const {
  auditFuzzProject,
  auditFuzzCommand,
  inputHandlingFunctions,
  isInputHandlingName,
  isPropertyTestSource,
} = require("../../src/lib/programs/audit-fuzz.js");
const { runAuditCommand } = require("../../src/lib/programs/audit-schema.js");
const {
  planFuzzScaffold,
  writeFuzzScaffold,
  webcomponentFuzz,
  isElementName,
  seedForDate,
  FAST_CHECK_VERSION,
} = require("../../src/lib/programs/webcomponent-fuzz.js");

const TEMPLATES = path.join(__dirname, "../../src/templates");
const RUNS = fuzzConfig({ defaultSeed: 20261121 });

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-audit-fuzz-"));
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

test("names that say a function reads or rewrites input", () => {
  for (const name of [
    "sanitizeHtml",
    "parseDuration",
    "escapeAttribute",
    "_decodeEntities",
    "stripTags",
    "normalizeSlug",
    "validateDomain",
    "cleanTitle",
    "slugify",
    "parse",
  ])
    assert.equal(isInputHandlingName(name), true, name);
  for (const name of ["render", "updated", "sparse", "parsed", "", null, 5])
    assert.equal(isInputHandlingName(name), false, String(name));
});

test("finds declarations of every shape, with their line", () => {
  const source = [
    "export function parseThing(v) { return v; }",
    "const sanitizeText = (v) => v;",
    "class A extends B {",
    "  _escapeValue(v) { return v; }",
    "  static decodeToken(v) { return v; }",
    "  get parseGetter() { return 1; }",
    "  stripField = (v) => v;",
    "}",
    "const helpers = { normalizeIt(v) { return v; }, cleanUp: function (v) { return v; } };",
    "exports.validateInput = function (v) { return v; };",
    "function render() { return parseInt('1', 10); }",
  ].join("\n");
  assert.deepEqual(
    inputHandlingFunctions(source)
      .map((f) => `${f.line}:${f.name}:${f.kind}`)
      .sort(),
    [
      "10:validateInput:function",
      "1:parseThing:function",
      "2:sanitizeText:function",
      "4:_escapeValue:method",
      "5:decodeToken:method",
      "7:stripField:method",
      "9:cleanUp:method",
      "9:normalizeIt:method",
    ].sort(),
  );
});

test("a file the parser cannot read is still searched by line", () => {
  const source = [
    "const view = <div>jsx is not javascript</div>;",
    "export function parseBroken(v) { return v; }",
    "  const escapeBroken = (v) => v;",
    "function fine() {}",
  ].join("\n");
  assert.deepEqual(
    inputHandlingFunctions(source).map((f) => `${f.line}:${f.name}`),
    ["2:parseBroken", "3:escapeBroken"],
  );
});

test("inputHandlingFunctions never throws, whatever the source", () => {
  fc.assert(
    fc.property(fc.oneof(fc.string(), fc.string({ unit: "grapheme" })), (s) => {
      const found = inputHandlingFunctions(s);
      assert.ok(Array.isArray(found));
      for (const f of found) assert.equal(isInputHandlingName(f.name), true);
    }),
    RUNS,
  );
});

test("a function is covered only by a fast-check test in its own package", () => {
  const root = project({
    "package.json": "{}",
    "src/text.js":
      "export function sanitizeText(v) { return v; }\nexport function parseList(v) { return v; }\n",
    "src/other.js": "export const escapeHtml = (v) => v;\n",
    // names parseList, but is not a property test
    "test/plain.test.js":
      'import { parseList } from "../src/text.js";\nit("x", () => parseList("a"));\n',
    "test/text-fuzz.test.js":
      'import fc from "fast-check";\nimport { sanitizeText } from "../src/text.js";\n',
    // another package's property test does not count for this one
    "elements/other/package.json": "{}",
    "elements/other/other.js": "export function parseList(v) { return v; }\n",
    "elements/other/test/other-fuzz.test.js":
      'const fc = require("fast-check");\nescapeHtml; parseList;\n',
    "node_modules/dep/index.js": "export function parseDep(v) { return v; }\n",
    "dist/bundle.js": "export function parseBundled(v) { return v; }\n",
  });
  const report = auditFuzzProject(root);
  assert.equal(report.passed, true);
  assert.deepEqual(
    report.findings.map((f) => `${f.file}:${f.line}:${f.name}`),
    ["src/other.js:1:escapeHtml", "src/text.js:2:parseList"],
  );
  assert.deepEqual(
    report.covered.map((f) => `${f.file}:${f.name}`),
    ["elements/other/other.js:parseList", "src/text.js:sanitizeText"],
  );
  assert.deepEqual(report.summary, {
    candidates: 4,
    covered: 2,
    uncovered: 2,
    propertyTestFiles: 2,
  });
  assert.equal(isPropertyTestSource("import fc from 'fast-check'"), true);
  assert.equal(isPropertyTestSource("fast check"), false);
});

test("the report is text or JSON and never fails the command", () => {
  const root = project({
    "package.json": "{}",
    "lib/a.js": "export function parseA(v) { return v; }\n",
  });
  logs.length = 0;
  const text = auditFuzzCommand({ options: {} }, root);
  assert.equal(text.passed, true);
  assert.ok(
    logs.some(([kind, m]) => kind === "warn" && m.includes("parseA()")),
  );
  assert.ok(logs.some(([kind]) => kind === "outro"));

  let written = "";
  const json = auditFuzzCommand({ options: { format: "json" } }, root, {
    write: (s) => (written += s),
  });
  assert.deepEqual(JSON.parse(written), json);
  assert.equal(JSON.parse(written).findings[0].name, "parseA");

  // uncovered code still exits 0 through the audit router
  const codes = [];
  runAuditCommand({ arguments: { type: "fuzz" }, options: {} }, root, root, {
    exit: (code) => codes.push(code),
  });
  assert.deepEqual(codes, [0]);

  logs.length = 0;
  auditFuzzCommand(
    { options: {} },
    project({ "a.js": "export const x = 1;\n" }),
  );
  assert.ok(logs.some(([kind]) => kind === "outro"));
  assert.ok(!logs.some(([kind]) => kind === "warn"));
});

test("this repo's own helpers: the fuzzed ones are reported as covered", () => {
  const report = auditFuzzProject(path.join(__dirname, "../.."));
  const covered = report.covered.map((f) => f.name);
  // test/unit/security-helpers-fuzz.test.js names these
  assert.ok(covered.includes("validateDomain"));
  assert.ok(covered.includes("validateNpmClient"));
  assert.ok(report.propertyTests.length >= 1);
});

// ---------------------------------------------------------------------------

function element(name, extra = {}) {
  return project(
    Object.assign(
      {
        "package.json": JSON.stringify(
          {
            name: "@scope/" + name,
            scripts: { test: "web-test-runner" },
            devDependencies: { "@open-wc/testing": "4.0.0" },
          },
          null,
          4,
        ),
        [name + ".js"]: "export class X extends HTMLElement {}\n",
      },
      extra,
    ),
  );
}
const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
const parses = (source) =>
  acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });

test("element names are the only thing that reaches a file name", () => {
  assert.equal(isElementName("my-element"), true);
  assert.equal(isElementName("a1-b2-c3"), true);
  for (const bad of [
    "",
    "element",
    "My-Element",
    "../x-y",
    "x-y/z",
    "x-y.js",
    "-x-y",
    "x--y",
    null,
  ])
    assert.equal(isElementName(bad), false, String(bad));
  fc.assert(
    fc.property(fc.string(), (name) => {
      if (isElementName(name)) assert.match(name, /^[a-z0-9-]+$/);
    }),
    RUNS,
  );
  assert.equal(seedForDate(new Date(Date.UTC(2026, 10, 21))), 20261121);
});

test("standalone element: test, helper, runner config, dependency and script", () => {
  const dir = element("my-parser");
  const pkg = JSON.parse(read(dir, "package.json"));
  const plan = planFuzzScaffold(dir, pkg, {
    date: new Date(Date.UTC(2026, 10, 21)),
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.monorepo, false);
  assert.deepEqual(writeFuzzScaffold(plan, TEMPLATES).sort(), [
    "package.json",
    "test/fuzz-config.js",
    "test/my-parser-fuzz.test.js",
    "web-test-runner.config.mjs",
  ]);
  const testSource = read(dir, "test/my-parser-fuzz.test.js");
  parses(testSource);
  assert.ok(!testSource.includes("<%"), "every placeholder was filled in");
  assert.ok(testSource.includes('import "../my-parser.js";'));
  assert.ok(testSource.includes('from "./fuzz-config.js"'));
  assert.ok(testSource.includes('from "fast-check"'));
  assert.ok(testSource.includes("defaultSeed: 20261121"));
  assert.ok(testSource.includes('describe("MyParser fuzz"'));
  for (const name of ["HAX_FUZZ_SEED", "HAX_FUZZ_PATH"])
    assert.ok(testSource.includes(name), name + " is explained");
  parses(read(dir, "test/fuzz-config.js"));
  parses(read(dir, "web-test-runner.config.mjs"));
  const after = JSON.parse(read(dir, "package.json"));
  assert.equal(after.devDependencies["fast-check"], FAST_CHECK_VERSION);
  assert.equal(after.devDependencies["@open-wc/testing"], "4.0.0");
  assert.match(
    after.scripts["test:fuzz"],
    /HAX_FUZZ_SEED=\$\{HAX_FUZZ_SEED:-random\}/,
  );
  assert.equal(after.scripts.test, "web-test-runner");
  assert.ok(
    read(dir, "package.json").includes('\n    "name"'),
    "indentation kept",
  );
  // the scaffolded test is itself a property test, so the audit sees it
  assert.equal(auditFuzzProject(dir).propertyTests.length, 1);
});

test("the scaffolded helper follows the HAX fuzz convention", async () => {
  const dir = element("my-parser");
  writeFuzzScaffold(
    planFuzzScaffold(dir, JSON.parse(read(dir, "package.json"))),
    TEMPLATES,
  );
  const mjs = path.join(dir, "test", "fuzz-config.mjs");
  fs.copyFileSync(path.join(dir, "test", "fuzz-config.js"), mjs);
  const scaffolded = (await import(mjs)).fuzzConfig;
  const { fuzzConfig: reference } = require("../_helpers/fuzz-config.cjs");
  const keep = {};
  const names = ["HAX_FUZZ_SEED", "HAX_FUZZ_RUNS", "HAX_FUZZ_PATH"];
  for (const k of names) keep[k] = process.env[k];
  try {
    const cases = [
      {},
      { HAX_FUZZ_SEED: "random" },
      { HAX_FUZZ_SEED: "42", HAX_FUZZ_RUNS: "7" },
      { HAX_FUZZ_SEED: "-5", HAX_FUZZ_PATH: "12:0:3" },
    ];
    for (const env of cases) {
      for (const k of names) delete process.env[k];
      Object.assign(process.env, env);
      // same answer as the helper this repo's own fuzz tests use
      assert.deepEqual(
        scaffolded({ defaultSeed: 9, defaultRuns: 300, env }),
        reference({ defaultSeed: 9, defaultRuns: 300 }),
        JSON.stringify(env),
      );
    }
    for (const env of [
      { HAX_FUZZ_SEED: "abc" },
      { HAX_FUZZ_RUNS: "0" },
      { HAX_FUZZ_PATH: "1;rm" },
    ])
      assert.throws(() => scaffolded({ defaultSeed: 9, env }), RangeError);
    assert.throws(() => scaffolded({ env: {} }), TypeError);
  } finally {
    for (const k of names)
      if (keep[k] === undefined) delete process.env[k];
      else process.env[k] = keep[k];
  }
});

test("the runner config only passes HAX_FUZZ_* on, and safely", async () => {
  const dir = element("my-parser");
  writeFuzzScaffold(
    planFuzzScaffold(dir, JSON.parse(read(dir, "package.json"))),
    TEMPLATES,
  );
  const keep = Object.assign({}, process.env);
  process.env.HAX_FUZZ_SEED = "</script><script>alert(1)</script>";
  process.env.HAX_FUZZ_lower = "no";
  process.env.SECRET_TOKEN = "do-not-leak";
  try {
    const config = (await import(path.join(dir, "web-test-runner.config.mjs")))
      .default;
    const page = config.testRunnerHtml("/framework.js");
    assert.equal(
      page.match(/<\/script>/g).length,
      2,
      "the value closed no script",
    );
    assert.ok(page.includes("\\u003c/script>"));
    assert.ok(!page.includes("do-not-leak"));
    assert.ok(!page.includes("HAX_FUZZ_lower"));
    assert.ok(page.includes('src="/framework.js"'));
  } finally {
    for (const k of Object.keys(process.env))
      if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
});

test("monorepo element: only the test, using the shared helper", () => {
  const root = project({
    "scripts/test-setup/fuzz-config.mjs": "export function fuzzConfig() {}\n",
    "elements/my-parser/package.json": JSON.stringify({
      name: "@haxtheweb/my-parser",
    }),
    "elements/my-parser/my-parser.js":
      "export class X extends HTMLElement {}\n",
  });
  const dir = path.join(root, "elements", "my-parser");
  const plan = planFuzzScaffold(dir, { name: "@haxtheweb/my-parser" });
  assert.equal(plan.monorepo, true);
  assert.deepEqual(writeFuzzScaffold(plan, TEMPLATES), [
    "test/my-parser-fuzz.test.js",
  ]);
  assert.ok(
    read(dir, "test/my-parser-fuzz.test.js").includes(
      'from "../../../scripts/test-setup/fuzz-config.mjs"',
    ),
  );
  assert.deepEqual(JSON.parse(read(dir, "package.json")), {
    name: "@haxtheweb/my-parser",
  });
});

test("nothing that exists is replaced without --force", () => {
  const dir = element("my-parser", {
    "test/my-parser-fuzz.test.js": "// mine\n",
    "web-test-runner.config.js": "export default {};\n",
    "package.json": JSON.stringify({
      name: "my-parser",
      scripts: { "test:fuzz": "mine" },
      dependencies: { "fast-check": "^3.0.0" },
    }),
  });
  const pkg = JSON.parse(read(dir, "package.json"));
  logs.length = 0;
  assert.equal(
    webcomponentFuzz({ options: {} }, pkg, { dir, templatesRoot: TEMPLATES }),
    true,
  );
  assert.equal(read(dir, "test/my-parser-fuzz.test.js"), "// mine\n");
  assert.equal(read(dir, "web-test-runner.config.js"), "export default {};\n");
  assert.ok(!fs.existsSync(path.join(dir, "web-test-runner.config.mjs")));
  assert.deepEqual(JSON.parse(read(dir, "package.json")), pkg);
  assert.ok(fs.existsSync(path.join(dir, "test/fuzz-config.js")));
  assert.ok(logs.some(([kind, m]) => kind === "warn" && m.includes("--force")));
  assert.ok(
    logs.some(
      ([kind, m]) => kind === "info" && m.includes("web-test-runner.config.js"),
    ),
  );

  assert.equal(
    webcomponentFuzz({ options: { force: true } }, pkg, {
      dir,
      templatesRoot: TEMPLATES,
    }),
    true,
  );
  assert.ok(read(dir, "test/my-parser-fuzz.test.js").includes("fast-check"));
});

test("--dry-run writes nothing; a folder without the element is refused", () => {
  const dir = element("my-parser");
  const pkg = JSON.parse(read(dir, "package.json"));
  logs.length = 0;
  assert.equal(
    webcomponentFuzz({ options: { dryRun: true } }, pkg, {
      dir,
      templatesRoot: TEMPLATES,
    }),
    true,
  );
  assert.ok(!fs.existsSync(path.join(dir, "test")));
  assert.deepEqual(JSON.parse(read(dir, "package.json")), pkg);
  assert.ok(
    logs.some(
      ([kind, m]) => kind === "note" && m.includes("my-parser-fuzz.test.js"),
    ),
  );

  logs.length = 0;
  for (const options of [{ name: "other-thing" }, { name: "../../etc" }])
    assert.equal(
      webcomponentFuzz({ options }, pkg, { dir, templatesRoot: TEMPLATES }),
      false,
    );
  assert.equal(logs.filter(([kind]) => kind === "error").length, 2);
  assert.deepEqual(fs.readdirSync(dir).sort(), [
    "my-parser.js",
    "package.json",
  ]);
  // --name picks another element of the same project
  fs.writeFileSync(path.join(dir, "other-thing.js"), "export class Y {}\n");
  assert.equal(
    webcomponentFuzz({ options: { name: "other-thing", quiet: true } }, pkg, {
      dir,
      templatesRoot: TEMPLATES,
    }),
    true,
  );
  assert.ok(fs.existsSync(path.join(dir, "test/other-thing-fuzz.test.js")));
});
