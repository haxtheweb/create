#!/usr/bin/env node
import { setTimeout } from 'node:timers/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import open from 'open';
import * as p from '@clack/prompts';
import * as ejs from "ejs";
import color from 'picocolors';
import { dump, load } from 'js-yaml';
import * as winston from 'winston';
import Twig from 'twig';

import { parse } from 'node-html-parser';
import { merlinSays, communityStatement } from "../statements.js";
import { dashToCamel, interactiveExec, exec, findAvailablePort, validateNpmClient, spawn } from "../utils.js";
import { log, commandString } from "../logging.js";

// Security (Stream-A): the deprecated @haxtheweb/open-apis npm dependency was
// removed; converter calls now route in-process through haxcms-nodejs handlers
// via invokeRoute() (same pattern as download-skeleton below), so no cloud
// (open-apis.hax.cloud) URLs are referenced and the xlsx advisory is gone.
import * as haxcmsLib from "@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js";
import * as allRoutesLib from "@haxtheweb/haxcms-nodejs/dist/lib/allRoutes.js";
import * as josfile from "@haxtheweb/haxcms-nodejs/dist/lib/JSONOutlineSchema.js";
const JSONOutlineSchema = josfile.default;
// Security (H-1/H-2/H-3): reuse haxcms-nodejs' SSRF-guarded fetch wrapper so
// import/content/image fetches reject private/loopback/link-local/metadata
// IPs, cap redirects, and enforce timeouts — matching the server posture.
import * as safeFetchLib from "@haxtheweb/haxcms-nodejs/dist/lib/safeFetch.js";
const safeFetch = safeFetchLib.safeFetch;
const assertUrlNotSSRF = safeFetchLib.assertUrlNotSSRF;
// Security (H-5): reuse haxcms-nodejs' DOMPurify-based sanitizer so remote
// scraped/imported HTML is stripped of <script>/on*/javascript: URLs before
// being written into page content, matching the server storage policy.
import * as sanitizeContentLib from "@haxtheweb/haxcms-nodejs/dist/lib/sanitizeContent.js";
const sanitizeHTMLForStorage = sanitizeContentLib.sanitizeHTMLForStorage;
const HAXCMS = haxcmsLib.HAXCMS;
const systemStructureContext = haxcmsLib.systemStructureContext;


var sysSurge = true;
exec('surge --version', error => {
  if (error) {
    sysSurge = false;
  }
});

var sysNetlify = true;
exec('netlify --version', error => {
  if (error) {
    sysNetlify = false;
  }
});

var sysVercel = true;
exec('vercel --version', error => {
  if (error) {
    sysVercel = false;
  }
});

var sysRsync = true;
exec('rsync --version', error => {
  if (error) {
    sysRsync = false;
  }
});

const siteRecipeFile = 'create-cli.recipe';
const siteLoggingName = 'cli';
const logLevels = {};
logLevels[siteLoggingName] = 0;
let twigConstantFunctionRegistered = false;
let haxcmsNodejsCli = null;

function ensureTwigConstantFunction() {
  if (twigConstantFunctionRegistered) {
    return;
  }
  twigConstantFunctionRegistered = true;
  try {
    if (Twig && typeof Twig.extendFunction === 'function') {
      // Security (M-3): previously this read process.env[name] and
      // globalThis[name], which exposed arbitrary secrets/globals to any Twig
      // template rendered in this process. The only template usage is the
      // service-worker.js template's constant('JSON_PRETTY_PRINT'), a PHP
      // constant ported from the PHP HAXcms. Resolve that handful from a
      // static allowlist and return null for anything else — no env/global
      // access.
      Twig.extendFunction('constant', function constantLookup(name) {
        if (typeof name !== 'string') {
          return null;
        }
        if (Object.prototype.hasOwnProperty.call(TWIG_PHP_CONSTANTS, name)) {
          return TWIG_PHP_CONSTANTS[name];
        }
        return null;
      });
    }
  } catch (e) {
  }
}

// Static allowlist of PHP constants the Twig templates reference (ported from
// PHP HAXcms). Values match the standard PHP bitmask values.
const TWIG_PHP_CONSTANTS = {
  JSON_PRETTY_PRINT: 128,
  JSON_HEX_TAG: 1,
  JSON_HEX_AMP: 2,
  JSON_HEX_APOS: 4,
  JSON_HEX_QUOT: 8,
  JSON_FORCE_OBJECT: 16,
  JSON_NUMERIC_CHECK: 32,
  JSON_UNESCAPED_SLASHES: 64,
  JSON_UNESCAPED_UNICODE: 256,
};

async function getHaxcmsNodejsCli() {
  if (!haxcmsNodejsCli) {
    haxcmsNodejsCli = await import("@haxtheweb/haxcms-nodejs/dist/cli.js");
  }
  return haxcmsNodejsCli;
}

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
  json(data) {
    this.data = JSON.parse(JSON.stringify(data));
    return this;
  }
  sendStatus(status) {
    this.statusCode = status;
    this.data = status;
    return this;
  }
  setHeader() {
    return this;
  }
}

// Security (Stream-A): params added so the site/import/:platform dispatcher
// (replacing the open-apis broker) can receive the platform name in-process.
// Backward-compatible: existing callers omit params, defaulting to {}.
async function invokeRoute(routeHandler, body = {}, query = {}, params = {}) {
  let res = new Res();
  // Site-scoped reads (site:search, site:tags, site:blocks, site:analytics,
  // site:list-files) pass query.siteName; set the auth context so
  // isAnonymousSiteApiRequest sees the CLI as authenticated and hidden/
  // unpublished items are included for the CLI owner. System-route calls
  // (site creation, skeletons, download-skeleton, save-as-template) pass no
  // siteName and never read haxcmsSiteApiAuth, so they are unaffected.
  const siteAuthContext = query.siteName
    ? {
        siteName: query.siteName,
        authenticated: true,
        securityLevel: 'authenticated-site',
      }
    : undefined;
  await routeHandler(
    {
      body: body,
      query: query,
      params: params,
      headers: {
        'x-haxcms-user-token': query.user_token || 'fakeToken',
        'x-haxcms-site-token': query.site_token || 'fakeToken',
      },
      haxcmsSiteApiAuth: siteAuthContext,
    },
    res
  );
  return res;
}
// Security (Stream-A): map --import-structure names to on-prem haxcms-nodejs
// route handlers (replaces the deprecated @haxtheweb/open-apis broker). Platform
// converters go through the site/import/:platform dispatcher; docx/xlsx use their
// own actions routes. evolutionToSite (custom zip upload) is intentionally absent
// and falls through to the hidden-methodologies branch below.
const IMPORT_STRUCTURE_MAP = {
  haxcmsToSite: { platform: 'haxcms' },
  pressbooksToSite: { platform: 'pressbooks' },
  gitbookToSite: { platform: 'gitbook' },
  notionToSite: { platform: 'notion' },
  elmslnToSite: { platform: 'elmsln' },
  ploneToSite: { platform: 'plone' },
  wordpressPagesToSite: { platform: 'wordpress' },
  drupalBookToSite: { platform: 'drupal-book' },
  htmlToSite: { platform: 'html' },
  docxToSite: { routeKey: 'actions/import-docx' },
  xlsxToSite: { routeKey: 'actions/import-xlsx' },
};
function formatStructuredOutput(commandRun, value) {
  if (commandRun.options.format === 'yaml') {
    return dump(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function logStructuredOutput(commandRun, value, level = 'info') {
  log(formatStructuredOutput(commandRun, value), level);
}

function formatErrorForLogging(error) {
  if (error && typeof error.stderr === 'string' && error.stderr.trim().length > 0) {
    return error.stderr.trim();
  }
  if (error && typeof error.stdout === 'string' && error.stdout.trim().length > 0) {
    return error.stdout.trim();
  }
  if (error && typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }
  try {
    const serializedError = JSON.stringify(error);
    if (serializedError && serializedError !== '{}') {
      return serializedError;
    }
  }
  catch (e) {
  }
  return 'Unknown error';
}

// Security (H-4): recipe files can contain arbitrary text that used to be
// passed straight to exec() as a shell string. Replaying a recipe now invokes
// the CLI via spawn() with an argument array (no shell) so recipe contents
// cannot inject shell commands. Tokens are also guarded so malformed recipes
// fail loudly instead of producing surprising argv.
const RECIPE_TOKEN_DENY = /[;&|$`<>(){}!\n\r]/;
function guardRecipeTokens(tokens) {
  for (const t of tokens) {
    if (typeof t !== 'string' || RECIPE_TOKEN_DENY.test(t)) {
      throw new Error(`Recipe token rejected (contains shell metacharacters): ${t}`);
    }
  }
  return tokens;
}

// Run the CLI against itself with an argument array and NO shell. Captures
// stdout/stderr to mirror the previous exec() behavior while removing the
// shell-injection vector. Resolves on exit 0, rejects otherwise.
function runCliNoShell(tokens) {
  return new Promise((resolve, reject) => {
    const createJsPath = process.mainModule.filename;
    const child = spawn(process.execPath, [createJsPath, ...tokens], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    if (child.stdout) {
      child.stdout.on('data', (d) => { stdout += d; });
    }
    if (child.stderr) {
      child.stderr.on('data', (d) => { stderr += d; });
    }
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(`Recipe command failed with code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
    child.on('error', (err) => reject(err));
  });
}

// Security (H-1/H-2/H-3): true when an error thrown by safeFetch/
// assertUrlNotSSRF is an SSRF rejection (stable .code prefix) rather than a
// generic network error, so callers can surface a clear message.
function isSSRFError(e) {
  return Boolean(e && typeof e.code === 'string' && e.code.startsWith('SSRF_'));
}

// Security (H-5): sanitize remote-derived HTML before it is written into page
// content. Non-string values (e.g. parsed JSON/YAML objects from --format) and
// empty strings pass through unchanged so non-HTML import formats are unaffected.
function sanitizeIfString(html) {
  return typeof html === 'string' && html.length > 0 ? sanitizeHTMLForStorage(html) : html;
}

// Security (L-1): canonicalize a local filesystem path and reject null bytes
// (a classic fs-path-injection vector). No fixed base is enforced because these
// options legitimately point anywhere on the user's filesystem; path.resolve is
// a harmless normalization that does not change which file is read.
function resolveLocalPath(p) {
  if (typeof p !== 'string' || p.indexOf('\0') !== -1) {
    throw new Error('Invalid local path: null bytes are not allowed.');
  }
  return path.resolve(p);
}


function cleanupSiteForPublish(siteDirectory) {
  const brokenSymlinks = [];
  try {
    if (!fs.existsSync(siteDirectory)) {
      return brokenSymlinks;
    }
    // Scan recursively for broken symlinks
    function scanDir(dir) {
      let items = [];
      try {
        items = fs.readdirSync(dir);
      } catch (e) {
        return;
      }
      for (const item of items) {
        const itemPath = path.join(dir, item);
        let lstat;
        try {
          lstat = fs.lstatSync(itemPath);
        } catch (e) {
          continue;
        }
        if (lstat.isSymbolicLink()) {
          try {
            fs.statSync(itemPath);
          } catch (e) {
            // Broken symlink: statSync fails but lstatSync succeeded
            brokenSymlinks.push(itemPath);
            try {
              fs.unlinkSync(itemPath);
            } catch (e2) {
              // Ignore unlink errors
            }
          }
        } else if (lstat.isDirectory() && item !== 'node_modules' && item !== '.git') {
          scanDir(itemPath);
        }
      }
    }
    scanDir(siteDirectory);
  } catch (e) {
    // Silent failure; cleanup is best-effort
  }
  return brokenSymlinks;
}

function fixLegacyIgnoreFile(siteDirectory, ignoreFileName) {
  const ignoreFilePath = path.join(siteDirectory, ignoreFileName);
  if (!fs.existsSync(ignoreFilePath)) {
    return false;
  }
  try {
    let contents = fs.readFileSync(ignoreFilePath, 'utf8');
    // Legacy templates had !node_modules/ which is the wrong syntax for
    // excluding directories. If we find that exact line, replace the whole file.
    if (contents.includes('!node_modules/')) {
      let newContents = '';
      if (ignoreFileName === '.surgeignore') {
        newContents = `node_modules
dist
!custom/build
!build/es6/node_modules
!build/es6/node_modules/**

# Version control
.git/

# IDE files
.vscode/
.idea/

# Local files
.DS_Store
Thumbs.db

# Logs
logs
*.log

# HAX development artifacts
.cache/
.tmp/
`;
      } else if (ignoreFileName === '.netlifyignore') {
        newContents = `node_modules
dist
!custom/build
!build/es6/node_modules
!build/es6/node_modules/**

# Local files
.DS_Store
Thumbs.db

# Logs
logs
*.log

# Development files
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/
.idea/

# Version control
.git/

# HAX development artifacts
.cache/
.tmp/
`;
      } else if (ignoreFileName === '.vercelignore') {
        newContents = `node_modules
dist
!custom/build
!build/es6/node_modules
!build/es6/node_modules/**

# Local files
.DS_Store
Thumbs.db

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Development files
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/
.idea/

# Version control
.git/

# Cache directories
.cache/
.tmp/
`;
      }
      if (newContents) {
        fs.writeFileSync(ignoreFilePath, newContents);
        return true;
      }
    }
  } catch (e) {
    // Silent failure; fix is best-effort
  }
  return false;
}

function prepareSiteForStaticPublish(siteDirectory) {
  let prepared = false;
  try {
    if (!fs.existsSync(siteDirectory)) {
      return false;
    }
    const indexPath = path.join(siteDirectory, 'index.html');
    const ghpagesPath = path.join(siteDirectory, 'ghpages.html');
    const backupPath = path.join(siteDirectory, 'index.html.bak');
    // Only prepare if ghpages.html exists and is different from index.html
    if (fs.existsSync(ghpagesPath)) {
      // Backup current index.html if it exists
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, backupPath);
      }
      // Copy ghpages.html to index.html so the host serves it as the entry point
      fs.copyFileSync(ghpagesPath, indexPath);
      prepared = true;
    }
    // Remove local build artifacts that won't exist on a static host
    const buildDir = path.join(siteDirectory, 'build');
    const wcRegistryPath = path.join(siteDirectory, 'wc-registry.json');
    if (fs.existsSync(buildDir)) {
      try {
        fs.rmSync(buildDir, { recursive: true, force: true });
      } catch (e) {
        // best-effort removal
      }
    }
    if (fs.existsSync(wcRegistryPath)) {
      try {
        fs.unlinkSync(wcRegistryPath);
      } catch (e) {
        // best-effort removal
      }
    }
    // Remove babel* files in assets directory
    try {
      const assetsDir = path.join(siteDirectory, 'assets');
      if (fs.existsSync(assetsDir)) {
        const items = fs.readdirSync(assetsDir);
        for (const item of items) {
          if (item.startsWith('babel')) {
            fs.unlinkSync(path.join(assetsDir, item));
          }
        }
      }
    } catch (e) {
      // best-effort removal
    }
  } catch (e) {
    // Silent failure; prep is best-effort
  }
  return prepared;
}

