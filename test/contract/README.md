# Site folder contract check

Which files make a HAXcms site is written down once, in
[json-outline-schema](https://github.com/haxtheweb/json-outline-schema):
`schema/haxcms-site-contract.json` lists every path a site folder may hold
(required, optional or retired, and who owns it), and
`scripts/validate.js --site <dir>` checks a folder against it
([haxtheweb/issues#3351](https://github.com/haxtheweb/issues/issues/3351)).

A folder conforms at one of three levels, each including the one before:

| Level      | The folder has                                                |
| ---------- | ------------------------------------------------------------- |
| `content`  | a valid `site.json` and a file at every item's `location`     |
| `runnable` | content plus the loader (`index.html`, `build.js`, ...)       |
| `managed`  | runnable plus every file a HAXcms backend writes and rebuilds |

[`site-contract.cjs`](site-contract.cjs) points that validator at the site
folders this repo's jobs produce and writes one report (to the console, the
GitHub job summary, and `--out`).

## Where it runs

| Job                                                                              | Checks                                                                                                              | Asked for                       | Fails the job |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------- |
| [`fresh-install-smoke`](../../.github/workflows/fresh-install-smoke.yml) nightly | the site `hax site` made, after a page was added                                                                    | `managed`, `--exhaustive`       | yes           |
| [`old-sites-weekly`](../../.github/workflows/old-sites-weekly.yml)               | every yearly fixture in `test/old-sites`, as stored                                                                 | `content`                       | yes           |
| [`parity-nightly`](../../.github/workflows/parity-nightly.yml)                   | each leg's site (nodejs, php, cli) after the op sequences; each backend's contract copy against json-outline-schema | `managed`, `--exhaustive --new` | no            |

`--exhaustive` fails on a file no contract entry covers. `--new` fails on a
retired path; the smoke job leaves it off because it installs the published
haxcms-nodejs release, which can still write paths the default branch dropped.

haxcms-nodejs and haxcms-php each carry a copy of the contract and hold their
own boilerplate and managed-file list to it in their unit tests, at pull
request time. The checks here cover what those cannot: a site made through the
CLI, sites from earlier years, and a real haxcms-php install.

## Run it

```bash
git clone https://github.com/haxtheweb/json-outline-schema.git
(cd json-outline-schema && npm ci --omit=dev --ignore-scripts)

# a site that was just made by the default branches
node create/test/contract/site-contract.cjs --jos json-outline-schema \
  --level managed --exhaustive --new path/to/site

# the old-site fixtures
node create/test/contract/site-contract.cjs --jos json-outline-schema \
  create/test/old-sites/*/site

# after a parity run: every leg's site, and the backends' contract copies
node create/test/contract/site-contract.cjs --jos json-outline-schema \
  --level managed --exhaustive --new --report-only \
  --parity-out parity-results \
  --copies haxcms-nodejs=haxcms-nodejs,haxcms-php=haxcms-php
```

`--jos` defaults to a `json-outline-schema` checkout beside this repo, or
`HAX_CONTRACT_JOS_REPO`. Exit code: 0 when everything conforms (or
`--report-only`), 1 when something does not, 2 on a usage error (including a
`--jos` folder that has no contract).

`test/unit/site-contract-check.test.cjs` covers the script itself with a
stand-in validator.
