// Lockstep parity runner for one sequence.
//   A: haxcms-nodejs API + haxcms-php API + HAX CLI, ops the CLI can express
//   B: haxcms-nodejs API + haxcms-php API, every write op the API has
// After every op each leg's site.json + page HTML is normalized and diffed
// against the nodejs (reference) leg. Each new difference pattern is recorded
// with the op that first produced it. Divergences never fail the run; only a
// harness crash (a leg cannot create its site, a server is down) does.
//
// Usually started by parity.cjs, which boots the servers. Run it on its own
// against servers that are already up:
//   node run.cjs --seq A --ops 50 --node-info node.json --php-url http://127.0.0.1:8081
const fs = require("fs");
const path = require("path");
const { OpGenerator } = require("./ops.cjs");
const { ApiLeg, CliLeg } = require("./legs.cjs");
const { snapshot, compareSnapshots, pattern } = require("./snapshot.cjs");
const { loadConfig, seedFor } = require("./config.cjs");

async function runSequence(cfg, seq, nodeInfo, log = console.log) {
  const N = cfg.ops;
  const SEED = seedFor(cfg, seq);
  const OUT = path.join(cfg.out, seq);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of ["ops.jsonl", "log.jsonl"])
    fs.writeFileSync(path.join(OUT, f), "");
  const siteName = "parity" + seq.toLowerCase() + Date.now().toString(36);

  const ref = new ApiLeg(
    "nodejs",
    nodeInfo.baseUrl,
    nodeInfo.username,
    nodeInfo.password,
    nodeInfo.sitesDir,
  );
  const legs = [
    ref,
    new ApiLeg(
      "php",
      cfg["php-url"],
      cfg["php-user"],
      cfg["php-pass"],
      path.join(cfg.php, "_sites"),
    ),
  ];
  if (seq === "A")
    legs.push(new CliLeg("cli", cfg.cli, path.join(cfg.work, "cli-sites")));
  for (const l of legs) {
    await l.create(siteName);
    const items = l.items();
    l.keyToId.L0 = items[0] && items[0].id; // the welcome page
    if (items.length !== 1)
      log(`[warn] ${l.name} starts with ${items.length} items`);
  }
  const meta = {
    seq,
    seed: SEED,
    ops: N,
    siteName,
    strict: cfg.strict,
    snapshots: Math.min(cfg.snapshots, N),
    legs: legs.map((l) => ({ name: l.name, siteDir: l.siteDir })),
  };
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 2));

  const signatures = {};
  const accepted = {};
  const statusCounts = {};
  const record = (i, op, legName, diffs) => {
    const fresh = [];
    for (const d of diffs) {
      const sig = legName + " | " + pattern(d.path);
      if (!signatures[sig]) {
        signatures[sig] = {
          leg: legName,
          path: pattern(d.path),
          firstOp: i,
          opType: op ? op.type : "createSite",
          op: op || null,
          example: d,
          opsSeen: 0,
        };
        fresh.push(sig);
      }
    }
    const seen = new Set(diffs.map((d) => legName + " | " + pattern(d.path)));
    for (const s of seen) signatures[s].opsSeen++;
    return fresh;
  };
  const snapDir = path.join(OUT, "snapshots");
  const check = (i, op) => {
    const snaps = {};
    for (const l of legs) {
      snaps[l.name] = snapshot(l.siteDir, l.keyToId, { strict: cfg.strict });
      for (const id of snaps[l.name].accepted) {
        const k = l.name + " | " + id;
        accepted[k] = (accepted[k] || 0) + 1;
      }
    }
    if (i <= cfg.snapshots) {
      for (const l of legs) {
        fs.mkdirSync(path.join(snapDir, l.name), { recursive: true });
        fs.writeFileSync(
          path.join(snapDir, l.name, i + ".json"),
          JSON.stringify(snaps[l.name]),
        );
      }
    }
    const result = {};
    for (const l of legs.slice(1)) {
      const diffs = compareSnapshots(snaps.nodejs, snaps[l.name]);
      result[l.name] = {
        diffs: diffs.length,
        fresh: record(i, op, l.name, diffs),
      };
    }
    return { snaps, result };
  };
  const writeState = () => {
    fs.writeFileSync(
      path.join(OUT, "signatures.json"),
      JSON.stringify(signatures, null, 2),
    );
    fs.writeFileSync(
      path.join(OUT, "stats.json"),
      JSON.stringify({ statusCounts, accepted }, null, 2),
    );
  };

  // op 0: freshly created sites
  let { snaps, result } = check(0, null);
  fs.appendFileSync(
    path.join(OUT, "log.jsonl"),
    JSON.stringify({ i: 0, op: "createSite", result }) + "\n",
  );

  const gen = new OpGenerator(SEED, seq === "A" ? "shared" : "api");
  const t0 = Date.now();
  for (let i = 1; i <= N; i++) {
    // the generator sees the reference leg's live tree
    const refItems = snaps.nodejs.manifest.items;
    const tree = Object.keys(refItems)
      .filter((k) => /^L\d+$/.test(k))
      .map((k) => ({
        key: k,
        parent: refItems[k].parent || null,
        order: refItems[k].order,
      }));
    const op = gen.next(i, tree);
    fs.appendFileSync(path.join(OUT, "ops.jsonl"), JSON.stringify(op) + "\n");
    const statuses = {};
    await Promise.all(
      legs.map(async (l) => {
        try {
          statuses[l.name] = await l.apply(op);
        } catch (e) {
          statuses[l.name] = {
            status: "threw",
            detail: String(e && e.message).slice(0, 300),
          };
        }
      }),
    );
    for (const [leg, st] of Object.entries(statuses)) {
      const k = `${leg} | ${op.type} | ${st.status}`;
      statusCounts[k] = (statusCounts[k] || 0) + 1;
    }
    ({ snaps, result } = check(i, op));
    fs.appendFileSync(
      path.join(OUT, "log.jsonl"),
      JSON.stringify({ i, op: op.type, key: op.key, statuses, result }) + "\n",
    );
    const freshLegs = Object.entries(result).filter(([, r]) => r.fresh.length);
    if (i % 25 === 0 || freshLegs.length) {
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      const diffs = Object.entries(result)
        .map(([k, r]) => k + "=" + r.diffs)
        .join(" ");
      const fresh = freshLegs
        .map(([k, r]) => `${k}+${r.fresh.length}`)
        .join(" ");
      log(
        `[${seq}] op ${i}/${N} ${op.type} ${el}s diffs ${diffs}${fresh ? " NEW " + fresh : ""}`,
      );
    }
    if (i % 50 === 0) writeState();
  }
  writeState();
  meta.seconds = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 2));
  log(
    `[${seq}] DONE ${N} ops in ${meta.seconds}s, ${Object.keys(signatures).length} divergence patterns`,
  );
  return { meta, signatures, statusCounts, accepted };
}

module.exports = { runSequence };

if (require.main === module) {
  const cfg = loadConfig();
  if (!cfg["node-info"]) {
    console.error(
      "run.cjs needs --node-info <node.json from boot-node.cjs>; or use parity.cjs, which boots the servers",
    );
    process.exit(2);
  }
  const nodeInfo = JSON.parse(fs.readFileSync(cfg["node-info"], "utf8"));
  (async () => {
    for (const seq of cfg.seq) await runSequence(cfg, seq, nodeInfo);
  })().catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  });
}
