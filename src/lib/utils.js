import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from "node:path"
import * as child_process from "child_process";
import * as util from "node:util";
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
export const exec = util.promisify(child_process.exec);
export const spawn = (child_process.spawn);

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
  const filePath = path.join(tempDir, '.haxtheweb', filename);
  try {
    fs.writeFileSync(filePath, data);
    return filePath
  } catch (error) {
    return null
  }
}

// read user config file
export function readConfigFile(filename) {
  let tempDir = os.homedir();
  if (process.env.VERCEL_ENV) {
    tempDir = "/tmp/";
  }
  const filePath = path.join(tempDir, '.haxtheweb', filename);
  try {
    let file = fs.readFileSync(filePath, 'utf8');
    return file;
  } catch (error) {
    return null
  }
}


export async function interactiveExec(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    process.env.NODE_NO_WARNINGS = 1;
    const spawnOptions = { stdio: 'inherit', ...options };
    if (process.platform === 'win32' && typeof spawnOptions.shell === 'undefined') {
      spawnOptions.shell = true;
    }
    const child = spawn(command, args, spawnOptions);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    child.on('error', (err) => {
      reject(err);
    });
  });
}

export function findAvailablePort(startPort = 3000, maxPort = 65535) {
  return new Promise((resolve, reject) => {
    function tryPort(port) {
      if (port > maxPort) {
        reject(new Error('No available ports found'))
        return
      }
      const server = createServer()
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          tryPort(port + 1)
        } else {
          reject(err)
        }
      })
      server.once('listening', () => {
        server.close(() => resolve(port))
      })
      server.listen(port)
    }
    tryPort(startPort)
  })
}

export const SITE_FILE_NAME = "site.json";
/**
 * Helper to convert dash to camel; important when reading attributes.
 */
export function dashToCamel(str) {
  return capitalizeFirstLetter(str.replace(/-([a-z0-9])/g, function (g) {
    return g[1].toUpperCase();
  }));
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
export function* readAllFiles(dir)  {
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
      `Invalid --npm-client "${client}". Allowed values: ${Array.from(ALLOWED_NPM_CLIENTS).join(", ")}`,
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
  if (value === undefined || value === null || value === '') {
    return value;
  }
  if (typeof value !== 'string' || SHELL_METACHARACTER_RE.test(value)) {
    throw new Error(
      `Invalid --${optionName} value: shell metacharacters are not allowed.`,
    );
  }
  return value;
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
  if (value === undefined || value === null || value === '') {
    return value;
  }
  if (typeof value !== 'string' || !DOMAIN_RE.test(value)) {
    throw new Error(
      `Invalid --domain value: only letters, digits, dots, hyphens, and colons are allowed.`,
    );
  }
  return value;
}

const reservedNames = ["annotation-xml", "color-profile", "font-face", "font-face-src", "font-face-uri", "font-face-format", "font-face-name", "missing-glyph"];

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
    return "Name is required (Enter accepts default)";
  }
  if (reservedNames.includes(value)) {
    return `Reserved name ${value} cannot be used`;
  }
  if (value.toLocaleLowerCase() !== value) {
    return "Name must be lowercase";
  }
  if (/^\d/.test(value)) {
    return "Name cannot start with a number";
  }
  if (/[`~!@#$%^&*()_=+\[\]{}|;:\'",<.>\/?\\]/.test(value)) {
    return "No special characters allowed in name";
  }
  if (value.indexOf(' ') !== -1) {
    return "No spaces allowed in name";
  }
  if (value.indexOf('-') === -1 || value.replace('--', '') !== value || value[0] === '-' || value[value.length - 1] === '-') {
    return "Name must include at least one `-` and must not start or end name.";
  }
  if (!/^[a-z][a-z0-9.\-]*\-[a-z0-9.\-]*$/.test(value)) {
    return `Name must follow the syntax my-component`;
  }
  if (wcReg && wcReg[value] && !force) {
    return "Name is already a web component in the wc-registry published for HAX.";
  }
  if (checkExists && joint && fs.existsSync(path.join(joint, value))) {
    return `${path.join(joint, value)} exists, rename this project`;
  }
  return null;
}
