"use strict";

// haxtheweb/issues#1768: update awareness in the CLI. The vectors in
// test/fixtures/platform-update-vectors.json are shared verbatim with
// haxcms-nodejs (test/fixtures) and haxcms-php (system/backend/php/tests/
// fixtures), so the CLI and both status reports agree.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ADVISORIES_API_URL,
  RELEASE_API_URLS,
  buildPlatformReport,
  compareVersions,
  detectPlatformInstall,
  fetchGitHubJson,
  findSecurityAdvisories,
  loadPlatformData,
  normalizeAdvisoryPackage,
  platformUpgradeCommands,
} = require("../../src/lib/platform-updates.js");

const vectors = require("../fixtures/platform-update-vectors.json");

test("compareVersions matches the shared vectors", () => {
  for (const c of vectors.compareVersions) {
    assert.equal(compareVersions(c.a, c.b), c.expected, `${c.a} vs ${c.b}`);
  }
});

test("normalizeAdvisoryPackage matches the shared vectors", () => {
  for (const c of vectors.normalizeAdvisoryPackage) {
    assert.equal(normalizeAdvisoryPackage(c.name), c.expected, c.name);
  }
});

test("findSecurityAdvisories matches the shared vectors", () => {
  for (const c of vectors.findSecurityAdvisories) {
    const found = findSecurityAdvisories(
      vectors.advisories,
      c.current,
      c.packageKey,
    );
    assert.deepEqual(
      found.map((a) => a.id),
      c.expectedIds,
      `${c.packageKey}@${c.current}`,
    );
  }
});

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hax-platform-"));
}

test("detectPlatformInstall recognizes a haxcms-php root", () => {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, "system/backend/php/lib"), { recursive: true });
  fs.writeFileSync(path.join(root, "system/backend/php/lib/HAXCMS.php"), "");
  fs.writeFileSync(path.join(root, "VERSION.txt"), "26.8.1\n");
  const install = detectPlatformInstall(root);
  assert.equal(install.backend, "haxcms-php");
  assert.equal(install.version, "26.8.1");
  assert.ok(["php-archive", "php-docker"].includes(install.installMethod));
  fs.mkdirSync(path.join(root, ".git"));
  if (!fs.existsSync("/.dockerenv")) {
    assert.equal(detectPlatformInstall(root).installMethod, "php-git");
  }
});

test("detectPlatformInstall recognizes a haxcms-nodejs package and nothing else", () => {
  const root = tmpdir();
  assert.equal(detectPlatformInstall(root), null);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "@haxtheweb/haxcms-nodejs", version: "26.8.0" }),
  );
  const install = detectPlatformInstall(root);
  assert.equal(install.backend, "haxcms-nodejs");
  assert.equal(install.version, "26.8.0");
});

test("buildPlatformReport flags a missing security fix", () => {
  const report = buildPlatformReport(
    {
      backend: "haxcms-php",
      root: "/srv",
      version: "26.8.1",
      installMethod: "php-git",
    },
    vectors.release,
    vectors.advisories,
  );
  assert.equal(report.latest, "26.9.0");
  assert.equal(report.updateAvailable, true);
  assert.equal(report.security, true);
  assert.deepEqual(
    report.advisories.map((a) => a.id),
    ["GHSA-6w22-ghxf-x2pv"],
  );
  assert.deepEqual(platformUpgradeCommands(report), [
    "git fetch --tags && git checkout 26.9.0",
  ]);
});

test("platformUpgradeCommands only fills in a release version", () => {
  const base = { installMethod: "php-docker" };
  assert.deepEqual(platformUpgradeCommands({ ...base, latest: "26.9.0" }), [
    "docker pull ghcr.io/haxtheweb/haxcms-php:26.9.0",
  ]);
  assert.deepEqual(
    platformUpgradeCommands({ ...base, latest: "26.9.0; rm -rf /" }),
    [],
  );
  assert.deepEqual(
    platformUpgradeCommands({ installMethod: "node-npm", latest: "26.9.0" }),
    ["hax update"],
  );
});

test("fetchGitHubJson only requests the fixed URLs and never throws", async () => {
  let called = 0;
  const fake = async () => {
    called++;
    return { ok: true, text: async () => '{"tag_name":"26.9.0"}' };
  };
  assert.equal(await fetchGitHubJson("https://evil.example/x", fake), null);
  assert.equal(called, 0);
  const release = await fetchGitHubJson(RELEASE_API_URLS["haxcms-php"], fake);
  assert.equal(release.tag_name, "26.9.0");
  const failing = async () => {
    throw new Error("offline");
  };
  assert.equal(await fetchGitHubJson(ADVISORIES_API_URL, failing), null);
});

test("loadPlatformData refreshes weekly and otherwise reads the cache", async () => {
  const store = {};
  const read = (name) => store[name] || null;
  const write = (name, data) => {
    store[name] = data;
  };
  let calls = 0;
  const fake = async (url) => {
    calls++;
    const body =
      url === ADVISORIES_API_URL
        ? JSON.stringify(vectors.advisories)
        : JSON.stringify(vectors.release);
    return { ok: true, text: async () => body };
  };
  const now = Date.UTC(2026, 10, 13);
  const first = await loadPlatformData("haxcms-php", {
    read,
    write,
    refresh: true,
    fetch: fake,
    now,
  });
  assert.equal(calls, 2);
  assert.equal(first.release.tag_name, "v26.9.0");
  // a day later the cache is fresh: no request
  await loadPlatformData("haxcms-php", {
    read,
    write,
    refresh: true,
    fetch: fake,
    now: now + 24 * 60 * 60 * 1000,
  });
  assert.equal(calls, 2);
  // without refresh the cache is read even when stale
  const cached = await loadPlatformData("haxcms-php", {
    read,
    write,
    refresh: false,
    fetch: fake,
    now: now + 30 * 24 * 60 * 60 * 1000,
  });
  assert.equal(calls, 2);
  assert.equal(cached.advisories.length, vectors.advisories.length);
  // a week later it asks again
  await loadPlatformData("haxcms-php", {
    read,
    write,
    refresh: true,
    fetch: fake,
    now: now + 8 * 24 * 60 * 60 * 1000,
  });
  assert.equal(calls, 4);
});
