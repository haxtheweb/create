"use strict";

// #3130: every `hax wc` scaffold variant must run its a11y audit in dark mode
// as well as light mode, so dark-mode contrast failures fail the test.

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const TEMPLATES = path.join(
  __dirname,
  "..",
  "..",
  "src",
  "templates",
  "webcomponent",
);
const VARIANTS = fs
  .readdirSync(TEMPLATES, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      fs.existsSync(
        path.join(TEMPLATES, d.name, "test", "webcomponent.test.js"),
      ),
  )
  .map((d) => d.name);

test("wc scaffold has test variants to check", () => {
  assert.ok(
    VARIANTS.length >= 4,
    `expected 4+ variants, found ${VARIANTS.join(", ")}`,
  );
});

for (const variant of VARIANTS) {
  test(`wc scaffold "${variant}": a11y test also runs under color-scheme dark`, () => {
    const src = fs.readFileSync(
      path.join(TEMPLATES, variant, "test", "webcomponent.test.js"),
      "utf8",
    );
    assert.match(src, /passes the a11y audit"/, "light-mode audit is kept");
    assert.match(
      src,
      /colorScheme\s*=\s*["']dark["']/,
      "sets color-scheme: dark",
    );
    assert.match(
      src,
      /passes the a11y audit in dark mode/,
      "has a dark-mode audit",
    );
    assert.equal(
      (src.match(/to\.be\.accessible\(\)/g) || []).length,
      2,
      "audits light and dark",
    );
    assert.match(
      src,
      /backgroundColor\s*=\s*["']Canvas["']/,
      "sets an explicit dark background so axe does not assume white",
    );
    assert.match(
      src,
      /afterEach\([\s\S]*colorScheme\s*=\s*previous\.scheme/,
      "restores color-scheme afterwards",
    );
  });
}
