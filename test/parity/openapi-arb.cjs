// Request inputs generated from an OpenAPI spec with fast-check
// (haxtheweb/issues#3386). Nothing here talks to a server: it turns the
// spec's operations, parameters and request-body schemas into fast-check
// arbitraries, so the same generated request can be sent to every backend
// that serves the spec (fuzz.cjs does that).
//
// A generated request is plain data:
//   { operationId, method, path, pathParams, query, body }
// `path` is the spec's path template; `toUrlPath()` fills it in. A string
// "@L1" stands for the id a leg gave logical page L1 (the same convention as
// the golden cases); each leg swaps in its own id before sending.
"use strict";
const fs = require("fs");
const yaml = require("js-yaml");

const METHODS = ["get", "post", "put", "patch", "delete"];
const MAX_DEPTH = 5;

function loadSpec(file) {
  return yaml.load(fs.readFileSync(file, "utf8"));
}

// "#/components/schemas/Name" -> the object it names. Only local references
// are followed; anything else is a spec this module does not understand.
function resolveRef(spec, node) {
  let cur = node;
  const seen = new Set();
  while (cur && typeof cur === "object" && typeof cur.$ref === "string") {
    const ref = cur.$ref;
    if (!ref.startsWith("#/") || seen.has(ref))
      throw new Error("unsupported $ref " + ref);
    seen.add(ref);
    cur = spec;
    for (const part of ref.slice(2).split("/")) {
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      if (!cur || typeof cur !== "object" || !Object.hasOwn(cur, key))
        throw new Error("unresolved $ref " + ref);
      cur = cur[key];
    }
  }
  return cur;
}

// Every operation of the spec as { operationId, method, path, params, body }.
// params: [{ name, in, required, schema }] for path and query parameters;
// body: the application/json request-body schema, or null.
function listOperations(spec) {
  const out = [];
  for (const [pathTemplate, pathItem] of Object.entries(spec.paths || {})) {
    const shared = (pathItem.parameters || []).map((p) => resolveRef(spec, p));
    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== "object") continue;
      const params = shared
        .concat((op.parameters || []).map((p) => resolveRef(spec, p)))
        .filter((p) => p && (p.in === "path" || p.in === "query"))
        .map((p) => ({
          name: p.name,
          in: p.in,
          required: p.in === "path" || p.required === true,
          schema: resolveRef(spec, p.schema || { type: "string" }),
        }));
      const requestBody = op.requestBody
        ? resolveRef(spec, op.requestBody)
        : null;
      const content = (requestBody && requestBody.content) || {};
      const json = content["application/json"];
      out.push({
        operationId: op.operationId || method + " " + pathTemplate,
        method: method.toUpperCase(),
        path: pathTemplate,
        params,
        body: json && json.schema ? resolveRef(spec, json.schema) : null,
        // a request body the spec only describes as something other than
        // JSON (multipart upload); the fuzz run leaves those out
        nonJsonBody: Boolean(requestBody) && !json,
      });
    }
  }
  return out;
}

// Strings a HAXcms backend gives meaning to, by the name of the property or
// parameter they are generated for. They are mixed with arbitrary strings, so
// a field still sees values the spec allows and nobody thought of.
function defaultHints(pools) {
  const p = pools || {};
  return [
    [
      /^(id|parent|duplicate|idOrSlug|nodeIds|relatedItems|items)$|ancestor|parent$/i,
      p.refs || [],
    ],
    [/content|^body$|html/i, p.content || []],
    [/slug|location/i, p.slugs || []],
    [/title|^q$|search|replace/i, p.titles || []],
    [/description/i, p.descriptions || []],
    [/tags?$/i, p.tags || []],
    [/theme/i, p.themes || []],
  ];
}

