#!/usr/bin/env node
// forces middleware into CLI mode so we don't automatically perform certain operations like pathing context
process.env.haxcms_middleware = "node-cli";

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import * as ejs from "ejs";
import * as p from '@clack/prompts';
import color from 'picocolors';

import { haxIntro, communityStatement, merlinSays } from "./lib/statements.js";
import { readAllFiles, dashToCamel } from './lib/utils.js';
import * as hax from "@haxtheweb/haxcms-nodejs";
const HAXCMS = hax.HAXCMS;

import * as child_process from "child_process";
import * as util from "node:util";
import { program } from "commander";
const exec = util.promisify(child_process.exec);
const fakeSend = {
  send: (json) => console.log(json),
  sendStatus: (data) => console.log(data) 
}
var hasGit = true;
exec('git --version', error => {
  if (error) {
    hasGit = false;
  }
});
var hasSurge = true;
exec('surge --version', error => {
  if (error) {
    hasSurge = false;
  }
});


async function main() {
  program
  .option('--y') // skip steps
  .option('--skip') // skip steps
  .option('--auto') // select defaults whenever possible
  .option('--type <char>') // haxsite, haxcms, webcomponent
  .option('--name <char>') // project name
  .option('--org <char>') // organization name
  .option('--author <char>') // organization name
  .option('--path <char>') // path
  .option('--npmClient <char>') // npm yarn pnpm etc
  .option('--');
  program.parse();
  var cliOptions = program.opts();
  if (!cliOptions.y && !cliOptions.auto && !cliOptions.skip) {
    await haxIntro();
  }
  if (!cliOptions.npmClient) {
    cliOptions.npmClient = 'npm';
  }
  let author = '';
  // should be able to grab if not predefined
  try {
    let value = await exec(`git config user.name`);
    author = value.stdout.trim();
  }
  catch(e) {
    console.log('git user name not configured. Run the following to do this:');
    console.log('git config --global user.name "namehere"');
    console.log('git config --global user.email "email@here');
  }
  if (cliOptions.auto) {
    cliOptions.path = process.cwd();
    cliOptions.org = '';
    cliOptions.author = author;
  }
  var port = "3000";
  // delay so that we clear and then let them visually react to change
  const siteData = await hax.systemStructureContext();
  let packageData = {};
  if (`${process.cwd()}/package.json`) {
    try {
      packageData = JSON.parse(fs.readFileSync(`${process.cwd()}/package.json`));
      // leverage these values if they exist downstream
      if (packageData.npmClient) {
        cliOptions.npmClient = packageData.npmClient;
      }
      // see if we're in a monorepo
      if (packageData.useWorkspaces && packageData.workspaces && packageData.workspaces.packages && packageData.workspaces.packages[0]) {
        p.intro(`${color.bgBlack(color.white(` Monorepo detected : Setting relative defaults `))}`);
        cliOptions.isMonorepo = true;
        cliOptions.auto = true;
        // assumed if monorepo
        cliOptions.type = 'webcomponent';
        cliOptions.path = path.join(process.cwd(), packageData.workspaces.packages[0].replace('/*','/'));
        if (packageData.orgNpm) {
          cliOptions.org = packageData.orgNpm;
        }
        cliOptions.gitRepo = packageData.repository.url;
        cliOptions.author = packageData.author.name ? packageData.author.name : author;
      }
    } catch (err) {
      console.error(err)
    }
  }
  // delay so that we clear and then let them visually react to change
  // CLI works within context of the site if one is detected, otherwise we can do other thingss
  if (siteData) {
    p.intro(`${color.bgBlack(color.white(` HAXTheWeb : Site detected `))}`);
    p.intro(`${color.bgBlue(color.white(` Name: ${siteData.name} `))}`);
    let operation = { action: null };
    // infinite loop until quitting the cli
    while (operation.action !== 'quit') {
      let actions = [
        { value: 'status', label: "Site Status" },
        { value: 'localhost', label: "Open Site (localhost)"},
        { value: 'sync-git', label: "Sync code in git"},
        //{ value: 'node-add', label: "New Page"},
      ];
      if (hasSurge) {
        actions.push({ value: 'publish-surge', label: "Publish site using Surge.sh"});              
      }
      actions.push({ value: 'quit', label: "🚪 Quit"});
      operation = await p.group(
        {
          action: ({ results }) =>
            p.select({
              message: `Actions you can take`,
              options: actions,
            }),
        },
        {
          onCancel: () => {
            p.cancel('🧙 Merlin: Canceling CLI.. HAX ya later 🪄');
            communityStatement();
            process.exit(0);
          },
        });
      switch (operation.action) {
        case "status":
          p.intro(`${color.bgBlue(color.white(` Title: ${siteData.manifest.title} `))}`);
          p.intro(`${color.bgBlue(color.white(` Description: ${siteData.manifest.description} `))}`);
          p.intro(`${color.bgBlue(color.white(` Pages: ${siteData.manifest.items.length} `))}`);  
        break;
        case "localhost":
          try {
            await exec(`cd ${siteData.directory} && npx @haxtheweb/haxcms-nodejs`);
          }
          catch(e) {
            console.log(e.stderr);
          }
        break;
        case "node-add":
          // @todo add new page option
          try {
            //await exec(`${cliOptions.npmClient} run haxcms-nodejs-cli --site=${siteData.name} --op=createNode --nodeTitle=New`);
          }
          catch(e) {
            console.log(e.stderr);
          }
        break;
        case "sync-git":
          // @todo git sync might need other arguments / be combined with publishing
          try {
            await exec(`cd ${siteData.directory} && git pull && git push`);
          }
          catch(e) {
            console.log(e.stderr);
          }
        break;
        case "publish-surge":
          try {
            await exec(`cd ${siteData.directory} && ${cliOptions.npmClient} install --global surge && surge .`);
          }
          catch(e) {
            console.log(e.stderr);
          }
        break;
        case "quit":
          // quit
        break;
      }
    }
  }
  else if (packageData && packageData.haxcli && packageData.scripts.start) {
    p.intro(`${color.bgBlack(color.white(` HAXTheWeb : Webcomponent detected `))}`);
    p.intro(`${color.bgBlue(color.white(` Name: ${packageData.name} `))}`);
    port = "8000";
    p.note(`${merlinSays(`I have summoned a sub-process daemon 👹`)}
    
    🚀  Running your ${color.bold('webcomponent')} ${color.bold(packageData.name)}:
          ${color.underline(color.cyan(`http://localhost:${port}`))}
    
    🏠  Launched: ${color.underline(color.bold(color.yellow(color.bgBlack(`${process.cwd()}`))))}
    💻  Folder: ${color.bold(color.yellow(color.bgBlack(`cd ${process.cwd()}`)))}
    📂  Open folder: ${color.bold(color.yellow(color.bgBlack(`open ${process.cwd()}`)))}
    📘  VS Code Project: ${color.bold(color.yellow(color.bgBlack(`code ${process.cwd()}`)))}
    🚧  Launch later: ${color.bold(color.yellow(color.bgBlack(`${cliOptions.npmClient} start`)))}
    
    ⌨️  To exit 🧙 Merlin press: ${color.bold(color.black(color.bgRed(` CTRL + C `)))}
    `);
    try {
      let s = p.spinner();
      s.start(merlinSays(`Installation magic (${cliOptions.npmClient} install)`));
      await exec(`${cliOptions.npmClient} install`);
      s.stop(merlinSays(`Everything is installed. It's go time`));
      // ensure it's installed first
      await exec(`${cliOptions.npmClient} start`);
    }
    catch(e) {
      // don't log bc output is weird
    }
  }
  else {
    let activeProject = null;
    let project = { type: null };
    while (project.type !== 'quit') {
      if (activeProject) {
        p.note(` 🧙🪄 BE GONE ${color.bold(color.black(color.bgGreen(activeProject)))} sub-process daemon! 🪄 + ✨ 👹 = 💀 `);
        cliOptions = {};
      }
      if (['haxsite', 'haxcms', 'webcomponent'].includes(cliOptions.type)) {
        project = {
          type: cliOptions.type
        };
      }
      else {
        project = await p.group(
          {
            type: ({ results }) =>
            p.select({
              message: !activeProject ? `What should we build?` : `Thirsty for more? What should we create now?`,
              initialValue: 'haxsite',
              required: true,
              options: [
                { value: 'haxsite', label: '🏡 Create a HAXcms site (single)'},
                { value: 'haxcms', label: '🏘️  Create a HAXcms (multiple)'},
                { value: 'webcomponent', label: '🏗️  Create a Web Component' },
                { value: 'quit', label: '🚪 Quit'},
              ],
            }),
          },
          {
            onCancel: () => {
              p.cancel('🧙🪄 Merlin: Leaving so soon? HAX ya later');
              communityStatement();
              process.exit(0);
            },
          }
        );
      }
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
              if (!cliOptions.path && !cliOptions.auto) {
                return p.text({
                  message: `What folder will your ${(cliOptions.type === "webcomponent" || results.type === "webcomponent") ? "project" : "site"} live in?`,
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
              }
            },
            name: ({ results }) => {
              if (!cliOptions.name) {
                let placeholder = "mysite";
                let message = "Site name:";
                if (cliOptions.type === "webcomponent" ||results.type === "webcomponent") {
                  placeholder = "my-element";
                  message = "Element name:";
                }
                else if (cliOptions.type === "haxcms" ||results.type === "haxcms") {
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
                    if (/^\d/.test(value)) {
                      return "Name cannot start with a number";
                    }
                    if (value.indexOf(' ') !== -1) {
                      return "No spaces allowed in project name";
                    }
                    if (results.type === "webcomponent" && value.indexOf('-') === -1 && value.indexOf('-') !== 0 && value.indexOf('-') !== value.length-1) {
                      return "Name must include at least one `-` and must not start or end name.";
                    }
                    // assumes auto was selected in CLI
                    let joint = process.cwd();
                    if (cliOptions.path) {
                      joint = cliOptions.path;
                    }
                    else if (results.path) {
                      joint = results.path;
                    }
                    if (fs.existsSync(path.join(joint, value))) {
                      return `${path.join(joint, value)} exists, rename this project`;
                    }
                  }
                });  
              }
            },
            org: ({ results }) => {
              if (results.type === "webcomponent" && !cliOptions.org && !cliOptions.auto) {
                // @todo detect mono repo and automatically add this
                let initialOrg = '';
                return p.text({
                  message: 'Organization:',
                  placeholder: initialOrg,
                  validate: (value) => {
                    if (value && !value.startsWith('@')) {
                      return "Organizations are not required, but organizations must start with @ if used";
                    }
                  }
                });  
              }
            },
            author: ({ results }) => {
              if (!cliOptions.author && !cliOptions.auto) {
                return p.text({
                  message: 'Author:',
                  initialValue: author,
                });
              }
            },
            extras: ({ results }) => {
              if (!cliOptions.auto  && !cliOptions.skip) {
                let options = [];
                let initialValues = [];
                if (cliOptions.type === "webcomponent" || results.type === "webcomponent") {
                  options = [
                    { value: 'launch', label: 'Launch project', hint: 'recommended' },
                    { value: 'install', label: `Install dependencies via ${cliOptions.npmClient}`, hint: 'recommended' },
                    { value: 'git', label: 'Apply version control via git', hint: 'recommended' },
                  ];
                  initialValues = ['launch', 'install', 'git']
                  if (!hasGit || cliOptions.isMonorepo) {
                    options.pop();
                    initialValues.pop();
                  }
                }
                else {
                  options = [
                    { value: 'launch', label: 'Launch project on creation', hint: 'recommended' },
                  ];
                  initialValues = ['launch']
                }
                return p.multiselect({
                  message: 'Additional setup',
                  initialValues: initialValues,
                  options: options,
                  required: false,
                })
              }
            },
          },
          {
            onCancel: () => {
              p.cancel('🧙🪄 Merlin: Canceling CLI.. HAX ya later');
              communityStatement();
              process.exit(0);
            },
          }
        );
        // merge cli options with project options
        project = {
          ...project,
          ...cliOptions,
        };
        // auto select operations to perform if requested
        if (cliOptions.auto) {
          let extras = ['launch'];
          if (project.type === "webcomponent") {
            extras = ['launch', 'install', 'git']
            if (!hasGit || cliOptions.isMonorepo) {
              extras.pop();
            }
          }
          project.extras = extras;
        }
        // values not set by user but used in templating
        project.className = dashToCamel(project.name);
        project.year = new Date().getFullYear();
        project.version = await HAXCMS.getHAXCMSVersion();
        let s = p.spinner();
        // resolve site vs multi-site
        switch (project.type) {
          case 'haxsite':
            s.start(merlinSays(`Creating new site: ${project.name}`));
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
          case 'haxcms-multiple':
            s.start(merlinSays(`Creating multisite: ${project.name}`));
            await fs.mkdirSync(`${project.path}/${project.name}`);
            await fs.mkdirSync(`${project.path}/${project.name}/_sites`);
            s.stop(merlinSays(`${project.name} is setup for multiple sites!`));
            await setTimeout(500);
          break;
          case 'webcomponent':
            port = "8000";
            // option to build github repo link for the user
            if (project.extras.includes('git')) {
              // @todo need to support git@ and https methods
              if (cliOptions.auto) {
                project.gitRepo = `https://github.com/${project.author}/${project.name}.git`;
              }
              else  {
                project.gitRepo = await p.text({
                  message: 'Git Repo location:',
                  placeholder: `https://github.com/${project.author}/${project.name}.git`
                });  
              }
              // if they supplied one and it has github in it, build a link automatically for ejs index
              if (project.gitRepo && project.gitRepo.includes('github.com')) {
                project.githubLink = project.gitRepo.replace('git@github.com:', 'https://github.com/').replace('.git', '');
              }
              else {
                project.githubLink = null;
              }
            }
            else {
              project.githubLink = null;
            }
            // if we have an org, add a / at the end so file name is written correctly
            if (project.org) {
              project.org += '/';
            }
            else {
              project.org = '';
            }
            
            s.start(merlinSays('Copying project files'));
            // leverage this little helper from HAXcms
            await HAXCMS.recurseCopy(
              `${process.mainModule.path}/templates/${project.type}/hax/`,
              `${project.path}/${project.name}`
            );
            // rename paths that are of the element name in question
            await fs.renameSync(`${project.path}/${project.name}/lib/webcomponent.haxProperties.json`, `${project.path}/${project.name}/lib/${project.name}.haxProperties.json`);
            // loop through and rename all the localization files
            fs.readdir(`${project.path}/${project.name}/locales/`, function (err, files) {
              if (err) {
                console.error("Could not list the directory.", err);
                process.exit(1);
              }
              files.forEach(async function (file, index) {
                await fs.renameSync(`${project.path}/${project.name}/locales/${file}`, `${project.path}/${project.name}/locales/${file.replace('webcomponent', project.name)}`);
              });
            });
            await fs.renameSync(`${project.path}/${project.name}/webcomponent.js`, `${project.path}/${project.name}/${project.name}.js`);
            await fs.renameSync(`${project.path}/${project.name}/test/webcomponent.test.js`, `${project.path}/${project.name}/test/${project.name}.test.js`);
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
        if (project.gitRepo) {
          try {
            await exec(`cd ${project.path}/${project.name} && git init && git add -A && git commit -m "first commit" && git branch -M main${project.gitRepo ? ` && git remote add origin ${project.gitRepo}` : ''}`);    
          }
          catch(e) {        
          }
        }
        // options for install, git and other extras
        // can't launch if we didn't install first so launch implies installation
        if (project.extras.includes('launch') || project.extras.includes('install')) {
          s.start(merlinSays(`Installation magic (${cliOptions.npmClient} install)`));
          try {
            // monorepos install from top but then still need to launch from local location
            if (!cliOptions.isMonorepo) {
              await exec(`cd ${project.path}/${project.name} && ${cliOptions.npmClient} install`);
            }
          }
          catch(e) {
            console.log(e);
          }
          s.stop(merlinSays(`Everything is installed. It's go time`));
        }
        // autolaunch if default was selected
        if (project.extras.includes('launch')) {
          let optionPath = `${project.path}/${project.name}`;
          let command = `npx @haxtheweb/haxcms-nodejs`;
          if (project.type === "webcomponent") {
            command = `${cliOptions.npmClient} start`;
          }
          p.note(`${merlinSays(`I have summoned a sub-process daemon 👹`)}

🚀  Running your ${color.bold(project.type)} ${color.bold(project.name)}:
      ${color.underline(color.cyan(`http://localhost:${port}`))}

🏠  Launched: ${color.underline(color.bold(color.yellow(color.bgBlack(`${optionPath}`))))}
💻  Folder: ${color.bold(color.yellow(color.bgBlack(`cd ${optionPath}`)))}
📂  Open folder: ${color.bold(color.yellow(color.bgBlack(`open ${optionPath}`)))}
📘  VS Code Project: ${color.bold(color.yellow(color.bgBlack(`code ${optionPath}`)))}
🚧  Launch later: ${color.bold(color.yellow(color.bgBlack(`${command}`)))}

⌨️  To resume 🧙 Merlin press: ${color.bold(color.black(color.bgRed(` CTRL + C `)))}
`);
          // at least a second to see the message print at all
          await setTimeout(1000);
          try {
            await exec(`cd ${optionPath} && ${command}`);
          }
          catch(e) {
            // don't log bc output is weird
          }
        }
        else {
          let nextSteps = `cd ${project.path}/${project.name} && `;
          switch (project.type) {
            case 'haxsite':
              nextSteps += `npx @haxtheweb/haxcms-nodejs`;
            break;
            case 'haxcms':
              nextSteps = `cd ${project.path} && npx @haxtheweb/haxcms-nodejs\n`;
            break;
            case 'webcomponent':
              nextSteps += `${project.extras.includes('install') ? '' : `${cliOptions.npmClient} install && `}${cliOptions.npmClient} start`;
            break;
          }
          p.note(`${project.name} is ready to go. Run the following to start development:`);
          p.outro(nextSteps);
        }
      }
    }
  }
  communityStatement();
}

main().catch(console.error);