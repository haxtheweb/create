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
  
  // dddignore.forEach(item => {
  //   console.table(item)
  // });

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
            "highestPath": root,
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
function auditNavigator(root, dddignore) { // TODO there is problem when working with live 
  readdirSync(root).forEach(item => {
    const FULL_PATH = path.join(root, item);

    if (item !== "node_modules" && item !== ".git" && item !== "dist" && statSync(FULL_PATH).isDirectory()) { // Directory Navigator
      if (dddignore.length !== 0) {
        const IGNORE_DIRECTORY = dddignore.some(ignore =>
          root.startsWith(ignore.highestPath) &&
          item === ignore.name &&
          ignore.type === "directory"
        )

        if (!IGNORE_DIRECTORY) {
          auditNavigator(FULL_PATH, dddignore);
        }
      }
      else {
        auditNavigator(FULL_PATH, dddignore)
      }
    }
    else { // If file does not match criteria to be ignored (both ext. and file), then audit permitted
      if (item !== "node_modules" && item !== ".git" && item !== "dist") {
        if (dddignore.length !== 0) {
          const IGNORE_EXTENSION = dddignore.some(ignore => 
            root.startsWith(ignore.highestPath) &&
            item.endsWith(ignore.name) &&
            ignore.type === "extension"
          )
  
          if (!IGNORE_EXTENSION) {
            const IGNORE_FILE = dddignore.some(ignore =>
              root.startsWith(ignore.highestPath) &&
              ignore.name === item &&
              ignore.type === "file"
            )
  
            if (!IGNORE_FILE) {
              auditFile(FULL_PATH, item)
            }
          }
        } else {
          auditFile(FULL_PATH, item)
        }
      }
    }
  })
}

/**
 * @description Audits component line by line to suggest CSS changes
 * @param fileLocation Full file path of file to be audited
 */
function auditFile(fileLocation, fileName) {
  let data = [];
  console.log(`Auditing 🪄: ${fileName}`)
  // let lines = readFileSync(fileLocation, 'utf-8').split('\n').filter(Boolean);

  // forEach to check all applicable CSS lines
    // if (line does not include 'ddd') because that should be constant in all vars
      // if properties.COLORS.includes(CSS PROPERTY) 
        // if styles.COLORS.includes(CSS ATTRIBUTE) {
        //  const COLOR_DATA = {
        //    "Line Number": lineNumber,
        //    "CSS Property": property,
        //    "Current Attribute": attribute,
        //    "Suggested Change": helpAuditPresetColors(color)
        //  }
  if (data.length !== 0) {
    console.table(data);
  }
}

/**
 * @description Audits color related CSS properties based on the CSS preset colors
 * @param color CSS preset color
 */
