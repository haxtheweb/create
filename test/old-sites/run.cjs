// Old-site compatibility check (haxtheweb/issues#3262). Upgrades every
// fixture in test/old-sites/<year>/site to the latest code and runs the
// operations an author does on a site, then reports what broke.
//
//   node test/old-sites/run.cjs --nodejs <haxcms-nodejs checkout> \
//     [--cli <create dist/create.js>] [--years 2021,2024] [--out <dir>]
//
// Two legs per fixture, each on its own copy of the site:
//   cli     the HAX CLI: site:rebuild (the upgrade), site:validate,
//           node:add, node:edit content, site:theme, site:validate again
//   nodejs  haxcms-nodejs, booted with that repo's own e2e harness (real
//           auth, temp directory, ephemeral localhost port): render the home
//           page and a deep page, open the editor's API path, save page
//           content, saveOutline add / move / reorder / delete, theme and
//           settings changes, then render everything again
// After every write the site on disk is checked: site.json parses, ids are
// unique, every parent exists, every page file exists, and every page the
// fixture made still holds its content (unless the op meant to change it).
// Once a leg has upgraded a site and written to it, the folder must also
// reach the managed level of the site folder contract (haxtheweb/issues#3351,
// test/contract/README.md): everything a backend writes is there. Paths the
// contract has retired stay where the old site had them and only count in
// the step's detail. This needs a json-outline-schema checkout (--jos or
// HAX_CONTRACT_JOS_REPO, default: beside this repo); without one the run
// says so in its summary and skips those steps.
//
// Writes summary.md (and the GitHub job summary when GITHUB_STEP_SUMMARY is
// set) and results.json to --out. Exits 1 when any check fails. Localhost
// only; nothing here talks to a live deployment.
const { execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  CONTRACT_IN_JOS,
  runValidator,
} = require("../contract/site-contract.cjs");

const HERE = __dirname;
const YEARS = JSON.parse(
  fs.readFileSync(path.join(HERE, "years.json"), "utf8"),
);
const NEW_THEME = "clean-one";
const ALT_THEME = "clean-two";

function readArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--"))
      out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

const args = readArgs(process.argv.slice(2));
const cfg = {
  nodejs: path.resolve(
    args.nodejs ||
      process.env.HAX_OLD_SITES_NODEJS ||
      path.join(HERE, "..", "..", "..", "haxcms-nodejs"),
  ),
  cli: path.resolve(
    args.cli ||
      process.env.HAX_OLD_SITES_CLI ||
      path.join(HERE, "..", "..", "dist", "create.js"),
  ),
  out: path.resolve(
    args.out || process.env.HAX_OLD_SITES_OUT || "old-sites-results",
  ),
  jos: path.resolve(
    args.jos ||
      process.env.HAX_CONTRACT_JOS_REPO ||
      path.join(HERE, "..", "..", "..", "json-outline-schema"),
  ),
  years: String(args.years || process.env.HAX_OLD_SITES_YEARS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

// ---------- fixtures ----------

function listFixtures() {
  return fs
    .readdirSync(HERE)
    .filter((d) => /^\d{4}$/.test(d))
    .filter((d) => fs.existsSync(path.join(HERE, d, "fixture.json")))
    .filter((d) => cfg.years.length === 0 || cfg.years.includes(d))
    .sort()
    .map((year) => {
      const meta = JSON.parse(
        fs.readFileSync(path.join(HERE, year, "fixture.json"), "utf8"),
      );
      const entry = YEARS.years[year] || { pages: [] };
      return {
        year,
        meta,
        pages: entry.pages,
        dir: path.join(HERE, year, "site"),
      };
    });
}

// the first heading of a fixture page body: it must survive every op
function markerOf(body) {
  const m = /<h[1-6][^>]*>([^<]+)</.exec(body);
  return m ? m[1] : null;
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

// old sites carried their own git repo; give each copy one so commits made
// by the latest code land in the site's history, as they would for real
function gitInit(dir) {
  const env = gitEnv();
  execFileSync("git", ["init", "-q"], { cwd: dir, env });
  execFileSync("git", ["add", "-A"], { cwd: dir, env });
  execFileSync("git", ["commit", "-q", "-m", "Old site fixture"], {
    cwd: dir,
    env,
  });
}

function gitEnv(extra) {
  return Object.assign(
    {},
    process.env,
    {
      GIT_AUTHOR_NAME: "HAX old-site check",
      GIT_AUTHOR_EMAIL: "old-sites@example.invalid",
      GIT_COMMITTER_NAME: "HAX old-site check",
      GIT_COMMITTER_EMAIL: "old-sites@example.invalid",
    },
    extra || {},
  );
}

function readSite(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, "site.json"), "utf8"));
}

