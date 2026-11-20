// Leg adapters: each turns a logical op into a real call against one surface.
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { HaxClient } = require("./client.cjs");

// Every leg creates its site with this description (recorded in meta.json as
// siteDescription, so an agent leg can use the same one).
const SITE_DESCRIPTION = "Parity test site";

function readItems(siteDir) {
  const m = JSON.parse(
    fs.readFileSync(path.join(siteDir, "site.json"), "utf8"),
  );
  return Array.isArray(m.items) ? m.items : Object.values(m.items || {});
}

// same rule the CLI uses for node:add (haxtheweb/issues#3127): append after last sibling
function nextSiblingOrder(items, parent) {
  let max = -1;
  for (const it of items) {
    const p = it.parent === undefined || it.parent === "" ? null : it.parent;
    if (p === (parent || null) && !isNaN(parseInt(it.order)))
      max = Math.max(max, parseInt(it.order));
  }
  return max + 1;
}

// outline-designer recomputes every page's depth from the parent chain before
// it calls Save Outline (_recurseUpdateIndent), so a moved page's descendants
// go with it. Do the same, so saveOutline gets what the real client sends.
// Only a wrong depth is rewritten; a parent loop leaves the item as it was.
function syncIndents(items) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const parentOf = (it) =>
    it.parent === undefined || it.parent === "" || it.parent === null
      ? null
      : it.parent;
  for (const it of items) {
    let depth = 0;
    let p = parentOf(it);
    const seen = new Set([it.id]);
    while (p && byId.has(p) && !seen.has(p)) {
      seen.add(p);
      depth++;
      p = parentOf(byId.get(p));
    }
    if (p && seen.has(p)) continue;
    if (parseInt(it.indent) !== depth) it.indent = depth;
  }
  return items;
}

// Ops only the golden cases use (golden/cases.cjs); the seeded sequences in
// ops.cjs never emit them.
const GOLDEN_OP_TYPES = ["outlineSave", "outlineRaw"];

// a logical key (L0, L1, ...) as written in a golden case
const isKey = (v) => typeof v === "string" && /^L\d+$/.test(v);

// outlineRaw payloads name pages as "@L1"; swap in the leg's real ids,
// leaving everything else (an unknown id, a blank one, a number) as written
function resolveKeys(value, idOf) {
  if (typeof value === "string" && /^@L\d+$/.test(value))
    return idOf(value.slice(1)) || value;
  if (Array.isArray(value)) return value.map((v) => resolveKeys(v, idOf));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveKeys(v, idOf);
    return out;
  }
  return value;
}

// What outline-designer sends for one Save Outline: every page as site.json
// has it, with this save's changes applied, new pages added under a client
// id, and depths recomputed. A change names a page by key; its parent is a
// key, null (top level) or any other string, sent as is.
function buildOutlineItems(items, op, idOf) {
  const out = items.map((i) =>
    Object.assign({}, i, { metadata: Object.assign({}, i.metadata || {}) }),
  );
  const parentFor = (p) =>
    p === null || p === undefined ? null : isKey(p) ? idOf(p) : p;
  for (const add of op.add || []) {
    const parent = parentFor(add.parent);
    out.push({
      id: "item-golden-" + add.key,
      title: add.title,
      parent,
      order:
        add.order === undefined ? nextSiblingOrder(out, parent) : add.order,
      indent: 0,
      metadata: {},
    });
  }
  for (const ch of op.changes || []) {
    const it = out.find((x) => x.id === idOf(ch.key));
    if (!it) continue;
    if (ch.title !== undefined) it.title = ch.title;
    if (ch.slug !== undefined) {
      it.slug = ch.slug;
      it.metadata.overridePathauto = true;
    }
    if (ch.parent !== undefined) {
      it.parent = parentFor(ch.parent);
      if (ch.order === undefined)
        it.order = nextSiblingOrder(
          out.filter((x) => x.id !== it.id),
          it.parent,
        );
    }
    if (ch.order !== undefined) it.order = ch.order;
    if (ch.hideInMenu !== undefined) it.metadata.hideInMenu = ch.hideInMenu;
    if (ch.delete) it.delete = true;
  }
  return syncIndents(out);
}

// The editor's save sends a <page-break> describing the page's CURRENT
// properties followed by the body; saveNode re-applies every attribute (and
// resets published / hide-in-menu / override-pathauto when absent), so a
// content-only edit must echo the item's existing state.
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
  if (m.overridePathauto) a["override-pathauto"] = "";
  if (m.tags) a.tags = m.tags;
  if (m.icon) a.icon = m.icon;
  if (m.image) a.image = m.image;
  if (m.pageType) a["page-type"] = m.pageType;
  if (m.relatedItems) a["related-items"] = m.relatedItems;
  if (m.locked) a.locked = "";
  return (
    "<page-break " +
    Object.entries(a)
      .map(([k, v]) => (v === "" ? k : `${k}="${escAttr(v)}"`))
      .join(" ") +
    "></page-break>"
  );
}

