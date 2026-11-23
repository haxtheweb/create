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

```

haxcms-php needs no install step: every run installs a fresh copy of the
checkout (see [What a run touches](#what-a-run-touches)).

Needs Node.js 20+ (24 in CI), PHP 8.3+ with the extensions haxcms-php lists,
bash and git.

## Run

```bash
node create/test/parity/parity.cjs --nodejs haxcms-nodejs --php haxcms-php \
  --seq A,B --ops 1000 --out parity-results
```

`parity.cjs` boots haxcms-nodejs with that repo's own e2e runtime
(`test/e2e/helpers/harness.cjs`, a fresh temp directory with real auth),
installs a fresh copy of haxcms-php and starts `php -S` on it with
[`php-router.php`](php-router.php), runs each sequence, writes `summary.md`,
and stops both servers. `npm run test:parity -- <flags>` runs the same thing
from inside `create`.

### What a run touches

The result has to depend on the code under test and not on the machine, so
every leg runs on its own state and its own port:

| Leg    | State                                                                                                                                                                                                 | Port         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| nodejs | a temp runtime made by haxcms-nodejs's e2e harness                                                                                                                                                    | chosen by OS |
| php    | a copy of the `--php` checkout in the work folder, installed by its own `scripts/haxtheweb.sh` with a login made for the run: default system settings, empty `_sites`. `build/` is linked, not copied | a free port  |
| cli    | an empty home folder in the work folder, so the CLI makes a default `~/.haxcmsconfig` there                                                                                                           | (no server)  |

Nothing is read from, or written to, the checkout's `_config` and `_sites` or
your own `~/.haxcmsconfig`. That matters for more than tidiness: system
settings such as the default site language live there and end up in every new
site, so a run that picked them up would report differences that no one else
sees. `--php-in-place` (or `--php-url`) opts back in to an install you manage,
and then `--php-user` / `--php-pass` are its login.

To test pull request branches, check them out in the sibling repos, rebuild
haxcms-nodejs (`npm run build`, the CLI link follows it) and rebuild the CLI
if its branch changed, then run the same command.

### Settings

Every setting is a flag (`--name value` or `--name=value`) or an environment
variable; flags win.

| Flag             | Environment variable      | Default                            | Meaning                                                     |
| ---------------- | ------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `--nodejs`       | `HAX_PARITY_NODEJS_REPO`  | `../haxcms-nodejs` (beside create) | haxcms-nodejs checkout                                      |
| `--php`          | `HAX_PARITY_PHP_REPO`     | `../haxcms-php` (beside create)    | haxcms-php checkout; a fresh copy of it is the php leg      |
| `--cli`          | `HAX_PARITY_CLI`          | `dist/create.js` of this repo      | built CLI entry point                                       |
| `--php-bin`      | `HAX_PARITY_PHP_BIN`      | `php`                              | PHP binary for `php -S`                                     |
| `--php-host`     | `HAX_PARITY_PHP_HOST`     | `127.0.0.1`                        | `php -S` host                                               |
| `--php-port`     | `HAX_PARITY_PHP_PORT`     | (a free port)                      | `php -S` port                                               |
| `--php-url`      | `HAX_PARITY_PHP_URL`      | (start `php -S`)                   | use a haxcms-php server that is already running             |
| `--php-in-place` | `HAX_PARITY_PHP_IN_PLACE` | (off)                              | serve the `--php` checkout itself, with its own install     |
| `--php-user`     | `HAX_PARITY_PHP_USER`     | `admin`                            | login, only with `--php-url` or `--php-in-place`            |
| `--php-pass`     | `HAX_PARITY_PHP_PASS`     | `admin`                            | password, only with `--php-url` or `--php-in-place`         |
| `--node-info`    | `HAX_PARITY_NODE_INFO`    | (boot haxcms-nodejs)               | `node.json` from `boot-node.cjs`, to reuse a running server |
| `--seq`          | `HAX_PARITY_SEQ`          | `A,B`                              | sequences to run                                            |
| `--ops`          | `HAX_PARITY_OPS`          | `1000`                             | ops per sequence                                            |
| `--seed`         | `HAX_PARITY_SEED`         | 2026 for A, 2027 for B             | op generator seed                                           |
| `--snapshots`    | `HAX_PARITY_SNAPSHOTS`    | `100`                              | keep normalized snapshots for ops 0..N                      |
| `--strict`       | `HAX_PARITY_STRICT`       | off                                | skip the accepted-difference normalizations                 |
| `--out`          | `HAX_PARITY_OUT`          | `./parity-results`                 | results directory                                           |
| `--work`         | `HAX_PARITY_WORK`         | a new OS temp directory            | where the CLI leg creates its sites                         |

### Output

```text
<out>/
  summary.md            markdown report (also the GitHub job summary)
  env.json              repo refs, and which haxcms-nodejs the CLI loaded
  nodejs-server.log  php-server.log
  A/  B/
    meta.json           seed, ops, site name and description, each leg's site directory
    ops.jsonl           the ops, one JSON object per line
    log.jsonl           per op: each leg's status and diff count
    signatures.json     every difference pattern, first op, example
    stats.json          op status counts, accepted normalizations applied
    snapshots/<leg>/<op>.json   normalized snapshots for ops 0..--snapshots
