"use strict";

// Target 3: `hax site node:add | node:edit | node:delete` end to end against
// the real haxcms-nodejs backend. site-command-*.test.cjs drive these
// branches with a mocked site object; these runs check what actually lands
// in site.json and pages/ — hierarchy by slug, metadata flags, the
// non-interactive error contract (exit 1 + a message naming the problem) and
// that a hostile slug can never point a page outside pages/.

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

const { env } = isolatedEnv("hax-pages-home-");
const skipReason = cliSkipReason(env);
const opts = { skip: skipReason, timeout: 120000 };
const NI = ["--y", "--no-i"];

const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-pages-"));
test.after(() => fs.rmSync(parentDir, { recursive: true, force: true }));

let siteDir = null;
function site() {
  if (!siteDir) {
    siteDir = createSite(env, parentDir, "pages-ops-site");
  }
  return siteDir;
}
function run(args) {
  return hax(env, ["site", ...args, ...NI], site());
}
function ok(args) {
  const res = run(args);
  assert.equal(res.status, 0, res.describe);
  return res;
}

test("node:add --parent resolves a slug to the parent's id", opts, () => {
  ok(["node:add", "--title", "Unit", "--slug", "unit"]);
  ok([
    "node:add",
    "--title",
    "Lesson",
    "--slug",
    "lesson",
    "--parent",
    "unit",
    "--description",
    "first lesson",
    "--tags",
    "intro,basics",
  ]);
  const manifest = readSite(site());
  const unit = itemBySlug(manifest, "unit");
  const lesson = itemBySlug(manifest, "lesson");
  assert.ok(unit && lesson, "both pages created");
  assert.equal(unit.parent, null);
  assert.equal(lesson.parent, unit.id, "parent stored as id, not slug");
  assert.equal(lesson.description, "first lesson");
  assert.deepEqual(tagList(lesson.metadata.tags), ["intro", "basics"]);
  // the first child of a new parent starts at order 0
  assert.equal(lesson.order, 0);
  // every add writes the page file inside pages/
  for (const item of [unit, lesson]) {
    const file = path.resolve(site(), item.location);
    assert.ok(file.startsWith(path.join(site(), "pages") + path.sep));
    assert.ok(fs.existsSync(file));
  }
});

test("node:add --order places the page at that order", opts, () => {
  ok(["node:add", "--title", "Ordered", "--slug", "ordered", "--order", "7"]);
  assert.equal(itemBySlug(readSite(site()), "ordered").order, 7);
});

test("node:edit flips published / hideInMenu and sets order", opts, () => {
  ok([
    "node:edit",
    "--item-id",
    "ordered",
    "--published",
    "false",
    "--hide-in-menu",
    "true",
    "--order",
    "2",
  ]);
  const item = itemBySlug(readSite(site()), "ordered");
  assert.equal(item.metadata.published, false, "string false -> boolean");
  assert.equal(item.metadata.hideInMenu, true);
  assert.equal(item.order, 2);
});

test("node:edit --parent null moves a page to the top level", opts, () => {
  ok(["node:edit", "--item-id", "lesson", "--parent", "null"]);
  assert.equal(itemBySlug(readSite(site()), "lesson").parent, null);
  ok(["node:edit", "--item-id", "lesson", "--parent", "unit"]);
  const manifest = readSite(site());
  assert.equal(
    itemBySlug(manifest, "lesson").parent,
    itemBySlug(manifest, "unit").id,
  );
});

test("node:edit refuses to make a page its own parent", opts, () => {
  const before = fs.readFileSync(path.join(site(), "site.json"), "utf8");
  const res = run(["node:edit", "--item-id", "unit", "--parent", "unit"]);
  assert.equal(res.status, 1, res.describe);
  assert.match(res.output, /cannot be its own parent/);
  assert.equal(
    fs.readFileSync(path.join(site(), "site.json"), "utf8"),
    before,
    "site.json unchanged",
  );
});

test("node:edit names a parent that does not exist", opts, () => {
  const res = run(["node:edit", "--item-id", "unit", "--parent", "nowhere"]);
  assert.equal(res.status, 1, res.describe);
  assert.match(res.output, /Parent "nowhere" not found/);
});

