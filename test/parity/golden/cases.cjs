// Golden snapshot cases (haxtheweb/issues#3332). Each case starts from a fresh
// site, applies its steps on every leg it lists, and the normalized result is
// compared to the committed golden snapshot in snapshots/<id>.json.
//
// Ids follow the numbering of the operation list in the
// "HAX Golden Snapshot Parity Operations" doc (1-50), so coverage can be read
// off it. Steps use the same op shape as ops.cjs and run through the same leg
// adapters in legs.cjs: L0 is the welcome page, L1.. are pages a step adds.
//
//   legs: "all" = nodejs + php + cli (the CLI can express every step)
//         "api" = nodejs + php (a step has no CLI command)
//
// Add a case: append it here, run `npm run test:parity:golden -- --update-golden
// --cases <id>`, review the new snapshots/<id>.json, commit both.

const CASES = [
  // 1. Site creation
  {
    id: "01-create-site-defaults",
    title: "Create a site with the default createSite settings",
    legs: "all",
    steps: [],
  },
  // 2. Site settings
  {
    id: "10-switch-theme",
    title: "Switch the theme",
    legs: "all",
    steps: [{ type: "setTheme", theme: "polaris-flex-theme" }],
  },
  {
    id: "14-site-language",
    title: "Update SEO and manifest metadata: site language",
    legs: "api",
    steps: [{ type: "setLang", lang: "es" }],
  },
  // 3. Page creation
  {
    id: "15-add-top-level-page",
    title: "Add a top-level page",
    legs: "all",
    steps: [
      {
        type: "addPage",
        key: "L1",
        title: "Getting started",
        content: "<p>First steps.</p>",
      },
    ],
  },
  {
    id: "16-add-child-page",
    title: "Add a child page",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Unit 1", content: "<p>Unit</p>" },
      {
        type: "addPage",
        key: "L2",
        title: "Lesson 1",
        content: "<p>Lesson</p>",
        parent: "L1",
      },
    ],
  },
  {
    id: "17-add-grandchild-page",
    title: "Add a grandchild page (three levels deep)",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Unit 1", content: "<p>Unit</p>" },
      {
        type: "addPage",
        key: "L2",
        title: "Lesson 1",
        content: "<p>Lesson</p>",
        parent: "L1",
      },
      {
        type: "addPage",
        key: "L3",
        title: "Activity 1",
        content: "<p>Activity</p>",
        parent: "L2",
      },
    ],
  },
  {
    id: "18-unicode-page-title",
    title: "Add a page with a Unicode title",
    legs: "all",
    steps: [
      {
        type: "addPage",
        key: "L1",
        title: "Café résumé 日本語",
        content: "<p>Unicode</p>",
      },
    ],
  },
  {
    id: "19-duplicate-page-title",
    title: "Add a page with a duplicate title (slug collision)",
    legs: "all",
    steps: [
      {
        type: "addPage",
        key: "L1",
        title: "Introduction",
        content: "<p>1</p>",
      },
      {
        type: "addPage",
        key: "L2",
        title: "Introduction",
        content: "<p>2</p>",
      },
    ],
  },
  // 4. Page content
  {
    id: "23-save-page-body",
    title: "Save page body HTML",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Page", content: "<p>Draft</p>" },
      {
        type: "editContent",
        key: "L1",
        content:
          '<h2>Heading</h2>\n<p>Body with <strong>bold</strong> and <a href="https://haxtheweb.org">a link</a>.</p>',
      },
    ],
  },
  {
    id: "24-save-hax-elements",
    title: "Save content with HAX elements (video-player, etc.)",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Media", content: "<p>Draft</p>" },
      {
        type: "editContent",
        key: "L1",
        content:
          '<video-player source="https://www.youtube.com/watch?v=zmext_0e4xQ" media-title="Video"></video-player>\n<grid-plate layout="1-1"><p slot="col-1">Left</p><p slot="col-2">Right</p></grid-plate>',
      },
    ],
  },
  {
    id: "26-title-and-slug",
    title: "Update page title and slug together",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Draft title", content: "<p>x</p>" },
      { type: "editTitle", key: "L1", title: "Final title" },
      { type: "editSlug", key: "L1", slug: "custom-slug" },
    ],
  },
  {
    id: "27-tags-and-description",
    title: "Update page metadata (tags, description)",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Plants", content: "<p>x</p>" },
      { type: "editTags", key: "L1", tags: "biology,plants" },
      { type: "editDescription", key: "L1", description: "Short description." },
    ],
  },
  {
    id: "28-special-characters",
    title: "Save content with special characters and entities",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Q&A / FAQ", content: "<p>x</p>" },
      {
        type: "editContent",
        key: "L1",
        content: "<p>Entities &amp; &lt;tags&gt; &copy; &nbsp;space</p>",
      },
    ],
  },
  {
    id: "29-empty-page-body",
    title: "Save an empty page body",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Empty", content: "<p>x</p>" },
      { type: "editContent", key: "L1", content: "<p></p>" },
    ],
  },
  // 5. Outline and structure
  {
    id: "30-reorder-siblings",
    title: "Reorder siblings",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "One", content: "<p>1</p>" },
      { type: "addPage", key: "L2", title: "Two", content: "<p>2</p>" },
      { type: "addPage", key: "L3", title: "Three", content: "<p>3</p>" },
      {
        type: "outlineReorder",
        parent: null,
        order: ["L3", "L0", "L2", "L1"],
      },
    ],
  },
  {
    id: "31-reparent-to-end",
    title:
      "Reparent a page without an order (goes to the end of its new siblings)",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Unit", content: "<p>u</p>" },
      {
        type: "addPage",
        key: "L2",
        title: "Existing child",
        content: "<p>c</p>",
        parent: "L1",
      },
      { type: "addPage", key: "L3", title: "Mover", content: "<p>m</p>" },
      { type: "editParent", key: "L3", parent: "L1" },
    ],
  },
  {
    id: "33-move-subtree-to-top",
    title: "Move a subtree to the top level",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Unit", content: "<p>u</p>" },
      {
        type: "addPage",
        key: "L2",
        title: "Lesson",
        content: "<p>l</p>",
        parent: "L1",
      },
      {
        type: "addPage",
        key: "L3",
        title: "Activity",
        content: "<p>a</p>",
        parent: "L2",
      },
      { type: "outlineMove", key: "L2", parent: null },
    ],
  },
  {
    id: "38-lock-and-unlock",
    title: "Lock and unlock a page",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Locked", content: "<p>x</p>" },
      { type: "addPage", key: "L2", title: "Unlocked", content: "<p>y</p>" },
      { type: "setLocked", key: "L1", locked: true },
      { type: "setLocked", key: "L2", locked: true },
      { type: "setLocked", key: "L2", locked: false },
    ],
  },
  // 7. Deletion and recovery
  {
    id: "43-delete-leaf-page",
    title: "Delete a leaf page",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Keep", content: "<p>k</p>" },
      { type: "addPage", key: "L2", title: "Remove", content: "<p>r</p>" },
      { type: "deletePage", key: "L2" },
    ],
  },
];

module.exports = { CASES };
