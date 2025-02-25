import path from "node:path";
import * as properties from "../css-properties.js";
import * as styles from "../css-styles.js";
import * as ddd from "../ddd-styles.js";

/**
 * @description Runs the audit command, to be called when `hax audit` command is run
 */
export async function auditCommandDetected() {
  let dddignore = dddignoreReader();
  dddignore.forEach(item => {
    console.log(item)
  })
  let auditList = createAuditList();
}

/**
 * @description Recursively finds and reads information from .dddignore files
 * @returns Array of file names from .dddignore(s) as strings
 */
function dddignoreReader() {
  // console.log('Getting list of files from .dddignore');
  const PROJECT_ROOT = process.cwd();
  let collectedList = helpIgnoreCollector(PROJECT_ROOT)

  /*
    TODO Recursively search file system from root of command call
    for any .dddignore files, adding any new lines if they do not
    begin with `#` and are not already in the list
  */
  return collectedList;
}

/**
 * @description Gets items from dddignore with a hierarchy (.dddignore affects folders below it, never above it)
 */
function helpIgnoreCollector(root) {
  const fs = require('node:fs');
  let list = [];
  
  console.log(`Root: ${root}`)
  fs.readdirSync(root).forEach(item => {
    const FULL_PATH = path.join(root, item);

    if (item !== "node_modules"  && item !== ".git" && fs.statSync(FULL_PATH).isDirectory()) { // Directory
      console.log(`Found new path: ${FULL_PATH}`);
      list = list.concat(helpIgnoreCollector(FULL_PATH));
    }
    else if (FULL_PATH.endsWith(".dddignore")) { // File
      console.log("Found a dddignore")
      
      let lines = fs.readFileSync(FULL_PATH, 'utf-8').split('\n').filter(Boolean);
      lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed.startsWith('#')) {
          console.log(trimmed);
          const OBJECT = {
            "highest_path": root,
            "ignore": trimmed
          };
          list.push(OBJECT);
        }
      })
    }

  })
    // Criteria to check for:
    // // 1. Do not go into node_modules folder
    // // 2. Record file paths from root of where the command is called. 
    // // 2.1. Every .dddignore should contribute to the master list from it's current directory and sub directories, but none above.
    // 3. If string begins with *, get everything after it, and if any file has that extension it needs to be added to the master ignore list
    // // 4. This function needs to work recursively, so it needs to be able to pass the data back up.
  if (list.length !== 0) {
    console.log(list)
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