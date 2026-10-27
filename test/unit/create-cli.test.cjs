"use strict";
// End-to-end coverage of src/create.js main() dispatch.
//
// create.js self-executes main() at require time and exits deep inside
// commander flows, so each scenario runs in a child process via
// test/_helpers/create-cli-driver.cjs (isolated HOME/cwd, stubbed handlers,
// deterministic clack answers). The driver prints a __HAX_CLI_DRIVER_JSON__
// record on fd 1. Covered here: --version/--help output, unknown-command
// rejection, the no-TTY/CI --no-i implication (haxtheweb/issues#3116),
// dispatch of site/webcomponent(wc alias)/audit/party/skills/update/serve
// with their recorded payloads, monorepo and _sites detection, the registry
// search exit path (haxtheweb/issues#3119), --y update auto-install, and the
// validation error exits (--npm-client, --root, --path, --theme, name rules).
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const packageJson = require("../../package.json");
const DRIVER = path.join(__dirname, "..", "_helpers", "create-cli-driver.cjs");
const PREFIX = "__HAX_CLI_DRIVER_JSON__";

const skipReason = fs.existsSync(
  path.join(__dirname, "..", "..", "src", "create.js"),
)
  ? false
  : "src/create.js not available";
const opts = { skip: skipReason, timeout: 90000 };

const YNI = ["--y", "--no-i", "--quiet"];

function runScenario(scenario) {
  const res = spawnSync(process.execPath, [DRIVER, JSON.stringify(scenario)], {
    cwd: path.join(__dirname, "..", ".."),
    encoding: "utf8",
    timeout: 60000,
  });
  const line = String(res.stdout || "")
    .split("\n")
    .find((l) => l.startsWith(PREFIX));
  if (!line) {
    return {
      failed: true,
      detail:
        "driver produced no record; stdout=" +
        String(res.stdout || "").slice(0, 400) +
        " stderr=" +
        String(res.stderr || "").slice(0, 400),
    };
  }
  return { failed: false, record: JSON.parse(line.slice(PREFIX.length)) };
}

function handlerCount(record) {
  return Object.values(record.handlers || {}).reduce(
    (sum, list) => sum + list.length,
    0,
  );
}

test("--version prints the package version and exits 0", opts, () => {
  const { failed, record, detail } = runScenario({ argv: ["--version"] });
  assert.ok(!failed, detail);
  assert.deepEqual(record.exitCodes, [0]);
  assert.ok(record.stdout.join("").includes(packageJson.version));
  assert.equal(handlerCount(record), 0);
});

test("--help prints usage and exits 0", opts, () => {
  const { failed, record, detail } = runScenario({ argv: ["--help"] });
  assert.ok(!failed, detail);
  assert.deepEqual(record.exitCodes, [0]);
  assert.ok(record.stdout.join("").includes("Usage"));
  assert.equal(handlerCount(record), 0);
});

test("unknown commands are rejected with exit 1", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["definitely-not-a-real-command"],
  });
  assert.ok(!failed, detail);
  assert.deepEqual(record.exitCodes, [1]);
  assert.match(record.stderr.join(""), /unknown command/i);
  assert.equal(handlerCount(record), 0);
});

test("start with --no-i --quiet exits non-interactively", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["start", "--no-i", "--quiet"],
  });
  assert.ok(!failed, detail);
  assert.deepEqual(record.exitCodes, [0]);
  assert.equal(handlerCount(record), 0);
});

test("no TTY implies --no-i with a stderr notice (issues#3116)", opts, () => {
  const { failed, record, detail } = runScenario({ argv: ["start", "--y"] });
  assert.ok(!failed, detail);
  assert.ok(
    record.stderr.join("").includes("no interactive terminal"),
    "expected the no-TTY notice on stderr",
  );
  assert.deepEqual(record.exitCodes, [0]);
  assert.equal(handlerCount(record), 0);
});

test(
  "site <name> --y dispatches siteProcess with a resolved project",
  opts,
  () => {
    const { failed, record, detail } = runScenario({
      argv: ["site", "mysite"].concat(YNI),
    });
    assert.ok(!failed, detail);
    assert.equal(record.handlers.siteProcess.length, 1);
    const payload = record.handlers.siteProcess[0];
    assert.equal(payload.command, "site");
    assert.equal(payload.project.type, "site");
    assert.equal(payload.project.name, "mysite");
    assert.equal(payload.project.siteCreationMode, "scratch");
    assert.equal(typeof payload.project.theme, "string");
    assert.equal(payload.project.path, record.cwd);
    assert.deepEqual(record.exitCodes, [0]);
    assert.equal(
      record.prompts.length,
      0,
      "--y must not prompt during site creation",
    );
  },
);

