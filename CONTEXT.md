# CONTEXT.md — @haxtheweb/create

Reference for AI coding agents and contributors working in this repository.
Read this before writing tests or touching source so vocabulary and seams match.

## Project

`@haxtheweb/create` is the HAX CLI (`hax` binary). It scaffolds web components, HAXsites, manages skills, runs DDD audits, and coordinates the HAX ecosystem. Pure JavaScript (LitElement for web components, but the CLI itself is vanilla Node.js + commander + @clack/prompts). No TypeScript. Babel-compiled ESM → CJS for distribution.

## Module map

```
src/
├── create.js                      — CLI entrypoint; commander wiring, option validation, command dispatch
├── lib/
│   ├── utils.js                   — pure helpers + security validators (validateNpmClient, rejectShellMetacharacters, validateDomain, validateWebcomponentName, dashToCamel, camelToDash, generateUUID, getTimeDifference, findAvailablePort, readAllFiles, writeConfigFile, readConfigFile, interactiveExec)
│   ├── site-security.js           — extracted security helpers (isSSRFError, sanitizeIfString, resolveLocalPath); importable without loading full site.js
│   ├── logging.js                 — winston-based logger (log, commandString)
│   ├── statements.js              — @clack visual statements (haxIntro, communityStatement, merlinSays)
│   ├── art.js                     — ASCII art characters for intro animation
│   ├── wc-registry.json           — built registry of published HAX web components (used for name collision checks)
│   └── programs/
│       ├── site.js                — HAXsite operations (create, serve, import, publish, node ops, skeletons, search, export) — 3500+ LOC, largest module
│       ├── webcomponent.js        — web component scaffolding (new element, status, haxProperties generation, rename)
│       ├── audit.js               — DDD design system compliance auditor (CSS property → DDD token suggestions)
│       ├── skills.js              — bundled agent skills list/install
│       └── party.js               — community onboarding (clone repos, open links)
└── templates/                     — EJS templates for scaffolded projects
    ├── webcomponent/{minimal,compliant,monorepo,training}/
    ├── generic/
    ├── sitetheme/
    └── sitedotfiles/
```

## Test seams

Tests verify behavior through public interfaces, not internals. Seams are pre-agreed boundaries where testing effort lands.

### Seam A — pure functions (unit, no I/O)
**Location:** `src/lib/utils.js`, `src/lib/site-security.js`, pure helpers in `programs/*`.
**Tests:** `test/unit/utils.test.cjs`, `test/unit/site-security.test.cjs`, `test/unit/audit-helpers.test.cjs`, `test/unit/webcomponent-helpers.test.cjs`, `test/unit/skills-helpers.test.cjs`.
**How:** `require()` src via `@babel/register`; expected values from known-good literals / worked examples / DDD token spec. No mocking.

### Seam B — fs-walking functions (unit, real I/O against temp fixtures)
**Location:** `dddignoreInterpreter` (audit.js), `cleanupSiteForPublish`/`fixLegacyIgnoreFile`/`prepareSiteForStaticPublish`/`restoreSiteAfterStaticPublish` (site.js), `copySkillDir`/`listBundledSkills`/`installSkills` (skills.js), skeleton helpers (site.js).
**Tests:** `test/unit/audit-dddignore.test.cjs`, `test/unit/site-fs.test.cjs`, `test/unit/site-skeleton.test.cjs`.
**How:** build fixture trees in `os.tmpdir()`, assert fs results. Gated by `test/_helpers/site-canary.cjs` (skip-not-error when haxcms-nodejs dep is missing).

### Seam C — CLI public interface (subprocess smoke)
**Location:** `dist/create.js` (the built CLI).
**Tests:** `test/smoke/cli.smoke.test.cjs`.
**How:** `spawnSync(process.execPath, [CLI, ...args])` with isolated `HOME`; assert exit code + stdout shape. Gated by a load canary (skip if dist not built or CLI can't load).

### Deferred — *CommandDetected / *Process orchestration (Tier 3)
`process.exit()` inline + `@clack/prompts` blocking on stdin + `exec()` to network. Cover via Seam C subprocess after haxcms-nodejs publish, not unit DI.

## Test conventions

- **Runner:** `node:test` (built-in, matches haxcms-nodejs). No mocha/jest/vitest.
- **File format:** `.cjs` (CommonJS) so tests can `require()` transpiled ESM src.
- **Transpilation:** `require('@babel/register')` at the top of each test file (or in `test/_helpers/module-canary.cjs`). Tests import src directly — no build step needed for unit tests.
- **Canary gating:** Tests whose module transitively imports `@haxtheweb/haxcms-nodejs/dist/lib/*` gate each `test()` on `{ skip: skipReason }` from `test/_helpers/module-canary.cjs`. This makes the suite CI-safe: when the published haxcms-nodejs lacks dist files the local dev checkout has, affected tests SKIP with a clear reason and auto-activate once the dep is aligned/linked.
- **Isolated HOME:** Tests that trigger HAXCMS init or config writes set `process.env.HOME` to a temp dir before requiring the module, so the real `~/.haxtheweb` is never touched.
- **Expected values:** from known-good literals, worked examples, or the DDD token spec — never recomputed the way the code does (avoids tautological tests).
- **No optional chaining (`?.`):** the toolchain has issues with it; use explicit guards instead.

## Dependency note

`create` imports `@haxtheweb/haxcms-nodejs/dist/lib/{HAXCMS,allRoutes,safeFetch,sanitizeContent,JSONOutlineSchema}.js`. The **published** npm package may lag the local dev checkout. For local development: `npm link @haxtheweb/haxcms-nodejs` (from the local checkout) to get the latest dist. CI installs from the registry, so haxcms-dependent tests skip there until the published package catches up.

## Domain vocabulary

- **commandRun** — the CLI state object `{ command, arguments: {action}, options: {...} }` passed to every `*CommandDetected` handler.
- **haxProperties** — HAXSchema JSON that defines how a web component integrates with the HAX editor (`api`, `gizmo`, `settings.configure`, `settings.advanced`, `demoSchema`, `saveOptions`, `documentation`).
- **DDD tokens** — CSS custom properties in the DDD design system (`--ddd-theme-default-*`, `--ddd-font-*`, `--ddd-spacing-*`, `--ddd-radius-*`, `--ddd-border-*`, etc.). The audit command maps raw CSS values to these tokens.
- **wc-registry.json** — built registry of every valid HAX web component on the CDN; used by `validateWebcomponentName` for collision checking.
- **skeleton** — a reusable HAXsite template (JSON with `meta`, `site`, `build.items`, `build.files`); installed via `site:skeleton-install` or loaded via `--skeleton-file`.
- **npmClient** — the package manager (`npm`, `yarn`, `pnpm`); validated against an allowlist before interpolation into `exec()` shell strings (security: command injection prevention).
