// test/parity golden suite (haxtheweb/issues#3332): every case has a reviewed
// snapshot, snapshots carry nothing run-specific, the summary is safe to
// render, and the flags select the right mode.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { CASES } = require("../parity/golden/cases.cjs");
const {
  selectCases,
  passed,
  stepFailed,
  summarizeGolden,
  toGolden,
  renameIn,
  noopPluginProblem,
  NOOP_PLUGIN_DIR,
  SNAPSHOT_DIR,
} = require("../parity/golden.cjs");
const { snapshot, captureFiles } = require("../parity/snapshot.cjs");
const { loadConfig } = require("../parity/config.cjs");
const { OpGenerator } = require("../parity/ops.cjs");
const {
  GOLDEN_OP_TYPES,
  listZipEntries,
  buildOutlineItems,
  resolveKeys,
} = require("../parity/legs.cjs");

test("case ids are unique and numbered like the operation list (1-50)", () => {
  const ids = CASES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    const m = /^(\d{2})[a-z]?-[a-z0-9-]+$/.exec(id);
    assert.ok(m, id + " is <nn>[letter]-<words>");
    const n = parseInt(m[1], 10);
    assert.ok(n >= 1 && n <= 50, id + " is numbered 1-50");
  }
});

test("every case lists its legs and uses op types the legs know", () => {
  // every type the seeded generator can emit is one the legs implement
  const known = new Set();
  const gen = new OpGenerator(1, "api");
  for (const t of Object.keys(gen.weights)) known.add(t);
  for (const t of GOLDEN_OP_TYPES) known.add(t);
  for (const c of CASES) {
    assert.ok(["all", "api"].includes(c.legs), c.id + " legs");
    assert.ok(c.title && c.title.length > 0, c.id + " title");
    const added = new Set(["L0"]);
    for (const s of c.steps) {
      assert.ok(known.has(s.type), `${c.id}: unknown step ${s.type}`);
      if (s.type === "addPage") added.add(s.key);
      else if (s.key)
        assert.ok(added.has(s.key), `${c.id}: ${s.key} used before added`);
    }
  }
});

test("CLI-only legs are not asked to run API-only steps", () => {
  const cliTypes = new Set([
    "addPage",
    "editTitle",
    "editContent",
    "editSlug",
    "editDescription",
    "editTags",
    "editPublished",
    "editHideInMenu",
    "editParent",
    "editOrder",
    "deletePage",
    "setTheme",
    // node:edit --move and --locked
    "moveUp",
    "moveDown",
    "indent",
    "outdent",
    "setLocked",
  ]);
  for (const c of CASES.filter((x) => x.legs === "all"))
    for (const s of c.steps)
      assert.ok(cliTypes.has(s.type), `${c.id}: ${s.type} has no CLI command`);
});

