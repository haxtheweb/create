These commands work after installing the `hax` cli globally
```bash
npm install --global @haxtheweb/create
```
# commands
Interactive program to step through options
```bash
hax start
```
Create a new web component or interact with an existing one
```bash
hax webcomponent
``
Create a new site or interact with an existing one
```bash
hax site
```
Print Help information for options and arguments
```bash
hax help
```

# webcomponent - new
Create a new webcomponent, prompt for details
```bash
hax webcomponent
```
Create a new webcomponent called `x-button`, accept defaults and launch
```bash
hax webcomponent x-button --y
```
# webcomponent - existing
- you already made a webcomponent called `x-button`, you want to work on it again
```bash
cd x-button
npm start
```
or
```bash
cd x-button
hax webcomponent
```
# site - new
Create a new site, prompt for details
```bash
hax site
```
Create a new site called `zombocom`, prompt for theme and opening
```bash
hax site zombocom
```
Create a new site called `zombocom`, set theme to `polaris-flex-theme` and open the site to start working
```bash
hax site zombocom --theme "polaris-flex-theme" --y
```
# site - existing site
`--root ./zombocom` - implies to run the command as if it was executed from the `./zombocom` folder
## site node operations
### node:add
Add a page, setting `root` so that the call can be executed from a different directory than where the site lives
```bash
hax site --root ./zombocom node:add --title "My summer vacation" --content "<p>This is an awesome blog post I am writing about my vacation.</p>" --y
```
### node:stats
Show data or content of a node, interactively
```bash
hax site node:stats
```
## node:edit
Edit a detail about a node, interactively
```bash
hax site node:edit
```
Edit the title of a specific node, scripted.
```bash
hax site node:edit --item-id item-ac247e47-5dcf-4a98-814a-03f2e70151c8 --node-op title --title "my new title"
```
Edit the content of a specific node, scripted
```bash
hax site node:edit --item-id item-ac247e47-5dcf-4a98-814a-03f2e70151c8 --node-op content --content "<p>This is the new content</p><stop-note></stop-note>"
```
Edit the parent of a specific node, interactive selection
```bash
hax site node:edit --item-id item-ac247e47-5dcf-4a98-814a-03f2e70151c8 --node-op parent
```
## node:delete
Delete a node, interactively
```bash
hax site node:delete
```
Delete a specific node, skip confirmation
```bash
hax site node:delete --item-id item-ac247e47-5dcf-4a98-814a-03f2e70151c8 --y
```
## site operations
List stats for the current site
```bash
hax site site:stats
```
List items (nodes) for the current site and write them to a file called export-items.json
```bash
hax site site:items --to-file export-items.json
```
Import items (nodes) for the current site from a file called export-items.json
```bash
hax site site:items-import --items-import export-items.json
```
List files uploaded to the site
```bash
hax site site:list-files
```
Change theme, interactively
```bash
hax site site:theme
```
Change theme to clean-two, scripted
```bash
hax site site:theme --theme "clean-two" --y
```
Output the entire site as HTML with `<h1>` for title, redirected to file `output.html`
```bash
hax site site:html --to-file output.html
```
Output the entire site as MD with `#` for title, redirected to file `output.md`
```bash
hax site site:md --to-file output.md
```
Output the entire site as HAXSchema (vdom) with `h1` for title, redirected to file `schema.json`
```bash
hax site site:schema --to-file schema.json
```
Sync git repo for the site, if hooked up to a remote
```bash
hax site site:sync
```
Publish site to surge.sh, interactively
```bash
hax site site:surge
```
Publish site to surge.sh, setting the domain to be `my-cool-blog.surge.sh`
```bash
hax site site:surge --domain my-cool-blog.surge.sh
```
Print out the recipe used in building the current site
```bash
hax site recipe:read
```
Play a site recipe against the current site, interactively
```bash
hax site recipe:play
```
Play a site recipe against the current site named `create-cli.recipe`, interactive selection per command
```bash
hax site recipe:play --recipe create-cli.recipe 
```
Play a site recipe against the current site named `create-cli.recipe`, scripted
```bash
hax site recipe:play --recipe create-cli.recipe --y
```
