// test/parity: the generated-input parity run (haxtheweb/issues#3386).
// The engine is run here against two in-process legs, so every pull request
// proves that it passes when the legs agree, catches a difference seeded
// into one of them, shrinks it, and replays it from the reported
// { seed, path }. The run against the real backends is nightly
// (.github/workflows/parity-nightly.yml).
//
// Seed and run count follow the HAX fuzz convention
// (test/_helpers/fuzz-config.cjs): a fixed seed here, HAX_FUZZ_SEED /
// HAX_FUZZ_RUNS / HAX_FUZZ_PATH to hunt or replay.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const fc = require("fast-check");
const { fuzzConfig } = require("../_helpers/fuzz-config.cjs");
const {
  listOperations,
  loadSpec,
  requestArbitrary,
  resolveRef,
  schemaArbitrary,
  defaultHints,
  toUrlPath,
  applyViolation,
} = require("../parity/openapi-arb.cjs");
const {
  checkParity,
  sequenceArbitrary,
  normalizeValue,
  diffResponses,
  signatureOf,
  replayCommand,
  fuzzOperations,
  fuzzMarkdown,
  EXCLUDED_OPERATIONS,
  PINNED_TIME,
} = require("../parity/fuzz.cjs");
const { loadConfig } = require("../parity/config.cjs");

const PARAMS = fuzzConfig({ defaultSeed: 3386, defaultRuns: 200 });

// a small spec with the shapes the site spec uses
const SPEC = {
  openapi: "3.0.3",
  paths: {
    "/x/api/v1/pages": {
      get: {
        operationId: "listPages",
        parameters: [
          { $ref: "#/components/parameters/Limit" },
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { 200: { description: "ok" } },
      },
    },
    "/x/api/v1/pages/{idOrSlug}": {
      parameters: [{ $ref: "#/components/parameters/IdOrSlug" }],
      patch: {
        operationId: "updatePage",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PageUpdate" },
            },
          },
        },
        responses: { 200: { description: "ok" } },
      },
    },
    "/x/api/v1/files": {
      post: {
        operationId: "upload",
        requestBody: { content: { "multipart/form-data": { schema: {} } } },
        responses: { 200: { description: "ok" } },
      },
    },
  },
  components: {
    parameters: {
      IdOrSlug: {
        name: "idOrSlug",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      Limit: {
        name: "page.limit",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 9 },
      },
    },
    schemas: {
      SiteReference: {
        type: "object",
        properties: { name: { type: "string" } },
      },
      PageUpdate: {
        type: "object",
        required: ["operation"],
        properties: {
          site: { $ref: "#/components/schemas/SiteReference" },
          operation: { type: "string", enum: ["setTitle", "setLocked"] },
          title: { type: "string", maxLength: 40 },
          locked: { type: "boolean" },
          tags: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
          },
          parent: { type: "string", nullable: true },
        },
      },
    },
  },
};
const OPTS = {
  pools: { refs: ["@L0", "@L1"], titles: ["  Padded title  ", "Plain"] },
  fixed: { site: { name: "demo" } },
};

