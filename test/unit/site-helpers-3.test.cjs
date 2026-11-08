"use strict";

// Direct unit tests for site.js helpers that the siteCommandDetected /
// siteProcess harness tests (site-command-*.test.cjs) do not reach:
//   - applyNodeEdits: every field branch (content, slug, tags, published,
//     hideInMenu, theme, parent, order, default) plus its error paths
//   - applySiteLanguage: explicit --site-lang, prompt-defaulted English,
//     missing language and backend failure
//   - siteThemeList: hidden/terrible/legacy filtering and the
//     custom/custom-elements.json discovery (isCommonTheme branch)
//   - nextSiblingOrder: per-parent ordering
//
// HOME is isolated BEFORE requiring site.js (via the canary) so HAXcms init
// lands in a temp dir. The haxcms-nodejs dist namespaces are patched BEFORE
// site.js is required because site.js destructures them into module locals.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ISOLATED_HOME = fs.mkdtempSync(
  path.join(os.tmpdir(), "hax-site-helpers-3-"),
);
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;
fs.mkdirSync(path.join(ISOLATED_HOME, ".haxtheweb"), { recursive: true });

const { installClackStub } = require("../_helpers/clack-stub.cjs");
const stub = installClackStub();
stub.text = async () => "placeholder";
stub.select = async () => null;
stub.confirm = async () => true;
stub.intro = () => {};
stub.note = () => {};
stub.outro = () => {};

require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");

// silence structured logging output
const logging = require("../../src/lib/logging.js");
logging.log = () => {};

// --- patched haxcms-nodejs namespaces (BEFORE site.js is required) ---
const haxcmsLib = require("@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js");
let structureContextResponse = null;
let structureContextCalls = [];
haxcmsLib.systemStructureContext = async (sitePath) => {
  structureContextCalls.push(sitePath);
  return structureContextResponse;
};
// deterministic slug + theme registry for the applyNodeEdits/siteThemeList tests
haxcmsLib.HAXCMS.generateSlugName = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
haxcmsLib.HAXCMS.getThemes = async () => ({
  "clean-one": { name: "Clean One", element: "clean-one", priority: 1 },
  "terrible-one": { name: "Terrible", terrible: true },
  "terrible-prefixed": { name: "Also Terrible" },
  "legacy-one": { name: "Legacy", legacy: true },
  "deprecated-one": { name: "Deprecated", deprecated: true },
  "hidden-one": { name: "Hidden", hidden: true },
});

const utils = require("../../src/lib/utils.js");
utils.exec = async () => ({ stdout: "", stderr: "" });
utils.runCommand = async () => ({ stdout: "", stderr: "" });
utils.interactiveExec = async () => {};

const {
  available,
  skipReason,
  module: siteModule,
} = require("../_helpers/site-canary.cjs");
const { applyNodeEdits, applySiteLanguage, nextSiblingOrder, siteThemeList } =
  available ? siteModule : {};

const opts = { skip: skipReason, timeout: 30000 };

// --- shared fakes ---

const updateCalls = [];
const writeLocationCalls = [];
function fakePage(overrides = {}) {
  return {
    id: "item-1",
    title: "Page One",
    slug: "page-one",
    order: 1,
    parent: null,
    metadata: {},
    writeLocation: async (content) => {
      writeLocationCalls.push(content);
      return true;
    },
    ...overrides,
  };
}

function fakeSite(overrides = {}) {
  return {
    name: "fakesite",
    siteDirectory: "/tmp/fake-site",
    updateNode: async (page) => {
      updateCalls.push(JSON.parse(JSON.stringify(page)));
      return { res: { statusCode: 200, data: { status: 200 } } };
    },
    getUniqueSlugName: (slug) => `${slug}-unique`,
    manifest: {
      items: [
        { id: "item-1", slug: "page-one", order: 2, parent: null },
        { id: "item-2", slug: "page-two", order: 1, parent: "item-1" },
      ],
    },
    loadNode: (idOrSlug) => {
      const slugById = { "item-1": "page-one", "item-2": "page-two" };
      const idBySlug = { "page-one": "item-1", "page-two": "item-2" };
      const id = slugById[idOrSlug] ? idOrSlug : idBySlug[idOrSlug];
      return id ? fakePage({ id: id, slug: slugById[id] }) : undefined;
    },
    ...overrides,
  };
}

test.beforeEach(() => {
  updateCalls.length = 0;
  writeLocationCalls.length = 0;
  structureContextCalls.length = 0;
});

// --- applyNodeEdits ---

