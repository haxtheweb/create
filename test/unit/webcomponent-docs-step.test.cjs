"use strict";

// Covers the docs data step new monorepo elements get in their build:
// docsStepFor() decides it, and the monorepo template's package.json carries
// it (or not) once rendered.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "hax-wc-docs-"));
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;

const { installClackStub } = require("../_helpers/clack-stub.cjs");
installClackStub();
require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");
const ejs = require("ejs");
const { docsStepFor } = require("../../src/lib/programs/webcomponent.js");

// a fake monorepo: <root>/elements is where new elements go
function monorepo(withScript) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-mono-"));
  fs.mkdirSync(path.join(root, "elements"));
  if (withScript) {
    fs.mkdirSync(path.join(root, "scripts"));
    fs.writeFileSync(
      path.join(root, "scripts", "extract-element-docs.mjs"),
      "",
    );
  }
  return path.join(root, "elements");
}

test("monorepo with the docs script gets the docs step by default", () => {
  const elements = monorepo(true);
  assert.equal(
    docsStepFor({ options: { isMonorepo: true } }, { path: elements }),
    true,
  );
});

test("--no-docs leaves the docs step out", () => {
  const elements = monorepo(true);
  assert.equal(
    docsStepFor(
      { options: { isMonorepo: true, docs: false } },
      { path: elements },
    ),
    false,
  );
});

test("a monorepo without the docs script gets no docs step", () => {
  const elements = monorepo(false);
  assert.equal(
    docsStepFor({ options: { isMonorepo: true } }, { path: elements }),
    false,
  );
});

test("standalone elements get no docs step", () => {
  const elements = monorepo(true);
  assert.equal(docsStepFor({ options: {} }, { path: elements }), false);
});

test("the monorepo template renders valid package.json with and without the step", () => {
  const tpl = fs.readFileSync(
    path.join(
      __dirname,
      "../../src/templates/webcomponent/monorepo/package.json",
    ),
    "utf8",
  );
  const locals = {
    org: "@haxtheweb/",
    name: "my-el",
    author: "tester",
    githubLink: "https://github.com/haxtheweb/webcomponents",
    year: 2026,
    version: "1.0.0",
    className: "MyEl",
  };
  const withStep = JSON.parse(ejs.render(tpl, { ...locals, docsStep: true }));
  assert.match(
    withStep.scripts.build,
    / && node \.\.\/\.\.\/scripts\/extract-element-docs\.mjs --write \.$/,
  );
  const without = JSON.parse(ejs.render(tpl, { ...locals, docsStep: false }));
  assert.doesNotMatch(without.scripts.build, /extract-element-docs/);
});
