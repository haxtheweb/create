// One-command parity run: boots haxcms-nodejs (its own e2e runtime), makes a
// fresh copy of haxcms-php and starts it under `php -S` with php-router.php
// on a free port, runs the requested sequences
// with run.cjs, writes <out>/summary.md (and the GitHub job summary when
// GITHUB_STEP_SUMMARY is set), then stops both servers.
//
//   node test/parity/parity.cjs --nodejs ../haxcms-nodejs --php ../haxcms-php \
//     --seq A,B --ops 1000 --out parity-results
//
// With --golden it runs the golden snapshot suite (golden.cjs) instead of the
// sequences: every leg is compared to the committed snapshots in
// golden/snapshots/. --fail-on-diff makes a mismatch exit 1 (the release gate);
// --update-golden rewrites the snapshots from the nodejs leg.
//
// With --fuzz it runs the generated-input run (fuzz.cjs): requests generated
// from the site OpenAPI spec with fast-check go to haxcms-nodejs and
// haxcms-php and the responses are diffed. HAX_FUZZ_SEED / HAX_FUZZ_RUNS /
// HAX_FUZZ_PATH set the seed, the run count and a replay; --fail-on-diff
// makes a finding exit 1.
//
// See README.md in this directory for every flag / environment variable.
// Exit code: 0 when every sequence ran to the end, whatever it found;
// 1 when the harness itself crashed (a server did not start, a leg could not
// create its site, ...). Divergences are reported, never fatal, except in a
// golden or generated-input run with --fail-on-diff, where any mismatch
// exits 1.
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { loadConfig } = require("./config.cjs");
const { runSequence } = require("./run.cjs");
const { summarize } = require("./summary.cjs");
const { runGolden, pluginFixtureDir } = require("./golden.cjs");
const { runFuzz } = require("./fuzz.cjs");
const { startPhp } = require("./php-server.cjs");

const children = [];
function stopChildren() {
  for (const c of children) {
    if (c.exitCode === null && c.signalCode === null) c.kill("SIGTERM");
  }
}
process.on("exit", stopChildren);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    stopChildren();
    process.exit(130);
  });

function gitInfo(dir) {
  try {
    const sha = execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"])
      .toString()
      .trim();
    let ref = "";
    try {
      ref = execFileSync("git", [
        "-C",
        dir,
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
      ])
        .toString()
        .trim();
    } catch (e) {
      ref = "";
    }
    return `${path.basename(dir)} ${ref && ref !== "HEAD" ? ref + " " : ""}@ ${sha}`;
  } catch (e) {
    return `${path.basename(dir)} (not a git checkout)`;
  }
}

// Which haxcms-nodejs the CLI will load. The nightly links the main build in;
// a mismatch is reported so a run against the npm release is visible.
function cliBackend(cfg) {
  try {
    const pkg = require.resolve("@haxtheweb/haxcms-nodejs/package.json", {
      paths: [path.dirname(cfg.cli)],
    });
    const real = fs.realpathSync(path.dirname(pkg));
    const version = JSON.parse(fs.readFileSync(pkg, "utf8")).version;
    const linked = real === fs.realpathSync(cfg.nodejs);
    return `${real} (v${version}${linked ? ", the haxcms-nodejs checkout under test" : ", NOT the haxcms-nodejs checkout under test"})`;
  } catch (e) {
    return "could not resolve: " + e.message;
  }
}