test("webcomponent <name> --y dispatches webcomponentProcess", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["webcomponent", "my-element"].concat(YNI),
  });
  assert.ok(!failed, detail);
  assert.equal(record.handlers.webcomponentProcess.length, 1);
  const payload = record.handlers.webcomponentProcess[0];
  assert.equal(payload.project.type, "webcomponent");
  assert.equal(payload.project.name, "my-element");
  assert.equal(payload.project.template, "compliant");
  assert.deepEqual(record.exitCodes, [0]);
});

test("the wc alias routes to the webcomponent program", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["wc", "my-el"].concat(YNI),
  });
  assert.ok(!failed, detail);
  assert.equal(record.handlers.webcomponentProcess.length, 1);
  assert.equal(record.handlers.webcomponentProcess[0].project.name, "my-el");
  assert.deepEqual(record.exitCodes, [0]);
});

test(
  "audit defaults to the ddd type and passes the cwd as schemaRoot",
  opts,
  () => {
    const { failed, record, detail } = runScenario({
      argv: ["audit"].concat(YNI),
    });
    assert.ok(!failed, detail);
    assert.equal(record.handlers.runAuditCommandWith.length, 1);
    const payload = record.handlers.runAuditCommandWith[0];
    assert.equal(payload.arguments.type, "ddd");
    assert.equal(payload.dddPath, null);
    assert.equal(payload.schemaRoot, record.cwd);
    assert.equal(payload.hasDDDAudit, true);
    assert.deepEqual(record.exitCodes, []);
  },
);

test("audit schema --format json forwards type and format", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["audit", "schema", "--format", "json"].concat(YNI),
  });
  assert.ok(!failed, detail);
  const payload = record.handlers.runAuditCommandWith[0];
  assert.equal(payload.arguments.type, "schema");
  assert.equal(payload.options.format, "json");
});

test("party falls back to the configured author", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["party"].concat(YNI),
  });
  assert.ok(!failed, detail);
  assert.equal(record.handlers.partyCommandDetected.length, 1);
  assert.equal(record.handlers.partyCommandDetected[0].options.author, "9.9.9");
  assert.deepEqual(record.exitCodes, []);
});

test("skills install --all forwards action and flags", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["skills", "install", "--all"].concat(YNI),
  });
  assert.ok(!failed, detail);
  assert.equal(record.handlers.skillsCommandDetected.length, 1);
  const payload = record.handlers.skillsCommandDetected[0];
  assert.equal(payload.arguments.action, "install");
  assert.equal(payload.options.all, true);
  assert.deepEqual(record.exitCodes, []);
});

test(
  "update --y installs a newer published version automatically",
  opts,
  () => {
    const { failed, record, detail } = runScenario({
      argv: ["update"].concat(YNI),
      registryValue: "999.999.999",
    });
    assert.ok(!failed, detail);
    assert.equal(record.handlers.interactiveExec.length, 1);
    assert.equal(record.handlers.interactiveExec[0].cmd, "npm");
    assert.deepEqual(record.handlers.interactiveExec[0].args, [
      "install",
      "--global",
      "@haxtheweb/create",
    ]);
    assert.deepEqual(record.exitCodes, []);
  },
);

test(
  "update reports up-to-date without installing when versions match",
  opts,
  () => {
    const { failed, record, detail } = runScenario({
      argv: ["update", "--no-i"],
      registryValue: packageJson.version,
    });
    assert.ok(!failed, detail);
    assert.equal(record.handlers.interactiveExec, undefined);
    assert.ok(record.intros.join(" ").includes("is up to date"));
  },
);

test("serve inside a haxcms site dispatches siteCommandDetected", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["serve"].concat(YNI),
    siteContext: true,
  });
  assert.ok(!failed, detail);
  assert.equal(record.handlers.siteCommandDetected.length, 1);
  const payload = record.handlers.siteCommandDetected[0];
  assert.equal(payload.program, "serve");
  assert.equal(payload.options.skip, true);
  assert.deepEqual(record.exitCodes, []);
});

