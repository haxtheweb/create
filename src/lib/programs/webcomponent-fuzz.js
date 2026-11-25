import * as fs from "node:fs";
import * as path from "node:path";
import * as ejs from "ejs";
import * as p from "@clack/prompts";
import color from "picocolors";
import { t } from "../i18n.js";
import { dashToCamel } from "../utils.js";

/**
 * `hax webcomponent wc:fuzz`: write a starter property-based (fuzz) test for
 * an element that takes input (haxtheweb/issues#3386). The test follows the
 * HAX fuzz convention (haxtheweb/issues#3272): a fixed seed on every normal
 * run, HAX_FUZZ_SEED / HAX_FUZZ_RUNS / HAX_FUZZ_PATH to hunt or replay.
 *
 * In the webcomponents monorepo the shared helper and fast-check are already
 * there, so only the test file is written. A standalone element also gets
 * the helper, a web-test-runner config that passes the variables to the
 * browser, the fast-check devDependency and a `test:fuzz` script.
 */

// the fast-check release the HAX repos test with (MIT)
export const FAST_CHECK_VERSION = "4.10.2";

// the helper every element of the webcomponents monorepo shares
const MONOREPO_HELPER = path.join("scripts", "test-setup", "fuzz-config.mjs");

const WTR_CONFIG_NAMES = [
  "web-test-runner.config.mjs",
  "web-test-runner.config.js",
  "web-test-runner.config.cjs",
];

/**
 * @description A custom element name: lower case, starts with a letter, at
 * least one dash. Also the only thing that ends up in a file name here.
 */
export function isElementName(name) {
  return typeof name === "string" && /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name);
}

function unscoped(packageName) {
  const text = String(packageName || "");
  return text.includes("/") ? text.slice(text.lastIndexOf("/") + 1) : text;
}

// the monorepo root, when `dir` is one of its elements (elements/<name>)
function monorepoRootFor(dir) {
  let current = path.resolve(dir);
  for (let i = 0; i < 3; i++) {
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
    if (fs.existsSync(path.join(current, MONOREPO_HELPER))) {
      return current;
    }
  }
  return null;
}

function importPath(fromDir, file) {
  const relative = path.relative(fromDir, file).split(path.sep).join("/");
  return relative.startsWith(".") ? relative : "./" + relative;
}

// YYYYMMDD of the day the test is scaffolded: a seed that is fixed from then
// on and different from the next element's
export function seedForDate(date = new Date()) {
  return (
    date.getUTCFullYear() * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate()
  );
}

/**
 * @description Work out what the scaffold would write, without writing.
 * @param dir the element's folder
 * @param packageData its package.json, parsed
 * @param options { name, force, date }
 * @returns {{ok: boolean, error?: string, name?: string, files?: object[], packageChanges?: object, notes?: string[]}}
 */
export function planFuzzScaffold(dir, packageData = {}, options = {}) {
  const name = options.name || unscoped(packageData.name);
  if (!isElementName(name)) {
    return { ok: false, error: t("wcFuzzBadName", { name: String(name) }) };
  }
  if (!fs.existsSync(path.join(dir, `${name}.js`))) {
    return { ok: false, error: t("wcFuzzNoElement", { file: `${name}.js` }) };
  }
  const testDir = path.join(dir, "test");
  const monorepoRoot = monorepoRootFor(dir);
  const helper = monorepoRoot
    ? path.join(monorepoRoot, MONOREPO_HELPER)
    : path.join(testDir, "fuzz-config.js");
  const files = [];
  const notes = [];
  const add = (file, template, data) => {
    const exists = fs.existsSync(file);
    files.push({
      file,
      relative: path.relative(dir, file),
      template,
      data,
      // an existing file is only replaced with --force
      write: !exists || Boolean(options.force),
      exists,
    });
  };
  add(path.join(testDir, `${name}-fuzz.test.js`), "webcomponent-fuzz.test.js", {
    name,
    className: dashToCamel(name),
    fuzzConfigImport: importPath(testDir, helper),
    seed: seedForDate(options.date),
  });
  const packageChanges = { devDependencies: {}, scripts: {} };
  if (!monorepoRoot) {
    add(helper, "fuzz-config.js", null);
    const config = WTR_CONFIG_NAMES.find((file) =>
      fs.existsSync(path.join(dir, file)),
    );
    if (config) {
      // theirs stays as it is; without the variables in the page the fixed
      // seed still runs, only hunting and replaying need them
      notes.push(t("wcFuzzConfigExists", { file: config }));
    } else {
      add(
        path.join(dir, WTR_CONFIG_NAMES[0]),
        "web-test-runner.config.mjs",
        null,
      );
    }
    const has = (section) =>
      packageData[section] &&
      Object.prototype.hasOwnProperty.call(packageData[section], "fast-check");
    if (!has("dependencies") && !has("devDependencies")) {
      packageChanges.devDependencies["fast-check"] = FAST_CHECK_VERSION;
    }
    if (!packageData.scripts || !packageData.scripts["test:fuzz"]) {
      packageChanges.scripts["test:fuzz"] =
        'HAX_FUZZ_SEED=${HAX_FUZZ_SEED:-random} HAX_FUZZ_RUNS=${HAX_FUZZ_RUNS:-2000} web-test-runner "test/**/*-fuzz.test.js" --node-resolve';
    }
  }
  return {
    ok: true,
    name,
    dir,
    monorepo: Boolean(monorepoRoot),
    files,
    packageChanges,
    notes,
  };
}

