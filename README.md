# HAX The CLI
Rapidly build web components for the Web that work with HAX. HAX The Web's CLI tools empower you to rapidly..

```bash
# this allows you to then use hax command
npm install @haxtheweb/create --global
# then run
hax start
```

# Commands

## Default / global / new context
- `hax start` - fun ascii art and interactive CLI (via [clack](https://www.clack.cc/) )
- `hax --name my-element --y` - Make a new HAX capable, i18n wired, Design system (DDD) driven web component
  -  if in a monorepo root, will place in correct location / inherit settings
- `hax site mysite --y` - create a new HAXsite (HAXcms, single site)

## --help
```
Usage: hax [options] [command]

Options:
  --
  --v                            Verbose output for developers
  --path <char>                  where to perform operation
  --npm-client <char>            npm client to use (must be installed) npm,
                                 yarn, pnpm (default: "npm")
  --y                            yes to all questions
  --skip                         skip frills like animations
  --auto                         yes to all questions, alias of y
  --org <char>                   organization for package.json
  --author <char>                author for site / package.json
  --import-site <char>           URL of site to import
  --node-op <char>               node operation to perform
  --item-id <char>               node ID to operate on
  --name <char>                  name of the project
  --domain <char>                published domain name
  --title <char>                 Title
  --content <char>               Page content
  --slug <char>                  Path (slug)
  --published <char>             Publishing status
  --tags <char>                  Tags
  --parent <char>                Parent
  --order <char>                 Order
  --theme <char>                 Theme
  --hide-in-menu <char>          Hide in menu
  -h, --help                     display help for command

Commands:
  start                          Interactive program to pick options
  site [options] [action]
  webcomponent [options] [name]  Create Lit based web components, with HAX
                                 recommendations
  help [command]                 display help for command
```

## Site  context
- listing stats
- launch site
- publish to surge.sh (if installed)

## web component context
- launch element

# Alternative Usage

```bash
# also this will invoke 1x
npx @haxtheweb/create
# this is same as above, better windows CLI support
npm init @haxtheweb
```

## Usage in other programs
https://stackoverflow.com/questions/69208298/use-node-bins-without-installing-the-package-globally explains it but you should be able to use the CLI as part of another project as follows:
```json
{
  "scripts": {
    "hax": "hax"
  }
}
```

```bash
# script creating a new element called my-element w/ all defaults
npm run hax -- --name my-element --y
```

## Windows problems?
Try setting a different cache path to load from `npm config set cache C:\tmp\nodejs\npm-cache --global`

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
