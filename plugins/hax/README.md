# HAX CLI — Claude Code plugin

Install and drive the [HAX CLI](https://www.npmjs.com/package/@haxtheweb/create)
(`@haxtheweb/create`, the `hax` command) from inside Claude Code. Scaffold
HAX-capable web components and HAXsites, audit DDD compliance, serve locally, and
publish — without leaving the assistant.

## What's inside

- **Auto-install hook** — a `SessionStart` hook checks whether `hax` is on your
  `PATH`. If it's missing, it installs `@haxtheweb/create` globally (one time).
  Opt out with `export HAX_PLUGIN_NO_AUTOINSTALL=1`.
- **`hax` skill** — full command-surface knowledge (web components, sites,
  content/node ops, imports, skeletons, publishing) plus HAX conventions
  (JavaScript-only, DDD design tokens, `haxProperties`). Claude loads it
  automatically when you talk about HAX.
- **Slash commands** for the top workflows:
  - `/hax:quickstart` — **start here**: scaffold a HAXsite and open it live in the browser
  - `/hax:site` — create or administer a HAXsite
  - `/hax:webcomponent` — scaffold a Lit/DDD web component
  - `/hax:audit` — audit components for DDD compliance
  - `/hax:serve` — run a HAXsite dev server
  - `/hax:publish` — deploy to surge / Netlify / Vercel or set up CI

## Install

This repo is also a Claude Code plugin **marketplace**. Add it and install the
plugin:

```text
/plugin marketplace add haxtheweb/create
/plugin install hax@haxtheweb
```

To develop against a local checkout instead:

```text
/plugin marketplace add /path/to/create
/plugin install hax@haxtheweb
```

## Quickstart (the golden path)

New to HAX? Once the plugin is installed, just run:

```text
/hax:quickstart
```

It checks the CLI is ready (the auto-install hook handles that on session start),
scaffolds a HAXsite with sensible defaults, serves it locally, and hands you the
live URL with the one next edit to make. From nothing to a site you can see, in a
single step. Everything else (`/hax:webcomponent`, `/hax:audit`, `/hax:publish`,
content/import operations) builds out from there.

## Requirements

- Node.js `>=18.20.3` and `npm` on your `PATH` (so the CLI can be installed).

## Links

- HAX CLI source & docs: <https://github.com/haxtheweb/create>
- HAX: <https://haxtheweb.org/> · <https://hax.psu.edu/>
