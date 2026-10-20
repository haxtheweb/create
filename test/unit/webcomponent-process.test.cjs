"use strict";

// Covers webcomponentProcess() in src/lib/programs/webcomponent.js — the
// scaffold orchestration (template copy, dotfile + name renames, ejs
// rendering, optional git init, install and launch). HAXCMS.recurseCopy is
// replaced with a mock that materializes a mini template tree (with the
// dotfile names and ejs placeholders the real templates use) into the
// destination, utils.exec is monkey-patched (live writable binding) so no
// real git/npm subprocesses run, and p.spinner/p.note/p.outro are patched
// via the shared clack stub (an un-stopped @clack spinner keeps handles
// open and hangs the process, so it must never be real here).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "hax-wc-process-"));
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;

const { installClackStub } = require("../_helpers/clack-stub.cjs");
const stub = installClackStub();

require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");

const spinnerStarts = [];
stub.spinner = () => ({
  start(msg) {
    spinnerStarts.push(String(msg));
  },
  stop() {
    /* quiet */
  },
});
const notes = [];
stub.note = (msg) => {
  notes.push(String(msg));
};
const outros = [];
stub.outro = (msg) => {
  outros.push(String(msg));
};
stub.intro = () => {
  /* quiet */
};
stub.text = async () => "https://github.com/tester/my-cool-el.git";

// no real git/npm subprocesses
const utils = require("../../src/lib/utils.js");
const execCalls = [];
utils.exec = async (cmd) => {
  execCalls.push(cmd);
  return { stdout: "", stderr: "" };
};
// Security (R2-L-1): argument-array commands record their cwd
const runCwds = [];
utils.runCommand = async (cmd, args = [], cmdOpts = {}) => {
  const line = `${cmd} ${args.join(" ")}`;
  execCalls.push(line);
  runCwds.push({ line, cwd: cmdOpts.cwd });
  return { stdout: "", stderr: "" };
};
utils.initGitRepo = async (dir, gitRepo) => {
  execCalls.push(`git init ${dir} && git remote add origin ${gitRepo}`);
};

// replace recurseCopy with a mock that builds the mini template tree
const haxcmsLib = require("@haxtheweb/haxcms-nodejs/dist/lib/HAXCMS.js");
const recurseCalls = [];
haxcmsLib.HAXCMS.recurseCopy = async (src, dest) => {
  recurseCalls.push({ src, dest });
  // ejs.render(ejsString, project) exposes the project's properties as
  // top-level locals, so templates reference `name` / `className` directly
  const files = {
    "_github/workflow.yml": "name: <%= name %>\n",
    _gitignore: "node_modules\n",
    _dddignore: "/dist\n",
    _editorconfig: "root = true\n",
    "_vscode/settings.json": "{}\n",
    _nojekyll: "",
    _npmignore: "node_modules\n",
    _surgeignore: "CNAME\n",
    "_travis.yml": "language: node_js\n",
    "webcomponent.js": "export class <%= className %> extends HTMLElement {}\n",
    "lib/webcomponent.haxProperties.json": '{"tag": "<%= name %>"}\n',
    "locales/webcomponent.es.json": '{"name": "<%= name %>"}\n',
    "locales/webcomponent.haxProperties.es.json": '{"settings": {}}\n',
    "test/webcomponent.test.js": "import '../<%= name %>.js';\n",
    "image.jpg": "not-an-ejs-template",
  };
  fs.mkdirSync(dest, { recursive: true });
  for (const rel of Object.keys(files)) {
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.writeFileSync(path.join(dest, rel), files[rel]);
  }
};

const { probeModule } = require("../_helpers/module-canary.cjs");
const {
  available,
  skipReason,
  module: wcModule,
} = probeModule("src/lib/programs/webcomponent.js");
const { webcomponentProcess } = available ? wcModule : {};

const opts = { skip: skipReason, timeout: 30000 };

function makeCommandRun(options) {
  return { command: "webcomponent", arguments: {}, options };
}

