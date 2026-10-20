"use strict";

// Transpile ESM src on the fly so .cjs tests can require() it.
// (create's src is ESM-syntax, compiled to CJS by Babel for dist/; tests hit src directly.)
require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateNpmClient,
  rejectShellMetacharacters,
  validateDomain,
  validateWebcomponentName,
  dashToCamel,
  camelToDash,
  capitalizeFirstLetter,
  getTimeDifference,
  generateUUID,
  gitIdentityFallbackArgs,
  rejectLeadingDash,
  githubRepoLink,
  hasNameSpecialCharacters,
  isValidGithubOwner,
  isValidGithubRepo,
  runCommand,
  initGitRepo,
} = require("../../src/lib/utils.js");

// --- Security validators: a regression = command injection ---

test("validateNpmClient accepts the allowlisted clients", () => {
  assert.equal(validateNpmClient("npm"), "npm");
  assert.equal(validateNpmClient("yarn"), "yarn");
  assert.equal(validateNpmClient("pnpm"), "pnpm");
});

test("validateNpmClient rejects non-allowlisted values, including injection attempts", () => {
  assert.throws(
    () => validateNpmClient("npm; rm -rf ~"),
    /Invalid --npm-client/,
  );
  assert.throws(() => validateNpmClient(""), /Invalid --npm-client/);
  assert.throws(() => validateNpmClient(undefined), /Invalid --npm-client/);
  assert.throws(() => validateNpmClient(123), /Invalid --npm-client/);
});

test("rejectShellMetacharacters passes through safe values", () => {
  assert.equal(rejectShellMetacharacters("my-site", "domain"), "my-site");
  assert.equal(
    rejectShellMetacharacters("sub.example.com", "domain"),
    "sub.example.com",
  );
});

test("rejectShellMetacharacters allows empty / undefined / null", () => {
  assert.equal(rejectShellMetacharacters("", "name"), "");
  assert.equal(rejectShellMetacharacters(undefined, "name"), undefined);
  assert.equal(rejectShellMetacharacters(null, "name"), null);
});

test("rejectShellMetacharacters rejects every dangerous metacharacter", () => {
  const dangerous = [
    "a; b",
    "a && b",
    "a | b",
    "a`b",
    "a$(b)",
    "a > b",
    "a!b",
    "a\nb",
    "a\\b",
  ];
  for (const bad of dangerous) {
    assert.throws(
      () => rejectShellMetacharacters(bad, "name"),
      /shell metacharacters are not allowed/,
      `expected rejection for: ${JSON.stringify(bad)}`,
    );
  }
});

test("rejectShellMetacharacters rejects non-string values", () => {
  assert.throws(
    () => rejectShellMetacharacters(123, "name"),
    /shell metacharacters are not allowed/,
  );
});

test("validateDomain accepts hostnames and host:port", () => {
  assert.equal(validateDomain("example.com"), "example.com");
  assert.equal(validateDomain("sub.example.com:8080"), "sub.example.com:8080");
  assert.equal(validateDomain("my-site"), "my-site");
});

test("validateDomain allows empty / undefined / null", () => {
  assert.equal(validateDomain(""), "");
  assert.equal(validateDomain(undefined), undefined);
  assert.equal(validateDomain(null), null);
});

test("validateDomain rejects values outside the hostname charset", () => {
  assert.throws(() => validateDomain("example.com; rm"), /Invalid --domain/);
  assert.throws(() => validateDomain("a$b"), /Invalid --domain/);
  assert.throws(() => validateDomain("a b"), /Invalid --domain/);
});

// --- Web component name validator (spec-style: error string | null) ---

test("validateWebcomponentName returns null for valid names", () => {
  assert.equal(validateWebcomponentName("my-component"), null);
  assert.equal(validateWebcomponentName("a11y-collapse"), null);
  assert.equal(validateWebcomponentName("my-amazing-element"), null);
});

test("validateWebcomponentName flags missing, reserved, uppercase, leading-digit names", () => {
  assert.match(validateWebcomponentName(""), /Name is required/);
  assert.match(
    validateWebcomponentName("font-face"),
    /Reserved name font-face cannot be used/,
  );
  assert.match(validateWebcomponentName("My-Component"), /must be lowercase/);
  assert.match(
    validateWebcomponentName("1-thing"),
    /cannot start with a number/,
  );
});

test("validateWebcomponentName rejects special characters and spaces", () => {
  assert.match(
    validateWebcomponentName("my$comp"),
    /No special characters allowed/,
  );
  assert.match(validateWebcomponentName("my comp"), /No spaces allowed/);
});