test("listOperations reads parameters, $refs and JSON bodies from the spec", () => {
  const ops = listOperations(SPEC);
  assert.deepEqual(
    ops.map((o) => `${o.method} ${o.operationId}`),
    ["GET listPages", "PATCH updatePage", "POST upload"],
  );
  const update = ops[1];
  assert.deepEqual(update.params, [
    {
      name: "idOrSlug",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
  ]);
  assert.equal(update.body, SPEC.components.schemas.PageUpdate);
  assert.equal(ops[2].nonJsonBody, true);
  assert.equal(ops[0].params.find((p) => p.name === "q").required, true);
  assert.throws(() => resolveRef(SPEC, { $ref: "#/components/schemas/Nope" }));
  assert.throws(() => resolveRef(SPEC, { $ref: "https://example.com/x" }));
});

test("generated requests are what the spec allows", () => {
  const update = listOperations(SPEC)[1];
  // no out-of-spec change, so every body has to fit the schema
  const arb = requestArbitrary(fc, SPEC, update, {
    ...OPTS,
    violations: 0,
  });
  fc.assert(
    fc.property(arb, (r) => {
      assert.equal(r.method, "PATCH");
      assert.equal(typeof r.pathParams.idOrSlug, "string");
      assert.deepEqual(r.body.site, { name: "demo" });
      assert.ok(["setTitle", "setLocked"].includes(r.body.operation));
      if ("title" in r.body) {
        assert.equal(typeof r.body.title, "string");
        assert.ok(r.body.title.length <= 40);
      }
      if ("locked" in r.body) assert.equal(typeof r.body.locked, "boolean");
      if ("tags" in r.body)
        assert.ok(
          typeof r.body.tags === "string" ||
            (Array.isArray(r.body.tags) &&
              r.body.tags.every((t) => typeof t === "string")),
        );
      if ("parent" in r.body)
        assert.ok(r.body.parent === null || typeof r.body.parent === "string");
      for (const key of Object.keys(r.body))
        assert.ok(key in SPEC.components.schemas.PageUpdate.properties);
    }),
    PARAMS,
  );
  const list = requestArbitrary(fc, SPEC, listOperations(SPEC)[0], OPTS);
  fc.assert(
    fc.property(list, (r) => {
      assert.equal(r.body, undefined);
      assert.equal(typeof r.query.q, "string");
      if ("page.limit" in r.query)
        assert.ok(r.query["page.limit"] >= 1 && r.query["page.limit"] <= 9);
    }),
    PARAMS,
  );
});

test("the string hints reach the fields they are for", () => {
  const update = listOperations(SPEC)[1];
  const sample = fc.sample(requestArbitrary(fc, SPEC, update, OPTS), {
    seed: 3386,
    numRuns: 300,
  });
  assert.ok(sample.some((r) => r.pathParams.idOrSlug === "@L1"));
  assert.ok(sample.some((r) => r.body && r.body.title === "  Padded title  "));
  // and arbitrary strings still get through
  assert.ok(sample.some((r) => !/^@L\d$/.test(r.pathParams.idOrSlug)));
  assert.equal(defaultHints().length > 0, true);
  const anything = schemaArbitrary(fc, SPEC, {}, "x", { hints: [], fixed: {} });
  assert.equal(fc.sample(anything, { seed: 1, numRuns: 5 }).length, 5);
});

test("an out-of-spec change never touches the fixed site reference", () => {
  const body = { site: { name: "demo" }, operation: "setTitle", title: "x" };
  fc.assert(
    fc.property(
      fc.record({
        kind: fc.constantFrom("drop", "replace"),
        index: fc.nat(),
        value: fc.jsonValue(),
      }),
      (violation) => {
        const out = applyViolation(body, violation, OPTS.fixed);
        assert.deepEqual(out.site, { name: "demo" });
        assert.notDeepEqual(out, {});
        // the input is not changed in place
        assert.deepEqual(body, {
          site: { name: "demo" },
          operation: "setTitle",
          title: "x",
        });
      },
    ),
    PARAMS,
  );
  assert.deepEqual(applyViolation(body, null, OPTS.fixed), body);
});

test("toUrlPath percent-encodes every generated value", () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (id, q) => {
      const url = toUrlPath({
        path: "/x/api/v1/pages/{idOrSlug}",
        pathParams: { idOrSlug: id },
        query: { q, skipped: undefined },
      });
      assert.ok(url.startsWith("/x/api/v1/pages/"));
      const [pathname, search] = url.split("?");
      // nothing a value holds can add a path segment, a query or a fragment
      assert.equal(pathname.split("/").length, 6);
      assert.ok(!/[#?\s]/.test(pathname));
      assert.equal(new URLSearchParams(search).get("q"), q);
      assert.equal(decodeURIComponent(pathname.split("/")[5]), id);
    }),
    PARAMS,
  );
});

