"use strict";

// Covers src/lib/programs/plugin.js: the hook list (bundled snapshot of the spec's hook contracts), --hooks
// resolution, the grouped picker's preselected common hooks, and the scaffold (docblocks per hook, both runtimes, a
// passing first test). No prompts are shown: the pure functions are tested directly.
const { installClackStub } = require("../_helpers/clack-stub.cjs");
installClackStub();
require("@babel/register");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const plugin = require("../../src/lib/programs/plugin.js");

test("hook contracts load and mark common hooks", () => {
  const hooks = plugin.hookContracts();
  assert.ok(hooks.length > 50);
  const common = hooks.filter((h) => h.common).map((h) => h.name);
  assert.ok(common.includes("page.before.save"));
  assert.ok(common.includes("render.after.body"));
  assert.ok(!common.includes("transaction.before.end"));
});

test("--hooks resolves names and the common keyword, in contract order, and rejects unknown hooks", () => {
  const hooks = plugin.hookContracts();
  const r = plugin.resolveHooks("render.after.body,common", hooks);
  assert.equal(new Set(r).size, r.length);
  assert.ok(r.includes("render.after.body") && r.includes("page.before.save"));
  assert.deepEqual(plugin.resolveHooks("none", hooks), []);
  assert.throws(
    () => plugin.resolveHooks("page.before.sav", hooks),
    /Unknown hook/,
  );
});

test("the picker groups hooks by area and preselects exactly the common ones", () => {
  const hooks = plugin.hookContracts();
  const { options, initialValues } = plugin.hookPickerOptions(hooks);
  assert.ok(options.page && options.render && options.config);
  assert.deepEqual(
    [...initialValues].sort(),
    hooks
      .filter((h) => h.common)
      .map((h) => h.name)
      .sort(),
  );
  const save = options.page.find((o) => o.value === "page.before.save");
  assert.ok(save.hint.length > 10);
});

test("scaffold writes a docblock per hook in both runtimes and a passing first test", () => {
  const files = plugin.scaffoldPlugin({
    id: "quiet-hours",
    title: "Quiet hours",
    runtimes: ["nodejs", "php"],
    hooks: ["page.before.save", "render.after.body"],
  });
  assert.deepEqual(Object.keys(files).sort(), [
    "AGENTS.md",
    "README.md",
    "plugin.yaml",
    "src/nodejs/index.js",
    "src/php/Plugin.php",
    "tests/cases/quiet-hours.yaml",
  ]);
  assert.match(
    files["plugin.yaml"],
    /hooks:\n  - name: page.before.save\n  - name: render.after.body/,
  );
  assert.match(
    files["src/nodejs/index.js"],
    /\/\*\*\n     \* Implements hook page.before.save\.\n/,
  );
  assert.match(files["src/php/Plugin.php"], /class QuietHoursPlugin/);
  assert.match(
    files["src/php/Plugin.php"],
    /\* Implements hook render.after.body\.\n[\s\S]*public function renderAfterBody\(\$ctx\)/,
  );
  assert.match(
    files["tests/cases/quiet-hours.yaml"],
    /^- id: quiet-hours-001/m,
  );
  assert.throws(
    () => plugin.scaffoldPlugin({ id: "Bad_Id" }),
    /not a plugin id/,
  );
});

test("a pack has no code or tests, and writeScaffold refuses a non-empty folder", () => {
  const files = plugin.scaffoldPlugin({
    id: "my-pack",
    kind: "pack",
    hooks: ["page.before.save"],
  });
  assert.ok(
    !files["src/nodejs/index.js"] && !files["tests/cases/my-pack.yaml"],
  );
  assert.match(files["plugin.yaml"], /kind: pack/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-plugin-"));
  plugin.writeScaffold(path.join(dir, "a"), files);
  assert.ok(fs.existsSync(path.join(dir, "a", "plugin.yaml")));
  assert.throws(
    () => plugin.writeScaffold(path.join(dir, "a"), files),
    /not empty/,
  );
});

// hax plugin validate: which folders it checks, and how the spec validator's report becomes the answer.
// The validator itself (hax-plugin-validate) is injected, so no spec package needs to be installed here.
function pluginFolder(id) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-plugin-validate-"));
  plugin.writeScaffold(
    path.join(dir, id),
    plugin.scaffoldPlugin({ id, hooks: [] }),
  );
  return { root: dir, dir: path.join(dir, id) };
}

test("validate targets: a plugin folder, a plugin.yaml, or every plugin under a folder (fixtures skipped)", () => {
  const { root, dir } = pluginFolder("one-plugin");
  plugin.writeScaffold(
    path.join(root, "two-plugin"),
    plugin.scaffoldPlugin({ id: "two-plugin", hooks: [] }),
  );
  fs.mkdirSync(path.join(root, "tests", "fixtures", "bad"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "tests", "fixtures", "bad", "plugin.yaml"),
    "id: bad\n",
  );
  assert.deepEqual(plugin.pluginValidateTargets(dir), [dir]);
  assert.deepEqual(
    plugin.pluginValidateTargets(path.join(dir, "plugin.yaml")),
    [path.join(dir, "plugin.yaml")],
  );
  assert.deepEqual(
    plugin.pluginValidateTargets(root).sort(),
    [path.join(root, "one-plugin"), path.join(root, "two-plugin")].sort(),
  );
  assert.deepEqual(
    plugin.pluginValidateTargets(path.join(root, "missing")),
    [],
  );
});

test("validate passes the folders to hax-plugin-validate and answers valid, invalid or strict", () => {
  const { dir } = pluginFolder("checked-plugin");
  const calls = [];
  const fake = (reports) => (kind, files) => {
    calls.push({ kind, files });
    return { ok: true, via: "local", reports };
  };
  const quiet = { options: { format: "json" }, arguments: { name: dir } };
  const realWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    let r = plugin.validatePlugins(quiet, {
      runValidator: fake([
        {
          file: path.join(dir, "plugin.yaml"),
          errors: [],
          warnings: [],
          derivedTags: ["not-stable"],
        },
      ]),
    });
    assert.equal(r.valid, true);
    assert.deepEqual(r.plugins[0].tags, ["not-stable"]);
    assert.deepEqual(calls[0], { kind: "plugin", files: [dir] });
    assert.notEqual(process.exitCode, 1);

    r = plugin.validatePlugins(quiet, {
      runValidator: fake([
        {
          file: path.join(dir, "plugin.yaml"),
          errors: [{ path: "/id", message: "must equal the folder name" }],
          warnings: [],
        },
      ]),
    });
    assert.equal(r.valid, false);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;

    const warned = [
      {
        file: path.join(dir, "plugin.yaml"),
        errors: [],
        warnings: ["no screenshots"],
      },
    ];
    assert.equal(
      plugin.validatePlugins(quiet, { runValidator: fake(warned) }).valid,
      true,
    );
    assert.equal(
      plugin.validatePlugins(
        { options: { format: "json", strict: true }, arguments: { name: dir } },
        { runValidator: fake(warned) },
      ).valid,
      false,
    );
    process.exitCode = undefined;

    assert.throws(
      () =>
        plugin.validatePlugins(quiet, {
          runValidator: () => ({
            ok: false,
            error: "could not run @haxtheweb/haxcms-plugin-spec",
          }),
        }),
      /could not run/,
    );
  } finally {
    process.stdout.write = realWrite;
    process.exitCode = undefined;
  }
});
