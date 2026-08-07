#!/usr/bin/env python3
"""
extract_element_facts.py
========================
Core extraction logic for the hax-webcomponent-documentation-writer skill.

Turns the machine-readable sources of truth for a HAX web component into a
single structured "facts" JSON that documentation templates are populated from.

Sources (read-only; never written by this script):
  - custom-elements.json   (CEM: properties, attributes, slots, events, methods, CSS parts/custom properties)
  - *.haxProperties.json   (external HAX editor schema: gizmo, settings, demoSchema, saveOptions)
  - <tag>.js / lib/*.js    (in-class `static get haxProperties()` when no external file exists)
  - package.json           (name, description, license, deps)
  - LICENSE.md             (license short name for the README License section)

haxProperties resolution order (per element tag):
  1. External JSON file: <tag>.haxProperties.json in the element dir, lib/, or any subdir.
  2. URL-reference getter: `static get haxProperties() { return new URL('./lib/${this.tag}.haxProperties.json', import.meta.url).href }`
     -> resolves to the same external file (caught by step 1 in practice).
  3. Inline object-literal getter: `static get haxProperties() { return { ... }; }`
     -> best-effort JS-object -> JSON normalization.
  4. Dynamic / imported getter (anything else) -> reported as not machine-readable.

Usage:
  python extract_element_facts.py <element_dir>                     # emit facts JSON to stdout
  python extract_element_facts.py <element_dir> --validate <readme>  # I-6 validation report

Exit codes:
  0  extraction/validation completed (check report for warnings)
  1  usage error / unreadable inputs
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# CEM (custom-elements.json) extraction
# ---------------------------------------------------------------------------

def _first_text(value):
    """Return a trimmed string from a CEM description (string or {text: ...})."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return (value.get("text") or "").strip()
    return str(value).strip()


def _member_to_property(member):
    """Map a CEM declaration member of kind 'field' to a property record."""
    attr = member.get("attribute") or ""
    if isinstance(attr, dict):
        attr = attr.get("name") or ""
    prop_type = member.get("type")
    if isinstance(prop_type, dict):
        prop_type = prop_type.get("text") or prop_type.get("name") or ""
    return {
        "name": member.get("name", ""),
        "type": prop_type or "",
        "attribute": attr,
        "description": _first_text(member.get("description")),
        "default": member.get("default"),
        "readonly": bool(member.get("readonly")),
        "static": bool(member.get("static")),
    }


def _member_to_method(member):
    """Map a CEM declaration member of kind 'method' to a method record."""
    params = []
    for p in member.get("parameters") or member.get("params") or []:
        pname = p.get("name", "") if isinstance(p, dict) else str(p)
        ptype = ""
        if isinstance(p, dict):
            t = p.get("type")
            if isinstance(t, dict):
                ptype = t.get("text") or t.get("name") or ""
            elif isinstance(t, str):
                ptype = t
        params.append({"name": pname, "type": ptype})
    ret = member.get("return")
    ret_type = ""
    if isinstance(ret, dict):
        ret_type = ret.get("type", {}).get("text") if isinstance(ret.get("type"), dict) else (ret.get("type") or "")
    return {
        "name": member.get("name", ""),
        "description": _first_text(member.get("description")),
        "params": params,
        "returns": ret_type,
        "static": bool(member.get("static")),
    }


def _attr_record(attr):
    """Map a CEM attribute record."""
    atype = attr.get("type")
    if isinstance(atype, dict):
        atype = atype.get("text") or atype.get("name") or ""
    return {
        "name": attr.get("name", ""),
        "type": atype or "",
        "description": _first_text(attr.get("description")),
    }


def _slot_record(slot):
    return {
        "name": slot.get("name", ""),
        "description": _first_text(slot.get("description")),
    }


def _event_record(event):
    etype = event.get("type")
    if isinstance(etype, dict):
        etype = etype.get("text") or etype.get("name") or ""
    return {
        "name": event.get("name", ""),
        "type": etype or "",
        "description": _first_text(event.get("description")),
    }


def _css_part_record(part):
    return {
        "name": part.get("name", ""),
        "description": _first_text(part.get("description")),
    }


def _css_property_record(prop):
    return {
        "name": prop.get("name", ""),
        "syntax": prop.get("syntax", ""),
        "default": prop.get("default", ""),
        "description": _first_text(prop.get("description")),
    }


