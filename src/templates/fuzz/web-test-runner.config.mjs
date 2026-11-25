// Passes the HAX_FUZZ_* variables (seed, runs, replay path) from the shell
// into the browser test page, where test/fuzz-config.js reads them.
// Convention: https://github.com/haxtheweb/issues/issues/3272
import process from "node:process";

// Only HAX_FUZZ_* keys are passed on, as JSON; "<" and the two Unicode line
// separators are escaped so a value can never end the inline script.
function fuzzEnv(env) {
  const picked = {};
  Object.keys(env)
    .filter((key) => /^HAX_FUZZ_[A-Z]+$/.test(key))
    .sort()
    .forEach((key) => {
      picked[key] = String(env[key]);
    });
  return JSON.stringify(picked).replace(
    /[<\u2028\u2029]/g,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

export default {
  nodeResolve: true,
  testRunnerHtml: (testFramework) => `<!DOCTYPE html>
<html>
  <body>
    <script>globalThis.process = { env: Object.assign({ NODE_ENV: "development" }, ${fuzzEnv(process.env)}) }</script>
    <script type="module" src="${testFramework}"></script>
  </body>
</html>`,
};
