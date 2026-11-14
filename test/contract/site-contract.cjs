#!/usr/bin/env node
// Site folder contract check (haxtheweb/issues#3351).
//
// The contract (which files make a HAXcms site, at three conformance levels)
// and its validator live in https://github.com/haxtheweb/json-outline-schema:
// schema/haxcms-site-contract.json and `scripts/validate.js --site`. This
// script points that validator at site folders this repo's jobs produce and
// writes one report. See README.md in this folder.
//
//   node test/contract/site-contract.cjs [options] [site folder ...]
//
//   --jos <dir>          json-outline-schema checkout (HAX_CONTRACT_JOS_REPO,
//                        default: beside this repo)
//   --level <level>      content | runnable | managed (default: content)
//   --exhaustive         a file no contract entry covers is an error
//   --new                a retired path is an error (sites that were just made)
//   --parity-out <dir>   also check every leg's site from a parity run
//                        (<dir>/<seq>/meta.json, written by test/parity)
//   --copies <list>      name=repo,... : compare each backend's copy of the
//                        contract with the json-outline-schema one
//   --report-only        always exit 0 (findings go to the report)
//   --out <file>         also write the report (markdown) to this file
//
// Exit code: 0 when everything conforms (or --report-only), 1 when something
// does not, 2 on a usage error or when the validator cannot run.
//
// Nothing is run through a shell; folders are passed as arguments.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONTRACT_IN_JOS = path.join("schema", "haxcms-site-contract.json");
// where each backend keeps its copy
const CONTRACT_COPIES = {
  "haxcms-nodejs": path.join("src", "boilerplate", "site-contract.json"),
  "haxcms-php": path.join("system", "boilerplate", "site-contract.json"),
};
const VALUE_FLAGS = ["jos", "level", "parity-out", "copies", "out"];
const BOOLEAN_FLAGS = ["exhaustive", "new", "report-only"];

function parseArgs(argv, env) {
  const options = {
    jos:
      env.HAX_CONTRACT_JOS_REPO ||
      path.join(REPO_ROOT, "..", "json-outline-schema"),
    level: "content",
    folders: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      options.folders.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.includes(name)) {
      options[name] = true;
    } else if (VALUE_FLAGS.includes(name) && i + 1 < argv.length) {
      options[name] = argv[++i];
    } else {
      throw new Error(`unknown or incomplete option ${arg}`);
    }
  }
  return options;
}

// every leg's site folder recorded by a parity run
function parityTargets(parityOut) {
  const targets = [];
  if (!fs.existsSync(parityOut)) return targets;
  for (const seq of fs.readdirSync(parityOut).sort()) {
    const metaFile = path.join(parityOut, seq, "meta.json");
    if (!fs.existsSync(metaFile)) continue;
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    for (const leg of meta.legs || []) {
      if (leg && leg.name && leg.siteDir)
        targets.push({
          label: `parity ${seq} / ${leg.name}`,
          dir: leg.siteDir,
        });
    }
  }
  return targets;
}

function runValidator(validator, options, dir) {
  const args = [validator, "--site", "--json", "--level", options.level];
  if (options.exhaustive) args.push("--exhaustive");
  if (options.new) args.push("--new");
  args.push(dir);
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let report = null;
  try {
    report = JSON.parse(result.stdout)[0];
  } catch {
    report = null;
  }
  if (!report || typeof report.valid !== "boolean") {
    throw new Error(
      `the validator gave no report for ${dir} (exit ${result.status}): ${String(result.stderr || result.stdout).slice(0, 400)}`,
    );
  }
  return report;
}