/**
 * @description Write what planFuzzScaffold() planned.
 * @returns the relative paths written
 */
export function writeFuzzScaffold(plan, templatesRoot) {
  const written = [];
  for (const entry of plan.files) {
    if (!entry.write) {
      continue;
    }
    const source = fs.readFileSync(
      path.join(templatesRoot, "fuzz", entry.template),
      "utf8",
    );
    fs.mkdirSync(path.dirname(entry.file), { recursive: true });
    fs.writeFileSync(
      entry.file,
      entry.data ? ejs.render(source, entry.data) : source,
    );
    written.push(entry.relative);
  }
  const changes = plan.packageChanges;
  const packageFile = path.join(plan.dir, "package.json");
  if (
    fs.existsSync(packageFile) &&
    (Object.keys(changes.devDependencies).length ||
      Object.keys(changes.scripts).length)
  ) {
    const raw = fs.readFileSync(packageFile, "utf8");
    const data = JSON.parse(raw);
    for (const section of ["devDependencies", "scripts"]) {
      if (Object.keys(changes[section]).length) {
        data[section] = Object.assign({}, data[section], changes[section]);
      }
    }
    // keep the file's own indentation
    const indent = /^(\s+)"/m.exec(raw);
    fs.writeFileSync(
      packageFile,
      JSON.stringify(data, null, indent ? indent[1] : 2) + "\n",
    );
    written.push("package.json");
  }
  return written;
}

/**
 * @description The `wc:fuzz` action.
 * @returns {boolean} false when nothing could be scaffolded
 */
export function webcomponentFuzz(commandRun, packageData, deps = {}) {
  const options = (commandRun && commandRun.options) || {};
  const dir = deps.dir || process.cwd();
  const templatesRoot =
    deps.templatesRoot || path.join(__dirname, "../../templates");
  const plan = planFuzzScaffold(dir, packageData, {
    name: options.name,
    force: options.force,
  });
  if (!plan.ok) {
    p.log.error(color.red(plan.error));
    return false;
  }
  const quiet = Boolean(options.quiet);
  for (const entry of plan.files) {
    if (!entry.write && !quiet) {
      p.log.warn(t("wcFuzzExists", { file: entry.relative, flag: "--force" }));
    }
  }
  if (options.dryRun) {
    if (!quiet) {
      p.note(
        plan.files
          .filter((entry) => entry.write)
          .map((entry) => entry.relative)
          .concat(Object.keys(plan.packageChanges.devDependencies))
          .concat(Object.keys(plan.packageChanges.scripts))
          .join("\n"),
        t("wcFuzzDryRun"),
      );
    }
    return true;
  }
  const written = writeFuzzScaffold(plan, templatesRoot);
  if (!quiet) {
    for (const note of plan.notes) {
      p.log.info(note);
    }
    if (written.length) {
      p.note(written.join("\n"), t("wcFuzzWrote", { name: plan.name }));
    }
    p.log.info(
      plan.monorepo
        ? t("wcFuzzNextMonorepo", { command: color.bold("yarn test") })
        : t("wcFuzzNext", {
            install: color.bold("npm install"),
            test: color.bold("npm test"),
            hunt: color.bold("npm run test:fuzz"),
          }),
    );
  }
  return true;
}
