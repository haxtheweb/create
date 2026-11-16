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
  summarizeGolden,
  toGolden,
  SNAPSHOT_DIR,
} = require("../parity/golden.cjs");
const { snapshot } = require("../parity/snapshot.cjs");
const { loadConfig } = require("../parity/config.cjs");
const { OpGenerator } = require("../parity/ops.cjs");

test("case ids are unique and numbered like the operation list (1-50)", () => {
  const ids = CASES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    const m = /^(\d{2})-[a-z0-9-]+$/.exec(id);
    assert.ok(m, id + " is <nn>-<words>");
    const n = parseInt(m[1], 10);
    assert.ok(n >= 1 && n <= 50, id + " is numbered 1-50");
  }
});

test("every case lists its legs and uses op types the legs know", () => {
  // every type the seeded generator can emit is one the legs implement
  const known = new Set();
  const gen = new OpGenerator(1, "api");
  for (const t of Object.keys(gen.weights)) known.add(t);
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
    assert.deepEqual(Object.keys(golden).sort(), [
      "manifest",
      "pages",
      "sequence",
    ]);
    assert.equal(golden.manifest.metadata.site.name, "SITE_NAME", c.id);
    assert.equal(golden.manifest.id, "SITE_ID", c.id);
    // no uuids, absolute paths, timestamps or run tags
    assert.doesNotMatch(raw, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i, c.id);
    assert.doesNotMatch(raw, /"(created|updated)":/, c.id);
    assert.doesNotMatch(raw, /\/(home|tmp|Users)\//, c.id);
    assert.doesNotMatch(raw, /golden\d{2}[a-z0-9]{6,}/, c.id);
    for (const key of golden.sequence)
      assert.ok(/^L\d+$/.test(key), `${c.id}: ${key} is a logical key`);
  }
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
