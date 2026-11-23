// Generated-input parity run (haxtheweb/issues#3386): request inputs are
// generated from the site API's OpenAPI spec with fast-check
// (openapi-arb.cjs), each one is sent to every leg, and the legs' responses
// and the sites they leave on disk are diffed against the first leg (nodejs,
// the reference). It follows the HAX fuzz convention
// (test/_helpers/fuzz-config.cjs, haxtheweb/issues#3272):
//
//   HAX_FUZZ_SEED   integer, or "random"; unset = FUZZ_DEFAULT_SEED
//   HAX_FUZZ_RUNS   generated request sequences (default FUZZ_DEFAULT_RUNS)
//   HAX_FUZZ_PATH   replay one reported counterexample
//
// One run is a short sequence of requests against a site that is put back to
// the same starting state first, so a counterexample does not depend on the
// runs before it and fast-check can shrink it. Every finding is replayed once
// to confirm it and reported with a one-line replay command.
//
// The engine (checkParity) only needs legs with reset() / send() / state(),
// so test/unit/parity-fuzz.test.cjs runs it against in-process legs.
"use strict";
const fs = require("fs");
const path = require("path");
const { fuzzConfig } = require("../_helpers/fuzz-config.cjs");
const {
  loadSpec,
  listOperations,
  requestArbitrary,
  toUrlPath,
} = require("./openapi-arb.cjs");
const { ApiLeg, resolveKeys, readItems } = require("./legs.cjs");
const { snapshot, compareSnapshots, pattern } = require("./snapshot.cjs");
const {
  TITLES,
  SLUGS,
  DESCRIPTIONS,
  TAGS,
  CONTENT,
  THEMES,
} = require("./ops.cjs");

const FUZZ_DEFAULT_SEED = 3386;
const FUZZ_DEFAULT_RUNS = 100;

// Operations the generated run leaves out, each with the reason. Everything
// else in the spec that takes no body or a JSON body is fuzzed.
const EXCLUDED_OPERATIONS = {
  createFile: "multipart upload, not a JSON body",
  replaceFileContent: "multipart upload, not a JSON body",
  checkSiteLinks: "fetches the links it checks from the network",
  getSiteExport: "answers a generated archive or document, not JSON",
  createSiteExport: "answers a generated archive or document, not JSON",
  downloadItemExport: "answers a generated document, not JSON",
  listItemRevisions: "git commit ids and times differ on every leg",
  getItemRevisionById: "git commit ids and times differ on every leg",
  compareItemRevisions: "git commit ids and times differ on every leg",
  restoreItemRevision: "git commit ids and times differ on every leg",
  getSiteApiDiscovery:
    "static document; the specs are compared by spec-diff.cjs",
  getSiteOpenApi: "static document; the specs are compared by spec-diff.cjs",
  getSiteOpenApiJson:
    "static document; the specs are compared by spec-diff.cjs",
  getSiteOpenApiYaml:
    "static document; the specs are compared by spec-diff.cjs",
  getApiCatalog: "static document; the specs are compared by spec-diff.cjs",
};

// keys whose values are clock readings, on any leg
const TIMING_KEYS = new Set(["created", "updated", "timestamp", "generated"]);

function typeOf(v) {
  return Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
}

function deepDiff(a, b, p, out) {
  if (a === b) return out;
  const ta = typeOf(a);
  const tb = typeOf(b);
  if (ta !== tb || (ta !== "object" && ta !== "array")) {
    out.push({ path: p, ref: a, other: b });
    return out;
  }
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  for (const k of keys) {
    if (!Object.hasOwn(a, k))
      out.push({ path: p + "." + k, ref: "<absent>", other: b[k] });
    else if (!Object.hasOwn(b, k))
      out.push({ path: p + "." + k, ref: a[k], other: "<absent>" });
    else deepDiff(a[k], b[k], p + "." + k, out);
  }
  return out;
}

// The moment every starting page is stamped with (January 1, 2026 UTC), so a
// time a leg reports for one of them is the same on every leg and is compared
// as written. Times made during a run are clock readings; see normalizeValue.
const PINNED_TIME = 1767225600;

const EPOCH_RE = /\b1\d{9}(?:\d{3})?\b/g;
const ISO_RE =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;

