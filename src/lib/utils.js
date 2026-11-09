import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as child_process from "child_process";
import * as util from "node:util";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { t } from "./i18n.js";
export const exec = util.promisify(child_process.exec);
export const spawn = child_process.spawn;
const execFilePromise = util.promisify(child_process.execFile);

/**
 * Run a program with an argument array and an explicit cwd — no shell string.
 * Security (no-shell-strings): values passed as args / cwd can never be parsed as shell
 * syntax, unlike exec(`cd ${dir} && cmd ${arg}`). On Windows the npm/yarn/
 * surge/netlify/vercel shims are .cmd files, which Node only runs through a
 * shell (same approach interactiveExec already uses); paths travel in `cwd`
 * there too, so they are never part of the command line.
 * @param {string} command program name (npm, git, rsync, ...)
 * @param {string[]} args argument array
 * @param {object} options child_process options (cwd, env, timeout, ...)
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export function runCommand(command, args = [], options = {}) {
  const runOptions = { maxBuffer: 1024 * 1024 * 50, ...options };
  let runArgs = args;
  if (process.platform === "win32" && typeof runOptions.shell === "undefined") {
    runOptions.shell = true;
    // with shell: true Node joins args with spaces, so quote any arg that
    // contains whitespace or quotes (e.g. -m "first commit")
    runArgs = args.map((arg) =>
      /[\s"]/.test(arg) ? `"${String(arg).replace(/"/g, '""')}"` : arg,
    );
  }
  return execFilePromise(command, runArgs, runOptions);
}

export function getTimeDifference(timestamp1, timestamp2) {
  const time1 = new Date(timestamp1).getTime();
  const time2 = new Date(timestamp2).getTime();

  if (isNaN(time1) || isNaN(time2)) {
    return "Invalid date format";
  }

  const difference = Math.abs(time2 - time1);

  const seconds = Math.floor(difference / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  return {
    days,
    hours: hours % 24,
    minutes: minutes % 60,
    seconds: seconds % 60,
  };
}

// write user config file
export function writeConfigFile(filename, data) {
  let tempDir = os.homedir();
  if (process.env.VERCEL_ENV) {
    tempDir = "/tmp/";
  }
  const filePath = path.join(tempDir, ".haxtheweb", filename);
  try {
    fs.writeFileSync(filePath, data);
    return filePath;
  } catch {
    return null;
  }
}

// read user config file
export function readConfigFile(filename) {
  let tempDir = os.homedir();
  if (process.env.VERCEL_ENV) {
    tempDir = "/tmp/";
  }
  const filePath = path.join(tempDir, ".haxtheweb", filename);
  try {
    let file = fs.readFileSync(filePath, "utf8");
    return file;
  } catch {
    return null;
  }
}

export async function interactiveExec(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    process.env.NODE_NO_WARNINGS = 1;
    const spawnOptions = { stdio: "inherit", ...options };
    if (
      process.platform === "win32" &&
      typeof spawnOptions.shell === "undefined"
    ) {
      spawnOptions.shell = true;
    }
    const child = spawn(command, args, spawnOptions);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    child.on("error", (err) => {
      reject(err);
    });
  });
}

export function findAvailablePort(startPort = 3000, maxPort = 65535) {
  return new Promise((resolve, reject) => {
    function tryPort(port) {
      if (port > maxPort) {
        reject(new Error(t("utilNoAvailablePorts")));
        return;
      }
      const server = createServer();
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          tryPort(port + 1);
        } else {
          reject(err);
        }
      });
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port);
    }
    tryPort(startPort);
  });
}

export const SITE_FILE_NAME = "site.json";
/**
 * Helper to convert dash to camel; important when reading attributes.
 */
export function dashToCamel(str) {
  return capitalizeFirstLetter(
    str.replace(/-([a-z0-9])/g, function (g) {
      return g[1].toUpperCase();
    }),
  );
}

//capitalize only the first letter of the string.
export function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
// generate a cryptographically-secure unique id (L-3: was Math.random-based).
export function generateUUID() {
  return randomUUID();
}

/**
 * Helper to convert camel case to dash; important when setting attributes.
 */
export function camelToDash(str) {
  return str
    .replace(/\W+/g, "-")
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

// Version-control and generated directories a bulk rewrite must never
// descend into: rewriting .git/ objects corrupts the repository.
export const REWRITE_SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".bzr",
  "node_modules",
  "dist",
  "public",
]);

