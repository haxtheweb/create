// Read a site from disk, normalize it (uuids -> logical keys, drop timing
// data, then the accepted differences in normalize.cjs unless strict), and
// diff two normalized snapshots.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { applyAccepted } = require("./normalize.cjs");

// Keys that are pure timing / identity noise. Anything else that differs is reported.
const TIMING_KEYS = new Set(["created", "updated"]);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function replaceIds(value, idToKey, ids) {
  if (typeof value === "string") {
    let out = value;
    for (const id of ids)
      if (out.indexOf(id) !== -1) out = out.split(id).join(idToKey[id]);
    return out;
  }
  if (Array.isArray(value))
    return value.map((v) => replaceIds(v, idToKey, ids));
  if (value && typeof value === "object") {
    const o = {};
    for (const k of Object.keys(value))
      o[replaceIds(k, idToKey, ids)] = replaceIds(value[k], idToKey, ids);
    return o;
  }
  return value;
}

function stripTiming(value, pathParts = []) {
  if (Array.isArray(value))
    return value.map((v, i) => stripTiming(v, pathParts.concat(i)));
  if (value && typeof value === "object") {
    const o = {};
    for (const k of Object.keys(value)) {
      if (
        TIMING_KEYS.has(k) &&
        (typeof value[k] === "number" || typeof value[k] === "string")
      )
        continue;
      o[k] = stripTiming(value[k], pathParts.concat(k));
    }
    return o;
  }
  return value;
}

// keyToId: logical key -> this leg's uuid
// opts.strict: skip the accepted-difference normalizations
// opts.replace: extra literal string -> placeholder pairs, applied like the
//   uuids (the golden suite maps each run's site name to SITE_NAME)
function snapshot(siteDir, keyToId, opts = {}) {
  const manifest = readJson(path.join(siteDir, "site.json"));
  const idToKey = {};
  for (const [k, id] of Object.entries(keyToId)) if (id) idToKey[id] = k;
  for (const [literal, placeholder] of Object.entries(opts.replace || {}))
    if (literal) idToKey[literal] = placeholder;
  const items = Array.isArray(manifest.items)
    ? manifest.items
    : Object.values(manifest.items || {});
  let untracked = 0;
  for (const it of items) {
    if (it && it.id && !idToKey[it.id])
      idToKey[it.id] = "UNTRACKED" + ++untracked;
  }
  if (manifest.id) idToKey[manifest.id] = "SITE_ID";
  // file records a page points at (metadata.files) get a new uuid on every
  // run, like pages; name them FILE1.. in outline order
  let fileCount = 0;
  for (const it of items) {
    const files = it && it.metadata && it.metadata.files;
    if (!Array.isArray(files)) continue;
    for (const fileId of files) {
      if (typeof fileId === "string" && fileId !== "" && !idToKey[fileId])
        idToKey[fileId] = "FILE" + ++fileCount;
    }
  }
  const ids = Object.keys(idToKey).sort((a, b) => b.length - a.length);
  const pages = {};
  for (const it of items) {
    if (!it || !it.location) continue;
    const f = path.join(siteDir, it.location);
    pages[idToKey[it.id]] = fs.existsSync(f)
      ? replaceIds(fs.readFileSync(f, "utf8"), idToKey, ids)
      : "<<MISSING FILE>>";
  }
  const norm = stripTiming(replaceIds(manifest, idToKey, ids));
  const byKey = {};
  const sequence = [];
  for (const it of norm.items || []) {
    byKey[it.id] = it;
    sequence.push(it.id);
  }
  norm.items = byKey;
  const snap = { manifest: norm, sequence, pages };
  if (opts.files) snap.files = captureFiles(siteDir, idToKey, ids);
  snap.accepted = opts.strict ? [] : applyAccepted(snap);
  return snap;
}

