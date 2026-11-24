# golden-throw (agents)

Purpose: prove a hook that throws never changes or breaks the operation it hooks. Used only by `test/parity` in haxtheweb/create (`--throwing-plugin`).

Rules:
- every hook throws; never return a value or veto here (a veto is meant to stop a write, and is tested per backend)
- keep the hook list the same as golden-noop's, in `plugin.yaml`, `src/nodejs/index.js` and `src/php/Plugin.php`
