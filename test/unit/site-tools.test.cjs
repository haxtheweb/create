"use strict";

// haxtheweb/issues#3228: helpers behind site:validate, site:rebuild,
// site:archive / site:restore, site:logs, site:list and node:generate.
// Seam A (pure) and Seam B (real fs against temp fixtures). site-tools.js
// does not import haxcms-nodejs, so no canary is needed.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");

const tools = require("../../src/lib/site-tools.js");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const hasTar = spawnSync("tar", ["--version"]).status === 0;
const tarOpts = { skip: hasTar ? false : "tar is not installed" };

// ---------- site:validate ----------

test("validateSiteItems passes a well formed outline", () => {
  const { errors, warnings } = tools.validateSiteItems([
    { id: "a", slug: "a", parent: null },
    { id: "b", slug: "b", parent: "a" },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test("validateSiteItems reports duplicate ids and slugs", () => {
  const { errors } = tools.validateSiteItems([
    { id: "a", slug: "same" },
    { id: "a", slug: "other" },
    { id: "c", slug: "same" },
  ]);
  const codes = errors.map((e) => e.code).sort();
  assert.deepEqual(codes, ["duplicateId", "duplicateSlug"]);
  const slug = errors.find((e) => e.code === "duplicateSlug");
  assert.equal(slug.item, "c");
});

test("validateSiteItems reports a missing parent", () => {
  const { errors } = tools.validateSiteItems([{ id: "a", parent: "ghost" }]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "missingParent");
  assert.equal(errors[0].item, "a");
});

test("validateSiteItems reports a parent cycle once", () => {
  const { errors } = tools.validateSiteItems([
    { id: "a", parent: "c" },
    { id: "b", parent: "a" },
    { id: "c", parent: "b" },
  ]);
  const cycles = errors.filter((e) => e.code === "parentCycle");
  assert.equal(cycles.length, 1);
});

test("validateSiteItems rejects a missing items array and id-less items", () => {
  assert.equal(
    tools.validateSiteItems(undefined).errors[0].code,
    "itemsMissing",
  );
  assert.equal(
    tools.validateSiteItems([{ title: "x" }]).errors[0].code,
    "itemNoId",
  );
});

test("internalLinkSlug keeps page links and ignores everything else", () => {
  assert.equal(tools.internalLinkSlug("about"), "about");
  assert.equal(tools.internalLinkSlug("./about/"), "about");
  assert.equal(tools.internalLinkSlug("/about#team"), "about");
  assert.equal(tools.internalLinkSlug("about?x=1"), "about");
  assert.equal(tools.internalLinkSlug("unit-1/lesson-2"), "unit-1/lesson-2");
  for (const href of [
    "https://example.org",
    "//cdn.example.org/x",
    "mailto:a@b.c",
    "tel:123",
    "#top",
    "files/doc.pdf",
    "theme/style.css",
    "index.html",
    "../outside",
    "",
    null,
  ]) {
    assert.equal(tools.internalLinkSlug(href), null, String(href));
  }
});

test("validatePageContent warns on unknown tags, dead links and missing files", () => {
  const warnings = tools.validatePageContent(
    '<p><a href="gone">x</a><a href="here">y</a></p>' +
      '<video-player source="files/missing.mp4"></video-player>' +
      "<made-up-thing></made-up-thing><made-up-thing></made-up-thing>" +
      '<img src="files/present.png">',
    {
      item: { id: "p1" },
      slugs: new Set(["here"]),
      knownTags: new Set(["video-player"]),
      fileExists: (rel) => rel === "files/present.png",
    },
  );
  const byCode = {};
  warnings.forEach((w) => {
    byCode[w.code] = (byCode[w.code] || 0) + 1;
  });
  assert.deepEqual(byCode, { brokenLink: 1, missingFile: 1, unknownTag: 1 });
  assert.equal(warnings.find((w) => w.code === "brokenLink").href, "gone");
  assert.equal(
    warnings.find((w) => w.code === "missingFile").file,
    "files/missing.mp4",
  );
  assert.equal(
    warnings.find((w) => w.code === "unknownTag").tag,
    "made-up-thing",
  );
});

test("trimSlashes strips leading and trailing slashes only", () => {
  assert.equal(tools.trimSlashes("//a/b//"), "a/b");
  assert.equal(tools.trimSlashes("////"), "");
  assert.equal(tools.trimSlashes("a"), "a");
  // long runs stay linear
  const long = "/".repeat(100000) + "x";
  assert.equal(tools.trimSlashes(long), "x");
});

test("resolveSitePath refuses paths that leave the site", () => {
  const root = path.resolve("/srv/site");
  assert.equal(
    tools.resolveSitePath(root, "pages/a/index.html"),
    path.join(root, "pages/a/index.html"),
  );
  assert.equal(tools.resolveSitePath(root, "../../etc/passwd"), null);
  assert.equal(tools.resolveSitePath(root, "/etc/passwd"), null);
  assert.equal(
    tools.resolveSitePath(root, `a${String.fromCharCode(0)}b`),
    null,
  );
});

function writeSite(dir, items, pages = {}, metadata = {}) {
  fs.writeFileSync(
    path.join(dir, "site.json"),
    JSON.stringify({ title: "Fixture", items: items, metadata: metadata }),
  );
  for (const [location, html] of Object.entries(pages)) {
    fs.mkdirSync(path.dirname(path.join(dir, location)), { recursive: true });
    fs.writeFileSync(path.join(dir, location), html);
  }
}

test("validateSite checks pages on disk against the outline", () => {
  const dir = tmp("hax-validate-");
  try {
    fs.mkdirSync(path.join(dir, "files"));
    fs.writeFileSync(path.join(dir, "files", "my file.png"), "x");
    const items = [
      { id: "a", slug: "a", location: "pages/a/index.html" },
      { id: "b", slug: "b", location: "pages/b/index.html" },
      { id: "c", slug: "c", location: "../escape.html" },
    ];
    writeSite(
      dir,
      items,
      {
        "pages/a/index.html":
          '<p><a href="b">ok</a></p><img src="files/my%20file.png"><my-theme></my-theme><custom-x></custom-x>',
      },
      {
        theme: { element: "my-theme" },
        node: { dynamicElementLoader: { "custom-x": "x.js" } },
      },
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "site.json")));
    const report = tools.validateSite(dir, manifest, { "video-player": "x" });
    const codes = report.errors.map((e) => e.code).sort();
    assert.deepEqual(codes, ["missingPage", "unsafeLocation"]);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(report.summary, {
      items: 3,
      pagesChecked: 1,
      errors: 2,
      warnings: 0,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- site:rebuild ----------

test("parseRebuildTargets defaults to every target in a fixed order", () => {
  assert.deepEqual(tools.parseRebuildTargets(undefined), [
    "rss",
    "sitemap",
    "search",
    "llms",
    "managed",
    "skills",
  ]);
  assert.deepEqual(tools.parseRebuildTargets("llms, RSS"), ["rss", "llms"]);
});

test("parseRebuildTargets throws on an unknown target", () => {
  assert.throws(() => tools.parseRebuildTargets("rss,bogus"), /bogus/);
});

// ---------- site:archive / site:restore ----------

test("defaultArchivePath lands outside the site under ~/.haxtheweb/archives", () => {
  const date = new Date(2026, 10, 6, 9, 5, 7);
  assert.equal(
    tools.defaultArchivePath("my site", "/home/u", date),
    path.join(
      "/home/u",
      ".haxtheweb",
      "archives",
      "my-site",
      "my-site-20261106-090507.tar.gz",
    ),
  );
  assert.ok(!tools.safeArchiveName("../../x").includes("/"));
  assert.ok(!tools.safeArchiveName("../../x").startsWith("."));
  assert.equal(tools.safeArchiveName(""), "site");
});

test("archiveEntryProblems accepts a normal site with managed symlinks", () => {
  const { problems, skippedLinks } = tools.archiveEntryProblems(
    [
      "./",
      "./site.json",
      "./pages/",
      "./pages/a/index.html",
      "./dist",
      "./build",
    ],
    ["d", "-", "d", "-", "l", "l"],
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(skippedLinks, ["dist", "build"]);
});

test("archiveEntryProblems refuses absolute, traversal, hard link and special entries", () => {
  const { problems } = tools.archiveEntryProblems(
    ["site.json", "/etc/passwd", "a/../../x", "C:/win.ini", "hl", "fifo"],
    ["-", "-", "-", "-", "h", "p"],
  );
  assert.deepEqual(
    problems.map((p) => p.code),
    [
      "absolutePath",
      "parentTraversal",
      "absolutePath",
      "hardLink",
      "specialFile",
    ],
  );
});

test("archiveEntryProblems refuses a member written through a symlink", () => {
  const { problems } = tools.archiveEntryProblems(
    ["site.json", "evil", "evil/f"],
    ["-", "l", "-"],
  );
  assert.deepEqual(
    problems.map((p) => p.code),
    ["throughLink"],
  );
});

test("archiveEntryProblems needs a site.json file at the top level", () => {
  const { problems } = tools.archiveEntryProblems(
    ["pages/site.json", "site.json"],
    ["-", "d"],
  );
  assert.deepEqual(
    problems.map((p) => p.code),
    ["noSiteJson"],
  );
});

test("clearSiteFiles keeps symlinks and node_modules", () => {
  const dir = tmp("hax-clear-");
  const outside = tmp("hax-outside-");
  try {
    fs.mkdirSync(path.join(dir, "pages", "a"), { recursive: true });
    fs.writeFileSync(path.join(dir, "pages", "a", "index.html"), "x");
    fs.mkdirSync(path.join(dir, "assets"));
    fs.symlinkSync(outside, path.join(dir, "assets", "linked"));
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(dir, "site.json"), "{}");
    fs.writeFileSync(path.join(outside, "keep.txt"), "keep");
    tools.clearSiteFiles(dir);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["assets", "node_modules"]);
    assert.ok(
      fs.lstatSync(path.join(dir, "assets", "linked")).isSymbolicLink(),
    );
    assert.ok(fs.existsSync(path.join(dir, "node_modules", "pkg")));
    assert.equal(
      fs.readFileSync(path.join(outside, "keep.txt"), "utf8"),
      "keep",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("copyTree never writes through a link in the destination", () => {
  const from = tmp("hax-from-");
  const to = tmp("hax-to-");
  const outside = tmp("hax-outside-");
  try {
    fs.mkdirSync(path.join(from, "build"));
    fs.writeFileSync(path.join(from, "build", "x.js"), "new");
    fs.writeFileSync(path.join(from, "site.json"), "{}");
    fs.symlinkSync(outside, path.join(to, "build"));
    tools.copyTree(from, fs.realpathSync(to));
    assert.equal(fs.readFileSync(path.join(to, "site.json"), "utf8"), "{}");
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    for (const d of [from, to, outside]) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  }
});

test(
  "createSiteArchive refuses to write inside the site",
  tarOpts,
  async () => {
    const dir = tmp("hax-arch-");
    try {
      await assert.rejects(
        tools.createSiteArchive(dir, path.join(dir, "x.tar.gz")),
        /inside the site/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "archive then restore round-trips a site and keeps its links",
  tarOpts,
  async () => {
    const site = tmp("hax-site-");
    const out = tmp("hax-out-");
    const outside = tmp("hax-outside-");
    try {
      writeSite(site, [{ id: "a" }], {
        "pages/a/index.html": "<p>original</p>",
      });
      fs.mkdirSync(path.join(site, "node_modules"));
      fs.writeFileSync(path.join(site, "node_modules", "big.js"), "x");
      fs.symlinkSync(outside, path.join(site, "dist"));
      const archive = await tools.createSiteArchive(
        site,
        path.join(out, "a.tar.gz"),
      );
      const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
      assert.ok(!listing.stdout.includes("node_modules"));
      fs.writeFileSync(
        path.join(site, "pages", "a", "index.html"),
        "<p>changed</p>",
      );
      fs.writeFileSync(path.join(site, "extra.txt"), "remove me");
      const result = await tools.restoreSiteArchive(archive, site);
      assert.deepEqual(result.skippedLinks, ["dist"]);
      assert.equal(
        fs.readFileSync(path.join(site, "pages", "a", "index.html"), "utf8"),
        "<p>original</p>",
      );
      assert.ok(!fs.existsSync(path.join(site, "extra.txt")));
      assert.ok(fs.lstatSync(path.join(site, "dist")).isSymbolicLink());
      assert.ok(fs.existsSync(path.join(site, "node_modules", "big.js")));
    } finally {
      for (const d of [site, out, outside]) {
        fs.rmSync(d, { recursive: true, force: true });
      }
    }
  },
);

test(
  "restore leaves the site alone when the archive's site.json is not a site",
  tarOpts,
  async () => {
    const site = tmp("hax-site-");
    const src = tmp("hax-src-");
    const out = tmp("hax-out-");
    try {
      writeSite(site, [{ id: "a" }], { "pages/a/index.html": "<p>keep</p>" });
      fs.writeFileSync(path.join(src, "site.json"), "{}");
      const archive = await tools.createSiteArchive(
        src,
        path.join(out, "b.tar.gz"),
      );
      await assert.rejects(
        tools.restoreSiteArchive(archive, site),
        /not a valid HAX site/,
      );
      assert.equal(
        fs.readFileSync(path.join(site, "pages", "a", "index.html"), "utf8"),
        "<p>keep</p>",
      );
    } finally {
      for (const d of [site, src, out]) {
        fs.rmSync(d, { recursive: true, force: true });
      }
    }
  },
);

// ---------- site:logs ----------

test("parseLogLines reads JSON lines newest first and keeps plain lines", () => {
  const entries = tools.parseLogLines(
    [
      JSON.stringify({ level: "info", message: "first", timestamp: "t1" }),
      "not json",
      JSON.stringify({ level: "error", message: { a: 1 }, timestamp: "t3" }),
      "",
    ].join("\n"),
  );
  assert.deepEqual(entries, [
    { timestamp: "t3", level: "error", message: '{"a":1}' },
    { timestamp: null, level: "info", message: "not json" },
    { timestamp: "t1", level: "info", message: "first" },
  ]);
});

test("filterLogEntries filters by text and level and limits", () => {
  const entries = [
    { level: "error", message: "Restore failed" },
    { level: "info", message: "restore done" },
    { level: "info", message: "other" },
  ];
  assert.equal(
    tools.filterLogEntries(entries, { search: "RESTORE" }).length,
    2,
  );
  assert.equal(tools.filterLogEntries(entries, { level: "error" }).length, 1);
  assert.equal(tools.filterLogEntries(entries, { limit: "1" }).length, 1);
  assert.equal(tools.filterLogEntries(entries, { limit: "nope" }).length, 3);
});

test("readCliLogs reads create.log and its rotated files in order", () => {
  const home = tmp("hax-logs-");
  try {
    const dir = path.join(home, ".haxtheweb");
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, "create1.log"),
      JSON.stringify({ level: "info", message: "older" }) + "\n",
    );
    fs.writeFileSync(
      path.join(dir, "create.log"),
      JSON.stringify({ level: "info", message: "newer" }) + "\n",
    );
    fs.writeFileSync(path.join(dir, "other.log"), "ignored\n");
    const entries = tools.readCliLogs({}, home);
    assert.deepEqual(
      entries.map((e) => e.message),
      ["newer", "older"],
    );
    assert.deepEqual(tools.readCliLogs({}, tmp("hax-nologs-")), []);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

// ---------- site:list ----------

test("listSites finds a site, its siblings and a HAXcms _sites root", () => {
  const root = tmp("hax-list-");
  try {
    for (const dir of ["one", "_sites/two", "not-a-site", ".hidden"]) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    }
    fs.writeFileSync(
      path.join(root, "one", "site.json"),
      JSON.stringify({
        title: "One",
        items: [{ id: "a" }, { id: "b" }],
        metadata: { theme: { element: "clean-one" }, site: { updated: 1 } },
      }),
    );
    fs.writeFileSync(path.join(root, "_sites", "two", "site.json"), "{broken");
    fs.writeFileSync(path.join(root, ".hidden", "site.json"), "{}");
    const sites = tools.listSites(root);
    // sorted by path: <root>/_sites/two comes before <root>/one
    assert.deepEqual(
      sites.map((s) => [s.name, s.title, s.theme, s.pages, s.valid]),
      [
        ["two", null, null, 0, false],
        ["one", "One", "clean-one", 2, true],
      ],
    );
    assert.equal(
      sites.find((s) => s.name === "one").updated,
      "1970-01-01T00:00:01.000Z",
    );
    // inside a site, the site itself is listed
    assert.deepEqual(
      tools.listSites(path.join(root, "one")).map((s) => s.name),
      ["one"],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------- node:generate ----------

test("generateCount defaults to 10 and caps at 200", () => {
  assert.equal(tools.generateCount(undefined), 10);
  assert.equal(tools.generateCount("0"), 10);
  assert.equal(tools.generateCount("abc"), 10);
  assert.equal(tools.generateCount("5"), 5);
  assert.equal(tools.generateCount("5000"), 200);
});

test("placeholderPageHtml is plain HAX content that differs per page", () => {
  const one = tools.placeholderPageHtml(1);
  const two = tools.placeholderPageHtml(2);
  assert.match(one, /^<h2>/);
  assert.match(one, /<ul>[\s\S]*<li>/);
  assert.notEqual(one, two);
  assert.doesNotMatch(one, /<script|style=/);
});
