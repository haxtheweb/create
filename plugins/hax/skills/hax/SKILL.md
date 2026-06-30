---
name: hax
description: >-
  Build and manage HAX projects with the `hax` CLI (@haxtheweb/create). Use when
  the user wants to create a HAX web component or HAXsite, scaffold a Lit/DDD
  component, audit DDD design-system compliance, run a HAXsite dev server,
  add/edit/delete pages or content, import or migrate content into a HAXsite,
  publish to surge/netlify/vercel/gh-pages, or otherwise run `hax` commands.
  Triggers include: hax, haxcms, haxsite, haxtheweb, web component, Lit element,
  DDD audit, "hax site", "hax webcomponent".
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# HAX CLI (`@haxtheweb/create`)

The `hax` command rapidly scaffolds and manages **HAX-capable web components** and
**HAXsites** (HAXcms single sites). It is the primary interface for the HAX
ecosystem. This skill gives you the command surface and the conventions that make
HAX work correctly.

## Installation & updates

```bash
npm install --global @haxtheweb/create   # installs `hax` and `create-haxtheweb`
hax update                               # self-update the CLI
hax --version                            # check installed version
```

This plugin's SessionStart hook installs the CLI automatically if `hax` is
missing. If it isn't on PATH, fall back to the global install above (or `npx
@haxtheweb/create` / `npm init @haxtheweb` for a one-off run). Requires Node
`>=18.20.3`.

## Quickstart (golden path for a new user)

When someone is new to HAX or just wants to see something work, lead with the
shortest path to a **live site in the browser** — do not dump the full command
surface on them:

```bash
hax site my-hax-site --y --no-i     # 1. scaffold a HAXsite with defaults
cd my-hax-site && hax serve         # 2. serve it (background; long-running)
                                    # 3. surface the local URL + one next edit
```

The `/hax:quickstart` command runs exactly this. Default the site name if they
don't supply one, background `hax serve`, report the URL, and point at a single
concrete next step. Save web components, audits, imports, theming, and publishing
for after they've seen their first site.

## Command groups

```bash
hax start          # interactive menu (ascii art + Clack prompts)
hax serve          # run a HAXsite in dev mode at http://localhost
hax site           # create / administer a HAXsite
hax webcomponent   # create / work with a Lit + DDD web component (alias: hax wc)
hax audit          # audit web components for DDD compliance
hax party          # community / get-involved options
hax update         # CLI self-update
hax help [command] # authoritative, up-to-date help; also `hax site --help`
```

Always trust `hax help`, `hax site --help`, and `hax webcomponent --help` for the
current flag list — they reflect the installed version.

## Global flags (apply across commands)

| Flag | Meaning |
|------|---------|
| `--y` / `--auto` | Yes to all prompts (scripting) |
| `--no-i` | No interactions / sub-processes (best for scripting) |
| `--quiet` | Suppress console logging |
| `--skip` | Skip frills/animations (faster) |
| `--v` | Verbose; `--debug` developer output |
| `--format <json\|yaml>` | Output format (default json) |
| `--path <dir>` | Where to perform the operation |
| `--root <dir>` | Run the command as if from this directory |
| `--to-file <file>` | Redirect command output to a file |
| `--no-extras` | Skip automatic extra processing |
| `--npm-client <npm\|yarn\|pnpm>` | Package manager (default npm) |
| `--org <org>` / `--author <name>` | package.json / site metadata |

**For automation, prefer `--y --no-i` (optionally `--quiet`).** Without them, the
CLI may open interactive Clack prompts that stall a non-interactive session.

## Create a web component

```bash
hax webcomponent my-element --y                  # Lit + DDDSuper + i18n, defaults
hax webcomponent my-card --writeHaxProperties --y  # also emit haxProperties
```

- The name **must be hyphenated** (`my-element`, never `myElement`).
- LitElement-based, extends `DDDSuper` (the DDD design system), i18n-wired.
- In a **monorepo root**, the component is placed in the correct location and
  inherits settings — run from the repo root in that case.
- After creation: `cd my-element && npm install && npm start` to develop.
- `--writeHaxProperties` generates the schema that lets the component plug into
  the HAX authoring UI.

## Create a HAXsite

```bash
hax site mysite --y                                  # default theme
hax site mysite --theme "polaris-flex-theme" --y     # pick a theme
hax site mysite --skeleton-machine-name clean-one --y  # from an installed skeleton
hax site mysite --skeleton-file ./template.json --y    # from a local skeleton file
```

Custom theme starting point:

```bash
hax site mysite --theme "custom-theme" \
  --custom-theme-name "my-theme" \
  --custom-theme-template "base" --y      # templates: base | polaris-flex | polaris-sidebar
```

A HAXsite is a portable HAXcms site: `site.json` (JSON Outline Schema), `pages/`
content, `files/` assets, optional `theme/`. Preview with `hax serve` from the
site root.

## Work with an existing HAXsite

Run site sub-commands from inside the site folder, or target it with
`--root ./mysite`.

### Content / node operations

```bash
# Add a page
hax site node:add --title "My summer vacation" \
  --content "<p>An awesome blog post.</p>" --y

