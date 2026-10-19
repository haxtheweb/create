"use strict";

// Covers src/lib/programs/audit-ssr.js: registry/demo discovery, SSR output
// analysis and bucketing, error grouping, and the command with an injected
// worker. No @lit-labs/ssr is needed: runWorker is injected.
const { installClackStub } = require("../_helpers/clack-stub.cjs");
const stub = installClackStub();

require("@babel/register");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

stub.intro = () => {};
stub.outro = () => {};
stub.note = () => {};
stub.log = {
  success: () => {},
  error: () => {},
  message: () => {},
  warn: () => {},
  info: () => {},
};

const {
  loadSsrRegistry,
  discoverSsrDemos,
  splitCssRules,
  analyzeSsrOutput,
  errorHints,
  errorSignature,
  summarizeSsr,
  auditSsrCommand,
  SSR_STATUSES,
} = require("../../src/lib/programs/audit-ssr.js");

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-audit-ssr-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(
      full,
      typeof content === "string" ? content : JSON.stringify(content),
    );
  }
  return root;
}

const shadow = (inner, tag = "x-a") =>
  `<${tag}><template shadowroot="open" shadowrootmode="open">${inner}</template></${tag}>`;

test("loadSsrRegistry reads the registry and tolerates a missing or bad one", () => {
  const root = project({ "wc-registry.json": { "x-a": "@pkg/x-a/x-a.js" } });
  assert.deepEqual(loadSsrRegistry(root), { "x-a": "@pkg/x-a/x-a.js" });
  assert.equal(loadSsrRegistry(project({})), null);
  assert.equal(loadSsrRegistry(project({ "wc-registry.json": "{nope" })), null);
});

test("discoverSsrDemos finds the first demoSchema per tag and skips node_modules", () => {
  const root = project({
    "a/x-a.haxProperties.json": {
      demoSchema: [{ tag: "x-a", properties: { n: 1 }, content: "hi" }],
    },
    "b/x-a.haxProperties.json": { demoSchema: [{ tag: "x-a" }] },
    "node_modules/z/x-z.haxProperties.json": { demoSchema: [{ tag: "x-z" }] },
    "c/broken.haxProperties.json": "{nope",
  });
  const demos = discoverSsrDemos(root);
  assert.deepEqual(Object.keys(demos), ["x-a"]);
  assert.equal(demos["x-a"].content, "hi");
});

test("splitCssRules keeps at-rules whole", () => {
  assert.deepEqual(
    splitCssRules("a{color:red}@media (x){b{c:d}e{f:g}}h{i:j}").length,
    3,
  );
});

test("analyzeSsrOutput buckets output", () => {
  assert.equal(analyzeSsrOutput("<x-a></x-a>", "x-a").status, "no-shadow-root");
  assert.equal(analyzeSsrOutput(shadow("<!---->"), "x-a").status, "empty");
  assert.equal(
    analyzeSsrOutput(shadow("<style>a{b:c}</style><div></div>"), "x-a").status,
    "shell",
  );
  assert.equal(analyzeSsrOutput(shadow("<slot></slot>"), "x-a").status, "shell");
  assert.equal(
    analyzeSsrOutput(shadow("<div>Hello</div>"), "x-a").status,
    "rendered",
  );
  assert.equal(
    analyzeSsrOutput(shadow('<svg><circle r="1"></circle></svg>'), "x-a").status,
    "rendered",
  );
});

test("analyzeSsrOutput measures styles apart from content", () => {
  const css = "a{b:c}d{e:f}";
  const a = analyzeSsrOutput(shadow(`<style>${css}</style><p>Hi</p>`), "x-a");
  assert.equal(a.styleBytes, css.length);
  assert.equal(Object.keys(a.styleRules).length, 2);
  assert.equal(a.textChars, 2);
});

test("errorHints and errorSignature group the usual causes", () => {
  assert.ok(
    errorHints("TypeError: Cannot read properties of undefined (reading 'x')").includes(
      "undefined-dependency",
    ),
  );
  assert.ok(errorHints("render did not finish within 1000ms").includes("timeout"));
  assert.equal(
    errorSignature("TypeError: Cannot read properties of undefined (reading 'x')"),
    errorSignature("TypeError: Cannot read properties of undefined (reading 'x')"),
  );
});

test("summarizeSsr counts every status and groups failures by cause", () => {
  const summary = summarizeSsr([
    { tag: "a", status: "rendered", demo: "bare", bytes: 10, styleBytes: 2, uniqueStyleBytes: 2, styleRules: {} },
    { tag: "b", status: "threw", demo: "bare", phase: "render", error: "TypeError: boom", origin: "x.js:1", hints: [] },
    { tag: "c", status: "threw", demo: "demoSchema", phase: "render", error: "TypeError: boom", origin: "x.js:1", hints: [] },
  ]);
  for (const status of SSR_STATUSES) {
    assert.ok(status in summary.counts);
  }
  assert.equal(summary.counts.threw, 2);
  assert.equal(summary.causes[0].count, 2);
});

test("auditSsrCommand reports and never fails on render failures", async () => {
  const root = project({ "wc-registry.json": { "x-a": "pkg/a.js", "x-b": "pkg/b.js" } });
  let out = "";
  const result = await auditSsrCommand(
    { options: { format: "json" } },
    root,
    {
      write: (s) => (out += s),
      runWorker: async () => ({
        results: [
          { tag: "x-a", ok: true, file: path.join(root, "a.js"), html: shadow("<p>Hi</p>") },
          { tag: "x-b", ok: false, phase: "render", error: "TypeError: boom" },
        ],
        fallbacks: [],
      }),
    },
  );
  assert.equal(result.passed, true);
  const doc = JSON.parse(out);
  assert.equal(doc.summary.counts.rendered, 1);
  assert.equal(doc.summary.counts.threw, 1);
});

test("auditSsrCommand fails only when the audit cannot run", async () => {
  const none = await auditSsrCommand({ options: { format: "json" } }, project({}), {
    write: () => {},
  });
  assert.equal(none.passed, false);
  assert.equal(none.fatal.code, "no-registry");
  const root = project({ "wc-registry.json": { "x-a": "pkg/a.js" } });
  const missing = await auditSsrCommand({ options: { format: "json" } }, root, {
    write: () => {},
    runWorker: async () => ({ fatal: { code: "missing-ssr", message: "no" } }),
  });
  assert.equal(missing.passed, false);
});

test("--only limits the audited tags", async () => {
  const root = project({ "wc-registry.json": { "x-a": "pkg/a.js", "x-b": "pkg/b.js" } });
  let seen;
  await auditSsrCommand({ options: { format: "json", only: "x-b" } }, root, {
    write: () => {},
    runWorker: async (payload) => {
      seen = payload.items.map((i) => i.tag);
      return { results: [], fallbacks: [] };
    },
  });
  assert.deepEqual(seen, ["x-b"]);
});
