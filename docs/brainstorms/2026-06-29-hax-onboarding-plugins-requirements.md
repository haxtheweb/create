# HAX onboarding plugins (Claude + Codex) — v1 requirements

- **Date:** 2026-06-29
- **Status:** Ready for planning
- **Owner:** HAXTheWeb core team
- **Type:** Standard (product onboarding surface across two AI coding tools)

## Summary

Ship a thin onboarding layer around the HAX CLI (`@haxtheweb/create`, the `hax`
command) for two AI coding tools — Claude Code and OpenAI Codex — that takes a
brand-new user from in-context discovery, through setup that mostly vanishes, to a
**live HAXsite open in the browser** within their first session. Each tool gets the
surface idiomatic to its own extension model rather than a forced mirror.

## Problem

New HAX users bounce at three points in the first 15 minutes, in order of impact:

1. **Discovery** — they don't know the CLI exists.
2. **Install / setup** — getting `hax` onto their machine and runnable.
3. **First value** — not knowing the one command that produces something they can
   see and feel proud of.

These plugins attack stages 1–3 *inside the AI tools developers already use*, where
an assistant can carry the user across each gap automatically.

## Who it's for

Brand-new HAX users — and their AI agents — working inside Claude Code or Codex.
The HAX core audience skews toward educators and content authors as well as
component developers, which is why the v1 "first value" moment is a **site you can
see**, not a component dev loop.

## Goals

- A new user reaches a live site (`hax serve` in the browser) on their first run
  with minimal manual steps.
- Setup is automatic (Claude) or one instruction the agent runs unprompted (Codex);
  the user should rarely hand-type the install.
- Both tools ship a credible, *idiomatic* surface — not a lowest-common-denominator
  mirror.
- The assistant has accurate, onboarding-scoped knowledge of the CLI so it
  recommends the right next command.

## Non-goals (v1)

- **Shared MCP server** for true cross-tool parity — deferred to v2.
- **Full command mirroring on Codex** (porting all five Claude workflows to Codex
  prompts).
- **Power-user breadth as guided commands** — node/content ops, imports/migration,
  skeletons, theming, publishing. These remain *reference knowledge* the assistant
  can use, not part of the golden path.
- **Cold-start / top-of-funnel marketing** (blog posts, awesome-lists, marketplace
  directories). v1 improves *in-context* discovery only; awareness for someone who
  has never heard of HAX is out of scope for these artifacts.
- **Auto-update / version pinning** beyond surfacing `hax update`.

## The golden path (the v1 "hello world")

One guided quickstart, identical in intent on both tools:

1. Ensure `hax` is installed (auto on Claude; agent-run on Codex).
2. `hax site <name> --y` — scaffold a HAXsite with sensible defaults.
3. `hax serve` — started in the background (it is long-running).
4. Surface the local URL and tell the user what they're looking at and how to edit
   a page.

Success of this path = the user sees their site in a browser and knows the one next
edit to make.

## Scope by platform

### Claude Code — full plugin (largely built this session)

Lives in this repo as a marketplace + plugin:

- `.claude-plugin/marketplace.json` — in-tool discovery (`/plugin marketplace add
  haxtheweb/create`).
- `plugins/hax/.claude-plugin/plugin.json` — manifest.
- `plugins/hax/hooks/` — SessionStart hook that auto-installs `@haxtheweb/create`
  if `hax` is missing (opt-out via `HAX_PLUGIN_NO_AUTOINSTALL=1`). This *is* the
  "setup vanishes" mechanism.
- `plugins/hax/skills/hax/SKILL.md` — onboarding-scoped CLI knowledge.
- `plugins/hax/commands/` — slash commands for the top workflows.

**v1 delta to apply during build:** tighten emphasis toward the golden path — make
the quickstart (`hax site` → `hax serve` → live URL) the obvious first move, with a
dedicated quickstart entry point, rather than presenting all commands as equals.

### Codex — native + minimal

Codex has no plugin/marketplace/hook system; it extends via `AGENTS.md` (read
natively), user-level custom prompts (its slash commands), MCP servers, and config
profiles. v1 therefore:

- **Strengthen `AGENTS.md`** with a concise, prominent "Quickstart for new users"
  section: ensure `hax` is installed (`npm install --global @haxtheweb/create`),
  then `hax site` → `hax serve` → open the URL. This doubles as the
  instruction-driven install (no SessionStart hook exists in Codex).
- **Add one Codex custom prompt** (e.g. `hax-quickstart`) that walks the golden
  path, plus documented setup for where it lives.

## Funnel → deliverable mapping

| Funnel stage | Claude | Codex |
|---|---|---|
| Discovery (in-context) | Marketplace listing + plugin README | `AGENTS.md` + repo/README pointers |
| Setup | SessionStart auto-install hook | `AGENTS.md` "ensure installed" instruction |
| First value | Quickstart-emphasized commands + skill | `hax-quickstart` prompt + AGENTS.md section |

## Success criteria

- A first-time user in either tool reaches a served site in the browser without
  hand-typing the install command.
- On Claude, the plugin installs and the quickstart is discoverable with no manual
  CLI knowledge.
- On Codex, the agent installs `hax` and runs the golden path from the AGENTS.md
  guidance without the user naming the command.
- Both manifests/structures validate (Claude: `claude plugin validate`; Codex:
  AGENTS.md guidance is accurate and current).

## Dependencies & assumptions

- **Node.js ≥ 18.20.3 and npm** on PATH (so the CLI can install). Stated as a
  prereq on both tools.
- **Codex mechanics are assumptions to verify in planning:** custom prompt location
  (believed `~/.codex/prompts/`), absence of session hooks, and native AGENTS.md
  reading. Confirm against current Codex before finalizing the Codex surface.
- **Codex prompt distribution is user-level**, so v1 "distribution" for Codex is a
  documented setup/copy step, not an installable package. v1 accepts this limitation.
- `hax serve` is long-running — the quickstart must background it and report the URL,
  not block the session.
- This work currently lives on worktree branch `worktree-claude-hax-plugin`,
  uncommitted; it needs to land on `main` to be installable.

## Open questions

- Exact Codex custom-prompt distribution story — copy/paste, a `hax` CLI helper that
  writes the prompt, or just rely on AGENTS.md? (Lean: AGENTS.md + documented prompt
  for v1.)
- Should the Claude quickstart be a new dedicated command (e.g. `/hax:start`) or a
  reframing of the existing `/hax:site` + `/hax:serve`? (Lean: a thin
  quickstart entry that chains the two.)
- Default site name / theme for the golden path to remove one more decision from the
  newcomer.

## Handoff / next steps

- Run `/ce-plan` against this doc to define the build: the Claude v1 delta
  (quickstart emphasis), the Codex AGENTS.md section + custom prompt, and the
  verify-Codex-mechanics task.
- Land the existing Claude plugin (`plugins/hax/` + `.claude-plugin/marketplace.json`)
  from the worktree branch onto `main`.
