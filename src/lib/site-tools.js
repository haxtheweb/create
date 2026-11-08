// Helpers behind the drush-inspired site commands (haxtheweb/issues#3228):
// site:validate, site:archive / site:restore, site:logs, site:list and
// node:generate. Kept out of programs/site.js so they can be unit tested
// without loading haxcms-nodejs. Messages people read go through t(); the
// codes and keys in structured output stay English for scripts and agents.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parse } from "node-html-parser";
import { runCommand } from "./utils.js";
import { t } from "./i18n.js";

// ---------- site:validate ----------

// true when `child` is `root` or inside it (both already resolved)
export function isInsideDirectory(root, child) {
  const rel = path.relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// resolve a site-relative path, or null when it would leave the site
export function resolveSitePath(siteDirectory, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.indexOf(String.fromCharCode(0)) !== -1
  ) {
    return null;
  }
  const root = path.resolve(siteDirectory);
  const target = path.resolve(root, relativePath);
  return isInsideDirectory(root, target) ? target : null;
}

function issue(code, item, message, extra = {}) {
  return {
    code: code,
    item: item ? item.id : null,
    message: message,
    ...extra,
  };
}

/**
 * Structural checks on site.json items. Pure: takes the items array only.
 * Returns { errors, warnings } of { code, item, message }.
 */
export function validateSiteItems(items) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(items)) {
    errors.push(issue("itemsMissing", null, t("siteValidateItemsMissing")));
    return { errors, warnings };
  }
  const byId = new Map();
  const slugs = new Map();
  for (const item of items) {
    if (!item || typeof item !== "object" || !item.id) {
      errors.push(issue("itemNoId", null, t("siteValidateItemNoId")));
      continue;
    }
    if (byId.has(item.id)) {
      errors.push(
        issue(
          "duplicateId",
          item,
          t("siteValidateDuplicateId", { id: item.id }),
        ),
      );
    } else {
      byId.set(item.id, item);
    }
    if (item.slug) {
      if (slugs.has(item.slug)) {
        errors.push(
          issue(
            "duplicateSlug",
            item,
            t("siteValidateDuplicateSlug", {
              slug: item.slug,
              other: slugs.get(item.slug),
            }),
          ),
        );
      } else {
        slugs.set(item.slug, item.id);
      }
    }
  }
  for (const item of byId.values()) {
    if (item.parent && !byId.has(item.parent)) {
      errors.push(
        issue(
          "missingParent",
          item,
          t("siteValidateMissingParent", {
            id: item.id,
            parent: item.parent,
          }),
        ),
      );
    }
  }
  // a parent chain that comes back to where it started
  const reported = new Set();
  for (const item of byId.values()) {
    const seen = new Set();
    let current = item;
    while (current && current.parent && byId.has(current.parent)) {
      if (seen.has(current.id)) {
        break;
      }
      seen.add(current.id);
      current = byId.get(current.parent);
      if (current.id === item.id) {
        if (!reported.has(item.id)) {
          seen.forEach((id) => reported.add(id));
          errors.push(
            issue(
              "parentCycle",
              item,
              t("siteValidateParentCycle", { id: item.id }),
            ),
          );
        }
        break;
      }
    }
  }
  return { errors, warnings };
}

// strip leading / trailing "/" with plain loops (no regex backtracking on
// long runs of slashes)
export function trimSlashes(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value.charAt(start) === "/") {
    start++;
  }
  while (end > start && value.charAt(end - 1) === "/") {
    end--;
  }
  return value.substring(start, end);
}

function stripDotSlash(value) {
  return value.startsWith("./") ? value.substring(2) : value;
}

// an href that points at another page of this site, normalized to a slug,
// or null for external links, anchors, files and site assets
export function internalLinkSlug(href) {
  if (typeof href !== "string") {
    return null;
  }
  let value = href.trim();
  if (
    value === "" ||
    value.startsWith("#") ||
    value.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    return null;
  }
  value = value.split("#")[0].split("?")[0];
  value = trimSlashes(stripDotSlash(value));
  if (value === "" || value.startsWith("files/") || value.startsWith("../")) {
    return null;
  }
  // a file extension means an asset (index.html, theme/x.css), not a slug
  if (/\.[a-z0-9]{1,5}$/i.test(value)) {
    return null;
  }
  return value;
}

