import * as fs from "node:fs";
import {
  exec,
  interactiveExec,
  runCommand,
  isValidGithubOwner,
  isValidGithubRepo,
} from "../utils.js";
import * as path from "node:path";
import open from "open";

import * as p from "@clack/prompts";
import color from "picocolors";
import { merlinSays } from "../statements.js";
import { t } from "../i18n.js";

const osPathCmd = process.platform === "win32" ? "where.exe" : "which";

let sysGit = true;
exec(`${osPathCmd} git`, (error) => {
  if (error) {
    sysGit = false;
  }
});

let sysGh = true;
exec(`${osPathCmd} gh`, (error) => {
  if (error) {
    sysGh = false;
  }
});

let sysSSH = true;

export function partyActions() {
  return [
    { value: "docs", label: t("partyActionDocs") },
    { value: "playground", label: t("partyActionPlayground") },
    { value: "psu", label: t("partyActionPsu") },
    { value: "issues", label: t("partyActionIssues") },
    { value: "discord", label: t("partyActionDiscord") },
    { value: "club", label: t("partyActionClub") },
    { value: "github", label: t("partyActionGithub") },
  ];
}

// Pure predicate: does this exec() error represent "the target directory
// already exists and is not empty" (i.e. the repo was already cloned),
// as opposed to a fork-not-found / auth failure? Extracted so the branch
// logic in cloneHAXRepositories can be unit tested without shelling out.
export function isRepoAlreadyExistsError(error) {
  return !!(
    error &&
    typeof error.stderr === "string" &&
    error.stderr.includes("already exists and is not an empty directory")
  );
}

// Pure mapping from a HAX repo name to the commands needed to install its
// dependencies, given the npm client and the base directory repos were
// cloned into. Extracted from the inline switch in cloneHAXRepositories so
// the per-repo dependency logic can be unit tested without exec()/network.
// Security (R2-L-1): returns { command, args, cwd } for runCommand instead of
// `cd ${baseDir}/${repo} && ...` shell strings.
export function resolveInstallCommands(repoName, npmClient, baseDir) {
  const repoDir = path.join(baseDir, repoName);
  switch (repoName) {
    case "webcomponents":
      return [
        {
          command: "yarn",
          args: ["global", "add", "lerna", "web-component-analyzer"],
          cwd: baseDir,
        },
        { command: "yarn", args: ["install"], cwd: repoDir },
      ];
    case "create":
    case "hax-the-club":
    case "haxcms-nodejs":
    case "desktop":
      return [{ command: npmClient, args: ["install"], cwd: repoDir }];
    case "haxcms-php":
      // ddev setup
      return [];
    case "HAXiam":
      // curl setup?
      return [];
    default:
      return [];
  }
}