function helpAuditPresetColors(color) {
  if (styles.COLORS.includes(color)) {
    switch (color) {
      case "AliceBlue":
        return "--ddd-theme-default-slateLight";
      case "AntiqueWhite":
        return "--ddd-theme-default-roarLight";
      case "Aqua":
        return "--ddd-theme-default-skyBlue";
      case "Aquamarine":
        return "--ddd-theme-default-creekTeal";
      case "Azure":
        return "--ddd-theme-default-creekMaxLight";
      case "Beige":
        return "--ddd-theme-default-alertUrgent";
      case "Bisque":
        return "--ddd-theme-default-alertUrgent";
      case "Black":
        return "--ddd-theme-default-coalyGray";
      case "BlanchedAlmond":
        return "--ddd-theme-default-alertUrgent";
      case "Blue":
        return "--ddd-theme-default-beaverBlue";
      case "BlueViolet":
        return "--ddd-theme-default-athertonViolet";
      case "Brown":
        return "--ddd-theme-default-landgrantBrown";
      case "BurlyWood":
        return "--ddd-theme-default-shrineTan";
      case "CadetBlue":
        return "--ddd-theme-default-creekTeal";
      case "Chartreuse":
        return "--ddd-theme-default-futureLime";
      case "Chocolate":
        return "--ddd-theme-default-warning";
      case "Coral":
        return "--ddd-theme-default-discoveryCoral";
      case "CornflowerBlue":
        return "--ddd-theme-default-accent";
      case "Cornsilk":
        return "--ddd-theme-default-roarLight";
      case "Crimson":
        return "--ddd-theme-default-original87Pink";
      case "Cyan":
        return "--ddd-theme-default-skyBlue";
      case "DarkBlue":
        return "--ddd-theme-default-nittanyNavy";
      case "DarkCyan":
        return "--ddd-theme-default-creekTeal";
      case "DarkGoldenRod":
        return "--ddd-theme-default-roarGolden";
      case "DarkGray":
        return "--ddd-theme-default-limestoneGray";
      case "DarkGrey":
        return "--ddd-theme-default-limestoneGray";
      case "DarkGreen":
        return "--ddd-theme-default-success";
      case "DarkKhaki":
        return "--ddd-theme-default=alertAllClear";
      case "DarkMagenta":
        return "--ddd-theme-default-wonderPurple";
      case "DarkOliveGreen":
        return "--ddd-theme-default-forestGreen";
      case "DarkOrange":
        return "--ddd-theme-default-inventOrange";
      case "DarkOrchid":
        return "--ddd-theme-default-athertonViolet";
      case "DarkRed":
        return "--ddd-theme-default-error";
      case "DarkSalmon":
        return "--ddd-theme-default-discoveryCoral";
      case "DarkSeaGreen":
        return "--ddd-theme-default-alertAllClear";
      case "DarkSlateBlue":
        return "--ddd-theme-default-beaverBlue";
      case "DarkSlateGray":
        return "--ddd-theme-default-slateGray";
      case "DarkSlateGrey":
        return "--ddd-theme-default-slateGray";
      case "DarkTurquoise":
        return "--ddd-theme-default-link";
      case "DarkViolet":
        return "--ddd-theme-default-wonderPurple";
      case "DeepPink":
        return "--ddd-theme-default-original87Pink";
      case "DeepSkyBlue":
        return "--ddd-theme-default-skyBlue";
      case "DimGray":
        return "--ddd-theme-default-limestoneGray";
      case "DimGrey":
        return "--ddd-theme-default-limestoneGray";
      case "DodgerBlue":
        return "--ddd-theme-default-link";
      case "FireBrick":
        return "--ddd-theme-default-error";
      case "FloralWhite":
        return "--ddd-theme-default-warningLight";
      case "ForestGreen":
        return "--ddd-theme-default-forestGreen";
      case "Fuchsia":
        return "--ddd-theme-default-athertonViolet";
      case "Gainsboro":
        return "--ddd-theme-default-limestoneGray";
      case "GhostWhite":
        return "--ddd-theme-default-shrineLight";
      case "Gold":
        return "--ddd-theme-default-keystoneYellow";
      case "GoldenRod":
        return "--ddd-theme-default-roarGolden";
      case "Gray":
        return "--ddd-theme-default-limestoneGray";
      case "Grey":
        return "--ddd-theme-default-limestoneGray";
      case "Green":
        return "--ddd-theme-default-forestGreen";
      case "GreenYellow":
        return "--ddd-theme-default-futureLime";
      case "HoneyDew":
        return "--ddd-theme-default-infoLight";
      case "HotPink":
        return "--ddd-theme-default-discoveryCoral";
      case "IndianRed":
        return "--ddd-theme-default-original87Pink";
      case "Indigo":
        return "--ddd-theme-default-wonderPurple";
      case "Ivory":
        return "--ddd-theme-default-roarMaxLight";
      case "Khaki":
        return "--ddd-theme-default-alertUrgent";
      case "Lavender":
        return "--ddd-theme-default-alertNonEmergency";
      case "LavenderBlush":
        return "--ddd-theme-default-alertImmediate";
      case "LawnGreen":
        return "--ddd-theme-default-futureLime";
      case "LemonChiffon":
        return "--ddd-theme-default-alertUrgent";
      case "LightBlue":
        return "--ddd-theme-default-accent";
      case "LightCoral":
        return "--ddd-theme-default-discoveryCoral";
      case "LightCyan":
        return "--ddd-theme-default-skyLight";
      case "LightGoldenRodYellow":
        return "--ddd-theme-default-alertUrgent";
      case "LightGray":
        return "--ddd-theme-default-limestoneGray";
      case "LightGrey":
        return "--ddd-theme-default-limestoneGray";
      case "LightGreen":
        return "--ddd-theme-default-opportunityGreen";
      case "LightPink":
        return "--ddd-theme-default-discoveryCoral";
      case "LightSalmon":
        return "--ddd-theme-default-discoveryCoral";
      case "LightSeaGreen":
        return "--ddd-theme-default-creekTeal";
      case "LightSkyBlue":
        return "--ddd-theme-default-skyLight";
      case "LightSlateGray":
        return "--ddd-theme-default-slateLight";
      case "LightSlateGrey":
        return "--ddd-theme-default-slateLight";
      case "LightSteelBlue":
        return "--ddd-theme-default-alertNonEmergency";
      case "LightYellow":
        return "--ddd-theme-default-alertAllClear";
      case "Lime":
        return "--ddd-theme-default-futureLime";
      case "LimeGreen":
        return "--ddd-theme-default-opportunityGreen";
      case "Linen":
        return "--ddd-theme-default-warningLight";
      case "Magenta":
        return "--ddd-theme-default-athertonViolet";
      case "Maroon":
        return "--ddd-theme-default-error";
      case "MediumAquaMarine":
        return "--ddd-theme-default-creekTeal";
      case "MediumBlue":
        return "--ddd-theme-default-link80";
      case "MediumOrchid":
        return "--ddd-theme-default-athertonViolet";
      case "MediumPurple":
        return "--ddd-theme-default-athertonViolet";
      case "MediumSeaGreen":
        return "--ddd-theme-default-forestGreen";
      case "MediumSlateBlue":
        return "--ddd-theme-default-beaverBlue";
      case "MediumSpringGreen":
        return "-ddd-theme-default-futureLime";
      case "MediumTurquoise":
        return "--ddd-theme-default-accent";
      case "MediumVioletRed":
        return "--ddd-theme-default-original87Pink";
      case "MidnightBlue":
        return "--ddd-theme-default-potentialMidnight";
      case "MintCream":
        return "--ddd-theme-default-skyMaxLight";
      case "MistyRose":
        return "--ddd-theme-default-errorLight";
      case "Moccasin":
        return "--ddd-theme-default-alertUrgent";
      case "NavajoWhite":
        return "--ddd-theme-default-alertUrgent";
      case "Navy":
        return "--ddd-theme-default-nittanyNavy";
      case "OldLace":
        return "--ddd-theme-default-warningLight";
      case "Olive":
        return "--ddd-theme-default-forestGreen";
      case "OliveDrab":
        return "--ddd-theme-default-success";
      case "Orange":
        return "--ddd-theme-default-inventOrange";
      case "OrangeRed":
        return "--ddd-theme-default-inventOrange";
      case "Orchid":
        return "--ddd-theme-default-athertonViolet";
      case "PaleGoldenRod":
        return "--ddd-theme-default-alertUrgent";
      case "PaleGreen":
        return "--ddd-theme-default-futureLime";
      case "PaleTurquoise":
        return "--ddd-theme-default-creekLight";
      case "PaleVioletRed":
        return "--ddd-theme-default-alertImmediate";
      case "PapayaWhip":
        return "--ddd-theme-default-alertUrgent";
      case "PeachPuff":
        return "--ddd-theme-default-alertUrgent";
      case "Peru":
        return "--ddd-theme-default-roarGolden";
      case "Pink":
        return "--ddd-theme-default-alertImmediate";
      case "Plum":
        return "--ddd-theme-default-athertonViolet";
      case "PowderBlue":
        return "--ddd-theme-default-creekLight";
      case "Purple":
        return "--ddd-theme-default-wonderPurple";
      case "RebeccaPurple":
        return "--ddd-theme-default-athertonViolet";
      case "Red":
        return "--ddd-theme-default-original87Pink";
      case "RosyBrown":
        return "--ddd-theme-default-shrineTan";
      case "RoyalBlue":
        return "--ddd-theme-default-skyBlue";
      case "SaddleBrown":
        return "--ddd-theme-default-landgrantBrown";
      case "Salmon":
        return "--ddd-theme-default-discoveryCoral";
      case "SandyBrown":
        return "--ddd-theme-default-shrineTan";
      case "SeaGreen":
        return "--ddd-theme-default-forestGreen";
      case "SeaShell":
        return "--ddd-theme-default-roarLight";
      case "Sienna":
        return "--ddd-theme-default-warning";
      case "Silver":
        return "--ddd-theme-default-limestoneGray";
      case "SkyBlue":
        return "--ddd-theme-default-pughBlue";
      case "SlateBlue":
        return "--ddd-theme-default-athertonViolet";
      case "SlateGray":
        return "--ddd-theme-default-limestoneGray";
      case "SlateGrey":
        return "--ddd-theme-default-limestoneGray";
      case "Snow":
        return "--ddd-theme-default-white";
      case "SpringGreen":
        return "--ddd-theme-default-futureLime";
      case "SteelBlue":
        return "--ddd-theme-default-link";
      case "Tan":
        return "--ddd-theme-default-shrineTan";
      case "Teal":
        return "--ddd-theme-default-creekTeal";
      case "Thistle":
        return "--ddd-theme-default-athertonViolet";
      case "Tomato":
        return "--ddd-theme-default-discoveryCoral";
      case "Transparent":
        return "--ddd-theme-default-potential0";
      case "Turquoise":
        return "--ddd-theme-default-skyBlue";
      case "Violet":
        return "--ddd-theme-default-athertonViolet";
      case "Wheat":
        return "--ddd-theme-default-alertUrgent";
      case "White":
        return "--ddd-theme-default-white";
      case "WhiteSmoke":
        return "--ddd-theme-default-shrineLight";
      case "Yellow":
        return "--ddd-theme-default-globalNeon";
      case "YellowGreen":
        return "--ddd-theme-default-forestGreen";
      default:
        return "No applicable suggestions";
    }
  }
}

/**
 * 
 */
function helpAuditSpacing(spacing) {

}