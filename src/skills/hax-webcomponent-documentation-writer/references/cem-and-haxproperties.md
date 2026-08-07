# CEM & haxProperties Reference

Data-source details for `scripts/extract_element_facts.py`. Read this when the
extractor's behavior or output shape needs clarification, or when an element's
facts look incomplete.

## custom-elements.json (CEM)

CEM is the Custom Elements Manifest format. Top-level shape:

```text path=null start=null
{ schemaVersion, readme, modules: [ { kind, path, declarations, exports } ] }
```

- Element declarations live at `modules[].declarations[]` and are identified by
  a non-empty `tagName` field. Declarations without `tagName` (helpers, mixins)
  are skipped — this naturally yields one record per custom element, including
  multi-element packages (e.g. `d-d-d` declares 4 elements across `lib/`).
- Per declaration, the extractor reads: `name` (class), `description`,
  `superclass.name`, `mixins[].name`, `members`, `attributes`, `slots`,
  `events`, `cssParts`, `cssProperties`.

### Member → property/method mapping

- `kind: "method"` → method (name, params, return type, description).
- `kind` in `field` / `property` / `accessor` → property (name, type,
  attribute, description, default, readonly, static).

### Doc-relevance filter

These members are dropped because they are internal machinery, not consumer
API:

- `static: true` fields — `tag`, `styles`, `properties`, `haxProperties` are
  static getters the CEM records as readonly static fields.
- `privacy` in `private` / `protected`.
- Names starting with `_` (the HAX underscore convention: `_observer`,
  `__disposer`, `_handleCellClick`).

### Sparse manifests

CEM richness varies. `d-d-d` declares 0 slots, 0 events, 0 cssParts, 0
cssProperties, and members carry only `kind` + `name`. The extractor yields
empty lists for absent categories — it never fabricates. When a category is
empty, document it as "none declared" rather than guessing.

### Empty CEM (JS-source fallback)

Some elements ship a `custom-elements.json` with `modules: []` (e.g.
`a11y-collapse`). The extractor then discovers the element from JS source:

- Tag: `static get tag() { return "<tag>"; }`, else
  `customElements.define("<tag>", ...)`.
- Properties: `static get properties() { return { ... } }` (LitElement reactive
  property map). `...super.properties` spreads are stripped before parsing.
  `type: Boolean` / `String` / `Number` / `Array` / `Object` bare identifiers
  are preserved as type-name strings. `attribute` is derived: the explicit
  `attribute` value if present, else the kebab-cased property name when
  `reflect: true`, else none.
- Description: the `/** ... */` JSDoc block immediately preceding each property
  key (non-`@` lines joined).

Slots, events, cssParts, and methods are NOT recovered from JS in v1 — they are
reported as empty with an extraction note. Methods/slots/events are rarer in
the reactive-property model and usually documented via JSDoc `@event` tags,
which v1 does not parse.

## haxProperties resolution (4 patterns)

`haxProperties` is per-tag by convention. The extractor resolves it in this
order:

1. **External JSON** — `<tag>.haxProperties.json` anywhere under the element
   directory (convention: `lib/`), skipping `build/`/`node_modules/`/`dist/`.
   This is the dominant pattern (174 files across the monorepo) and the most
   reliable. Parsed as plain JSON.
2. **URL-reference getter** —
   `static get haxProperties() { return new URL('./lib/${this.tag}.haxProperties.json', import.meta.url).href }`.
   The path template is resolved on disk; if the file exists it is parsed as
   external JSON (same as #1).
3. **Inline object-literal getter** —
   `static get haxProperties() { return { ... }; }`. The object-literal span is
   brace-matched (respecting strings, comments, template literals) and
   normalized JS→JSON: single quotes → double quotes, template literals →
   double-quoted strings (`${...}` dropped), unquoted keys → quoted, trailing
   commas removed, `undefined` → `null`, capitalized bare identifiers
   (`Boolean`, `String`) → JSON strings, and `new X().member` / call /
   member-access expressions → `null`. Best-effort; if normalization fails the
   element is reported as `none` with a note.
4. **Dynamic / imported** — any other getter shape (imports, computed values).
   Reported as `source: "dynamic"`, `present: false`. Not machine-readable; the
   README should note haxProperties exist but are not statically extractable.

### Normalized hax fields

Regardless of source, each element's `hax` record has the same shape:

```text path=null start=null
{ source, source_path, present,
  gizmo: { title, description, icon, color, tags, meta },
  settings: { configure, advanced, quick, groups },
  demoSchema, saveOptions, canScale, canEditSource, type }
```

`settings.configure` / `advanced` / `quick` entries each carry `property` (or
`slot`), `title`, `description`, `inputMethod`, and optional `editMode` /
`slotWrapper`. These map directly to "how to use this element in the HAX editor"
How-to content. `demoSchema` entries carry `tag`, `properties`, `content` — the
runnable example spec for the HAX editor demo.

## Validation (I-6) report

`--validate <readme>` re-extracts facts and compares them to the generated
README's markdown tables under the headings: Properties, Attributes, Slots,
Events, Methods, CSS Parts, CSS Custom Properties. First-column table names
(backtick-stripped) are compared to the extracted names.

**Single-element packages** use `## Properties`, `## Attributes`, `## Methods`
at top level. **Multi-element packages** must use one `## \<tag\>` section per
element, each containing `### Properties`, `### Attributes`, `### Methods`
subsections; the validator scopes each element's check to its own `## \<tag\>`
region so one element's API does not cross-contaminate another's. Every table
header row (a `|` row immediately followed by a separator row) is skipped, so
multiple tables under one heading (e.g. configurable + read-only) are handled.

For each element:

- `drift` — names documented under a heading but absent from the manifest
  (invented API, or stale after a rename/removal).
- `missing` — names in the manifest but absent from the README (undocumented
  public API).
- `tag` drift — the README does not mention `<tag>` or `` `tag` `` unescaped
  (catches the `&lt;tag&gt;` boilerplate defect).

`all_ok` is true only when every element has no drift and no missing entries.
The report is printed as JSON; a non-zero count of drift/missing is the signal
to regenerate or manually reconcile.

## Facts JSON shape (top level)

```text path=null start=null
{ element_dir, package: { present, name, description, license, dependencies, peerDependencies },
  license_name, demo: { path, exists },
  elements: [ { tag, class_name, module, description, superclass, mixins,
                properties, attributes, methods, slots, events, css_parts,
                css_properties, cem_source, hax } ],
  primary_tag, extraction_notes }
```

`primary_tag` is the element whose tag matches the directory name, else the
first declared element. `extraction_notes` is a list of human-readable warnings
(empty CEM, unresolvable URL reference, dynamic getter, parse failures) —
surface these in the final report to the user.
