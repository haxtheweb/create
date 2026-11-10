"use strict";

// Target 5: argument parsing for `hax site` / `hax webcomponent` names and
// paths, checked on the filesystem. create-cli.test.cjs asserts the exit code
// for a couple of bad names with the handlers mocked; this runs the built CLI
// and proves the property users depend on: a bad name or path exits 1 with a
// readable reason and writes NOTHING — not in the cwd, not next to it, not at
// an absolute path the name points to — and a good name writes only its own
// folder.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  isolatedEnv,
  cliSkipReason,
  hax,
  listTree,
  SITE_FLAGS,
} = require("../_helpers/cli-smoke.cjs");

const { env } = isolatedEnv("hax-pathsafety-home-");
const skipReason = cliSkipReason(env);
const opts = { skip: skipReason, timeout: 60000 };
const WC_FLAGS = ["--y", "--no-i", "--no-extras"];

// a sandbox with a working dir one level down, so "../x" has somewhere to land
function sandbox() {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), "hax-pathsafety-"));
  const cwd = path.join(outer, "cwd");
  fs.mkdirSync(cwd);
  return { outer, cwd };
}

function assertRejectedCleanly(res, outer, absoluteTarget) {
  assert.equal(res.status, 1, res.describe);
  assert.doesNotMatch(res.output, /\n\s+at .+:\d+:\d+/, "no stack trace");
  assert.deepEqual(listTree(outer), ["cwd"], "nothing written in the sandbox");
  if (absoluteTarget) {
    assert.ok(!fs.existsSync(absoluteTarget), `${absoluteTarget} not created`);
  }
}

// an absolute path outside the sandbox (in its own private temp dir) that a
// name must never be allowed to create
const absoluteName = () =>
  path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "hax-pathsafety-abs-")),
    "target",
  );

const BAD_NAMES = [
  ["parent traversal", "../escape-site", /special characters/i],
  ["nested path", "a/b", /special characters/i],
  ["backslash traversal", "..\\escape", /special characters/i],
  ["upper case", "MySite", /lower ?case/i],
  ["leading digit", "1site", /number/i],
  ["space", "my site", /space/i],
];

for (const [label, name, reason] of BAD_NAMES) {
  test(`hax site rejects a name with ${label}`, opts, () => {
    const { outer, cwd } = sandbox();
    try {
      const res = hax(env, ["site", name, ...SITE_FLAGS], cwd);
      assertRejectedCleanly(res, outer);
      assert.match(res.output, reason);
    } finally {
      fs.rmSync(outer, { recursive: true, force: true });
    }
  });
}

test(
  "hax site --name rejects traversal the same as the positional",
  opts,
  () => {
    const { outer, cwd } = sandbox();
    try {
      const res = hax(
        env,
        ["site", "--name", "../escape-site", ...SITE_FLAGS],
        cwd,
      );
      assertRejectedCleanly(res, outer);
    } finally {
      fs.rmSync(outer, { recursive: true, force: true });
    }
  },
);

test("hax site rejects an absolute path as a name", opts, () => {
  const { outer, cwd } = sandbox();
  const target = absoluteName();
  try {
    const res = hax(env, ["site", target, ...SITE_FLAGS], cwd);
    assertRejectedCleanly(res, outer, target);
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
    fs.rmSync(path.dirname(target), { recursive: true, force: true });
  }
});

const BAD_WC_NAMES = [
  ["parent traversal", "../evil-el", /special characters/i],
  ["nested path", "evil/el-x", /special characters/i],
  ["no hyphen", "nodash", /-|hyphen|dash/i],
  ["leading hyphen", "-bad-el", /-|hyphen|dash/i],
  ["double hyphen", "bad--el", /-|hyphen|dash/i],
  ["upper case", "Evil-El", /lower ?case/i],
];

for (const [label, name, reason] of BAD_WC_NAMES) {
  test(`hax webcomponent rejects a name with ${label}`, opts, () => {
    const { outer, cwd } = sandbox();
    try {
      const res = hax(env, ["webcomponent", name, ...WC_FLAGS], cwd);
      assertRejectedCleanly(res, outer);
      assert.match(res.output, reason);
    } finally {
      fs.rmSync(outer, { recursive: true, force: true });
    }
  });
}

test("hax webcomponent rejects an absolute path as a name", opts, () => {
  const { outer, cwd } = sandbox();
  const target = `${absoluteName()}-el`;
  try {
    const res = hax(env, ["webcomponent", target, ...WC_FLAGS], cwd);
    assertRejectedCleanly(res, outer, target);
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
    fs.rmSync(path.dirname(target), { recursive: true, force: true });
  }
});

test("a valid webcomponent name writes only its own folder", opts, () => {
  const { outer, cwd } = sandbox();
  try {
    const res = hax(env, ["webcomponent", "safe-el", ...WC_FLAGS], cwd);
    assert.equal(res.status, 0, res.describe);
    const tree = listTree(outer);
    const stray = tree.filter(
      (rel) =>
        rel !== "cwd" &&
        rel !== path.join("cwd", "safe-el") &&
        !rel.startsWith(path.join("cwd", "safe-el") + path.sep),
    );
    assert.deepEqual(stray, [], "nothing outside cwd/safe-el");
    assert.ok(fs.existsSync(path.join(cwd, "safe-el", "safe-el.js")));
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
  }
});

test("webcomponent over an existing folder exits 1 and keeps it", opts, () => {
  const { outer, cwd } = sandbox();
  try {
    const existing = path.join(cwd, "taken-el");
    fs.mkdirSync(existing);
    fs.writeFileSync(path.join(existing, "mine.txt"), "keep");
    const res = hax(env, ["webcomponent", "taken-el", ...WC_FLAGS], cwd);
    assert.equal(res.status, 1, res.describe);
    assert.match(res.output, /exists, rename this project/);
    assert.deepEqual(listTree(existing), ["mine.txt"]);
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
  }
});

test("a --path that does not exist exits 1 and creates nothing", opts, () => {
  const { outer, cwd } = sandbox();
  try {
    const missing = path.join(outer, "not-here");
    const res = hax(
      env,
      ["site", "--name", "fine-site", "--path", missing, ...SITE_FLAGS],
      cwd,
    );
    assertRejectedCleanly(res, outer);
    assert.ok(!fs.existsSync(missing), "--path is not auto-created");
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
  }
});

test("a site action outside any site exits 1 and writes nothing", opts, () => {
  const { outer, cwd } = sandbox();
  try {
    // no site.json here, so site:items must not run (or create a site named
    // after the action) and its --to-file target must not appear
    const out = path.join(outer, "items.json");
    const res = hax(
      env,
      [
        "site",
        "site:items",
        "--format",
        "json",
        "--to-file",
        out,
        "--y",
        "--no-i",
      ],
      cwd,
    );
    assertRejectedCleanly(res, outer);
    assert.ok(!fs.existsSync(out));
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
  }
});
