// Imported first by create.js. ES imports are hoisted above every other
// statement (and babel compiles them into the first require() calls), so
// setting this flag in create.js itself happened only AFTER HAXcms had already
// been loaded and initialized. HAXcms then believed it was a web server: it
// printed the seeded admin password on the first run of any command
// (even `hax --version`) and skipped its CLI-specific behavior.
process.env.haxcms_middleware = "node-cli";
// haxtheweb/issues#3191: HAXcms records who made each change in the site's git
// history ("[A:updateItem:x9r1] ..."). --agent (or HAX_ACTOR=agent) says an AI
// agent is driving the CLI. Set here, before HAXcms loads, so every commit sees
// it. Informational only: it never changes what the CLI is allowed to do.
if (process.argv.indexOf("--agent") !== -1) {
  process.env.HAX_ACTOR = "agent";
}
