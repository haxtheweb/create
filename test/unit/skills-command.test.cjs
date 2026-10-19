"use strict";

// Covers skillsCommandDetected() in src/lib/programs/skills.js — the list /
// no-action listing branches and the install branch (specific skill name,
// --all / --y / positional name, unknown names, and the non-interactive
// no-name error). The bundled skills
// live in src/skills/ so this works in the dev tree as well as the built
// dist. Install targets are temp dirs; @clack/prompts is patched via the
// shared clack stub.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { installClackStub } = require("../_helpers/clack-stub.cjs");
const stub = installClackStub();

require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");

const intros = [];
stub.intro = (msg) => {
  intros.push(String(msg));
};
const outros = [];
stub.outro = (msg) => {
  outros.push(String(msg));
};

const {
  skillsCommandDetected,
  listBundledSkills,
} = require("../../src/lib/programs/skills.js");

const opts = { timeout: 15000 };

function resetMocks() {
  intros.length = 0;
  outros.length = 0;
  process.env.haxquiet = "";
}

test("with no action the bundled skills are listed", opts, async () => {
  resetMocks();
  await skillsCommandDetected({ arguments: {}, options: {} });
  assert.ok(
    intros.some((m) => m.includes("Bundled agent skills")),
    "header intro",
  );
  assert.ok(outros.length === 1, "install hint outro");
});

test(
  "list action with json format prints the skills as json",
  opts,
  async () => {
    resetMocks();
    const originalWrite = process.stdout.write;
    const logs = [];
    process.stdout.write = (chunk) => {
      logs.push(String(chunk));
      return true;
    };
    try {
      await skillsCommandDetected({
        arguments: { action: "list" },
        options: { format: "json" },
      });
      const jsonLine = logs.find((l) => l.trim().startsWith("["));
      assert.ok(jsonLine, "json list printed to stdout");
      const parsed = JSON.parse(jsonLine);
      assert.ok(Array.isArray(parsed));
      assert.ok(parsed.length >= 1);
      assert.equal(typeof parsed[0].name, "string");
    } finally {
      process.stdout.write = originalWrite;
    }
  },
);

test(
  "install action installs a specific skill into --path",
  opts,
  async (t) => {
    resetMocks();
    const skills = listBundledSkills();
    if (skills.length === 0) {
      t.skip("no bundled skills available to install");
      return;
    }
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "hax-skills-target-"));
    try {
      await skillsCommandDetected({
        arguments: { action: "install" },
        options: { skillName: skills[0].name, path: target },
      });
      assert.ok(
        fs.existsSync(path.join(target, skills[0].dir, "SKILL.md")),
        "skill installed into target",
      );
      assert.ok(
        outros.some((m) => m.includes("1 skill(s) installed")),
        "install outro",
      );
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  },
);

test("install action with --y installs all skills", opts, async (t) => {
  resetMocks();
  const skills = listBundledSkills();
  if (skills.length === 0) {
    t.skip("no bundled skills available to install");
    return;
  }
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "hax-skills-all-"));
  try {
    await skillsCommandDetected({
      arguments: { action: "install" },
      options: { y: true, path: target },
    });
    for (const skill of skills) {
      assert.ok(
        fs.existsSync(path.join(target, skill.dir, "SKILL.md")),
        `${skill.name} installed`,
      );
    }
    assert.ok(
      outros.some((m) => m.includes(`${skills.length} skill(s) installed`)),
    );
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test(
  "install action without a name errors in non-interactive mode",
  opts,
  async () => {
    resetMocks();
    // --no-i sets options.i to false; it is the non-interactive case
    await skillsCommandDetected({
      arguments: { action: "install" },
      options: { i: false },
    });
    // the error goes through log(); no install happens and the exit code fails
    assert.equal(outros.length, 0);
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
  },
);

test("install action with --all installs every skill", opts, async (t) => {
  resetMocks();
  const skills = listBundledSkills();
  if (skills.length === 0) {
    t.skip("no bundled skills available to install");
    return;
  }
  const target = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "hax-skills-all-")),
    "not-yet-created",
  );
  try {
    await skillsCommandDetected({
      arguments: { action: "install" },
      options: { all: true, i: false, path: target },
    });
    for (const skill of skills) {
      assert.ok(
        fs.existsSync(path.join(target, skill.dir, "SKILL.md")),
        `${skill.name} installed`,
      );
    }
  } finally {
    fs.rmSync(path.dirname(target), { recursive: true, force: true });
  }
});

test(
  "install action accepts the skill name as a positional argument",
  opts,
  async (t) => {
    resetMocks();
    const skills = listBundledSkills();
    if (skills.length === 0) {
      t.skip("no bundled skills available to install");
      return;
    }
    const target = fs.mkdtempSync(
      path.join(os.tmpdir(), "hax-skills-positional-"),
    );
    try {
      await skillsCommandDetected({
        arguments: { action: "install", name: skills[0].name },
        options: { i: false, path: target },
      });
      assert.ok(
        fs.existsSync(path.join(target, skills[0].dir, "SKILL.md")),
        "skill installed",
      );
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  },
);

test("install action with an unknown skill name fails", opts, async () => {
  resetMocks();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "hax-skills-unknown-"));
  try {
    await skillsCommandDetected({
      arguments: { action: "install", name: "not-a-real-skill" },
      options: { i: false, path: target },
    });
    assert.equal(outros.length, 0);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = 0;
    fs.rmSync(target, { recursive: true, force: true });
  }
});