def extract_elements_from_cem(cem_path):
    """
    Parse a custom-elements.json and return a list of element records.
    Only declarations that carry a `tagName` are treated as elements; this
    naturally handles multi-element packages (e.g. d-d-d ships 4 elements).
    Sparse manifests (no slots/events/cssParts) yield empty lists, not errors.
    """
    with open(cem_path, "r", encoding="utf-8") as fh:
        cem = json.load(fh)

    elements = []
    for module in cem.get("modules", []):
        module_path = module.get("path", "")
        for decl in module.get("declarations", []):
            tag = decl.get("tagName")
            if not tag:
                continue
            properties = []
            methods = []
            for member in decl.get("members", []) or []:
                kind = member.get("kind", "")
                name = member.get("name", "")
                # Doc-relevance filter: drop private/protected members and the
                # HAX underscore-prefixed convention (`_observer`, `__disposer`,
                # `_handleCellClick`, ...) — they are implementation details,
                # not public API a consumer reads documentation to find.
                if name.startswith("_") or member.get("privacy") in ("private", "protected"):
                    continue
                if kind == "method":
                    if member.get("static"):
                        continue
                    methods.append(_member_to_method(member))
                elif kind in ("field", "property", "accessor"):
                    # Skip static fields: `tag`, `styles`, `properties`,
                    # `haxProperties` are static getters the CEM records as
                    # readonly static fields. They are internal machinery, not
                    # reactive instance properties a consumer would set.
                    if member.get("static"):
                        continue
                    properties.append(_member_to_property(member))
            elements.append({
                "tag": tag,
                "class_name": decl.get("name", ""),
                "module": module_path,
                "description": _first_text(decl.get("description")),
                "superclass": (decl.get("superclass") or {}).get("name", ""),
                "mixins": [m.get("name", "") for m in decl.get("mixins", []) or []],
                "properties": properties,
                "attributes": [_attr_record(a) for a in decl.get("attributes", []) or []],
                "methods": methods,
                "slots": [_slot_record(s) for s in decl.get("slots", []) or []],
                "events": [_event_record(e) for e in decl.get("events", []) or []],
                "css_parts": [_css_part_record(p) for p in decl.get("cssParts", []) or []],
                "css_properties": [_css_property_record(p) for p in decl.get("cssProperties", []) or []],
                "cem_source": str(cem_path),
            })
    return elements


# ---------------------------------------------------------------------------
# haxProperties extraction
# ---------------------------------------------------------------------------

def find_external_hax_file(element_dir, tag):
    """
    Locate <tag>.haxProperties.json anywhere under the element directory.
    Convention places it in lib/ (e.g. a11y-collapse/lib/a11y-collapse.haxProperties.json).
    Returns a Path or None.
    """
    target = f"{tag}.haxProperties.json"
    for root, _dirs, files in os.walk(element_dir):
        # Skip build/node_modules defensively (these are read-only sources anyway).
        parts = Path(root).relative_to(element_dir).parts
        if any(p in ("build", "node_modules", "dist") for p in parts):
            continue
        if target in files:
            return Path(root) / target
    return None


def parse_hax_external(path):
    """Parse an external haxProperties.json file into normalized fields."""
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return normalize_hax_data(data, source="external-json", source_path=str(path))


def normalize_hax_data(data, source, source_path):
    """Project a raw haxProperties object (however obtained) into the facts shape."""
    gizmo = data.get("gizmo") or {}
    settings = data.get("settings") or {}
    return {
        "source": source,
        "source_path": source_path,
        "present": True,
        "gizmo": {
            "title": gizmo.get("title", ""),
            "description": gizmo.get("description", ""),
            "icon": gizmo.get("icon", ""),
            "color": gizmo.get("color", ""),
            "tags": gizmo.get("tags", []) or [],
            "meta": gizmo.get("meta", {}) or {},
        },
        "settings": {
            "configure": settings.get("configure", []) or [],
            "advanced": settings.get("advanced", []) or [],
            "quick": settings.get("quick", []) or [],
            "groups": settings.get("groups", []) or [],
        },
        "demoSchema": data.get("demoSchema", []) or [],
        "saveOptions": data.get("saveOptions", {}) or {},
        "canScale": data.get("canScale", True),
        "canEditSource": data.get("canEditSource", False),
        "type": data.get("type", ""),
    }


# --- inline object-literal extraction (best-effort JS -> JSON) -------------

