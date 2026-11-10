---
name: hax-site-building
description: >
  Build and maintain HAXcms sites with proper structure, themes, and JSON Outline Schema.
  Use when creating a new HAXsite, editing site.json, managing page content, or modifying themes
  in the HAXcms ecosystem. Use when the user says "create a site", "add pages", "edit site.json",
  or references HAXcms site structure.
version: 1.3.0
license: Apache-2.0
metadata:
  author: haxtheweb
  tags: [hax, haxcms, site, json-outline-schema, theme, jos]
  source: create
---

# HAX Site Building

Build and maintain HAXcms sites with proper structure, themes, and JSON Outline Schema.

## When to Use

- Creating a new HAXsite for testing or production
- Editing `site.json` structure or metadata
- Adding or modifying pages in the `pages/` directory
- Managing static assets in the `files/` directory
- Customizing HAXcms themes that inherit from HAXCMSLitElement
- Importing content from external sources (WordPress, Notion, HTML, etc.)

## How It Works

1. **Scaffold**: Always use `hax site mysite --y` instead of manual creation. Do not create site directories or files manually.
2. **Structure**: Keep all documentation in `docs/`, all files in `files/`, and all page HTML in `pages/`. Maintain `site.json` in JSON Outline Schema format.
3. **Metadata**: Ensure `metadata.site.name` aligns exactly with the folder name. Do not modify it to anything else. (PRAW Rule `rHQ7lLRZmZlnFveLrWslUN`)
4. **Routes**: Do not create pages or routes using the `x/` prefix — it is reserved for internal HAXcms paths (`x/search`, `x/tags`, `x/manifest`). (PRAW Rule `Q4D9hL9sFNORlMPt1z2ZEb`)
5. **Content**: Use HAX-capable web components for rich content. Apply DDD attributes for consistent spacing and typography. Include engaging visual elements (videos, tables, interactive components).
6. **Theme**: Use HAXCMSLitElement for custom theme components. Apply DDD design tokens consistently. Run `yarn run build` after theme changes.
7. **Import**: Use supported import methods (`pressbooksToSite`, `htmlToSite`, `notionToSite`, `docxToSite`, etc.) via `hax site --import-site <url> --import-structure <method>`.

## Page creation (critical)

Always create pages through the `hax` CLI, never by manually creating page directories or hand-editing `site.json`. Manual page creation bypasses the CLI's page-id generation, slug/location management, and atomic `site.json` updates, which corrupts the JSON Outline Schema structure and breaks the site in production. The CLI owns page structure; you only own page content.

As an agent, add `--agent` to every `hax site` command below (or set `HAX_ACTOR=agent`) so the site's history records your changes as agent changes instead of a person's.

Two supported CLI paths, run from inside the site directory:

- Single page: `hax site node:add --title="<title>" --slug="<slug>" --parent=<parent-id-or-slug> --content=<path-to-html-or-md-file> --y --no-i`. Without `--order` the page is appended after its siblings. The output includes the new item id.
- Update an existing page: `hax site node:edit --item-id=<id-or-slug> --title="<title>" --content=<file-or-html> --y --no-i`. See "Editing pages" below.
- Delete a page: `hax site node:delete --item-id=<id-or-slug> --y --no-i` (`--y` skips the confirmation).
- Bulk (preferred for a whole program): build a JOS items array (one object per page with `title`, `slug`, `parent`, `indent`, `order`, `metadata`, and `content`), then run `hax site site:items-import --items-import <items.json> --y --no-i`. The import remaps parent references to the newly generated ids automatically.

Pass values as `--flag=value`. A value that starts with `-` (for example `--description="-1 is the answer"`) must use that form, or it is read as another flag.

## Editing pages

`node:edit` runs the same HAXcms operations as the site API (`PATCH /x/api/v1/items/:id` and the content save), so a CLI edit leaves `site.json` the way the same edit through the API or the HAX editor would. `--item-id` takes a page id or slug. Give any of these field flags; they are applied together:

