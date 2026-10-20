#!/usr/bin/env node
// forces middleware into CLI mode so we don't automatically perform certain operations like pathing context.
// This must be the first import: imports run before any other statement here.
import "./lib/cli-mode.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import color from "picocolors";

import { haxIntro, communityStatement } from "./lib/statements.js";
import { t } from "./lib/i18n.js";
import {
  log,
  consoleTransport,
  logger,
  isStructuredFormat,
  enableStructuredOutput,
} from "./lib/logging.js";
import { auditCommandDetected } from "./lib/programs/audit.js";
import { runAuditCommand as runAuditCommandWith } from "./lib/programs/audit-schema.js";
import { partyCommandDetected } from "./lib/programs/party.js";
import {
  webcomponentProcess,
  webcomponentCommandDetected,
  webcomponentActions,
  elementsSearchCommand,
} from "./lib/programs/webcomponent.js";
import {
  siteActions,
  siteNodeOperations,
  siteProcess,
  siteCommandDetected,
  siteThemeList,
  siteSkeletonList,
} from "./lib/programs/site.js";
import { skillsCommandDetected, skillsActions } from "./lib/programs/skills.js";
import {
  camelToDash,
  exec,
  interactiveExec,
  writeConfigFile,
  readConfigFile,
  getTimeDifference,
  validateNpmClient,
  rejectShellMetacharacters,
  rejectLeadingDash,
  hasNameSpecialCharacters,
  validateDomain,
} from "./lib/utils.js";
import * as haxcmsLib from "@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js";
const HAXCMS = haxcmsLib.HAXCMS;
const systemStructureContext = haxcmsLib.systemStructureContext;
// `hax audit [ddd|schema|i18n|ssr|all]`; the DDD audit itself lives in audit.js
const runAuditCommand = (commandRun, dddPath, schemaRoot) =>
  runAuditCommandWith(commandRun, dddPath, schemaRoot, {
    auditDDD: auditCommandDetected,
  });

// check the last time this was run
let lastTime = readConfigFile("hax-cli-last-run");
// first run in the event it is null assume now
if (!lastTime) {
  lastTime = new Date().toISOString();
}
// check time difference broken down by unit
const timeSince = getTimeDifference(new Date().toISOString(), lastTime);
// write last run so that we know last time they were here
writeConfigFile("hax-cli-last-run", new Date().toISOString());

import { program } from "commander";

import packageJson from "../package.json" with { type: "json" };

let sysGit = true;
exec("which git", (error) => {
  if (error) {
    sysGit = false;
  }
});