def _find_getter_return_span(text, getter_idx):
    """
    Given the index of `static get haxProperties`, locate the `return` keyword
    inside the getter body and, if it returns an object literal, return
    (start_index_of_open_brace, end_index_of_close_brace). Otherwise None.
    """
    # Find the opening brace of the getter method body.
    body_open = text.find("{", getter_idx)
    if body_open == -1:
        return None
    # Find `return` after the body opens.
    return_idx = text.find("return", body_open)
    if return_idx == -1:
        return None
    # Find the first `{` after `return` (the object literal). Skip whitespace.
    i = return_idx + len("return")
    while i < len(text) and text[i] in " \t\r\n":
        i += 1
    if i >= len(text) or text[i] != "{":
        # Returns something other than an inline object literal (URL/import/dynamic).
        return None
    open_brace = i
    # Brace-match from open_brace, respecting strings, comments, and templates.
    depth = 0
    j = open_brace
    n = len(text)
    while j < n:
        ch = text[j]
        nxt = text[j + 1] if j + 1 < n else ""
        if ch in ("'", '"', "`"):
            quote = ch
            j += 1
            while j < n:
                c = text[j]
                if c == "\\":
                    j += 2
                    continue
                if c == quote:
                    break
                # Template literals can nest ${...}; brace matcher does not need
                # to track this for our purposes because we only scan for the
                # matching closing brace at depth 0, and ${ ... } inside a
                # template is balanced internally by the JS author.
                j += 1
            j += 1
            continue
        if ch == "/" and nxt == "/":
            j = text.find("\n", j)
            if j == -1:
                j = n
            continue
        if ch == "/" and nxt == "*":
            end = text.find("*/", j + 2)
            j = end + 2 if end != -1 else n
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return (open_brace, j)
        j += 1
    return None


def _skip_value_expr_tail(text, k, n):
    """Consume an unresolvable JS value expression starting at index k.

    Handles `new Constructor().member`, `fn(args)`, `obj.prop`, `arr[i]`, and
    nested object/array literals inside call arguments. Scans forward over
    balanced (), [], {} (respecting strings and comments) and stops at the
    comma or closing brace/bracket that ends the value at depth 0.
    Returns the index just past the consumed expression.
    """
    pos = k
    depth = 0
    while pos < n:
        c = text[pos]
        nxt = text[pos + 1] if pos + 1 < n else ""
        if c in "'\"`":
            q = c
            pos += 1
            while pos < n:
                cc = text[pos]
                if cc == "\\":
                    pos += 2
                    continue
                if cc == q:
                    break
                pos += 1
            pos += 1
            continue
        if c == "/" and nxt == "/":
            nl = text.find("\n", pos)
            pos = nl if nl != -1 else n
            continue
        if c == "/" and nxt == "*":
            end = text.find("*/", pos + 2)
            pos = end + 2 if end != -1 else n
            continue
        if c in "([{":
            depth += 1
            pos += 1
            continue
        if c in ")]}":
            if depth == 0:
                break
            depth -= 1
            pos += 1
            continue
        if c == "," and depth == 0:
            break
        pos += 1
    return pos


