import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import * as p from "@clack/prompts";
import color from "picocolors";
import { writeData } from "../logging.js";
import { t } from "../i18n.js";

// `hax plugin`: scaffold HAXcms plugins (spec: https://github.com/haxtheweb/haxcms-plugin-examples, spec/09) and
// list the hooks a plugin can implement. The hook picker preselects the hooks most plugins use (`common: true` in the
// spec's hook contracts) and lists every other hook with what it is for, so people discover what is possible and
// agents can script the same choices (`--hooks`, `hax plugin hooks --format json`).

const requireHere = createRequire(__filename);

/**
 * @description Actions available for the plugin command
 * @returns Array of action objects
 */
export function pluginActions() {
  return [
    { value: "create", label: t("pluginActionCreate") },
    { value: "hooks", label: t("pluginActionHooks") },
  ];
}

/**
 * @description Load a file from the installed spec package, or the snapshot bundled with the CLI.
 * @param name file under schema/ (hook-contracts.json, categories.json)
 * @returns {{data: any, source: string}}
 */
export function loadSpecFile(name) {
  try {
    const file = requireHere.resolve(
      `@haxtheweb/haxcms-plugin-spec/schema/${name}`,
    );
    return {
      data: JSON.parse(fs.readFileSync(file, "utf8")),
      source: "package",
    };
  } catch {
    const file = path.resolve(__dirname, "../plugin-spec", name);
    return {
      data: JSON.parse(fs.readFileSync(file, "utf8")),
      source: "snapshot",
    };
  }
}

/**
 * @description The hooks a plugin can subscribe to (plugin-defined hooks of the example excluded).
 * @returns Array of hook contracts
 */
export function hookContracts() {
  return loadSpecFile("hook-contracts.json").data;
}

/**
 * @description Resolve a --hooks value: comma separated names, where `common` means every common hook.
 * @param value e.g. "common,render.after.body"
 * @param contracts hook contracts
 * @returns string[] hook names in contract order
 * @throws on an unknown hook name
 */
export function resolveHooks(value, contracts = hookContracts()) {
  const want = new Set();
  for (const raw of String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)) {
    if (raw === "common")
      contracts.filter((c) => c.common).forEach((c) => want.add(c.name));
    else if (raw === "none") continue;
    else if (contracts.some((c) => c.name === raw)) want.add(raw);
    else throw new Error(t("pluginUnknownHook", { hook: raw }));
  }
  return contracts.filter((c) => want.has(c.name)).map((c) => c.name);
}

/**
 * @description Options for the grouped hook picker: one group per area (page, render, config...), each hook labelled
 * with its name and hinted with what it is for.
 * @returns {{options: object, initialValues: string[]}}
 */
export function hookPickerOptions(contracts = hookContracts()) {
  const options = {};
  for (const c of contracts) {
    const area = c.name.split(".")[0];
    (options[area] = options[area] || []).push({
      value: c.name,
      label: c.common ? `${c.name} ${color.dim("(common)")}` : c.name,
      hint: plain(c.comment),
    });
  }
  return {
    options,
    initialValues: contracts.filter((c) => c.common).map((c) => c.name),
  };
}

const plain = (s) =>
  String(s || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`/g, "")
    .replace(/\*\//g, "* /");
const cap = (s) => {
  const x = plain(s).trim();
  return x ? x[0].toUpperCase() + x.slice(1).replace(/\.$/, "") + "." : "";
};
const camelHook = (n) =>
  n
    .split(".")
    .map((part, i) => (i ? part[0].toUpperCase() + part.slice(1) : part))
    .join("");
const studly = (id) =>
  id
    .split("-")
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join("") + "Plugin";

/**
 * @description The docblock for one hook stub, in the spec's convention ("Implements hook <name>." first, spec/02).
 */
function docblock(c, indent, php) {
  const lines = [
    `Implements hook ${c.name}.`,
    "",
    `TODO: say what this plugin does here and why (this sentence becomes the README's description of the hook).`,
    `Hook purpose: ${cap(c.comment)} Runs when ${plain(c.when)}.`,
    "",
    php
      ? `@param object $ctx  subject: ${plain(c.subject)}; previous: ${plain(c.previous || "none")}.`
      : `@param {object} ctx  ctx.subject: ${plain(c.subject)}; ctx.previous: ${plain(c.previous || "none")}.`,
    php
      ? `@return mixed  ${plain(c.returns || "nothing")}${c.veto ? "; or $ctx->veto(message)" : ""}.`
      : `@returns {Promise<*>}  ${plain(c.returns || "nothing")}${c.veto ? "; or ctx.veto(message)" : ""}.`,
  ];
  return `${indent}/**\n${lines.map((l) => `${indent} *${l ? ` ${l}` : ""}`).join("\n")}\n${indent} */\n`;
}