export async function partyCommandDetected(commandRun) {
  if (!commandRun.options.quiet) {
    p.intro(`${color.bgBlack(color.white(` ${t("partyDetected")} `))}`);
  }

  let actions = partyActions();

  let actionAssigned = false;
  // default to status unless already set so we don't issue a create in a create
  if (!commandRun.arguments.action) {
    actionAssigned = true;
    commandRun.arguments.action = "party:status";
  }

  commandRun.command = "party";

  let operation = {
    ...commandRun.arguments,
    ...commandRun.options,
  };

  actions.push({ value: "quit", label: `🚪 ${t("partyActionQuit")}` });

  while (operation.action !== "quit") {
    if (!operation.action) {
      commandRun = {
        command: null,
        arguments: {},
        options: {
          npmClient: `${operation.npmClient}`,
          author: `${operation.author}`,
        },
      };
      operation = await p.group(
        {
          action: ({ results }) =>
            p.select({
              message: t("partyActionsPrompt"),
              defaultValue: actions[0],
              initialValue: actions[0],
              options: actions,
            }),
        },
        {
          onCancel: () => {
            if (!commandRun.options.quiet) {
              p.cancel(`🧙 Merlin: ${t("partyCancel")} 🪄`);
            }
            process.exit(0);
          },
        },
      );
    }
    if (operation.action) {
      p.intro(`hax party ${color.bold(operation.action)}`);
    }
    switch (operation.action) {
      case "party:status":
      case "party:stats":
        if (!commandRun.options.quiet) {
          p.intro(
            `${color.green(
              color.bold(`         
                       888            
                       888            
88888b.  8888b. 888d888888888888  888 
888 "88b    "88b888P"  888   888  888 
888  888.d888888888    888   888  888 
888 d88P888  888888    Y88b. Y88b 888 
88888P" "Y888888888     "Y888 "Y88888 
888                               888 
888                           Y8bd88P`),
            )}`,
          );
        }
        break;
      case "docs":
        // open the docs
        p.intro(`${color.bgBlue(color.white(` ${t("partyDocsTitle")} `))}`);
        p.intro(
          `${color.bgBlue(color.white(` ${t("partyOpeningInBrowser")} `))}`,
        );
        await open("https://haxtheweb.org/");
        p.outro(`${color.bgBlue(color.white(` https://haxtheweb.org/ `))}`);
        break;
      case "playground":
        // open the playground
        p.intro(
          `${color.bgBlue(color.white(` ${t("partyPlaygroundTitle")} `))}`,
        );
        p.intro(
          `${color.bgBlue(color.white(` ${t("partyOpeningInBrowser")} `))}`,
        );
        await open("https://hax.cloud/");
        p.outro(`${color.bgBlue(color.white(` https://hax.cloud/ `))}`);
        break;
      case "psu":
        // open the psu site
        p.intro(`${color.bgBlue(color.white(` HAX PSU `))}`);
        p.intro(
          `${color.bgBlue(color.white(` ${t("partyOpeningInBrowser")} `))}`,
        );
        await open("https://hax.psu.edu/");
        p.outro(`${color.bgBlue(color.white(` https://hax.psu.edu/ `))}`);
        break;
      case "issues":
        // open the issues
        p.intro(`${color.bgBlue(color.white(` ${t("partyIssuesTitle")} `))}`);
        p.intro(
          `${color.bgBlue(color.white(` ${t("partyOpeningInBrowser")} `))}`,
        );
        await open("https://github.com/haxtheweb/issues/issues");
        p.outro(
          `${color.bgBlue(color.white(` https://github.com/haxtheweb/issues/issues `))}`,
        );
        break;
      case "discord":
        // open the discord
        p.intro(`${color.bgBlue(color.white(` HAX Discord `))}`);
        p.intro(
          `${color.bgBlue(color.white(` ${t("partyOpeningInBrowser")} `))}`,
        );
        await open("https://discord.gg/aCGxmRHEJP");
        p.outro(
          `${color.bgBlue(color.white(` https://discord.gg/aCGxmRHEJP `))}`,
        );
        break;
      case "club":
        // open the club
        p.intro(`${color.bgBlue(color.white(` ${t("partyClubTitle")} `))}`);
        p.intro(
          `${color.bgBlue(color.white(` ${t("partyOpeningInBrowser")} `))}`,
        );
        await open("https://orgcentral.psu.edu/organization/hax-the-club");
        p.outro(
          `${color.bgBlue(color.white(` https://orgcentral.psu.edu/organization/hax-the-club `))}`,
        );
        // we can change this to the club website when it's up
        break;
      case "gh":
      case "github":
        try {
          // auto and y are aliases
          if (!commandRun.options.root && !commandRun.options.auto) {
            commandRun.options.root = await p.text({
              message: t("partyRootPrompt"),
              placeholder: process.cwd(),
              initialValue: process.cwd(),
              required: true,
              validate: (value) => {
                if (!value) {
                  return t("partyPathRequired");
                }
                if (!fs.existsSync(value)) {
                  return t("partyPathMissing", { path: value });
                }
              },
            });
            // subprocesses are based on the root process folder
            process.chdir(commandRun.options.root);
          }

          // list HAX repos
          const initialValues = ["webcomponents"];
          const options = [
            {
              value: "webcomponents",
              label: `${t("partyRepoWebcomponents")} - haxtheweb/webcomponents`,
            },
            {
              value: "create",
              label: `${t("partyRepoCreate")} - haxtheweb/create`,
            },
            {
              value: "hax-the-club",
              label: "HAX The Club - haxtheweb/hax-the-club",
            },
            {
              value: "haxcms-nodejs",
              label: "HAXcms Node.js - haxtheweb/haxcms-nodejs",
            },
            { value: "haxcms-php", label: "HAXcms PHP - haxtheweb/haxcms-php" },
            { value: "desktop", label: "HAX The Desktop - haxtheweb/desktop" },
            { value: "HAXiam", label: "HAXiam - haxtheweb/HAXiam" },
          ];

          p.note(`${merlinSays(t("partySelectMultiple", { party: color.magenta(color.bold(t("partyIsAParty"))), multiple: color.bold(t("partyMultiple")) }))}
      ${t("partyRememberToFork", { forkEachProject: color.bold(t("partyForkEachProject")), github: color.bold("GitHub") })}`);
          if (!commandRun.options.repos && commandRun.options.auto) {
            commandRun.options.repos = initialValues;
          } else if (!commandRun.options.repos) {
            commandRun.options.repos = await p.multiselect({
              message: t("partyReposPrompt"),
              initialValues: initialValues,
              options: options,
              required: false,
            });
          } else if (commandRun.options.repos.includes("all")) {
            commandRun.options.repos = options.map((item) => item.value);
          }
          await cloneHAXRepositories(commandRun);
        } catch (e) {
          // non-fatal: user may have cancelled the repo selection prompt
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

async function cloneHAXRepositories(commandRun) {
  let s = p.spinner();
  // check for system dependencies: ssh, yarn, etc.
  if (!sysGit) {
    console.error(`${color.red(t("partyGitNotInstalled", { command: color.bold("hax party") }))}
    ${t("partyFollowInstructions")}
    ${color.underline(color.cyan(`https://git-scm.com/book/en/v2/Getting-Started-Installing-Git`))}`);
    process.exit(1);
  }

  if (!sysGh) {
    try {
      const { stdout, stderr } = await exec("ssh -T git@github.com");
    } catch (error) {
      // The GitHub SSH test always returns as stderr
      if (!error.stderr.includes("successfully authenticated")) {
        sysSSH = false;
      }
    }

    if (!sysSSH) {
      console.error(`${color.red(t("partySshNotSetUp", { command: color.bold("hax party") }))}
        ${t("partyFollowInstructions")}
        ${color.underline(color.cyan(`https://docs.github.com/en/authentication/connecting-to-github-with-ssh`))}`);
      process.exit(1);
    }
  } else {
    // gh cli can make new ssh keys and push them to GitHub
    try {
      await exec("gh auth status");
    } catch {
      console.log(`${color.red(t("partyGhNotAuthenticated"))}
${t("partyGhGuidedLogin", { command: color.bold("hax party") })}
${t("partyGhSelectOptions", { sshOption: color.cyan(`Generate a new SSH key`), browserOption: color.cyan(`Login with a web browser`) })}`);

      await interactiveExec("gh", [
        "auth",
        "login",
        "-p",
        "ssh",
        "--clipboard",
      ]);
    }
  }

  try {
    await exec(`yarn --version`);
  } catch (e) {
    await exec(`npm install -g yarn`);
  }

  // Security (R2-L-2): the clone owner must be a GitHub username, not the
  // free-form `git config user.name` ("Jane Doe"), and it's restricted to the
  // characters GitHub allows because it becomes part of the clone URL. Prefer
  // the authenticated gh login when the GitHub CLI is available.
  let githubOwner = commandRun.options.author;
  if (sysGh) {
    try {
      const { stdout } = await runCommand("gh", [
        "api",
        "user",
        "--jq",
        ".login",
      ]);
      if (stdout && stdout.trim()) {
        githubOwner = stdout.trim();
      }
    } catch (e) {
      // fall back to --author
    }
  }
  if (!isValidGithubOwner(githubOwner)) {
    console.error(
      color.red(
        t("partyInvalidGithubUser", {
          user: `${githubOwner}`,
          flag: "--author",
        }),
      ),
    );
    process.exit(1);
  }

  for (const item of commandRun.options.repos) {
    // Security (R2-L-2): --repos values become part of clone/fork targets
    if (!isValidGithubRepo(item)) {
      console.error(color.red(t("partyInvalidRepo", { repo: `${item}` })));
      continue;
    }
    // If GitHub CLI is installed
    if (sysGh) {
      try {
        // ssh link is used since https prompts for password
        s.start(
          t("partyCloning", {
            repo: color.bold(item),
            path: color.bold(process.cwd()),
          }),
        );
        await runCommand("git", [
          "clone",
          `git@github.com:${githubOwner}/${item}.git`,
        ]);
        s.stop(
          t("partyCloneSuccess", {
            successfully: color.green(t("partySuccessfully")),
            repo: color.bold(item),
            path: color.bold(process.cwd()),
          }),
        );
      } catch (e) {
        // skip the loop if the repo already exists
        if (isRepoAlreadyExistsError(e)) {
          s.stop(
            `${color.yellow(t("partyRepoExists", { repo: color.bold(`${item}`), path: color.bold(process.cwd()) }))}`,
          );
          break;
        }

        s.stop(
          t("partyCloneFailed", {
            failed: color.red(t("partyFailed")),
            repo: color.bold(item),
            path: color.bold(process.cwd()),
          }),
        );

        p.note(
          `${color.red(t("partyForkNotFound", { fork: color.bold(t("partyFork")), repo: color.bold(item) }))}`,
        );

        s.start(
          t("partyGhForking", {
            tool: color.bold(`gh repo`),
            repo: color.bold(item),
          }),
        );
        await runCommand("gh", [
          "repo",
          "fork",
          `haxtheweb/${item}`,
          "--clone",
        ]);
        s.stop(
          t("partyCloneSuccess", {
            successfully: color.green(t("partySuccessfully")),
            repo: color.bold(item),
            path: color.bold(process.cwd()),
          }),
        );
      }
    }
    // Standard git, not GitHub CLI
    else {
      // while loop keeps HAX active until the user is ready
      let isForked = false;
      let firstRun = true;

      while (!isForked) {
        try {
          // ssh link is used since https prompts for password
          if (firstRun) {
            s.start(
              t("partyCloning", {
                repo: color.bold(item),
                path: color.bold(process.cwd()),
              }),
            );
          } else {
            s.start(
              t("partyCloningRetry", {
                repo: item,
                path: color.bold(process.cwd()),
              }),
            );
          }

          await runCommand("git", [
            "clone",
            `git@github.com:${githubOwner}/${item}.git`,
          ]);
          s.stop(
            t("partyCloneSuccess", {
              successfully: color.green(t("partySuccessfully")),
              repo: color.bold(item),
              path: color.bold(process.cwd()),
            }),
          );

          isForked = true;
        } catch (e) {
          // skip the loop if the repo already exists
          if (isRepoAlreadyExistsError(e)) {
            s.stop(
              `${color.yellow(t("partyRepoExists", { repo: color.bold(`${item}`), path: color.bold(process.cwd()) }))}`,
            );
            break;
          }

          s.stop(
            t("partyCloneFailed", {
              failed: color.red(t("partyFailed")),
              repo: color.bold(item),
              path: color.bold(process.cwd()),
            }),
          );

          p.note(`${color.red(t("partyForkNotFoundAccount", { fork: color.bold(t("partyFork")), repo: color.bold(item) }))}
      ${t("partyForkLink", { repo: color.bold(item), url: color.underline(color.cyan(`https://github.com/haxtheweb/${item}/fork`)) })}`);

          // We don't want to spam the link every time
          if (firstRun) {
            p.intro(`${merlinSays(t("partyLinkWillOpen"))}`);
            setTimeout(async () => {
              await open(`https://github.com/haxtheweb/${item}/fork`);
            }, 3000);
            firstRun = false;
          }

          let response = await p.confirm({
            message: t("partyForkedConfirm"),
            initialValue: true,
          });

          // Multiple ways to quit (select no, ctrl+c, etc)
          if (p.isCancel(response) || !response) {
            p.cancel(`🧙 Merlin: ${t("partyCancel")} 🪄`);
            process.exit(0);
          }
        }
      }
    }

    s.start(t("partyInstallingDeps", { repo: item }));
    const installCommands = resolveInstallCommands(
      item,
      commandRun.options.npmClient,
      process.cwd(),
    );
    for (const installCommand of installCommands) {
      await runCommand(installCommand.command, installCommand.args, {
        cwd: installCommand.cwd,
      });
    }
    s.stop(t("partyDepsInstalled", { repo: item }));
  }
}