# Edit a node by id (node-op: title | content | slug | parent | order | published | tags | theme | hide-in-menu)
hax site node:edit --item-id item-<uuid> --node-op title   --title "New title"
hax site node:edit --item-id item-<uuid> --node-op content --content "<p>New content</p>"
hax site node:edit --item-id item-<uuid> --node-op parent          # interactive picker

# Inspect / delete
hax site node:stats                       # interactive node inspector
hax site node:delete --item-id item-<uuid> --y
```

Page-creation flags: `--title`, `--content`, `--slug`, `--published`, `--tags`,
`--parent`, `--order`, `--theme`, `--hide-in-menu`.

### Site operations

```bash
hax site site:stats                                  # site stats
hax site site:items --to-file export-items.json      # list nodes -> file
hax site site:items-import --items-import items.json  # import nodes from file
hax site site:list-files                             # uploaded files
hax site site:search --search "lesson"               # full-text search
hax site site:search --search "video-player[src]" --search-selector  # HTML selector search
hax site site:theme --theme "clean-two" --y          # change theme
hax site site:html   --to-file output.html           # export site as HTML
hax site site:md     --to-file output.md             # export site as Markdown
hax site site:schema --to-file schema.json           # export HAXSchema (vdom)
hax site site:sync                                    # git sync (if remote configured)
```

### Skeleton templates (reusable site blueprints)

```bash
hax site site:skeleton-export --to-file ./template.json     # export current site
hax site site:skeleton-install                              # install current site as skeleton
hax site site:skeleton-install --skeleton-file ./template.json \
  --skeleton-machine-name course-template                  # install from file, rename
```

### Recipes

```bash
hax site recipe:read                          # print the recipe used to build the site
hax site recipe:play --recipe my.recipe --y   # replay a recipe (scripted)
```

## Import & migrate content

```bash
hax site --import-site https://example.com --import-structure htmlToSite
```

`--import-structure` options: `pressbooksToSite`, `elmslnToSite`, `haxcmsToSite`,
`notionToSite`, `gitbookToSite`, `evolutionToSite`, `ploneToSite`,
`wordpressPagesToSite`, `drupalBookToSite`, `htmlToSite`, `docxToSite`. Tune
scraping with `--title-scrape` / `--content-scrape` (CSS selectors). Validate
source URLs before importing untrusted content.

## Serve locally

```bash
hax serve            # serves the HAXsite in the current dir at http://localhost
```

`hax serve` is **long-running** — start it in the background so the session stays
responsive, then report the local URL.

## Publish / deploy a HAXsite

Run from the site root (or pass `--root ./mysite`). Deploying is outward-facing —
confirm the target/domain before pushing unless the user already specified it.

```bash
hax site site:surge   --domain my-blog.surge.sh      # surge.sh
hax site site:netlify --y                            # Netlify (or --domain <site-id>)
hax site site:vercel  --y                            # Vercel  (or --domain <project>)
hax site setup:github-actions                        # CI: deploy on git push (GH Pages)
hax site setup:gitlab-ci                             # CI: deploy on git push (GitLab)
```

## Audit components for DDD compliance

```bash
hax audit            # run from a component's root
hax --debug audit    # also print gathered .dddignore contents
```

- Audits CSS/structure against the **DDD** design system and suggests token-based
  fixes. Honors a `.dddignore` file (each generated component ships with one).
- **Required** before submitting theme components or PRs.
- Do **not** hand-edit auto-generated files like `custom-elements.json` — run the
  project build (`npm run build` / `yarn run build`) to regenerate them.

## HAX conventions (important when editing generated code)

- **JavaScript only — no TypeScript.** HAX ships unbundled JS/HTML/CSS with no
  compile step. If you use a TS-authored library, import its prebuilt JS dist
  (e.g. `@vaadin/<c>/<c>.js`, `@shoelace-style/shoelace/dist/components/...`).
- Use `globalThis`, single quotes, ES modules; prefer functional patterns.
- Components extend `DDDSuper`; HAXcms **themes** extend `HAXCMSLitElement`. After
  editing a theme, rebuild to regenerate `custom-elements.json`.
- Use DDD design tokens (CSS custom properties) for color/spacing/typography
  instead of hardcoded values.
- Web component & package names are hyphenated and should match.

## Typical workflows

- **New component:** `hax webcomponent my-thing --writeHaxProperties --y` → `cd` →
  `npm install` → `npm start` → edit → `hax audit`.
- **New site:** `hax site mysite --y` → `cd mysite` → `hax serve` → add pages with
  `hax site node:add ...` → publish with `hax site site:vercel --y`.
- **Migrate a site:** `hax site newsite --import-site <url> --import-structure
  <method> --y` → review → `hax serve`.

When unsure of an exact flag for the installed version, run the relevant
`hax <command> --help` first and adapt.
