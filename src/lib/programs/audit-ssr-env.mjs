/**
 * Supplemental, inert browser surface for server rendering. Plain ESM,
 * excluded from babel like the worker that loads it.
 *
 * @lit-labs/ssr's DOM shim has custom elements and attributes but not the rest
 * of a browser: no `window`, no global event target, no observers, and no
 * query / child / class / style APIs on elements. Elements written for the
 * browser call those from constructors and render(), so without this most of
 * them fail on an unrelated missing method. Everything here is inert: lookups
 * find nothing, listeners are never called, observers never fire.
 *
 * Deliberately NOT installed: `document.body` / `document.head`. A truthy one
 * sends elements down their "attached to a real page" paths and far more of
 * them fail (454 threw instead of 73 in the first measurement), so an absent
 * body stays absent and elements guard it themselves.
 */
export function installInertDom(target = globalThis) {
  const g = target;
  const noop = () => {};
  // libraries that only look at `window` (focus-trap, web-dialog, ...)
  if (!g.window) {
    g.window = g;
  }
  g.addEventListener ||= noop;
  g.removeEventListener ||= noop;
  g.dispatchEvent ||= () => true;
  g.getSelection ||= () => null;
  g.matchMedia ||= () => ({
    matches: false,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
  });
  for (const name of [
    "ResizeObserver",
    "MutationObserver",
    "IntersectionObserver",
  ]) {
    if (!g[name]) {
      g[name] = class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      };
    }
  }
  if (g.document) {
    g.document.addEventListener ||= noop;
    g.document.removeEventListener ||= noop;
    g.document.querySelector ||= () => null;
    g.document.querySelectorAll ||= () => [];
    g.document.getElementById ||= () => null;
  }
  const proto = g.HTMLElement && g.HTMLElement.prototype;
  if (!proto) {
    return;
  }
  const method = (name, impl) => {
    if (!(name in proto)) {
      proto[name] = impl;
    }
  };
  const getter = (name, get, set = noop) => {
    if (!(name in proto)) {
      Object.defineProperty(proto, name, { get, set, configurable: true });
    }
  };
  method("querySelector", () => null);
  method("querySelectorAll", () => []);
  method("closest", () => null);
  method("matches", () => false);
  method("appendChild", (child) => child);
  method("removeChild", (child) => child);
  method("insertBefore", (child) => child);
  method("remove", noop);
  method("contains", () => false);
  method("focus", noop);
  method("blur", noop);
  method("getBoundingClientRect", () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  }));
  getter("children", () =>
    Object.assign([], { item: () => null, namedItem: () => null }),
  );
  getter("childNodes", () => []);
  for (const name of [
    "firstChild",
    "lastChild",
    "firstElementChild",
    "previousElementSibling",
    "nextElementSibling",
    "parentNode",
    "parentElement",
  ]) {
    getter(name, () => null);
  }
  getter("classList", () => ({
    add: noop,
    remove: noop,
    toggle: noop,
    contains: () => false,
    replace: noop,
  }));
  if (!("style" in proto)) {
    Object.defineProperty(proto, "style", {
      get() {
        return (this.__ssrStyle ||= {
          setProperty: noop,
          removeProperty: noop,
          getPropertyValue: () => "",
        });
      },
      set: noop,
      configurable: true,
    });
  }
}
