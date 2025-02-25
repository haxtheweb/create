import * as properties from "../css-properties.js";
import * as ddd from "../ddd-styles.js";
import * as styles from "../css-styles.js";

/**
 * @description Runs the audit command, to be called when `hax audit` command is run
 */
export async function auditCommandDetected() {
  let dddignore = await dddignoreReader();
  dddignore.forEach(item => {
    console.log(item)
  })
  let auditList = createAuditList();
}

/**
 * @description Recursively finds and reads information from .dddignore files
 * @returns Array of file names from .dddignore(s) as strings
 */
async function dddignoreReader() {
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
  const fs = require('fs');
  const readline = require('readline');
  let list = [];
  
  return new Promise((resolve, reject) => {
    console.log(`Root: ${root}`)
    fs.readdirSync(root).forEach(path => {
      if (path !== "node_modules"  && path !== ".git" && fs.statSync(path).isDirectory()) { // Directory
        // let newPath = `${root}/${path}`;
        // console.log(`Found new path: ${newPath}`);
        // helpIgnoreCollector(newPath);
      }
      else if (path === ".dddignore") { // File
        const LINE_READER = readline.createInterface({
          input: fs.createReadStream(path),
          crlfDelay: Infinity
        });

        const processLines = new Promise((resolveLines) => {
          LINE_READER.on('line', (line) => {
            const STRIPPED_LINE = line.trim()
            if (!STRIPPED_LINE.startsWith('#')) {
              list.push(STRIPPED_LINE)
            }
          });

          LINE_READER.on('close', () => {
            resolveLines();
          });
        });

        processLines.then(() => {
          resolve(list)
        })
      }
    });
  })
  // Criteria to check for:
    // 1. Do not go into node_modules folder
    // 2. Record file paths from root of where the command is called. 
      // 2.1. Every .dddignore should contribute to the master list from it's current directory and sub directories, but none above.
    // 3. If string begins with *, get everything after it, and if any file has that extension it needs to be added to the master ignore list
    // 4. This function needs to work recursively, so it needs to be able to pass the data back up.

}

/**
 * @description Gets the files needed for auditing, ignores files from .dddignore(s)
 */
function createAuditList() {
  console.log('Creating audit list')
}