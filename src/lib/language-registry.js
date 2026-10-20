import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The HAX language registry for the CLI.
 *
 * src/lib/languages.json is a byte-identical copy of the registry authored in
 * webcomponents (elements/i18n-manager/lib/languages.json) and mirrored into
 * both HAXcms backends, so the CLI, the installer, the settings screens and
 * the backends all agree on which languages exist and on their aliases.
 *
 * Entries are keyed by the canonical code that gets stored (en, pt-BR,
 * zh-CN). `popular` ranks the ten most common languages (1-10), used to put
 * them first in the site language prompt.
 */

const REGISTRY_PATH = path.resolve(__dirname, "languages.json");

let cache = null;

function prepare(data) {
  const lookup = {};
  Object.keys(data.languages).forEach((code) => {
    lookup[code.toLowerCase()] = code;
  });
  // aliases never override a real code
  Object.keys(data.languages).forEach((code) => {
    (data.languages[code].aliases || []).forEach((alias) => {
      const key = String(alias).toLowerCase();
      if (!lookup[key]) {
        lookup[key] = code;
      }
    });
  });
  return { languages: data.languages, lookup };
}

/**
 * @description The parsed registry plus a lower-case code/alias lookup
 * @param data optional parsed registry (tests)
 */
export function getRegistry(data = null) {
  if (data) {
    return prepare(data);
  }
  if (!cache) {
    cache = prepare(JSON.parse(readFileSync(REGISTRY_PATH, "utf8")));
  }
  return cache;
}

/**
 * @description The registry code a value is exactly, or an alias of, ignoring
 * case and `_` vs `-` (zh_CN, ZH-cn and the alias zh all give zh-CN). Never
 * drops a region, so an unlisted code such as fr-CA gives null.
 * @returns canonical code or null
 */
export function matchLanguageCode(value, registry = null) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const { languages, lookup } = getRegistry(registry);
  const code = lookup[value.trim().replace(/_/g, "-").toLowerCase()];
  return code && languages[code] ? code : null;
}

/**
 * @description The canonical code when `value` is an alias (iw -> he,
 * fil -> tl), null when it already is a registry code or is unknown
 */
export function resolveLanguageAlias(value, registry = null) {
  const code = matchLanguageCode(value, registry);
  if (!code) {
    return null;
  }
  const cleaned = String(value).trim().replace(/_/g, "-");
  return code.toLowerCase() === cleaned.toLowerCase() ? null : code;
}

function toOption(code, entry) {
  return {
    value: code,
    label: `${entry.name} - ${code}`,
    hint:
      entry.nativeName && entry.nativeName !== entry.name
        ? entry.nativeName
        : undefined,
  };
}

/**
 * @description The most common languages in rank order (en, zh-CN, hi, es,
 * fr, ar, pt, bn, ru, ja) as select options
 * @param limit how many to return
 */
export function getPopularLanguageOptions(limit = 10, registry = null) {
  const { languages } = getRegistry(registry);
  return Object.keys(languages)
    .filter(
      (code) =>
        !languages[code].parent && typeof languages[code].popular === "number",
    )
    .sort((a, b) => languages[a].popular - languages[b].popular)
    .slice(0, limit)
    .map((code) => toOption(code, languages[code]));
}

/**
 * @description Every language (no regional variants) by English name, as
 * select options
 */
export function getAllLanguageOptions(registry = null) {
  const { languages } = getRegistry(registry);
  return Object.keys(languages)
    .filter((code) => !languages[code].parent)
    .sort((a, b) => languages[a].name.localeCompare(languages[b].name, "en"))
    .map((code) => toOption(code, languages[code]));
}

/**
 * @description Language prompt options: the ten most common languages first,
 * then a "More languages…" entry that opens the full list
 */
export function getSiteLanguagePromptOptions(moreLabel, registry = null) {
  return [
    ...getPopularLanguageOptions(10, registry),
    { value: "__more__", label: moreLabel },
  ];
}

/**
 * @description Normalize a site language for storage: a registry code or
 * alias resolves to its canonical code (zh_CN -> zh-CN, iw -> he); any other
 * well-formed tag such as fr-CA is kept (primary lower-case, region
 * upper-case), like the HAXcms pickers' custom code entry.
 * @returns the code to store, or null when it is not a language tag
 */
export function normalizeSiteLanguage(value, registry = null) {
  const known = matchLanguageCode(value, registry);
  if (known) {
    return known;
  }
  if (!value || typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim().replace(/_/g, "-");
  if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,4})?$/.test(cleaned)) {
    return null;
  }
  const parts = cleaned.split("-");
  parts[0] = parts[0].toLowerCase();
  if (parts[1]) {
    parts[1] = parts[1].toUpperCase();
  }
  return parts.join("-");
}