function compareCopies(josRepo, list) {
  const source = fs.readFileSync(path.join(josRepo, CONTRACT_IN_JOS), "utf8");
  const rows = [];
  for (const pair of list.split(",").filter(Boolean)) {
    const eq = pair.indexOf("=");
    const name = eq === -1 ? "" : pair.slice(0, eq);
    const repo = eq === -1 ? "" : pair.slice(eq + 1);
    if (!CONTRACT_COPIES[name] || !repo)
      throw new Error(
        `--copies expects name=repo with name one of ${Object.keys(CONTRACT_COPIES).join(", ")}`,
      );
    const file = path.join(repo, CONTRACT_COPIES[name]);
    let state = "missing";
    if (fs.existsSync(file))
      state = fs.readFileSync(file, "utf8") === source ? "same" : "differs";
    rows.push({ name, file: CONTRACT_COPIES[name], state });
  }
  return rows;
}

const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\s+/g, " ");

function render(options, sites, copies) {
  const lines = ["## Site folder contract", ""];
  const asked =
    options.level +
    (options.exhaustive ? ", exhaustive" : "") +
    (options.new ? ", new site" : "");
  if (sites.length) {
    lines.push(
      `Asked for: **${asked}**.`,
      "",
      "| Site | Result | Reaches | Errors | Retired paths | Files not in the contract |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const s of sites) {
      lines.push(
        `| ${cell(s.label)} | ${s.report.valid ? "conforms" : "**does not conform**"} | ${s.report.reached || "none"} | ${s.report.errors.length} | ${s.report.retired.length} | ${s.report.unclassified.length} |`,
      );
    }
    lines.push("");
    for (const s of sites) {
      if (s.report.valid) continue;
      lines.push(`### ${cell(s.label)}`, "");
      for (const e of s.report.errors.slice(0, 50))
        lines.push(`- \`${cell(e.path)}\`: ${cell(e.message)}`);
      if (s.report.errors.length > 50)
        lines.push(`- and ${s.report.errors.length - 50} more`);
      lines.push("");
    }
  }
  if (copies.length) {
    lines.push(
      "| Contract copy | File | Compared with json-outline-schema |",
      "| --- | --- | --- |",
    );
    for (const c of copies)
      lines.push(
        `| ${c.name} | \`${c.file}\` | ${c.state === "same" ? "same" : `**${c.state}**`} |`,
      );
    lines.push("");
  }
  return lines.join("\n");
}

function main(argv, env) {
  let options;
  try {
    options = parseArgs(argv, env);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const emit = (markdown) => {
    console.log(markdown);
    if (options.out) {
      fs.mkdirSync(path.dirname(path.resolve(options.out)), {
        recursive: true,
      });
      fs.writeFileSync(options.out, markdown + "\n");
    }
    if (env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(env.GITHUB_STEP_SUMMARY, markdown + "\n");
  };
  const josRepo = path.resolve(options.jos);
  const validator = path.join(josRepo, "scripts", "validate.js");
  if (!fs.existsSync(path.join(josRepo, CONTRACT_IN_JOS))) {
    console.error(
      `no ${CONTRACT_IN_JOS} in ${josRepo}: point --jos at a json-outline-schema checkout`,
    );
    return 2;
  }
  const targets = options.folders.map((dir) => ({ label: dir, dir }));
  if (options["parity-out"])
    targets.push(...parityTargets(path.resolve(options["parity-out"])));
  let sites = [];
  let copies = [];
  try {
    sites = targets.map((t) => ({
      label: t.label,
      report: runValidator(validator, options, t.dir),
    }));
    if (options.copies) copies = compareCopies(josRepo, options.copies);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (!sites.length && !copies.length) {
    console.error(
      "nothing to check: give a site folder, --parity-out or --copies",
    );
    return 2;
  }
  emit(render(options, sites, copies));
  const failed =
    sites.some((s) => !s.report.valid) ||
    copies.some((c) => c.state !== "same");
  return failed && !options["report-only"] ? 1 : 0;
}

module.exports = {
  CONTRACT_IN_JOS,
  parseArgs,
  parityTargets,
  runValidator,
  compareCopies,
  render,
  main,
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
