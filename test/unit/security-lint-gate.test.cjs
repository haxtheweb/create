"use strict";

// The blocking CI step `npm run lint:security` must keep flagging the two
// security selectors (shell-string exec() interpolation, optional chaining)
// and must pass on the current tree. Runs ESLint in-process against a temp
// file so the gate itself is covered, not just its configuration.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..", "..");

test("package.json wires lint:security and build.yml runs it without continue-on-error", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json")));
  assert.match(pkg.scripts["lint:security"], /eslint.security.config.mjs/);
  const workflow = fs.readFileSync(
    path.join(ROOT, ".github", "workflows", "build.yml"),
    "utf8",
  );
  const steps = workflow.split(/\n\s+- name: /).slice(1);
  const gates = steps.filter((s) => s.includes("npm run lint:security"));
  assert.ok(gates.length >= 1, "security lint step present");
  for (const step of gates) {
    assert.ok(
      !step.includes("continue-on-error"),
      "security lint must be blocking",
    );
  }
});

test("lint:security flags exec() interpolation and optional chaining, nothing else", async () => {
  const { ESLint } = require("eslint");
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: path.join(ROOT, "eslint.security.config.mjs"),
  });
  const dir = fs.mkdtempSync(path.join(ROOT, "src", "lib", ".lint-gate-"));
  const file = path.join(dir, "probe.js");
  try {
    fs.writeFileSync(
      file,
      [
        'import { exec } from "node:child_process";',
        "export function probe(a) {",
        "  const unusedVariableThatTheFullLintWouldWarnOn = 1;",
        "  exec(`ls ${a}`);",
        "  return a?.b;",
        "}",
        "",
      ].join("\n"),
    );
    const [result] = await eslint.lintFiles([file]);
    const messages = result.messages.map((m) => m.message);
    assert.equal(result.errorCount, 2, JSON.stringify(messages));
    assert.ok(messages.some((m) => /interpolate values into exec/.test(m)));
    assert.ok(messages.some((m) => /Optional chaining/.test(m)));
    // the gate is security-only: style/unused-var findings do not block
    assert.equal(result.warningCount, 0, JSON.stringify(messages));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
