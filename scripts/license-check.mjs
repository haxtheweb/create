/**
 * Dependency license check (haxtheweb/issues#3262).
 *
 * This package is Apache-2.0, so every dependency it pulls in (direct or
 * transitive) must carry a license that is compatible with Apache-2.0.
 * package-lock.json is the source of truth for the tree (it is what `npm ci`
 * installs in CI). Licenses are read from each installed package's own
 * package.json, falling back to the lockfile's `license` field and then to
 * `npm view` for optional platform packages that are not installed here.
 *
 *   node scripts/license-check.mjs --base-lock <file>
 *       PR gate: check only packages (name@version) that are in the current
 *       package-lock.json but not in the base branch's lockfile <file>.
 *   node scripts/license-check.mjs --all
 *       Sweep: check the whole dependency tree.
 *   node scripts/license-check.mjs --license-file
 *       Check that LICENSE / LICENSE.md is still Apache-2.0.
 *
 * Run `npm ci --ignore-scripts` first so node_modules matches the lockfile.
 *
 * Results:
 *   allowed       MIT, MIT-0, ISC, BSD-*, Apache-2.0, 0BSD, CC0-1.0,
 *                 Unlicense, Python-2.0, BlueOak-1.0.0, Zlib
 *   needs review  LGPL-*, MPL-* (fails, so a maintainer decides)
 *   incompatible  GPL-*, AGPL-*, SSPL-*, BUSL-*, Commons Clause (fails)
 *   unknown       no license, UNLICENSED, "SEE LICENSE IN ...", or any
 *                 license not on the lists above (fails)
 *
 * A package a maintainer has reviewed and accepted is listed in
 * .github/license-review.json as {"name": "...", "license": "...",
 * "reason": "..."}. The entry only matches while the package still reports
 * that exact license string.
 *
 * Findings go to stdout and, in GitHub Actions, to the job summary.
 * Exit code is 1 when anything fails, 0 otherwise.
 */

import { spawnSync } from "node:child_process";
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSD-3-Clause-Clear",
  "BSD-4-Clause",
  "0BSD",
  "Apache-2.0",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
  "BlueOak-1.0.0",
  "Zlib",
]);
// Common non-SPDX spellings seen in package.json files.
const ALIASES = {
  APACHE2: "Apache-2.0",
  "APACHE 2.0": "Apache-2.0",
  "APACHE-2": "Apache-2.0",
  "APACHE LICENSE 2.0": "Apache-2.0",
  "APACHE LICENSE, VERSION 2.0": "Apache-2.0",
  "MIT LICENSE": "MIT",
  "PUBLIC DOMAIN": "Unlicense",
};
const REVIEW = [/^LGPL-/i, /^MPL-/i];
const INCOMPATIBLE = [
  /^GPL-/i,
  /^AGPL-/i,
  /^SSPL-/i,
  /^BUSL-/i,
  /COMMONS[\s-]?CLAUSE/i,
];
// Worst first: the result of an AND is its worst part, of an OR its best.
const RANK = { allowed: 0, review: 1, unknown: 2, incompatible: 3 };

function classifyId(raw) {
  let id = raw.trim().replace(/\+$/, "");
  if (ALIASES[id.toUpperCase()]) {
    id = ALIASES[id.toUpperCase()];
  }
  if (ALLOWED.has(id)) {
    return "allowed";
  }
  if (INCOMPATIBLE.some((re) => re.test(id))) {
    return "incompatible";
  }
  if (REVIEW.some((re) => re.test(id))) {
    return "review";
  }
  return "unknown";
}

