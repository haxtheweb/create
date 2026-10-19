"use strict";

// Covers src/lib/i18n.js: language detection and normalization, the
// fallback chain (locale -> base language -> English -> key), placeholder
// filling, and extra namespaces loaded from asset folders.
require("@babel/register");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  t,
  tn,
  normalizeLanguage,
  detectLanguage,
  getLanguage,
  setLanguage,
  registerNamespace,
  interpolate,
  bundledElementLocales,
} = require("../../src/lib/i18n.js");

test("tests run in English", () => {
  assert.equal(process.env.HAX_LANG, "en");
  setLanguage(null);
  assert.equal(getLanguage(), "en");
});

test("normalizeLanguage handles OS locale formats", () => {
  assert.equal(normalizeLanguage("pt_BR.UTF-8"), "pt-BR");
  assert.equal(normalizeLanguage("de_DE@euro"), "de-DE");
  assert.equal(normalizeLanguage("de_DE.UTF-8"), "de-DE");
  assert.equal(normalizeLanguage("zh-Hans-CN"), "zh-CN");
  assert.equal(normalizeLanguage("es-419"), "es-419");
  assert.equal(normalizeLanguage("FR"), "fr");
  assert.equal(normalizeLanguage("haw"), "haw");
  // codes we ship under another name
  assert.equal(normalizeLanguage("fil_PH.UTF-8"), "tl-PH");
  assert.equal(normalizeLanguage("nn_NO"), "nb-NO");
  assert.equal(normalizeLanguage("iw"), "he");
  for (const v of [
    "C",
    "C.UTF-8",
    "POSIX",
    "",
    null,
    undefined,
    "123",
    "english",
  ]) {
    assert.equal(normalizeLanguage(v), null, String(v));
  }
});

test("detectLanguage: --lang, HAX_LANG, then the first locale variable that is set, OS, English", () => {
  const env = { HAX_LANG: "fr", LC_ALL: "de_DE.UTF-8", LANG: "es_ES.UTF-8" };
  assert.equal(
    detectLanguage(["node", "hax", "--lang", "ja"], env, "it-IT"),
    "ja",
  );
  assert.equal(
    detectLanguage(["node", "hax", "--lang=ko"], env, "it-IT"),
    "ko",
  );
  assert.equal(detectLanguage(["node", "hax"], env, "it-IT"), "fr");
  // POSIX: LC_ALL=C wins over LANG, so scripts get stable English
  assert.equal(
    detectLanguage(
      ["node", "hax"],
      { LC_ALL: "C", LC_MESSAGES: "nl_NL", LANG: "es" },
      "it",
    ),
    "en",
  );
  assert.equal(
    detectLanguage(["node", "hax"], { LC_MESSAGES: "nl_NL", LANG: "es" }, "it"),
    "nl-NL",
  );
  assert.equal(
    detectLanguage(["node", "hax"], { LANG: "C.UTF-8" }, "it-IT"),
    "en",
  );
  assert.equal(
    detectLanguage(
      ["node", "hax"],
      { LC_ALL: "", LANG: "de_DE.UTF-8" },
      "it-IT",
    ),
    "de-DE",
  );
  // HAX_LANG still beats LC_ALL=C
  assert.equal(
    detectLanguage(["node", "hax"], { HAX_LANG: "ja", LC_ALL: "C" }, ""),
    "ja",
  );
  assert.equal(detectLanguage(["node", "hax"], {}, ""), "en");
  // a bad --lang value falls through instead of breaking
  assert.equal(detectLanguage(["node", "hax", "--lang", "!!"], {}, ""), "en");
});

test("interpolate fills known placeholders and leaves the rest", () => {
  assert.equal(
    interpolate("Hi {name}, {count} new", { name: "Ana", count: 0 }),
    "Hi Ana, 0 new",
  );
  assert.equal(interpolate("Keep {missing}", { other: 1 }), "Keep {missing}");
  // passed but empty renders like a template literal did before
  assert.equal(
    interpolate("Description: {d}", { d: undefined }),
    "Description: undefined",
  );
  assert.equal(interpolate("Name: {n}", { n: null }), "Name: null");
  assert.equal(interpolate("Cost $& {v}", { v: "$'" }), "Cost $& $'");
  assert.equal(interpolate("No params", null), "No params");
});

test("tn falls back locale -> base language -> English -> fallback text", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-i18n-"));
  fs.writeFileSync(
    path.join(dir, "probe.en.json"),
    JSON.stringify({ hello: "Hello {name}", onlyEn: "English only" }),
  );
  fs.writeFileSync(
    path.join(dir, "probe.pt.json"),
    JSON.stringify({ hello: "Olá {name}", empty: "" }),
  );
  fs.writeFileSync(
    path.join(dir, "probe.pt-BR.json"),
    JSON.stringify({ hello: "Oi {name}" }),
  );
  fs.writeFileSync(path.join(dir, "probe.xx.json"), "{ not json");
  registerNamespace("probe", dir);
  try {
    setLanguage("pt-BR");
    assert.equal(tn("probe", "hello", { name: "Ana" }), "Oi Ana");
    assert.equal(tn("probe", "onlyEn"), "English only");
    setLanguage("pt");
    assert.equal(tn("probe", "hello", { name: "Ana" }), "Olá Ana");
    // empty strings count as missing
    assert.equal(tn("probe", "empty", null, "Fallback"), "Fallback");
    setLanguage("xx");
    assert.equal(tn("probe", "hello", { name: "Ana" }), "Hello Ana");
    assert.equal(tn("probe", "unknownKey"), "unknownKey");
    assert.equal(
      tn("probe", "unknownKey", { n: 2 }, "Default {n}"),
      "Default 2",
    );
    assert.equal(tn("nowhere", "k", null, "Not registered"), "Not registered");
  } finally {
    setLanguage("en");
  }
});

test("t reads the bundled create locale files", () => {
  setLanguage("en");
  const en = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../../src/locales/create.en.json"),
      "utf8",
    ),
  );
  const [key] = Object.keys(en);
  if (key) {
    assert.equal(t(key), en[key]);
  }
  assert.equal(t("definitely-not-a-key"), "definitely-not-a-key");
});

test("bundledElementLocales finds web component translations shipped with haxcms-nodejs", () => {
  const dir = bundledElementLocales("haxcms-elements");
  assert.ok(
    dir && fs.existsSync(path.join(dir, "haxcms.es.json")),
    String(dir),
  );
  // the CLI can read the browser's translations through a namespace
  registerNamespace("haxcms", dir);
  try {
    setLanguage("es");
    const es = JSON.parse(
      fs.readFileSync(path.join(dir, "haxcms.es.json"), "utf8"),
    );
    const [key] = Object.keys(es);
    assert.equal(tn("haxcms", key), es[key]);
  } finally {
    setLanguage("en");
  }
  assert.equal(bundledElementLocales("not-a-real-package"), null);
  assert.equal(
    bundledElementLocales("haxcms-elements", () => {
      throw new Error("missing");
    }),
    null,
  );
});
