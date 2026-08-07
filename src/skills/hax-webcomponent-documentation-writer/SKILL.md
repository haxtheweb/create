---
name: hax-webcomponent-documentation-writer
description: >
  Generate and maintain accurate README/reference documentation for HAX web
  components in the webcomponents monorepo by extracting facts from
  custom-elements.json and haxProperties. Use whenever the user asks to write,
  fix, regenerate, or update the README for a HAX element, document an element's
  properties/slots/events/methods, fix broken or boilerplate element READMEs,
  produce a reference table from a custom-elements.json, or validate that an
  element's README still matches its manifest. Triggers on element tag names
  (e.g. `<a11y-collapse>`, `<d-d-d>`, `<editable-table>`), `custom-elements.json`,
  `haxProperties` / `demoSchema`, `webcomponents/elements/`, or `@haxtheweb/`
  package context — even when the user does not say "documentation" or "skill".
  Composes with the global documentation-writer skill for Diátaxis craft; this
  skill supplies the HAX domain facts and writes the README file only.
version: 1.0.0
license: Apache-2.0
metadata:
  author: haxtheweb
  tags: [hax, webcomponents, documentation, readme, custom-elements-json, haxProperties, diataxis]
  source: create
---

# HAX Web Component Documentation Writer

Generate and maintain per-element documentation for the `webcomponents` monorepo.
This is a pure file-write skill: it produces README.md files in element
directories. It does not touch HAXcms, the `docs` site, or any backend.

## When to use

- "Write the README for `<my-element>`"
- "Fix the boilerplate README for editable-table" (the scaffolded one with
  HTML-escaped tag names, one-word descriptions, and an empty `[ License]`)
- "Generate reference docs from this custom-elements.json"
- "Document this element's properties / slots / events / methods"
- "Check this README still matches its manifest" / "validate the element docs"

## How it works (integration with documentation-writer)

The global `documentation-writer` skill owns the Diátaxis craft — the four
quadrants (Tutorial / How-to / Reference / Explanation), tone, structure, and
the clarify → outline → approve → generate workflow. This skill is the HAX
domain layer around it. Do NOT restate the four quadrants or tone rules here;
defer all prose-craft to `documentation-writer`.

Six integration points (see `references/cem-and-haxproperties.md` for the data
details that back them):

1. **Context pre-supply** — before delegating to `documentation-writer`, infer
   Document Type, Target Audience, User's Goal, and Scope from the detected
   element so the user is not re-asked.
2. **Fact injection** — run the bundled extractor (below) and hand
   `documentation-writer` structured facts (properties, attributes, slots,
   events, methods, CSS parts/custom properties, gizmo, settings, demoSchema).
   `documentation-writer` must not invent API surface absent from the facts.
3. **Craft delegation** — for all Diátaxis classification, structure, and prose,
   defer to `documentation-writer`. This skill supplies facts + README assembly.
4. **Publishing handoff** — write the result to the element's `README.md`. This
   is a plain file write; no HAXcms publishing, no `hax` CLI, no site ops.
5. **Trigger arbitration** — this skill leads when HAX-element signals are
   present (tag names, `custom-elements.json`, `haxProperties`, `@haxtheweb/`);
   `documentation-writer` leads for generic doc requests with no HAX surface.
6. **Validation back-pressure** — after generation, re-run the extractor in
   `--validate` mode against the new README to confirm every documented
   property/attribute/slot/event/method exists in the manifest and none are
   missing. Correct drift before finishing.

## Workflow

1. **Detect the element(s).** Run the extractor on the element directory:
   ```bash
   python3 <skill>/scripts/extract_element_facts.py <element_dir>
   ```
   It returns one facts JSON with every element declared in the package
   (multi-element packages like `d-d-d` ship several; document the primary and
   list the rest).
2. **Resolve intent.** Infer the candidate Diátaxis quadrant from the request
   ("document this element" → Reference; "write a tutorial" → Tutorial) and the
   audience (developer / site author / educator). Confirm with the user.