class BaseLeg {
  constructor(name) {
    this.name = name;
    this.keyToId = {};
  }
  id(key) {
    return key ? this.keyToId[key] : null;
  }
  items() {
    return readItems(this.siteDir);
  }
  // after an addPage, find the uuid that wasn't there before
  bindNewItem(key, beforeIds) {
    const fresh = this.items()
      .map((i) => i.id)
      .filter((id) => !beforeIds.has(id));
    if (fresh.length === 1) this.keyToId[key] = fresh[0];
    return fresh;
  }
}

// system import route for a document, by extension (the same routes the
// dashboard and the CLI's file importers use)
const IMPORT_ROUTES = {
  docx: "actions/import-docx",
  odt: "actions/import-odt",
  pdf: "actions/import-pdf",
  pptx: "actions/import-pptx",
  odp: "actions/import-odp",
  xlsx: "actions/import-xlsx",
  xls: "actions/import-xlsx",
  ods: "actions/import-xlsx",
  md: "actions/import-md",
  markdown: "actions/import-md",
  txt: "actions/import-md",
};
function importRouteFor(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!IMPORT_ROUTES[ext]) throw new Error("no import route for " + filePath);
  return IMPORT_ROUTES[ext];
}

class ApiLeg extends BaseLeg {
  constructor(name, baseUrl, username, password, sitesDir) {
    super(name);
    this.client = new HaxClient(baseUrl, username, password, name);
    this.sitesDir = sitesDir;
  }
  // opts.importFile: make the site from a document, as the dashboard does:
  // the file goes to its import route, the items it returns build the site
  async create(siteName, opts = {}) {
    await this.client.login();
    let build;
    if (opts.importFile) {
      const items = await this.client.importFile(
        importRouteFor(opts.importFile),
        opts.importFile,
      );
      build = { structure: "import", items };
    }
    const r = await this.client.createSite(
      siteName,
      SITE_DESCRIPTION,
      undefined,
      build,
    );
    this.siteName = r.data.metadata.site.name;
    this.siteDir = path.join(this.sitesDir, this.siteName);
    await this.client.openSite(this.siteName);
  }
  async call(method, p, body) {
    let r = await this.client.site(method, p, body);
    if (r.status === 401 || r.status === 403) {
      await this.client.login();
      await this.client.openSite(this.siteName);
      r = await this.client.site(method, p, body);
    }
    return r;
  }
  async apply(op) {
    const site = { name: this.siteName };
    const id = this.id(op.key);
    const items = this.items();
    const patch = (body) =>
      this.call(
        "PATCH",
        "/v1/items/" + encodeURIComponent(id),
        Object.assign({ site }, body),
      );
    if (
      op.type !== "addPage" &&
      op.key &&
      !id &&
      ![
        "outlineReorder",
        "outlineSave",
        "outlineRaw",
        "setTheme",
        "normalizeSlugs",
        "setLang",
      ].includes(op.type)
    ) {
      return { status: "skipped", detail: "no mapped id for " + op.key };
    }
    let r;
    switch (op.type) {
      case "addPage": {
        const parentId = op.parent ? this.id(op.parent) : null;
        const body = { site, node: { title: op.title, contents: op.content } };
        if (parentId) body.parent = parentId;
        body.order = nextSiblingOrder(items, parentId);
        if (op.slug) body.node.location = op.slug;
        if (op.description) body.description = op.description;
        if (op.tags) body.metadata = { tags: op.tags };
        const before = new Set(items.map((i) => i.id));
        r = await this.call("POST", "/v1/items", body);
        const fresh = this.bindNewItem(op.key, before);
        return {
          status: r.status,
          newIds: fresh.length,
          detail: r.status >= 400 ? r.bodyText.slice(0, 300) : undefined,
        };
      }
      case "editTitle":
        r = await patch({ operation: "setTitle", title: op.title });
        break;
      case "editContent": {
        const me = items.find((i) => i.id === id);
        r = await this.call("PATCH", "/v1/content/" + encodeURIComponent(id), {
          site,
          content: pageBreakFor(me) + op.content,
        });
        break;
      }
      case "editSlug":
        r = await patch({ operation: "setSlug", slug: op.slug });
        break;
      case "editDescription":
        r = await patch({
          operation: "setDescription",
          description: op.description,
        });
        break;
      case "editTags":
        r = await patch({ operation: "setTags", tags: op.tags });
        break;
      case "editPublished":
        r = await patch({ operation: "setPublished", published: op.published });
        break;
      case "editHideInMenu":
        r = await patch({
          operation: "setHideInMenu",
          hideInMenu: op.hideInMenu,
        });
        break;
      case "editParent": {
        const parentId = op.parent ? this.id(op.parent) : null;
        r = await patch({
          operation: "setParent",
          parent: parentId,
          order:
            op.order === undefined
              ? nextSiblingOrder(
                  items.filter((i) => i.id !== id),
                  parentId,
                )
              : op.order,
        });
        break;
      }
      case "editOrder": {
        const me = items.find((i) => i.id === id);
        r = await patch({
          operation: "setParent",
          parent: me ? me.parent || null : null,
          order: op.order,
        });
        break;
      }
      case "deletePage":
        r = await this.call("DELETE", "/v1/items/" + encodeURIComponent(id), {
          site,
          node: { id },
        });
        break;
      case "setTheme":
        r = await this.call("PATCH", "/v1/site/appearance", {
          site,
          manifest: { theme: { "manifest-metadata-theme-element": op.theme } },
        });
        break;
      case "moveUp":
      case "moveDown":
      case "indent":
      case "outdent":
        r = await patch({ operation: op.type });
        break;
      case "setLocked":
        r = await patch({ operation: "setLocked", locked: op.locked });
        break;
      case "setIcon":
        r = await patch({ operation: "setIcon", icon: op.icon });
        break;
      case "outlineReorder": {
        const parentId = op.parent ? this.id(op.parent) : null;
        const out = items.map((i) => Object.assign({}, i));
        op.order.forEach((k, idx) => {
          const it = out.find((x) => x.id === this.id(k));
          if (it) it.order = idx;
        });
        r = await this.call("PATCH", "/v1/site/outline", {
          site,
          items: out,
          _parent: parentId || undefined,
        });
        break;
      }
      case "outlineMove": {
        const parentId = op.parent ? this.id(op.parent) : null;
        const out = items.map((i) => Object.assign({}, i));
        const me = out.find((x) => x.id === id);
        me.order = nextSiblingOrder(
          out.filter((x) => x.id !== id),
          parentId,
        );
        me.parent = parentId;
        syncIndents(out);
        r = await this.call("PATCH", "/v1/site/outline", { site, items: out });
        break;
      }
      case "outlineSave": {
        const idOf = (k) => this.id(k);
        const before = new Set(items.map((i) => i.id));
        r = await this.call("PATCH", "/v1/site/outline", {
          site,
          items: buildOutlineItems(items, op, idOf),
        });
        // new pages get server ids; idMap says which client id became which
        const idMap =
          r.json && r.json.data && r.json.data.idMap ? r.json.data.idMap : {};
        for (const add of op.add || []) {
          const sid = idMap["item-golden-" + add.key];
          if (sid && !before.has(sid)) this.keyToId[add.key] = sid;
        }
        break;
      }
      case "outlineRaw":
        r = await this.call("PATCH", "/v1/site/outline", {
          site,
          items: resolveKeys(op.items, (k) => this.id(k)),
        });
        break;
      case "normalizeSlugs":
        r = await this.call("POST", "/v1/site/normalize-slugs", {
          site,
          preview: false,
        });
        break;
      case "setLang":
        // both backends read seo.lang; the old form-field key was ignored,
        // so this op used to leave the language unchanged on every leg
        r = await this.call("PATCH", "/v1/site/seo", {
          site,
          seo: { lang: op.lang },
        });
        break;
      default:
        return { status: "unsupported" };
    }
    return {
      status: r.status,
      detail: r.status >= 400 ? r.bodyText.slice(0, 300) : undefined,
    };
  }
}

