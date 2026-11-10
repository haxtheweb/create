"use strict";

// Target 4: the `site:items` export / `site:items-import` migration helper end
// to end. The unit tests stub addPage(); here the real backend writes the
// pages, so this guards what users rely on when moving content between sites:
// JSON and YAML exports import, parent links are remapped to the new ids,
// imported HTML is sanitized, and an export from one site re-imports into
// another with its hierarchy intact.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  isolatedEnv,
  cliSkipReason,
  hax,
  readSite,
  itemBySlug,
  createSite,
  tagList,
} = require("../_helpers/cli-smoke.cjs");

const { env } = isolatedEnv("hax-import-home-");
const skipReason = cliSkipReason(env);
const opts = { skip: skipReason, timeout: 120000 };
const NI = ["--y", "--no-i"];

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-import-"));
test.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

const pageHtml = (siteDir, item) =>
  fs.readFileSync(path.join(siteDir, item.location), "utf8");

const EXPORT = [
  {
    id: "src-unit",
    title: "Unit A",
    slug: "unit-a",
    order: 0,
    parent: null,
    indent: 0,
    content: "<p>alpha body</p>",
    metadata: { tags: "alpha" },
  },
  {
    id: "src-lesson",
    title: "Lesson B",
    slug: "lesson-b",
    order: 0,
    parent: "src-unit",
    indent: 1,
    content:
      '<p>beta body</p><script>alert("x")</script><img src="x.png" onerror="alert(1)">',
  },
];

test("a JSON export imports with parents remapped to new ids", opts, () => {
  const siteDir = createSite(env, workDir, "import-json");
  const file = path.join(workDir, "items.json");
  fs.writeFileSync(file, JSON.stringify(EXPORT));
  const res = hax(
    env,
    ["site", "site:items-import", "--items-import", file, ...NI],
    siteDir,
  );
  assert.equal(res.status, 0, res.describe);
  assert.match(res.output, /2 nodes imported/);
  const manifest = readSite(siteDir);
  const unit = itemBySlug(manifest, "unit-a");
  const lesson = itemBySlug(manifest, "lesson-b");
  assert.ok(unit && lesson, "both imported");
  assert.notEqual(unit.id, "src-unit", "imported pages get fresh ids");
  assert.equal(unit.parent, null);
  assert.equal(lesson.parent, unit.id, "child points at the new parent id");
  assert.deepEqual(tagList(unit.metadata.tags), ["alpha"], "metadata kept");
  assert.match(pageHtml(siteDir, unit), /alpha body/);
  assert.match(pageHtml(siteDir, lesson), /beta body/);
});

test("imported HTML is sanitized before it is stored", opts, () => {
  const siteDir = path.join(workDir, "import-json");
  const lesson = itemBySlug(readSite(siteDir), "lesson-b");
  const html = pageHtml(siteDir, lesson);
  assert.doesNotMatch(html, /<script/i, "script tags stripped");
  assert.doesNotMatch(html, /onerror/i, "event handlers stripped");
});

test("a YAML export imports too", opts, () => {
  const siteDir = createSite(env, workDir, "import-yaml");
  const file = path.join(workDir, "items.yaml");
  fs.writeFileSync(
    file,
    [
      "- id: y1",
      "  title: Yaml One",
      "  slug: yaml-one",
      "  order: 3",
      "  parent: null",
      "  indent: 0",
      '  content: "<p>yaml body</p>"',
      "",
    ].join("\n"),
  );
  const res = hax(
    env,
    ["site", "site:items-import", "--items-import", file, ...NI],
    siteDir,
  );
  assert.equal(res.status, 0, res.describe);
  const item = itemBySlug(readSite(siteDir), "yaml-one");
  assert.ok(item, "yaml page imported");
  assert.equal(item.order, 3);
  assert.match(pageHtml(siteDir, item), /yaml body/);
});

test("site:items export round-trips into another site", opts, () => {
  const source = path.join(workDir, "import-json");
  const exportFile = path.join(workDir, "roundtrip.json");
  const exp = hax(
    env,
    ["site", "site:items", "--format", "json", "--to-file", exportFile, ...NI],
    source,
  );
  assert.equal(exp.status, 0, exp.describe);
  const exported = JSON.parse(fs.readFileSync(exportFile, "utf8"));
  assert.ok(Array.isArray(exported));
  // the export carries content so it can be imported without the source site
  assert.ok(exported.every((item) => typeof item.content === "string"));

  const target = createSite(env, workDir, "import-target");
  const before = readSite(target).items.length;
  const imp = hax(
    env,
    ["site", "site:items-import", "--items-import", exportFile, ...NI],
    target,
  );
  assert.equal(imp.status, 0, imp.describe);
  const manifest = readSite(target);
  assert.equal(manifest.items.length, before + exported.length);
  const unit = itemBySlug(manifest, "unit-a");
  const lesson = itemBySlug(manifest, "lesson-b");
  assert.ok(unit && lesson);
  assert.equal(lesson.parent, unit.id, "hierarchy survives the round trip");
  // a slug collision with the target's own welcome page is made unique
  const slugs = manifest.items.map((i) => i.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs stay unique");
});

test("site:items-import without a source says what is missing", opts, () => {
  const siteDir = path.join(workDir, "import-yaml");
  const before = readSite(siteDir).items.length;
  const res = hax(env, ["site", "site:items-import", ...NI], siteDir);
  assert.match(res.output, /--items-import/);
  assert.equal(readSite(siteDir).items.length, before);
});

test("a missing import file imports nothing", opts, () => {
  const siteDir = path.join(workDir, "import-yaml");
  const before = readSite(siteDir).items.length;
  const res = hax(
    env,
    [
      "site",
      "site:items-import",
      "--items-import",
      path.join(workDir, "does-not-exist.json"),
      ...NI,
    ],
    siteDir,
  );
  assert.match(res.output, /0 nodes imported/);
  assert.equal(readSite(siteDir).items.length, before);
});
