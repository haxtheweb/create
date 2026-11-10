"use strict";

// Shared harness for subprocess smoke tests against the BUILT dist/create.js
// (`npm run build` first). Every run gets an isolated HOME and git config so
// the real ~/.haxtheweb, ~/.haxcmsconfig and ~/.gitconfig are never touched,
// and a fixed git identity so the haxcms-nodejs site commits are
// deterministic on machines and CI runners with no identity configured.
//
// The skip canary mirrors cli.smoke.test.cjs: when the built CLI cannot load
// (dist missing, or the installed @haxtheweb/haxcms-nodejs lacks a module),
// every test using `smokeOpts` skips with the real reason.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI = path.resolve(__dirname, "..", "..", "dist", "create.js");

function isolatedEnv(prefix) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const gitconfig = path.join(home, "test-gitconfig");
  fs.writeFileSync(gitconfig, "");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    HAX_LANG: "en",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_AUTHOR_NAME: "HAX Smoke Test",
    GIT_AUTHOR_EMAIL: "smoke-test@example.invalid",
    GIT_COMMITTER_NAME: "HAX Smoke Test",
    GIT_COMMITTER_EMAIL: "smoke-test@example.invalid",
  };
  // never let an agent marker from the outer shell leak into commits
  delete env.HAX_ACTOR;
  return { home, env };
}

function cliSkipReason(env) {
  if (!fs.existsSync(CLI)) {
    return "dist/create.js not built — run `npm run build` first";
  }
  const canary = spawnSync(process.execPath, [CLI, "--version"], {
    encoding: "utf8",
    env: env,
    timeout: 15000,
  });
  if (canary.status !== 0) {
    const missing = (canary.stderr || "").match(/Cannot find module '([^']+)'/);
    return missing
      ? `built CLI fails to load — missing dependency module: ${missing[1]}`
      : `built CLI exits ${canary.status} on --version`;
  }
  return false;
}

// run `hax <args>` in cwd; never inherits a TTY (stdin is a closed pipe)
function hax(env, args, cwd, timeout = 30000) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: env,
    cwd: cwd,
    input: "",
    timeout: timeout,
  });
  res.output = `${res.stdout || ""}\n${res.stderr || ""}`;
  res.describe = `hax ${args.join(" ")}\nexit: ${res.status} signal: ${res.signal}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`;
  return res;
}

// every file and folder under dir (relative), for "nothing written outside"
// assertions. .git internals are skipped: they churn but are inside the site.
function listTree(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      const full = path.join(current, entry.name);
      out.push(path.relative(dir, full));
      if (entry.isDirectory()) {
        walk(full);
      }
    }
  };
  if (fs.existsSync(dir)) {
    walk(dir);
  }
  return out.sort();
}

function readSite(siteDir) {
  return JSON.parse(fs.readFileSync(path.join(siteDir, "site.json"), "utf8"));
}

function itemBySlug(manifest, slug) {
  return manifest.items.find((item) => item.slug === slug);
}

// page tags as a list: the published backend stores the comma string the CLI
// sent ("a,b"), haxcms-nodejs main normalizes it to an array (["a", "b"])
function tagList(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim());
  }
  if (typeof value === "string") {
    return value.split(",").map((tag) => tag.trim());
  }
  return [];
}

const SITE_FLAGS = ["--theme", "clean-one", "--y", "--no-i", "--no-extras"];

// create a site named `name` inside parentDir; returns its directory
function createSite(env, parentDir, name, extra = []) {
  const res = hax(
    env,
    ["site", name, ...SITE_FLAGS, ...extra],
    parentDir,
    60000,
  );
  if (res.status !== 0) {
    throw new Error(`site creation failed\n${res.describe}`);
  }
  return path.join(parentDir, name);
}

module.exports = {
  CLI,
  SITE_FLAGS,
  isolatedEnv,
  cliSkipReason,
  hax,
  listTree,
  readSite,
  itemBySlug,
  createSite,
  tagList,
};
