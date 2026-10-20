/**
 * Pre-submission quality gate: runs the same Prettier and ESLint checks CI
 * runs, so problems are caught and fixed before code is pushed or a PR is
 * opened, by humans and AI agents alike.
 *
 * By default only files you changed are checked: everything committed on this
 * branch since it left the base branch, plus staged, unstaged and untracked
 * files. That keeps the check fast and means pre-existing problems in files
 * you never touched do not block you.
 *
 *   npm run precheck          check changed files (what CI will check)
 *   npm run precheck:fix      auto-fix formatting and fixable lint, then check
 *   node scripts/precheck.mjs --all   check the whole repo exactly as CI does
 *
 * Exit code is 0 when every blocking check passes, 1 otherwise.
 */

import { spawnSync } from "node:child_process";
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Per-repo settings. Keep in step with .github/workflows/build.yml.
const CONFIG = {
  // Candidate base branches, first one that exists wins.
  bases: ["origin/main", "origin/master"],
  prettier: {
    // Only these changed files go to Prettier (CI runs `prettier --check .`).
    pattern: /\.(c|m)?js$|\.json$|\.md$|\.ya?ml$/,
    allTargets: ["."],
    // When true, a changed file that was already unformatted on the base
    // branch is reported but does not fail the check, so touching a legacy
    // file never forces a whole-file reformat. Use it only where CI does not
    // already enforce Prettier on those files.
    exemptPreexisting: false,
  },
  eslint: {
    pattern: /\.(c|m)?js$/,
    // Only changed files under one of these prefixes are linted.
    scope: [""],
    allTargets: ["."],
    // CI treats lint errors as failures. Warnings never fail.
    blocking: true,
  },
};

const argv = process.argv.slice(2);
const FIX = argv.includes("--fix");
const ALL = argv.includes("--all");
const CHUNK = 150;
const LIST_LIMIT = 15;

function git(args) {
  const res = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : null;
}

function lines(text) {
  return text ? text.split("\n").filter(Boolean) : [];
}

function chunks(list) {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) {
    out.push(list.slice(i, i + CHUNK));
  }
  return out;
}

function findBase() {
  const head = git(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  const candidates = head
    ? [head.replace("refs/remotes/", ""), ...CONFIG.bases]
    : CONFIG.bases;
  return candidates.find((ref) =>
    git(["rev-parse", "--verify", "--quiet", ref]),
  );
}

// Returns the changed files plus the ref they were compared against (used to
// look up each file's original content).
function changedFiles() {
  const found = new Set();
  const base = findBase();
  let note = "";
  let ref = null;
  if (base) {
    const mergeBase = git(["merge-base", "HEAD", base]);
    if (!mergeBase) {
      note = ` (no common history with ${base}; comparing against its tip)`;
    }
    ref = mergeBase || base;
    lines(
      git(["diff", "--name-only", "--diff-filter=ACMR", ref, "HEAD"]),
    ).forEach((f) => found.add(f));
  } else {
    note =
      " (no origin/main or origin/master found; checking local changes only)";
  }
  lines(git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])).forEach(
    (f) => found.add(f),
  );
  lines(git(["ls-files", "--others", "--exclude-standard"])).forEach((f) =>
    found.add(f),
  );
  const existing = [...found].filter((f) => fs.existsSync(path.join(root, f)));
  return { files: existing.sort(), base: base || "local changes", note, ref };
}

// Resolve a tool's bin script from the repo's own node_modules so the
// version always matches what CI installs. No npx, no shell.
function toolBin(pkg, name = pkg) {
  const pj = path.join(root, "node_modules", pkg, "package.json");
  if (!fs.existsSync(pj)) {
    return null;
  }
  const meta = JSON.parse(fs.readFileSync(pj, "utf8"));
  const rel = typeof meta.bin === "string" ? meta.bin : meta.bin[name];
  return path.join(path.dirname(pj), rel);
}

const failures = [];
const advisories = [];

function missingTool(label, pkg) {
  console.error(
    `\n✖ ${label}: ${pkg} is not installed. Run "npm install" (or "yarn install") first.`,
  );
  failures.push(label);
}

function runTool(label, pkg, argsFor, targets, { blocking = true } = {}) {
  const bin = toolBin(pkg);
  if (!bin) {
    missingTool(label, pkg);
    return;
  }
  console.log(`\n▶ ${label}`);
  let ok = true;
  chunks(targets).forEach((chunk) => {
    const res = spawnSync(process.execPath, [bin, ...argsFor, ...chunk], {
      cwd: root,
      stdio: "inherit",
    });
    if (res.status !== 0) {
      ok = false;
    }
  });
  if (!ok) {
    (blocking ? failures : advisories).push(label);
  }
}

