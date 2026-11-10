// Read a site from disk, normalize it (uuids -> logical keys, drop timing
// data, then the accepted differences in normalize.cjs unless strict), and
// diff two normalized snapshots.
const fs = require("fs");
const path = require("path");
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
function snapshot(siteDir, keyToId, opts = {}) {
  const manifest = readJson(path.join(siteDir, "site.json"));
  const idToKey = {};
  for (const [k, id] of Object.entries(keyToId)) if (id) idToKey[id] = k;
  const items = Array.isArray(manifest.items)
    ? manifest.items
    : Object.values(manifest.items || {});
  let untracked = 0;
  for (const it of items) {
    if (it && it.id && !idToKey[it.id])
      idToKey[it.id] = "UNTRACKED" + ++untracked;
  }
  if (manifest.id) idToKey[manifest.id] = "SITE_ID";
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
  snap.accepted = opts.strict ? [] : applyAccepted(snap);
  return snap;
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

module.exports = { snapshot, compareSnapshots, pattern };
