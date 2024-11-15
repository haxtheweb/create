#!/usr/bin/env node
import { setTimeout } from 'node:timers/promises';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { dump } from 'js-yaml';
import { parse } from 'node-html-parser';
import { merlinSays, communityStatement } from "../statements.js";
// trick MFR into giving local paths
globalThis.MicroFrontendRegistryConfig = {
  base: `@haxtheweb/open-apis/`
};
import { MicroFrontendRegistry } from "../micro-frontend-registry.js";
// emable HAXcms routes so we have name => path just like on frontend!
MicroFrontendRegistry.enableServices(['haxcms']);

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

// fake response class so we can capture the response from the headless route as opposed to print to console
// this way we can handle as data or if use is requesting output format to change we can respond
class Res {
  constructor() {
    this.query = {};
    this.data = null;
    this.statusCode = null;
  }
  send(data) {
    this.data = data;
    return this;
  }
  status(status) {
    this.statusCode = status;
    return this;
  }
  setHeader() {
    return this;
  }
}


export function siteActions() {
  return [
    { value: 'start', label: "Start site (http://localhost)"},
    { value: 'status', label: "Status" },
    { value: 'sync', label: "Sync git"},
    { value: 'theme', label: "Change theme"},
    { value: 'node:stats', label: "Page stats"},
    { value: 'node:add', label: "Add page"},
    { value: 'node:edit', label: "Edit page"},
    { value: 'node:delete', label: "Delete page"},
    { value: 'file:list', label: "List files" },
  ];
}

