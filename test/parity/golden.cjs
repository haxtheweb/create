// Golden snapshot suite (haxtheweb/issues#3332). The parity sequences in
// run.cjs compare legs with each other, so a change that every leg makes the
// same wrong way goes unnoticed. Here each case in golden/cases.cjs starts from
// a fresh site, runs its steps on every leg it lists, and every leg's
// normalized result is compared to a reviewed snapshot committed in
// golden/snapshots/<id>.json.
//
// Started by parity.cjs with --golden (it boots the servers):
//   node test/parity/parity.cjs --golden                    compare, report-only
//   node test/parity/parity.cjs --golden --fail-on-diff     exit 1 on any mismatch
//   node test/parity/parity.cjs --golden --update-golden    rewrite snapshots
//   ... --cases 15-add-top-level-page,16-add-child-page     run some cases only
//
// --update-golden writes each snapshot from the nodejs (reference) leg and
// still compares every other leg against it, so a leg that disagrees is
// reported instead of being written into the golden file.
const fs = require("fs");
const path = require("path");
const { ApiLeg, CliLeg } = require("./legs.cjs");
const { snapshot, compareSnapshots } = require("./snapshot.cjs");
const { CASES } = require("./golden/cases.cjs");

const SNAPSHOT_DIR = path.join(__dirname, "golden", "snapshots");
// the plugin --noop-plugin turns on (every hook, no changes)
const NOOP_PLUGIN_DIR = path.join(
  __dirname,
  "golden",
  "fixtures",
  "plugins",
  "golden-noop",
);
// documents the import cases make their sites from
const FIXTURE_DIR = path.join(__dirname, "golden", "fixtures", "import");
const SITE_NAME = "SITE_NAME";
const CLONE_NAME = "CLONE_NAME";

// why the golden-noop plugin is not on for a site, from its plugins registry
// (GET /v1/plugins), or "" when it is enabled and active
function noopPluginProblem(r) {
  if (!r || r.status !== 200)
    return "plugins registry answered " + (r ? r.status : "nothing");
  const list = r.json && Array.isArray(r.json.data) ? r.json.data : [];
  const entry = list.find((p) => p && p.id === "golden-noop");
  if (!entry) return "golden-noop is not installed";
  if (entry.enabled !== true || entry.status !== "active")
    return (
      "golden-noop is " +
      (entry.status || "not active") +
      (entry.reason ? " (" + entry.reason + ")" : "")
    );
  return "";
}

function selectCases(filter) {
  if (!filter) return CASES;
  const wanted = String(filter)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = wanted.filter((w) => !CASES.some((c) => c.id === w));
  if (unknown.length)
    throw new Error("unknown golden case(s): " + unknown.join(", "));
  return CASES.filter((c) => wanted.includes(c.id));
}

// what gets committed: the normalized snapshot without the run-specific list
// of accepted normalizations (those are reported, not compared)
function toGolden(snap) {
  const g = {
    manifest: snap.manifest,
    sequence: snap.sequence,
    pages: snap.pages,
  };
  // only cases that ask for them carry these, so older snapshots keep their shape
  for (const k of ["files", "clone", "extra"])
    if (snap[k] !== undefined) g[k] = snap[k];
  return g;
}

// replace a run's site names inside recorded values
function renameIn(value, names) {
  if (typeof value === "string") {
    let out = value;
    for (const [literal, placeholder] of Object.entries(names))
      if (literal) out = out.split(literal).join(placeholder);
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => renameIn(v, names));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        renameIn(k, names),
        renameIn(v, names),
      ]),
    );
  return value;
}

