---
description: Create a new HAXsite or run a site operation with the HAX CLI (hax site).
argument-hint: "[site-name] [--theme <name>] [--y]  |  [op e.g. node:add --title ...]"
allowed-tools: Bash(hax:*), Bash(cd:*), Read
---

Create or administer a HAXsite using `hax site` from `@haxtheweb/create`.

User input: `$ARGUMENTS`

Decide between creating a new site and operating on an existing one:

**New site** — when the input is a name (optionally with flags):
- `hax site <name> --y` (add `--theme "<theme>"`, e.g. `clean-two`, `polaris-flex-theme`).
- From a template: `--skeleton-machine-name <installed>` or `--skeleton-file ./template.json`.
- Run from the directory where the site folder should be created, or pass `--root <path>`.
- If no name is given, ask for one.

**Existing-site operations** — run from inside the site folder (or `--root ./<site>`):
- Add a page: `hax site node:add --title "<title>" --content "<html>" --y`
- Edit a node: `hax site node:edit --item-id <id> --node-op <title|content|slug|parent|order|...> ...`
- Delete a node: `hax site node:delete --item-id <id> --y`
- Stats / export: `hax site site:stats`, `hax site site:items --to-file items.json`
- Change theme: `hax site site:theme --theme "<theme>" --y`
- Search: `hax site site:search --search "<query>"` (add `--search-selector` for HTML selectors)

Use `--y --no-i` for non-interactive runs; add `--quiet` to reduce noise. Construct the
appropriate `hax site …` command from the input, run it, then summarize what was created
or changed. After scaffolding a new site, mention it can be previewed with `/hax:serve`.