function waitForLine(child, prefix, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(
      () => reject(new Error(`${label} did not start within ${timeoutMs}ms`)),
      timeoutMs,
    );
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith(prefix)) {
          clearTimeout(timer);
          resolve(line.slice(prefix.length));
        }
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${label} exited early with code ${code}`));
    });
  });
}

async function bootNode(cfg, logFile) {
  if (cfg["node-info"])
    return JSON.parse(fs.readFileSync(cfg["node-info"], "utf8"));
  const out = fs.openSync(logFile, "a");
  const child = spawn(
    process.execPath,
    [path.join(__dirname, "boot-node.cjs"), "--nodejs", cfg.nodejs],
    { stdio: ["ignore", "pipe", out] },
  );
  children.push(child);
  child.stdout.on("data", (d) => fs.appendFileSync(logFile, d));
  const json = await waitForLine(child, "READY ", 120000, "haxcms-nodejs");
  return JSON.parse(json);
}

async function main() {
  const cfg = loadConfig();
  if (!fs.existsSync(cfg.cli))
    throw new Error(`CLI not found at ${cfg.cli}: run \`npm run build\` first`);
  fs.mkdirSync(cfg.out, { recursive: true });
  fs.mkdirSync(cfg.work, { recursive: true });
  // both servers are started from this process, so they inherit these
  if (cfg.hookPlugin) {
    if (!fs.existsSync(path.join(cfg["plugin-spec"], "package.json")))
      throw new Error(
        `${cfg.hookPlugin} needs the plugin spec package; not found at ${cfg["plugin-spec"]} (set --plugin-spec)`,
      );
    process.env.HAXCMS_PLUGIN_DIRS = pluginFixtureDir(cfg.hookPlugin);
    process.env.HAXCMS_PLUGIN_SPEC_DIR = cfg["plugin-spec"];
    delete process.env.HAXCMS_PLUGINS;
  }
  const env = {
    sources: {
      "haxcms-nodejs": gitInfo(cfg.nodejs),
      "haxcms-php": gitInfo(cfg.php),
      "HAX CLI": gitInfo(path.resolve(path.dirname(cfg.cli), "..")),
    },
    cliBackend: cliBackend(cfg),
    seq: cfg.golden || cfg.fuzz ? [] : cfg.seq,
    ops: cfg.golden || cfg.fuzz ? 0 : cfg.ops,
    golden: cfg.golden,
    hookPlugin: cfg.hookPlugin,
    fuzz: cfg.fuzz,
    strict: cfg.strict,
  };
  fs.writeFileSync(
    path.join(cfg.out, "env.json"),
    JSON.stringify(env, null, 2),
  );
  console.log(JSON.stringify(env, null, 2));

  let crashed = null;
  let golden = null;
  let fuzz = null;
  try {
    const nodeInfo = await bootNode(
      cfg,
      path.join(cfg.out, "nodejs-server.log"),
    );
    console.log("haxcms-nodejs up at " + nodeInfo.baseUrl);
    await startPhp(cfg, path.join(cfg.out, "php-server.log"), children);
    console.log(
      "haxcms-php up at " +
        cfg["php-url"] +
        (cfg.phpExternal
          ? " (already running)"
          : cfg.phpInPlace
            ? ` (in place: ${cfg.php})`
            : ` (fresh copy: ${cfg.phpRoot})`),
    );
    if (cfg.fuzz) fuzz = await runFuzz(cfg, nodeInfo);
    else if (cfg.golden) golden = await runGolden(cfg, nodeInfo);
    else for (const seq of cfg.seq) await runSequence(cfg, seq, nodeInfo);
  } catch (e) {
    crashed = e;
    console.error("HARNESS CRASH:", e && e.stack ? e.stack : e);
  } finally {
    stopChildren();
    if (cfg.phpRoot !== cfg.php)
      fs.rmSync(cfg.phpRoot, { recursive: true, force: true });
  }
  let md = fuzz
    ? fuzz.markdown
    : golden
      ? golden.markdown
      : cfg.fuzz
        ? "## HAXcms parity: generated inputs\n"
        : summarize(cfg.out);
  if (crashed)
    md =
      `> **Harness crash:** ${String(crashed.message || crashed).replace(/[\r\n]+/g, " ")}\n\n` +
      md;
  fs.writeFileSync(path.join(cfg.out, "summary.md"), md);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  console.log("\n" + md);
  if (crashed) return 1;
  if (golden && golden.failed && cfg["fail-on-diff"]) {
    console.error(`${golden.failed} golden case(s) do not match`);
    return 1;
  }
  if (fuzz && fuzz.failed && cfg["fail-on-diff"]) {
    console.error(`${fuzz.failed} generated-input finding(s)`);
    return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("HARNESS CRASH:", e);
    stopChildren();
    process.exit(1);
  },
);
