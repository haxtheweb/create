
export const SITE_FILE_NAME = "site.json";

/**
 * Helper to convert dash to camel; important when reading attributes.
 */
export function dashToCamel(str) {
  return str.replace(/-([a-z])/g, function (g) {
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