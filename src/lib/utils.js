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
 * Security (R2-L-1): values passed as args / cwd can never be parsed as shell
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
  } catch (error) {
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
  } catch (error) {
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

// read in all files recursively for rewriting
export function* readAllFiles(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      yield* readAllFiles(path.join(dir, file.name));
    } else {
      yield path.join(dir, file.name);
    }
  }
}

// Allowed npm clients that get interpolated into shell commands (M-2).
// Keep this allowlist in sync with the --npm-client option help text.
const ALLOWED_NPM_CLIENTS = new Set(["npm", "yarn", "pnpm"]);

/**
 * Validate --npm-client against a strict allowlist.
 * Security (M-2): npmClient is interpolated into many exec() shell strings;
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

// Security (M-1): characters that are dangerous when a value is interpolated
// into an exec() shell string. Rejecting these at the option boundary closes
// the command-injection vector at every exec(...${opt}...) call site without
// requiring a full exec()->spawn() migration of the publish/clone flows.
const SHELL_METACHARACTER_RE = /[;&|`$<>!(){}#\n\r\\]/;

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
 * Security (R2-M-1): argument injection, which the metacharacter check above
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

// Security (R2-H-2 / R2-M-2): characters never allowed in site, element or
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
// dot and underscore). Security (R2-L-2): these are interpolated into clone
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

// Security (M-1): allowlist for --domain / --site (surge/netlify/vercel deploy
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
    } catch (e) {
      return "";
    }
  };
  // Security (R2-L-1): returned as an argument array for runCommand("git", ...)
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
 * Security (R2-H-2 / R2-L-1): replaces `cd ${dir} && git init && ...` shell
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
