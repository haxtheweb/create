[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Lit](https://img.shields.io/badge/-Lit-324fff?style=flat&logo=data:image/svg%2bxml;base64,PHN2ZyBmaWxsPSIjZmZmIiB2aWV3Qm94PSIwIDAgMTYwIDIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJtMTYwIDgwdjgwbC00MC00MHptLTQwIDQwdjgwbDQwLTQwem0wLTgwdjgwbC00MC00MHptLTQwIDQwdjgwbDQwLTQwem0tNDAtNDB2ODBsNDAtNDB6bTQwLTQwdjgwbC00MC00MHptLTQwIDEyMHY4MGwtNDAtNDB6bS00MC00MHY4MGw0MC00MHoiLz48L3N2Zz4%3D)](https://lit.dev/)
[![#HAXTheWeb](https://img.shields.io/badge/-HAXTheWeb-999999FF?style=flat&logo=data:image/svg%2bxml;base64,PHN2ZyBpZD0iZmVhMTExZTAtMjEwZC00Y2QwLWJhMWQtZGZmOTQyODc0Njg1IiBkYXRhLW5hbWU9IkxheWVyIDEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDE4NC40IDEzNS45NyI+PGRlZnM+PHN0eWxlPi5lMWJjMjAyNS0xODAwLTRkYzItODc4NS1jNDZlZDEwM2Y0OTJ7ZmlsbDojMjMxZjIwO308L3N0eWxlPjwvZGVmcz48cGF0aCBjbGFzcz0iZTFiYzIwMjUtMTgwMC00ZGMyLTg3ODUtYzQ2ZWQxMDNmNDkyIiBkPSJNNzguMDcsODMuNDVWNTVIODYuMnY4LjEzaDE2LjI2djQuMDdoNC4wN1Y4My40NUg5OC40VjY3LjE5SDg2LjJWODMuNDVaIi8+PHBvbHlnb24gcG9pbnRzPSIxNTMuMTMgNjMuNyAxNTMuMTMgNTEuMzkgMTQwLjU0IDUxLjM5IDE0MC41NCAzOS4wOSAxMjcuOTUgMzkuMDkgMTI3Ljk1IDI2Ljc5IDEwMi43OCAyNi43OSAxMDIuNzggMzkuMDkgMTE1LjM2IDM5LjA5IDExNS4zNiA1MS4zOSAxMjcuOTUgNTEuMzkgMTI3Ljk1IDYzLjcgMTQwLjU0IDYzLjcgMTQwLjU0IDc2IDEyNy4zNiA3NiAxMjcuMzYgODguMyAxMTQuNzggODguMyAxMTQuNzggMTAwLjYxIDEwMi4xOSAxMDAuNjEgMTAyLjE5IDExMi45MSAxMjcuMzYgMTEyLjkxIDEyNy4zNiAxMDAuNjEgMTM5Ljk1IDEwMC42MSAxMzkuOTUgODguMyAxNTIuNTQgODguMyAxNTIuNTQgNzYgMTY1LjcyIDc2IDE2NS43MiA2My43IDE1My4xMyA2My43Ii8+PHBvbHlnb24gcG9pbnRzPSIzMy4xMyA2My43IDMzLjEzIDUxLjM5IDQ1LjcyIDUxLjM5IDQ1LjcyIDM5LjA5IDU4LjMxIDM5LjA5IDU4LjMxIDI2Ljc5IDgzLjQ4IDI2Ljc5IDgzLjQ4IDM5LjA5IDcwLjg5IDM5LjA5IDcwLjg5IDUxLjM5IDU4LjMxIDUxLjM5IDU4LjMxIDYzLjcgNDUuNzIgNjMuNyA0NS43MiA3NiA1OC44OSA3NiA1OC44OSA4OC4zIDcxLjQ4IDg4LjMgNzEuNDggMTAwLjYxIDg0LjA3IDEwMC42MSA4NC4wNyAxMTIuOTEgNTguODkgMTEyLjkxIDU4Ljg5IDEwMC42MSA0Ni4zMSAxMDAuNjEgNDYuMzEgODguMyAzMy43MiA4OC4zIDMzLjcyIDc2IDIwLjU0IDc2IDIwLjU0IDYzLjcgMzMuMTMgNjMuNyIvPjwvc3ZnPg==)](https://haxtheweb.org/)
[![Published on npm](https://img.shields.io/npm/v/@haxtheweb/create?style=flat)](https://www.npmjs.com/package/@haxtheweb/create)
[![build](https://github.com/haxtheweb/create/workflows/build/badge.svg)](https://github.com/haxtheweb/create/actions)
[![X](https://img.shields.io/twitter/follow/haxtheweb.svg?style=social&label=Follow)](https://twitter.com/intent/follow?screen_name=haxtheweb)

# HAX The CLI
Rapidly build web components for the Web that work with HAX. HAX The Web's CLI tools empower you to rapidly..

```bash
# this allows you to then use hax command
npm install @haxtheweb/create --global
# then run this for interactive prompt
hax start
```

# Commands

## Default / global / new context
- `hax start` - fun ascii art and interactive CLI (via [clack](https://www.clack.cc/) )
- `hax webcomponent my-element --y` - Make a new HAX capable, i18n wired, Design system (DDD) driven web component
  -  if in a monorepo root, will place in correct location / inherit settings
- `hax site mysite --y` - create a new HAXsite (HAXcms, single site)
- `hax audit` - Audits web components for compliance with DDD (HAX design system)

## --help
Run `hax help` or `hax webcomponent --help` or `hax site --help` for up-to-date listing
```
Usage: hax [options] [command]

Options:
  --
  --v                                 Verbose output
  --debug                             Output for developers
  --format <char>                     Output format; json (default), yaml
  --path <char>                       where to perform operation
  --name <char>                       name of the project/web component
  --npm-client <char>                 npm client to use (must be installed)
                                      npm, yarn, pnpm (default: "npm")
  --y                                 yes to all questions
  --skip                              skip frills like animations
  --quiet                             remove console logging
  --auto                              yes to all questions, alias of y
  --no-i                              prevent interactions / sub-process, good
                                      for scripting
  --to-file <char>                    redirect command output to a file
  --no-extras                         skip all extra / automatic command
                                      processing
  --root <char>                       root location to execute the command from
  --org <char>                        organization for package.json
  --author <char>                     author for site / package.json
  --writeHaxProperties                Write haxProperties for the element
  --import-site <char>                URL of site to import
  --import-structure <char>           import method to use:
                                      pressbooksToSite
                                      elmslnToSite
                                      haxcmsToSite
                                      notionToSite
                                      gitbookToSite
                                      evolutionToSite
                                      htmlToSite
                                      docxToSite
  --node-op <char>                    node operation to perform
  --item-id <char>                    node ID to operate on
  --domain <char>                     published domain name
  --title-scrape <char>               CSS Selector for `title` in resource
  --content-scrape <char>             CSS Selector for `body` in resource
  --items-import <char>               import items from a file / site
  --recipe <char>                     path to recipe file
  --custom-theme-name <char>          custom theme name
  --custom-theme-template <char>      custom theme template; (options: base,
                                      polaris-flex, polaris-sidebar)
  --repos <char...>                   repositories to clone
  -V, --version                       output the version number
  --title <char>                      Title
  --content <char>                    Page content
  --slug <char>                       Path (slug)
  --published <char>                  Publishing status
  --tags <char>                       Tags
  --parent <char>                     Parent
  --order <char>                      Order
  --theme <char>                      Theme
  --hide-in-menu <char>               Hide in menu
  -h, --help                          display help for command

Commands:
  start                               Select which hax sub-program to run
  update [options]                    hax cli self update
  serve                               Launch HAXsite in development mode
                                      (http://localhost)
  site [options] [action]             create or administer a HAXsite
  wc|webcomponent [options] [action]  Create Lit based web components, with HAX
                                      recommendations
  audit [options]                     Audits web components for compliance with
                                      DDD (HAX design system)
  party [options] [action]            Party time! Join the HAX community and
                                      get involved!
  help [command]                      display help for command

```
## Examples
For a detailed list of example commands that you can perform with `hax` see [examples](examples.md).
## Manual

### Linux / macOS

Run `man hax` to get detailed manual.

# Alternative Usage

```bash
# also this will invoke 1x
npx @haxtheweb/create
# this is same as above, better windows CLI support
npm init @haxtheweb
```

```bash
# script creating a new element called my-element w/ all defaults
npm run hax -- --name my-element --y
```

## Windows problems?
Try setting a different cache path to load from `npm config set cache C:\tmp\nodejs\npm-cache --global`

If you wish to use PowerShell over Command Prompt, you may need to change your execution policy to allow scripts using the `Set-ExecutionPolicy` command with the `-ExecutionPolicy` and `-Scope` parameters. You should **not** need to do this if you are using Command Prompt.

```powershell
# To see your current execution policy
Get-ExecutionPolicy
```

`Set-ExecutionPolicy` command documentation: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/set-executionpolicy?view=powershell-7.4

Follow the prompts and let's HAX the Web together!

## Web component

Step through answering basic install questions to build a HAX capable web component that works anywhere! Features:
- LitElement based
- DDDSuper class which adds our design system in
- Common conventions used to demonstrate and work with property binding
- Minor CSS variable inclusion for initial learning

## HAX Site

Build a HAX site that can be published and transported anywhere. Your users might love it on the front end, now you get the simplicity of building on the CLI.
- Same HAX sites you can create via front end
- Templated files that work just like any HAX site
- End points baked in to do CLI commands for common endpoint operations like adding pages, deleting and editing.
- Ability to import via URL just like the front-end
- Theme development starting point to be able to build themes locally
- Primed to publish to gh-pages, vercel and more

## HAX Audit
Audits your HAX based web components to suggest improvements to better align with DDD, the design system built into HAX components.
- Use `.dddignore` file to instruct audit program what files should be ignored. Each component generated comes with a `.dddignore` file in its root directory.
- Run command from root of the component project.
- Provides suggested changes for component CSS to align with DDD design standards, if a change cannot be suggested, developer will be refered to look at the manual for a change that works for them!

### `.dddignore` Template

```gitignore
# Directories
# (Must start with with / or \, as seen below)
/.github # Inline comments are supported
/.vscode
/.idea
/locales
\test
/dist
/build
/public # ignored by program regardless of presence in .dddignore
/node_modules # ignored by program regardless of presence in .dddignore

# Files 
# (Must include filename and extension, as seen below)
LICENSE
.dddignore
.editorconfig
.gitignore
.nojekyll
.npmignore
.surgeignore
rollup.config.js

# File extension
# (Must start with *, as seen below)
*.md
*.yml
*.json
*.toml
*.mjs
*.cjs
*.png
*.ico
*.svg
*.jpg
*.jpeg
```

# Get Help / Issues / Support
- Discord Channel - https://bit.ly/hax-discord
- Unified issue queue - https://github.com/haxtheweb/issues/issues
- DDD Documentation - https://haxtheweb.org/documentation/ddd
- Using Merlin directly in any HAX spaces and type "Issue" to jump start a report!

## Watch and Learn more about HAX here:
- Try Hax: https://hax.cloud
- HAXCellence https://haxtheweb.org/what-is-hax
- Youtube channel - https://www.youtube.com/@haxtheweb

# Related links and tech
- [NPM Package list](https://www.npmjs.com/org/haxtheweb)
- [HAXcms (NodeJS)](https://github.com/haxtheweb/haxcms-nodejs)
- [HAXcms (PHP)](https://github.com/haxtheweb/haxcms-php)
- [Storybook docs](https://open-apis.hax.cloud/)
- [HAX [dot] PSU](https://hax.psu.edu)
- [HAX doc site](https://haxtheweb.org/)
- [HAX + 11ty](https://github.com/haxtheweb/hax11ty)


![HAX Traveler: World Changer](https://raw.githubusercontent.com/haxtheweb/art/refs/heads/main/haxtheweb/hax-traveler-world-changer.jpg)
