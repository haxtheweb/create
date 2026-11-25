"use strict";

// docs/security-invariants.md is the list of rules; every inline
// `Security (<name>)` comment in src/ has to name a row in it. This is the
// check the doc describes, run as a test so a new comment can't point at a
// rule that was never written down.

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");

function sourceFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.(m?js|ya?ml)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

test("every Security (<name>) comment in src names a documented invariant", () => {
  const doc = fs.readFileSync(
    path.join(ROOT, "docs", "security-invariants.md"),
    "utf8",
  );
  const documented = new Set(
    Array.from(doc.matchAll(/^\| `([a-z-]+)`/gm), (m) => m[1]),
  );
  assert.ok(documented.size >= 15, "the invariants table was not parsed");
  const undocumented = new Set();
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/Security \(([^)]+)\)/g)) {
      for (const name of m[1].split(",").map((n) => n.trim())) {
        if (!documented.has(name)) {
          undocumented.add(`${name} (${path.relative(ROOT, file)})`);
        }
      }
    }
  }
  assert.deepEqual(Array.from(undocumented), []);
});