test(
  "applyNodeEdits slug edit slugifies, dedupes and flags overridePathauto",
  opts,
  async () => {
    const site = fakeSite();
    const page = fakePage();
    const changed = await applyNodeEdits(
      site,
      page,
      { slug: "My New Slug" },
      { options: {} },
    );
    assert.deepEqual(changed, ["slug"]);
    assert.equal(page.slug, "my-new-slug-unique");
    assert.equal(page.metadata.overridePathauto, true);
    assert.equal(
      updateCalls.length,
      1,
      "structure change saved via updateNode",
    );
  },
);

test("applyNodeEdits skips empty slugs without saving", opts, async () => {
  const site = fakeSite();
  const page = fakePage();
  const changed = await applyNodeEdits(
    site,
    page,
    { slug: "" },
    { options: {} },
  );
  assert.deepEqual(changed, []);
  assert.equal(page.slug, "page-one");
  assert.equal(updateCalls.length, 0);
});

test(
  "applyNodeEdits content writes through page.writeLocation",
  opts,
  async () => {
    const site = fakeSite();
    const page = fakePage();
    const changed = await applyNodeEdits(
      site,
      page,
      { content: "<p>fresh body</p>" },
      { options: {} },
    );
    assert.deepEqual(changed, ["content"]);
    assert.deepEqual(writeLocationCalls, ["<p>fresh body</p>"]);
    assert.equal(updateCalls.length, 0, "content is not a structure change");
  },
);

test(
  "applyNodeEdits applies metadata fields as booleans and lists",
  opts,
  async () => {
    const site = fakeSite();
    const page = fakePage();
    const changed = await applyNodeEdits(
      site,
      page,
      { published: "false", hideInMenu: "true", tags: "a, b" },
      { options: {} },
    );
    assert.deepEqual(changed, ["published", "hideInMenu", "tags"]);
    assert.equal(page.metadata.published, false);
    assert.equal(page.metadata.hideInMenu, true);
    assert.equal(page.metadata.tags, "a, b");
    assert.equal(updateCalls.length, 1);
  },
);

test(
  "applyNodeEdits validates the theme against the registry",
  opts,
  async () => {
    const site = fakeSite();
    const page = fakePage();
    const changed = await applyNodeEdits(
      site,
      page,
      { theme: "clean-one" },
      { options: {} },
    );
    assert.deepEqual(changed, ["theme"]);
    assert.equal(page.metadata.theme.element, "clean-one");
    await assert.rejects(() =>
      applyNodeEdits(
        site,
        fakePage(),
        { theme: "nope-theme" },
        { options: {} },
      ),
    );
  },
);

test(
  "applyNodeEdits resolves parent by id or slug and rejects bad parents",
  opts,
  async () => {
    const site = fakeSite();
    const page = fakePage();
    let changed = await applyNodeEdits(
      site,
      page,
      { parent: "page-two" },
      { options: {} },
    );
    assert.deepEqual(changed, ["parent"]);
    assert.equal(page.parent, "item-2", "slug resolved to the parent id");
    await assert.rejects(() =>
      applyNodeEdits(site, fakePage(), { parent: "ghost" }, { options: {} }),
    );
    // a node can not be its own parent
    await assert.rejects(() =>
      applyNodeEdits(site, fakePage(), { parent: "item-1" }, { options: {} }),
    );
  },
);

test("applyNodeEdits rejects a non-numeric order", opts, async () => {
  await assert.rejects(() =>
    applyNodeEdits(fakeSite(), fakePage(), { order: "abc" }, { options: {} }),
  );
});

test(
  "applyNodeEdits default branch sets title-style fields",
  opts,
  async () => {
    const site = fakeSite();
    const page = fakePage();
    const changed = await applyNodeEdits(
      site,
      page,
      { title: "Renamed Page" },
      { options: {} },
    );
    assert.deepEqual(changed, ["title"]);
    assert.equal(page.title, "Renamed Page");
    assert.equal(updateCalls.length, 1);
  },
);

// --- applySiteLanguage ---

test(
  "applySiteLanguage writes an explicit --site-lang into the manifest",
  opts,
  async () => {
    const saveCalls = [];
    structureContextResponse = {
      name: "langsite",
      manifest: { metadata: {}, save: (arg) => saveCalls.push(arg) },
    };
    const lang = await applySiteLanguage(
      { options: { siteLang: "es" } },
      { path: "/tmp/lang-site", name: "mysite" },
    );
    assert.equal(lang, "es");
    assert.equal(saveCalls.length, 1);
    assert.equal(
      structureContextResponse.manifest.metadata.site.settings.lang,
      "es",
    );
    assert.equal(structureContextCalls.length, 1);
  },
);

