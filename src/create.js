#!/usr/bin/env node
// forces middleware into CLI mode so we don't automatically perform certain operations like pathing context
process.env.haxcms_middleware = "node-cli";

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as p from '@clack/prompts';
import color from 'picocolors';

import { haxIntro, communityStatement, merlinSays } from "./lib/statements.js";
import { dashToCamel } from './lib/utils.js';
import { webcomponentProcess } from "./lib/programs/webcomponent.js";
import { siteProcess } from "./lib/programs/site.js";

import * as hax from "@haxtheweb/haxcms-nodejs";
import * as haxcmsNodejsCli from "@haxtheweb/haxcms-nodejs/dist/cli.js";
const HAXCMS = hax.HAXCMS;

import * as child_process from "child_process";
import * as util from "node:util";
import { program } from "commander";
const exec = util.promisify(child_process.exec);

var sysSurge = true;
exec('surge --version', error => {
  if (error) {
    sysSurge = false;
  }
});

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
  .option('--path <char>', 'where to perform operation') // path
  .option('--npm-client <char>', 'npm client to use (must be installed) npm, yarn, pnpm', 'npm') // npm yarn pnpm etc
  .option('--y', 'yes to all questions') // skip steps
  .option('--skip', 'skip frills like animations') // skip steps
  .option('--auto', 'yes to all questions, alias of y') // select defaults whenever possible

  .option('--name <char>', 'name of the project') // site / webcomponent name
  .option('--title <char>', 'node title', 'new page') // page title
  .option('--domain <char>', 'published domain name') // site / webcomponent name
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
  program
  .command('site')
  .argument('[action]', 'action to take')
  .action((action) => {
    commandRun = {
      command: 'site',
      arguments: {
        action: action
      },
      options: {
        skip: true,
        y: (action) ? true : false
      }
    };
  })
  .option('--name <char>', 'name of the project') // site / webcomponent name
  .option('--title <char>', 'node title', 'new page') // page title
  .option('--domain <char>', 'published domain name') // site / webcomponent name
  .version(await HAXCMS.getHAXCMSVersion());

  // webcomponent program
  program
  .command('webcomponent')
  .description('Create Lit based web components, with HAX recommendations')
  .argument('[name]', 'name of the project') // site / webcomponent name
  .action((name) => {
    commandRun = {
      command: 'webcomponent',
      arguments: {
        name: name
      },
      options: {
        skip: true,
        y: (name) ? true : false
      }
    };
  })
  .option('--org <char>', 'organization for package.json') // organization name
  .option('--author <char>', 'author for site / package.json'); // organization name

  // process program arguments
  program.parse();
  commandRun.options = {...commandRun.options, ...program.opts()};
  console.log(commandRun);
  // auto and y assume same thing
  if (commandRun.options.y || commandRun.options.auto) {
    commandRun.options.y = true;
    commandRun.options.auto = true;
  }
  if (!commandRun.options.y && !commandRun.options.auto && !commandRun.options.skip) {
    await haxIntro();
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
  if (commandRun.options.auto) {
    commandRun.options.path = process.cwd();
    commandRun.options.org = '';
    commandRun.options.author = author;
  }
  var port = "3000";
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
        packageData = JSON.parse(fs.readFileSync(`${process.cwd()}/package.json`));
        // assume we are working on a web component / existing if we find this key
        if (packageData.hax && packageData.hax.cli) {
          commandRun.program = 'webcomponent';
        }
        // leverage these values if they exist downstream
        if (packageData.npmClient) {
          commandRun.options.npmClient = packageData.npmClient;
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
  var siteData = await hax.systemStructureContext();
  // delay so that we clear and then let them visually react to change
  // CLI works within context of the site if one is detected, otherwise we can do other thingss
  if (siteData) {
    // default to status unless already set so we don't issue a create in a create
    if (!commandRun.arguments.action) {
      commandRun.arguments.action = 'status';
    }
    p.intro(`${color.bgBlack(color.white(` HAXTheWeb : Site detected `))}`);
    commandRun.command = "site";
    p.intro(`${color.bgBlue(color.white(` Name: ${siteData.name} `))}`);
    // defaults if nothing set via CLI
    let operation = {
      ...commandRun.arguments,
      ...commandRun.options
    };
    console.log(commandRun.options.title);
    if (!commandRun.options.title) {
      commandRun.options.title = "New Page";
    }
    if (!commandRun.options.domain) {
      commandRun.options.domain = `haxcli-${siteData.name}.surge.sh`;
    }
    // infinite loop until quitting the cli
    while (operation.action !== 'quit') {
      let actions = [
        { value: 'status', label: "Site Status" },
        { value: 'localhost', label: "Open Site (localhost)"},
        { value: 'git:sync', label: "Sync code in git"},
        { value: 'node:add', label: "Add New Page"},
        { value: 'node:delete', label: "Delete Page"},
      ];
      if (sysSurge) {
        actions.push({ value: 'publish-surge', label: "Publish site using Surge.sh"});              
      }
      actions.push({ value: 'quit', label: "🚪 Quit"});
      if (!operation.action) {
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
      }
      switch (operation.action) {
        case "status":
          siteData = await hax.systemStructureContext();
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
        case "node:add":
          try {
            // @todo accept title if not supplied
            haxcmsNodejsCli.cliBridge('createNode', { site: siteData, node: { title: commandRun.options.title }});
            console.log(`"${commandRun.options.title}" added to site`);
          }
          catch(e) {
            console.log(e.stderr);
          }
        break;
        case "node:delete":
          try {
            // @todo need to supply a command here
            //haxcmsNodejsCli.cliBridge('deleteNode', { site: siteData, node: { id: id }});
            console.log(`"${commandRun.options.title}" added to site`);
          }
          catch(e) {
            console.log(e.stderr);
          }
        break;
        case "git:sync":
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
            // @todo should provide an option for setting the domain
            let execOutput = await exec(`cd ${siteData.directory} && surge . ${operation.domain}`);
            console.log(execOutput.stdout.trim());
          }
          catch(e) {
            console.log(e.stderr);
          }
        break;
        case "quit":
          // quit
        process.exit(0);
        break;
      }
      if (commandRun.options.y) {
        process.exit(0);
      }
      operation.action = null;
    }
    communityStatement();
  }
  else if (packageData && packageData.hax && packageData.hax.cli && packageData.scripts.start) {
    port = "8000";
    p.intro(`${color.bgBlack(color.white(` HAXTheWeb : Webcomponent detected `))}`);
    p.intro(`${color.bgBlue(color.white(` Name: ${packageData.name} `))}`);
    p.note(`${merlinSays(`I have summoned a sub-process daemon 👹`)}
    
    🚀  Running your ${color.bold('webcomponent')} ${color.bold(packageData.name)}:
          ${color.underline(color.cyan(`http://localhost:${port}`))}
    
    🏠  Launched: ${color.underline(color.bold(color.yellow(color.bgBlack(`${process.cwd()}`))))}
    💻  Folder: ${color.bold(color.yellow(color.bgBlack(`cd ${process.cwd()}`)))}
    📂  Open folder: ${color.bold(color.yellow(color.bgBlack(`open ${process.cwd()}`)))}
    📘  VS Code Project: ${color.bold(color.yellow(color.bgBlack(`code ${process.cwd()}`)))}
    🚧  Launch later: ${color.bold(color.yellow(color.bgBlack(`${commandRun.options.npmClient} start`)))}
    
    ⌨️  To exit 🧙 Merlin press: ${color.bold(color.black(color.bgRed(` CTRL + C `)))}
    `);
    try {
      // ensure it's installed first, unless it's a monorepo
      if (!commandRun.options.isMonorepo) {
        let s = p.spinner();
        s.start(merlinSays(`Installation magic (${commandRun.options.npmClient} install)`));
        await exec(`${commandRun.options.npmClient} install`);
        s.stop(merlinSays(`Everything is installed. It's go time`));
      }
      await exec(`${commandRun.options.npmClient} start`);
    }
    catch(e) {
      // don't log bc output is odd
    }
  }
  else {
    let activeProject = null;
    let project = { type: null };
    while (project.type !== 'quit') {
      if (activeProject) {
        p.note(` 🧙🪄 BE GONE ${color.bold(color.black(color.bgGreen(activeProject)))} sub-process daemon! 🪄 + ✨ 👹 = 💀 `);
        commandRun.options = {};
      }
      if (['site', 'webcomponent'].includes(commandRun.command)) {
        project = {
          type: commandRun.command
        };
      }
      else {
        project = await p.group(
          {
            type: ({ results }) =>
            p.select({
              message: !activeProject ? `What should we build?` : `Thirsty for more? What should we create now?`,
              initialValue: 'webcomponent',
              required: true,
              options: [
                { value: 'webcomponent', label: '🏗️ Create a Web Component' },
                { value: 'site', label: '🏡 Create a HAXcms site (single)'},
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
              if (!commandRun.options.path && !commandRun.options.auto) {
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
              if (!commandRun.arguments.name) {
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
              if (results.type === "webcomponent" && !commandRun.options.org && !commandRun.options.auto) {
                // @todo detect mono repo and automatically add this
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
              if (!commandRun.options.author && !commandRun.options.auto) {
                return p.text({
                  message: 'Author:',
                  required: false,
                  initialValue: author,
                });
              }
            },
            extras: ({ results }) => {
              if (!commandRun.options.auto  && !commandRun.options.skip) {
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
        project = {
          isMonorepo: false,
          ...project,
          ...commandRun.options,
        };
        // auto select operations to perform if requested
        if (project.auto) {
          let extras = ['launch'];
          if (project.type === "webcomponent") {
            extras = ['launch', 'install', 'git'];
            if (!sysGit || project.isMonorepo) {
              extras.pop();
            }
          }
          project.extras = extras;
        }
        // values not set by user but used in templating
        project.className = dashToCamel(project.name);
        project.year = new Date().getFullYear();
        project.version = await HAXCMS.getHAXCMSVersion();
        // resolve site vs multi-site
        switch (project.type) {
          case 'site':
            siteProcess(commandRun, project, port);
          break;
          case 'webcomponent':
            port = "8000";
            webcomponentProcess(commandRun, project, port);
          break;
        }
      }
    }
    communityStatement();
  }
}

main().catch(console.error);