// Prettier files that would be rewritten. `error` is true when Prettier itself
// could not run (for example a syntax error), which must also fail the check.
function listUnformatted(bin, targets) {
  const files = [];
  let error = false;
  chunks(targets).forEach((chunk) => {
    const res = spawnSync(
      process.execPath,
      [bin, "--list-different", "--ignore-unknown", ...chunk],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (res.status === 1) {
      files.push(...lines(res.stdout));
    } else if (res.status !== 0) {
      error = true;
      console.error(res.stderr || res.stdout);
    }
  });
  return { files, error };
}

// True when the file already failed Prettier before this branch touched it.
function unformattedAtBase(bin, file, ref) {
  const show = spawnSync("git", ["show", `${ref}:${file}`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (show.status !== 0) {
    return false;
  }
  const res = spawnSync(
    process.execPath,
    [bin, "--check", "--stdin-filepath", file],
    { cwd: root, input: show.stdout, encoding: "utf8" },
  );
  return res.status === 1;
}

function printList(files) {
  files.slice(0, LIST_LIMIT).forEach((f) => console.log(`    ${f}`));
  if (files.length > LIST_LIMIT) {
    console.log(`    ...and ${files.length - LIST_LIMIT} more`);
  }
}

function prettierStep(targets, ref) {
  const bin = toolBin("prettier");
  if (!bin) {
    missingTool("Prettier", "prettier");
    return;
  }
  console.log("\n▶ Prettier");
  const first = listUnformatted(bin, targets);
  let exempt = [];
  let pending = first.files;
  if (CONFIG.prettier.exemptPreexisting && ref) {
    exempt = pending.filter((f) => unformattedAtBase(bin, f, ref));
    pending = pending.filter((f) => !exempt.includes(f));
  }
  let error = first.error;
  if (FIX && pending.length) {
    chunks(pending).forEach((chunk) => {
      spawnSync(process.execPath, [bin, "--write", ...chunk], {
        cwd: root,
        stdio: "inherit",
      });
    });
    const again = listUnformatted(bin, pending);
    pending = again.files;
    error = error || again.error;
  }
  if (pending.length) {
    console.log(`  ${pending.length} file(s) need formatting:`);
    printList(pending);
  }
  if (exempt.length) {
    console.log(
      `  note: ${exempt.length} changed file(s) were already unformatted on the base branch and are not blocking:`,
    );
    printList(exempt);
  }
  if (pending.length || error) {
    failures.push("Prettier");
  } else {
    console.log("  all checked files are formatted");
  }
}

function main() {
  const mode = FIX ? "fix" : "check";
  let files = [];
  let ref = null;
  let baseLabel = "";
  if (ALL) {
    baseLabel = "whole repo";
  } else {
    const changed = changedFiles();
    files = changed.files;
    ref = changed.ref;
    baseLabel = `${files.length} changed file(s) vs ${changed.base}${changed.note}`;
    if (!files.length) {
      console.log("precheck: no changed files, nothing to check.");
      return;
    }
  }
  console.log(`precheck (${mode}): ${baseLabel}`);

  const prettierTargets = ALL
    ? CONFIG.prettier.allTargets
    : files.filter((f) => CONFIG.prettier.pattern.test(f));
  if (prettierTargets.length) {
    prettierStep(prettierTargets, ref);
  }

  const eslintTargets = ALL
    ? CONFIG.eslint.allTargets
    : files.filter(
        (f) =>
          CONFIG.eslint.pattern.test(f) &&
          CONFIG.eslint.scope.some((prefix) => f.startsWith(prefix)),
      );
  if (eslintTargets.length) {
    runTool(
      FIX ? "ESLint (fix)" : "ESLint",
      "eslint",
      ["--no-warn-ignored", ...(FIX ? ["--fix"] : [])],
      eslintTargets,
      { blocking: CONFIG.eslint.blocking },
    );
  }

  console.log("");
  if (advisories.length) {
    console.log(
      `precheck: advisory only (not blocking in CI): ${advisories.join(", ")}`,
    );
  }
  if (failures.length) {
    console.error(`precheck FAILED: ${failures.join(", ")}`);
    console.error(
      FIX
        ? "Some problems could not be fixed automatically. Fix them by hand, then re-run: npm run precheck"
        : "Fix the problems above, then re-run: npm run precheck\n(npm run precheck:fix repairs formatting and fixable lint automatically)",
    );
    process.exitCode = 1;
  } else {
    console.log("precheck PASSED");
  }
}

main();
