"use strict";

// HAXCMS.recurseCopy(src, dst, skip, base) only copies when it is given the
// directory the copy must stay inside (its containment base). Without it,
// haxcms-nodejs returns false and copies nothing, which broke `hax wc`.
// Every call the CLI makes must pass that fourth argument, and must check
// the return value so a refused copy fails loudly instead of carrying on.
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const acorn = require("acorn");
const walk = require("acorn-walk");

const SRC = path.join(__dirname, "../../src");

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "templates" && entry.name !== "locales") {
        out.push(...sourceFiles(full));
      }
    } else if (entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

function isRecurseCopyCall(node) {
  return (
    node.callee &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.name === "recurseCopy"
  );
}

function recurseCopyCalls() {
  const calls = [];
  for (const file of sourceFiles(SRC)) {
    const code = fs.readFileSync(file, "utf8");
    if (!code.includes("recurseCopy")) continue;
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });
    walk.ancestor(ast, {
      CallExpression(node, ancestors) {
        if (isRecurseCopyCall(node)) {
          calls.push({
            where: `${path.relative(SRC, file)}:${node.loc.start.line}`,
            node,
            ancestors: ancestors.slice(0, -1),
          });
        }
      },
    });
  }
  return calls;
}

test("the CLI copies template files with HAXCMS.recurseCopy", () => {
  // guards the guard: if this finds nothing the checks below prove nothing
  assert.ok(recurseCopyCalls().length > 0);
});

test("every HAXCMS.recurseCopy call passes a containment base", () => {
  for (const { where, node } of recurseCopyCalls()) {
    assert.ok(
      node.arguments.length >= 4,
      `${where} calls recurseCopy with ${node.arguments.length} arguments; pass (src, dst, skip, base)`,
    );
  }
});

test("every HAXCMS.recurseCopy result is checked", () => {
  for (const { where, ancestors } of recurseCopyCalls()) {
    // the call sits under `await`, whose parent must keep the result
    // (a declaration or assignment), not drop it as a bare statement
    const holder = ancestors
      .slice()
      .reverse()
      .find((n) => n.type !== "AwaitExpression");
    assert.ok(
      holder && holder.type !== "ExpressionStatement",
      `${where} ignores recurseCopy's return value; a refused copy must stop the command`,
    );
  }
});
