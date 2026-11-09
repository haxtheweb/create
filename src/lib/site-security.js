// Security helpers extracted from programs/site.js so they are unit-testable
// without loading the full site.js (which top-level imports haxcms-nodejs dist
// modules that may not yet ship in the published package). site.js imports these
// back. Only touches node:path and the PRESENT sanitizeContent.js dist module.

import * as path from "node:path";
import * as sanitizeContentLib from "@haxtheweb/haxcms-nodejs/dist/lib/sanitizeContent.js";
import { t } from "./i18n.js";
const sanitizeHTMLForStorage = sanitizeContentLib.sanitizeHTMLForStorage;

// Security (ssrf-guarded-fetch): true when an error thrown by safeFetch/
// assertUrlNotSSRF is an SSRF rejection (stable .code prefix) rather than a
// generic network error, so callers can surface a clear message.
export function isSSRFError(e) {
  return Boolean(e && typeof e.code === "string" && e.code.startsWith("SSRF_"));
}

// Security (sanitize-remote-html): sanitize remote-derived HTML before it is written into page
// content. Non-string values (e.g. parsed JSON/YAML objects from --format) and
// empty strings pass through unchanged so non-HTML import formats are unaffected.
export function sanitizeIfString(html) {
  return typeof html === "string" && html.length > 0
    ? sanitizeHTMLForStorage(html)
    : html;
}

// Security (safe-local-paths): canonicalize a local filesystem path and reject null bytes
// (a classic fs-path-injection vector). No fixed base is enforced because these
// options legitimately point anywhere on the user's filesystem; path.resolve is
// a harmless normalization that does not change which file is read.
export function resolveLocalPath(p) {
  if (typeof p !== "string" || p.indexOf(String.fromCharCode(0)) !== -1) {
    throw new Error(t("utilInvalidLocalPath"));
  }
  return path.resolve(p);
}
