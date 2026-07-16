---
name: hax-webcomponent-dev
description: >
  Develop HAX-capable web components using LitElement, DDD design system, and HAXSchema.
  Use when scaffolding new components, adding HAX editor support, auditing accessibility,
  or applying DDD tokens to elements in the webcomponents monorepo.
version: 1.1.0
license: Apache-2.0
metadata:
  author: haxtheweb
  tags: [hax, webcomponents, lit, ddd, haxschema, accessibility]
  source: create
---

# HAX Web Component Development

Develop HAX-capable web components using LitElement, DDD design system, and HAXSchema.

## When to Use

- Scaffolding a new component in the webcomponents monorepo
- Adding or updating `haxProperties` / `demoSchema`
- Auditing a component for DDD compliance or accessibility
- Refactoring legacy SimpleColors usage to DDD tokens
- Fixing build issues with HAXCMSLitElement themes
- Reviewing component JavaScript for Polymer parser compatibility

## How It Works

1. **Scaffold**: Always use `hax webcomponent my-element --y` instead of manual creation. Do not create directories or files manually in the monorepo. (PRAW Rule `E9Zioqke3Y0gdnWB08XQn8` — all new elements must use the `hax webcomponent` CLI command.)
2. **Import DDD**: Use `import '@haxtheweb/d-d-d/d-d-d.js'` and extend `DDD` directly (never `DDD(LitElement)`). With mixins, DDD must be the base class: `class MyEl extends SomeMixin(DDD) {}`. (PRAW Rule `iECnaDh0aVeeCYp0oydSht`)
3. **Implement HAXSchema**: Add `haxProperties()` with `demoSchema` for editor examples. Use demoSchema and HAX helper methods to create valid demos with appropriate tag names, properties, and slotted content. (PRAW Rule `rVsCTSDjae8lRmsJmPO3Mk`)
4. **Style with DDD**: Use `ddd-` prefixed CSS custom properties for spacing, colors, typography, and icon sizes. Only use SimpleColors where explicitly needed as fallback. (PRAW Rules `MLhl56jNSqHvnRiAW5A2GR`, `K0lV6BJOPrqP7iJMZkemUw`)
5. **Audit**: Check DDD token usage, ARIA attributes, keyboard navigation, semantic HTML, and dark mode compliance. (PRAW Rules `MT6HPJ9BDhA13jwSXjcmeA`, `7CPveFErpSF0aZ8tKqxw0Y`, `9iCZsjJ8USi5kuZph4T9Lk`)
6. **Build**: Run `yarn run build` after changes to HAXCMSLitElement themes. Do not manually edit `custom-elements.json` — it is auto-generated. (PRAW Rule `cfypZRDQLaJ6XsXtEaveWT`)

## JavaScript Standards

- Use `globalThis` instead of `window` for global references (PRAW Rule `CEHsAztyfB2vTCwtHGGnbk`)
- Do not use optional chaining (`?.`) — the Polymer parser has issues with this syntax (PRAW Rules `hKN16ZhzB6OXTED2CkB3yP`, `nJF4SYUGdN5Wr5tEvaDtGY`)
- Use single quotes, avoid semicolons where possible, prefer functional patterns
- Use Prettier for consistent formatting
- No TypeScript — pure JavaScript with LitElement
- When using third-party libraries, import the pre-compiled JavaScript distribution

## Component Audits

When working on any component, perform these checks:

1. **DDD Design System**: Verify proper usage of design tokens
2. **Accessibility**: Check ARIA attributes, keyboard navigation, semantic markup
3. **HAX Schema**: Ensure complete and accurate haxProperties implementation
4. **Performance**: Review bundle size, lazy loading opportunities
5. **Browser Compatibility**: Test across supported browser versions

## References

- HAX CLI: `hax webcomponent --help`
- DDD element: `webcomponents/elements/d-d-d`
- PRAW RULES.md: `~/Documents/git/haxtheweb/praw/RULES.md` (canonical ecosystem rules referenced by Rule ID)
- DDD design system: see the `hax-design-system` skill
