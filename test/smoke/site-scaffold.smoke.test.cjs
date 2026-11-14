"use strict";

// Target 1: `hax site <name>` scaffolding contract, end to end against the
// real haxcms-nodejs backend (the unit tests mock systemStructureContext, so
// a backend data-model change can slip past them). Asserts the files a new
// site must have, the shape of site.json that themes, the editor and every
// later `hax site` command read, and that creation writes nothing outside
// the new site's folder or the isolated HOME.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  isolatedEnv,
  cliSkipReason,
  hax,
  listTree,
  readSite,
  createSite,
  SITE_FLAGS,
} = require("../_helpers/cli-smoke.cjs");

const { env } = isolatedEnv("hax-scaffold-home-");
const skipReason = cliSkipReason(env);
const opts = { skip: skipReason, timeout: 90000 };

// One site shared by the read-only shape assertions below.
let shared = null;
function sharedSite() {
  if (!shared) {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-scaffold-"));
    const before = listTree(parentDir);
    const siteDir = createSite(env, parentDir, "scaffold-site");
    shared = { parentDir, siteDir, before, after: listTree(parentDir) };
  }
  return shared;
}
test.after(() => {
  if (shared) {
    fs.rmSync(shared.parentDir, { recursive: true, force: true });
  }
});

test("a new site has the files HAXcms needs to serve and edit it", opts, () => {
  const { siteDir } = sharedSite();
  for (const rel of [
    "site.json",
    "index.html",
    "package.json",
    "manifest.json",
    "service-worker.js",
    "404.html",
    "llms.txt",
    "AGENTS.md",
    ".gitignore",
    ".dddignore",
    "files",
    "pages",
    // no "theme": the site folder contract retired it (haxtheweb/issues#3351);
    // haxcms-nodejs main no longer writes it, the published release still does
    "custom",
    path.join(".well-known", "agent-skills", "index.json"),
  ]) {
    assert.ok(fs.existsSync(path.join(siteDir, rel)), `missing ${rel}`);
  }
  // the agent-skills index must be valid JSON (agents read it first)
  JSON.parse(
    fs.readFileSync(
      path.join(siteDir, ".well-known", "agent-skills", "index.json"),
      "utf8",
    ),
  );
  // package.json is named after the site so npm / publish flows line up
  const pkg = JSON.parse(
    fs.readFileSync(path.join(siteDir, "package.json"), "utf8"),
  );
  assert.equal(typeof pkg.name, "string");
});

test("site.json carries the JSON Outline Schema shape", opts, () => {
  const { siteDir } = sharedSite();
  const manifest = readSite(siteDir);
  for (const key of ["id", "title", "description", "metadata", "items"]) {
    assert.ok(key in manifest, `site.json is missing ${key}`);
  }
  assert.match(manifest.id, /\S/);
  assert.ok(Array.isArray(manifest.items));
  const site = manifest.metadata.site;
  assert.equal(site.name, "scaffold-site", "metadata.site.name = folder name");
  assert.equal(typeof site.created, "number");
  assert.equal(typeof site.updated, "number");
  assert.equal(typeof site.settings, "object");
  // the theme passed with --theme is the one recorded, with a loadable path
  assert.equal(manifest.metadata.theme.element, "clean-one");
  assert.match(manifest.metadata.theme.path, /clean-one\.js$/);
  // haxtheweb/issues#3292: created with the API's createSite defaults, so
  // there is no build block (only skeleton and import builds record one)
  assert.equal(manifest.metadata.build, undefined);
});

test("the starter page is a real top-level item with content", opts, () => {
  const { siteDir } = sharedSite();
  const manifest = readSite(siteDir);
  assert.ok(manifest.items.length >= 1, "site starts with a page");
  for (const item of manifest.items) {
    for (const key of [
      "id",
      "title",
      "slug",
      "location",
      "order",
      "parent",
      "indent",
      "metadata",
    ]) {
      assert.ok(key in item, `item ${item.id} is missing ${key}`);
    }
    // page files live under pages/ inside the site, never elsewhere
    assert.match(item.location, /^pages\/[^/]+\/index\.html$/);
    const resolved = path.resolve(siteDir, item.location);
    assert.ok(resolved.startsWith(siteDir + path.sep));
    assert.ok(fs.existsSync(resolved), `page file for ${item.slug} exists`);
  }
  const first = manifest.items[0];
  assert.equal(first.parent, null);
  assert.equal(first.order, 0);
  assert.match(
    fs.readFileSync(path.join(siteDir, first.location), "utf8"),
    /\S/,
  );
});

test("creating a site writes only the new site folder", opts, () => {
  const { before, after } = sharedSite();
  assert.deepEqual(before, []);
  const created = after.filter((rel) => !before.includes(rel));
  const outside = created.filter(
    (rel) =>
      rel !== "scaffold-site" && !rel.startsWith(`scaffold-site${path.sep}`),
  );
  assert.deepEqual(outside, [], "nothing written next to the site folder");
});

test("--path places the site in that directory, not the cwd", opts, () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hax-scaffold-cwd-"));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "hax-scaffold-path-"));
  try {
    const res = hax(
      env,
      ["site", "--name", "pathed-site", "--path", target, ...SITE_FLAGS],
      cwd,
      60000,
    );
    assert.equal(res.status, 0, res.describe);
    assert.ok(fs.existsSync(path.join(target, "pathed-site", "site.json")));
    assert.deepEqual(listTree(cwd), [], "the cwd is left untouched");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test(
  "creating a site over an existing folder exits 1 and keeps it intact",
  opts,
  () => {
    const parentDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "hax-scaffold-dup-"),
    );
    try {
      const siteDir = createSite(env, parentDir, "dup-site");
      const marker = path.join(siteDir, "pages", "keep-me.txt");
      fs.writeFileSync(marker, "user content");
      const manifestBefore = fs.readFileSync(
        path.join(siteDir, "site.json"),
        "utf8",
      );
      const res = hax(
        env,
        ["site", "dup-site", ...SITE_FLAGS],
        parentDir,
        60000,
      );
      assert.equal(res.status, 1, res.describe);
      assert.match(res.output, /exists, rename this project/);
      assert.ok(fs.existsSync(marker), "existing content kept");
      assert.equal(
        fs.readFileSync(path.join(siteDir, "site.json"), "utf8"),
        manifestBefore,
        "existing site.json not replaced",
      );
    } finally {
      fs.rmSync(parentDir, { recursive: true, force: true });
    }
  },
);

// haxcms-nodejs 26.8.1 on npm ships dist/boilerplate/site/false (an empty
// file that is not in haxcms-nodejs main's src/boilerplate), so every new
// site gets a stray file named "false". Skips while the installed backend
// still ships it; turns on by itself once a release without it is installed.
const strayBoilerplate = (() => {
  try {
    const boilerplate = path.join(
      path.dirname(require.resolve("@haxtheweb/haxcms-nodejs/package.json")),
      "dist",
      "boilerplate",
      "site",
      "false",
    );
    return fs.existsSync(boilerplate)
      ? "BUG: installed @haxtheweb/haxcms-nodejs ships boilerplate/site/false, copied into every new site"
      : false;
  } catch {
    return false;
  }
})();
test(
  "a new site contains no stray boilerplate artifacts",
  { ...opts, skip: skipReason || strayBoilerplate },
  () => {
    const { siteDir } = sharedSite();
    for (const stray of ["false", "true", "undefined", "null"]) {
      assert.ok(
        !fs.existsSync(path.join(siteDir, stray)),
        `unexpected file "${stray}" in the new site`,
      );
    }
  },
);
