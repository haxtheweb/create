"use strict";

// Direct unit tests for site.js helpers that the siteCommandDetected /
// siteProcess harness tests (site-command-*.test.cjs) do not reach:
//   - applyNodeEdits: the backend operation each field becomes (content,
//     slug, tags, published, hideInMenu, theme, parent, order, title) plus
//     its error paths; pageBreakForItem and nodeEditRequests
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

// patched cliBridge: node:edit runs haxcms-nodejs operations through it
const cliModule = require("@haxtheweb/haxcms-nodejs/dist/cli.js");
const bridgeCalls = [];
let bridgeResponse = null;
cliModule.cliBridge = async (route, body, method) => {
  bridgeCalls.push({ route, body: JSON.parse(JSON.stringify(body)), method });
  return bridgeResponse || { res: { statusCode: 200, data: { status: 200 } } };
};

const utils = require("../../src/lib/utils.js");
utils.exec = async () => ({ stdout: "", stderr: "" });
utils.runCommand = async () => ({ stdout: "", stderr: "" });
utils.interactiveExec = async () => {};

const {
  available,
  skipReason,
  module: siteModule,
} = require("../_helpers/site-canary.cjs");
const {
  applyNodeEdits,
  applySiteLanguage,
  nextSiblingOrder,
  nodeEditRequests,
  pageBreakForItem,
  siteThemeList,
} = available ? siteModule : {};

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
  bridgeCalls.length = 0;
  bridgeResponse = null;
  updateCalls.length = 0;
  writeLocationCalls.length = 0;
  structureContextCalls.length = 0;
});

// --- applyNodeEdits (haxtheweb/issues#3292: through backend operations) ---

test(
  "applyNodeEdits sends a slug through the setSlug item operation",
  opts,
  async () => {
    const site = fakeSite();
    const page = fakePage();
    const changed = await applyNodeEdits(
      site,
      page,
      { slug: "x" },
      { options: {} },
    );
    assert.deepEqual(changed, ["slug"]);
    assert.equal(bridgeCalls.length, 1);
    assert.equal(bridgeCalls[0].route, "v1/items/item-1");
    assert.equal(bridgeCalls[0].method, "patch");
    // the backend, not the CLI, turns the reserved "x" into "x-x"
    assert.deepEqual(bridgeCalls[0].body, {
      site: { name: "fakesite" },
      operation: "setSlug",
      slug: "x",
    });
    assert.equal(updateCalls.length, 0, "no direct site.json write");
  },
);

test(
  "applyNodeEdits content goes through the content route with a page-break",
  opts,
  async () => {
    const site = fakeSite();
    const page = fakePage({
      indent: 2,
      parent: "item-2",
      metadata: { hideInMenu: true, tags: "a,b", published: false },
    });
    const changed = await applyNodeEdits(
      site,
      page,
      { content: "<p>fresh body</p>" },
      { options: {} },
    );
    assert.deepEqual(changed, ["content"]);
    assert.equal(writeLocationCalls.length, 0, "saveNode writes the page");
    assert.equal(bridgeCalls[0].route, "v1/content/item-1");
    const content = bridgeCalls[0].body.content;
    assert.equal(
      content,
      '<page-break item-id="item-1" title="Page One" slug="page-one" ' +
        'parent="item-2" order="1" depth="2" hide-in-menu="hide-in-menu" ' +
        'tags="a,b">' +
        "</page-break><p>fresh body</p>",
    );
  },
);

test(
  "applyNodeEdits sends booleans and lists to their item operations",
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
    assert.deepEqual(changed, ["tags", "published", "hideInMenu"]);
    assert.deepEqual(
      bridgeCalls.map((call) => call.body.operation),
      ["setTags", "setPublished", "setHideInMenu"],
    );
    assert.equal(bridgeCalls[1].body.published, false);
    assert.equal(bridgeCalls[2].body.hideInMenu, true);
    assert.equal(bridgeCalls[0].body.tags, "a, b");
  },
);

test(
  "applyNodeEdits validates the theme and saves it as an editor save",
  opts,
  async () => {
    const site = fakeSite({
      getPageContent: async () => "<p>existing</p>",
    });
    const changed = await applyNodeEdits(
      site,
      fakePage(),
      { theme: "clean-one" },
      { options: {} },
    );
    assert.deepEqual(changed, ["theme"]);
    assert.equal(bridgeCalls[0].route, "v1/content/item-1");
    assert.match(bridgeCalls[0].body.content, /developer-theme="clean-one"/);
    assert.ok(bridgeCalls[0].body.content.endsWith("<p>existing</p>"));
    bridgeCalls.length = 0;
    await assert.rejects(() =>
      applyNodeEdits(
        site,
        fakePage(),
        { theme: "nope-theme" },
        { options: {} },
      ),
    );
    assert.equal(bridgeCalls.length, 0, "nothing sent for an unknown theme");
  },
);

