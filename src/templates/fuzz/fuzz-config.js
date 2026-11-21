// fast-check parameters for HAX property-based (fuzz) tests.
// Convention: https://github.com/haxtheweb/issues/issues/3272
//
//   HAX_FUZZ_SEED   an integer, or "random"; unset uses the test's own seed
//   HAX_FUZZ_RUNS   how many inputs to generate
//   HAX_FUZZ_PATH   replay one reported failure ("12:0:3")
//
// Tests run in a browser, which has no process.env: web-test-runner.config.mjs
// copies the HAX_FUZZ_* variables into the test page.
export function fuzzConfig(options) {
  const opts = options || {};
  const defaultSeed = opts.defaultSeed;
  const proc = globalThis.process;
  const env = opts.env || (proc && proc.env ? proc.env : {});
  if (!Number.isInteger(defaultSeed)) {
    throw new TypeError("fuzzConfig: defaultSeed must be an integer");
  }
  const read = (name) => {
    const value = env[name];
    return value === undefined || value === null || value === ""
      ? null
      : String(value);
  };
  const config = {
    numRuns: opts.defaultRuns === undefined ? 100 : opts.defaultRuns,
    seed: defaultSeed,
  };
  const runs = read("HAX_FUZZ_RUNS");
  if (runs !== null) {
    const numRuns = Number(runs);
    if (!Number.isInteger(numRuns) || numRuns < 1) {
      throw new RangeError(
        `HAX_FUZZ_RUNS must be a positive integer, got "${runs}"`,
      );
    }
    config.numRuns = numRuns;
  }
  const seed = read("HAX_FUZZ_SEED");
  if (seed !== null) {
    if (seed === "random") {
      delete config.seed;
    } else {
      const parsed = Number(seed);
      if (!Number.isInteger(parsed)) {
        throw new RangeError(
          `HAX_FUZZ_SEED must be an integer or "random", got "${seed}"`,
        );
      }
      config.seed = parsed;
    }
  }
  const replay = read("HAX_FUZZ_PATH");
  if (replay !== null) {
    if (!/^\d+(:\d+)*$/.test(replay)) {
      throw new RangeError(
        `HAX_FUZZ_PATH must look like "12:0:3", got "${replay}"`,
      );
    }
    config.path = replay;
  }
  return config;
}
