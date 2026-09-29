// Fixture element template for the site:element branch tested in
// site-command-more.test.cjs. webcomponentCommandDetected's sibling in
// site.js copies `${process.mainModule.path}/templates/generic/
// sitecomponent.js` — and process.mainModule is the test file itself under
// node --test, so the fixture lives at test/unit/templates/generic/
// sitecomponent.js. ejs.render() is called with the project object, whose
// properties are top-level locals.
// element: <%= name %>
// class: <%= className %>
// author: <%= author %>
// year: <%= year %>
export const ELEMENT = '<%= name %>';
