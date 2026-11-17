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
// See README.md in this directory for every flag / environment variable.
// Exit code: 0 when every sequence ran to the end, whatever it found;
// 1 when the harness itself crashed (a server did not start, a leg could not
// create its site, ...). Divergences are reported, never fatal, except in a
// golden run with --fail-on-diff, where any mismatch exits 1.
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { loadConfig } = require("./config.cjs");
const { runSequence } = require("./run.cjs");
const { summarize } = require("./summary.cjs");
const { runGolden } = require("./golden.cjs");

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

// a port nothing is listening on right now, chosen by the OS
function freePort(host) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Top-level entries of a haxcms-php checkout that a run must not share with
// the checkout: its install (_config: credentials, keys, system settings such
// as the default site language) and the content it has made. `build` is the
// large, read-only front end and is linked instead of copied.
const PHP_OWN_STATE = ["_config", "_sites", "_archived", "_published"];
const PHP_NOT_COPIED = PHP_OWN_STATE.concat([".git", "node_modules", "build"]);

// Make a fresh haxcms-php for this run: the code of the checkout under test,
// installed from scratch by its own installer. The result has default system
// settings, no sites and a login only this run knows, so what the php leg
// returns depends on the code and not on the machine it runs on. Returns the
// folder; sets cfg.phpRoot and the login.
function preparePhpRoot(cfg, logFile) {
  const root = path.join(cfg.work, "haxcms-php");
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(cfg.php, root, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => {
      const rel = path.relative(cfg.php, src);
      return rel === "" || !PHP_NOT_COPIED.includes(rel.split(path.sep)[0]);
    },
  });
  if (fs.existsSync(path.join(cfg.php, "build")))
    fs.symlinkSync(
      path.join(cfg.php, "build"),
      path.join(root, "build"),
      "dir",
    );
  const user = "admin";
  const pass = crypto.randomBytes(16).toString("hex");
  const out = fs.openSync(logFile, "a");
  try {
    execFileSync("bash", ["scripts/haxtheweb.sh", user, pass], {
      cwd: root,
      env: Object.assign({}, process.env, {
        TERM: process.env.TERM || "xterm",
      }),
      stdio: ["ignore", out, out],
    });
  } catch (e) {
    throw new Error(
      `haxcms-php install failed in ${root} (see ${logFile}): ${e.message}`,
    );
  } finally {
    fs.closeSync(out);
  }
  if (!fs.existsSync(path.join(root, "_config", "config.php")))
    throw new Error(
      `haxcms-php install wrote no _config/config.php in ${root} (see ${logFile})`,
    );
  cfg.phpRoot = root;
  cfg["php-user"] = user;
  cfg["php-pass"] = pass;
  return root;
}

async function startPhp(cfg, logFile) {
  let child = null;
  if (!cfg.phpExternal) {
    let root = cfg.php;
    if (cfg.phpInPlace) {
      if (!fs.existsSync(path.join(cfg.php, "_config", "config.php")))
        throw new Error(
          `${cfg.php} is not installed: run \`TERM=xterm bash scripts/haxtheweb.sh <user> <pass>\` in it first`,
        );
    } else {
      root = preparePhpRoot(cfg, logFile);
    }
    if (cfg.phpPortAuto) {
      cfg["php-port"] = String(await freePort(cfg["php-host"]));
      cfg["php-url"] = `http://${cfg["php-host"]}:${cfg["php-port"]}`;
    }
    const out = fs.openSync(logFile, "a");
    child = spawn(
      cfg["php-bin"],
      [
        "-S",
        `${cfg["php-host"]}:${cfg["php-port"]}`,
        "-t",
        root,
        path.join(__dirname, "php-router.php"),
      ],
      { cwd: root, stdio: ["ignore", out, out] },
    );
    children.push(child);
    child.on("exit", (code) => {
      if (code) console.error(`php -S exited with code ${code}`);
    });
  }
  const deadline = Date.now() + 30000;
  for (;;) {
    // the server this run started has to be the one that answers: if it is
    // gone (the port was taken, php is missing), stop here and do not go on
    // to talk to whatever else is listening at that address
    if (child && (child.exitCode !== null || child.signalCode !== null))
      throw new Error(
        `php -S did not stay up at ${cfg["php-url"]} (see ${logFile})`,
      );
    try {
      // a short limit, so a listener that accepts and never answers cannot
      // hold this loop past the check above
      await fetch(cfg["php-url"] + "/system/api/v1/session/login", {
        method: "OPTIONS",
        signal: AbortSignal.timeout(3000),
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
    seq: cfg.golden ? [] : cfg.seq,
    ops: cfg.golden ? 0 : cfg.ops,
    golden: cfg.golden,
    strict: cfg.strict,
  };
  fs.writeFileSync(
    path.join(cfg.out, "env.json"),
    JSON.stringify(env, null, 2),
  );
  console.log(JSON.stringify(env, null, 2));

  let crashed = null;
  let golden = null;
  try {
    const nodeInfo = await bootNode(
      cfg,
      path.join(cfg.out, "nodejs-server.log"),
    );
    console.log("haxcms-nodejs up at " + nodeInfo.baseUrl);
    await startPhp(cfg, path.join(cfg.out, "php-server.log"));
    console.log(
      "haxcms-php up at " +
        cfg["php-url"] +
        (cfg.phpExternal
          ? " (already running)"
          : cfg.phpInPlace
            ? ` (in place: ${cfg.php})`
            : ` (fresh copy: ${cfg.phpRoot})`),
    );
    if (cfg.golden) golden = await runGolden(cfg, nodeInfo);
    else for (const seq of cfg.seq) await runSequence(cfg, seq, nodeInfo);
  } catch (e) {
    crashed = e;
    console.error("HARNESS CRASH:", e && e.stack ? e.stack : e);
  } finally {
    stopChildren();
    if (cfg.phpRoot !== cfg.php)
      fs.rmSync(cfg.phpRoot, { recursive: true, force: true });
  }
  let md = golden ? golden.markdown : summarize(cfg.out);
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
