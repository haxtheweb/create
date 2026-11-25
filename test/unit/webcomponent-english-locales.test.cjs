// haxtheweb/issues#3262: in a monorepo whose root has the locale guard
// (webcomponents), a new element ships English-only; the guard rejects the
// template's translated stubs and the nightly translation PR fills them in.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "hax-wc-i18n-"));
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;

const { installClackStub } = require("../_helpers/clack-stub.cjs");
installClackStub();
require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  englishOnlyLocalesFor,
  removeNonEnglishLocales,
} = require("../../src/lib/programs/webcomponent.js");

// a fake monorepo: <root>/elements is where new elements go
function monorepo(withGuard) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-mono-"));
  fs.mkdirSync(path.join(root, "elements"));
  if (withGuard) {
    fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".github", "workflows", "locale-guard.yml"),
      "",
    );
  }
  return path.join(root, "elements");
}

test("a monorepo with the locale guard gets English-only locales", () => {
  const elements = monorepo(true);
  assert.equal(
    englishOnlyLocalesFor(
      { options: { isMonorepo: true } },
      { path: elements },
    ),
    true,
  );
});

test("a monorepo without the locale guard keeps the template's stubs", () => {
  const elements = monorepo(false);
  assert.equal(
    englishOnlyLocalesFor(
      { options: { isMonorepo: true } },
      { path: elements },
    ),
    false,
  );
});

test("standalone elements keep the template's stubs", () => {
  const elements = monorepo(true);
  assert.equal(
    englishOnlyLocalesFor({ options: {} }, { path: elements }),
    false,
  );
});

test("removes every non-English locale, including haxProperties ones", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-locales-"));
  const files = [
    "webcomponent.es.json",
    "webcomponent.zh.json",
    "webcomponent.haxProperties.ar.json",
    "webcomponent.en.json",
    "webcomponent.en-GB.json",
    "webcomponent.haxProperties.en.json",
    "README.md",
  ];
  files.forEach((f) => fs.writeFileSync(path.join(dir, f), "{}"));
  const removed = removeNonEnglishLocales(dir).sort();
  assert.deepEqual(removed, [
    "webcomponent.es.json",
    "webcomponent.haxProperties.ar.json",
    "webcomponent.zh.json",
  ]);
  assert.deepEqual(fs.readdirSync(dir).sort(), [
    "README.md",
    "webcomponent.en-GB.json",
    "webcomponent.en.json",
    "webcomponent.haxProperties.en.json",
  ]);
});

test("every shipped template keeps only its English locale file", () => {
  const templates = path.join(__dirname, "../../src/templates/webcomponent");
  fs.readdirSync(templates).forEach((name) => {
    const src = path.join(templates, name, "locales");
    if (!fs.existsSync(src)) {
      return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hax-tpl-${name}-`));
    const locales = path.join(dir, "locales");
    fs.cpSync(src, locales, { recursive: true });
    assert.ok(removeNonEnglishLocales(locales).length > 0, name);
    assert.deepEqual(fs.readdirSync(locales), ["webcomponent.en.json"], name);
  });
});

// Bundlers (@web/rollup-plugin-import-meta-assets) fail on a new URL() that
// names the locales/ folder or a file that is not there, so every locale URL
// in a template names the English file, the one an English-only monorepo
// keeps. haxtheweb/issues#3402
test("every template locale URL names the English file that ships", () => {
  const templates = path.join(__dirname, "../../src/templates/webcomponent");
  const LOCALE_URL =
    /new URL\(\s*(["'`])((?:\.\.?\/)+locales(?:\/[^"'`$]*)?)\1\s*,\s*import\.meta\.url\s*\)/g;
  fs.readdirSync(templates).forEach((name) => {
    const js = path.join(templates, name, "webcomponent.js");
    if (!fs.existsSync(js)) {
      return;
    }
    const urls = [...fs.readFileSync(js, "utf8").matchAll(LOCALE_URL)].map(
      (m) => m[2],
    );
    // a template without i18n wiring (minimal) has nothing to check
    if (!urls.length) {
      return;
    }
    urls.forEach((url) => {
      assert.equal(url, "./locales/<%= name %>.en.json", `${name}: ${url}`);
    });
    assert.ok(
      fs.existsSync(path.join(templates, name, "locales/webcomponent.en.json")),
      `${name} ships no English locale file`,
    );
  });
});

test("a missing locales folder is a no-op", () => {
  assert.deepEqual(
    removeNonEnglishLocales(path.join(os.tmpdir(), "hax-no-such-locales")),
    [],
  );
});