def _js_object_to_json(text):
    """
    Best-effort conversion of a JS object literal into JSON-parseable text.

    Handles the constructs that appear in HAX haxProperties object literals:
    - // line comments and /* block comments */
    - single-quoted strings -> double-quoted
    - template literals (backticks) -> double-quoted strings (${...} dropped)
    - unquoted keys -> quoted keys
    - trailing commas -> removed
    - bare `undefined` -> null; `true`/`false`/`null` preserved
    - bare identifier values (rare) -> null

    Returns a Python object parsed from the normalized JSON, or raises ValueError.
    """
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        # Comments
        if ch == "/" and nxt == "/":
            nl = text.find("\n", i)
            i = nl if nl != -1 else n
            continue
        if ch == "/" and nxt == "*":
            end = text.find("*/", i + 2)
            i = end + 2 if end != -1 else n
            continue
        # Single-quoted string -> double-quoted
        if ch == "'":
            out.append('"')
            i += 1
            while i < n:
                c = text[i]
                if c == "\\":
                    # Keep escape sequences as-is (JSON supports the common ones).
                    out.append(c)
                    if i + 1 < n:
                        out.append(text[i + 1])
                    i += 2
                    continue
                if c == "'":
                    break
                if c == '"':
                    out.append('\\"')
                else:
                    out.append(c)
                i += 1
            out.append('"')
            i += 1
            continue
        # Template literal -> double-quoted string, ${...} dropped
        if ch == "`":
            out.append('"')
            i += 1
            while i < n:
                c = text[i]
                if c == "\\":
                    out.append(c)
                    if i + 1 < n:
                        out.append(text[i + 1])
                    i += 2
                    continue
                if c == "`":
                    break
                if c == "$" and i + 1 < n and text[i + 1] == "{":
                    # Drop the interpolation expression entirely (best effort).
                    depth = 1
                    j = i + 2
                    while j < n and depth > 0:
                        if text[j] == "{":
                            depth += 1
                        elif text[j] == "}":
                            depth -= 1
                        j += 1
                    i = j
                    continue
                if c == '"':
                    out.append('\\"')
                elif c == "\n":
                    out.append("\\n")
                else:
                    out.append(c)
                i += 1
            out.append('"')
            i += 1
            continue
        # Double-quoted string -> pass through
        if ch == '"':
            out.append(ch)
            i += 1
            while i < n:
                c = text[i]
                out.append(c)
                if c == "\\" and i + 1 < n:
                    out.append(text[i + 1])
                    i += 2
                    continue
                if c == '"':
                    i += 1
                    break
                i += 1
            continue
        # Bare identifier
        if ch.isalpha() or ch in "_$":
            j = i
            while j < n and (text[j].isalnum() or text[j] in "_$"):
                j += 1
            word = text[i:j]
            # Peek ahead past whitespace for the next significant char.
            k = j
            while k < n and text[k] in " \t\r\n":
                k += 1
            nxt_ch = text[k] if k < n else ""
            if nxt_ch == ":":
                # Object key.
                out.append(json.dumps(word))
                i = j
                continue
            # Value position.
            if word == "new" or nxt_ch in ("(", ".", "["):
                # A `new` expression, call, or member-access chain we cannot
                # resolve statically (e.g. `new GridPlateLayoutOptions().options`,
                # `Math.random()`, `SomeClass.MEMBER`). Consume the whole
                # expression so it leaves no broken tokens, and emit null.
                i = _skip_value_expr_tail(text, k, n)
                out.append("null")
                continue
            if word in ("true", "false", "null"):
                out.append(word)
            elif word == "undefined":
                out.append("null")
            elif word and word[0].isupper():
                # Capitalized bare identifier used as a standalone value -> a
                # type/constructor reference (String, Boolean, ...). Emit as a
                # JSON string so the type name survives (Lit `type: Boolean`).
                out.append(json.dumps(word))
            else:
                out.append("null")
            i = j
            continue
        # Default passthrough
        out.append(ch)
        i += 1

    normalized = "".join(out)
    # Remove trailing commas before } or ] (JSON forbids them).
    normalized = re.sub(r",(\s*[}\]])", r"\1", normalized)
    return json.loads(normalized)


def extract_inline_hax(js_path):
    """
    Attempt to extract an inline object literal returned by
    `static get haxProperties() { return { ... }; }` in a JS file.
    Returns normalized hax fields, or None if the getter does not return an
    inline literal.
    """
    try:
        text = js_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    m = re.search(r"static\s+get\s+haxProperties\s*\(\s*\)", text)
    if not m:
        return None
    span = _find_getter_return_span(text, m.start())
    if not span:
        return None
    open_brace, close_brace = span
    literal = text[open_brace:close_brace + 1]
    try:
        data = _js_object_to_json(literal)
    except (ValueError, json.JSONDecodeError):
        return None
    return normalize_hax_data(data, source="inline-literal", source_path=str(js_path))


def detect_hax_getter_kind(js_path):
    """
    Classify the haxProperties getter for the 'dynamic' fallback report.
    Returns one of: 'inline-literal', 'url-reference', 'dynamic', 'none'.
    """
    try:
        text = js_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return "none"
    m = re.search(r"static\s+get\s+haxProperties\s*\(\s*\)", text)
    if not m:
        return "none"
    body_open = text.find("{", m.start())
    if body_open == -1:
        return "none"
    # Look ahead a reasonable window for the return shape.
    window = text[body_open:body_open + 400]
    if "new URL" in window and "haxProperties.json" in window:
        return "url-reference"
    # Inline literal: `return {` within the getter body.
    ridx = window.find("return")
    if ridx != -1:
        k = ridx + len("return")
        while k < len(window) and window[k] in " \t\r\n":
            k += 1
        if k < len(window) and window[k] == "{":
            return "inline-literal"
    return "dynamic"


def resolve_url_reference_path(js_path, tag):
    """
    For a `new URL('./lib/${this.tag}.haxProperties.json', import.meta.url)`
    getter, resolve the on-disk JSON path. Returns a Path or None.
    """
    try:
        text = js_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    m = re.search(r"static\s+get\s+haxProperties\s*\(\s*\)", text)
    if not m:
        return None
    body_open = text.find("{", m.start())
    window = text[body_open:body_open + 400]
    # Capture the path template, e.g. `./lib/${this.tag}.haxProperties.json`.
    # Triple-quoted raw string so the `"` and backtick can sit in one character class.
    pm = re.search(r"""['\"`]([^'\"`]*?)\$\{this\.tag\}([^'\"`]*?)\.haxProperties\.json['\"`]""", window)
    if not pm:
        return None
    prefix, suffix = pm.group(1), pm.group(2)
    rel = f"{prefix}{tag}{suffix}.haxProperties.json"
    candidate = (js_path.parent / rel).resolve()
    return candidate if candidate.exists() else None


