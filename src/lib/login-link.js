// One-time sign-in link helpers for `hax site site:login-link`
// (haxtheweb/issues#2854). Kept out of programs/site.js so they are unit-testable
// without loading the full site program.
//
// The link is minted by @haxtheweb/haxcms-nodejs's magicLinks store, which
// writes a hashed record into the same _config/settings directory the running
// HAXcms server reads. The CLI only needs filesystem access to that _config;
// it never talks to the server.

export const MAGIC_LINK_ROUTE = "system/api/v1/session/magic-link";

function isLoopbackHost(value) {
  const host = String(value).split("/")[0].replace(/:\d+$/, "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  );
}

// Resolve the base URL the HAXcms server answers on. --domain wins, then the
// site's metadata.site.domain. Returns '' when neither is usable so the caller
// can print a relative path with instructions instead of a wrong URL.
export function resolveLoginLinkBase(domainOption, manifestDomain) {
  const candidates = [domainOption, manifestDomain];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    let value = candidate.trim();
    if (value === "") {
      continue;
    }
    if (!/^https?:\/\//i.test(value)) {
      // --domain is a bare host (the CLI validates it that way). Deployed
      // HAXcms is https; a loopback host is the local dev server on http.
      value = `${isLoopbackHost(value) ? "http" : "https"}://${value}`;
    }
    try {
      const parsed = new URL(value);
      if (!parsed.host) {
        continue;
      }
      // keep any path prefix (HAXcms installed under a subdirectory)
      return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, "")}`;
    } catch {
      continue;
    }
  }
  return "";
}

export function buildLoginLinkPath(token) {
  return `/${MAGIC_LINK_ROUTE}?token=${encodeURIComponent(token)}`;
}

export function buildLoginLinkUrl(base, token) {
  return `${base || ""}${buildLoginLinkPath(token)}`;
}

// Load the magic-link store from the installed backend. Dynamic so that a CLI
// paired with an older @haxtheweb/haxcms-nodejs (without magicLinks.js) still
// starts, and this one command explains what to upgrade.
export async function loadMagicLinkStore() {
  try {
    // optional on purpose: absent until the paired haxcms-nodejs ships it
    // eslint-disable-next-line n/no-missing-import
    const mod = await import("@haxtheweb/haxcms-nodejs/dist/lib/magicLinks.js");
    const store = mod && mod.default ? mod.default : mod;
    if (store && typeof store.issueMagicLink === "function") {
      return store;
    }
  } catch {
    // fall through to the upgrade message
  }
  const err = new Error(
    "This HAX CLI is paired with a @haxtheweb/haxcms-nodejs that does not support one-time sign-in links yet. Update with: npm install --global @haxtheweb/create@latest",
  );
  err.code = "MAGIC_LINK_UNSUPPORTED";
  throw err;
}

// Turn --ttl (seconds, or with an m/h suffix) into seconds; undefined = use the
// server policy default (10 minutes). The backend clamps to 60s..24h.
export function parseLoginLinkTtl(value) {
  if (value === undefined || value === null || value === "" || value === true) {
    return undefined;
  }
  const match = String(value)
    .trim()
    .match(/^(\d+)\s*([smh]?)$/i);
  if (!match) {
    throw new Error(
      `Invalid --ttl "${value}". Use seconds (600) or minutes/hours (10m, 1h).`,
    );
  }
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === "h") {
    return amount * 3600;
  }
  if (unit === "m") {
    return amount * 60;
  }
  return amount;
}
