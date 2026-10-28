import * as p from "@clack/prompts";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import color from "picocolors";
import { auditI18nCommand } from "./audit-i18n.js";
import { auditSsrCommand } from "./audit-ssr.js";
import { t } from "../i18n.js";

/**
 * Schema audits: "is this built correctly for HAX?" checks backed by the
 * validators published from the HAX schema repositories. Each validator is
 * resolved from a local install (the audited project, then the CLI itself)
 * and otherwise run through `npx -p <package>`. Nothing is run through a
 * shell; file paths are passed as arguments.
 */
export const SCHEMA_VALIDATORS = {
  site: {
    label: "HAXcms site.json (JSON Outline Schema)",
    labelKey: "auditSchemaLabelSite",
    pkg: "@haxtheweb/json-outline-schema-spec",
    bin: "jos-validate",
    args: ["--type", "site"],
  },
  skeleton: {
    label: "HAXcms site skeletons",
    labelKey: "auditSchemaLabelSkeleton",
    pkg: "@haxtheweb/json-outline-schema-spec",
    bin: "jos-validate",
    args: ["--type", "skeleton"],
  },
  haxProperties: {
    label: "haxProperties (element HAX integration)",
    labelKey: "auditSchemaLabelHaxProperties",
    pkg: "@haxtheweb/hax-schema",
    bin: "haxproperties-validate",
    args: [],
  },
  demoSchema: {
    label: "demoSchema entries (HAXElementSchema)",
    labelKey: "auditSchemaLabelDemoSchema",
    pkg: "@haxtheweb/hax-element-schema",
    bin: "hax-element-validate",
    args: [],
  },
  appstore: {
    label: "appstore payloads",
    labelKey: "auditSchemaLabelAppstore",
    pkg: "@haxtheweb/appstore-spec",
    bin: "appstore-validate",
    args: [],
  },
  merlin: {
    label: "Merlin commands in JS source",
    labelKey: "auditSchemaLabelMerlin",
    pkg: "@haxtheweb/merlin-schema",
    bin: "merlin-validate",
    args: ["--scan"],
  },
  plugin: {
    label: "HAXcms plugins (plugin.yaml and registries)",
    labelKey: "auditSchemaLabelPlugin",
    pkg: "@haxtheweb/haxcms-plugin-spec",
    bin: "hax-plugin-validate",
    args: [],
  },
};

/**
 * @description Write all of `text` to stdout synchronously. writeSync on a
 * pipe can write partially (or throw EAGAIN when stdout is non-blocking),
 * so loop until every byte is out.
 */
function writeAllSync(text) {
  const buf = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buf.length) {
    try {
      offset += writeSync(1, buf, offset, buf.length - offset);
    } catch (e) {
      if (e.code !== "EAGAIN") {
        throw e;
      }
    }
  }
}

// build output and test fixtures (tests deliberately register invalid data)
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "public",
  "coverage",
  ".vercel",
  ".netlify",
  "test",
  "tests",
  "__tests__",
]);

/**
 * @description Walk a project and group the files each validator should check.
 * @param root directory to audit
 * @returns {{site: string[], skeleton: string[], haxProperties: string[], demoSchema: string[], appstore: string[], merlin: string[], plugin: string[]}}
 */
export function discoverSchemaTargets(root) {
  const targets = {
    site: [],
    skeleton: [],
    haxProperties: [],
    demoSchema: [],
    appstore: [],
    merlin: [],
    plugin: [],
  };
  const rootSite = path.join(root, "site.json");
  if (existsSync(rootSite)) {
    targets.site.push(rootSite);
  }
  const walk = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(name)) {
          walk(full);
        }
        continue;
      }
      // base schemas are <tag>.haxProperties.json; editor-locale overlays are
      // locales/<tag>.haxProperties.<lang>.json
      if (
        name.endsWith(".haxProperties.json") ||
        (path.basename(dir) === "locales" &&
          /\.haxProperties\.[A-Za-z-]+\.json$/.test(name))
      ) {
        targets.haxProperties.push(full);
        if (path.basename(dir) !== "locales") {
          targets.demoSchema.push(full);
        }
      } else if (name === "appstore.json") {
        targets.appstore.push(full);
      } else if (name === "plugin.yaml") {
        // HAXcms plugin manifest; the plugin validator also checks its registries
        targets.plugin.push(full);
      } else if (name.endsWith(".json") && path.basename(dir) === "skeletons") {
        targets.skeleton.push(full);
      } else if (
        /\.(m?js)$/.test(name) &&
        !name.endsWith(".min.js") &&
        fileMentions(full, "defineOption(")
      ) {
        targets.merlin.push(full);
      }
    }
  };
  walk(root);
  return targets;
}