def extract_hax_for_element(element_dir, tag, cem_module):
    """
    Resolve haxProperties for a single element tag.
    `cem_module` is the module path (e.g. 'a11y-collapse.js' or 'lib/ddd-steps-list-item.js')
    used to locate the JS source for inline/url getter extraction.
    """
    notes = []
    # 1. External JSON file (dominant: 174 files across the monorepo).
    ext = find_external_hax_file(element_dir, tag)
    if ext:
        try:
            return parse_hax_external(ext), notes
        except (ValueError, json.JSONDecodeError) as exc:
            notes.append(f"hax: external file {ext} failed to parse: {exc}")

    # 2/3/4. Inspect the JS module for a getter.
    js_path = element_dir / cem_module
    if not js_path.exists():
        # Some modules live one level up; try a couple of fallbacks.
        for cand in (element_dir / f"{tag}.js", element_dir / "lib" / cem_module):
            if cand.exists():
                js_path = cand
                break

    if js_path.exists():
        kind = detect_hax_getter_kind(js_path)
        if kind == "url-reference":
            resolved = resolve_url_reference_path(js_path, tag)
            if resolved and resolved.exists():
                try:
                    return parse_hax_external(resolved), notes
                except (ValueError, json.JSONDecodeError) as exc:
                    notes.append(f"hax: url-referenced file {resolved} failed to parse: {exc}")
            else:
                notes.append(f"hax: url-reference getter in {js_path} did not resolve to an existing file")
        if kind == "inline-literal":
            inline = extract_inline_hax(js_path)
            if inline is not None:
                return inline, notes
            notes.append(f"hax: inline-literal getter in {js_path} could not be normalized to JSON")
        if kind == "dynamic":
            notes.append(f"hax: getter in {js_path} is dynamic/imported (not statically extractable)")
            return _hax_absent("dynamic", str(js_path)), notes
    else:
        notes.append(f"hax: no JS module found for tag {tag} (looked for {cem_module})")

    return _hax_absent("none", None), notes


def _hax_absent(source, source_path):
    return {
        "source": source,
        "source_path": source_path,
        "present": False,
        "gizmo": {"title": "", "description": "", "icon": "", "color": "", "tags": [], "meta": {}},
        "settings": {"configure": [], "advanced": [], "quick": [], "groups": []},
        "demoSchema": [],
        "saveOptions": {},
        "canScale": True,
        "canEditSource": False,
        "type": "",
    }


# ---------------------------------------------------------------------------
# JS-source fallback: tag + properties discovery when CEM is empty or thin
# ---------------------------------------------------------------------------
#
# Some elements ship an empty or sparse custom-elements.json (e.g. a11y-collapse
# has 0 modules). The authoritative API then lives in the JS source:
#   - `static get tag() { return "<tag>"; }`        -> the custom element tag
#   - `static get properties() { return { ... } }`   -> LitElement property map
#   - JSDoc /** ... */ above each property             -> the description
# These functions recover that data so documentation is still accurate when
# the CEM cannot be trusted.

_JS_IGNORE_DIRS = {"build", "node_modules", "dist", "demo", "test", "tests", "locales", ".git"}


def _strip_spreads(literal_text):
    """Remove `...super.properties` / `...Foo.bar` spread elements so the
    remaining object literal is JSON-parseable."""
    return re.sub(r"\.\.\.[A-Za-z_$][\w$.]*\s*,?", "", literal_text)


def _kebab(name):
    """Convert a camelCase property name to its kebab-case attribute form."""
    return re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower()


def _extract_jsdoc_before(text, key_pos):
    """Best-effort: find the /** ... */ block immediately preceding key_pos."""
    end = text.rfind("*/", 0, key_pos)
    if end == -1:
        return ""
    start = text.rfind("/**", 0, end)
    if start == -1:
        return ""
    block = text[start + 3:end]
    lines = []
    for ln in block.splitlines():
        ln = ln.strip().lstrip("*").strip()
        if not ln or ln.startswith("@"):
            continue
        lines.append(ln)
    return " ".join(lines).strip()


