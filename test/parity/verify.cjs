// Agent-leg checker. An agent replays a recorded parity run (ops.jsonl) on its
// own HAX CLI site, one op at a time, and after each op runs:
//   node verify.cjs --results <run dir>/A --site <agent site dir> --op N
// `--op 0` (right after creating the site) initializes state. Each call binds
// the page an addPage op created to its logical key (L1, L2, ...), snapshots
// the agent's site with the same normalization as run.cjs, and diffs it
// against the nodejs (reference) and scripted-CLI snapshots recorded at op N.
// Results append to <state>/verify.jsonl (default <results>/../agent).
// Report-only: exits 0 whatever it finds; 2 on bad arguments.
const fs = require("fs");
const path = require("path");
const { snapshot, compareSnapshots, pattern } = require("./snapshot.cjs");
const { readArgs } = require("./config.cjs");

const args = readArgs(process.argv.slice(2));
const resultsArg = args.results || process.env.HAX_PARITY_RESULTS;
if (!args.site || args.op === undefined || !resultsArg) {
  console.error(
    "usage: node verify.cjs --results <run dir>/A --site <agent site dir> --op N [--state <dir>] [--json]",
  );
  process.exit(2);
}
const siteDir = path.resolve(args.site);
const opNum = parseInt(args.op, 10);
const RES = path.resolve(resultsArg);
const OUT = path.resolve(args.state || path.join(RES, "..", "agent"));
fs.mkdirSync(OUT, { recursive: true });
const stateFile = path.join(OUT, "state.json");
const meta = JSON.parse(fs.readFileSync(path.join(RES, "meta.json"), "utf8"));
const warnings = [];

const manifest = () =>
  JSON.parse(fs.readFileSync(path.join(siteDir, "site.json"), "utf8"));
const items = () => {
  const m = manifest();
  return Array.isArray(m.items) ? m.items : Object.values(m.items || {});
};
let state =
  fs.existsSync(stateFile) && opNum > 0
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : { keyToId: {}, knownIds: [], lastOp: -1 };
const op =
  opNum > 0
    ? fs
        .readFileSync(path.join(RES, "ops.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .find((o) => o.i === opNum)
    : null;
if (opNum === 0) {
  const it = items();
  state.keyToId.L0 = it[0] && it[0].id;
  state.knownIds = it.map((i) => i.id);
  const name = manifest().metadata && manifest().metadata.site;
  if (name && name.name !== meta.siteName)
    warnings.push(
      `site name is "${name.name}" but the run used "${meta.siteName}"; create the site with that name or every snapshot differs on it`,
    );
} else {
  if (opNum !== state.lastOp + 1)
    warnings.push(`expected op ${state.lastOp + 1}, got ${opNum}`);
  if (!op) warnings.push(`op ${opNum} is not in ops.jsonl`);
  const now = items().map((i) => i.id);
  const fresh = now.filter((id) => !state.knownIds.includes(id));
  if (op && op.type === "addPage") {
    if (fresh.length === 1) state.keyToId[op.key] = fresh[0];
    else warnings.push(`addPage expected 1 new page, found ${fresh.length}`);
  } else if (fresh.length) {
    warnings.push(
      `op ${opNum} (${op && op.type}) created ${fresh.length} unexpected page(s)`,
    );
  }
  state.knownIds = now;
}
state.lastOp = opNum;
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

const mine = snapshot(siteDir, state.keyToId, { strict: meta.strict });
const out = { op: opNum, type: op ? op.type : "createSite", warnings, vs: {} };
for (const leg of ["nodejs", "cli"]) {
  const f = path.join(RES, "snapshots", leg, opNum + ".json");
  if (!fs.existsSync(f)) {
    out.vs[leg] = "no reference snapshot for this op";
    continue;
  }
  const diffs = compareSnapshots(JSON.parse(fs.readFileSync(f, "utf8")), mine);
  out.vs[leg] = {
    count: diffs.length,
    patterns: [...new Set(diffs.map((d) => pattern(d.path)))],
    sample: diffs.slice(0, 5),
  };
}
fs.appendFileSync(path.join(OUT, "verify.jsonl"), JSON.stringify(out) + "\n");
if (args.json) {
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
} else {
  for (const w of warnings) console.log("WARNING: " + w);
  const v = out.vs;
  const show = (x) => (typeof x === "string" ? x : x.count + " diffs");
  console.log(
    `op ${opNum} (${out.type}): vs nodejs ${show(v.nodejs)}; vs scripted CLI ${show(v.cli)}`,
  );
  for (const leg of ["nodejs", "cli"]) {
    if (typeof v[leg] === "object" && v[leg].count)
      console.log(`  differs from ${leg} at: ` + v[leg].patterns.join(", "));
  }
}
