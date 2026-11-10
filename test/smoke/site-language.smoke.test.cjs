"use strict";

// Target 2: the --site-lang flag end to end. The unit tests cover
// normalizeSiteLanguage and applySiteLanguage against a mocked manifest; this
// checks what actually lands in site.json (metadata.site.settings.lang, read
// by themes for <html lang> and by i18n), that region subtags survive, that
// case is normalized, that the default stays en-US, and that an invalid code
// stops before any folder is created.

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

const { env } = isolatedEnv("hax-lang-home-");
const skipReason = cliSkipReason(env);
const opts = { skip: skipReason, timeout: 90000 };

const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-lang-"));
test.after(() => fs.rmSync(parentDir, { recursive: true, force: true }));

const langOf = (siteDir) => readSite(siteDir).metadata.site.settings.lang;

test("without --site-lang a site defaults to en-US", opts, () => {
  const siteDir = createSite(env, parentDir, "lang-default");
  assert.equal(langOf(siteDir), "en-US");
});

test("--site-lang es is written to metadata.site.settings.lang", opts, () => {
  const siteDir = createSite(env, parentDir, "lang-es", ["--site-lang", "es"]);
  assert.equal(langOf(siteDir), "es");
  // the rest of the settings block the backend seeds is kept, not replaced
  const settings = readSite(siteDir).metadata.site.settings;
  assert.equal(settings.publishPagesOn, true);
  assert.equal(settings.pathauto, true);
});

test("a region subtag is preserved (es-MX)", opts, () => {
  const siteDir = createSite(env, parentDir, "lang-esmx", [
    "--site-lang",
    "es-MX",
  ]);
  assert.equal(langOf(siteDir), "es-MX");
});

test("an upper-case code is normalized (ES -> es)", opts, () => {
  const siteDir = createSite(env, parentDir, "lang-upper", [
    "--site-lang",
    "ES",
  ]);
  assert.equal(langOf(siteDir), "es");
});

test("an explicit --site-lang en is honored", opts, () => {
  const siteDir = createSite(env, parentDir, "lang-en", ["--site-lang", "en"]);
  assert.equal(langOf(siteDir), "en");
});

test("an invalid --site-lang exits 1 and creates nothing", opts, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-lang-bad-"));
  try {
    const res = hax(
      env,
      ["site", "lang-bad", ...SITE_FLAGS, "--site-lang", "zz-notreal"],
      dir,
    );
    assert.equal(res.status, 1, res.describe);
    assert.match(res.output, /zz-notreal/, "the bad value is named");
    assert.match(res.output, /not a valid language code/);
    assert.deepEqual(listTree(dir), [], "no site folder left behind");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
