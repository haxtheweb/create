/**
 * Copyright 2026 The Pennsylvania State University
 * @license Apache-2.0, see LICENSE for full text.
 *
 * External Dependencies (AGENTS.md): use outside libraries through their
 * JavaScript builds, never their TypeScript sources. Node 24 strips types
 * on its own, so an import of a .ts file can work on a developer's machine
 * and still break the "no compile step" promise for everyone else.
 *
 * Fails (exit 1) when a tracked .js / .mjs / .cjs file under src/ imports or
 * requires a .ts, .tsx, .mts or .cts file, or a package's src/ folder.
 *
 *   node scripts/js-builds-check.mjs              check this repo
 *   node scripts/js-builds-check.mjs --self-test  the check catches what it should
 *
 * Standard library only.
 */
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SPEC =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'`])([^"'`\n]+)\1/g;

// a specifier that points at TypeScript source
export function tsImports(text) {
  const out = [];
  for (const m of text.matchAll(SPEC)) {
    const spec = m[2];
    const outside = !spec.startsWith(".") && !spec.startsWith("/");
    if (/\.(ts|tsx|mts|cts)$/.test(spec) && !/\.d\.ts$/.test(spec))
      out.push(spec);
    else if (outside && /^(@[^/]+\/)?[^/]+\/src\//.test(spec)) out.push(spec);
  }
  return out;
}

function selfTest() {
  const cases = [
    ['import x from "lit";', 0],
    ['import { a } from "@scope/pkg/dist/index.js";', 0],
    ['import y from "./local.js";', 0],
    ['import z from "pkg/src/index.ts";', 1],
    ['const m = await import("@scope/pkg/src/thing.js");', 1],
    ['const r = require("./helper.ts");', 1],
    ['import t from "types.d.ts";', 0],
  ];
  let failed = 0;
  for (const [text, want] of cases) {
    const got = tsImports(text).length;
    if (got !== want) {
      failed++;
      console.log(`self-test FAILED: ${text} -> ${got}, wanted ${want}`);
    }
  }
  console.log(
    `js-builds self-test: ${cases.length - failed} of ${cases.length} cases pass`,
  );
  return failed ? 1 : 0;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--self-test")) {
    process.exitCode = selfTest();
  } else {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const files = execFileSync("git", ["ls-files", "-z", "--", "src"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\0")
      .filter((f) => /\.(js|mjs|cjs)$/.test(f) && !/\/templates\//.test(f));
    let n = 0;
    for (const f of files) {
      for (const spec of tsImports(
        fs.readFileSync(path.join(root, f), "utf8"),
      )) {
        n++;
        console.log(
          `${f}: imports ${spec}; use the library's JavaScript build (AGENTS.md External Dependencies)`,
        );
      }
    }
    console.log(
      `js-builds: ${n ? n + " finding(s)" : "OK"} (${files.length} files)`,
    );
    process.exitCode = n ? 1 : 0;
  }
}
