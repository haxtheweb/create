import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import color from 'picocolors';
import * as p from '@clack/prompts';

/**
 * @description Runs the audit command, to be called when `hax audit` command is run
 */
export function auditCommandDetected(commandRun) {
  const PROJECT_ROOT = process.cwd();
  p.intro(`${color.bgBlack(` 🚀 Auditing DDD Compliance: ${color.underline(color.bold(color.yellow(PROJECT_ROOT)))} `)}`)
  let dddignore = dddignoreInterpreter(PROJECT_ROOT);

  if (commandRun.options.debug) {
    p.intro(`${color.bgBlack(color.white(` 🚧 Debug: displaying .dddignore contents `))}`)
    console.table(dddignore)
  }

  auditNavigator(PROJECT_ROOT, dddignore);
  p.outro(`
    🎉 Process Completed
    
    📘 For more information about DDD variables and capabilities: ${color.underline(color.cyan(`https://oer.hax.psu.edu/bto108/sites/haxcellence/documentation/ddd`))}
  `)
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
 */
function auditFile(fileLocation, fileName) {
  let data = [];
  p.intro(`\n ${color.bgBlue(color.white(` 🪄 Auditing: ${fileName} `))}`)
  let lines = readFileSync(fileLocation, 'utf-8').split('\n');

  const COLOR_PROPERTIES = [
    "accent-color",
    "background-color",
    "border-color",
    "border-bottom-color",
    "border-left-color",
    "border-right-color",
    "border-top-color",
    "caret-color",
    "color",
  ];

  const SPACING_PROPERTIES = [
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
  ];

  const BORDER_SHORTHANDS = [
    "border",
    "outline",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
    "column-rule",
  ]

  const BORDER_THICKNESS_PROPERTIES = [
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
  ]

  const RADIUS_PROPERTIES = [
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
  ]

  lines.forEach(line => {
    let trimmed = line.trim();
    if (trimmed.includes(':') && trimmed.endsWith(';')) {
      let [lineProperty, lineAttribute] = trimmed.split(":").map(item => item?.trim());
      lineProperty = lineProperty.toLowerCase();
      lineAttribute = lineAttribute.replace(';', '');

      // Check border shorthands
      if (BORDER_SHORTHANDS.includes(lineProperty) && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditBorderShorthands(lineAttribute)
        });
      }

      // Check border thicknesses
      if (BORDER_THICKNESS_PROPERTIES.includes(lineProperty) && !lineAttribute.includes("ddd")) {
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
      if (COLOR_PROPERTIES.includes(lineProperty) && !lineAttribute.includes("ddd")) {
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
      if (RADIUS_PROPERTIES.includes(lineProperty) && !lineAttribute.includes("ddd")) {
        data.push({
          "Line Number": lines.indexOf(line) + 1,
          "CSS Property": lineProperty,
          "Current Attribute": lineAttribute,
          "Suggested Replacement Attribute": helpAuditRadius(lineAttribute)
        });
      }

      // Check spacing
      if (SPACING_PROPERTIES.includes(lineProperty) && !lineAttribute.includes("ddd")) {
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
  } else {
    p.note("No changes needed!")
  }
}

// ! Audit Helpers

/**
 * @description Audits border related CSS properties based on preset borders and thicknesses
 * @param border Pre-audit CSS border value
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
 */
function helpAuditColors(color) {
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
 * @description Audits font-family CSS property
 * @param fontFamily Pre-audit CSS font-family value
 */
function helpAuditFontFamily(fontFamily) {
  fontFamily = fontFamily.toLowerCase();

  if (fontFamily.includes('roboto') || 
      fontFamily.includes('franklin gothic medium') ||
      fontFamily.includes('tahoma') ||
      fontFamily.includes('sans-serif')) {
    return "--ddd-font-primary";
  }
  else if (fontFamily.includes('roboto slab') || fontFamily.includes('serif')) {
    return "--ddd-font-secondary";
  }
  else if (fontFamily.includes('roboto condensed')) {
    return "--ddd-font-navigation";
  }

  return "--ddd-font-primary";
}

/**
 * @description Audits font-size CSS property
 * @param fontSize Pre-audit CSS font-size value
 */
function helpAuditFontSize(fontSize) {
  if (fontSize.includes('px')) {
    fontSize = Number(fontSize.replace('px', ''))

    if (fontSize <= 16) {
      return "--ddd-font-size-4xs"; // 16px
    }
    else if (fontSize > 16 || fontSize <= 18) {
      return "--ddd-font-size-3xs"; // 18px
    }
    else if (fontSize > 18 || fontSize <= 20) {
      return "--ddd-font-size-xxs"; // 20px
    }
    else if (fontSize > 20 || fontSize <= 22) {
      return "--ddd-font-size-xs"; // 22px
    }
    else if (fontSize > 22 || fontSize <= 24) {
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
    else if (letterSpacing > 0.09 & letterSpacing <= 0.1) {
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