// Replace every literal in `replacements` (a leg's page ids, its base URL,
// its sites folder) with the placeholder all legs share, and drop clock
// readings, so two legs that did the same thing produce the same value.
// A clock reading is a `created` / `updated` style key, or any epoch or ISO
// time that falls inside `clock` = [from, to] (epoch seconds, the span of the
// run): that is "now" on the leg that wrote it, and "now" is never the same
// second twice.
function normalizeValue(value, replacements, clock) {
  const literals = Object.keys(replacements)
    .filter(Boolean)
    .sort((x, y) => y.length - x.length);
  const inRun = (seconds) =>
    Boolean(clock) && seconds >= clock[0] && seconds <= clock[1];
  const str = (s) => {
    let out = s;
    for (const lit of literals)
      if (out.indexOf(lit) !== -1) out = out.split(lit).join(replacements[lit]);
    if (clock) {
      out = out.replace(EPOCH_RE, (m) =>
        inRun(Number(m.length === 13 ? m.slice(0, 10) : m)) ? "<now>" : m,
      );
      out = out.replace(ISO_RE, (m) => {
        const t = Date.parse(m.replace(" ", "T"));
        return Number.isNaN(t) || !inRun(Math.floor(t / 1000)) ? m : "<now>";
      });
    }
    return out;
  };
  const walk = (v) => {
    if (typeof v === "string") return str(v);
    if (typeof v === "number")
      return inRun(v > 1e12 ? Math.floor(v / 1000) : v) ? "<now>" : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v)) {
        if (
          TIMING_KEYS.has(k) &&
          (typeof v[k] === "number" || typeof v[k] === "string")
        )
          continue;
        o[str(k)] = walk(v[k]);
      }
      return o;
    }
    return v;
  };
  return walk(value);
}

// where two texts first differ, as one short line each
function firstTextDifference(a, b) {
  const la = String(a).split("\n");
  const lb = String(b).split("\n");
  let i = 0;
  while (i < la.length && i < lb.length && la[i] === lb[i]) i++;
  const line = (lines) =>
    i < lines.length ? lines[i].slice(0, 200) : "<end of body>";
  return { path: " line " + (i + 1), ref: line(la), other: line(lb) };
}

// Differences between the reference leg's response and another leg's, as
// [{ kind: "status" | "body", path, ref, other }]. Both are already
// normalized: { status, json } or { status, text }.
function diffResponses(ref, other) {
  const out = [];
  if (ref.status !== other.status)
    out.push({
      kind: "status",
      path: "",
      ref: ref.status,
      other: other.status,
    });
  const a = ref.json !== undefined ? ref.json : ref.text;
  const b = other.json !== undefined ? other.json : other.text;
  if (typeof a === "string" && typeof b === "string") {
    // a text body (yaml, xml, html, markdown): say where it first differs
    if (a !== b)
      out.push(Object.assign({ kind: "body" }, firstTextDifference(a, b)));
    return out;
  }
  for (const d of deepDiff(a, b, "", []))
    out.push({ kind: "body", path: d.path, ref: d.ref, other: d.other });
  return out;
}

// A difference's name: which operation, on which leg, and where. Only
// characters that are safe unquoted in a shell word are kept, so a signature
// can be passed back with --fuzz-skip in a replay command.
function signatureOf(operationId, leg, kind, where) {
  // a text body's difference is named without its line number
  const place = String(where || "").replace(/^ line \d+$/, ".text");
  const text = [operationId, leg, kind + pattern(place)].join(":");
  return text.replace(/[^A-Za-z0-9_.:\-[\]]/g, "_").slice(0, 160);
}

class ParityMismatch extends Error {
  constructor(finding) {
    super(
      `parity mismatch at step ${finding.step + 1} (${finding.request.operationId}): ${finding.signatures.join(", ")}`,
    );
    this.name = "ParityMismatch";
    this.finding = finding;
  }
}