test("node:edit on an unknown page exits 1 naming it", opts, () => {
  const res = run(["node:edit", "--item-id", "no-such-page", "--title", "X"]);
  assert.equal(res.status, 1, res.describe);
  assert.match(res.output, /no page with id or slug "no-such-page"/);
});

test(
  "node:edit without --item-id fails fast when non-interactive",
  opts,
  () => {
    const res = run(["node:edit", "--title", "X"]);
    assert.equal(res.status, 1, res.describe);
    assert.match(res.output, /--item-id/);
  },
);

test("node:edit with nothing to change exits 1 listing the flags", opts, () => {
  const res = run(["node:edit", "--item-id", "unit"]);
  assert.equal(res.status, 1, res.describe);
  assert.match(res.output, /--title/);
});

test("node:edit --order rejects a non-number", opts, () => {
  const before = itemBySlug(readSite(site()), "unit").order;
  const res = run(["node:edit", "--item-id", "unit", "--order", "first"]);
  assert.equal(res.status, 1, res.describe);
  assert.match(res.output, /first/);
  assert.equal(itemBySlug(readSite(site()), "unit").order, before);
});

test("a path-like slug is cleaned and the page stays in pages/", opts, () => {
  ok(["node:add", "--title", "Sneaky", "--slug", "sneaky"]);
  ok(["node:edit", "--item-id", "sneaky", "--slug", "../../outside"]);
  const manifest = readSite(site());
  const item = manifest.items.find((i) => i.title === "Sneaky");
  assert.ok(item, "page still present");
  assert.ok(!item.slug.includes(".."), `slug cleaned, got ${item.slug}`);
  assert.ok(!item.slug.startsWith("/"));
  assert.match(item.location, /^pages\/[^/]+\/index\.html$/);
  assert.ok(!fs.existsSync(path.join(parentDir, "outside")));
  assert.ok(!fs.existsSync(path.join(path.dirname(parentDir), "outside")));
});

test("node:delete removes a page by id and by slug", opts, () => {
  ok(["node:add", "--title", "Doomed one", "--slug", "doomed-one"]);
  ok(["node:add", "--title", "Doomed two", "--slug", "doomed-two"]);
  const id = itemBySlug(readSite(site()), "doomed-one").id;
  ok(["node:delete", "--item-id", id]);
  ok(["node:delete", "--item-id", "doomed-two"]);
  const slugs = readSite(site()).items.map((i) => i.slug);
  assert.ok(!slugs.includes("doomed-one"));
  assert.ok(!slugs.includes("doomed-two"));
  assert.ok(slugs.includes("unit"), "other pages untouched");
});

test("deleting a parent re-homes its children to the top level", opts, () => {
  ok(["node:add", "--title", "Box", "--slug", "box"]);
  ok(["node:add", "--title", "In box", "--slug", "in-box", "--parent", "box"]);
  ok(["node:delete", "--item-id", "box"]);
  const manifest = readSite(site());
  assert.equal(itemBySlug(manifest, "box"), undefined);
  const orphan = itemBySlug(manifest, "in-box");
  assert.ok(orphan, "child kept");
  assert.equal(orphan.parent, null, "child not left pointing at a ghost");
});

test("node:delete of an unknown id warns and changes nothing", opts, () => {
  const before = readSite(site()).items.length;
  const res = run(["node:delete", "--item-id", "item-does-not-exist"]);
  assert.match(res.output, /"item-does-not-exist" not found/);
  assert.equal(readSite(site()).items.length, before);
});

// node:delete fails like node:edit and node:add (exit 1) so scripts can tell
test("node:delete of an unknown id exits non-zero", opts, () => {
  const res = run(["node:delete", "--item-id", "item-does-not-exist"]);
  assert.equal(res.status, 1, res.describe);
});

// a path-like id is resolved locally, never reaches the backend route
test(
  "node:delete with a path-like id fails cleanly without a TypeError",
  opts,
  () => {
    const before = readSite(site()).items.length;
    const res = run(["node:delete", "--item-id", "../../etc"]);
    assert.equal(readSite(site()).items.length, before, "nothing deleted");
    assert.doesNotMatch(res.output, /Cannot read properties of undefined/);
    assert.equal(res.status, 1, res.describe);
  },
);
