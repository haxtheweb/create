// `hax platform` (haxtheweb/issues#1768): update awareness and upgrades for
// a HAXcms install from the shell. `status` reports the installed version,
// the latest release, security advisories that affect it, and the command
// that updates this kind of install. For haxcms-php installs, `upgrade`,
// `verify` and `rollback` run the install's own
// scripts/platform-upgrade.php, so there is one upgrader, written once, for
// every way it is started. Other install types are updated with the tool
// they came from (npm, Docker, git), and the CLI says which.
import * as path from "node:path";
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import color from "picocolors";
import { t } from "../i18n.js";
import { readConfigFile, writeConfigFile } from "../utils.js";
import { isStructuredFormat, writeData } from "../logging.js";
import { dump } from "js-yaml";
import haxcmsNodejsPackage from "@haxtheweb/haxcms-nodejs/package.json" with { type: "json" };
import {
  buildPlatformReport,
  detectPlatformInstall,
  loadPlatformData,
  platformUpgradeCommands,
} from "../platform-updates.js";

export const platformActions = [
  { value: "status", label: t("platformActionStatus") },
  { value: "upgrade", label: t("platformActionUpgrade") },
  { value: "verify", label: t("platformActionVerify") },
  { value: "rollback", label: t("platformActionRollback") },
];

const UPGRADER_ACTIONS = ["upgrade", "verify", "rollback"];

/**
 * Arguments for scripts/platform-upgrade.php from `hax platform` options.
 * Only known flags pass through, and --to only as an x.y.z version.
 */
export function upgraderArguments(action, options = {}) {
  const args = [path.join("scripts", "platform-upgrade.php"), action];
  if (action === "upgrade") {
    if (options.to) {
      if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(`${options.to}`)) {
        return null;
      }
      args.push("--to", `${options.to}`);
    }
    if (options.dryRun) {
      args.push("--dry-run");
    }
    if (options.overwriteModified) {
      args.push("--overwrite-modified");
    }
    if (options.allowDowngrade) {
      args.push("--allow-downgrade");
    }
  }
  if (action !== "verify" && options.y) {
    args.push("--y");
  }
  if (action === "verify" && options.format === "json") {
    args.push("--json");
  }
  return args;
}

/**
 * Run the install's PHP upgrader, passing the terminal through so its
 * confirmation prompt works. Returns its exit code.
 */
export function runPhpUpgrader(install, action, options, spawn = spawnSync) {
  const script = path.join(install.root, "scripts", "platform-upgrade.php");
  if (!fs.existsSync(script)) {
    p.log.error(t("platformNoUpgrader", { path: install.root }));
    return 1;
  }
  const php = spawn("php", ["--version"], { stdio: "ignore" });
  if (!php || php.status !== 0) {
    p.log.error(t("platformNoPhp"));
    return 1;
  }
  const args = upgraderArguments(action, options);
  if (!args) {
    p.log.error(t("platformBadVersion", { version: `${options.to}` }));
    return 1;
  }
  const run = spawn("php", args, { cwd: install.root, stdio: "inherit" });
  return run && typeof run.status === "number" ? run.status : 1;
}

/**
 * The haxcms-nodejs package this CLI runs `hax serve` with, as an install
 * the platform check can report on.
 */
export function bundledNodeInstall() {
  const version =
    haxcmsNodejsPackage && typeof haxcmsNodejsPackage.version === "string"
      ? haxcmsNodejsPackage.version
      : "";
  if (!version) {
    return null;
  }
  return {
    backend: "haxcms-nodejs",
    root: "@haxtheweb/haxcms-nodejs",
    version: version,
    // it ships inside the CLI, so updating the CLI updates it
    installMethod: "node-npm",
  };
}

async function reportFor(install, refresh, force = false) {
  const data = await loadPlatformData(install.backend, {
    read: readConfigFile,
    write: writeConfigFile,
    refresh,
    force,
  });
  return buildPlatformReport(install, data.release, data.advisories);
}

function advisoryLine(advisory) {
  const id = advisory.cve || advisory.id;
  const parts = [color.bold(id)];
  if (advisory.severity) {
    parts.push(`(${advisory.severity})`);
  }
  parts.push(t("platformFixedIn", { version: advisory.patched }));
  if (advisory.url) {
    parts.push(advisory.url);
  }
  return parts.join(" ");
}