// Run one generated sequence on every leg. Returns null when the legs agree
// all the way, or the first step where they do not:
//   { step, request, signatures, diffs }
// `skip` holds signatures already reported in this run; a step whose only
// differences are skipped ones is not a finding, and ends the sequence.
async function executeSequence(legs, sequence, skip) {
  await Promise.all(legs.map((l) => l.reset()));
  for (let step = 0; step < sequence.length; step++) {
    const request = sequence[step];
    const responses = await Promise.all(legs.map((l) => l.send(request)));
    const states =
      request.method === "GET"
        ? null
        : await Promise.all(legs.map((l) => l.state()));
    const diffs = [];
    for (let i = 1; i < legs.length; i++) {
      for (const d of diffResponses(responses[0], responses[i]))
        diffs.push(
          Object.assign(d, {
            leg: legs[i].name,
            signature: signatureOf(
              request.operationId,
              legs[i].name,
              d.kind,
              d.path,
            ),
          }),
        );
      if (states)
        for (const d of compareSnapshots(states[0], states[i]))
          diffs.push({
            kind: "disk",
            leg: legs[i].name,
            path: d.path,
            ref: d.ref,
            other: d.other,
            signature: signatureOf(
              request.operationId,
              legs[i].name,
              "disk.",
              d.path,
            ),
          });
    }
    const fresh = diffs.filter((d) => !skip.has(d.signature));
    if (fresh.length)
      return {
        step,
        request,
        signatures: Array.from(new Set(fresh.map((d) => d.signature))),
        diffs: fresh,
      };
    // The legs differ here in a way that is already reported. From this
    // step on they are no longer in the same state, so whatever a later
    // request shows is that same difference again under another name: the
    // sequence ends here.
    if (diffs.length) return null;
  }
  return null;
}

// The arbitrary for one run: 1..maxSteps requests, each from one operation.
// Operations that write get more weight than the ones that only read.
function sequenceArbitrary(fc, spec, operations, opts) {
  const o = opts || {};
  const choices = operations.map((op) => ({
    weight: op.method === "GET" ? 1 : 3,
    arbitrary: requestArbitrary(fc, spec, op, o),
  }));
  return fc.array(fc.oneof(...choices), {
    minLength: 1,
    maxLength: o.maxSteps || 3,
  });
}

function replayCommand(seed, pathText, runs, skip, command) {
  const env = [`HAX_FUZZ_SEED=${seed}`, `HAX_FUZZ_PATH=${pathText}`];
  env.push(`HAX_FUZZ_RUNS=${runs}`);
  const flags = skip.length ? ` --fuzz-skip ${skip.join(",")}` : "";
  return `${env.join(" ")} ${command}${flags}`;
}

// Hunt for sequences on which the legs disagree.
//   fc          fast-check
//   legs        [reference, ...others], each { name, reset(), send(request),
//               state() }; send() answers a normalized { status, json|text }
//   arbitrary   sequenceArbitrary(...)
//   params      fuzzConfig(...) result: { numRuns, seed?, path? }
//   maxFindings stop after this many different findings (default 10)
//   skip        signatures to ignore from the start (a replay passes the
//               ones reported before the finding it replays)
//   command     the command a replay line ends with
// After a finding its signatures are skipped and the same seed is run again,
// so one hunt reports several different divergences instead of the same
// first one. Returns { seed, runs, checks, findings: [{ ..., seed, path,
// replay, confirmed }] }.
async function checkParity(opts) {
  const { fc, legs, arbitrary } = opts;
  const params = Object.assign({}, opts.params);
  const maxFindings = params.path ? 1 : opts.maxFindings || 10;
  const command = opts.command || "node test/parity/parity.cjs --fuzz";
  const log = opts.log || (() => {});
  const skip = new Set(opts.skip || []);
  const findings = [];
  let seed = params.seed;
  let checks = 0;
  for (;;) {
    const skipBefore = Array.from(skip);
    const details = await fc.check(
      fc.asyncProperty(arbitrary, async (sequence) => {
        const finding = await executeSequence(legs, sequence, skip);
        if (finding) throw new ParityMismatch(finding);
      }),
      Object.assign({}, params, seed === undefined ? {} : { seed }),
    );
    checks += details.numRuns;
    // a random seed is chosen by fast-check on the first round; every
    // later round, and every replay line, uses that same seed
    seed = details.seed;
    if (!details.failed) break;
    const sequence = details.counterexample[0];
    // replay the shrunk counterexample once, to confirm it and to read
    // what differed
    const again = await executeSequence(legs, sequence, skip);
    const finding = again || {
      step: 0,
      request: sequence[0],
      signatures: [],
      diffs: [],
    };
    finding.confirmed = Boolean(again);
    // requests after the step that differed were never sent
    finding.sequence = sequence.slice(0, finding.step + 1);
    finding.seed = details.seed;
    finding.path = details.counterexamplePath;
    finding.shrinks = details.numShrinks;
    finding.replay = replayCommand(
      details.seed,
      details.counterexamplePath,
      params.numRuns,
      skipBefore,
      command,
    );
    if (!again) {
      // it failed during the hunt and passed when replayed: a leg answered
      // the same input two ways. Reported, and the hunt stops here, since
      // nothing names the difference to skip.
      finding.flaky = String(
        details.errorInstance && details.errorInstance.message
          ? details.errorInstance.message
          : details.error || "",
      ).slice(0, 300);
      findings.push(finding);
      log(
        `finding ${findings.length}: NOT confirmed on replay (${finding.flaky})`,
      );
      break;
    }
    findings.push(finding);
    log(
      `finding ${findings.length}: ${finding.request.operationId} ${finding.signatures.join(", ")}`,
    );
    for (const s of finding.signatures) skip.add(s);
    if (findings.length >= maxFindings) break;
  }
  return { seed, runs: params.numRuns, checks, findings, maxFindings };
}

