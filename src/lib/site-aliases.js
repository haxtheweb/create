// Site aliases (haxtheweb/issues#3229, local part): name a site once and use
// it from anywhere, drush style.
//
//   hax @mysite site:stats          -> runs `hax site site:stats` in that site
//   hax @mysite serve               -> runs `hax serve` in that site
//   hax site site:rsync --destination @prod
//
// Aliases live in ~/.haxtheweb/aliases.yml (yours) and in hax.aliases.yml
// files found from the current folder upward (a project's, checked in). The
// nearest file wins for a name. Each alias is
//
//   mysite:
//     root: ~/sites/mysite              # local folder (relative to the file)
//     rsync: user@host:/var/www/mysite  # optional rsync source/destination
//
// Remote aliases (url + login) come later with #3229; an alias with only a
// url is reported as not supported yet rather than silently ignored.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { load } from "js-yaml";
import { t } from "./i18n.js";

export const PROJECT_ALIAS_FILE = "hax.aliases.yml";

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function userAliasFile(homeDir = os.homedir()) {
  return path.join(homeDir, ".haxtheweb", "aliases.yml");
}

// hax.aliases.yml files from `cwd` up to the filesystem root, nearest first
export function projectAliasFiles(cwd = process.cwd()) {
  const files = [];
  let dir = path.resolve(cwd);
  for (;;) {
    const file = path.join(dir, PROJECT_ALIAS_FILE);
    if (fs.existsSync(file)) {
      files.push(file);
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return files;
}

function expandHome(value, homeDir) {
  if (value === "~") {
    return homeDir;
  }
  if (value.startsWith("~/")) {
    return path.join(homeDir, value.substring(2));
  }
  return value;
}

/**
 * Parse one alias file's YAML text. Pure apart from path resolution.
 * Returns { aliases: { name: alias }, problems: [message] }.
 */
export function parseAliasFile(text, file, homeDir = os.homedir()) {
  const aliases = {};
  const problems = [];
  let data = null;
  try {
    data = load(String(text || "")) || {};
  } catch (e) {
    problems.push(t("aliasFileInvalid", { file: file, reason: e.message }));
    return { aliases, problems };
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    problems.push(
      t("aliasFileInvalid", { file: file, reason: t("aliasNotAMap") }),
    );
    return { aliases, problems };
  }
  for (const name of Object.keys(data)) {
    const entry = data[name];
    if (!NAME.test(name)) {
      problems.push(t("aliasBadName", { name: name, file: file }));
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(t("aliasBadEntry", { name: name, file: file }));
      continue;
    }
    const alias = {
      name: name,
      file: file,
      root: null,
      rsync: null,
      url: null,
    };
    if (typeof entry.root === "string" && entry.root !== "") {
      alias.root = path.resolve(
        path.dirname(file),
        expandHome(entry.root, homeDir),
      );
    }
    if (typeof entry.rsync === "string" && entry.rsync !== "") {
      alias.rsync = entry.rsync;
    }
    if (typeof entry.url === "string" && entry.url !== "") {
      alias.url = entry.url;
    }
    if (!alias.root && !alias.rsync && !alias.url) {
      problems.push(t("aliasBadEntry", { name: name, file: file }));
      continue;
    }
    aliases[name] = alias;
  }
  return { aliases, problems };
}

/**
 * Every alias visible from `cwd`. The user file is read first and project
 * files override it, nearest last so it wins.
 */
export function loadAliases(cwd = process.cwd(), homeDir = os.homedir()) {
  const files = [userAliasFile(homeDir), ...projectAliasFiles(cwd).reverse()];
  const aliases = {};
  const problems = [];
  const read = [];
  for (const file of files) {
    let text = null;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    read.push(file);
    const parsed = parseAliasFile(text, file, homeDir);
    Object.assign(aliases, parsed.aliases);
    problems.push(...parsed.problems);
  }
  return { aliases, problems, files: read };
}

export function isAliasToken(value) {
  return typeof value === "string" && value.length > 1 && value[0] === "@";
}

function lookup(aliases, token) {
  const name = token.substring(1);
  const alias = aliases[name];
  if (!alias) {
    const known = Object.keys(aliases).map((n) => `@${n}`);
    throw new Error(
      t("aliasUnknown", {
        alias: token,
        known: known.length ? known.join(", ") : t("aliasNoneDefined"),
      }),
    );
  }
  return alias;
}

// an alias used as an rsync --source / --destination value
export function aliasRsyncTarget(alias) {
  if (alias.rsync) {
    return alias.rsync;
  }
  if (alias.root) {
    // rsync copies a folder's contents only with a trailing slash
    return alias.root.endsWith(path.sep) ? alias.root : alias.root + path.sep;
  }
  throw new Error(t("aliasRemoteNotYet", { alias: `@${alias.name}` }));
}

const VALUE_OPTIONS = ["--source", "--destination"];

/**
 * Rewrite process.argv-style arguments. Pure: aliases are passed in.
 * - `hax @name ...` runs in the alias's root (`--root`); an action such as
 *   `site:stats` or `node:add` gets the `site` command in front of it, and
 *   `hax @name` alone is `hax site`.
 * - `--source @name` / `--destination @name` become the alias's rsync target.
 * Returns { argv, alias } where alias is the leading alias used (or null).
 */
export function resolveAliasArgv(argv, aliases) {
  const out = argv.slice(0, 2);
  let rest = argv.slice(2);
  let used = null;
  if (rest.length > 0 && isAliasToken(rest[0])) {
    used = lookup(aliases, rest[0]);
    if (!used.root) {
      throw new Error(t("aliasRemoteNotYet", { alias: rest[0] }));
    }
    if (rest.some((arg) => arg === "--root" || arg.startsWith("--root="))) {
      throw new Error(t("aliasWithRoot", { alias: rest[0] }));
    }
    rest = rest.slice(1);
    if (rest.length === 0 || rest[0].startsWith("-") || rest[0].includes(":")) {
      rest = ["site", ...rest];
    }
    rest.push("--root", used.root);
  }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg : arg.substring(0, eq);
    if (!VALUE_OPTIONS.includes(flag)) {
      continue;
    }
    if (eq !== -1) {
      const value = arg.substring(eq + 1);
      if (isAliasToken(value)) {
        rest[i] = `${flag}=${aliasRsyncTarget(lookup(aliases, value))}`;
      }
    } else if (i + 1 < rest.length && isAliasToken(rest[i + 1])) {
      rest[i + 1] = aliasRsyncTarget(lookup(aliases, rest[i + 1]));
      i++;
    }
  }
  return { argv: out.concat(rest), alias: used };
}

// `hax alias list|show` rows
export function describeAliases(loaded) {
  return Object.keys(loaded.aliases)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const a = loaded.aliases[name];
      return {
        name: `@${name}`,
        root: a.root,
        rsync: a.rsync,
        url: a.url,
        file: a.file,
        rootExists: !!a.root && fs.existsSync(a.root),
      };
    });
}

