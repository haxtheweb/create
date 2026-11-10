# Old-site compatibility check

A site made with HAX from 2021 on must keep working when it moves to the
latest code ([haxtheweb/issues#3262](https://github.com/haxtheweb/issues/issues/3262)).
This folder holds one small fixture site per year, each made by the HAX code
as it stood on **January 1** of that year, and a weekly job that upgrades
every fixture to the latest code and runs the operations an author does.
Sites barely drift within a year, so one per year stands for all of them.
No real user site is used; the page content is written for these fixtures.

## Fixtures

| Year | Made by                                | Commit on January 1                                                                                  | Theme               |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------- |
| 2021 | haxcms-php 1.4.0                       | [`f763753`](https://github.com/haxtheweb/haxcms-php/commit/f763753e06fb6c67eee150dee1a8731483122fe7) | learn-two-theme     |
| 2022 | haxcms-php 3.0.0                       | [`21c898c`](https://github.com/haxtheweb/haxcms-php/commit/21c898c51564d4a28eedbba9eba681fa3486eb81) | bootstrap-theme     |
| 2023 | haxcms-php 6.0.0                       | [`d7de9b1`](https://github.com/haxtheweb/haxcms-php/commit/d7de9b1b248bb4d63bf63c912fb67774d6cd90bb) | clean-two           |
| 2024 | haxcms-php 8.0.0                       | [`c6d6363`](https://github.com/haxtheweb/haxcms-php/commit/c6d6363ec6a7e0376cd4614d0e8ee623ee45f352) | polaris-theme       |
| 2025 | HAX CLI 10.0.1 (haxcms-nodejs 10.0.1)  | [`3a86992`](https://github.com/haxtheweb/create/commit/3a86992a6fce15f5a4022128d206d2ec6f4a163b)     | clean-one (default) |
| 2026 | HAX CLI 11.0.7 (haxcms-nodejs 11.0.15) | [`bbf7e00`](https://github.com/haxtheweb/create/commit/bbf7e00c949ebc80514127a2969f7c6b6cc4c73c)     | journey-theme       |

haxcms-nodejs and the CLI only exist as their own repos from mid-2024, so
2021 to 2024 come from haxcms-php, the backend every site of those years was
made with. 2025 and 2026 come from the CLI, the documented way to make a site
by then, run from that commit with its own lockfile (which pins the
haxcms-nodejs release it shipped with).

Each fixture is `<year>/site` (the site folder as that code wrote it) and
`<year>/fixture.json` (repo, commit, version and what was left out). Every
fixture has the welcome page the backend made plus four pages: two top-level
pages, a child page one level deep, and a page that the check moves. Their
bodies use blocks common that year (video-player, a11y-collapse, self-check,
grid-plate, DDD data attributes, ...).

Left out of each site folder, and listed in `fixture.json`: the site's own
`.git`, and the symlinks a haxcms-php install put into each site (`build`,
`dist`, `wc-registry.json`, `assets/babel-*.js`) that point into the old
install and lead nowhere once the folder leaves it. `created` / `updated` in
`site.json` are pinned to January 1 of the year. `fixture.json` also lists
the custom elements the pages use that were in that year's `wc-registry.json`.

### How a fixture is made

`generate/generate.cjs --year <year>` clones the repo from `years.json`
(blobless, one branch, read-only) into a temp directory, checks out the
recorded commit and:

- **haxcms-php**: installs that tree the way its installer did (`_config`
  from `system/boilerplate/systemsetup`, empty `_sites`) and runs
  [`generate/drive.php`](generate/drive.php), which calls that version's own
  `Operations` methods, the ones its API called: `createSite`, then
  `createNode` and `saveNode` per page. From 2022 on the editor sent a
  `<page-break>` describing the page ahead of the body, so the driver does too.
- **CLI**: `npm ci` and builds that commit, then runs its own `hax site`,
  `site node:add`, `site node:edit --node-op parent` and `site site:theme`.

Run under PHP 8.3 and Node.js 22 or newer. One shim, recorded in
`years.json` and `fixture.json`: the 2024 haxcms-php bundles a sitemap
library that calls `SplFixedArray::key()`, removed in PHP 8 (that commit
required PHP 7), so the generator patches that call in its throwaway copy.

One block is left out by decision: `<task-list>` was dropped when the
elements moved from `@lrnwebcomponents` to `@haxtheweb`
([haxtheweb/issues#1422](https://github.com/haxtheweb/issues/issues/1422)),
so the 2022 fixture's pages (and its entry in `years.json`) no longer use
it. The 2022 site's own `package.json` still lists
`@lrnwebcomponents/task-list`, as that install wrote it.

Things these fixtures keep because the code of that year did them: nested
slugs (`unit-1/lesson-1`, 2021 to 2023), a stray file named `false`, every
page at `order` 0 and the child page at `indent` 0 from the 2025 and 2026 CLI,
and the 2025 CLI ignoring `--theme` (it only set a theme interactively).

### Adding next year's fixture

On or after January 1, add the year to `years.json` (copy the previous entry;
leave `commit` empty and the generator uses the last commit before January 1,
America/New_York, then record the commit it printed), then:

```bash
node test/old-sites/generate/generate.cjs --year 2027
git add -f test/old-sites/2027   # a site's own .gitignore can hide files, e.g. custom/build
```

Commit the result after the check passes on it. The weekly run warns in its
summary when the current year has no fixture.

## The check

[`run.cjs`](run.cjs) boots haxcms-nodejs with that repo's own e2e harness
(`test/e2e/helpers/harness.cjs`: temp directory, real auth, ephemeral
localhost port) and runs two legs per fixture, each on its own copy, with a
fresh git repo in the copy as old sites had:

| Leg      | Steps                                                                                                                                                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli`    | `site:rebuild` (the CLI's upgrade path: managed files, feeds, sitemap, search index, llms.txt, agent skills), `site:validate`, `node:add`, `node:edit` content of the deep page, `site:theme`, `site:validate`                                                          |
| `nodejs` | render home, a deep page and every page file; the legacy bootstrap upgrade haxcms-nodejs does when it loads a site; open the editor (site token, page content); save page content; saveOutline add, move, reorder, delete; theme change; language setting; render again |

After every write the site on disk is checked: `site.json` parses, ids are
unique, parents exist, every page file exists, and every fixture page still
holds its content unless the step meant to change it.

```bash
# haxcms-nodejs main beside create, built; the CLI linked to it
(cd haxcms-nodejs && yarn install --frozen-lockfile && yarn run build)
(cd create && npm ci && npm run build \
  && rm -rf node_modules/@haxtheweb/haxcms-nodejs \
  && ln -s ../../../haxcms-nodejs node_modules/@haxtheweb/haxcms-nodejs)

node create/test/old-sites/run.cjs --nodejs haxcms-nodejs --years 2021,2026
```

| Flag       | Environment variable   | Default                            |
| ---------- | ---------------------- | ---------------------------------- |
| `--nodejs` | `HAX_OLD_SITES_NODEJS` | `../haxcms-nodejs` (beside create) |
| `--cli`    | `HAX_OLD_SITES_CLI`    | `dist/create.js` of this repo      |
| `--years`  | `HAX_OLD_SITES_YEARS`  | every fixture                      |
| `--out`    | `HAX_OLD_SITES_OUT`    | `./old-sites-results`              |

It writes `summary.md` (also the GitHub job summary) and `results.json`, and
exits 1 when any step fails. The weekly workflow is
[`.github/workflows/old-sites-weekly.yml`](../../.github/workflows/old-sites-weekly.yml)
(Sunday night, America/New_York); it can also be run by hand with a list of
years.

Not covered yet: the same operations against haxcms-php `master`, and a real
browser rendering the upgraded sites.