// Minimal SPDX expression evaluator: ids, WITH exceptions, AND, OR, parens.
function classifyExpression(expr) {
  if (/COMMONS[\s-]?CLAUSE/i.test(expr)) {
    return "incompatible";
  }
  const tokens = expr
    .replace(/\(/g, " ( ")
    .replace(/\)/g, " ) ")
    .split(/\s+/)
    .filter(Boolean);
  let pos = 0;
  function worst(a, b) {
    return RANK[a] >= RANK[b] ? a : b;
  }
  function best(a, b) {
    return RANK[a] <= RANK[b] ? a : b;
  }
  function primary() {
    const tok = tokens[pos++];
    if (tok === undefined) {
      return "unknown";
    }
    if (tok === "(") {
      const inner = orExpr();
      pos++; // closing paren
      return inner;
    }
    let result = classifyId(tok);
    if (tokens[pos] && tokens[pos].toUpperCase() === "WITH") {
      pos += 2; // exceptions only add permissions
    }
    return result;
  }
  function andExpr() {
    let result = primary();
    while (tokens[pos] && tokens[pos].toUpperCase() === "AND") {
      pos++;
      result = worst(result, primary());
    }
    return result;
  }
  function orExpr() {
    let result = andExpr();
    while (tokens[pos] && tokens[pos].toUpperCase() === "OR") {
      pos++;
      result = best(result, andExpr());
    }
    return result;
  }
  return orExpr();
}

function classifyLicense(license) {
  if (
    !license ||
    /^UNLICENSED$/i.test(license) ||
    /^SEE LICEN[CS]E IN/i.test(license)
  ) {
    return "unknown";
  }
  return classifyExpression(license);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function licenseFromManifest(pkg) {
  if (typeof pkg.license === "string") {
    return pkg.license;
  }
  if (pkg.license && typeof pkg.license.type === "string") {
    return pkg.license.type;
  }
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    const types = pkg.licenses
      .map((l) => (typeof l === "string" ? l : l && l.type))
      .filter(Boolean);
    if (types.length > 0) {
      return types.length > 1 ? `(${types.join(" OR ")})` : types[0];
    }
  }
  return "";
}