function stringArb(fc, schema, name, ctx) {
  const limits = {};
  if (Number.isInteger(schema.minLength)) limits.minLength = schema.minLength;
  limits.maxLength = Number.isInteger(schema.maxLength)
    ? Math.min(schema.maxLength, 64)
    : 24;
  if (limits.minLength > limits.maxLength) limits.maxLength = limits.minLength;
  const choices = [
    { weight: 3, arbitrary: fc.string(limits) },
    {
      weight: 1,
      arbitrary: fc.string(Object.assign({ unit: "grapheme" }, limits)),
    },
    // white space around a value: trimmed by one backend and kept by the
    // other is the kind of difference this run is for
    {
      weight: 1,
      arbitrary: fc
        .tuple(fc.constantFrom(" ", "\t", "\n", ""), fc.string(limits))
        .map(([pad, text]) => pad + text + " "),
    },
  ];
  if (schema.format === "uuid")
    choices.push({ weight: 4, arbitrary: fc.uuid() });
  for (const [pattern, pool] of ctx.hints) {
    if (pool.length && pattern.test(String(name || ""))) {
      choices.push({ weight: 6, arbitrary: fc.constantFrom(...pool) });
      break;
    }
  }
  return fc.oneof(...choices);
}

// A fast-check arbitrary for values the schema allows. `name` is the
// property or parameter the value is for (used for the string hints).
function schemaArbitrary(fc, spec, schemaIn, name, ctx, depth) {
  const d = depth || 0;
  const schema = resolveRef(spec, schemaIn) || {};
  if (schema.nullable) {
    const rest = Object.assign({}, schema, { nullable: false });
    return fc.option(schemaArbitrary(fc, spec, rest, name, ctx, d), {
      nil: null,
      freq: 6,
    });
  }
  if (Array.isArray(schema.enum) && schema.enum.length)
    return fc.constantFrom(...schema.enum);
  const alternatives = schema.oneOf || schema.anyOf;
  if (Array.isArray(alternatives) && alternatives.length)
    return fc.oneof(
      ...alternatives.map((s) => schemaArbitrary(fc, spec, s, name, ctx, d)),
    );
  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    const merged = { type: "object", properties: {}, required: [] };
    for (const partIn of schema.allOf) {
      const part = resolveRef(spec, partIn) || {};
      Object.assign(merged.properties, part.properties || {});
      merged.required = merged.required.concat(part.required || []);
      if (part.additionalProperties !== undefined)
        merged.additionalProperties = part.additionalProperties;
    }
    return schemaArbitrary(fc, spec, merged, name, ctx, d);
  }
  const type =
    schema.type || (schema.properties ? "object" : schema.items ? "array" : "");
  switch (type) {
    case "string":
      return stringArb(fc, schema, name, ctx);
    case "integer":
    case "number": {
      const min = Number.isFinite(schema.minimum) ? schema.minimum : -2;
      const max = Number.isFinite(schema.maximum)
        ? schema.maximum
        : Math.max(min, 50);
      return fc.integer({ min: Math.ceil(min), max: Math.floor(max) });
    }
    case "boolean":
      return fc.boolean();
    case "array": {
      const min = Number.isInteger(schema.minItems) ? schema.minItems : 0;
      const max = Math.max(
        min,
        Math.min(Number.isInteger(schema.maxItems) ? schema.maxItems : 3, 3),
      );
      if (d >= MAX_DEPTH) return fc.constant([]);
      return fc.array(
        schemaArbitrary(fc, spec, schema.items || {}, name, ctx, d + 1),
        { minLength: min, maxLength: max },
      );
    }
    case "object": {
      const props = schema.properties || {};
      const names = Object.keys(props);
      if (!names.length || d >= MAX_DEPTH) {
        if (schema.additionalProperties === false) return fc.constant({});
        return fc.dictionary(
          fc.constantFrom("a", "b", "title", "id"),
          scalarArbitrary(fc),
          { maxKeys: 2 },
        );
      }
      const model = {};
      for (const key of names) {
        if (Object.hasOwn(ctx.fixed, key))
          model[key] = fc.constant(ctx.fixed[key]);
        else
          model[key] = schemaArbitrary(fc, spec, props[key], key, ctx, d + 1);
      }
      const required = (schema.required || []).filter((k) =>
        Object.hasOwn(model, k),
      );
      // fixed properties (the site reference) are always sent
      for (const key of names)
        if (Object.hasOwn(ctx.fixed, key) && !required.includes(key))
          required.push(key);
      return fc.record(model, { requiredKeys: required });
    }
    default:
      return scalarArbitrary(fc);
  }
}