// ---------- hax alias add / remove ----------

export function normalizeAliasName(value) {
  const name = String(value || "").replace(/^@/, "");
  if (!NAME.test(name)) {
    throw new Error(t("aliasBadNameArg", { name: name || "-" }));
  }
  return name;
}

function topLevelKey(line) {
  if (line === "" || /^\s/.test(line) || line.startsWith("#")) {
    return null;
  }
  const match = /^(['"]?)([^'":]+)\1\s*:/.exec(line);
  return match ? match[2] : null;
}

/**
 * Remove one alias's block from alias-file text, leaving every other line
 * (and comment) as written. Pure. Returns { text, removed }.
 */
export function removeAliasBlock(text, name) {
  const lines = String(text || "").split("\n");
  const out = [];
  let removed = false;
  let skipping = false;
  for (const line of lines) {
    const key = topLevelKey(line);
    if (skipping) {
      // the block is the key line plus everything indented under it
      if (key === null && (line === "" || /^\s/.test(line))) {
        continue;
      }
      skipping = false;
    }
    if (key === name) {
      skipping = true;
      removed = true;
      continue;
    }
    out.push(line);
  }
  let result = out.join("\n");
  if (
    String(text || "").endsWith("\n") &&
    !result.endsWith("\n") &&
    result !== ""
  ) {
    result += "\n";
  }
  return { text: result, removed: removed };
}

// one alias as YAML; values are double-quoted JSON strings, which YAML reads
// back exactly
export function aliasEntryYaml(name, entry) {
  const lines = [`${name}:`];
  if (entry.root) {
    lines.push(`  root: ${JSON.stringify(entry.root)}`);
  }
  if (entry.rsync) {
    lines.push(`  rsync: ${JSON.stringify(entry.rsync)}`);
  }
  return lines.join("\n") + "\n";
}

// a root as it should be written into `file`: relative (with /) in a
// project file so the file can be checked in, absolute in the user file
export function storedRoot(root, file, project) {
  if (!root) {
    return null;
  }
  if (!project) {
    return path.resolve(root);
  }
  const rel = path.relative(path.dirname(file), path.resolve(root));
  const posix = rel.split(path.sep).join("/");
  return posix === "" ? "." : posix.startsWith(".") ? posix : `./${posix}`;
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") {
      return "";
    }
    throw e;
  }
}

/**
 * Add (or with overwrite, replace) an alias in an alias file, creating the
 * file if needed. Existing entries and comments are kept.
 * { file, name, root, rsync, project, overwrite, homeDir }
 */
export function addAlias(options) {
  const name = normalizeAliasName(options.name);
  if (!options.root && !options.rsync) {
    throw new Error(t("aliasAddNeedsTarget"));
  }
  const text = readText(options.file);
  const existing = parseAliasFile(text, options.file, options.homeDir);
  if (existing.problems.length > 0 && text.trim() !== "") {
    // never rewrite a file we can't read cleanly
    throw new Error(existing.problems.join("\n"));
  }
  const without = removeAliasBlock(text, name);
  if (without.removed && !options.overwrite) {
    throw new Error(
      t("aliasExists", { alias: `@${name}`, file: options.file }),
    );
  }
  let body = without.text;
  if (body !== "" && !body.endsWith("\n")) {
    body += "\n";
  }
  body += aliasEntryYaml(name, {
    root: storedRoot(options.root, options.file, options.project),
    rsync: options.rsync || null,
  });
  // the result must still parse to the same alias before it is written
  const check = parseAliasFile(body, options.file, options.homeDir);
  if (check.problems.length > 0 || !check.aliases[name]) {
    throw new Error(
      check.problems.join("\n") ||
        t("aliasBadEntry", { name: name, file: options.file }),
    );
  }
  fs.mkdirSync(path.dirname(options.file), { recursive: true });
  fs.writeFileSync(options.file, body);
  return {
    name: `@${name}`,
    file: options.file,
    replaced: without.removed,
    alias: check.aliases[name],
  };
}

export function removeAlias(options) {
  const name = normalizeAliasName(options.name);
  const text = readText(options.file);
  const without = removeAliasBlock(text, name);
  if (!without.removed) {
    throw new Error(
      t("aliasNotInFile", { alias: `@${name}`, file: options.file }),
    );
  }
  fs.writeFileSync(options.file, without.text);
  return { name: `@${name}`, file: options.file };
}
