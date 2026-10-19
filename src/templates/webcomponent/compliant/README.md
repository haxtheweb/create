# <%= name %>

Web component built with Lit and the DDD design system.

## Commands

- `npm start` - development server
- `npm run build` - build and analyze
- `npm run test` - run tests
- `npm run release` - build, version bump, and publish

## Running tests

Tests run in headless Chrome through web-test-runner. If `npm test` stops with "The CHROME_PATH environment variable must be set", either install Google Chrome or point `CHROME_PATH` at a Chromium binary, for example one installed with `npx playwright install chromium`.

The a11y test runs twice: once as-is and once with `color-scheme: dark` on the document, so a contrast failure that only shows up in dark mode fails the test.

### Running tests as root (containers, CI)

Chrome refuses to start as root unless it runs with `--no-sandbox`, which is the default user in most containers. Add a `web-test-runner.config.mjs` next to `package.json` (web-test-runner picks it up automatically, so `npm test` keeps working) and set `CHROME_PATH` to a Chrome or Chromium binary:

```js
import { chromeLauncher } from '@web/test-runner-chrome';

export default {
  nodeResolve: true,
  browsers: [
    chromeLauncher({
      launchOptions: {
        executablePath: process.env.CHROME_PATH,
        args: ['--no-sandbox'],
      },
    }),
  ],
};
```

Only use `--no-sandbox` in disposable environments; keep the sandbox on for everyday development.

## Working with the component

- Edit `./<%= name %>.js` for the component source
- Edit `./index.html` for the demo page
- Add dependencies via `npm install --save @whatever/repo`
- Place additional `.js` files under `/lib/`
- Update `/lib/<%= name %>.haxProperties.json` for HAX wiring
- See `/locales/` for i18n translation files

# Credits

A brighter future dreamed and developed by the Penn State [HAXTheWeb](https://hax.psu.edu/) initiative.
