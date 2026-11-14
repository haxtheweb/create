"use strict";

// haxtheweb/issues#3351: test/contract/site-contract.cjs points the
// json-outline-schema site folder validator at site folders and reports.
// These tests run it against a stand-in json-outline-schema checkout (a
// contract file plus a tiny validate.js), so they need neither the network
// nor the real validator.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.resolve(__dirname, "..", "contract", "site-contract.cjs");
const {
  parseArgs,
  parityTargets,
  compareCopies,
} = require("../contract/site-contract.cjs");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "hax-contract-check-"));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const CONTRACT_TEXT = '{"title":"stand-in"}\n';

// a checkout whose validator says a folder conforms unless it holds `bad`
function standInJos(name, { withContract = true } = {}) {
  const repo = path.join(scratch, name);
  fs.mkdirSync(path.join(repo, "schema"), { recursive: true });
  fs.mkdirSync(path.join(repo, "scripts"), { recursive: true });
  if (withContract)
    fs.writeFileSync(
      path.join(repo, "schema", "haxcms-site-contract.json"),
      CONTRACT_TEXT,
    );
  fs.writeFileSync(
    path.join(repo, "scripts", "validate.js"),
    [
      'const fs = require("fs");',
      'const path = require("path");',
      "const args = process.argv.slice(2);",
      "const dir = args[args.length - 1];",
      'const bad = fs.existsSync(path.join(dir, "bad"));',
      "console.log(JSON.stringify([{",
      '  folder: dir, type: "site-folder", valid: !bad,',
      '  level: args[args.indexOf("--level") + 1],',
      '  reached: bad ? null : "managed",',
      '  errors: bad ? [{ path: "bad", message: "flags: " + args.slice(0, -1).join(" ") }] : [],',
      "  warnings: [], unclassified: [], retired: [], counts: {},",
      "}]));",
      "process.exitCode = bad ? 1 : 0;",
    ].join("\n"),
  );
  return repo;
}

function folder(name, files = []) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(dir, file), "");
  return dir;
}

function run(args) {
  const env = Object.assign({}, process.env);
  delete env.GITHUB_STEP_SUMMARY;
  delete env.HAX_CONTRACT_JOS_REPO;
  return spawnSync(process.execPath, [SCRIPT].concat(args), {
    encoding: "utf8",
    env: env,
  });
}

test("options: flags, folders and the json-outline-schema location", () => {
  const options = parseArgs(
    ["--level", "managed", "--new", "--exhaustive", "a", "--jos", "x", "b"],
    {},
  );
  assert.equal(options.level, "managed");
  assert.equal(options.new, true);
  assert.equal(options.exhaustive, true);
  assert.equal(options.jos, "x");
  assert.deepEqual(options.folders, ["a", "b"]);
  assert.equal(parseArgs([], { HAX_CONTRACT_JOS_REPO: "y" }).jos, "y");
  assert.throws(() => parseArgs(["--nope"], {}), /unknown or incomplete/);
  assert.throws(() => parseArgs(["--level"], {}), /unknown or incomplete/);
});

test("a conforming folder passes and is listed in the report", () => {
  const jos = standInJos("jos-ok");
  const site = folder("site-ok");
  const result = run(["--jos", jos, "--level", "managed", site]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /## Site folder contract/);
  assert.match(result.stdout, /\| conforms \| managed \| 0 \|/);
});

test("a folder that does not conform fails, and its errors are listed", () => {
  const jos = standInJos("jos-bad");
  const site = folder("site-bad", ["bad"]);
  const result = run([
    "--jos",
    jos,
    "--level",
    "managed",
    "--exhaustive",
    "--new",
    site,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\*\*does not conform\*\*/);
  // the validator was given the level and both strictness flags
  assert.match(
    result.stdout,
    /flags: --site --json --level managed --exhaustive --new/,
  );
});

test("--report-only reports the failure and exits 0", () => {
  const jos = standInJos("jos-report");
  const site = folder("site-report", ["bad"]);
  const out = path.join(scratch, "report.md");
  const result = run(["--jos", jos, "--report-only", "--out", out, site]);
  assert.equal(result.status, 0);
  assert.match(fs.readFileSync(out, "utf8"), /\*\*does not conform\*\*/);
});

test("a checkout without the contract is skipped, not failed", () => {
  const jos = standInJos("jos-before", { withContract: false });
  const result = run(["--jos", jos, folder("site-before", ["bad"])]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Skipped: .*haxcms-site-contract\.json/);
});

test("nothing to check is a usage error", () => {
  const result = run(["--jos", standInJos("jos-empty")]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /nothing to check/);
});

test("parity runs: every leg's site folder is checked", () => {
  const jos = standInJos("jos-parity");
  const good = folder("leg-nodejs");
  const bad = folder("leg-php", ["bad"]);
  const parityOut = path.join(scratch, "parity-results");
  fs.mkdirSync(path.join(parityOut, "A"), { recursive: true });
  fs.writeFileSync(
    path.join(parityOut, "A", "meta.json"),
    JSON.stringify({
      legs: [
        { name: "nodejs", siteDir: good },
        { name: "php", siteDir: bad },
      ],
    }),
  );
  // a file beside the sequence folders is not a sequence
  fs.writeFileSync(path.join(parityOut, "summary.md"), "");
  assert.deepEqual(
    parityTargets(parityOut).map((t) => t.label),
    ["parity A / nodejs", "parity A / php"],
  );
  assert.deepEqual(parityTargets(path.join(scratch, "no-such-run")), []);
  const result = run(["--jos", jos, "--parity-out", parityOut]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\| parity A \/ nodejs \| conforms \|/);
  assert.match(result.stdout, /\| parity A \/ php \| \*\*does not conform\*\*/);
});

test("contract copies: same, differs and missing", () => {
  const jos = standInJos("jos-copies");
  const nodejs = path.join(scratch, "nodejs-repo");
  const php = path.join(scratch, "php-repo");
  fs.mkdirSync(path.join(nodejs, "src", "boilerplate"), { recursive: true });
  fs.writeFileSync(
    path.join(nodejs, "src", "boilerplate", "site-contract.json"),
    CONTRACT_TEXT,
  );
  fs.mkdirSync(php, { recursive: true });
  let rows = compareCopies(jos, `haxcms-nodejs=${nodejs},haxcms-php=${php}`);
  assert.deepEqual(
    rows.map((r) => r.state),
    ["same", "missing"],
  );
  fs.mkdirSync(path.join(php, "system", "boilerplate"), { recursive: true });
  fs.writeFileSync(
    path.join(php, "system", "boilerplate", "site-contract.json"),
    '{"title":"edited"}\n',
  );
  rows = compareCopies(jos, `haxcms-nodejs=${nodejs},haxcms-php=${php}`);
  assert.deepEqual(
    rows.map((r) => r.state),
    ["same", "differs"],
  );
  assert.throws(() => compareCopies(jos, "elsewhere=/tmp"), /--copies expects/);

  const result = run([
    "--jos",
    jos,
    "--copies",
    `haxcms-nodejs=${nodejs},haxcms-php=${php}`,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\| haxcms-php \| .* \| \*\*differs\*\* \|/);
});
