"use strict";

// Isolate HOME before requiring the module (via the canary) — webcomponent.js
// imports HAXCMS.js which inits a configDirectory on load.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ISOLATED_HOME = fs.mkdtempSync(
  path.join(os.tmpdir(), "hax-wc-gen-test-"),
);
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;

const test = require("node:test");
const assert = require("node:assert/strict");

const { probeModule } = require("../_helpers/module-canary.cjs");
const {
  available,
  skipReason,
  module: wcModule,
} = probeModule("src/lib/programs/webcomponent.js");

const {
  webcomponentGenerateHAXSchema,
  webcomponentRename,
  planWebcomponentRename,
} = available ? wcModule : {};

const opts = { skip: skipReason, timeout: 15000 };

// --- webcomponentGenerateHAXSchema: reads customElements manifest, writes haxProperties.json ---

test(
  "webcomponentGenerateHAXSchema maps attributes into settings.configure and demoSchema defaults",
  opts,
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-wc-genschema-"));
    const originalCwd = process.cwd();
    try {
      fs.mkdirSync(path.join(root, "lib"));
      const customElementsPath = path.join(root, "custom-elements.json");
      fs.writeFileSync(
        customElementsPath,
        JSON.stringify({
          modules: [
            {
              declarations: [
                {
                  tagName: "my-test-el",
                  attributes: [
                    {
                      fieldName: "myProp",
                      name: "myProp",
                      type: { text: "string" },
                      default: "hello",
                    },
                    {
                      fieldName: "count",
                      name: "count",
                      type: { text: "number" },
                    },
                    { fieldName: "t", name: "t" },
                  ],
                },
              ],
            },
          ],
        }),
      );
      process.chdir(root);

      const commandRun = { options: {} };
      const packageData = {
        scripts: {},
        customElements: "custom-elements.json",
      };

      await webcomponentGenerateHAXSchema(commandRun, packageData);

      const outputPath = path.join(
        root,
        "lib",
        "my-test-el.haxProperties.json",
      );
      assert.ok(fs.existsSync(outputPath), "haxProperties.json was written");
      const props = JSON.parse(fs.readFileSync(outputPath, "utf8"));

      // Source uses tagName.replace('-', ' ') which only replaces the first dash.
      assert.equal(props.gizmo.title, "my test-el");
      assert.deepEqual(props.gizmo.tags, ["Other"]);
      assert.deepEqual(props.gizmo.handles, []);

      const configuredProps = props.settings.configure.map((c) => c.property);
      assert.ok(configuredProps.includes("myProp"));
      assert.ok(configuredProps.includes("count"));
      assert.ok(
        !configuredProps.includes("t"),
        '"t" is excluded via unsetAttributes',
      );

      assert.ok(props.saveOptions.unsetAttributes.includes("t"));
      assert.equal(props.demoSchema[0].tag, "my-test-el");
      assert.equal(props.demoSchema[0].properties.myProp, "hello");
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "webcomponentGenerateHAXSchema is a no-op when the customElements manifest is missing",
  opts,
  async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "hax-wc-genschema-missing-"),
    );
    const originalCwd = process.cwd();
    try {
      process.chdir(root);
      const commandRun = { options: {} };
      const packageData = {
        scripts: {},
        customElements: "does-not-exist.json",
      };
      await assert.doesNotReject(() =>
        webcomponentGenerateHAXSchema(commandRun, packageData),
      );
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- webcomponentRename: rewrites content, filenames, package.json, then renames the directory ---

test(
  "webcomponentRename renames files, package.json, and the project directory",
  opts,
  async () => {
    const parentDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "hax-wc-rename-parent-"),
    );
    const oldName = "zzz-rename-source-el";
    const newName = "zzz-rename-target-el";
    const oldDir = path.join(parentDir, oldName);
    fs.mkdirSync(oldDir);
    fs.mkdirSync(path.join(oldDir, "test"));
    fs.writeFileSync(
      path.join(oldDir, "package.json"),
      JSON.stringify({
        name: oldName,
        version: "1.0.0",
        main: `${oldName}.js`,
      }),
    );
    fs.writeFileSync(
      path.join(oldDir, `${oldName}.js`),
      `export class ZzzRenameSourceEl extends HTMLElement {}\ncustomElements.define('${oldName}', ZzzRenameSourceEl);\n`,
    );
    fs.writeFileSync(
      path.join(oldDir, "test", `${oldName}.test.js`),
      `import '../${oldName}.js';\n`,
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(oldDir);
      const commandRun = { options: { name: newName, quiet: true } };
      const packageData = { name: oldName, version: "1.0.0" };

      await webcomponentRename(commandRun, packageData);

      const newDir = path.join(parentDir, newName);
      assert.ok(fs.existsSync(newDir), "renamed directory exists");
      assert.ok(!fs.existsSync(oldDir), "old directory no longer exists");

      const pkg = JSON.parse(
        fs.readFileSync(path.join(newDir, "package.json"), "utf8"),
      );
      assert.equal(pkg.name, newName);
      assert.equal(pkg.main, `${newName}.js`);

      assert.ok(
        fs.existsSync(path.join(newDir, `${newName}.js`)),
        "main file renamed",
      );
      assert.ok(
        fs.existsSync(path.join(newDir, "test", `${newName}.test.js`)),
        "test file renamed",
      );
      const rewrittenSource = fs.readFileSync(
        path.join(newDir, `${newName}.js`),
        "utf8",
      );
      assert.ok(
        rewrittenSource.includes("ZzzRenameTargetEl"),
        "class name rewritten",
      );
      assert.ok(rewrittenSource.includes(newName), "tag name rewritten");
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(parentDir, { recursive: true, force: true });
    }
  },
);

