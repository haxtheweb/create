#!/usr/bin/env node

import { setTimeout } from 'node:timers/promises';
import * as p from '@clack/prompts';
import color from 'picocolors';

import { merlinSays, communityStatement } from "../statements.js";
import * as haxcmsNodejsCli from "@haxtheweb/haxcms-nodejs/dist/cli.js";
import * as hax from "@haxtheweb/haxcms-nodejs";
const HAXCMS = hax.HAXCMS;

import * as child_process from "child_process";
import * as util from "node:util";
const exec = util.promisify(child_process.exec);

var sysSurge = true;
exec('surge --version', error => {
  if (error) {
    sysSurge = false;
  }
});

const fakeSend = {
    send: (json) => console.log(json),
    sendStatus: (data) => console.log(data) 
  }

export async function siteCommandDetected(commandRun) {
    var siteData = await hax.systemStructureContext();
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
      if (!commandRun.options.title) {
        commandRun.options.title = "New Page";
      }
      if (!commandRun.options.domain &&  commandRun.options.y) {
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
          commandRun = {
            command: null,
            arguments: {},
            options: {}
          }
          // ensures data is updated and stateful per action
          siteData = await hax.systemStructureContext();
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
              if (!commandRun.options.title) {
                commandRun.options.title = await p.text({
                  message: `Title for this page`,
                  placeholder: "New page",
                  required: true,
                  validate: (value) => {
                    if (!value) {
                      return "Title must be set (tab writes default)";
                    }
                  }
                });
              }
              let resp = await haxcmsNodejsCli.cliBridge('createNode', { site: siteData, node: { title: commandRun.options.title }});
              if (commandRun.options.v) {
                console.log(resp.res.data);
              }
              console.log(`"${commandRun.options.title}" added to site`);
            }
            catch(e) {
              console.log(e.stderr);
            }
          break;
          case "node:delete":
            try {
              if (!commandRun.options.itemId) {
                commandRun.options.itemId = await p.select({
                  message: `Select an item to delete`,
                  required: true,
                  options: await siteItemsOptionsList(siteData),
                });
              }
              let resp = await haxcmsNodejsCli.cliBridge('deleteNode', { site: siteData, node: { id: commandRun.options.itemId }});
              if (resp.res.data === 500) {
                console.warn(`node:delete failed "${commandRun.options.itemId} not found`);
              }
              else {
                console.log(`"${commandRun.options.itemId}" deleted`);
              }
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
              if (!commandRun.options.domain) {
                commandRun.options.domain = await p.text({
                  message: `Domain for surge`,
                  defaultValue: `haxcli-${siteData.name}.surge.sh`,
                  required: true,
                  validate: (value) => {
                    if (!value) {
                      return "Domain must have a value";
                    }
                  }
                });
              }
              let execOutput = await exec(`cd ${siteData.directory} && surge . ${commandRun.options.domain}`);
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

// process site creation
export async function siteProcess(commandRun, project, port = '3000') {
    // auto select operations to perform if requested
    if (!project.extras) {
        let extras = ['launch'];
        project.extras = extras;
    }
    let s = p.spinner();
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

    if (project.gitRepo && !commandRun.options.isMonorepo) {
        try {
        await exec(`cd ${project.path}/${project.name} && git init && git add -A && git commit -m "first commit" && git branch -M main${project.gitRepo ? ` && git remote add origin ${project.gitRepo}` : ''}`);    
        }
        catch(e) {        
        }
      }
      // options for install, git and other extras
      // can't launch if we didn't install first so launch implies installation
      if (project.extras.includes('launch') || project.extras.includes('install')) {
          s.start(merlinSays(`Installation magic (${commandRun.options.npmClient} install)`));
          try {
          // monorepos install from top but then still need to launch from local location
          if (!commandRun.options.isMonorepo) {
              await exec(`cd ${project.path}/${project.name} && ${commandRun.options.npmClient} install`);
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
        let nextSteps = `cd ${project.path}/${project.name} && ${project.extras.includes('install') ? '' : `${commandRun.options.npmClient} install && `}${commandRun.options.npmClient} start`;
        p.note(`${project.name} is ready to go. Run the following to start development:`);
        p.outro(nextSteps);
    }
}

export async function siteItemsOptionsList(siteData) {
    let items = [];
    for (var i in siteData.manifest.items) {
        items.push({
            value: siteData.manifest.items[i].id,
            label: siteData.manifest.items[i].title
        })
    }
    return items;
}