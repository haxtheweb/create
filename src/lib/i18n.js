import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Translations for the hax CLI.
 *
 *   t('auditStart', { path }) -> text in the user's language
 *
 * Strings live in src/locales/create.<lang>.json (same {placeholder} format
 * as the web components). English is create.en.json and is the fallback for
 * anything a language doesn't have yet.
 *
 * Language, first match wins:
 *   --lang <code>, HAX_LANG, then the first of LC_ALL / LC_MESSAGES / LANG
 *   that is set (C or POSIX there means English), the OS locale, English.
 *
 * Command names, flags, --format json output and logs stay English so
 * scripts and agents keep working; only what people read is translated.
 */

const LOCALES_DIR = path.resolve(__dirname, "../locales");
// code people's systems report -> code our locale files use
const LANGUAGE_ALIASES = {
  fil: "tl", // Filipino -> Tagalog
  nn: "nb", // Norwegian Nynorsk -> Bokmal (closest we have)
  iw: "he", // legacy Hebrew
  in: "id", // legacy Indonesian
  ji: "yi", // legacy Yiddish
  jw: "jv", // legacy Javanese
};
const NAMESPACE = "create";

// namespace -> directory holding <namespace>.<lang>.json
const namespaces = { [NAMESPACE]: LOCALES_DIR };
// `${namespace}|${lang}` -> parsed JSON (null when the file doesn't exist)
const cache = {};
let current = null;

/**
 * @description Normalize a locale like pt_BR.UTF-8 or zh-Hans-CN to the
 * codes the locale files use (pt-BR, zh-CN); C / POSIX mean no preference.
 * @returns normalized code, or null
 */
export function normalizeLanguage(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  let code = value.split(".")[0].split("@")[0].replace(/_/g, "-").trim();
  if (!code || /^(c|posix)$/i.test(code)) {
    return null;
  }
  const parts = code.split("-").filter(Boolean);
  if (!/^[a-z]{2,3}$/i.test(parts[0] || "")) {
    return null;
  }
  let lang = parts[0].toLowerCase();
  // older or alternate codes for languages we ship under another code
  lang = LANGUAGE_ALIASES[lang] || lang;
  // keep a region (2 letters or 3 digits), drop scripts like Hans / Latn
  const region = parts.slice(1).find((p) => /^([a-z]{2}|\d{3})$/i.test(p));
  return region ? `${lang}-${region.toUpperCase()}` : lang;
}

/**
 * @description Work out the language to use
 * @param argv process arguments (reads --lang / --lang=)
 * @param env environment variables
 * @param osLocale the OS locale, e.g. from Intl
 */
export function detectLanguage(
  argv = process.argv,
  env = process.env,
  osLocale = null,
) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--lang" && argv[i + 1]) {
      const code = normalizeLanguage(argv[i + 1]);
      if (code) {
        return code;
      }
    } else if (typeof arg === "string" && arg.startsWith("--lang=")) {
      const code = normalizeLanguage(arg.substring(7));
      if (code) {
        return code;
      }
    }
  }
  const hax = normalizeLanguage(env.HAX_LANG);
  if (hax) {
    return hax;
  }
  // POSIX: the first of LC_ALL, LC_MESSAGES, LANG that is set decides, so
  // LC_ALL=C (common in scripts) means English even if LANG says otherwise
  for (const name of ["LC_ALL", "LC_MESSAGES", "LANG"]) {
    if (typeof env[name] === "string" && env[name].trim() !== "") {
      return normalizeLanguage(env[name]) || "en";
    }
  }
  if (osLocale === null) {
    try {
      osLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      osLocale = "";
    }
  }
  return normalizeLanguage(osLocale) || "en";
}

/**
 * @description The language in use (detected once, then cached)
 */
export function getLanguage() {
  if (!current) {
    current = detectLanguage();
  }
  return current;
}

/**
 * @description Force a language, e.g. for tests; null re-detects on next use
 */
export function setLanguage(code) {
  current = code === null ? null : normalizeLanguage(code) || "en";
}

