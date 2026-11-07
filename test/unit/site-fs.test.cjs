"use strict";

// Isolate HOME BEFORE requiring site.js (via the canary) so HAXCMS init and any
// config writes land in a temp dir, not the real ~/.haxtheweb.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ISOLATED_HOME = fs.mkdtempSync(
  path.join(os.tmpdir(), "hax-sitefs-test-"),
);
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  available,
  skipReason,
  module: siteModule,
} = require("../_helpers/site-canary.cjs");

const {
  cleanupSiteForPublish,
  fixLegacyIgnoreFile,
  prepareSiteForStaticPublish,
  restoreSiteAfterStaticPublish,
  staticPublishStashDir,
  stashStaticPublishArtifacts,
  unstashStaticPublishArtifacts,
  buildStaticLlmsFull,
  writeStaticLlmsFull,
  removeStaticLlmsFull,
  readSurgeCnameDomain,
  surgeUsesNewGrammar,
} = available ? siteModule : {};

const opts = { skip: skipReason, timeout: 15000 };

// --- cleanupSiteForPublish: broken-symlink finder/unlinker ---

test(
  "cleanupSiteForPublish returns [] for a nonexistent directory",
  opts,
  () => {
    assert.deepEqual(
      cleanupSiteForPublish(path.join(ISOLATED_HOME, "no-such-dir")),
      [],
    );
  },
);

