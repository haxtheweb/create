"use strict";

require("@babel/register");

// The CLI's copy of the HAX language registry and the site language options.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const load = async () => require("../../src/lib/language-registry.js");

test("matches codes, aliases and underscore forms", async () => {
  const r = await load();
  assert.equal(r.matchLanguageCode("en"), "en");
  assert.equal(r.matchLanguageCode("EN_us"), "en-US");
  assert.equal(r.matchLanguageCode("zh_CN"), "zh-CN");
  assert.equal(r.matchLanguageCode("zh"), "zh-CN");
  assert.equal(r.matchLanguageCode("no"), "nb");
  assert.equal(r.matchLanguageCode("fil"), "tl");
  assert.equal(r.matchLanguageCode("iw"), "he");
  assert.equal(r.matchLanguageCode("fr-CA"), null);
  assert.equal(r.matchLanguageCode(""), null);
  assert.equal(r.matchLanguageCode(null), null);
});

test("resolveLanguageAlias only answers for aliases", async () => {
  const r = await load();
  assert.equal(r.resolveLanguageAlias("iw"), "he");
  assert.equal(r.resolveLanguageAlias("fil"), "tl");
  assert.equal(r.resolveLanguageAlias("nn"), "nb");
  assert.equal(r.resolveLanguageAlias("he"), null);
  assert.equal(r.resolveLanguageAlias("xx"), null);
});

test("normalizeSiteLanguage keeps well formed custom tags", async () => {
  const r = await load();
  assert.equal(r.normalizeSiteLanguage("zh_CN"), "zh-CN");
  assert.equal(r.normalizeSiteLanguage("iw"), "he");
  assert.equal(r.normalizeSiteLanguage("fr-ca"), "fr-CA");
  assert.equal(r.normalizeSiteLanguage("english"), null);
  assert.equal(r.normalizeSiteLanguage("123"), null);
  assert.equal(r.normalizeSiteLanguage(""), null);
  assert.equal(r.normalizeSiteLanguage(undefined), null);
});

test("the prompt lists the ten most common languages first, then More", async () => {
  const r = await load();
  const options = r.getSiteLanguagePromptOptions("More languages…");
  assert.deepEqual(
    options.map((o) => o.value),
    ["en", "zh-CN", "hi", "es", "fr", "ar", "pt", "bn", "ru", "ja", "__more__"],
  );
  assert.equal(options[0].label, "English - en");
});

test("the full list has every language by name and no regional variants", async () => {
  const r = await load();
  const all = r.getAllLanguageOptions();
  assert.ok(all.length > 100);
  assert.ok(all.some((o) => o.value === "sw" && o.label === "Swahili - sw"));
  assert.ok(!all.some((o) => o.value === "en-GB"));
  const names = all.map((o) => o.label);
  const sorted = names.slice().sort((a, b) => a.localeCompare(b, "en"));
  assert.equal(names.length, sorted.length);
});

test("the bundled registry matches the sibling haxcms-nodejs copy when present", () => {
  const mine = path.join(__dirname, "../../src/lib/languages.json");
  const sibling = path.join(
    __dirname,
    "../../../haxcms-nodejs/src/coreConfig/languages.json",
  );
  if (!fs.existsSync(sibling)) return;
  assert.equal(fs.readFileSync(mine, "utf8"), fs.readFileSync(sibling, "utf8"));
});

// --- applySiteLanguage: writes the chosen language onto the new site ---

const os = require("node:os");
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "hax-site-lang-"));
process.env.HOME = isolated;
process.env.USERPROFILE = isolated;
const {
  skipReason,
  module: siteModule,
} = require("../_helpers/site-canary.cjs");
const siteOpts = { skip: skipReason, timeout: 30000 };

test(
  "applySiteLanguage writes nothing without a choice or for the prompt's English",
  siteOpts,
  async () => {
    const { applySiteLanguage } = siteModule;
    assert.equal(
      await applySiteLanguage({ options: {} }, { path: "/x", name: "y" }),
      null,
    );
    assert.equal(
      await applySiteLanguage(
        { options: {} },
        { path: "/x", name: "y", siteLang: "en" },
      ),
      null,
    );
    assert.equal(
      await applySiteLanguage(
        { options: {} },
        { path: "/x", name: "y", siteLang: "not a lang" },
      ),
      null,
    );
  },
);

test("applySiteLanguage is exported", siteOpts, () => {
  assert.equal(typeof siteModule.applySiteLanguage, "function");
});