// every files/... reference in an element's attributes
function filesReferences(node) {
  const refs = [];
  const attrs = node.attributes || {};
  for (const name of Object.keys(attrs)) {
    const value = String(attrs[name] || "").trim();
    let match = stripDotSlash(value);
    while (match.startsWith("/")) {
      match = match.substring(1);
    }
    if (match.startsWith("files/")) {
      refs.push(match.split("#")[0].split("?")[0]);
    }
  }
  return refs;
}

/**
 * Content checks for one page's HTML. Returns warnings only: a dead link or
 * an unknown tag never stops a site from rendering.
 * context: { item, slugs:Set, knownTags:Set, fileExists:(rel)=>bool }
 */
export function validatePageContent(html, context) {
  const warnings = [];
  const dom = parse(`<div>${html || ""}</div>`);
  const seenTags = new Set();
  const seenFiles = new Set();
  const seenLinks = new Set();
  for (const node of dom.querySelectorAll("*")) {
    const tag = String(node.rawTagName || "").toLowerCase();
    if (
      tag.includes("-") &&
      !context.knownTags.has(tag) &&
      !seenTags.has(tag)
    ) {
      seenTags.add(tag);
      warnings.push(
        issue(
          "unknownTag",
          context.item,
          t("siteValidateUnknownTag", { tag: tag, id: context.item.id }),
          { tag: tag },
        ),
      );
    }
    if (tag === "a") {
      const slug = internalLinkSlug(node.getAttribute("href"));
      if (slug && !context.slugs.has(slug) && !seenLinks.has(slug)) {
        seenLinks.add(slug);
        warnings.push(
          issue(
            "brokenLink",
            context.item,
            t("siteValidateBrokenLink", { href: slug, id: context.item.id }),
            { href: slug },
          ),
        );
      }
    }
    for (const ref of filesReferences(node)) {
      if (!seenFiles.has(ref) && !context.fileExists(ref)) {
        seenFiles.add(ref);
        warnings.push(
          issue(
            "missingFile",
            context.item,
            t("siteValidateMissingFile", { file: ref, id: context.item.id }),
            { file: ref },
          ),
        );
      }
    }
  }
  return warnings;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Full site:validate run against a site folder. registry is the
 * wc-registry.json object (tag -> import path). Returns
 * { errors, warnings, summary }.
 */
export function validateSite(siteDirectory, manifest, registry = {}) {
  const items = manifest && Array.isArray(manifest.items) ? manifest.items : [];
  const result = validateSiteItems(manifest ? manifest.items : null);
  const errors = [...result.errors];
  const warnings = [...result.warnings];
  const knownTags = new Set(Object.keys(registry || {}));
  const meta = (manifest && manifest.metadata) || {};
  if (meta.theme && meta.theme.element) {
    knownTags.add(String(meta.theme.element).toLowerCase());
  }
  // elements a site registers for itself (custom themes / dynamic loaders)
  const loader =
    meta.node && meta.node.dynamicElementLoader
      ? meta.node.dynamicElementLoader
      : {};
  Object.keys(loader).forEach((tag) => knownTags.add(tag.toLowerCase()));
  const slugs = new Set(
    items.filter((item) => item && item.slug).map((item) => item.slug),
  );
  const fileExists = (rel) => {
    const target = resolveSitePath(siteDirectory, safeDecode(rel));
    return !!target && fs.existsSync(target);
  };
  let pagesChecked = 0;
  for (const item of items) {
    if (!item || !item.id) {
      continue;
    }
    const location = item.location || `pages/${item.id}/index.html`;
    const pagePath = resolveSitePath(siteDirectory, location);
    if (!pagePath) {
      errors.push(
        issue(
          "unsafeLocation",
          item,
          t("siteValidateUnsafeLocation", { id: item.id, location: location }),
        ),
      );
      continue;
    }
    let html = null;
    try {
      html = fs.readFileSync(pagePath, "utf8");
    } catch {
      html = null;
    }
    if (html === null) {
      errors.push(
        issue(
          "missingPage",
          item,
          t("siteValidateMissingPage", { id: item.id, location: location }),
          { location: location },
        ),
      );
      continue;
    }
    pagesChecked++;
    warnings.push(
      ...validatePageContent(html, {
        item: item,
        slugs: slugs,
        knownTags: knownTags,
        fileExists: fileExists,
      }),
    );
  }
  return {
    errors: errors,
    warnings: warnings,
    summary: {
      items: items.length,
      pagesChecked: pagesChecked,
      errors: errors.length,
      warnings: warnings.length,
    },
  };
}

// ---------- site:rebuild ----------

export const REBUILD_TARGETS = [
  "rss",
  "sitemap",
  "search",
  "llms",
  "managed",
  "skills",
];

// --only "rss,search" -> ["rss","search"]; empty -> every target.
// Throws on an unknown target so a typo never silently rebuilds nothing.
export function parseRebuildTargets(only) {
  if (!only || only === true) {
    return [...REBUILD_TARGETS];
  }
  const picked = String(only)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const unknown = picked.filter((s) => !REBUILD_TARGETS.includes(s));
  if (unknown.length > 0) {
    throw new Error(
      t("siteRebuildUnknownTarget", {
        targets: unknown.join(", "),
        valid: REBUILD_TARGETS.join(", "),
      }),
    );
  }
  return REBUILD_TARGETS.filter((target) => picked.includes(target));
}

// ---------- site:archive / site:restore ----------

function pad(n) {
  return String(n).padStart(2, "0");
}

export function archiveTimestamp(date = new Date()) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

// keep the site name usable as a folder / file name
export function safeArchiveName(name) {
  const clean = String(name || "site")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^[.-]+/, "");
  return clean || "site";
}