test("normalizeValue: ids become keys, clock readings of the run go, the rest stays", () => {
  const now = 1795300000;
  const map = { "uuid-1": "L1", "http://127.0.0.1:9": "<base>" };
  const out = normalizeValue(
    {
      id: "uuid-1",
      "uuid-1": { created: now, updated: "x" },
      link: "http://127.0.0.1:9/x/uuid-1",
      modified: now + 1,
      iso: "at 2026-11-21T22:26:40Z.",
      pinned: PINNED_TIME,
      pinnedIso: "2026-01-01T00:00:00+00:00",
      n: 5,
    },
    map,
    [now - 5, now + 5],
  );
  assert.deepEqual(out, {
    id: "L1",
    L1: {},
    link: "<base>/x/L1",
    modified: "<now>",
    iso: "at <now>.",
    pinned: PINNED_TIME,
    pinnedIso: "2026-01-01T00:00:00+00:00",
    n: 5,
  });
  assert.equal(
    normalizeValue(`created: ${now}\nold: ${PINNED_TIME}`, {}, [now, now]),
    `created: <now>\nold: ${PINNED_TIME}`,
  );
});

test("diffResponses names status, JSON and text differences", () => {
  assert.deepEqual(
    diffResponses(
      { status: 200, json: { a: 1 } },
      { status: 200, json: { a: 1 } },
    ),
    [],
  );
  assert.deepEqual(
    diffResponses(
      { status: 200, json: { a: {}, b: 1 } },
      { status: 400, json: { a: [], c: 1 } },
    ).map((d) => d.kind + d.path),
    ["status", "body.a", "body.b", "body.c"],
  );
  const text = diffResponses(
    { status: 200, text: "a\nb\nc" },
    { status: 200, text: "a\nB\nc" },
  );
  assert.deepEqual(text, [
    { kind: "body", path: " line 2", ref: "b", other: "B" },
  ]);
});

test("a signature is one shell-safe word and groups list positions", () => {
  assert.equal(
    signatureOf("listItems", "php", "body", ".data.items.3.links.next"),
    "listItems:php:body.data.items[n].links.next",
  );
  assert.equal(
    signatureOf("getItem", "php", "body", " line 12"),
    "getItem:php:body.text",
  );
  fc.assert(
    fc.property(fc.string(), fc.string(), (op, where) => {
      assert.match(
        signatureOf(op, "php", "body", where),
        /^[A-Za-z0-9_.:\-[\]]*$/,
      );
    }),
    PARAMS,
  );
  assert.equal(
    replayCommand(7, "1:2", 50, ["a:php:status"], "node x --fuzz"),
    "HAX_FUZZ_SEED=7 HAX_FUZZ_PATH=1:2 HAX_FUZZ_RUNS=50 node x --fuzz --fuzz-skip a:php:status",
  );
});

// An in-process leg: two pages, a title that can be set, a list that can be
// read. `bug` seeds one difference: this leg keeps the white space around a
// title that the reference trims.
function makeLeg(name, bug) {
  let pages;
  const ids = { L0: name + "-0", L1: name + "-1" };
  const toKey = (v) => {
    const map = {};
    for (const [k, id] of Object.entries(ids)) map[id] = k;
    return normalizeValue(v, map);
  };
  return {
    name,
    sent: 0,
    async reset() {
      pages = { [ids.L0]: { title: "Home" }, [ids.L1]: { title: "Unit" } };
    },
    async send(request) {
      this.sent++;
      if (request.operationId === "listPages")
        return {
          status: 200,
          json: toKey({
            data: Object.keys(pages).map((id) => ({ id, ...pages[id] })),
          }),
        };
      if (request.operationId !== "updatePage")
        return { status: 404, json: {} };
      const ref = String(request.pathParams.idOrSlug);
      const id = /^@L\d+$/.test(ref) ? ids[ref.slice(1)] : ref;
      if (!Object.hasOwn(pages, id))
        return { status: 404, json: { status: 404 } };
      const body = request.body || {};
      if (body.operation !== "setTitle" || typeof body.title !== "string")
        return { status: 400, json: { status: 400 } };
      pages[id].title = bug === "no-trim" ? body.title : body.title.trim();
      return { status: 200, json: toKey({ data: { id, ...pages[id] } }) };
    },
    async state() {
      const items = {};
      for (const [k, id] of Object.entries(ids))
        items[k] = { ...pages[id], id: k };
      return { manifest: { items }, sequence: Object.keys(items), pages: {} };
    },
  };
}
const toyOperations = () =>
  listOperations(SPEC).filter((op) => !op.nonJsonBody);
