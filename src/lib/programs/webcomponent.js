#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import * as ejs from "ejs";
import * as p from '@clack/prompts';
import color from 'picocolors';

import { merlinSays } from "../statements.js";
import { log } from "../logging.js";

import { dashToCamel, readAllFiles, exec, validateWebcomponentName, validateNpmClient } from '../utils.js';
import * as haxcmsLib from "@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js";
const HAXCMS = haxcmsLib.HAXCMS;

let sysGit = true;
exec('which git', error => {
  if (error) {
    sysGit = false;
  }
});

class HAXWiring {
  /**
   * Return a haxProperties prototype / example structure
   */
  prototypeHaxProperties = () => {
    // example properties valid for HAX context menu.
    let props = {
      api: "1",
      type: "element",
      editingElement: "core",
      hideDefaultSettings: false,
      canScale: true,
      canEditSource: true,
      contentEditable: false,
      gizmo: {
        title: "Tag name",
        description: "",
        icon: "icons:android",
        color: "purple",
        tags: ["Other"],
        handles: [
          {
            type: "data",
            type_exclusive: false,
            url: "src",
          },
        ],
        meta: {
          author: "auto",
        },
        requiresChildren: false,
        requiresParent: false,
      },
      settings: {
        configure: [
          {
            slot: "",
            title: "Inner content",
            description: "The slotted content that lives inside the tag",
            inputMethod: "textfield",
            icon: "android",
            required: true,
            validationType: "text",
          },
          {
            slot: "button",
            title: "Button content",
            description: "The content that can override the button",
            inputMethod: "textfield",
            icon: "android",
            required: true,
            validationType: "text",
          },
          {
            property: "title",
            title: "Title",
            description: "",
            inputMethod: "textfield",
            icon: "android",
            required: true,
            validationType: "text",
          },
          {
            property: "primaryColor",
            title: "Title",
            description: "",
            inputMethod: "textfield",
            icon: "android",
            required: false,
            validation: ".*",
            validationType: "text",
          },
        ],
        advanced: [
          {
            property: "secondaryColor",
            title: "Secondary color",
            description:
              "An optional secondary color used in certain edge cases.",
            inputMethod: "colorpicker",
            icon: "color",
          },
          {
            property: "endPoint",
            title: "API endpoint",
            description:
              "An optional endpoint to hit and load in more data dymaically.",
            inputMethod: "textfield",
            icon: "android",
            validation: "[a-z0-9]",
            validationType: "url",
          },
        ],
        developer: [],
      },
      saveOptions: {
        wipeSlot: false,
        unsetAttributes: ["end-point", "secondary-color"],
      },
      documentation: {
        howTo: "https://haxtheweb.org/welcome",
        purpose: "https://haxtheweb.org/welcome",
      },
      demoSchema: [
        {
          tag: "my-tag",
          content: "<p>inner html</p>",
          properties: {
            endPoint: "https://cdn2.thecatapi.com/images/9j5.jpg",
            primaryColor: "yellow",
            title: "A cat",
          },
        },
      ],
    };
    return props;
  };
}

