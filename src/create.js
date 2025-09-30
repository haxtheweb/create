#!/usr/bin/env node
// forces middleware into CLI mode so we don't automatically perform certain operations like pathing context
process.env.haxcms_middleware = "node-cli";

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as p from '@clack/prompts';
import color from 'picocolors';

import { haxIntro, communityStatement } from "./lib/statements.js";
import { log, consoleTransport, logger } from "./lib/logging.js";
import { auditCommandDetected } from './lib/programs/audit.js';
import { partyCommandDetected } from './lib/programs/party.js';
import { webcomponentProcess, webcomponentCommandDetected, webcomponentActions } from "./lib/programs/webcomponent.js";
import { siteActions, siteNodeOperations, siteProcess, siteCommandDetected, siteThemeList } from "./lib/programs/site.js";
import { camelToDash, exec, interactiveExec, writeConfigFile, readConfigFile, getTimeDifference } from "./lib/utils.js";
import * as hax from "@haxtheweb/haxcms-nodejs";
const HAXCMS = hax.HAXCMS;

// check the last time this was run
let lastTime = readConfigFile('hax-cli-last-run');
// first run in the event it is null assume now
if (!lastTime) {
  lastTime = new Date().toISOString();
}
// check time difference broken down by unit
const timeSince = getTimeDifference(new Date().toISOString(), lastTime);
// write last run so that we know last time they were here
writeConfigFile('hax-cli-last-run', new Date().toISOString());

import { program } from "commander";

import packageJson from '../package.json' with { type: 'json' };

let sysGit = true;
exec('which git', error => {
  if (error) {
    sysGit = false;
  }
});