```

## Golden snapshots

The sequences compare legs with each other, so a change that every leg makes
the same wrong way goes unnoticed. The golden suite
([haxtheweb/issues#3332](https://github.com/haxtheweb/issues/issues/3332))
compares every leg with a reviewed, committed snapshot instead.

Each case in [`golden/cases.cjs`](golden/cases.cjs) starts from a fresh site,
runs its steps (the same op shape as `ops.cjs`, through the same legs) and
normalizes the result the same way, with each run's site name mapped to
`SITE_NAME`. The result must equal [`golden/snapshots/<id>.json`](golden/snapshots)
on every leg. Case ids use the numbering of the 50-operation list in the
"HAX Golden Snapshot Parity Operations" doc. Cases marked `api` run on nodejs and php only,
because one of their steps has no CLI command.

```bash
# compare, report-only (what the nightly does)
npm run test:parity:golden -- --nodejs ../haxcms-nodejs --php ../haxcms-php

# exit 1 when any leg does not match (the release gate runs this; see below)
npm run test:parity:golden -- --fail-on-diff

# after an intentional output change, or for a new case: rewrite the
# snapshots from the nodejs leg, review the git diff, commit it
npm run test:parity:golden -- --update-golden --cases 26-title-and-slug
```

`--update-golden` still compares php and the CLI against the snapshot it just
wrote, so a leg that disagrees is reported, not written into the golden file.
A step that fails (HTTP 400+, CLI exit code) fails its case. Results go to
`<out>/golden/results.json` and `<out>/summary.md`.

| Flag              | Environment variable       | Meaning                                   |
| ----------------- | -------------------------- | ----------------------------------------- |
| `--golden`        | `HAX_PARITY_GOLDEN`        | run the golden suite instead of sequences |
| `--update-golden` | `HAX_PARITY_UPDATE_GOLDEN` | rewrite snapshots (implies `--golden`)    |
| `--fail-on-diff`  | `HAX_PARITY_FAIL_ON_DIFF`  | exit 1 when any case does not match       |
| `--cases`         | `HAX_PARITY_CASES`         | comma-separated case ids (default: all)   |

To add a case: append it to `golden/cases.cjs`, run with
`--update-golden --cases <id>`, check the new snapshot shows what the case
claims, and commit both.

Outline cases send what outline-designer sends: `outlineSave` is one Save
Outline (every page, this save's changes, new pages under a client id, depths
recomputed) and `outlineRaw` a hand-written payload (`"@L1"` stands for that
page's id). A step with `expect: <status>` must be refused with exactly that
HTTP status on every leg; the snapshot then shows the site as the steps before
it left it.

## Generated inputs (fuzz)

The sequences and the golden cases send inputs someone chose. `--fuzz`
([haxtheweb/issues#3386](https://github.com/haxtheweb/issues/issues/3386))
sends inputs nobody chose: [`openapi-arb.cjs`](openapi-arb.cjs) turns the
operations, parameters and JSON request bodies of haxcms-nodejs's
`src/openapi/site-spec.yaml` into [fast-check](https://fast-check.dev)
arbitraries, and [`fuzz.cjs`](fuzz.cjs) sends every generated request to
haxcms-nodejs and haxcms-php and diffs what comes back: the HTTP status, the
response body, and after a write the two sites on disk (the same snapshot
diff the sequences use). It takes the place of a second, PHP-only fuzz stack.

One run is a sequence of 1 to 3 requests against a site that is first put
back to the same starting state (the welcome page, two top-level pages and a
child page, all stamped January 1, 2026), so a counterexample does not depend
on the runs before it and fast-check can shrink it. Most generated bodies fit
the spec; about one in seven gets one out-of-spec change (a property dropped
or given another JSON type), because the backends must also refuse the same
things. String fields get arbitrary text mixed with values HAXcms gives
meaning to (page ids, slugs, HTML, titles). The site reference and the login
are always the real ones: this run does not fuzz authentication.

It follows the HAX fuzz convention
([haxtheweb/issues#3272](https://github.com/haxtheweb/issues/issues/3272),
[`test/_helpers/fuzz-config.cjs`](../_helpers/fuzz-config.cjs)):

| Variable        | Meaning                                                              |
| --------------- | -------------------------------------------------------------------- |
| `HAX_FUZZ_SEED` | an integer, or `random`; unset is the fixed default seed 3386        |
| `HAX_FUZZ_RUNS` | generated sequences per round (default 100)                          |
| `HAX_FUZZ_PATH` | replay one reported counterexample (with the seed it was found with) |

```bash
# the fixed default seed
npm run test:parity:fuzz -- --nodejs ../haxcms-nodejs --php ../haxcms-php

