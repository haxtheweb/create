// Regenerates one old-site fixture from the HAX code as it stood on January 1
// of that year (haxtheweb/issues#3262). See ../README.md.
//
//   node test/old-sites/generate/generate.cjs --year 2021 [--php php] [--keep]
//
// years.json says which repo made that year's sites (haxcms-php before the
// CLI existed, the CLI after) and which commit was current on January 1.
// This script clones that repo read-only into a temp directory (blobless,
// one branch), checks out the commit, creates a site with a few pages
// through that version's own code, and copies the site folder to
// test/old-sites/<year>/site with a provenance file beside it.
//
// Every command runs through execFileSync with an argument array: no shell.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");
const YEARS = JSON.parse(
  fs.readFileSync(path.join(ROOT, "years.json"), "utf8"),
);

function readArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    if (i + 1 < argv.length && !argv[i + 1].startsWith("--"))
      out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

function run(cmd, args, opts = {}) {
  return execFileSync(
    cmd,
    args,
    Object.assign(
      {
        encoding: "utf8",
        maxBuffer: 1 << 28,
        stdio: ["ignore", "pipe", "pipe"],
      },
      opts,
    ),
  );
}

// January 1, midnight in America/New_York, where HAX is maintained
function janFirst(year) {
  return `${year}-01-01T00:00:00-05:00`;
}

function cloneAt(entry, year, dir, sparse) {
  run("git", [
    "clone",
    "--quiet",
    "--filter=blob:none",
    "--no-checkout",
    "--single-branch",
    "--branch",
    entry.branch,
    entry.repo,
    dir,
  ]);
  const found = run("git", [
    "-C",
    dir,
    "rev-list",
    "-1",
    "--before=" + janFirst(year),
    "origin/" + entry.branch,
  ]).trim();
  const commit = entry.commit || found;
  if (entry.commit && found && found !== entry.commit) {
    console.warn(
      `note: ${entry.branch} on ${janFirst(year)} resolves to ${found}, years.json records ${entry.commit}; using the recorded commit`,
    );
  }
  if (sparse) {
    run(
      "git",
      ["-C", dir, "sparse-checkout", "set", "--no-cone"].concat(sparse),
    );
  }
  run("git", ["-C", dir, "checkout", "--quiet", commit]);
  const date = run("git", [
    "-C",
    dir,
    "log",
    "-1",
    "--format=%cI",
    commit,
  ]).trim();
  return { commit, date };
}

function applyCompat(core, compat) {
  for (const c of compat || []) {
    const file = path.join(core, c.file);
    let src = fs.readFileSync(file, "utf8");
    for (const [from, to] of c.replace) {
      if (!src.includes(from))
        throw new Error(`compat: "${from}" not in ${c.file}`);
      src = src.split(from).join(to);
    }
    fs.writeFileSync(file, src);
  }
}

// haxcms-php: drive that version's Operations class (createSite, createNode,
// saveNode) from the CLI, see drive.php
function makeWithPhp(entry, year, work, spec, args) {
  const core = path.join(work, "core");
  const ref = cloneAt(entry, year, core, [
    "/system/backend/php/",
    "/system/boilerplate/",
    "/system/coreConfig/",
    "/system/*.php",
    "/VERSION.txt",
    "/wc-registry.json",
  ]);
  applyCompat(core, entry.compat);
  const specFile = path.join(work, "spec.json");
  fs.writeFileSync(specFile, JSON.stringify(spec));
  const php = typeof args.php === "string" ? args.php : "php";
  const out = run(php, [path.join(HERE, "drive.php"), core, specFile], {
    cwd: work,
  });
  const result = JSON.parse(out.trim().split("\n").pop());
  if (!result.ok) throw new Error("drive.php: " + result.error);
  return {
    siteDir: result.siteDir,
    registry: path.join(core, "wc-registry.json"),
    ref,
    version: fs.readFileSync(path.join(core, "VERSION.txt"), "utf8").trim(),
    runtime: run(php, ["-r", "echo PHP_VERSION;"]).trim(),
  };
}