// args go straight to execFile (no shell), so titles and content with quotes,
// ampersands or markup reach the CLI unchanged
// The CLI keeps its HAXcms config, where the default site language and other
// system settings live, in the home folder (~/.haxcmsconfig). A run must not
// read the settings of whoever is running it, or write into their home, so
// the CLI gets an empty home of its own and creates a default config there.
// git falls back to the home folder for the commit author, so one is given.
function cliEnv(home) {
  const env = Object.assign({}, process.env, {
    NO_COLOR: "1",
    HOME: home,
    USERPROFILE: home,
  });
  const author = { NAME: "HAX parity", EMAIL: "parity@haxtheweb.invalid" };
  for (const who of ["AUTHOR", "COMMITTER"])
    for (const what of ["NAME", "EMAIL"])
      if (!env[`GIT_${who}_${what}`]) env[`GIT_${who}_${what}`] = author[what];
  return env;
}

function runCli(cliPath, args, cwd, home) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliPath].concat(args),
      {
        cwd,
        timeout: 120000,
        maxBuffer: 1 << 26,
        env: cliEnv(home),
      },
      (err, stdout, stderr) => {
        resolve({
          code: err ? (err.code === undefined ? 1 : err.code) : 0,
          out: String(stdout || "") + String(stderr || ""),
        });
      },
    );
  });
}

