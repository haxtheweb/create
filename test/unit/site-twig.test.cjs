"use strict";

// Managed files (service-worker.js) are rendered by haxcms-nodejs, whose
// Twig templates call PHP's constant(). haxcms-nodejs registers that
// function when it loads; the CLI relies on it rather than registering its
// own. The function resolves the static allowlist of PHP JSON_* constants
// and nothing else: no environment variables, no globals. HOME is isolated
// before the canary because site.js imports HAXCMS, which inits a
// configDirectory on load.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "hax-site-twig-"));
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;

require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");

const { available, skipReason } = require("../_helpers/site-canary.cjs");
const Twig = require("twig");

const opts = { skip: skipReason, timeout: 15000 };

function render(source) {
  return Twig.twig({ data: source }).render({});
}

test(
  "loading the site program leaves constant() resolving the PHP allowlist",
  opts,
  () => {
    assert.ok(available);
    const values = {
      JSON_PRETTY_PRINT: 128,
      JSON_HEX_TAG: 1,
      JSON_HEX_AMP: 2,
      JSON_HEX_APOS: 4,
      JSON_HEX_QUOT: 8,
      JSON_FORCE_OBJECT: 16,
      JSON_NUMERIC_CHECK: 32,
      JSON_UNESCAPED_SLASHES: 64,
      JSON_UNESCAPED_UNICODE: 256,
    };
    for (const [name, value] of Object.entries(values)) {
      assert.equal(render(`{{ constant('${name}') }}`), String(value), name);
    }
  },
);

test("constant() gives nothing for names off the allowlist", opts, () => {
  process.env.HAX_TWIG_SECRET_PROBE = "leaked";
  try {
    for (const name of [
      "PATH",
      "HOME",
      "HAX_TWIG_SECRET_PROBE",
      "process",
      "SOME_UNDEFINED_THING",
      "",
    ]) {
      assert.equal(render(`{{ constant('${name}') }}`), "", name);
    }
  } finally {
    delete process.env.HAX_TWIG_SECRET_PROBE;
  }
});