# hunt, as the nightly does
HAX_FUZZ_SEED=random HAX_FUZZ_RUNS=300 npm run test:parity:fuzz

# replay a finding: the line printed with it, run from this repo
HAX_FUZZ_SEED=3386 HAX_FUZZ_PATH=5:0:0:1 HAX_FUZZ_RUNS=100 node test/parity/parity.cjs --fuzz
```

A difference is a **finding**: fast-check shrinks it to the smallest sequence
that still shows it, the run replays that once to confirm it, and the report
(`<out>/summary.md`, `<out>/fuzz/results.json`) lists the requests, what
differed and the one-line replay command. A finding has a **signature** per
difference (`<operationId>:<leg>:<where>`). After a finding its signatures
are skipped and the same seed runs again, so one hunt reports up to
`--fuzz-findings` different divergences and not the same first one each time;
a replay line carries the signatures skipped before its finding
(`--fuzz-skip`), which makes it reproduce that finding exactly.

Like the rest of the harness it is report-only unless `--fail-on-diff` is
given. When a finding is fixed, add its requests as a plain regression test in
both backends (a golden case here, or a route test in each repo), so the fix
stays without the fuzz run.

| Flag              | Environment variable       | Default | Meaning                                                   |
| ----------------- | -------------------------- | ------- | --------------------------------------------------------- |
| `--fuzz`          | `HAX_PARITY_FUZZ`          | off     | run generated inputs instead of the sequences             |
| `--fuzz-ops`      | `HAX_PARITY_FUZZ_OPS`      | all     | only these operationIds, comma separated (focus a hunt)   |
| `--fuzz-steps`    | `HAX_PARITY_FUZZ_STEPS`    | `3`     | most requests in one run                                  |
| `--fuzz-findings` | `HAX_PARITY_FUZZ_FINDINGS` | `10`    | stop the hunt after this many different findings          |
| `--fuzz-skip`     | `HAX_PARITY_FUZZ_SKIP`     | (none)  | signatures to ignore from the start (set by replay lines) |
| `--fail-on-diff`  | `HAX_PARITY_FAIL_ON_DIFF`  | off     | exit 1 when there is a finding                            |

What is normalized before comparing, and nothing else: each leg's page ids
(logical keys, as in the sequences), its base URL and sites folder,
`created` / `updated` style keys, and any time that falls inside the run
itself (that is "now" on the leg that wrote it). Times of the starting pages
are pinned, so how a backend formats a date is still compared.

Left out, with the reason in `EXCLUDED_OPERATIONS` in `fuzz.cjs` and in
every report: multipart uploads, exports that answer an archive or document,
the link checker (it uses the network), page revisions (git commit ids differ
per leg) and the static discovery and OpenAPI documents (`spec-diff.cjs`
compares those).

The engine itself is tested on every pull request with a fixed seed
([`test/unit/parity-fuzz.test.cjs`](../unit/parity-fuzz.test.cjs)): two
in-process legs that agree pass, and a difference seeded into one of them is
caught, shrunk and replayed from its `{ seed, path }`. The run against the
real backends is nightly only, since it needs both of them built.

## Release gate

[`release-gate.cjs`](release-gate.cjs)
([haxtheweb/issues#3334](https://github.com/haxtheweb/issues/issues/3334)) is
what a release runs before anything is tagged or published, against the
haxcms-nodejs and haxcms-php checkouts that are about to ship. It passes only
when:

1. both backends serve the same OpenAPI contract. haxcms-nodejs's
   `src/openapi/{site,system}-spec.yaml` and haxcms-php's
   `system/backend/php/lib/{site,system}Routes/openapi/*-spec.yaml` are parsed
   and compared as data, so line folding and quote style do not count
   ([`spec-diff.cjs`](spec-diff.cjs)); and
2. every golden case matches its snapshot on every leg (`--golden --fail-on-diff`).

```bash
npm run test:parity:release -- --nodejs ../haxcms-nodejs --php ../haxcms-php --build --link-cli
```

| Flag           | Meaning                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--build`      | `npm run build` in haxcms-nodejs and in this repo first (both load from `dist/`, which git does not track)                                                                                                     |
| `--link-cli`   | point this CLI's `@haxtheweb/haxcms-nodejs` at the checkout under test for the run, then put the installed one back. Without it, a CLI on any other haxcms-nodejs fails the gate, since that is not what ships |
| `--specs-only` | check the OpenAPI specs and stop                                                                                                                                                                               |
| `--old-sites`  | also run the [old-site compatibility check](../old-sites/README.md) on both backends and the CLI (haxtheweb/issues#3175). Off unless given; when given, it has to pass for the gate to pass                    |

Every other flag goes to `parity.cjs` (`--out`, `--cases`, ...).
The report is `<out>/release-gate.md`; the exit code is 0 only when both checks
pass. The ubiquity scripts in webcomponents call it: `ubiquity-testing.sh`
reports the result, `ubiquity-push.sh` stops before anything is committed,
tagged or published when it fails. The nightly
([`parity-nightly.yml`](../../.github/workflows/parity-nightly.yml)) runs the
same golden suite against both default branches, report-only, as the early
warning between releases.

A gate failure is either a real parity break (fix the backend that is wrong)
or an intended output change: refresh the snapshots with `--update-golden`,
review the diff and commit it to this repo before releasing.

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
(op 0, with the `siteName` and `siteDescription` from `meta.json`) and after
each op N:

```bash
node create/test/parity/verify.cjs --results parity-results/A \
  --site <agent site dir> --state <state dir> --op N
```

It binds the page an `addPage` op created to its logical key, snapshots the
agent's site with the same normalization, and diffs it against the nodejs and
scripted-CLI snapshots for that op. State and results (`state.json`,
`verify.jsonl`) go to `--state`, by default `./parity-agent/<site name>`; a
state directory inside the run directory is refused, so a downloaded run stays
as recorded. The agent workflow is the
`hax-parity-agent-leg` skill in
[haxtheweb/praw](https://github.com/haxtheweb/praw/tree/main/skills).

## Files

| File               | Role                                                             |
| ------------------ | ---------------------------------------------------------------- |
| `parity.cjs`       | one-command run: boot servers, run sequences, summarize, stop    |
| `run.cjs`          | lockstep runner for one sequence                                 |
| `ops.cjs`          | seeded op generator (`shared` = CLI-expressible, `api` = all)    |
| `legs.cjs`         | `ApiLeg` (nodejs / php) and `CliLeg`                             |
| `client.cjs`       | HAXcms API client: login, user token, site token                 |
| `snapshot.cjs`     | normalize a site from disk and diff two snapshots                |
| `normalize.cjs`    | accepted differences                                             |
| `summary.cjs`      | markdown report                                                  |
| `verify.cjs`       | agent-leg checker                                                |
| `golden.cjs`       | golden snapshot suite (`--golden`)                               |
| `golden/`          | golden cases (`cases.cjs`) and their snapshots                   |
| `release-gate.cjs` | release gate: OpenAPI specs + golden suite, fail-on-diff         |
| `spec-diff.cjs`    | compares the two backends' OpenAPI specs as data                 |
| `boot-node.cjs`    | boots haxcms-nodejs with its own e2e runtime                     |
| `php-router.php`   | `php -S` router matching haxcms-php's web server rules           |
| `php-server.cjs`   | fresh haxcms-php install under `php -S` (also used by old-sites) |
| `fuzz.cjs`         | generated-input run (`--fuzz`): engine, legs, report             |
| `openapi-arb.cjs`  | fast-check arbitraries from an OpenAPI spec                      |
| `config.cjs`       | flags, environment variables and defaults                        |
