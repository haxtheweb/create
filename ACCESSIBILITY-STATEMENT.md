# Accessibility Statement — haxtheweb/create

**Last updated:** November 2026  
**Contact:** hax@psu.edu  
**Standard:** WCAG 2.1 AA (with WCAG 2.0 AA baseline), applied to a command-line tool where its principles fit

## Our Commitment

`@haxtheweb/create` is the HAX command-line tool (`hax`): it creates and runs HAX sites and web components. Accessibility is one of the HAX project pillars: **Accessible — built for everyone, by everyone.** For a CLI that means it can be used without sight of animations or colors, without answering interactive prompts, and in the person's own language.

## What is in this repository

- **The CLI itself:** its prompts, messages, help text and output formats.
- **What it creates:** new sites and components start from HAX templates, themes and elements built in [`haxtheweb/webcomponents`](https://github.com/haxtheweb/webcomponents), and their accessibility work happens there; see its [accessibility statement](https://github.com/haxtheweb/webcomponents/blob/master/ACCESSIBILITY-STATEMENT.md). `hax audit` checks a component's CSS against the DDD design system, which carries the contrast and spacing tokens.

## What we do

- **Every prompt can be skipped.** `--y` (or `--auto`) accepts the defaults and `--no-i` never prompts, so any command can be run from a script or with a screen reader without navigating interactive menus. With no terminal attached, or in CI, the CLI behaves as if `--no-i` was passed.
- **Text you can parse or keep.** `--format json` or `--format yaml` print structured output, `--to-file` writes it to a file, and `--quiet` turns off logging; notices go to stderr so structured output stays clean.
- **No required animation.** `--skip` turns off the start-up animations.
- **Color is never the only signal.** Messages say what happened in words. Terminal colors come from `picocolors`, which turns color off when `NO_COLOR` is set or the output isn't a terminal.
- **Your language.** CLI messages and help text are translated (103 locale files in `src/locales`).
- **Documentation outside the terminal:** `hax help`, `hax <command> --help` and `man hax`.

## Known Limitations

- **There are no automated accessibility tests for the CLI's interactive prompts.** The arrow-key menus come from `@clack/prompts`; how well screen readers announce them depends on the terminal and screen reader.
- **Screen reader testing has not been recorded.** Reports from NVDA, JAWS, VoiceOver and Orca users are welcome.

## How You Can Help

- **Report accessibility issues** in the unified issue queue, [haxtheweb/issues](https://github.com/haxtheweb/issues/issues), or email hax@psu.edu.
- **Test with assistive technologies** (screen readers, braille displays, high contrast terminals) and share what you find.

## Support

- **Email:** hax@psu.edu
- **GitHub:** [haxtheweb/issues](https://github.com/haxtheweb/issues)
- **Discord:** [discord.gg/aCGxmRHEJP](https://discord.gg/aCGxmRHEJP) (#accessibility channel)

---

_This statement reflects our current status and commitments. As an evolving open source project, we acknowledge there is always more work to do to ensure accessibility for all users._
