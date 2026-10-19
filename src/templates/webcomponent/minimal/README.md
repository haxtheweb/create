# <%= name %>

Minimal web component built with Lit.

## Commands

- `npm start` - development server
- `npm run build` - analyze custom elements
- `npm run test` - run tests

## Running tests

Tests run in headless Chrome through web-test-runner. If `npm test` stops with "The CHROME_PATH environment variable must be set", either install Google Chrome or point `CHROME_PATH` at a Chromium binary, for example one installed with `npx playwright install chromium`.

The a11y test runs twice: once as-is and once with `color-scheme: dark` on the document, so a contrast failure that only shows up in dark mode fails the test.

# Credits

A brighter future dreamed and developed by the Penn State [HAXTheWeb](https://hax.psu.edu/) initiative.
