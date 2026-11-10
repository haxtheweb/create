// Seeded operation generator. Ops are expressed against LOGICAL page keys
// (L0 = the welcome page, L1.. = pages added by the run) so every leg can map
// them onto its own uuids. The generator picks targets from a tree model that
// the runner resyncs from the reference leg (nodejs) after every op.

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TITLES = [
  "Introduction",
  "Getting started",
  "Introduction",
  "Chapter 1: Cells",
  "Lesson 2 — Energy",
  "Café résumé",
  "Über cool",
  "日本語のページ",
  "Emoji 🚀 launch",
  "  Padded title  ",
  "Q&A / FAQ",
  "Title with <b>bold</b>",
  'It\'s a "quote"',
  "x",
  "Week 10",
  "week-10",
  "A very long title that keeps going and going to test how slugs get truncated or not across backends",
  "100% done",
  "C++ & C#",
  "Résumé",
  "résumé",
  "Overview",
  "Summary",
  "Next steps",
];
const SLUGS = [
  "custom-slug",
  "Custom Slug",
  "intro",
  "x",
  "x/inner",
  "nested/path/here",
  "café",
  "dup",
  "dup",
  "UPPER",
  "with spaces here",
  "trailing-",
  "-leading",
  "a..b",
  "files",
  "pages",
  "week-10",
];
const DESCRIPTIONS = [
  "",
  "Short description.",
  "Has <em>markup</em> inside",
  "Ünïcode déscription",
  "Line\nbreak",
  '"quoted" & ampersand',
];
const TAGS = [
  "",
  "biology",
  "biology,plants",
  "a, b , c",
  "Tag With Caps",
  "unicode-ü,🚀",
];
const THEMES = [
  "clean-one",
  "clean-two",
  "learn-two-theme",
  "polaris-flex-theme",
];
// Deliberately malformed markup. Each backend's HTML parser repairs it its own
// way; normalize.cjs lists the repaired forms that are accepted as equal.
const MALFORMED_HTML = "<div><p>Unclosed paragraph<div>bad nesting</p></div>";
const CONTENT = [
  "<p>Plain paragraph.</p>",
  '<h2>Heading</h2>\n<p>Body with <strong>bold</strong> and <a href="https://haxtheweb.org">a link</a>.</p>',
  "<p>Entities &amp; &lt;tags&gt; &copy; &nbsp;space</p>",
  "<p>Unicode: café, 日本語, emoji 🚀</p>",
  '<video-player source="https://www.youtube.com/watch?v=zmext_0e4xQ" media-title="Video"></video-player>',
  '<grid-plate layout="1-1"><p slot="col-1">Left</p><p slot="col-2">Right</p></grid-plate>',
  '<p style="color:red" onclick="alert(1)">Inline style and handler</p>',
  '<script>alert("x")</script><p>After script</p>',
  "<ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>",
  '<p>Image: <img src="files/missing.png" alt="missing"></p>',
  '<p>http link <a href="http://example.com">insecure</a></p>',
  "<p></p>",
  MALFORMED_HTML,
  '<rpg-character seed="btopro"></rpg-character>',
  "<table><tr><td>cell</td></tr></table>",
  "<p>  lots   of   whitespace  </p>\n\n\n<p>gap</p>",
];

const SHARED_WEIGHTS = {
  addPage: 24,
  editTitle: 9,
  editContent: 12,
  editSlug: 6,
  editDescription: 5,
  editTags: 5,
  editPublished: 4,
  editHideInMenu: 4,
  editParent: 8,
  editOrder: 6,
  deletePage: 9,
  setTheme: 3,
};
// API-only ops (no CLI equivalent) used by the nodejs-vs-PHP sequence
const API_ONLY_WEIGHTS = {
  moveUp: 4,
  moveDown: 4,
  indent: 4,
  outdent: 4,
  setLocked: 2,
  setIcon: 2,
  outlineReorder: 5,
  outlineMove: 4,
  normalizeSlugs: 2,
  setLang: 2,
};

