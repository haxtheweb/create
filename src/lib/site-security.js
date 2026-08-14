// Security helpers extracted from programs/site.js so they are unit-testable
// without loading the full site.js (which top-level imports haxcms-nodejs dist
// modules that may not yet ship in the published package). site.js imports these
// back. Only touches node:path and the PRESENT sanitizeContent.js dist module.
//
// NOTE: the RECIPE_TOKEN_DENY char class is built with new RegExp + String.fromCharCode
// (not a /\n\r/ literal) so the file has no backslash escapes and the LF/CR members
// are unambiguous. The matched set is identical to the original site.js regex.

import * as path from 'node:path';
import * as sanitizeContentLib from "@haxtheweb/haxcms-nodejs/dist/lib/sanitizeContent.js";
const sanitizeHTMLForStorage = sanitizeContentLib.sanitizeHTMLForStorage;

// Security (H-4): recipe files can contain arbitrary text that used to be
// passed straight to exec() as a shell string. Replaying a recipe now invokes
// the CLI via spawn() with an argument array (no shell) so recipe contents
// cannot inject shell commands. Tokens are also guarded so malformed recipes
// fail loudly instead of producing surprising argv.
const RECIPE_TOKEN_DENY = new RegExp('[;&|`$<>(){}!' + String.fromCharCode(10) + String.fromCharCode(13) + ']');
export function guardRecipeTokens(tokens) {
  for (const t of tokens) {
    if (typeof t !== 'string' || RECIPE_TOKEN_DENY.test(t)) {
      throw new Error(`Recipe token rejected (contains shell metacharacters): ${t}`);
    }
  }
  return tokens;
}

// Security (H-1/H-2/H-3): true when an error thrown by safeFetch/
// assertUrlNotSSRF is an SSRF rejection (stable .code prefix) rather than a
// generic network error, so callers can surface a clear message.
export function isSSRFError(e) {
  return Boolean(e && typeof e.code === 'string' && e.code.startsWith('SSRF_'));
}

// Security (H-5): sanitize remote-derived HTML before it is written into page
// content. Non-string values (e.g. parsed JSON/YAML objects from --format) and
// empty strings pass through unchanged so non-HTML import formats are unaffected.
export function sanitizeIfString(html) {
  return typeof html === 'string' && html.length > 0 ? sanitizeHTMLForStorage(html) : html;
}

// Security (L-1): canonicalize a local filesystem path and reject null bytes
// (a classic fs-path-injection vector). No fixed base is enforced because these
// options legitimately point anywhere on the user's filesystem; path.resolve is
// a harmless normalization that does not change which file is read.
export function resolveLocalPath(p) {
  if (typeof p !== 'string' || p.indexOf(String.fromCharCode(0)) !== -1) {
    throw new Error('Invalid local path: null bytes are not allowed.');
  }
  return path.resolve(p);
}
