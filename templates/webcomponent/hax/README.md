# <%= name %>
HAX The Web Boilerplate based on OpenWC intended to quick start contribution via Vercel and web components ecosystems.

## Install
- `yarn install` - installs dependencies to get workin

## Scripts
- `yarn start` runs your web component for development, reloading on file changes
- `yarn run build` builds your web component and outputs it in your `dist` directory for placement on web servers in a compiled form

## Working with your web component
- edit files in the `/src/` directory
- if you must reference additional non-JS files, ensure you use the `new URL('./my-file.jpg', import.meta.url).href` syntax so that it builds correctly

## Recommended setup
- Load VS code in 1 window to project root
- Browser open
- Right click -> Inspect and open the Console to see error output

## Recommended Integrated Development Environment (IDE)
- VSCode https://code.visualstudio.com/Download

### Plugins

Name: lit-html
Id: bierner.lit-html
Description: Syntax highlighting and IntelliSense for html inside of JavaScript and TypeScript tagged template strings
Version: 1.11.1
Publisher: Matt Bierner
VS Marketplace Link: https://marketplace.visualstudio.com/items?itemName=bierner.lit-html

Name: lit-plugin
Id: runem.lit-plugin
Description: Syntax highlighting, type checking and code completion for lit-html
Version: 1.4.3
Publisher: Rune Mehlsen
VS Marketplace Link: https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin