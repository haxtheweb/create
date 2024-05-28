import * as p from '@clack/prompts';
import * as sh from "sync-exec";
const exec = sh.default;
import { setTimeout } from 'node:timers/promises';
import color from 'picocolors';

/**
 * https://github.com/open-wc/create/blob/master/src/create.js
 * look at how openwc does templating
 * ideally we'd be templating the files from a prebuilt repo and it would be minimal
 * need CLIs for becoming a developer:
 * of a new Lit based element
 * of a new DDD based element
 * of a new HAXcms stand alone site
 * of a new HAX theme
 */

async function main() {
	console.clear();

	await setTimeout(500);

	p.intro(`${color.bgCyan(color.black(` Let's hax-the-web `))}`);

	const project = await p.group(
		{
            type: ({ results }) =>
				p.select({
					message: `What type of project are you building`,
					initialValue: 'ddd',
					maxItems: 3,
					options: [
						{ value: 'lit', label: 'New Lit based element' },
						{ value: 'ddd', label: 'New DDD based element' },
						{ value: 'haxcmsTheme', label: 'New HAXcms theme', disabled: true },
					],
				}),
			path: ({ results }) => {
                let initialPath = `${process.cwd()}/my-project`;
				return p.text({
					message: 'Where should we create your project?',
                    initialValue: initialPath,
				});
            },
			install: () =>
				p.confirm({
					message: 'Install dependencies?',
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
        await exec(`cp -R ./templates/${project.type}/ ${project.path}`);
        await exec(`touch ${project.path}/cool.js`);
    }

	if (project.install) {
		const s = p.spinner();
		s.start('Installing via yarn');
        await exec(`cd ${project.path} && yarn install`);
		s.stop('Installed via yarn');
	}

	let nextSteps = `cd ${project.path}        \n${project.install ? '' : 'yarn install\n'}yarn start`;

	p.note(nextSteps, 'Next steps.');

	p.outro(`Problems? ${color.underline(color.cyan('https://github.com/haxtheweb/issues'))}`);
}

main().catch(console.error);