/**
 * `hax platform status [--path <dir>] [--format json|yaml]`
 */
export async function platformCommandDetected(commandRun) {
  const action =
    (commandRun.arguments && commandRun.arguments.action) || "status";
  if (!platformActions.some((item) => item.value === action)) {
    p.log.error(t("platformUnknownAction", { action }));
    process.exitCode = 1;
    return null;
  }
  const dir = commandRun.options.path
    ? path.resolve(commandRun.options.path)
    : process.cwd();
  let install = fs.existsSync(dir) ? detectPlatformInstall(dir) : null;
  // outside an install, report on the HAXcms that `hax serve` uses
  if (!install && !commandRun.options.path) {
    install = bundledNodeInstall();
  }
  if (!install) {
    p.log.error(t("platformNotFound", { path: dir }));
    process.exitCode = 1;
    return null;
  }
  if (UPGRADER_ACTIONS.includes(action)) {
    if (
      install.backend === "haxcms-php" &&
      install.installMethod !== "php-git"
    ) {
      process.exitCode = runPhpUpgrader(install, action, commandRun.options);
      return null;
    }
    // npm, Docker and git installs are updated with the tool they came from
    const report = await reportFor(install, true, true);
    const commands = platformUpgradeCommands(report);
    p.log.warn(
      t("platformUpgradeElsewhere", { method: install.installMethod }),
    );
    for (const command of commands) {
      p.log.message(color.yellow(command));
    }
    process.exitCode = 1;
    return null;
  }
  const report = await reportFor(install, true, true);
  report.commands = platformUpgradeCommands(report);
  if (isStructuredFormat(commandRun.options.format)) {
    writeData(
      commandRun.options.format === "yaml"
        ? dump(report)
        : JSON.stringify(report, null, 2),
    );
    return report;
  }
  p.intro(color.bold(t("platformStatusTitle", { backend: report.backend })));
  p.log.info(t("platformInstalledAt", { path: report.root }));
  p.log.info(
    t("platformVersions", { current: report.current, latest: report.latest }),
  );
  p.log.info(t("platformInstallMethod", { method: report.installMethod }));
  if (report.security) {
    p.log.error(t("platformSecurityUpdate"));
    for (const advisory of report.advisories) {
      p.log.message(advisoryLine(advisory));
    }
  }
  if (report.updateAvailable || report.security) {
    if (report.commands.length) {
      p.log.step(t("platformUpdateWith"));
      for (const command of report.commands) {
        p.log.message(color.yellow(command));
      }
    }
    p.log.message(t("platformReleaseNotes", { url: report.releaseUrl }));
  } else if (report.latest !== "unknown") {
    p.log.success(t("platformUpToDate"));
  } else {
    p.log.warn(t("platformCheckFailed"));
  }
  return report;
}

/**
 * Notice shown by `hax start`. A weekly refresh (`refresh`) asks GitHub;
 * every other run reads the cache, so a missing security fix is mentioned
 * each time without a network call. Never throws.
 */
export async function platformStartNotice(dir, refresh) {
  try {
    const installs = [];
    const local = detectPlatformInstall(dir);
    if (local) {
      installs.push(local);
    }
    const bundled = bundledNodeInstall();
    if (bundled) {
      installs.push(bundled);
    }
    for (const install of installs) {
      const report = await reportFor(install, refresh);
      if (report.security) {
        p.intro(
          color.bgRed(
            color.white(
              ` ${t("platformSecurityNotice", {
                backend: report.backend,
                version: report.current,
              })} `,
            ),
          ),
        );
        p.intro(report.advisories.map((a) => a.cve || a.id).join(", "));
      } else if (refresh && report.updateAvailable) {
        p.intro(
          t("platformUpdateNotice", {
            backend: report.backend,
            latest: report.latest,
          }),
        );
      } else {
        continue;
      }
      p.intro(
        t("platformRunStatus", {
          command: color.bold(
            color.black(color.bgGreen("hax platform status")),
          ),
        }),
      );
    }
  } catch {
    // the notice is advisory; it must never stop `hax start`
  }
}
