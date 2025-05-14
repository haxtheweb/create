import * as fs from 'node:fs';
import { exec } from "../utils.js";
import open from 'open';

import * as p from '@clack/prompts';
import color from 'picocolors';
import { merlinSays } from "../statements.js";

let sysGit = true;
exec('which git', error => {
  if (error) {
    sysGit = false;
  }
});

let sysSSH = true;
exec('ssh -T git@github.com', (error, stdout, stderr) => {
  const output = stdout + stderr;
  // The GitHub SSH test always returns as stderr
  if (!output.includes('successfully authenticated')) {
    sysSSH = false;
  }
});

export function partyActions(){
    return [
      { value: 'docs', label: "View the HAX documentation"},
      { value: 'playground', label: "Explore HAX.cloud playground"},
      { value: 'psu', label: "Visit official hax.psu.edu site"},
      { value: 'issues', label: "Engage with HAX issues on GitHub"},
      { value: 'discord', label: "Join the HAX Discord community"},
      { value: 'club', label: "Check out HAX The Club at PSU"},
      { value: 'github', label: "Contribute to core development for HAX"},
    ];
  }

export async function partyCommandDetected(commandRun) {
  if (!commandRun.options.quiet) {
    p.intro(`${color.bgBlack(color.white(` HAXTheWeb : Party detected `))}`);
  }

  let actions = partyActions();

  let actionAssigned = false;
  // default to status unless already set so we don't issue a create in a create
  if (!commandRun.arguments.action) {
    actionAssigned = true;
    commandRun.arguments.action = 'party:status';
  }

  commandRun.command = "party";

  let operation = {
    ...commandRun.arguments,
    ...commandRun.options
  };

  actions.push({ value: 'quit', label: "🚪 Quit"});

  while (operation.action !== 'quit') {
    if (!operation.action) {
      commandRun = {
        command: null,
        arguments: {},
        options: { 
          // npmClient: `${operation.npmClient}`
        }
      }
      operation = await p.group(
        {
          action: ({ results }) =>
            p.select({
              message: `Actions you can take:`,
              defaultValue: actions[0],
              initialValue: actions[0],
              options: actions,
            }),
        },
        {
          onCancel: () => {
            if (!commandRun.options.quiet) {
              p.cancel('🧙 Merlin: Canceling CLI.. HAX ya later 🪄');
            }
            process.exit(0);
          },
        });
    }
    if (operation.action) {
      p.intro(`hax party ${color.bold(operation.action)}`);
    }
    switch (operation.action) {
      case "party:status":
      case "party:stats":
      if(!commandRun.options.quiet) {
        p.intro(`${color.green(color.bold(`         
                       888            
                       888            
88888b.  8888b. 888d888888888888  888 
888 "88b    "88b888P"  888   888  888 
888  888.d888888888    888   888  888 
888 d88P888  888888    Y88b. Y88b 888 
88888P" "Y888888888     "Y888 "Y88888 
888                               888 
888                           Y8bd88P`))}`);
      };
      break;
      case "docs":
        // open the docs
        p.intro(`${color.bgBlue(color.white(` Opening in browser `))}`);
        await open("https://haxtheweb.org/");
      break;
      case "playground":
        // open the playground
        p.intro(`${color.bgBlue(color.white(` Opening in browser `))}`);
        await open("https://hax.cloud/");
      break;
      case "psu":
        // open the psu site
        p.intro(`${color.bgBlue(color.white(` Opening in browser `))}`);
        await open("https://hax.psu.edu/");
      break;
      case "issues":
        // open the issues
        p.intro(`${color.bgBlue(color.white(` Opening in browser `))}`);
        await open("https://github.com/haxtheweb/issues/issues");
      break;
      case "discord":
        // open the discord
        p.intro(`${color.bgBlue(color.white(` Opening in browser `))}`);
        await open("https://discord.gg/haxtheweb");
      break;
      case "club":
        // open the club
        p.intro(`${color.bgBlue(color.white(` Opening in browser `))}`);
        await open("https://orgcentral.psu.edu/organization/hax-the-club");
        // we can change this to the club website when it's up
      break;
      case "gh":
      case "github":
        try {
          // auto and y are aliases
          if(!commandRun.options.root && !commandRun.options.auto){
            commandRun.options.root = await p.text({
              message: 'What folder will your HAX projects live in?',
              placeholder: process.cwd(),
              required: true,
              validate: (value) => {
                if (!value) {
                  return "Path is required (tab writes default)";
                }
                if (!fs.existsSync(value)) {
                  return `${value} does not exist. Select a valid folder`;
                }
              }
            })
            // subprocesses are based on the root process folder
            process.chdir(commandRun.options.root);
          }

          // list HAX repos
          const initialValues = [ "webcomponents" ];
          const options = [ 
            { value: "webcomponents", label: "Webcomponents Monorepo - haxtheweb/webcomponents" }, 
            { value: "create", label: "Create CLI - haxtheweb/create" }, 
            { value: "hax-the-club", label: "HAX The Club - haxtheweb/hax-the-club" },
            { value: "open-apis", label: "Open APIs - haxtheweb/open-apis" }, 
            { value: "haxcms-nodejs", label: "HAXcms Node.js - haxtheweb/haxcms-nodejs" }, 
            { value: "haxcms-php", label: "HAXcms PHP - haxtheweb/haxcms-php" }, 
            { value: "desktop", label: "HAX The Desktop - haxtheweb/desktop" }, 
            { value: "haxiam", label: "HAXiam - haxtheweb/HAXiam" }
          ];

          p.note(`${merlinSays(`${color.magenta(color.bold('HAX is a party,'))} so you can select ${color.bold('multiple')} repositories at once!`)}
      Remember to ${color.bold('fork each project')} on ${color.bold('GitHub')} (or you'll be asked to later!)`);
          if(!commandRun.options.repos && commandRun.options.auto){
            commandRun.options.repos = initialValues;
          } else if(!commandRun.options.repos) {
            commandRun.options.repos = await p.multiselect({
              message: 'Choose GitHub repositories to clone',
              initialValues: initialValues,
              options: options,
              required: false,
            })
          } else if (commandRun.options.repos.includes("all")) {
            commandRun.options.repos = options.map((item) => item.value);
          }
          await cloneHAXRepositories(commandRun);
        } catch (e) { }
      break;
      case "quit":
        // quit
        process.exit(0);
      break;
    }
      // y or noi need to act like it ran and finish instead of looping options
    if (commandRun.options.y || !commandRun.options.i || !actionAssigned) {
      process.exit(0);
    }
    operation.action = null;
  }
}