function restoreSiteAfterStaticPublish(siteDirectory) {
  try {
    if (!fs.existsSync(siteDirectory)) {
      return false;
    }
    const indexPath = path.join(siteDirectory, 'index.html');
    const backupPath = path.join(siteDirectory, 'index.html.bak');
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, indexPath);
      fs.unlinkSync(backupPath);
      return true;
    }
  } catch (e) {
    // Silent failure; restore is best-effort
  }
  return false;
}

export function siteActions() {
  return [
    { value: 'start', label: "Launch site in browser (http://localhost)"},
    { value: 'serve', label: "Launch site in development mode"},
    { value: 'node:stats', label: "Node Stats / data"},
    { value: 'node:add', label: "Add a new page"},
    { value: 'node:edit', label: "Edit a page"},
    { value: 'node:delete', label: "Delete a page"},
    { value: 'site:stats', label: "Site Status / stats" },
    { value: 'site:items', label: "Site items" },
    { value: 'site:items-import', label: "Import items (JOS / site.json)" },
    { value: 'site:list-files', label: "List site files" },
    { value: 'site:search', label: "Search site content" },
    { value: 'site:tags', label: "List site tags" },
    { value: 'site:blocks', label: "List site block usage" },
    { value: 'site:analytics', label: "Site analytics metadata" },
    { value: 'site:revisions', label: "List or restore item revisions" },
    { value: 'site:export', label: "Export site in a format" },
    { value: 'site:theme', label: "Change theme"},
    { value: 'site:element', label: "Add new Lit component to custom/src"},
    { value: 'site:html', label: "Full site as HTML"},
    { value: 'site:md', label: "Full site as Markdown"},
    { value: 'site:schema', label: "Full site as HAXElementSchema"},
    { value: 'site:skeleton-export', label: "Export site as skeleton template"},
    { value: 'site:skeleton-install', label: "Install skeleton template"},
    { value: 'site:sync', label: "Sync git repo"},
    { value: 'site:rsync', label: "Rsync site to remote/local directory"},
    { value: 'site:surge', label: "Publish site to Surge.sh"},
    { value: 'site:netlify', label: "Publish site to Netlify"},
    { value: 'site:vercel', label: "Publish site to Vercel"},
    { value: 'setup:github-actions', label: "Setup GitHub Actions deployment"},
    { value: 'setup:gitlab-ci', label: "Setup GitLab CI deployment"},
    { value: 'recipe:read', label: "Read recipe file" },
    { value: 'recipe:play', label: "Play recipe file" },
    { value: 'issue:general', label: "Issue: Submit an issue or suggestion"},
    { value: 'issue:theme', label: "Issue: Suggest custom theme"},
  ];
}