test(
  "cleanupSiteForPublish finds and unlinks broken symlinks, leaves valid ones",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-cleanup-"));
    try {
      const broken = path.join(root, "broken-link");
      const valid = path.join(root, "valid-link");
      const realFile = path.join(root, "real.txt");
      fs.writeFileSync(realFile, "hi");
      fs.symlinkSync(path.join(root, "does-not-exist"), broken);
      fs.symlinkSync(realFile, valid);

      const found = cleanupSiteForPublish(root);

      assert.equal(found.length, 1, "only the broken symlink is reported");
      assert.equal(found[0], broken);
      assert.ok(!fs.existsSync(broken), "broken symlink was unlinked");
      assert.ok(fs.existsSync(valid), "valid symlink is untouched");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "cleanupSiteForPublish does not recurse into node_modules (broken links there are left)",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-cleanup-nm-"));
    try {
      fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
      const nmBroken = path.join(root, "node_modules", "nm-broken");
      fs.symlinkSync(path.join(root, "nope"), nmBroken);

      const found = cleanupSiteForPublish(root);

      assert.ok(
        !found.includes(nmBroken),
        "broken symlink inside node_modules is NOT reported",
      );
      // existsSync follows the symlink and returns false for any broken symlink,
      // so use lstatSync to prove the symlink entry itself is still present
      // (i.e. it was NOT unlinked). lstatSync throws if the entry was removed.
      let stillPresent = false;
      try {
        stillPresent = fs.lstatSync(nmBroken).isSymbolicLink();
      } catch {
        stillPresent = false;
      }
      assert.ok(
        stillPresent,
        "broken symlink inside node_modules is left in place",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- fixLegacyIgnoreFile: rewrites legacy !node_modules/ ignore files ---

test(
  "fixLegacyIgnoreFile returns false when the file does not exist",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-ignore-missing-"));
    try {
      assert.equal(fixLegacyIgnoreFile(root, ".surgeignore"), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "fixLegacyIgnoreFile rewrites a legacy .surgeignore and returns true",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-ignore-surge-"));
    try {
      const file = path.join(root, ".surgeignore");
      fs.writeFileSync(file, "!node_modules/\nsome-other\n");
      assert.equal(fixLegacyIgnoreFile(root, ".surgeignore"), true);
      const after = fs.readFileSync(file, "utf8");
      assert.ok(
        after.startsWith("node_modules\ndist\n"),
        "rewritten with the modern header",
      );
      assert.ok(!after.includes("!node_modules/"), "legacy line is gone");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "fixLegacyIgnoreFile rewrites .netlifyignore and .vercelignore",
  opts,
  () => {
    for (const name of [".netlifyignore", ".vercelignore"]) {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "hax-ignore-" + name.slice(1) + "-"),
      );
      try {
        const file = path.join(root, name);
        fs.writeFileSync(file, "!node_modules/\nfoo\n");
        assert.equal(fixLegacyIgnoreFile(root, name), true);
        const after = fs.readFileSync(file, "utf8");
        assert.ok(
          after.startsWith("node_modules\ndist\n"),
          name + " rewritten with modern header",
        );
        assert.ok(
          !after.includes("!node_modules/"),
          name + " legacy line gone",
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
);

test(
  "fixLegacyIgnoreFile returns false when contents have no legacy line",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-ignore-clean-"));
    try {
      const file = path.join(root, ".surgeignore");
      const original = "node_modules\ndist\n";
      fs.writeFileSync(file, original);
      assert.equal(fixLegacyIgnoreFile(root, ".surgeignore"), false);
      assert.equal(fs.readFileSync(file, "utf8"), original, "file unchanged");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- prepareSiteForStaticPublish / restoreSiteAfterStaticPublish round-trip ---

test(
  "prepareSiteForStaticPublish returns false for a nonexistent directory",
  opts,
  () => {
    assert.equal(
      prepareSiteForStaticPublish(path.join(os.tmpdir(), "hax-no-such-site")),
      false,
    );
  },
);

test(
  "prepareSiteForStaticPublish does not swap index when there is no ghpages.html",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-prep-nogh-"));
    try {
      fs.writeFileSync(path.join(root, "index.html"), "original index");
      assert.equal(prepareSiteForStaticPublish(root).indexSwapped, false);
      assert.equal(
        fs.readFileSync(path.join(root, "index.html"), "utf8"),
        "original index",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "prepare/restore round-trip swaps ghpages.html in and restores the original index",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-prep-rt-"));
    try {
      fs.writeFileSync(path.join(root, "index.html"), "ORIGINAL INDEX");
      fs.writeFileSync(path.join(root, "ghpages.html"), "GHPAGES ENTRY");

      // prepare: back up index, copy ghpages -> index
      assert.equal(prepareSiteForStaticPublish(root).indexSwapped, true);
      assert.equal(
        fs.readFileSync(path.join(root, "index.html"), "utf8"),
        "GHPAGES ENTRY",
      );
      assert.equal(
        fs.readFileSync(path.join(root, "index.html.bak"), "utf8"),
        "ORIGINAL INDEX",
      );

      // restore: copy bak back over index, remove bak
      assert.equal(restoreSiteAfterStaticPublish(root), true);
      assert.equal(
        fs.readFileSync(path.join(root, "index.html"), "utf8"),
        "ORIGINAL INDEX",
      );
      assert.ok(
        !fs.existsSync(path.join(root, "index.html.bak")),
        "backup removed after restore",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

// Security / data loss: local artifacts are moved aside for the publish and
// moved back afterwards; a real build/ directory is never deleted.
test(
  "prepareSiteForStaticPublish moves build/, wc-registry.json and assets/babel* aside and restore brings them back byte-identical",
  opts,
  () => {
    const parent = fs.mkdtempSync(
      path.join(os.tmpdir(), "hax-prep-artifacts-"),
    );
    const root = path.join(parent, "site");
    fs.mkdirSync(root);
    try {
      fs.writeFileSync(path.join(root, "ghpages.html"), "entry");
      fs.mkdirSync(path.join(root, "build", "es6"), { recursive: true });
      fs.writeFileSync(path.join(root, "build", "x.js"), "x");
      fs.writeFileSync(path.join(root, "build", "es6", "y.js"), "yy");
      fs.writeFileSync(path.join(root, "wc-registry.json"), '{"a":"b"}');
      fs.mkdirSync(path.join(root, "assets"));
      fs.writeFileSync(path.join(root, "assets", "babel-top.js"), "babel");
      fs.writeFileSync(path.join(root, "assets", "logo.svg"), "<svg/>");

      const state = prepareSiteForStaticPublish(root);
      assert.deepEqual(state.stash.moved.sort(), [
        path.join("assets", "babel-top.js"),
        "build",
        "wc-registry.json",
      ]);
      assert.deepEqual(state.stash.skipped, []);
      const stash = staticPublishStashDir(root);
      assert.equal(stash, state.stash.stashDir);
      assert.ok(
        !stash.startsWith(root + path.sep),
        "stash lives outside the site so it cannot be published",
      );

      // gone from the live site while publishing...
      assert.ok(!fs.existsSync(path.join(root, "build")), "build/ moved out");
      assert.ok(!fs.existsSync(path.join(root, "wc-registry.json")));
      assert.ok(!fs.existsSync(path.join(root, "assets", "babel-top.js")));
      assert.ok(
        fs.existsSync(path.join(root, "assets", "logo.svg")),
        "non-babel assets untouched",
      );
      // ...but preserved, not deleted
      assert.equal(
        fs.readFileSync(path.join(stash, "build", "es6", "y.js"), "utf8"),
        "yy",
      );

      assert.equal(restoreSiteAfterStaticPublish(root), true);
      assert.equal(
        fs.readFileSync(path.join(root, "build", "x.js"), "utf8"),
        "x",
      );
      assert.equal(
        fs.readFileSync(path.join(root, "build", "es6", "y.js"), "utf8"),
        "yy",
      );
      assert.equal(
        fs.readFileSync(path.join(root, "wc-registry.json"), "utf8"),
        '{"a":"b"}',
      );
      assert.equal(
        fs.readFileSync(path.join(root, "assets", "babel-top.js"), "utf8"),
        "babel",
      );
      assert.ok(!fs.existsSync(stash), "empty stash dir removed");
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  },
);

test(
  "static publish artifacts survive when the publish throws before restore",
  opts,
  () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "hax-prep-throw-"));
    const root = path.join(parent, "site");
    fs.mkdirSync(root);
    try {
      fs.writeFileSync(path.join(root, "index.html"), "ORIGINAL");
      fs.writeFileSync(path.join(root, "ghpages.html"), "entry");
      fs.mkdirSync(path.join(root, "build"));
      fs.writeFileSync(path.join(root, "build", "x.js"), "x");
      // the publish flow: prepare in try, restore in finally
      let prepared = false;
      assert.throws(() => {
        try {
          prepared = prepareSiteForStaticPublish(root);
          throw new Error("publish CLI install declined");
        } finally {
          if (prepared) {
            restoreSiteAfterStaticPublish(root);
          }
        }
      }, /declined/);
      assert.equal(
        fs.readFileSync(path.join(root, "build", "x.js"), "utf8"),
        "x",
      );
      assert.equal(
        fs.readFileSync(path.join(root, "index.html"), "utf8"),
        "ORIGINAL",
      );
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  },
);

test(
  "a stash left by a crashed publish is restored by the next prepare and never overwrites live files",
  opts,
  () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "hax-prep-crash-"));
    const root = path.join(parent, "site");
    fs.mkdirSync(root);
    try {
      fs.mkdirSync(path.join(root, "build"));
      fs.writeFileSync(path.join(root, "build", "x.js"), "x");
      fs.writeFileSync(path.join(root, "wc-registry.json"), "live");
      // simulate a crash: artifacts stashed, process died before restore
      stashStaticPublishArtifacts(root);
      assert.ok(!fs.existsSync(path.join(root, "build")));
      // user regenerated wc-registry.json in the meantime
      fs.writeFileSync(path.join(root, "wc-registry.json"), "regenerated");

      const restored = unstashStaticPublishArtifacts(root);
      assert.equal(restored, 1, "build/ moved back; registry left as is");
      assert.equal(
        fs.readFileSync(path.join(root, "build", "x.js"), "utf8"),
        "x",
      );
      assert.equal(
        fs.readFileSync(path.join(root, "wc-registry.json"), "utf8"),
        "regenerated",
        "live file never overwritten by a stale stash",
      );
      // the conflicting entry stays in the stash rather than being deleted
      const stash = staticPublishStashDir(root);
      assert.equal(
        fs.readFileSync(path.join(stash, "wc-registry.json"), "utf8"),
        "live",
      );
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  },
);

test(
  "prepareSiteForStaticPublish never rm's a real directory tree",
  opts,
  () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "hax-prep-norm-"));
    const root = path.join(parent, "site");
    fs.mkdirSync(root);
    const realRm = fs.rmSync;
    const realRmdir = fs.rmdirSync;
    const removed = [];
    fs.rmSync = (target, ...rest) => {
      removed.push(target);
      return realRm(target, ...rest);
    };
    try {
      fs.mkdirSync(path.join(root, "build"));
      fs.writeFileSync(path.join(root, "build", "x.js"), "x");
      fs.writeFileSync(path.join(root, "ghpages.html"), "entry");
      prepareSiteForStaticPublish(root);
      restoreSiteAfterStaticPublish(root);
      assert.deepEqual(removed, [], "fs.rmSync never called by the flow");
      assert.ok(fs.existsSync(path.join(root, "build", "x.js")));
    } finally {
      fs.rmSync = realRm;
      fs.rmdirSync = realRmdir;
      fs.rmSync(parent, { recursive: true, force: true });
    }
  },
);

test(
  "restoreSiteAfterStaticPublish returns false when there is no backup",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-restore-nobak-"));
    try {
      fs.writeFileSync(path.join(root, "index.html"), "x");
      assert.equal(restoreSiteAfterStaticPublish(root), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- readSurgeCnameDomain: surge's remembered publish target ---

test("readSurgeCnameDomain returns null when there is no CNAME", opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-cname-missing-"));
  try {
    assert.equal(readSurgeCnameDomain(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("readSurgeCnameDomain reads and trims the remembered domain", opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-cname-read-"));
  try {
    fs.writeFileSync(path.join(root, "CNAME"), "  my-site.surge.sh\n");
    assert.equal(readSurgeCnameDomain(root), "my-site.surge.sh");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("readSurgeCnameDomain returns null for a blank CNAME", opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-cname-blank-"));
  try {
    fs.writeFileSync(path.join(root, "CNAME"), "\n");
    assert.equal(readSurgeCnameDomain(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- surgeUsesNewGrammar: the surge 0.40 CLI grammar gate ---

test(
  "surgeUsesNewGrammar gates the publish verb on the 0.40 CLI reorganization",
  opts,
  () => {
    // legacy CLI: a bare `surge .` still prompted for a domain and published
    assert.equal(surgeUsesNewGrammar("0.23.1"), false);
    assert.equal(surgeUsesNewGrammar("0.39.9"), false);
    // 0.40 reorganized the grammar: a bare `surge .` only prints project info
    assert.equal(surgeUsesNewGrammar("0.40.0"), true);
    assert.equal(surgeUsesNewGrammar("0.44.3"), true);
    assert.equal(surgeUsesNewGrammar("1.0.0"), true);
    // unknown version (probe skipped/mocked, fresh global install): assume the
    // modern grammar, which is what `npm install --global surge` ships today
    assert.equal(surgeUsesNewGrammar(null), true);
    assert.equal(surgeUsesNewGrammar(undefined), true);
    assert.equal(surgeUsesNewGrammar("not-a-version"), true);
    // no argument reads the version captured by the module-load probe (null in
    // this suite because utils.exec is mocked before site.js is required)
    assert.equal(surgeUsesNewGrammar(), true);
  },
);

// --- llms-full.txt for static publishes (haxtheweb/issues#3104) ---

function makeLlmsSite(root, overrides) {
  const manifest = Object.assign(
    {
      title: "Intro to Biology",
      description: "An open\n course",
      metadata: { site: { name: "bio", settings: {} } },
      items: [
        {
          id: "a",
          title: "Getting Started",
          slug: "getting-started",
          parent: null,
          order: 0,
          location: "pages/a/index.html",
          metadata: {},
        },
        {
          id: "b",
          title: "Photosynthesis",
          slug: "week-1/photosynthesis",
          parent: "a",
          order: 0,
          location: "pages/b/index.html",
          metadata: {},
        },
        {
          id: "d",
          title: "Draft",
          slug: "draft",
          parent: null,
          order: 1,
          location: "pages/d/index.html",
          metadata: { published: false },
        },
        {
          id: "h",
          title: "Hidden",
          slug: "hidden",
          parent: null,
          order: 2,
          location: "pages/h/index.html",
          metadata: { hideInMenu: "true" },
        },
      ],
    },
    overrides || {},
  );
  fs.writeFileSync(path.join(root, "site.json"), JSON.stringify(manifest));
  for (const id of ["a", "b", "d", "h"]) {
    fs.mkdirSync(path.join(root, "pages", id), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pages", id, "index.html"),
      `<p>html for ${id}</p>`,
    );
  }
  fs.writeFileSync(
    path.join(root, "pages", "a", "index.md"),
    "Welcome **learners**\n",
  );
}

test(
  "buildStaticLlmsFull matches the server markdown export format",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-llmsfull-"));
    try {
      makeLlmsSite(root);
      const md = buildStaticLlmsFull(root);
      assert.ok(md.startsWith("# Intro to Biology\n\n> An open course\n"));
      // outline order: parent before child, sidecar markdown preferred
      assert.ok(
        md.indexOf(
          "## Getting Started\n\nSource: /getting-started\n\nWelcome **learners**",
        ) !== -1,
      );
      assert.ok(
        md.indexOf(
          "## Photosynthesis\n\nSource: /week-1/photosynthesis\n\nhtml for b",
        ) !== -1,
      );
      assert.ok(
        md.indexOf("## Getting Started") < md.indexOf("## Photosynthesis"),
      );
      // unpublished and hidden pages never reach agents
      assert.equal(md.indexOf("Draft"), -1);
      assert.equal(md.indexOf("Hidden"), -1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "buildStaticLlmsFull uses the site domain for Source URLs and skips private sites",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-llmsfull-domain-"));
    try {
      makeLlmsSite(root, {
        metadata: {
          site: {
            name: "bio",
            domain: "https://bio.example.org/",
            settings: {},
          },
        },
      });
      assert.ok(
        buildStaticLlmsFull(root).indexOf(
          "Source: https://bio.example.org/getting-started",
        ) !== -1,
      );
      makeLlmsSite(root, {
        metadata: { site: { name: "bio", settings: { private: true } } },
      });
      assert.equal(buildStaticLlmsFull(root), null);
      assert.equal(writeStaticLlmsFull(root), false);
      assert.ok(!fs.existsSync(path.join(root, "llms-full.txt")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test("static publish writes llms-full.txt and restore removes it", opts, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-llmsfull-rt-"));
  try {
    makeLlmsSite(root);
    fs.writeFileSync(path.join(root, "index.html"), "ORIGINAL INDEX");
    fs.writeFileSync(path.join(root, "ghpages.html"), "GHPAGES ENTRY");
    prepareSiteForStaticPublish(root);
    assert.ok(
      fs
        .readFileSync(path.join(root, "llms-full.txt"), "utf8")
        .startsWith("# Intro to Biology"),
    );
    restoreSiteAfterStaticPublish(root);
    assert.ok(
      !fs.existsSync(path.join(root, "llms-full.txt")),
      "removed so HAXcms serves it live",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  "writeStaticLlmsFull never overwrites or removes a file it did not create",
  opts,
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hax-llmsfull-own-"));
    try {
      makeLlmsSite(root);
      fs.writeFileSync(path.join(root, "llms-full.txt"), "hand written");
      assert.equal(writeStaticLlmsFull(root), false);
      assert.equal(removeStaticLlmsFull(root), false);
      assert.equal(
        fs.readFileSync(path.join(root, "llms-full.txt"), "utf8"),
        "hand written",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
