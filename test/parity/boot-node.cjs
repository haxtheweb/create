// Boots an isolated haxcms-nodejs runtime with that repo's own e2e harness
// (test/e2e/helpers/harness.cjs) and keeps it alive. Real auth is on; the
// runtime lives in a fresh temp directory.
//   node boot-node.cjs --nodejs <haxcms-nodejs checkout> [--node-info <file>]
// Prints one line `READY {json}` with baseUrl, sitesDir and credentials, and
// writes the same JSON to --node-info when given.
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config.cjs");

const cfg = loadConfig();
const harnessPath = path.join(
  cfg.nodejs,
  "test",
  "e2e",
  "helpers",
  "harness.cjs",
);
if (!fs.existsSync(harnessPath)) {
  console.error("haxcms-nodejs e2e harness not found at " + harnessPath);
  process.exit(1);
}
const harness = require(harnessPath);

(async () => {
  const runtime = await harness.setupE2ERuntime();
  const info = {
    backend: "nodejs",
    baseUrl: runtime.baseUrl,
    root: runtime.runtimeRoot,
    sitesDir: path.join(runtime.runtimeRoot, "_sites"),
    username: harness.E2E_USER_NAME,
    password: harness.E2E_USER_PASSWORD,
  };
  if (cfg["node-info"])
    fs.writeFileSync(cfg["node-info"], JSON.stringify(info, null, 2));
  console.log("READY " + JSON.stringify(info));
  setInterval(() => {}, 1 << 30);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
