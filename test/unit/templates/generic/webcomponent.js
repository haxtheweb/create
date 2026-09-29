// Fixture for the wc:element branch test in webcomponent-command.test.cjs.
// webcomponentCommandDetected() copies
// `${process.mainModule.path}/templates/generic/webcomponent.js` — and
// process.mainModule is the test file itself under node --test, so the
// fixture lives at test/unit/templates/generic/webcomponent.js to make that
// path resolve. ejs.render() is called with the project object, whose
// properties are top-level locals, so the placeholders below are
// <%= name %> / <%= className %>.
// Scaffolded by the hax wc:element test fixture.
// element: <%= name %>
// class name: <%= className %>
export const PLACEHOLDER = '<%= name %>';
