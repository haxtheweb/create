#!/usr/bin/env node
// forces middleware into CLI mode so we don't automatically perform certain operations like pathing context
process.env.haxcms_middleware = "node-cli";

import * as fs from 'node:fs';
import * as hax from "@haxtheweb/haxcms-nodejs";
const HAXCMS = hax.HAXCMS;
import { characters } from './art.js';
import { readAllFiles, dashToCamel } from './utils.js';
import { setTimeout } from 'node:timers/promises';
import * as ejs from "ejs";
import * as p from '@clack/prompts';
import * as sh from "sync-exec";
const exec = sh.default;
import color from 'picocolors';

const fakeSend = {
  send: (json) => console.log(json),
  sendStatus: (data) => console.log(data) 
}
// standardize merlin statements visually
function merlinSays(text) {
  return `${color.yellow(color.bgBlack(` 🧙 Merlin: `))} ${color.bgBlack(color.green(` ${text} `))}`;
}
async function main() {
  console.clear();
  p.intro(`${color.bgBlack(color.gray(`Never`))}`);
  await setTimeout(300);
  p.intro(`${color.bgBlack(color.red(`     stop `))}`);
  await setTimeout(300);
  p.intro(`${color.bgBlack(color.white(`         never`))}`);
  await setTimeout(300);
  p.intro(`${color.bgBlack(color.green(`              stopping `))}`);
  await setTimeout(500);
  let colors = ['blue','yellow','red','magenta']
  for (let i in characters) {
    if (i < characters.length-1) {
      console.clear();
      p.intro(`${color.bgBlack(color[colors[i]](`Better future loading..`))}`);
      p.intro(color.bgBlack(color[colors[i]](characters[i])));
      let rockets = '';
      for (let step = 0; step < i; step++) {
        rockets += "🚀🚀🚀"
      }
      p.intro(rockets);
      await setTimeout((Math.random() * 400) + 150);
    }
  }
  console.clear();
  p.intro(color.bgBlack(color.green(characters.pop())))
  p.intro(`${color.bgGreen(color.black(`     The Web : CLI    `))}


${merlinSays('Welcome wary web wanderer')}`);
  // should be able to grab
  let value = await exec(`git config user.name`);
  let author = value.stdout.trim();
  // delay so that we clear and then let them visually react to change
  const siteData = await hax.systemStructureContext();
  // delay so that we clear and then let them visually react to change
// CLI works within context of the site if one is detected, otherwise we can do other thingss
  if (siteData) {
    p.intro(`${color.bgBlack(color.white(` HAXTheWeb : Site detected `))}`);
    p.intro(`${color.bgBlue(color.white(` Title: ${siteData.site.title} `))}`);
    let operation = { action: null };
    // infinite loop until quitting the cli
    while (operation.action !== 'quit') {
      operation = await p.group(
        {
          action: ({ results }) =>
            p.select({
              message: `Actions you can take`,
              options: [
                { value: 'stats', label: "Site stats" },
                { value: 'localhost', label: "Open Site (localhost)"},
                { value: 'node-add', label: "New Page"},
                { value: 'sync-git', label: "Sync code in git"},
                { value: 'publish', label: "Publish site to the web"},
                { value: 'quit', label: "🚪 Quit"},
              ],
            }),
        },
        {
          onCancel: () => {
            p.cancel('🧙 Merlin: Canceling CLI.. HAX ya later 🪄');
            process.exit(0);
          },
        });
      switch (operation.action) {
        case "stats":
          p.intro(`${color.bgBlue(color.white(` Title: ${siteData.site.title} `))}`);
          p.intro(`${color.bgBlue(color.white(` Description: ${siteData.site.description} `))}`);
          p.intro(`${color.bgBlue(color.white(` Pages: ${siteData.site.items.length} `))}`);  
        break;
        case "localhost":
          await exec(`cd ${siteData.path} && npx @haxtheweb/haxcms-nodejs`);
        break;
        case "node-add":
          // @todo add new page option
        break;
        case "sync-git":
          // @todo git sync might need other arguments / be combined with publishing
          await exec(`cd ${siteData.path} && git pull && git push`);
        break;
        case "publish":
          // @todo support other forms of publishing
          await exec(`cd ${siteData.path} && npm install --global surge && surge .`);
        break;
        case "quit":
          p.outro(`Have a great day! Ideas to HAX faster? ${color.underline(color.cyan('https://github.com/haxtheweb/issues'))}`);
        break;
      }
    }
  }
  else {
    let activeProject = null;
    let project = { type: null };
    while (project.type !== 'quit') {
      if (activeProject) {
        p.note(` 🧙🪄 BE GONE ${activeProject} sub-process daemon! 🪄 + ✨ 👹 = 💀 `);
      }
      project = await p.group(
        {
          type: ({ results }) =>
          p.select({
            message: activeProject ? `What should we build?` : `Thirsty for more? What should we create now?`,
            initialValue: 'haxsite',
            required: true,
            options: [
              { value: 'haxsite', label: '🏡 Create a new HAXcms site (single)'},
              { value: 'haxsite-multisite', label: '🏘️  Create a new HAXcms multi-site'},
              { value: 'webcomponent', label: '🏗️  Create a new Web component' },
              { value: 'quit', label: '🚪 Quit'},
            ],
          }),
        },
        {
          onCancel: () => {
            p.cancel('🧙🪄 Merlin: Leaving so soon? HAX ya later');
            process.exit(0);
          },
        }
      );
      activeProject = project.type;
      // silly but this way we don't have to take options for quitting
      if (project.type !== 'quit') {
        project = await p.group(
          {
            type: ({ results }) => {
              return new Promise((resolve, reject) => {
                resolve( activeProject);
              });
            },
            name: ({ results }) => {
              return p.text({
                message: results.type === "webcomponent" ? "Element Name:" : "Site name:",
                placeholder: results.type === "webcomponent" ? "my-element" : "mysite",
                validate: (value) => {
                  if (!value) {
                    return "Name is required (tab writes default)";
                  }
                  if (value.indexOf(' ') !== -1) {
                    return "No spaces allowed in project name";
                  }
                  if (results.type === "webcomponent" && value.indexOf('-') === -1 && value.indexOf('-') !== 0 && value.indexOf('-') !== value.length-1) {
                    return "Name must include at least one `-` and must not start or end name.";
                  }
                }
              });
            },
            path: ({ results }) => {
              let initialPath = `${process.cwd()}`;
              return p.text({
                message: `Where should I create the ${results.type === "webcomponent" ? "project" : "site"}?`,
                placeholder: initialPath,
                validate: (value) => {
                  if (!value) {
                    return "Path is required (tab writes default)";
                  }
                }
              });
            },
            author: ({ results }) => {
              return p.text({
                message: 'Author:',
                initialValue: author,
              });
            },
            extras: ({ results }) => {
              let options = [];
              let initialValues = [];
              if (results.type === "webcomponent") {
                options = [
                  { value: 'install', label: 'Install dependencies (via npm)', hint: 'recommended' },
                  { value: 'git', label: 'Put in version control (git)', hint: 'recommended' },
                  { value: 'launch', label: 'Launch project on creation', hint: 'recommended' },
                ];
                initialValues = ['install', 'git', 'launch']
              }
              else {
                options = [
                  { value: 'launch', label: 'Launch project on creation', hint: 'recommended' },
                ];
                initialValues = ['launch']
              }
              return p.multiselect({
                message: 'Additional setup options',
                initialValues: initialValues,
                options: options,
                required: false,
              })
            },
          },
          {
            onCancel: () => {
              p.cancel('🧙🪄 Merlin: Canceling CLI.. HAX ya later');
              process.exit(0);
            },
          }
        );
        // values not set but important for templating
        project.className = dashToCamel(project.name);
        project.version = await HAXCMS.getHAXCMSVersion();
        console.log(project);
        let s = p.spinner();
        await setTimeout(250);
        // we can do this if it's a multisite
        var site;
        // resolve site vs multi-site
        switch (project.type) {
          case 'haxsite':
            s.start(merlinSays(`Creating new site: ${project.name}`));
            //site = new hax.HAXCMSSite();
            //await site.newSite(project.path, '/', project.name);
            let siteRequest = {
              "site": {
                  "name": project.name,
                  "description": "own course",
                  "theme": "clean-one"
              },
              "build": {
                  "type": "own",
                  "structure": "course",
                  "items": null,
                  "files": null
              },
              "theme": {
                  "color": "green",
                  "icon": "av:library-add"
              },
            };
            HAXCMS.cliWritePath = `${project.path}`;
            hax.RoutesMap.post.createSite({body: siteRequest}, fakeSend);        
            s.stop(merlinSays(`Site created. I must say I still got it!`));
            await setTimeout(300);
          break;
          case 'haxsite-multisite':
            s.start(merlinSays(`Adding new site: ${project.name} to multi-site`));
            site = await HAXCMS.createSite(project.name);
            s.stop(merlinSays(`Site added to multi-site. Wow, That was fast..`));
            await setTimeout(300);
          break;
          case 'webcomponent':
            s.start(merlinSays('Copying project files'));
            // leverage this little helper from HAXcms
            await HAXCMS.recurseCopy(
              `${process.mainModule.path}/templates/${project.type}/hax/`,
              `${project.path}/${project.name}`
            );
            // rename paths that are of the element name in question
            await fs.renameSync(`${project.path}/${project.name}/src/webcomponent.js`, `${project.path}/${project.name}/src/${project.name}.js`);
            await fs.renameSync(`${project.path}/${project.name}/lib/webcomponent.haxProperties.json`, `${project.path}/${project.name}/lib/${project.name}.haxProperties.json`);
            s.stop(merlinSays('Files copied'));
            await setTimeout(300);
            s.start(merlinSays('Making files awesome'));
            for (const filePath of readAllFiles(`${project.path}/${project.name}`)) {
              try {
                // ensure we don't try to pattern rewrite image files
                if (!filePath.endsWith('.jpg') && !filePath.endsWith('.png')) {
                  const ejsString = ejs.fileLoader(filePath, 'utf8');
                  let content = ejs.render(ejsString, project);
                  // file written successfully  
                  fs.writeFileSync(filePath, content);
                }
              } catch (err) {
                console.error(filePath);
                console.error(err);
              }
            }
            s.stop('Files are now awesome!');
          break;
        }
      // options for install, git and other extras
        if (project.extras.includes('install')) {
          await setTimeout(250);
          s.start(merlinSays(`Let's install everything using magic (npm)`));
          await setTimeout(250);
          await exec(`cd ${project.path}/${project.name} && npm install`);
          await setTimeout(250);
          s.stop(merlinSays(`Everything is installed. It's go time`));
        }
        if (project.extras.includes('git')) {
          project.gitRepo = await p.text({
            message: 'Git Repo location:',
            placeholder: `git@github.com:${project.author}/${project.name}.git`
          });
          await exec(`cd ${project.path}/${project.name} && git init && git add -A && git commit -m "first commit" && git branch -M main${project.gitRepo != '' ? ` && git remote add origin ${project.gitRepo}` : ''}`);
        }
        // autolaunch if default was selected
        if (project.extras.includes('launch')) {
          p.note(`${merlinSays(`${project.name} is launching to work on.`)}
Merlin is in a sub-process running your ${project.type}
To get back to Merlin press: ${color.black(color.bgRed(`CTRL + C`))}`);
          let optionPath = project.path;
          if (project.type === "webcomponent") {
            await exec(`cd ${optionPath} && npm start`);
          }
          else {
            // resolve multi-site from single site pathing
            if (project.type === "haxsite") {
              optionPath += `/${project.name}`;
            }
            await exec(`cd ${optionPath} && npx @haxtheweb/haxcms-nodejs`);
          }
        }
        else {
          let nextSteps = `cd ${project.path}/${project.name} && `;
          switch (project.type) {
            case 'haxsite':
              nextSteps += `npx @haxtheweb/haxcms-nodejs`;
            break;
            case 'haxsite-multisite':
              nextSteps = `cd ${project.path} && npx @haxtheweb/haxcms-nodejs\n`;
            break;
            case 'webcomponent':
              nextSteps += `${project.extras.includes('install') ? '' : 'npm install &&'}npm start`;
            break;
          }
          p.note(`${project.name} is ready to go. Run the following to start development:`);
          p.outro(nextSteps);    
        }
      }
    }
    p.outro(`🔮 Ideas to HAX better, faster, stronger: ${color.underline(color.cyan('https://github.com/haxtheweb/issues'))}`);
    p.outro(`👔 Share on LinkedIn: ${color.underline(color.cyan('https://bit.ly/hax-linkedin'))}`);
    p.outro(`🧵 Share on X: ${color.underline(color.cyan('https://bit.ly/hax-x'))}`);
    p.outro(`💬 Join our Community: ${color.underline(color.cyan('https://bit.ly/hax-discord'))}`);
  }
}

main().catch(console.error);