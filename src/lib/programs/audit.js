import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as properties from "../css-properties.js";
import * as styles from "../css-styles.js";
import * as ddd from "../ddd-styles.js";

/**
 * @description Runs the audit command, to be called when `hax audit` command is run
 */
export async function auditCommandDetected() {
  const PROJECT_ROOT = process.cwd();
  let dddignore = dddignoreInterpreter(PROJECT_ROOT);
  
  dddignore.forEach(item => {
    console.table(item)
  });

  auditNavigator(PROJECT_ROOT, dddignore);
}

/**
 * @description Gets items from dddignore with a hierarchy (.dddignore affects folders below it, never above it)
 * @returns Array of objects detailing what directories, files, and file extensions to ignore
 */
function dddignoreInterpreter(root) {
  let list = [];

  readdirSync(root).forEach(item => {
    const FULL_PATH = path.join(root, item);

    if (item !== "node_modules"  && item !== ".git" && item !== "dist" && statSync(FULL_PATH).isDirectory()) { // Directory
      list = list.concat(dddignoreInterpreter(FULL_PATH));
    }
    else if (item === ".dddignore") { // File 
      let lines = readFileSync(FULL_PATH, 'utf-8').split('\n').filter(Boolean);
      lines.forEach(line => {
        let trimmed = line.trim();
        
        if (!trimmed.startsWith('#')) {
          let type = "file";

          if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
            trimmed = trimmed.substring(1);
            type = "directory";
          }
          else if (trimmed.startsWith('*')) {
            trimmed = trimmed.substring(1);
            type = "extension";
          }
          
          const OBJECT = {
            "highest_path": root,
            "name": trimmed,
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
 * @description Navigate through file pathes, auditing any file that is not in the .dddignore
 */
function auditNavigator(root, dddignore) { // TODO A LOT MORE TESTING!!!
  readdirSync(root).forEach(item => {
    const FULL_PATH = path.join(root, item);
    console.log(`Checking ${FULL_PATH}`)

    if (item !== "node_modules" && item !== ".git" && item !== "dist" && statSync(FULL_PATH).isDirectory()) { // Directory Navigator
      console.log("Checking directory against DDDIgnore")
      if (dddignore.length !== 0) {
        dddignore.forEach(ignore => {
          if (!ignore.highest_path.startsWith(root) && ignore.name !== item && ignore.type !== "directory") {
            auditNavigator(FULL_PATH, dddignore);
          }
        })
      }
      else {
        auditNavigator(FULL_PATH, dddignore)
      }
    }
    else { 
      if (dddignore.length !== 0) {
        dddignore.forEach(ignore => {
          // Check the file against all extensions first, then run it against all type === "file". If neither apply, then audit file
          if (!ignore.highest_path.startsWith(root) && !item.endsWith(ignore.name) && ignore.type !== "extension") {
            if (ignore.name !== item && ignore.type !== "file") {
              auditFile(FULL_PATH)
            }
          }
        });
      } else {
        auditFile(FULL_PATH)
      }
    }
  })
}

function auditFile(fileLocation) {
  console.log(`Auditing ${fileLocation}`)
  // let lines = readFileSync(fileLocation, 'utf-8').split('\n').filter(Boolean);
}