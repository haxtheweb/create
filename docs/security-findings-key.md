# Security findings key

The inline `// Security (<ID>)` comments in `src/` mark where an audit finding
was fixed. The full audit reports (`security_best_practices_report*.md`) are
gitignored working files, so this in-repo key is what the IDs resolve to.
One line per ID; `H` = high, `M` = medium, `L` = low; the `R2-` prefix is the
second audit round. Keep this list in step with the comments
(`grep -rhoE "Security \([^)]+\)" src | sort -u`).

## Round 1

| ID  | Finding (what the comment marks as fixed)                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H-1 | SSRF on site import: remote `site.json` and each item location are fetched through haxcms-nodejs' `safeFetch`, not raw fetch.                                                                                                        |
| H-2 | SSRF on HTML/platform imports: the import source and scraped pages route through `safeFetch`.                                                                                                                                        |
| H-3 | SSRF via scraped image URLs: every image URL is validated inside the download helper.                                                                                                                                                |
| H-5 | Stored XSS from imports: remote / scraped HTML is sanitized (`sanitizeIfString`) before it is written into page files.                                                                                                               |
| M-1 | Shell injection through CLI options interpolated into `exec()` strings: `rejectShellMetacharacters` at the option boundary, `validateDomain` for publish targets (incl. the on-disk surge `CNAME`), `--root` checked before `chdir`. |
| M-2 | `--npm-client` interpolated into shell strings: strict allowlist (`npm`, `yarn`, `pnpm`) via `validateNpmClient`, re-checked at the point of use.                                                                                    |
| M-3 | Twig `constant()` exposed `process.env` / globals to templates: resolved from a static allowlist only.                                                                                                                               |
| M-4 | `HAXCMS_DISABLE_JWT_CHECKS` dev server reachable from the network: scoped to local launches and pinned to loopback (see R2-H-1).                                                                                                     |
| L-1 | Path traversal / null bytes in local import paths: `resolveLocalPath` canonicalizes and rejects `\0`.                                                                                                                                |
| L-5 | Invalid `--root` crashed with a `process.chdir` exception: validated up front (fixed together with M-1).                                                                                                                             |

## Round 2 (`R2-`)

| ID     | Finding (what the comment marks as fixed)                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2-H-1 | No-login local HAXcms server (`HAXCMS_DISABLE_JWT_CHECKS`) must only listen on loopback: `HAXCMS_HOST=127.0.0.1` is set on every spawn unless the user set it explicitly.                                                 |
| R2-H-2 | Site / element / theme names reach file paths, generated JS and child-process `cwd`: `hasNameSpecialCharacters` on both the prompt and the non-interactive path; no shell strings around names or paths.                  |
| R2-M-1 | Argument injection (a value starting with `-` read as an option by rsync / git / publish CLIs): `rejectLeadingDash`, `--` before rsync paths, `--site=<v>` / `--name=<v>` forms, `validateDomain` rejects a leading dash. |
| R2-M-2 | Theme / element names become file paths and import lines: same strict slug rule (`hasNameSpecialCharacters`) wherever a name is accepted.                                                                                 |
| R2-L-1 | `exec("cd ${dir} && ...")` style shell strings: replaced with `runCommand(cmd, [args], { cwd })` (no shell).                                                                                                              |
| R2-L-2 | GitHub owner / repo / `--author` interpolated into clone and fork targets: `isValidGithubOwner` / `isValidGithubRepo` and an explicit validated author.                                                                   |
| R2-L-3 | rsync `--source` / `--destination` / `--exclude` and `--git-repo` values: metacharacter and leading-dash checks shared by the flag and the prompt.                                                                        |
| R2-L-4 | Publish CLIs (`surge`, `netlify`, `vercel`) installed globally without asking: confirmed first (or `--y`) and pinned to a major version.                                                                                  |

## Other markers

| ID       | Meaning                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stream-A | Removal of the deprecated `@haxtheweb/open-apis` cloud dependency: converters run in-process through haxcms-nodejs route handlers (`invokeRoute`). |
