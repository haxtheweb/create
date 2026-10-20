/**
 * Worker for `hax audit ssr`. Runs in its own node process (see audit-ssr.js).
 *
 * This file is plain ESM and is excluded from babel (babel.config.js): the
 * babel build rewrites import() into require(), which cannot load the
 * ESM-only @lit-labs/ssr and element modules.
 *
 * Protocol: one JSON document on stdin
 *   { root, timeout, shim, items: [{ tag, specifier, demo }] }  (shim: false skips the inert DOM)
 * and one JSON document per line on stdout:
 *   { fatal: "<code>", message }        the audit cannot run at all
 *   { primitives }                       the primitive stylesheet the kit ships (sent once, after startup)
 *   { tag, file, ok: true, skipped }     the kit marks the element as not renderable; it was not imported
 *   { tag, file, ok, html, truncated, progressive? }  rendered (ok: true) or failed; truncated: output was cut at 8 MB; progressive is the
 *                                       progressive-enhancement markup the element supplies
 *   { tag, file, ok: false, phase, error, warnings }   phase: import | render | async | timeout
 *   { fallback: { specifier, parent } }   an extensionless import was resolved by the fallback
 *   { done: true }
 */
/* eslint-disable n/no-process-exit, n/no-unsupported-features/node-builtins --
   this is a standalone child process: it exits itself once stdout has flushed,
   and module.register is the only way to add a resolver fallback */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { MessageChannel } from "node:worker_threads";

const out = (doc, done) =>
  process.stdout.write(JSON.stringify(doc) + "\n", done);

/**
 * Find an installed package directory without going through its exports map.
 * Looks in the audited project first (so the elements and the renderer share
 * one copy of lit), then next to this CLI.
 */
function findPackageDir(name, roots) {
  for (const start of roots) {
    let dir = start;
    for (;;) {
      const candidate = path.join(dir, "node_modules", ...name.split("/"));
      if (existsSync(path.join(candidate, "package.json"))) {
        return realpathSync(candidate);
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  return null;
}

// "@scope/name/sub/path.js" -> { name: "@scope/name", sub: "sub/path.js" }
function splitSpecifier(specifier) {
  const parts = specifier.split("/");
  const nameLength = specifier.startsWith("@") ? 2 : 1;
  return {
    name: parts.slice(0, nameLength).join("/"),
    sub: parts.slice(nameLength).join("/"),
  };
}

// monorepo checkout: elements/<name>/package.json declares the package
function monorepoPackageDir(root, name) {
  const short = name.split("/").pop();
  const dir = path.join(root, "elements", short);
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(dir, "package.json"), "utf8"),
    );
    return pkg.name === name ? dir : null;
  } catch {
    return null;
  }
}

function resolveElementFile(root, specifier) {
  const { name, sub } = splitSpecifier(specifier);
  const dir = monorepoPackageDir(root, name) || findPackageDir(name, [root]);
  if (!dir) {
    return null;
  }
  return sub ? path.join(dir, sub) : dir;
}

/**
 * Elements are written for bundler-style resolution (the dev server adds
 * ".js" and "/index.js"); node's ESM resolver does not. Without this fallback
 * every element that has an extensionless import would fail for a reason that
 * has nothing to do with SSR. Each use is reported so the count stays visible.
 */
const RESOLVER_HOOKS = `
let port;
export async function initialize(data) {
  port = data.port;
}
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const missing =
      error &&
      (error.code === "ERR_MODULE_NOT_FOUND" ||
        error.code === "ERR_UNSUPPORTED_DIR_IMPORT");
    if (missing) {
      for (const suffix of [".js", ".mjs", "/index.js"]) {
        try {
          const result = await nextResolve(specifier + suffix, context);
          if (port) {
            port.postMessage({ specifier, parent: context.parentURL });
          }
          return result;
        } catch (e) {
          // try the next suffix
        }
      }
    }
    throw error;
  }
}
`;

function installResolverFallback() {
  const { port1, port2 } = new MessageChannel();
  port1.on("message", (fallback) => out({ fallback }));
  // must not keep the process alive after the audit
  port1.unref();
  register("data:text/javascript," + encodeURIComponent(RESOLVER_HOOKS), {
    parentURL: import.meta.url,
    data: { port: port2 },
    transferList: [port2],
  });
}

const readStdin = async () => {
  let data = "";
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return JSON.parse(data);
};

const firstLine = (error) => {
  const lines = String((error && (error.stack || error.message)) || error)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^at /.test(line));
  // a multi-line message starts "Error: " with the text on the next line
  // (Lit SSR does this); keep the text so the failure is not reported blank
  if (lines.length > 1 && /^[\w$.]*(Error|Exception):?$/.test(lines[0])) {
    return `${lines[0]} ${lines[1]}`.slice(0, 300);
  }
  return (lines[0] || "").slice(0, 300);
};

/**
 * Where an error came from: the first stack frame that is not the renderer
 * itself, as path:line relative to the project. Several elements failing the
 * same way usually share one origin, which is where the fix goes.
 */
function originOf(error, root) {
  for (const line of String((error && error.stack) || "").split("\n")) {
    const match = /\(?(file:\/\/[^\s)]+?):(\d+):\d+\)?\s*$/.exec(line.trim());
    if (!match) {
      continue;
    }
    try {
      const file = fileURLToPath(match[1]);
      if (/node_modules[\\/]@lit-labs[\\/]ssr[\\/]/.test(file)) {
        continue;
      }
      return `${path.relative(root, file)}:${match[2]}`;
    } catch {
      // not a usable file url, try the next frame
    }
  }
  return null;
}