// ---------------------------------------------------------------------------
// The real legs: a HAXcms site behind a backend's site API.

// Stamp every page and the site itself with PINNED_TIME, in site.json.
function pinTimes(siteDir) {
  const file = path.join(siteDir, "site.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const pin = (holder) => {
    if (!holder || typeof holder !== "object") return;
    for (const k of ["created", "updated"])
      if (Object.hasOwn(holder, k)) holder[k] = PINNED_TIME;
  };
  pin(manifest.metadata && manifest.metadata.site);
  for (const it of Array.isArray(manifest.items) ? manifest.items : [])
    pin(it && it.metadata);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
}

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
}

class FuzzLeg {
  // api: an ApiLeg whose site exists and holds the starting pages
  constructor(api, pristineDir) {
    this.api = api;
    this.name = api.name;
    this.pristineDir = pristineDir;
    this.startKeys = Object.assign({}, api.keyToId);
    // clock readings from here on belong to this run
    this.since = Math.floor(Date.now() / 1000) - 5;
    pinTimes(api.siteDir);
    this.siteId = JSON.parse(
      fs.readFileSync(path.join(api.siteDir, "site.json"), "utf8"),
    ).id;
    copyDir(api.siteDir, pristineDir);
  }
  clock() {
    return [this.since, Math.floor(Date.now() / 1000) + 5];
  }
  async reset() {
    copyDir(this.pristineDir, this.api.siteDir);
    this.api.keyToId = Object.assign({}, this.startKeys);
    this.added = 0;
  }
  // pages this run made get the next logical key, in outline order, so the
  // same page has the same key on every leg
  bindNewPages() {
    let items = [];
    try {
      items = readItems(this.api.siteDir);
    } catch (e) {
      return;
    }
    const known = new Set(Object.values(this.api.keyToId));
    for (const it of items) {
      if (it && typeof it.id === "string" && it.id && !known.has(it.id)) {
        this.api.keyToId["N" + ++this.added] = it.id;
        known.add(it.id);
      }
    }
  }
  replacements() {
    const map = {};
    for (const [key, id] of Object.entries(this.api.keyToId))
      if (id) map[id] = key;
    if (this.siteId) map[this.siteId] = "SITE_ID";
    map[this.api.client.baseUrl] = "<base>";
    // where this leg keeps its sites on disk, when a response names a file
    map[this.api.sitesDir] = "<root><sites>";
    map[path.dirname(this.api.sitesDir)] = "<root>";
    map["/_sites/"] = "<sites>/";
    map["/sites/"] = "<sites>/";
    return map;
  }
  async send(request) {
    const idOf = (k) => this.api.id(k);
    const resolved = {
      path: request.path,
      pathParams: resolveKeys(request.pathParams, idOf),
      query: resolveKeys(request.query, idOf),
    };
    const body =
      request.body === undefined ? undefined : resolveKeys(request.body, idOf);
    // the spec's paths start with the site API mount, which the client adds
    const url = toUrlPath(resolved).replace(/^\/x\/api/, "");
    let r;
    try {
      r = await this.api.call(request.method, url, body);
    } catch (e) {
      return {
        status: "no response",
        text: String(e && e.message).slice(0, 200),
      };
    }
    this.bindNewPages();
    const map = this.replacements();
    const clock = this.clock();
    if (r.json !== null && r.json !== undefined)
      return { status: r.status, json: normalizeValue(r.json, map, clock) };
    return { status: r.status, text: normalizeValue(r.bodyText, map, clock) };
  }
  async state() {
    try {
      return snapshot(this.api.siteDir, this.api.keyToId);
    } catch (e) {
      // a site.json a leg left unreadable is itself a difference
      return {
        manifest: { unreadable: String(e && e.message).slice(0, 120) },
        sequence: [],
        pages: {},
      };
    }
  }
}