// read in all files recursively for rewriting. Symlinks are yielded as
// themselves (never followed) and VCS/generated directories are skipped.
export function* readAllFiles(dir, skipDirs = REWRITE_SKIP_DIRS) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      if (skipDirs.has(file.name)) {
        continue;
      }
      yield* readAllFiles(path.join(dir, file.name), skipDirs);
    } else {
      yield path.join(dir, file.name);
    }
  }
}

// File extensions a bulk text rewrite may touch. Anything else is treated
// as binary unless its content is clearly text (see isProbablyTextBuffer).
export const TEXT_FILE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".json",
  ".json5",
  ".jsonc",
  ".html",
  ".htm",
  ".xml",
  ".svg",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".md",
  ".mdx",
  ".markdown",
  ".txt",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".sh",
  ".bash",
  ".zsh",
  ".bat",
  ".cmd",
  ".ps1",
  ".twig",
  ".ejs",
  ".hbs",
  ".njk",
  ".vue",
  ".svelte",
  ".csv",
  ".tsv",
  ".graphql",
  ".gql",
  ".map",
  ".lock",
  ".editorconfig",
  ".gitignore",
  ".gitattributes",
  ".npmignore",
  ".npmrc",
  ".nvmrc",
  ".prettierrc",
  ".eslintrc",
  ".babelrc",
  ".dddignore",
  ".surgeignore",
  ".netlifyignore",
  ".vercelignore",
  ".htaccess",
]);

// Extensionless files that are conventionally text.
const TEXT_FILE_BASENAMES = new Set([
  "LICENSE",
  "README",
  "CHANGELOG",
  "CONTRIBUTING",
  "CODEOWNERS",
  "Dockerfile",
  "Makefile",
  "CNAME",
  "llms.txt",
]);

export const BINARY_SNIFF_BYTES = 8192;

/**
 * Heuristic: a NUL byte in the first 8 KB means binary. Text files, even in
 * UTF-16-free codebases like this one, never contain NUL.
 */
export function isProbablyTextBuffer(buffer) {
  const limit = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0) {
      return false;
    }
  }
  return true;
}

/**
 * True when a file may be rewritten as UTF-8 text. The extension/basename
 * allowlist decides first; anything not on it is left alone unless its
 * content is NUL-free AND round-trips through UTF-8 byte-for-byte, which
 * rules out fonts, images, archives, PDFs and git objects. `buffer` is the
 * file's content (passed in so the caller reads each file once).
 */
export function isRewritableTextFile(filePath, buffer) {
  const base = path.basename(filePath);
  const ext = path.extname(base).toLowerCase();
  const allowlisted =
    TEXT_FILE_EXTENSIONS.has(ext) ||
    TEXT_FILE_EXTENSIONS.has(base.toLowerCase()) ||
    TEXT_FILE_BASENAMES.has(base) ||
    (ext === "" && base.startsWith("."));
  if (!isProbablyTextBuffer(buffer)) {
    return false;
  }
  if (!allowlisted) {
    return false;
  }
  return utf8RoundTrips(buffer);
}

// A buffer is only safe to rewrite as a JS string if decoding and
// re-encoding it as UTF-8 yields the identical bytes; otherwise invalid
// sequences would be replaced with U+FFFD and the file silently corrupted.
export function utf8RoundTrips(buffer) {
  return Buffer.from(buffer.toString("utf8"), "utf8").equals(buffer);
}

// Allowed npm clients that get interpolated into shell commands (M-2).
// Keep this allowlist in sync with the --npm-client option help text.
const ALLOWED_NPM_CLIENTS = new Set(["npm", "yarn", "pnpm"]);

/**
 * Validate --npm-client against a strict allowlist.
 * Security (npm-client-allowlist): npmClient is interpolated into many exec() shell strings;
 * an unvalidated value like "npm; rm -rf ~" would be command injection.
 * Returns the client if allowed, otherwise throws.
 * @param {string} client
 * @returns {string}
 */
export function validateNpmClient(client) {
  if (typeof client !== "string" || !ALLOWED_NPM_CLIENTS.has(client)) {
    throw new Error(
      t("utilInvalidNpmClient", {
        client: `${client}`,
        allowed: Array.from(ALLOWED_NPM_CLIENTS).join(", "),
      }),
    );
  }
  return client;
}

/**
 * Turn a git remote (https or git@ form) into a browsable GitHub link, or
 * null when the remote is not hosted on github.com. The host is parsed rather
 * than substring-matched, so "https://evil.example/github.com" is rejected.
 * @param {string} gitRepo
 * @returns {string|null}
 */
