import * as p from "@clack/prompts";
import { spawn as nodeSpawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import color from "picocolors";
import { t } from "../i18n.js";

/**
 * `hax audit ssr`: how well do elements render under @lit-labs/ssr
 * (declarative shadow DOM)? A coverage report, not a pass / fail check: full
 * SSR compatibility is a nice-to-have, so this never fails a run and is not
 * part of `hax audit all`.
 *
 * For every element in wc-registry.json it renders the demoSchema content
 * (what the HAX editor inserts) in a separate node process and classifies the
 * output:
 *
 *   threw           failed to import or render (the first line of the error is kept)
 *   no-shadow-root  rendered, but no declarative shadow root came out
 *   empty           shadow root holds only styles / comments
 *   shell           shadow root has structure (slots, wrappers) but no text or media
 *   rendered        real content in the shadow root
 *
 * Elements without a demoSchema are rendered bare (<tag></tag>), which says
 * less (many need properties to show anything), so the report keeps them
 * apart as demo: "bare".
 */

export const SSR_STATUSES = [
  "rendered",
  "shell",
  "empty",
  "no-shadow-root",
  "non-visual",
  "skipped",
  "threw",
];

const DEFAULT_TIMEOUT = 10000;
// no output at all for this many render timeouts means the worker is stuck
// in synchronous code (a timer can't fire), so it gets killed and restarted
const WATCHDOG_FACTOR = 3;

// never searched for demo content: dependencies, build output, tests
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "public",
  "coverage",
  ".vercel",
  ".netlify",
  "test",
  "tests",
  "__tests__",
  "locales",
]);

function writeAllSync(text) {
  const buf = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buf.length) {
    try {
      offset += writeSync(1, buf, offset, buf.length - offset);
    } catch (e) {
      if (e.code !== "EAGAIN") {
        throw e;
      }
    }
  }
}

/**
 * @description Read wc-registry.json: custom element tag -> import specifier.
 * @returns the registry object, or null when the project has none
 */
export function loadSsrRegistry(root) {
  const file = path.join(root, "wc-registry.json");
  if (!existsSync(file)) {
    return null;
  }
  try {
    const registry = JSON.parse(readFileSync(file, "utf8"));
    return registry && typeof registry === "object" ? registry : null;
  } catch {
    return null;
  }
}

/**
 * @description Collect demoSchema entries (what the HAX editor inserts for an
 * element) from every <tag>.haxProperties.json under a project.
 * @returns {Object<string, {tag: string, properties?: object, content?: string}>}
 *   first demo found for each tag
 */
export function discoverSsrDemos(root) {
  const demos = {};
  const walk = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(name)) {
          walk(full);
        }
      } else if (name.endsWith(".haxProperties.json")) {
        try {
          const schema = JSON.parse(readFileSync(full, "utf8"));
          for (const demo of (schema && schema.demoSchema) || []) {
            if (demo && typeof demo.tag === "string" && !demos[demo.tag]) {
              demos[demo.tag] = demo;
            }
          }
        } catch {
          // malformed schemas are reported by `hax audit schema`
        }
      }
    }
  };
  walk(root);
  return demos;
}

/**
 * @description Split a stylesheet into its top-level rules (at-rules such as
 * @media count as one). Lit SSR joins a class's styles into a single <style>,
 * so shared base styles are only visible one rule at a time.
 */
export function splitCssRules(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        rules.push(css.slice(start, i + 1).trim());
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) {
      // statements like @import ...;
      start = i + 1;
    }
  }
  return rules.filter(Boolean);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COMMENTS = /<!--[\s\S]*?--!?>/g;
const STYLES = /<style\b[^>]*>([\s\S]*?)<\/style\b[^>]*>/gi;
const SCRIPTS = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi;

/**
 * @description Remove comments, <style> and <script> blocks, repeating until
 * nothing changes so a block rebuilt from the pieces of another is removed
 * too. The result is only measured (text length, media count), never
 * rendered or served.
 */
function stripBlocks(markup) {
  let out = String(markup || "");
  let prev;
  do {
    prev = out;
    out = out.replace(COMMENTS, "").replace(STYLES, "").replace(SCRIPTS, "");
  } while (out !== prev);
  return out;
}
const MEDIA = /<(?:img|svg|canvas|video|audio|picture|iframe|object|embed)\b/gi;

