"use strict";

// Covers src/lib/programs/audit-ssr-worker.mjs end to end. The worker is a
// standalone child process (no exports, it exits itself), so it is spawned
// with a fixture "monorepo" of elements and its JSON-lines protocol is
// asserted. @lit-labs/ssr resolves next to the CLI, so real renders happen;
// the fixture elements are dependency-free on purpose (plain HTMLElement,
// no bare imports) except one extensionless relative import that exercises
// the worker's resolver fallback.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const WORKER = path.join(
  __dirname,
  "..",
  "..",
  "src",
  "lib",
  "programs",
  "audit-ssr-worker.mjs",
);

// The worker renders through the SSR render kit, one copy kept in
// @haxtheweb/haxcms-nodejs (lib/ssr). It is found next to the CLI, or through
// HAX_SSR_KIT. The protocol tests below run against a stand-in kit so they do
// not depend on which haxcms-nodejs is installed; the same end-to-end test
// also runs against the real kit whenever one is there.
const REAL_KIT = [
  process.env.HAX_SSR_KIT,
  path.join(
    __dirname,
    "..",
    "..",
    "node_modules",
    "@haxtheweb",
    "haxcms-nodejs",
  ),
]
  .filter(Boolean)
  .find((dir) =>
    ["index.mjs", "dist/lib/ssr/index.mjs", "src/lib/ssr/index.mjs"].some(
      (file) => fs.existsSync(path.join(dir, file)),
    ),
  );
const kitSkip = REAL_KIT
  ? false
  : "needs a @haxtheweb/haxcms-nodejs with the SSR render kit (or HAX_SSR_KIT)";

// the exports the worker uses, as small as they can be
const STAND_IN_KIT = `
export const installInertDom = () => {};
export const SSR_PRIMITIVE_CSS = "p{margin:0}";
export const ssrSkipReason = (tag, ctor) =>
  tag === "skip-el" ? "stand-in skip" : ctor && ctor.ssr === false ? "opted out" : null;
export function buildTemplate(html, tag, demo) {
  const strings = ["<" + tag + ">" + ((demo && demo.content) || "") + "</" + tag + ">"];
  strings.raw = strings;
  return html(strings);
}
export async function collectCapped(result) {
  let html = "";
  for await (const chunk of result) html += chunk;
  return { html, truncated: false };
}
export async function progressiveFallback(tag) {
  const El = globalThis.customElements.get(tag);
  const el = El && new El();
  return el && el.renderRss ? el.renderRss() : null;
}
export const globalCss = (styles, options = {}) =>
  (options.primitives === false ? "" : SSR_PRIMITIVE_CSS) +
  [styles].flat(9).map((s) => s.cssText || s).join("") +
  (options.compact === false ? "/* source */" : "");
`;

function standInKit() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-ssr-kit-"));
  fs.writeFileSync(path.join(dir, "index.mjs"), STAND_IN_KIT);
  return dir;
}

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-ssr-worker-"));
  const el = (name, code) => {
    const dir = path.join(root, "elements", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: `@haxtheweb/${name}`, type: "module" }),
    );
    fs.writeFileSync(path.join(dir, `${name}.js`), code);
  };
  // renders and supplies a progressive-enhancement fallback
  el(
    "fake-el",
    `const tag = "fake-el";
class FakeEl extends HTMLElement {
  haxHooks() {
    return { progressiveEnhancement: "renderRss" };
  }
  renderRss() {
    return "<p>fake rss fallback</p>";
  }
}
if (!customElements.get(tag)) {
  customElements.define(tag, FakeEl);
}
`,
  );
  // fails at import time
  el("broken-el", `throw new Error("boom on import");\n`);
  // imports a helper without an extension: resolved by the fallback hooks
  el(
    "fallback-el",
    `import "./helper";
const tag = "fallback-el";
class FallbackEl extends HTMLElement {}
if (!customElements.get(tag)) {
  customElements.define(tag, FallbackEl);
}
`,
  );
  fs.writeFileSync(
    path.join(root, "elements", "fallback-el", "helper.js"),
    "export const helper = 1;\n",
  );
  return root;
}

function runWorker(payload, kitDir) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (kitDir) {
      env.HAX_SSR_KIT = kitDir;
    }
    const child = spawn(process.execPath, [WORKER], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", () => {
      const lines = [];
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        try {
          lines.push(JSON.parse(line));
        } catch {
          lines.push({ unparsed: line });
        }
      }
      resolve(lines);
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

