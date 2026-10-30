"use strict";
// Commit attribution for in-process route calls (haxtheweb/issues#3191).
//
// HAXcms writes "[<actor>:<operationId>:<txn>] <message>" commits. The CLI
// calls route handlers in-process through invokeRoute, so site.js gives
// those calls the commit context the web server would:
//   - cliActor: "agent" with --agent / HAX_ACTOR=agent, otherwise "human"
//   - cliCommitContextFor: a context for write handlers only; reads and
//     handlers shared by several routes (e.g. GET + POST skeletons) get none;
//     the operationId is looked up lazily, only when a commit reads it
//
// Skips cleanly when the installed haxcms-nodejs predates commit op codes
// (cliCommitContextFor then always answers null).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "hax-site-attr-"));
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;
fs.mkdirSync(path.join(ISOLATED_HOME, ".haxtheweb"), { recursive: true });
require("@babel/register");
const test = require("node:test");
const assert = require("node:assert/strict");
const logging = require("../../src/lib/logging.js");
logging.log = () => {};

const site = require("../../src/lib/programs/site.js");
const allRoutesLib = require("@haxtheweb/haxcms-nodejs/dist/lib/allRoutes.js");

let hasCommitContext = true;
try {
  require.resolve("@haxtheweb/haxcms-nodejs/dist/lib/commitContext.js");
} catch {
  hasCommitContext = false;
}
const skip = hasCommitContext
  ? false
  : "installed haxcms-nodejs has no commit op codes yet";

function withActor(value, fn) {
  const saved = process.env.HAX_ACTOR;
  if (value === undefined) {
    delete process.env.HAX_ACTOR;
  } else {
    process.env.HAX_ACTOR = value;
  }
  try {
    return fn();
  } finally {
    if (saved === undefined) {
      delete process.env.HAX_ACTOR;
    } else {
      process.env.HAX_ACTOR = saved;
    }
  }
}

test("cliActor: a person unless --agent / HAX_ACTOR=agent says an agent", () => {
  withActor(undefined, () => assert.equal(site.cliActor(), "human"));
  withActor("agent", () => assert.equal(site.cliActor(), "agent"));
  withActor("AGENT", () => assert.equal(site.cliActor(), "agent"));
  withActor("robot", () => assert.equal(site.cliActor(), "human"));
});

test("--agent sets HAX_ACTOR before HAXcms loads", () => {
  const saved = process.argv;
  const savedActor = process.env.HAX_ACTOR;
  try {
    delete process.env.HAX_ACTOR;
    process.argv = ["node", "hax", "site", "node:add", "--agent"];
    delete require.cache[require.resolve("../../src/lib/cli-mode.js")];
    require("../../src/lib/cli-mode.js");
    assert.equal(process.env.HAX_ACTOR, "agent");
  } finally {
    process.argv = saved;
    if (savedActor === undefined) {
      delete process.env.HAX_ACTOR;
    } else {
      process.env.HAX_ACTOR = savedActor;
    }
  }
});

test(
  "a write handler gets a context with the route's operationId",
  { skip },
  () => {
    const createSite = allRoutesLib.allRoutes.system.map.post["sites"];
    const human = withActor(undefined, () =>
      site.cliCommitContextFor(createSite),
    );
    const agent = withActor("agent", () =>
      site.cliCommitContextFor(createSite),
    );
    assert.equal(human.actor, "H");
    assert.equal(agent.actor, "A");
    assert.match(human.txn, /^[a-z0-9]{4}$/);
    assert.notEqual(human.txn, agent.txn);
    assert.equal(human.op, "createSite");
  },
);

test("reads and shared handlers get no context", { skip }, () => {
  const map = allRoutesLib.allRoutes.system.map;
  assert.equal(site.cliCommitContextFor(map.get["sites"]), null);
  // GET and POST skeletons share one handler: ambiguous, so no context
  assert.equal(map.get["skeletons"], map.post["skeletons"]);
  assert.equal(site.cliCommitContextFor(map.post["skeletons"]), null);
  assert.equal(
    site.cliCommitContextFor(() => {}),
    null,
  );
});
