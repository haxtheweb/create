# AGENTS.md

> **Agents start here**
>
> - Inside a HAX site, read `llms.txt` and `.well-known/agent-skills/index.json` first, then run `hax site` for an orientation of the site and its scriptable commands.
> - Always pass `--y --no-i` when scripting. With no TTY (sandboxes, CI) the CLI implies `--no-i` automatically.
> - Use the global `hax` command, never `npx hax` (a different npm package).

This file provides comprehensive instructions for AI coding agents working within the HAX ecosystem. HAX (Headless Authoring eXperience) is a comprehensive web development ecosystem that enables rapid creation of accessible, performant web components and static sites. Follow these guidelines to set up, develop, test, and contribute effectively to HAX projects.

## Ecosystem context (maintained in PRAW)

Shared HAX ecosystem guidance (repo map, pillars, rules, scoped rules, skills) lives in one place,
https://github.com/haxtheweb/praw, and is read from there instead of being copied into each repo:

- Always-on rules and ecosystem index: <https://github.com/haxtheweb/praw/blob/main/WARP.md>
- Rule registry, by Rule ID: <https://github.com/haxtheweb/praw/blob/main/RULES.md>
- Scoped rules: [webcomponents](https://github.com/haxtheweb/praw/blob/main/webcomponents/WARP.md), [HAXcms backends](https://github.com/haxtheweb/praw/blob/main/haxcms/WARP.md), [DDD design system](https://github.com/haxtheweb/praw/blob/main/design-system/WARP.md)
- What HAX is, pillars, and the repo map: <https://github.com/haxtheweb/praw/blob/main/what-is-hax.md>
- Workflow skills: <https://github.com/haxtheweb/praw/tree/main/skills>; interface skills: <https://github.com/haxtheweb/create/tree/main/src/skills>
- Machine-readable index: <https://raw.githubusercontent.com/haxtheweb/praw/main/llms.txt>
- Work queue: <https://github.com/haxtheweb/issues> (`gh issue list --repo haxtheweb/issues`)
- CLI options: `hax help`, `hax <command> --help`, or `man hax`

## Quickstart for new users

Get from zero to a running HAX site in three steps:

```bash
# 1. Ensure the HAX CLI is installed
npm install --global @haxtheweb/create

# 2. Scaffold a new HAXsite (no prompts, scriptable)
hax site my-hax-site --y --no-i

# 3. Serve it locally
cd my-hax-site && hax serve
# open http://localhost in your browser
```

> **Codex users**: AGENTS.md is read natively by Codex, so the steps above are your onboarding path — no extra plugin required.
>
> **Claude Code users**: you can also install the HAX onboarding plugin for golden-path slash commands:
>
> ```
> /plugin marketplace add haxtheweb/praw
> /plugin install hax-onboarding@haxtheweb
> ```

## Development Environment Setup

### Issue Management

Before starting any work, check the unified issue queue:

- All HAX ecosystem issues are tracked at `haxtheweb/issues`
- Use GitHub CLI to check issues: `gh issue list`
- Reference existing issues when making contributions

## Setup Commands

- **Install HAX CLI globally**:
  ```bash
  npm install @haxtheweb/create --global
  ```
- **Install project dependencies** (run from the project root):
  ```bash
  npm install
  ```
- **Start interactive CLI** (for web components or HAXsites):
  ```bash
  hax start
  ```
  - Launches an interactive CLI with ASCII art (via Clack).
- **Start development server** (for HAXsites):
  ```bash
  hax serve
  ```
  - Launches the site in development mode at `http://localhost`.
- **Create a new web component**:
  ```bash
  hax webcomponent my-element --y
  ```
  - Creates a LitElement-based web component with DDD design system and i18n support.
  - In a monorepo, places the component in the correct location and inherits settings.
- **Create a new HAXsite**:
  ```bash
  hax site mysite --y --no-i
  ```
  - Generates a HAXcms-based static site with templated files.
- **Update HAX CLI**:
  ```bash
  hax update
  ```
- **Install bundled agent skills**:
  ```bash
  hax skills install --all
  ```
  - Installs interface skills (`hax-site-building`, `hax-claudehax`, `hax-webcomponent-dev`, `hax-ecosystem-onboarding`) into `~/.agents/skills/`.
  - These skills are version-locked to the CLI and ship in `dist/skills/`.
  - List available skills with `hax skills list`.
  - Workflow/knowledge skills live in the PRAW repository (<https://github.com/haxtheweb/praw/tree/main/skills>).
- **Alternative usage** (one-time execution without global install):
  ```bash
  npx @haxtheweb/create
  ```
  or
  ```bash
  npm init @haxtheweb
  ```
- **Windows-specific setup**:
  - If issues occur, set a custom npm cache path:
    ```bash
    npm config set cache C:\tmp\nodejs\npm-cache --global
    ```
  - For PowerShell, check execution policy to allow scripts:
    ```bash
    Get-ExecutionPolicy
    ```
    Adjust if needed using `Set-ExecutionPolicy` (see [Microsoft documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/set-executionpolicy?view=powershell-7.4)).

## Code Style & Standards

### JavaScript-Only Architecture

- **Language**: Pure JavaScript with LitElement for web components
- **NO TypeScript**: HAX strictly avoids TypeScript to eliminate compilation requirements
- **Unbundled Approach**: Components ship as native JS/HTML/CSS for maximum compatibility
- **Third-party Libraries**: When using libraries written in TypeScript, always import the pre-compiled JavaScript distribution
- **External Dependencies**: Leverage libraries like `vaadin-upload`, `shoelace-carousel`, etc. but always use their JS builds

### JavaScript Standards

- **Global References**: Use `globalThis` instead of `window` for consistency across environments
- **Formatting**:
  - Use single quotes (`'`)
  - Avoid semicolons where possible
  - Prefer functional programming patterns
  - Use Prettier for consistent formatting
- **ES Modules**: Use standard ES6 import/export syntax
- **Modern JavaScript**: Leverage ES2018+ features while maintaining browser compatibility

### Naming Conventions

- **Web Components**: Use hyphenated names (e.g., `my-element`)
- **Package Names**: Match component/site name in `package.json`
- **CSS Classes**: Follow BEM methodology when not using DDD tokens

### Internationalization (i18n)

- Use provided i18n wiring for web components (automatically included with `hax webcomponent`)
- Support multiple languages from the start

## Build System & Testing

### Build Process Understanding

The HAX ecosystem uses a sophisticated build pipeline optimized for unbundled JavaScript delivery:

1. **Gulp**: Handles asset compilation and processing
2. **Prettier**: Ensures consistent code formatting
3. **CEM (Custom Elements Manifest)**: Generates `custom-elements.json` for component metadata
4. **Lerna**: Manages monorepo dependencies and publishing
5. **No TypeScript Compilation**: Pure JavaScript workflow eliminates build complexity

### Build Commands

- **Standard build** (from component root):

  ```bash
  yarn run build
  ```

  - Compiles assets, formats code, generates custom-elements.json
  - **CRITICAL**: Always run this after changes to HAXCMSLitElement themes
  - Do NOT manually edit `custom-elements.json` - it's auto-generated

- **Development build with watching**:

  ```bash
  yarn run dev
  ```

- **Monorepo build** (from webcomponents root):
  ```bash
  yarn run build
  ```
  - Builds all components in the monorepo

### Testing Instructions

- **Run tests** (from project or component root):

  ```bash
  npm test
  ```

- **Monorepo testing**:
  ```bash
  npm run test --filter <component_name>
  ```
  - Tests specific component in monorepo
  - Use Lerna for more complex filtering

### DDD Compliance Auditing

- **Audit web components for DDD compliance**:
  ```bash
  hax audit
  ```
  - Checks CSS and structure against DDD design system standards
  - Ignores files listed in `.dddignore`
  - Run from component root for accurate results
- **Audit HAX schema documents** (site.json, skeletons, haxProperties + demoSchema + locales, appstore.json, Merlin commands):
  ```bash
  hax audit schema            # add --strict to fail on warnings, --format json for a report
  hax audit i18n              # English hardcoded in Lit templates instead of this.t
  hax audit all               # DDD + schema + i18n
  hax audit ssr               # report-only: how each wc-registry element server-renders (never fails, not in all; --no-shim to skip the inert DOM environment)
  ```
  - **Required** before submitting theme components

### Code Quality

- **Linting**:

  ```bash
  npm run lint
  ```

  - Ensures code style compliance before committing
  - Uses ESLint, Prettier, and Stylelint

- **Fix issues automatically**:
  ```bash
  npm run lint:fix
  ```

### Example `.dddignore` Template

```plaintext
/node_modules
/dist
/build
/public
/test
/.github
/.vscode
/.idea
/locales
LICENSE
.dddignore
.editorconfig
.gitignore
.npmignore
*.md
*.yml
*.json
*.png
*.svg
```

## Pull Request Instructions

- **PR Title Format**: `[<project_name>] <Descriptive Title>`
  - Example: `[my-element] Add dynamic property binding`
- **Pre-commit checks**:
  - Run `npm run precheck` before every push or PR. It runs the same Prettier and ESLint checks CI runs, on the files you changed. Fix everything it reports and re-run until it passes (`npm run precheck:fix` auto-fixes formatting and fixable lint). A Claude Code hook in `.claude/` blocks `git push` and `gh pr create` until it passes.
  - Run `npm test` to ensure all tests pass.
  - Run `npm run lint` to verify code style.
  - Run `hax audit` for web components to confirm DDD compliance, `hax audit schema` when you change haxProperties, site.json, skeletons or appstore files, and `hax audit i18n` when you add or change UI text.
- **Commit Guidelines**:
  - Use clear, descriptive commit messages (e.g., "Add i18n support to my-element").
  - Include relevant changes to tests or documentation.
- **HAXsite PRs**:
  - Test locally with `hax serve` to verify page rendering.
  - Ensure new pages or content updates align with `site.json` and JSON Outline Schema.

## Security Considerations

- **Security Audits**: For recurring security audits of this repo, start with `SECURITY-AUDIT.md` — it defines the read order, scope, commands, regression guards, and reporting convention
- **Dependencies**: Keep dependencies updated before running `npm install`
- **Sensitive Data**: Avoid committing API keys or sensitive data to `package.json`, `site.json`, or public files
- **Site Imports**: Validate source URLs when using `--import-site` to prevent malicious content
- **File Permissions**: Ensure scripts have correct execution permissions (`chmod +x script.sh`)
- **Component Security**: Sanitize user inputs in custom components
- **Schema Validation**: Validate against JSON schemas before processing content
- **Library Security**: Only import from trusted, well-maintained JavaScript distributions

## Troubleshooting Common Issues

### Build Failures

- **Missing custom-elements.json**: Run `yarn run build` from component root
- **DDD Audit Failures**: Check `.dddignore` and fix CSS token usage
- **Lerna Issues**: Run `lerna clean && lerna bootstrap`

### Development Environment

- **CLI Not Found**: Ensure `@haxtheweb/create` is globally installed
- **Permission Errors**: Check file permissions and ownership

### Component Issues

- **Theme Not Loading**: Verify HAXCMSLitElement inheritance and build process
- **DDD Tokens Missing**: Import DDD properly and use CSS custom properties
- **HAX Integration**: Ensure `haxProperties` are defined correctly
- **Library Import Errors**: Verify you're importing JavaScript distributions, not TypeScript sources

### Performance Issues

- **Slow Loading**: Check for unnecessary dependencies or large imports
- **Bundle Size**: HAX's unbundled approach should keep individual files small
- **Memory Usage**: Monitor component lifecycle and cleanup

---

_This AGENTS.md file is maintained across all HAX ecosystem repositories to ensure consistent development experience regardless of entry point._

## Community & Support

- **HAX Community**: Run `hax party` for involvement opportunities
- **Discord**: https://discord.gg/aCGxmRHEJP
- **Issue Reporting**: Use `haxtheweb/issues` or GitHub interface
- **Merlin Integration**: Use "Issue" command in HAX spaces for automated reporting
- **Documentation**: Run `man hax` (Linux/macOS) for comprehensive CLI docs
- **Educational Resources**: Complete documentation at https://haxtheweb.org/
