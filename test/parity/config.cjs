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
  // empty: a free port is picked for the run
  "php-port": ["HAX_PARITY_PHP_PORT", ""],
  // set to use a PHP server that is already running instead of starting one
  "php-url": ["HAX_PARITY_PHP_URL", ""],
  // serve the --php checkout itself, with its own _config and _sites, instead
  // of a fresh copy made for the run
  "php-in-place": ["HAX_PARITY_PHP_IN_PLACE", ""],
  // login for --php-url and --php-in-place; a fresh copy gets its own
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
  // golden snapshot suite (golden.cjs) instead of the seeded sequences
  golden: ["HAX_PARITY_GOLDEN", ""],
  "update-golden": ["HAX_PARITY_UPDATE_GOLDEN", ""],
  "fail-on-diff": ["HAX_PARITY_FAIL_ON_DIFF", ""],
  cases: ["HAX_PARITY_CASES", ""],
  // run with the golden-noop plugin on (golden/fixtures/plugins): every hook
  // fires and changes nothing, so every snapshot must still match. Needs
  // backends that have the plugin platform, and the plugin spec package
  "noop-plugin": ["HAX_PARITY_NOOP_PLUGIN", ""],
  // the same with golden-throw on: every hook throws, which the platform
  // must log and carry on from, so every snapshot must still match
  "throwing-plugin": ["HAX_PARITY_THROWING_PLUGIN", ""],
  // the @haxtheweb/haxcms-plugin-spec folder both backends load plugins
  // with; defaults to the one in the haxcms-nodejs checkout's node_modules
  "plugin-spec": ["HAX_PARITY_PLUGIN_SPEC", ""],
  // generated-input run (fuzz.cjs) instead of the seeded sequences; the seed,
  // run count and replay path come from HAX_FUZZ_SEED / _RUNS / _PATH
  fuzz: ["HAX_PARITY_FUZZ", ""],
  "fuzz-ops": ["HAX_PARITY_FUZZ_OPS", ""],
  "fuzz-steps": ["HAX_PARITY_FUZZ_STEPS", "3"],
  "fuzz-findings": ["HAX_PARITY_FUZZ_FINDINGS", "10"],
  "fuzz-skip": ["HAX_PARITY_FUZZ_SKIP", ""],
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
  const flag = (v) => v === "1" || v === "true";
  cfg.strict = flag(cfg.strict);
  cfg["update-golden"] = flag(cfg["update-golden"]);
  cfg["fail-on-diff"] = flag(cfg["fail-on-diff"]);
  // updating snapshots implies the golden suite
  cfg.golden = flag(cfg.golden) || cfg["update-golden"];
  cfg.fuzz = flag(cfg.fuzz);
  cfg["noop-plugin"] = flag(cfg["noop-plugin"]);
  cfg["throwing-plugin"] = flag(cfg["throwing-plugin"]);
  if (cfg["noop-plugin"] && cfg["throwing-plugin"])
    throw new Error("--noop-plugin and --throwing-plugin run one at a time");
  // the fixture plugin a golden run turns on, if any (golden/fixtures/plugins)
  cfg.hookPlugin = cfg["noop-plugin"]
    ? "golden-noop"
    : cfg["throwing-plugin"]
      ? "golden-throw"
      : "";
  if (!cfg["plugin-spec"])
    cfg["plugin-spec"] = path.join(
      cfg.nodejs,
      "node_modules",
      "@haxtheweb",
      "haxcms-plugin-spec",
    );
  cfg.phpExternal = Boolean(cfg["php-url"]);
  cfg.phpInPlace = flag(cfg["php-in-place"]);
  // no port given: parity.cjs picks a free one when it starts php -S and
  // rewrites php-url; 8081 only stands in for run.cjs used on its own
  cfg.phpPortAuto = !cfg.phpExternal && cfg["php-port"] === "";
  if (!cfg["php-url"])
    cfg["php-url"] = `http://${cfg["php-host"]}:${cfg["php-port"] || "8081"}`;
  // where the php leg's sites are on disk; parity.cjs points this at the
  // fresh copy when it makes one
  cfg.phpRoot = cfg.php;
  cfg.args = args;
  return cfg;
}

// default seed per sequence, so a nightly run is reproducible
function seedFor(cfg, seq) {
  if (cfg.seed !== "") return parseInt(cfg.seed, 10);
  return seq === "A" ? 2026 : 2027;
}

module.exports = { loadConfig, readArgs, seedFor, SETTINGS, REPO_ROOT };