3. **Delegate craft.** Hand `documentation-writer` the pre-supplied context and
   the extracted facts. Await outline approval, then generation.
4. **Validate.** Run:
   ```bash
   python3 <skill>/scripts/extract_element_facts.py <element_dir> --validate <readme>
   ```
   The report lists `drift` (documented but not in the manifest) and `missing`
   (in the manifest but not documented) per category, per element, plus a
   tag-name sanity check. Fix everything before moving on.
5. **Assemble and write.** Compose the sections into `README.md` in the element
   directory. Repair the boilerplate defects: unescape the tag name, replace
   the one-word placeholder description, fill the license from `LICENSE.md`.
6. **Report.** List the changed file, the validation result, and any manifest
   gaps (e.g. "CEM declares no slots for this element — documented as none").

## Diátaxis → README section mapping

A single element's four quadrants collapse into sections of one `README.md`:

- **Reference** — API table from `custom-elements.json` + `haxProperties`.
  Mechanical, script-verifiable. Ship this first.
- **How-to** — import snippet (npm + CDN) and "use in the HAX editor" from
  `gizmo` + `settings`.
- **Tutorial** — `demo/index.html` as the runnable example; `npm start` to run.
- **Explanation** — what the element is for, DDD usage, ecosystem placement.

For multi-element packages, write one package-level README with a section per
element (matches the existing one-README-per-directory layout).

## What the extractor handles

`scripts/extract_element_facts.py` resolves the API surface from two
machine-readable sources, in order, and falls back gracefully:

- **`custom-elements.json` (CEM)** — properties, attributes, slots, events,
  methods, CSS parts/custom properties. Filters out static getters (`tag`,
  `styles`, `properties`, `haxProperties`) and private/underscore members so
  only public API reaches the docs. Sparse manifests (no slots/events) yield
  empty lists, not errors.
- **`haxProperties`** — four real-world patterns: external `<tag>.haxProperties.json`
  (dominant), URL-reference getter, inline object-literal getter (best-effort
  JS→JSON normalization), and dynamic/imported (reported as not extractable).
- **JS-source fallback** — when CEM is empty (e.g. `a11y-collapse` has 0
  modules), the tag is discovered from `static get tag()` /
  `customElements.define()` and properties from `static get properties()` with
  JSDoc descriptions and kebab-case attributes.
- **`package.json` + `LICENSE.md`** — name, description, license label.

See `references/cem-and-haxproperties.md` for the CEM schema, the four
haxProperties patterns, sparse/multi-element handling, and the validation
report shape.

## Boundaries with sibling skills

- `hax-webcomponent-dev` owns *building* elements (haxProperties/demoSchema
  implementation, DDD, a11y, build). "Make this HAX-capable" / "add a property"
  / "fix the build" → that skill. "Document this element" → this skill.
- `hax-ecosystem-onboarding` is itself a Tutorial artifact; this skill may
  generate element-level tutorials but must not restate environment setup.
- `hax-site-building` / `hax-claudehax` are NOT invoked (no HAXcms publishing
  in v1; the docs-site publishing path is deferred).
- Read-only audit skills (`hax-a11y-audit`, `content-chunking-audit`,
  `oerschema-audit`) may be applied post-generation as an opt-in quality gate.

## Guardrails

- Never edit `build/`, `node_modules/`, or `custom-elements.json` by hand — it
  is auto-generated. If the manifest itself is wrong, flag it as a
  `hax-webcomponent-dev` task (run `yarn run build` in the element dir), not a
  documentation fix.
- Never run the ubiquity script or any top-of-monorepo build.
- Use `globalThis` (not `window`) in generated code samples.
- Use DDD tokens (not inline styles) in generated example snippets.
- This skill only writes `README.md` in the element directory. Nothing else.

## References

- `references/cem-and-haxproperties.md` — CEM schema notes, the four
  haxProperties resolution patterns, sparse/multi-element handling, JS-source
  fallback, and the I-6 validation report.
