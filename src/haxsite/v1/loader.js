import * as fs from 'node:fs';
import * as path from "node:path";
import { SITE_FILE_NAME } from "../../utils.js";

// look for site.json to load site context
export function loadHaxSite(path = null) {
  // walks backwards until it finds a site, if it finds one
  const response = searchForSiteJson(path);
  return response;
}

// recursively look backwards for site.json until we find one or have none (null)
export async function searchForSiteJson(dir) {
  let currentPath = dir;
  if (!currentPath) {
    currentPath = process.cwd();
  }
  const files = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const file of files) {
    if (file.name === SITE_FILE_NAME) {
      return {
        status: 200,
        path: file.path,
        site: await JSON.parse(fs.readFileSync(path.join(file.path, file.name), 'utf8'))
      };
    }
  }
  // didn't find anything if we got here, so search again but a level below where we were
  if (currentPath !== '/') {
    return searchForSiteJson(path.join(currentPath, '../'));
  }
  else {
    return null;
  }
}