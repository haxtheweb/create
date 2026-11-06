import * as p from "@clack/prompts";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import color from "picocolors";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { t } from "../i18n.js";

/**
 * `hax audit theme`: static check of HAXcms theme source against the theme
 * contract, the things HAXcms needs for editing, accessibility and the theme
 * picker to work. Each rule id matches a `@hax-theme-contract <id>` marker in
 * the `starter` custom theme template, so a finding points straight at the
 * block to restore.
 *
 * In a HAXsite it checks custom/src/; anywhere else it checks the theme
 * source files under the current directory. Built for agents first:
 * `--format json` gives rule, severity, file, line, message and a fix.
 */

// region names the Appearance > Regions dialog can assign
// (haxcms-site-store.js regionData / haxcms-appearance-admin-dialog.js)
export const THEME_REGION_NAMES = [
  "header",
  "sidebarFirst",
  "sidebarSecond",
  "contentTop",
  "contentBottom",
  "footerPrimary",
  "footerSecondary",
];

// theme-discovery.js silently drops these categories
export const BANNED_THEME_CATEGORIES = ["Blank", "Personal", "Module"];

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "public",
  "test",
  "tests",
  "demo",
  "locales",
  "coverage",
]);

/**
 * @description Does this source define a HAXcms theme?
 */
export function isThemeSource(source) {
  return (
    /\bHAXCMSLitElementTheme\b/.test(source) ||
    /@haxcms-theme-/.test(source) ||
    /\bclass\s+\w+\s+extends\s+[\s\S]{0,400}?\w*Theme\b/.test(source)
  );
}

/**
 * @description Find the theme files to audit.
 * @param root directory the audit runs from
 * @returns absolute paths of theme source files
 */
export function discoverThemeTargets(root) {
  const customSrc = path.join(root, "custom", "src");
  const start = existsSync(customSrc) ? customSrc : root;
  const out = [];
  const visit = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRECTORIES.has(name) || name.startsWith(".")) {
        continue;
      }
      const full = path.join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        visit(full);
      } else if (/\.(m)?js$/.test(name) && !/\.(test|spec)\./.test(name)) {
        let source = "";
        try {
          source = readFileSync(full, "utf8");
        } catch {
          continue;
        }
        if (isThemeSource(source)) {
          out.push(full);
        }
      }
    }
  };
  visit(start);
  return out.sort();
}

function lineOf(source, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
    }
  }
  return line;
}

function identifiersIn(node) {
  const names = [];
  walk.full(node, (n) => {
    if (n.type === "Identifier") {
      names.push(n.name);
    }
  });
  return names;
}

function memberName(node) {
  if (!node || !node.key) {
    return null;
  }
  return node.key.type === "Identifier" ? node.key.name : node.key.value;
}

/**
 * @description The class that is the theme: the one with `static get tag()`,
 * otherwise the first class in the file.
 */
function findThemeClass(ast) {
  const classes = [];
  walk.full(ast, (n) => {
    if (n.type === "ClassDeclaration" || n.type === "ClassExpression") {
      classes.push(n);
    }
  });
  const withTag = classes.find((c) =>
    c.body.body.some(
      (m) =>
        m.type === "MethodDefinition" && m.static && memberName(m) === "tag",
    ),
  );
  return withTag || classes[0] || null;
}

function findMethod(themeClass, name, opts = {}) {
  if (!themeClass) {
    return null;
  }
  return (
    themeClass.body.body.find(
      (m) =>
        m.type === "MethodDefinition" &&
        memberName(m) === name &&
        (opts.static === undefined || m.static === opts.static),
    ) || null
  );
}

function tagValue(method) {
  let value = null;
  if (method) {
    walk.simple(method, {
      ReturnStatement(n) {
        if (n.argument && n.argument.type === "Literal") {
          value = String(n.argument.value);
        }
      },
    });
  }
  return value;
}

/**
 * @description The first HTML tag in the first html`` template of render(),
 * ignoring comments. Returns null when render has no template.
 */
function firstRenderedTag(source, renderMethod) {
  const body = source.slice(renderMethod.start, renderMethod.end);
  const open = body.indexOf("html`");
  if (open === -1) {
    return null;
  }
  const markup = body.slice(open + 5).replace(/<!--[\s\S]*?-->/g, "");
  const m = markup.match(/<([a-zA-Z][\w-]*)([^>]*)>/);
  return m ? { tag: m[1].toLowerCase(), attrs: m[2] } : null;
}

/**
 * @description Check one theme source file.
 * @returns {{findings: object[], error: string|null, tag: string|null}}
 */
