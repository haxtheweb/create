#!/usr/bin/env node

import * as fs from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import * as ejs from "ejs";
import * as p from '@clack/prompts';
import color from 'picocolors';

import { merlinSays, log } from "../statements.js";
import { dashToCamel, readAllFiles } from '../utils.js';
import * as hax from "@haxtheweb/haxcms-nodejs";
const HAXCMS = hax.HAXCMS;

import * as child_process from "child_process";
import * as util from "node:util";
const exec = util.promisify(child_process.exec);

let sysGit = true;
exec('git --version', error => {
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
  // auto select operations to perform if requested
  if (!project.extras) {
    let extras = ['launch', 'install', 'git'];
    if (!sysGit || project.isMonorepo) {
      extras.pop();
    }
    project.extras = extras;
  }
  // values not set by user but used in templating
  project.className = dashToCamel(project.name);
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
  let s = p.spinner();
  s.start(merlinSays('Copying project files'));
  // leverage this little helper from HAXcms
  await HAXCMS.recurseCopy(
    `${process.mainModule.path}/templates/${project.type}/hax/`,
    `${project.path}/${project.name}`
  );
  // rename gitignore to improve copy cross platform compat
  await fs.renameSync(`${project.path}/${project.name}/_github`, `${project.path}/${project.name}/.github`);
  await fs.renameSync(`${project.path}/${project.name}/_editorconfig`, `${project.path}/${project.name}/.editorconfig`);
  await fs.renameSync(`${project.path}/${project.name}/_gitignore`, `${project.path}/${project.name}/.gitignore`);
  await fs.renameSync(`${project.path}/${project.name}/_nojekyll`, `${project.path}/${project.name}/.nojekyll`);
  await fs.renameSync(`${project.path}/${project.name}/_npmignore`, `${project.path}/${project.name}/.npmignore`);
  await fs.renameSync(`${project.path}/${project.name}/_surgeignore`, `${project.path}/${project.name}/.surgeignore`);
  await fs.renameSync(`${project.path}/${project.name}/_travis.yml`, `${project.path}/${project.name}/.travis.yml`);
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
        console.warn(e);
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
  else if (!commandRun.options.quiet) {
    let nextSteps = `cd ${project.path}/${project.name} && ${project.extras.includes('install') ? '' : `${commandRun.options.npmClient} install && `}${commandRun.options.npmClient} start`;
    p.note(`${project.name} is ready to go. Run the following to start development:`);
    p.outro(nextSteps);
  }
}

// autodetect webcomponent
export async function webcomponentCommandDetected(commandRun, packageData = {}, port = "8000") {
  if (!commandRun.options.quiet) {
    p.intro(`${color.bgBlack(color.white(` HAXTheWeb : Webcomponent detected `))}`);
    p.intro(`${color.bgBlue(color.white(` Web component name: ${packageData.name} `))}`);  
  }
  // if we support customElement analyzer (hax wcs do) then generate if asked
  if (commandRun.options.writeHaxProperties && packageData.customElements) {
    webcomponentGenerateHAXSchema(commandRun, packageData);
  }
  else {
    if (!commandRun.options.quiet) {
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
      log(ceFileData);
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
            log(JSON.stringify(props, null, 2));
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