/**
 * @description The markup inside the first declarative shadow root of the
 * outer element, or null when the element rendered without one.
 */
export function shadowRootContent(markup, tag) {
  const open = new RegExp(
    `<${escapeRegExp(tag)}(?=[\\s>/])[^>]*>\\s*<template\\b[^>]*\\bshadowroot`,
    "i",
  );
  const match = open.exec(markup);
  if (!match) {
    return null;
  }
  const tagEnd = markup.indexOf(">", match.index + match[0].length);
  if (tagEnd === -1) {
    return null;
  }
  // <template> nests (child elements have their own shadow roots)
  const nesting = /<template\b|<\/template>/gi;
  nesting.lastIndex = tagEnd + 1;
  let depth = 1;
  let token;
  while ((token = nesting.exec(markup))) {
    depth += token[0][1] === "/" ? -1 : 1;
    if (depth === 0) {
      return markup.slice(tagEnd + 1, token.index);
    }
  }
  return markup.slice(tagEnd + 1);
}

/**
 * @description Measure SSR output and classify it.
 * @param markup the string @lit-labs/ssr produced
 * @param tag the element that was rendered
 * @returns {{status: string, bytes: number, shadowRoots: number, textChars: number, elements: number, slots: number, media: number, styleBytes: number, uniqueStyleBytes: number, styleBlocks: Array<{hash: string, bytes: number}>, styleRules: Object<string, number>}}
 */
export function analyzeSsrOutput(markup, tag) {
  const bytes = Buffer.byteLength(markup);
  const seen = new Map();
  const styleBlocks = [];
  // each distinct CSS rule once per element, for spotting shared base styles
  const ruleSizes = new Map();
  let styleBytes = 0;
  for (const m of markup.matchAll(STYLES)) {
    const size = Buffer.byteLength(m[1]);
    const hash = createHash("sha1").update(m[1]).digest("hex").slice(0, 12);
    styleBytes += size;
    seen.set(hash, size);
    styleBlocks.push({ hash, bytes: size });
    for (const rule of splitCssRules(m[1])) {
      ruleSizes.set(
        createHash("sha1").update(rule).digest("hex").slice(0, 12),
        Buffer.byteLength(rule),
      );
    }
  }
  const uniqueStyleBytes = [...seen.values()].reduce((a, b) => a + b, 0);
  const shadowRoots = (markup.match(/<template\b[^>]*\bshadowroot/gi) || [])
    .length;
  const inner = shadowRootContent(markup, tag);
  const result = {
    status: "no-shadow-root",
    bytes,
    shadowRoots,
    textChars: 0,
    elements: 0,
    slots: 0,
    media: 0,
    styleBytes,
    uniqueStyleBytes,
    styleBlocks,
    styleRules: Object.fromEntries(ruleSizes),
  };
  if (inner === null) {
    return result;
  }
  const body = stripBlocks(inner);
  const text = body
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tags = (body.match(/<([a-z][\w:-]*)/gi) || []).map((s) =>
    s.slice(1).toLowerCase(),
  );
  result.textChars = text.length;
  result.slots = tags.filter((name) => name === "slot").length;
  result.elements = tags.filter(
    (name) => name !== "slot" && name !== "template",
  ).length;
  result.media = (body.match(MEDIA) || []).length;
  if (result.elements === 0 && result.slots === 0 && text.length === 0) {
    result.status = "empty";
  } else if (text.length === 0 && result.media === 0) {
    result.status = "shell";
  } else {
    result.status = "rendered";
  }
  return result;
}

/**
 * @description Measure an element's progressive-enhancement fallback markup
 * (the light DOM it supplies for bots and no-JS readers).
 * @returns {{bytes: number, textChars: number, media: number, elements: number}}
 */
export function analyzeFallback(markup) {
  const text = stripBlocks(markup)
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    bytes: Buffer.byteLength(markup || ""),
    textChars: text.length,
    media: (String(markup || "").match(MEDIA) || []).length,
    elements: (String(markup || "").match(/<([a-z][\w:-]*)/gi) || []).length,
  };
}