function itemsOf(site) {
  return Array.isArray(site.items)
    ? site.items
    : Object.values(site.items || {});
}

// structural checks on the site as it sits on disk; returns problems found
function checkSiteOnDisk(dir, expect) {
  const problems = [];
  let site;
  try {
    site = readSite(dir);
  } catch (e) {
    return ["site.json does not parse: " + e.message];
  }
  const items = itemsOf(site);
  const ids = new Set();
  for (const it of items) {
    if (!it.id) problems.push(`an item has no id (${it.title})`);
    if (ids.has(it.id)) problems.push(`duplicate id ${it.id}`);
    ids.add(it.id);
  }
  for (const it of items) {
    if (it.parent && !ids.has(it.parent))
      problems.push(`"${it.title}" has missing parent ${it.parent}`);
    if (!it.location) problems.push(`"${it.title}" has no location`);
    else if (!fs.existsSync(path.join(dir, it.location)))
      problems.push(`"${it.title}" page file missing: ${it.location}`);
    if (typeof it.slug !== "string" || it.slug === "")
      problems.push(`"${it.title}" has no slug`);
  }
  if (
    expect &&
    typeof expect.count === "number" &&
    items.length !== expect.count
  )
    problems.push(`expected ${expect.count} pages, found ${items.length}`);
  if (expect && expect.markers) {
    for (const [title, marker] of Object.entries(expect.markers)) {
      const it = items.find((i) => i.title === title);
      if (!it) {
        problems.push(`page "${title}" is gone`);
        continue;
      }
      const html = fs.existsSync(path.join(dir, it.location))
        ? fs.readFileSync(path.join(dir, it.location), "utf8")
        : "";
      if (!html.includes(marker))
        problems.push(`page "${title}" lost its content ("${marker}")`);
    }
  }
  return problems;
}

// ---------- results ----------

class Recorder {
  constructor(year, leg) {
    this.year = year;
    this.leg = leg;
    this.steps = [];
  }
  async step(name, fn) {
    const started = Date.now();
    try {
      const detail = await fn();
      this.steps.push({
        name,
        ok: true,
        detail: detail || "",
        ms: Date.now() - started,
      });
      return true;
    } catch (e) {
      this.steps.push({
        name,
        ok: false,
        detail: String((e && e.message) || e).slice(0, 600),
        ms: Date.now() - started,
      });
      return false;
    }
  }
  get ok() {
    return this.steps.every((s) => s.ok);
  }
}

// ---------- site folder contract ----------

const CONTRACT_VALIDATOR = path.join(cfg.jos, "scripts", "validate.js");
const hasContract = () => fs.existsSync(path.join(cfg.jos, CONTRACT_IN_JOS));

/**
 * The site folder must reach the managed level of the contract. Throws with
 * the validator's errors when it does not; returns a one-line detail.
 */
function assertManagedSiteFolder(dir) {
  const report = runValidator(CONTRACT_VALIDATOR, { level: "managed" }, dir);
  if (!report.valid)
    throw new Error(
      `site folder reaches ${report.reached || "no level"}, not managed: ` +
        report.errors
          .slice(0, 12)
          .map((e) => `${e.path}: ${e.message}`)
          .join("; ") +
        (report.errors.length > 12
          ? `; and ${report.errors.length - 12} more`
          : ""),
    );
  return `reaches managed; ${report.retired.length} retired path(s) kept, ${report.unclassified.length} file(s) outside the contract`;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertClean(problems) {
  if (problems.length) throw new Error(problems.join("; "));
}

// ---------- cli leg ----------

function hax(args, cwd, home) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cfg.cli].concat(args, ["--y", "--no-i"]),
      {
        cwd,
        timeout: 180000,
        maxBuffer: 1 << 26,
        env: gitEnv({ HOME: home, NO_COLOR: "1", HAX_ACTOR: "agent" }),
      },
      (err, stdout, stderr) =>
        resolve({
          code: err ? (err.code === undefined ? 1 : err.code) : 0,
          out: String(stdout || "") + String(stderr || ""),
        }),
    );
  });
}

