"use strict";

// haxtheweb/issues#3229 (local part): site aliases. Seam A for argv
// rewriting and parsing, Seam B for alias file discovery on disk.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");

const aliases = require("../../src/lib/site-aliases.js");

const HOME = path.resolve("/home/u");
const ARGV = ["node", "hax"];

function alias(name, extra) {
  return {
    name: name,
    file: "/x/hax.aliases.yml",
    root: null,
    rsync: null,
    url: null,
    ...extra,
  };
}

const KNOWN = {
  mine: alias("mine", {
    root: "/sites/mine",
    rsync: "user@host:/var/www/mine/",
  }),
  local: alias("local", { root: "/sites/local" }),
  remote: alias("remote", { url: "https://hax.example.org" }),
};

function rewrite(args) {
  return aliases.resolveAliasArgv(ARGV.concat(args), KNOWN).argv.slice(2);
}

test("parseAliasFile resolves ~ and paths relative to the alias file", () => {
  const { aliases: parsed, problems } = aliases.parseAliasFile(
    [
      "home:",
      "  root: ~/sites/home",
      "rel:",
      "  root: ../site",
      "  rsync: user@host:/srv/site/",
      "far:",
      "  url: https://hax.example.org",
    ].join("\n"),
    path.join("/proj", "sub", "hax.aliases.yml"),
    HOME,
  );
  assert.deepEqual(problems, []);
  assert.equal(parsed.home.root, path.join(HOME, "sites", "home"));
  assert.equal(parsed.rel.root, path.resolve("/proj", "site"));
  assert.equal(parsed.rel.rsync, "user@host:/srv/site/");
  assert.equal(parsed.far.root, null);
  assert.equal(parsed.far.url, "https://hax.example.org");
});

test("parseAliasFile reports bad YAML, names and entries without dropping good ones", () => {
  assert.equal(
    aliases.parseAliasFile("a: [", "/f.yml", HOME).problems.length,
    1,
  );
  assert.equal(
    aliases.parseAliasFile("- a\n- b", "/f.yml", HOME).problems.length,
    1,
  );
  const { aliases: parsed, problems } = aliases.parseAliasFile(
    "'bad name':\n  root: /x\nempty: {}\nscalar: hello\ngood:\n  root: /ok\n",
    "/f.yml",
    HOME,
  );
  assert.deepEqual(Object.keys(parsed), ["good"]);
  assert.equal(problems.length, 3);
});

test("parseAliasFile never runs YAML tags", () => {
  const { problems } = aliases.parseAliasFile(
    'x: !!js/function "function(){ return 1 }"',
    "/f.yml",
    HOME,
  );
  assert.equal(problems.length, 1);
});

test("hax @name action runs `hax site <action>` in the alias root", () => {
  assert.deepEqual(rewrite(["@mine", "site:stats", "--y"]), [
    "site",
    "site:stats",
    "--y",
    "--root",
    "/sites/mine",
  ]);
  assert.deepEqual(rewrite(["@mine", "node:add", "--title", "X"]), [
    "site",
    "node:add",
    "--title",
    "X",
    "--root",
    "/sites/mine",
  ]);
});

test("hax @name alone or with flags is `hax site`, other commands are kept", () => {
  assert.deepEqual(rewrite(["@mine"]), ["site", "--root", "/sites/mine"]);
  assert.deepEqual(rewrite(["@mine", "--format", "json"]), [
    "site",
    "--format",
    "json",
    "--root",
    "/sites/mine",
  ]);
  assert.deepEqual(rewrite(["@mine", "serve"]), [
    "serve",
    "--root",
    "/sites/mine",
  ]);
  assert.deepEqual(rewrite(["@mine", "site", "site:items"]), [
    "site",
    "site:items",
    "--root",
    "/sites/mine",
  ]);
});

test("--source / --destination @name become rsync targets", () => {
  assert.deepEqual(rewrite(["site", "site:rsync", "--destination", "@mine"]), [
    "site",
    "site:rsync",
    "--destination",
    "user@host:/var/www/mine/",
  ]);
  assert.deepEqual(rewrite(["site", "site:rsync", "--source=@local"]), [
    "site",
    "site:rsync",
    `--source=/sites/local${path.sep}`,
  ]);
  // both at once, with a leading alias
  assert.deepEqual(
    rewrite(["@local", "site:rsync", "--destination", "@mine"]),
    [
      "site",
      "site:rsync",
      "--destination",
      "user@host:/var/www/mine/",
      "--root",
      "/sites/local",
    ],
  );
});

test("arguments that only look like aliases elsewhere are left alone", () => {
  assert.deepEqual(rewrite(["site", "node:add", "--title", "@mine"]), [
    "site",
    "node:add",
    "--title",
    "@mine",
  ]);
  assert.deepEqual(rewrite(["site", "site:stats"]), ["site", "site:stats"]);
});

test("unknown, remote-only and --root clashes are errors", () => {
  assert.throws(() => rewrite(["@nope", "site:stats"]), /@nope.*@mine/);
  assert.throws(() => rewrite(["@remote", "site:stats"]), /remote aliases/);
  assert.throws(
    () => rewrite(["site", "site:rsync", "--destination", "@remote"]),
    /remote aliases/,
  );
  assert.throws(
    () => rewrite(["@mine", "site:stats", "--root", "/x"]),
    /--root/,
  );
  assert.throws(() => rewrite(["@mine", "site:stats", "--root=/x"]), /--root/);
  assert.throws(
    () => aliases.resolveAliasArgv(ARGV.concat(["@a"]), {}),
    /none/,
  );
});

test("loadAliases reads the user file then project files, nearest wins", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hax-alias-"));
  try {
    const home = path.join(tmp, "home");
    const outer = path.join(tmp, "work");
    const inner = path.join(outer, "course");
    fs.mkdirSync(path.join(home, ".haxtheweb"), { recursive: true });
    fs.mkdirSync(inner, { recursive: true });
    fs.writeFileSync(
      path.join(home, ".haxtheweb", "aliases.yml"),
      "site:\n  root: ~/user-site\nonlyuser:\n  root: ~/u\n",
    );
    fs.writeFileSync(
      path.join(outer, "hax.aliases.yml"),
      "site:\n  root: ./outer-site\nouter:\n  root: ./o\n",
    );
    fs.writeFileSync(
      path.join(inner, "hax.aliases.yml"),
      "site:\n  root: ./inner-site\nbad name:\n  root: x\n",
    );
    const loaded = aliases.loadAliases(inner, home);
    assert.equal(loaded.aliases.site.root, path.join(inner, "inner-site"));
    assert.equal(loaded.aliases.outer.root, path.join(outer, "o"));
    assert.equal(loaded.aliases.onlyuser.root, path.join(home, "u"));
    assert.equal(loaded.files.length, 3);
    assert.equal(loaded.problems.length, 1);
    const rows = aliases.describeAliases(loaded);
    assert.deepEqual(
      rows.map((r) => [r.name, r.rootExists]),
      [
        ["@onlyuser", false],
        ["@outer", false],
        ["@site", false],
      ],
    );
    // nothing defined anywhere
    assert.deepEqual(
      aliases.loadAliases(tmp, path.join(tmp, "nobody")).files,
      [],
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