test("running inside a haxcms multisite sets the _sites path", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["site", "mysite"].concat(YNI),
    dirs: ["_sites"],
  });
  assert.ok(!failed, detail);
  assert.equal(record.handlers.siteProcess.length, 1);
  assert.equal(
    record.handlers.siteProcess[0].project.path,
    record.cwd + "/_sites",
  );
});

test("a monorepo package.json triggers webcomponent defaults", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["webcomponent", "my-element", "--y", "--no-i"],
    dirs: ["elements"],
    files: {
      "package.json": {
        name: "monorepo-fixture",
        hax: { cli: true },
        npmClient: "pnpm",
        useWorkspaces: true,
        workspaces: { packages: ["elements/*"] },
        author: { name: "Test Author" },
        repository: { url: "https://github.com/haxtheweb/monorepo-fixture" },
        scripts: { start: "yarn run dev" },
        customElements: "custom-elements.json",
      },
    },
  });
  assert.ok(!failed, detail);
  assert.equal(record.handlers.webcomponentCommandDetected.length, 1);
  const payload = record.handlers.webcomponentCommandDetected[0];
  assert.equal(payload.command, "webcomponent");
  assert.equal(payload.options.isMonorepo, true);
  assert.equal(payload.options.template, "monorepo");
  assert.equal(payload.options.path, record.cwd + "/elements");
  assert.ok(
    record.intros.join(" ").includes("Monorepo detected"),
    "expected the monorepo intro banner",
  );
  assert.equal(record.handlers.webcomponentProcess, undefined);
  // the monorepo branch dispatches straight from the command chain and never
  // reaches the interactive loop, so no exit code is recorded
  assert.deepEqual(record.exitCodes, []);
});

test("invalid --npm-client values are rejected before any work", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["site", "mysite"].concat(YNI, ["--npm-client", "rm -rf /"]),
  });
  assert.ok(!failed, detail);
  assert.deepEqual(record.exitCodes, [1]);
  assert.ok(record.stderr.join("").includes("Invalid --npm-client"));
  assert.equal(handlerCount(record), 0);
});

test("a missing --root directory exits with an error", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["site", "mysite"].concat(YNI, [
      "--root",
      "/definitely-not-here-xyz",
    ]),
  });
  assert.ok(!failed, detail);
  // the sentinel exit lands inside the validation try/catch, which calls
  // program.error a second time; the first recorded exit is the rejection
  assert.equal(record.exitCodes[0], 1);
  assert.ok(record.stderr.join("").length > 0);
  assert.equal(handlerCount(record), 0);
});

test("a missing --path directory exits with an error", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["site", "mysite"].concat(YNI, [
      "--path",
      "/definitely-not-here-xyz",
    ]),
  });
  assert.ok(!failed, detail);
  assert.equal(record.exitCodes[0], 1);
  assert.equal(handlerCount(record), 0);
});

test("an unknown --theme exits with an error", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["site", "mysite"].concat(YNI, ["--theme", "not-a-real-theme"]),
  });
  assert.ok(!failed, detail);
  assert.deepEqual(record.exitCodes, [1]);
  assert.equal(handlerCount(record), 0);
});

test("element names with special characters are rejected", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["webcomponent", "my element"].concat(YNI),
  });
  assert.ok(!failed, detail);
  assert.deepEqual(record.exitCodes, [1]);
  assert.equal(handlerCount(record), 0);
});

test(
  "site without a name in non-interactive mode exits with an error",
  opts,
  () => {
    const { failed, record, detail } = runScenario({
      argv: ["site"].concat(YNI),
    });
    assert.ok(!failed, detail);
    assert.deepEqual(record.exitCodes, [1]);
    assert.equal(handlerCount(record), 0);
  },
);

test("wc --search delegates to the registry search and exits", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["wc", "my-el", "--search", "icon"].concat(YNI),
  });
  assert.ok(!failed, detail);
  assert.equal(record.handlers.elementsSearchCommand.length, 1);
  assert.equal(record.handlers.elementsSearchCommand[0].options.search, "icon");
  assert.deepEqual(record.exitCodes, [0]);
});

// --- interactive (TTY) flows: the clack stub answers every prompt ---