async function haxOk(argv, cwd, home) {
  const r = await hax(argv, cwd, home);
  if (r.code !== 0)
    throw new Error(
      `hax ${argv.join(" ")} exited ${r.code}: ${r.out.slice(-400)}`,
    );
  return r;
}

// the CLI prints its --format json report among other output lines: take
// the first "{" at a line start and the shortest balanced object that parses
function lastJson(out) {
  const start = out.search(/^\{/m);
  if (start !== -1) {
    for (
      let end = out.indexOf("\n}", start);
      end !== -1;
      end = out.indexOf("\n}", end + 1)
    ) {
      try {
        return JSON.parse(out.slice(start, end + 2));
      } catch (e) {
        // not the closing brace yet
      }
    }
  }
  throw new Error("no JSON report in output: " + out.slice(-300));
}

async function cliLeg(fx, work, markers) {
  const rec = new Recorder(fx.year, "cli");
  const home = path.join(work, "home");
  fs.mkdirSync(home, { recursive: true });
  const dir = path.join(work, fx.meta.siteName);
  copyDir(fx.dir, dir);
  gitInit(dir);
  const count = itemsOf(readSite(dir)).length;
  const deep = itemsOf(readSite(dir)).find((i) => i.parent);
  const validate = async () => {
    const r = await hax(
      ["site", "site:validate", "--format", "json"],
      dir,
      home,
    );
    const report = lastJson(r.out);
    if (report.errors && report.errors.length)
      throw new Error(report.errors.map((e) => e.message).join("; "));
    return `${report.summary.pagesChecked} pages, ${report.summary.warnings} warning(s)`;
  };
  if (
    !(await rec.step("upgrade: hax site site:rebuild", async () => {
      const r = await haxOk(
        ["site", "site:rebuild", "--format", "json"],
        dir,
        home,
      );
      assertClean(checkSiteOnDisk(dir, { count, markers }));
      return "rebuilt " + lastJson(r.out).rebuilt.join(", ");
    }))
  )
    return rec;
  await rec.step("site:validate after upgrade", validate);
  await rec.step("node:add", async () => {
    await haxOk(
      [
        "site",
        "node:add",
        "--title",
        "Added by CLI",
        "--content",
        "<p>cli added page</p>",
      ],
      dir,
      home,
    );
    assertClean(checkSiteOnDisk(dir, { count: count + 1, markers }));
    const it = itemsOf(readSite(dir)).find((i) => i.title === "Added by CLI");
    assert(it, "new page is not in site.json");
    assert(
      fs
        .readFileSync(path.join(dir, it.location), "utf8")
        .includes("cli added page"),
      "new page content was not written",
    );
  });
  await rec.step("node:edit content (deep page)", async () => {
    assert(deep, "fixture has no child page");
    await haxOk(
      [
        "site",
        "node:edit",
        "--item-id",
        deep.id,
        "--node-op",
        "content",
        "--content",
        "<p>cli edited deep page</p>",
      ],
      dir,
      home,
    );
    const others = Object.assign({}, markers);
    delete others[deep.title];
    assertClean(checkSiteOnDisk(dir, { count: count + 1, markers: others }));
    const it = itemsOf(readSite(dir)).find((i) => i.id === deep.id);
    assert(
      fs
        .readFileSync(path.join(dir, it.location), "utf8")
        .includes("cli edited deep page"),
      "deep page content was not saved",
    );
  });
  await rec.step(`site:theme ${ALT_THEME}`, async () => {
    await haxOk(["site", "site:theme", "--theme", ALT_THEME], dir, home);
    const site = readSite(dir);
    assert(
      site.metadata.theme.element === ALT_THEME,
      `theme is ${site.metadata.theme.element}`,
    );
  });
  await rec.step("site:validate at the end", validate);
  if (hasContract())
    await rec.step("site folder contract: managed level", () =>
      assertManagedSiteFolder(dir),
    );
  return rec;
}

// ---------- nodejs leg ----------

function parseSettings(src) {
  const vm = require("node:vm");
  const sandbox = { window: {} };
  vm.runInNewContext(String(src || ""), sandbox, { timeout: 1000 });
  return sandbox.window.appSettings || {};
}

class Api {
  constructor(runtime) {
    this.base = runtime.baseUrl;
    this.user = runtime.credentials.username;
    this.pass = runtime.credentials.password;
  }
  async raw(method, url, headers, body) {
    const res = await fetch(url.startsWith("http") ? url : this.base + url, {
      method,
      headers: headers || {},
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = null;
    }
    return { status: res.status, text, json };
  }
  async login() {
    const r = await this.raw(
      "POST",
      "/system/api/v1/session/login",
      { "content-type": "application/json", accept: "application/json" },
      { username: this.user, password: this.pass },
    );
    assert(r.json && r.json.jwt, `login ${r.status}: ${r.text.slice(0, 200)}`);
    this.jwt = r.json.jwt;
    const s = await this.settings("");
    this.userToken = s.userToken;
    this.userTokenHeader = s.userTokenHeader || "X-HAXCMS-User-Token";
  }
  async settings(refererPath) {
    const headers = {
      accept: "application/javascript",
      authorization: "Bearer " + this.jwt,
    };
    if (refererPath) headers.referer = this.base + refererPath;
    const r = await this.raw(
      "GET",
      "/system/api/v1/session/connection-settings",
      headers,
    );
    assert(r.status === 200, `connection-settings ${r.status}`);
    return parseSettings(r.text);
  }
  // what the editor does when it boots on a site page: ask for this site's
  // connection settings, which carry the site token and API base
  async openSite(name) {
    const s = await this.settings(`/_sites/${name}/`);
    assert(s.siteToken, "no site token for " + name);
    this.siteName = name;
    this.siteToken = s.siteToken;
    this.siteApi = String(s.siteApiBasePath || `/_sites/${name}/x/api`).replace(
      /\/+$/,
      "",
    );
    return s;
  }
  headers() {
    const h = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: "Bearer " + this.jwt,
      "X-HAXCMS-Site-Token": this.siteToken,
    };
    h[this.userTokenHeader] = this.userToken;
    return h;
  }
  async site(method, specPath, body) {
    const r = await this.raw(
      method,
      this.siteApi + specPath,
      this.headers(),
      body,
    );
    if (r.status === 401 || r.status === 403) {
      await this.login();
      await this.openSite(this.siteName);
      return this.raw(method, this.siteApi + specPath, this.headers(), body);
    }
    return r;
  }
}

// the <page-break> the editor sends ahead of a page body on save: it carries
// the page's current properties, which saveNode re-applies
function escAttr(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function pageBreakFor(item) {
  const m = item.metadata || {};
  const a = { "item-id": item.id, title: item.title, slug: item.slug };
  if (item.parent) a.parent = item.parent;
  a.order = item.order === undefined ? 0 : item.order;
  a.depth = item.indent === undefined ? 0 : item.indent;
  if (m.published !== false) a.published = "";
  if (m.hideInMenu) a["hide-in-menu"] = "";
  if (m.locked) a.locked = "";
  return (
    "<page-break " +
    Object.entries(a)
      .map(([k, v]) => (v === "" ? k : `${k}="${escAttr(v)}"`))
      .join(" ") +
    "></page-break>"
  );
}

async function render(api, name, dir, label) {
  const home = await api.raw("GET", `/_sites/${name}/`);
  assert(home.status === 200, `${label}: GET / -> ${home.status}`);
  assert(
    home.text.includes("haxcms-site-builder"),
    `${label}: home page has no haxcms-site-builder`,
  );
  const sj = await api.raw("GET", `/_sites/${name}/site.json`);
  assert(sj.status === 200 && sj.json, `${label}: site.json -> ${sj.status}`);
  const items = itemsOf(sj.json);
  const deep = items.find((i) => i.parent) || items[items.length - 1];
  const page = await api.raw("GET", `/_sites/${name}/${deep.slug}`);
  assert(page.status === 200, `${label}: GET /${deep.slug} -> ${page.status}`);
  assert(
    page.text.includes("haxcms-site-builder"),
    `${label}: /${deep.slug} has no site shell`,
  );
  for (const it of items) {
    const r = await api.raw("GET", `/_sites/${name}/${it.location}`);
    assert(
      r.status === 200,
      `${label}: ${it.location} ("${it.title}") -> ${r.status}`,
    );
  }
  return `home, /${deep.slug} and ${items.length} page files load`;
}

async function nodejsLeg(fx, runtime, api, markers) {
  const rec = new Recorder(fx.year, "nodejs");
  const name = fx.meta.siteName;
  const dir = path.join(runtime.runtimeRoot, "_sites", name);
  copyDir(fx.dir, dir);
  gitInit(dir);
  const original = itemsOf(readSite(dir));
  const count = original.length;
  const deep = original.find((i) => i.parent);
  const byTitle = (t) => itemsOf(readSite(dir)).find((i) => i.title === t);
  const outline = async (mutate, expectCount, expectMarkers) => {
    const items = itemsOf(readSite(dir)).map((i) => Object.assign({}, i));
    const sent = mutate(items) || items;
    const r = await api.site("PATCH", "/v1/site/outline", {
      site: { name },
      items: sent,
    });
    assert(
      r.status === 200,
      `saveOutline -> ${r.status}: ${r.text.slice(0, 300)}`,
    );
    assertClean(
      checkSiteOnDisk(dir, { count: expectCount, markers: expectMarkers }),
    );
  };
  const indexBefore = fs.readFileSync(path.join(dir, "index.html"), "utf8");

  if (
    !(await rec.step("render before any write", () =>
      render(api, name, dir, "render"),
    ))
  )
    return rec;
  await rec.step("upgrade on load (legacy bootstrap)", async () => {
    const after = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const legacy = indexBefore.includes("@lrnwebcomponents");
    assert(
      !after.includes("@lrnwebcomponents"),
      "index.html still loads @lrnwebcomponents after the site was opened",
    );
    return legacy
      ? "index.html upgraded from @lrnwebcomponents"
      : "already current";
  });
  // a block the old content uses must still load: every element that was in
  // that year's wc-registry must still be in the one this site gets now
  await rec.step("elements still registered", async () => {
    const used = Object.keys(fx.meta.elements || {});
    const r = await api.raw("GET", `/_sites/${name}/wc-registry.json`);
    assert(r.status === 200 && r.json, `wc-registry.json -> ${r.status}`);
    const gone = used.filter((tag) => !r.json[tag]);
    assert(
      gone.length === 0,
      gone
        .map(
          (tag) =>
            `<${tag}> (${fx.meta.elements[tag]} in ${fx.year}) is not in the latest wc-registry.json`,
        )
        .join("; "),
    );
    return `${used.length} element(s): ${used.join(", ")}`;
  });
  if (
    !(await rec.step("open editor (site token, page content)", async () => {
      await api.openSite(name);
      const r = await api.site(
        "GET",
        "/v1/content/" + encodeURIComponent(deep.id),
      );
      assert(
        r.status === 200,
        `GET content -> ${r.status}: ${r.text.slice(0, 200)}`,
      );
      const marker = markers[deep.title];
      if (marker)
        assert(
          r.text.includes(marker),
          "editor content does not hold the page body",
        );
    }))
  )
    return rec;
  const others = Object.assign({}, markers);
  delete others[deep.title];
  await rec.step("edit and save page content", async () => {
    const item = byTitle(deep.title);
    const r = await api.site(
      "PATCH",
      "/v1/content/" + encodeURIComponent(item.id),
      {
        site: { name },
        content:
          pageBreakFor(item) +
          "<h3>Edited lesson</h3><p>nodejs edited deep page</p>",
      },
    );
    assert(
      r.status === 200,
      `saveNode -> ${r.status}: ${r.text.slice(0, 300)}`,
    );
    assertClean(checkSiteOnDisk(dir, { count, markers: others }));
    const now = byTitle(deep.title);
    assert(now, "deep page is gone after save");
    assert(now.parent === item.parent, "deep page lost its parent on save");
    const html = fs.readFileSync(path.join(dir, now.location), "utf8");
    assert(
      html.includes("nodejs edited deep page"),
      "saved content is not on disk",
    );
  });
  const newId = "item-old-site-check-" + fx.year;
  await rec.step("saveOutline: add a page", () =>
    outline(
      (items) => {
        const top = items.filter((i) => !i.parent);
        items.push({
          id: newId,
          title: "Added by outline",
          parent: null,
          indent: 0,
          order: top.length,
        });
      },
      count + 1,
      others,
    ),
  );
  await rec.step("saveOutline: move a page under another", () =>
    outline(
      (items) => {
        const res = items.find((i) => i.title === "Resources");
        const unit = items.find((i) => i.title === "Unit 1");
        assert(res && unit, "fixture has no Resources / Unit 1 page");
        res.parent = unit.id;
        res.indent = (parseInt(unit.indent, 10) || 0) + 1;
        res.order = items.filter((i) => i.parent === unit.id).length;
      },
      count + 1,
      others,
    ).then(() => {
      const res = byTitle("Resources");
      const unit = byTitle("Unit 1");
      assert(res.parent === unit.id, "Resources did not move under Unit 1");
    }),
  );
  await rec.step("saveOutline: reorder top-level pages", () =>
    outline(
      (items) => {
        const top = items
          .filter((i) => !i.parent)
          .sort(
            (a, b) =>
              (parseInt(a.order, 10) || 0) - (parseInt(b.order, 10) || 0),
          );
        top.reverse().forEach((it, idx) => {
          it.order = idx;
        });
      },
      count + 1,
      others,
    ).then(() => {
      const top = itemsOf(readSite(dir)).filter((i) => !i.parent);
      const orders = top.map((i) => parseInt(i.order, 10));
      assert(
        new Set(orders).size === orders.length,
        "top-level orders collide: " + orders.join(","),
      );
    }),
  );
  await rec.step("saveOutline: delete a page", () =>
    outline(
      (items) => {
        const added = items.find((i) => i.title === "Added by outline");
        assert(added, "the page added by outline is not in site.json");
        added.delete = true;
      },
      count,
      others,
    ).then(() => {
      assert(
        !byTitle("Added by outline"),
        "deleted page is still in site.json",
      );
    }),
  );
  await rec.step(`theme change to ${NEW_THEME}`, async () => {
    const r = await api.site("PATCH", "/v1/site/appearance", {
      site: { name },
      manifest: { theme: { "manifest-metadata-theme-element": NEW_THEME } },
    });
    assert(
      r.status === 200,
      `appearance -> ${r.status}: ${r.text.slice(0, 300)}`,
    );
    const site = readSite(dir);
    assert(
      site.metadata.theme.element === NEW_THEME,
      `theme is ${site.metadata.theme.element}`,
    );
    assertClean(checkSiteOnDisk(dir, { count, markers: others }));
  });
  await rec.step("settings change (language)", async () => {
    const r = await api.site("PATCH", "/v1/site/seo", {
      site: { name },
      seo: { lang: "es" },
    });
    assert(r.status === 200, `seo -> ${r.status}: ${r.text.slice(0, 300)}`);
    const site = readSite(dir);
    const lang =
      site.metadata.site.settings && site.metadata.site.settings.lang;
    assert(lang === "es", `language is ${lang}`);
    assertClean(checkSiteOnDisk(dir, { count, markers: others }));
  });
  await rec.step("render after every write", () =>
    render(api, name, dir, "re-render"),
  );
  if (hasContract())
    await rec.step("site folder contract: managed level", () =>
      assertManagedSiteFolder(dir),
    );
  return rec;
}

// ---------- report ----------

function summarize(records, notes) {
  const lines = ["# Old-site compatibility check", ""];
  lines.push(
    "Each fixture is a site made by the HAX code as it stood on January 1 of its year, upgraded to the latest code here ([haxtheweb/issues#3262](https://github.com/haxtheweb/issues/issues/3262)).",
    "",
  );
  for (const n of notes) lines.push(n, "");
  lines.push(
    "| Year | Leg | Result | Failed steps |",
    "| --- | --- | --- | --- |",
  );
  for (const r of records) {
    const failed = r.steps.filter((s) => !s.ok).map((s) => s.name);
    lines.push(
      `| ${r.year} | ${r.leg} | ${r.ok ? "pass" : "FAIL"} | ${failed.join(", ") || "-"} |`,
    );
  }
  lines.push("");
  for (const r of records) {
    lines.push(
      `<details${r.ok ? "" : " open"}><summary>${r.year} ${r.leg}: ${r.ok ? "pass" : "FAIL"}</summary>`,
      "",
    );
    for (const s of r.steps) {
      const detail = s.detail
        ? ": " + String(s.detail).replace(/\|/g, "\\|").replace(/\n/g, " ")
        : "";
      lines.push(`- ${s.ok ? "ok" : "**FAIL**"} ${s.name}${detail}`);
    }
    lines.push("", "</details>", "");
  }
  return lines.join("\n");
}

function refOf(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch (e) {
    return "unknown";
  }
}

async function main() {
  const fixtures = listFixtures();
  assert(fixtures.length > 0, "no fixtures found under " + HERE);
  const harnessPath = path.join(
    cfg.nodejs,
    "test",
    "e2e",
    "helpers",
    "harness.cjs",
  );
  assert(
    fs.existsSync(harnessPath),
    "haxcms-nodejs e2e harness not found at " + harnessPath,
  );
  assert(
    fs.existsSync(cfg.cli),
    "CLI not found at " + cfg.cli + " (npm run build)",
  );
  fs.mkdirSync(cfg.out, { recursive: true });
  const notes = [
    `haxcms-nodejs \`${refOf(cfg.nodejs)}\`, create \`${refOf(path.dirname(path.dirname(cfg.cli)))}\`, node ${process.versions.node}.`,
  ];
  // one more fixture each year: flag a missing one, without failing the run
  const thisYear = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
    }).format(new Date()),
    10,
  );
  const newest = Math.max(...fixtures.map((f) => parseInt(f.year, 10)));
  if (cfg.years.length === 0 && newest < thisYear) {
    const msg = `No fixture for ${thisYear} yet: add it to years.json and run \`node test/old-sites/generate/generate.cjs --year ${thisYear}\` (test/old-sites/README.md).`;
    notes.push("**Warning:** " + msg);
    if (process.env.GITHUB_ACTIONS)
      console.log(`::warning title=old-sites::${msg}`);
  }

  if (hasContract()) {
    notes.push(
      `Site folder contract from json-outline-schema \`${refOf(cfg.jos)}\`.`,
    );
  } else {
    const msg = `Site folder contract not checked: no ${CONTRACT_IN_JOS} under ${cfg.jos} (pass --jos <json-outline-schema checkout>).`;
    notes.push("**Warning:** " + msg);
    if (process.env.GITHUB_ACTIONS)
      console.log(`::warning title=old-sites::${msg}`);
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "hax-old-sites-"));
  const harness = require(harnessPath);
  const runtime = await harness.setupE2ERuntime();
  const records = [];
  try {
    const api = new Api(runtime);
    await api.login();
    for (const fx of fixtures) {
      const markers = {};
      for (const p of fx.pages) {
        const m = markerOf(p.body);
        if (m) markers[p.title] = m;
      }
      console.log(
        `== ${fx.year} (${fx.meta.source} ${fx.meta.commit.slice(0, 10)})`,
      );
      const cli = await cliLeg(fx, path.join(work, fx.year), markers);
      records.push(cli);
      const node = await nodejsLeg(fx, runtime, api, markers);
      records.push(node);
      for (const r of [cli, node])
        for (const s of r.steps)
          console.log(
            `  ${r.leg.padEnd(6)} ${s.ok ? "ok  " : "FAIL"} ${s.name}${s.ok ? "" : ": " + s.detail}`,
          );
    }
  } finally {
    await harness.teardownE2ERuntime(runtime);
    fs.rmSync(work, { recursive: true, force: true });
  }
  const md = summarize(records, notes);
  fs.writeFileSync(path.join(cfg.out, "summary.md"), md + "\n");
  fs.writeFileSync(
    path.join(cfg.out, "results.json"),
    JSON.stringify(records, null, 2) + "\n",
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  const failed = records.filter((r) => !r.ok);
  console.log(
    `\n${records.length - failed.length}/${records.length} legs passed; summary: ${path.join(cfg.out, "summary.md")}`,
  );
  // the harness leaves timers running; exit explicitly
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