// pages every leg's site starts with, besides the welcome page (L0)
const START_PAGES = [
  {
    type: "addPage",
    key: "L1",
    title: "Unit one",
    content: "<p>Unit one.</p>",
  },
  {
    type: "addPage",
    key: "L2",
    title: "Lesson one",
    content: "<h2>Lesson</h2><p>Body of <strong>lesson one</strong>.</p>",
    parent: "L1",
    tags: "biology",
  },
  {
    type: "addPage",
    key: "L3",
    title: "Unit two",
    content: "<p>Unit two.</p>",
  },
];
const START_KEYS = ["L0", "L1", "L2", "L3"];

function specFile(cfg) {
  return path.join(cfg.nodejs, "src", "openapi", "site-spec.yaml");
}

function fuzzOperations(spec, only) {
  const wanted = new Set((only || []).filter(Boolean));
  return listOperations(spec).filter((op) => {
    if (op.nonJsonBody || EXCLUDED_OPERATIONS[op.operationId]) return false;
    return !wanted.size || wanted.has(op.operationId);
  });
}

// The command a replay line ends with. The flags that change what is
// generated (which operations, how many requests per run) have to be the
// same in a replay, so they are part of it; only names made of word
// characters are passed on.
function replayBase(cfg, maxSteps) {
  let command = "node test/parity/parity.cjs --fuzz";
  const ops = csv(cfg["fuzz-ops"]).filter((id) => /^\w+$/.test(id));
  if (ops.length) command += " --fuzz-ops " + ops.join(",");
  if (maxSteps !== 3) command += " --fuzz-steps " + maxSteps;
  return command;
}

