# Security Audit Playbook — @haxtheweb/create

Entry point for recurring security audits of this repo. `create` is one of five HAX repos audited on a regular cycle (`create`, `haxcms-nodejs`, `webcomponents`, `haxcms-php`, `HAXiam`) — see the project-specific rule in the PRAW rule registry (`haxtheweb/praw` `RULES.md`).

## Read order (do this first)

1. `CONTEXT.md` — module map, test seams (A: pure functions, B: fs fixtures, C: CLI smoke), domain vocabulary
2. `docs/security-findings-key.md` — what each `Security (H-x/M-x/L-x/R2-x)` ID in the inline `src/` comments refers to, one line per finding (the full reports are gitignored working files, see Reporting convention)
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
- `test/unit/site-security.test.cjs` — SSRF / sanitization / path-traversal helpers
- Seam A unit tests over the `src/lib/utils.js` validators

A security fix without a matching test here is incomplete.

## Reporting convention

- `security_best_practices_report.md` (undated) is the auditor's working report for the current round; it and the dated archives `security_best_practices_report_YYYY-MM-DD.md` are gitignored and never committed
- Cite findings as `file:line`; mark fixes with inline `Security (H-x/M-x/L-x/R2-x)` comments referencing the finding ID
- Every ID used in a `src/` comment gets a one-line entry in `docs/security-findings-key.md` (the committed record), so the comments stay resolvable without the report
- Report vulnerabilities via `SECURITY.md` (private advisory), never public issues
