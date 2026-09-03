import { characters } from './art.js';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { setTimeout } from 'node:timers/promises';

export async function haxIntro() {
    console.clear();
    await setTimeout(10);
    console.clear();
    p.intro(`${color.bgBlack(color.underline(color.gray(`Never`)))}`);
    await setTimeout(100);
    p.intro(`${color.bgBlack(color.red(`     stop `))}`);
    await setTimeout(300);
    p.intro(`${color.bgBlack(color.white(`         never`))}`);
    await setTimeout(300);
    p.intro(`${color.bgBlack(color.cyan(`              stopping `))}`);
    await setTimeout(500);
    let colors = ['blue','yellow','red','magenta']
    for (let i in characters) {
      if (i < characters.length-1) {
        console.clear();
        p.intro(`${color.bgBlack(color[colors[i]](`Better future loading..`))}`);
        p.intro(color.bgBlack(color[colors[i]](characters[i])));
        let rockets = '';
        for (let step = 0; step < i; step++) {
          rockets += "🚀🚀🚀"
        }
        p.intro(rockets);
        await setTimeout((Math.random() * 400) + 150);
      }
    }
    console.clear();
    p.intro(color.bgBlack(color.green(characters.pop())))
    p.intro(`${color.bgGreen(color.black(`     The Web : CLI    `))}
  
  
    ${merlinSays('Welcome wary web wanderer')}`);
}

// standard community statement so we can leverage on cancel executions
export function communityStatement() {
    p.outro(`
      🧙  HAX @ Penn State: ${color.underline(color.cyan('https://hax.psu.edu'))}
      
      🔮  Ideas to HAX Harder, Better, Faster, Stronger: ${color.underline(color.white('https://github.com/haxtheweb/issues/issues'))}
      
      👔  Share on LinkedIn: ${color.underline(color.cyan('https://bit.ly/hax-the-linkedin'))}
      
      🧵  Tweet on X: ${color.underline(color.white('https://bit.ly/hax-the-x'))}
      
      💬  Join Community: ${color.underline(color.cyan('https://discord.gg/EKYJAjqGhf'))}
      
      💡  ${color.bold(color.white(`Never. Stop. Innovating.`))}
    `);
  }
  
  // standardize merlin statements visually.
  // Canonical shared source: @haxtheweb/haxcms-nodejs/src/lib/cliTheme.js
  // merlinSays(). Keep this byte-for-byte in sync with that copy so the whole
  // HAX CLI speaks with one Merlin voice. (Not imported from there directly
  // because party.js / audit.js load this module in unit tests without the
  // haxcms-nodejs dist present; importing it here would newly gate those tests
  // on haxcms-nodejs dist in CI.)
  export function merlinSays(text) {
    return `${color.yellow(color.bgBlack(` 🧙 Merlin: `))} ${color.bgBlack(color.green(` ${text} `))}`;
  }