// error text -> short codes for the usual causes (see issue #3161)
const ERROR_HINTS = [
  [/Unexpected (final )?partIndex/i, "binding-in-raw-text-element"],
  [/\b[\w$.]+ is not defined/i, "browser-global"],
  [/Cannot read properties of (undefined|null)/i, "undefined-dependency"],
  [
    /Unknown file extension|import attribute|ERR_IMPORT_ATTRIBUTE|assert\b.*type/i,
    "non-js-import",
  ],
  [
    /Cannot find|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH|Failed to resolve/i,
    "unresolved-import",
  ],
  [/did not finish within/i, "timeout"],
];

export function errorHints(message) {
  const hints = [];
  for (const [pattern, hint] of ERROR_HINTS) {
    if (pattern.test(message || "")) {
      hints.push(hint);
    }
  }
  return hints;
}

/**
 * @description Group key for an error: the first line with machine specific
 * paths removed, so the same root cause lands in one group.
 */
export function errorSignature(message) {
  return String(message || "unknown error")
    .replace(/file:\/\/\S+/g, "<file>")
    .replace(/(?:\/[\w.@~+-]+){2,}/g, "<path>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/**
 * @description Cheap source checks that explain an element that rendered
 * little or nothing.
 */
export function sourceHints(source) {
  const hints = [];
  if (
    /createRenderRoot\s*\(\s*\)\s*\{[^}]{0,120}return\s+this\b/.test(source)
  ) {
    hints.push("light-dom");
  }
  if (/\bfetch\s*\(|XMLHttpRequest|\.json\s*\(\s*\)/.test(source)) {
    hints.push("fetches-data");
  }
  if (
    /(?:firstUpdated|updated|connectedCallback)\s*\([^)]*\)\s*\{[^}]*(?:innerHTML|appendChild|\.append\(|insertAdjacent|createElement)/.test(
      source,
    )
  ) {
    hints.push("builds-content-in-lifecycle");
  }
  return hints;
}

/**
 * @description Heuristic: does the element's source describe something that
 * is not meant to draw anything (a registry, store, router, bridge, loader)?
 * It defines no render(), no styles, and builds no content (lifecycle,
 * attachShadow, innerHTML, createElement).
 * Only used to explain an element that rendered nothing, never to excuse a
 * failure.
 */
export function isNonVisual(source) {
  if (!source) {
    return false;
  }
  if (/^\s*render\s*\(/m.test(source)) {
    return false;
  }
  if (/static\s+(get\s+)?styles\b/.test(source)) {
    return false;
  }
  // vanilla elements that draw into a shadow root themselves, and files
  // that define no element class at all (they wrap one from a library)
  if (
    /attachShadow|\.innerHTML\s*=|createElement\s*\(/.test(source) ||
    !/\bclass\s+\w+\s+extends\b/.test(source)
  ) {
    return false;
  }
  return sourceHints(source).every((hint) => hint === "fetches-data");
}

const percentile = (sorted, fraction) =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
    : 0;

/**
 * @description Roll results up into counts, failure causes and size figures.
 */
export function summarizeSsr(results, extras = {}) {
  const counts = Object.fromEntries(SSR_STATUSES.map((s) => [s, 0]));
  const byDemo = {
    demoSchema: Object.fromEntries(SSR_STATUSES.map((s) => [s, 0])),
    bare: Object.fromEntries(SSR_STATUSES.map((s) => [s, 0])),
  };
  const causes = new Map();
  const hinted = new Map();
  // elements that supply their own progressive-enhancement markup
  const fallback = { withHook: 0, useful: 0, recovered: [] };
  const sizes = [];
  let bytes = 0;
  let styleBytes = 0;
  let uniqueStyleBytes = 0;
  // CSS rules repeated across elements (the shared base styles, e.g. DDD)
  const ruleUse = new Map();
  for (const r of results) {
    counts[r.status] += 1;
    byDemo[r.demo][r.status] += 1;
    if (r.fallback) {
      fallback.withHook += 1;
      const useful = r.fallback.textChars > 0 || r.fallback.media > 0;
      fallback.useful += useful ? 1 : 0;
      // the shadow render gave nothing usable, the element's own fallback does
      if (useful && r.status !== "rendered") {
        fallback.recovered.push({ tag: r.tag, from: r.status });
      }
    }
    if (r.status === "threw") {
      const signature = errorSignature(r.error);
      const cause = causes.get(signature) || {
        signature,
        phase: r.phase,
        count: 0,
        tags: [],
        origins: new Map(),
      };
      cause.count += 1;
      cause.tags.push(r.tag);
      if (r.origin) {
        cause.origins.set(r.origin, (cause.origins.get(r.origin) || 0) + 1);
      }
      causes.set(signature, cause);
    }
    for (const hint of r.hints || []) {
      const entry = hinted.get(hint) || { hint, tags: [] };
      entry.tags.push(r.tag);
      hinted.set(hint, entry);
    }
    if (r.status !== "threw") {
      sizes.push(r.bytes);
      bytes += r.bytes;
      styleBytes += r.styleBytes;
      uniqueStyleBytes += r.uniqueStyleBytes;
      for (const [hash, size] of Object.entries(r.styleRules || {})) {
        const use = ruleUse.get(hash) || { hash, bytes: size, elements: 0 };
        use.elements += 1;
        ruleUse.set(hash, use);
      }
    }
  }
  sizes.sort((a, b) => a - b);
  const rendered = sizes.length;
  const sharedThreshold = Math.max(5, Math.ceil(rendered * 0.1));
  const shared = [...ruleUse.values()].filter(
    (b) => b.elements >= sharedThreshold,
  );
  const sharedBytes = shared.reduce((sum, b) => sum + b.bytes * b.elements, 0);
  return {
    total: results.length,
    counts,
    byDemo,
    causes: [...causes.values()]
      .map((cause) => ({
        ...cause,
        // where it was thrown, most common first
        origins: [...cause.origins.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([origin, count]) => ({ origin, count })),
      }))
      .sort((a, b) => b.count - a.count),
    hints: [...hinted.values()].sort((a, b) => b.tags.length - a.tags.length),
    fallback,
    primitiveStyles: { bytes: Buffer.byteLength(extras.primitiveCss || "") },
    size: {
      measured: rendered,
      bytes,
      median: percentile(sizes, 0.5),
      p90: percentile(sizes, 0.9),
      max: sizes[sizes.length - 1] || 0,
      styleBytes,
      // style bytes left if a style block were emitted once per element
      uniqueStyleBytes,
    },
    // CSS rules that show up in at least `threshold` elements' output
    shared: {
      threshold: sharedThreshold,
      rules: shared.length,
      // bytes the shared rules take up, counted once per element they appear in
      bytes: sharedBytes,
      // what is left once each shared rule is counted once
      bytesIfEmittedOnce: shared.reduce((sum, b) => sum + b.bytes, 0),
      share: styleBytes ? sharedBytes / styleBytes : 0,
    },
    largest: results
      .filter((r) => r.status !== "threw")
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5)
      .map((r) => ({ tag: r.tag, bytes: r.bytes, styleBytes: r.styleBytes })),
  };
}

/**
 * @description Run the renderer in a child process. Restarts it after the
 * element that hung or crashed it, so one bad element can't end the audit.
 * @param payload {root, timeout, items}
 * @param deps injectable { spawn, workerPath } for tests
 * @returns {Promise<{fatal?: {code: string, message: string}, results: object[], fallbacks: object[], primitives: string}>}
 */
export async function runSsrWorker(payload, deps = {}) {
  const spawn = deps.spawn || nodeSpawn;
  const workerPath =
    deps.workerPath || path.join(__dirname, "audit-ssr-worker.mjs");
  const watchdog = payload.timeout * WATCHDOG_FACTOR;
  const results = [];
  // extensionless imports the worker had to resolve through its fallback
  const fallbacks = new Map();
  let primitives = "";
  let pending = payload.items.slice();
  while (pending.length) {
    const attempt = await new Promise((resolve) => {
      const child = spawn(process.execPath, [workerPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const got = [];
      let fatal = null;
      let finished = false;
      let buffer = "";
      let stderr = "";
      let timer;
      const settle = (extra = {}) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        resolve({ got, fatal, stderr, ...extra });
      };
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          child.kill("SIGKILL");
          settle({ interrupted: "hang" });
        }, watchdog);
      };
      const onLine = (line) => {
        if (!line.trim()) {
          return;
        }
        let doc;
        try {
          doc = JSON.parse(line);
        } catch {
          return;
        }
        if (doc.fatal) {
          fatal = { code: doc.fatal, message: doc.message };
        } else if (doc.done) {
          settle({ complete: true });
          child.kill();
        } else {
          got.push(doc);
        }
        arm();
      };
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          onLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-2000);
      });
      child.on("error", (e) => {
        fatal = { code: "spawn-failed", message: e.message };
        settle();
      });
      child.on("close", () => settle({ interrupted: "exit" }));
      arm();
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify({ ...payload, items: pending }));
    });
    // asyncOnly lines are late errors from an element that already finished
    for (const doc of attempt.got) {
      if (typeof doc.primitives === "string") {
        primitives = doc.primitives;
        continue;
      }
      if (doc.fallback) {
        fallbacks.set(
          `${doc.fallback.specifier}|${doc.fallback.parent}`,
          doc.fallback,
        );
        continue;
      }
      if (doc.asyncOnly) {
        const earlier = results.find((r) => r.tag === doc.tag);
        if (earlier) {
          earlier.warnings = [
            ...(earlier.warnings || []),
            `async: ${doc.error}`,
          ].slice(0, 6);
        }
        continue;
      }
      results.push(doc);
    }
    const done = new Set(results.map((r) => r.tag));
    pending = pending.filter((item) => !done.has(item.tag));
    if (attempt.fatal) {
      return {
        fatal: attempt.fatal,
        results,
        fallbacks: [...fallbacks.values()],
        primitives,
      };
    }
    if (attempt.complete || !pending.length) {
      break;
    }
    // interrupted: the first element still pending is the one that did it
    const stuck = pending.shift();
    const hung = attempt.interrupted === "hang";
    results.push({
      tag: stuck.tag,
      ok: false,
      phase: hung ? "timeout" : "crash",
      error: hung
        ? "render blocked the process (no output before the watchdog)"
        : `renderer process exited${attempt.stderr ? `: ${attempt.stderr.trim().split("\n").pop()}` : ""}`,
      warnings: [],
    });
  }
  return { results, fallbacks: [...fallbacks.values()], primitives };
}