// the site's files/ folder: every file by path with a hash of its bytes, and
// the files.json data store reduced to what a record says about its file
// (uuids and dates differ per run and are left out)
// the upload fixtures, by hash: a file still byte-identical to one is shown
// as that fixture; anything else is "other" (boilerplate, or an image a
// backend re-encoded with sharp or GD on replace: encoders legitimately
// produce different bytes)
const FIXTURE_FILES = path.join(__dirname, "golden", "fixtures", "files");
let fixtureHashes = null;
function fixtureLabel(hash) {
  if (!fixtureHashes) {
    fixtureHashes = {};
    if (fs.existsSync(FIXTURE_FILES))
      for (const f of fs.readdirSync(FIXTURE_FILES))
        fixtureHashes[
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(path.join(FIXTURE_FILES, f)))
            .digest("hex")
        ] = "fixture:" + f;
  }
  return fixtureHashes[hash] || "other";
}

function captureFiles(siteDir, idToKey, ids) {
  const root = path.join(siteDir, "files");
  const out = { onDisk: {}, records: [] };
  if (!fs.existsSync(root)) return out;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (e.isDirectory()) walk(abs);
      else if (rel !== "files.json")
        out.onDisk[rel] = fixtureLabel(
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(abs))
            .digest("hex"),
        );
    }
  };
  walk(root);
  out.onDisk = Object.fromEntries(
    Object.entries(out.onDisk).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  );
  const store = path.join(root, "files.json");
  if (fs.existsSync(store)) {
    let data = null;
    try {
      data = JSON.parse(fs.readFileSync(store, "utf8"));
    } catch (e) {
      data = null;
    }
    // HAXCMS-FILE-SCHEMA-V1: { schema, site, generated, data: { files: [] } }
    const list =
      data && data.data && Array.isArray(data.data.files)
        ? data.data.files
        : Array.isArray(data)
          ? data
          : [];
    out.records = list
      .filter((r) => r && typeof r === "object")
      .map((r) => {
        const rec = {};
        for (const k of ["path", "name", "mimetype", "size"])
          if (r[k] !== undefined) rec[k] = r[k];
        // a re-encoded image's size depends on the encoder, like its bytes
        const onDisk = out.onDisk[String(r.path || "").replace(/^files\//, "")];
        if (onDisk && onDisk.indexOf("fixture:") !== 0) delete rec.size;
        return replaceIds(rec, idToKey, ids);
      })
      .sort((a, b) => (String(a.path) < String(b.path) ? -1 : 1));
  }
  return out;
}

function diff(a, b, p = "", out = []) {
  if (a === b) return out;
  const ta = Array.isArray(a) ? "array" : a === null ? "null" : typeof a;
  const tb = Array.isArray(b) ? "array" : b === null ? "null" : typeof b;
  if (ta !== tb || (ta !== "object" && ta !== "array")) {
    out.push({ path: p, ref: a, other: b });
    return out;
  }
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  for (const k of keys) {
    if (!(k in a))
      out.push({ path: p + "." + k, ref: "<absent>", other: b[k] });
    else if (!(k in b))
      out.push({ path: p + "." + k, ref: a[k], other: "<absent>" });
    else diff(a[k], b[k], p + "." + k, out);
  }
  return out;
}

function compareSnapshots(ref, other) {
  const diffs = [];
  diff(ref.manifest, other.manifest, "site.json", diffs);
  if (JSON.stringify(ref.sequence) !== JSON.stringify(other.sequence)) {
    diffs.push({
      path: "site.json.items[] (array order)",
      ref: ref.sequence.join(","),
      other: other.sequence.join(","),
    });
  }
  diff(ref.pages, other.pages, "pages", diffs);
  // what a case records besides the site: its files, a clone, and what the
  // system answered (archive, download)
  for (const k of ["files", "clone", "extra"])
    if (k in ref || k in other)
      diff(
        k in ref ? ref[k] : "<absent>",
        k in other ? other[k] : "<absent>",
        k,
        diffs,
      );
  return diffs;
}

// collapse logical keys so the same kind of difference on different pages
// groups together
function pattern(p) {
  return p
    .replace(/\.L\d+\b/g, ".<item>")
    .replace(/\.UNTRACKED\d+\b/g, ".<untracked>")
    .replace(/\.\d+(?=\.|$)/g, "[n]");
}

module.exports = { snapshot, compareSnapshots, captureFiles, pattern };