| Flag                                       | What it changes                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `--title=<text>`                           | Title. With pathauto on, the slug follows the title unless it was set by hand.                                      |
| `--slug=<path>`                            | Slug, marked as set by hand. The reserved `x` becomes `x-x`.                                                        |
| `--content=<file, URL or HTML>`            | Page body (`--content-format=md` for Markdown). The description and reading time are regenerated from the new body. |
| `--description=<text>`                     | Description.                                                                                                        |
| `--tags=<a,b>`                             | Tags.                                                                                                               |
| `--published=true\|false`                  | Published state.                                                                                                    |
| `--hide-in-menu=true\|false`               | Hidden from the menu.                                                                                               |
| `--parent=<id-or-slug>` or `--parent=null` | Parent page. `null` moves the page to the top level.                                                                |
| `--order=<number>`                         | Position among its siblings.                                                                                        |
| `--theme=<theme>`                          | Theme for this page only (empty removes it).                                                                        |

Order rule: when `--parent` changes and no `--order` is given, the page goes after the last of its new siblings (highest sibling order + 1, the same rule `node:add` uses). Its depth follows the new parent and its slug is rebuilt from the new path unless the slug was set by hand. Pass `--order` to place it yourself.

Interactive `--node-op` picks one field to edit: `title`, `content`, `slug`, `published`, `tags`, `parent`, `order`, `theme` or `hideInMenu`. Change a description with `--description`; it is not a node-op.

Change the whole site's theme with `hax site site:theme --theme=<theme> --y --no-i` (same as the site API's appearance settings).

To mark a page draft/private (e.g. verbatim transcripts), set `metadata.published: false` in the import item. After creation, verify with `hax site site:items`.

## Safe bulk changes

Before any bulk change (an items import, many `node:edit` calls, `site:search-replace`, restructuring), snapshot and check the site, then check it again afterward:

1. `hax site site:archive --y --no-i --agent` writes a `.tar.gz` of the whole site to `~/.haxtheweb/archives/<site>/`. If the change goes wrong, `hax site site:restore --source <archive> --y --no-i --agent` puts it back (it archives the current state first).
2. `hax site site:validate --format json --y --no-i` before the change, so you know which problems were already there.
3. Make the change through the CLI.
4. `hax site site:validate --format json --y --no-i` again. It exits 1 on structural errors (duplicate ids or slugs, missing parents, parent cycles, missing page files); fix any errors your change introduced. Warnings (dead internal links, missing `files/` references, unknown elements) are worth fixing too.

Never hand-edit generated files (`llms.txt`, `sitemap.xml`, `rss.xml`, `atom.xml`, `lunrSearchIndex.json`, the managed `AGENTS.md` block). Regenerate them with `hax site site:rebuild --y --no-i --agent`, or only some with `--only rss,sitemap,search,llms,managed,skills`.

For theme testing or a demo, `hax site node:generate --count 10 --parent <id-or-slug> --y --no-i --agent` adds placeholder pages through the same path as `node:add`. (PRAW Rule — see RULES.md "HAXcms page creation via CLI".)

## Educational Content Standards

When creating educational content:

- Apply OER Schema metadata parameters for semantic structure and interoperability
- Structure content to support pedagogical objectives
- Include proper learning resource identification
- Consider diverse learning styles in content presentation
- Maintain comprehensive ecosystem context in documentation

## Build Workflow

- Run `yarn run build` after theme modifications involving HAXCMSLitElement
- Do not manually edit `custom-elements.json` or generated manifest files
- Regenerate feeds, sitemap, search index and `llms.txt` with `hax site site:rebuild`, never by hand
- Use HAX CLI tools for site operations rather than manual file edits
- Ensure `site.json` is valid JSON Outline Schema before committing

## References

- HAX CLI: `hax site --help`
- PRAW RULES.md: `https://github.com/haxtheweb/praw/blob/main/RULES.md` (canonical ecosystem rules referenced by Rule ID)
- DDD design system: see the `hax-design-system` skill