test("validateWebcomponentName requires a hyphen and forbids leading/trailing hyphen", () => {
  assert.match(
    validateWebcomponentName("mycomponent"),
    /must include at least one `-`/,
  );
  assert.match(
    validateWebcomponentName("-mycomp"),
    /must include at least one `-`/,
  );
  assert.match(
    validateWebcomponentName("mycomp-"),
    /must include at least one `-`/,
  );
});

test("validateWebcomponentName reports registry collisions unless force is set", () => {
  const wcReg = { "my-component": {} };
  assert.match(
    validateWebcomponentName("my-component", { wcReg, force: false }),
    /already a web component in the wc-registry/,
  );
  // force bypasses the collision check
  assert.equal(
    validateWebcomponentName("my-component", { wcReg, force: true }),
    null,
  );
});

// --- Pure string / time / id helpers ---

test("dashToCamel capitalizes and removes hyphens", () => {
  assert.equal(dashToCamel("my-component"), "MyComponent");
  assert.equal(dashToCamel("a11y-collapse"), "A11yCollapse");
});

test("camelToDash lowercases and inserts hyphens", () => {
  assert.equal(camelToDash("MyComponent"), "my-component");
  assert.equal(camelToDash("A11yCollapse"), "a11y-collapse");
});

test("capitalizeFirstLetter uppercases only the first character", () => {
  assert.equal(capitalizeFirstLetter("hello"), "Hello");
  assert.equal(capitalizeFirstLetter(""), "");
  assert.equal(capitalizeFirstLetter("aBC"), "ABC");
});

test("getTimeDifference breaks an interval into day/hour/minute/second", () => {
  // exactly 1 day, 1 hour, 1 minute, 1 second
  assert.deepEqual(
    getTimeDifference("2020-01-01T00:00:00Z", "2020-01-02T01:01:01Z"),
    { days: 1, hours: 1, minutes: 1, seconds: 1 },
  );
});

test("getTimeDifference reports invalid dates", () => {
  assert.equal(
    getTimeDifference("not-a-date", "2020-01-01"),
    "Invalid date format",
  );
});

