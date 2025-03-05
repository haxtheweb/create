import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as properties from "../css-properties.js";

/**
 * @description Runs the audit command, to be called when `hax audit` command is run
 */
export async function auditCommandDetected() {
  const PROJECT_ROOT = process.cwd();
  let dddignore = dddignoreInterpreter(PROJECT_ROOT);
  
  // TODO pass in pre-existing debug flag to allow this to output
  console.table(dddignore)

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

    if (item !== "node_modules"  && item !== ".git" && item !== "dist" && item !== "public" && statSync(FULL_PATH).isDirectory()) { // Directory
      list = list.concat(dddignoreInterpreter(FULL_PATH));
    }
    else if (item === ".dddignore") { // File 
      let lines = readFileSync(FULL_PATH, 'utf-8').split('\n').filter(Boolean);
      lines.forEach(line => {
        let trimmed = line.trim();
        
        if (line.includes('#') && !line.startsWith('#')) { // Inline comment support
          let removeComment = trimmed.split('#')[0];
          trimmed = removeComment.trim();
        }
        
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

    if (item !== "node_modules" && item !== ".git" && item !== "dist" && item !=="public" && statSync(FULL_PATH).isDirectory()) { // Directory Navigator
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
      if (item !== "node_modules" && item !== ".git" && item !== "dist" && item !== "public") {
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
  let lines = readFileSync(fileLocation, 'utf-8').split('\n').filter(Boolean);

  lines.forEach(line => {
    let trimmed = line.trim();
    if (trimmed.includes(':') && trimmed.endsWith(';')) {
      let [lineProperty, lineAttribute] = trimmed.split(":").map(item => item?.trim());
      lineAttribute = lineAttribute.replace(';', '');
      
      // Check colors
      if (properties.COLOR.includes(lineProperty) && !lineAttribute.includes('ddd')) {
        const colorObject = {
          "Line Number": lines.indexOf(line), // TODO line number is wrong, not counting blanks lol
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditPresetColors(lineAttribute)
        }

        data.push(colorObject)
      }

      if (properties.SPACING.includes(lineProperty) && !lineAttribute.includes('ddd')) {
        const spaceObject = {
          "Line Number": lines.indexOf(line), // TODO line number is wrong
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditSpacing(lineAttribute)
        }

        data.push(spaceObject)
      }
    }
  })

  if (data.length !== 0) {
    console.table(data);
    // TODO needs to provide a link to DDD Documentation
  }
}

/**
 * @description Audits color related CSS properties based on the CSS preset colors
 * @param color CSS preset color
 */
function helpAuditPresetColors(color) {
  switch (color.toLowerCase()) {
    case "aliceblue":
      return "--ddd-theme-default-slateLight";
    case "antiquewhite":
      return "--ddd-theme-default-roarLight";
    case "aqua":
      return "--ddd-theme-default-skyBlue";
    case "aquamarine":
      return "--ddd-theme-default-creekTeal";
    case "azure":
      return "--ddd-theme-default-creekMaxLight";
    case "beige":
      return "--ddd-theme-default-alertUrgent";
    case "bisque":
      return "--ddd-theme-default-alertUrgent";
    case "black":
      return "--ddd-theme-default-coalyGray";
    case "blanchedalmond":
      return "--ddd-theme-default-alertUrgent";
    case "blue":
      return "--ddd-theme-default-beaverBlue";
    case "blueviolet":
      return "--ddd-theme-default-athertonViolet";
    case "brown":
      return "--ddd-theme-default-landgrantBrown";
    case "burlywood":
      return "--ddd-theme-default-shrineTan";
    case "cadetblue":
      return "--ddd-theme-default-creekTeal";
    case "chartreuse":
      return "--ddd-theme-default-futureLime";
    case "chocolate":
      return "--ddd-theme-default-warning";
    case "coral":
      return "--ddd-theme-default-discoveryCoral";
    case "cornflowerblue":
      return "--ddd-theme-default-accent";
    case "cornsilk":
      return "--ddd-theme-default-roarLight";
    case "crimson":
      return "--ddd-theme-default-original87Pink";
    case "cyan":
      return "--ddd-theme-default-skyBlue";
    case "darkblue":
      return "--ddd-theme-default-nittanyNavy";
    case "darkcyan":
      return "--ddd-theme-default-creekTeal";
    case "darkgoldenrod":
      return "--ddd-theme-default-roarGolden";
    case "darkgray":
      return "--ddd-theme-default-limestoneGray";
    case "darkgrey":
      return "--ddd-theme-default-limestoneGray";
    case "darkgreen":
      return "--ddd-theme-default-success";
    case "darkkhaki":
      return "--ddd-theme-default=alertAllClear";
    case "darkmagenta":
      return "--ddd-theme-default-wonderPurple";
    case "darkolivegreen":
      return "--ddd-theme-default-forestGreen";
    case "darkorange":
      return "--ddd-theme-default-inventOrange";
    case "darkorchid":
      return "--ddd-theme-default-athertonViolet";
    case "darkred":
      return "--ddd-theme-default-error";
    case "darksalmon":
      return "--ddd-theme-default-discoveryCoral";
    case "darkseagreen":
      return "--ddd-theme-default-alertAllClear";
    case "darkslateblue":
      return "--ddd-theme-default-beaverBlue";
    case "darkslategray":
      return "--ddd-theme-default-slateGray";
    case "darkslategrey":
      return "--ddd-theme-default-slateGray";
    case "darkturquoise":
      return "--ddd-theme-default-link";
    case "darkviolet":
      return "--ddd-theme-default-wonderPurple";
    case "deeppink":
      return "--ddd-theme-default-original87Pink";
    case "deepskyblue":
      return "--ddd-theme-default-skyBlue";
    case "dimgray":
      return "--ddd-theme-default-limestoneGray";
    case "dimgrey":
      return "--ddd-theme-default-limestoneGray";
    case "dodgerblue":
      return "--ddd-theme-default-link";
    case "firebrick":
      return "--ddd-theme-default-error";
    case "floralwhite":
      return "--ddd-theme-default-warningLight";
    case "forestgreen":
      return "--ddd-theme-default-forestGreen";
    case "fuchsia":
      return "--ddd-theme-default-athertonViolet";
    case "gainsboro":
      return "--ddd-theme-default-limestoneGray";
    case "ghostwhite":
      return "--ddd-theme-default-shrineLight";
    case "gold":
      return "--ddd-theme-default-keystoneYellow";
    case "goldenrod":
      return "--ddd-theme-default-roarGolden";
    case "gray":
      return "--ddd-theme-default-limestoneGray";
    case "grey":
      return "--ddd-theme-default-limestoneGray";
    case "green":
      return "--ddd-theme-default-forestGreen";
    case "greenyellow":
      return "--ddd-theme-default-futureLime";
    case "honeydew":
      return "--ddd-theme-default-infoLight";
    case "hotpink":
      return "--ddd-theme-default-discoveryCoral";
    case "indianred":
      return "--ddd-theme-default-original87Pink";
    case "indigo":
      return "--ddd-theme-default-wonderPurple";
    case "ivory":
      return "--ddd-theme-default-roarMaxLight";
    case "khaki":
      return "--ddd-theme-default-alertUrgent";
    case "lavender":
      return "--ddd-theme-default-alertNonEmergency";
    case "lavenderblush":
      return "--ddd-theme-default-alertImmediate";
    case "lawngreen":
      return "--ddd-theme-default-futureLime";
    case "lemonchiffon":
      return "--ddd-theme-default-alertUrgent";
    case "lightblue":
      return "--ddd-theme-default-accent";
    case "lightcoral":
      return "--ddd-theme-default-discoveryCoral";
    case "lightcyan":
      return "--ddd-theme-default-skyLight";
    case "lightgoldenrodyellow":
      return "--ddd-theme-default-alertUrgent";
    case "lightgray":
      return "--ddd-theme-default-limestoneGray";
    case "lightgrey":
      return "--ddd-theme-default-limestoneGray";
    case "lightgreen":
      return "--ddd-theme-default-opportunityGreen";
    case "lightpink":
      return "--ddd-theme-default-discoveryCoral";
    case "lightsalmon":
      return "--ddd-theme-default-discoveryCoral";
    case "lightseagreen":
      return "--ddd-theme-default-creekTeal";
    case "lightskyblue":
      return "--ddd-theme-default-skyLight";
    case "lightslategray":
      return "--ddd-theme-default-slateLight";
    case "lightslategrey":
      return "--ddd-theme-default-slateLight";
    case "lightsteelblue":
      return "--ddd-theme-default-alertNonEmergency";
    case "lightyellow":
      return "--ddd-theme-default-alertAllClear";
    case "lime":
      return "--ddd-theme-default-futureLime";
    case "limegreen":
      return "--ddd-theme-default-opportunityGreen";
    case "linen":
      return "--ddd-theme-default-warningLight";
    case "magenta":
      return "--ddd-theme-default-athertonViolet";
    case "maroon":
      return "--ddd-theme-default-error";
    case "mediumaquamarine":
      return "--ddd-theme-default-creekTeal";
    case "mediumblue":
      return "--ddd-theme-default-link80";
    case "mediumorchid":
      return "--ddd-theme-default-athertonViolet";
    case "mediumpurple":
      return "--ddd-theme-default-athertonViolet";
    case "mediumseagreen":
      return "--ddd-theme-default-forestGreen";
    case "mediumslateblue":
      return "--ddd-theme-default-beaverBlue";
    case "mediumspringgreen":
      return "-ddd-theme-default-futureLime";
    case "mediumturquoise":
      return "--ddd-theme-default-accent";
    case "mediumvioletred":
      return "--ddd-theme-default-original87Pink";
    case "midnightblue":
      return "--ddd-theme-default-potentialMidnight";
    case "mintcream":
      return "--ddd-theme-default-skyMaxLight";
    case "mistyrose":
      return "--ddd-theme-default-errorLight";
    case "moccasin":
      return "--ddd-theme-default-alertUrgent";
    case "navajowhite":
      return "--ddd-theme-default-alertUrgent";
    case "navy":
      return "--ddd-theme-default-nittanyNavy";
    case "oldlace":
      return "--ddd-theme-default-warningLight";
    case "olive":
      return "--ddd-theme-default-forestGreen";
    case "olivedrab":
      return "--ddd-theme-default-success";
    case "orange":
      return "--ddd-theme-default-inventOrange";
    case "orangered":
      return "--ddd-theme-default-inventOrange";
    case "orchid":
      return "--ddd-theme-default-athertonViolet";
    case "palegoldenrod":
      return "--ddd-theme-default-alertUrgent";
    case "palegreen":
      return "--ddd-theme-default-futureLime";
    case "paleturquoise":
      return "--ddd-theme-default-creekLight";
    case "palevioletred":
      return "--ddd-theme-default-alertImmediate";
    case "papayawhip":
      return "--ddd-theme-default-alertUrgent";
    case "peachpuff":
      return "--ddd-theme-default-alertUrgent";
    case "peru":
      return "--ddd-theme-default-roarGolden";
    case "pink":
      return "--ddd-theme-default-alertImmediate";
    case "plum":
      return "--ddd-theme-default-athertonViolet";
    case "powderblue":
      return "--ddd-theme-default-creekLight";
    case "purple":
      return "--ddd-theme-default-wonderPurple";
    case "rebeccapurple":
      return "--ddd-theme-default-athertonViolet";
    case "red":
      return "--ddd-theme-default-original87Pink";
    case "rosybrown":
      return "--ddd-theme-default-shrineTan";
    case "royalblue":
      return "--ddd-theme-default-skyBlue";
    case "saddlebrown":
      return "--ddd-theme-default-landgrantBrown";
    case "salmon":
      return "--ddd-theme-default-discoveryCoral";
    case "sandybrown":
      return "--ddd-theme-default-shrineTan";
    case "seagreen":
      return "--ddd-theme-default-forestGreen";
    case "seashell":
      return "--ddd-theme-default-roarLight";
    case "sienna":
      return "--ddd-theme-default-warning";
    case "silver":
      return "--ddd-theme-default-limestoneGray";
    case "skyblue":
      return "--ddd-theme-default-pughBlue";
    case "slateblue":
      return "--ddd-theme-default-athertonViolet";
    case "slategray":
      return "--ddd-theme-default-limestoneGray";
    case "slategrey":
      return "--ddd-theme-default-limestoneGray";
    case "snow":
      return "--ddd-theme-default-white";
    case "springgreen":
      return "--ddd-theme-default-futureLime";
    case "steelblue":
      return "--ddd-theme-default-link";
    case "tan":
      return "--ddd-theme-default-shrineTan";
    case "teal":
      return "--ddd-theme-default-creekTeal";
    case "thistle":
      return "--ddd-theme-default-athertonViolet";
    case "tomato":
      return "--ddd-theme-default-discoveryCoral";
    case "transparent":
      return "--ddd-theme-default-potential0";
    case "turquoise":
      return "--ddd-theme-default-skyBlue";
    case "violet":
      return "--ddd-theme-default-athertonViolet";
    case "wheat":
      return "--ddd-theme-default-alertUrgent";
    case "white":
      return "--ddd-theme-default-white";
    case "whiteSmoke":
      return "--ddd-theme-default-shrineLight";
    case "yellow":
      return "--ddd-theme-default-globalNeon";
    case "yellowGreen":
      return "--ddd-theme-default-forestGreen";
    default:
      return "No available suggestions. Check DDD documentation.";
  }
}

/**
 * @description Audits spacing related CSS properties based on px values
 * @param spacing The 
 */
function helpAuditSpacing(spacing) {
  if (spacing.includes('px')) {
    let value = Number(spacing.replace('px', ''));
    
    if (value === 0) {
      return "--ddd-spacing-0"; // 0px
    } 
    else if (value >= 1 && value <= 4) {
      return "--ddd-spacing-1"; // 4px
    } 
    else if (value >= 5 && value <= 8) {
      return "--ddd-spacing-2"; // 8px
    } 
    else if (value >= 9 && value <= 12) {
      return "--ddd-spacing-3"; // 12px
    } 
    else if (value >= 13 && value <= 16) {
      return "--ddd-spacing-4"; // 16px
    } 
    else if (value >= 17 && value <= 20) {
      return "--ddd-spacing-5"; // 20px
    } 
    else if (value >= 21 && value <= 24) {
      return "--ddd-spacing-6"; // 24px
    } 
    else if (value >= 25 && value <= 28) {
      return "--ddd-spacing-7"; // 28px
    } 
    else if (value >= 29 && value <= 32) {
      return "--ddd-spacing-8"; // 32px
    } 
    else if (value >= 33 && value <= 36) {
      return "--ddd-spacing-9"; // 36px
    }
    else if (value >= 37 && value <= 40) {
      return "--ddd-spacing-10"; // 40px
    }
    else if (value >= 41 && value <= 44) {
      return "--ddd-spacing-11"; // 44px
    }
    else if (value >= 45 && value <= 48) {
      return "--ddd-spacing-12"; // 48px
    }
    else if (value >= 49 && value <= 52) {
      return "--ddd-spacing-13"; // 52px
    }
    else if (value >= 53 && value <= 56) {
      return "--ddd-spacing-14"; // 56px
    }
    else if (value >= 57 && value <= 60) {
      return "--ddd-spacing-15"; // 60px
    }
    else if (value >= 61 && value <= 64) {
      return "--ddd-spacing-16"; // 64px
    }
    else if (value >= 65 && value <= 68) {
      return "--ddd-spacing-17"; // 68px
    }
    else if (value >= 69 && value <= 72) {
      return "--ddd-spacing-18"; // 72px
    }
    else if (value >= 73 && value <= 76) {
      return "--ddd-spacing-19"; // 76px
    }
    else if (value >= 77 && value <= 80) {
      return "--ddd-spacing-20"; // 80px
    }
    else if (value >= 81 && value <= 84) {
      return "--ddd-spacing-21"; // 84px
    }
    else if (value >= 85 && value <= 88) {
      return "--ddd-spacing-22"; // 88px
    }
    else if (value >= 89 && value <= 92) {
      return "--ddd-spacing-23"; // 92px
    }
    else if (value >= 93 && value <= 96) {
      return "--ddd-spacing-24"; // 96px
    }
    else if (value >= 97 && value <= 100) {
      return "--ddd-spacing-25"; // 100px
    }
    else if (value >= 101 && value <= 104) {
      return "--ddd-spacing-26"; // 104px
    }
    else if (value >= 105 && value <= 108) {
      return "--ddd-spacing-27"; // 108px
    }
    else if (value >= 109 && value <= 112) {
      return "--ddd-spacing-28"; // 112px
    }
    else if (value >= 113 && value <= 116) {
      return "--ddd-spacing-29"; // 116px
    }
    else if (value >= 117) {
      return "--ddd-spacing-30"; // 120px
    }
  }
  
  return "No available suggestions. Check DDD documentation.";
}