class OpGenerator {
  constructor(seed, mode) {
    this.rand = mulberry32(seed);
    this.mode = mode; // 'shared' | 'api'
    this.nextKey = 1;
    this.weights =
      mode === "api"
        ? Object.assign({}, SHARED_WEIGHTS, API_ONLY_WEIGHTS)
        : SHARED_WEIGHTS;
  }
  pick(arr) {
    return arr[Math.floor(this.rand() * arr.length)];
  }
  int(n) {
    return Math.floor(this.rand() * n);
  }
  // tree: [{key, parent, order}] for live pages (from the reference leg)
  next(i, tree) {
    const keys = tree.map((t) => t.key);
    const w = Object.assign({}, this.weights);
    if (keys.length > 60) w.addPage = 4;
    if (keys.length < 4) {
      w.deletePage = 0;
    }
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let r = this.rand() * total;
    let type = "addPage";
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r < 0) {
        type = k;
        break;
      }
    }
    const childrenOf = (k) => tree.filter((t) => t.parent === k);
    const descendants = (k) => {
      const out = [];
      const walk = (p) =>
        childrenOf(p).forEach((c) => {
          out.push(c.key);
          walk(c.key);
        });
      walk(k);
      return out;
    };
    const anyKey = () => this.pick(keys);
    const op = { i, type };
    switch (type) {
      case "addPage": {
        op.key = "L" + this.nextKey++;
        op.title = this.pick(TITLES);
        op.content = this.pick(CONTENT);
        if (keys.length && this.rand() < 0.45) op.parent = anyKey();
        if (this.rand() < 0.2) op.slug = this.pick(SLUGS);
        if (this.rand() < 0.3)
          op.description = this.pick(DESCRIPTIONS.filter(Boolean));
        if (this.rand() < 0.3) op.tags = this.pick(TAGS.filter(Boolean));
        break;
      }
      case "editTitle":
        op.key = anyKey();
        op.title = this.pick(TITLES);
        break;
      case "editContent":
        op.key = anyKey();
        op.content = this.pick(CONTENT);
        break;
      case "editSlug":
        op.key = anyKey();
        op.slug = this.pick(SLUGS);
        break;
      case "editDescription":
        op.key = anyKey();
        op.description = this.pick(DESCRIPTIONS.filter(Boolean));
        break;
      case "editTags":
        op.key = anyKey();
        op.tags = this.pick(TAGS.filter(Boolean));
        break;
      case "editPublished":
        op.key = anyKey();
        op.published = this.rand() < 0.5;
        break;
      case "editHideInMenu":
        op.key = anyKey();
        op.hideInMenu = this.rand() < 0.5;
        break;
      case "editParent": {
        op.key = anyKey();
        const banned = new Set([op.key].concat(descendants(op.key)));
        const options = keys.filter((k) => !banned.has(k));
        op.parent =
          options.length && this.rand() < 0.75 ? this.pick(options) : null;
        break;
      }
      case "editOrder":
        op.key = anyKey();
        op.order = this.int(6);
        break;
      case "deletePage": {
        // leaves only, so a delete means the same thing in every leg
        const leaves = keys.filter((k) => childrenOf(k).length === 0);
        op.key = this.pick(leaves);
        break;
      }
      case "setTheme":
        op.theme = this.pick(THEMES);
        break;
      case "moveUp":
      case "moveDown":
      case "indent":
      case "outdent":
      case "setLocked":
      case "setIcon":
        op.key = anyKey();
        if (type === "setLocked") op.locked = this.rand() < 0.5;
        if (type === "setIcon")
          op.icon = this.pick(["icons:home", "hax:wand", "icons:star"]);
        break;
      case "outlineReorder": {
        const parents = [null]
          .concat(keys)
          .filter((p) => childrenOf(p).length > 1);
        if (!parents.length) {
          op.type = "editTitle";
          op.key = anyKey();
          op.title = this.pick(TITLES);
          break;
        }
        op.parent = this.pick(parents);
        const kids = childrenOf(op.parent).map((c) => c.key);
        for (let j = kids.length - 1; j > 0; j--) {
          const s = this.int(j + 1);
          [kids[j], kids[s]] = [kids[s], kids[j]];
        }
        op.order = kids;
        break;
      }
      case "outlineMove": {
        op.key = anyKey();
        const banned = new Set([op.key].concat(descendants(op.key)));
        const options = keys.filter((k) => !banned.has(k));
        op.parent =
          options.length && this.rand() < 0.7 ? this.pick(options) : null;
        break;
      }
      case "normalizeSlugs":
        break;
      case "setLang":
        op.lang = this.pick(["en", "es", "fr", "ja"]);
        break;
    }
    return op;
  }
}

module.exports = { OpGenerator, THEMES, MALFORMED_HTML };
