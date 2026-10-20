import js from "@eslint/js";
import nodePlugin from "eslint-plugin-n";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

// Team convention: no `?.` optional chaining. The project's Babel/parser
// toolchain has had issues with this syntax; see AGENTS.md / hax audit.
const noOptionalChaining = {
  selector: "ChainExpression",
  message:
    "Optional chaining (`?.`) is banned in this codebase; use an explicit guard (e.g. `a && a.b`) instead.",
};

// Team convention: prefer `globalThis` over bare `window` so code behaves
// consistently outside browser-only contexts. `create` is a Node CLI with no
// legitimate DOM/browser context, so this is not scoped/excepted here.
const noWindowGlobal = {
  selector: "Identifier[name='window']",
  message: "Use `globalThis` instead of `window` for global-scope references.",
};

export default [
  {
    // build output and vendored/generated files are never linted.
    // src/templates/** mirrors babel.config.js's own `ignore` entry: those
    // files are EJS scaffolding (contain `<%= %>` placeholders) and are not
    // valid, lintable JavaScript on their own.
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "src/templates/**",
      // tests are not linted (they are exercised by `npm run test`).
      "test/**",
    ],
  },
  js.configs.recommended,
  nodePlugin.configs["flat/recommended-module"],
  {
    // Root-level build/tooling config files are CommonJS regardless of the
    // ESM source tree (they run under Node's default CJS resolution, loaded
    // directly by babel/other tools, not through package.json "type").
    files: ["babel.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // CLI source: ESM, Node runtime
    files: ["src/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-restricted-syntax": ["error", noOptionalChaining, noWindowGlobal],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      eqeqeq: "error",
      "no-var": "error",
      // This is a CLI tool, not a library: every subcommand is an entry
      // point that legitimately terminates the process with a specific
      // exit code on success/failure. Rewriting ~40 call sites to throw
      // instead would require a top-level handler to translate thrown
      // errors back into exit codes, which is a larger behavioral change
      // than this lint-adoption pass intends to make.
      "n/no-process-exit": "off",
      // The plugin's hashbang check assumes the file's on-disk location
      // matches its published bin-entry location. These sources are
      // babel-copied from src/ to dist/ at build time (see package.json
      // "build" script), so the shebang is required in source but the
      // plugin can't resolve that mapping and flags it as superfluous.
      "n/hashbang": "off",
    },
  },
  eslintConfigPrettier,
];