test(
  "copies templates, renames dotfiles and element names, and renders ejs",
  opts,
  async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hax-wc-proj-"));
    // drop the module-load `which git` probe recorded during the canary require
    execCalls.length = 0;
    outros.length = 0;
    try {
      const commandRun = makeCommandRun({
        extras: false,
        npmClient: "npm",
        quiet: false,
      });
      const project = {
        name: "my-cool-el",
        type: "webcomponent",
        path: projectRoot,
        author: "tester",
      };
      await webcomponentProcess(commandRun, project);

      // recurseCopy got the template source for the compliant webcomponent type
      assert.equal(recurseCalls.length, 1);
      assert.ok(
        recurseCalls[0].src.includes("/templates/webcomponent/compliant/"),
        recurseCalls[0].src,
      );
      assert.equal(recurseCalls[0].dest, path.join(projectRoot, "my-cool-el"));

      const scaffold = path.join(projectRoot, "my-cool-el");
      // dotfiles renamed
      for (const dotfile of [
        ".github/workflow.yml",
        ".gitignore",
        ".dddignore",
        ".editorconfig",
        ".vscode/settings.json",
        ".nojekyll",
        ".npmignore",
        ".surgeignore",
        ".travis.yml",
      ]) {
        assert.ok(
          fs.existsSync(path.join(scaffold, dotfile)),
          `${dotfile} renamed`,
        );
      }
      // element-name renames
      assert.ok(fs.existsSync(path.join(scaffold, "my-cool-el.js")));
      assert.ok(
        fs.existsSync(
          path.join(scaffold, "lib", "my-cool-el.haxProperties.json"),
        ),
      );
      assert.ok(
        fs.existsSync(path.join(scaffold, "locales", "my-cool-el.es.json")),
      );
      // editor-locale overlays land on the name the i18n manager fetches for <tag>.haxProperties
      assert.ok(
        fs.existsSync(
          path.join(scaffold, "locales", "my-cool-el.haxProperties.es.json"),
        ),
      );
      assert.ok(
        fs.existsSync(path.join(scaffold, "test", "my-cool-el.test.js")),
      );
      assert.ok(!fs.existsSync(path.join(scaffold, "webcomponent.js")));

      // ejs rendered project data into the renamed files
      assert.ok(
        fs
          .readFileSync(path.join(scaffold, "my-cool-el.js"), "utf8")
          .includes("MyCoolEl"),
      );
      assert.equal(
        fs.readFileSync(
          path.join(scaffold, "lib", "my-cool-el.haxProperties.json"),
          "utf8",
        ),
        '{"tag": "my-cool-el"}\n',
      );
      // images are skipped by the render loop
      assert.equal(
        fs.readFileSync(path.join(scaffold, "image.jpg"), "utf8"),
        "not-an-ejs-template",
      );

      // no extras: no git init, no install, no launch; next steps are noted
      assert.equal(execCalls.length, 0);
      assert.equal(outros.length, 1);
      assert.ok(outros[0].includes("cd"), "next steps outro recorded");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  },
);

test(
  "launch extra installs dependencies and launches the start script",
  opts,
  async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "hax-wc-launch-"),
    );
    execCalls.length = 0;
    spinnerStarts.length = 0;
    try {
      const commandRun = makeCommandRun({
        npmClient: "yarn",
        isMonorepo: false,
      });
      const project = {
        name: "launch-el",
        type: "webcomponent",
        path: projectRoot,
        author: "tester",
        extras: ["launch"],
      };
      await webcomponentProcess(commandRun, project);

      const scaffold = path.join(projectRoot, "launch-el");
      const ranIn = (line) =>
        runCwds.some((r) => r.line === line && r.cwd === scaffold);
      assert.ok(ranIn("yarn install"), "install ran");
      assert.ok(ranIn("yarn start"), "launch ran");
      assert.ok(ranIn("yarn run analyze"), "analyze ran after launch");
      assert.ok(
        notes.some((n) => n.includes("sub-process daemon")),
        "launch note recorded",
      );
      assert.ok(spinnerStarts.length >= 2, "spinner used for copy + install");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  },
);

