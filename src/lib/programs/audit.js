import * as p from '@clack/prompts';
import { program } from "commander";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import color from 'picocolors';

let checksPassed = true;

/**
 * @description Runs the audit command, to be called when `hax audit` command is run
 * @param commandRun Enables command line flags (such as `--debug`)
 */
export function auditCommandDetected(commandRun, path = null) {
  const PROJECT_ROOT = path || process.cwd();
  p.intro(`${color.bgBlack(` 🚀 Auditing DDD Compliance: ${color.underline(color.bold(color.yellow(PROJECT_ROOT)))} `)}`)
  let dddignore = dddignoreInterpreter(PROJECT_ROOT);

  if (commandRun.options.debug) {
    p.intro(`${color.bgBlack(color.white(` 🚧 Debug: displaying .dddignore contents `))}`)
    console.table(dddignore)
  }

  auditNavigator(PROJECT_ROOT, dddignore);
  p.outro(`
    🎉 Process Completed
    
    📘 For more information about DDD variables and capabilities: ${color.underline(color.cyan(`https://haxtheweb.org/documentation/ddd`))}
  `);

  returnCode();
}

/**
 * @description Gets items from dddignore with a hierarchy (.dddignore affects folders below it, never above it)
 * @param root The root of the project directory (should be where the command is run from)
 * @returns Array of objects detailing what directories, files, and file extensions to ignore
 */
function dddignoreInterpreter(root) {
  let list = [];

  readdirSync(root).forEach(item => {
    const FULL_PATH = path.join(root, item);

    if (item !== "node_modules"  && item !== ".git" && item !== "dist" && item !== "assets" && item !== "build" && item !== "public" && statSync(FULL_PATH).isDirectory()) { // Directory
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

          list.push({
            "highestPath": root,
            "name": trimmed,
            "type": type
          });
        } 
      })
    }
  })

  return list;
}

/**
 * @description Navigate through file pathes, auditing any file that is not in the .dddignore
 * @param root The root of the project directory (should be where the command is run from)
 * @param dddignore Files, directories, and file types to ignore in file navigation and auditing
 */
function auditNavigator(root, dddignore) {
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
 * @param fileName Name of the file being audited
 */
function auditFile(fileLocation, fileName) {
  let data = [];
  p.intro(`\n ${color.bgBlue(color.white(` 🪄 Auditing: ${fileName} `))}`)
  let lines = readFileSync(fileLocation, 'utf-8').split('\n');

  const COLOR_PROPERTIES = new Set([
    "accent-color",
    "background-color",
    "border-color",
    "border-bottom-color",
    "border-left-color",
    "border-right-color",
    "border-top-color",
    "caret-color",
    "color",
  ]);

  const SPACING_PROPERTIES = new Set([
    // Margin properties
    "margin",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "margin-inline",
    "margin-inline-start",
    "margin-inline-end",
    "margin-block",
    "margin-block-start",
    "margin-block-end",

    // Padding properties
    "padding",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "padding-inline",
    "padding-inline-start",
    "padding-inline-end",
    "padding-block",
    "padding-block-start",
    "padding-block-end",

    // Gap properties
    "gap",
    "row-gap",
    "column-gap",

    // Spacing properties
    "word-spacing",
    "border-spacing",

    // Indent and offset properties
    "text-indent",
    "top",
    "right",
    "bottom",
    "left",
    "inset",
    "inset-block",
    "inset-block-start",
    "inset-block-end",
    "inset-inline",
    "inset-inline-start",
    "inset-inline-end"
  ]);

  const BORDER_SHORTHANDS = new Set([
    "border",
    "outline",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
    "column-rule",
  ]);

  const BORDER_THICKNESS_PROPERTIES = new Set([
    "border-width",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-block-width",
    "border-block-start-width",
    "border-block-end-width",
    "border-inline-width",
    "border-inline-start-width",
    "border-inline-end-width",
    "outline-width",
    "column-rule-width",
  ]);

  const RADIUS_PROPERTIES = new Set([
    "border-radius",

    // Individual corners
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",

    // Shorthand variations
    "border-top-radius",
    "border-right-radius",
    "border-bottom-radius",
    "border-left-radius",
  ]);

  lines.forEach(line => {
    let trimmed = line.trim();
    if (trimmed.includes(':') && trimmed.endsWith(';')) {
      let [lineProperty, lineAttribute] = trimmed.split(":").map(item => item?.trim());
      lineProperty = lineProperty.toLowerCase();
      lineAttribute = lineAttribute.replace(';', '');

      // Check border shorthands
      if (BORDER_SHORTHANDS.has(lineProperty) && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditBorderShorthands(lineAttribute)
        });
      }

      // Check border thicknesses
      if (BORDER_THICKNESS_PROPERTIES.has(lineProperty) && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditBorderThickness(lineAttribute)
        });
      }

      // Check box shadows
      if (lineProperty === "box-shadow" && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditBoxShadow(lineAttribute)
        });
      }

      // Check colors
      if (COLOR_PROPERTIES.has(lineProperty) && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditColors(lineAttribute)
        });
      }

      // Check font family
      if (lineProperty === "font-family" && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditFontFamily(lineAttribute)
        });
      }

      // Check font size
      if (lineProperty === "font-size" && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditFontSize(lineAttribute)
        });
      }

      // Check font weight
      if (lineProperty === "font-weight" && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditFontWeight(lineAttribute)
        })
      }

      // Check letter spacing
      if (lineProperty === "letter-spacing" && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditLetterSpacing(lineAttribute)
        });
      }

      // Check line height spacing
      if (lineProperty === "line-height" && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditLineHeight(lineAttribute)
        });
      }

      // Check radius
      if (RADIUS_PROPERTIES.has(lineProperty) && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditRadius(lineAttribute)
        });
      }

      // Check spacing
      if (SPACING_PROPERTIES.has(lineProperty) && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditSpacing(lineAttribute)
        });
      }
    }
  })

  if (data.length !== 0) {
    console.table(data);
    checksPassed = false;
  } else {
    p.note("No changes needed!")
  }
}

/**
 * @description Exits program with a return code for automation purposes. 0 = compliant, 1 = not compliant
 */
function returnCode() {
  if (!checksPassed) { // Not-compliant
    program.error(color.red("Component not compliant with DDD"));
    process.exit(1);
  }
  
  process.exit(0) // Compliant
}

// ! Audit Helpers

/**
 * @description Audits border related CSS properties based on preset borders and thicknesses
 * @param border Pre-audit CSS border value
 * @returns String containing suggested changes
 */
function helpAuditBorderShorthands(borderPreset) {
  if (borderPreset.includes('px')) {
    borderPreset = borderPreset.trim();
    borderPreset = Number(borderPreset.charAt(0));

    if (borderPreset <= 1) {
      return "--ddd-border-xs"; // 1px solid greyish
    }
    else if (borderPreset > 1 && borderPreset <= 2) {
      return "--ddd-border-sm"; // 2px solid greyish
    }
    else if (borderPreset > 2 && borderPreset <= 3) {
      return "--ddd-border-md"; // 3px solid greyish
    }
    else if (borderPreset > 3) {
      return "--ddd-border-lg"; // 4px solid greyish
    }
  }

  return "No available suggestions. Check DDD documentation.";
}

/**
 * @description Audits border related CSS properties
 * @param borderThickness Pre-audited CSS border thickness
 * @returns String containing suggested changes
 */
function helpAuditBorderThickness(borderThickness) {
  if (borderThickness.includes("px")) {
    borderThickness = Number(borderThickness.replace("px", ""));

    if (borderThickness <= 1) {
      return "--ddd-border-size-xs"; // 1px
    }
    else if (borderThickness > 1 && borderThickness <= 2) {
      return "--ddd-border-size-sm"; // 2px
    }
    else if (borderThickness > 2 && borderThickness <= 3) {
      return "--ddd-border-size-md"; // 3px
    }
    else if (borderThickness > 3) {
      return "--ddd-border-size-lg"; // 4px
    }
  }

  return "No available suggestions. Check DDD documentation.";  
}

/**
 * @description Audits border related CSS properties
 * @param boxShadow Pre-audited CSS box-shadow attribute
 * @returns String containing suggested changes
 */
function helpAuditBoxShadow(boxShadow) {
  if (boxShadow.includes('px')) {
    const SMALL = [ " 1px", " 2px", " 3px", " 4px" ];
    const MEDIUM = [ " 5px", " 6px", " 7px", " 8px", ];
    const LARGE = [ " 9px", " 10px", " 11px", " 12px", ];
    const EXTRA_LARGE = [ " 13px", " 14px", " 15px", " 16px", ];

    const HAS_SMALL = SMALL.some(i => boxShadow.includes(i));
    const HAS_MEDIUM = MEDIUM.some(i => boxShadow.includes(i));
    const HAS_LARGE = LARGE.some(i => boxShadow.includes(i));
    const HAS_EXTRA_LARGE = EXTRA_LARGE.some(i => boxShadow.includes(i));

    if (boxShadow.includes("0px") && !HAS_SMALL && !HAS_MEDIUM && !HAS_LARGE && !HAS_EXTRA_LARGE) {
      return "--ddd-boxShadow-0"; // 0px
    }
    else if (HAS_SMALL) {
      return "--ddd-boxShadow-sm"; // 4px
    }
    else if (HAS_MEDIUM) {
      return "--ddd-boxShadow-md"; // 8px
    }
    else if (HAS_LARGE) {
      return "--ddd-boxShadow-lg"; // 12px
    }
    else {
      return "--ddd-boxShadow-xl"
    }
  }

  return "No available suggestions. Check DDD documentation.";
}

/**
 * @description Audits color related CSS properties based on the CSS preset colors
 * @param color CSS preset color
 * @returns String containing suggested changes
 */
function helpAuditColors(color) {
  const COLOR_OBJECT = {
    "aliceblue":            "--ddd-theme-default-slateLight",
    "antiquewhite":         "--ddd-theme-default-roarLight",
    "aqua":                 "--ddd-theme-default-skyBlue",
    "aquamarine":           "--ddd-theme-default-creekTeal",
    "azure":                "--ddd-theme-default-creekMaxLight",
    "beige":                "--ddd-theme-default-alertUrgent",
    "bisque":               "--ddd-theme-default-alertUrgent",
    "black":                "--ddd-theme-default-coalyGray",
    "blanchedalmond":       "--ddd-theme-default-alertUrgent",
    "blue":                 "--ddd-theme-default-beaverBlue",
    "blueviolet":           "--ddd-theme-default-athertonViolet",
    "brown":                "--ddd-theme-default-landgrantBrown",
    "burlywood":            "--ddd-theme-default-shrineTan",
    "cadetblue":            "--ddd-theme-default-creekTeal",
    "chartreuse":           "--ddd-theme-default-futureLime",
    "chocolate":            "--ddd-theme-default-warning",
    "coral":                "--ddd-theme-default-discoveryCoral",
    "cornflowerblue":       "--ddd-theme-default-accent",
    "cornsilk":             "--ddd-theme-default-roarLight",
    "crimson":              "--ddd-theme-default-original87Pink",
    "cyan":                 "--ddd-theme-default-skyBlue",
    "darkblue":             "--ddd-theme-default-nittanyNavy",
    "darkcyan":             "--ddd-theme-default-creekTeal",
    "darkgoldenrod":        "--ddd-theme-default-roarGolden",
    "darkgray":             "--ddd-theme-default-limestoneGray",
    "darkgrey":             "--ddd-theme-default-limestoneGray",
    "darkgreen":            "--ddd-theme-default-success",
    "darkkhaki":            "--ddd-theme-default=alertAllClear",
    "darkmagenta":          "--ddd-theme-default-wonderPurple",
    "darkolivegreen":       "--ddd-theme-default-forestGreen",
    "darkorange":           "--ddd-theme-default-inventOrange",
    "darkorchid":           "--ddd-theme-default-athertonViolet",
    "darkred":              "--ddd-theme-default-error",
    "darksalmon":           "--ddd-theme-default-discoveryCoral",
    "darkseagreen":         "--ddd-theme-default-alertAllClear",
    "darkslateblue":        "--ddd-theme-default-beaverBlue",
    "darkslategray":        "--ddd-theme-default-slateGray",
    "darkslategrey":        "--ddd-theme-default-slateGray",
    "darkturquoise":        "--ddd-theme-default-link",
    "darkviolet":           "--ddd-theme-default-wonderPurple",
    "deeppink":             "--ddd-theme-default-original87Pink",
    "deepskyblue":          "--ddd-theme-default-skyBlue",
    "dimgray":              "--ddd-theme-default-limestoneGray",
    "dimgrey":              "--ddd-theme-default-limestoneGray",
    "dodgerblue":           "--ddd-theme-default-link",
    "firebrick":            "--ddd-theme-default-error",
    "floralwhite":          "--ddd-theme-default-warningLight",
    "forestgreen":          "--ddd-theme-default-forestGreen",
    "fuchsia":              "--ddd-theme-default-athertonViolet",
    "gainsboro":            "--ddd-theme-default-limestoneGray",
    "ghostwhite":           "--ddd-theme-default-shrineLight",
    "gold":                 "--ddd-theme-default-keystoneYellow",
    "goldenrod":            "--ddd-theme-default-roarGolden",
    "gray":                 "--ddd-theme-default-limestoneGray",
    "grey":                 "--ddd-theme-default-limestoneGray",
    "green":                "--ddd-theme-default-forestGreen",
    "greenyellow":          "--ddd-theme-default-futureLime",
    "honeydew":             "--ddd-theme-default-infoLight",
    "hotpink":              "--ddd-theme-default-discoveryCoral",
    "indianred":            "--ddd-theme-default-original87Pink",
    "indigo":               "--ddd-theme-default-wonderPurple",
    "ivory":                "--ddd-theme-default-roarMaxLight",
    "khaki":                "--ddd-theme-default-alertUrgent",
    "lavender":             "--ddd-theme-default-alertNonEmergency",
    "lavenderblush":        "--ddd-theme-default-alertImmediate",
    "lawngreen":            "--ddd-theme-default-futureLime",
    "lemonchiffon":         "--ddd-theme-default-alertUrgent",
    "lightblue":            "--ddd-theme-default-accent",
    "lightcoral":           "--ddd-theme-default-discoveryCoral",
    "lightcyan":            "--ddd-theme-default-skyLight",
    "lightgoldenrodyellow": "--ddd-theme-default-alertUrgent",
    "lightgray":            "--ddd-theme-default-limestoneGray",
    "lightgrey":            "--ddd-theme-default-limestoneGray",
    "lightgreen":           "--ddd-theme-default-opportunityGreen",
    "lightpink":            "--ddd-theme-default-discoveryCoral",
    "lightsalmon":          "--ddd-theme-default-discoveryCoral",
    "lightseagreen":        "--ddd-theme-default-creekTeal",
    "lightskyblue":         "--ddd-theme-default-skyLight",
    "lightslategray":       "--ddd-theme-default-slateLight",
    "lightslategrey":       "--ddd-theme-default-slateLight",
    "lightsteelblue":       "--ddd-theme-default-alertNonEmergency",
    "lightyellow":          "--ddd-theme-default-alertAllClear",
    "lime":                 "--ddd-theme-default-futureLime",
    "limegreen":            "--ddd-theme-default-opportunityGreen",
    "linen":                "--ddd-theme-default-warningLight",
    "magenta":              "--ddd-theme-default-athertonViolet",
    "maroon":               "--ddd-theme-default-error",
    "mediumaquamarine":     "--ddd-theme-default-creekTeal",
    "mediumblue":           "--ddd-theme-default-link80",
    "mediumorchid":         "--ddd-theme-default-athertonViolet",
    "mediumpurple":         "--ddd-theme-default-athertonViolet",
    "mediumseagreen":       "--ddd-theme-default-forestGreen",
    "mediumslateblue":      "--ddd-theme-default-beaverBlue",
    "mediumspringgreen":    "-ddd-theme-default-futureLime",
    "mediumturquoise":      "--ddd-theme-default-accent",
    "mediumvioletred":      "--ddd-theme-default-original87Pink",
    "midnightblue":         "--ddd-theme-default-potentialMidnight",
    "mintcream":            "--ddd-theme-default-skyMaxLight",
    "mistyrose":            "--ddd-theme-default-errorLight",
    "moccasin":             "--ddd-theme-default-alertUrgent",
    "navajowhite":          "--ddd-theme-default-alertUrgent",
    "navy":                 "--ddd-theme-default-nittanyNavy",
    "oldlace":              "--ddd-theme-default-warningLight",
    "olive":                "--ddd-theme-default-forestGreen",
    "olivedrab":            "--ddd-theme-default-success",
    "orange":               "--ddd-theme-default-inventOrange",
    "orangered":            "--ddd-theme-default-inventOrange",
    "orchid":               "--ddd-theme-default-athertonViolet",
    "palegoldenrod":        "--ddd-theme-default-alertUrgent",
    "palegreen":            "--ddd-theme-default-futureLime",
    "paleturquoise":        "--ddd-theme-default-creekLight",
    "palevioletred":        "--ddd-theme-default-alertImmediate",
    "papayawhip":           "--ddd-theme-default-alertUrgent",
    "peachpuff":            "--ddd-theme-default-alertUrgent",
    "peru":                 "--ddd-theme-default-roarGolden",
    "pink":                 "--ddd-theme-default-alertImmediate",
    "plum":                 "--ddd-theme-default-athertonViolet",
    "powderblue":           "--ddd-theme-default-creekLight",
    "purple":               "--ddd-theme-default-wonderPurple",
    "rebeccapurple":        "--ddd-theme-default-athertonViolet",
    "red":                  "--ddd-theme-default-original87Pink",
    "rosybrown":            "--ddd-theme-default-shrineTan",
    "royalblue":            "--ddd-theme-default-skyBlue",
    "saddlebrown":          "--ddd-theme-default-landgrantBrown",
    "salmon":               "--ddd-theme-default-discoveryCoral",
    "sandybrown":           "--ddd-theme-default-shrineTan",
    "seagreen":             "--ddd-theme-default-forestGreen",
    "seashell":             "--ddd-theme-default-roarLight",
    "sienna":               "--ddd-theme-default-warning",
    "silver":               "--ddd-theme-default-limestoneGray",
    "skyblue":              "--ddd-theme-default-pughBlue",
    "slateblue":            "--ddd-theme-default-athertonViolet",
    "slategray":            "--ddd-theme-default-limestoneGray",
    "slategrey":            "--ddd-theme-default-limestoneGray",
    "snow":                 "--ddd-theme-default-white",
    "springgreen":          "--ddd-theme-default-futureLime",
    "steelblue":            "--ddd-theme-default-link",
    "tan":                  "--ddd-theme-default-shrineTan",
    "teal":                 "--ddd-theme-default-creekTeal",
    "thistle":              "--ddd-theme-default-athertonViolet",
    "tomato":               "--ddd-theme-default-discoveryCoral",
    "transparent":          "--ddd-theme-default-potential0",
    "turquoise":            "--ddd-theme-default-skyBlue",
    "violet":               "--ddd-theme-default-athertonViolet",
    "wheat":                "--ddd-theme-default-alertUrgent",
    "white":                "--ddd-theme-default-white",
    "whiteSmoke":           "--ddd-theme-default-shrineLight",
    "yellow":               "--ddd-theme-default-globalNeon",
    "yellowGreen":          "--ddd-theme-default-forestGreen",
  }

  return COLOR_OBJECT[color.toLowerCase()] ?? 'No available suggestions. Check DDD documentation.';
}

/**
 * @description Audits font-family CSS property
 * @param fontFamily Pre-audit CSS font-family value
 * @returns String containing suggested changes
 */
function helpAuditFontFamily(fontFamily) {
  fontFamily = fontFamily.toLowerCase();

  const FONT_FAMILIES = [
    { type: "--ddd-font-primary",    fonts: ["roboto", "franklin gothic medium", "tahoma", "sans-serif"]},
    { type: "--ddd-font-secondary",  fonts: ["roboto slab", "serif"] },
    { type: "--ddd-font-navigation", fonts: ["roboto condensed"] }
  ]

  for (const object of FONT_FAMILIES) {
    if (object.fonts.includes(fontFamily)) return object.type
  }

  return "--ddd-font-primary";
}

/**
 * @description Audits font-size CSS property
 * @param fontSize Pre-audit CSS font-size value
 * @returns String containing suggested changes
 */
function helpAuditFontSize(fontSize) {
  if (fontSize.includes('px')) {
    fontSize = Number(fontSize.replace('px', ''))

    if (fontSize <= 16) {
      return "--ddd-font-size-4xs"; // 16px
    }
    else if (fontSize > 16 && fontSize <= 18) {
      return "--ddd-font-size-3xs"; // 18px
    }
    else if (fontSize > 18 && fontSize <= 20) {
      return "--ddd-font-size-xxs"; // 20px
    }
    else if (fontSize > 20 && fontSize <= 22) {
      return "--ddd-font-size-xs"; // 22px
    }
    else if (fontSize > 22 && fontSize <= 24) {
      return "--ddd-font-size-s"; // 24px
    }
    else if (fontSize > 24 && fontSize <= 28) {
      return "--ddd-font-size-ms"; // 28px
    }
    else if (fontSize > 28 && fontSize <= 32) {
      return "--ddd=font-size-m"; // 32px
    }
    else if (fontSize > 32 && fontSize <= 36) {
      return "--ddd-font-size-ml"; // 36px
    }
    else if (fontSize > 36 && fontSize <= 42) {
      return "--ddd-font-size-l"; // 40px
    }
    else if (fontSize > 42 && fontSize <= 52) {
      return "--ddd-font-size-xl"; // 48px
    }
    else if (fontSize > 52 && fontSize <= 60) {
      return "--ddd-font-size-xxl"; // 56px
    }
    else if (fontSize > 60 && fontSize <= 68) {
      return "--ddd-font-size-3xl"; // 64px
    }
    else if (fontSize > 68 && fontSize <= 76) {
      return "--ddd-font-size-4xl"; // 72px
    }
    else if (fontSize > 76 && fontSize <= 120) {
      return "--ddd-font-size-type1-s" // 80px
    }
    else if (fontSize > 120 && fontSize <= 170) {
      return "--ddd-font-size-type1-m" // 150px
    }
    else if (fontSize > 170) {
      return "--ddd-font-size-type1-l" // 200px
    }
  }

  return "No available suggestions. Check DDD documentation.";
}

/**
 * @description Audits font-weight CSS property
 * @param fontWeight Pre-audit CSS font-weight value
 * @returns String containing suggested changes
 */
function helpAuditFontWeight(fontWeight) {
  const REGEX = /\d+/;
  const IS_NUM = fontWeight.match(REGEX); 

  if (IS_NUM) {
    fontWeight = Number(IS_NUM[0]);

    if (fontWeight <= 300) {
      return "--ddd-font-weight-light"; // 300
    }
    else if (fontWeight > 300 && fontWeight <= 400) {
      return "--ddd-font-weight-regular"; // 400
    }
    else if (fontWeight > 400 && fontWeight <= 500) {
      return "--ddd-font-weight-medium"; // 500
    }
    else if (fontWeight > 500 && fontWeight <= 700) {
      return "--ddd-font-size-bold"; // 700
    }
    else if (fontWeight > 700) {
      return "--ddd-font-size-black"; // 900
    }
  }

  switch(fontWeight.toLowerCase()) {
    case "lighter":
      return "--ddd-font-weight-light"; // 300
    case "normal":
      return "--ddd-font-weight-regular" // 400
    case "bold":
      return "--ddd-font-weight-bold" // 700
    case "bolder":
      return "--ddd-font-weight-black" // 900
    default:
      return "No available suggestions. Check DDD documentation.";
  }
}

/**
 * @description Audits letter-spacing CSS property
 * @param letterSpacing Pre-audit CSS letter-spacing value
 * @returns String containing suggested changes
 */
function helpAuditLetterSpacing(letterSpacing) {
  if (letterSpacing.includes('px')) {
    letterSpacing = letterSpacing.replace('px', '');

    if (letterSpacing <= 0.08) {
      return "--ddd-ls-16-sm"; // 0.08px
    } 
    else if (letterSpacing > 0.08 && letterSpacing <= 0.09) {
      return "--ddd-ls-18-sm"; // 0.09px
    } 
    else if (letterSpacing > 0.09 && letterSpacing <= 0.1) {
      return "--ddd-ls-20-sm"; // 0.1px
    }
    else if (letterSpacing > 0.1 && letterSpacing <= 0.11) {
      return "--ddd-ls-22-sm"; // 0.11px
    }
    else if (letterSpacing > 0.11 && letterSpacing <= 0.12) {
      return "--ddd-ls-24-sm"; // 0.12px
    }
    else if (letterSpacing > 0.12 && letterSpacing <= 0.14) {
      return "--ddd-ls-28-sm"; // 0.14px
    }
    else if (letterSpacing > 0.14 && letterSpacing <= 0.16) {
      return "--ddd-ls-32-sm"; // 0.16px
    }
    else if (letterSpacing > 0.16 && letterSpacing <= 0.18) {
      return "--ddd-ls-36-sm"; // 0.18px
    }
    else if (letterSpacing > 0.18 && letterSpacing <= 0.2) {
      return "--ddd-ls-40-sm"; // 0.2px
    }
    else if (letterSpacing > 0.2 && letterSpacing <= 0.24) {
      return "--ddd-ls-48-sm"; // 0.24px
    }
    else if (letterSpacing > 0.24 && letterSpacing <= 0.27) {
      return "--ddd-ls-18-lg"; // 0.27px
    }
    else if (letterSpacing > 0.27 && letterSpacing <= 0.28) {
      return "--ddd-ls-56-sm"; // 0.28px
    }
    else if (letterSpacing > 0.28 && letterSpacing <= 0.3) {
      return "--ddd-ls-20-lg"; // 0.3px
    }
    else if (letterSpacing > 0.3 && letterSpacing <= 0.32) {
      return "--ddd-ls-64-sm"; // 0.32px
    }
    else if (letterSpacing > 0.32 && letterSpacing <= 0.33) {
      return "--ddd-ls-22-lg"; // 0.33px
    }
    else if (letterSpacing > 0.33 && letterSpacing <= 0.36) {
      return "--ddd-ls-24-lg"; // 0.36px
    }
    else if (letterSpacing > 0.36 && letterSpacing <= 0.42) {
      return "--ddd-ls-28-lg"; // 0.42px
    }
    else if (letterSpacing > 0.42 && letterSpacing <= 0.48) {
      return "--ddd-ls-32-lg"; // 0.48px
    }
    else if (letterSpacing > 0.48 && letterSpacing <= 0.54) {
      return "--ddd-ls-36-lg"; // 0.54px
    }
    else if (letterSpacing > 0.54 && letterSpacing <= 0.6) {
      return "--ddd-ls-40-lg"; // 0.6px
    }
    else if (letterSpacing > 0.6 && letterSpacing <= 0.72) {
      return "--ddd-ls-48-lg"; // 0.72px
    }
    else if (letterSpacing > 0.72 && letterSpacing <= 0.84) {
      return "--ddd-ls-56-lg"; // 0.84px
    }
    else if (letterSpacing > 0.84 && letterSpacing <= 0.96) {
      return "--ddd-ls-64-lg"; // 0.96px
    }
    else if (letterSpacing > 0.96) {
      return "--ddd-ls-72-lg"; // 1.08px
    }
  }

  return "No available suggestions. Check DDD documentation.";
}

/**
 * @description Audits line-height CSS property
 * @param lineHeight Pre-audit CSS line-height value
 * @returns String containing suggested changes
 */
function helpAuditLineHeight(lineHeight) {
  if (lineHeight.includes('%')) {
    lineHeight = lineHeight.replace('%', '');

    if (lineHeight <= 120) {
      return "--ddd-lh-120"; // 120%
    }
    else if (lineHeight > 120 && lineHeight <= 140) {
      return "--ddd-lh-140"; // 140%
    }
    else if (lineHeight > 140) {
      return "--ddd-lh-150"; // 150%
    }
  }

  return "No available suggestions. Check DDD documentation.";
}

/**
 * @description Audits radius related CSS properties based on px and % values
 * @param radius Pre-audit CSS radius value
 * @returns String containing suggested changes
 */
function helpAuditRadius(radius) {
  if (radius.includes("px")) {
    radius = Number(radius.replace("px", ""));

    if (radius === 0) {
      return "--ddd-radius-0"; // 0px
    }
    else if (radius > 0 && radius <= 4) {
      return "--ddd-radius-xs"; // 4px
    }
    else if (radius > 4 && radius <= 8) {
      return "--ddd-radius-sm"; // 8px
    }
    else if (radius > 8 && radius <= 12) {
      return "--ddd-radius-md"; // 12px
    }
    else if (radius > 12 && radius <= 16) {
      return "--ddd-radius-lg"; // 16px
    }
    else if (radius > 16 && radius <= 20) {
      return "--ddd-radius-xl"; // 20px
    }
    else if (radius > 20) {
      return "--ddd-radius-rounded"; // 100px
    }
  }
  else if (radius.includes("%")) {
    radius = Number(radius.replace("%", ""));

    if (radius === 100) {
      return "--ddd-radius-circle"; // 100%
    }
  }
  
  return "No available suggestions. Check DDD documentation.";
}

/**
 * @description Audits spacing related CSS properties based on px values
 * @param spacing Pre-audit CSS spacing value
 * @returns String containing suggested changes
 */
function helpAuditSpacing(spacing) {
  if (spacing.includes('px')) {
    spacing = Number(spacing.replace('px', ''));
    
    if (spacing === 0) {
      return "--ddd-spacing-0"; // 0px
    } 
    else if (spacing > 0 && spacing <= 4) {
      return "--ddd-spacing-1"; // 4px
    } 
    else if (spacing > 4 && spacing <= 8) {
      return "--ddd-spacing-2"; // 8px
    } 
    else if (spacing > 8 && spacing <= 12) {
      return "--ddd-spacing-3"; // 12px
    } 
    else if (spacing > 12 && spacing <= 16) {
      return "--ddd-spacing-4"; // 16px
    } 
    else if (spacing > 16 && spacing <= 20) {
      return "--ddd-spacing-5"; // 20px
    } 
    else if (spacing > 20 && spacing <= 24) {
      return "--ddd-spacing-6"; // 24px
    } 
    else if (spacing > 24 && spacing <= 28) {
      return "--ddd-spacing-7"; // 28px
    } 
    else if (spacing > 28 && spacing <= 32) {
      return "--ddd-spacing-8"; // 32px
    } 
    else if (spacing > 32 && spacing <= 36) {
      return "--ddd-spacing-9"; // 36px
    }
    else if (spacing > 36 && spacing <= 40) {
      return "--ddd-spacing-10"; // 40px
    }
    else if (spacing > 40 && spacing <= 44) {
      return "--ddd-spacing-11"; // 44px
    }
    else if (spacing > 44 && spacing <= 48) {
      return "--ddd-spacing-12"; // 48px
    }
    else if (spacing > 48 && spacing <= 52) {
      return "--ddd-spacing-13"; // 52px
    }
    else if (spacing > 52 && spacing <= 56) {
      return "--ddd-spacing-14"; // 56px
    }
    else if (spacing > 56 && spacing <= 60) {
      return "--ddd-spacing-15"; // 60px
    }
    else if (spacing > 60 && spacing <= 64) {
      return "--ddd-spacing-16"; // 64px
    }
    else if (spacing > 64 && spacing <= 68) {
      return "--ddd-spacing-17"; // 68px
    }
    else if (spacing > 68 && spacing <= 72) {
      return "--ddd-spacing-18"; // 72px
    }
    else if (spacing > 72 && spacing <= 76) {
      return "--ddd-spacing-19"; // 76px
    }
    else if (spacing > 76 && spacing <= 80) {
      return "--ddd-spacing-20"; // 80px
    }
    else if (spacing > 80 && spacing <= 84) {
      return "--ddd-spacing-21"; // 84px
    }
    else if (spacing > 84 && spacing <= 88) {
      return "--ddd-spacing-22"; // 88px
    }
    else if (spacing > 88 && spacing <= 92) {
      return "--ddd-spacing-23"; // 92px
    }
    else if (spacing > 92 && spacing <= 96) {
      return "--ddd-spacing-24"; // 96px
    }
    else if (spacing > 96 && spacing <= 100) {
      return "--ddd-spacing-25"; // 100px
    }
    else if (spacing > 100 && spacing <= 104) {
      return "--ddd-spacing-26"; // 104px
    }
    else if (spacing > 104 && spacing <= 108) {
      return "--ddd-spacing-27"; // 108px
    }
    else if (spacing > 108 && spacing <= 112) {
      return "--ddd-spacing-28"; // 112px
    }
    else if (spacing > 112 && spacing <= 116) {
      return "--ddd-spacing-29"; // 116px
    }
    else if (spacing > 116) {
      return "--ddd-spacing-30"; // 120px
    }
  }
  else if (spacing == 0) {
    return "--ddd-spacing-0"; // 0px
  }
  
  return "No available suggestions. Check DDD documentation.";
}