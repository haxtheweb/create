#!/usr/bin/env node

import { setTimeout } from 'node:timers/promises';
import * as p from '@clack/prompts';
import color from 'picocolors';

import { merlinSays } from "../statements.js";
import * as hax from "@haxtheweb/haxcms-nodejs";
const HAXCMS = hax.HAXCMS;

import * as child_process from "child_process";
import * as util from "node:util";
const exec = util.promisify(child_process.exec);

const fakeSend = {
    send: (json) => console.log(json),
    sendStatus: (data) => console.log(data) 
  }

export async function siteProcess(commandRun, project, port) {
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