# HAXcms parity harness

Replays the same seeded stream of site operations against every surface that
can change a HAXcms site, and diffs the result on disk after every op
([haxtheweb/issues#3292](https://github.com/haxtheweb/issues/issues/3292)):

| Leg      | Surface                                                                              |
| -------- | ------------------------------------------------------------------------------------ |
| `nodejs` | [haxcms-nodejs](https://github.com/haxtheweb/haxcms-nodejs) site API (the reference) |
| `php`    | [haxcms-php](https://github.com/haxtheweb/haxcms-php) site API, under `php -S`       |
| `cli`    | this repo's `hax site` commands (`node:add`, `node:edit`, `site:theme`, ...)         |

Two sequences:

- **A**: nodejs + php + cli, only ops the CLI can express (seed 2026).
- **B**: nodejs + php, every write op the site API has, including outline,
  move/indent, lock, icon, slug normalization and language (seed 2027).

Ops address pages by **logical key** (`L0` is the welcome page, `L1`, `L2`, ...
are pages the run adds), so each leg maps them onto its own uuids. After every
op each leg's `site.json` and page HTML are normalized (uuids become logical
keys, `created` / `updated` are dropped) and diffed against the nodejs leg.
Each new difference pattern is recorded with the op that first produced it.

It is **report-only**: divergences never fail a run. A run fails only when
the harness itself crashes (a server does not start, a leg cannot create its
site). The nightly workflow is
[`.github/workflows/parity-nightly.yml`](../../.github/workflows/parity-nightly.yml).

## Setup

Check the three repos out side by side (the defaults expect this layout, any
other layout works with the flags below):

```bash
git clone https://github.com/haxtheweb/create.git
git clone https://github.com/haxtheweb/haxcms-nodejs.git
git clone https://github.com/haxtheweb/haxcms-php.git

# haxcms-nodejs: the nodejs leg boots from src/; the CLI loads dist/
(cd haxcms-nodejs && npm ci && npm run build)

# the CLI, linked to that haxcms-nodejs build instead of the npm release
(cd create && npm ci && npm run build \
  && rm -rf node_modules/@haxtheweb/haxcms-nodejs \
  && ln -s ../../../haxcms-nodejs node_modules/@haxtheweb/haxcms-nodejs)

# haxcms-php: one-time install, the user / password become --php-user / --php-pass
(cd haxcms-php && TERM=xterm bash scripts/haxtheweb.sh admin admin)
```

Needs Node.js 20+ (24 in CI), PHP 8.3+ with the extensions haxcms-php lists,
and git.

## Run

```bash
node create/test/parity/parity.cjs --nodejs haxcms-nodejs --php haxcms-php \
  --seq A,B --ops 1000 --out parity-results
```

`parity.cjs` boots haxcms-nodejs with that repo's own e2e runtime
(`test/e2e/helpers/harness.cjs`, a fresh temp directory with real auth),
starts `php -S` with [`php-router.php`](php-router.php), runs each sequence,
writes `summary.md`, and stops both servers. `npm run test:parity -- <flags>`
runs the same thing from inside `create`.

To test pull request branches, check them out in the sibling repos, rebuild
haxcms-nodejs (`npm run build`, the CLI link follows it) and rebuild the CLI
if its branch changed, then run the same command.

### Settings

Every setting is a flag (`--name value` or `--name=value`) or an environment
variable; flags win.

| Flag          | Environment variable     | Default                            | Meaning                                                     |
| ------------- | ------------------------ | ---------------------------------- | ----------------------------------------------------------- |
| `--nodejs`    | `HAX_PARITY_NODEJS_REPO` | `../haxcms-nodejs` (beside create) | haxcms-nodejs checkout                                      |
| `--php`       | `HAX_PARITY_PHP_REPO`    | `../haxcms-php` (beside create)    | installed haxcms-php checkout (its `_sites` is the php leg) |
| `--cli`       | `HAX_PARITY_CLI`         | `dist/create.js` of this repo      | built CLI entry point                                       |
| `--php-bin`   | `HAX_PARITY_PHP_BIN`     | `php`                              | PHP binary for `php -S`                                     |
| `--php-host`  | `HAX_PARITY_PHP_HOST`    | `127.0.0.1`                        | `php -S` host                                               |
| `--php-port`  | `HAX_PARITY_PHP_PORT`    | `8081`                             | `php -S` port                                               |
| `--php-url`   | `HAX_PARITY_PHP_URL`     | (start `php -S`)                   | use a haxcms-php server that is already running             |
| `--php-user`  | `HAX_PARITY_PHP_USER`    | `admin`                            | haxcms-php login                                            |
| `--php-pass`  | `HAX_PARITY_PHP_PASS`    | `admin`                            | haxcms-php password                                         |
| `--node-info` | `HAX_PARITY_NODE_INFO`   | (boot haxcms-nodejs)               | `node.json` from `boot-node.cjs`, to reuse a running server |
| `--seq`       | `HAX_PARITY_SEQ`         | `A,B`                              | sequences to run                                            |
| `--ops`       | `HAX_PARITY_OPS`         | `1000`                             | ops per sequence                                            |
| `--seed`      | `HAX_PARITY_SEED`        | 2026 for A, 2027 for B             | op generator seed                                           |
| `--snapshots` | `HAX_PARITY_SNAPSHOTS`   | `100`                              | keep normalized snapshots for ops 0..N                      |
| `--strict`    | `HAX_PARITY_STRICT`      | off                                | skip the accepted-difference normalizations                 |
| `--out`       | `HAX_PARITY_OUT`         | `./parity-results`                 | results directory                                           |
| `--work`      | `HAX_PARITY_WORK`        | a new OS temp directory            | where the CLI leg creates its sites                         |

### Output

```text
<out>/
  summary.md            markdown report (also the GitHub job summary)
  env.json              repo refs, and which haxcms-nodejs the CLI loaded
  nodejs-server.log  php-server.log
  A/  B/
    meta.json           seed, ops, site name, each leg's site directory
    ops.jsonl           the ops, one JSON object per line
    log.jsonl           per op: each leg's status and diff count
    signatures.json     every difference pattern, first op, example
    stats.json          op status counts, accepted normalizations applied
    snapshots/<leg>/<op>.json   normalized snapshots for ops 0..--snapshots
```

## Accepted differences

[`normalize.cjs`](normalize.cjs) lists the differences that come from how a
backend is deployed or which HTML parser it uses, not from what it did with
the op. They are normalized away before comparing; everything else is strict.

- `site-location`: `site.json.location` starts with `/_sites/` on
  haxcms-nodejs and `/sites/` on haxcms-php.
- `html-repair`: the deliberately malformed markup in `ops.cjs`
  (`MALFORMED_HTML`) is repaired differently by each backend's HTML parser.
  Only the repaired forms listed in `HTML_REPAIRS` are accepted; a new form
  shows up as a divergence.

Keep additions as narrow as these (one path, explicit values) and explain why
the difference is not a behavior difference. `--strict` shows the raw diffs.

## Agent leg

[`verify.cjs`](verify.cjs) checks an AI agent that replays a sequence A run
on its own CLI site against the recorded snapshots. After creating the site
(op 0) and after each op N:

```bash
node create/test/parity/verify.cjs --results parity-results/A --site <agent site dir> --op N
```

It binds the page an `addPage` op created to its logical key, snapshots the
agent's site with the same normalization, and diffs it against the nodejs and
scripted-CLI snapshots for that op. Results go to
`parity-results/agent/verify.jsonl`. The agent workflow is the
`hax-parity-agent-leg` skill in
[haxtheweb/praw](https://github.com/haxtheweb/praw/tree/main/skills).

## Files

| File             | Role                                                          |
| ---------------- | ------------------------------------------------------------- |
| `parity.cjs`     | one-command run: boot servers, run sequences, summarize, stop |
| `run.cjs`        | lockstep runner for one sequence                              |
| `ops.cjs`        | seeded op generator (`shared` = CLI-expressible, `api` = all) |
| `legs.cjs`       | `ApiLeg` (nodejs / php) and `CliLeg`                          |
| `client.cjs`     | HAXcms API client: login, user token, site token              |
| `snapshot.cjs`   | normalize a site from disk and diff two snapshots             |
| `normalize.cjs`  | accepted differences                                          |
| `summary.cjs`    | markdown report                                               |
| `verify.cjs`     | agent-leg checker                                             |
| `boot-node.cjs`  | boots haxcms-nodejs with its own e2e runtime                  |
| `php-router.php` | `php -S` router matching haxcms-php's web server rules        |
| `config.cjs`     | flags, environment variables and defaults                     |