test("generateUUID returns unique UUIDv4-shaped strings", () => {
  assert.match(
    generateUUID(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  assert.notEqual(generateUUID(), generateUUID());
});

// haxtheweb/issues#3119: scaffold commits must succeed with no git identity
test("gitIdentityFallbackArgs supplies -c identity only when none is configured", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const keys = [
    "GIT_AUTHOR_NAME",
    "GIT_AUTHOR_EMAIL",
    "GIT_COMMITTER_NAME",
    "GIT_COMMITTER_EMAIL",
    "EMAIL",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_NOSYSTEM",
  ];
  const saved = {};
  keys.forEach((key) => {
    saved[key] = process.env[key];
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hax-ident-"));
  const originalWrite = process.stderr.write;
  process.stderr.write = () => true;
  try {
    keys.forEach((key) => {
      delete process.env[key];
    });
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    process.env.GIT_CONFIG_GLOBAL = path.join(dir, "empty-gitconfig");
    const args = await gitIdentityFallbackArgs(dir);
    assert.deepEqual(args, [
      "-c",
      "user.name=HAX CLI",
      "-c",
      "user.email=hax@localhost",
    ]);
    process.env.GIT_AUTHOR_NAME = "Someone";
    process.env.GIT_AUTHOR_EMAIL = "someone@local.invalid";
    assert.deepEqual(await gitIdentityFallbackArgs(dir), []);
  } finally {
    process.stderr.write = originalWrite;
    keys.forEach((key) => {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Security (round 2) helpers ---

test("rejectLeadingDash blocks option-looking values (R2-M-1)", () => {
  assert.equal(
    rejectLeadingDash("user@host:/var/www", "destination"),
    "user@host:/var/www",
  );
  assert.equal(rejectLeadingDash(undefined, "destination"), undefined);
  assert.equal(rejectLeadingDash("", "destination"), "");
  assert.throws(
    () => rejectLeadingDash("-e touch /tmp/x", "destination"),
    /cannot start with/,
  );
  assert.throws(
    () => rejectLeadingDash("  --rsync-path=x", "source"),
    /cannot start with/,
  );
  assert.throws(() => rejectLeadingDash(42, "source"), /cannot start with/);
});

test("hasNameSpecialCharacters rejects injection / traversal characters incl. tabs (R2-H-2, R2-M-2)", () => {
  for (const ok of ["mysite", "my-site", "custom-my-theme", "site2"]) {
    assert.equal(hasNameSpecialCharacters(ok), false, ok);
  }
  for (const bad of [
    "a;b",
    "a\ttouch",
    "a b",
    "../x",
    "a/b",
    "a.b",
    'a"b',
    "a'b",
    "a$b",
    "a`b",
    "a|b",
    "a&b",
    "a_b",
    "a\nb",
  ]) {
    assert.equal(hasNameSpecialCharacters(bad), true, JSON.stringify(bad));
  }
  assert.equal(hasNameSpecialCharacters(undefined), true);
});

test("isValidGithubOwner / isValidGithubRepo (R2-L-2)", () => {
  assert.equal(isValidGithubOwner("btopro"), true);
  assert.equal(isValidGithubOwner("hax-the-web"), true);
  assert.equal(isValidGithubOwner("Jane Doe"), false);
  assert.equal(isValidGithubOwner("a;b"), false);
  assert.equal(isValidGithubOwner("-lead"), false);
  assert.equal(isValidGithubOwner(""), false);
  assert.equal(isValidGithubRepo("webcomponents"), true);
  assert.equal(isValidGithubRepo("haxcms.nodejs_x"), true);
  assert.equal(isValidGithubRepo("a b"), false);
  assert.equal(isValidGithubRepo("a/b"), false);
  assert.equal(isValidGithubRepo(".."), false);
  assert.equal(isValidGithubRepo("x;id"), false);
});

test("runCommand passes args literally, never through a shell (R2-L-1)", async () => {
  if (process.platform === "win32") return;
  const { stdout } = await runCommand(process.execPath, [
    "-e",
    "process.stdout.write(process.argv[1])",
    "a; echo pwned $(id)",
  ]);
  assert.equal(stdout, "a; echo pwned $(id)");
});

test("initGitRepo works in a directory whose name contains shell syntax (R2-H-2)", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "hax-git-"));
  // a shell would run `touch hax-r2-pwned` in the process cwd
  const marker = path.join(process.cwd(), "hax-r2-pwned");
  const dir = path.join(base, "a;touch hax-r2-pwned;b");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "index.html"), "<p>hi</p>");
  const originalWrite = process.stderr.write;
  process.stderr.write = () => true;
  const savedName = process.env.GIT_AUTHOR_NAME;
  const savedEmail = process.env.GIT_AUTHOR_EMAIL;
  try {
    process.env.GIT_AUTHOR_NAME = "Test";
    process.env.GIT_AUTHOR_EMAIL = "test@local.invalid";
    process.env.GIT_COMMITTER_NAME = "Test";
    process.env.GIT_COMMITTER_EMAIL = "test@local.invalid";
    await initGitRepo(dir, "https://github.com/example/site.git");
    assert.equal(
      fs.existsSync(marker),
      false,
      "shell syntax in the path must not run",
    );
    const { stdout } = await runCommand(
      "git",
      ["remote", "get-url", "origin"],
      { cwd: dir },
    );
    assert.equal(stdout.trim(), "https://github.com/example/site.git");
    await assert.rejects(
      () => initGitRepo(dir, "--upload-pack=touch x"),
      /cannot start with/,
    );
  } finally {
    process.stderr.write = originalWrite;
    if (savedName === undefined) delete process.env.GIT_AUTHOR_NAME;
    else process.env.GIT_AUTHOR_NAME = savedName;
    if (savedEmail === undefined) delete process.env.GIT_AUTHOR_EMAIL;
    else process.env.GIT_AUTHOR_EMAIL = savedEmail;
    delete process.env.GIT_COMMITTER_NAME;
    delete process.env.GIT_COMMITTER_EMAIL;
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// --- githubRepoLink: host is parsed, not substring-matched ---

test("githubRepoLink builds a link for github.com remotes", () => {
  assert.equal(
    githubRepoLink("https://github.com/haxtheweb/create.git"),
    "https://github.com/haxtheweb/create",
  );
  assert.equal(
    githubRepoLink("git@github.com:haxtheweb/create.git"),
    "https://github.com/haxtheweb/create",
  );
  assert.equal(
    githubRepoLink("https://github.com/haxtheweb/create"),
    "https://github.com/haxtheweb/create",
  );
});

test("githubRepoLink rejects non-github hosts and bad input", () => {
  assert.equal(githubRepoLink("https://evil.example/github.com/x/y.git"), null);
  assert.equal(githubRepoLink("https://github.com.evil.example/x/y"), null);
  assert.equal(githubRepoLink("git@gitlab.com:x/y.git"), null);
  assert.equal(githubRepoLink("ssh://github.com/x/y.git"), null);
  assert.equal(githubRepoLink(""), null);
  assert.equal(githubRepoLink(undefined), null);
});
