/**
 * Platform update awareness for the HAX CLI (haxtheweb/issues#1768).
 *
 * Same rules as the HAXcms status report (haxcms-nodejs
 * src/lib/platformUpdates.js, haxcms-php lib/PlatformUpdateService.php),
 * checked against the same shared vectors
 * (test/fixtures/platform-update-vectors.json): is a newer release out, and
 * is the installed version below a patched version in a published security
 * advisory on haxtheweb/issues. Read-only: nothing here downloads or writes
 * release files.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// Security (fixed-outbound-urls): every URL fetched here is a constant; no
// URL comes from arguments, config files or a remote payload.
export const ADVISORIES_API_URL =
  "https://api.github.com/repos/haxtheweb/issues/security-advisories?state=published&per_page=100";
export const RELEASE_API_URLS = {
  "haxcms-php":
    "https://api.github.com/repos/haxtheweb/haxcms-php/releases/latest",
  "haxcms-nodejs":
    "https://api.github.com/repos/haxtheweb/haxcms-nodejs/releases/latest",
};
const TRUSTED_URL_PREFIX = "https://github.com/haxtheweb/";
const MAX_ADVISORIES = 20;
const FETCH_TIMEOUT_MS = 3000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
// how long cached release/advisory data is used before asking GitHub again
export const PLATFORM_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeVersion(value = "") {
  let normalized = typeof value === "string" ? value : `${value || ""}`;
  normalized = normalized.trim();
  if (normalized.toLowerCase().indexOf("v") === 0) {
    normalized = normalized.substring(1);
  }
  return normalized;
}

export function parseVersion(value = "") {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(`${value || ""}`);
  if (!match) {
    return null;
  }
  return [
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    match[3] ? parseInt(match[3], 10) : 0,
  ];
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    return null;
  }
  for (let i = 0; i < 3; i++) {
    if (left[i] < right[i]) {
      return -1;
    }
    if (left[i] > right[i]) {
      return 1;
    }
  }
  return 0;
}

export function normalizeAdvisoryPackage(name = "") {
  let normalized = `${name || ""}`.trim().toLowerCase();
  normalized = normalized.replace(/^\/+/, "");
  normalized = normalized.replace(/^@?(haxtheweb|haxcms)\//, "");
  normalized = normalized.replace(/\.operations$/, "");
  normalized = normalized.replace(/\s+/g, "-");
  if (normalized === "haxcms-php" || normalized === "haxcms-nodejs") {
    return normalized;
  }
  return "";
}

export function findSecurityAdvisories(advisories, currentVersion, packageKey) {
  const found = [];
  if (!Array.isArray(advisories) || !parseVersion(currentVersion)) {
    return found;
  }
  for (const advisory of advisories) {
    if (!advisory || typeof advisory !== "object" || advisory.withdrawn_at) {
      continue;
    }
    const vulnerabilities = Array.isArray(advisory.vulnerabilities)
      ? advisory.vulnerabilities
      : [];
    let patched = "";
    for (const vulnerability of vulnerabilities) {
      const pkg = (vulnerability && vulnerability.package) || {};
      if (normalizeAdvisoryPackage(pkg.name) !== packageKey) {
        continue;
      }
      const candidate = normalizeVersion(
        (vulnerability && vulnerability.patched_versions) || "",
      );
      if (compareVersions(currentVersion, candidate) === -1) {
        patched = parseVersion(candidate).join(".");
        break;
      }
    }
    if (!patched) {
      continue;
    }
    found.push({
      id: typeof advisory.ghsa_id === "string" ? advisory.ghsa_id : "",
      cve: typeof advisory.cve_id === "string" ? advisory.cve_id : "",
      severity: typeof advisory.severity === "string" ? advisory.severity : "",
      summary: typeof advisory.summary === "string" ? advisory.summary : "",
      url:
        typeof advisory.html_url === "string" &&
        advisory.html_url.indexOf(TRUSTED_URL_PREFIX) === 0
          ? advisory.html_url
          : "",
      patched,
    });
    if (found.length >= MAX_ADVISORIES) {
      break;
    }
  }
  return found;
}

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/**
 * The HAXcms backend installed at `dir`, or null. Recognizes a haxcms-php
 * install root (system/backend/php plus a version file) and a haxcms-nodejs
 * package root.
 */
