import * as p from '@clack/prompts';
import color from 'picocolors';
import { exec } from "../utils.js";
import open from 'open';

export function partyActions(){
    return [
      { value: 'docs', label: "View the HAX documentation"},
      { value: 'playground', label: "Explore HAX.cloud playground"},
      { value: 'psu', label: "Visit official hax.psu.edu site"},
      { value: 'issues', label: "View HAX issues on GitHub"},
      { value: 'discord', label: "Join the HAX Discord community"},
      { value: 'club', label: "Check out HAX The Club at PSU"},
      { value: 'github', label: "Become a core developer for HAX"},
    ];
  }

//   async function runConfetti(duration = 500, options = {}) {
//     const cliConfetti = require("cli-confetti");
//     const CliUpdate = require("cli-update");

//     let stopped = false;

//     cliConfetti(options, function (err, confettiFrame) {
//         if (err) throw err;
//         if (stopped) return true;
//         CliUpdate.render(confettiFrame);
//     });

//     setTimeout(() => {
//         console.clear();
//         stopped = true;
//     //     // CliUpdate.done(); // optional
//     //     // process.exit(0);  // optional
//     }, duration);
// }

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
        p.intro(`${color.bgBlue(color.white(` Party time `))}`);

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
          // open the repos
          const initialValues = [ "webcomponents" ];
          const options = [ 
            { value: "webcomponents", label: "Webcomponents Monorepo" }, 
            { value: "create", label: "Create-CLI" }, 
            { value: "hax-the-club", label: "HAX The Club" },
            { value: "open-apis", label: "Open APIs" }, 
            { value: "haxcms-nodejs", label: "HAXcms Node.js" }, 
            { value: "haxcms-php", label: "HAXcms PHP"}, 
            { value: "desktop", label: "HAXcms Desktop" }, 
            { value: "haxiam", label: "HAXiam" }
          ];
          if(!commandRun.options.repos) {
            commandRun.options.repos = await p.multiselect({
              message: 'Choose GitHub repositories to clone',
              initialValues: initialValues,
              options: options,
              required: false,
            })
          }
          await createDevEnvironment(commandRun);
        } catch (e) {
          console.log(e);
        }
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

async function createDevEnvironment(commandRun) {
  let sysGit = true;
  exec('which git', error => {
    if (error) {
      sysGit = false;
    }
  });
  
  let author = '';
  // should be able to grab if not predefined
  try {
    let value = await exec(`git config user.name`);
    author = value.stdout.trim();
  }
  catch(e) {
    log(`
      git user name not configured. Run the following to do this:\n
      git config --global user.name "namehere"\n
      git config --global user.email "email@here`, 'debug');
  }

  console.log(commandRun.options.repos);
  for (const item of commandRun.options.repos) {
    console.log(`Cloning ${item} to ${process.cwd()}`);
    try {
      await exec(`git clone git@github.com:${author}/${item}.git`);
    } catch (e) {
      p.note(`Error: Fork the repository on GitHub: https://github.com/haxtheweb/${item}/fork`)
    }

    let s = p.spinner();
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
        await exec(`cd ${process.cwd()}/${item} && npm install`)
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