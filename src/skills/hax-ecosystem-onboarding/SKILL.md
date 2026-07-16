---
name: hax-ecosystem-onboarding
description: >
  Onboard new developers to the HAX ecosystem by cloning repositories, installing the CLI,
  and setting up the development environment. Use when a developer is new to HAX, needs a
  fresh environment setup, or wants to scaffold their first web component or HAXsite.
version: 1.1.0
license: Apache-2.0
metadata:
  author: haxtheweb
  tags: [hax, onboarding, setup, cli, environment, scaffolding]
  source: create
---

# HAX Ecosystem Onboarding

Onboard new developers to the HAX ecosystem by cloning repositories, installing the CLI, and setting up the development environment.

## When to Use

- A developer is new to the HAX ecosystem
- Setting up a fresh development environment
- Cloning all necessary HAX repositories
- Installing and configuring the HAX CLI (@haxtheweb/create)
- Scaffolding the first web component or HAXsite
- Creating development aliases and shortcuts

## How It Works

1. **Clone Repositories**: Clone all necessary HAX ecosystem repositories into `~/Documents/git/haxtheweb/`. Core repos include `webcomponents`, `create`, `haxcms-php`, `haxcms-nodejs`, `desktop`, `hax11ty`, `json-outline-schema`, `hax-schema`, `open-apis`, `docs`, and `issues`.
2. **Install HAX CLI**: Install globally with `npm install @haxtheweb/create --global`. Alternatively use `npx @haxtheweb/create` or `npm init @haxtheweb`. Update with `hax update`.
3. **Install Agent Skills**: Run `hax skills install --all` to install the bundled interface skills (site building, ClaudeHAX, web component dev, onboarding) into `~/.agents/skills/` so any agent can use them.
4. **Configure Environment**: Set up Warp with HAX-specific rules. Create helpful development aliases. Configure shell to start in `~/Documents/git/haxtheweb/`. (PRAW Rule `bAKMWCMrqRLGdWmuNWgVUw`)
5. **Scaffold First Component**: Use `hax webcomponent my-element --y` to create a LitElement with DDD and i18n support.
6. **Scaffold First Site**: Use `hax site mysite --y` to generate a HAXcms-based static site.
7. **Run Development Server**: Use `hax serve` to launch the site at http://localhost.

## HAX CLI Core Commands

- `hax start` — Start interactive CLI with ASCII art via Clack
- `hax serve` — Start development server
- `hax webcomponent <name> --y` — Create a web component
- `hax site <name> --y` — Create a HAXsite
- `hax audit` — Run DDD compliance audit on CSS
- `hax skills list` — List bundled agent skills
- `hax skills install <name|--all>` — Install bundled skills into `.agents/skills/`
- `hax update` — Update HAX CLI

## CLI Options for Automation

When scripting HAX commands, always use these flags to prevent interruptions:
- `--y` or `--auto` — Auto-accept all prompts
- `--no-i` — Prevent interactive sub-processes
- `--skip` — Skip animations for faster execution
- `--quiet` — Suppress console logging

## Quick Verification

After setup, verify the environment:
1. Run `hax --version` to confirm CLI installation
2. Run `hax webcomponent test-element --y` to verify scaffolding works
3. Run `hax site test-site --y` to verify site creation works
4. Run `hax skills list` to confirm bundled skills are available
5. Check that `~/Documents/git/haxtheweb/` contains the expected repositories

## References

- HAX CLI: `hax --help`
- PRAW (workflows + rules): `~/Documents/git/haxtheweb/praw/`
- PRAW RULES.md: `~/Documents/git/haxtheweb/praw/RULES.md` (canonical ecosystem rules)
- HAX Documentation: `https://haxtheweb.org/`