// processing an element
export async function webcomponentProcess(commandRun, project, port = "8000") {
  // Security (M-2): defense-in-depth re-check of --npm-client at the point it
  // is interpolated into exec() shell strings. create.js validates earlier,
  // but the site/webcomponent subcommand option paths can bypass that check.
  if (commandRun.options.npmClient) {
    commandRun.options.npmClient = validateNpmClient(commandRun.options.npmClient);
  }
  // auto select operations to perform if requested
  if (!project.extras) {
    console.log(commandRun.options.extras);
    if (commandRun.options.extras === false) {
      project.extras = [];
    }
    else {
      let extras = ['launch', 'install', 'git'];
      if (!sysGit || project.isMonorepo) {
        extras.pop();
      }
      project.extras = extras;  
    }
  }
  // values not set by user but used in templating
  project.className = dashToCamel(project.name);
  // option to build github repo link for the user
  if (project.extras && project.extras.includes('git')) {
      // @todo need to support git@ and https methods
      if (commandRun.options.auto) {
        project.gitRepo = `https://github.com/${project.author}/${project.name}.git`;
      }
      else  {
        project.gitRepo = await p.text({
          message: 'Git Repo location:',
          placeholder: `https://github.com/${project.author}/${project.name}.git`,
          initialValue: `https://github.com/${project.author}/${project.name}.git`,
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
  let s = p.spinner();
  s.start(merlinSays('Copying project files'));
  // leverage this little helper from HAXcms
  let templateDir = project.template || 'compliant';
  await HAXCMS.recurseCopy(
    `${process.mainModule.path}/templates/${project.type}/${templateDir}/`,
    `${project.path}/${project.name}`
  );
  // rename gitignore to improve copy cross platform compat
  const renameIfExists = (src, dest) => {
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
    }
  };
  renameIfExists(`${project.path}/${project.name}/_github`, `${project.path}/${project.name}/.github`);
  renameIfExists(`${project.path}/${project.name}/_vscode`, `${project.path}/${project.name}/.vscode`);
  renameIfExists(`${project.path}/${project.name}/_dddignore`, `${project.path}/${project.name}/.dddignore`);
  renameIfExists(`${project.path}/${project.name}/_editorconfig`, `${project.path}/${project.name}/.editorconfig`);
  renameIfExists(`${project.path}/${project.name}/_gitignore`, `${project.path}/${project.name}/.gitignore`);
  renameIfExists(`${project.path}/${project.name}/_nojekyll`, `${project.path}/${project.name}/.nojekyll`);
  renameIfExists(`${project.path}/${project.name}/_npmignore`, `${project.path}/${project.name}/.npmignore`);
  renameIfExists(`${project.path}/${project.name}/_surgeignore`, `${project.path}/${project.name}/.surgeignore`);
  renameIfExists(`${project.path}/${project.name}/_travis.yml`, `${project.path}/${project.name}/.travis.yml`);
  // rename paths that are of the element name in question
  renameIfExists(`${project.path}/${project.name}/lib/webcomponent.haxProperties.json`, `${project.path}/${project.name}/lib/${project.name}.haxProperties.json`);
  // loop through and rename all the localization files
  if (fs.existsSync(`${project.path}/${project.name}/locales/`)) {
    fs.readdirSync(`${project.path}/${project.name}/locales/`).forEach(async function (file, index) {
      fs.renameSync(`${project.path}/${project.name}/locales/${file}`, `${project.path}/${project.name}/locales/${file.replace('webcomponent', project.name)}`);
    });
  }
  renameIfExists(`${project.path}/${project.name}/webcomponent.js`, `${project.path}/${project.name}/${project.name}.js`);
  renameIfExists(`${project.path}/${project.name}/test/webcomponent.test.js`, `${project.path}/${project.name}/test/${project.name}.test.js`);
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
  if (project.extras && (project.extras.includes('launch') || project.extras.includes('install'))) {
      s.start(merlinSays(`Installation magic (${commandRun.options.npmClient} install)`));
      try {
        // monorepos install from top but then still need to launch from local location
        if (!commandRun.options.isMonorepo) {
          await exec(`cd ${project.path}/${project.name} && ${commandRun.options.npmClient} install`);
        }
      }
      catch(e) {
        console.warn(e);
      }
      s.stop(merlinSays(`Everything is installed. It's go time`));
  }
  // autolaunch if default was selected
  if (project.extras && project.extras.includes('launch')) {
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

⌨️  To resume 🧙 Merlin press: ${color.bold(color.black(color.bgRed(` CTRL + C or CTRL + BREAK `)))}
`);
    // at least a second to see the message print at all
    await setTimeout(1000);
    try {
      await exec(`cd ${optionPath} && ${command} && ${commandRun.options.npmClient} run analyze`);
    }
    catch(e) {
    // don't log bc output is weird
    }
  }
  else if (!commandRun.options.quiet) {
    let nextSteps = `cd ${project.path}/${project.name} && ${project.extras.includes('install') ? '' : `${commandRun.options.npmClient} install && `}${commandRun.options.npmClient} start`;
    p.note(`${project.name} is ready to go. Run the following to start development:`);
    p.outro(nextSteps);
  }
}

export function webcomponentActions(){
  return [
    { value: 'start', label: "Launch project"},
    { value: 'wc:stats', label: "Check status of web component"},
    { value: 'wc:element', label: "Add new Lit component to existing project"},
    { value: 'wc:haxproperties', label: "Write haxProperties schema"},
    { value: 'wc:rename', label: "Rename this web component"},
  ];
}

// autodetect webcomponent
export async function webcomponentCommandDetected(commandRun, packageData = {}, port = "8000") {
  if (!commandRun.options.quiet) {
    p.intro(`${color.bgBlack(color.white(` HAXTheWeb : Webcomponent detected `))}`);
    p.intro(`${color.bgBlue(color.white(` Web component name: ${packageData.name} `))}`);  
  }

  let actions = webcomponentActions();

  let actionAssigned = false;
  // default to status unless already set so we don't issue a create in a create
  if (!commandRun.arguments.action) {
    actionAssigned = true;
    commandRun.arguments.action = 'wc:status';
  }

  commandRun.command = "webcomponent";

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
          npmClient: `${operation.npmClient}`
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
      p.intro(`hax wc ${color.bold(operation.action)}`);
    }
    switch (operation.action) {
      case "start":
        if (!commandRun.options.quiet) {
          // Multi-line clack spacing
          p.note(`${merlinSays(`I have summoned a sub-process daemon 👹`)}

🚀  Running your ${color.bold('webcomponent')} ${color.bold(packageData.name)}:
      ${color.underline(color.cyan(`http://localhost:${port}`))}

🏠  Launched: ${color.underline(color.bold(color.yellow(color.bgBlack(`${process.cwd()}`))))}
💻  Folder: ${color.bold(color.yellow(color.bgBlack(`cd ${process.cwd()}`)))}
📂  Open folder: ${color.bold(color.yellow(color.bgBlack(`open ${process.cwd()}`)))}
📘  VS Code Project: ${color.bold(color.yellow(color.bgBlack(`code ${process.cwd()}`)))}
🚧  Launch later: ${color.bold(color.yellow(color.bgBlack(`${commandRun.options.npmClient} start`)))}

⌨️  To exit 🧙 Merlin press: ${color.bold(color.black(color.bgRed(` CTRL + C or CTRL + BREAK `)))}
          `);
        }
        try {
          // ensure it's installed first, unless it's a monorepo. basic check for node_modules
          // folder as far as if already installed so we don't double install needlessly
          if (!commandRun.options.isMonorepo && !fs.existsSync("./node_modules")) {
            if (!commandRun.options.quiet) {
              let s = p.spinner();
              s.start(merlinSays(`Installation magic (${commandRun.options.npmClient} install)`));
              await exec(`${commandRun.options.npmClient} install`);
              s.stop(merlinSays(`Everything is installed. It's go time`));
            }
            else {
              await exec(`${commandRun.options.npmClient} install`);
            }
          }
          await exec(`${commandRun.options.npmClient} start`);
        }
        catch(e) {
          // don't log bc output is odd
        }
      break;
      case "serve":
        try {
          if (!commandRun.options.quiet) {
            p.intro(`Launching development server.. `);
          }
          if (packageData.scripts.serve){
            if (!commandRun.options.quiet) {
            p.note(`${merlinSays(`Project launched in development mode`)}

🚀  Running your ${color.bold('webcomponent')} ${color.bold(packageData.name)}:
      ${color.underline(color.cyan(`http://localhost:${port}`))}

🏠  Launched: ${color.underline(color.bold(color.yellow(color.bgBlack(`${process.cwd()}`))))}
💻  Folder: ${color.bold(color.yellow(color.bgBlack(`cd ${process.cwd()}`)))}
📂  Open folder: ${color.bold(color.yellow(color.bgBlack(`open ${process.cwd()}`)))}
📘  VS Code Project: ${color.bold(color.yellow(color.bgBlack(`code ${process.cwd()}`)))}
🚧  Launch later: ${color.bold(color.yellow(color.bgBlack(`${commandRun.options.npmClient} serve`)))}

⌨️  To exit 🧙 Merlin press: ${color.bold(color.black(color.bgRed(` CTRL + C or CTRL + BREAK `)))}
          `);
            }

            await exec(`${commandRun.options.npmClient} run serve`);
          } else {
            // if no serve script, run start instead
            if (!commandRun.options.quiet) {
            p.note(`${merlinSays(`No ${color.bold('serve')} script found, running ${color.bold(`${commandRun.options.npmClient} start`)} instead`)}

🚀  Running your ${color.bold('webcomponent')} ${color.bold(packageData.name)}:
      ${color.underline(color.cyan(`http://localhost:${port}`))}

🏠  Launched: ${color.underline(color.bold(color.yellow(color.bgBlack(`${process.cwd()}`))))}
💻  Folder: ${color.bold(color.yellow(color.bgBlack(`cd ${process.cwd()}`)))}
📂  Open folder: ${color.bold(color.yellow(color.bgBlack(`open ${process.cwd()}`)))}
📘  VS Code Project: ${color.bold(color.yellow(color.bgBlack(`code ${process.cwd()}`)))}
🚧  Launch later: ${color.bold(color.yellow(color.bgBlack(`${commandRun.options.npmClient} start`)))}

⌨️  To exit 🧙 Merlin press: ${color.bold(color.black(color.bgRed(` CTRL + C or CTRL + BREAK `)))}
          `);
            }

            await exec(`${commandRun.options.npmClient} start`);
          }
        }
        catch(e) {
          // don't log bc output is odd
          console.log("error", e);
        }
      break;
      case "wc:status":
      case "wc:stats":
      case "webcomponent:status":
      case "webcomponent:stats":
        try {
          let webcomponentStats = {};
          if(packageData){
            webcomponentStats.title = packageData.name;
            webcomponentStats.description = packageData.description
            webcomponentStats.git = packageData.repository.url;
          }
          webcomponentStats.modules = [];
          webcomponentStats.superclasses = [];
          if(fs.existsSync(`${process.cwd()}/custom-elements.json`)){
                let components = JSON.parse(fs.readFileSync(`${process.cwd()
                  }/custom-elements.json`, 'utf8')).modules;
                
                for (var i in components){
                  webcomponentStats.modules.push(`${components[i].path}`)
                  if (components[i].declarations[0].superclass && !webcomponentStats.superclasses.includes(components[i].declarations[0].superclass.name)) {
                    webcomponentStats.superclasses.push(`${components[i].declarations[0].superclass.name}`);
                  }
                }
              }

          if (!commandRun.options.format && !commandRun.options.quiet) {
            p.intro(`${color.bgBlue(color.white(` Title: ${webcomponentStats.title} `))}`);
            p.intro(`${color.bgBlue(color.white(` Description: ${webcomponentStats.description} `))}`);
            if(webcomponentStats.git){
              p.intro(`${color.bgBlue(color.white(` Git: ${webcomponentStats.git} `))}`);
            }
            if(webcomponentStats.modules.length !== 0){
              p.intro(`${color.bgBlue(color.white(` Modules: ${webcomponentStats.modules} `))}`);  
              p.intro(`${color.bgBlue(color.white(` Number of modules: ${webcomponentStats.modules.length} `))}`);
            }
            if(webcomponentStats.superclasses.length !== 0){
              p.intro(`${color.bgBlue(color.white(` Inherited superclasses: ${webcomponentStats.superclasses} `))}`);
            }
          }
        } catch(e) {
          log(e.stderr)
        }
      break;
      case "wc:element":
      case "webcomponent:element":
        try {
          const reservedNames = ["annotation-xml", "color-profile", "font-face", "font-face-src", "font-face-uri", "font-face-format", "font-face-name", "missing-glyph"];

          if(!commandRun.options.name){
              commandRun.options.name = await p.text({
              message: 'Component name:',
              placeholder: 'my-component',
              initialValue: 'my-component',
              required: true,
              validate: (value) => {
                if (!value) {
                  return "Name is required (Enter accepts default)";
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
                if ((value.indexOf('-') === -1 || value.replace('--', '') !== value || value[0] === '-' || value[value.length-1] === '-')) {
                  return "Name must include at least one `-` and must not start or end name.";
                }
                // Check for any other syntax errors
                if(!/^[a-z][a-z0-9.\-]*\-[a-z0-9.\-]*$/.test(value)){
                  return `Name must follow the syntax ${color.bold("my-component")}`;
                }
                // assumes auto was selected in CLI
                let joint = process.cwd();
                if (commandRun.options.path) {
                  joint = commandRun.options.path;
                }
                if (fs.existsSync(path.join(joint, value))) {
                  return `${path.join(joint, value)} exists, rename this project`;
                }
              }
            });
          } else {
              let value = commandRun.options.name;
              if (!value) {
                console.error(color.red("Name is required (Enter accepts default)"));
                process.exit(1);
              }
              if(reservedNames.includes(value)) {
                console.error(color.red(`Reserved name ${color.bold(value)} cannot be used`));
                process.exit(1);
              }
              if (value.toLocaleLowerCase() !== value) {
                console.error(color.red("Name must be lowercase"));
                process.exit(1);
              }
              if (/^\d/.test(value)) {
                console.error(color.red("Name cannot start with a number"));
                process.exit(1);
              }
              if (/[`~!@#$%^&*()_=+\[\]{}|;:\'",<.>\/?\\]/.test(value)) {
                console.error(color.red("No special characters allowed in name"));
                process.exit(1);
              }
              if (value.indexOf(' ') !== -1) {
                console.error(color.red("No spaces allowed in name"));
                process.exit(1);
              }
              if ((value.indexOf('-') === -1 || value.replace('--', '') !== value || value[0] === '-' || value[value.length-1] === '-')) {
                console.error(color.red("Name must include at least one `-` and must not start or end name."));
                process.exit(1);
              }
              // Check for any other syntax errors
              if(!/^[a-z][a-z0-9.\-]*\-[a-z0-9.\-]*$/.test(value)){
                console.error(color.red(`Name must follow the syntax ${color.bold("my-component")}`));
                process.exit(1);
              }
              // assumes auto was selected in CLI
              let joint = process.cwd();
              if (commandRun.options.path) {
                joint = commandRun.options.path;
              }
              if (fs.existsSync(path.join(joint, value))) {
                console.error(color.red(`${path.join(joint, value)} exists, rename this project`));
                process.exit(1);
              }
          }

          const project = {
              name: commandRun.options.name,
              mainModule: packageData.name,
              path: process.cwd(),
              className: dashToCamel(commandRun.options.name),
              year: new Date().getFullYear(),
          }
          if(packageData.author){
            project.author = packageData.author.name;
          }
          
          const filePath = `${project.path}/${project.name}.js`
          await fs.copyFileSync(`${process.mainModule.path}/templates/generic/webcomponent.js`, filePath)

        
          const ejsString = ejs.fileLoader(filePath, 'utf8');
          let content = ejs.render(ejsString, project);
          // file written successfully  
          fs.writeFileSync(filePath, content);

          p.note(`🧙  Add to another web component (.js): ${color.underline(color.bold(color.yellow(color.bgBlack(`import ./${project.name}.js`))))}
💻  Add to an HTML file: ${color.bold(color.yellow(color.bgBlack(`<script type="module" src="${project.name}"></script>`)))}`);
              // at least a second to see the message print at all
          await setTimeout(1000);
        } catch(e) {
          log(e.stderr)
          // Original ejs.render error checking
          console.error(color.red(process.cwd()));
          console.error(color.red(e));
        }

      break;
      case "wc:haxproperties":
      case "webcomponent:haxproperties":
        try{
          if (packageData.customElements) {
            await webcomponentGenerateHAXSchema(commandRun, packageData);
          }
        } catch(e) {
          log(e.stderr)
        }
      break;
      case "rename":
      case "wc:rename":
      case "webcomponent:rename":
        try {
          await webcomponentRename(commandRun, packageData);
        } catch(e) {
          log(e.stderr)
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

// merge the web component factory libraries the user has installed 
export async function webcomponentGenerateHAXSchema(commandRun, packageData) {
  // run analyzer automatically if we have it so that it's up to date
  if (packageData.scripts.analyze) {
    await exec(`${commandRun.options.npmClient} run analyze`);
  }
  if (fs.existsSync(`${process.cwd()}/${packageData.customElements}`)) {
    const ceFileData = fs.readFileSync(`${process.cwd()}/${packageData.customElements}`,'utf8', (error, data) => {
      if(error){
        console.warn(error);
        return;
      }
      return data;
    });
    let wiring = new HAXWiring();
    if (commandRun.options.debug) {
      log(ceFileData, 'debug');
    }
    if (ceFileData) {
      let ce = JSON.parse(ceFileData);
      await ce.modules.forEach(async (modules) => {
        await modules.declarations.forEach(async (declarations) => {
          let props = wiring.prototypeHaxProperties();
          props.gizmo.title = declarations.tagName.replace('-', ' ');
          props.gizmo.tags = ["Other"];
          props.gizmo.handles = [];
          props.gizmo.meta.author = "HAXTheWeb core team";
          delete props.gizmo.shortcutKey;
          delete props.gizmo.requiresChildren;
          delete props.gizmo.requiresParent;
          props.settings.configure = [];
          props.settings.advanced = [];
          props.documentation = {
            howTo: null,
            purpose: null
          };
          props.saveOptions = {
            unsetAttributes: []
          };
          props.demoSchema = [
            {
              tag: declarations.tagName,
              content: "",
              properties: {
              }
            }
          ];
          let propData = [];
          if (declarations.attributes) {
            propData = declarations.attributes;
          }
          // loop through and if props are things we can map then do it
          await propData.forEach(async (prop) => {
            if (["t","colors",'_haxState',"elementVisible"].includes(prop.fieldName)) {
              props.saveOptions.unsetAttributes.push(prop.fieldName);
            }
            else {
              let type = "textfield";
              if (prop.type && prop.type.text) {
                type = getInputMethodFromType(prop.type.text);
              }
              if (type) {
                let propSchema = {
                  property: prop.fieldName,
                  title: prop.name,
                  description: "",
                  inputMethod: type,
                };
                if (prop.default !== undefined) {
                  props.demoSchema[0].properties[prop.fieldName] = prop.default;
                }
                props.settings.configure.push(propSchema);
              }
            }
          });
          if (commandRun.options.v) {
            log(JSON.stringify(props, null, 2), 'silly');
          }
          fs.writeFileSync(`./lib/${declarations.tagName}.haxProperties.json`, JSON.stringify(props, null, 2));
          log(`schema written to: ./lib/${declarations.tagName}.haxProperties.json`)
        });
      });
    }
  }
}

function getInputMethodFromType(type) {
  switch (type) {
    case "string":
      return "textfield";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
  }
  return false;
}

export async function webcomponentRename(commandRun, packageData) {
  const oldCwd = process.cwd();
  const oldDirName = path.basename(oldCwd);
  const parentDir = path.dirname(oldCwd);

  // monorepo guard: prevent renaming from the monorepo root
  if (packageData && packageData.workspaces) {
    console.error(color.red('Cannot rename a webcomponent from the monorepo root. Run this command inside the element directory.'));
    process.exit(1);
  }

  // derive old name and scope from package.json or directory name
  let oldName = oldDirName;
  let scope = '';
  if (packageData && packageData.name) {
    const parts = packageData.name.split('/');
    if (parts.length > 1) {
      scope = parts[0] + '/';
      oldName = parts[1];
    } else {
      oldName = parts[0];
    }
  }

  // load wc-registry for collision checking
  let wcReg = {};
  try {
    const regPath = path.join(__dirname, '../../lib/wc-registry.json');
    if (fs.existsSync(regPath)) {
      wcReg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    }
  } catch(e) {
    // ignore missing registry
  }

  let newName;
  if (!commandRun.options.name) {
    if (commandRun.options.i === false || commandRun.options.y || commandRun.options.auto) {
      console.error(color.red("Name is required when running non-interactively. Pass --name <value>."));
      process.exit(1);
    }
    newName = await p.text({
      message: 'New component name:',
      placeholder: 'my-new-element',
      required: true,
      validate: (value) => {
        return validateWebcomponentName(value, {
          wcReg,
          force: commandRun.options.force,
          joint: parentDir,
          checkExists: true
        });
      }
    });
  } else {
    newName = commandRun.options.name;
    const error = validateWebcomponentName(newName, {
      wcReg,
      force: commandRun.options.force,
      joint: parentDir,
      checkExists: true
    });
    if (error) {
      console.error(color.red(error));
      process.exit(1);
    }
  }

  const oldClassName = dashToCamel(oldName);
  const newClassName = dashToCamel(newName);
  const newScopedName = scope + newName;
  const newDir = path.join(parentDir, newName);

  let s = p.spinner();
  s.start(merlinSays(`Renaming ${oldName} to ${newName}`));

  // rewrite file contents
  for (const filePath of readAllFiles(oldCwd)) {
    // skip binary and generated directories
    if (filePath.includes('/node_modules/') || filePath.includes('/dist/') || filePath.includes('/public/')) {
      continue;
    }
    if (filePath.endsWith('.jpg') || filePath.endsWith('.png')) {
      continue;
    }
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      // replace class name first, then tag name
      content = content.replaceAll(oldClassName, newClassName);
      content = content.replaceAll(oldName, newName);
      fs.writeFileSync(filePath, content);
    } catch (err) {
      console.warn(color.yellow(`Could not rewrite ${filePath}: ${err.message}`));
    }
  }

  // rename files that contain the old name in their basename
  const filesToRename = [];
  for (const filePath of readAllFiles(oldCwd)) {
    if (filePath.includes('/node_modules/') || filePath.includes('/dist/') || filePath.includes('/public/')) {
      continue;
    }
    const basename = path.basename(filePath);
    if (basename.includes(oldName)) {
      const newBasename = basename.replaceAll(oldName, newName);
      const newFilePath = path.join(path.dirname(filePath), newBasename);
      filesToRename.push({ old: filePath, new: newFilePath });
    }
  }
  // rename deeper files first to avoid parent rename blocking children
  filesToRename.sort((a, b) => b.old.length - a.old.length);
  for (const { old: oldPath, new: newPath } of filesToRename) {
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
    }
  }

  // explicitly rewrite package.json to ensure scope and fields are correct
  const packageJsonPath = path.join(oldCwd, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    pkg.name = newScopedName;
    if (pkg.main) {
      pkg.main = pkg.main.replaceAll(oldName, newName);
    }
    if (pkg.module) {
      pkg.module = pkg.module.replaceAll(oldName, newName);
    }
    if (pkg.repository && pkg.repository.url) {
      pkg.repository.url = pkg.repository.url.replaceAll(oldName, newName);
    }
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  // delete stale custom-elements.json
  const ceJsonPath = path.join(oldCwd, 'custom-elements.json');
  if (fs.existsSync(ceJsonPath)) {
    fs.unlinkSync(ceJsonPath);
  }

  // delete stale package-lock.json to avoid confusion
  const lockPath = path.join(oldCwd, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }

  s.stop(merlinSays(`Files rewritten`));

  // rename parent directory
  fs.renameSync(oldCwd, newDir);

  if (!commandRun.options.quiet) {
    p.note(`${color.bold(oldName)} renamed to ${color.bold(newName)}\n\n🏠  New folder: ${color.bold(color.yellow(color.bgBlack(newDir)))}\n📘  Package name: ${color.bold(color.yellow(color.bgBlack(newScopedName)))}`);
  }

  // regenerate custom-elements.json
  try {
    let s2 = p.spinner();
    s2.start(merlinSays('Regenerating custom-elements.json'));
    await exec(`cd ${newDir} && ${commandRun.options.npmClient || 'npm'} run analyze`);
    s2.stop(merlinSays('custom-elements.json regenerated'));
  } catch (e) {
    console.warn(color.yellow('Could not regenerate custom-elements.json. Run `npm run analyze` manually.'));
  }
}
