// OpenAPI contract check for the release gate (haxtheweb/issues#3334).
// haxcms-nodejs owns the specs (src/openapi/*-spec.yaml) and haxcms-php
// serves copies of them (scripts/sync-openapi-specs.js there). The two must
// say the same thing; how the YAML is laid out (line folding, quote style,
// key order) does not matter, so both are parsed and compared as data.
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// [name, path in haxcms-nodejs, path in haxcms-php]
const SPEC_PAIRS = [
  [
    "site-spec",
    "src/openapi/site-spec.yaml",
    "system/backend/php/lib/siteRoutes/openapi/site-spec.yaml",
  ],
  [
    "system-spec",
    "src/openapi/system-spec.yaml",
    "system/backend/php/lib/systemRoutes/openapi/system-spec.yaml",
  ],
];

function describe(value) {
  if (value === undefined) return "(missing)";
  const s = JSON.stringify(value);
  return s.length > 120 ? s.slice(0, 117) + "..." : s;
}

// every place two parsed documents differ, as { path, nodejs, php }
function diffValues(a, b, at = "", out = [], limit = 50) {
  if (out.length >= limit) return out;
  const isObj = (v) => v !== null && typeof v === "object";
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n && out.length < limit; i++)
      diffValues(a[i], b[i], `${at}[${i}]`, out, limit);
    return out;
  }
  if (isObj(a) && isObj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    for (const k of [...keys].sort()) {
      if (out.length >= limit) break;
      diffValues(a[k], b[k], at ? `${at}.${k}` : k, out, limit);
    }
    return out;
  }
  if (!Object.is(a, b)) out.push({ path: at || "(root)", nodejs: a, php: b });
  return out;
}

function readSpec(file) {
  if (!fs.existsSync(file)) return { error: "not found: " + file };
  try {
    return { doc: yaml.load(fs.readFileSync(file, "utf8")) };
  } catch (e) {
    return { error: "does not parse: " + e.message };
  }
}

// { ok, specs: [{ name, ok, error?, diffs }] }
function compareSpecs(nodejsDir, phpDir) {
  const specs = SPEC_PAIRS.map(([name, nodeRel, phpRel]) => {
    const n = readSpec(path.join(nodejsDir, nodeRel));
    const p = readSpec(path.join(phpDir, phpRel));
    const error = n.error || p.error;
    if (error) return { name, ok: false, error, diffs: [] };
    const diffs = diffValues(n.doc, p.doc);
    return { name, ok: diffs.length === 0, diffs };
  });
  return { ok: specs.every((s) => s.ok), specs };
}

function formatSpecReport(result) {
  const lines = [];
  for (const s of result.specs) {
    if (s.ok) {
      lines.push(`- ${s.name}: same in haxcms-nodejs and haxcms-php`);
      continue;
    }
    if (s.error) {
      lines.push(`- ${s.name}: ${s.error}`);
      continue;
    }
    lines.push(
      `- ${s.name}: ${s.diffs.length}${s.diffs.length >= 50 ? "+" : ""} difference(s)`,
    );
    for (const d of s.diffs.slice(0, 10))
      lines.push(
        `  - \`${d.path}\`: nodejs ${describe(d.nodejs)}, php ${describe(d.php)}`,
      );
  }
  if (!result.ok)
    lines.push(
      "",
      "haxcms-nodejs owns the specs: copy them to haxcms-php with `node scripts/sync-openapi-specs.js` there, or fix the one that is wrong.",
    );
  return lines.join("\n");
}

module.exports = { SPEC_PAIRS, diffValues, compareSpecs, formatSpecReport };
