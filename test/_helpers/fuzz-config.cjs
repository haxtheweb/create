// Shared fast-check parameters for HAX property-based (fuzz) tests.
// Convention: https://github.com/haxtheweb/issues/issues/3272
//
//   npm test           fixed default seed: the same inputs on every run, so a
//                      red fuzz test means the change under test broke it
//   npm run test:fuzz  HAX_FUZZ_SEED=random and many more runs, to hunt for
//                      new bugs; a failure prints { seed, path } and the
//                      shrunk counterexample
//   HAX_FUZZ_SEED=<seed> HAX_FUZZ_PATH=<path> npm run test:unit
//                      replays exactly that failure
//
// When a hunt finds something, fix it and pin the counterexample (fast-check
// `examples`, or a plain example-based test) so the default run guards it.
//
// This file is copied, not published, across HAX repos; keep the copies in
// step when changing it.
"use strict";

function readEnv(name, aliases) {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      return { key, value };
    }
  }
  return null;
}

/**
 * Build fast-check assert parameters from HAX_FUZZ_* environment variables.
 *
 * @param {object} options
 * @param {number} options.defaultSeed seed used when HAX_FUZZ_SEED is unset
 * @param {number} [options.defaultRuns=300] runs when HAX_FUZZ_RUNS is unset
 * @param {string[]} [options.aliases=[]] legacy env prefixes, e.g. ["HAXCMS"]
 * @returns {{numRuns: number, seed?: number, path?: string}}
 */
function fuzzConfig({ defaultSeed, defaultRuns = 300, aliases = [] } = {}) {
  if (!Number.isInteger(defaultSeed)) {
    throw new TypeError("fuzzConfig: defaultSeed must be an integer");
  }
  const alias = (suffix) => aliases.map((prefix) => `${prefix}_FUZZ_${suffix}`);

  const config = { numRuns: defaultRuns, seed: defaultSeed };

  const runs = readEnv("HAX_FUZZ_RUNS", alias("RUNS"));
  if (runs) {
    const numRuns = Number(runs.value);
    if (!Number.isInteger(numRuns) || numRuns < 1) {
      throw new RangeError(
        `${runs.key} must be a positive integer, got "${runs.value}"`,
      );
    }
    config.numRuns = numRuns;
  }

  const seed = readEnv("HAX_FUZZ_SEED", alias("SEED"));
  if (seed) {
    if (seed.value === "random") {
      delete config.seed;
    } else {
      const parsed = Number(seed.value);
      if (!Number.isInteger(parsed)) {
        throw new RangeError(
          `${seed.key} must be an integer or "random", got "${seed.value}"`,
        );
      }
      config.seed = parsed;
    }
  }

  const path = readEnv("HAX_FUZZ_PATH", alias("PATH"));
  if (path) {
    if (!/^\d+(:\d+)*$/.test(path.value)) {
      throw new RangeError(
        `${path.key} must look like "12:0:3", got "${path.value}"`,
      );
    }
    config.path = path.value;
  }

  return config;
}

module.exports = { fuzzConfig };