def extract_tag_from_js(js_path):
    """Discover a custom element tag from a JS module.
    Tries `static get tag()` then `customElements.define("lit", ...)`.
    Returns the tag string or None.
    """
    try:
        text = js_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    m = re.search(r"static\s+get\s+tag\s*\(\s*\)", text)
    if m:
        body = text[m.end():m.end() + 120]
        rm = re.search(r"return\s+['\"]([A-Za-z][\w-]*)['\"]", body)
        if rm:
            return rm.group(1)
    dm = re.search(r"customElements\.define\s*\(\s*['\"]([A-Za-z][\w-]*)['\"]", text)
    if dm:
        return dm.group(1)
    return None


def extract_class_name_from_js(js_path):
    """Best-effort class name from `customElements.define(X, X)` or `class X`."""
    try:
        text = js_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""
    dm = re.search(r"customElements\.define\s*\(\s*(?:[\w.]+\.tag\s*,\s*)?([A-Za-z_$][\w$]*)\s*\)", text)
    if dm:
        return dm.group(1)
    cm = re.search(r"class\s+([A-Za-z_$][\w$]*)\s+extends", text)
    if cm:
        return cm.group(1)
    return ""


def extract_properties_from_js(js_path):
    """Parse a LitElement `static get properties()` getter into property records.
    Returns a list of {name, type, attribute, description, source: 'js'}.
    """
    try:
        text = js_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []
    m = re.search(r"static\s+get\s+properties\s*\(\s*\)", text)
    if not m:
        return []
    span = _find_getter_return_span(text, m.start())
    if not span:
        return []
    open_brace, close_brace = span
    literal = text[open_brace:close_brace + 1]
    literal_clean = _strip_spreads(literal)
    try:
        data = _js_object_to_json(literal_clean)
    except (ValueError, json.JSONDecodeError):
        return []
    if not isinstance(data, dict):
        return []
    props = []
    for key, spec in data.items():
        if not isinstance(spec, dict):
            spec = {}
        ptype = spec.get("type") or ""
        if not isinstance(ptype, str):
            ptype = str(ptype) if ptype else ""
        attr = spec.get("attribute")
        reflect = bool(spec.get("reflect"))
        if attr is None:
            # Lit's default: reflected as attribute named like the property.
            attr_name = _kebab(key) if reflect else ""
        elif attr is False or attr is None:
            attr_name = ""
        else:
            attr_name = str(attr)
        km = re.search(r"\b" + re.escape(key) + r"\s*:", literal)
        desc = ""
        if km:
            desc = _extract_jsdoc_before(text, open_brace + km.start())
        props.append({
            "name": key,
            "type": ptype,
            "attribute": attr_name,
            "description": desc,
            "default": None,
            "readonly": False,
            "static": False,
            "source": "js",
        })
    return props


def discover_elements_from_js(element_dir):
    """When CEM yields no elements, discover tags from JS source + hax files.
    Returns a list of element stub records (API fields empty; populated by the
    caller via extract_properties_from_js).
    """
    stubs = []
    seen = set()
    for root, dirs, files in os.walk(element_dir):
        dirs[:] = [d for d in dirs if d not in _JS_IGNORE_DIRS]
        for fname in files:
            if not fname.endswith(".js"):
                continue
            p = Path(root) / fname
            tag = extract_tag_from_js(p)
            if tag and tag not in seen:
                seen.add(tag)
                stubs.append({
                    "tag": tag,
                    "class_name": extract_class_name_from_js(p),
                    "module": str(p.relative_to(element_dir)),
                    "description": "",
                    "superclass": "",
                    "mixins": [],
                    "properties": [],
                    "attributes": [],
                    "methods": [],
                    "slots": [],
                    "events": [],
                    "css_parts": [],
                    "css_properties": [],
                    "cem_source": "",
                })
    # Hax filename hints cover cases where the define lives in an aggregator.
    for root, dirs, files in os.walk(element_dir):
        dirs[:] = [d for d in dirs if d not in _JS_IGNORE_DIRS]
        for fname in files:
            if fname.endswith(".haxProperties.json"):
                tag = fname[: -len(".haxProperties.json")]
                if tag and tag not in seen:
                    seen.add(tag)
                    stubs.append({
                        "tag": tag, "class_name": "", "module": "",
                        "description": "", "superclass": "", "mixins": [],
                        "properties": [], "attributes": [], "methods": [],
                        "slots": [], "events": [], "css_parts": [], "css_properties": [],
                        "cem_source": "",
                    })
    return stubs


# ---------------------------------------------------------------------------
# package.json + LICENSE extraction
# ---------------------------------------------------------------------------

def extract_package(element_dir):
    pkg_path = element_dir / "package.json"
    if not pkg_path.exists():
        return {"name": "", "description": "", "license": "", "dependencies": {}, "present": False}
    with open(pkg_path, "r", encoding="utf-8") as fh:
        pkg = json.load(fh)
    return {
        "present": True,
        "name": pkg.get("name", ""),
        "description": pkg.get("description", ""),
        "license": pkg.get("license", ""),
        "dependencies": list((pkg.get("dependencies") or {}).keys()),
        "peerDependencies": list((pkg.get("peerDependencies") or {}).keys()),
    }


