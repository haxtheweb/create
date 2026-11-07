"use strict";

// haxtheweb/issues#3228: `hax list` and `hax completion` are built from a
// commander program, so these tests build a small one rather than loading
// the whole CLI.
require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { Command } = require("commander");

const {
  buildCliManifest,
  formatCliManifest,
  completionScript,
  COMPLETION_SHELLS,
} = require("../../src/lib/cli-manifest.js");

function fixtureProgram() {
  const program = new Command();
  program.name("create").option("--y", "yes").option("--format <char>", "fmt");
  program
    .command("site")
    .description("site things")
    .argument("[action]", "what to do")
    .option("--only <char>", "targets")
    .option("--y", "yes");
  program.command("wc").alias("webcomponent").description("components");
  return program;
}

const actions = {
  site: [
    { value: "site:validate", label: "Validate" },
    { value: "site:rebuild", label: "Rebuild" },
  ],
  wc: [{ value: "wc:stats", label: "Stats" }],
};

test("buildCliManifest describes commands, aliases, arguments, options and actions", () => {
  const manifest = buildCliManifest(fixtureProgram(), actions, "1.2.3");
  assert.equal(manifest.name, "hax");
  assert.equal(manifest.version, "1.2.3");
  assert.deepEqual(
    manifest.globalOptions.map((o) => o.long),
    ["--y", "--format"],
  );
  const site = manifest.commands.find((c) => c.name === "site");
  assert.deepEqual(site.arguments, [
    { name: "action", required: false, variadic: false },
  ]);
  assert.deepEqual(
    site.options.map((o) => [o.long, o.takesValue]),
    [
      ["--only", true],
      ["--y", false],
    ],
  );
  assert.deepEqual(site.actions, [
    { value: "site:validate", description: "Validate" },
    { value: "site:rebuild", description: "Rebuild" },
  ]);
  const wc = manifest.commands.find((c) => c.name === "wc");
  assert.deepEqual(wc.aliases, ["webcomponent"]);
});

test("formatCliManifest lists commands with their actions", () => {
  const text = formatCliManifest(buildCliManifest(fixtureProgram(), actions));
  assert.match(text, /^hax site {2}site things$/m);
  assert.match(text, /^ {2}site:validate {2}Validate$/m);
  assert.match(text, /^hax wc \(webcomponent\) {2}components$/m);
});

test("completionScript supports bash and zsh", () => {
  assert.deepEqual(COMPLETION_SHELLS, ["bash", "zsh"]);
  const manifest = buildCliManifest(fixtureProgram(), actions);
  const zsh = completionScript("zsh", manifest);
  assert.match(zsh, /^#compdef hax/);
  assert.match(zsh, /compdef _hax hax/);
  assert.match(zsh, /actions=\(site:validate site:rebuild\)/);
});

test("completionScript strips anything that could break shell quoting", () => {
  const program = fixtureProgram();
  const manifest = buildCliManifest(program, {
    site: [{ value: 'bad";rm -rf /;$(x)`y`', label: "x" }],
  });
  const script = completionScript("bash", manifest);
  assert.ok(!script.includes("rm -rf"), "space-separated payload is split");
  assert.ok(!script.includes("$(x)"));
  assert.ok(!script.includes("`y`"));
  assert.ok(!script.includes('bad"'));
});

const hasBash = spawnSync("bash", ["--version"]).status === 0;

test(
  "the bash script completes commands, actions and flags",
  { skip: hasBash ? false : "bash is not installed" },
  () => {
    const script = completionScript(
      "bash",
      buildCliManifest(fixtureProgram(), actions),
    );
    const run = (words, cword) =>
      spawnSync(
        "bash",
        [
          "-c",
          `${script}\nCOMP_WORDS=(${words}); COMP_CWORD=${cword}; _hax_completion; echo "\${COMPREPLY[*]}"`,
        ],
        { encoding: "utf8" },
      ).stdout.trim();
    assert.equal(run("hax si", 1), "site");
    assert.equal(run("hax webcomponent wc:", 2), "wc:stats");
    assert.equal(run("hax site site:re", 2), "site:rebuild");
    assert.equal(run("hax site site:rebuild --on", 3), "--only");
    // flags shared by the command and the program are offered once
    assert.equal(run("hax site site:rebuild --y", 3), "--y");
  },
);