async function cloneHAXRepositories(commandRun) {
  let s = p.spinner();

  // check for system dependencies: ssh, yarn, etc.
  if(!sysGit) {
    console.error(`${color.red(`Git is not installed. The Git CLI is required to access GitHub with ${color.bold('hax party')}.`)}
    Please follow the instructions at:
    ${color.underline(color.cyan(`https://git-scm.com/book/en/v2/Getting-Started-Installing-Git`))}`);
    process.exit(1);
  }

  if(!sysSSH) {
      console.error(`${color.red(`SSH keys are not set up correctly. SSH is required to access GitHub with ${color.bold('hax party')}.`)}
      Please follow the instructions at:
      ${color.underline(color.cyan(`https://docs.github.com/en/authentication/connecting-to-github-with-ssh`))}`);
      process.exit(1);
  }
  
  try {
    await exec(`yarn --version`);
  } catch(e) {
    await exec(`npm install -g yarn`);
  }

  for (const item of commandRun.options.repos) {
    // while loop keeps HAX active until the user is ready
    let isForked = false;
    let firstRun = true;
    while(!isForked) {
      try {
        // ssh link is used since https prompts for password
        if(firstRun){
          s.start(`Cloning ${color.bold(item)} to ${color.bold(process.cwd())}`);
        } else {
          s.start(`Trying again... Cloning ${item} to ${color.bold(process.cwd())}`);
        }

        await exec(`git clone git@github.com:${commandRun.options.author}/${item}.git`);
        s.stop(`${color.green("Successfully")} cloned ${color.bold(item)} to ${color.bold(process.cwd())}`);

        isForked = true;
      } catch (e) {
        // skip the loop if the repo already exists
        if(e.stderr.includes("already exists and is not an empty directory")){
          s.stop(`${color.yellow(`${color.bold(`${item}`)} already exists in ${color.bold(process.cwd())}`)}`);
          break;
        }

        s.stop(`${color.red("Failed")} to clone ${color.bold(item)} to ${color.bold(process.cwd())}`);

        p.note(`${color.red(`Error: HAX cannot find a personal ${color.bold("fork")} of the ${color.bold(item)} repository on your GitHub account`)}
    Use the following link to fork ${color.bold(item)}: ${color.underline(color.cyan(`https://github.com/haxtheweb/${item}/fork`))}`);

        // We don't want to spam the link every time
        if(firstRun){  
          p.intro(`${merlinSays("The link will open in your browser in a few seconds")}`)
          setTimeout(async () => {
            await open(`https://github.com/haxtheweb/${item}/fork`)
          }, 3000);
          firstRun = false;
        }

        let response = await p.confirm({
          message: `Have you forked the repository? Would you like to try again?`,
          initialValue: true,
        });

        // Multiple ways to quit (select no, ctrl+c, etc)
        if(p.isCancel(response) || !response) {
          p.cancel('🧙 Merlin: Canceling CLI.. HAX ya later 🪄');
          process.exit(0);
        }
      }
    }

    s.start(`Installing dependencies for ${item}`);
    switch (item) {
      case "webcomponents":
        await exec(`yarn global add lerna web-component-analyzer`);
        await exec(`cd ${process.cwd()}/${item} && yarn install`);
      break;
      case "create":
      case "hax-the-club":
      case "open-apis":
      case "haxcms-nodejs":
      case "desktop":
        await exec(`cd ${process.cwd()}/${item} && ${commandRun.options.npmClient} install`)
      break;
      case "haxcms-php":
        // ddev setup
      break;
      case "HAXiam":
        // curl setup?
      break;
    }
    s.stop(`Dependencies installed for ${item}`);
  };
}