// a leg's result for a case: its site (gone once archived), its clone,
// and what it recorded along the way
function legSnapshot(cfg, c, l) {
  const names = { [l.siteName]: SITE_NAME };
  if (l.cloneName) names[l.cloneName] = CLONE_NAME;
  const opts = { strict: cfg.strict, replace: names, files: !!c.captureFiles };
  const snap = l.archived
    ? { manifest: null, sequence: [], pages: {}, accepted: [] }
    : snapshot(l.siteDir, l.keyToId, opts);
  if (l.cloneDir) snap.clone = toGolden(snapshot(l.cloneDir, l.keyToId, opts));
  if (l.extra && Object.keys(l.extra).length) {
    // page folders in an export are named by page id
    const ids = Object.assign({}, names);
    for (const [k, id] of Object.entries(l.keyToId)) if (id) ids[id] = k;
    snap.extra = renameIn(l.extra, ids);
  }
  return snap;
}

function goldenPath(id) {
  return path.join(SNAPSHOT_DIR, id + ".json");
}

function readGolden(id) {
  const p = goldenPath(id);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

function writeGolden(id, golden) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(goldenPath(id), JSON.stringify(golden, null, 2) + "\n");
}

function makeLegs(cfg, nodeInfo, which) {
  const legs = [
    new ApiLeg(
      "nodejs",
      nodeInfo.baseUrl,
      nodeInfo.username,
      nodeInfo.password,
      nodeInfo.sitesDir,
    ),
    new ApiLeg(
      "php",
      cfg["php-url"],
      cfg["php-user"],
      cfg["php-pass"],
      path.join(cfg.phpRoot || cfg.php, "_sites"),
    ),
  ];
  if (which === "all")
    legs.push(new CliLeg("cli", cfg.cli, path.join(cfg.work, "golden-sites")));
  return legs;
}

// a failed step is part of the result: it is recorded and the case carries on,
// so the snapshot shows what the leg left on disk. A step with `expect` (an
// HTTP status) is one that must be refused: it fails unless the leg answers
// exactly that status, and the snapshot then shows the site was left as it was.
function stepFailed(st, step = {}) {
  if (!st) return true;
  if (step.expect !== undefined) return st.status !== step.expect;
  if (st.status === "ok") return false;
  return !(typeof st.status === "number" && st.status < 400);
}

async function runCase(cfg, nodeInfo, c, runTag) {
  const siteName = ("golden" + c.id.split("-")[0] + runTag).toLowerCase();
  const legs = makeLegs(cfg, nodeInfo, c.legs);
  const result = { id: c.id, title: c.title, legs: {}, stepErrors: [] };
  const createOpts = c.importFile
    ? { importFile: path.join(FIXTURE_DIR, c.importFile) }
    : {};
  for (const l of legs) {
    await l.create(siteName, createOpts);
    const items = l.items();
    l.keyToId.L0 = items[0] && items[0].id;
    // an imported site's pages are L0, L1, ... in outline order
    if (c.importFile)
      items.forEach((it, i) => {
        l.keyToId["L" + i] = it.id;
      });
  }
  // with --noop-plugin the case only counts if the plugin really ran: each
  // API leg must list golden-noop as enabled and active for this site
  if (cfg["noop-plugin"])
    for (const l of legs) {
      if (typeof l.call !== "function") continue;
      const problem = noopPluginProblem(await l.call("GET", "/v1/plugins"));
      if (problem)
        result.stepErrors.push({
          leg: l.name,
          step: 0,
          type: "noop-plugin",
          status: "not-loaded",
          detail: problem,
        });
    }
  for (const [n, step] of c.steps.entries()) {
    for (const l of legs) {
      let st;
      try {
        st = await l.apply(step);
      } catch (e) {
        st = { status: "threw", detail: String(e && e.message).slice(0, 300) };
      }
      if (stepFailed(st, step))
        result.stepErrors.push({
          leg: l.name,
          step: n + 1,
          type: step.type,
          status: st.status,
          expected: step.expect,
          detail: st.detail,
        });
    }
  }
  const snaps = {};
  for (const l of legs) snaps[l.name] = legSnapshot(cfg, c, l);
  let golden = readGolden(c.id);
  if (cfg["update-golden"]) {
    golden = toGolden(snaps.nodejs);
    writeGolden(c.id, golden);
    result.updated = true;
  }
  if (!golden) {
    result.missing = true;
    return result;
  }
  for (const l of legs) {
    const diffs = compareSnapshots(golden, toGolden(snaps[l.name]));
    result.legs[l.name] = { diffs: diffs.length, examples: diffs.slice(0, 5) };
  }
  return result;
}