/**
 * @description Make another namespace's locale files available to tn(),
 * e.g. the web components bundled with haxcms-nodejs, so the CLI shows the
 * same translations as the browser
 * @param name namespace (file prefix)
 * @param dir directory holding <name>.<lang>.json
 */
export function registerNamespace(name, dir) {
  namespaces[name] = dir;
  for (const k of Object.keys(cache)) {
    if (k.startsWith(`${name}|`)) {
      delete cache[k];
    }
  }
}

/**
 * @description Whether a namespace has a locale folder registered
 */
export function hasNamespace(name) {
  return Object.prototype.hasOwnProperty.call(namespaces, name);
}

/**
 * @description Locale folder of a web component bundled with haxcms-nodejs,
 * e.g. bundledElementLocales('haxcms-elements'). Lets the CLI show the same
 * translations the browser uses (such as backend response messages).
 * @param pkg package name under @haxtheweb/
 * @param resolve injectable require.resolve for tests
 * @returns absolute folder path, or null when it isn't installed
 */
export function bundledElementLocales(pkg, resolve = require.resolve) {
  try {
    const root = path.dirname(resolve("@haxtheweb/haxcms-nodejs/package.json"));
    const dir = path.join(
      root,
      "dist",
      "public",
      "build",
      "es6",
      "node_modules",
      "@haxtheweb",
      pkg,
      "locales",
    );
    return existsSync(dir) ? dir : null;
  } catch {
    return null;
  }
}

function load(namespace, lang) {
  const k = `${namespace}|${lang}`;
  if (!(k in cache)) {
    const dir = namespaces[namespace];
    const file = dir ? path.join(dir, `${namespace}.${lang}.json`) : null;
    let data = null;
    if (file && existsSync(file)) {
      try {
        data = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        data = null;
      }
    }
    cache[k] = data;
  }
  return cache[k];
}

// pt-BR -> pt-BR, pt, en
function chain(lang) {
  const out = [lang];
  const base = lang.split("-")[0];
  if (base !== lang) {
    out.push(base);
  }
  if (!out.includes("en")) {
    out.push("en");
  }
  return out;
}

/**
 * @description Fill {placeholders}; values are inserted as-is
 */
export function interpolate(text, params) {
  if (!params || typeof text !== "string") {
    return text;
  }
  // a param that is passed but empty renders like a template literal would
  // ("undefined"), so output matches what the CLI printed before translation
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : match,
  );
}

/**
 * @description Translate a key from any registered namespace
 * @param namespace e.g. 'create' or a registered asset namespace
 * @param key string key
 * @param params values for {placeholders}
 * @param fallback text to use when no language has the key
 */
export function tn(namespace, key, params = null, fallback = null) {
  for (const lang of chain(getLanguage())) {
    const data = load(namespace, lang);
    if (data && typeof data[key] === "string" && data[key] !== "") {
      return interpolate(data[key], params);
    }
  }
  return interpolate(fallback !== null ? fallback : key, params);
}

/**
 * @description A translation in the current language only: null when the
 * language is English, no file has the key, or a {placeholder} has no value.
 * Lets callers prefer more specific English text they already have (such as
 * a server's message) over the generic English for a key.
 */
export function translateOnly(namespace, key, params = null) {
  const values = params || {};
  for (const lang of chain(getLanguage())) {
    if (lang === "en") {
      return null;
    }
    const data = load(namespace, lang);
    if (data && typeof data[key] === "string" && data[key] !== "") {
      let missing = false;
      const text = data[key].replace(/\{(\w+)\}/g, (match, name) => {
        if (Object.prototype.hasOwnProperty.call(values, name)) {
          return String(values[name]);
        }
        missing = true;
        return match;
      });
      return missing ? null : text;
    }
  }
  return null;
}

/**
 * @description Translate a hax CLI string
 * @param key key in create.en.json
 * @param params values for {placeholders}
 */
export function t(key, params = null) {
  return tn(NAMESPACE, key, params);
}
