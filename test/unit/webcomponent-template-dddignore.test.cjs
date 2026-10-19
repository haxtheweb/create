"use strict";

// `npm test --coverage` writes /coverage (already in .gitignore). hax audit
// must skip it too, or it audits generated reports (prettify.js, lcov.info).

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
      fs.existsSync(path.join(TEMPLATES, d.name, "_dddignore")),
  )
  .map((d) => d.name);

test("wc scaffold has _dddignore variants to check", () => {
  assert.ok(
    VARIANTS.length >= 4,
    `expected 4+ variants, found ${VARIANTS.join(", ")}`,
  );
});

for (const variant of VARIANTS) {
  test(`wc scaffold "${variant}": _dddignore skips /coverage`, () => {
    const lines = fs
      .readFileSync(path.join(TEMPLATES, variant, "_dddignore"), "utf8")
      .split("\n")
      .map((l) => l.replace(/#.*$/, "").trim());
    assert.ok(
      lines.includes("/coverage"),
      "/coverage is listed as an ignored directory",
    );
  });
}