export async function siteCommandDetected(commandRun) {
    var activeHaxsite = await hax.systemStructureContext();
    // default to status unless already set so we don't issue a create in a create
    if (!commandRun.arguments.action) {
        commandRun.arguments.action = 'status';
      }
      p.intro(`${color.bgBlack(color.white(` HAXTheWeb : Site detected `))}`);
      commandRun.command = "site";
      p.intro(`${color.bgBlue(color.white(` Name: ${activeHaxsite.name} `))}`);
      // defaults if nothing set via CLI
      let operation = {
        ...commandRun.arguments,
        ...commandRun.options
      };
      if (!commandRun.options.title) {
        commandRun.options.title = "New Page";
      }
      if (!commandRun.options.domain &&  commandRun.options.y) {
        commandRun.options.domain = `haxcli-${activeHaxsite.name}.surge.sh`;
      }
      // infinite loop until quitting the cli
      while (operation.action !== 'quit') {
        let actions = siteActions();
        if (sysSurge) {
          actions.push({ value: 'surge', label: "Publish site using Surge.sh"});              
        }
        actions.push({ value: 'quit', label: "🚪 Quit"});
        if (!operation.action) {
          commandRun = {
            command: null,
            arguments: {},
            options: {}
          }
          // ensures data is updated and stateful per action
          activeHaxsite = await hax.systemStructureContext();
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
            p.intro(`${color.bgBlue(color.white(` Title: ${activeHaxsite.manifest.title} `))}`);
            p.intro(`${color.bgBlue(color.white(` Description: ${activeHaxsite.manifest.description} `))}`);
            p.intro(`${color.bgBlue(color.white(` Theme: ${activeHaxsite.manifest.metadata.theme.name} (${activeHaxsite.manifest.metadata.theme.element})`))}`);
            p.intro(`${color.bgBlue(color.white(` Pages: ${activeHaxsite.manifest.items.length} `))}`);  
            const date = new Date(activeHaxsite.manifest.metadata.site.updated*1000);
            p.intro(`${color.bgBlue(color.white(` Last updated: ${date.toLocaleDateString("en-US")} `))}`);
          break;
          case "start":
            try {
              p.intro(`Starting server.. `);
              p.intro(`⌨️  To stop server, press: ${color.bold(color.black(color.bgRed(` CTRL + C `)))}`);
              await exec(`cd ${activeHaxsite.directory} && npx @haxtheweb/haxcms-nodejs`);
            }
            catch(e) {
              console.log(e.stderr);
            }
          break;
          case "node:stats":
            try {
              if (!commandRun.options.itemId) {
                commandRun.options.itemId = await p.select({
                  message: `Select an item to edit`,
                  required: true,
                  options: [ {value: null, label: "-- edit nothing, exit --" }, ...await siteItemsOptionsList(activeHaxsite)],
                });
              }
              if (commandRun.options.itemId) {
                let nodeOps = siteNodeStatsOperations();
                let page = activeHaxsite.loadNode(commandRun.options.itemId);
                // select which aspect of this we are editing
                if (!commandRun.options.nodeOp) {
                  commandRun.options.nodeOp = await p.select({
                    message: `${page.title} (${page.id}) - Node operations`,
                    required: true,
                    options: [ {value: null, label: "-- Exit --"}, ...nodeOps],
                  });
                }
                if (commandRun.options.nodeOp && siteNodeStatsOperations(commandRun.options.nodeOp)) {
                  switch(commandRun.options.nodeOp) {
                    case 'details':
                      console.log(page);
                    break;
                    case 'html':
                      console.log(await activeHaxsite.getPageContent(page));
                    break;
                    case 'schema':
                      // next up
                      let html = await activeHaxsite.getPageContent(page);
                      let dom = parse(html);
                      console.log(dom);
                    break;
                    case 'md':
                      // @todo use the built in endpoints broker
                    break;
                  }
                }
              }
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
              let resp = await haxcmsNodejsCli.cliBridge('createNode', { site: activeHaxsite, node: { title: commandRun.options.title }});
              if (commandRun.options.v) {
                console.log(resp.res.data);
              }
              console.log(`"${commandRun.options.title}" added to site`);
            }
            catch(e) {
              console.log(e.stderr);
            }
          break;
          case "node:edit":
            try {
              if (!commandRun.options.itemId) {
                commandRun.options.itemId = await p.select({
                  message: `Select an item to edit`,
                  required: true,
                  options: [ {value: null, label: "-- edit nothing, exit --" }, ...await siteItemsOptionsList(activeHaxsite)],
                });
              }
              if (commandRun.options.itemId) {
                let nodeOps = siteNodeOperations();
                let page = activeHaxsite.loadNode(commandRun.options.itemId);
                // select which aspect of this we are editing
                if (!commandRun.options.nodeOp) {
                  commandRun.options.nodeOp = await p.select({
                    message: `${page.title} (${page.id}) - Node operations`,
                    required: true,
                    options: [ {value: null, label: "-- Exit --"}, ...nodeOps],
                  });
                }
                if (commandRun.options.nodeOp && siteNodeOperations(commandRun.options.nodeOp)) {
                  let nodeProp = commandRun.options.nodeOp;
                  var propValue = commandRun.options[nodeProp];
                  // verify we have a setting for the operation requested
                  // otherwise we get interactive again
                  if (!commandRun.options[nodeProp]) {
                    let val = page[nodeProp];
                    if (['tags', 'published', 'hideInMenu', 'theme'].includes(nodeProp)) {
                      val = page.metadata[nodeProp];
                    }
                    else if (nodeProp === 'content') {
                      val = await activeHaxsite.getPageContent(page);
                    }
                    //  boolean is confirm
                    if (['published', 'hideInMenu'].includes(nodeProp)) {
                      propValue = await p.confirm({
                        message: `${nodeProp}:`,
                        initialValue: Boolean(val),
                        defaultValue: Boolean(val),
                      });
                    }
                    // these have fixed possible values
                    else if (['parent', 'theme'].includes(nodeProp)) {
                      let l = nodeProp === 'parent' ? "-- no parent --" : "-- no theme --";
                      let list = nodeProp === 'parent' ? await siteItemsOptionsList(activeHaxsite,  page.id) : await siteThemeList();
                      propValue = await p.select({
                        message: `${nodeProp}:`,
                        defaultValue: val,
                        initialValue: val,
                        options: [ {value: null, label: l }, ...list],
                      });
                    }
                    else {
                      propValue = await p.text({
                        message: `${nodeProp}:`,
                        initialValue: val,
                        defaultValue: val,
                      });
                    }
                  }
                  if (nodeProp === 'order') {
                    propValue = parseInt(propValue);
                  }
                  // account for CLI
                  if (propValue === "null") {
                    propValue = null;
                  }
                  commandRun.options[nodeProp] = propValue;
                }
                // ensure we set empty values, just not completely undefined values
                if (typeof commandRun.options[commandRun.options.nodeOp] !== "undefined") {
                  if (commandRun.options.nodeOp === 'content') {
                    if (commandRun.options.content && await page.writeLocation(commandRun.options.content)) {
                      console.log(`node:edit success updated page content: "${page.id}`);
                    }
                    else {
                      console.warn(`node:edit failure to write page content : ${page.id}`);
                    }
                  }
                  else {
                    if (['tags', 'published', 'hideInMenu'].includes(commandRun.options.nodeOp)) {
                      page.metadata[commandRun.options.nodeOp] = commandRun.options[commandRun.options.nodeOp];
                    }
                    else if (commandRun.options.nodeOp === 'theme') {
                      let themes = await HAXCMS.getThemes();
                      page.metadata.theme = themes[commandRun.options[commandRun.options.nodeOp]];
                    }
                    else {
                      page[commandRun.options.nodeOp] = commandRun.options[commandRun.options.nodeOp];
                    }
                    let resp = await activeHaxsite.updateNode(page);
                    if (commandRun.options.v) {
                      console.log(resp);
                    }
                  }
                }
              }
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
                  options: [ {value: null, label: "-- Delete nothing, exit --" }, ...await siteItemsOptionsList(activeHaxsite)],
                });
              }
              if (commandRun.options.itemId) {
                let del = false;
                if (!commandRun.options.y) {
                  del = await p.confirm({
                    message: `Are you sure you want to delete ${commandRun.options.itemId}? (This cannot be undone)`,
                    initialValue: true,
                  });
                }
                else {
                  del = true;
                }
                // extra confirmation given destructive operation
                if (del) {
                  let resp = await haxcmsNodejsCli.cliBridge('deleteNode', { site: activeHaxsite, node: { id: commandRun.options.itemId }});
                  if (resp.res.data === 500) {
                    console.warn(`node:delete failed "${commandRun.options.itemId} not found`);
                  }
                  else {
                    console.log(`"${commandRun.options.itemId}" deleted`);
                  }    
                }
                else {
                  console.log(`Delete operation canceled`);
                }
              }
            }
            catch(e) {
              console.log(e.stderr);
            }
          break;
          case "sync":
            // @todo git sync might need other arguments / be combined with publishing
            try {
              await exec(`cd ${activeHaxsite.directory} && git pull && git push`);
            }
            catch(e) {
              console.log(e.stderr);
            }
          break;
          case "theme":
            try {
              //theme
              let list = await siteThemeList();
              activeHaxsite = await hax.systemStructureContext();
              let val = activeHaxsite.manifest.metadata.theme.element;
              if (!commandRun.options.theme) {
                commandRun.options.theme = await p.select({
                  message: `Select theme:`,
                  defaultValue: val,
                  initialValue: val,
                  options: list,
                });
                let themes = await HAXCMS.getThemes();
                if (themes && commandRun.options.theme && themes[commandRun.options.theme]) {
                  activeHaxsite.manifest.metadata.theme = themes[commandRun.options.theme];
                  activeHaxsite.manifest.save(false);
                }
              }
            }
            catch(e) {
              console.log(e.stderr);
            }
          break;
          case "surge":
            try {
              if (!commandRun.options.domain) {
                commandRun.options.domain = await p.text({
                  message: `Domain for surge`,
                  defaultValue: `haxcli-${activeHaxsite.name}.surge.sh`,
                  required: true,
                  validate: (value) => {
                    if (!value) {
                      return "Domain must have a value";
                    }
                  }
                });
              }
              let execOutput = await exec(`cd ${activeHaxsite.directory} && surge . ${commandRun.options.domain}`);
              console.log(execOutput.stdout.trim());
            }
            catch(e) {
              console.log(e.stderr);
            }
          break;
          case "file:list":
            let res = new Res();
            await hax.RoutesMap.get.listFiles({query: activeHaxsite.name, filename: commandRun.options.filename}, res);
            if (commandRun.options.format === 'yaml') {
              console.log(dump(res.data));
            }
            else {
              console.log(res.data);
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

export function siteNodeStatsOperations(search = null){
  let obj = [
    {value: 'details', label: "Details"},
    {value: 'html', label: "Page as HTML source"},
    {value: 'schema', label: "Page as HAXElementSchema"},
    {value: 'md', label: "Page as Markdown"},    
  ];
  if (search) {
    for (const op of obj) {
      if (op.value === search) {
        return true;
      }
    }
    return false;
  }
  return obj;
}

export function siteNodeOperations(search = null){
  let obj = [
    {value: 'title', label: "Title"},
    {value: 'content', label: "Page content"},
    {value: 'slug', label: "Path (slug)"},
    {value: 'published', label: "Publishing status"},
    {value: 'tags', label: "Tags"},
    {value: 'parent', label: "Parent"},
    {value: 'order', label: "Order"},
    {value: 'theme', label: "Theme"},
    {value: 'hideInMenu', label: "Hide in menu"},
  ];
  if (search) {
    for (const op of obj) {
      if (op.value === search) {
        return true;
      }
    }
    return false;
  }
  return obj;
}

// broker a call to the open-api repo which is an express based wrapper for vercel (originally)
// this ensures the calls are identical and yet are converted to something the CLI can leverage
async function openApiBroker(call, body) {
  let mfItem = MicroFrontendRegistry.get(`@haxcms/${call}`);
  // ensure we have a MFR record to do the connection
  // fun thing is this is local file access directly via import()
  if (mfItem) {
    // dynamic import... this might upset some stuff later bc it's not a direct reference
    // but it's working locally at least.
    const handler = await import(`${mfItem.endpoint.replace('/api/', '/dist/')}.js`);
    let res = new Res();
    let req = {
      body: JSON.stringify(body),
      method: "post"
    };
    // js pass by ref for the win; these will both update bc of how we structured the calls
    await handler.default(req, res);
    // they'll need unpacked but that's a small price!
    return {
      req: req,
      res: res
    };
  }
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
            "theme": commandRun.options.theme ? commandRun.options.theme : "clean-one"
        },
        "build": {
            "type": "own",
            "structure": "course",
            "items": null,
            "files": null,
        },
        "theme": {
            "color": "green",
            "icon": "av:library-add"
        },
    };
    // allow for importSite option
    if (commandRun.options.importSite) {
      if (!commandRun.options.importStructure) {
        // assume hax to hax if it's not defined
        commandRun.options.importStructure = 'haxcmsToSite';
      }
      // verify this is a valid way to do an import
      if (commandRun.options.importStructure && MicroFrontendRegistry.get(`@haxcms/${commandRun.options.importStructure}`)) {
        let resp = await openApiBroker(commandRun.options.importStructure, { repoUrl: commandRun.options.importSite});
        if (resp.res.data && resp.res.data.data && resp.res.data.data.items) {
          siteRequest.build.structure = 'import';
          siteRequest.build.items = resp.res.data.data.items;
        }
        if (resp.res.data && resp.res.data.data && resp.res.data.data.files) {
          siteRequest.build.files = resp.res.data.data.files;
        }
      }
    }
    HAXCMS.cliWritePath = `${project.path}`;
    let res = new Res();
    await hax.RoutesMap.post.createSite({body: siteRequest}, res);
    if (commandRun.options.v) {
      if (commandRun.options.format === 'yaml') {
        console.log(dump(res.data));
      }
      else {
        console.log(res.data);
      }
    }
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


export async function siteItemsOptionsList(activeHaxsite, skipId = null) {
  let items = [];
  for (var i in activeHaxsite.manifest.items) {
    // ensure we remove self if operation is about page in question like parent selector
    if (activeHaxsite.manifest.items[i].id !== skipId) {
      items.push({
        value: activeHaxsite.manifest.items[i].id,
        label: activeHaxsite.manifest.items[i].title
      })  
    }
  }
  return items;
}

export async function siteThemeList() {
  let themes = await HAXCMS.getThemes();
  let items = [];
  for (var i in themes) {
    items.push({
      value: i,
      label: themes[i].name
    })
  }
  return items;
}