export function auditThemeSource(source) {
  const findings = [];
  const add = (rule, severity, offset, message, fix) => {
    findings.push({
      rule,
      severity,
      line: offset === null ? null : lineOf(source, offset),
      message,
      fix,
    });
  };
  let ast;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowHashBang: true,
    });
  } catch (e) {
    return { findings, error: e.message, tag: null };
  }

  const themeClass = findThemeClass(ast);
  const supers =
    themeClass && themeClass.superClass
      ? identifiersIn(themeClass.superClass)
      : [];
  const directBase = supers.includes("HAXCMSLitElementTheme");

  // base-class
  if (!themeClass) {
    add(
      "base-class",
      "error",
      null,
      t("auditThemeNoClass"),
      t("auditThemeBaseClassFix"),
    );
  } else if (!directBase && !supers.some((n) => /Theme$/.test(n))) {
    add(
      "base-class",
      "error",
      themeClass.start,
      t("auditThemeBaseClass"),
      t("auditThemeBaseClassFix"),
    );
  }

  // tag
  const tagMethod = findMethod(themeClass, "tag", { static: true });
  const tag = tagValue(tagMethod);
  if (!tag) {
    add(
      "tag",
      "error",
      themeClass ? themeClass.start : null,
      t("auditThemeTag"),
      t("auditThemeTagFix"),
    );
  }

  // define
  if (!/customElements\.define\s*\(/.test(source)) {
    add(
      "define",
      "error",
      null,
      t("auditThemeDefine"),
      t("auditThemeDefineFix"),
    );
  }

  // element-jsdoc
  // a JSDoc line that starts with the tag, not a mention of it in prose
  const elementDoc = source.match(
    /^[ \t]*(?:\/\*\*|\*)[ \t]*@element[ \t]+([\w-]+)/m,
  );
  if (!elementDoc) {
    add(
      "element-jsdoc",
      "warning",
      themeClass ? themeClass.start : null,
      t("auditThemeElementDoc"),
      t("auditThemeElementDocFix", { tag: tag || "my-theme" }),
    );
  } else if (tag && elementDoc[1] !== tag) {
    add(
      "element-jsdoc",
      "warning",
      elementDoc.index,
      t("auditThemeElementDocMismatch", { doc: elementDoc[1], tag }),
      t("auditThemeElementDocFix", { tag }),
    );
  }

  // render(): content-container + skip-link (inherited when not overridden)
  const renderMethod = findMethod(themeClass, "render", { static: false });
  if (renderMethod) {
    const renderSource = source.slice(renderMethod.start, renderMethod.end);
    const cc = renderSource.search(/id\s*=\s*["']contentcontainer["']/);
    const slotDiv = renderSource.search(/id\s*=\s*["']slot["']/);
    const slotAfter =
      slotDiv === -1
        ? ""
        : renderSource.slice(slotDiv).replace(/<!--[\s\S]*?-->/g, "");
    const defaultSlot = /<slot(\s[^>]*)?>/.exec(slotAfter);
    const defaultSlotUnnamed =
      defaultSlot && !/\bname\s*=/.test(defaultSlot[1] || "");
    if (cc === -1 || slotDiv === -1 || slotDiv < cc || !defaultSlotUnnamed) {
      add(
        "content-container",
        "error",
        renderMethod.start,
        t("auditThemeContentContainer"),
        t("auditThemeContentContainerFix"),
      );
    }
    const hasSkip =
      /class\s*=\s*["'][^"']*\bskip-link\b[^"']*["'][^>]*href\s*=\s*["']#contentcontainer["']|href\s*=\s*["']#contentcontainer["'][^>]*class\s*=\s*["'][^"']*\bskip-link\b/.test(
        renderSource,
      );
    if (!hasSkip) {
      add(
        "skip-link",
        "error",
        renderMethod.start,
        t("auditThemeSkipLink"),
        t("auditThemeSkipLinkFix"),
      );
    } else {
      const first = firstRenderedTag(source, renderMethod);
      if (first && !(first.tag === "a" && /skip-link/.test(first.attrs))) {
        add(
          "skip-link",
          "warning",
          renderMethod.start,
          t("auditThemeSkipLinkFirst", { tag: first.tag }),
          t("auditThemeSkipLinkFix"),
        );
      }
    }
  }

  // super-styles + style-dependent checks
  const stylesMethod = findMethod(themeClass, "styles", { static: true });
  if (stylesMethod) {
    const stylesSource = source.slice(stylesMethod.start, stylesMethod.end);
    if (!/super\.styles/.test(stylesSource)) {
      add(
        "super-styles",
        "error",
        stylesMethod.start,
        t("auditThemeSuperStyles"),
        t("auditThemeSuperStylesFix"),
      );
    }
    if (directBase) {
      const usesLightDark = /light-dark\s*\(/.test(source);
      const hasScheme = /color-scheme\s*:/.test(source);
      const hasDarkHook =
        /\[dark-mode\]|body\.dark-mode|prefers-color-scheme/.test(source);
      if (!usesLightDark && !hasDarkHook) {
        add(
          "dark-mode",
          "warning",
          stylesMethod.start,
          t("auditThemeDarkMode"),
          t("auditThemeDarkModeFix"),
        );
      } else if (usesLightDark && !hasScheme) {
        add(
          "dark-mode",
          "warning",
          stylesMethod.start,
          t("auditThemeColorScheme"),
          t("auditThemeDarkModeFix"),
        );
      }
      if (!/@media\b/.test(source)) {
        add(
          "responsive",
          "warning",
          stylesMethod.start,
          t("auditThemeResponsive"),
          t("auditThemeResponsiveFix"),
        );
      }
    }
  }

  // global-styles-super
  const globalStyles = findMethod(themeClass, "HAXCMSGlobalStyleSheetContent", {
    static: false,
  });
  if (
    globalStyles &&
    !/super\.HAXCMSGlobalStyleSheetContent\s*\(/.test(
      source.slice(globalStyles.start, globalStyles.end),
    )
  ) {
    add(
      "global-styles-super",
      "warning",
      globalStyles.start,
      t("auditThemeGlobalStyles"),
      t("auditThemeGlobalStylesFix"),
    );
  }

  // region-names
  const regionRe = /<site-region\b[^>]*?\bname\s*=\s*["']([^"'$]+)["']/g;
  let region;
  while ((region = regionRe.exec(source)) !== null) {
    if (!THEME_REGION_NAMES.includes(region[1])) {
      add(
        "region-names",
        "warning",
        region.index,
        t("auditThemeRegionName", { name: region[1] }),
        t("auditThemeRegionNameFix", { names: THEME_REGION_NAMES.join(", ") }),
      );
    }
  }

  // discovery-category
  const category = source.match(/@haxcms-theme-category\s+([^\n*]+)/);
  if (category) {
    const banned = category[1]
      .split(",")
      .map((c) => c.trim())
      .filter((c) => BANNED_THEME_CATEGORIES.includes(c));
    if (banned.length) {
      add(
        "discovery-category",
        "warning",
        category.index,
        t("auditThemeCategory", { categories: banned.join(", ") }),
        t("auditThemeCategoryFix"),
      );
    }
  }

  // globalthis + optional-chaining (HAX JS standards)
  walk.full(ast, (n) => {
    if (
      n.type === "MemberExpression" &&
      n.object.type === "Identifier" &&
      n.object.name === "window"
    ) {
      add(
        "globalthis",
        "warning",
        n.start,
        t("auditThemeGlobalThis"),
        t("auditThemeGlobalThisFix"),
      );
    }
    if (n.type === "ChainExpression") {
      add(
        "optional-chaining",
        "warning",
        n.start,
        t("auditThemeOptionalChaining"),
        t("auditThemeOptionalChainingFix"),
      );
    }
  });

  findings.sort((a, b) => (a.line || 0) - (b.line || 0));
  return { findings, error: null, tag };
}

function writeAllSync(text) {
  const buf = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buf.length) {
    try {
      offset += writeSync(1, buf, offset, buf.length - offset);
    } catch (e) {
      if (e.code !== "EAGAIN") {
        throw e;
      }
    }
  }
}

/**
 * @description Run `hax audit theme`.
 * @returns {{passed: boolean, themes: object[], findings: object[], errors: object[]}}
 */
export function auditThemeCommand(commandRun, root = null, deps = {}) {
  const options = (commandRun && commandRun.options) || {};
  const projectRoot = root || process.cwd();
  const asJson = options.format === "json";
  const strict = !!options.strict;
  const files = (deps.discover || discoverThemeTargets)(projectRoot);
  const themes = [];
  const findings = [];
  const errors = [];
  for (const file of files) {
    const rel = path.relative(projectRoot, file) || file;
    const result = auditThemeSource(readFileSync(file, "utf8"));
    if (result.error) {
      errors.push({ file: rel, error: result.error });
      continue;
    }
    themes.push({ file: rel, tag: result.tag });
    for (const f of result.findings) {
      findings.push({ file: rel, ...f });
    }
  }
  const errorCount =
    findings.filter((f) => f.severity === "error").length + errors.length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const passed =
    files.length > 0 && errorCount === 0 && (!strict || warningCount === 0);
  const report = { passed, themes, findings, errors };
  if (asJson) {
    (deps.write || writeAllSync)(JSON.stringify(report, null, 2) + "\n");
    return report;
  }
  p.intro(
    `${color.bgBlack(` 🎨 ${t("auditThemeStart", { path: color.underline(color.bold(color.yellow(projectRoot))) })} `)}`,
  );
  if (files.length === 0) {
    p.log.error(t("auditThemeNoThemes"));
    p.outro(t("auditThemeNoThemesHint"));
    return report;
  }
  for (const e of errors) {
    p.log.error(t("auditThemeParseError", { file: e.file, error: e.error }));
  }
  let current = null;
  for (const f of findings) {
    if (f.file !== current) {
      current = f.file;
      p.log.info(color.bold(f.file));
    }
    const where = f.line ? color.dim(`${f.line} `) : "";
    const line = `${where}[${f.rule}] ${f.message}\n  ${color.dim(f.fix)}`;
    if (f.severity === "error") {
      p.log.error(line);
    } else {
      p.log.warn(line);
    }
  }
  p.outro(
    passed
      ? `🎉 ${t("auditThemePassed", { count: themes.length, warnings: warningCount })}`
      : t("auditThemeFailed", { errors: errorCount, warnings: warningCount }),
  );
  return report;
}