async function main() {
  let wcReg = {};
  let regPath = path.join(__dirname, "./lib/wc-registry.json");
  if (fs.existsSync(regPath)) {
    try {
      wcReg = JSON.parse(fs.readFileSync(regPath));
    } catch (e) {
      // no registry for testing, probably busted package
    }
  }
  let commandRun = {};
  program
    .option("--v", t("cliOptVerbose"))
    .option("--debug", t("cliOptDebug"))
    .option("--format <char>", t("cliOptFormat"))
    .option("--path <char>", t("cliOptPath"))
    .option("--name <char>", t("cliOptName"))
    .option("--npm-client <char>", t("cliOptNpmClient"), "npm")
    .option("--y", t("cliOptYes"))
    .option("--skip", t("cliOptSkip"))
    .option("--quiet", t("cliOptQuiet"))
    .option("--auto", t("cliOptAuto"))
    .option("--no-i", t("cliOptNoI"))
    .option("--to-file <char>", t("cliOptToFile"))
    .option("--no-extras", t("cliOptNoExtras"))
    .option("--root <char>", t("cliOptRoot"))
    .option("--lang <char>", t("cliOptLang"))

    // options for webcomponent
    .option("--org <char>", t("cliOptOrg"))
    .option("--author <char>", t("cliOptAuthor"))
    .option("--template <char>", t("cliOptTemplate"))
    .option("--writeHaxProperties", t("cliOptWriteHaxProperties"))
    .option("--force", t("cliOptForce"))

    // options for site
    .option("--import-site <char>", t("cliOptImportSite"))
    .option(
      "--import-structure <char>",
      `${t("cliOptImportStructure")}\n\rpressbooksToSite\n\relmslnToSite\n\rhaxcmsToSite\n\rnotionToSite\n\rgitbookToSite\n\revolutionToSite\n\rploneToSite\n\rwordpressPagesToSite\n\rdrupalToSite\n\ropenstaxToSite\n\rvitepressToSite\n\rhtmlToSite\n\rdocxToSite\n\rxlsxToSite`,
    )
    .option("--node-op <char>", t("cliOptNodeOp"))
    .option("--item-id <char>", t("cliOptItemId"))
    .option("--domain <char>", t("cliOptDomain"))
    .option("--title-scrape <char>", t("cliOptTitleScrape"))
    .option("--content-scrape <char>", t("cliOptContentScrape"))
    .option("--content-format <char>", t("cliOptContentFormat"))
    .option("--description <char>", t("cliOptDescription"))
    .option("--items-import <char>", t("cliOptItemsImport"))
    .option("--custom-theme-name <char>", t("cliOptCustomThemeName"))
    .option(
      "--custom-theme-template <char>",
      t("cliOptCustomThemeTemplateList"),
    )
    .option("--skeleton-file <char>", t("cliOptSkeletonFile"))
    .option("--skeleton-machine-name <char>", t("cliOptSkeletonMachineName"))
    .option("--search <char>", t("cliOptSearchSiteSearch"))
    .option("--search-field <char>", t("cliOptSearchField"))
    .option("--search-case-sensitive", t("cliOptSearchCaseSensitive"))
    .option("--search-limit <char>", t("cliOptSearchLimit"))
    .option("--search-selector", t("cliOptSearchSelector"))
    .option("--search-mode <char>", t("cliOptSearchMode"))

    // options for rsync
    .option("--source <char>", t("cliOptSource"))
    .option("--destination <char>", t("cliOptDestination"))
    .option("--exclude <char>", t("cliOptExclude"))
    .option("--dry-run", t("cliOptDryRun"))
    .option("--delete", t("cliOptDelete"))

    // options for party
    .option("--repos <char...>", t("cliOptRepos"))

    // options for new site commands
    .option("--export-format <char>", t("cliOptExportFormat"))
    .option("--revision-id <char>", t("cliOptRevisionId"))
    .option("--restore", t("cliOptRestore"))
    .option("--target-path <char>", t("cliOptTargetPath"))
    .option("--file-uuid <char>", t("cliOptFileUuid"))
    .option("--file-path <char>", t("cliOptFilePath"))
    .option("--replace <char>", t("cliOptReplace"))
    .option("--confirm", t("cliOptConfirm"))
    .option("--destroy-confirm", t("cliOptDestroyConfirm"))

    .version(packageJson.version)
    .helpCommand(true);

  // default command which runs interactively
  program
    .command("start")
    .description(t("cliCmdStart"))
    .action(() => {
      commandRun = {
        command: "start",
        arguments: {},
        options: {},
      };
    });

  program
    .command("update")
    .description(t("cliCmdUpdate"))
    .option("--y", t("cliOptYes"))
    .action(() => {
      commandRun = {
        command: "update",
        arguments: {},
        options: {},
      };
    });

  program
    .command("serve")
    .description(t("cliCmdServe"))
    .action(() => {
      commandRun = {
        command: "serve",
        arguments: {
          action: "serve",
        },
        options: {},
      };
    });

  // site operations and actions
  let strActions = "";
  siteActions().forEach((action) => {
    strActions += `${action.value} - ${action.label}` + "\n\r";
  });
  let siteProg = program
    .command("site")
    .description(t("cliCmdSite"))
    .argument("[action]", t("cliArgSiteAction") + "\n\r" + strActions)
    .action((action) => {
      commandRun = {
        command: "site",
        arguments: {},
        options: {},
      };
      if (action) {
        commandRun.arguments.action = action;
        commandRun.options.skip = true;
      }
    })
    .option("--v", t("cliOptVerbose"))
    .option("--debug", t("cliOptDebug"))
    .option("--format <char>", t("cliOptFormat"))
    .option("--path <char>", t("cliOptPath"))
    .option("--npm-client <char>", t("cliOptNpmClient"), "npm")
    .option("--y", t("cliOptYes"))
    .option("--skip", t("cliOptSkip"))
    .option("--quiet", t("cliOptQuiet"))
    .option("--auto", t("cliOptAuto"))
    .option("--no-i", t("cliOptNoI"))
    .option("--to-file <char>", t("cliOptToFile"))
    .option("--no-extras", t("cliOptNoExtras"))
    .option("--root <char>", t("cliOptRoot"))

    .option("--import-site <char>", t("cliOptImportSite"))
    .option(
      "--import-structure <char>",
      `${t("cliOptImportStructure")}\n\rpressbooksToSite\n\relmslnToSite\n\rhaxcmsToSite\n\rnotionToSite\n\rgitbookToSite\n\revolutionToSite\n\rploneToSite\n\rwordpressPagesToSite\n\rdrupalToSite\n\ropenstaxToSite\n\rvitepressToSite\n\rhtmlToSite\n\rdocxToSite\n\rxlsxToSite`,
    )
    .option("--name <char>", t("cliOptSiteName"))
    .option("--domain <char>", t("cliOptDomain"))
    .option("--node-op <char>", t("cliOptNodeOp"))
    .option("--title-scrape <char>", t("cliOptTitleScrape"))
    .option("--content-scrape <char>", t("cliOptContentScrape"))
    .option("--content-format <char>", t("cliOptContentFormat"))
    .option("--description <char>", t("cliOptDescription"))
    .option("--items-import <char>", t("cliOptItemsImport"))
    .option("--custom-theme-name <char>", t("cliOptCustomThemeName"))
    .option("--custom-theme-template <char>", t("cliOptCustomThemeTemplate"))
    .option("--skeleton-file <char>", t("cliOptSkeletonFile"))
    .option("--skeleton-machine-name <char>", t("cliOptSkeletonMachineName"))
    .option("--search <char>", t("cliOptSearch"))
    .option("--search-field <char>", t("cliOptSearchField"))
    .option("--search-case-sensitive", t("cliOptSearchCaseSensitive"))
    .option("--search-limit <char>", t("cliOptSearchLimit"))
    .option("--search-selector", t("cliOptSearchSelector"))
    .option("--search-mode <char>", t("cliOptSearchMode"))
    .option("--source <char>", t("cliOptSource"))
    .option("--destination <char>", t("cliOptDestination"))
    .option("--exclude <char>", t("cliOptExclude"))
    .option("--dry-run", t("cliOptDryRun"))
    .option("--delete", t("cliOptDelete"))
    .option("--export-format <char>", t("cliOptExportFormat"))
    .option("--revision-id <char>", t("cliOptRevisionId"))
    .option("--restore", t("cliOptRestore"))
    .option("--target-path <char>", t("cliOptTargetPath"))
    .option("--file-uuid <char>", t("cliOptFileUuid"))
    .option("--file-path <char>", t("cliOptFilePath"))
    .option("--replace <char>", t("cliOptReplace"))
    .option("--confirm", t("cliOptConfirm"))
    .option("--destroy-confirm", t("cliOptDestroyConfirm"))
    .version(packageJson.version);
  let siteNodeOps = siteNodeOperations();
  for (let i in siteNodeOps) {
    program.option(
      `--${camelToDash(siteNodeOps[i].value)} <char>`,
      `${siteNodeOps[i].label}`,
    );
    siteProg.option(
      `--${camelToDash(siteNodeOps[i].value)} <char>`,
      `${siteNodeOps[i].label}`,
    );
  }

  // webcomponent program
  let strWebcomponentActions = "";
  webcomponentActions().forEach((action) => {
    strWebcomponentActions += `${action.value} - ${action.label}` + "\n\r";
  });
  program
    .command("wc")
    .alias("webcomponent")
    .description(t("cliCmdWc"))
    .argument("[action]", t("cliArgWcAction") + "\n\r" + strWebcomponentActions)
    .action((action, cmdOptions) => {
      commandRun = {
        command: "webcomponent",
        arguments: {},
        options: {},
      };
      // if name set, populate
      if (action) {
        commandRun.arguments.action = action;
        commandRun.options.skip = true;
      }
      // haxtheweb/issues#3119: `hax wc --search <words>`
      if (cmdOptions && cmdOptions.search) {
        commandRun.options.search = cmdOptions.search;
      }
    })
    .option("--path <char>", t("cliOptWcPath"))
    .option("--org <char>", t("cliOptOrg"))
    .option("--author <char>", t("cliOptAuthor"))
    .option("--name <char>", t("cliOptWcName"))
    .option("--writeHaxProperties", t("cliOptWriteHaxProperties"))
    .option("--template <char>", t("cliOptTemplate"))
    .option("--to-file <char>", t("cliOptToFile"))
    .option("--no-extras", t("cliOptNoExtras"))
    .option("--no-i", t("cliOptNoI"))
    .option("--root <char>", t("cliOptRoot"))
    .option("--force", t("cliOptForce"))
    .option("--search <char>", t("cliOptWcSearch"))
    .version(packageJson.version);

  // audit program
  program
    .command("audit")
    .description(t("cliCmdAudit"))
    .argument(
      "[type]",
      t("cliArgAuditType") +
        "\n\r" +
        "ddd - " +
        t("cliArgAuditDdd") +
        "\n\r" +
        "schema - " +
        t("cliArgAuditSchema") +
        "\n\r" +
        "i18n - " +
        t("cliArgAuditI18n") +
        "\n\r" +
        "ssr - " +
        t("cliArgAuditSsr") +
        "\n\r" +
        "all - " +
        t("cliArgAuditAll"),
    )
    .action((type, opts) => {
      commandRun = {
        command: "audit",
        arguments: { type: type || "ddd" },
        options: { ...opts },
      };
    })
    .option("--debug", t("cliOptDebug"))
    .option("--strict", t("cliOptStrict"))
    .option("--format <char>", t("cliOptAuditFormat"))
    .option("--only <char>", t("cliOptAuditOnly"))
    .option("--timeout <char>", t("cliOptAuditTimeout"))
    .option("--save-html <char>", t("cliOptAuditSaveHtml"))
    .option("--no-shim", t("cliOptAuditNoShim"))
    .version(packageJson.version);

  program
    .command("party")
    .description(t("cliCmdParty"))
    .argument("[action]", t("cliArgWcAction") + "\n\r" + "test")
    .action((action) => {
      commandRun = {
        command: "party",
        arguments: {},
        options: {},
      };
      if (action) {
        commandRun.arguments.action = action;
        commandRun.options.skip = true;
      }
    })
    .option("--root <char>", t("cliOptRoot"))
    .option("--y", t("cliOptYes"))
    .option("--auto", t("cliOptAuto"))
    .option("--repos <char...>", t("cliOptRepos"))
    .version(packageJson.version);

  // skills program
  let strSkillsActions = "";
  skillsActions().forEach((action) => {
    strSkillsActions += `${action.value} - ${action.label}` + "\n\r";
  });
  program
    .command("skills")
    .description(t("cliCmdSkills"))
    .argument("[action]", t("cliArgSkillsAction") + "\n\r" + strSkillsActions)
    .argument("[name]", t("cliArgSkillsName"))
    .action((action, name, cmdOptions = {}) => {
      commandRun = {
        command: "skills",
        arguments: {},
        options: {},
      };
      // these only exist on the skills subcommand, so program.opts() never sees them
      if (cmdOptions.skillName) {
        commandRun.options.skillName = cmdOptions.skillName;
      }
      if (cmdOptions.all) {
        commandRun.options.all = true;
      }
      if (action) {
        commandRun.arguments.action = action;
        commandRun.options.skip = true;
      }
      // `hax skills install hax-site-building` as the README documents
      if (name) {
        commandRun.arguments.name = name;
      }
    })
    .option("--skill-name <char>", t("cliOptSkillName"))
    .option("--all", t("cliOptSkillsAll"))
    .option("--path <char>", t("cliOptSkillsPath"))
    .option("--y", t("cliOptYes"))
    .option("--auto", t("cliOptAuto"))
    .option("--no-i", t("cliOptNoI"))
    .option("--format <char>", t("cliOptFormat"))
    .option("--quiet", t("cliOptQuiet"))
    .version(packageJson.version);

  // process program arguments
  program.parse();
  commandRun.options = { ...commandRun.options, ...program.opts() };
  // --format json|yaml: keep stdout for the data payload only so scripts and
  // agents can parse it; banners, spinners and log lines move to stderr
  if (isStructuredFormat(commandRun.options.format)) {
    enableStructuredOutput();
  }
  // this is a false positive bc of the no-extras flag. no-extras does not imply true if not there
  // but that's how the CLI works. This then bombs things downstream. Its good to be false but NOT
  // good to be true since we need an array of options
  if (commandRun.options.extras === true) {
    delete commandRun.options.extras;
  }
  // haxtheweb/issues#3116: agents, CI and piped shells have no TTY to answer
  // prompts or to host a launched dev server, so behave exactly as if --no-i
  // was passed. Without this, `hax site mysite --y` never returns in those
  // contexts. Explicit `--no-i` is unchanged; `hax serve` still serves.
  const ciEnv = process.env.CI;
  const isCI = !!ciEnv && ciEnv !== "false" && ciEnv !== "0";
  if (commandRun.options.i !== false && (!process.stdout.isTTY || isCI)) {
    commandRun.options.i = false;
    if (!commandRun.options.quiet) {
      // stderr so --format json/yaml output on stdout stays parseable
      process.stderr.write(
        `hax: ${t("cliNoTtyNotice", { ci: isCI ? " (CI)" : "" })}\n`,
      );
    }
  }
  // Security (M-2): validate the CLI-provided --npm-client early, before the
  // packageData loop below can overwrite it. The loop unconditionally resets
  // npmClient from the local package.json (or 'npm'), so a malicious CLI
  // value would be clobbered before the post-loop check — validate it here
  // while it still reflects the user's --npm-client argument.
  if (commandRun.options.npmClient) {
    try {
      commandRun.options.npmClient = validateNpmClient(
        commandRun.options.npmClient,
      );
    } catch (e) {
      program.error(color.red(e.message));
    }
  }
  // Security (M-1/L-5): validate --root before chdir so a missing/invalid
  // root fails with a clear message instead of a process.chdir exception.
  // --root is not shell-interpolated, but the metacharacter check is kept
  // as defense-in-depth.
  if (commandRun.options.root) {
    try {
      rejectShellMetacharacters(commandRun.options.root, "root");
      if (
        !fs.existsSync(commandRun.options.root) ||
        !fs.statSync(commandRun.options.root).isDirectory()
      ) {
        program.error(
          color.red(t("cliInvalidRoot", { root: commandRun.options.root })),
        );
      }
    } catch (e) {
      program.error(color.red(e.message));
    }
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
    log(commandRun, "debug");
  }
  // auto and y assume same thing
  if (commandRun.options.y || commandRun.options.auto) {
    commandRun.options.y = true;
    commandRun.options.auto = true;
  }
  let author = "";
  // should be able to grab if not predefined
  try {
    let value = await exec(`git config user.name`);
    author = value.stdout.trim();
  } catch (e) {
    log(
      `
      git user name not configured. Run the following to do this:\n
      git config --global user.name "namehere"\n
      git config --global user.email "email@here`,
      "debug",
    );
  }
  // skills install manages its own default (~/.agents/skills/) in skills.js,
  // so don't let the action-triggered cwd default override it
  if (
    !commandRun.options.path &&
    commandRun.options.skip &&
    commandRun.command !== "skills"
  ) {
    commandRun.options.path = process.cwd();
  }
  // if we skip stuff then set org/author automatically
  if (commandRun.options.skip || commandRun.options.auto) {
    if (!commandRun.options.org) {
      commandRun.options.org = "";
    }
    if (!commandRun.options.author) {
      commandRun.options.author = author;
    }
  }
  // validate theme cli commands
  if (
    commandRun.options.theme !== "custom-theme" &&
    (commandRun.options.customThemeName ||
      commandRun.options.customThemeTemplate)
  ) {
    program.error(color.red(t("cliCustomThemeNameNeedsTheme")));
  }

  let packageData = {};
  let testPackages = [
    path.join(process.cwd(), "package.json"),
    path.join(process.cwd(), "../", "package.json"),
    path.join(process.cwd(), "../", "../", "package.json"),
  ];
  // test within reason, for package.json files seeing if anything is available to suggest
  // that we might be in a local package or a monorepo.
  while (testPackages.length > 0) {
    let packLoc = testPackages.shift();
    if (fs.existsSync(packLoc)) {
      try {
        packageData = {
          ...JSON.parse(fs.readFileSync(packLoc)),
          ...packageData,
        };
        // assume we are working on a web component / existing if we find this key
        if (packageData.hax && packageData.hax.cli) {
          commandRun.program = "webcomponent";
        }
        // leverage these values if they exist downstream
        if (packageData.npmClient) {
          commandRun.options.npmClient = packageData.npmClient;
        } else {
          commandRun.options.npmClient = "npm";
        }
        // see if we're in a monorepo
        if (
          packageData.useWorkspaces &&
          packageData.workspaces &&
          packageData.workspaces.packages &&
          packageData.workspaces.packages[0]
        ) {
          if (!commandRun.options.quiet) {
            p.intro(
              `${color.bgBlack(color.white(` ${t("cliMonorepoDetected")} `))}`,
            );
          }
          commandRun.options.isMonorepo = true;
          commandRun.options.auto = true;
          commandRun.options.template = "monorepo";
          // assumed if monorepo
          if (commandRun.command === "audit") {
            runAuditCommand(commandRun, null, process.cwd());
          } else {
            commandRun.command = "webcomponent";
            commandRun.options.path = path.join(
              process.cwd(),
              packageData.workspaces.packages[0].replace("/*", ""),
            );
            if (packageData.orgNpm) {
              commandRun.options.org = packageData.orgNpm;
            }
            commandRun.options.gitRepo = packageData.repository.url;
            commandRun.options.author = packageData.author.name
              ? packageData.author.name
              : author;
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
  }
  if (commandRun.options.debug) {
    log(packageData, "debug");
  }
  // Security (M-2): validate --npm-client against a strict allowlist before it
  // can be interpolated into any exec() shell string downstream. This runs
  // after the packageData merge so a monorepo's npmClient is also covered.
  if (commandRun.options.npmClient) {
    try {
      commandRun.options.npmClient = validateNpmClient(
        commandRun.options.npmClient,
      );
    } catch (e) {
      program.error(color.red(e.message));
    }
  }
  // Security (M-1): reject shell metacharacters in options that are
  // interpolated into exec() shell strings across site.js/webcomponent.js/
  // party.js (publish targets, git remote, rsync source/dest, excludes).
  // --domain additionally gets a strict hostname charset. --path must be an
  // existing directory (--root was validated earlier, before chdir). Validates
  // at the boundary so the existing exec(...${opt}...) call sites are no longer
  // exploitable, without a full exec()->spawn() migration.
  try {
    if (commandRun.options.domain) {
      commandRun.options.domain = validateDomain(commandRun.options.domain);
    }
    rejectShellMetacharacters(commandRun.options.author, "author");
    rejectShellMetacharacters(commandRun.options.gitRepo, "git-repo");
    rejectShellMetacharacters(commandRun.options.source, "source");
    rejectShellMetacharacters(commandRun.options.destination, "destination");
    // Security (R2-M-1): a value starting with "-" would be parsed by rsync
    // as an option (e.g. -e <cmd> runs a program).
    rejectLeadingDash(commandRun.options.source, "source");
    rejectLeadingDash(commandRun.options.destination, "destination");
    if (commandRun.options.exclude) {
      String(commandRun.options.exclude)
        .split(",")
        .forEach((pat) => {
          rejectShellMetacharacters(pat.trim(), "exclude");
          rejectLeadingDash(pat.trim(), "exclude");
        });
    }
    if (commandRun.options.path) {
      rejectShellMetacharacters(commandRun.options.path, "path");
      // skills install creates its target folder (like the ~/.agents/skills/ default)
      const pathMayBeCreated =
        commandRun.command === "skills" &&
        !fs.existsSync(commandRun.options.path);
      if (
        !pathMayBeCreated &&
        (!fs.existsSync(commandRun.options.path) ||
          !fs.statSync(commandRun.options.path).isDirectory())
      ) {
        program.error(
          color.red(t("cliInvalidPath", { path: commandRun.options.path })),
        );
      }
    }
  } catch (e) {
    program.error(color.red(e.message));
  }
  // test for updating to latest or just run the command
  if (commandRun.command === "webcomponent" && commandRun.options.search) {
    await elementsSearchCommand(commandRun);
    process.exit(0);
  } else if (commandRun.command === "update") {
    await testForUpdates(commandRun);
  } else if (commandRun.command === "audit") {
    let customPath = null;
    const inSite = await systemStructureContext();
    // test for haxcms context
    if (inSite && fs.existsSync(`${process.cwd()}/custom`)) {
      customPath = path.join(process.cwd(), "custom");
    }
    runAuditCommand(commandRun, customPath, process.cwd());
  } else if (commandRun.command === "party") {
    // Security (R2-L-2): keep an explicit (validated) --author; only fall back
    // to git user.name. party.js validates the final value as a GitHub user.
    if (!commandRun.options.author) {
      commandRun.options.author = author;
    }
    await partyCommandDetected(commandRun);
  } else if (commandRun.command === "skills") {
    await skillsCommandDetected(commandRun);
  }
  // CLI works within context of the site if one is detected, otherwise we can do other things
  else if (await systemStructureContext()) {
    if (commandRun.command === "serve") {
      commandRun.program = "serve";
      commandRun.options.skip = true;
      await siteCommandDetected(commandRun);
    } else {
      commandRun.program = "site";
      commandRun.options.skip = true;
      await siteCommandDetected(commandRun);
    }
  } else if (
    packageData &&
    (packageData.customElements || (packageData.hax && packageData.hax.cli)) &&
    packageData.scripts.start
  ) {
    if (commandRun.command === "serve") {
      commandRun.program = "serve";
      commandRun.options.skip = true;
      await webcomponentCommandDetected(commandRun, packageData);
    } else {
      commandRun.program = "webcomponent";
      commandRun.options.skip = true;
      await webcomponentCommandDetected(commandRun, packageData);
    }
  } else {
    if (
      commandRun.command === "start" &&
      !commandRun.options.y &&
      !commandRun.options.auto &&
      !commandRun.options.skip &&
      !commandRun.options.quiet
    ) {
      await haxIntro();
    }
    // it's been 7 days since last check, do the check and offer command to resolve if needed
    if (timeSince.days > 7) {
      // check for updates. Issue #2993: offline/slow networks must not hang
      // or crash the CLI here, so this is bounded by a timeout and any
      // failure (network unreachable, timeout, non-zero exit) is swallowed
      // and simply skips the "updates available" notice.
      try {
        let execOut = await exec(`npm view @haxtheweb/create version`, {
          timeout: 3000,
        });
        let updateCheck = execOut.stdout.trim();
        if (updateCheck !== packageJson.version && !commandRun.options.quiet) {
          p.intro(
            `${color.bgBlack(color.white(` ${t("cliUpdatesAvailable")} `))}`,
          );
          p.intro(t("cliCurrentVersion", { version: packageJson.version }));
          p.intro(t("cliLatestVersion", { version: updateCheck }));
          p.intro(
            t("cliRunToUpdate", {
              command: color.bold(color.black(color.bgGreen("hax update"))),
            }),
          );
        }
      } catch (e) {
        // offline or registry unreachable; silently skip the update notice
      }
    }
    let activeProject = null;
    let project = { type: null };
    while (project.type !== "quit" && project.type !== "update") {
      if (activeProject) {
        if (!commandRun.options.quiet) {
          p.note(
            ` 🧙🪄 ${t("cliBeGone", { project: color.bold(color.black(color.bgGreen(activeProject))) })} 🪄 + ✨ 👹 = 💀 `,
          );
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
          options: {},
        };
      }
      if (["site", "webcomponent", "audit"].includes(commandRun.command)) {
        project = {
          type: commandRun.command,
        };
      } else if (commandRun.options.i) {
        let buildOptions = [
          { value: "webcomponent", label: `🏗️ ${t("cliMenuWebcomponent")}` },
          { value: "site", label: `🏡 ${t("cliMenuSite")}` },
          { value: "party", label: `🎉 ${t("cliMenuParty")}` },
          { value: "update", label: `🤓 ${t("cliMenuUpdate")}` },
          { value: "quit", label: `🚪 ${t("cliMenuQuit")}` },
        ];
        project = await p.group(
          {
            type: ({ results }) =>
              p.select({
                message: !activeProject
                  ? t("cliWhatToBuild")
                  : t("cliWhatToBuildNext"),
                initialValue: "webcomponent",
                required: true,
                options: buildOptions,
              }),
          },
          {
            onCancel: () => {
              if (!commandRun.options.quiet) {
                p.cancel(`🧙🪄 ${t("cliCancel")}`);
                communityStatement();
              }
              process.exit(0);
            },
          },
        );
      } else if (!commandRun.options.i) {
        process.exit(0);
      }
      if (project.type === "update") {
        await testForUpdates(commandRun);
      } else if (project.type === "party") {
        await partyCommandDetected(commandRun);
      }
      // detect being in a haxcms scaffold. easiest way is _sites being in this directory
      // set the path automatically so we skip the question
      else if (
        commandRun.command === "site" &&
        fs.existsSync(`${process.cwd()}/_sites`)
      ) {
        if (!commandRun.options.quiet) {
          p.intro(
            `${color.bgBlack(color.white(` ${t("cliHaxcmsDetected")} `))}`,
          );
        }
        commandRun.options.path = `${process.cwd()}/_sites`;
      }
      activeProject = project.type;
      // silly but this way we don't have to take options for quitting
      if (["site", "webcomponent"].includes(project.type)) {
        // global spot for core themes list
        let coreThemes = await siteThemeList(true);
        const cleanOneTheme = coreThemes.find(
          (themeOption) => themeOption.value === "clean-one",
        );
        const defaultCoreTheme = cleanOneTheme ? cleanOneTheme : coreThemes[0];
        let availableSkeletons = await siteSkeletonList(true);

        project = await p.group(
          {
            type: ({ results }) => {
              return new Promise((resolve, reject) => {
                resolve(activeProject);
              });
            },
            path: ({ results }) => {
              let initialPath = `${process.cwd()}`;
              if (
                !commandRun.options.path &&
                !commandRun.options.auto &&
                !commandRun.options.skip
              ) {
                return p.text({
                  message:
                    commandRun.command === "webcomponent" ||
                    results.type === "webcomponent"
                      ? t("cliPathPromptProject")
                      : t("cliPathPromptSite"),
                  placeholder: initialPath,
                  initialValue: initialPath,
                  required: true,
                  validate: (value) => {
                    if (!value) {
                      return t("cliPathRequired");
                    }
                    if (!fs.existsSync(value)) {
                      return t("cliFolderMissing", { path: value });
                    }
                  },
                });
              }
            },
            name: ({ results }) => {
              const reservedNames = [
                "annotation-xml",
                "color-profile",
                "font-face",
                "font-face-src",
                "font-face-uri",
                "font-face-format",
                "font-face-name",
                "missing-glyph",
              ];
              if (!commandRun.arguments.action && !commandRun.options.name) {
                if (
                  commandRun.options.auto ||
                  commandRun.options.skip ||
                  !commandRun.options.i
                ) {
                  program.error(color.red(t("cliNameRequiredNonInteractive")));
                  process.exit(1);
                }
                let placeholder = "mysite";
                let message = t("cliSiteNamePrompt");
                if (
                  commandRun.command === "webcomponent" ||
                  results.type === "webcomponent"
                ) {
                  placeholder = "my-element";
                  message = t("cliElementNamePrompt");
                }
                return p.text({
                  message: message,
                  placeholder: placeholder,
                  initialValue: placeholder,
                  required: true,
                  validate: (value) => {
                    if (!value) {
                      return t("cliNameRequired");
                    }
                    if (reservedNames.includes(value)) {
                      return t("cliNameReserved", { name: color.bold(value) });
                    }
                    if (value.toLocaleLowerCase() !== value) {
                      return t("cliNameLowercase");
                    }
                    if (/^\d/.test(value)) {
                      return t("cliNameStartsWithNumber");
                    }
                    if (/[`~!@#$%^&*()_=+[\]{}|;:'",<.>/?\\]/.test(value)) {
                      return t("cliNameNoSpecialChars");
                    }
                    if (value.indexOf(" ") !== -1) {
                      return t("cliNameNoSpaces");
                    }
                    // also catches tabs / other whitespace
                    if (hasNameSpecialCharacters(value)) {
                      return t("cliNameNoSpecialChars");
                    }
                    if (
                      results.type === "webcomponent" &&
                      (value.indexOf("-") === -1 ||
                        value.replace("--", "") !== value ||
                        value[0] === "-" ||
                        value[value.length - 1] === "-")
                    ) {
                      return t("cliNameDashRule");
                    }
                    // test that this is not an existing element we use in the registry
                    if (
                      results.type === "webcomponent" &&
                      wcReg[value] &&
                      !commandRun.options.force
                    ) {
                      return t("cliNameInRegistry");
                    }
                    // Check for any other syntax errors
                    if (
                      results.type === "webcomponent" &&
                      !/^[a-z][a-z0-9.-]*-[a-z0-9.-]*$/.test(value)
                    ) {
                      return t("cliNameSyntax", {
                        example: color.bold("my-component"),
                      });
                    }
                    // assumes auto was selected in CLI
                    let joint = process.cwd();
                    if (commandRun.options.path) {
                      joint = commandRun.options.path;
                    } else if (results.path) {
                      joint = results.path;
                    }
                    if (fs.existsSync(path.join(joint, value))) {
                      return t("cliPathExists", {
                        path: path.join(joint, value),
                      });
                    }
                  },
                });
              }
              if (commandRun.arguments.action || commandRun.options.name) {
                let knownActions = [];
                if (results.type === "webcomponent") {
                  knownActions = webcomponentActions().map(
                    (action) => action.value,
                  );
                } else if (results.type === "site") {
                  knownActions = siteActions().map((action) => action.value);
                }
                let value = knownActions.includes(commandRun.arguments.action)
                  ? commandRun.options.name
                  : commandRun.arguments.action || commandRun.options.name;
                if (!value) {
                  program.error(color.red(t("cliNameRequiredPeriod")));
                  process.exit(1);
                }
                if (reservedNames.includes(value)) {
                  program.error(
                    color.red(
                      t("cliNameReserved", { name: color.bold(value) }),
                    ),
                  );
                  process.exit(1);
                }
                if (value.toLocaleLowerCase() !== value) {
                  program.error(color.red(t("cliNameLowercase")));
                  process.exit(1);
                }
                if (/^\d/.test(value)) {
                  program.error(color.red(t("cliNameStartsWithNumber")));
                  process.exit(1);
                }
                if (value.indexOf(" ") !== -1) {
                  program.error(color.red(t("cliNameNoSpaces")));
                  process.exit(1);
                }
                // Security (R2-H-2): the non-interactive path must enforce the
                // same special-character rule as the prompt above; the name
                // reaches file paths and child process calls.
                if (hasNameSpecialCharacters(value)) {
                  program.error(color.red(t("cliNameNoSpecialChars")));
                  process.exit(1);
                }
                if (
                  results.type === "webcomponent" &&
                  (value.indexOf("-") === -1 ||
                    value.replace("--", "") !== value ||
                    value[0] === "-" ||
                    value[value.length - 1] === "-")
                ) {
                  program.error(color.red(t("cliNameDashRule")));
                  process.exit(1);
                }
                // test that this is not an existing element we use in the registry
                if (
                  results.type === "webcomponent" &&
                  wcReg[value] &&
                  !commandRun.options.force
                ) {
                  program.error(color.red(t("cliNameInRegistry")));
                  process.exit(1);
                }
                // Check for any other syntax errors
                if (
                  results.type === "webcomponent" &&
                  !/^[a-z][a-z0-9.-]*-[a-z0-9.-]*$/.test(value)
                ) {
                  program.error(
                    color.red(
                      t("cliNameSyntax", {
                        example: color.bold("my-component"),
                      }),
                    ),
                  );
                  process.exit(1);
                }
                // assumes auto was selected in CLI
                let joint = process.cwd();
                if (commandRun.options.path) {
                  joint = commandRun.options.path;
                } else if (results.path) {
                  joint = results.path;
                }
                if (fs.existsSync(path.join(joint, value))) {
                  program.error(
                    color.red(
                      t("cliPathExists", { path: path.join(joint, value) }),
                    ),
                  );
                  process.exit(1);
                }
              }
            },
            org: ({ results }) => {
              if (
                results.type === "webcomponent" &&
                !commandRun.options.org &&
                !commandRun.options.auto &&
                !commandRun.options.skip
              ) {
                let initialOrg = "@yourOrganization";
                return p.text({
                  message: t("cliOrgPrompt"),
                  placeholder: initialOrg,
                  initialValue: initialOrg,
                  required: false,
                  validate: (value) => {
                    if (value && !value.startsWith("@")) {
                      return t("cliOrgInvalid");
                    }
                  },
                });
              }
            },
            author: ({ results }) => {
              if (
                !commandRun.options.author &&
                !commandRun.options.auto &&
                !commandRun.options.skip
              ) {
                return p.text({
                  message: t("cliAuthorPrompt"),
                  required: false,
                  initialValue: author,
                });
              }
            },
            template: ({ results }) => {
              if (
                results.type === "webcomponent" &&
                !commandRun.options.isMonorepo &&
                !commandRun.options.template &&
                !commandRun.options.auto &&
                !commandRun.options.skip &&
                commandRun.options.i
              ) {
                return p.select({
                  message: t("cliTemplatePrompt"),
                  required: false,
                  options: [
                    { value: "compliant", label: t("cliTemplateCompliant") },
                    { value: "minimal", label: t("cliTemplateMinimal") },
                    { value: "training", label: t("cliTemplateTraining") },
                  ],
                  initialValue: "compliant",
                });
              }
            },
            siteCreationMode: async ({ results }) => {
              if (results.type === "site") {
                const hasSkeletonFile = Boolean(
                  commandRun.options.skeletonFile,
                );
                const hasSkeletonMachineName = Boolean(
                  commandRun.options.skeletonMachineName,
                );
                if (hasSkeletonFile && hasSkeletonMachineName) {
                  program.error(color.red(t("cliOneSkeletonSource")));
                  process.exit(1);
                }
                if (
                  (hasSkeletonFile || hasSkeletonMachineName) &&
                  commandRun.options.theme
                ) {
                  program.error(color.red(t("cliSkeletonThemeExclusive")));
                  process.exit(1);
                }
                if (
                  (hasSkeletonFile || hasSkeletonMachineName) &&
                  commandRun.options.importSite
                ) {
                  program.error(color.red(t("cliSkeletonImportExclusive")));
                  process.exit(1);
                }
                if (hasSkeletonFile || hasSkeletonMachineName) {
                  return "template";
                }
                if (commandRun.options.theme) {
                  return "scratch";
                }
                if (
                  !commandRun.options.i ||
                  commandRun.options.auto ||
                  commandRun.options.skip
                ) {
                  return "scratch";
                }
                return p.select({
                  message: t("cliSiteStartPrompt"),
                  required: true,
                  options: [
                    { value: "scratch", label: t("cliSiteStartScratch") },
                    { value: "template", label: t("cliSiteStartTemplate") },
                  ],
                  initialValue: "scratch",
                });
              }
            },
            skeletonMachineName: async ({ results }) => {
              if (
                results.type === "site" &&
                results.siteCreationMode === "template"
              ) {
                if (commandRun.options.skeletonMachineName) {
                  return commandRun.options.skeletonMachineName;
                }
                if (commandRun.options.skeletonFile) {
                  return null;
                }
                if (!commandRun.options.i) {
                  program.error(color.red(t("cliTemplateModeNeedsSkeleton")));
                  process.exit(1);
                }
                if (availableSkeletons.length === 0) {
                  return null;
                }
                let skeletonOptions = [...availableSkeletons];
                skeletonOptions.push({
                  value: "__from_file__",
                  label: t("cliUseSkeletonFile"),
                });
                const selectedSkeleton = await p.select({
                  message: t("cliTemplatePrompt"),
                  required: true,
                  options: skeletonOptions,
                  initialValue: skeletonOptions[0].value,
                });
                if (selectedSkeleton === "__from_file__") {
                  return null;
                }
                commandRun.options.skeletonMachineName = selectedSkeleton;
                return selectedSkeleton;
              }
            },
            skeletonFile: ({ results }) => {
              if (
                results.type === "site" &&
                results.siteCreationMode === "template" &&
                !commandRun.options.skeletonMachineName &&
                !results.skeletonMachineName &&
                !commandRun.options.skeletonFile
              ) {
                return p.text({
                  message: t("cliTemplateFilePrompt"),
                  placeholder: `${process.cwd()}/template.json`,
                  initialValue: `${process.cwd()}/template.json`,
                  required: true,
                  validate: (value) => {
                    if (!value) {
                      return t("cliTemplateFileRequired");
                    }
                    if (!fs.existsSync(value)) {
                      return t("cliFileMissing", { path: value });
                    }
                    if (!value.endsWith(".json")) {
                      return t("cliTemplateFileJson");
                    }
                  },
                });
              }
            },
            theme: async ({ results }) => {
              if (
                results.type === "site" &&
                results.siteCreationMode !== "template" &&
                !commandRun.options.theme
              ) {
                // support having no theme but autoselecting
                if (commandRun.options.auto && commandRun.options.skip) {
                  commandRun.options.theme = defaultCoreTheme.value;
                } else {
                  return p.select({
                    message: t("cliThemePrompt"),
                    required: false,
                    options: coreThemes,
                    initialValue: defaultCoreTheme.value,
                  });
                }
              } else if (
                results.type === "site" &&
                results.siteCreationMode !== "template" &&
                commandRun.options.theme
              ) {
                if (
                  coreThemes.filter(
                    (item) => item.value === commandRun.options.theme,
                  ).length === 0
                ) {
                  program.error(color.red(t("cliThemeInvalid")));
                  process.exit(1);
                }
              }
            },
            customThemeName: async ({ results }) => {
              if (results.theme === "custom-theme") {
                let tmpCustomName = await p.text({
                  message: t("cliThemeNamePrompt"),
                  placeholder: `custom-${commandRun.arguments.action ? commandRun.arguments.action : results.name ? results.name : commandRun.options.name}-theme`,
                  initialValue: `custom-${commandRun.arguments.action ? commandRun.arguments.action : results.name ? results.name : commandRun.options.name}-theme`,
                  required: false,
                  validate: (value) => {
                    if (!value) {
                      return t("cliThemeNameRequired");
                    }
                    if (coreThemes.some((theme) => theme.value === value)) {
                      return t("cliThemeNameInUse");
                    }
                    if (/^\d/.test(value)) {
                      return t("cliThemeNameStartsWithNumber");
                    }
                    if (/[A-Z]/.test(value)) {
                      return t("cliThemeNameNoUppercase");
                    }
                    if (value.indexOf(" ") !== -1) {
                      return t("cliThemeNameNoSpaces");
                    }
                    // Security (R2-M-2): theme name becomes a file path and a
                    // JS import / class name; no /, ., quotes, etc.
                    if (hasNameSpecialCharacters(value)) {
                      return t("cliNameNoSpecialChars");
                    }
                  },
                });
                return tmpCustomName;
              } else if (results.type === "site") {
                // need to validate theme from CLI arguments
                let value = `${commandRun.options.customThemeName ? commandRun.options.customThemeName : results.name ? results.name : commandRun.arguments.action ? commandRun.arguments.action : commandRun.options.name}`;
                if (!value) {
                  program.error(color.red(t("cliThemeNameRequired")));
                }
                if (coreThemes.some((theme) => theme.value === value)) {
                  program.error(color.red(t("cliThemeNameInUse")));
                }
                if (/^\d/.test(value)) {
                  program.error(color.red(t("cliThemeNameStartsWithNumber")));
                }
                if (/[A-Z]/.test(value)) {
                  program.error(color.red(t("cliThemeNameNoUppercase")));
                }
                if (value.indexOf(" ") !== -1) {
                  program.error(color.red(t("cliThemeNameNoSpaces")));
                }
                // Security (R2-M-2): same rule as the prompt above
                if (hasNameSpecialCharacters(value)) {
                  program.error(color.red(t("cliNameNoSpecialChars")));
                }
              }
            },
            customThemeTemplate: ({ results }) => {
              if (results.theme === "custom-theme") {
                const options = [
                  { value: "base", label: t("cliThemeTemplateBase") },
                  {
                    value: "polaris-flex",
                    label: t("cliThemeTemplatePolarisFlex"),
                  },
                  {
                    value: "polaris-sidebar",
                    label: t("cliThemeTemplatePolarisSidebar"),
                  },
                ];
                return p.select({
                  message: t("cliTemplatePrompt"),
                  required: false,
                  options: options,
                  initialValue: `${results.theme}`,
                });
              }
            },
            extras: ({ results }) => {
              if (!commandRun.options.auto && commandRun.options.i) {
                let options = [];
                let initialValues = [];
                if (
                  commandRun.command === "webcomponent" ||
                  results.type === "webcomponent"
                ) {
                  options = [
                    {
                      value: "launch",
                      label: t("cliExtraLaunch"),
                      hint: t("cliHintRecommended"),
                    },
                    {
                      value: "install",
                      label: t("cliExtraInstall", {
                        client: commandRun.options.npmClient,
                      }),
                      hint: t("cliHintRecommended"),
                    },
                    {
                      value: "git",
                      label: t("cliExtraGit"),
                      hint: t("cliHintRecommended"),
                    },
                  ];
                  initialValues = ["launch", "install", "git"];
                  if (!sysGit || commandRun.options.isMonorepo) {
                    options.pop();
                    initialValues.pop();
                  }
                } else {
                  options = [
                    {
                      value: "launch",
                      label: t("cliExtraLaunchOnCreate"),
                      hint: t("cliHintRecommended"),
                    },
                  ];
                  initialValues = ["launch"];
                }
                return p.multiselect({
                  message: t("cliAdditionalSetup"),
                  initialValues: initialValues,
                  options: options,
                  required: false,
                });
              }
            },
          },
          {
            onCancel: () => {
              if (!commandRun.options.quiet) {
                p.cancel(`🧙🪄 ${t("cliCancel")}`);
                communityStatement();
              }
              process.exit(0);
            },
          },
        );
        // merge cli options with project options assume this is NOT a monorepo
        // but spread will overwrite if needed
        if (
          commandRun.command === "webcomponent" &&
          !commandRun.arguments.action
        ) {
          project = {
            isMonorepo: false,
            ...project,
            ...commandRun.options,
          };
        } else {
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
        if (project.type === "webcomponent" && !project.template) {
          project.template = "compliant";
        }

        // resolve site vs multi-site
        switch (project.type) {
          case "site":
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
          case "webcomponent":
            await webcomponentProcess(commandRun, project);
            break;
        }
      }
    }
    if (!commandRun.options.quiet && project.type !== "update") {
      communityStatement();
    }
  }
}

// check for updates
export async function testForUpdates(commandRun) {
  // Issue #2993: this is reachable both from the explicit `hax update`
  // command and the interactive "Check for hax cli updates" menu item, so a
  // hung/unreachable registry must not throw unhandled here. Bound the call
  // with a timeout and report a friendly message instead of crashing.
  let execOut;
  try {
    execOut = await exec(`npm view @haxtheweb/create version`, {
      timeout: 3000,
    });
  } catch (e) {
    if (!commandRun.options.quiet) {
      p.intro(
        `${color.bgBlack(color.white(` ${t("cliUpdateCheckFailed")} `))}`,
      );
      p.intro(t("cliRegistryUnreachable"));
    }
    return;
  }
  let latest = execOut.stdout.trim();
  if (latest !== packageJson.version) {
    if (!commandRun.options.quiet) {
      p.intro(`${color.bgBlack(color.white(` ${t("cliUpdatesAvailable")} `))}`);
      p.intro(t("cliCurrentVersion", { version: packageJson.version }));
      p.intro(t("cliLatestVersion", { version: latest }));
    }
    let runUpdates = { answer: false };
    if (!commandRun.options.y) {
      runUpdates = await p.group(
        {
          answer: ({ results }) =>
            p.confirm({
              message: t("cliUpdateConfirm", { version: latest }),
              initialValue: true,
            }),
        },
        {
          onCancel: () => {
            if (!commandRun.options.quiet) {
              p.cancel(`🧙🪄 ${t("cliLeavingSoon")}`);
              p.outro(`
                🧙  ${t("cliUpgradeAnyTime", { command: color.yellow("npm install --global @haxtheweb/create") })}
                
                💡  ${color.bold(color.white(t("cliNeverStopInnovating")))}
              `);
            }
            process.exit(0);
          },
        },
      );
    } else {
      runUpdates.answer = true; // automatic
    }
    // ensure they wanted to run them
    if (runUpdates.answer) {
      await interactiveExec("npm", [
        "install",
        "--global",
        "@haxtheweb/create",
      ]);
      if (!commandRun.options.quiet) {
        p.outro(`
          🔮  ${t("cliUpdatedTo", { version: color.yellow(latest) })}
          
          🧙  ${t("cliTypeHelp", { command: color.yellow("hax help") })}
          
          💡  ${color.bold(color.white(t("cliNeverStopInnovating")))}
        `);
      }
    } else {
      if (!commandRun.options.quiet) {
        p.outro(`
          🧙  ${t("cliUpgradeAnyTime", { command: color.yellow("npm install --global @haxtheweb/create") })}
          
          💡  ${color.bold(color.white(t("cliNeverStopInnovating")))}
        `);
      }
    }
  } else {
    if (!commandRun.options.quiet) {
      p.intro(
        `${color.bgBlack(color.white(` ${t("cliUpToDate", { version: packageJson.version })} `))}`,
      );
    }
  }
}

main().catch(console.error);
