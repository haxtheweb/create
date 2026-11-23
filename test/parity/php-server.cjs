// Starts a haxcms-php checkout under `php -S` for a test run: a fresh copy of
// the code, installed from scratch by its own installer, on a free port.
// Used by the parity harness (parity.cjs) and the old-site compatibility
// check (../old-sites/run.cjs).
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

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

// cfg: the parity settings (config.cjs) it reads and fills in: php, php-bin,
// php-host, php-port, php-url, phpExternal, phpInPlace, phpPortAuto, work.
// children: the caller's list of child processes to stop at the end.
async function startPhp(cfg, logFile, children = []) {
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

module.exports = { freePort, preparePhpRoot, startPhp, PHP_OWN_STATE };