// ~/.haxtheweb/archives/<site>/<site>-<timestamp>.tar.gz: outside the site,
// so an archive is never published along with it
export function defaultArchivePath(siteName, homeDir = os.homedir(), date) {
  const name = safeArchiveName(siteName);
  return path.join(
    homeDir,
    ".haxtheweb",
    "archives",
    name,
    `${name}-${archiveTimestamp(date)}.tar.gz`,
  );
}

export async function createSiteArchive(siteDirectory, target) {
  const root = path.resolve(siteDirectory);
  const file = path.resolve(target);
  if (isInsideDirectory(root, file)) {
    throw new Error(t("siteArchiveInsideSite"));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await runCommand("tar", [
    "-czf",
    file,
    "--exclude=./node_modules",
    "-C",
    root,
    ".",
  ]);
  return file;
}

/**
 * Why an archive is unsafe to restore, given the member names (tar -tzf) and
 * the type character of each member (first column of tar -tvzf). Pure.
 *
 * HAXcms sites carry managed symlinks (dist, build, wc-registry.json,
 * assets/babel-*.js) that point outside the site. Restore never extracts a
 * link and keeps the site's own links, so a symlink member is skipped rather
 * than refused, unless another member would be written through it.
 * Returns { problems: [{ code, entry, message }], skippedLinks: [names] }.
 */
export function archiveEntryProblems(names, types = []) {
  const problems = [];
  const skippedLinks = [];
  let hasSiteJson = false;
  const clean = (name) =>
    trimSlashes(stripDotSlash(String(name).replace(/\\/g, "/")));
  names.forEach((rawName, index) => {
    const name = String(rawName);
    const type = types[index] || "-";
    const normalized = name.replace(/\\/g, "/");
    if (clean(name) === "site.json" && (type === "-" || type === "0")) {
      hasSiteJson = true;
    }
    if (
      normalized.startsWith("/") ||
      /^[A-Za-z]:/.test(normalized) ||
      normalized.indexOf(String.fromCharCode(0)) !== -1
    ) {
      problems.push({
        code: "absolutePath",
        entry: name,
        message: t("siteRestoreAbsoluteEntry", { entry: name }),
      });
    } else if (normalized.split("/").includes("..")) {
      problems.push({
        code: "parentTraversal",
        entry: name,
        message: t("siteRestoreTraversalEntry", { entry: name }),
      });
    }
    if (type === "l") {
      skippedLinks.push(clean(name));
    } else if (type === "h") {
      problems.push({
        code: "hardLink",
        entry: name,
        message: t("siteRestoreLinkEntry", { entry: name }),
      });
    } else if (!["-", "d", "0", "5"].includes(type)) {
      problems.push({
        code: "specialFile",
        entry: name,
        message: t("siteRestoreSpecialEntry", { entry: name }),
      });
    }
  });
  // a member inside a symlinked folder would be written through the link
  const links = new Set(skippedLinks);
  names.forEach((rawName) => {
    const parts = clean(rawName).split("/");
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join("/");
      if (links.has(prefix)) {
        problems.push({
          code: "throughLink",
          entry: String(rawName),
          message: t("siteRestoreTraversalEntry", { entry: String(rawName) }),
        });
        break;
      }
    }
  });
  if (!hasSiteJson) {
    problems.push({
      code: "noSiteJson",
      entry: null,
      message: t("siteRestoreNoSiteJson"),
    });
  }
  return { problems: problems, skippedLinks: skippedLinks };
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

export async function inspectArchive(archive) {
  const names = splitLines((await runCommand("tar", ["-tzf", archive])).stdout);
  const types = splitLines(
    (await runCommand("tar", ["-tvzf", archive])).stdout,
  ).map((line) => line.charAt(0));
  if (names.length !== types.length) {
    // listings that don't line up can't be checked entry by entry
    return {
      problems: [
        {
          code: "unreadable",
          entry: null,
          message: t("siteRestoreUnreadable"),
        },
      ],
      skippedLinks: [],
    };
  }
  return archiveEntryProblems(names, types);
}

// throws with every problem listed; returns the inspection when restorable
export async function assertArchiveRestorable(archive) {
  const inspection = await inspectArchive(archive);
  if (inspection.problems.length > 0) {
    const err = new Error(inspection.problems.map((p) => p.message).join("\n"));
    err.problems = inspection.problems;
    throw err;
  }
  return inspection;
}

// remove a site's regular files and empty folders, keeping symlinks (the
// HAXcms-managed links) and node_modules
export function clearSiteFiles(directory, top = true) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || (top && entry.name === "node_modules")) {
      continue;
    }
    if (entry.isDirectory()) {
      clearSiteFiles(target, false);
      if (fs.readdirSync(target).length === 0) {
        fs.rmdirSync(target);
      }
    } else {
      fs.unlinkSync(target);
    }
  }
}