export async function siteCommandDetected(commandRun) {
    var activeHaxsite = await systemStructureContext();
    const recipeFileName = path.join(process.cwd(), siteRecipeFile);
    const recipeLogTransport = new winston.transports.File({
      filename: recipeFileName
    });
    const recipe = winston.createLogger({
      levels: logLevels,
      level: siteLoggingName,
      transports: [
        recipeLogTransport
      ],
      format: winston.format.simple(),
    });
    let actionAssigned = false;
    // default to status unless already set so we don't issue a create in a create
    if (!commandRun.arguments.action) {
      actionAssigned = true;
      commandRun.arguments.action = 'site:status';
    }
    commandRun.command = "site";
    if (!commandRun.options.y && commandRun.options.i && !commandRun.options.quiet) {
      p.intro(`${color.bgBlack(color.white(` HAXTheWeb : Site detected `))}`);
      p.intro(`${color.bgBlue(color.white(` Name: ${activeHaxsite.name} `))}`);  
    }
    // defaults if nothing set via CLI
    let operation = {
      ...commandRun.arguments,
      ...commandRun.options
    };
    if (!commandRun.options.title) {
      commandRun.options.title = "New Page";
    }
    if (!commandRun.options.domain && commandRun.options.y) {
      commandRun.options.domain = `haxcli-${activeHaxsite.name}.surge.sh`;
    }
    // infinite loop until quitting the cli
    while (operation.action !== 'quit') {
      let actions = siteActions();
      actions.push({ value: 'quit', label: "🚪 Quit"});
      if (!operation.action) {
        commandRun = {
          command: null,
          arguments: {},
          options: {}
        }
        // ensures data is updated and stateful per action
        activeHaxsite = await systemStructureContext();
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
              if (!commandRun.options.quiet) {
                p.cancel('🧙 Merlin: Canceling CLI.. HAX ya later 🪄');
                communityStatement();
              }
              process.exit(0);
            },
          });
      }
      if (operation.action) {
        p.intro(`hax site ${color.bold(operation.action)}`);
      }
      switch (operation.action) {
        case "site:status": // easy mistype
        case "site:stats":
          const date = new Date(activeHaxsite.manifest.metadata.site.updated*1000);
          let siteItems = [];
          if (commandRun.options.itemId != null) {
            siteItems = activeHaxsite.manifest.findBranch(commandRun.options.itemId);
          }
          else {
            siteItems = activeHaxsite.manifest.orderTree(activeHaxsite.manifest.items);
          }
          let els = {};
          for (var i in siteItems) {
            let page = activeHaxsite.loadNode(siteItems[i].id);
            let html = await activeHaxsite.getPageContent(page);
            let dom = parse(`<div id="fullpage">${html}</div>`);
            for (var j in dom.querySelector('#fullpage').childNodes) {
              let node = dom.querySelector('#fullpage').childNodes[j];
              if (node && node.getAttribute) {
                let haxel = await nodeToHaxElement(node, null);
                if (!els[haxel.tag]) {
                  els[haxel.tag] = 0;
                }
                els[haxel.tag]++;
              }
            }
          }
          let siteStats = {
            title: activeHaxsite.manifest.title,
            description: activeHaxsite.manifest.description,
            themeName: activeHaxsite.manifest.metadata.theme.name,
            themeElement: activeHaxsite.manifest.metadata.theme.element,
            pageCount: activeHaxsite.manifest.items.length,
            lastUpdated: date.toLocaleDateString("en-US"),
            tagUsage: els
          }
          if (!commandRun.options.format && !commandRun.options.quiet) {
            p.intro(`${color.bgBlue(color.white(` Title: ${siteStats.title} `))}`);
            p.intro(`${color.bgBlue(color.white(` Description: ${siteStats.description} `))}`);
            p.intro(`${color.bgBlue(color.white(` Theme: ${siteStats.themeName} (${siteStats.themeElement})`))}`);
            p.intro(`${color.bgBlue(color.white(` Pages: ${siteStats.pageCount} `))}`);  
            p.intro(`${color.bgBlue(color.white(` Last updated: ${siteStats.lastUpdated} `))}`);
            p.intro(`${color.bgBlue(color.white(` Tags used: ${JSON.stringify(siteStats.tagUsage, null, 2)} `))}`);
          }
          else {
            logStructuredOutput(commandRun, siteStats);
          }
          // simple redirecting to file
          if (commandRun.options.toFile) {
            if (commandRun.options.format === 'yaml') {
              fs.writeFileSync(commandRun.options.toFile, dump(siteStats))
            }
            else {
              fs.writeFileSync(commandRun.options.toFile, JSON.stringify(siteStats, null, 2))
            }
          }
        break;
        case "site:items":
          let siteitems = [];
          if (commandRun.options.itemId != null) {
            siteitems = activeHaxsite.manifest.findBranch(commandRun.options.itemId);
          }
          else {
            siteitems = activeHaxsite.manifest.orderTree(activeHaxsite.manifest.items);
          }
          for (let i in siteitems) {
            let page = await activeHaxsite.loadNode(siteitems[i].id);
            siteitems[i].content = await activeHaxsite.getPageContent(page);
          }
          // simple redirecting to file if asked for
          if (commandRun.options.toFile) {
            let contents = '';
            if (commandRun.options.format === 'yaml') {
              contents = dump(siteitems);
            }
            else {
              contents = JSON.stringify(siteitems, null, 2);
            }
            fs.writeFileSync(commandRun.options.toFile, contents);
            
          }
          else {
            logStructuredOutput(commandRun, siteitems);
          }
        break;
        case "site:items-import":
          // need source, then resolve what it is
          if (commandRun.options.itemsImport) {
            let location = commandRun.options.itemsImport;
            let josImport = new JSONOutlineSchema();
            var itemsImport = [];
            // support for address, as in import from some place else
            if (location.startsWith('https://') || location.startsWith('http://')) {
              if (location.endsWith('/site.json')) {
                location = location.replace('/site.json','');
              }
              else if (!location.endsWith('/')) {
                location = location + '/';
              }
              // Security (H-1): fetch the remote site.json through safeFetch so
              // loopback/private/metadata IPs are rejected before the request.
              let f;
              try {
                const resp = await safeFetch(`${location}site.json`);
                f = resp.ok ? await resp.json() : null;
              } catch (e) {
                if (isSSRFError(e)) {
                  log(`Import URL rejected as SSRF target: ${location}site.json (${e.message})`, 'error');
                } else {
                  log(formatErrorForLogging(e), 'error');
                }
                f = null;
              }
              if (f && f.items) {
                josImport.items = f.items;
              }
              else {
                // invalid data
                process.exit(0);
              }
            }
            // look on prem
            else if(fs.existsSync(location)) {
              // Security (L-1): canonicalize + reject null bytes for local paths.
              const localPath = resolveLocalPath(location);
              let fileContents = await fs.readFileSync(localPath);
              if (location.endsWith('.json')) {
                josImport.items = JSON.parse(fileContents);

              }
              else if (location.endsWith('.yaml')) {
                josImport.items = await load(fileContents);
              }
            }
            // allows for filtering
            if (commandRun.options.itemId) {
              itemsImport = josImport.findBranch(commandRun.options.itemId);
            }
            else {
              itemsImport = josImport.items;
            }
            for (let i in josImport.items) {
              if (josImport.items[i].location && !josImport.items[i].content) {
                // Security (H-1): resolve each remote-controlled item location
                // against the import base via new URL() (so an absolute/
                // protocol-relative location can't bypass validation) and fetch
                // through safeFetch to block SSRF targets.
                try {
                  const itemUrl = new URL(josImport.items[i].location, location).toString();
                  const resp = await safeFetch(itemUrl);
                  josImport.items[i].content = resp.ok ? await resp.text() : '';
                } catch (e) {
                  if (isSSRFError(e)) {
                    log(`Import item URL rejected as SSRF target: ${josImport.items[i].location} (${e.message})`, 'error');
                  } else {
                    log(formatErrorForLogging(e), 'error');
                  }
                  josImport.items[i].content = '';
                }
              }
            }
            let itemIdMap = {};
            for (let i in josImport.items) {
              // if we have a parent set by force to append this structure to
              // then see if parent = null (implying top level in full site import)
              // or match on itemId to imply that it's the top (no matter parent status)
              if (commandRun.options.parentId) {
                if (josImport.items[i].parent === null || josImport.items[i].id === commandRun.options.itemId) {
                  josImport.items[i].parent = commandRun.options.parentId;
                }
              }
              // see if map has an entry that is already set
              if (itemIdMap[josImport.items[i].parent]) {
                // remaps the parent of this item bc the thing imported has changed ID
                josImport.items[i].parent = itemIdMap[josImport.items[i].parent];
              }
              let tmpAddedItem = await activeHaxsite.addPage(
                josImport.items[i].parent,
                josImport.items[i].title,
                'html',
                josImport.items[i].slug,
                null,
                josImport.items[i].indent,
                // Security (H-5): sanitize remote item content before storing.
                sanitizeIfString(josImport.items[i].content),
                josImport.items[i].order,
                josImport.items[i].metadata
              );
              // set in the map for future translations
              itemIdMap[josImport.items[i].id] = tmpAddedItem.id;
            }
            if (!commandRun.options.quiet) {
              log(`${josImport.items.length} nodes imported`);
            }
            recipe.log(siteLoggingName, commandString(commandRun));
          }
          else if (!commandRun.options.quiet) {
            log('Must specify --items-import as path to valid item export file or URL', 'error');
          }
        break;
        case "start":
          try {
            const port = await findAvailablePort();
            if (!commandRun.options.quiet) {
              p.intro(`Starting server.. `);
              p.note(`🚀 Server running at: ${color.underline(color.cyan(`http://localhost:${port}`))}
⌨️  To stop server, press: ${color.bold(color.black(color.bgRed(` CTRL + C or CTRL + BREAK `)))}`);
            }
            // Security (M-4): HAXCMS_DISABLE_JWT_CHECKS is scoped to local
            // dev only. HOST=127.0.0.1 is a forward-compatible hint so the
            // server binds loopback once haxcms-nodejs honors it (today it
            // calls server.listen(port) with no host, binding all interfaces;
            // loopback enforcement requires a server-side change).
            await exec(`npx @haxtheweb/haxcms-nodejs`, {
              cwd: activeHaxsite.directory,
              env: { ...process.env, PORT: `${port}`, HOST: '127.0.0.1', HAXCMS_DISABLE_JWT_CHECKS: 'true' }
            });
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
        break;
        case "serve":
          try {
            const port = await findAvailablePort();
            if (!commandRun.options.quiet) {
              p.intro(`Starting server in development mode.. `);
              p.note(`🚀 Server running at: ${color.underline(color.cyan(`http://localhost:${port}`))}
💻 Site will live reload on changes to ${color.bold('custom/src')}
⌨️  To stop server, press: ${color.bold(color.black(color.bgRed(` CTRL + C or CTRL + BREAK `)))}`);
            }
            // Security (M-4): same HOST=127.0.0.1 hint + scoped JWT-disable as start.
            await exec(`npx @haxtheweb/haxcms-nodejs`, {
              cwd: activeHaxsite.directory,
              env: { ...process.env, PORT: `${port}`, HOST: '127.0.0.1', HAXCMS_DISABLE_JWT_CHECKS: 'true', NODE_ENV: 'development' }
            });
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
        break;
        case "node:status": // easy mistype
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
                    logStructuredOutput(commandRun, page);
                    // simple redirecting to file
                    if (commandRun.options.toFile) {
                      if (commandRun.options.format === 'yaml') {
                        fs.writeFileSync(commandRun.options.toFile, dump(page))
                      }
                      else {
                        fs.writeFileSync(commandRun.options.toFile, JSON.stringify(page, null, 2))
                      }
                    }
                  break;
                  case 'html':
                    let itemHTML = await activeHaxsite.getPageContent(page);
                    // simple redirecting to file
                    if (commandRun.options.toFile) {
                      fs.writeFileSync(commandRun.options.toFile, itemHTML)
                    }
                    else {
                      log(itemHTML);
                    }
                  break;
                  case 'schema':
                    // next up
                    let html = await activeHaxsite.getPageContent(page);
                    let dom = parse(`<div id="fullpage">${html}</div>`);
                    let els = [];
                    for (var i in dom.querySelector('#fullpage').childNodes) {
                      let node = dom.querySelector('#fullpage').childNodes[i];
                      if (node && node.getAttribute) {
                        els.push(await nodeToHaxElement(node, null));
                      }
                    }
                    // simple redirecting to file
                    if (commandRun.options.toFile) {
                      if (commandRun.options.format === 'yaml') {
                        fs.writeFileSync(commandRun.options.toFile, dump(els))
                      }
                      else {
                        fs.writeFileSync(commandRun.options.toFile, JSON.stringify(els, null, 2))
                      }
                    }
                    else {
                      logStructuredOutput(commandRun, els);
                    }
                  break;
                  case 'md':
                  // Security (Stream-A): on-prem haxcms-nodejs handler in-process
                  // (replaces @haxtheweb/open-apis broker); result string now at
                  // .data.data.contents (haxcms-nodejs response envelope).
                  let resp = await invokeRoute(allRoutesLib.allRoutes.system.map.post['actions/html-to-md'], { html: await activeHaxsite.getPageContent(page) });
                  let mdContent = resp && resp.data && resp.data.data ? resp.data.data.contents : '';
                  // simple redirecting to file
                  if (commandRun.options.toFile) {
                    fs.writeFileSync(commandRun.options.toFile, mdContent);
                  }
                  else {
                    log(mdContent);
                  }
                  break;
                }
              }
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
        break;
        case "node:add":
          try {
            if (!commandRun.options.title) {
              commandRun.options.title = await p.text({
                message: `Title for this page`,
                placeholder: "New page",
                initialValue: "New page",
                required: true,
                validate: (value) => {
                  if (!value) {
                    return "Title must be set (Enter accepts default)";
                  }
                }
              });
            }
            var createNodeBody = { 
              site: activeHaxsite,
              node: { 
                title: commandRun.options.title
              }
            };
            if (commandRun.options.parent && commandRun.options.parent !== '') {
              createNodeBody.parent = commandRun.options.parent;
            }
            if (commandRun.options.order && !Number.isNaN(parseInt(commandRun.options.order))) {
              createNodeBody.order = parseInt(commandRun.options.order);
            }
            if (commandRun.options.slug && commandRun.options.slug !== '') {
              createNodeBody.node.location = commandRun.options.slug;
            }
            if (commandRun.options.description && commandRun.options.description !== '') {
              createNodeBody.description = commandRun.options.description;
            }
            if (commandRun.options.tags && commandRun.options.tags !== '') {
              createNodeBody.metadata = { tags: commandRun.options.tags };
            }
            // this would be odd but could be direct with no format specified
            if (commandRun.options.content && !commandRun.options.format) {
              // only API where it's called contents and already out there {facepalm}
              // but user already has commands where it's --content as arg
              createNodeBody.node.contents = commandRun.options.content;
            }
            else if (commandRun.options.content && commandRun.options.format) {
              let locationContent = '';
              // if we have format set, then  we need to interpret content as a url
              let location = commandRun.options.content;
              // support for address, as in import from some place else
              if (location.startsWith('https://') || location.startsWith('http://')) {
                // Security (H-2): route through safeFetch to block SSRF targets
                // (private/loopback/link-local/metadata IPs) and cap redirects.
                const resp = await safeFetch(location);
                locationContent = resp.ok ? await resp.text() : '';
              }
              // look on prem
              else if(fs.existsSync(location)) {
                // Security (L-1): canonicalize + reject null bytes for local paths.
                locationContent = await fs.readFileSync(resolveLocalPath(location));
              }
              // format dictates additional processing; html is default
              switch (commandRun.options.format) {
                case 'json':
                  locationContent = JSON.parse(locationContent);
                break;
                case 'yaml':
                  locationContent = await load(locationContent);
                break;
                case 'md':
                  // Security (Stream-A): on-prem haxcms-nodejs handler in-process
                  // (replaces @haxtheweb/open-apis broker); raw mode dropped —
                  // haxcms-nodejs returns HTML at .data.data.contents.
                  let resp = await invokeRoute(allRoutesLib.allRoutes.system.map.post['actions/md-to-html'], { md: locationContent });
                  if (resp.data && resp.data.data && resp.data.data.contents) {
                    locationContent = resp.data.data.contents;
                  }
                break;
              }
              // support for scraper mode to find title from the content responsee
              if (commandRun.options.titleScrape) {
                let dom = parse(`${locationContent}`);
                createNodeBody.node.title = dom.querySelector(`${commandRun.options.titleScrape}`).textContent;
              }
              // support scraper mode which targets a wrapper for the actual content
              if (commandRun.options.contentScrape) {
                let dom = parse(`${locationContent}`);
                locationContent = dom.querySelector(`${commandRun.options.contentScrape}`).innerHTML;
              }
              // Security (H-5): sanitize remote/scraped HTML before storing.
              // Objects (json/yaml format) pass through sanitizeIfString unchanged.
              createNodeBody.node.contents = sanitizeIfString(locationContent);
            }
            const cliBridge = await getHaxcmsNodejsCli();
            let resp = await cliBridge.cliBridge('v1/items', createNodeBody, 'post');
            recipe.log(siteLoggingName, commandString(commandRun));
            if (commandRun.options.v) {
              log(resp.res.data, 'silly');
            }
            if (!commandRun.options.quiet) {
              log(`"${createNodeBody.node.title}" added to site`, 'info', createNodeBody.node);
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
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
                    let list = nodeProp === 'parent' ? await siteItemsOptionsList(activeHaxsite,  page.id) : await siteThemeList(true);
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
                  let locationContent = '';
                  // this would be odd but could be direct with no format specified
                  if (commandRun.options.content && !commandRun.options.format) {
                    locationContent = commandRun.options.content;
                  }
                  // this implies what we were given needs processing as a file / url
                  else if (commandRun.options.content && commandRun.options.format) {
                    // if we have format set, then  we need to interpret content as a url
                    let location = commandRun.options.content;
                    // support for address, as in import from some place else
                    if (location.startsWith('https://') || location.startsWith('http://')) {
                      // Security (H-2): route through safeFetch to block SSRF targets
                      // (private/loopback/link-local/metadata IPs) and cap redirects.
                      const resp = await safeFetch(location);
                      locationContent = resp.ok ? await resp.text() : '';
                    }
                    // look on prem
                    else if(fs.existsSync(location)) {
                      // Security (L-1): canonicalize + reject null bytes for local paths.
                      locationContent = await fs.readFileSync(resolveLocalPath(location));
                    }
                    // format dictates additional processing; html is default
                    switch (commandRun.options.format) {
                      case 'json':
                        locationContent = JSON.parse(locationContent);
                      break;
                      case 'yaml':
                        locationContent = await load(locationContent);
                      break;
                      case 'md':
                        // Security (Stream-A): on-prem haxcms-nodejs handler in-process
                        // (replaces @haxtheweb/open-apis broker); raw mode dropped —
                        // haxcms-nodejs returns HTML at .data.data.contents.
                        let resp = await invokeRoute(allRoutesLib.allRoutes.system.map.post['actions/md-to-html'], { md: locationContent });
                        if (resp.data && resp.data.data && resp.data.data.contents) {
                          locationContent = resp.data.data.contents;
                        }
                      break;
                    }
                    // support scraper mode which targets a wrapper for the actual content
                    if (commandRun.options.contentScrape) {
                      let dom = parse(`${locationContent}`);
                      locationContent = dom.querySelector(`${commandRun.options.contentScrape}`).innerHTML;
                    }
                  }
                  // Security (H-5): sanitize remote/scraped HTML before writing.
                  // Objects (json/yaml format) pass through sanitizeIfString unchanged.
                  const safeContent = sanitizeIfString(locationContent);
                  // if we have content (meaning it's not blank) then try to write the page location                    
                  if (safeContent && await page.writeLocation(safeContent)) {
                    recipe.log(siteLoggingName, commandString(commandRun));
                    if (!commandRun.options.quiet) {
                      log(`node:edit success updated page content: "${page.id}`);
                    }
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
                  recipe.log(siteLoggingName, commandString(commandRun));
                  if (commandRun.options.v) {
                    log(resp, 'silly');
                  }
                }
              }
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
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
                const cliBridge = await getHaxcmsNodejsCli();
                let resp = await cliBridge.cliBridge('v1/items/' + commandRun.options.itemId, { site: activeHaxsite, node: { id: commandRun.options.itemId } }, 'delete');
                // D1 error envelope: failures are {status:4xx/5xx,data:{message}}
                // objects, never the bare number 500. Match the site:export pattern.
                if (resp.res.data && resp.res.data.status >= 400) {
                  console.warn(`node:delete failed "${commandRun.options.itemId} not found`);
                }
                else {
                  recipe.log(siteLoggingName, commandString(commandRun));
                  log(`"${commandRun.options.itemId}" deleted`);
                }    
              }
              else {
                log(`Delete operation canceled`);
              }
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
        break;
        case "site:skeleton-export":
          try {
          let skeletonResponse = await invokeRoute(
            allRoutesLib.allRoutes.system.map.post['sites/:siteName/download-skeleton'],
            {
              site: {
                name: activeHaxsite.name,
              },
            },
            {
              user_token: 'fakeToken',
            }
          )
            if (
              !skeletonResponse ||
              !skeletonResponse.data ||
              skeletonResponse.data.status !== 200 ||
              !skeletonResponse.data.data ||
              !skeletonResponse.data.data.skeleton
            ) {
              throw new Error('Failed to export skeleton for this site')
            }
            const skeletonData = skeletonResponse.data.data.skeleton
            const fileName = skeletonResponse.data.data.filename
              ? skeletonResponse.data.data.filename
              : `${normalizeSkeletonMachineName(activeHaxsite.name)}.json`
            let targetFilePath = commandRun.options.toFile
              ? commandRun.options.toFile
              : fileName
            targetFilePath = resolveAbsolutePath(targetFilePath)
            fs.writeFileSync(
              targetFilePath,
              `${JSON.stringify(skeletonData, null, 2)}\n`
            )
            recipe.log(siteLoggingName, commandString(commandRun))
            if (!commandRun.options.quiet) {
              p.outro(
                `${color.green('✓')} Skeleton exported to ${targetFilePath}`
              )
            } else {
              logStructuredOutput(commandRun, { file: targetFilePath })
            }
          }
          catch(e) {
            log(`Skeleton export failed: ${e.message}`, 'error')
            if (!commandRun.options.quiet) {
              p.outro(`${color.red('✗')} ${e.message}`)
            }
          }
        break;
        case "site:skeleton-install":
          try {
            if (commandRun.options.skeletonFile) {
              const installData = installSkeletonFile(
                commandRun.options.skeletonFile,
                commandRun.options.skeletonMachineName
              )
              recipe.log(siteLoggingName, commandString(commandRun))
              if (!commandRun.options.quiet) {
                p.outro(
                  `${color.green('✓')} Template installed as ${installData.machineName} (${installData.installPath})`
                )
              } else {
                logStructuredOutput(commandRun, installData)
              }
            } else {
              let saveResponse = await invokeRoute(
                allRoutesLib.allRoutes.system.map.post['sites/:siteName/save-as-template'],
                {
                  site: {
                    name: activeHaxsite.name,
                  },
                },
                {
                  user_token: 'fakeToken',
                }
              )
              if (
                !saveResponse ||
                !saveResponse.data ||
                saveResponse.data.status !== 200 ||
                !saveResponse.data.data
              ) {
                throw new Error('Failed to save current site as skeleton template')
              }
              const installData = saveResponse.data.data
              recipe.log(siteLoggingName, commandString(commandRun))
              if (!commandRun.options.quiet) {
                p.outro(
                  `${color.green('✓')} Template installed as ${installData.name}`
                )
              } else {
                logStructuredOutput(commandRun, installData)
              }
            }
          }
          catch(e) {
            log(`Skeleton install failed: ${e.message}`, 'error')
            if (!commandRun.options.quiet) {
              p.outro(`${color.red('✗')} ${e.message}`)
            }
          }
        break;
        case "site:sync":
          // @todo git sync might need other arguments / be combined with publishing
          try {
            await exec(`cd ${activeHaxsite.directory} && git pull && git push`);
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
        break;
        case "site:rsync":
          try {
            if (!sysRsync) {
              if (!commandRun.options.quiet) {
                p.intro(`${color.bgRed(color.white(` ERROR: rsync not found `))}`);
                p.outro(`${color.red('rsync is required but not installed on this system.')}`);
                p.outro(`${color.yellow('Install rsync:')}`);
                p.outro(`${color.gray('  Ubuntu/Debian: sudo apt install rsync')}`);
                p.outro(`${color.gray('  macOS: brew install rsync')}`);
                p.outro(`${color.gray('  CentOS/RHEL: sudo yum install rsync')}`);
              }
              break;
            }

            let source = commandRun.options.source || activeHaxsite.directory;
            let destination = commandRun.options.destination;
            let excludePatterns = commandRun.options.exclude ? commandRun.options.exclude.split(',').map(p => p.trim()) : ['node_modules', '.git', '.DS_Store', 'dist', 'build'];
            let dryRun = commandRun.options.dryRun || false;

            // Interactive prompts if not provided via CLI
            if (!commandRun.options.y && !destination) {
              let action = await p.select({
                message: 'Rsync action:',
                options: [
                  { value: 'to-remote', label: 'Sync site to remote server' },
                  { value: 'to-local', label: 'Sync site to local directory' },
                  { value: 'from-remote', label: 'Sync from remote server to site' },
                  { value: 'test', label: 'Test sync (dry run)' }
                ]
              });

              if (action === 'test') {
                dryRun = true;
              }

              if (action === 'from-remote') {
                source = await p.text({
                  message: 'Source (user@host:/path):',
                  placeholder: 'user@example.com:/var/www/html',
                  validate: (value) => {
                    if (!value) return 'Source is required';
                  }
                });
                destination = activeHaxsite.directory;
              } else {
                destination = await p.text({
                  message: action === 'to-remote' ? 'Destination (user@host:/path):' : 'Destination directory:',
                  placeholder: action === 'to-remote' ? 'user@example.com:/var/www/html' : '/backup/location',
                  validate: (value) => {
                    if (!value) return 'Destination is required';
                  }
                });
              }

              let excludeInput = await p.text({
                message: 'Exclude patterns (comma-separated):',
                placeholder: 'node_modules,.git,.DS_Store,dist,build',
                initialValue: 'node_modules,.git,.DS_Store,dist,build'
              });
              
              if (excludeInput) {
                excludePatterns = excludeInput.split(',').map(p => p.trim());
              }

              if (!dryRun && action !== 'test') {
                dryRun = await p.confirm({
                  message: 'Perform dry run first?',
                  initialValue: true
                });
              }
            }

            if (!destination) {
              if (!commandRun.options.quiet) {
                p.intro(`${color.bgRed(color.white(` ERROR: destination required `))}`); 
              }
              break;
            }

            // Build rsync command
            let rsyncArgs = [
              '-avz', // archive, verbose, compress
              '--progress', // show progress
              '--stats' // show stats
            ];

            // Add dry run flag if requested
            if (dryRun) {
              rsyncArgs.push('--dry-run');
            }

            // Add exclude patterns
            excludePatterns.forEach(pattern => {
              rsyncArgs.push('--exclude', pattern);
            });

            // Add delete flag to mirror source (be careful with this)
            if (commandRun.options.delete) {
              rsyncArgs.push('--delete');
            }

            // Add source and destination
            // Ensure source ends with / for directory contents
            if (!source.endsWith('/') && fs.lstatSync(source).isDirectory()) {
              source += '/';
            }
            
            rsyncArgs.push(source, destination);

            if (!commandRun.options.quiet) {
              p.intro(`${dryRun ? color.yellow('🧪 Dry run: ') : color.green('🚀 Running: ')}rsync ${rsyncArgs.join(' ')}`);
            }

            if (commandRun.options.i && !commandRun.options.quiet) {
              // Interactive execution for real-time progress
              await interactiveExec('rsync', rsyncArgs);
            } else {
              // Silent execution
              const result = await exec(`rsync ${rsyncArgs.join(' ')}`);
              if (!commandRun.options.quiet && result.stdout) {
                console.log(result.stdout);
              }
              if (result.stderr) {
                console.error(result.stderr);
              }
            }
            
            recipe.log(siteLoggingName, commandString(commandRun));
            if (!commandRun.options.quiet) {
              p.outro(`${color.green('✓')} ${dryRun ? 'Dry run completed' : 'Rsync completed successfully'}`);
            }
          }
          catch(e) {
            log(`Rsync error: ${e.message}`, 'error');
            if (!commandRun.options.quiet) {
              p.intro(`${color.bgRed(color.white(` Rsync Error `))}`);
              p.outro(`${color.red('✗')} ${e.message}`);
            }
          }
        break;
        case "site:theme":
          try {
            //theme
            activeHaxsite = await systemStructureContext();
            let list = await siteThemeList(true, activeHaxsite.directory);

            let val = activeHaxsite.manifest.metadata.theme.element;
            if (!commandRun.options.theme) {
              commandRun.options.theme = await p.select({
                message: `Select theme:`,
                defaultValue: val,
                initialValue: val,
                options: list,
              });
            }

            if (commandRun.options.theme === "custom-theme"){
              if(!commandRun.options.customThemeName) {
                commandRun.options.customThemeName = await p.text({
                  message: 'Theme Name:',
                  placeholder: `custom-${activeHaxsite.name}-theme`,
                  initialValue: `custom-${activeHaxsite.name}-theme`,
                  required: false,
                  validate: (value) => {
                    if (!value) {
                      return "Theme name is required (Enter accepts default)";
                    }
                    if(list.some(theme => theme.value === value)) {
                      return "Theme name is already in use";
                    }
                    if (/^\d/.test(value)) {
                      return "Theme name cannot start with a number";
                    }
                    if (/[A-Z]/.test(value)) {
                      return "No uppercase letters allowed in theme name";
                    }
                    if (value.indexOf(' ') !== -1) {
                      return "No spaces allowed in theme name";
                    }
                  }
                })
              }

              if (!commandRun.options.customThemeTemplate) {
                const options = [
                  { value: 'base', label: 'Vanilla Theme with Hearty Documentation' },
                  { value: 'polaris-flex', label: 'Minimalist Theme with Horizontal Nav' },
                  { value: 'polaris-sidebar', label: 'Content-Focused Theme with Flexible Sidebar' },
                ]

                commandRun.options.customThemeTemplate = await p.select({
                  message: 'Template:',
                  required: false,
                  options: options,
                  initialValue: options[0]
                })
              }
            }

            let themes = await HAXCMS.getThemes();

            if (themes && commandRun.options.theme) {
              if (themes[commandRun.options.theme]){
                activeHaxsite.manifest.metadata.theme = themes[commandRun.options.theme];
                activeHaxsite.manifest.save(false);
                recipe.log(siteLoggingName, commandString(commandRun));
              } else if (commandRun.options.theme === "custom-theme") {
                commandRun.options.name = activeHaxsite.name;
                commandRun.options.directory = activeHaxsite.directory;
                // temporary for proof of concept
                commandRun.options.npmClient = 'npm';

                await customSiteTheme(commandRun, {});
              } else if (!themes[commandRun.options.theme]){
                let themeObj = {
                  element: commandRun.options.theme,
                  path: "./custom/build/custom.es6.js",
                  name: dashToCamel(commandRun.options.theme),
                }
              
                activeHaxsite.manifest.metadata.theme = themeObj;
                activeHaxsite.manifest.save(false);
              } 
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
        break;
        case "site:element":
          try {
            const reservedNames = ["annotation-xml", "color-profile", "font-face", "font-face-src", "font-face-uri", "font-face-format", "font-face-name", "missing-glyph"];
            activeHaxsite = await systemStructureContext();

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
                path: activeHaxsite.directory,
                className: dashToCamel(commandRun.options.name),
                year: new Date().getFullYear(),
            }

            if(!project.author){
              try {
                 let value = await exec(`git config user.name`);
                 project.author = value.stdout.trim();
               }
               catch(e) {
                 log(`
                   git user name not configured. Run the following to do this:\n
                   git config --global user.name "namehere"\n
                   git config --global user.email "email@here`, 'debug');
               }
           }
            
            const filePath = `${project.path}/custom/src/${project.name}.js`
            await fs.copyFileSync(`${process.mainModule.path}/templates/generic/sitecomponent.js`, filePath)
  
          
            const ejsString = ejs.fileLoader(filePath, 'utf8');
            let content = ejs.render(ejsString, project);
            // file written successfully  
            fs.writeFileSync(filePath, content);
            
            if(!commandRun.options.npmClient){
              commandRun.options.npmClient = 'npm';
            }
            if(fs.existsSync(`${project.path}/custom/custom-elements.json`)){
              await exec(`cd custom && ${commandRun.options.npmClient} run analyze`)
            }
  
            p.note(`🧙  Add to another web component (.js): ${color.underline(color.bold(color.yellow(color.bgBlack(`import ./${project.name}.js`))))}`);
            // at least a second to see the message print at all
            await setTimeout(1000);
          } catch(e) {
            log(e.stderr)
            // Original ejs.render error checking
            console.error(color.red(process.cwd()));
            console.error(color.red(e));
          }  
        break;
        case "site:surge":
          let surgePrepared = false;
          try {
            // Clean up broken symlinks and fix legacy ignore files before publishing
            let cleaned = cleanupSiteForPublish(activeHaxsite.directory);
            let fixedIgnore = fixLegacyIgnoreFile(activeHaxsite.directory, '.surgeignore');
            if (cleaned.length > 0 && !commandRun.options.quiet) {
              log(`Removed ${cleaned.length} broken symlinks: ${cleaned.join(', ')}`, 'info');
            }
            if (fixedIgnore && !commandRun.options.quiet) {
              log(`Updated legacy .surgeignore to exclude node_modules/`, 'info');
            }
            // Prepare for static publish: swap ghpages.html in as index.html and clean local artifacts
            surgePrepared = prepareSiteForStaticPublish(activeHaxsite.directory);
            if (surgePrepared && !commandRun.options.quiet) {
              log(`Prepared site for static publish (ghpages.html → index.html, build removed)`, 'info');
            }
            // attempt to install; implies they asked to publish with surge but
            // system test did not see it globally
            if (!sysSurge) {
              let s = p.spinner();
              s.start(merlinSays('Installing Surge.sh globally so we can publish'));
              let execOutput = await exec(`npm install --global surge`);
              s.stop(merlinSays('surge.sh installed globally'));
              log(execOutput.stdout.trim());
              sysSurge = true;
            }
            let execOutput;
            if (commandRun.options.domain && commandRun.options.y) {
              let s = p.spinner();
              s.start(merlinSays('Sending site to Surge.sh ..'));
              execOutput = await exec(`cd ${activeHaxsite.directory} && surge . ${commandRun.options.domain}`);
              log(execOutput.stdout.trim());
              s.stop(merlinSays(`Site published: https://${commandRun.options.domain}`));
            }
            else {
              let surgeArgs = ['.'];
              // could get here bc of being interactive, yet passed in a domain...
              if (commandRun.options.domain) {
                surgeArgs.push(commandRun.options.domain);
              }
              execOutput = await interactiveExec('surge', surgeArgs, {cwd: activeHaxsite.directory});
              if (commandRun.options.domain) {
                log(merlinSays(`Site published: https://${commandRun.options.domain}`));
              } else {
                log(merlinSays('Site published'));
              }
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          finally {
            if (surgePrepared) {
              let restored = restoreSiteAfterStaticPublish(activeHaxsite.directory);
              if (restored && !commandRun.options.quiet) {
                log(`Restored original index.html after publish`, 'info');
              }
            }
          }
        break;
        case "site:netlify":
          let netlifyPrepared = false;
          try {
            // Clean up broken symlinks and fix legacy ignore files before publishing
            let cleaned = cleanupSiteForPublish(activeHaxsite.directory);
            let fixedIgnore = fixLegacyIgnoreFile(activeHaxsite.directory, '.netlifyignore');
            if (cleaned.length > 0 && !commandRun.options.quiet) {
              log(`Removed ${cleaned.length} broken symlinks: ${cleaned.join(', ')}`, 'info');
            }
            if (fixedIgnore && !commandRun.options.quiet) {
              log(`Updated legacy .netlifyignore to exclude node_modules/`, 'info');
            }
            // Prepare for static publish: swap ghpages.html in as index.html and clean local artifacts
            netlifyPrepared = prepareSiteForStaticPublish(activeHaxsite.directory);
            if (netlifyPrepared && !commandRun.options.quiet) {
              log(`Prepared site for static publish (ghpages.html → index.html, build removed)`, 'info');
            }
            // attempt to install; implies they asked to publish with netlify but
            // system test did not see it globally
            if (!sysNetlify) {
              let s = p.spinner();
              s.start(merlinSays('Installing Netlify CLI globally so we can publish'));
              let execOutput = await exec(`npm install --global netlify-cli`);
              s.stop(merlinSays('Netlify CLI installed globally'));
              log(execOutput.stdout.trim());
              sysNetlify = true;
            }
            let execOutput;
            if (commandRun.options.y) {
              let s = p.spinner();
              s.start(merlinSays('Deploying site to Netlify ..'));
              if (commandRun.options.domain) {
                // If specific site/domain is specified, deploy to existing site
                execOutput = await exec(`cd ${activeHaxsite.directory} && netlify deploy --prod --site ${commandRun.options.domain}`);
              } else {
                // Auto deploy - will create a new site or use existing site config
                execOutput = await exec(`cd ${activeHaxsite.directory} && netlify deploy --prod`);
              }
              log(execOutput.stdout.trim());
              s.stop(merlinSays(`Site deployed to Netlify`));
            }
            else {
              let netlifyArgs = ['deploy', '--prod'];
              if (commandRun.options.domain) {
                netlifyArgs.push('--site', commandRun.options.domain);
              }
              execOutput = await interactiveExec('netlify', netlifyArgs, {cwd: activeHaxsite.directory});
              log(merlinSays(`Site deployed to Netlify`));
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          finally {
            if (netlifyPrepared) {
              let restored = restoreSiteAfterStaticPublish(activeHaxsite.directory);
              if (restored && !commandRun.options.quiet) {
                log(`Restored original index.html after publish`, 'info');
              }
            }
          }
        break;
        case "site:vercel":
          let vercelPrepared = false;
          try {
            // Clean up broken symlinks and fix legacy ignore files before publishing
            let cleaned = cleanupSiteForPublish(activeHaxsite.directory);
            let fixedIgnore = fixLegacyIgnoreFile(activeHaxsite.directory, '.vercelignore');
            if (cleaned.length > 0 && !commandRun.options.quiet) {
              log(`Removed ${cleaned.length} broken symlinks: ${cleaned.join(', ')}`, 'info');
            }
            if (fixedIgnore && !commandRun.options.quiet) {
              log(`Updated legacy .vercelignore to exclude node_modules/`, 'info');
            }
            // Prepare for static publish: swap ghpages.html in as index.html and clean local artifacts
            vercelPrepared = prepareSiteForStaticPublish(activeHaxsite.directory);
            if (vercelPrepared && !commandRun.options.quiet) {
              log(`Prepared site for static publish (ghpages.html → index.html, build removed)`, 'info');
            }
            // attempt to install; implies they asked to publish with vercel but
            // system test did not see it globally
            if (!sysVercel) {
              let s = p.spinner();
              s.start(merlinSays('Installing Vercel CLI globally so we can publish'));
              let execOutput = await exec(`npm install --global vercel`);
              s.stop(merlinSays('Vercel CLI installed globally'));
              log(execOutput.stdout.trim());
              sysVercel = true;
            }
            let execOutput;
            if (commandRun.options.y) {
              let s = p.spinner();
              s.start(merlinSays('Deploying site to Vercel ..'));
              if (commandRun.options.domain) {
                // Deploy with specific domain/project name
                execOutput = await exec(`cd ${activeHaxsite.directory} && vercel --prod --name ${commandRun.options.domain}`);
              } else {
                // Auto deploy with default settings
                execOutput = await exec(`cd ${activeHaxsite.directory} && vercel --prod`);
              }
              log(execOutput.stdout.trim());
              s.stop(merlinSays(`Site deployed to Vercel`));
            }
            else {
              let vercelArgs = ['--prod'];
              if (commandRun.options.domain) {
                vercelArgs.push('--name', commandRun.options.domain);
              }
              execOutput = await interactiveExec('vercel', vercelArgs, {cwd: activeHaxsite.directory});
              log(merlinSays(`Site deployed to Vercel`));
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          finally {
            if (vercelPrepared) {
              let restored = restoreSiteAfterStaticPublish(activeHaxsite.directory);
              if (restored && !commandRun.options.quiet) {
                log(`Restored original index.html after publish`, 'info');
              }
            }
          }
        break;
        case "setup:github-actions":
          try {
            let s = p.spinner();
            s.start(merlinSays('Setting up GitHub Actions deployment workflow'));
            
            // Create .github/workflows directory
            const workflowDir = path.join(activeHaxsite.directory, '.github', 'workflows');
            if (!fs.existsSync(workflowDir)) {
              fs.mkdirSync(workflowDir, { recursive: true });
            }
            
            // Copy the workflow file
            const workflowFile = path.join(workflowDir, 'deploy.yml');
            if (fs.existsSync(workflowFile) && !commandRun.options.y) {
              s.stop(merlinSays('GitHub Actions workflow already exists'));
              let overwrite = await p.confirm({ 
                message: 'GitHub Actions workflow file already exists. Overwrite?',
                initialValue: false
              });
              if (!overwrite) {
                log('Skipped GitHub Actions setup');
                break;
              }
            }
            
            await fs.copyFileSync(
              path.join(process.mainModule.path, 'templates/sitedotfiles/_github_workflows_deploy.yml'),
              workflowFile
            );
            
            s.stop(merlinSays('GitHub Actions workflow created successfully'));
            if (!commandRun.options.quiet) {
              p.note(`🚀 GitHub Actions workflow has been set up!\n\nNext steps:\n1. Push your changes: ${color.bold('git add . && git commit -m "Add GitHub Actions workflow" && git push')}\n2. Enable GitHub Pages in your repository settings\n3. Select "GitHub Actions" as the source\n4. Your site will automatically deploy on every push to main/master`);
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
        break;
        case "setup:gitlab-ci":
          try {
            let s = p.spinner();
            s.start(merlinSays('Setting up GitLab CI deployment pipeline'));
            
            // Copy the GitLab CI file
            const ciFile = path.join(activeHaxsite.directory, '.gitlab-ci.yml');
            if (fs.existsSync(ciFile) && !commandRun.options.y) {
              s.stop(merlinSays('GitLab CI file already exists'));
              let overwrite = await p.confirm({ 
                message: '.gitlab-ci.yml already exists. Overwrite?',
                initialValue: false
              });
              if (!overwrite) {
                log('Skipped GitLab CI setup');
                break;
              }
            }
            
            await fs.copyFileSync(
              path.join(process.mainModule.path, 'templates/sitedotfiles/_gitlab-ci.yml'),
              ciFile
            );
            
            s.stop(merlinSays('GitLab CI pipeline created successfully'));
            if (!commandRun.options.quiet) {
              p.note(`🚀 GitLab CI pipeline has been set up!\n\nNext steps:\n1. Push your changes: ${color.bold('git add . && git commit -m "Add GitLab CI pipeline" && git push')}\n2. GitLab Pages will be automatically enabled\n3. Your site will deploy on every push to main/master\n4. Access your site at: ${color.cyan('https://yourusername.gitlab.io/yourproject')}`);
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
        break;
        case "site:file-list":
        case "site:list-files":
        let res = await invokeRoute(
          allRoutesLib.allRoutes.site.map.get['v1/files'],
          {},
          {
            siteName: activeHaxsite.name,
            filename: commandRun.options.filename,
            user_token: "fakeToken",
            site_token: "fakeToken"
          }
        );
          logStructuredOutput(commandRun, res.data);
          break;
        case "site:search":
          try {
            if (!commandRun.options.search) {
              commandRun.options.search = await p.text({
                message: 'Search query (text search across site fields)',
                placeholder: 'lesson',
                validate: (value) => {
                  if (!value) {
                    return 'Search query is required';
                  }
                  if (value.length > 256) {
                    return 'Search query is too long (max 256 characters)';
                  }
                }
              });
            }
            // v1 search contract (GET /v1/search) requires `q` and supports
            // `fields` (CSV of: title,slug,description,tags,content,id,location),
            // `sort`, and `page.limit`/`page.offset` pagination. The legacy v0
            // params (searchCaseSensitive, searchSelector, searchMode) have no
            // v1 equivalent: v1 search is always case-insensitive and only does
            // text matching across fields (no selector/DOM-query mode). The
            // --search-selector / --search-mode CLI flags are kept to avoid a
            // breaking interface change but are intentionally not forwarded.
            let searchRouteParams = {
              siteName: activeHaxsite.name,
              q: commandRun.options.search,
              user_token: "fakeToken",
              site_token: "fakeToken"
            };
            if (commandRun.options.searchField) {
              searchRouteParams.fields = commandRun.options.searchField;
            }
            if (commandRun.options.searchLimit) {
              searchRouteParams['page.limit'] = commandRun.options.searchLimit;
            }
            let searchRes = await invokeRoute(
              allRoutesLib.allRoutes.site.map.get['v1/search'],
              {},
              searchRouteParams
            );
            logStructuredOutput(commandRun, searchRes.data);
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          break;
        case "site:tags":
          try {
            let res = await invokeRoute(
              allRoutesLib.allRoutes.site.map.get['v1/tags'],
              {},
              {
                siteName: activeHaxsite.name,
                user_token: "fakeToken",
                site_token: "fakeToken"
              }
            );
            logStructuredOutput(commandRun, res.data);
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          break;
        case "site:blocks":
          try {
            let res = await invokeRoute(
              allRoutesLib.allRoutes.site.map.get['v1/blocks'],
              {},
              {
                siteName: activeHaxsite.name,
                user_token: "fakeToken",
                site_token: "fakeToken"
              }
            );
            logStructuredOutput(commandRun, res.data);
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          break;
        case "site:analytics":
          try {
            let res = await invokeRoute(
              allRoutesLib.allRoutes.site.map.get['v1/analytics'],
              {},
              {
                siteName: activeHaxsite.name,
                user_token: "fakeToken",
                site_token: "fakeToken"
              }
            );
            logStructuredOutput(commandRun, res.data);
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          break;
        case "site:revisions":
          try {
            if (!commandRun.options.itemId) {
              commandRun.options.itemId = await p.select({
                message: `Select an item to view revisions`,
                required: true,
                options: [ {value: null, label: "-- exit --" }, ...await siteItemsOptionsList(activeHaxsite)],
              });
            }
            if (commandRun.options.itemId) {
              const cliBridge = await getHaxcmsNodejsCli();
              if (commandRun.options.restore) {
                let revisionId = commandRun.options.revisionId;
                if (!revisionId && !commandRun.options.y) {
                  revisionId = await p.text({
                    message: 'Revision ID to restore',
                    placeholder: 'abc1234',
                    validate: (value) => {
                      if (!value) return 'Revision ID is required';
                    }
                  });
                }
                if (revisionId) {
                  let del = true;
                  if (!commandRun.options.y) {
                    del = await p.confirm({
                      message: `Are you sure you want to restore revision ${revisionId} for item ${commandRun.options.itemId}?`,
                      initialValue: true,
                    });
                  }
                  if (del) {
                    let resp = await cliBridge.cliBridge(`v1/items/${commandRun.options.itemId}/revisions/${revisionId}/restore`, {
                      site: { name: activeHaxsite.name }
                    }, 'post');
                    logStructuredOutput(commandRun, resp.res.data);
                    recipe.log(siteLoggingName, commandString(commandRun));
                  }
                } else {
                  log('Revision ID is required for restore', 'error');
                }
              } else {
                let resp = await cliBridge.cliBridge(`v1/items/${commandRun.options.itemId}/revisions`, {
                  site: { name: activeHaxsite.name }
                }, 'get');
                logStructuredOutput(commandRun, resp.res.data);
              }
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          break;
        case "site:export":
          try {
            let exportFormat = commandRun.options.exportFormat || commandRun.options.format;
            const validExportFormats = ['pdf', 'docx', 'epub', 'html', 'zip', 'markdown', 'skeleton'];
            if (!exportFormat || !validExportFormats.includes(exportFormat)) {
              if (!commandRun.options.y) {
                exportFormat = await p.select({
                  message: 'Export format',
                  options: [
                    { value: 'pdf', label: 'PDF' },
                    { value: 'docx', label: 'DOCX' },
                    { value: 'epub', label: 'EPUB' },
                    { value: 'html', label: 'HTML' },
                    { value: 'zip', label: 'ZIP' },
                    { value: 'markdown', label: 'Markdown' },
                    { value: 'skeleton', label: 'Skeleton' },
                  ],
                });
              } else {
                log('Export format is required (pdf, docx, epub, html, zip, markdown, skeleton)', 'error');
                break;
              }
            }
            if (exportFormat) {
              const cliBridge = await getHaxcmsNodejsCli();
              let resp = await cliBridge.cliBridge(`v1/site/export/${exportFormat}`, {
                site: { name: activeHaxsite.name }
              }, 'get');
              if (resp.res.statusCode >= 400) {
                log(`Export failed: ${typeof resp.res.data === 'string' ? resp.res.data : JSON.stringify(resp.res.data)}`, 'error');
                break;
              }
              // pdf/docx/epub return a binary buffer; html returns the full
              // HTML document as a string. Both are file downloads the CLI
              // writes directly to disk. zip/markdown/skeleton return a JSON
              // export descriptor (data.export.href points at the real
              // download) rather than the archive/markdown itself — printed
              // below so the caller can follow the href.
              const downloadFormats = ['pdf', 'docx', 'epub', 'html'];
              if (downloadFormats.includes(exportFormat) && resp.res.data) {
                let targetFile = commandRun.options.toFile;
                if (!targetFile) {
                  targetFile = `${activeHaxsite.name}.${exportFormat}`;
                }
                targetFile = path.resolve(targetFile);
                fs.writeFileSync(targetFile, resp.res.data);
                if (!commandRun.options.quiet) {
                  p.outro(`${color.green('✓')} Exported to ${targetFile}`);
                }
                recipe.log(siteLoggingName, commandString(commandRun));
              } else {
                // zip/markdown/skeleton: the v1 backend returns a JSON export
                // descriptor (follow data.export.href for the actual file),
                // not the archive/markdown itself.
                if (!commandRun.options.quiet) {
                  log(`${exportFormat} export returned a JSON descriptor (follow data.export.href for the actual file):`);
                }
                logStructuredOutput(commandRun, resp.res.data);
                if (commandRun.options.toFile) {
                  fs.writeFileSync(commandRun.options.toFile, formatStructuredOutput(commandRun, resp.res.data));
                }
              }
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          break;
        case "site:files-upload":
          try {
            if (!commandRun.options.source) {
              commandRun.options.source = await p.text({
                message: 'Source file or directory to upload',
                placeholder: './assets/image.png',
                validate: (value) => {
                  if (!value) return 'Source path is required';
                  if (!fs.existsSync(value)) return 'Source path does not exist';
                }
              });
            }
            if (commandRun.options.source && fs.existsSync(commandRun.options.source)) {
              const stats = fs.statSync(commandRun.options.source);
              const cliBridge = await getHaxcmsNodejsCli();
              if (stats.isDirectory()) {
                let files = fs.readdirSync(commandRun.options.source);
                let uploaded = 0;
                for (let file of files) {
                  let filePath = path.join(commandRun.options.source, file);
                  let fileStats = fs.statSync(filePath);
                  if (fileStats.isFile()) {
                    let tmpFile = path.join(os.tmpdir(), `hax-cli-upload-${Date.now()}-${Math.floor(Math.random() * 1000000)}-${file}`);
                    fs.copyFileSync(filePath, tmpFile);
                    let fileObj = {
                      path: tmpFile,
                      originalname: file,
                      name: file,
                      size: fileStats.size
                    };
                    let resp = await cliBridge.cliBridge('v1/files', {
                      site: { name: activeHaxsite.name }
                    }, 'post', fileObj);
                    try { fs.unlinkSync(tmpFile); } catch (e) {}
                    if (resp.res.data && resp.res.data.status === 200) {
                      uploaded++;
                    }
                  }
                }
                if (!commandRun.options.quiet) {
                  p.outro(`${color.green('✓')} Uploaded ${uploaded} files`);
                }
                recipe.log(siteLoggingName, commandString(commandRun));
              } else {
                let tmpFile = path.join(os.tmpdir(), `hax-cli-upload-${Date.now()}-${Math.floor(Math.random() * 1000000)}-${path.basename(commandRun.options.source)}`);
                fs.copyFileSync(commandRun.options.source, tmpFile);
                let fileObj = {
                  path: tmpFile,
                  originalname: path.basename(commandRun.options.source),
                  name: path.basename(commandRun.options.source),
                  size: stats.size
                };
                let resp = await cliBridge.cliBridge('v1/files', {
                  site: { name: activeHaxsite.name }
                }, 'post', fileObj);
                try { fs.unlinkSync(tmpFile); } catch (e) {}
                logStructuredOutput(commandRun, resp.res.data);
                recipe.log(siteLoggingName, commandString(commandRun));
              }
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          break;
        case "site:files-delete":
          try {
            let fileUuid = commandRun.options.fileUuid;
            if (!fileUuid) {
              if (!commandRun.options.y) {
                fileUuid = await p.text({
                  message: 'File UUID to delete',
                  placeholder: 'abc12345-...',
                  validate: (value) => {
                    if (!value) return 'File UUID is required';
                  }
                });
              } else {
                log('File UUID is required for files-delete', 'error');
                break;
              }
            }
            if (fileUuid) {
              let del = true;
              if (!commandRun.options.y) {
                del = await p.confirm({
                  message: `Are you sure you want to delete file ${fileUuid}? (This cannot be undone)`,
                  initialValue: true,
                });
              }
              if (del) {
                const cliBridge = await getHaxcmsNodejsCli();
                let resp = await cliBridge.cliBridge(`v1/files/${fileUuid}`, {
                  site: { name: activeHaxsite.name }
                }, 'delete');
                logStructuredOutput(commandRun, resp.res.data);
                recipe.log(siteLoggingName, commandString(commandRun));
              }
            }
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          break;
        case "site:search-replace":
          try {
            if (!commandRun.options.search) {
              commandRun.options.search = await p.text({
                message: 'Search text to replace',
                placeholder: 'old text',
                validate: (value) => {
                  if (!value) return 'Search text is required';
                  if (value.length <= 1) return 'Search text must be more than 1 character';
                }
              });
            }
            if (!commandRun.options.replace && commandRun.options.replace !== '') {
              commandRun.options.replace = await p.text({
                message: 'Replacement text',
                placeholder: 'new text',
                initialValue: '',
              });
            }
            let replaceBody = {
              site: { name: activeHaxsite.name },
              operation: 'replace',
              search: commandRun.options.search,
              replace: commandRun.options.replace,
              searchCaseSensitive: !!commandRun.options.searchCaseSensitive,
            };
            if (commandRun.options.replace === '') {
              if (commandRun.options.y || commandRun.options.destroyConfirm) {
                replaceBody.replaceDestroyConfirm = true;
              } else {
                let destroyConfirm = await p.confirm({
                  message: 'You are about to remove matched text. Confirm?',
                  initialValue: false,
                });
                if (!destroyConfirm) {
                  log('Operation cancelled');
                  break;
                }
                replaceBody.replaceDestroyConfirm = true;
              }
            }
            if (commandRun.options.y || commandRun.options.confirm) {
              replaceBody.replaceConfirm = true;
            } else {
              let confirm = await p.confirm({
                message: `Replace all occurrences of "${commandRun.options.search}" with "${commandRun.options.replace}"?`,
                initialValue: true,
              });
              if (!confirm) {
                log('Operation cancelled');
                break;
              }
              replaceBody.replaceConfirm = true;
            }
            const cliBridge = await getHaxcmsNodejsCli();
            let resp = await cliBridge.cliBridge('v1/content', replaceBody, 'patch');
            logStructuredOutput(commandRun, resp.res.data);
            recipe.log(siteLoggingName, commandString(commandRun));
          }
          catch(e) {
            log(formatErrorForLogging(e), 'error');
          }
          break;
        case "site:html":
        case "site:md":
        case "site:schema":
          let siteContent = '';
          activeHaxsite = await systemStructureContext();
          let items = [];
          if (commandRun.options.itemId != null) {
            items = activeHaxsite.manifest.findBranch(commandRun.options.itemId);
          }
          else {
            items = activeHaxsite.manifest.orderTree(activeHaxsite.manifest.items);
          }
          if (operation.action === 'site:schema') {
            let els = [];
            for (var i in items) {
              let page = activeHaxsite.loadNode(items[i].id);
              let html = await activeHaxsite.getPageContent(page);
              let dom = parse(`<div id="fullpage">${html}</div>`);
              els.push({
                tag: "h1",
                properties: {
                  "data-jos-item-id": items[i].id
                },
                content: `${items[i].title}`
              });
              for (var j in dom.querySelector('#fullpage').childNodes) {
                let node = dom.querySelector('#fullpage').childNodes[j];
                if (node && node.getAttribute) {
                  els.push(await nodeToHaxElement(node, null));
                }
              }
            }
            // simple redirecting to file
            if (commandRun.options.toFile) {
              if (commandRun.options.format === 'yaml') {
                fs.writeFileSync(commandRun.options.toFile, dump(els))
              }
              else {
                fs.writeFileSync(commandRun.options.toFile, JSON.stringify(els, null, 2))
              }
            }
            else {
              logStructuredOutput(commandRun, els);
            }
          }
          else {
            for (var i in items) {
              let page = activeHaxsite.loadNode(items[i].id); 
              siteContent += `<h1>${items[i].title}</h1>\n\r`;
              siteContent += `<div data-jos-item-id="${items[i].id}">\n\r${await activeHaxsite.getPageContent(page)}\n\r</div>\n\r`;
            }
            if (operation.action === 'site:md') {
              // Security (Stream-A): on-prem haxcms-nodejs handler in-process
              // (replaces @haxtheweb/open-apis broker); result at .data.data.contents.
              let resp = await invokeRoute(allRoutesLib.allRoutes.system.map.post['actions/html-to-md'], { html: siteContent });
              let mdContent = resp && resp.data && resp.data.data ? resp.data.data.contents : '';
              if (commandRun.options.toFile) {
                fs.writeFileSync(commandRun.options.toFile, mdContent);
                if (!commandRun.options.quiet) {
                  log(`${commandRun.options.toFile} written`);
                }
              }
              else {
                log(mdContent);
              }
            }
            else {
              if (commandRun.options.toFile) {
                fs.writeFileSync(commandRun.options.toFile, siteContent);
                if (!commandRun.options.quiet) {
                  log(`${commandRun.options.toFile} written`);
                }
              }
              else {
                log(siteContent);
              }
            }
          }
        break;
        // @todo need to make these work..
        case "recipe:read":
          // just print the recipe out
          if (fs.existsSync(path.join(process.cwd(), `${siteRecipeFile}`))) {
            let recContents = await fs.readFileSync(path.join(process.cwd(), `${siteRecipeFile}`),'utf8');
            console.log(recContents);
          }
        break;
        case "recipe:play":
          // step through and run each recipe once fed a file location
          // this allows for storing commands from a site and then replaying them with ease
          if (!commandRun.options.recipe) {
            commandRun.options.recipe = await p.text({
              message: `Select recipe:`,
              defaultValue: process.cwd(),
              initialValue: process.cwd(),
              validate: (val) => {
                if (!val.endsWith('.recipe')) {
                  return 'HAX Recipe files must end in .recipe';
                }
              }
            });
          }
          if (fs.existsSync(commandRun.options.recipe)) {
            // Security (L-1): canonicalize + reject null bytes for the recipe path.
            let recContents = await fs.readFileSync(resolveLocalPath(commandRun.options.recipe),'utf8');
            // split into commands
            let commandList = recContents.replaceAll('cli: ', '').split("\n");
            // Security (H-4): rootDir is now an argv array (was a shell string).
            let rootDirTokens = [];
            // confirm each command or allow --y so that it auto applies
            for (var i in commandList) {
              // verify every command starts this way for safety
              if (commandList[i].startsWith('hax site')) {
                let confirmation;
                if (commandRun.options.y) {
                  confirmation = true;
                }
                else {
                  confirmation = await p.confirm({
                    message: `Do you want to run ${commandList[i]}? (This cannot be undone)`,
                    initialValue: true,
                  });
                }
                // confirmed; let's run!
                if (confirmation) {
                  // Security (H-4): tokenize and invoke via spawn() (no shell)
                  // so recipe contents cannot inject shell commands. Drop the
                  // leading "hax" token; the rest is argv to the CLI.
                  let tokens = commandList[i].split(' ').filter((t) => t.length > 0).slice(1);
                  let commandMatch = siteActions().filter((action) => action.value === tokens[1]);
                  // if we found a command that means it is a valid command to run against the site
                  if (commandMatch.length > 0) {
                    guardRecipeTokens([...tokens, ...rootDirTokens]);
                    await runCliNoShell([...tokens, '--y', '--no-i', '--auto', '--quiet', ...rootDirTokens]);
                  }
                  // 1st command won't match as the argument creates a new site
                  // but ensure we don't have a site context prior to running this
                  // or we'll get a site in a site with the same name which is not
                  // the desired result
                  else if (!await systemStructureContext()) {
                    guardRecipeTokens(tokens);
                    await runCliNoShell([...tokens, '--y', '--no-i', '--auto', '--quiet', '--no-extras']);
                    // site will have been created, obtain the site name and set root so
                    // the other commands get piped into it correctly
                    rootDirTokens = ['--root', tokens[1]];
                  }
                  else {
                    log('Did not run because we already have a site', 'warn');
                  }
                }
              }
            }
          }
        break;
        case "issue:general":
          // open the issues
          p.intro(`${color.bgBlue(color.white(` Submit issue / suggestion on Github `))}`);
          p.intro(`${color.bgBlue(color.white(` Opening in browser `))}`);
          await open("https://github.com/haxtheweb/issues/issues/new");
          p.outro(`${color.bgBlue(color.white(` https://github.com/haxtheweb/issues/issues/new `))}`);
        break;
        case "issue:theme":
          // open the issues
          p.intro(`${color.bgBlue(color.white(` Submit custom theme on Github `))}`);
          p.intro(`${color.bgBlue(color.white(` Opening in browser `))}`);
          let allContents= '';
          fs.readdir(`${activeHaxsite.directory}/custom/src`, (err, files) => {
            if (err) {
              console.error('Error reading directory:', err);
              return;
            }
            files.forEach((file, index) => {
              const filePath = path.join(`${activeHaxsite.directory}/custom/src`, file);

              if (fs.lstatSync(filePath).isFile()) {
                const content = fs.readFileSync(filePath, 'utf-8');
                // append file name as a JS comment
                allContents += `\n// FILENAME: ${file}\n` + content + '\n'; // Add newline between files if desired
              }

              if (index === files.length - 1) {
                console.log('Combined contents of all files:\n', allContents);
              }
            });
          });
          console.log(allContents);
          await open(`https://github.com/haxtheweb/issues/issues/new?template=new-design.md`);
          p.outro(`${color.bgBlue(color.white(` Copy the output of the console into the issue's js template area `))}`);
          p.outro(`${color.bgBlue(color.white(` https://github.com/haxtheweb/issues/issues/new?template=new-design.md `))}`);            
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
    if (!commandRun.options.quiet) {
      communityStatement();
    }
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

// Security (Stream-A): openApiBroker() removed — the deprecated
// @haxtheweb/open-apis broker (dynamic-importing handlers from that package's
// dist/) was replaced by in-process invokeRoute() calls against haxcms-nodejs
// route handlers (see IMPORT_STRUCTURE_MAP above and the string-converter
// migrations). No cloud (open-apis.hax.cloud) URLs are referenced.

function applyImportedSiteMetadata(siteRequest, importedSiteData) {
  if (!siteRequest || !siteRequest.site) {
    return;
  }
  if (!importedSiteData || typeof importedSiteData !== 'object') {
    return;
  }
  if (typeof importedSiteData.license === 'string') {
    const license = importedSiteData.license.trim();
    if (license !== '') {
      siteRequest.site.license = license;
    }
  }
}

function isObjectLike(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSkeletonMachineName(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return HAXCMS.generateMachineName(value)
    .replace(/\.json$/i, '')
    .trim()
    .toLowerCase();
}

function resolveAbsolutePath(pathValue) {
  if (!pathValue || typeof pathValue !== 'string') {
    return '';
  }
  if (path.isAbsolute(pathValue)) {
    return pathValue;
  }
  return path.join(process.cwd(), pathValue);
}

function extractSkeletonPayload(rawData) {
  let skeleton = rawData;
  if (
    isObjectLike(rawData) &&
    isObjectLike(rawData.data) &&
    isObjectLike(rawData.data.skeleton)
  ) {
    skeleton = rawData.data.skeleton;
  }
  if (!isObjectLike(skeleton)) {
    throw new Error('Invalid skeleton JSON structure');
  }
  if (!isObjectLike(skeleton.meta)) {
    skeleton.meta = {};
  }
  if (!isObjectLike(skeleton.site)) {
    skeleton.site = {};
  }
  if (!isObjectLike(skeleton.build)) {
    skeleton.build = {};
  }
  if (!Array.isArray(skeleton.build.items)) {
    skeleton.build.items = [];
  }
  if (
    typeof skeleton.build.files === 'undefined' ||
    skeleton.build.files === null
  ) {
    skeleton.build.files = [];
  }
  if (!skeleton.build.structure) {
    skeleton.build.structure = 'from-skeleton';
  }
  if (!skeleton.build.type) {
    skeleton.build.type = 'skeleton';
  }
  const machineName = normalizeSkeletonMachineName(
    skeleton.meta.machineName
      ? skeleton.meta.machineName
      : skeleton.meta.name
        ? skeleton.meta.name
        : 'site-template'
  );
  skeleton.meta.machineName = machineName;
  skeleton.meta.name = machineName;
  return {
    skeleton,
    machineName,
  };
}

function loadSkeletonFileData(skeletonFilePath) {
  const absolutePath = resolveAbsolutePath(skeletonFilePath);
  if (!absolutePath) {
    throw new Error('Skeleton file path is required');
  }
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Skeleton file does not exist: ${absolutePath}`);
  }
  if (!fs.lstatSync(absolutePath).isFile()) {
    throw new Error(`Skeleton file path is not a file: ${absolutePath}`);
  }
  const rawContents = fs.readFileSync(absolutePath, 'utf8');
  const parsed = JSON.parse(rawContents);
  const normalized = extractSkeletonPayload(parsed);
  return {
    ...normalized,
    absolutePath,
  };
}

function installSkeletonFile(skeletonFilePath, machineNameOverride = null) {
  const loadedSkeleton = loadSkeletonFileData(skeletonFilePath);
  const skeleton = loadedSkeleton.skeleton;
  const overrideName = normalizeSkeletonMachineName(machineNameOverride);
  const machineName = overrideName || loadedSkeleton.machineName;
  if (!machineName) {
    throw new Error('Skeleton machine name could not be resolved');
  }
  skeleton.meta.machineName = machineName;
  skeleton.meta.name = machineName;
  const skeletonTargetDirectory = path.join(
    HAXCMS.configDirectory,
    'user',
    'skeletons'
  );
  if (!fs.existsSync(skeletonTargetDirectory)) {
    fs.mkdirSync(skeletonTargetDirectory, { recursive: true });
  }
  const installPath = path.join(skeletonTargetDirectory, `${machineName}.json`);
  fs.writeFileSync(installPath, `${JSON.stringify(skeleton, null, 2)}\n`);
  return {
    machineName,
    installPath,
  };
}
// process site creation
export async function siteProcess(commandRun, project, port = '3000') {    // auto select operations to perform if requested
  // Security (M-2): defense-in-depth re-check of --npm-client at the point it
  // is interpolated into exec() shell strings. create.js validates earlier,
  // but the site/webcomponent subcommand option paths can bypass that check.
  if (commandRun.options.npmClient) {
    commandRun.options.npmClient = validateNpmClient(commandRun.options.npmClient);
  }
  var s = p.spinner();
  // if we have no extras, or they are empty then set for launch
  if (!project.extras) {
    project.extras = [];
    if (commandRun.options.i) {
      project.extras = ['launch'];
    }
  }
  let siteRequest = {
      "site": {
          "name": project.name,
          "description": "own course",
          "theme": commandRun.options.theme ? commandRun.options.theme : (project.theme ? project.theme : "clean-one") 
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
  let skeletonFilePath = commandRun.options.skeletonFile
    ? commandRun.options.skeletonFile
    : project.skeletonFile
      ? project.skeletonFile
      : null;
  let skeletonMachineName = commandRun.options.skeletonMachineName
    ? commandRun.options.skeletonMachineName
    : project.skeletonMachineName
      ? project.skeletonMachineName
      : null;
  if (skeletonFilePath && skeletonMachineName) {
    throw new Error('You can only pass one skeleton source when creating a site (--skeleton-file or --skeleton-machine-name)');
  }
  if ((skeletonFilePath || skeletonMachineName) && commandRun.options.importSite) {
    throw new Error('Skeleton template creation cannot be combined with --import-site');
  }
  if (skeletonFilePath || skeletonMachineName) {
    siteRequest.build.structure = 'from-skeleton';
    siteRequest.build.type = 'skeleton';
    siteRequest.build.items = [];
    siteRequest.build.files = [];
    if (skeletonMachineName) {
      const normalizedMachineName = normalizeSkeletonMachineName(skeletonMachineName);
      if (!normalizedMachineName) {
        throw new Error('Invalid skeleton machine name supplied');
      }
      siteRequest.build.skeletonMachineName = normalizedMachineName;
    }
    else if (skeletonFilePath) {
      const skeletonFileData = loadSkeletonFileData(skeletonFilePath);
      const skeleton = skeletonFileData.skeleton;
      siteRequest.build.structure = skeleton.build.structure;
      siteRequest.build.type = skeleton.build.type;
      siteRequest.build.items = skeleton.build.items;
      siteRequest.build.files = skeleton.build.files;
      if (
        isObjectLike(skeleton.site) &&
        typeof skeleton.site.theme === 'string' &&
        skeleton.site.theme !== ''
      ) {
        siteRequest.site.theme = skeleton.site.theme;
      }
      if (
        isObjectLike(skeleton.site) &&
        typeof skeleton.site.description === 'string' &&
        skeleton.site.description !== ''
      ) {
        siteRequest.site.description = skeleton.site.description;
      }
      applyImportedSiteMetadata(siteRequest, skeleton.site);
    }
  }
  // allow for importSite option
  if (commandRun.options.importSite) {
    if (!commandRun.options.importStructure) {
      // assume hax to hax if it's not defined
      commandRun.options.importStructure = 'haxcmsToSite';
    }
    // Security (Stream-A): verify this is a valid import structure and route
    // it in-process to the on-prem haxcms-nodejs handler (replaces the
    // @haxtheweb/open-apis broker + MicroFrontendRegistry lookup). Platform
    // converters go through the site/import/:platform dispatcher; docx/xlsx
    // use their own actions routes.
    const importConfig = IMPORT_STRUCTURE_MAP[commandRun.options.importStructure];
    if (commandRun.options.importStructure && importConfig) {
      let resp;
      if (importConfig.platform) {
        resp = await invokeRoute(
          allRoutesLib.allRoutes.system.map.post['site/import/:platform'],
          { repoUrl: commandRun.options.importSite },
          {},
          { platform: importConfig.platform }
        );
      } else {
        resp = await invokeRoute(
          allRoutesLib.allRoutes.system.map.post[importConfig.routeKey],
          { repoUrl: commandRun.options.importSite }
        );
      }
      const importedData = resp && resp.data && resp.data.data ? resp.data.data : null;
      if (importedData && importedData.items) {
        siteRequest.build.structure = 'import';
        siteRequest.build.items = importedData.items;
      }
      if (importedData && importedData.files) {
        siteRequest.build.files = importedData.files;
      }
      if (importedData && importedData.siteFiles) {
        siteRequest.build.siteFiles = importedData.siteFiles;
      }
      if (importedData && importedData.site) {
        applyImportedSiteMetadata(siteRequest, importedData.site);
      }
    }
    // hidden import methodologies
    else if (commandRun.options.importStructure) {
      if (commandRun.options.importStructure === 'drupal7-book-print-html') {
        // Security (H-2): fetch the import source through safeFetch so SSRF
        // targets (loopback/private/metadata) are rejected before the request.
        let siteContent = '';
        try {
          const resp = await safeFetch(commandRun.options.importSite);
          siteContent = resp.ok ? await resp.text() : '';
        } catch (e) {
          if (isSSRFError(e)) {
            log(`Import URL rejected as SSRF target: ${commandRun.options.importSite} (${e.message})`, 'error');
          } else {
            log(formatErrorForLogging(e), 'error');
          }
        }
        if (siteContent) {
          // @todo refactor to support 9 levels of hierarchy as this is technically what Drupal supports
          let dom = parse(siteContent);
          // pull all of level 1 of hierarchy
          let depth;
          let order = 0;
          let parent = null;
          let items = [];
          for (let branch1 of dom.querySelectorAll('.section-2')) {
            parent = null;
            depth = 0;
            let itemID = branch1.getAttribute('id');
            let item = {
              id: itemID,
              order: order,
              indent: depth,
              title: branch1.querySelector('h1').innerText,
              slug: itemID.replace('-','/'),
              // Security (H-5): sanitize scraped Drupal7 body HTML before storing.
              contents: sanitizeIfString(branch1.querySelector(`.field.field-name-body .field-item`).innerHTML),
              parent: parent,
            };
            items.push(item);
            order++;
            depth = 1;
            let parent2 = itemID;
            let order2 = 0;
            for (let branch2 of branch1.querySelectorAll('.section-3')) {
              itemID = branch2.getAttribute('id');
              let item = {
                id: itemID,
                order: order2,
                indent: depth,
                title: branch2.querySelector('h1').innerText,
                slug: itemID.replace('-','/'),
                // Security (H-5): sanitize scraped Drupal7 body HTML before storing.
                contents: sanitizeIfString(branch2.querySelector(`.field.field-name-body .field-item`).innerHTML),
                parent: parent2,
              };
              items.push(item);
              order2++;
              depth = 2;
              let parent3 = itemID;
              let order3 = 0;
              for (let branch3 of branch2.querySelectorAll('.section-4')) {
                itemID = branch3.getAttribute('id');
                let item = {
                  id: itemID,
                  order: order3,
                  indent: depth,
                  title: branch3.querySelector('h1').innerText,
                  slug: itemID.replace('-','/'),
                  // Security (H-5): sanitize scraped Drupal7 body HTML before storing.
                  contents: sanitizeIfString(branch3.querySelector(`.field.field-name-body .field-item`).innerHTML),
                  parent: parent3,
                };
                items.push(item);
                order3++;
              }
            }
            // obtain all images on the system to bring along with additional spider request
            let location = new URL(commandRun.options.importSite).origin;
            var files = {};
            for (let image of dom.querySelectorAll("img[src^='/']")) {
              const imgSrc = image.getAttribute('src');
              if (imgSrc && !imgSrc.startsWith('//')) {
                // Security (H-3): validate each remote-controlled image URL
                // before recording it for download; reject SSRF targets.
                const imgUrl = `${location}${imgSrc}`;
                try {
                  await assertUrlNotSSRF(imgUrl);
                  files[imgSrc] = imgUrl;
                } catch (e) {
                  if (!commandRun.options.quiet) {
                    log(`Skipping image URL (SSRF-guarded): ${imgUrl}`, 'warn');
                  }
                }
              }
            }
            siteRequest.build.files = files;
          }
          siteRequest.build.structure = 'import';
          siteRequest.build.items = items;
        }
      }
    }
  }
  HAXCMS.cliWritePath = `${project.path}`;
  ensureTwigConstantFunction();
    let res = await invokeRoute(
      allRoutesLib.allRoutes.system.map.post['sites'],
      siteRequest,
      {
        user_token: "fakeToken",
        site_token: "fakeToken"
      }
    );
  // so we run it and then clear the screen
  // this is a bit of a hack but it works to give the user the feedback that the site was
  // created successfully, but only if not in quiet mode (default)
  if (!commandRun.options.quiet) {
    process.stdout.write('\x1Bc');
    s.start(merlinSays(`Creating new site: ${project.name}`));
    await setTimeout(1000);
  }
  // path different for this one as it's on the fly produced
  const recipeFileName = path.join(project.path, '/', project.name, `${siteRecipeFile}`);
  const recipeLogTransport = new winston.transports.File({
    filename: recipeFileName
  });

  const recipe = winston.createLogger({
    levels: logLevels,
    level: siteLoggingName,
    transports: [
      recipeLogTransport
    ],
    format: winston.format.simple(),
  });
  // matching the common object elsewhere tho different reference in this command since it creates from nothing
  // capture this if use input on the fly
  if(!commandRun.arguments.action){
    commandRun.arguments.action = project.name;
  }
  commandRun.options.theme = project.theme;
  recipe.log(siteLoggingName, commandString(commandRun));
  if (commandRun.options.v) {
    logStructuredOutput(commandRun, res.data, 'silly');
  }
  if (!commandRun.options.quiet) {
    s.stop(merlinSays(`${project.name} created successfully!`));
    await setTimeout(500);
  }
  
  // Write theme template to site/custom
  if(commandRun.options.theme === 'custom-theme' && commandRun.options.customThemeName && commandRun.options.customThemeTemplate || project.customThemeName && project.customThemeTemplate) {
    s.start(merlinSays(`Creating new theme: ${commandRun.options.customThemeName ? commandRun.options.customThemeName : project.customThemeName}`));

    await customSiteTheme(commandRun, project);
    
    s.stop(merlinSays(`${commandRun.options.customThemeName ? commandRun.options.customThemeName : project.customThemeName} theme created!`));
  }

  if (project.gitRepo && !commandRun.options.isMonorepo) {
    try {
      await exec(`cd ${project.path}/${project.name} && git init && git add -A && git commit -m "first commit" && git branch -M main${project.gitRepo ? ` && git remote add origin ${project.gitRepo}` : ''}`);    
    }
    catch(e) {        
    }
  }
  // ensure dot files is there because it doesn't copy for some reason for sites :\
  if (!fs.existsSync(`${project.path}/${project.name}/.gitignore`)) {
    await fs.copyFileSync(`${process.mainModule.path}/templates/sitedotfiles/_gitignore`, `${project.path}/${project.name}/.gitignore`);
  }
  if (!fs.existsSync(`${project.path}/${project.name}/._npmignore`)) {
    await fs.copyFileSync(`${process.mainModule.path}/templates/sitedotfiles/_npmignore`, `${project.path}/${project.name}/.npmignore`);
  }
  if (!fs.existsSync(`${project.path}/${project.name}/._surgeignore`)) {
    await fs.copyFileSync(`${process.mainModule.path}/templates/sitedotfiles/_surgeignore`, `${project.path}/${project.name}/.surgeignore`);    
  }
  if (!fs.existsSync(`${project.path}/${project.name}/.netlifyignore`)) {
    await fs.copyFileSync(`${process.mainModule.path}/templates/sitedotfiles/_netlifyignore`, `${project.path}/${project.name}/.netlifyignore`);
  }
  if (!fs.existsSync(`${project.path}/${project.name}/.vercelignore`)) {
    await fs.copyFileSync(`${process.mainModule.path}/templates/sitedotfiles/_vercelignore`, `${project.path}/${project.name}/.vercelignore`);
  }
  // options for install, git and other extras
  // can't launch if we didn't install first so launch implies installation
  if (project.extras && project.extras.includes && project.extras.includes('launch')) {
    let optionPath = `${project.path}/${project.name}`;
    // Security (M-4): HOST=127.0.0.1 hint + scoped JWT-disable for local launch.
    let command = `HOST=127.0.0.1 HAXCMS_DISABLE_JWT_CHECKS=true npx @haxtheweb/haxcms-nodejs`;
    if (!commandRun.options.quiet) {
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
    }
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
    let nextSteps = `cd ${project.path}/${project.name} && hax start`;
    p.note(`${project.name} is ready to go. Run the following to start working with it:`);
    p.outro(nextSteps);
  }
}

export async function siteItemsOptionsList(activeHaxsite, skipId = null) {
  let items = activeHaxsite.manifest.orderTree(activeHaxsite.manifest.items);
  let optionItems = [];
  for (var i in items) {
    // ensure we remove self if operation is about page in question like parent selector
    if (items[i].id !== skipId) {
      optionItems.push({
        value: items[i].id,
        label: ` ${'-'.repeat(parseInt(items[i].indent))}${items[i].title}`
      })  
    }
  }
  return optionItems;
}

export async function siteSkeletonList(asOptions = false) {
  let skeletonListResponse = await invokeRoute(
    allRoutesLib.allRoutes.system.map.get['skeletons'],
    {},
    {
      user_token: 'fakeToken',
    }
  )
  let skeletons = []
  if (
    skeletonListResponse &&
    skeletonListResponse.data &&
    Array.isArray(skeletonListResponse.data.data)
  ) {
    skeletons = skeletonListResponse.data.data
  }
  skeletons.sort((a, b) => {
    const aPriority = Number(a.priority)
    const bPriority = Number(b.priority)
    const normalizedAPriority = Number.isFinite(aPriority) ? aPriority : 0
    const normalizedBPriority = Number.isFinite(bPriority) ? bPriority : 0
    if (normalizedAPriority !== normalizedBPriority) {
      return normalizedAPriority - normalizedBPriority
    }
    const aTitle = typeof a.title === 'string' ? a.title : ''
    const bTitle = typeof b.title === 'string' ? b.title : ''
    return aTitle.localeCompare(bTitle)
  })
  if (!asOptions) {
    return skeletons
  }
  let options = []
  for (var i in skeletons) {
    const skeleton = skeletons[i]
    const machineName = skeleton.machineName
      ? skeleton.machineName
      : skeleton['machine-name']
        ? skeleton['machine-name']
        : null
    if (!machineName) {
      continue
    }
    const title = skeleton.title ? skeleton.title : machineName
    const scope = skeleton.scope ? `(${skeleton.scope})` : ''
    options.push({
      value: machineName,
      label: `${title} ${scope}`.trim(),
    })
  }
  return options
}

export async function siteThemeList(coreOnly = true, directory = null) {
  const isTruthyValue = (value) =>
    value === true || value === 'true' || value === 1 || value === '1'
  const isCommonTheme = (themeKey, themeData) => {
    const hidden = isTruthyValue(themeData.hidden)
    const terrible =
      isTruthyValue(themeData.terrible) || themeKey.indexOf('terrible') === 0
    const legacy =
      isTruthyValue(themeData.legacy) ||
      isTruthyValue(themeData.deprecated) ||
      isTruthyValue(themeData.isLegacy)
    return !(hidden || terrible || legacy)
  }
  const themes = (await HAXCMS.getThemes()) || {}
  let items = []
  let themedItems = []
  for (var themeKey in themes) {
    const theme = themes[themeKey]
    if (!theme) {
      continue
    }
    if (coreOnly && !isCommonTheme(themeKey, theme)) {
      continue
    }
    const priority = Number(theme.priority)
    themedItems.push({
      value: themeKey,
      label: theme.name ? theme.name : themeKey,
      priority: Number.isFinite(priority) ? priority : 0
    })
  }
  themedItems.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    return a.label.localeCompare(b.label)
  })
  for (var i in themedItems) {
    items.push({
      value: themedItems[i].value,
      label: themedItems[i].label
    })
  }
  if (coreOnly) {
    items.push({
      value: 'custom-theme',
      label: 'Create Custom Theme'
    })
    if (directory && fs.existsSync(`${directory}/custom/custom-elements.json`)) {
      try {
        const customThemeModules = JSON.parse(
          fs.readFileSync(`${directory}/custom/custom-elements.json`, 'utf8')
        ).modules
        if (Array.isArray(customThemeModules)) {
          for (var j in customThemeModules) {
            const module = customThemeModules[j]
            if (
              module &&
              module.declarations &&
              module.declarations[0] &&
              module.declarations[0].superclass &&
              module.declarations[0].superclass.name &&
              (module.declarations[0].superclass.name === 'PolarisFlexTheme' ||
                module.declarations[0].superclass.name ===
                  'HAXCMSLitElementTheme') &&
              module.declarations[0].tagName &&
              !items.some((themeItem) => themeItem.value === module.declarations[0].tagName)
            ) {
              items.push({
                value: module.declarations[0].tagName,
                label: module.declarations[0].name
                  ? module.declarations[0].name
                  : module.declarations[0].tagName
              })
            }
          }
        }
      }
      catch (e) {
      }
    }
  }
  return items
}

async function customSiteTheme(commandRun, project) {
  // pass theme name for twig templates
  project.customThemeName = commandRun.options.customThemeName ? commandRun.options.customThemeName : project.customThemeName;

  // validate start and end tags for theme name
  if(/^custom/.test(project.customThemeName) && !/^custom-/.test(project.customThemeName)){
    project.customThemeName = project.customThemeName.replace(/^custom/, "custom-");
  } else if (!/^custom-/.test(project.customThemeName)) {
    project.customThemeName = `custom-${project.customThemeName}`;
  }

  if(/theme$/.test(project.customThemeName) && !/-theme$/.test(project.customThemeName)){
    project.customThemeName = project.customThemeName.replace(/theme$/, "-theme");
  } else if (!/-theme$/.test(project.customThemeName)) {
    project.customThemeName = `${project.customThemeName}-theme`;
  }

  // set camel case class name
  project.className = dashToCamel(project.customThemeName);

  // path to hax site
  var sitePath;
  if(!commandRun.options.directory){
    sitePath = `${commandRun.options.path ? commandRun.options.path : project.path}/${commandRun.options.name ? commandRun.options.name : project.name}`;
  } else {
    // existing sites
    sitePath = commandRun.options.directory;
  }

  // path to new theme file
  const filePath = `${sitePath}/custom/src/${project.customThemeName}.js`;

  if (!project.year){
    project.year = new Date().getFullYear();
  }

  if(!project.author){
     try {
        let value = await exec(`git config user.name`);
        project.author = value.stdout.trim();
      }
      catch(e) {
        log(`
          git user name not configured. Run the following to do this:\n
          git config --global user.name "namehere"\n
          git config --global user.email "email@here`, 'debug');
      }
  }

  // theme template to use
  const themeTemplate = commandRun.options.customThemeTemplate ? commandRun.options.customThemeTemplate : project.customThemeTemplate;
  if(themeTemplate === "polaris-flex") {
    await fs.copyFileSync(`${process.mainModule.path}/templates/sitetheme/flex-theme.js`, `${sitePath}/custom/src/flex-theme.js`)
    await fs.renameSync(`${sitePath}/custom/src/flex-theme.js`, filePath)
  } else if(themeTemplate === "polaris-sidebar") {
    await fs.copyFileSync(`${process.mainModule.path}/templates/sitetheme/sidebar-theme.js`, `${sitePath}/custom/src/sidebar-theme.js`)
    await fs.renameSync(`${sitePath}/custom/src/sidebar-theme.js`, filePath)
  } else {
    // vanilla theme is default
    await fs.copyFileSync(`${process.mainModule.path}/templates/sitetheme/base-theme.js`, `${sitePath}/custom/src/base-theme.js`)
    await fs.renameSync(`${sitePath}/custom/src/base-theme.js`, filePath)
  }

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
  
  // import theme to custom.js
  await fs.appendFileSync(`${sitePath}/custom/src/custom.js`, `\n import "./${project.customThemeName}.js";`);
  var activeHaxsite = await systemStructureContext(sitePath);

  // add theme to site.json
  let themeObj = {
      element: project.customThemeName,
      path: "./custom/build/custom.es6.js",
      name: project.className,
  }

  activeHaxsite.manifest.metadata.theme = themeObj;
  activeHaxsite.manifest.save(false);

  // install and build theme dependencies
  await exec(`cd ${sitePath}/custom/ && ${commandRun.options.npmClient} install && ${commandRun.options.npmClient} run build && ${commandRun.options.npmClient} run analyze && cd ${sitePath}`);
}

// @fork of the hax core util for this so that we avoid api difference between real dom and parse nodejs dom
async function nodeToHaxElement(node, eventName = "insert-element") {
  if (!node) {
    return null;
  }
  // build out the properties to send along
  var props = {};
  // support basic styles
  if (typeof node.getAttribute("style") !== typeof undefined) {
    props.style = node.getAttribute("style");
  }
  // don't set a null style
  if (props.style === null || props.style === "null") {
    delete props.style;
  }
  // test if a class exists, not everything scopes
  if (typeof node.getAttribute('class') !== typeof undefined) {
    props.class = node.getAttribute('class').replace("hax-active", "");
  }
  // test if a id exists as its a special case in attributes... of course
  if (typeof node.getAttribute('id') !== typeof undefined) {
    props.id = node.getAttribute("id");
  }
  let tmpProps;
  // weak fallback
  if (typeof tmpProps === typeof undefined) {
    tmpProps = node.__data;
  }
  // complex elements need complex support
  if (typeof tmpProps !== typeof undefined) {
    // run through attributes, though non-reflected props won't be here
    // run through props, we always defer to property values
    for (var property in tmpProps) {
      // make sure we only set things that have a value
      if (
        property != "class" &&
        property != "style" &&
        tmpProps.hasOwnProperty(property) &&
        typeof node[property] !== undefined &&
        node[property] != null &&
        node[property] != ""
      ) {
        props[property] = node[property];
      }
      // special support for false boolean
      else if (node[property] === false) {
        props[property] = false;
      } 
      else if (node[property] === true) {
        props[property] = true;
      }
      else if (node[property] === 0) {
        props[property] = 0;
      }
      else {
        // unknown prop setting / ignored
        //console.warn(node[property], property);
      }
    }
    for (var attribute in node._attrs) {
      // make sure we only set things that have a value
      if (
        typeof node._attrs[attribute] !== typeof undefined &&
        attribute != "class" &&
        attribute != "style" &&
        attribute != "id" &&
        typeof node._attrs[attribute] !== undefined &&
        node._attrs[attribute] != null &&
        node._attrs[attribute] != ""
      ) {
        props[attribute] = node._attrs[attribute];
      }
      else if (node._attrs[attribute] == "0") {
        props[attribute] = node._attrs[attribute];
      }
      else {
        // note: debug here if experiencing attributes that won't bind
      }
    }
  } else {
    // much easier case, usually just in primatives
    for (var attribute in node._attrs) {
      // make sure we only set things that have a value
      if (
        typeof node._attrs[attribute] !== typeof undefined &&
        attribute != "class" &&
        attribute != "style" &&
        attribute != "id" &&
        typeof node._attrs[attribute] !== undefined &&
        node._attrs[attribute] != null &&
        node._attrs[attribute] != ""
      ) {
        props[attribute] = node._attrs[attribute];
      }
    }
  }
  // support sandboxed environments which
  // will hate iframe tags but love webview
  let tag = node.tagName.toLowerCase();
  if (globalThis.HaxStore && globalThis.HaxStore.instance && globalThis.HaxStore.instance._isSandboxed && tag === "iframe") {
    tag = "webview";
  }
  let slotContent = '';
  // if hax store around, allow it to get slot content of the node
  if (globalThis.HaxStore && globalThis.HaxStore.instance) {
    slotContent = await globalThis.HaxStore.instance.getHAXSlot(node);
  }
  else {
    // if HAX isn't around, just return the innerHTML as a string for asignment to content
    slotContent = node.innerHTML;
  }
  // support fallback on inner text if there were no nodes
  if (slotContent == "") {
    slotContent = node.innerText;
  }
  let element = {
    tag: tag,
    properties: props,
    content: slotContent,
  };
  if (eventName !== null) {
    element.eventName = eventName;
  }
  return element;
}
