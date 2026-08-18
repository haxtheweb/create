---
description: Scaffold a new HAX-capable Lit/DDD web component with the HAX CLI (hax webcomponent).
argument-hint: "[component-name] [--writeHaxProperties] [--y]"
allowed-tools: Bash(hax:*), Bash(cd:*), Read
---

Create a new web component with `hax webcomponent` from `@haxtheweb/create`. Components are
LitElement-based, extend `DDDSuper` (the DDD design system), and are i18n-wired.

User input: `$ARGUMENTS`

Guidance:
- New component: `hax webcomponent <my-element> --y`. The name **must be hyphenated**
  (e.g. `my-card`, not `myCard`). If no name is given, ask for a hyphenated one.
- Add `--writeHaxProperties` to generate the schema for HAX authoring integration.
- In a **monorepo root**, the CLI places the component correctly and inherits settings —
  run from the repo root in that case.
- Set metadata with `--org <org>` / `--author <name>`; use `--y --no-i` for scripting.

Build and run the `hax webcomponent …` command, then summarize the created component and
next steps (`cd <name>`, `npm install`, `npm start`). Remember HAX is **JavaScript only —
no TypeScript**; import prebuilt JS dists of any TS-authored libraries.
