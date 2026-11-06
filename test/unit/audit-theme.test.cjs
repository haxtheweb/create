"use strict";

// Covers src/lib/programs/audit-theme.js (`hax audit theme`): each theme
// contract rule, that the shipped `starter` template meets the contract with
// zero findings, discovery (site custom/src/ vs current directory), the report
// (text and --format json, --strict) and routing from runAuditCommand.
const { installClackStub } = require("../_helpers/clack-stub.cjs");
const stub = installClackStub();

require("@babel/register");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const ejs = require("ejs");

const logs = [];
stub.intro = (m) => logs.push(["intro", String(m)]);
stub.outro = (m) => logs.push(["outro", String(m)]);
stub.note = (m) => logs.push(["note", String(m)]);
stub.log = {
  success: (m) => logs.push(["success", String(m)]),
  error: (m) => logs.push(["error", String(m)]),
  message: (m) => logs.push(["message", String(m)]),
  warn: (m) => logs.push(["warn", String(m)]),
  info: (m) => logs.push(["info", String(m)]),
};

const {
  auditThemeSource,
  auditThemeCommand,
  discoverThemeTargets,
  isThemeSource,
  THEME_REGION_NAMES,
} = require("../../src/lib/programs/audit-theme.js");
const { runAuditCommand } = require("../../src/lib/programs/audit-schema.js");

const TEMPLATES = path.join(__dirname, "../../src/templates/sitetheme");

function renderTemplate(name) {
  return ejs.render(fs.readFileSync(path.join(TEMPLATES, name), "utf8"), {
    year: 2026,
    author: "Test Author",
    className: "CustomTestTheme",
    customThemeName: "custom-test-theme",
  });
}

const STARTER = renderTemplate("starter-theme.js");

function rules(source) {
  return auditThemeSource(source).findings.map(
    (f) => `${f.severity}:${f.rule}`,
  );
}

// smallest theme that meets the contract
const MINIMAL = `
import { HAXCMSLitElementTheme, css, html } from "@haxtheweb/haxcms-elements/lib/core/HAXCMSLitElementTheme.js";
/**
 * @element mini-theme
 */
class MiniTheme extends HAXCMSLitElementTheme {
  static get tag() {
    return "mini-theme";
  }
  static get styles() {
    return [
      super.styles,
      css\`
        :host { color-scheme: light; color: light-dark(black, white); }
        :host([dark-mode]) { color-scheme: dark; }
        @media (max-width: 899px) { :host { display: block; } }
      \`,
    ];
  }
  render() {
    return html\`
      <a class="skip-link" href="#contentcontainer">\${this.t.skip}</a>
      <div id="contentcontainer"><div id="slot"><slot></slot></div></div>
    \`;
  }
}
globalThis.customElements.define(MiniTheme.tag, MiniTheme);
`;

test("the starter template meets the theme contract with no findings", () => {
  const r = auditThemeSource(STARTER);
  assert.equal(r.error, null);
  assert.equal(r.tag, "custom-test-theme");
  assert.deepEqual(r.findings, []);
});

test("every contract rule id in the starter template is one the audit reports", () => {
  const ids = [...STARTER.matchAll(/@hax-theme-contract\s+([\w-]+)/g)].map(
    (m) => m[1],
  );
  const known = new Set([
    "base-class",
    "tag",
    "define",
    "element-jsdoc",
    "content-container",
    "skip-link",
    "super-styles",
    "global-styles-super",
    "dark-mode",
    "responsive",
  ]);
  assert.ok(ids.length >= known.size);
  for (const id of ids) {
    assert.ok(known.has(id), `unknown contract id ${id}`);
  }
  for (const id of known) {
    assert.ok(ids.includes(id), `starter template lacks marker for ${id}`);
  }
});

test("the starter template uses only assignable region names", () => {
  const names = [...STARTER.matchAll(/<site-region[^>]*name="([^"]+)"/g)].map(
    (m) => m[1],
  );
  assert.ok(names.length > 0);
  for (const n of names) {
    assert.ok(THEME_REGION_NAMES.includes(n), n);
  }
});

test("a minimal correct theme passes", () => {
  assert.deepEqual(rules(MINIMAL), []);
});

test("base-class: a plain LitElement is not a theme", () => {
  const src = MINIMAL.replace(
    "extends HAXCMSLitElementTheme",
    "extends LitElement",
  );
  assert.ok(rules(src).includes("error:base-class"));
});

test("base-class: extending another theme is fine and skips direct-base checks", () => {
  const src = `
import { PolarisFlexTheme } from "@haxtheweb/polaris-theme/lib/polaris-flex-theme.js";
/** @element flexy-theme */
class FlexyTheme extends PolarisFlexTheme {
  static get tag() { return "flexy-theme"; }
  static get styles() { return [super.styles]; }
}
globalThis.customElements.define(FlexyTheme.tag, FlexyTheme);
`;
  assert.deepEqual(rules(src), []);
});

