// Markdown summary of a parity run (one or more sequences under --out).
//   node summary.cjs --out <results dir> [> summary.md]
// Written to <out>/summary.md too. Report-only: always exits 0 when the
// results can be read.
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config.cjs");
const { ACCEPTED } = require("./normalize.cjs");

// table-cell safe: HTML-escaped (job summaries render HTML), pipes escaped,
// one line, truncated
function cell(v, max = 70) {
  let s = typeof v === "string" ? v : JSON.stringify(v);
  if (s === undefined) s = String(v);
  s = s.replace(/\s+/g, " ");
  if (s.length > max) s = s.slice(0, max) + "…";
  s = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;");
  return "<code>" + s + "</code>";
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function summarize(outDir) {
  const lines = ["## HAXcms parity run", ""];
  const env = readJson(path.join(outDir, "env.json"), null);
  if (env) {
    lines.push("| Surface | Source |", "| --- | --- |");
    for (const [k, v] of Object.entries(env.sources || {}))
      lines.push(`| ${k} | ${cell(v, 120)} |`);
    lines.push("");
    if (env.cliBackend)
      lines.push(
        `CLI resolves \`@haxtheweb/haxcms-nodejs\` to ${cell(env.cliBackend, 160)}.`,
        "",
      );
  }
  lines.push(
    "Report-only: divergences never fail this job. Accepted, deployment-specific differences are normalized first (see `test/parity/normalize.cjs`); everything else is compared strictly against the haxcms-nodejs leg.",
    "",
  );
  const seqs = fs.existsSync(outDir)
    ? fs
        .readdirSync(outDir)
        .filter((d) => fs.existsSync(path.join(outDir, d, "meta.json")))
        .sort()
    : [];
  if (!seqs.length) lines.push("_No sequence results found._", "");
  for (const seq of seqs) {
    const dir = path.join(outDir, seq);
    const meta = readJson(path.join(dir, "meta.json"), {});
    const sigs = readJson(path.join(dir, "signatures.json"), {});
    const stats = readJson(path.join(dir, "stats.json"), {
      statusCounts: {},
      accepted: {},
    });
    const legs = (meta.legs || []).map((l) => l.name);
    const done = meta.seconds !== undefined;
    lines.push(
      `### Sequence ${seq}: ${legs.join(" + ")}`,
      "",
      `${meta.ops} ops, seed ${meta.seed}, ${done ? meta.seconds + "s" : "**did not finish**"}${meta.strict ? ", strict (no accepted normalizations)" : ""}. Snapshots kept for ops 0-${meta.snapshots}.`,
      "",
    );
    const list = Object.values(sigs).sort(
      (a, b) => a.firstOp - b.firstOp || a.leg.localeCompare(b.leg),
    );
    const perLeg = {};
    for (const s of list) perLeg[s.leg] = (perLeg[s.leg] || 0) + 1;
    lines.push(
      `**${list.length} divergence pattern(s)** vs nodejs` +
        (list.length
          ? ": " +
            Object.entries(perLeg)
              .map(([k, v]) => `${k} ${v}`)
              .join(", ")
          : "") +
        ".",
      "",
    );
    if (list.length) {
      lines.push(
        "| Leg | Path | First op | Op type | Ops seen | nodejs | other |",
        "| --- | --- | ---: | --- | ---: | --- | --- |",
      );
      for (const s of list)
        lines.push(
          `| ${s.leg} | ${cell(s.path, 90)} | ${s.firstOp} | ${s.opType} | ${s.opsSeen} | ${cell(s.example.ref)} | ${cell(s.example.other)} |`,
        );
      lines.push("");
    }
    const bad = Object.entries(stats.statusCounts || {}).filter(
      ([k]) => !/\| (200|ok)$/.test(k),
    );
    lines.push(
      bad.length
        ? "**Non-success op statuses** (leg | op | status: count): " +
            bad.map(([k, v]) => `${cell(k, 80)}: ${v}`).join(", ")
        : "All op calls returned success (HTTP 200 / CLI exit 0).",
      "",
    );
    const acc = Object.entries(stats.accepted || {});
    if (acc.length) {
      lines.push(
        "Accepted normalizations applied (leg | rule: snapshots): " +
          acc.map(([k, v]) => `${cell(k, 60)}: ${v}`).join(", "),
        "",
      );
    }
  }
  lines.push(
    "<details><summary>Accepted differences</summary>",
    "",
    ...ACCEPTED.map((r) => `- \`${r.id}\` (${cell(r.path)}): ${r.why}`),
    "",
    "</details>",
    "",
  );
  return lines.join("\n");
}

module.exports = { summarize, cell };

if (require.main === module) {
  const cfg = loadConfig();
  const md = summarize(cfg.out);
  fs.mkdirSync(cfg.out, { recursive: true });
  fs.writeFileSync(path.join(cfg.out, "summary.md"), md);
  process.stdout.write(md + "\n");
}
