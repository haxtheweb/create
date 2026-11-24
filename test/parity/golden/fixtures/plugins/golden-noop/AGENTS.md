# golden-noop (agents)

Purpose: prove the plugin platform's hooks change nothing when a plugin does nothing. Used only by `test/parity` in haxtheweb/create (`--noop-plugin`).

Rules:
- every hook returns `ctx.subject` unchanged; never add behavior here
- the hook list in `plugin.yaml`, `src/nodejs/index.js` and `src/php/Plugin.php` must stay the same list
- when the spec adds a core hook that a golden case's route fires, add it to all three
