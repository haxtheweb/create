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

function runWorker(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER], {
      stdio: ["pipe", "pipe", "pipe"],
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

test(
  "audit-ssr-worker renders a plain element, reports failures and fallbacks",
  { timeout: 60000 },
  async () => {
    const root = fixtureRoot();
    try {
      const lines = await runWorker({
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
      });
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
  },
);
