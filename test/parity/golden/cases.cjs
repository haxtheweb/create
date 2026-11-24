// Golden snapshot cases (haxtheweb/issues#3332). Each case starts from a fresh
// site, applies its steps on every leg it lists, and the normalized result is
// compared to the committed golden snapshot in snapshots/<id>.json.
//
// Ids follow the numbering of the operation list in the
// "HAX Golden Snapshot Parity Operations" doc (1-50), so coverage can be read
// off it. A letter after the number (34b) is a further case for that
// operation. Steps use the same op shape as ops.cjs and run through the same leg
// adapters in legs.cjs: L0 is the welcome page, L1.. are pages a step adds.
//
//   legs: "all" = nodejs + php + cli (the CLI can express every step)
//         "api" = nodejs + php (a step has no CLI command)
//
// A step with `expect: <status>` must be refused with that HTTP status on
// every leg; the snapshot then shows the site exactly as the steps before it
// left it (an invalid outline is rejected before anything is written).
//
// Outline cases (haxtheweb/issues#3333) send what outline-designer sends:
//   outlineSave: one Save Outline. `changes` edit pages by key (title, slug,
//                parent, order, hideInMenu, delete); `add` adds new pages.
//   outlineRaw:  a hand-written items payload, for refused saves. "@L1" is
//                replaced with that page's id.
//
// Hooked-operation cases (the routes the plugin platform wraps in hooks) run
// on the API legs and can record more than site.json and the pages:
//   sitePatch:       a settings save, PATCH <path> with <body>
//   editBlocks:      PATCH /v1/content/<page>/blocks
//   uploadFile, fileOp, deleteFile, replaceFile: the files API, with
//                    documents from fixtures/files/; captureFiles: true adds
//                    the files/ folder (paths + hashes) and files.json records
//   restoreRevision: restore the revision `back` saves before the newest
//   cloneSite:       the clone is snapshotted too (CLONE_NAME)
//   archiveSite:     records where the site went (the site itself is gone)
//   downloadSite:    records the entries of the zip the export link serves
//
// Import cases (importFile) make the site from a document in
// fixtures/import/ instead of the default starter: the API legs upload it to
// its system import route and create the site from the items it returns (the
// dashboard's flow); the CLI leg runs `hax site --import-site <file>`. Their
// pages are not addressed by key, so they show up as UNTRACKED1.. in order.
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
  // 1b-1j. Site creation from a document
  {
    id: "01b-import-docx",
    title: "Create a site from a Word document (.docx)",
    legs: "all",
    importFile: "course.docx",
    steps: [],
  },
  {
    id: "01c-import-odt",
    title: "Create a site from an OpenDocument text (.odt)",
    legs: "all",
    importFile: "course.odt",
    steps: [],
  },
  {
    id: "01d-import-pdf",
    title: "Create a site from a PDF",
    legs: "all",
    importFile: "course.pdf",
    steps: [],
  },
  {
    id: "01e-import-pptx",
    title: "Create a site from a PowerPoint deck (.pptx)",
    legs: "all",
    importFile: "deck.pptx",
    steps: [],
  },
  {
    id: "01f-import-odp",
    title: "Create a site from an OpenDocument presentation (.odp)",
    legs: "all",
    importFile: "deck.odp",
    steps: [],
  },
  {
    id: "01g-import-xlsx",
    title: "Create a site from an Excel outline (.xlsx)",
    legs: "all",
    importFile: "outline.xlsx",
    steps: [],
  },
  {
    id: "01h-import-ods",
    title: "Create a site from an OpenDocument spreadsheet outline (.ods)",
    legs: "all",
    importFile: "outline.ods",
    steps: [],
  },
  {
    id: "01i-import-md",
    title: "Create a site from Markdown (.md)",
    legs: "all",
    importFile: "notes.md",
    steps: [],
  },
  {
    id: "01j-import-txt",
    title: "Create a site from plain text (.txt, Windows-1252)",
    legs: "all",
    importFile: "notes.txt",
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
    id: "25-null-and-blank-titles",
    title: 'A title that is the text "null" or blank becomes "New page"',
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "null", content: "<p>x</p>" },
      { type: "addPage", key: "L2", title: "Kept", content: "<p>y</p>" },
      { type: "editTitle", key: "L2", title: "NULL" },
      { type: "addPage", key: "L3", title: "Spaces", content: "<p>z</p>" },
      { type: "editTitle", key: "L3", title: "   " },
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
    id: "32-reparent-with-order",
    title: "Reparent a page with an explicit order",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Unit", content: "<p>u</p>" },
      {
        type: "addPage",
        key: "L2",
        title: "First child",
        content: "<p>a</p>",
        parent: "L1",
      },
      {
        type: "addPage",
        key: "L3",
        title: "Second child",
        content: "<p>b</p>",
        parent: "L1",
      },
      { type: "addPage", key: "L4", title: "Mover", content: "<p>m</p>" },
      { type: "editParent", key: "L4", parent: "L1", order: 0 },
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
    id: "34-bulk-outline-save",
    title:
      "Bulk outline save: a move, a rename, a delete and a new page in one save",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Unit 1", content: "<p>1</p>" },
      { type: "addPage", key: "L2", title: "Unit 2", content: "<p>2</p>" },
      { type: "addPage", key: "L3", title: "Lesson", content: "<p>l</p>" },
      { type: "addPage", key: "L4", title: "Old notes", content: "<p>o</p>" },
      {
        type: "outlineSave",
        changes: [
          { key: "L3", parent: "L1" },
          { key: "L2", title: "Unit Two" },
          { key: "L4", delete: true },
        ],
        add: [{ key: "L5", title: "Quiz", parent: "L2" }],
      },
    ],
  },
  {
    id: "34b-indent-and-outdent",
    title: "Indent a page under its sibling, then outdent it back",
    legs: "all",
    steps: [
      { type: "addPage", key: "L1", title: "Unit", content: "<p>u</p>" },
      { type: "addPage", key: "L2", title: "Lesson", content: "<p>l</p>" },
      { type: "addPage", key: "L3", title: "Activity", content: "<p>a</p>" },
      { type: "indent", key: "L2" },
      { type: "indent", key: "L3" },
      { type: "indent", key: "L3" },
      { type: "outdent", key: "L3" },
    ],
  },
  {
    id: "34c-outline-slug-collision",
    title: "Bulk outline save renames two pages to the same title",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Alpha", content: "<p>a</p>" },
      { type: "addPage", key: "L2", title: "Beta", content: "<p>b</p>" },
      {
        type: "outlineSave",
        changes: [
          { key: "L1", title: "Overview" },
          { key: "L2", title: "Overview" },
        ],
      },
    ],
  },
  {
    id: "34d-outline-slug-override",
    title: "Bulk outline save sets a custom slug that another page has",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Syllabus", content: "<p>s</p>" },
      { type: "addPage", key: "L2", title: "Schedule", content: "<p>c</p>" },
      { type: "outlineSave", changes: [{ key: "L2", slug: "syllabus" }] },
    ],
  },
  {
    id: "34e-outline-locked-and-hidden",
    title:
      "Bulk outline save keeps a locked page and a hidden page as they were",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Locked", content: "<p>l</p>" },
      { type: "addPage", key: "L2", title: "Hidden", content: "<p>h</p>" },
      { type: "addPage", key: "L3", title: "Mover", content: "<p>m</p>" },
      { type: "setLocked", key: "L1", locked: true },
      { type: "editHideInMenu", key: "L2", hideInMenu: true },
      {
        type: "outlineSave",
        changes: [
          { key: "L3", parent: "L2" },
          { key: "L2", title: "Hidden page" },
        ],
      },
    ],
  },
  {
    id: "34f-outline-hide-in-bulk",
    title: "Bulk outline save hides one page and shows another",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Shown", content: "<p>s</p>" },
      { type: "addPage", key: "L2", title: "Was hidden", content: "<p>h</p>" },
      { type: "editHideInMenu", key: "L2", hideInMenu: true },
      {
        type: "outlineSave",
        changes: [
          { key: "L1", hideInMenu: true },
          { key: "L2", hideInMenu: false },
        ],
      },
    ],
  },
  {
    id: "34g-outline-unknown-parent",
    title:
      "Bulk outline save with a parent that does not exist (page goes to the top level)",
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
        type: "outlineSave",
        changes: [{ key: "L2", parent: "no-such-page" }],
      },
    ],
  },
  {
    id: "34h-outline-delete-parent",
    title:
      "Bulk outline save deletes a parent and keeps its child (it moves up one level into the parent's place)",
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
      { type: "outlineSave", changes: [{ key: "L1", delete: true }] },
    ],
  },
  {
    id: "34i-outline-locked-keeps-title",
    title:
      "Bulk outline save keeps a locked page's title but moves it; the rest of the save applies",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Locked", content: "<p>l</p>" },
      { type: "addPage", key: "L2", title: "Unit", content: "<p>u</p>" },
      { type: "addPage", key: "L3", title: "Other", content: "<p>o</p>" },
      { type: "setLocked", key: "L1", locked: true },
      {
        type: "outlineSave",
        changes: [
          { key: "L1", title: "Renamed", parent: "L2" },
          { key: "L3", title: "Other page" },
        ],
      },
    ],
  },
  {
    id: "34j-outline-delete-nested-parents",
    title:
      "Bulk outline save deletes a page and its parent but keeps a grandchild (it moves up to the nearest kept level)",
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
      {
        type: "addPage",
        key: "L4",
        title: "Quiz",
        content: "<p>q</p>",
        parent: "L1",
      },
      { type: "addPage", key: "L5", title: "Next", content: "<p>n</p>" },
      {
        type: "outlineSave",
        changes: [
          { key: "L1", delete: true },
          { key: "L2", delete: true },
        ],
      },
    ],
  },
  {
    id: "34k-outline-delete-locked",
    title: "Bulk outline save deletes a locked page",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Locked", content: "<p>l</p>" },
      { type: "setLocked", key: "L1", locked: true },
      { type: "outlineSave", changes: [{ key: "L1", delete: true }] },
    ],
  },
  {
    id: "34l-outline-child-before-renamed-parent",
    title:
      "Bulk outline save lists a page before the parent it renames (the page gets the parent's new address)",
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
        type: "outlineRaw",
        items: [
          { id: "@L0", title: "Home", parent: null, order: 0, indent: 0 },
          { id: "@L2", title: "Lesson", parent: "@L1", order: 0, indent: 1 },
          { id: "@L1", title: "Unit one", parent: null, order: 1, indent: 0 },
        ],
      },
    ],
  },
  {
    id: "36-outline-empty-item",
    title: "saveOutline with an empty item is refused and changes nothing",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Keep", content: "<p>k</p>" },
      { type: "outlineRaw", items: [{}], expect: 400 },
    ],
  },
  {
    id: "36b-outline-not-a-list",
    title: "saveOutline whose items are not a list, or not objects, is refused",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Keep", content: "<p>k</p>" },
      { type: "outlineRaw", items: "L1", expect: 400 },
      { type: "outlineRaw", items: [null], expect: 400 },
      { type: "outlineRaw", items: [["@L1"]], expect: 400 },
    ],
  },
  {
    id: "37-outline-blank-id",
    title: "saveOutline with a blank id is refused and changes nothing",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Keep", content: "<p>k</p>" },
      {
        type: "outlineRaw",
        items: [
          { id: "@L1", title: "Renamed", parent: null, order: 0 },
          { id: "   ", title: "Blank id", parent: null, order: 1 },
        ],
        expect: 400,
      },
    ],
  },
  {
    id: "37b-outline-parent-cycle",
    title:
      "saveOutline that moves a page under its own child is refused and changes nothing",
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
        type: "outlineRaw",
        items: [
          { id: "@L1", title: "Unit", parent: "@L2", order: 0, indent: 2 },
          { id: "@L2", title: "Lesson", parent: "@L1", order: 0, indent: 1 },
        ],
        expect: 400,
      },
    ],
  },
  {
    id: "37c-outline-duplicate-new-id",
    title:
      "saveOutline that sends the same new page id twice is refused and changes nothing",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Keep", content: "<p>k</p>" },
      {
        type: "outlineRaw",
        items: [
          { id: "item-new-page", title: "New A", parent: null, order: 1 },
          { id: "item-new-page", title: "New B", parent: null, order: 2 },
        ],
        expect: 400,
      },
    ],
  },
  {
    id: "38-lock-and-unlock",
    title: "Lock and unlock a page",
    legs: "all",
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
  {
    id: "44-delete-parent-with-children",
    title:
      "Delete a page that has children (they move up one level into its place)",
    legs: "all",
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
      { type: "deletePage", key: "L1" },
    ],
  },
  {
    id: "44b-delete-middle-page",
    title:
      "Delete a page in the middle of a branch (its child moves up under the grandparent, into its place)",
    legs: "all",
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
      {
        type: "addPage",
        key: "L4",
        title: "Quiz",
        content: "<p>q</p>",
        parent: "L1",
      },
      { type: "deletePage", key: "L2" },
    ],
  },

  // --- Operations the plugin platform wraps in hooks ---
  // 2. Site settings
  {
    id: "09-update-site-title",
    title: "Update the site title",
    legs: "api",
    steps: [
      {
        type: "sitePatch",
        path: "/v1/site",
        body: { manifest: { site: { "manifest-title": "Golden course" } } },
      },
    ],
  },
  {
    id: "11-theme-settings",
    title: "Update theme settings (accent color, icon)",
    legs: "api",
    steps: [
      {
        type: "sitePatch",
        path: "/v1/site/appearance",
        body: {
          manifest: {
            theme: {
              "manifest-metadata-theme-variables-cssVariable":
                "--simple-colors-default-theme-pink-7",
              "manifest-metadata-theme-variables-icon": "icons:star",
            },
          },
        },
      },
    ],
  },
  {
    id: "12-license-and-author",
    title: "Update the site license and author metadata",
    legs: "api",
    steps: [
      {
        type: "sitePatch",
        path: "/v1/site/seo",
        body: {
          author: {
            license: "by-sa",
            name: "Golden Author",
            email: "author@example.org",
          },
        },
      },
    ],
  },
  {
    id: "13-site-features",
    title: "Turn site features on and off",
    legs: "api",
    steps: [
      {
        type: "sitePatch",
        path: "/v1/site/platform",
        body: {
          platform: { features: { insights: false, contentMap: false } },
        },
      },
    ],
  },
  {
    id: "13b-editor-audience",
    title: "Switch the editor to the expert audience",
    legs: "api",
    steps: [
      {
        type: "sitePatch",
        path: "/v1/site/editor",
        body: { platform: { audience: "expert" } },
      },
    ],
  },
  {
    id: "13c-allowed-blocks",
    title: "Limit the blocks authors can add",
    legs: "api",
    steps: [
      {
        type: "sitePatch",
        path: "/v1/site/blocks",
        body: { platform: { allowedBlocks: ["video-player", "simple-cta"] } },
      },
    ],
  },
  {
    id: "14b-seo-description",
    title: "Update SEO and manifest metadata: description",
    legs: "api",
    steps: [
      {
        type: "sitePatch",
        path: "/v1/site/seo",
        body: { seo: { description: "A golden description" } },
      },
    ],
  },
  // 4. Page content
  {
    id: "24b-edit-content-blocks",
    title: "Change a block's attributes through the content blocks API",
    legs: "api",
    steps: [
      {
        type: "addPage",
        key: "L1",
        title: "Blocks",
        content:
          '<p>Hello</p><simple-cta link="https://example.org/start" label="Start"></simple-cta>',
      },
      {
        type: "editBlocks",
        key: "L1",
        ops: [
          {
            tag: "simple-cta",
            index: 0,
            before:
              '<simple-cta link="https://example.org/start" label="Start"></simple-cta>',
            op: "setAttributes",
            set: { label: "Begin", link: "https://example.org/begin" },
          },
        ],
      },
    ],
  },
  {
    id: "25b-embed-file",
    title: "Save content with an embedded image",
    legs: "api",
    captureFiles: true,
    steps: [
      { type: "uploadFile", fixture: "pink.png", page: "L0" },
      {
        type: "editContent",
        key: "L0",
        content: '<p><img src="files/pink.png" alt="A pink square"></p>',
      },
    ],
  },
  // 6. Files and assets
  {
    id: "39-upload-file",
    title: "Upload a file",
    legs: "api",
    captureFiles: true,
    steps: [{ type: "uploadFile", fixture: "pink.png" }],
  },
  {
    id: "39b-upload-same-name-twice",
    title: "Upload two files with the same name (the second gets a suffix)",
    legs: "api",
    captureFiles: true,
    steps: [
      { type: "uploadFile", fixture: "pink.png", name: "square.png" },
      { type: "uploadFile", fixture: "teal.png", name: "square.png" },
    ],
  },
  {
    id: "40-upload-unicode-filename",
    title: "Upload a file with a Unicode filename",
    legs: "api",
    captureFiles: true,
    // a browser sends the name as raw UTF-8; spaces become dashes on both
    // backends (the canonical rule)
    steps: [
      { type: "uploadFile", fixture: "pink.png", name: "café ñandú.png" },
    ],
  },
  {
    id: "41-replace-file",
    title: "Replace an existing file",
    legs: "api",
    captureFiles: true,
    steps: [
      { type: "uploadFile", fixture: "pink.png" },
      { type: "replaceFile", name: "pink.png", fixture: "teal.png" },
    ],
  },
  {
    id: "41b-rename-file",
    title: "Rename a file",
    legs: "api",
    captureFiles: true,
    steps: [
      { type: "uploadFile", fixture: "pink.png" },
      {
        type: "fileOp",
        name: "pink.png",
        operation: "rename",
        newName: "renamed",
      },
    ],
  },
  {
    id: "41c-duplicate-file",
    title: "Duplicate a file",
    legs: "api",
    captureFiles: true,
    steps: [
      { type: "uploadFile", fixture: "pink.png" },
      { type: "fileOp", name: "pink.png", operation: "duplicate" },
    ],
  },
  {
    id: "42-delete-file",
    title: "Delete a file",
    legs: "api",
    captureFiles: true,
    steps: [
      { type: "uploadFile", fixture: "pink.png" },
      { type: "uploadFile", fixture: "teal.png" },
      { type: "deleteFile", name: "pink.png" },
    ],
  },
  // 7. Deletion and recovery
  {
    id: "45-restore-revision",
    title: "Restore a page to an earlier revision",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Draft", content: "<p>First</p>" },
      { type: "editContent", key: "L1", content: "<p>Second</p>" },
      { type: "restoreRevision", key: "L1", back: 1 },
    ],
  },
  {
    id: "46-archive-site",
    title: "Delete (archive) a site",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Unit", content: "<p>u</p>" },
      { type: "archiveSite" },
    ],
  },
  // 8. Publishing and export
  {
    id: "48-export-zip",
    title: "Export the site as a zip",
    legs: "api",
    steps: [
      { type: "addPage", key: "L1", title: "Unit", content: "<p>u</p>" },
      { type: "downloadSite" },
    ],
  },
  {
    id: "49-clone-site",
    title: "Clone the site",
    legs: "api",
    captureFiles: true,
    steps: [
      { type: "addPage", key: "L1", title: "Unit", content: "<p>u</p>" },
      { type: "uploadFile", fixture: "pink.png", page: "L1" },
      { type: "cloneSite" },
    ],
  },
];

module.exports = { CASES };