test(
  "git extra with --auto builds the repo link and initializes git",
  opts,
  async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hax-wc-git-"));
    execCalls.length = 0;
    try {
      const commandRun = makeCommandRun({
        npmClient: "npm",
        auto: true,
        quiet: false,
      });
      const project = {
        name: "versioned-el",
        type: "webcomponent",
        path: projectRoot,
        author: "tester",
        extras: ["git"],
      };
      await webcomponentProcess(commandRun, project);

      const gitInit = execCalls.find((c) => c.includes("git init"));
      assert.ok(gitInit, "git init executed");
      assert.ok(
        gitInit.includes(
          `git remote add origin https://github.com/tester/versioned-el.git`,
        ),
      );
      // install/launch extras not requested
      assert.ok(!execCalls.some((c) => c.includes("npm install")));
      // next steps outro still printed since quiet was not set
      assert.equal(outros.length, 2);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  },
);

// haxtheweb/issues#3119: `hax wc <name> --y --no-i` hung because the default
// extras always included launch (a dev server that never returns)
test(
  "non-interactive default extras install and commit but never launch",
  opts,
  async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hax-wc-noi-"));
    execCalls.length = 0;
    try {
      const commandRun = makeCommandRun({
        npmClient: "npm",
        y: true,
        i: false,
        quiet: true,
      });
      const project = {
        name: "agent-el",
        type: "webcomponent",
        path: projectRoot,
        author: "tester",
      };
      await webcomponentProcess(commandRun, project);
      assert.ok(
        !project.extras.includes("launch"),
        "launch dropped from default extras",
      );
      assert.ok(
        execCalls.some((c) => c.includes("npm install")),
        "dependencies still installed",
      );
      assert.ok(
        !execCalls.some((c) => c.includes("npm start")),
        "dev server never started",
      );
      if (project.extras.includes("git")) {
        assert.ok(
          execCalls.some((c) => c.includes("git init")),
          "git still initialized",
        );
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  },
);

test(
  "standalone scaffold ships the whole hax-webcomponent-dev skill, references included",
  opts,
  async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hax-wc-skill-"));
    const originalCopy = haxcmsLib.HAXCMS.recurseCopy;
    haxcmsLib.HAXCMS.recurseCopy = async (src, dest) => {
      await originalCopy(src, dest);
      fs.writeFileSync(path.join(dest, "AGENTS.md"), "# agents\n");
    };
    try {
      const commandRun = makeCommandRun({
        extras: false,
        npmClient: "npm",
        quiet: true,
      });
      await webcomponentProcess(commandRun, {
        name: "skill-el",
        type: "webcomponent",
        path: projectRoot,
        author: "tester",
      });
      const skillDir = path.join(
        projectRoot,
        "skill-el",
        ".agents",
        "skills",
        "hax-webcomponent-dev",
      );
      assert.ok(
        fs.existsSync(path.join(skillDir, "SKILL.md")),
        "SKILL.md copied",
      );
      const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
      const refs = [...skill.matchAll(/`(references\/[\w.-]+\.md)`/g)].map(
        (m) => m[1],
      );
      assert.ok(
        refs.length > 0,
        "SKILL.md points at at least one reference file",
      );
      for (const ref of new Set(refs)) {
        assert.ok(
          fs.existsSync(path.join(skillDir, ref)),
          `${ref} is shipped next to SKILL.md`,
        );
      }
    } finally {
      haxcmsLib.HAXCMS.recurseCopy = originalCopy;
    }
  },
);

test(
  "--quiet runs the scaffold without starting any progress spinner",
  opts,
  async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hax-wc-quiet-"));
    try {
      const before = spinnerStarts.length;
      const quiet = makeCommandRun({
        npmClient: "npm",
        y: true,
        i: false,
        quiet: true,
      });
      await webcomponentProcess(quiet, {
        name: "quiet-el",
        type: "webcomponent",
        path: projectRoot,
        author: "tester",
      });
      assert.equal(
        spinnerStarts.length,
        before,
        "no spinner started with --quiet",
      );
      assert.ok(
        fs.existsSync(path.join(projectRoot, "quiet-el", "quiet-el.js")),
        "scaffold still created",
      );

      const loud = makeCommandRun({ npmClient: "npm", y: true, i: false });
      await webcomponentProcess(loud, {
        name: "loud-el",
        type: "webcomponent",
        path: projectRoot,
        author: "tester",
      });
      assert.ok(
        spinnerStarts.length > before,
        "spinner still used without --quiet",
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  },
);