// recursive copy of plain files and folders. Links are skipped, and nothing
// is ever written through a link already in the destination: files are
// created exclusively (clearSiteFiles left only links and folders behind,
// so an existing name is a link), and a folder is entered only when its real
// path is where it should be. `to` must already be a real path.
export function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      try {
        fs.mkdirSync(target);
      } catch (e) {
        if (!e || e.code !== "EEXIST") {
          throw e;
        }
      }
      if (fs.realpathSync(target) === target) {
        copyTree(source, target);
      }
    } else if (entry.isFile()) {
      try {
        fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      } catch (e) {
        if (!e || e.code !== "EEXIST") {
          throw e;
        }
      }
    }
  }
}

/**
 * Replace a site's files with an archive's. The caller checks the archive
 * with assertArchiveRestorable and takes the safety archive first.
 * Symlinks and node_modules in the site are left as they are.
 */
export async function restoreSiteArchive(archive, siteDirectory) {
  const root = path.resolve(siteDirectory);
  const inspection = await assertArchiveRestorable(archive);
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "hax-restore-"));
  try {
    // links land only in the private staging folder (no member can sit
    // inside one, checked above) and copyTree never copies them out
    await runCommand("tar", ["-xzf", archive, "-C", staging]);
    // the archive has to hold a real site before the current one is cleared
    let manifest = null;
    try {
      manifest = JSON.parse(
        fs.readFileSync(path.join(staging, "site.json"), "utf8"),
      );
    } catch {
      manifest = null;
    }
    if (!manifest || !Array.isArray(manifest.items)) {
      throw new Error(t("siteRestoreInvalidSiteJson"));
    }
    clearSiteFiles(root);
    copyTree(staging, fs.realpathSync(root));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return { root: root, skippedLinks: inspection.skippedLinks };
}

// ---------- site:logs ----------

// the CLI's winston log and its rotated files (create1.log, create2.log ...),
// newest file first
export function cliLogFiles(homeDir = os.homedir()) {
  const dir = path.join(homeDir, ".haxtheweb");
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => /^create\d*\.log$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, "") || "0", 10);
      const nb = parseInt(b.replace(/\D/g, "") || "0", 10);
      return na - nb;
    })
    .map((f) => path.join(dir, f));
}