const endToEnd = (kitDir) => async () => {
  const root = fixtureRoot();
  try {
    const lines = await runWorker(
      {
        root,
        timeout: 20000,
        shim: true,
        items: [
          {
            tag: "fake-el",
            specifier: "@haxtheweb/fake-el/fake-el.js",
            demo: { content: "hello slot" },
          },
          {
            tag: "nope-el",
            specifier: "@haxtheweb/does-not-exist/nope-el.js",
            demo: null,
          },
          {
            tag: "broken-el",
            specifier: "@haxtheweb/broken-el/broken-el.js",
            demo: null,
          },
          {
            tag: "fallback-el",
            specifier: "@haxtheweb/fallback-el/fallback-el.js",
            demo: null,
          },
        ],
      },
      kitDir,
    );
    assert.deepEqual(lines[lines.length - 1], { done: true });
    const ok = lines.find((l) => l.tag === "fake-el" && l.ok);
    assert.ok(ok, "fake-el rendered");
    assert.ok(ok.html.includes("hello slot"), ok.html);
    assert.equal(ok.truncated, false);
    assert.equal(ok.progressive, "<p>fake rss fallback</p>");
    const missing = lines.find((l) => l.tag === "nope-el");
    assert.equal(missing.ok, false);
    assert.equal(missing.phase, "import");
    assert.ok(missing.error.includes("Cannot find"));
    const broken = lines.find((l) => l.tag === "broken-el");
    assert.equal(broken.ok, false);
    assert.equal(broken.phase, "import");
    assert.ok(broken.error.includes("boom on import"));
    assert.ok(String(broken.origin).includes("broken-el.js"));
    assert.ok(
      lines.some((l) => l.fallback && l.fallback.specifier === "./helper"),
      "resolver fallback reported",
    );
    assert.ok(
      lines.some((l) => l.tag === "fallback-el" && l.ok),
      "fallback-el rendered after its extensionless import",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test(
  "audit-ssr-worker renders a plain element, reports failures and fallbacks",
  { timeout: 60000 },
  async () => {
    const kitDir = standInKit();
    try {
      await endToEnd(kitDir)();
    } finally {
      fs.rmSync(kitDir, { recursive: true, force: true });
    }
  },
);

test(
  "audit-ssr-worker does the same through the real SSR render kit",
  { timeout: 60000, skip: kitSkip },
  endToEnd(REAL_KIT),
);

test(
  "audit-ssr-worker stops with missing-ssr-kit when there is no kit where HAX_SSR_KIT points",
  { timeout: 60000 },
  async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "hax-ssr-nokit-"));
    try {
      const lines = await runWorker(
        { root: empty, timeout: 5000, shim: true, items: [] },
        empty,
      );
      assert.equal(lines.length, 1);
      assert.equal(lines[0].fatal, "missing-ssr-kit");
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  },
);

test(
  "audit-ssr-worker finds the kit in an unbuilt haxcms-nodejs checkout, skips what the kit skips and sizes the page stylesheet",
  { timeout: 60000 },
  async () => {
    const root = fixtureRoot();
    // HAX_SSR_KIT as a checkout: the kit is under src/lib/ssr
    const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "hax-ssr-co-"));
    const kitDir = path.join(checkout, "src", "lib", "ssr");
    fs.mkdirSync(kitDir, { recursive: true });
    fs.writeFileSync(path.join(kitDir, "index.mjs"), STAND_IN_KIT);
    // the project's design system, as the worker looks it up
    const ddd = path.join(root, "elements", "d-d-d");
    fs.mkdirSync(path.join(ddd, "lib"), { recursive: true });
    fs.writeFileSync(
      path.join(ddd, "package.json"),
      JSON.stringify({ name: "@haxtheweb/d-d-d", type: "module" }),
    );
    fs.writeFileSync(
      path.join(ddd, "lib", "DDDStyles.js"),
      `export const DDDVariables = { cssText: ":root{--ddd-a:1px}" };
export const DDDAllStyles = [DDDVariables, { cssText: "a{color:red}" }];
`,
    );
    // an element of our own that opts out with static ssr = false
    const optOut = path.join(root, "elements", "opt-out-el");
    fs.mkdirSync(optOut, { recursive: true });
    fs.writeFileSync(
      path.join(optOut, "package.json"),
      JSON.stringify({ name: "@haxtheweb/opt-out-el", type: "module" }),
    );
    fs.writeFileSync(
      path.join(optOut, "opt-out-el.js"),
      `class OptOut extends HTMLElement { static ssr = false; }
customElements.define("opt-out-el", OptOut);
`,
    );
    try {
      const lines = await runWorker(
        {
          root,
          timeout: 20000,
          shim: true,
          items: [
            // never imported: its file would throw
            {
              tag: "skip-el",
              specifier: "@haxtheweb/broken-el/broken-el.js",
              demo: null,
            },
            {
              tag: "opt-out-el",
              specifier: "@haxtheweb/opt-out-el/opt-out-el.js",
              demo: null,
            },
          ],
        },
        checkout,
      );
      assert.deepEqual(lines[lines.length - 1], { done: true });
      const start = lines.find((l) => typeof l.primitives === "string");
      assert.equal(start.primitives, "p{margin:0}");
      assert.deepEqual(start.global, {
        css: "p{margin:0}:root{--ddd-a:1px}a{color:red}",
        bytes: 41,
        sourceBytes: 53,
        variableBytes: 18,
      });
      const skipped = lines.find((l) => l.tag === "skip-el");
      assert.equal(skipped.ok, true);
      assert.equal(skipped.skipped, "stand-in skip");
      assert.equal(
        lines.find((l) => l.tag === "opt-out-el").skipped,
        "opted out",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(checkout, { recursive: true, force: true });
    }
  },
);