function csv(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function runFuzz(cfg, nodeInfo, log = console.log) {
  const fc = require("fast-check");
  const params = fuzzConfig({
    defaultSeed: FUZZ_DEFAULT_SEED,
    defaultRuns: FUZZ_DEFAULT_RUNS,
  });
  const out = path.join(cfg.out, "fuzz");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const spec = loadSpec(specFile(cfg));
  const operations = fuzzOperations(spec, csv(cfg["fuzz-ops"]));
  if (!operations.length) throw new Error("no operation left to fuzz");
  const siteName = "parityf" + Date.now().toString(36);
  const apis = [
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
  const legs = [];
  for (const api of apis) {
    await api.create(siteName);
    api.keyToId.L0 = (api.items()[0] || {}).id;
    for (const op of START_PAGES) {
      const r = await api.apply(op);
      if (r.status !== 200 || !api.keyToId[op.key])
        throw new Error(
          `${api.name} could not make starting page ${op.key}: ${r.status} ${r.detail || ""}`,
        );
    }
    legs.push(new FuzzLeg(api, path.join(cfg.work, "fuzz-start-" + api.name)));
  }
  // the legs have to agree before anything is generated; what they already
  // disagree on is reported once as the baseline and not again per request
  const baseline = [];
  const states = await Promise.all(legs.map((l) => l.state()));
  for (let i = 1; i < legs.length; i++)
    for (const d of compareSnapshots(states[0], states[i]))
      baseline.push(Object.assign({ leg: legs[i].name }, d));

  const pools = {
    refs: START_KEYS.map((k) => "@" + k).concat([
      "unit-one",
      "unit-one/lesson-one",
    ]),
    content: CONTENT,
    titles: TITLES,
    slugs: SLUGS,
    descriptions: DESCRIPTIONS,
    tags: TAGS,
    themes: THEMES,
  };
  const maxSteps = parseInt(cfg["fuzz-steps"], 10) || 3;
  const arbitrary = sequenceArbitrary(fc, spec, operations, {
    pools,
    fixed: { site: { name: siteName } },
    maxSteps,
  });
  log(
    `[fuzz] ${operations.length} operations from ${path.basename(specFile(cfg))}, seed ${params.seed === undefined ? "random" : params.seed}, ${params.numRuns} runs${params.path ? ", replaying path " + params.path : ""}`,
  );
  const t0 = Date.now();
  const result = await checkParity({
    fc,
    legs,
    arbitrary,
    params,
    maxFindings: parseInt(cfg["fuzz-findings"], 10) || 10,
    skip: csv(cfg["fuzz-skip"]),
    command: replayBase(cfg, maxSteps),
    log: (line) => log("[fuzz] " + line),
  });
  result.seconds = Math.round((Date.now() - t0) / 1000);
  result.operations = operations.map((o) => o.operationId);
  result.excluded = EXCLUDED_OPERATIONS;
  result.baseline = baseline;
  result.siteName = siteName;
  result.maxSteps = maxSteps;
  result.replayPath = params.path || "";
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(result, null, 2),
  );
  const markdown = fuzzMarkdown(result);
  log(
    `[fuzz] DONE seed ${result.seed}, ${result.checks} sequences in ${result.seconds}s, ${result.findings.length} finding(s)`,
  );
  for (const f of result.findings) log("[fuzz] replay: " + f.replay);
  return {
    markdown,
    failed: result.findings.length,
    result,
  };
}

// a value inside a fenced block: a line that would close the fence is moved
function fenced(value) {
  return "~~~text\n" + String(value).replace(/^~~~/gm, " ~~~") + "\n~~~";
}
function short(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text === undefined
    ? "undefined"
    : text.length > 300
      ? text.slice(0, 300) + "..."
      : text;
}

function fuzzMarkdown(result) {
  const lines = [];
  lines.push("## HAXcms parity: generated inputs");
  lines.push("");
  lines.push(
    `Requests generated from the site OpenAPI spec with fast-check, sent to haxcms-nodejs (the reference) and haxcms-php, responses and the sites on disk diffed. Seed \`${result.seed}\`, ${result.runs} runs per round, up to ${result.maxSteps} requests per run, ${result.checks} sequences run in ${result.seconds}s, ${result.operations.length} operations.`,
  );
  lines.push("");
  if (result.baseline.length) {
    lines.push(
      `**The legs differ before any generated request** (${result.baseline.length} difference(s) in the starting site); findings below include them.`,
    );
    lines.push("");
    lines.push(
      fenced(
        result.baseline
          .slice(0, 10)
          .map(
            (d) => `${d.leg} ${d.path}: ${short(d.ref)} != ${short(d.other)}`,
          )
          .join("\n"),
      ),
    );
    lines.push("");
  }
  if (!result.findings.length) {
    lines.push("**No divergence found.**");
  } else {
    lines.push(
      `**${result.findings.length} finding(s)**${result.findings.length >= result.maxFindings && !result.replayPath ? ` (the hunt stops at ${result.maxFindings})` : ""}. Each is the smallest sequence fast-check could shrink it to. A finding becomes a plain regression test in both backends once it is fixed.`,
    );
    result.findings.forEach((f, i) => {
      lines.push("");
      lines.push(
        `### ${i + 1}. \`${String(f.request.operationId).replace(/[^\w .-]/g, "_")}\`, step ${f.step + 1} of ${f.sequence.length}${f.confirmed ? "" : " (not confirmed on replay)"}`,
      );
      lines.push("");
      lines.push("Replay:");
      lines.push("");
      lines.push(fenced(f.replay));
      lines.push("");
      lines.push("Requests (`@L1` is that page's id on each leg):");
      lines.push("");
      lines.push(
        fenced(
          f.sequence
            .map(
              (r) =>
                `${r.method} ${toUrlPath(r)}${r.body === undefined ? "" : "\n" + JSON.stringify(r.body)}`,
            )
            .join("\n"),
        ),
      );
      lines.push("");
      if (f.flaky) {
        lines.push("It failed during the hunt and passed when replayed:");
        lines.push("");
        lines.push(fenced(f.flaky));
      } else {
        lines.push("Differences (nodejs != other leg):");
        lines.push("");
        lines.push(
          fenced(
            f.diffs
              .slice(0, 12)
              .map(
                (d) =>
                  `${d.leg} ${d.kind}${d.path ? " " + d.path : ""}: ${short(d.ref)} != ${short(d.other)}`,
              )
              .join("\n") +
              (f.diffs.length > 12 ? `\n... ${f.diffs.length - 12} more` : ""),
          ),
        );
      }
    });
  }
  lines.push("");
  lines.push(
    "<details><summary>Operations left out</summary>\n\n" +
      Object.entries(result.excluded)
        .map(([id, why]) => `- \`${id}\`: ${why}`)
        .join("\n") +
      "\n\n</details>",
  );
  return lines.join("\n") + "\n";
}

module.exports = {
  FUZZ_DEFAULT_SEED,
  FUZZ_DEFAULT_RUNS,
  EXCLUDED_OPERATIONS,
  ParityMismatch,
  PINNED_TIME,
  deepDiff,
  normalizeValue,
  firstTextDifference,
  diffResponses,
  signatureOf,
  executeSequence,
  sequenceArbitrary,
  checkParity,
  replayCommand,
  fuzzOperations,
  fuzzMarkdown,
  runFuzz,
};