/**
 * @description Body of a hook stub: before hooks and render hooks pass the subject through.
 */
function stubBody(c, php) {
  const passes =
    c.phase === "before" ||
    c.name.startsWith("render.") ||
    /^the /i.test(c.returns || "");
  if (php)
    return passes
      ? "    return $ctx->subject;\n"
      : "    // react here; after hooks return nothing\n";
  return passes
    ? "      return ctx.subject;\n"
    : "      // react here; after hooks return nothing\n";
}

/**
 * @description Build the files of a new plugin (nothing is written).
 * @param o {id, title, description, category, runtimes: string[], hooks: string[], kind: "plugin"|"pack", core: boolean}
 * @returns {Object<string,string>} path -> content
 */
export function scaffoldPlugin(o, contracts = hookContracts()) {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(o.id || ""))
    throw new Error(t("pluginBadId", { id: o.id || "" }));
  const files = {};
  const hooks = (o.hooks || [])
    .map((n) => contracts.find((c) => c.name === n))
    .filter(Boolean);
  const isPack = o.kind === "pack";
  const runtimes = isPack
    ? []
    : o.runtimes && o.runtimes.length
      ? o.runtimes
      : ["nodejs", "php"];
  const title = o.title || o.id;
  const yaml = [
    `# ${title}. Scaffolded by \`hax plugin create\`; see https://github.com/haxtheweb/haxcms-plugin-examples for the spec.`,
    `specVersion: "0.1.0"`,
    `id: ${o.id}`,
    `uuid: ${randomUUID()}`,
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(o.description || `TODO: one sentence on what ${title} does.`)}`,
    `version: 0.1.0`,
    ...(isPack ? ["kind: pack"] : []),
    `category: ${o.category || "other"}`,
    `icon: icons:extension`,
    `tags: []`,
    `docs: { readme: README.md, agents: AGENTS.md }`,
    ...(o.core ? ["core: true"] : []),
    `license: Apache-2.0`,
  ];
  if (!isPack) {
    yaml.push(`runtimes: [${runtimes.join(", ")}]`, `entry:`);
    if (runtimes.includes("nodejs")) yaml.push(`  nodejs: src/nodejs/index.js`);
    if (runtimes.includes("php")) yaml.push(`  php: src/php/Plugin.php`);
    yaml.push(`staticCapable: true`, `capabilities: []`);
    if (hooks.length)
      yaml.push(`hooks:`, ...hooks.map((c) => `  - name: ${c.name}`));
  }
  files["plugin.yaml"] = yaml.join("\n") + "\n";
  if (runtimes.includes("nodejs")) {
    files["src/nodejs/index.js"] =
      `// ${title} (Node).${runtimes.includes("php") ? " Mirrored in src/php/Plugin.php; both must return the same results." : ""}\nexport default {\n  hooks: {\n${hooks.map((c) => `${docblock(c, "    ", false)}    "${c.name}": async (ctx) => {\n${stubBody(c, false)}    },\n`).join("")}  },\n};\n`;
  }
  if (runtimes.includes("php")) {
    files["src/php/Plugin.php"] =
      `<?php\n// ${title} (PHP).${runtimes.includes("nodejs") ? " Mirrors src/nodejs/index.js." : ""}\nclass ${studly(o.id)} {\n${hooks.map((c) => `\n${docblock(c, "  ", true)}  public function ${camelHook(c.name)}($ctx) {\n${stubBody(c, true)}  }\n`).join("")}}\n`;
  }
  if (!isPack) {
    // one basic passing test so the plugin is not "untested" from day one, plus a commented example to adapt
    files[`tests/cases/${o.id}.yaml`] =
      `# Executable cases (schema/test-case.schema.json in the spec). Run with hax-plugin-test .\n- id: ${o.id}-001\n  title: "the plugin loads and is active"\n  given: "default settings"\n  when: "load"\n  then: "active, no errors"\n  run:\n    steps:\n      - rebuild: {}\n        expect: { status: 200, status_of: { ${o.id}: active } }\n${hooks.length ? `# - id: ${o.id}-002\n#   title: "TODO: what ${hooks[0].name} does"\n#   hook: ${hooks[0].name}\n#   given: "TODO"\n#   when: "TODO"\n#   then: "TODO"\n#   run:\n#     steps:\n#       - render: { page: { id: p1, content: "<p>x</p>" } }\n#         expect: { contains: ["TODO"] }\n` : ""}`;
  }
  files["README.md"] =
    `# ${title}\n\n${o.description || "TODO: what this plugin does, for the people who will enable it."}\n\nRun \`node scripts/plugin-docs.mjs <this folder>\` from the spec repo (or \`hax plugin docs\` once available) to add the generated **What it implements** table: every hook below, when it runs, and the first sentence of each docblock.\n${hooks.length ? `\nHooks: ${hooks.map((c) => `\`${c.name}\``).join(", ")}.\n` : ""}`;
  files["AGENTS.md"] =
    `# AGENTS.md (${o.id})\n\n## Purpose\nTODO\n\n## Rules\n- Every hook, operation and schedule keeps its "Implements ..." docblock (spec/02, 2.2).\n${runtimes.length > 1 ? "- Node and PHP must return identical results.\n" : ""}\n## Build, test, validate\n\`hax plugin validate\` (\`hax-plugin-validate .\`); \`hax-plugin-test .\`.\n`;
  return files;
}

