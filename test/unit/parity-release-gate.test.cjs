// test/parity release gate (haxtheweb/issues#3334): the OpenAPI comparison
// reads both specs as data, and the gate's own flags never reach parity.cjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  SPEC_PAIRS,
  diffValues,
  compareSpecs,
  formatSpecReport,
} = require("../parity/spec-diff.cjs");
const { parityArgs } = require("../parity/release-gate.cjs");

function checkouts(nodeSpecs, phpSpecs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-"));
  const nodejs = path.join(root, "haxcms-nodejs");
  const php = path.join(root, "haxcms-php");
  SPEC_PAIRS.forEach(([name, nodeRel, phpRel]) => {
    for (const [dir, rel, specs] of [
      [nodejs, nodeRel, nodeSpecs],
      [php, phpRel, phpSpecs],
    ]) {
      if (specs[name] === undefined) continue;
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), specs[name]);
    }
  });
  return { root, nodejs, php };
}

const SPEC = `openapi: 3.0.3
paths:
  /skeletons:
    post:
      summary: Update enabled skeleton configuration using the skeletons collection
      parameters:
        - name: code
          schema:
            pattern: "^[A-Z][A-Z0-9_]*$"
`;

test("specs that differ only in layout are the same contract", (t) => {
  // what Prettier does to the nodejs copy: folds a long line, swaps quotes
  const folded = SPEC.replace(
    "summary: Update",
    "summary:\n        Update",
  ).replace('"^[A-Z][A-Z0-9_]*$"', () => "'^[A-Z][A-Z0-9_]*$'");
  const c = checkouts(
    { "site-spec": SPEC, "system-spec": folded },
    { "site-spec": SPEC, "system-spec": SPEC },
  );
  t.after(() => fs.rmSync(c.root, { recursive: true, force: true }));
  const result = compareSpecs(c.nodejs, c.php);
  assert.equal(result.ok, true, formatSpecReport(result));
});

test("a changed value is reported with its path", (t) => {
  const c = checkouts(
    { "site-spec": SPEC, "system-spec": SPEC },
    {
      "site-spec": SPEC,
      "system-spec": SPEC.replace("/skeletons", "/skeleton"),
    },
  );
  t.after(() => fs.rmSync(c.root, { recursive: true, force: true }));
  const result = compareSpecs(c.nodejs, c.php);
  assert.equal(result.ok, false);
  const system = result.specs.find((s) => s.name === "system-spec");
  assert.deepEqual(system.diffs.map((d) => d.path).sort(), [
    "paths./skeleton",
    "paths./skeletons",
  ]);
  assert.match(formatSpecReport(result), /sync-openapi-specs\.js/);
});

test("a missing or unreadable spec fails the check", (t) => {
  const c = checkouts(
    { "site-spec": SPEC, "system-spec": SPEC },
    { "site-spec": "paths: [unclosed", "system-spec": undefined },
  );
  t.after(() => fs.rmSync(c.root, { recursive: true, force: true }));
  const result = compareSpecs(c.nodejs, c.php);
  assert.equal(result.ok, false);
  const errors = result.specs.map((s) => s.error);
  assert.match(errors[0], /does not parse/);
  assert.match(errors[1], /not found/);
});

test("diffValues walks arrays and objects and stops at its limit", () => {
  assert.deepEqual(diffValues({ a: [1, 2] }, { a: [1, 2] }), []);
  assert.deepEqual(diffValues({ a: [1, 2] }, { a: [1, 3] }), [
    { path: "a[1]", nodejs: 2, php: 3 },
  ]);
  assert.deepEqual(diffValues(1, "1"), [
    { path: "(root)", nodejs: 1, php: "1" },
  ]);
  const many = {};
  for (let i = 0; i < 80; i++) many["k" + i] = i;
  assert.equal(diffValues(many, {}).length, 50);
});

test("the gate's own flags are not passed on to parity.cjs", () => {
  assert.deepEqual(
    parityArgs([
      "--nodejs",
      "../haxcms-nodejs",
      "--build",
      "--link-cli",
      "--specs-only",
      "--old-sites",
      "--php=../haxcms-php",
      "--cases",
      "15-add-top-level-page",
    ]),
    [
      "--nodejs",
      "../haxcms-nodejs",
      "--php=../haxcms-php",
      "--cases",
      "15-add-top-level-page",
    ],
  );
});