test(
  "webcomponentRename exits when run non-interactively without --name",
  opts,
  async () => {
    const parentDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "hax-wc-rename-noname-"),
    );
    const oldDir = path.join(parentDir, "zzz-noname-source-el");
    fs.mkdirSync(oldDir);
    fs.writeFileSync(
      path.join(oldDir, "package.json"),
      JSON.stringify({ name: "zzz-noname-source-el", version: "1.0.0" }),
    );

    const originalCwd = process.cwd();
    const originalExit = process.exit;
    let exitCode = null;
    process.exit = (code) => {
      exitCode = code;
      throw new Error("__process_exit__");
    };
    try {
      process.chdir(oldDir);
      const commandRun = { options: { y: true, quiet: true } };
      const packageData = { name: "zzz-noname-source-el", version: "1.0.0" };
      await assert.rejects(
        () => webcomponentRename(commandRun, packageData),
        /__process_exit__/,
      );
      assert.equal(exitCode, 1);
    } finally {
      process.exit = originalExit;
      process.chdir(originalCwd);
      fs.rmSync(parentDir, { recursive: true, force: true });
    }
  },
);

// --- Security: webcomponentRename must never rewrite binaries or .git/ ---

const crypto = require("node:crypto");

function makeRenameFixture(prefix, oldName) {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const oldDir = path.join(parentDir, oldName);
  fs.mkdirSync(oldDir);
  fs.writeFileSync(
    path.join(oldDir, "package.json"),
    JSON.stringify({ name: oldName, version: "1.0.0", main: `${oldName}.js` }),
  );
  fs.writeFileSync(
    path.join(oldDir, `${oldName}.js`),
    `customElements.define('${oldName}', class extends HTMLElement {});\n`,
  );
  // a fake git object store: zlib'd content whose bytes happen to contain
  // the old name and NUL bytes, exactly like a real loose object
  const gitObjDir = path.join(oldDir, ".git", "objects", "ab");
  fs.mkdirSync(gitObjDir, { recursive: true });
  const gitObject = Buffer.concat([
    Buffer.from(`blob 40\0${oldName} `, "utf8"),
    crypto.randomBytes(64),
    Buffer.from(oldName, "utf8"),
  ]);
  fs.writeFileSync(path.join(gitObjDir, "cdef0123"), gitObject);
  fs.writeFileSync(
    path.join(oldDir, ".git", "HEAD"),
    `ref: refs/heads/${oldName}\n`,
  );
  // binary assets: a GIF header followed by random bytes that include the
  // old name and bytes that are not valid UTF-8 (0xff, 0xfe)
  fs.mkdirSync(path.join(oldDir, "assets"));
  const gif = Buffer.concat([
    Buffer.from("GIF89a", "latin1"),
    Buffer.from([0xff, 0xfe, 0x00, 0x01]),
    Buffer.from(oldName, "utf8"),
    crypto.randomBytes(128),
  ]);
  fs.writeFileSync(path.join(oldDir, "assets", `${oldName}-logo.gif`), gif);
  // a font with no NUL in the first bytes but invalid UTF-8 and an
  // unknown-to-the-allowlist extension
  const font = Buffer.concat([
    Buffer.from("wOFF", "latin1"),
    Buffer.from([0xc3, 0x28, 0xa0, 0xa1]),
    Buffer.from(oldName, "utf8"),
    crypto.randomBytes(256),
  ]);
  fs.writeFileSync(path.join(oldDir, "assets", "icons.woff2"), font);
  // a PDF
  const pdf = Buffer.concat([
    Buffer.from(`%PDF-1.4\n%`, "latin1"),
    Buffer.from([0xe2, 0xe3, 0xcf, 0xd3]),
    Buffer.from(`\n1 0 obj<</Title(${oldName})>>\n`, "latin1"),
    crypto.randomBytes(64),
  ]);
  fs.writeFileSync(path.join(oldDir, "assets", "manual.pdf"), pdf);
  // a text SVG that SHOULD be rewritten
  fs.writeFileSync(
    path.join(oldDir, "assets", "art.svg"),
    `<svg><title>${oldName}</title></svg>`,
  );
  return { parentDir, oldDir, gitObject, gif, font, pdf };
}