class CliLeg extends BaseLeg {
  constructor(name, cliPath, parentDir) {
    super(name);
    this.cliPath = cliPath;
    this.parentDir = parentDir;
    // beside the sites, not inside them, and never the real home folder
    this.home = parentDir + "-home";
  }
  // opts.importFile: `hax site <name> --import-site <file>` (the CLI picks
  // the importer from the extension)
  async create(siteName, opts = {}) {
    fs.mkdirSync(this.parentDir, { recursive: true });
    fs.mkdirSync(this.home, { recursive: true });
    const args = [
      "site",
      siteName,
      // same description the API legs send to createSite
      "--description=" + SITE_DESCRIPTION,
    ];
    if (opts.importFile) args.push("--import-site=" + opts.importFile);
    const r = await runCli(
      this.cliPath,
      args.concat(["--y", "--no-i", "--skip"]),
      this.parentDir,
      this.home,
    );
    if (r.code !== 0)
      throw new Error("cli create failed: " + r.out.slice(-500));
    this.siteName = siteName;
    this.siteDir = path.join(this.parentDir, siteName);
  }
  static argsFor(op, idOf, items) {
    const f = (k, v) => `--${k}=${v}`;
    const base = ["--y", "--no-i"];
    const id = idOf(op.key);
    switch (op.type) {
      case "addPage": {
        const a = [
          "site",
          "node:add",
          f("title", op.title),
          f("content", op.content),
        ];
        if (op.parent && idOf(op.parent)) a.push(f("parent", idOf(op.parent)));
        if (op.slug) a.push(f("slug", op.slug));
        if (op.description) a.push(f("description", op.description));
        if (op.tags) a.push(f("tags", op.tags));
        return a.concat(base);
      }
      case "editTitle":
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f("title", op.title),
        ].concat(base);
      case "editContent":
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f("content", op.content),
        ].concat(base);
      case "editSlug":
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f("slug", op.slug),
        ].concat(base);
      case "editDescription":
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f("description", op.description),
        ].concat(base);
      case "editTags":
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f("tags", op.tags),
        ].concat(base);
      case "editPublished":
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f("published", String(op.published)),
        ].concat(base);
      case "editHideInMenu":
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f("hide-in-menu", String(op.hideInMenu)),
        ].concat(base);
      case "editParent": {
        const parentId = op.parent ? idOf(op.parent) : null;
        const order =
          op.order === undefined
            ? nextSiblingOrder(
                items.filter((i) => i.id !== id),
                parentId,
              )
            : op.order;
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f("parent", parentId || "null"),
          f("order", order),
        ].concat(base);
      }
      case "editOrder":
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f("order", op.order),
        ].concat(base);
      case "deletePage":
        return ["site", "node:delete", f("item-id", id)].concat(base);
      case "setTheme":
        return ["site", "site:theme", f("theme", op.theme)].concat(base);
      // node:edit --move: the same item operations the API runs
      case "moveUp":
      case "moveDown":
      case "indent":
      case "outdent":
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f(
            "move",
            {
              moveUp: "up",
              moveDown: "down",
              indent: "indent",
              outdent: "outdent",
            }[op.type],
          ),
        ].concat(base);
      case "setLocked":
        return [
          "site",
          "node:edit",
          f("item-id", id),
          f("locked", String(op.locked)),
        ].concat(base);
      default:
        return null;
    }
  }
  async apply(op) {
    if (op.type !== "addPage" && op.key && !this.id(op.key))
      return { status: "skipped", detail: "no mapped id for " + op.key };
    const items = this.items();
    const args = CliLeg.argsFor(op, (k) => this.id(k), items);
    if (!args) return { status: "unsupported" };
    const before = new Set(items.map((i) => i.id));
    const r = await runCli(this.cliPath, args, this.siteDir, this.home);
    const res = { status: r.code === 0 ? "ok" : "exit" + r.code };
    if (r.code !== 0 || /error/i.test(r.out)) res.detail = r.out.slice(-300);
    if (op.type === "addPage")
      res.newIds = this.bindNewItem(op.key, before).length;
    return res;
  }
}

module.exports = {
  SITE_DESCRIPTION,
  GOLDEN_OP_TYPES,
  buildOutlineItems,
  resolveKeys,
  ApiLeg,
  CliLeg,
  readItems,
  nextSiblingOrder,
  syncIndents,
  runCli,
};