const toyArbitrary = () => sequenceArbitrary(fc, SPEC, toyOperations(), OPTS);

test("checkParity: legs that agree pass", async () => {
  const legs = [makeLeg("nodejs"), makeLeg("php")];
  const result = await checkParity({
    fc,
    legs,
    arbitrary: toyArbitrary(),
    params: PARAMS,
  });
  assert.deepEqual(result.findings, []);
  assert.equal(result.checks, PARAMS.numRuns);
  assert.equal(result.seed, PARAMS.seed);
  // every generated request went to both legs
  assert.ok(legs[0].sent > 0);
  assert.equal(legs[0].sent, legs[1].sent);
});

test("checkParity: a seeded difference is caught, shrunk and replayed", async () => {
  const hunt = await checkParity({
    fc,
    legs: [makeLeg("nodejs"), makeLeg("php", "no-trim")],
    arbitrary: toyArbitrary(),
    params: PARAMS,
    command: "node test/parity/parity.cjs --fuzz",
  });
  assert.equal(hunt.findings.length, 1, "one difference, reported once");
  const found = hunt.findings[0];
  assert.equal(found.confirmed, true);
  assert.equal(found.request.operationId, "updatePage");
  assert.equal(found.request.body.operation, "setTitle");
  // shrunk to one request whose title only differs by white space
  assert.equal(found.sequence.length, 1);
  assert.notEqual(found.request.body.title, found.request.body.title.trim());
  assert.ok(found.signatures.includes("updatePage:php:body.data.title"));
  assert.ok(
    found.signatures.includes(
      "updatePage:php:disk.site.json.items._item_.title",
    ),
  );
  assert.equal(
    found.replay,
    `HAX_FUZZ_SEED=${found.seed} HAX_FUZZ_PATH=${found.path} HAX_FUZZ_RUNS=${PARAMS.numRuns} node test/parity/parity.cjs --fuzz`,
  );

  // the replay line's seed and path lead straight back to the same requests
  const replay = await checkParity({
    fc,
    legs: [makeLeg("nodejs"), makeLeg("php", "no-trim")],
    arbitrary: toyArbitrary(),
    params: { numRuns: PARAMS.numRuns, seed: found.seed, path: found.path },
  });
  assert.equal(replay.findings.length, 1);
  assert.deepEqual(replay.findings[0].sequence, found.sequence);
  assert.deepEqual(replay.findings[0].signatures, found.signatures);
  assert.equal(
    replay.checks,
    1,
    "a replay runs the counterexample, not a hunt",
  );

  // once the leg is fixed the same replay passes
  const fixed = await checkParity({
    fc,
    legs: [makeLeg("nodejs"), makeLeg("php")],
    arbitrary: toyArbitrary(),
    params: { numRuns: PARAMS.numRuns, seed: found.seed, path: found.path },
  });
  assert.deepEqual(fixed.findings, []);

  // and a hunt told to skip what was found reports nothing new
  const skipped = await checkParity({
    fc,
    legs: [makeLeg("nodejs"), makeLeg("php", "no-trim")],
    arbitrary: toyArbitrary(),
    params: PARAMS,
    skip: found.signatures,
  });
  assert.deepEqual(skipped.findings, []);

  // after a skipped difference the legs are in different states: a later
  // request that only shows that again is not a second finding
  const { executeSequence } = require("../parity/fuzz.cjs");
  const setTitle = {
    operationId: "updatePage",
    method: "PATCH",
    path: "/x/api/v1/pages/{idOrSlug}",
    pathParams: { idOrSlug: "@L0" },
    query: {},
    body: { operation: "setTitle", title: " x " },
  };
  const list = {
    operationId: "listPages",
    method: "GET",
    path: "/x/api/v1/pages",
    pathParams: {},
    query: { q: "" },
  };
  const pair = () => [makeLeg("nodejs"), makeLeg("php", "no-trim")];
  assert.equal(
    (await executeSequence(pair(), [setTitle, list], new Set())).step,
    0,
  );
  assert.equal(
    await executeSequence(pair(), [setTitle, list], new Set(found.signatures)),
    null,
  );

  const md = fuzzMarkdown({
    ...hunt,
    seconds: 1,
    operations: ["listPages", "updatePage"],
    excluded: EXCLUDED_OPERATIONS,
    baseline: [],
    maxSteps: 3,
    replayPath: "",
  });
  assert.match(md, /\*\*1 finding\(s\)\*\*/);
  assert.ok(md.includes(found.replay));
});