function npmViewLicense(name, version) {
  const res = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["view", `${name}@${version}`, "license", "--json"],
    { cwd: root, encoding: "utf8" },
  );
  if (res.status !== 0 || !res.stdout.trim()) {
    return "";
  }
  try {
    const value = JSON.parse(res.stdout);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function packageName(lockPath, entry) {
  if (entry.name) {
    return entry.name;
  }
  const idx = lockPath.lastIndexOf("node_modules/");
  return lockPath.slice(idx + "node_modules/".length);
}

// name@version -> { name, version, dev, lockPaths, lockLicense }
function lockPackages(lockFile) {
  const lock = readJson(lockFile);
  const out = new Map();
  const packages = lock.packages || {};
  for (const lockPath of Object.keys(packages)) {
    const entry = packages[lockPath];
    if (!lockPath || entry.link || !lockPath.includes("node_modules/")) {
      continue;
    }
    const name = packageName(lockPath, entry);
    const key = `${name}@${entry.version}`;
    const existing = out.get(key);
    if (existing) {
      existing.lockPaths.push(lockPath);
      existing.dev = existing.dev && !!entry.dev;
      continue;
    }
    out.set(key, {
      name,
      version: entry.version,
      dev: !!entry.dev,
      lockPaths: [lockPath],
      lockLicense: entry.license || "",
    });
  }
  return out;
}

function resolveLicense(pkg) {
  for (const lockPath of pkg.lockPaths) {
    const manifest = path.join(root, lockPath, "package.json");
    if (fs.existsSync(manifest)) {
      return {
        license: licenseFromManifest(readJson(manifest)),
        source: "package.json",
      };
    }
  }
  if (pkg.lockLicense) {
    return { license: pkg.lockLicense, source: "package-lock.json" };
  }
  return { license: npmViewLicense(pkg.name, pkg.version), source: "npm view" };
}

function loadReviewed() {
  const file = path.join(root, ".github", "license-review.json");
  if (!fs.existsSync(file)) {
    return [];
  }
  const data = readJson(file);
  return Array.isArray(data.reviewed) ? data.reviewed : [];
}

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

const MESSAGES = {
  incompatible: "incompatible with Apache-2.0",
  review:
    "needs review (LGPL / MPL): a maintainer must decide whether it is acceptable",
  unknown: "unknown or unlisted license: not on the allow list",
};

function checkDependencies(mode, baseLockFile) {
  const current = lockPackages(path.join(root, "package-lock.json"));
  let targets = [...current.values()];
  let heading = "Dependency license sweep (full tree, package-lock.json)";
  if (mode === "diff") {
    const base = lockPackages(baseLockFile);
    targets = targets.filter((pkg) => !base.has(`${pkg.name}@${pkg.version}`));
    heading = "Dependency license check (new dependencies in this PR)";
  }
  const reviewed = loadReviewed();
  const findings = [];
  let accepted = 0;
  for (const pkg of targets) {
    const { license, source } = resolveLicense(pkg);
    const result = classifyLicense(license);
    if (result === "allowed") {
      continue;
    }
    if (reviewed.some((r) => r.name === pkg.name && r.license === license)) {
      accepted++;
      continue;
    }
    findings.push({ ...pkg, license: license || "(none)", source, result });
  }
  findings.sort(
    (a, b) => RANK[b.result] - RANK[a.result] || a.name.localeCompare(b.name),
  );

  console.log(`${heading}: ${targets.length} package(s) checked.`);
  const lines = [`## ${heading}`, "", `${targets.length} package(s) checked.`];
  if (accepted > 0) {
    lines.push(`${accepted} accepted via .github/license-review.json.`);
  }
  if (findings.length === 0) {
    console.log("All licenses are compatible with Apache-2.0.");
    lines.push("", "All licenses are compatible with Apache-2.0.");
    summary(lines.join("\n"));
    return true;
  }
  lines.push(
    "",
    "| Package | Version | Scope | License | Source | Result |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const f of findings) {
    const scope = f.dev ? "dev" : "production";
    const msg = `${f.name}@${f.version} (${scope}): ${f.license}: ${MESSAGES[f.result]}`;
    console.log(`::error title=Dependency license::${msg}`);
    lines.push(
      `| \`${f.name}\` | ${f.version} | ${scope} | \`${f.license}\` | ${f.source} | ${MESSAGES[f.result]} |`,
    );
  }
  lines.push(
    "",
    "To accept a reviewed package, add it to `.github/license-review.json` with the exact license string and a reason.",
  );
  summary(lines.join("\n"));
  return false;
}

function checkLicenseFile() {
  const candidates = ["LICENSE", "LICENSE.md", "LICENSE.txt"];
  const found = candidates.find((f) => fs.existsSync(path.join(root, f)));
  const pkg = readJson(path.join(root, "package.json"));
  const problems = [];
  if (!found) {
    problems.push("No LICENSE / LICENSE.md file found.");
  } else {
    const text = fs.readFileSync(path.join(root, found), "utf8");
    if (!/Apache License\s+Version 2\.0, January 2004/.test(text)) {
      problems.push(`${found} is not the Apache License, Version 2.0 text.`);
    }
  }
  if (pkg.license !== "Apache-2.0") {
    problems.push(
      `package.json "license" is "${pkg.license}", expected "Apache-2.0".`,
    );
  }
  const lines = ["## Project license", ""];
  if (problems.length === 0) {
    console.log(`${found} and package.json are Apache-2.0.`);
    lines.push(`${found} and package.json are Apache-2.0.`);
  } else {
    for (const p of problems) {
      console.log(`::error title=Project license::${p}`);
      lines.push(`- ${p}`);
    }
  }
  summary(lines.join("\n"));
  return problems.length === 0;
}

function main(argv) {
  const baseIdx = argv.indexOf("--base-lock");
  if (
    !argv.includes("--license-file") &&
    !argv.includes("--all") &&
    baseIdx === -1
  ) {
    console.log(
      "Usage: license-check.mjs [--license-file] [--all] [--base-lock <file>]",
    );
    return false;
  }
  let ok = true;
  if (argv.includes("--license-file")) {
    ok = checkLicenseFile() && ok;
  }
  if (argv.includes("--all")) {
    ok = checkDependencies("all") && ok;
  }
  if (baseIdx !== -1) {
    const baseLock = argv[baseIdx + 1];
    if (!baseLock || !fs.existsSync(baseLock)) {
      console.log(
        `::error title=Dependency license::base lockfile not found: ${baseLock}`,
      );
      return false;
    }
    ok = checkDependencies("diff", baseLock) && ok;
  }
  return ok;
}

process.exitCode = main(process.argv.slice(2)) ? 0 : 1;
