// Release gate (haxtheweb/issues#3334): run before a release is tagged or
// published, against the exact haxcms-nodejs and haxcms-php checkouts that
// are about to ship. It passes only when
//   1. both backends serve the same OpenAPI contract (spec-diff.cjs), and
//   2. every golden case matches its committed snapshot on every leg
//      (nodejs, php, and the CLI running on that haxcms-nodejs).
// Exit 0 when both pass, 1 otherwise. The ubiquity scripts in webcomponents
// call it: ubiquity-testing.sh reports, ubiquity-push.sh stops before
// anything is committed, tagged or published.
//
//   npm run test:parity:release -- --nodejs ../haxcms-nodejs --php ../haxcms-php
//
// Options (plus every parity.cjs flag, see README.md):
//   --build      build haxcms-nodejs (npm run build) and this CLI first;
//                both load from dist/, which git does not track
//   --link-cli   point this CLI's @haxtheweb/haxcms-nodejs at the checkout
//                under test for the run, then put the installed one back.
//                Without it the gate refuses to run the CLI leg on any other
//                haxcms-nodejs, since that is not what will ship.
//   --specs-only check the OpenAPI specs and stop
//   --old-sites  also run the old-site compatibility check
//                (../old-sites/run.cjs, haxtheweb/issues#3175) on both
//                backends and the CLI: a site made by any year's release must
//                still load, save and take outline changes on what is about
//                to ship. Off unless asked for; when on, it has to pass.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig, REPO_ROOT } = require("./config.cjs");
const { compareSpecs, formatSpecReport } = require("./spec-diff.cjs");

const GATE_FLAGS = ["build", "link-cli", "specs-only", "old-sites"];

function log(msg) {
  console.log("[release-gate] " + msg);
}

function run(cmd, args, cwd) {
  log(`${cmd} ${args.join(" ")} (in ${cwd})`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  return r.status === 0;
}

function installedBackend() {
  return path.join(REPO_ROOT, "node_modules", "@haxtheweb", "haxcms-nodejs");
}

function resolvesTo(dir) {
  try {
    return (
      fs.realpathSync(installedBackend()) === fs.realpathSync(path.resolve(dir))
    );
  } catch (e) {
    return false;
  }
}

// swap the installed package for a link to the checkout; returns a restore()
function linkBackend(nodejsDir) {
  const target = installedBackend();
  if (resolvesTo(nodejsDir)) return () => {};
  const backup = target + ".release-gate-backup";
  if (fs.existsSync(backup))
    throw new Error(
      `${backup} is left from an earlier run; move it back to ${target} first`,
    );
  const had = fs.existsSync(target) || isLink(target);
  if (had) fs.renameSync(target, backup);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(path.resolve(nodejsDir), target, "dir");
  log(`CLI linked to ${path.resolve(nodejsDir)} for this run`);
  return () => {
    fs.unlinkSync(target);
    if (had) fs.renameSync(backup, target);
    log("CLI's installed haxcms-nodejs put back");
  };
}

function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch (e) {
    return false;
  }
}

function parityArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const name = a.startsWith("--") ? a.slice(2).split("=")[0] : null;
    if (name && GATE_FLAGS.includes(name)) continue;
    out.push(a);
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const cfg = loadConfig(argv);
  const flags = cfg.args;
  const on = (k) => flags[k] === "1" || flags[k] === "true";
  const lines = ["## Release gate", ""];
  lines.push(`- haxcms-nodejs: ${cfg.nodejs}`, `- haxcms-php: ${cfg.php}`, "");

  // 1. contract
  const specs = compareSpecs(cfg.nodejs, cfg.php);
  lines.push("### OpenAPI specs", "", formatSpecReport(specs), "");
  log("OpenAPI specs: " + (specs.ok ? "same" : "DIFFERENT"));

  let golden = null;
  let oldSites = null;
  let oldSitesReport = "";
  if (!on("specs-only")) {
    // 2. golden suite on the build that will ship
    let restore = () => {};
    let ready = true;
    if (on("build")) {
      ready =
        run("npm", ["run", "build"], cfg.nodejs) &&
        run("npm", ["run", "build"], REPO_ROOT);
    }
    if (ready && on("link-cli")) {
      restore = linkBackend(cfg.nodejs);
    } else if (ready && !resolvesTo(cfg.nodejs)) {
      ready = false;
      lines.push(
        "### Golden snapshots",
        "",
        "Not run: this CLI loads a different haxcms-nodejs than the checkout under test. Run with `--link-cli`.",
        "",
      );
    }
    if (ready) {
      try {
        const args = [
          path.join(__dirname, "parity.cjs"),
          "--golden",
          "--fail-on-diff",
        ].concat(parityArgs(argv));
        const r = spawnSync(process.execPath, args, {
          cwd: REPO_ROOT,
          stdio: "inherit",
        });
        golden = r.status === 0;
        if (on("old-sites")) {
          // while the CLI is still linked to the checkout under test
          const oldSitesOut = path.join(cfg.out, "old-sites");
          const run = spawnSync(
            process.execPath,
            [
              path.join(__dirname, "..", "old-sites", "run.cjs"),
              "--nodejs",
              cfg.nodejs,
              "--php",
              cfg.php,
              "--php-bin",
              cfg["php-bin"],
              "--cli",
              cfg.cli,
              "--out",
              oldSitesOut,
            ],
            { cwd: REPO_ROOT, stdio: "inherit" },
          );
          oldSites = run.status === 0;
          const oldSummary = path.join(oldSitesOut, "summary.md");
          oldSitesReport = fs.existsSync(oldSummary)
            ? fs.readFileSync(oldSummary, "utf8")
            : "The old-site check did not finish; see the output above.\n";
        }
      } finally {
        restore();
      }
      const summary = path.join(cfg.out, "golden", "summary.md");
      lines.push(
        fs.existsSync(summary)
          ? fs.readFileSync(summary, "utf8")
          : "### Golden snapshots\n\nThe suite did not finish; see the output above.\n",
      );
    } else {
      golden = false;
      if (on("old-sites")) oldSites = false;
    }
    log("golden snapshots: " + (golden ? "match" : "FAILED"));
    if (oldSites !== null) {
      lines.push(
        "### Old-site compatibility",
        "",
        oldSitesReport || "Not run: the golden suite could not start.\n",
      );
      log("old-site compatibility: " + (oldSites ? "passed" : "FAILED"));
    }
  }

  const passed =
    specs.ok && (golden === null || golden) && (oldSites === null || oldSites);
  lines.unshift(passed ? "**PASSED**\n" : "**FAILED**\n");
  fs.mkdirSync(cfg.out, { recursive: true });
  const report = path.join(cfg.out, "release-gate.md");
  fs.writeFileSync(report, lines.join("\n") + "\n");
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  log((passed ? "PASSED" : "FAILED") + ", report: " + report);
  return passed ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { main, parityArgs, GATE_FLAGS };