test(
  "applyNodeEdits parent change appends after the new siblings",
  opts,
  async () => {
    const site = fakeSite();
    // item-1 moves under item-2 (by slug); item-2 has no children yet
    const changed = await applyNodeEdits(
      site,
      fakePage(),
      { parent: "page-two" },
      { options: {} },
    );
    assert.deepEqual(changed, ["parent"]);
    assert.deepEqual(bridgeCalls[0].body, {
      site: { name: "fakesite" },
      operation: "setParent",
      parent: "item-2",
      order: 0,
    });
    bridgeCalls.length = 0;
    // a child moved to the top level lands after item-1 (order 2)
    await applyNodeEdits(
      site,
      fakePage({ id: "item-2", slug: "page-two", parent: "item-1" }),
      { parent: "null" },
      { options: {} },
    );
    assert.equal(bridgeCalls[0].body.parent, null);
    assert.equal(bridgeCalls[0].body.order, 3);
  },
);

test(
  "applyNodeEdits explicit --order wins over the append rule",
  opts,
  async () => {
    await applyNodeEdits(
      fakeSite(),
      fakePage(),
      { parent: "item-2", order: "7" },
      { options: {} },
    );
    assert.equal(bridgeCalls[0].body.parent, "item-2");
    assert.equal(bridgeCalls[0].body.order, 7);
  },
);

test("applyNodeEdits rejects bad parents and orders", opts, async () => {
  await assert.rejects(() =>
    applyNodeEdits(
      fakeSite(),
      fakePage(),
      { parent: "ghost" },
      { options: {} },
    ),
  );
  // a node can not be its own parent
  await assert.rejects(() =>
    applyNodeEdits(
      fakeSite(),
      fakePage(),
      { parent: "item-1" },
      { options: {} },
    ),
  );
  await assert.rejects(() =>
    applyNodeEdits(fakeSite(), fakePage(), { order: "abc" }, { options: {} }),
  );
  assert.equal(bridgeCalls.length, 0);
});

test("applyNodeEdits reports the backend's refusal", opts, async () => {
  bridgeResponse = {
    res: {
      statusCode: 403,
      data: {
        status: 403,
        data: { message: "Outline operations are disabled for this site" },
      },
    },
  };
  await assert.rejects(
    () =>
      applyNodeEdits(
        fakeSite(),
        fakePage(),
        { title: "Renamed Page" },
        { options: {} },
      ),
    /Outline operations are disabled/,
  );
});

// --- pageBreakForItem / nodeEditRequests ---

test("pageBreakForItem echoes state and escapes values", opts, () => {
  const html = pageBreakForItem({
    id: "item-9",
    title: 'Say "hi" & <wave>',
    slug: "say-hi",
    order: 3,
    indent: 1,
    metadata: {
      overridePathauto: true,
      locked: true,
      icon: "icons:star",
      theme: { element: "clean-one", key: "clean-one" },
    },
  });
  assert.equal(
    html,
    '<page-break item-id="item-9" title="Say &quot;hi&quot; &amp; &lt;wave&gt;" ' +
      'slug="say-hi" order="3" depth="1" published="published" ' +
      'override-pathauto="override-pathauto" locked="locked" ' +
      'icon="icons:star" developer-theme="clean-one"></page-break>',
  );
  // an explicit null theme drops it so saveNode removes the page theme
  assert.doesNotMatch(
    pageBreakForItem(
      { id: "a", title: "A", slug: "a", metadata: { theme: { key: "x" } } },
      { theme: null },
    ),
    /developer-theme/,
  );
});

test("nodeEditRequests keeps the parent for an order-only edit", opts, () => {
  const requests = nodeEditRequests(
    { id: "item-2", parent: "item-1", order: 4 },
    { order: 1 },
    [],
  );
  assert.deepEqual(requests, [
    {
      fields: ["order"],
      route: "v1/items/item-2",
      body: { operation: "setParent", parent: "item-1", order: 1 },
    },
  ]);
});

// the API's setParent appends whenever a parent is sent without an order,
// even when the parent does not change
test(
  "nodeEditRequests appends after siblings for an unchanged --parent",
  opts,
  () => {
    const items = [
      { id: "item-1", parent: null, order: 0 },
      { id: "item-2", parent: "item-1", order: 4 },
      { id: "item-3", parent: "item-1", order: 9 },
      { id: "item-4", parent: null, order: 4 },
      { id: "item-5", parent: null, order: 6 },
    ];
    // same parent id
    assert.deepEqual(
      nodeEditRequests(
        { id: "item-2", parent: "item-1", order: 4 },
        { parent: "item-1" },
        items,
      )[0].body,
      { operation: "setParent", parent: "item-1", order: 10 },
    );
    // null for a page already at the top level
    assert.deepEqual(
      nodeEditRequests(
        { id: "item-4", parent: null, order: 4 },
        { parent: null },
        items,
      )[0].body,
      { operation: "setParent", parent: null, order: 7 },
    );
  },
);

test(
  "applyNodeEdits --parent=null on a top-level page still moves it last",
  opts,
  async () => {
    // fakeSite top level: item-1 (order 2); a second top-level page at 0
    const site = fakeSite();
    site.manifest.items = [
      ...site.manifest.items,
      { id: "item-3", slug: "page-three", order: 0, parent: null },
    ];
    await applyNodeEdits(
      site,
      fakePage({ id: "item-3", slug: "page-three", order: 0 }),
      { parent: "null" },
      { options: {} },
    );
    assert.equal(bridgeCalls.length, 1);
    assert.deepEqual(bridgeCalls[0].body, {
      site: { name: "fakesite" },
      operation: "setParent",
      parent: null,
      order: 3,
    });
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