test("interactive start menus into a webcomponent build", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["start"],
    tty: true,
  });
  assert.ok(!failed, detail);
  assert.equal(record.handlers.webcomponentProcess.length, 1);
  const payload = record.handlers.webcomponentProcess[0];
  assert.equal(payload.project.type, "webcomponent");
  assert.equal(payload.project.name, "my-element");
  assert.equal(payload.project.template, "compliant");
  assert.equal(payload.project.org, "@yourOrganization");
  assert.equal(payload.project.path, record.cwd);
  // menu select + path/name/org/author text prompts + template select + extras
  const kinds = record.prompts.map((p) => p.kind);
  assert.ok(kinds.includes("select"), "expected the main menu select");
  assert.ok(kinds.includes("text"), "expected path/name/org prompts");
  assert.ok(kinds.includes("multiselect"), "expected the extras multiselect");
  // every prompt validate closure ran and accepted the stubbed answers
  assert.ok(record.validations.length >= 2);
  record.validations.forEach((v) => {
    assert.equal(v.result, undefined, "validation failed: " + v.message);
  });
  assert.deepEqual(record.exitCodes, [0]);
});

test(
  "interactive site creation prompts for mode, theme and language",
  opts,
  () => {
    const { failed, record, detail } = runScenario({
      argv: ["site"],
      tty: true,
    });
    assert.ok(!failed, detail);
    assert.equal(record.handlers.siteProcess.length, 1);
    const payload = record.handlers.siteProcess[0];
    assert.equal(payload.project.name, "mysite");
    assert.equal(payload.project.siteCreationMode, "scratch");
    assert.equal(payload.project.theme, "clean-one");
    assert.equal(payload.project.siteLang, "en");
    const messages = record.prompts.map((p) => p.kind);
    assert.ok(messages.includes("select"));
    assert.deepEqual(record.exitCodes, [0]);
  },
);

test(
  "selecting custom-theme prompts for a theme name and template",
  opts,
  () => {
    const { failed, record, detail } = runScenario({
      argv: ["site"],
      tty: true,
      selectValue: "custom-theme",
    });
    assert.ok(!failed, detail);
    assert.equal(record.handlers.siteProcess.length, 1);
    const payload = record.handlers.siteProcess[0];
    assert.equal(payload.project.theme, "custom-theme");
    assert.equal(payload.project.customThemeName, "custom-mysite-theme");
    assert.equal(payload.project.customThemeTemplate, "custom-theme");
    // the custom theme name validate closure ran and accepted the name
    const nameValidation = record.validations.find(
      (v) => String(v.message || "").length > 0 && v.result === undefined,
    );
    assert.ok(
      record.validations.length >= 1,
      "expected a custom theme validate",
    );
    assert.ok(nameValidation, "expected an accepted validation result");
    assert.deepEqual(record.exitCodes, [0]);
  },
);

test("a name already in the wc-registry is rejected with exit 1", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["webcomponent", "d-d-d"].concat(YNI),
  });
  assert.ok(!failed, detail);
  assert.deepEqual(record.exitCodes, [1]);
  assert.ok(
    record.stderr.join("").includes("wc-registry"),
    "expected the registry rejection message",
  );
  assert.equal(handlerCount(record), 0);
});

test(
  "an invalid --site-lang exits with an error naming the value",
  opts,
  () => {
    const { failed, record, detail } = runScenario({
      argv: ["site", "mysite"].concat(YNI, ["--site-lang", "not a lang"]),
    });
    assert.ok(!failed, detail);
    assert.deepEqual(record.exitCodes, [1]);
    assert.ok(record.stderr.join("").includes("not a lang"));
    assert.equal(handlerCount(record), 0);
  },
);

test("a stale last-run triggers the update-available notice", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["start", "--no-i"],
    oldLastRun: true,
    registryValue: "999.999.999",
  });
  assert.ok(!failed, detail);
  assert.ok(
    record.intros.join(" ").match(/updates available/i),
    "expected the updates available banner",
  );
  assert.ok(record.intros.join(" ").includes("999.999.999"));
  assert.deepEqual(record.exitCodes, [0]);
  // the start banner is expected; no dispatch handler may fire
  assert.deepEqual(Object.keys(record.handlers), ["haxIntro"]);
});

test("a git config failure is caught and does not break startup", opts, () => {
  const { failed, record, detail } = runScenario({
    argv: ["start", "--no-i", "--quiet"],
    gitError: true,
  });
  assert.ok(!failed, detail);
  assert.deepEqual(record.exitCodes, [0]);
  assert.equal(handlerCount(record), 0);
  assert.ok(
    !record.stderr.join("").includes("git not configured"),
    "the git failure must be swallowed, not surfaced",
  );
});
