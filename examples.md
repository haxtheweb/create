These commands work after installing the `hax` cli globally
```bash
npm install --global @haxtheweb/create
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
## site - existing site (called `zombocom`)
Add a page, setting `root` so that the call can be executed from a different directory than where the site lives
```bash
hax site --root ./zombocom node:add --title "My summer vacation" --content "<p>This is an awesome blog post I am writing about my vacation.</p>" --y
```
