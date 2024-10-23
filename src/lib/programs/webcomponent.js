#!/usr/bin/env node

import * as fs from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import * as ejs from "ejs";
import * as p from '@clack/prompts';
import color from 'picocolors';

import { merlinSays } from "../statements.js";
import { readAllFiles } from '../utils.js';
import * as hax from "@haxtheweb/haxcms-nodejs";
const HAXCMS = hax.HAXCMS;

import * as child_process from "child_process";
import * as util from "node:util";
const exec = util.promisify(child_process.exec);

export async function webcomponentProcess(commandRun, project, port) {
    // option to build github repo link for the user
    if (project.extras.includes('git')) {
        // @todo need to support git@ and https methods
        if (commandRun.options.auto) {
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
      let command = `${commandRun.options.npmClient} start`;
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