#!/usr/bin/env node
// forces middleware into CLI mode so we don't automatically perform certain operations like pathing context
process.env.haxcms_middleware = "node-cli";

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as hax from "@haxtheweb/haxcms-nodejs";
const HAXCMS = hax.HAXCMS;
import { characters } from './art.js';
import { readAllFiles, dashToCamel } from './utils.js';
import { setTimeout } from 'node:timers/promises';
import * as ejs from "ejs";
import * as p from '@clack/prompts';
import color from 'picocolors';
import * as child_process from "child_process";
import * as util from "node:util";
const exec = util.promisify(child_process.exec);
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
  p.intro(`${color.bgBlack(color.underline(color.gray(`Never`)))}`);
  await setTimeout(300);
  p.intro(`${color.bgBlack(color.red(`     stop `))}`);
  await setTimeout(300);
  p.intro(`${color.bgBlack(color.white(`         never`))}`);
  await setTimeout(300);
  p.intro(`${color.bgBlack(color.cyan(`              stopping `))}`);
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
  let author = '';
  try {
    let value = await exec(`git config user.name`);
    author = value.stdout.trim();
  }
  catch(e) {
    console.log(e);
  }
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
          try {
            await exec(`cd ${siteData.path} && npx @haxtheweb/haxcms-nodejs`);
          }
          catch(e) {

          }
        break;
        case "node-add":
          // @todo add new page option
        break;
        case "sync-git":
          // @todo git sync might need other arguments / be combined with publishing
          try {
            await exec(`cd ${siteData.path} && git pull && git push`);
          }
          catch(e) {
            console.log(e);
          }
        break;
        case "publish":
          // @todo support other forms of publishing
          try {
            await exec(`cd ${siteData.path} && npm install --global surge && surge .`);
          }
          catch(e) {
            console.log(e);
          }
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
            message: !activeProject ? `What should we build?` : `Thirsty for more? What should we create now?`,
            initialValue: 'haxcms',
            required: true,
            options: [
              { value: 'haxcms', label: '🏡 Create a HAXcms site (single)'},
              { value: 'haxcms-multisite', label: '🏘️  Create a HAXcms multi-site'},
              { value: 'webcomponent', label: '🏗️  Create a Web Component' },
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
            path: ({ results }) => {
              let initialPath = `${process.cwd()}`;
              return p.text({
                message: `What folder will your ${results.type === "webcomponent" ? "project" : "site"} live in?`,
                placeholder: initialPath,
                validate: (value) => {
                  if (!value) {
                    return "Path is required (tab writes default)";
                  }
                  if (!fs.existsSync(value)) {
                    return `${value} does not exist. Select a valid folder`;
                  }
                }
              });
            },
            name: ({ results }) => {
              let placeholder = "mysite";
              let message = "Site name:";
              if (results.type === "webcomponent") {
                placeholder = "my-element";
                message = "Element name:";
              }
              else if (results.type === "haxcms-multisite") {
                placeholder = "mysitefactory";
                message = "Site factory name:";
              }
              return p.text({
                message: message,
                placeholder: placeholder,
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
                  if (fs.existsSync(path.join(results.path, value))) {
                    return `${path.join(results.path, value)} exists, rename this project`;
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
                  { value: 'launch', label: 'Launch project on creation', hint: 'recommended (requires install)' },
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
        let s = p.spinner();
        // we can do this if it's a multisite
        var site;
        // resolve site vs multi-site
        switch (project.type) {
          case 'haxcms':
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
            await hax.RoutesMap.post.createSite({body: siteRequest}, fakeSend);        
            s.stop(merlinSays(`${project.name} created!`));
            await setTimeout(500);
          break;
          case 'haxcms-multisite':
            s.start(merlinSays(`Creating multisite: ${project.name}`));
            await fs.mkdirSync(`${project.path}/${project.name}`);
            s.stop(merlinSays(`${project.name} is setup to be a multi-site!`));
            await setTimeout(500);
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
            await setTimeout(500);
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
        if (project.extras.includes('git')) {
          project.gitRepo = await p.text({
            message: 'Git Repo location:',
            placeholder: `git@github.com:${project.author}/${project.name}.git`
          });
          try {
            await exec(`cd ${project.path}/${project.name} && git init && git add -A && git commit -m "first commit" && git branch -M main${project.gitRepo != '' ? ` && git remote add origin ${project.gitRepo}` : ''}`);    
          }
          catch(e) {        
          }
        }
        // options for install, git and other extras
        if (project.extras.includes('install')) {
          s.start(merlinSays(`Let's install everything using magic (npm)`));
          try {
            await exec(`cd ${project.path}/${project.name} && npm install`);
          }
          catch(e) {
            console.log(e);
          }
          s.stop(merlinSays(`Everything is installed. It's go time`));
        }
        // autolaunch if default was selected
        if (project.extras.includes('launch')) {
          p.note(`${merlinSays(`I have summoned a sub-process daemon 👹`)}
Running ${project.type}
Launched from: ${project.path}/${project.name}

To resume 🧙 Merlin press ⌨️: ${color.black(color.bgRed(`CTRL + C`))}
`);
          await setTimeout(2000);
          let optionPath = `${project.path}/${project.name}`;
          if (project.type === "webcomponent") {
            try {
              await exec(`cd ${optionPath} && npm start`);              
            }
            catch(e) {
            }
          }
          else {
            try {
             await exec(`cd ${optionPath} && npx @haxtheweb/haxcms-nodejs`);
            }
              catch(e) {
            }
          }
        }
        else {
          let nextSteps = `cd ${project.path}/${project.name} && `;
          switch (project.type) {
            case 'haxcms':
              nextSteps += `npx @haxtheweb/haxcms-nodejs`;
            break;
            case 'haxcms-multisite':
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
    p.outro(`
🔮  Ideas to HAX better, faster, stronger: ${color.underline(color.cyan('https://github.com/haxtheweb/issues'))}

👔  Share on LinkedIn: ${color.underline(color.cyan('https://bit.ly/hax-linkedin'))}

🧵  Share on X: ${color.underline(color.cyan('https://bit.ly/hax-x'))}

💬  Join our Community: ${color.underline(color.cyan('https://bit.ly/hax-discord'))}

`);
  }
}

main().catch(console.error);