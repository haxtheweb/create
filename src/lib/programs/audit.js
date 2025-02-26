import path from "node:path";
import * as properties from "../css-properties.js";
import * as styles from "../css-styles.js";
import * as ddd from "../ddd-styles.js";

/**
 * @description Runs the audit command, to be called when `hax audit` command is run
 */
export async function auditCommandDetected() {
  let dddignore = dddignoreCollector();
  dddignore.forEach(item => {
    console.table(item)
  })
  let auditList = createAuditList();
}

/**
 * @description Recursively finds and reads information from .dddignore files
 * @returns Array of file names from .dddignore(s) as strings
 */
function dddignoreCollector() {
  const PROJECT_ROOT = process.cwd();
  return dddignoreInterpreter(PROJECT_ROOT);
}

/**
 * @description Gets items from dddignore with a hierarchy (.dddignore affects folders below it, never above it)
 * @returns list of files, directories, and file extensions to ignore, interpretted from .dddignore files
 */
function dddignoreInterpreter(root) {
  const fs = require('node:fs');
  let list = [];

  fs.readdirSync(root).forEach(item => {
    const FULL_PATH = path.join(root, item);

    if (item !== "node_modules"  && item !== ".git" && fs.statSync(FULL_PATH).isDirectory()) { // Directory
      list = list.concat(dddignoreInterpreter(FULL_PATH));
    }
    else if (item === ".dddignore") { // File 
      let lines = fs.readFileSync(FULL_PATH, 'utf-8').split('\n').filter(Boolean);
      lines.forEach(line => {
        let trimmed = line.trim();
        
        if (!trimmed.startsWith('#')) {
          let type = "file";

          if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
            trimmed = trimmed.substring(1);
            type = "directory";
          }
          else if  (trimmed.startsWith('*')) {
            trimmed = trimmed.substring(1);
            type = "extension";
          }
          
          const OBJECT = {
            "highest_path": root,
            "ignore": trimmed,
            "type": type
          };

          list.push(OBJECT);
        } 
      })
    }
  })

  if (list.length !== 0) {
    return list;
  } else {
    return [];
  }
}

/**
 * @description Gets the files needed for auditing, ignores files from .dddignore(s)
 */
function createAuditList() {
  console.log('Creating audit list')

  // using .endsWith should work because for just file names those
  // should be in the top level directory, anything in lower level directories should apply.
  // might need to alter dddignore collection for array of objects as follows
  // {
  //  "highest-directory": src
  //  "ignore": index.html (example)
  // }
  // The above could likely be used for a path .contains(src) and .endsWith(index.html)
}