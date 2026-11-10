// One-command parity run: boots haxcms-nodejs (its own e2e runtime), starts
// haxcms-php under `php -S` with php-router.php, runs the requested sequences
// with run.cjs, writes <out>/summary.md (and the GitHub job summary when
// GITHUB_STEP_SUMMARY is set), then stops both servers.
//
//   node test/parity/parity.cjs --nodejs ../haxcms-nodejs --php ../haxcms-php \
//     --seq A,B --ops 1000 --out parity-results
//
// See README.md in this directory for every flag / environment variable.
// Exit code: 0 when every sequence ran to the end, whatever it found;
// 1 when the harness itself crashed (a server did not start, a leg could not
// create its site, ...). Divergences are reported, never fatal.
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { loadConfig } = require("./config.cjs");
const { runSequence } = require("./run.cjs");
const { summarize } = require("./summary.cjs");

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

async function startPhp(cfg, logFile) {
  if (!fs.existsSync(path.join(cfg.php, "_config", "config.php")))
    throw new Error(
      `${cfg.php} is not installed: run \`TERM=xterm bash scripts/haxtheweb.sh <user> <pass>\` in it first`,
    );
  if (!cfg.phpExternal) {
    const out = fs.openSync(logFile, "a");
    const child = spawn(
      cfg["php-bin"],
      [
        "-S",
        `${cfg["php-host"]}:${cfg["php-port"]}`,
        "-t",
        cfg.php,
        path.join(__dirname, "php-router.php"),
      ],
      { cwd: cfg.php, stdio: ["ignore", out, out] },
    );
    children.push(child);
    child.on("exit", (code) => {
      if (code) console.error(`php -S exited with code ${code}`);
    });
  }
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      await fetch(cfg["php-url"] + "/system/api/v1/session/login", {
        method: "OPTIONS",
      });
      return;
    } catch (e) {
      if (Date.now() > deadline)
        throw new Error("haxcms-php did not answer at " + cfg["php-url"]);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function main() {
  const cfg = loadConfig();
  if (!fs.existsSync(cfg.cli))
    throw new Error(`CLI not found at ${cfg.cli}: run \`npm run build\` first`);
  fs.mkdirSync(cfg.out, { recursive: true });
  fs.mkdirSync(cfg.work, { recursive: true });
  const env = {
    sources: {
      "haxcms-nodejs": gitInfo(cfg.nodejs),
      "haxcms-php": gitInfo(cfg.php),
      "HAX CLI": gitInfo(path.resolve(path.dirname(cfg.cli), "..")),
    },
    cliBackend: cliBackend(cfg),
    seq: cfg.seq,
    ops: cfg.ops,
    strict: cfg.strict,
  };
  fs.writeFileSync(
    path.join(cfg.out, "env.json"),
    JSON.stringify(env, null, 2),
  );
  console.log(JSON.stringify(env, null, 2));

  let crashed = null;
  try {
    const nodeInfo = await bootNode(
      cfg,
      path.join(cfg.out, "nodejs-server.log"),
    );
    console.log("haxcms-nodejs up at " + nodeInfo.baseUrl);
    await startPhp(cfg, path.join(cfg.out, "php-server.log"));
    console.log("haxcms-php up at " + cfg["php-url"]);
    for (const seq of cfg.seq) await runSequence(cfg, seq, nodeInfo);
  } catch (e) {
    crashed = e;
    console.error("HARNESS CRASH:", e && e.stack ? e.stack : e);
  } finally {
    stopChildren();
  }
  let md = summarize(cfg.out);
  if (crashed)
    md =
      `> **Harness crash:** ${String(crashed.message || crashed).replace(/[\r\n]+/g, " ")}\n\n` +
      md;
  fs.writeFileSync(path.join(cfg.out, "summary.md"), md);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  console.log("\n" + md);
  return crashed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("HARNESS CRASH:", e);
    stopChildren();
    process.exit(1);
  },
);