function readSource(file) {
  try {
    return readFileSync(file, "utf8").slice(0, 2 * 1024 * 1024);
  } catch {
    return "";
  }
}

const kb = (bytes) => (bytes / 1024).toFixed(1);

/**
 * @description `hax audit ssr`: SSR coverage report for the elements of a project.
 * @param commandRun CLI state; options.format === 'json' for a machine-readable report,
 *   options.only (comma separated tags), options.timeout (ms per element),
 *   options.saveHtml (directory for each element's SSR output), options.debug (list every element)
 * @param root project to audit (defaults to cwd)
 * @param deps injectable { runWorker, write } for tests
 * @returns {Promise<{passed: boolean, fatal?: object, summary?: object, results?: object[]}>}
 *   passed is false only when the audit could not run; render failures never fail it
 */
export async function auditSsrCommand(commandRun, root = null, deps = {}) {
  const options = (commandRun && commandRun.options) || {};
  const projectRoot = root || process.cwd();
  const asJson = options.format === "json";
  const out = deps.write || writeAllSync;
  const timeout = parseInt(options.timeout, 10) || DEFAULT_TIMEOUT;
  const fail = (code, message) => {
    if (asJson) {
      out(
        JSON.stringify({ passed: false, fatal: { code, message } }, null, 2) +
          "\n",
      );
    } else {
      p.log.error(message);
    }
    return { passed: false, fatal: { code, message } };
  };
  if (!asJson) {
    p.intro(
      `${color.bgBlack(` 🧪 ${t("auditSsrStart", { path: color.underline(color.bold(color.yellow(projectRoot))) })} `)}`,
    );
  }
  const registry = loadSsrRegistry(projectRoot);
  if (!registry) {
    return fail("no-registry", t("auditSsrNoRegistry", { path: projectRoot }));
  }
  const demos = discoverSsrDemos(projectRoot);
  const only = options.only
    ? new Set(
        String(options.only)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;
  const items = Object.entries(registry)
    .filter(([tag]) => !only || only.has(tag))
    .map(([tag, specifier]) => ({
      tag,
      specifier,
      demo: demos[tag] || null,
    }));
  if (!items.length) {
    if (!asJson) {
      p.outro(t("auditSsrNothing"));
    }
    return { passed: true, summary: summarizeSsr([]), results: [] };
  }
  if (!asJson) {
    p.log.info(t("auditSsrRendering", { count: items.length }));
  }
  const run = deps.runWorker || runSsrWorker;
  const outcome = await run({
    root: projectRoot,
    timeout,
    shim: options.shim !== false,
    items,
  });
  if (outcome.fatal) {
    const message =
      outcome.fatal.code === "missing-ssr"
        ? t("auditSsrMissingSsr", { command: "npm i -D @lit-labs/ssr" })
        : outcome.fatal.code === "missing-ssr-kit"
          ? t("auditSsrMissingKit", {
              command: "npm i @haxtheweb/haxcms-nodejs",
            })
          : t("auditSsrWorkerFailed", { error: outcome.fatal.message });
    return fail(outcome.fatal.code, message);
  }
  const demoOf = Object.fromEntries(
    items.map((i) => [i.tag, i.demo ? "demoSchema" : "bare"]),
  );
  const saveDir = options.saveHtml ? path.resolve(options.saveHtml) : null;
  if (saveDir) {
    mkdirSync(saveDir, { recursive: true });
  }
  if (saveDir) {
    writeFileSync(
      path.join(saveDir, "_primitives.css"),
      outcome.primitives || "",
    );
    for (const doc of outcome.results) {
      if (doc.progressive) {
        writeFileSync(
          path.join(saveDir, `${doc.tag}.fallback.html`),
          doc.progressive,
        );
      }
    }
  }
  const results = outcome.results.map((doc) => {
    const base = {
      tag: doc.tag,
      demo: demoOf[doc.tag] || "bare",
      file: doc.file ? path.relative(projectRoot, doc.file) : null,
    };
    const warnings = doc.warnings || [];
    if (!doc.ok) {
      return {
        ...base,
        status: "threw",
        phase: doc.phase,
        error: doc.error,
        origin: doc.origin || null,
        hints: errorHints(doc.error),
        fallback: doc.progressive ? analyzeFallback(doc.progressive) : null,
        warnings,
      };
    }
    if (doc.skipped) {
      return { ...base, status: "skipped", skipReason: doc.skipped, warnings };
    }
    if (saveDir) {
      writeFileSync(path.join(saveDir, `${doc.tag}.html`), doc.html);
    }
    const a = analyzeSsrOutput(doc.html, doc.tag);
    if (
      (a.status === "empty" || a.status === "no-shadow-root") &&
      doc.file &&
      isNonVisual(readSource(doc.file))
    ) {
      a.status = "non-visual";
    }
    const hints =
      a.status === "rendered" || !doc.file
        ? []
        : sourceHints(readSource(doc.file));
    return {
      ...base,
      status: a.status,
      bytes: a.bytes,
      shadowRoots: a.shadowRoots,
      textChars: a.textChars,
      elements: a.elements,
      slots: a.slots,
      media: a.media,
      styleBytes: a.styleBytes,
      uniqueStyleBytes: a.uniqueStyleBytes,
      styleRules: a.styleRules,
      hints,
      truncated: Boolean(doc.truncated),
      fallback: doc.progressive ? analyzeFallback(doc.progressive) : null,
      warnings,
    };
  });
  const summary = summarizeSsr(results, { primitiveCss: outcome.primitives });
  const fallbacks = outcome.fallbacks || [];
  summary.env = options.shim === false ? "bare" : "inert-dom";
  summary.resolverFallbacks = {
    count: fallbacks.length,
    examples: fallbacks.slice(0, 5).map((f) => ({
      specifier: f.specifier,
      from:
        f.parent && f.parent.startsWith("file:")
          ? path.relative(projectRoot, fileURLToPath(f.parent))
          : f.parent,
    })),
  };
  // the per-block detail only feeds the summary
  const publicResults = results.map(
    ({ styleRules: _styleRules, ...rest }) => rest,
  );
  if (asJson) {
    out(
      JSON.stringify(
        { passed: true, root: projectRoot, summary, results: publicResults },
        null,
        2,
      ) + "\n",
    );
    return { passed: true, summary, results: publicResults };
  }
  const counts = summary.counts;
  p.log.info(
    t("auditSsrTotals", {
      count: summary.total,
      demo: summary.byDemo.demoSchema
        ? Object.values(summary.byDemo.demoSchema).reduce((a, b) => a + b, 0)
        : 0,
      bare: Object.values(summary.byDemo.bare).reduce((a, b) => a + b, 0),
    }),
  );
  const labels = {
    rendered: [color.green, t("auditSsrStatusRendered")],
    shell: [color.yellow, t("auditSsrStatusShell")],
    empty: [color.yellow, t("auditSsrStatusEmpty")],
    "no-shadow-root": [color.yellow, t("auditSsrStatusNoShadow")],
    "non-visual": [color.dim, t("auditSsrStatusNonVisual")],
    skipped: [color.dim, t("auditSsrStatusSkipped")],
    threw: [color.red, t("auditSsrStatusThrew")],
  };
  for (const status of SSR_STATUSES) {
    const [paint, label] = labels[status];
    p.log.message(
      `${paint(String(counts[status]).padStart(4))}  ${label} ${color.dim(`(${summary.byDemo.demoSchema[status]} demo / ${summary.byDemo.bare[status]} bare)`)}`,
    );
  }
  if (summary.causes.length) {
    p.log.error(t("auditSsrCauses"));
    for (const cause of summary.causes.slice(0, options.debug ? 100 : 10)) {
      const sample = cause.tags.slice(0, 4).join(", ");
      p.log.message(
        `${String(cause.count).padStart(4)}  ${cause.signature} ${color.dim(`[${cause.phase}] ${sample}${cause.tags.length > 4 ? ", …" : ""}`)}`,
      );
      const origins = cause.origins
        .slice(0, 3)
        .map((o) => `${o.origin} (${o.count})`)
        .join(", ");
      if (origins) {
        p.log.message(color.dim(`        thrown at ${origins}`));
      }
    }
  }
  for (const status of ["empty", "shell", "no-shadow-root"]) {
    const tags = results.filter((r) => r.status === status).map((r) => r.tag);
    if (tags.length) {
      p.log.warn(
        `${color.bold(status)} (${tags.length}): ${options.debug ? tags.join(", ") : tags.slice(0, 15).join(", ") + (tags.length > 15 ? ", …" : "")}`,
      );
    }
  }
  if (summary.size.measured) {
    p.log.info(
      t("auditSsrSizes", {
        median: kb(summary.size.median),
        p90: kb(summary.size.p90),
        max: kb(summary.size.max),
      }),
    );
    p.log.info(
      t("auditSsrStyles", {
        share: Math.round((summary.size.styleBytes / summary.size.bytes) * 100),
        shared: summary.shared.rules,
        elements: summary.shared.threshold,
        sharedShare: Math.round(summary.shared.share * 100),
      }),
    );
  }
  if (summary.fallback.withHook) {
    p.log.info(
      t("auditSsrFallback", {
        count: summary.fallback.withHook,
        recovered: summary.fallback.recovered.length,
        list: summary.fallback.recovered.map((r) => r.tag).join(", ") || "-",
        css: kb(summary.primitiveStyles.bytes),
      }),
    );
  }
  if (summary.env === "bare") {
    p.log.info(t("auditSsrEnvBare"));
  }
  if (fallbacks.length) {
    p.log.info(t("auditSsrResolver", { count: fallbacks.length }));
  }
  if (options.debug) {
    for (const r of results) {
      p.log.message(
        `${r.status.padEnd(15)} ${r.tag.padEnd(34)} ${r.demo.padEnd(10)} ${r.status === "threw" ? r.error : `${kb(r.bytes)} KB, text ${r.textChars}, styles ${kb(r.styleBytes)} KB`}${r.hints.length ? color.dim(`  [${r.hints.join(", ")}]`) : ""}`,
      );
    }
  }
  p.outro(
    saveDir
      ? t("auditSsrSaved", { dir: saveDir })
      : t("auditSsrOutro", {
          debug: color.cyan("--debug"),
          json: color.cyan("--format json"),
        }),
  );
  return { passed: true, summary, results: publicResults };
}
