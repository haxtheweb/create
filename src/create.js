#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from "node:path";
import { setTimeout } from 'node:timers/promises';
import * as ejs from "ejs";
import * as p from '@clack/prompts';
import * as sh from "sync-exec";
const exec = sh.default;
import color from 'picocolors';

async function main() {
	console.clear();
  // should be able to grab author off the git config in most instances
  let value = await exec(`git config user.name`);
  let author = value.stdout.trim();
  // delay so that we clear and then let them visually react to change
	await setTimeout(500);
  // intro text
  p.intro(`${color.bgBlue(color.white(` HAXTheWeb CLI `))}`);
  p.intro(`${color.bgMagenta(color.white(` Let's create a bright future `))}`);

	const project = await p.group(
		{
      type: ({ results }) =>
				p.select({
					message: `What type of project are you building`,
					initialValue: 'webcomponent',
					maxItems: 2,
					options: [
						{ value: 'webcomponent', label: 'Web component' },
						{ value: 'haxsite', label: "HAX Site"},
					],
				}),
			typeOption: ({ results }) => {
				switch (results.type) {
					case "webcomponent":
						return p.select({
							message: `What kind of web component do you want to create?`,
							initialValue: 'hax',
							maxItems: 1,
							options: [
								{ value: 'hax', label: "HAX default"},
              ],
						});
					break;
					case "haxsite":
						return p.select({
							message: `What kind of site is it`,
							initialValue: 'default',
							maxItems: 1,
							options: [
								{ value: 'default', label: "Default" },
							],
						});
					break;
				}
			},
			name: ({ results }) => {
				return p.text({
					message: 'Project name:',
          placeholder: results.type === "webcomponent" ? "my-element" : "mysite",
          validate: (value) => {
            if (!value) {
              return "Name is required";
            }
            if (value.indexOf(' ') !== -1) {
              return "No spaces allowed in project name";
            }
            if (results.type === "webcomponent" && value.indexOf('-') === -1 && value.indexOf('-') !== 0 && value.indexOf('-') !== value.length-1) {
              return "Name must include at least one `-` and must not start or end name.";
            }
          }
				});
      },
			path: ({ results }) => {
        let initialPath = `${process.cwd()}/${results.name.toLowerCase()}`;
				return p.text({
					message: 'Where should we create your project?',
          initialValue: initialPath,
				});
      },
      author: ({ results }) => {
				return p.text({
					message: 'Author:',
          initialValue: author,
				});
      },
      install: () =>
				p.confirm({
					message: 'Install dependencies? (npm)',
					initialValue: true,
      }),
      git: () =>
        p.confirm({
          message: 'Put in version control? (git)',
          initialValue: true,
        }),
		},
		{
			onCancel: () => {
				p.cancel('Operation cancelled.');
				process.exit(0);
			},
		}
	);
  if (project.path) {
    // values not set but important for templating
    project.className = dashToCamel(project.name);
    project.version = "9.0.0-alpha.0";
    project.id = generateUUID();
    project.timestamp = Date.now();
    project.hexCode = "#540054";
    // icons
    ["48x48","72x72","96x96","144x144","192x192","256x256","512x512"].map(size => project[`logo${size}`] = `assets/icon-${size}`);
    console.log(project);
    let s = p.spinner();
    s.start('Copying files');
    await setTimeout(250);
    await exec(`cp -R ${process.mainModule.path}/templates/${project.type}/${project.typeOption}/ ${project.path}`);
    // rename paths that are of the element name in question
    await exec(`mv ${project.path}/src/webcomponent.js ${project.path}/src/${project.name}.js`);
    await exec(`mv ${project.path}/lib/webcomponent.haxProperties.json ${project.path}/lib/${project.name}.haxProperties.json`);
    s.stop('Files copied');
    await setTimeout(250);
    s.start('Making files awesome');
      for (const filePath of readAllFiles(project.path)) {
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
    if (project.install) {
      await setTimeout(250);
      s.start(`Let's install everything using the magic of npm`);
      await setTimeout(250);
      await exec(`cd ${project.path} && npm install`);
      await setTimeout(250);
      s.stop(`Everything is installed. It's go time`);
    }
    if (project.git) {
      project.gitRepo = await p.text({
        message: 'Git Repo location:',
        placeholder: `git@github.com:${project.author}/${project.name}.git`
      });
      await exec(`cd ${project.path} && git init && git add -A && git commit -m "first commit" && git branch -M main${project.gitRepo != '' ? ` && git remote add origin ${project.gitRepo}` : ''}`);
    }
  }
	let nextSteps = `cd ${project.path}     \n${project.install ? '' : 'npm install\n'} npm start`;

	p.note(nextSteps, `${project.name} is ready to go. To start development:`);

	p.outro(`Welcome to the revolution. Ideas to HAX faster? ${color.underline(color.cyan('https://github.com/haxtheweb/issues'))}`);
}

main().catch(console.error);

/**
 * Helper to convert dash to camel; important when reading attributes.
 */
function dashToCamel(str) {
  return str.replace(/-([a-z])/g, function (g) {
    return g[1].toUpperCase();
  });
}
// read in all files recursively for rewriting
function* readAllFiles(dir)  {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      yield* readAllFiles(path.join(dir, file.name));
    } else {
      yield path.join(dir, file.name);
    }
  }
}
// generate unique-enough id
function generateUUID() {
  return "ss-s-s-s-sss".replace(/s/g, _uuidPart);
}
function _uuidPart() {
  return Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .substring(1);
}