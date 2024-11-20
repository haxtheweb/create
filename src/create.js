#!/usr/bin/env node
// forces middleware into CLI mode so we don't automatically perform certain operations like pathing context
process.env.haxcms_middleware = "node-cli";

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as p from '@clack/prompts';
import color from 'picocolors';

import { haxIntro, communityStatement } from "./lib/statements.js";
import { webcomponentProcess, webcomponentCommandDetected } from "./lib/programs/webcomponent.js";
import { siteActions, siteNodeOperations, siteProcess, siteCommandDetected } from "./lib/programs/site.js";
import { camelToDash } from "./lib/utils.js";
import * as hax from "@haxtheweb/haxcms-nodejs";
const HAXCMS = hax.HAXCMS;

import * as child_process from "child_process";
import * as util from "node:util";
import { program } from "commander";
const exec = util.promisify(child_process.exec);

let sysGit = true;
exec('git --version', error => {
  if (error) {
    sysGit = false;
  }
});

async function main() {
  var commandRun = {};
  program
  .option('--')
  .option('--v', 'Verbose output')
  .option('--debug', 'Output for developers')
  .option('--format <char>', 'Output format; json (default), yaml')
  .option('--path <char>', 'where to perform operation')
  .option('--npm-client <char>', 'npm client to use (must be installed) npm, yarn, pnpm', 'npm')
  .option('--y', 'yes to all questions')
  .option('--skip', 'skip frills like animations')
  .option('--auto', 'yes to all questions, alias of y')
  .option('--no-i', 'prevent interactions / sub-process, good for scripting')
  .option('--to-file <char>', 'redirect command output to a file')

  // options for webcomponent
  .option('--org <char>', 'organization for package.json')
  .option('--author <char>', 'author for site / package.json')
  .option('--writeHaxProperties', 'Write haxProperties for the element')

  // options for site
  .option('--import-site <char>', 'URL of site to import')
  .option('--import-structure <char>', `import method to use:\n\rpressbooksToSite\n\relmslnToSite\n\rhaxcmsToSite\n\rnotionToSite\n\rgitbookToSite\n\revolutionToSite\n\rhtmlToSite\n\rdocxToSite`)
  .option('--node-op <char>', 'node operation to perform')
  .option('--item-id <char>', 'node ID to operate on')
  .option('--name <char>', 'name of the project')
  .option('--domain <char>', 'published domain name')
  .helpCommand(true);

  // default command which runs interactively
  program
  .command('start')
  .description('Interactive program to pick options')
  .action(() => {
    commandRun = {
      command: 'start',
      arguments: {},
      options: {}
    };
  });

  // site operations and actions
  let strActions = '';
  siteActions().forEach(action => {
    strActions+= `${action.value} - ${action.label}` + "\n\r";
  });
  let siteProg = program
  .command('site');
  siteProg
  .argument('[action]', 'Actions to perform on site include:' + "\n\r" + strActions)
  .action((action) => {
    commandRun = {
      command: 'site',
      arguments: {},
      options: {}
    };
    if (action) {
      commandRun.arguments.action = action;
      commandRun.options.skip = true;
    }
  })
  .option('--path <char>', 'path the project should be created in')
  .option('--import-site <char>', 'URL of site to import')
  .option('--import-structure <char>', `import method to use:\n\rpressbooksToSite\n\relmslnToSite\n\rhaxcmsToSite\n\rnotionToSite\n\rgitbookToSite\n\revolutionToSite\n\rhtmlToSite\n\rdocxToSite`)
  .option('--name <char>', 'name of the site (when creating a new one)')
  .option('--domain <char>', 'published domain name')
  .option('--node-op <char>', 'node operation to perform')
  .option('--no-i', 'prevent interactions / sub-process, good for scripting')
  .option('--to-file <char>', 'redirect command output to a file')
  .version(await HAXCMS.getHAXCMSVersion());
  let siteNodeOps = siteNodeOperations();
  for (var i in siteNodeOps) {
    program.option(`--${camelToDash(siteNodeOps[i].value)} <char>`, `${siteNodeOps[i].label}`)
    siteProg.option(`--${camelToDash(siteNodeOps[i].value)} <char>`, `${siteNodeOps[i].label}`)
  }
  
  // webcomponent program
  program
  .command('webcomponent')
  .description('Create Lit based web components, with HAX recommendations')
  .argument('[name]', 'name of the project')
  .action((name) => {
    commandRun = {
      command: 'webcomponent',
      arguments: {},
      options: {}
    };
    // if name set, populate
    if (name) {
      commandRun.arguments.name = name;
      commandRun.options.skip = true;
    }
  })
  .option('--path <char>', 'path the project should be created in')
  .option('--org <char>', 'organization for package.json')
  .option('--author <char>', 'author for site / package.json')
  .option('--writeHaxProperties', 'Write haxProperties for the element')
  .option('--to-file <char>', 'redirect command output to a file')
  .option('--no-i', 'prevent interactions / sub-process, good for scripting');
  // process program arguments
  program.parse();
  commandRun.options = {...commandRun.options, ...program.opts()};
  if (commandRun.options.debug) {
    console.log(commandRun);
  }
  // auto and y assume same thing
  if (commandRun.options.y || commandRun.options.auto) {
    commandRun.options.y = true;
    commandRun.options.auto = true;
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
  // only set path if not already set
  if (!commandRun.options.path && commandRun.options.skip) {
    commandRun.options.path = process.cwd();
  }
  // if we skip stuff then set org/author automatically
  if (commandRun.options.skip || commandRun.options.auto) { 
    if (!commandRun.options.org) {
      commandRun.options.org = '';
    }
    if (!commandRun.options.author) {
      commandRun.options.author = author;
    }
  }
  let packageData = {};
  let testPackages = [
    path.join(process.cwd(), 'package.json'),
    path.join(process.cwd(), '../', 'package.json'),
    path.join(process.cwd(), '../', '../', 'package.json'),
  ]
  // test within reason, for package.json files seeing if anything is available to suggest
  // that we might be in a local package or a monorepo.
  while (testPackages.length > 0) {
    let packLoc = testPackages.shift();
    if (fs.existsSync(packLoc)) {
      try {
        packageData = {...JSON.parse(fs.readFileSync(packLoc)), ...packageData};
        // assume we are working on a web component / existing if we find this key
        if (packageData.hax && packageData.hax.cli) {
          commandRun.program = 'webcomponent';
        }
        // leverage these values if they exist downstream
        if (packageData.npmClient) {
          commandRun.options.npmClient = packageData.npmClient;
        }
        else {
          commandRun.options.npmClient = 'npm';
        }
        // see if we're in a monorepo
        if (packageData.useWorkspaces && packageData.workspaces && packageData.workspaces.packages && packageData.workspaces.packages[0]) {
          p.intro(`${color.bgBlack(color.white(` Monorepo detected : Setting relative defaults `))}`);
          commandRun.options.isMonorepo = true;
          commandRun.options.auto = true;
          // assumed if monorepo
          commandRun.command = 'webcomponent';
          commandRun.options.path = path.join(process.cwd(), packageData.workspaces.packages[0].replace('/*',''));
          if (packageData.orgNpm) {
            commandRun.options.org = packageData.orgNpm;
          }
          commandRun.options.gitRepo = packageData.repository.url;
          commandRun.options.author = packageData.author.name ? packageData.author.name : author;
        }
      } catch (err) {
        console.error(err)
      }
    }
  }
  if (commandRun.options.debug) {
    console.log(packageData);
  }
  // CLI works within context of the site if one is detected, otherwise we can do other thingss
  if (await hax.systemStructureContext()) {
    commandRun.program = 'site';
    commandRun.options.skip = true;
    await siteCommandDetected(commandRun);
  }
  else if (packageData && (packageData.customElements || packageData.hax && packageData.hax.cli) && packageData.scripts.start) {
    commandRun.program = 'webcomponent';
    commandRun.options.skip = true;
    await webcomponentCommandDetected(commandRun, packageData);
  }
  else {
    if (commandRun.command === 'start' && !commandRun.options.y && !commandRun.options.auto && !commandRun.options.skip) {
      await haxIntro();
    }
    let activeProject = null;
    let project = { type: null };
    while (project.type !== 'quit') {
      if (activeProject) {
        p.note(` 🧙🪄 BE GONE ${color.bold(color.black(color.bgGreen(activeProject)))} sub-process daemon! 🪄 + ✨ 👹 = 💀 `);
        // ensure if we were automatically running the command we end
        if (commandRun.options.y) {
          communityStatement();
          process.exit(0);
        }
        // otherwise null to reset the program to run again
        commandRun = {
          command: null,
          arguments: {},
          options: {}
        };
      }
      if (['site', 'webcomponent'].includes(commandRun.command)) {
        project = {
          type: commandRun.command
        };
      }
      else if (commandRun.options.i) {
        project = await p.group(
          {
            type: ({ results }) =>
            p.select({
              message: !activeProject ? `What should we build?` : `Thirsty for more? What should we create now?`,
              initialValue: 'webcomponent',
              required: true,
              options: [
                { value: 'webcomponent', label: '🏗️ Create a Web Component' },
                { value: 'site', label: '🏡 Create a HAXsite'},
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
      else if (!commandRun.options.i) {
        process.exit(0);
      }
      // detect being in a haxcms scaffold. easiest way is _sites being in this directory
      // set the path automatically so we skip the question
      if ((commandRun.command === "site") && fs.existsSync(`${process.cwd()}/_sites`)) {
        p.intro(`${color.bgBlack(color.white(` HAXcms detected : Path set automatically `))}`);
        commandRun.options.path = `${process.cwd()}/_sites`;
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
              if (!commandRun.options.path && !commandRun.options.auto && !commandRun.options.skip) {
                return p.text({
                  message: `What folder will your ${(commandRun.command === "webcomponent" || results.type === "webcomponent") ? "project" : "site"} live in?`,
                  placeholder: initialPath,
                  required: true,
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
              if (!commandRun.arguments.action && !commandRun.arguments.name) {
                let placeholder = "mysite";
                let message = "Site name:";
                if (commandRun.command === "webcomponent" || results.type === "webcomponent") {
                  placeholder = "my-element";
                  message = "Element name:";
                }
                return p.text({
                  message: message,
                  placeholder: placeholder,
                  required: true,
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
                    if (commandRun.options.path) {
                      joint = commandRun.options.path;
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
              if (results.type === "webcomponent" && !commandRun.options.org && !commandRun.options.auto && !commandRun.options.skip) {
                let initialOrg = '@yourOrganization';
                return p.text({
                  message: 'Organization:',
                  placeholder: initialOrg,
                  required: false,
                  validate: (value) => {
                    if (value && !value.startsWith('@')) {
                      return "Organizations are not required, but organizations must start with @ if used";
                    }
                  }
                });  
              }
            },
            author: ({ results }) => {
              if (!commandRun.options.author && !commandRun.options.auto && !commandRun.options.skip) {
                return p.text({
                  message: 'Author:',
                  required: false,
                  initialValue: author,
                });
              }
            },
            extras: ({ results }) => {
              if (!commandRun.options.auto && commandRun.options.i) {
                let options = [];
                let initialValues = [];
                if (commandRun.command === "webcomponent" || results.type === "webcomponent") {
                  options = [
                    { value: 'launch', label: 'Launch project', hint: 'recommended' },
                    { value: 'install', label: `Install dependencies via ${commandRun.options.npmClient}`, hint: 'recommended' },
                    { value: 'git', label: 'Apply version control via git', hint: 'recommended' },
                  ];
                  initialValues = ['launch', 'install', 'git']
                  if (!sysGit || commandRun.options.isMonorepo) {
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
        // merge cli options with project options assume this is NOT a monorepo
        // but spread will overwrite if needed
        if (commandRun.command === 'webcomponent' && !commandRun.arguments.name) {
          project = {
            isMonorepo: false,
            ...project,
            ...commandRun.options,
          };
        }
        else {
          project = {
            isMonorepo: false,
            ...project,
            ...commandRun.arguments,
            ...commandRun.options,
          };
        }
        project.year = new Date().getFullYear();
        project.version = await HAXCMS.getHAXCMSVersion();
        // resolve site vs multi-site
        switch (project.type) {
          case 'site':
            if (!project.name && commandRun.arguments.action) {
              project.name = commandRun.arguments.action;
            }
            // only set path if not already set
            if (!commandRun.options.path) {
              commandRun.options.path = process.cwd();
              project.path = commandRun.options.path;
            }
            await siteProcess(commandRun, project);
          break;
          case 'webcomponent':
            await webcomponentProcess(commandRun, project);
          break;
        }
      }
    }
    communityStatement();
  }
}

main().catch(console.error);