test(
  "webcomponentRename leaves .git/ objects and binary files byte-identical",
  opts,
  async () => {
    const oldName = "zzz-binsafe-source-el";
    const newName = "zzz-binsafe-target-el";
    const { parentDir, oldDir, gitObject, gif, font, pdf } = makeRenameFixture(
      "hax-wc-rename-bin-",
      oldName,
    );
    const originalCwd = process.cwd();
    try {
      process.chdir(oldDir);
      await webcomponentRename(
        { options: { name: newName, quiet: true } },
        { name: oldName, version: "1.0.0" },
      );
      const newDir = path.join(parentDir, newName);
      assert.ok(fs.existsSync(newDir));

      // .git/ is never entered: object bytes and HEAD text are untouched
      assert.ok(
        gitObject.equals(
          fs.readFileSync(
            path.join(newDir, ".git", "objects", "ab", "cdef0123"),
          ),
        ),
        "git object byte-identical",
      );
      assert.equal(
        fs.readFileSync(path.join(newDir, ".git", "HEAD"), "utf8"),
        `ref: refs/heads/${oldName}\n`,
        ".git/HEAD not rewritten",
      );

      // binaries: renamed when the basename matches, bytes never change
      assert.ok(
        gif.equals(
          fs.readFileSync(path.join(newDir, "assets", `${newName}-logo.gif`)),
        ),
        "gif renamed but byte-identical",
      );
      assert.ok(
        font.equals(
          fs.readFileSync(path.join(newDir, "assets", "icons.woff2")),
        ),
        "font byte-identical",
      );
      assert.ok(
        pdf.equals(fs.readFileSync(path.join(newDir, "assets", "manual.pdf"))),
        "pdf byte-identical",
      );

      // real text is still rewritten
      assert.equal(
        fs.readFileSync(path.join(newDir, "assets", "art.svg"), "utf8"),
        `<svg><title>${newName}</title></svg>`,
      );
      assert.ok(
        fs
          .readFileSync(path.join(newDir, `${newName}.js`), "utf8")
          .includes(newName),
      );
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(parentDir, { recursive: true, force: true });
    }
  },
);

test(
  "webcomponentRename --dry-run reports the plan and writes nothing",
  opts,
  async () => {
    const oldName = "zzz-dryrun-source-el";
    const newName = "zzz-dryrun-target-el";
    const { parentDir, oldDir } = makeRenameFixture(
      "hax-wc-rename-dry-",
      oldName,
    );
    const before = new Map();
    for (const rel of [
      "package.json",
      `${oldName}.js`,
      path.join("assets", "art.svg"),
      path.join("assets", `${oldName}-logo.gif`),
    ]) {
      before.set(rel, fs.readFileSync(path.join(oldDir, rel)));
    }
    const originalCwd = process.cwd();
    try {
      process.chdir(oldDir);
      const plan = await webcomponentRename(
        { options: { name: newName, quiet: true, dryRun: true } },
        { name: oldName, version: "1.0.0" },
      );
      assert.ok(fs.existsSync(oldDir), "directory not renamed");
      assert.ok(!fs.existsSync(path.join(parentDir, newName)));
      for (const [rel, bytes] of before) {
        assert.ok(
          bytes.equals(fs.readFileSync(path.join(oldDir, rel))),
          `${rel} unchanged`,
        );
      }
      const rel = (f) => path.relative(oldDir, f);
      assert.deepEqual(plan.rewrite.map(rel).sort(), [
        "assets/art.svg",
        "package.json",
        `${oldName}.js`,
      ]);
      assert.deepEqual(plan.skipped.map(rel).sort(), [
        "assets/icons.woff2",
        "assets/manual.pdf",
        `assets/${oldName}-logo.gif`,
      ]);
      assert.deepEqual(plan.rename.map((r) => rel(r.old)).sort(), [
        `assets/${oldName}-logo.gif`,
        `${oldName}.js`,
      ]);
      // .git/ never appears in any bucket
      assert.ok(
        ![...plan.rewrite, ...plan.skipped].some((f) => f.includes("/.git/")),
      );
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(parentDir, { recursive: true, force: true });
    }
  },
);

test(
  "planWebcomponentRename only rewrites allowlisted text that round-trips UTF-8",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-wc-plan-"));
    try {
      fs.writeFileSync(path.join(root, "ok.js"), "const a = 'my-el';");
      fs.writeFileSync(path.join(root, "nul.js"), Buffer.from("a\0b"));
      fs.writeFileSync(
        path.join(root, "latin1.md"),
        Buffer.from([0x63, 0x61, 0x66, 0xe9]),
      );
      fs.writeFileSync(path.join(root, "unknown.bin"), "plain text inside");
      fs.writeFileSync(path.join(root, ".npmrc"), "registry=x");
      fs.mkdirSync(path.join(root, ".hg"));
      fs.writeFileSync(path.join(root, ".hg", "store"), "my-el");
      const plan = planWebcomponentRename(root, {
        oldName: "my-el",
        newName: "new-el",
      });
      const names = (list) => list.map((f) => path.basename(f)).sort();
      assert.deepEqual(names(plan.rewrite), [".npmrc", "ok.js"]);
      assert.deepEqual(names(plan.skipped), [
        "latin1.md",
        "nul.js",
        "unknown.bin",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
