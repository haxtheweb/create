---
description: Audit HAX web components for DDD design-system compliance (hax audit).
argument-hint: "[path]  (defaults to the current component root)"
allowed-tools: Bash(hax:*), Bash(cd:*), Read, Edit
---

Run `hax audit` to check web components against the **DDD** (HAX design system) standards.
It reads `.dddignore` to skip files and suggests CSS/token fixes.

User input: `$ARGUMENTS`

Guidance:
- Run from the component's root directory. If the input names a path, `cd` into it first.
- Use `hax --debug audit` to also print the gathered `.dddignore` contents (troubleshooting).
- Audit is expected before submitting theme components or PRs.

Run the audit, summarize the findings, then apply or recommend the suggested DDD token
changes (use CSS custom properties instead of hardcoded values). Do **not** edit
auto-generated files like `custom-elements.json` — rebuild the project to regenerate them.
