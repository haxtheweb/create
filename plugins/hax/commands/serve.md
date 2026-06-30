---
description: Launch a HAXsite in local development mode (hax serve).
argument-hint: "[path-to-site]  (defaults to the current directory)"
allowed-tools: Bash(hax:*), Bash(cd:*)
---

Start a HAXsite dev server with `hax serve` (serves at http://localhost).

User input: `$ARGUMENTS`

Guidance:
- Run from the root of a HAXsite. If the input names a site folder, `cd` into it first.
- `hax serve` is **long-running** — start it in the background so the session stays
  responsive, then report the local URL to the user.
- If the current directory is not a HAXsite, say so and offer to create one with `/hax:site`.