/**
 * @description Write scaffold files under dir, refusing to overwrite.
 */
export function writeScaffold(dir, files) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length)
    throw new Error(t("pluginDirNotEmpty", { dir }));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

/**
 * @description `hax plugin hooks`: every hook with whether it is common, what it is for and when it runs.
 */
function listHooks(commandRun) {
  const contracts = hookContracts();
  const only = commandRun.options.common
    ? contracts.filter((c) => c.common)
    : contracts;
  if (
    commandRun.options.format === "json" ||
    commandRun.options.format === "yaml"
  ) {
    writeData(
      JSON.stringify(
        only.map((c) => ({
          name: c.name,
          common: !!c.common,
          phase: c.phase,
          definedBy: c.definedBy || "core",
          when: plain(c.when),
          purpose: plain(c.comment),
          veto: !!c.veto,
          example: plain(c.example),
        })),
        null,
        2,
      ),
    );
    return;
  }
  p.intro(
    color.bgBlack(
      color.white(` ${t("pluginHooksIntro", { count: only.length })} `),
    ),
  );
  for (const c of only)
    p.log.message(
      `${c.common ? color.green("●") : color.dim("○")} ${color.cyan(c.name)} ${color.dim(plain(c.when))}\n  ${plain(c.comment)}`,
    );
}

/**
 * @description `hax plugin create`: ask (or take from flags) the plugin's id, title, runtimes and hooks, then write it.
 */
async function createPlugin(commandRun) {
  const o = commandRun.options;
  const interactive = !o.y && !o.auto && o.i !== false && !process.env.haxquiet;
  const contracts = hookContracts();
  const categories = loadSpecFile("categories.json").data;
  let id = o.name || (commandRun.arguments && commandRun.arguments.name);
  if (!id && interactive)
    id = await p.text({
      message: t("pluginAskId"),
      placeholder: "my-plugin",
      validate: (v) =>
        /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(v || "")
          ? undefined
          : t("pluginBadId", { id: v || "" }),
    });
  if (p.isCancel(id) || !id) throw new Error(t("pluginBadId", { id: "" }));
  let title =
    o.title ||
    (interactive
      ? await p.text({
          message: t("pluginAskTitle"),
          initialValue: id
            .split("-")
            .map((x) => x[0].toUpperCase() + x.slice(1))
            .join(" "),
        })
      : id);
  let category =
    o.category ||
    (interactive
      ? await p.select({
          message: t("pluginAskCategory"),
          options: categories.map((c) => ({ value: c, label: c })),
          initialValue: "other",
        })
      : "other");
  let runtimes = o.runtimes
    ? String(o.runtimes)
        .split(",")
        .map((x) => x.trim())
    : interactive
      ? await p.multiselect({
          message: t("pluginAskRuntimes"),
          options: [
            { value: "nodejs", label: "Node.js" },
            { value: "php", label: "PHP" },
          ],
          initialValues: ["nodejs", "php"],
          required: true,
        })
      : ["nodejs", "php"];
  let hooks;
  if (o.hooks !== undefined) hooks = resolveHooks(o.hooks, contracts);
  else if (interactive) {
    const { options, initialValues } = hookPickerOptions(contracts);
    hooks = await p.groupMultiselect({
      message: t("pluginAskHooks"),
      options,
      initialValues,
      required: false,
    });
  } else hooks = resolveHooks("common", contracts);
  for (const v of [title, category, runtimes, hooks]) if (p.isCancel(v)) return;
  const files = scaffoldPlugin(
    { id, title, description: o.description, category, runtimes, hooks },
    contracts,
  );
  const dir = path.resolve(o.path || process.cwd(), id);
  writeScaffold(dir, files);
  if (o.format === "json")
    writeData(
      JSON.stringify({ id, dir, hooks, files: Object.keys(files) }, null, 2),
    );
  else p.outro(t("pluginCreated", { id, dir, count: hooks.length }));
}

/**
 * @description Entry point for `hax plugin [action]`.
 */
export async function pluginCommandDetected(commandRun) {
  const action =
    (commandRun.arguments && commandRun.arguments.action) || "create";
  if (action === "hooks") return listHooks(commandRun);
  if (action === "create") return createPlugin(commandRun);
  throw new Error(t("pluginUnknownAction", { action }));
}