test("tag, define and element-jsdoc", () => {
  const noTag = MINIMAL.replace(
    /static get tag\(\) \{\s*return "mini-theme";\s*\}/,
    "",
  );
  assert.ok(rules(noTag).includes("error:tag"));
  const noDefine = MINIMAL.replace(
    "globalThis.customElements.define(MiniTheme.tag, MiniTheme);",
    "",
  );
  assert.ok(rules(noDefine).includes("error:define"));
  const noDoc = MINIMAL.replace("@element mini-theme", "");
  assert.ok(rules(noDoc).includes("warning:element-jsdoc"));
  const mismatch = MINIMAL.replace(
    "@element mini-theme",
    "@element other-theme",
  );
  const f = auditThemeSource(mismatch).findings.find(
    (x) => x.rule === "element-jsdoc",
  );
  assert.match(f.message, /other-theme/);
});

test("content-container: ids, nesting and an unnamed slot are required", () => {
  const renamed = MINIMAL.replace('id="contentcontainer"', 'id="content"');
  assert.ok(rules(renamed).includes("error:content-container"));
  const noSlotDiv = MINIMAL.replace(
    '<div id="slot"><slot></slot></div>',
    "<slot></slot>",
  );
  assert.ok(rules(noSlotDiv).includes("error:content-container"));
  const namedSlot = MINIMAL.replace(
    '<div id="slot"><slot></slot></div>',
    '<div id="slot"><slot name="x"></slot></div>',
  );
  assert.ok(rules(namedSlot).includes("error:content-container"));
});

test("content-container and skip-link are inherited when render() is not overridden", () => {
  const src = MINIMAL.replace(/render\(\) \{[\s\S]*?\n  \}\n/, "");
  const r = rules(src);
  assert.ok(!r.includes("error:content-container"));
  assert.ok(!r.includes("error:skip-link"));
});

test("skip-link: missing is an error, not first is a warning", () => {
  const missing = MINIMAL.replace(
    '<a class="skip-link" href="#contentcontainer">${this.t.skip}</a>',
    "",
  );
  assert.ok(rules(missing).includes("error:skip-link"));
  const late = MINIMAL.replace(
    '<a class="skip-link"',
    '<header></header><a class="skip-link"',
  );
  const f = auditThemeSource(late).findings.find((x) => x.rule === "skip-link");
  assert.equal(f.severity, "warning");
  assert.match(f.message, /header/);
  // attribute order does not matter, comments before it are ignored
  const swapped = MINIMAL.replace(
    '<a class="skip-link" href="#contentcontainer">',
    '<!-- a11y --><a href="#contentcontainer" class="skip-link">',
  );
  assert.deepEqual(rules(swapped), []);
});

test("super-styles and global-styles-super", () => {
  const noSuper = MINIMAL.replace("super.styles,", "");
  assert.ok(rules(noSuper).includes("error:super-styles"));
  const globals = MINIMAL.replace(
    "  render() {",
    "  HAXCMSGlobalStyleSheetContent() { return [css``]; }\n  render() {",
  );
  assert.ok(rules(globals).includes("warning:global-styles-super"));
  const globalsOk = MINIMAL.replace(
    "  render() {",
    "  HAXCMSGlobalStyleSheetContent() { return [...super.HAXCMSGlobalStyleSheetContent(), css``]; }\n  render() {",
  );
  assert.deepEqual(rules(globalsOk), []);
});

test("dark-mode: no dark styling, and light-dark() without color-scheme", () => {
  const none = MINIMAL.replace("color: light-dark(black, white);", "")
    .replace(":host([dark-mode]) { color-scheme: dark; }", "")
    .replace("color-scheme: light;", "");
  const f = auditThemeSource(none).findings.find((x) => x.rule === "dark-mode");
  assert.ok(f);
  const noScheme = MINIMAL.replace("color-scheme: light;", "").replace(
    ":host([dark-mode]) { color-scheme: dark; }",
    ":host([dark-mode]) { }",
  );
  const g = auditThemeSource(noScheme).findings.find(
    (x) => x.rule === "dark-mode",
  );
  assert.match(g.message, /color-scheme/);
});

test("responsive: a theme with styles needs a @media fallback", () => {
  const src = MINIMAL.replace(
    "@media (max-width: 899px) { :host { display: block; } }",
    "",
  );
  assert.ok(rules(src).includes("warning:responsive"));
});

test("region-names: only names the Appearance dialog can assign", () => {
  const src = MINIMAL.replace(
    '<div id="contentcontainer">',
    '<site-region name="belowMenu"></site-region><site-region name="footerPrimary"></site-region><site-region name="${this.r}"></site-region><div id="contentcontainer">',
  );
  const found = auditThemeSource(src).findings.filter(
    (x) => x.rule === "region-names",
  );
  assert.equal(found.length, 1);
  assert.match(found[0].message, /belowMenu/);
  assert.match(found[0].fix, /footerSecondary/);
});

