# Security Audit Playbook — @haxtheweb/create

Entry point for recurring security audits of this repo. `create` is one of five HAX repos audited on a regular cycle (`create`, `haxcms-nodejs`, `webcomponents`, `haxcms-php`, `HAXiam`) — see the project-specific rule in the PRAW rule registry (`haxtheweb/praw` `RULES.md`).

## Read order (do this first)

1. `CONTEXT.md` — module map, test seams (A: pure functions, B: fs fixtures, C: CLI smoke), domain vocabulary
2. `docs/security-invariants.md` — the rules this code keeps, one row per invariant with the helper that enforces it and the test that guards it; every inline `Security (<name>)` comment in `src/` names a row
3. `SECURITY.md` — disclosure policy (private advisory at `haxtheweb/issues`, never public issues)

## Scope

- `src/create.js` — option validation and dispatch; the `--npm-client` allowlist lives here
- `src/lib/utils.js` — `validateNpmClient`, `rejectShellMetacharacters`, `validateDomain`, `validateWebcomponentName`, `interactiveExec`
- `src/lib/site-security.js` — `isSSRFError`, `sanitizeIfString`, `resolveLocalPath` (path traversal / null bytes)
- `src/lib/programs/**` — `site.js` is the largest attack surface (import, publish, scraping, Twig `constant()` allowlist, skeletons); then `webcomponent.js`, `audit.js`, `skills.js`, `party.js`
- `src/templates/**` — ships into end users' projects; scaffolded CI workflows are downstream supply chain (SHA-pin actions, correct token input names)
- `.github/workflows/**` — this repo's own CI hygiene (SHA-pinned actions, least-privilege `permissions:`, CodeQL, Scorecard, SBOM)
- Production dependencies: `npm audit --omit=dev`

## Commands

```bash
npm test                                        # unit + smoke (node:test, .cjs via @babel/register)
npm audit --omit=dev --audit-level=low --json   # dependency posture
npm run precheck && npm run lint                # required gate before any commit
```

## Regression guards (must stay green)

- `test/unit/security-helpers-fuzz.test.js` — fuzzes the validators/sanitizers
  (fixed seed in `npm test`; `npm run test:fuzz` hunts on a random seed, and
  `HAX_FUZZ_SEED`/`HAX_FUZZ_PATH` replay a reported failure)
- `test/unit/site-security.test.cjs` — SSRF / sanitization / path-traversal helpers
- Seam A unit tests over the `src/lib/utils.js` validators

A security fix without a matching test here is incomplete.

## Reporting convention

- `security_best_practices_report.md` (undated) is the auditor's working report for the current round; it and the dated archives `security_best_practices_report_YYYY-MM-DD.md` are gitignored and never committed
- Cite findings as `file:line` in the working report only; the committed record is the rule, not the finding
- Mark the code that enforces a rule with an inline `Security (<invariant-name>)` comment; a fix that introduces a new class of rule adds a row to `docs/security-invariants.md` (rule, enforcing helper, guarding test) in the same PR
- Report vulnerabilities via `SECURITY.md` (private advisory), never public issues
