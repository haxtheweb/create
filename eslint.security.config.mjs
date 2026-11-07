// Security-only ESLint gate: the two selectors from eslint.config.mjs that CI
// must never let through (shell-string exec() interpolation, and optional
// chaining, which the publish toolchain mis-compiles), run as a blocking step
// (`npm run lint:security`) while the full `npm run lint` stays advisory. The
// selectors are imported from the base config so the two can't drift.
import globals from "globals";
import nodePlugin from "eslint-plugin-n";
import baseConfig, {
  noInterpolatedExec,
  noOptionalChaining,
} from "./eslint.config.mjs";

// reuse the base ignore list so build output / templates / tests are skipped
const ignores = baseConfig.find((c) => c.ignores && !c.files).ignores;

export default [
  { ignores },
  // the source carries `eslint-disable` comments for rules only the full
  // config enables; they are not "unused" here, they are out of scope
  {
    linterOptions: { reportUnusedDisableDirectives: "off" },
    // registered (with no rules enabled) so the source's inline
    // `eslint-disable-next-line n/...` comments resolve instead of erroring
    plugins: { n: nodePlugin },
  },
  {
    // same file scope as the base config's CLI-source block
    files: ["src/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-restricted-syntax": ["error", noInterpolatedExec, noOptionalChaining],
    },
  },
];
