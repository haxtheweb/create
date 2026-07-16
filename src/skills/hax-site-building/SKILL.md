---
name: hax-site-building
description: >
  Build and maintain HAXcms sites with proper structure, themes, and JSON Outline Schema.
  Use when creating a new HAXsite, editing site.json, managing page content, or modifying themes
  in the HAXcms ecosystem. Use when the user says "create a site", "add pages", "edit site.json",
  or references HAXcms site structure.
version: 1.1.0
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

Two supported CLI paths, run from inside the site directory:

- Single page: `hax site node:add --title "<title>" --slug "<slug>" --parent <parent-item-id> --content <path-to-html-file> --format html --y --no-i`. Capture the returned item id from the output to use as `--parent` for children.
- Bulk (preferred for a whole program): build a JOS items array (one object per page with `title`, `slug`, `parent`, `indent`, `order`, `metadata`, and `content`), then run `hax site site:items-import --items-import <items.json> --y --no-i`. The import remaps parent references to the newly generated ids automatically.

To mark a page draft/private (e.g. verbatim transcripts), set `metadata.published: false` in the import item. After creation, verify with `hax site site:items`. (PRAW Rule — see RULES.md "HAXcms page creation via CLI".)

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
- Use HAX CLI tools for site operations rather than manual file edits
- Ensure `site.json` is valid JSON Outline Schema before committing

## References

- HAX CLI: `hax site --help`
- PRAW RULES.md: `~/Documents/git/haxtheweb/praw/RULES.md` (canonical ecosystem rules referenced by Rule ID)
- DDD design system: see the `hax-design-system` skill
