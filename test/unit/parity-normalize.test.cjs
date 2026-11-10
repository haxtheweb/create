// test/parity: the accepted-difference list stays narrow (only the listed
// paths and values are normalized) and the summary output is safe to render.
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyAccepted, HTML_REPAIRS } = require("../parity/normalize.cjs");
const { compareSnapshots } = require("../parity/snapshot.cjs");
const { cell } = require("../parity/summary.cjs");
const { loadConfig } = require("../parity/config.cjs");

function snap(location, page) {
  return {
    manifest: { location, items: { L0: { id: "L0", title: "Welcome" } } },
    sequence: ["L0"],
    pages: { L0: page },
  };
}

test("site.json.location: /_sites and /sites normalize to the same value", () => {
  const a = snap("/_sites/demo/index.html", "<p>x</p>");
  const b = snap("/sites/demo/index.html", "<p>x</p>");
  assert.deepEqual(applyAccepted(a), ["site-location"]);
  assert.deepEqual(applyAccepted(b), ["site-location"]);
  assert.deepEqual(compareSnapshots(a, b), []);
});

test("site.json.location: other differences stay strict", () => {
  const a = snap("/_sites/demo/index.html", "<p>x</p>");
  const b = snap("/_sites/other/index.html", "<p>x</p>");
  const c = snap("/elsewhere/demo/index.html", "<p>x</p>");
  applyAccepted(a);
  applyAccepted(b);
  applyAccepted(c);
  assert.equal(compareSnapshots(a, b).length, 1);
  assert.equal(c.manifest.location, "/elsewhere/demo/index.html");
  // absent vs null is not a deployment path difference
  const d = snap(null, "<p>x</p>");
  const e = snap(undefined, "<p>x</p>");
  delete e.manifest.location;
  assert.deepEqual(applyAccepted(d), []);
  assert.deepEqual(applyAccepted(e), []);
  assert.equal(compareSnapshots(d, e).length, 1);
});

test("html-repair: every listed parser rendition compares equal", () => {
  const forms = HTML_REPAIRS[0].renditions;
  const base = snap("/_sites/demo/index.html", "<h2>t</h2>" + forms[0]);
  applyAccepted(base);
  for (const form of forms) {
    const other = snap("/sites/demo/index.html", "<h2>t</h2>" + form);
    assert.ok(applyAccepted(other).includes("html-repair"));
    assert.deepEqual(compareSnapshots(base, other), [], form);
  }
});

test("html-repair: an unlisted rendition or other content stays strict", () => {
  const forms = HTML_REPAIRS[0].renditions;
  const a = snap("/_sites/demo/index.html", forms[1]);
  const b = snap(
    "/_sites/demo/index.html",
    "<div><p>Unclosed paragraph</p></div><div>bad nesting</div>",
  );
  const c = snap("/_sites/demo/index.html", forms[1] + "<p>extra</p>");
  applyAccepted(a);
  applyAccepted(b);
  applyAccepted(c);
  assert.equal(compareSnapshots(a, b).length, 1);
  assert.equal(compareSnapshots(a, c).length, 1);
});

test("summary cells are escaped for markdown tables and HTML", () => {
  const out = cell('<script>alert("x")</script> | `tick`\nnext');
  assert.ok(!out.includes("<script>"));
  assert.ok(!out.slice(6, -7).includes("|"));
  assert.ok(!out.includes("\n"));
  assert.match(out, /^<code>.*<\/code>$/);
});

test("config: flags beat env vars, env vars beat defaults", () => {
  const env = { HAX_PARITY_OPS: "25", HAX_PARITY_SEQ: "b" };
  let cfg = loadConfig([], env);
  assert.equal(cfg.ops, 25);
  assert.deepEqual(cfg.seq, ["B"]);
  cfg = loadConfig(["--ops", "7", "--seq=A,B"], env);
  assert.equal(cfg.ops, 7);
  assert.deepEqual(cfg.seq, ["A", "B"]);
  assert.throws(() => loadConfig(["--ops", "lots"], {}));
  assert.throws(() => loadConfig(["--seq", "C"], {}));
});