// JSON-lines log text -> entries, newest first. Lines that are not JSON are
// kept as plain messages so nothing is hidden.
export function parseLogLines(text) {
  const entries = [];
  for (const line of splitLines(text)) {
    try {
      const entry = JSON.parse(line);
      entries.push({
        timestamp: entry.timestamp || null,
        level: entry.level || "info",
        message:
          typeof entry.message === "string"
            ? entry.message
            : JSON.stringify(entry.message),
      });
    } catch {
      entries.push({ timestamp: null, level: "info", message: line });
    }
  }
  return entries.reverse();
}

export function filterLogEntries(entries, options = {}) {
  let out = entries;
  if (options.level) {
    const level = String(options.level).toLowerCase();
    out = out.filter((e) => String(e.level).toLowerCase() === level);
  }
  if (options.search) {
    const needle = String(options.search).toLowerCase();
    out = out.filter((e) => String(e.message).toLowerCase().includes(needle));
  }
  let limit = parseInt(options.limit, 10);
  if (Number.isNaN(limit) || limit <= 0) {
    limit = 50;
  }
  return out.slice(0, limit);
}

export function readCliLogs(options = {}, homeDir = os.homedir()) {
  let entries = [];
  for (const file of cliLogFiles(homeDir)) {
    entries = entries.concat(parseLogLines(fs.readFileSync(file, "utf8")));
  }
  return filterLogEntries(entries, options);
}

// ---------- site:list ----------

function readSiteSummary(siteDirectory) {
  const summary = {
    name: path.basename(siteDirectory),
    path: siteDirectory,
    title: null,
    theme: null,
    pages: 0,
    updated: null,
    valid: true,
  };
  try {
    const json = JSON.parse(
      fs.readFileSync(path.join(siteDirectory, "site.json"), "utf8"),
    );
    const meta = json.metadata || {};
    summary.title = json.title || null;
    summary.theme =
      meta.theme && meta.theme.element ? meta.theme.element : null;
    summary.pages = Array.isArray(json.items) ? json.items.length : 0;
    if (meta.site && meta.site.updated) {
      summary.updated = new Date(meta.site.updated * 1000).toISOString();
    }
  } catch {
    summary.valid = false;
  }
  return summary;
}

function subSites(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => path.join(dir, d.name))
    .filter((d) => fs.existsSync(path.join(d, "site.json")));
}

/**
 * Sites reachable from a folder: the folder itself when it is a site, a
 * HAXcms multi-site root's _sites/, and any sub-folders that are sites.
 */
export function listSites(directory) {
  const root = path.resolve(directory);
  const found = new Set();
  if (fs.existsSync(path.join(root, "site.json"))) {
    found.add(root);
  }
  subSites(path.join(root, "_sites")).forEach((d) => found.add(d));
  subSites(root).forEach((d) => found.add(d));
  return [...found]
    .sort((a, b) => a.localeCompare(b))
    .map((d) => readSiteSummary(d));
}

// ---------- node:generate ----------

export const GENERATE_MAX = 200;

export function generateCount(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) {
    return 10;
  }
  return Math.min(n, GENERATE_MAX);
}

// placeholder sentences: sample content, not text people need translated
const LOREM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.", // i18n-ignore
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.", // i18n-ignore
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.", // i18n-ignore
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.", // i18n-ignore
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.", // i18n-ignore
];

// DDD-friendly sample page: heading, paragraphs and a list, all plain HAX
// content so every theme can render it
export function placeholderPageHtml(index) {
  const pick = (offset) => LOREM[(index + offset) % LOREM.length];
  return [
    `<h2>${pick(0).split(",")[0]}</h2>`,
    `<p>${pick(0)} ${pick(1)}</p>`,
    `<p>${pick(2)} ${pick(3)}</p>`,
    "<ul>",
    `<li>${pick(1)}</li>`,
    `<li>${pick(2)}</li>`,
    `<li>${pick(4)}</li>`,
    "</ul>",
    `<p>${pick(4)}</p>`,
  ].join("\n");
}
