import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from "node:path"
import * as child_process from "child_process";
import * as util from "node:util";
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
    const child = spawn(command, args, { stdio: 'inherit', ...options });
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
// generate unique-enough id
export function generateUUID() {
  return "ss-s-s-s-sss".replace(/s/g, _uuidPart);
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

function _uuidPart() {
  return Math.floor((1 + Math.random()) * 0x10000)
  .toString(16)
  .substring(1);
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