def extract_license_name(element_dir):
    """Read the first meaningful line of LICENSE.md for a short license label."""
    lic = element_dir / "LICENSE.md"
    if not lic.exists():
        return ""
    try:
        for line in lic.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if s and not s.startswith("Copyright") and not s.startswith("#"):
                return s
    except (OSError, UnicodeDecodeError):
        return ""
    return ""


# ---------------------------------------------------------------------------
# Top-level facts assembly
# ---------------------------------------------------------------------------

def build_facts(element_dir):
    element_dir = Path(element_dir).resolve()
    if not element_dir.is_dir():
        raise FileNotFoundError(f"element directory not found: {element_dir}")

    cem_path = element_dir / "custom-elements.json"
    notes = []
    elements = []
    cem_present = cem_path.exists()
    if cem_present:
        try:
            elements = extract_elements_from_cem(cem_path)
        except (ValueError, json.JSONDecodeError) as exc:
            notes.append(f"custom-elements.json failed to parse: {exc}")
    else:
        notes.append("custom-elements.json not found in element directory")

    # Fallback: when CEM is empty/missing, discover elements from JS source.
    if not elements:
        js_stubs = discover_elements_from_js(element_dir)
        if js_stubs:
            notes.append(
                "CEM empty/missing; element(s) discovered from JS source "
                "(static get tag/properties) — slots/events/cssParts may be absent"
            )
            elements = js_stubs

    # Attach hax facts per element (haxProperties is per-tag by convention),
    # and augment thin elements with JS-derived properties + attributes.
    for el in elements:
        if not el.get("properties"):
            js_module = element_dir / el["module"] if el.get("module") else None
            if js_module and js_module.exists():
                js_props = extract_properties_from_js(js_module)
                if js_props:
                    el["properties"] = js_props
                    existing_attrs = {a["name"] for a in el.get("attributes", [])}
                    for jp in js_props:
                        aname = jp.get("attribute")
                        if aname and aname not in existing_attrs:
                            el["attributes"].append({
                                "name": aname,
                                "type": jp.get("type", ""),
                                "description": jp.get("description", ""),
                            })
                            existing_attrs.add(aname)
        hax, hax_notes = extract_hax_for_element(element_dir, el["tag"], el["module"])
        el["hax"] = hax
        notes.extend(hax_notes)

    package = extract_package(element_dir)
    license_name = extract_license_name(element_dir)

    demo_path = element_dir / "demo" / "index.html"
    demo = {"path": "demo/index.html", "exists": demo_path.exists()}

    # Primary element: the one whose tag matches the package directory name,
    # else the first declared element.
    dir_name = element_dir.name
    primary = next((e for e in elements if e["tag"] == dir_name), (elements[0] if elements else None))

    facts = {
        "element_dir": str(element_dir),
        "package": package,
        "license_name": license_name,
        "demo": demo,
        "elements": elements,
        "primary_tag": primary["tag"] if primary else dir_name,
        "extraction_notes": notes,
    }
    return facts


# ---------------------------------------------------------------------------
# I-6 validation: generated README <-> extracted facts
# ---------------------------------------------------------------------------

_SECTION_HEADINGS = {
    "properties": "Properties",
    "attributes": "Attributes",
    "slots": "Slots",
    "events": "Events",
    "methods": "Methods",
    "css_parts": "CSS Parts",
    "css_properties": "CSS Custom Properties",
}


def _is_separator_row(line):
    """True if a markdown table row is a separator (| --- | --- |)."""
    return bool(re.match(r"^\|[\s:|-]+\|$", line))


def _readme_section_names(region_text, heading, level=3):
    """
    Extract first-column names from markdown table(s) under a heading within
    a region of the README. `level` is the heading level to match (e.g. 3 for
    `### Properties`). Returns a set of names (backticks/whitespace stripped).

    Every table header row is skipped: a header row is a `|` row immediately
    followed by a separator row. This handles multiple tables under one heading
    (e.g. a configurable table and a read-only table) without false-flagging
    the header labels ("Property", "Attribute", ...) as drift.
    """
    pattern = re.compile(
        r"^#{1," + str(level) + r"}\s+" + re.escape(heading) + r"\s*\n(.*?)(?=^#{1," + str(level) + r"}\s|\Z)",
        re.IGNORECASE | re.DOTALL | re.MULTILINE,
    )
    m = pattern.search(region_text)
    if not m:
        return set()
    block = m.group(1)
    names = set()
    lines = block.splitlines()
    for i, raw in enumerate(lines):
        line = raw.strip()
        if not line.startswith("|") or _is_separator_row(line):
            continue
        # Skip a header row: a | row whose next non-blank line is a separator.
        j = i + 1
        while j < len(lines) and not lines[j].strip():
            j += 1
        if j < len(lines) and _is_separator_row(lines[j].strip()):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if not cells:
            continue
        name = cells[0].strip().strip("`").strip()
        if name and name.lower() != heading.lower():
            names.add(name)
    return names