function passed(r) {
  return (
    !r.missing &&
    r.stepErrors.length === 0 &&
    Object.values(r.legs).every((l) => l.diffs === 0)
  );
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;")
    .replace(/[\r\n]+/g, " ");
}

function short(v) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s === undefined
    ? "undefined"
    : s.length > 120
      ? s.slice(0, 117) + "..."
      : s;
}

function summarizeGolden(results, cfg) {
  const failed = results.filter((r) => !passed(r));
  const lines = [];
  lines.push("### Golden snapshots");
  lines.push("");
  lines.push(
    `${results.length - failed.length} of ${results.length} case(s) match their golden snapshot on every leg` +
      (cfg["update-golden"]
        ? " (snapshots rewritten from the nodejs leg)"
        : "") +
      ".",
  );
  lines.push("");
  lines.push("| Case | nodejs | php | cli |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of results) {
    const cell = (leg) => {
      if (r.missing) return "no snapshot";
      if (!r.legs[leg]) return "-";
      const errs = r.stepErrors.filter((e) => e.leg === leg).length;
      const d = r.legs[leg].diffs;
      if (!d && !errs) return "match";
      return [d ? `${d} diff(s)` : "", errs ? `${errs} failed step(s)` : ""]
        .filter(Boolean)
        .join(", ");
    };
    lines.push(
      `| \`${r.id}\` | ${cell("nodejs")} | ${cell("php")} | ${cell("cli")} |`,
    );
  }
  for (const r of failed) {
    lines.push("");
    lines.push(
      `<details><summary><code>${esc(r.id)}</code>: ${esc(r.title)}</summary>`,
    );
    lines.push("");
    if (r.missing)
      lines.push(
        "No committed snapshot. Run with `--update-golden --cases " +
          r.id +
          "`, review it, and commit it.",
      );
    for (const e of r.stepErrors)
      lines.push(
        `- ${e.leg}, step ${e.step} (${e.type}): ${esc(e.status)}${e.expected !== undefined ? " (expected " + esc(e.expected) + ")" : ""}${e.detail ? " " + esc(short(e.detail)) : ""}`,
      );
    for (const [leg, l] of Object.entries(r.legs))
      for (const d of l.examples)
        lines.push(
          `- ${leg} <code>${esc(d.path)}</code>: golden <code>${esc(short(d.ref))}</code>, got <code>${esc(short(d.other))}</code>`,
        );
    lines.push("");
    lines.push("</details>");
  }
  return { markdown: lines.join("\n"), failed: failed.length };
}

async function runGolden(cfg, nodeInfo, log = console.log) {
  const cases = selectCases(cfg.cases);
  const out = path.join(cfg.out, "golden");
  fs.mkdirSync(out, { recursive: true });
  const runTag = Date.now().toString(36);
  const results = [];
  for (const c of cases) {
    const r = await runCase(cfg, nodeInfo, c, runTag);
    results.push(r);
    log(`[golden] ${c.id}: ${passed(r) ? "match" : "MISMATCH"}`);
  }
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(results, null, 2),
  );
  const summary = summarizeGolden(results, cfg);
  fs.writeFileSync(path.join(out, "summary.md"), summary.markdown + "\n");
  return { results, ...summary };
}

module.exports = {
  runGolden,
  NOOP_PLUGIN_DIR,
  noopPluginProblem,
  runCase,
  stepFailed,
  summarizeGolden,
  selectCases,
  passed,
  toGolden,
  renameIn,
  SNAPSHOT_DIR,
};