function fileMentions(file, needle) {
  try {
    return readFileSync(file, "utf8").includes(needle);
  } catch {
    return false;
  }
}

/**
 * @description Find a locally installed validator bin for a package.
 * @returns absolute path to the bin script, or null
 */
export function resolveLocalValidator(pkg, bin, searchFrom = []) {
  for (const from of searchFrom) {
    try {
      const req = createRequire(from);
      const pkgJsonPath = req.resolve(`${pkg}/package.json`);
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      const binRel =
        typeof pkgJson.bin === "string"
          ? pkgJson.bin
          : pkgJson.bin && pkgJson.bin[bin];
      if (binRel) {
        return path.join(path.dirname(pkgJsonPath), binRel);
      }
    } catch {
      // not installed relative to this location
    }
  }
  return null;
}

/**
 * @description Run one validator over a list of files and return its JSON report.
 * @returns {{ok: boolean, reports?: object[], error?: string, via?: string}}
 */
export function runValidator(
  kind,
  files,
  { root = process.cwd(), spawn = spawnSync } = {},
) {
  const v = SCHEMA_VALIDATORS[kind];
  const searchFrom = [
    path.join(root, "noop.js"),
    process.argv[1] || path.join(process.cwd(), "noop.js"),
  ];
  const local = resolveLocalValidator(v.pkg, v.bin, searchFrom);
  const args = ["--json", ...v.args, ...files];
  const result = local
    ? spawn(process.execPath, [local, ...args], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      })
    : spawn(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["--yes", "-p", v.pkg, v.bin, ...args],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      );
  const via = local ? "local" : "npx";
  if (result.error) {
    return { ok: false, via, error: result.error.message };
  }
  try {
    const reports = JSON.parse(result.stdout);
    return {
      ok: true,
      via,
      reports: Array.isArray(reports) ? reports : [reports],
    };
  } catch {
    if (!local) {
      return {
        ok: false,
        via,
        error: `could not run ${v.pkg} through npx (offline or not published?). Install it with: npm i -D ${v.pkg}`,
      };
    }
    const detail = (result.stderr || result.stdout || "")
      .trim()
      .split("\n")
      .slice(-2)
      .join(" ");
    return {
      ok: false,
      via,
      error: `${v.pkg} did not return a JSON report (${detail || "no output"})`,
    };
  }
}

/**
 * @description `hax audit schema`: validate every HAX schema document found under a path.
 * @param commandRun CLI state; options.strict treats warnings as failures, options.format === 'json' prints a JSON summary
 * @param root directory to audit (defaults to cwd)
 * @param deps injectable runner for tests
 * @returns {{passed: boolean, results: object}} (does not exit the process)
 */