test("a leg that answers the same input two ways is reported as not confirmed", async () => {
  let calls = 0;
  const flaky = makeLeg("php");
  const send = flaky.send.bind(flaky);
  flaky.send = async (request) => {
    const r = await send(request);
    // differs once, on the first request it ever sees
    return calls++ === 0 ? { status: 500, json: {} } : r;
  };
  const result = await checkParity({
    fc,
    legs: [makeLeg("nodejs"), flaky],
    arbitrary: toyArbitrary(),
    params: PARAMS,
  });
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].confirmed, false);
  assert.match(result.findings[0].flaky, /parity mismatch/);
});

test("--fuzz and its settings are read from flags and the environment", () => {
  const cfg = loadConfig(["--fuzz", "--fuzz-ops", "updateItem,listItems"], {});
  assert.equal(cfg.fuzz, true);
  assert.equal(cfg["fuzz-ops"], "updateItem,listItems");
  assert.equal(cfg["fuzz-steps"], "3");
  assert.equal(loadConfig([], { HAX_PARITY_FUZZ: "1" }).fuzz, true);
  assert.equal(loadConfig([], {}).fuzz, false);
});

// The spec the installed haxcms-nodejs ships (the npm release in pull request
// CI, which can be older than the main branch the nightly runs against):
// every operation the run would fuzz has to turn into an arbitrary that
// generates.
test("every fuzzed operation of the shipped site spec generates requests", (t) => {
  let specFile;
  try {
    specFile = path.join(
      path.dirname(require.resolve("@haxtheweb/haxcms-nodejs/package.json")),
      "dist",
      "openapi",
      "site-spec.yaml",
    );
  } catch (e) {
    specFile = "";
  }
  if (!specFile || !fs.existsSync(specFile)) {
    t.skip("no haxcms-nodejs site spec installed");
    return;
  }
  const spec = loadSpec(specFile);
  const operations = fuzzOperations(spec);
  assert.ok(operations.length > 20, "most of the site API is fuzzed");
  for (const id of Object.keys(EXCLUDED_OPERATIONS))
    assert.ok(!operations.some((op) => op.operationId === id));
  for (const op of operations) {
    const sample = fc.sample(requestArbitrary(fc, spec, op, OPTS), {
      seed: PARAMS.seed === undefined ? 3386 : PARAMS.seed,
      numRuns: 5,
    });
    for (const r of sample) {
      assert.equal(r.operationId, op.operationId);
      assert.ok(toUrlPath(r).startsWith("/"));
      // a request has to survive being written down in a report
      JSON.stringify(r);
    }
  }
  assert.ok(fuzzOperations(spec, ["updateItem"]).length === 1);
});