async function main() {
  const { root, items, timeout, shim } = await readStdin();
  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const ssrDir = findPackageDir("@lit-labs/ssr", [root, cliDir]);
  if (!ssrDir) {
    out({
      fatal: "missing-ssr",
      message:
        "@lit-labs/ssr is not installed in the project or next to the hax CLI",
    });
    return;
  }
  const litDir = findPackageDir("lit", [root, ssrDir, cliDir]);
  if (!litDir) {
    out({ fatal: "missing-lit", message: "lit is not installed" });
    return;
  }
  // the render kit lives in haxcms-nodejs so the server can use the same code
  const kitDir = findPackageDir("@haxtheweb/haxcms-nodejs", [cliDir, root]);
  const kitFile =
    kitDir && path.join(kitDir, "dist", "lib", "ssr", "index.mjs");
  if (!kitFile || !existsSync(kitFile)) {
    out({
      fatal: "missing-ssr-kit",
      message:
        "@haxtheweb/haxcms-nodejs with the SSR render kit (dist/lib/ssr) is not installed next to the hax CLI",
    });
    return;
  }
  const kit = await import(pathToFileURL(kitFile).href);
  const {
    installInertDom,
    SSR_PRIMITIVE_CSS,
    ssrSkipReason,
    buildTemplate,
    collectCapped,
    progressiveFallback,
  } = kit;
  installResolverFallback();
  const load = (file) => import(pathToFileURL(file).href);
  // the shim has to exist before any element module is evaluated
  await load(path.join(ssrDir, "lib", "install-global-dom-shim.js"));
  if (shim !== false) {
    installInertDom();
  }
  const { render } = await load(path.join(ssrDir, "lib", "render.js"));
  const { html } = await load(path.join(litDir, "index.js"));
  out({ primitives: SSR_PRIMITIVE_CSS });

  // anything an element logs or throws asynchronously is attributed to the
  // element being rendered at that moment
  let current = null;
  let warnings = [];
  const asyncFailure = (error) => {
    if (current && !current.asyncError) {
      current.asyncError = firstLine(error);
    }
  };
  process.on("uncaughtException", asyncFailure);
  process.on("unhandledRejection", asyncFailure);
  const quiet =
    (level) =>
    (...args) => {
      if (level !== "log" && warnings.length < 5) {
        warnings.push(`${level}: ${args.map(String).join(" ").slice(0, 200)}`);
      }
    };
  console.log = quiet("log");
  console.info = quiet("log");
  console.debug = quiet("log");
  console.warn = quiet("warn");
  console.error = quiet("error");

  for (const item of items) {
    current = { asyncError: null };
    warnings = [];
    const file = resolveElementFile(root, item.specifier);
    const base = { tag: item.tag, file };
    let timer;
    try {
      if (!file || !existsSync(file)) {
        out({
          ...base,
          ok: false,
          phase: "import",
          error: `Cannot find ${item.specifier}`,
          warnings,
        });
        continue;
      }
      // known not to render: do not even import it
      const known = ssrSkipReason(item.tag);
      if (known) {
        out({ ...base, ok: true, skipped: known, warnings });
        continue;
      }
      try {
        await load(file);
      } catch (error) {
        out({
          ...base,
          ok: false,
          phase: "import",
          error: firstLine(error),
          origin: originOf(error, root),
          warnings,
        });
        continue;
      }
      // an element can also opt out itself (static ssr = false)
      const declared = ssrSkipReason(
        item.tag,
        globalThis.customElements.get(item.tag),
      );
      if (declared) {
        out({ ...base, ok: true, skipped: declared, warnings });
        continue;
      }
      const rendering = collectCapped(
        render(buildTemplate(html, item.tag, item.demo)),
      );
      const result = await Promise.race([
        rendering,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(Symbol.for("timeout")), timeout);
        }),
      ]);
      if (result === Symbol.for("timeout")) {
        out({
          ...base,
          ok: false,
          phase: "timeout",
          error: `render did not finish within ${timeout}ms`,
          warnings,
        });
        continue;
      }
      out({
        ...base,
        ok: true,
        html: result.html,
        truncated: result.truncated,
        progressive: await progressiveFallback(item.tag, item.demo),
        warnings,
      });
    } catch (error) {
      out({
        ...base,
        ok: false,
        phase: "render",
        error: firstLine(error),
        origin: originOf(error, root),
        progressive: await progressiveFallback(item.tag, item.demo),
        warnings,
      });
    } finally {
      clearTimeout(timer);
      // let any stray rejection land on this element before moving on
      await new Promise((resolve) => setImmediate(resolve));
      if (current && current.asyncError) {
        out({
          ...base,
          asyncOnly: true,
          ok: false,
          phase: "async",
          error: current.asyncError,
          warnings,
        });
      }
      current = null;
    }
  }
  await new Promise((resolve) => out({ done: true }, resolve));
}

// exit from the write callback: process.exit() would cut off output still
// buffered on the pipe, and elements can leave timers running
main().then(
  () => process.exit(0),
  (error) =>
    out({ fatal: "worker-crashed", message: firstLine(error) }, () =>
      process.exit(0),
    ),
);
