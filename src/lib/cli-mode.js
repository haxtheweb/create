// Imported first by create.js. ES imports are hoisted above every other
// statement (and babel compiles them into the first require() calls), so
// setting this flag in create.js itself happened only AFTER HAXcms had already
// been loaded and initialized. HAXcms then believed it was a web server: it
// printed the seeded admin password on the first run of any command
// (even `hax --version`) and skipped its CLI-specific behavior.
process.env.haxcms_middleware = "node-cli";
