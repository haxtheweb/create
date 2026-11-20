"use strict";

// Isolate HOME BEFORE requiring site.js (via the canary) so HAXCMS init lands in
// a temp dir, not the real ~/.haxtheweb. Same pattern as site-helpers-2.test.cjs.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ISOLATED_HOME = fs.mkdtempSync(
  path.join(os.tmpdir(), "hax-site-imports-"),
);
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  available,
  skipReason,
  module: siteModule,
} = require("../_helpers/site-canary.cjs");

const {
  IMPORT_STRUCTURE_MAP,
  IMPORT_STRUCTURE_FOR_EXTENSION,
  importFileUpload,
  defaultImportStructure,
} = available ? siteModule : {};

const opts = { skip: skipReason, timeout: 15000 };

// --- IMPORT_STRUCTURE_MAP ---
// --import-structure names resolve to on-prem haxcms-nodejs routes: platform
// converters through the site/import/:platform dispatcher, docx/xlsx through
// their own actions routes. A converter missing from this map is unreachable
// from the CLI even when the backend route exists, which is what happened to
// the OpenStax importer from haxtheweb/issues#2912.

test("every platform importer maps to its dispatcher platform", opts, () => {
  const platforms = {};
  Object.keys(IMPORT_STRUCTURE_MAP).forEach((name) => {
    if (IMPORT_STRUCTURE_MAP[name].platform) {
      platforms[name] = IMPORT_STRUCTURE_MAP[name].platform;
    }
  });
  assert.deepEqual(platforms, {
    haxcmsToSite: "haxcms",
    pressbooksToSite: "pressbooks",
    gitbookToSite: "gitbook",
    notionToSite: "notion",
    elmslnToSite: "elmsln",
    ploneToSite: "plone",
    wordpressPagesToSite: "wordpress",
    drupalToSite: "drupal",
    openstaxToSite: "openstax",
    vitepressToSite: "vitepress",
    quartoToSite: "quarto",
    htmlToSite: "html",
  });
});

test("openstaxToSite reaches the openstax dispatcher case", opts, () => {
  assert.deepEqual(IMPORT_STRUCTURE_MAP.openstaxToSite, {
    platform: "openstax",
  });
});

test("vitepressToSite reaches the vitepress dispatcher case", opts, () => {
  assert.deepEqual(IMPORT_STRUCTURE_MAP.vitepressToSite, {
    platform: "vitepress",
  });
});

test("quartoToSite reaches the quarto dispatcher case", opts, () => {
  assert.deepEqual(IMPORT_STRUCTURE_MAP.quartoToSite, {
    platform: "quarto",
  });
});

test("file importers map to the backends' upload routes", opts, () => {
  const routes = {};
  Object.keys(IMPORT_STRUCTURE_MAP).forEach((name) => {
    if (IMPORT_STRUCTURE_MAP[name].routeKey) {
      routes[name] = IMPORT_STRUCTURE_MAP[name].routeKey;
    }
  });
  assert.deepEqual(routes, {
    docxToSite: "actions/import-docx",
    odtToSite: "actions/import-odt",
    pdfToSite: "actions/import-pdf",
    pptxToSite: "actions/import-pptx",
    odpToSite: "actions/import-odp",
    xlsxToSite: "actions/import-xlsx",
    odsToSite: "actions/import-xlsx",
    mdToSite: "actions/import-md",
  });
});

test("a file's extension picks its importer", opts, () => {
  Object.keys(IMPORT_STRUCTURE_FOR_EXTENSION).forEach((ext) => {
    assert.ok(
      IMPORT_STRUCTURE_MAP[IMPORT_STRUCTURE_FOR_EXTENSION[ext]],
      ext + " maps to a known importer",
    );
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-import-file-"));
  for (const name of ["Course.ODT", "deck.odp", "notes.txt", "a.markdown"]) {
    fs.writeFileSync(path.join(dir, name), "x");
  }
  assert.equal(defaultImportStructure("Course.ODT", dir), "odtToSite");
  assert.equal(defaultImportStructure("deck.odp", dir), "odpToSite");
  assert.equal(defaultImportStructure("notes.txt", dir), "mdToSite");
  assert.equal(defaultImportStructure("a.markdown", dir), "mdToSite");
  // not a local file: HAXcms to HAXcms, as before
  assert.equal(defaultImportStructure("missing.odt", dir), "haxcmsToSite");
  assert.equal(
    defaultImportStructure("https://example.com/site", dir),
    "haxcmsToSite",
  );
});

test("a local file becomes the importer's upload", opts, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-import-upload-"));
  fs.writeFileSync(path.join(dir, "Unit 1.odt"), "x");
  fs.mkdirSync(path.join(dir, "folder.odt"));
  assert.deepEqual(importFileUpload("Unit 1.odt", dir), [
    { originalname: "Unit 1.odt", path: path.join(dir, "Unit 1.odt") },
  ]);
  assert.equal(importFileUpload("missing.odt", dir), null);
  assert.equal(importFileUpload("folder.odt", dir), null);
  assert.equal(importFileUpload("https://example.com/a.docx", dir), null);
  assert.equal(importFileUpload("", dir), null);
});

test(
  "the --import-structure help and man page list every mapped importer",
  opts,
  () => {
    const root = path.join(__dirname, "..", "..");
    const help = fs.readFileSync(path.join(root, "src", "create.js"), "utf8");
    const manPage = fs.readFileSync(
      path.join(root, "src", "docs", "hax.1"),
      "utf8",
    );
    // `hax site` and `hax site:create` each declare their own --import-structure
    // help string, so every mapped name has to appear in both: a name listed in
    // one of them is still missing from the other command.
    const helpLists = Array.from(
      help.matchAll(/--import-structure <char>['"],\s*`([^`]*)`/g),
    ).map((match) => match[1]);
    assert.equal(
      helpLists.length,
      2,
      "both commands declare an --import-structure help string",
    );
    Object.keys(IMPORT_STRUCTURE_MAP).forEach((name) => {
      helpLists.forEach((list, index) => {
        assert.ok(
          list.includes(name),
          name +
            " is offered by --import-structure (help string " +
            (index + 1) +
            ")",
        );
      });
      assert.ok(
        manPage.includes(name),
        name + " is documented in the man page",
      );
    });
  },
);