// the HAX CLI: `hax site`, then node:add / node:edit / site:theme, run from
// that commit's own build with its own lockfile (which pins the
// haxcms-nodejs release it shipped with)
function makeWithCli(entry, year, work, spec) {
  const src = path.join(work, "create");
  const ref = cloneAt(entry, year, src, null);
  run("npm", ["ci", "--no-audit", "--no-fund", "--ignore-scripts"], {
    cwd: src,
  });
  run("npm", ["run", "build"], { cwd: src });
  const cli = path.join(src, "dist", "create.js");
  const sites = path.join(work, "sites");
  const home = path.join(work, "home");
  fs.mkdirSync(sites, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const env = Object.assign({}, process.env, {
    HOME: home,
    NO_COLOR: "1",
    GIT_AUTHOR_NAME: "HAX fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "HAX fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  });
  const hax = (args, cwd) =>
    run(process.execPath, [cli].concat(args, ["--y", "--no-i"]), { cwd, env });
  hax(["site", spec.name], sites);
  const siteDir = path.join(sites, spec.name);
  const ids = {};
  const itemIds = () =>
    JSON.parse(
      fs.readFileSync(path.join(siteDir, "site.json"), "utf8"),
    ).items.map((i) => i.id);
  for (const page of spec.pages) {
    const before = new Set(itemIds());
    hax(
      ["site", "node:add", "--title", page.title, "--content", page.body],
      siteDir,
    );
    const fresh = itemIds().filter((id) => !before.has(id));
    if (fresh.length !== 1)
      throw new Error(`node:add "${page.title}" made ${fresh.length} items`);
    ids[page.key] = fresh[0];
    if (page.parent) {
      hax(
        [
          "site",
          "node:edit",
          "--item-id",
          fresh[0],
          "--node-op",
          "parent",
          "--parent",
          ids[page.parent],
        ],
        siteDir,
      );
    }
  }
  if (spec.theme) hax(["site", "site:theme", "--theme", spec.theme], siteDir);
  const pkg = JSON.parse(
    fs.readFileSync(path.join(src, "package.json"), "utf8"),
  );
  const lock = JSON.parse(
    fs.readFileSync(path.join(src, "package-lock.json"), "utf8"),
  );
  const backend = lock.packages["node_modules/@haxtheweb/haxcms-nodejs"];
  return {
    siteDir,
    registry: path.join(
      src,
      "node_modules",
      "@haxtheweb",
      "haxcms-nodejs",
      "dist",
      "public",
      "wc-registry.json",
    ),
    ref,
    version: pkg.version,
    backend: backend
      ? "@haxtheweb/haxcms-nodejs " + backend.version
      : undefined,
    runtime: "node " + process.versions.node,
  };
}

// copy the site minus its own .git and the symlinks into the old core
// (build, dist, wc-registry.json, babel): those belong to the install, not
// the site, and point nowhere once the folder leaves it
function copySite(from, to) {
  const skipped = [];
  const walk = (rel) => {
    const abs = path.join(from, rel);
    for (const name of fs.readdirSync(abs)) {
      const r = rel ? rel + "/" + name : name;
      if (r === ".git") {
        skipped.push(r + " (the site's own git repo)");
        continue;
      }
      const st = fs.lstatSync(path.join(from, r));
      if (st.isSymbolicLink()) {
        skipped.push(r + " -> " + fs.readlinkSync(path.join(from, r)));
      } else if (st.isDirectory()) {
        fs.mkdirSync(path.join(to, r), { recursive: true });
        walk(r);
      } else {
        fs.copyFileSync(path.join(from, r), path.join(to, r));
      }
    }
  };
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  walk("");
  return skipped.sort();
}

// custom elements the site's pages use that were in that year's wc-registry,
// with the module path it gave them: the check expects each one to still be
// registered in the latest code
function eraElements(siteDir, registryFile) {
  const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
  const site = JSON.parse(
    fs.readFileSync(path.join(siteDir, "site.json"), "utf8"),
  );
  const found = {};
  for (const item of site.items || []) {
    const file = path.join(siteDir, item.location);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, "utf8");
    for (const m of html.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]*)[\s>/]/g)) {
      if (registry[m[1]]) found[m[1]] = registry[m[1]];
    }
  }
  return Object.fromEntries(Object.entries(found).sort());
}

// created / updated stamps are the generation time; pin them to January 1 of
// the fixture's year so the dates in site.json match the year
function pinTimestamps(siteJsonFile, year) {
  const stamp = Date.UTC(year, 0, 1, 17, 0, 0) / 1000;
  const site = JSON.parse(fs.readFileSync(siteJsonFile, "utf8"));
  const fix = (m) => {
    if (!m || typeof m !== "object") return;
    for (const k of ["created", "updated"]) {
      if (typeof m[k] === "number") m[k] = stamp;
    }
  };
  fix(site.metadata && site.metadata.site);
  for (const item of site.items || []) fix(item.metadata);
  fs.writeFileSync(siteJsonFile, JSON.stringify(site, null, 4));
}

function main() {
  const args = readArgs(process.argv.slice(2));
  const year = parseInt(args.year, 10);
  const entry = YEARS.years[String(year)];
  if (!entry) {
    throw new Error(
      `years.json has no entry for ${args.year}; add one (see README.md) before generating`,
    );
  }
  const spec = {
    name: "old-site-" + year,
    description: `Fixture site made by HAX code as of January 1, ${year}`,
    theme: entry.theme,
    pages: entry.pages,
  };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `hax-old-site-${year}-`));
  try {
    const made =
      entry.source === "haxcms-php"
        ? makeWithPhp(entry, year, work, spec, args)
        : makeWithCli(entry, year, work, spec);
    const dest = path.join(ROOT, String(year));
    const skipped = copySite(made.siteDir, path.join(dest, "site"));
    pinTimestamps(path.join(dest, "site", "site.json"), year);
    const provenance = {
      year,
      siteName: spec.name,
      source: entry.source,
      repo: entry.repo,
      branch: entry.branch,
      commit: made.ref.commit,
      commitDate: made.ref.date,
      version: made.version,
      backend: made.backend,
      generatedWith: made.runtime,
      compat: (entry.compat || []).map((c) => c.file + ": " + c.why),
      notSaved: skipped,
      elements: eraElements(made.siteDir, made.registry),
    };
    fs.writeFileSync(
      path.join(dest, "fixture.json"),
      JSON.stringify(provenance, null, 2) + "\n",
    );
    console.log(
      `old-site ${year}: ${path.relative(process.cwd(), dest)} from ${entry.source} ${made.ref.commit}`,
    );
  } finally {
    if (!args.keep) fs.rmSync(work, { recursive: true, force: true });
    else console.log("kept " + work);
  }
}

main();
