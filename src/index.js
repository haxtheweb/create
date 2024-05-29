import * as fs from 'node:fs';
import * as path from "node:path";
import { setTimeout } from 'node:timers/promises';
import * as ejs from "ejs";
import * as p from '@clack/prompts';
import * as sh from "sync-exec";
const exec = sh.default;
import color from 'picocolors';

/**
 * https://github.com/open-wc/create/blob/master/src/create.js
 * look at how openwc does templating
 * ideally we'd be templating the files from a prebuilt repo and it would be minimal
 * need CLIs for becoming a developer:
 * of a new DDD based element
 * of a new HAXcms stand alone site
 * of a new HAX theme
 */

async function main() {
	console.clear();
  // should be able to grab author off the git config in most instances
  let value = await exec(`git config user.name`);
  let author = value.stdout.trim();

	await setTimeout(500);

	p.intro(`${color.bgCyan(color.black(` HAX The CLI `))}`);

	const project = await p.group(
		{
      type: ({ results }) =>
				p.select({
					message: `What type of project are you building`,
					initialValue: 'webcomponent',
					maxItems: 3,
					options: [
						{ value: 'webcomponent', label: 'Web component' },
						{ value: 'haxcms', label: "HAX Site"},
						{ value: 'theme', label: "HAX Theme"},
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
								{ value: 'hax', label: "HAX recommended starter"},
              ],
						});
					break;
					case "haxcms":
						return p.select({
							message: `What kind of site is it`,
							initialValue: 'course',
							maxItems: 2,
							options: [
								{ value: 'course', label: "Course" },
							],
						});
					break;
          case "theme":
            return p.select({
							message: `Theme base`,
							initialValue: 'course',
							maxItems: 2,
							options: [
								{ value: 'default', label: "Default" },
							],
						});
          break;
				}
			},
			name: ({ results }) => {
				return p.text({
					message: 'Element name:',
          initialValue: "my-element",
          validate: (value) => {
            if (value.indexOf(' ') !== -1) {
              return "No spaces allowed in project name";
            }
            if (value.indexOf('-') === -1) {
              return "Name must include at least one `-`";
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
		},
		{
			onCancel: () => {
				p.cancel('Operation cancelled.');
				process.exit(0);
			},
		}
	);
    if (project.path) {
      project.className = dashToCamel(project.name);
	  let s = p.spinner();
      s.start('Copying files');
      await setTimeout(250);
      await exec(`cp -R ${path.resolve(path.dirname(''))}/src/templates/${project.type}/${project.typeOption}/ ${project.path}`);
      // rename paths that are of the element name in question
      await exec(`mv ${project.path}/src/webcomponent.js ${project.path}/src/${project.name}.js`);
      await exec(`mv ${project.path}/lib/webcomponent.haxProperties.json ${project.path}/lib/${project.name}.haxProperties.json`);
	  s.stop('Files copied');
      await setTimeout(250);
	  s.start('Making files awesome');
      try {
        for (const filePath of readAllFiles(project.path)) {
          const ejsString = ejs.fileLoader(filePath, 'utf8');
          let content = ejs.render(ejsString, project);
          fs.writeFileSync(filePath, content);
        }
        // file written successfully
      } catch (err) {
        console.error(err);
      }
	  s.stop('Files are now awesome!');
      await setTimeout(250);
      s.start(`Let's install everything using the magic of yarn`);
      await setTimeout(250);
      await exec(`cd ${project.path} && yarn install`);
      await setTimeout(250);
      s.stop(`Everything is installed. It's go time`);
    }
	let nextSteps = `cd ${project.path}     \nyarn start`;

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