// Fixture theme template for the customSiteTheme flow tested in
// site-process.test.cjs. customSiteTheme() copies
// `${process.mainModule.path}/templates/sitetheme/base-theme.js` — and
// process.mainModule is the test file itself under node --test, so the
// fixture lives at test/unit/templates/sitetheme/base-theme.js. ejs.render()
// is called with the project object, whose properties are top-level locals.
// theme: <%= customThemeName %>
// class: <%= className %>
// author: <%= author %>
// year: <%= year %>
export const THEME = '<%= customThemeName %>';
