"use strict";
// Child-process driver for src/create.js dispatch coverage.
//
// create.js self-executes main() at require time and exits deep inside
// commander flows, so dispatch scenarios are exercised in a dedicated child
// process instead of the test runner process. The driver:
//   - builds an isolated HOME (hax-cli-last-run + winston logs) and cwd
//     (package.json sniffing / scaffold targets) in mkdtemp dirs,
//   - stubs every command handler create.js dispatches to (site,
//     webcomponent, audit, party, skills, search, update) on the live
//     babel-transpiled module exports, plus utils.exec/runCommand/
//     interactiveExec, so nothing shells out or scaffolds,
//   - keeps the real @clack group() so create.js's prompt step functions run,
//     but answers select/text/multiselect/confirm with initialValue(s),
//   - records process.exit codes via a one-shot thrower (swallowed by
//     main().catch(console.error)) and settles when a handler fires,
//   - prints a single JSON record on fd 1 prefixed with
//     __HAX_CLI_DRIVER_JSON__ for the parent test to assert on.
//
// Usage: node create-cli-driver.cjs '<scenario-json>'
// Scenario: {
//   argv: [...],            // args after the program name
//   dirs: ['_sites'],       // dirs to create in the sandbox cwd
//   files: { 'package.json': {...} }, // files written into the sandbox cwd
//   siteContext: true,      // systemStructureContext stub returns a site
//   registryValue: '9.9.9', // stdout returned by the stubbed registry call
//   registryError: true     // make the registry call throw (offline)
// }

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scenario = JSON.parse(process.argv[2] || "{}");
const argv = Array.isArray(scenario.argv) ? scenario.argv : [];

