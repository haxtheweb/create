// Property-based fuzzing (fast-check) of the security-relevant string helpers
// in src/lib/utils.js and src/lib/site-security.js. These take attacker- or
// user-controlled input, so the properties are "never throws unexpectedly" and
// "never lets the dangerous thing through". Mirrors haxcms-nodejs
// test/unit/security-helpers-fuzz.test.cjs.
"use strict";

require("@babel/register");

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fc = require("fast-check");
const {
  githubRepoLink,
  rejectShellMetacharacters,
  rejectLeadingDash,
  hasNameSpecialCharacters,
  isValidGithubOwner,
  isValidGithubRepo,
  validateDomain,
  validateNpmClient,
  validateWebcomponentName,
} = require("../../src/lib/utils.js");
const { resolveLocalPath } = require("../../src/lib/site-security.js");

const RUNS = { numRuns: 300 };

const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

test("githubRepoLink never throws and only returns github.com http(s) URLs", () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      const out = githubRepoLink(value);
      if (out !== null) {
        assert.equal(typeof out, "string");
        const url = new URL(out);
        assert.equal(url.hostname, "github.com");
        assert.ok(url.protocol === "https:" || url.protocol === "http:");
      }
    }),
    RUNS,
  );
  fc.assert(
    fc.property(fc.webUrl(), (value) => {
      const out = githubRepoLink(value);
      if (out !== null) {
        assert.equal(new URL(value).hostname, "github.com");
      }
    }),
    RUNS,
  );
});

test("githubRepoLink rejects github.com appearing outside the host", () => {
  fc.assert(
    fc.property(
      fc.domain().filter((d) => d !== "github.com"),
      fc.string({ maxLength: 10 }),
      (host, rest) => {
        assert.equal(
          githubRepoLink(`https://${host}/github.com/${rest}`),
          null,
        );
        assert.equal(githubRepoLink(`https://${host}/?u=github.com`), null);
        assert.equal(
          githubRepoLink(`https://github.com.${host}/${rest}`),
          null,
        );
      },
    ),
    RUNS,
  );
});

test("githubRepoLink accepts well-formed owner/repo remotes in both forms", () => {
  const owner = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9-]{0,20}$/);
  const repo = fc.stringMatching(/^[A-Za-z0-9_-]{1,20}$/);
  fc.assert(
    fc.property(owner, repo, (o, r) => {
      const want = `https://github.com/${o}/${r}`;
      assert.equal(githubRepoLink(`${want}.git`), want);
      assert.equal(githubRepoLink(`git@github.com:${o}/${r}.git`), want);
    }),
    RUNS,
  );
});

test("rejectShellMetacharacters throws for any shell metacharacter", () => {
  const meta = fc.constantFrom(...";&|`$<>!(){}#\n\r\\".split(""));
  fc.assert(
    fc.property(fc.string(), meta, fc.string(), (a, m, b) => {
      assert.ok(throws(() => rejectShellMetacharacters(a + m + b, "opt")));
    }),
    RUNS,
  );
  fc.assert(
    fc.property(fc.string(), (v) => {
      let out;
      try {
        out = rejectShellMetacharacters(v, "opt");
      } catch {
        return;
      }
      assert.equal(out, v);
    }),
    RUNS,
  );
});

test("rejectLeadingDash throws whenever the trimmed value starts with '-'", () => {
  fc.assert(
    fc.property(fc.stringMatching(/^[ \t]{0,3}$/), fc.string(), (ws, rest) => {
      assert.ok(throws(() => rejectLeadingDash(`${ws}-${rest}`, "opt")));
    }),
    RUNS,
  );
});

test("hasNameSpecialCharacters flags every path / quote / whitespace char", () => {
  const bad = fc.constantFrom(..."/\\.'\"; $`\t\n".split(""));
  fc.assert(
    fc.property(fc.string(), bad, fc.string(), (a, c, b) => {
      assert.equal(hasNameSpecialCharacters(a + c + b), true);
    }),
    RUNS,
  );
  fc.assert(
    fc.property(
      fc.anything().filter((v) => typeof v !== "string"),
      (v) => {
        assert.equal(hasNameSpecialCharacters(v), true);
      },
    ),
    RUNS,
  );
});

test("isValidGithubOwner / isValidGithubRepo never accept separators or traversal", () => {
  fc.assert(
    fc.property(fc.anything(), (v) => {
      for (const fn of [isValidGithubOwner, isValidGithubRepo]) {
        const ok = fn(v);
        assert.equal(typeof ok, "boolean");
        if (ok) {
          assert.equal(typeof v, "string");
          assert.ok(!/[/\\\s:@]/.test(v));
          assert.notEqual(v, "..");
        }
      }
    }),
    RUNS,
  );
});

test("validateDomain only lets hostname characters through", () => {
  fc.assert(
    fc.property(fc.string(), (v) => {
      let out;
      try {
        out = validateDomain(v);
      } catch {
        return;
      }
      assert.equal(out, v);
      assert.ok(v === "" || /^[A-Za-z0-9.\-:]+$/.test(v));
    }),
    RUNS,
  );
});

test("validateNpmClient only returns allow-listed clients", () => {
  fc.assert(
    fc.property(fc.anything(), (v) => {
      let out;
      try {
        out = validateNpmClient(v);
      } catch {
        return;
      }
      assert.ok(["npm", "yarn", "pnpm"].includes(out));
    }),
    RUNS,
  );
});

test("validateWebcomponentName accepts only lowercase dashed slugs", () => {
  fc.assert(
    fc.property(fc.string(), (v) => {
      const err = validateWebcomponentName(v, { checkExists: false });
      if (err === null) {
        assert.match(v, /^[a-z][a-z0-9.-]*-[a-z0-9.-]*$/);
        assert.ok(!/[/\\\s]/.test(v));
      }
    }),
    RUNS,
  );
});

test("resolveLocalPath rejects NUL and non-strings, else returns an absolute path", () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (a, b) => {
      assert.ok(throws(() => resolveLocalPath(a + "\0" + b)));
    }),
    RUNS,
  );
  fc.assert(
    fc.property(
      fc.anything().filter((v) => typeof v !== "string"),
      (v) => {
        assert.ok(throws(() => resolveLocalPath(v)));
      },
    ),
    RUNS,
  );
  fc.assert(
    fc.property(
      fc.string().filter((s) => !s.includes("\0")),
      (s) => {
        assert.ok(path.isAbsolute(resolveLocalPath(s)));
      },
    ),
    RUNS,
  );
});