export function auditSchemaCommand(commandRun, root = null, deps = {}) {
  const options = (commandRun && commandRun.options) || {};
  const projectRoot = root || process.cwd();
  const run = deps.runValidator || runValidator;
  const asJson = options.format === "json";
  const strict = !!options.strict;
  const targets = discoverSchemaTargets(projectRoot);
  const results = {};
  let passed = true;
  // error / warning tags, padded so report lines stay aligned
  const errorTag = t("auditSchemaErrorTag");
  const warningTag = t("auditSchemaWarningTag");
  const tagPad = (tag) =>
    " ".repeat(
      Math.max(
        1,
        Math.max(errorTag.length, warningTag.length) + 1 - tag.length,
      ),
    );
  if (!asJson) {
    p.intro(
      `${color.bgBlack(` 🔎 ${t("auditSchemaStart", { path: color.underline(color.bold(color.yellow(projectRoot))) })} `)}`,
    );
  }
  const kinds = Object.keys(SCHEMA_VALIDATORS).filter(
    (k) => targets[k].length > 0,
  );
  if (kinds.length === 0) {
    if (!asJson) {
      p.note(t("auditSchemaNothingFound"));
    }
  }
  for (const kind of kinds) {
    const outcome = run(kind, targets[kind], { root: projectRoot });
    let errors = 0;
    let warnings = 0;
    if (outcome.ok) {
      for (const r of outcome.reports) {
        errors += (r.errors || []).length;
        warnings += (r.warnings || []).length;
      }
    } else {
      errors = 1;
    }
    const kindPassed = errors === 0 && (!strict || warnings === 0);
    passed = passed && kindPassed;
    results[kind] = {
      files: targets[kind].length,
      errors,
      warnings,
      passed: kindPassed,
      ...outcome,
    };
    if (!asJson) {
      const label = t(SCHEMA_VALIDATORS[kind].labelKey);
      if (!outcome.ok) {
        p.log.error(
          t("auditSchemaValidatorFailed", { label, error: outcome.error }),
        );
        continue;
      }
      const head = t("auditSchemaSummary", {
        label,
        files: targets[kind].length,
        errors,
        warnings,
      });
      if (kindPassed) {
        p.log.success(head);
      } else {
        p.log.error(head);
      }
      for (const r of outcome.reports) {
        const rel = path.relative(projectRoot, r.file || "") || r.file;
        for (const e of r.errors || []) {
          p.log.message(
            `${color.red(errorTag)}${tagPad(errorTag)}${rel} ${e.path}: ${e.message}`,
          );
        }
        // HAXcms plugins: derived tags (needs-server, runs-commands, ...) carry
        // security and longevity implications, so they are always shown
        if (Array.isArray(r.derivedTags) && r.derivedTags.length > 0) {
          p.log.info(
            t("auditSchemaDerivedTags", {
              file: rel,
              tags: r.derivedTags.join(", "),
            }),
          );
        }
        if (options.debug || strict) {
          for (const w of r.warnings || []) {
            p.log.message(
              `${color.yellow(warningTag)}${tagPad(warningTag)}${rel} ${w.path}: ${w.message}`,
            );
          }
        }
      }
    }
  }
  if (asJson) {
    const summary = {};
    for (const [kind, r] of Object.entries(results)) {
      summary[kind] = {
        files: r.files,
        errors: r.errors,
        warnings: r.warnings,
        passed: r.passed,
        via: r.via,
        error: r.error,
        reports: r.reports,
      };
    }
    // synchronous write: the caller exits right after, and an async
    // console.log to a pipe would be truncated at the pipe buffer size
    const out = deps.write || writeAllSync;
    out(JSON.stringify({ passed, strict, results: summary }, null, 2) + "\n");
  } else {
    p.outro(
      passed
        ? `🎉 ${t("auditSchemaPassed")}`
        : t("auditSchemaProblems", {
            debug: color.cyan("--debug"),
            strict: color.cyan("--strict"),
          }),
    );
  }
  return { passed, results };
}

/**
 * @description Entry point for `hax audit [type]`; exits with 0 (compliant) or 1.
 * @param commandRun CLI state; commandRun.arguments.type is ddd (default), schema, i18n, ssr or all
 * @param dddPath directory for the DDD audit (null = cwd)
 * @param schemaRoot directory for the schema audit
 * @param deps injectable { auditDDD, auditSchema, exit } for tests
 */
export function runAuditCommand(commandRun, dddPath, schemaRoot, deps = {}) {
  const type = (commandRun.arguments && commandRun.arguments.type) || "ddd";
  const exit = deps.exit || ((code) => process.exit(code));
  const auditDDD = deps.auditDDD;
  const auditSchema = deps.auditSchema || auditSchemaCommand;
  const auditI18n = deps.auditI18n || auditI18nCommand;
  const auditSsr = deps.auditSsr || auditSsrCommand;
  if (type === "ddd") {
    // DDD audit keeps its existing behavior, including exiting itself
    return auditDDD(commandRun, dddPath);
  }
  if (type === "schema") {
    const r = auditSchema(commandRun, schemaRoot);
    return exit(r.passed ? 0 : 1);
  }
  if (type === "i18n") {
    const r = auditI18n(commandRun, schemaRoot);
    return exit(r.passed ? 0 : 1);
  }
  if (type === "ssr") {
    // a coverage report, not a check: only fails when it can't run (and is
    // not part of "all"). Async because it renders in a child process.
    return Promise.resolve(auditSsr(commandRun, schemaRoot)).then((r) =>
      exit(r.passed ? 0 : 1),
    );
  }
  if (type === "all") {
    const dddPassed = auditDDD(commandRun, dddPath, false);
    const r = auditSchema(commandRun, schemaRoot);
    const i18n = auditI18n(commandRun, schemaRoot);
    return exit(dddPassed && r.passed && i18n.passed ? 0 : 1);
  }
  console.error(color.red(t("auditUnknownType", { type })));
  return exit(1);
}