def _find_element_region(readme_text, tag):
    """
    Find the `##`-level section documenting a given element tag. The heading
    must contain the tag (e.g. `## <video-player>`). Returns the slice of
    text from that heading to the next `##` heading (or EOF), or None.

    This scopes validation per element so multi-element package READMEs (one
    `## <tag>` section per element) validate without cross-contaminating
    one element's API with another's.
    """
    pattern = re.compile(r"^##\s+.*" + re.escape(tag) + r".*$", re.MULTILINE | re.IGNORECASE)
    m = pattern.search(readme_text)
    if not m:
        return None
    rest = readme_text[m.end():]
    nxt = re.search(r"^##\s+", rest, re.MULTILINE)
    if nxt:
        return readme_text[m.start():m.end() + nxt.start()]
    return readme_text[m.start():]


def validate_readme(readme_path, facts):
    """
    Compare documented names in a generated README against the extracted facts.

    For multi-element packages, names are scoped per element: each element's
    `## <tag>` section is located, and its `### Properties` / `### Attributes`
    / `### Methods` (etc.) tables are checked against that element's manifest
    only. Returns a report dict with drift (documented but not in the manifest)
    and missing (in the manifest but not documented) per category, per element.
    """
    readme_text = Path(readme_path).read_text(encoding="utf-8")
    report = {"readme": str(readme_path), "elements": []}

    for el in facts.get("elements", []):
        tag = el["tag"]
        region = _find_element_region(readme_text, tag)
        per = {"tag": tag, "ok": True, "drift": {}, "missing": {}}

        def check(category, fact_items, name_key, heading):
            fact_names = {it.get(name_key, "") for it in fact_items if it.get(name_key)}
            if region:
                # Multi-element package: read ### subsections within the
                # element's ## `<tag>` region.
                doc_names = _readme_section_names(region, heading, level=3)
            else:
                # Single-element README (no ## `<tag>` wrapper): scan the
                # whole document at ## level for backward compatibility.
                doc_names = _readme_section_names(readme_text, heading, level=2)
            drift = sorted(doc_names - fact_names)
            missing = sorted(fact_names - doc_names)
            if drift:
                per["drift"][category] = drift
            if missing:
                per["missing"][category] = missing
            if drift or missing:
                per["ok"] = False

        check("properties", el["properties"], "name", _SECTION_HEADINGS["properties"])
        check("attributes", el["attributes"], "name", _SECTION_HEADINGS["attributes"])
        check("slots", el["slots"], "name", _SECTION_HEADINGS["slots"])
        check("events", el["events"], "name", _SECTION_HEADINGS["events"])
        check("methods", el["methods"], "name", _SECTION_HEADINGS["methods"])
        check("css_parts", el["css_parts"], "name", _SECTION_HEADINGS["css_parts"])
        check("css_properties", el["css_properties"], "name", _SECTION_HEADINGS["css_properties"])

        # Tag-name sanity: the README must mention the tag, unescaped.
        if f"<{tag}>" not in readme_text and f"`{tag}`" not in readme_text:
            per["drift"]["tag"] = [tag]
            per["ok"] = False

        report["elements"].append(per)

    report["all_ok"] = all(e["ok"] for e in report["elements"])
    return report


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Extract HAX web component facts from custom-elements.json + haxProperties."
    )
    parser.add_argument("element_dir", help="Path to an element directory in the webcomponents monorepo.")
    parser.add_argument("--validate", metavar="README", help="Validate a generated README against extracted facts (I-6).")
    parser.add_argument("--indent", type=int, default=2, help="JSON indent level (default 2).")
    args = parser.parse_args(argv)

    try:
        facts = build_facts(args.element_dir)
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.validate:
        if not Path(args.validate).exists():
            print(f"error: README not found: {args.validate}", file=sys.stderr)
            return 1
        report = validate_readme(args.validate, facts)
        print(json.dumps(report, indent=args.indent))
        return 0 if report["all_ok"] else 0

    print(json.dumps(facts, indent=args.indent, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
