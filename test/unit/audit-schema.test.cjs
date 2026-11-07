"use strict";

// Covers src/lib/programs/audit-schema.js: target discovery, the schema
// audit report (pass / fail / --strict / --format json) with an injected
// validator runner, local validator resolution, and `hax audit [type]`
// routing. No validator packages are needed: runValidator is injected.
const { installClackStub } = require("../_helpers/clack-stub.cjs");
const stub = installClackStub();

require("@babel/register");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const logs = [];
stub.intro = (m) => logs.push(["intro", String(m)]);
stub.outro = (m) => logs.push(["outro", String(m)]);
stub.note = (m) => logs.push(["note", String(m)]);
stub.log = {
  success: (m) => logs.push(["success", String(m)]),
  error: (m) => logs.push(["error", String(m)]),
  message: (m) => logs.push(["message", String(m)]),
  warn: (m) => logs.push(["warn", String(m)]),
  info: (m) => logs.push(["info", String(m)]),
};

const {
  discoverSchemaTargets,
  auditSchemaCommand,
  runAuditCommand,
  resolveLocalValidator,
  runValidator,
  validatorNpxSpec,
  confirmNpxValidator,
  SCHEMA_VALIDATORS,
} = require("../../src/lib/programs/audit-schema.js");

function write(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(
    full,
    typeof content === "string" ? content : JSON.stringify(content),
  );
  return full;
}

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-audit-schema-"));
  write(root, "site.json", { id: "x", title: "x", items: [] });
  write(root, "_config/skeletons/course.json", {
    meta: {},
    site: {},
    build: { items: [] },
  });
  write(root, "custom/lib/my-el.haxProperties.json", {
    settings: { configure: [] },
  });
  write(root, "custom/locales/my-el.es.haxProperties.json", {});
  write(root, "custom/locales/my-el.haxProperties.fr.json", {});
  write(root, "custom/locales/my-el.fr.json", {});
  write(root, "appstore.json", { status: 200 });
  write(
    root,
    "custom/my-el.js",
    'SuperDaemonInstance.defineOption({ title: "x" })',
  );
  write(root, "custom/other.js", "export const nothing = 1");
  write(root, "node_modules/pkg/lib/ignored.haxProperties.json", {});
  write(root, "dist/appstore.json", {});
  write(root, "test/fixtures.test.js", "el.defineOption({ broken: true })");
  return root;
}