export function githubRepoLink(gitRepo) {
  if (typeof gitRepo !== "string") {
    return null;
  }
  const ssh = /^git@github\.com:(.+)$/.exec(gitRepo);
  const candidate = ssh ? `https://github.com/${ssh[1]}` : gitRepo;
  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.hostname !== "github.com"
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return candidate.replace(/\.git$/, "");
}

// Security (validated-cli-options): characters that are dangerous when a value is interpolated
// into an exec() shell string. Rejecting these at the option boundary closes
// the command-injection vector at every exec(...${opt}...) call site without
// requiring a full exec()->spawn() migration of the publish/clone flows.
// `%` and `^` are cmd.exe's variable-expansion and escape characters
// (Windows hosts run the same publish flows through cmd).
const SHELL_METACHARACTER_RE = /[;&|`$<>!(){}#%^\n\r\\]/;

/**
 * Reject shell metacharacters in a value that will be interpolated into a
 * shell string. Returns the value if safe, otherwise throws naming the option.
 * @param {string} value
 * @param {string} optionName
 * @returns {string}
 */
export function rejectShellMetacharacters(value, optionName) {
  if (value === undefined || value === null || value === "") {
    return value;
  }
  if (typeof value !== "string" || SHELL_METACHARACTER_RE.test(value)) {
    throw new Error(t("utilShellMetacharacters", { option: `${optionName}` }));
  }
  return value;
}

/**
 * Reject values that start with "-" so they can't be read as an option by the
 * program they're passed to (e.g. rsync `-e <cmd>` runs a command).
 * Security (no-leading-dash): argument injection, which the metacharacter check above
 * does not cover.
 * @param {string} value
 * @param {string} optionName
 * @returns {string}
 */
export function rejectLeadingDash(value, optionName) {
  if (value === undefined || value === null || value === "") {
    return value;
  }
  if (typeof value !== "string" || value.trim().startsWith("-")) {
    throw new Error(t("utilLeadingDash", { option: `${optionName}` }));
  }
  return value;
}

// Security (strict-names): characters never allowed in site, element or
// theme names. Names end up in file paths, generated JS (import statements,
// class names) and child process cwd values, so anything beyond a plain
// lowercase slug (/, ., quotes, ;, $, whitespace incl. tabs, ...) is refused.
const NAME_SPECIAL_CHARACTERS_RE = /[`~!@#$%^&*()_=+[\]{}|;:'",<.>/?\\\s]/;

/**
 * True when a site / element / theme name contains a disallowed character.
 * Shared by the interactive prompts and the non-interactive CLI path so both
 * enforce the same rule.
 * @param {string} value
 * @returns {boolean}
 */
export function hasNameSpecialCharacters(value) {
  return typeof value !== "string" || NAME_SPECIAL_CHARACTERS_RE.test(value);
}

// GitHub user / org / repo names: letters, digits, hyphen (repos also allow
// dot and underscore). Security (validated-github-targets): these are interpolated into clone
// URLs, so they're restricted to the characters GitHub itself accepts.
const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
export function isValidGithubOwner(value) {
  return typeof value === "string" && GITHUB_OWNER_RE.test(value);
}
export function isValidGithubRepo(value) {
  return (
    typeof value === "string" &&
    GITHUB_REPO_RE.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

// Security (validated-cli-options): allowlist for --domain / --site (surge/netlify/vercel deploy
// targets). Hostnames, ports, and dotted domain labels only.
const DOMAIN_RE = /^[A-Za-z0-9.\-:]+$/;

/**
 * Validate a publish --domain value against a strict hostname/domain charset.
 * @param {string} value
 * @returns {string}
 */
export function validateDomain(value) {
  if (value === undefined || value === null || value === "") {
    return value;
  }
  if (typeof value !== "string" || !DOMAIN_RE.test(value)) {
    throw new Error(t("utilInvalidDomain"));
  }
  // Security (no-leading-dash): the charset allows "-", so "--help" / "-x" would pass
  // and be read as an option by the publish CLI it is handed to.
  rejectLeadingDash(value, "domain");
  return value;
}

// Security: --template picks a directory under src/templates/<type>/, so it
// must be one of the shipped names, never a path. Resolved against the
// templates root at call time so the allowlist can't drift from what ships.
export function listTemplateNames(templatesRoot, type) {
  try {
    return fs
      .readdirSync(path.join(templatesRoot, type), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Validate a --template value against the template directories that ship
 * with the CLI. Returns the value, or throws naming the valid choices.
 * @param {string} value
 * @param {string} templatesRoot absolute path to src/dist templates dir
 * @param {string} type "webcomponent" (the only templated project type)
 */
export function validateTemplateName(value, templatesRoot, type) {
  if (value === undefined || value === null || value === "") {
    return value;
  }
  const allowed = listTemplateNames(templatesRoot, type);
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(
      t("utilInvalidTemplate", {
        option: "template",
        choices: allowed.join(", "),
      }),
    );
  }
  return value;
}

const reservedNames = [
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
];

/**
 * Validate a web component name. Returns an error string if invalid, or null if valid.
 * @param {string} value - the proposed name
 * @param {object} options
 * @param {object} [options.wcReg] - wc-registry object to check for collisions
 * @param {boolean} [options.force] - skip wc-registry collision check
 * @param {string} [options.joint] - base directory to check for existing folder
 * @param {boolean} [options.checkExists] - whether to check if directory already exists
 * @returns {string|null} error message or null
 */
export function validateWebcomponentName(value, options = {}) {
  const { wcReg, force, joint, checkExists = true } = options;
  if (!value) {
    return t("utilNameRequired");
  }
  if (reservedNames.includes(value)) {
    return t("utilNameReserved", { name: value });
  }
  if (value.toLocaleLowerCase() !== value) {
    return t("utilNameLowercase");
  }
  if (/^\d/.test(value)) {
    return t("utilNameStartsWithNumber");
  }
  if (/[`~!@#$%^&*()_=+[\]{}|;:'",<.>/?\\]/.test(value)) {
    return t("utilNameSpecialCharacters");
  }
  if (value.indexOf(" ") !== -1) {
    return t("utilNameSpaces");
  }
  if (
    value.indexOf("-") === -1 ||
    value.replace("--", "") !== value ||
    value[0] === "-" ||
    value[value.length - 1] === "-"
  ) {
    return t("utilNameHyphen");
  }
  if (!/^[a-z][a-z0-9.-]*-[a-z0-9.-]*$/.test(value)) {
    return t("utilNameSyntax");
  }
  if (wcReg && wcReg[value] && !force) {
    return t("utilNameInRegistry");
  }
  if (checkExists && joint && fs.existsSync(path.join(joint, value))) {
    return t("utilNameExists", { path: path.join(joint, value) });
  }
  return null;
}

// haxtheweb/issues#3116 / #3119: when no git identity is configured, return
// `-c user.name=... -c user.email=...` args for a single commit so scaffold
// commits succeed in fresh containers and CI. Never writes git config.
export async function gitIdentityFallbackArgs(cwd = process.cwd()) {
  const configValue = async (key) => {
    try {
      const { stdout } = await runCommand("git", ["config", key], {
        cwd: fs.existsSync(cwd) ? cwd : process.cwd(),
      });
      return stdout.trim();
    } catch {
      return "";
    }
  };
  // Security (no-shell-strings): returned as an argument array for runCommand("git", ...)
  // instead of a string spliced into a shell command.
  let args = [];
  if (!process.env.GIT_AUTHOR_NAME && !(await configValue("user.name"))) {
    args.push("-c", "user.name=HAX CLI");
  }
  if (
    !process.env.GIT_AUTHOR_EMAIL &&
    !process.env.EMAIL &&
    !(await configValue("user.email"))
  ) {
    args.push("-c", "user.email=hax@localhost");
  }
  if (args.length > 0 && !process.haxquiet) {
    process.stderr.write(
      `hax: ${t("utilNoGitIdentity", { identity: "HAX CLI <hax@localhost>" })}\n`,
    );
  }
  return args;
}

/**
 * git init + first commit (+ optional origin remote) for a new project.
 * Security (strict-names, no-shell-strings): replaces `cd ${dir} && git init && ...` shell
 * strings, which ran any shell syntax in the project name or path. The remote
 * URL is passed as one argument and may not start with "-" (git option).
 * @param {string} dir project directory
 * @param {string} [gitRepo] remote URL for origin
 */
export async function initGitRepo(dir, gitRepo = null) {
  if (gitRepo) {
    rejectLeadingDash(gitRepo, "git-repo");
  }
  const identity = await gitIdentityFallbackArgs(dir);
  await runCommand("git", ["init"], { cwd: dir });
  await runCommand("git", ["add", "-A"], { cwd: dir });
  await runCommand("git", [...identity, "commit", "-m", "first commit"], {
    cwd: dir,
  });
  await runCommand("git", ["branch", "-M", "main"], { cwd: dir });
  if (gitRepo) {
    await runCommand("git", ["remote", "add", "origin", gitRepo], {
      cwd: dir,
    });
  }
}
