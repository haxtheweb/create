/**
 * Property-based (fuzz) tests for <<%= name %>>: what the element does with
 * input nobody picked by hand. fast-check generates the input; a failure
 * prints { seed, path } and the smallest input that still fails.
 *
 *   npm test              the fixed seed below: the same inputs on every
 *                         run, so a red run means a change broke it
 *   npm run test:fuzz     a random seed and many more runs, to hunt
 *   HAX_FUZZ_SEED=<seed> HAX_FUZZ_PATH=<path> npm test
 *                         replays exactly one reported failure
 *
 * When a hunt finds something: fix it, then add the input to PINNED below so
 * every run guards it. Convention: https://github.com/haxtheweb/issues/issues/3272
 */
import { html, fixture, expect } from "@open-wc/testing";
import fc from "fast-check";
import "../<%= name %>.js";
import { fuzzConfig } from "<%- fuzzConfigImport %>";

const RUNS = fuzzConfig({ defaultSeed: <%= seed %>, defaultRuns: 100 });

// Inputs that have broken parsers before. Add every counterexample a hunt
// finds here.
const PINNED = [
  "",
  "   ",
  "\u0000",
  "\n\t",
  "0",
  "-1",
  "1e999",
  "NaN",
  "null",
  "undefined",
  "true",
  "[]",
  "{}",
  '{"__proto__":{"polluted":true}}',
  "constructor",
  "<img src=x data-fuzz-marker>",
  "<script data-fuzz-marker></script>",
  "</style><b data-fuzz-marker>x</b>",
  '"><b data-fuzz-marker>',
  "javascript:alert(1)",
  "\u202Eright to left",
  "a".repeat(5000),
];

const MARKER = "<b data-fuzz-marker>x</b>";

// any text, the pinned inputs, and markup that must stay text
const input = fc.oneof(
  fc.string(),
  fc.string({ unit: "grapheme" }),
  fc.constantFrom(...PINNED),
  fc.string({ maxLength: 20 }).map((text) => text + MARKER + text),
  fc.json(),
);

// the text, number and boolean attributes the element declares, read from
// the element itself so this file keeps up when properties are added
function declaredAttributes() {
  const ctor = globalThis.customElements.get("<%= name %>");
  const attributes = [];
  const properties = ctor && ctor.elementProperties;
  if (properties && typeof properties.forEach === "function") {
    properties.forEach((options, property) => {
      if (typeof property !== "string" || !options) {
        return;
      }
      if (options.attribute === false || options.state) {
        return;
      }
      // Object and Array properties are handed over by code, not typed into
      // markup; add them here if this element reads them from an attribute
      if (options.type === Object || options.type === Array) {
        return;
      }
      attributes.push(
        typeof options.attribute === "string"
          ? options.attribute
          : property.toLowerCase(),
      );
    });
  }
  return attributes;
}

// errors thrown inside the page (a render, an event handler, a promise) do
// not reach the test on their own
function collectErrors() {
  const errors = [];
  const onError = (event) => {
    errors.push(event.error || event.message);
    event.preventDefault();
  };
  const onRejection = (event) => {
    errors.push(event.reason);
    event.preventDefault();
  };
  globalThis.addEventListener("error", onError);
  globalThis.addEventListener("unhandledrejection", onRejection);
  return {
    errors,
    stop() {
      globalThis.removeEventListener("error", onError);
      globalThis.removeEventListener("unhandledrejection", onRejection);
    },
  };
}

async function settle(element) {
  await element.updateComplete;
  // one more turn for anything the update scheduled
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  await element.updateComplete;
}

describe("<%= className %> fuzz", function () {
  // every generated input waits for the element to render, so the time a
  // test may take grows with the number of runs (a hunt uses thousands)
  this.timeout(Math.max(10000, RUNS.numRuns * 250));
  let element;
  let attributes;
  beforeEach(async () => {
    element = await fixture(html`<<%= name %>></<%= name %>>`);
    attributes = declaredAttributes();
  });

  it("declares attributes to fuzz", () => {
    // an element without attributes takes its input some other way (slot,
    // property, method): point the properties below at that instead
    expect(attributes).to.be.an("array");
  });

  it("never throws, whatever its attributes are set to", async () => {
    const watch = collectErrors();
    try {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...(attributes.length ? attributes : ["title"])),
          input,
          async (attribute, value) => {
            watch.errors.length = 0;
            element.setAttribute(attribute, value);
            await settle(element);
            element.removeAttribute(attribute);
            await settle(element);
            expect(watch.errors, `attribute ${attribute}`).to.deep.equal([]);
          },
        ),
        RUNS,
      );
    } finally {
      watch.stop();
    }
  });

  it("never turns attribute text into markup", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...(attributes.length ? attributes : ["title"])),
        input,
        async (attribute, value) => {
          element.setAttribute(attribute, value);
          await settle(element);
          const root = element.shadowRoot || element;
          const inShadow = root.querySelector("[data-fuzz-marker]");
          const inLight = element.querySelector("[data-fuzz-marker]");
          // back to the start, so the next input is judged on its own
          element.removeAttribute(attribute);
          await settle(element);
          expect(inShadow, `attribute ${attribute} rendered as markup`).to.equal(
            null,
          );
          expect(inLight, `attribute ${attribute} rendered as markup`).to.equal(
            null,
          );
        },
      ),
      RUNS,
    );
  });

  it("never throws, whatever is slotted into it", async () => {
    const watch = collectErrors();
    try {
      await fc.assert(
        fc.asyncProperty(input, async (value) => {
          watch.errors.length = 0;
          element.textContent = value;
          await settle(element);
          expect(watch.errors).to.deep.equal([]);
        }),
        RUNS,
      );
    } finally {
      watch.stop();
    }
  });

  // A parser or sanitizer of your own is best fuzzed directly, without the
  // element around it. Export it from a module and state what must always
  // hold, for example:
  //
  //   import { parseThing } from "../lib/parse-thing.js";
  //   it("parseThing never throws and always returns a list", () => {
  //     fc.assert(
  //       fc.property(input, (value) => {
  //         expect(parseThing(value)).to.be.an("array");
  //       }),
  //       RUNS,
  //     );
  //   });
});
