import * as fs from 'node:fs';
import * as path from "node:path"
import * as child_process from "child_process";
import * as util from "node:util";
const exec = util.promisify(child_process.exec);
export const SITE_FILE_NAME = "site.json";
/**
 * Helper to convert dash to camel; important when reading attributes.
 */
export function dashToCamel(str) {
  return str.replace(/-([a-z0-9])/g, function (g) {
    return g[1].toUpperCase();
  });
}
// generate unique-enough id
export function generateUUID() {
  return "ss-s-s-s-sss".replace(/s/g, _uuidPart);
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