test("discovery-category, globalthis and optional-chaining", () => {
  const cat = MINIMAL.replace(
    "@element mini-theme",
    "@haxcms-theme-category Website, Blank\n * @element mini-theme",
  );
  const f = auditThemeSource(cat).findings.find(
    (x) => x.rule === "discovery-category",
  );
  assert.match(f.message, /Blank/);
  const win = MINIMAL.replace(
    "globalThis.customElements",
    "window.customElements",
  );
  assert.ok(rules(win).includes("warning:globalthis"));
  const chain = MINIMAL.replace("${this.t.skip}", "${this.t?.skip}");
  assert.ok(rules(chain).includes("warning:optional-chaining"));
});

test("findings carry line numbers and a fix", () => {
  const src = MINIMAL.replace("super.styles,", "");
  const f = auditThemeSource(src).findings.find(
    (x) => x.rule === "super-styles",
  );
  assert.equal(typeof f.line, "number");
  assert.ok(f.line > 1);
  assert.ok(f.fix.length > 0);
});

test("unparseable source reports an error instead of findings", () => {
  const r = auditThemeSource("class {");
  assert.ok(r.error);
  assert.deepEqual(r.findings, []);
});

test("isThemeSource and discoverThemeTargets", () => {
  assert.ok(isThemeSource(MINIMAL));
  assert.ok(!isThemeSource("export const x = 1;"));
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "hax-audit-theme-"));
  fs.mkdirSync(path.join(site, "custom/src"), { recursive: true });
  fs.writeFileSync(
    path.join(site, "custom/src/custom.js"),
    'import "./mini.js";',
  );
  fs.writeFileSync(path.join(site, "custom/src/mini.js"), MINIMAL);
  fs.mkdirSync(path.join(site, "elsewhere"));
  fs.writeFileSync(path.join(site, "elsewhere/other.js"), MINIMAL);
  // in a site, only custom/src is checked
  assert.deepEqual(
    discoverThemeTargets(site).map((f) => path.relative(site, f)),
    [path.join("custom", "src", "mini.js")],
  );
  // a component folder: walk it, skipping node_modules/test/demo
  const comp = fs.mkdtempSync(path.join(os.tmpdir(), "hax-audit-theme-c-"));
  fs.writeFileSync(path.join(comp, "my-theme.js"), MINIMAL);
  for (const d of ["node_modules", "test", "demo"]) {
    fs.mkdirSync(path.join(comp, d));
    fs.writeFileSync(path.join(comp, d, "x.js"), MINIMAL);
  }
  assert.deepEqual(
    discoverThemeTargets(comp).map((f) => path.basename(f)),
    ["my-theme.js"],
  );
});

function siteWith(source) {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "hax-audit-theme-s-"));
  fs.mkdirSync(path.join(site, "custom/src"), { recursive: true });
  fs.writeFileSync(path.join(site, "custom/src/t.js"), source);
  return site;
}

test("auditThemeCommand --format json", () => {
  let out = "";
  const site = siteWith(MINIMAL.replace("super.styles,", ""));
  const r = auditThemeCommand({ options: { format: "json" } }, site, {
    write: (s) => {
      out += s;
    },
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.passed, false);
  assert.equal(r.passed, false);
  assert.deepEqual(parsed.themes, [
    { file: path.join("custom", "src", "t.js"), tag: "mini-theme" },
  ]);
  const f = parsed.findings.find((x) => x.rule === "super-styles");
  assert.equal(f.severity, "error");
  assert.equal(f.file, path.join("custom", "src", "t.js"));
});

test("auditThemeCommand: warnings pass unless --strict, no themes fails", () => {
  const site = siteWith(MINIMAL.replace("@element mini-theme", ""));
  const quiet = { write: () => {} };
  assert.equal(
    auditThemeCommand({ options: { format: "json" } }, site, quiet).passed,
    true,
  );
  assert.equal(
    auditThemeCommand(
      { options: { format: "json", strict: true } },
      site,
      quiet,
    ).passed,
    false,
  );
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "hax-audit-theme-e-"));
  assert.equal(
    auditThemeCommand({ options: { format: "json" } }, empty, quiet).passed,
    false,
  );
});

test("auditThemeCommand text report", () => {
  logs.length = 0;
  const site = siteWith(MINIMAL.replace("super.styles,", ""));
  auditThemeCommand({ options: {} }, site);
  assert.ok(
    logs.some(([k, m]) => k === "error" && m.includes("[super-styles]")),
  );
  assert.ok(logs.some(([k]) => k === "outro"));
  logs.length = 0;
  auditThemeCommand({ options: {} }, siteWith(MINIMAL));
  assert.ok(logs.some(([k, m]) => k === "outro" && m.includes("🎉")));
  logs.length = 0;
  auditThemeCommand(
    { options: {} },
    fs.mkdtempSync(path.join(os.tmpdir(), "hax-audit-theme-n-")),
  );
  assert.ok(logs.some(([k]) => k === "error"));
});

test("runAuditCommand routes theme", () => {
  const calls = [];
  const code = runAuditCommand(
    { arguments: { type: "theme" }, options: {} },
    null,
    "/x",
    {
      auditTheme: (cr, root) => {
        calls.push(root);
        return { passed: false };
      },
      exit: (c) => c,
    },
  );
  assert.equal(code, 1);
  assert.deepEqual(calls, ["/x"]);
});