export function detectPlatformInstall(dir) {
  const root = path.resolve(dir || ".");
  if (
    exists(path.join(root, "system", "backend", "php", "lib", "HAXCMS.php"))
  ) {
    let version = "";
    for (const name of [".version", "VERSION.txt"]) {
      const text = readText(path.join(root, name)).trim();
      if (text) {
        version = normalizeVersion(text);
        break;
      }
    }
    let installMethod = "php-archive";
    if (exists("/.dockerenv")) {
      installMethod = "php-docker";
    } else if (exists(path.join(root, ".git"))) {
      installMethod = "php-git";
    }
    return {
      backend: "haxcms-php",
      root,
      version: version || "unknown",
      installMethod,
    };
  }
  let pkg = null;
  try {
    pkg = JSON.parse(readText(path.join(root, "package.json")));
  } catch {
    pkg = null;
  }
  if (pkg && pkg.name === "@haxtheweb/haxcms-nodejs") {
    let installMethod = "unknown";
    if (exists("/.dockerenv")) {
      installMethod = "node-docker";
    } else if (exists(path.join(root, ".git"))) {
      installMethod = "node-source";
    } else if (root.split(path.sep).includes("node_modules")) {
      installMethod = "node-npm";
    }
    return {
      backend: "haxcms-nodejs",
      root,
      version: normalizeVersion(pkg.version || "") || "unknown",
      installMethod,
    };
  }
  return null;
}

/**
 * Pure: what the CLI reports for one install, from cached or fresh data.
 */
export function buildPlatformReport(install, release, advisories) {
  const latest =
    (release &&
      typeof release.tag_name === "string" &&
      normalizeVersion(release.tag_name)) ||
    "unknown";
  const found = findSecurityAdvisories(
    advisories,
    install.version,
    install.backend,
  );
  return {
    backend: install.backend,
    root: install.root,
    current: install.version,
    latest,
    updateAvailable: compareVersions(install.version, latest) === -1,
    security: found.length > 0,
    advisories: found,
    installMethod: install.installMethod,
    releaseUrl:
      release &&
      typeof release.html_url === "string" &&
      release.html_url.indexOf(TRUSTED_URL_PREFIX) === 0
        ? release.html_url
        : `https://github.com/haxtheweb/${install.backend}/releases`,
  };
}

/**
 * GET one of the fixed GitHub API URLs; null on any failure (offline,
 * timeout, rate limit). Never throws.
 */
// global fetch exists on every Node the CLI runs on; when it is missing the
// check is skipped
export async function fetchGitHubJson(
  url,
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  fetchImpl = globalThis.fetch,
) {
  const allowed =
    url === ADVISORIES_API_URL || Object.values(RELEASE_API_URLS).includes(url);
  if (!allowed || typeof fetchImpl !== "function") {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "haxtheweb-create",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response || !response.ok) {
      return null;
    }
    const body = await response.text();
    if (body.length > MAX_BODY_BYTES) {
      return null;
    }
    return JSON.parse(body);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cached GitHub data for the platform check. `read`/`write` are the CLI's
 * config-file helpers. Fresh data is fetched only when `refresh` is true and
 * the cache is older than PLATFORM_CACHE_MAX_AGE_MS (or missing).
 */
export async function loadPlatformData(backend, options = {}) {
  const read = options.read || (() => null);
  const write = options.write || (() => null);
  const now = typeof options.now === "number" ? options.now : Date.now();
  const cacheName = "hax-platform-updates";
  let cache = {};
  try {
    cache = JSON.parse(read(cacheName) || "{}") || {};
  } catch {
    cache = {};
  }
  const entry = cache[backend] || {};
  const stale =
    typeof entry.checkedAt !== "number" ||
    now - entry.checkedAt > PLATFORM_CACHE_MAX_AGE_MS;
  if (options.refresh && (stale || options.force)) {
    const [release, advisories] = await Promise.all([
      fetchGitHubJson(RELEASE_API_URLS[backend], options.fetch),
      fetchGitHubJson(ADVISORIES_API_URL, options.fetch),
    ]);
    if (release || advisories) {
      cache[backend] = {
        checkedAt: now,
        release: release || entry.release || null,
        advisories: Array.isArray(advisories)
          ? advisories
          : entry.advisories || null,
      };
      write(cacheName, JSON.stringify(cache));
      return cache[backend];
    }
  }
  return {
    checkedAt: entry.checkedAt || 0,
    release: entry.release || null,
    advisories: entry.advisories || null,
  };
}

/**
 * Commands that update an install, by install method. Fixed templates: the
 * only value inserted is a version that matches x.y.z.
 */
export function platformUpgradeCommands(report) {
  const version = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(report.latest)
    ? report.latest
    : "";
  if (!version) {
    return [];
  }
  switch (report.installMethod) {
    case "php-archive":
      return ["php scripts/platform-upgrade.php upgrade"];
    case "php-git":
    case "node-source":
      return [`git fetch --tags && git checkout ${version}`];
    case "php-docker":
      return [`docker pull ghcr.io/haxtheweb/haxcms-php:${version}`];
    case "node-docker":
      return [`docker pull ghcr.io/haxtheweb/haxcms-nodejs:${version}`];
    case "node-npm":
      return ["hax update"];
    default:
      return [];
  }
}