test("every case has a committed snapshot with nothing run-specific in it", () => {
  for (const c of CASES) {
    const p = path.join(SNAPSHOT_DIR, c.id + ".json");
    assert.ok(fs.existsSync(p), "missing snapshot for " + c.id);
    const raw = fs.readFileSync(p, "utf8");
    const golden = JSON.parse(raw);
    const keys = Object.keys(golden).sort();
    for (const k of ["manifest", "pages", "sequence"])
      assert.ok(keys.includes(k), c.id + " has " + k);
    for (const k of keys)
      assert.ok(
        ["manifest", "pages", "sequence", "files", "clone", "extra"].includes(
          k,
        ),
        c.id + ": unexpected key " + k,
      );
    // a case only records files when it asks to
    assert.equal("files" in golden, !!c.captureFiles, c.id + " files");
    const archived = c.steps.some((s) => s.type === "archiveSite");
    if (archived) {
      // the site is gone; what the case shows is where it went
      assert.equal(golden.manifest, null, c.id);
      assert.ok(golden.extra && golden.extra.archive, c.id);
    } else {
      assert.equal(golden.manifest.metadata.site.name, "SITE_NAME", c.id);
      assert.equal(golden.manifest.id, "SITE_ID", c.id);
    }
    if (golden.clone)
      assert.equal(
        golden.clone.manifest.metadata.site.name,
        "CLONE_NAME",
        c.id,
      );
    // no uuids, absolute paths, timestamps or run tags
    assert.doesNotMatch(raw, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i, c.id);
    assert.doesNotMatch(raw, /"(created|updated)":/, c.id);
    assert.doesNotMatch(raw, /\/(home|tmp|Users)\//, c.id);
    assert.doesNotMatch(raw, /golden\d{2}[a-z0-9]{6,}/, c.id);
    for (const key of golden.sequence)
      assert.ok(/^L\d+$/.test(key), `${c.id}: ${key} is a logical key`);
  }
});

test("cases make their sites under distinct names", () => {
  // golden.cjs names each case's site from the number before the first dash,
  // so two cases with the same number would share (and clash on) one site
  const prefixes = CASES.map((c) => c.id.split("-")[0]);
  assert.equal(new Set(prefixes).size, prefixes.length);
});

test("hooked-operation cases run on the API legs and use known fixtures", () => {
  const hooked = new Set(GOLDEN_OP_TYPES.slice(2));
  for (const c of CASES)
    for (const s of c.steps) {
      if (hooked.has(s.type)) assert.equal(c.legs, "api", c.id);
      if (s.fixture)
        assert.ok(
          fs.existsSync(
            path.join(
              __dirname,
              "..",
              "parity",
              "golden",
              "fixtures",
              "files",
              s.fixture,
            ),
          ),
          c.id + ": fixture " + s.fixture,
        );
    }
});

test("listZipEntries reads the names in a zip's central directory", () => {
  // a zip with two stored entries, built by hand
  const entry = (name, data) => {
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    return { n, local: Buffer.concat([local, n, data]), size: data.length };
  };
  const a = entry("site.json", Buffer.from("{}"));
  const b = entry("pages/x/index.html", Buffer.from("<p></p>"));
  const central = (e, offset) => {
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt32LE(e.size, 20);
    c.writeUInt32LE(e.size, 24);
    c.writeUInt16LE(e.n.length, 28);
    c.writeUInt32LE(offset, 42);
    return Buffer.concat([c, e.n]);
  };
  const cd = Buffer.concat([central(a, 0), central(b, a.local.length)]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(2, 8);
  eocd.writeUInt16LE(2, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(a.local.length + b.local.length, 16);
  const zip = Buffer.concat([a.local, b.local, cd, eocd]);
  assert.deepEqual(listZipEntries(zip), ["site.json", "pages/x/index.html"]);
  assert.throws(() => listZipEntries(Buffer.from("not a zip at all, sorry")));
});

test("captureFiles names fixtures, drops uuids and dates from records", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-files-"));
  fs.mkdirSync(path.join(dir, "files", "sub"), { recursive: true });
  fs.copyFileSync(
    path.join(
      __dirname,
      "..",
      "parity",
      "golden",
      "fixtures",
      "files",
      "pink.png",
    ),
    path.join(dir, "files", "sub", "a.png"),
  );
  fs.writeFileSync(path.join(dir, "files", "b.txt"), "hi");
  fs.writeFileSync(
    path.join(dir, "files", "files.json"),
    JSON.stringify({
      schema: "HAXCMS-FILE-SCHEMA-V1",
      data: {
        files: [
          {
            path: "files/sub/a.png",
            name: "a.png",
            uuid: "u-1",
            dateCreated: 5,
            size: 74,
          },
        ],
      },
    }),
  );
  const out = captureFiles(dir, {}, []);
  assert.deepEqual(out.onDisk, {
    "b.txt": "other",
    "sub/a.png": "fixture:pink.png",
  });
  assert.deepEqual(out.records, [
    { path: "files/sub/a.png", name: "a.png", size: 74 },
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("renameIn swaps run names in keys and values", () => {
  assert.deepEqual(
    renameIn(
      { "run1.zip": ["pages/id9/index.html", 3] },
      { run1: "SITE_NAME", id9: "L1" },
    ),
    { "SITE_NAME.zip": ["pages/L1/index.html", 3] },
  );
});

test("no snapshot is left over from a removed case", () => {
  const ids = new Set(CASES.map((c) => c.id));
  for (const f of fs.readdirSync(SNAPSHOT_DIR))
    assert.ok(ids.has(f.replace(/\.json$/, "")), "orphan snapshot " + f);
});

test("selectCases filters by id and refuses unknown ids", () => {
  assert.equal(selectCases("").length, CASES.length);
  const one = selectCases(CASES[0].id + " , " + CASES[1].id);
  assert.deepEqual(
    one.map((c) => c.id),
    [CASES[0].id, CASES[1].id],
  );
  assert.throws(() => selectCases("99-nope"), /unknown golden case/);
});

test("snapshot replace maps the run's site name to a placeholder", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-unit-"));
  fs.mkdirSync(path.join(dir, "pages", "u1"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "site.json"),
    JSON.stringify({
      id: "s1",
      title: "goldenrun123",
      metadata: { site: { name: "goldenrun123" } },
      items: [
        {
          id: "u1",
          title: "Welcome",
          location: "pages/u1/index.html",
          created: 1,
          updated: 2,
        },
      ],
    }),
  );
  fs.writeFileSync(path.join(dir, "pages", "u1", "index.html"), "<p>hi</p>");
  const snap = snapshot(
    dir,
    { L0: "u1" },
    {
      replace: { goldenrun123: "SITE_NAME" },
    },
  );
  const g = toGolden(snap);
  assert.equal(g.manifest.title, "SITE_NAME");
  assert.equal(g.manifest.metadata.site.name, "SITE_NAME");
  assert.equal(g.manifest.id, "SITE_ID");
  assert.equal(g.manifest.items.L0.created, undefined);
  assert.deepEqual(g.sequence, ["L0"]);
  assert.equal("accepted" in g, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

function result(over) {
  return Object.assign(
    {
      id: "15-add-top-level-page",
      title: "Add a top-level page",
      legs: {
        nodejs: { diffs: 0, examples: [] },
        php: { diffs: 0, examples: [] },
      },
      stepErrors: [],
    },
    over,
  );
}

test("passed: any diff, failed step or missing snapshot fails the case", () => {
  assert.equal(passed(result()), true);
  assert.equal(
    passed(result({ legs: { nodejs: { diffs: 1, examples: [] } } })),
    false,
  );
  assert.equal(
    passed(result({ stepErrors: [{ leg: "php", step: 1, status: 500 }] })),
    false,
  );
  assert.equal(passed(result({ missing: true })), false);
});

test("summary escapes values and counts failures", () => {
  const bad = result({
    id: "26-title-and-slug",
    legs: {
      nodejs: {
        diffs: 1,
        examples: [
          { path: "pages.L1", ref: "<p>a|b</p>", other: "<script>x</script>" },
        ],
      },
    },
  });
  const { markdown, failed } = summarizeGolden([result(), bad], {});
  assert.equal(failed, 1);
  assert.match(markdown, /1 of 2 case\(s\) match/);
  assert.doesNotMatch(markdown, /<script>/);
  assert.match(markdown, /&lt;script&gt;/);
  assert.match(markdown, /a&#124;b/);
  assert.match(
    markdown,
    /\| `15-add-top-level-page` \| match \| match \| - \|/,
  );
});

test("--update-golden implies --golden; --fail-on-diff is opt-in", () => {
  const plain = loadConfig([], {});
  assert.equal(plain.golden, false);
  assert.equal(plain["fail-on-diff"], false);
  const update = loadConfig(["--update-golden"], {});
  assert.equal(update.golden, true);
  assert.equal(update["update-golden"], true);
  const gate = loadConfig(["--golden", "--fail-on-diff"], {});
  assert.equal(gate.golden, true);
  assert.equal(gate["fail-on-diff"], true);
  const env = loadConfig([], { HAX_PARITY_GOLDEN: "1", HAX_PARITY_CASES: "x" });
  assert.equal(env.golden, true);
  assert.equal(env.cases, "x");
});

test("outlineMove sends depths the way outline-designer does", () => {
  const { syncIndents } = require("../parity/legs.cjs");
  // L2 moved to the top level; its child L3 must come along to depth 1
  const items = syncIndents([
    { id: "a", parent: null, indent: 0 },
    { id: "b", parent: null, indent: 1 },
    { id: "c", parent: "b", indent: 2 },
    { id: "d", parent: "", indent: 3 },
  ]);
  assert.deepEqual(
    items.map((i) => i.indent),
    [0, 0, 1, 0],
  );
  // a parent loop is left exactly as it came
  const loop = syncIndents([
    { id: "x", parent: "y", indent: 5 },
    { id: "y", parent: "x", indent: 7 },
  ]);
  assert.deepEqual(
    loop.map((i) => i.indent),
    [5, 7],
  );
});

test("a step with expect passes only on that status", () => {
  assert.equal(stepFailed({ status: 400 }, { expect: 400 }), false);
  assert.equal(stepFailed({ status: 200 }, { expect: 400 }), true);
  assert.equal(stepFailed({ status: 422 }, { expect: 400 }), true);
  assert.equal(stepFailed({ status: 200 }, {}), false);
  assert.equal(stepFailed({ status: 400 }, {}), true);
  assert.equal(stepFailed({ status: "ok" }), false);
  assert.equal(stepFailed(undefined, { expect: 400 }), true);
});

test("cases that expect a refusal run on the API legs only", () => {
  for (const c of CASES)
    for (const s of c.steps)
      if (s.expect !== undefined)
        assert.equal(c.legs, "api", c.id + " expects an HTTP status");
});

test("outlineSave builds what outline-designer sends", () => {
  const ids = { L1: "a", L2: "b", L3: "c" };
  const idOf = (k) => ids[k];
  const items = [
    { id: "a", title: "A", parent: null, order: 0, indent: 0 },
    { id: "b", title: "B", parent: null, order: 1, indent: 0 },
    { id: "c", title: "C", parent: "b", order: 0, indent: 1 },
  ];
  const out = buildOutlineItems(
    items,
    {
      changes: [
        { key: "L2", parent: "L1" },
        { key: "L1", title: "A2", slug: "custom", hideInMenu: true },
        { key: "L3", delete: true },
      ],
      add: [{ key: "L4", title: "New", parent: "L2" }],
    },
    idOf,
  );
  const by = Object.fromEntries(out.map((i) => [i.id, i]));
  // a moved page goes to the end of its new siblings, its subtree follows
  assert.equal(by.b.parent, "a");
  assert.equal(by.b.order, 0);
  assert.equal(by.b.indent, 1);
  assert.equal(by.c.indent, 2);
  assert.equal(by.c.delete, true);
  assert.equal(by.a.title, "A2");
  assert.equal(by.a.slug, "custom");
  assert.equal(by.a.metadata.overridePathauto, true);
  assert.equal(by.a.metadata.hideInMenu, true);
  // a new page is sent under a client id, one level below its parent
  const added = by["item-golden-L4"];
  assert.equal(added.parent, "b");
  assert.equal(added.order, 1);
  assert.equal(added.indent, 2);
  // the site's own items are not changed
  assert.equal(items[1].parent, null);
  assert.equal(items[0].metadata, undefined);
  // a parent that is not a key is sent as written
  const raw = buildOutlineItems(
    items,
    { changes: [{ key: "L3", parent: "no-such-page" }] },
    idOf,
  );
  assert.equal(raw.find((i) => i.id === "c").parent, "no-such-page");
});

test("outlineRaw swaps @keys for ids and leaves everything else", () => {
  const idOf = (k) => ({ L1: "a" })[k];
  assert.deepEqual(
    resolveKeys(
      [{ id: "@L1", parent: "@L9", n: 1, x: null }, ["@L1"], "   "],
      idOf,
    ),
    [{ id: "a", parent: "@L9", n: 1, x: null }, ["a"], "   "],
  );
  assert.equal(resolveKeys("L1", idOf), "L1");
});

test("--noop-plugin is opt-in and the spec defaults to haxcms-nodejs's copy", () => {
  const plain = loadConfig([], {});
  assert.equal(plain["noop-plugin"], false);
  const on = loadConfig(["--golden", "--noop-plugin", "--nodejs", "/x/n"], {});
  assert.equal(on["noop-plugin"], true);
  assert.equal(
    on["plugin-spec"],
    path.join("/x/n", "node_modules", "@haxtheweb", "haxcms-plugin-spec"),
  );
  const env = loadConfig([], {
    HAX_PARITY_NOOP_PLUGIN: "1",
    HAX_PARITY_PLUGIN_SPEC: "/spec",
  });
  assert.equal(env["noop-plugin"], true);
  assert.equal(env["plugin-spec"], "/spec");
});

test("a noop run only counts when golden-noop is enabled and active", () => {
  const reply = (status, data) => ({ status, json: { status, data } });
  const entry = (over) =>
    Object.assign({ id: "golden-noop", enabled: true, status: "active" }, over);
  assert.equal(noopPluginProblem(reply(200, [entry()])), "");
  assert.match(noopPluginProblem(reply(404, null)), /answered 404/);
  assert.match(noopPluginProblem(null), /answered nothing/);
  assert.match(noopPluginProblem(reply(200, [])), /not installed/);
  assert.match(
    noopPluginProblem(
      reply(200, [
        entry({ enabled: false, status: "available", reason: "off" }),
      ]),
    ),
    /available \(off\)/,
  );
});

test("the golden-noop fixture lists the same hooks in its manifest and both runtimes", () => {
  const read = (f) => fs.readFileSync(path.join(NOOP_PLUGIN_DIR, f), "utf8");
  const manifest = [
    ...read("plugin.yaml").matchAll(/^ {2}- name: (\S+)$/gm),
  ].map((m) => m[1]);
  const node = [
    ...read("src/nodejs/index.js").matchAll(/^ {4}"([^"]+)": same,$/gm),
  ].map((m) => m[1]);
  const camel = (h) =>
    h
      .split(/[.-]/)
      .map((x, i) => (i ? x[0].toUpperCase() + x.slice(1) : x))
      .join("");
  const php = [
    ...read("src/php/Plugin.php").matchAll(
      /public function (\w+)\(\$ctx\) \{\n {4}return \$ctx->subject;/g,
    ),
  ].map((m) => m[1]);
  assert.ok(manifest.length > 40, "subscribes to the core hooks");
  assert.deepEqual(node, manifest);
  assert.deepEqual(php, manifest.map(camel));
});