test("discoverSchemaTargets groups files by validator and skips build output", () => {
  const root = makeProject();
  try {
    const t = discoverSchemaTargets(root);
    const rel = (list) => list.map((f) => path.relative(root, f)).sort();
    assert.deepEqual(rel(t.site), ["site.json"]);
    assert.deepEqual(rel(t.skeleton), [
      path.join("_config", "skeletons", "course.json"),
    ]);
    // overlays are found under the canonical <tag>.haxProperties.<lang>.json name and the
    // legacy <tag>.<lang>.haxProperties.json name; plain this.t locales are not schema targets
    assert.deepEqual(rel(t.haxProperties), [
      path.join("custom", "lib", "my-el.haxProperties.json"),
      path.join("custom", "locales", "my-el.es.haxProperties.json"),
      path.join("custom", "locales", "my-el.haxProperties.fr.json"),
    ]);
    // locale overlays are not demoSchema sources
    assert.deepEqual(rel(t.demoSchema), [
      path.join("custom", "lib", "my-el.haxProperties.json"),
    ]);
    assert.deepEqual(rel(t.appstore), ["appstore.json"]);
    assert.deepEqual(rel(t.merlin), [path.join("custom", "my-el.js")]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fakeRunner(byKind) {
  const calls = [];
  const run = (kind, files) => {
    calls.push({ kind, files });
    return (
      byKind[kind] || {
        ok: true,
        via: "local",
        reports: files.map((file) => ({ file, errors: [], warnings: [] })),
      }
    );
  };
  return { run, calls };
}

test("auditSchemaCommand passes when every validator reports no errors", async () => {
  const root = makeProject();
  try {
    logs.length = 0;
    const { run, calls } = fakeRunner({});
    const r = await auditSchemaCommand({ options: {} }, root, {
      runValidator: run,
    });
    assert.equal(r.passed, true);
    assert.deepEqual(
      calls.map((c) => c.kind).sort(),
      Object.keys(SCHEMA_VALIDATORS).sort(),
    );
    assert.ok(logs.some(([k, m]) => k === "outro" && m.includes("passed")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("auditSchemaCommand fails on errors, and on warnings only with --strict", async () => {
  const root = makeProject();
  try {
    const withWarning = {
      appstore: {
        ok: true,
        via: "local",
        reports: [
          {
            file: path.join(root, "appstore.json"),
            errors: [],
            warnings: [{ path: "/x", message: "w" }],
          },
        ],
      },
    };
    assert.equal(
      (
        await auditSchemaCommand({ options: {} }, root, {
          runValidator: fakeRunner(withWarning).run,
        })
      ).passed,
      true,
    );
    assert.equal(
      (
        await auditSchemaCommand({ options: { strict: true } }, root, {
          runValidator: fakeRunner(withWarning).run,
        })
      ).passed,
      false,
    );
    logs.length = 0;
    const withError = {
      site: {
        ok: true,
        via: "local",
        reports: [
          {
            file: path.join(root, "site.json"),
            errors: [
              {
                path: "/items/0/parent",
                message: 'parent "x" does not match any item id',
              },
            ],
            warnings: [],
          },
        ],
      },
    };
    const r = await auditSchemaCommand({ options: {} }, root, {
      runValidator: fakeRunner(withError).run,
    });
    assert.equal(r.passed, false);
    assert.ok(
      logs.some(
        ([k, m]) => k === "message" && m.includes("site.json /items/0/parent"),
      ),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a validator that cannot run counts as a failure with its reason", async () => {
  const root = makeProject();
  try {
    logs.length = 0;
    const unavailable = {
      merlin: {
        ok: false,
        via: "npx",
        error: "could not run @haxtheweb/merlin-schema through npx",
      },
    };
    const r = await auditSchemaCommand({ options: {} }, root, {
      runValidator: fakeRunner(unavailable).run,
    });
    assert.equal(r.passed, false);
    assert.ok(
      logs.some(
        ([k, m]) =>
          k === "error" && m.includes("could not run @haxtheweb/merlin-schema"),
      ),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("--format json writes one parseable summary and no prompts output", async () => {
  const root = makeProject();
  try {
    logs.length = 0;
    let written = "";
    await auditSchemaCommand({ options: { format: "json" } }, root, {
      runValidator: fakeRunner({}).run,
      write: (t) => {
        written += t;
      },
    });
    const parsed = JSON.parse(written);
    assert.equal(parsed.passed, true);
    assert.equal(parsed.results.site.files, 1);
    assert.equal(logs.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolveLocalValidator finds a package bin next to the audited project", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-audit-resolve-"));
  try {
    write(root, "node_modules/@haxtheweb/hax-schema/package.json", {
      name: "@haxtheweb/hax-schema",
      bin: { "haxproperties-validate": "scripts/validate.js" },
    });
    write(root, "node_modules/@haxtheweb/hax-schema/scripts/validate.js", "");
    const found = resolveLocalValidator(
      "@haxtheweb/hax-schema",
      "haxproperties-validate",
      [path.join(root, "noop.js")],
    );
    assert.equal(
      found,
      path.join(
        root,
        "node_modules",
        "@haxtheweb",
        "hax-schema",
        "scripts",
        "validate.js",
      ),
    );
    assert.equal(
      resolveLocalValidator("@haxtheweb/not-installed", "x", [
        path.join(root, "noop.js"),
      ]),
      null,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runAuditCommand routes ddd, schema, i18n and all", async () => {
  const calls = [];
  const deps = {
    auditDDD: (cr, p, exit) => {
      calls.push(["ddd", exit]);
      return exit === false ? true : "ddd-exited";
    },
    auditSchema: () => {
      calls.push(["schema"]);
      return { passed: false };
    },
    auditI18n: () => {
      calls.push(["i18n"]);
      return { passed: true };
    },
    exit: (code) => code,
  };
  assert.equal(
    runAuditCommand({ arguments: {}, options: {} }, null, "/x", deps),
    "ddd-exited",
  );
  assert.deepEqual(calls.pop(), ["ddd", undefined]);
  assert.equal(
    await runAuditCommand(
      { arguments: { type: "schema" }, options: {} },
      null,
      "/x",
      deps,
    ),
    1,
  );
  calls.length = 0;
  assert.equal(
    await runAuditCommand(
      { arguments: { type: "all" }, options: {} },
      null,
      "/x",
      deps,
    ),
    1,
  );
  assert.deepEqual(calls, [["ddd", false], ["schema"], ["i18n"]]);
  calls.length = 0;
  assert.equal(
    runAuditCommand(
      { arguments: { type: "i18n" }, options: {} },
      null,
      "/x",
      deps,
    ),
    0,
  );
  assert.deepEqual(calls, [["i18n"]]);
  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal(
      runAuditCommand(
        { arguments: { type: "nope" }, options: {} },
        null,
        "/x",
        deps,
      ),
      1,
    );
  } finally {
    console.error = origError;
  }
});

// --- Security: the npx fallback is pinned and confirmed ---

test("every schema validator is pinned to an exact version", () => {
  for (const kind of Object.keys(SCHEMA_VALIDATORS)) {
    const spec = validatorNpxSpec(kind);
    assert.match(
      spec,
      /^@haxtheweb\/[a-z0-9-]+@\d+\.\d+\.\d+$/,
      `${kind}: ${spec}`,
    );
  }
});

test("confirmNpxValidator asks on a TTY, skips with --y or no TTY, and remembers per package", async () => {
  const asked = [];
  const origConfirm = stub.confirm;
  stub.confirm = async ({ message }) => {
    asked.push(message);
    return false;
  };
  try {
    // --y: never asks
    assert.equal(
      await confirmNpxValidator("site", { assumeYes: true, isTTY: true }),
      true,
    );
    // no TTY: never asks (npx's own gating applies)
    assert.equal(
      await confirmNpxValidator("site", { assumeYes: false, isTTY: false }),
      true,
    );
    assert.equal(asked.length, 0);
    // TTY without --y: asks, and a decline is honoured
    const memo = new Map();
    assert.equal(
      await confirmNpxValidator("site", {
        assumeYes: false,
        isTTY: true,
        memo,
      }),
      false,
    );
    assert.equal(asked.length, 1);
    assert.ok(asked[0].includes("npx -p @haxtheweb/json-outline-schema-spec@"));
    // same package (site + skeleton share it): answer is remembered
    assert.equal(
      await confirmNpxValidator("skeleton", {
        assumeYes: false,
        isTTY: true,
        memo,
      }),
      false,
    );
    assert.equal(asked.length, 1);
  } finally {
    stub.confirm = origConfirm;
  }
});

test("runValidator passes the exact pinned spec to npx and never runs it when declined", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-audit-npx-"));
  const spawned = [];
  const spawn = (cmd, args) => {
    spawned.push({ cmd, args });
    return { stdout: "[]", stderr: "", status: 0 };
  };
  try {
    // nothing installed under root or the CLI's argv[1] -> npx path
    const origArgv1 = process.argv[1];
    process.argv[1] = path.join(root, "noop.js");
    try {
      const ok = await runValidator("merlin", [path.join(root, "a.js")], {
        root,
        spawn,
        assumeYes: true,
      });
      assert.equal(ok.ok, true);
      assert.equal(ok.via, "npx");
      assert.equal(spawned.length, 1);
      assert.match(spawned[0].cmd, /^npx/);
      const pIndex = spawned[0].args.indexOf("-p");
      assert.equal(
        spawned[0].args[pIndex + 1],
        validatorNpxSpec("merlin"),
        "exact pinned spec, not a bare package name",
      );
      assert.notEqual(spawned[0].args[pIndex + 1], "@haxtheweb/merlin-schema");

      const origConfirm = stub.confirm;
      stub.confirm = async () => false;
      try {
        const declined = await runValidator("merlin", [], {
          root,
          spawn,
          assumeYes: false,
          isTTY: true,
        });
        assert.equal(declined.ok, false);
        assert.ok(
          declined.error.includes("npm i -D @haxtheweb/merlin-schema@"),
        );
        assert.equal(spawned.length, 1, "nothing spawned after a decline");
      } finally {
        stub.confirm = origConfirm;
      }
    } finally {
      process.argv[1] = origArgv1;
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
