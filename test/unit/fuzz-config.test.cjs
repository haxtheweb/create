"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fuzzConfig } = require("../_helpers/fuzz-config.cjs");

const KEYS = [
  "HAX_FUZZ_SEED",
  "HAX_FUZZ_RUNS",
  "HAX_FUZZ_PATH",
  "LEGACY_FUZZ_SEED",
  "LEGACY_FUZZ_RUNS",
  "LEGACY_FUZZ_PATH",
];

function withEnv(values, fn) {
  const saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, values);
  try {
    return fn();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

test("defaults to the fixed seed and 300 runs", () => {
  withEnv({}, () => {
    assert.deepEqual(fuzzConfig({ defaultSeed: 42 }), {
      numRuns: 300,
      seed: 42,
    });
  });
});

test("HAX_FUZZ_SEED=random drops the seed so fast-check draws one", () => {
  withEnv({ HAX_FUZZ_SEED: "random", HAX_FUZZ_RUNS: "6000" }, () => {
    assert.deepEqual(fuzzConfig({ defaultSeed: 42 }), { numRuns: 6000 });
  });
});

test("seed and path replay a reported failure", () => {
  withEnv({ HAX_FUZZ_SEED: "-123", HAX_FUZZ_PATH: "4:0:2" }, () => {
    assert.deepEqual(fuzzConfig({ defaultSeed: 42 }), {
      numRuns: 300,
      seed: -123,
      path: "4:0:2",
    });
  });
});

test("legacy prefixes are honored, HAX_ wins over them", () => {
  withEnv({ LEGACY_FUZZ_SEED: "7", LEGACY_FUZZ_RUNS: "9" }, () => {
    assert.deepEqual(fuzzConfig({ defaultSeed: 42, aliases: ["LEGACY"] }), {
      numRuns: 9,
      seed: 7,
    });
  });
  withEnv({ LEGACY_FUZZ_SEED: "7", HAX_FUZZ_SEED: "8" }, () => {
    assert.equal(fuzzConfig({ defaultSeed: 42, aliases: ["LEGACY"] }).seed, 8);
  });
});

test("bad values fail loudly instead of silently changing the run", () => {
  withEnv({ HAX_FUZZ_SEED: "abc" }, () => {
    assert.throws(() => fuzzConfig({ defaultSeed: 42 }), RangeError);
  });
  withEnv({ HAX_FUZZ_RUNS: "0" }, () => {
    assert.throws(() => fuzzConfig({ defaultSeed: 42 }), RangeError);
  });
  withEnv({ HAX_FUZZ_PATH: "1;rm" }, () => {
    assert.throws(() => fuzzConfig({ defaultSeed: 42 }), RangeError);
  });
  assert.throws(() => fuzzConfig({}), TypeError);
});