async function main() {
  let wcReg = {};
  let regPath = path.join(__dirname, './lib/wc-registry.json');
  if (fs.existsSync(regPath)) {
    try {
      wcReg = JSON.parse(fs.readFileSync(regPath));
    }
    catch(e) {
      // no registry for testing, probably busted package
    }
  }
  var commandRun = {};
  program
  .option('--')
  .option('--v', 'Verbose output')
  .option('--debug', 'Output for developers')
  .option('--format <char>', 'Output format; json (default), yaml')
  .option('--path <char>', 'where to perform operation')
  .option('--name <char>', 'name of the project/web component')
  .option('--npm-client <char>', 'npm client to use (must be installed) npm, yarn, pnpm', 'npm')
  .option('--y', 'yes to all questions')
  .option('--skip', 'skip frills like animations')
  .option('--quiet', 'remove console logging')
  .option('--auto', 'yes to all questions, alias of y')
  .option('--no-i', 'prevent interactions / sub-process, good for scripting')
  .option('--to-file <char>', 'redirect command output to a file')
  .option('--no-extras', 'skip all extra / automatic command processing')
  .option('--root <char>', 'root location to execute the command from')

  // options for webcomponent
  .option('--org <char>', 'organization for package.json')
  .option('--author <char>', 'author for site / package.json')
  .option('--writeHaxProperties', 'Write haxProperties for the element')

  // options for site
  .option('--import-site <char>', 'URL of site to import')
  .option('--import-structure <char>', `import method to use:\n\rpressbooksToSite\n\relmslnToSite\n\rhaxcmsToSite\n\rnotionToSite\n\rgitbookToSite\n\revolutionToSite\n\rhtmlToSite\n\rdocxToSite`)
  .option('--node-op <char>', 'node operation to perform')
  .option('--item-id <char>', 'node ID to operate on')
  .option('--domain <char>', 'published domain name')
  .option('--title-scrape <char>', 'CSS Selector for `title` in resource')
  .option('--content-scrape <char>', 'CSS Selector for `body` in resource')
  .option('--items-import <char>', 'import items from a file / site')
  .option('--recipe <char>', 'path to recipe file')
  .option('--custom-theme-name <char>', 'custom theme name')
  .option('--custom-theme-template <char>', 'custom theme template; (options: base, polaris-flex, polaris-sidebar)')

  // options for rsync
  .option('--source <char>', 'rsync source directory or remote path')
  .option('--destination <char>', 'rsync destination directory or remote path')
  .option('--exclude <char>', 'comma-separated patterns to exclude from rsync')
  .option('--dry-run', 'perform rsync dry run')
  .option('--delete', 'delete extraneous files from destination')

  // options for party
  .option('--repos <char...>', 'repositories to clone') 

  .version(packageJson.version)
  .helpCommand(true);

  // default command which runs interactively
  program
  .command('start')
  .description('Select which hax sub-program to run')
  .action(() => {
    commandRun = {
      command: 'start',
      arguments: {},
      options: {}
    };
  });

  program
  .command('update')
  .description('hax cli self update')
  .option('--y', 'yes to all questions')
  .action(() => {
    commandRun = {
      command: 'update',
      arguments: {},
      options: {}
    };
  });

  program
  .command('serve')
  .description('Launch HAXsite in development mode (http://localhost)')
  .action(() => {
    commandRun = {
      command: 'serve',
      arguments: {
        action: 'serve'
      },
      options: {}
    };
  });

  // site operations and actions
  let strActions = '';
  siteActions().forEach(action => {
    strActions+= `${action.value} - ${action.label}` + "\n\r";
  });
  let siteProg = program
  .command('site')
  .description('create or administer a HAXsite')
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
  .option('--v', 'Verbose output')
  .option('--debug', 'Output for developers')
  .option('--format <char>', 'Output format; json (default), yaml')
  .option('--path <char>', 'where to perform operation')
  .option('--npm-client <char>', 'npm client to use (must be installed) npm, yarn, pnpm', 'npm')
  .option('--y', 'yes to all questions')
  .option('--skip', 'skip frills like animations')
  .option('--quiet', 'remove console logging')
  .option('--auto', 'yes to all questions, alias of y')
  .option('--no-i', 'prevent interactions / sub-process, good for scripting')
  .option('--to-file <char>', 'redirect command output to a file')
  .option('--no-extras', 'skip all extra / automatic command processing')
  .option('--root <char>', 'root location to execute the command from')

  .option('--import-site <char>', 'URL of site to import')
  .option('--import-structure <char>', `import method to use:\n\rpressbooksToSite\n\relmslnToSite\n\rhaxcmsToSite\n\rnotionToSite\n\rgitbookToSite\n\revolutionToSite\n\rhtmlToSite\n\rdocxToSite`)
  .option('--name <char>', 'name of the site (when creating a new one)')
  .option('--domain <char>', 'published domain name')
  .option('--node-op <char>', 'node operation to perform')
  .option('--title-scrape <char>', 'CSS Selector for `title` in resource')
  .option('--content-scrape <char>', 'CSS Selector for `body` in resource')
  .option('--items-import <char>', 'import items from a file / site')
  .option('--recipe <char>', 'path to recipe file')
  .option('--custom-theme-name <char>', 'custom theme name')
  .option('--custom-theme-template <char>', 'custom theme template (options: base, polaris-flex, polaris-sidebar)')
  .option('--source <char>', 'rsync source directory or remote path')
  .option('--destination <char>', 'rsync destination directory or remote path')
  .option('--exclude <char>', 'comma-separated patterns to exclude from rsync')
  .option('--dry-run', 'perform rsync dry run')
  .option('--delete', 'delete extraneous files from destination')
  .version(packageJson.version);
  let siteNodeOps = siteNodeOperations();
  for (var i in siteNodeOps) {
    program.option(`--${camelToDash(siteNodeOps[i].value)} <char>`, `${siteNodeOps[i].label}`)
    siteProg.option(`--${camelToDash(siteNodeOps[i].value)} <char>`, `${siteNodeOps[i].label}`)
  }

  // webcomponent program
  let strWebcomponentActions = '';
  webcomponentActions().forEach(action => {
    strWebcomponentActions += `${action.value} - ${action.label}` + "\n\r";
  });
  program
  .command('wc')
  .alias('webcomponent')
  .description('Create Lit based web components, with HAX recommendations')
  .argument('[action]', 'Actions to perform on web component include:' + "\n\r" + strWebcomponentActions)
  .action((action) => {
    commandRun = {
      command: 'webcomponent',
      arguments: {},
      options: {}
    };
    // if name set, populate
    if (action) {
      commandRun.arguments.action = action;
      commandRun.options.skip = true;
    }
  })
  .option('--path <char>', 'path the project should be created in')
  .option('--org <char>', 'organization for package.json')
  .option('--author <char>', 'author for site / package.json')
  .option('--name <char>', 'name of the web component')
  .option('--writeHaxProperties', 'Write haxProperties for the element')
  .option('--to-file <char>', 'redirect command output to a file')
  .option('--no-extras', 'skip all extra / automatic command processing')
  .option('--no-i', 'prevent interactions / sub-process, good for scripting')
  .option('--root <char>', 'root location to execute the command from')
  .version(packageJson.version);

  // audit program
  program
  .command('audit')
  .description('Audits web components for compliance with DDD (HAX design system)')
  .action(() => {
    commandRun = {
      command: 'audit',
      arguments: {},
      options: {}
    };
  })
  .option('--debug', 'Output for developers')
  .version(packageJson.version);

  program
  .command('party')
  .description('Party time! Join the HAX community and get involved!')
  .argument('[action]', 'Actions to perform on web component include:' + "\n\r" + "test")
  .action((action) => {
    commandRun = {
      command: 'party',
      arguments: {},
      options: {}
    };
    if (action) {
      commandRun.arguments.action = action;
      commandRun.options.skip = true;
    }
  })
  .option('--root <char>', 'root location to execute the command from')
  .option('--y', 'yes to all questions')
  .option('--auto', 'yes to all questions, alias of y')
  .option('--repos <char...>', 'repositories to clone')
  .version(packageJson.version);

  // process program arguments
  program.parse();
  commandRun.options = {...commandRun.options, ...program.opts()};
  // this is a false positive bc of the no-extras flag. no-extras does not imply true if not there
  // but that's how the CLI works. This then bombs things downstream. Its good to be false but NOT
  // good to be true since we need an array of options
  if (commandRun.options.extras === true) {
    delete commandRun.options.extras;
  }
  // allow execution of the command from a different location
  if (commandRun.options.root) {
    process.chdir(commandRun.options.root);
  }
  // bridge to log so we can respect this setting
  if (commandRun.options.quiet) {
    process.haxquiet = true;
    // don't output to the console any messages on this run since told to be silent
    // logging still happens to log files
    logger.remove(consoleTransport);
  }
  if (commandRun.options.debug) {
    log(commandRun, 'debug');
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
    log(`
      git user name not configured. Run the following to do this:\n
      git config --global user.name "namehere"\n
      git config --global user.email "email@here`, 'debug');
  }
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
  // validate theme cli commands
  if (commandRun.options.theme !== 'custom-theme' && (commandRun.options.customThemeName || commandRun.options.customThemeTemplate)) {
      program.error(color.red('ERROR: You can only use the --custom-theme-name option with --theme custom-theme'));
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
          if (!commandRun.options.quiet) {
            p.intro(`${color.bgBlack(color.white(` Monorepo detected : Setting relative defaults `))}`);
          }
          commandRun.options.isMonorepo = true;
          commandRun.options.auto = true;
          // assumed if monorepo
          if (commandRun.command === "audit") {
            auditCommandDetected(commandRun);
          }
          else {
            commandRun.command = 'webcomponent';
            commandRun.options.path = path.join(process.cwd(), packageData.workspaces.packages[0].replace('/*',''));
            if (packageData.orgNpm) {
              commandRun.options.org = packageData.orgNpm;
            }
            commandRun.options.gitRepo = packageData.repository.url;
            commandRun.options.author = packageData.author.name ? packageData.author.name : author;
          }
        }
      } catch (err) {
        console.error(err)
      }
    }
  }
  if (commandRun.options.debug) {
    log(packageData, 'debug');
  }
  // test for updating to latest or just run the command
  if (commandRun.command === "update") {
    await testForUpdates(commandRun);
  }
  else if (commandRun.command === 'audit') {
    let customPath = null;
    // test for haxcms context
    if (await hax.systemStructureContext() && fs.existsSync(`${process.cwd()}/custom`)) { 
      customPath = path.join(process.cwd(), 'custom');
    }
    auditCommandDetected(commandRun, customPath)
  }
  else if (commandRun.command === 'party') {
    await partyCommandDetected(commandRun);
  }
  // CLI works within context of the site if one is detected, otherwise we can do other things
  else if (await hax.systemStructureContext()) {
    if (commandRun.command === 'serve'){
      commandRun.program = 'serve';
      commandRun.options.skip = true;
      await siteCommandDetected(commandRun);
    } else {
      commandRun.program = 'site';
      commandRun.options.skip = true;
      await siteCommandDetected(commandRun);
    }
  }
  else if (packageData && (packageData.customElements || packageData.hax && packageData.hax.cli) && packageData.scripts.start) {
    if (commandRun.command === 'serve'){
      commandRun.program = 'serve';
      commandRun.options.skip = true;
      await webcomponentCommandDetected(commandRun, packageData);
    } else {
      commandRun.program = 'webcomponent';
      commandRun.options.skip = true;
      await webcomponentCommandDetected(commandRun, packageData);
    }
  }
  else {
    if (commandRun.command === 'start' && !commandRun.options.y && !commandRun.options.auto && !commandRun.options.skip && !commandRun.options.quiet) {
      await haxIntro();
    }
    // it's been 7 days since last check, do the check and offer command to resolve if needed
    if (timeSince.days > 7) {
      // check for updates
      let execOut = await exec(`npm view @haxtheweb/create version`);
      let updateCheck = execOut.stdout.trim();
      if (updateCheck !== packageJson.version && !commandRun.options.quiet) {
        p.intro(`${color.bgBlack(color.white(` HAX cli updates available! `))}`);
        p.intro(`Current version: ${packageJson.version}`);
        p.intro(`Latest version: ${updateCheck}`);  
        p.intro(`Run ${color.bold(color.black(color.bgGreen('hax update')))} to update to the latest version`);
      }
    }
    let activeProject = null;
    let project = { type: null };
    while (project.type !== 'quit' && project.type !== 'update') {
      if (activeProject) {
        if (!commandRun.options.quiet) {
          p.note(` 🧙🪄 BE GONE ${color.bold(color.black(color.bgGreen(activeProject)))} sub-process daemon! 🪄 + ✨ 👹 = 💀 `);
        }
        // ensure if we were automatically running the command we end
        if (commandRun.options.y) {
          if (!commandRun.options.quiet) {
            communityStatement();
          }
          process.exit(0);
        }
        // otherwise null to reset the program to run again
        commandRun = {
          command: null,
          arguments: {},
          options: {}
        };
      }
      if (['site', 'webcomponent', 'audit'].includes(commandRun.command)) {
        project = {
          type: commandRun.command
        };
      }
      else if (commandRun.options.i) {
        let buildOptions = [
          { value: 'webcomponent', label: '🏗️ Create a Web Component' },
          { value: 'site', label: '🏡 Create a HAXsite'},
          { value: 'party', label: '🎉 Join the HAX community' },
          { value: 'update', label: '🤓 Check for hax cli updates' },
          { value: 'quit', label: '🚪 Quit' },
        ];
        project = await p.group(
          {
            type: ({ results }) =>
            p.select({
              message: !activeProject ? `What should we build?` : `Thirsty for more? What should we create now?`,
              initialValue: 'webcomponent',
              required: true,
              options: buildOptions,
            }),
          },
          {
            onCancel: () => {
              if (!commandRun.options.quiet) {
                p.cancel('🧙🪄 Merlin: Canceling cli.. HAX ya later');
                communityStatement();
              }
              process.exit(0);
            },
          }
        );
      }
      else if (!commandRun.options.i) {
        process.exit(0);
      }
      if (project.type === "update") {
        await testForUpdates(commandRun);
      } else if (project.type === "party") {
        await partyCommandDetected(commandRun);
      }
      // detect being in a haxcms scaffold. easiest way is _sites being in this directory
      // set the path automatically so we skip the question
      else if ((commandRun.command === "site") && fs.existsSync(`${process.cwd()}/_sites`)) {
        if (!commandRun.options.quiet) {
          p.intro(`${color.bgBlack(color.white(` HAXcms detected : Path set automatically `))}`);
        }
        commandRun.options.path = `${process.cwd()}/_sites`;
      }
      activeProject = project.type;
      // silly but this way we don't have to take options for quitting
      if (['site', 'webcomponent'].includes(project.type)) {
        // global spot for core themes list
        let coreThemes = await siteThemeList(true);

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
              const reservedNames = ["annotation-xml", "color-profile", "font-face", "font-face-src", "font-face-uri", "font-face-format", "font-face-name", "missing-glyph"];

              if (!commandRun.arguments.action) {
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
                    if(reservedNames.includes(value)) {
                      return `Reserved name ${color.bold(value)} cannot be used`
                    }
                    if (value.toLocaleLowerCase() !== value) {
                      return "Name must be lowercase";
                    }
                    if (/^\d/.test(value)) {
                      return "Name cannot start with a number";
                    }
                    if (/[`~!@#$%^&*()_=+\[\]{}|;:\'",<.>\/?\\]/.test(value)) {
                      return "No special characters allowed in name";
                    }
                    if (value.indexOf(' ') !== -1) {
                      return "No spaces allowed in name";
                    }
                    if (results.type === "webcomponent" && (value.indexOf('-') === -1 || value.replace('--', '') !== value || value[0] === '-' || value[value.length-1] === '-')) {
                      return "Name must include at least one `-` and must not start or end name.";
                    }
                    // test that this is not an existing element we use in the registry
                    if (results.type === "webcomponent" && wcReg[value]) {
                      return "Name is already a web component in the wc-registry published for HAX.";
                    }
                    // Check for any other syntax errors
                    if(results.type === "webcomponent" && !/^[a-z][a-z0-9.\-]*\-[a-z0-9.\-]*$/.test(value)){
                      return `Name must follow the syntax ${color.bold("my-component")}`;
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
              if (commandRun.arguments.action) {
                let value = commandRun.arguments.action;
                if (!value) {
                  program.error(color.red("Name is required (tab writes default)"));
                  process.exit(1);
                }
                if(reservedNames.includes(value)) {
                  program.error(color.red(`Reserved name ${color.bold(value)} cannot be used`));
                  process.exit(1);
                }
                if (value.toLocaleLowerCase() !== value) {
                  program.error(color.red("Name must be lowercase"));
                  process.exit(1);
                }
                if (/^\d/.test(value)) {
                  program.error(color.red("Name cannot start with a number"));
                  process.exit(1);
                }
                if (value.indexOf(' ') !== -1) {
                  program.error(color.red("No spaces allowed in name"));
                  process.exit(1);
                }
                if (results.type === "webcomponent" && (value.indexOf('-') === -1 || value.replace('--', '') !== value || value[0] === '-' || value[value.length-1] === '-')) {
                  program.error(color.red("Name must include at least one `-` and must not start or end name."));
                  process.exit(1);
                }
                // test that this is not an existing element we use in the registry
                if (results.type === "webcomponent" && wcReg[value]) {
                  program.error(color.red("Name is already a web component in the wc-registry published for HAX."));
                  process.exit(1);
                }
                // Check for any other syntax errors
                if(results.type === "webcomponent" && !/^[a-z][a-z0-9.\-]*\-[a-z0-9.\-]*$/.test(value)){
                  program.error(color.red(`Name must follow the syntax ${color.bold("my-component")}`));
                  process.exit(1);
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
                  program.error(color.red(`${path.join(joint, value)} exists, rename this project`));
                  process.exit(1);
                }
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
            theme: async({ results }) => {
              if (results.type === "site" && !commandRun.options.theme) {
                // support having no theme but autoselecting
                if (commandRun.options.auto && commandRun.options.skip) {
                  commandRun.options.theme = coreThemes[0].value;
                }
                else {
                  return p.select({
                    message: "Theme:",
                    required: false,
                    options: coreThemes,
                    initialValue: coreThemes[0]
                  })  
                }
              }
              else if (results.type === "site" && commandRun.options.theme) {
                if (coreThemes.filter((item => item.value === commandRun.options.theme)).length === 0) {
                  program.error(color.red('Theme is not in the list of valid themes'));
                  process.exit(1);
                }
              }
            },
            customThemeName: async ({ results }) => {
              if (results.theme === "custom-theme") {
                let tmpCustomName = await p.text({
                  message: 'Theme Name:',
                  placeholder: `custom-${commandRun.arguments.action ? commandRun.arguments.action : results.name}-theme`,
                  required: false,
                  validate: (value) => {
                    if (!value) {
                      return "Theme name is required (tab writes default)";
                    }
                    if(coreThemes.some(theme => theme.value === value)) {
                      return "Theme name is already in use";
                    }
                    if (/^\d/.test(value)) {
                      return "Theme name cannot start with a number";
                    }
                    if (/[A-Z]/.test(value)) {
                      return "No uppercase letters allowed in theme name";
                    }
                    if (value.indexOf(' ') !== -1) {
                      return "No spaces allowed in theme name";
                    }
                  }
                })
                return tmpCustomName;
              }
              else if (results.type === "site") {
                // need to validate theme from CLI arguments
                let value = `${commandRun.options.customThemeName ? commandRun.options.customThemeName : (results.name ? results.name : commandRun.arguments.action)}`;
                if (!value) {
                  program.error(color.red("Theme name is required (tab writes default)"));
                }
                if(coreThemes.some(theme => theme.value === value)) {
                  program.error(color.red("Theme name is already in use"));
                }
                if (/^\d/.test(value)) {
                  program.error(color.red("Theme name cannot start with a number"));
                }
                if (/[A-Z]/.test(value)) {
                  program.error(color.red("No uppercase letters allowed in theme name"));
                }
                if (value.indexOf(' ') !== -1) {
                  program.error(color.red("No spaces allowed in theme name"));
                }
              }
            },
            customThemeTemplate: ({ results }) => {
              if (results.theme === "custom-theme") {
                const options = [
                    { value: 'base', label: 'Vanilla Theme with Hearty Documentation' },
                    { value: 'polaris-flex', label: 'Minimalist Theme with Horizontal Nav' },
                    { value: 'polaris-sidebar', label: 'Content-Focused Theme with Flexible Sidebar' },
                ]
                return p.select({
                  message: 'Template:',
                  required: false,
                  options: options,
                  initialValue: `${results.theme}`
                })
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
              if (!commandRun.options.quiet) {
                p.cancel('🧙🪄 Merlin: Canceling cli.. HAX ya later');
                communityStatement();
              }
              process.exit(0);
            },
          }
        );
        // merge cli options with project options assume this is NOT a monorepo
        // but spread will overwrite if needed
        if (commandRun.command === 'webcomponent' && !commandRun.arguments.action) {
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
        project.version = packageJson.version;
        if (!project.name && commandRun.arguments.action) {
          project.name = commandRun.arguments.action;
        }

        // resolve site vs multi-site
        switch (project.type) {
          case 'site':
            // only set path if not already set, normalize across clack and commander
            if (commandRun.options.path && !project.path) {
              project.path = commandRun.options.path;
            }
            if (!project.path) {
              project.path = process.cwd();
            }
            if (!commandRun.options.path) {
              commandRun.options.path = project.path;
            }
            await siteProcess(commandRun, project);
          break;
          case 'webcomponent':
            await webcomponentProcess(commandRun, project);
          break;
        }
      }
    }
    if (!commandRun.options.quiet && project.type !== 'update') {
      communityStatement();
    }
  }
}

// check for updates
async function testForUpdates(commandRun) {
  let execOut = await exec(`npm view @haxtheweb/create version`);
  let latest = execOut.stdout.trim();
  if (latest !== packageJson.version) {
    if (!commandRun.options.quiet) {
      p.intro(`${color.bgBlack(color.white(` HAX cli updates available! `))}`);
      p.intro(`Current version: ${packageJson.version}`);
      p.intro(`Latest version: ${latest}`); 
    }
    let runUpdates = { answer: false };
    if (!commandRun.options.y) {
      runUpdates = await p.group(
        {
          answer: ({ results }) =>
          p.confirm({
            message: `Do you want to update the cli to the latest version? (${latest})`,
            initialValue: true,
          }),
        },
        {
          onCancel: () => {
            if (!commandRun.options.quiet) {
              p.cancel('🧙🪄 Merlin: Leaving so soon? HAX ya later');
              p.outro(`
                🧙  Upgrade at any time: ${color.yellow('npm install --global @haxtheweb/create')}
                
                💡  ${color.bold(color.white(`Never. Stop. Innovating.`))}
              `);
            }
            process.exit(0);
          },
        }
      );
    }
    else {
      runUpdates.answer = true; // automatic
    }
    // ensure they wanted to run them
    if (runUpdates.answer) {
      await interactiveExec('npm', ['install', '--global', '@haxtheweb/create']);
      if (!commandRun.options.quiet) {
        p.outro(`
          🔮  HAX CLI updated to : ${color.yellow(latest)}
          
          🧙  Type ${color.yellow('hax help')} for latest commands
          
          💡  ${color.bold(color.white(`Never. Stop. Innovating.`))}
        `);
      }
    }
    else {
      if (!commandRun.options.quiet) {
        p.outro(`
          🧙  Upgrade at any time: ${color.yellow('npm install --global @haxtheweb/create')}
          
          💡  ${color.bold(color.white(`Never. Stop. Innovating.`))}
        `);
      }
    }
  }
  else {
    if (!commandRun.options.quiet) {
      p.intro(`${color.bgBlack(color.white(` HAX CLI (${packageJson.version}) is up to date `))}`);
    }
  }
}

main().catch(console.error);