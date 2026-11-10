// Shared settings for the parity harness. Every value can come from a
// command-line flag (--name value) or an environment variable; flags win.
// Nothing here is machine-specific: defaults are relative to this checkout or
// to the OS temp directory.
const os = require("os");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// flag name -> [env var, default]
const SETTINGS = {
  nodejs: [
    "HAX_PARITY_NODEJS_REPO",
    path.join(REPO_ROOT, "..", "haxcms-nodejs"),
  ],
  php: ["HAX_PARITY_PHP_REPO", path.join(REPO_ROOT, "..", "haxcms-php")],
  cli: ["HAX_PARITY_CLI", path.join(REPO_ROOT, "dist", "create.js")],
  "php-bin": ["HAX_PARITY_PHP_BIN", "php"],
  "php-host": ["HAX_PARITY_PHP_HOST", "127.0.0.1"],
  "php-port": ["HAX_PARITY_PHP_PORT", "8081"],
  // set to use a PHP server that is already running instead of starting one
  "php-url": ["HAX_PARITY_PHP_URL", ""],
  "php-user": ["HAX_PARITY_PHP_USER", "admin"],
  "php-pass": ["HAX_PARITY_PHP_PASS", "admin"],
  // node.json written by boot-node.cjs, to use a nodejs server already running
  "node-info": ["HAX_PARITY_NODE_INFO", ""],
  out: ["HAX_PARITY_OUT", path.join(process.cwd(), "parity-results")],
  work: ["HAX_PARITY_WORK", ""],
  seq: ["HAX_PARITY_SEQ", "A,B"],
  ops: ["HAX_PARITY_OPS", "1000"],
  seed: ["HAX_PARITY_SEED", ""],
  snapshots: ["HAX_PARITY_SNAPSHOTS", "100"],
  strict: ["HAX_PARITY_STRICT", ""],
};

function readArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--"))
      out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = "1";
  }
  return out;
}

function loadConfig(argv = process.argv.slice(2), env = process.env) {
  const args = readArgs(argv);
  const cfg = {};
  for (const [name, [envName, def]] of Object.entries(SETTINGS)) {
    if (args[name] !== undefined) cfg[name] = args[name];
    else if (env[envName] !== undefined && env[envName] !== "")
      cfg[name] = env[envName];
    else cfg[name] = def;
  }
  for (const k of ["nodejs", "php", "cli", "out"])
    cfg[k] = path.resolve(cfg[k]);
  if (cfg["node-info"]) cfg["node-info"] = path.resolve(cfg["node-info"]);
  cfg.work = cfg.work
    ? path.resolve(cfg.work)
    : path.join(os.tmpdir(), "hax-parity-" + process.pid);
  cfg.ops = parseInt(cfg.ops, 10);
  cfg.snapshots = parseInt(cfg.snapshots, 10);
  if (!Number.isInteger(cfg.ops) || cfg.ops < 0)
    throw new Error("ops must be a whole number, got " + cfg.ops);
  if (!Number.isInteger(cfg.snapshots) || cfg.snapshots < 0)
    throw new Error("snapshots must be a whole number");
  cfg.seq = String(cfg.seq)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  for (const s of cfg.seq)
    if (s !== "A" && s !== "B") throw new Error("unknown sequence " + s);
  cfg.strict = cfg.strict === "1" || cfg.strict === "true";
  cfg.phpExternal = Boolean(cfg["php-url"]);
  if (!cfg["php-url"])
    cfg["php-url"] = `http://${cfg["php-host"]}:${cfg["php-port"]}`;
  cfg.args = args;
  return cfg;
}

// default seed per sequence, so a nightly run is reproducible
function seedFor(cfg, seq) {
  if (cfg.seed !== "") return parseInt(cfg.seed, 10);
  return seq === "A" ? 2026 : 2027;
}

module.exports = { loadConfig, readArgs, seedFor, SETTINGS, REPO_ROOT };