// isolated HOME: create.js writes ~/.haxtheweb/hax-cli-last-run and
// logging.js points its winston file transport there on load
const home = fs.mkdtempSync(path.join(os.tmpdir(), "hax-cli-driver-home-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
fs.mkdirSync(path.join(home, ".haxtheweb"), { recursive: true });
// pre-seed a valid haxcms config dir so HAXCMS's discoverConfigPath takes the
// "found" branch; the on-the-fly creation in the installed dist throws on a
// missing boilerplate .htaccess and would otherwise fall back to writing
// .user/.SALT/.pk/.rpk into node_modules
const haxcmsConfig = path.join(home, ".haxcmsconfig");
fs.mkdirSync(haxcmsConfig, { recursive: true });
fs.writeFileSync(path.join(haxcmsConfig, ".isHAXcmsConfig"), "");
fs.mkdirSync(path.join(haxcmsConfig, "tmp"), { recursive: true });
fs.mkdirSync(path.join(haxcmsConfig, "settings"), { recursive: true });
// same flag cli-mode.js sets; keep HAXcms init in CLI mode (no credential
// seeding output, no multisite _sites mkdir) during the direct HAXCMS require
process.env.haxcms_middleware = "node-cli";
// stale last-run timestamp so main() takes the "check for updates" branch
if (scenario.oldLastRun) {
  fs.writeFileSync(
    path.join(home, ".haxtheweb", "hax-cli-last-run"),
    new Date(Date.now() - 30 * 86400000).toISOString(),
  );
}

// isolated cwd: package.json sniffing and scaffold targets land here
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hax-cli-driver-cwd-"));

// babel resolves babel.config.js from the process cwd, so register while the
// repo is still the cwd; the sandbox chdir comes after all src requires are
// wired up. Skipping this makes babel pass ESM through untouched and the
// handler patches land on frozen require(esm) namespaces.
process.chdir(path.resolve(__dirname, "..", ".."));
require("./english.cjs");
const { installClackStub } = require("./clack-stub.cjs");
const stub = installClackStub();

// transpile ESM src so handlers can be patched on writable CJS export bindings
require("@babel/register");

process.chdir(cwd);
(scenario.dirs || []).forEach((dir) => {
  fs.mkdirSync(path.join(cwd, dir), { recursive: true });
});
Object.entries(scenario.files || {}).forEach(([name, content]) => {
  fs.writeFileSync(path.join(cwd, name), JSON.stringify(content, null, 2));
});

const repoRoot = path.resolve(__dirname, "..", "..");

let resolveDone;
const done = new Promise((resolve) => {
  resolveDone = resolve;
});

const record = {
  cwd: cwd,
  argv: argv,
  exitCodes: [],
  stdout: [],
  stderr: [],
  intros: [],
  outros: [],
  cancels: [],
  prompts: [],
  validations: [],
  handlers: {},
};

const recordHandler = (name, payload) => {
  if (!record.handlers[name]) {
    record.handlers[name] = [];
  }
  record.handlers[name].push(payload);
  // create.js finishes shortly after a dispatch target returns; give the
  // remaining microtasks a moment before printing the record
  setTimeout(resolveDone, 250);
};

// own stdio so the JSON payload is the only thing on fd 1
process.stdout.write = (chunk) => {
  record.stdout.push(String(chunk));
  return true;
};
process.stderr.write = (chunk) => {
  record.stderr.push(String(chunk));
  return true;
};
console.log = (...args) => {
  record.stdout.push(args.map(String).join(" "));
};
console.error = (...args) => {
  const first = args[0];
  const message = first instanceof Error ? first.message : String(first);
  if (/__driver_exit__|__main_process_exit__/.test(message)) {
    return;
  }
  // keep the stack (message included) so dependency errors are traceable
  record.stderr.push(first instanceof Error ? first.stack : message);
};

// clack: record UI calls, answer prompts deterministically. group() stays the
// real implementation so create.js's step functions actually execute.
stub.intro = (msg) => record.intros.push(String(msg));
stub.outro = (msg) => record.outros.push(String(msg));
stub.cancel = (msg) => record.cancels.push(String(msg));
stub.note = (msg) => record.intros.push("note: " + String(msg));
// the real prompts resolve promises, and clack's group() calls
// step(...)?.catch(...) on each result, so the stubs must return promises too
stub.select = (opts) => {
  record.prompts.push({ kind: "select", message: opts && opts.message });
  // scenario.selectValue overrides every select answer (e.g. custom-theme);
  // otherwise clack's own initialValue flows through
  if (typeof scenario.selectValue !== "undefined") {
    return Promise.resolve(scenario.selectValue);
  }
  return Promise.resolve(opts ? opts.initialValue : undefined);
};
stub.text = (opts) => {
  record.prompts.push({ kind: "text", message: opts && opts.message });
  const value = opts && opts.initialValue ? opts.initialValue : "";
  // run the prompt's validate closure like real clack would, and record the
  // outcome so its branch coverage counts
  if (opts && typeof opts.validate === "function") {
    record.validations.push({
      message: opts.message,
      result: opts.validate(value),
    });
  }
  return Promise.resolve(value);
};
stub.multiselect = (opts) => {
  record.prompts.push({ kind: "multiselect", message: opts && opts.message });
  return Promise.resolve((opts && opts.initialValues) || []);
};
stub.confirm = (opts) => {
  record.prompts.push({ kind: "confirm", message: opts && opts.message });
  return Promise.resolve(Boolean(opts && opts.initialValue));
};
stub.isCancel = () => false;

// utils: no network, no global installs, deterministic registry responses
const utils = require(path.join(repoRoot, "src", "lib", "utils.js"));
utils.exec = async (cmd) => {
  if (scenario.gitError && String(cmd).indexOf("git") !== -1) {
    throw new Error("git not configured");
  }
  if (scenario.registryError) {
    throw new Error("network unreachable");
  }
  return { stdout: (scenario.registryValue || "9.9.9") + "\n", stderr: "" };
};
utils.runCommand = async (cmd, args = [], cmdOpts) =>
  utils.exec([cmd].concat(args).join(" "), cmdOpts);
utils.interactiveExec = async (cmd, args) => {
  recordHandler("interactiveExec", { cmd: cmd, args: args });
};

// dispatch targets: record instead of running real program logic
const site = require(path.join(repoRoot, "src", "lib", "programs", "site.js"));
const webcomponent = require(
  path.join(repoRoot, "src", "lib", "programs", "webcomponent.js"),
);
const party = require(
  path.join(repoRoot, "src", "lib", "programs", "party.js"),
);
const skills = require(
  path.join(repoRoot, "src", "lib", "programs", "skills.js"),
);
const auditSchema = require(
  path.join(repoRoot, "src", "lib", "programs", "audit-schema.js"),
);
const statements = require(path.join(repoRoot, "src", "lib", "statements.js"));

site.siteProcess = async (commandRun, project) => {
  recordHandler("siteProcess", {
    command: commandRun.command,
    options: commandRun.options,
    project: project,
  });
};
site.siteCommandDetected = async (commandRun) => {
  recordHandler("siteCommandDetected", {
    command: commandRun.command,
    program: commandRun.program,
    options: commandRun.options,
  });
};
webcomponent.webcomponentProcess = async (commandRun, project) => {
  recordHandler("webcomponentProcess", {
    command: commandRun.command,
    options: commandRun.options,
    project: project,
  });
};
webcomponent.webcomponentCommandDetected = async (commandRun, packageData) => {
  recordHandler("webcomponentCommandDetected", {
    command: commandRun.command,
    options: commandRun.options,
    packageData: packageData ? { name: packageData.name } : null,
  });
};
webcomponent.elementsSearchCommand = async (commandRun) => {
  recordHandler("elementsSearchCommand", { options: commandRun.options });
};
party.partyCommandDetected = async (commandRun) => {
  recordHandler("partyCommandDetected", { options: commandRun.options });
};
skills.skillsCommandDetected = async (commandRun) => {
  recordHandler("skillsCommandDetected", {
    arguments: commandRun.arguments,
    options: commandRun.options,
  });
};
auditSchema.runAuditCommand = (commandRun, dddPath, schemaRoot, extra) => {
  recordHandler("runAuditCommandWith", {
    arguments: commandRun.arguments,
    options: commandRun.options,
    dddPath: dddPath || null,
    schemaRoot: schemaRoot,
    hasDDDAudit: Boolean(extra && typeof extra.auditDDD === "function"),
  });
};
statements.haxIntro = async () => {
  recordHandler("haxIntro", {});
};
statements.communityStatement = () => {
  recordHandler("communityStatement", {});
};

// systemStructureContext is captured as a const at create.js load time, so
// this must be patched before create.js is required
const haxcmsLib = require("@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js");
haxcmsLib.systemStructureContext = async () =>
  scenario.siteContext ? { name: "driver-site" } : null;

// record exit codes; the throw unwinds into main().catch(console.error)
const originalExit = process.exit;
process.exit = (code) => {
  record.exitCodes.push(code);
  setTimeout(resolveDone, 100);
  throw new Error("__driver_exit__");
};

process.argv = [process.argv[0], "hax"].concat(argv);
// pretend to be a TTY so main() keeps interactive prompts enabled; the clack
// stubs answer them deterministically. Clear CI too: main() treats CI=true as
// non-interactive (haxtheweb/issues#3116), and GitHub Actions sets it.
if (scenario.tty) {
  process.stdout.isTTY = true;
  delete process.env.CI;
}

// requiring create.js kicks off main(); every scenario ends via an exit
// sentinel or a recorded handler, or the hard timeout below
require(path.join(repoRoot, "src", "create.js"));

const hardTimeout = new Promise((resolve) => {
  // handler-less, exit-less scenarios (e.g. up-to-date update check) settle
  // here; every stub resolves within milliseconds so this stays short
  setTimeout(() => resolve("timeout"), 4000);
});
let printed = false;
const printRecord = () => {
  if (printed) {
    return;
  }
  printed = true;
  fs.writeSync(1, "__HAX_CLI_DRIVER_JSON__" + JSON.stringify(record) + "\n");
};
Promise.race([done, hardTimeout]).then(() => {
  printRecord();
  process.exit = originalExit;
  originalExit(0);
});

// safety net: if the child ends before the race settles, still emit the record
process.on("exit", printRecord);