test(
  "applySiteLanguage writes an explicit English choice too",
  opts,
  async () => {
    const saveCalls = [];
    structureContextResponse = {
      manifest: { metadata: {}, save: (arg) => saveCalls.push(arg) },
    };
    const lang = await applySiteLanguage(
      { options: { siteLang: "en" } },
      { path: "/tmp/lang-site", name: "mysite" },
    );
    assert.equal(lang, "en");
    assert.equal(saveCalls.length, 1);
  },
);

test(
  "applySiteLanguage ignores the prompt-defaulted English",
  opts,
  async () => {
    structureContextResponse = { manifest: { metadata: {} } };
    const lang = await applySiteLanguage(
      { options: {} },
      { path: "/tmp/lang-site", name: "mysite", siteLang: "en" },
    );
    assert.equal(lang, null);
    assert.equal(structureContextCalls.length, 0, "backend never contacted");
  },
);

test(
  "applySiteLanguage returns null with no language chosen",
  opts,
  async () => {
    const lang = await applySiteLanguage(
      { options: {} },
      { path: "/tmp/lang-site", name: "mysite" },
    );
    assert.equal(lang, null);
  },
);

test("applySiteLanguage swallows backend failures", opts, async () => {
  structureContextResponse = null;
  haxcmsLib.systemStructureContext = async () => {
    throw new Error("backend down");
  };
  const lang = await applySiteLanguage(
    { options: { siteLang: "de" } },
    { path: "/tmp/lang-site", name: "mysite" },
  );
  assert.equal(lang, null);
  // restore for any later tests
  haxcmsLib.systemStructureContext = async (sitePath) => {
    structureContextCalls.push(sitePath);
    return structureContextResponse;
  };
});

// --- siteThemeList / isCommonTheme ---

function writeCustomElements(dir, payload) {
  fs.mkdirSync(path.join(dir, "custom"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "custom", "custom-elements.json"),
    typeof payload === "string" ? payload : JSON.stringify(payload),
  );
}

test("siteThemeList filters hidden/terrible/legacy themes", opts, async () => {
  const values = (await siteThemeList(true)).map((item) => item.value);
  assert.ok(values.includes("clean-one"));
  [
    "terrible-one",
    "terrible-prefixed",
    "legacy-one",
    "deprecated-one",
    "hidden-one",
  ].forEach((hiddenValue) => {
    assert.ok(!values.includes(hiddenValue), hiddenValue + " filtered out");
  });
  assert.ok(values.includes("custom-theme"), "custom theme entry offered");
});

test("siteThemeList(false) keeps the non-common themes", opts, async () => {
  const values = (await siteThemeList(false, null)).map((item) => item.value);
  ["terrible-one", "legacy-one", "hidden-one"].forEach((value) => {
    assert.ok(values.includes(value), value + " present without coreOnly");
  });
});

test(
  "siteThemeList discovers custom themes from custom-elements.json",
  opts,
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-custom-themes-"));
    writeCustomElements(dir, {
      modules: [
        {
          declarations: [
            {
              superclass: { name: "HAXCMSLitElementTheme" },
              tagName: "my-custom-theme",
              name: "MyCustomTheme",
            },
          ],
        },
        {
          declarations: [
            {
              superclass: { name: "PolarisFlexTheme" },
              tagName: "polaris-custom",
            },
          ],
        },
        {
          // not a theme superclass: skipped
          declarations: [
            { superclass: { name: "LitElement" }, tagName: "not-a-theme" },
          ],
        },
        { declarations: [] },
        null,
      ],
    });
    const values = (await siteThemeList(true, dir)).map((item) => item.value);
    assert.ok(values.includes("my-custom-theme"));
    assert.ok(values.includes("polaris-custom"));
    assert.ok(!values.includes("not-a-theme"));
    const custom = (await siteThemeList(true, dir)).find(
      (item) => item.value === "my-custom-theme",
    );
    assert.equal(custom.label, "MyCustomTheme");
  },
);

test(
  "siteThemeList survives an invalid custom-elements.json",
  opts,
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-custom-bad-"));
    writeCustomElements(dir, "{ not json");
    const values = (await siteThemeList(true, dir)).map((item) => item.value);
    assert.deepEqual(values, ["clean-one", "custom-theme"]);
  },
);

// --- nextSiblingOrder ---

test("nextSiblingOrder returns max sibling order + 1", opts, () => {
  const items = [
    { id: "a", order: 0, parent: null },
    { id: "b", order: 5, parent: null },
    { id: "c", order: 9, parent: "a" },
  ];
  assert.equal(nextSiblingOrder(items, null), 6);
  assert.equal(nextSiblingOrder(items, "a"), 10);
  // no siblings under the parent: max stays -1, so the next order is 0
  assert.equal(nextSiblingOrder(items, "missing"), 0);
  assert.equal(nextSiblingOrder(null, null), 0);
  assert.equal(nextSiblingOrder([{ id: "x" }], null), 0);
});