function scalarArbitrary(fc) {
  return fc.oneof(
    fc.string({ maxLength: 12 }),
    fc.integer({ min: -2, max: 50 }),
    fc.boolean(),
    fc.constant(null),
  );
}

// One change that takes a body outside what the spec allows: a top-level
// property removed, or replaced by a value of some other JSON type. Both
// backends must refuse (or accept) it the same way.
function violationArbitrary(fc) {
  return fc.record({
    kind: fc.constantFrom("drop", "replace"),
    index: fc.nat({ max: 31 }),
    value: fc.oneof(
      scalarArbitrary(fc),
      fc.constant([]),
      fc.constant({}),
      fc.array(fc.string({ maxLength: 6 }), { maxLength: 2 }),
    ),
  });
}

function applyViolation(body, violation, fixed) {
  if (!violation || !body || typeof body !== "object" || Array.isArray(body))
    return body;
  const keys = Object.keys(body).filter((k) => !Object.hasOwn(fixed, k));
  if (!keys.length) return body;
  const key = keys[violation.index % keys.length];
  const out = Object.assign({}, body);
  if (violation.kind === "drop") delete out[key];
  else out[key] = violation.value;
  return out;
}

// The arbitrary for one operation's requests.
// opts.pools      string pools for defaultHints()
// opts.fixed      top-level/nested property name -> value always sent as is
// opts.violations chance (0..1) that a body gets one out-of-spec change
function requestArbitrary(fc, spec, op, opts) {
  const o = opts || {};
  const ctx = { hints: defaultHints(o.pools), fixed: o.fixed || {} };
  const pathModel = {};
  const queryModel = {};
  const queryRequired = [];
  for (const p of op.params) {
    const arb = schemaArbitrary(fc, spec, p.schema, p.name, ctx, 0);
    if (p.in === "path") pathModel[p.name] = arb;
    else {
      queryModel[p.name] = arb;
      if (p.required) queryRequired.push(p.name);
    }
  }
  const chance = o.violations === undefined ? 0.15 : o.violations;
  const body = op.body
    ? fc
        .tuple(
          schemaArbitrary(fc, spec, op.body, "", ctx, 0),
          chance > 0
            ? fc.option(violationArbitrary(fc), {
                nil: null,
                freq: Math.max(1, Math.round(1 / chance)),
              })
            : fc.constant(null),
        )
        .map(([value, violation]) =>
          applyViolation(value, violation, ctx.fixed),
        )
    : fc.constant(undefined);
  return fc.record({
    operationId: fc.constant(op.operationId),
    method: fc.constant(op.method),
    path: fc.constant(op.path),
    pathParams: fc.record(pathModel),
    query: fc.record(queryModel, { requiredKeys: queryRequired }),
    body,
  });
}

// The spec path with its parameters filled in and the query string added.
// Values are percent-encoded; nothing from a generated value reaches the URL
// unencoded.
function toUrlPath(request) {
  const filled = request.path.replace(/\{([^}]+)\}/g, (m, name) =>
    encodeURIComponent(
      String(
        request.pathParams && request.pathParams[name] !== undefined
          ? request.pathParams[name]
          : "",
      ),
    ),
  );
  const parts = [];
  for (const [k, v] of Object.entries(request.query || {})) {
    if (v === undefined || v === null) continue;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  }
  return parts.length ? filled + "?" + parts.join("&") : filled;
}

module.exports = {
  loadSpec,
  resolveRef,
  listOperations,
  schemaArbitrary,
  requestArbitrary,
  applyViolation,
  toUrlPath,
  defaultHints,
};
