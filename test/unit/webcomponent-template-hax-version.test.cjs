"use strict";

// Scaffolded web components depend on @haxtheweb/* at the version of the CLI
// that made them. The templates must not hardcode a release (they used to say
// "^26.8.0", so create 26.11.0 kept scaffolding the 26.8 line); they write
// "^<%= haxVersion %>" and webcomponentProcess fills it from create's own
// major.minor. Patch releases are not shared between the CLI and the elements
// (create 26.8.1 shipped while the elements stayed at 26.8.0), so the floor
// is always x.y.0 or the scaffold would not install.

// Isolate HOME before requiring the module — webcomponent.js imports HAXCMS.js
// which inits a configDirectory on load.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ISOLATED_HOME = fs.mkdtempSync(
  path.join(os.tmpdir(), "hax-wc-haxversion-test-"),
);
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;

const test = require("node:test");
const assert = require("node:assert/strict");
const ejs = require("ejs");

const { probeModule } = require("../_helpers/module-canary.cjs");
const {
  available,
  skipReason,
  module: wcModule,
} = probeModule("src/lib/programs/webcomponent.js");
const { haxVersion } = available ? wcModule : {};
const opts = { skip: skipReason, timeout: 15000 };

const ROOT = path.join(__dirname, "..", "..");
const TEMPLATES = path.join(ROOT, "src", "templates", "webcomponent");
const CLI_VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
).version;

const PACKAGE_TEMPLATES = fs
  .readdirSync(TEMPLATES, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      fs.existsSync(path.join(TEMPLATES, d.name, "package.json")),
  )
  .map((d) => d.name);

// every @haxtheweb/* dependency, at any depth (dependencies, devDependencies,
// and nested blocks some templates carry)
function haxDependencies(pkg) {
  const found = [];
  const visit = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("@haxtheweb/") && typeof value === "string") {
        found.push([key, value]);
      } else if (typeof value === "object") {
        visit(value);
      }
    }
  };
  visit(pkg);
  return found;
}

const RENDER_DATA = {
  name: "my-element",
  org: "@my-org/",
  author: "someone",
  githubLink: null,
  docsStep: false,
  haxVersion: "27.1.2",
};

test("wc scaffold has package.json templates to check", () => {
  assert.ok(
    PACKAGE_TEMPLATES.length >= 3,
    `expected 3+ package.json templates, found ${PACKAGE_TEMPLATES.join(", ")}`,
  );
});

for (const variant of PACKAGE_TEMPLATES) {
  const file = path.join(TEMPLATES, variant, "package.json");

  test(`wc template "${variant}": no hardcoded @haxtheweb version`, () => {
    const source = fs.readFileSync(file, "utf8");
    const pinned = source
      .split("\n")
      .filter((line) => /"@haxtheweb\/[^"]+":\s*"[~^]?\d/.test(line));
    assert.deepEqual(
      pinned,
      [],
      `${variant}/package.json pins a release; use "^<%= haxVersion %>"`,
    );
  });

  test(`wc template "${variant}": renders @haxtheweb deps at haxVersion`, () => {
    const rendered = ejs.render(fs.readFileSync(file, "utf8"), RENDER_DATA);
    const pkg = JSON.parse(rendered);
    for (const [dep, range] of haxDependencies(pkg)) {
      assert.equal(range, "^27.1.2", `${variant}: ${dep}`);
    }
  });
}

test("haxVersion() is the running CLI's major.minor with patch 0", opts, () => {
  const [major, minor] = CLI_VERSION.split(".");
  assert.equal(haxVersion(), `${major}.${minor}.0`);
});

test("haxVersion() drops the patch and prerelease/build tags", opts, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-haxversion-"));
  const pkgPath = path.join(dir, "package.json");
  for (const [version, expected] of [
    ["26.8.1", "26.8.0"],
    ["26.11.0", "26.11.0"],
    ["26.11.3-beta.0", "26.11.0"],
    ["27.0.2+build.5", "27.0.0"],
  ]) {
    fs.writeFileSync(pkgPath, JSON.stringify({ version }));
    assert.equal(haxVersion(pkgPath), expected, version);
  }
});

test("haxVersion() throws instead of writing a broken range", opts, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-haxversion-"));
  const pkgPath = path.join(dir, "package.json");
  fs.writeFileSync(pkgPath, JSON.stringify({ name: "x" }));
  assert.throws(() => haxVersion(pkgPath), /no usable version/);
});
