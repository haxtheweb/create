"use strict";

// Security guards for the GitHub Actions workflows the CLI scaffolds into
// users' repositories (hax webcomponent / hax site setup:github-actions).
// Every third-party action is pinned to a full commit SHA with the version
// in a trailing comment, checkout never persists credentials, installs use
// the lockfile (npm ci) and `contents: write` is granted only to the job
// that pushes to gh-pages.

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const yaml = require("js-yaml");

const SRC = path.join(__dirname, "..", "..", "src");
const WC_TEMPLATES = path.join(SRC, "templates", "webcomponent");

const WORKFLOWS = [
  path.join(SRC, "templates", "sitedotfiles", "_github_workflows_deploy.yml"),
  ...fs
    .readdirSync(WC_TEMPLATES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) =>
      path.join(WC_TEMPLATES, d.name, "_github", "workflows", "main.yml"),
    )
    .filter((f) => fs.existsSync(f)),
];

test("scaffold workflows exist to check", () => {
  assert.ok(WORKFLOWS.length >= 4, WORKFLOWS.join(", "));
});

const SHA_PIN = /^[^@]+@[0-9a-f]{40}$/;

for (const file of WORKFLOWS) {
  const rel = path.relative(SRC, file);
  const text = fs.readFileSync(file, "utf8");
  const doc = yaml.load(text);

  test(`${rel}: every action is pinned to a commit SHA with a version comment`, () => {
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/);
      if (!m) continue;
      assert.match(m[1], SHA_PIN, `${rel}: "${m[1]}" is not SHA-pinned`);
      assert.match(
        m[2],
        /#\s*v\d+\.\d+\.\d+/,
        `${rel}: "${m[1]}" has no "# vX.Y.Z" comment`,
      );
    }
  });

  test(`${rel}: checkout never persists credentials`, () => {
    for (const job of Object.values(doc.jobs)) {
      for (const step of job.steps) {
        if (step.uses && step.uses.startsWith("actions/checkout@")) {
          assert.equal(
            step.with && step.with["persist-credentials"],
            false,
            `${rel}: checkout step must set persist-credentials: false`,
          );
        }
      }
    }
  });

  test(`${rel}: installs use npm ci, never npm install`, () => {
    assert.ok(!/\bnpm install\b/.test(text), `${rel}: uses npm install`);
  });

  test(`${rel}: no single-quoted echo steps (dead env exports)`, () => {
    assert.ok(!/echo '[A-Z_]+=\$/.test(text), `${rel}: dead echo step`);
  });

  test(`${rel}: contents: write is scoped to the deploy job only`, () => {
    const top = doc.permissions || {};
    assert.notEqual(top.contents, "write", `${rel}: top-level contents: write`);
    for (const [name, job] of Object.entries(doc.jobs)) {
      const perms = job.permissions || {};
      if (perms.contents === "write") {
        assert.equal(
          name,
          "deploy",
          `${rel}: job "${name}" has contents: write`,
        );
        assert.ok(
          job.steps.some(
            (s) => s.uses && s.uses.includes("github-pages-deploy-action"),
          ),
          `${rel}: contents: write granted to a job that does not deploy`,
        );
      }
    }
  });
}
