# desktop-testing

Test-only helpers shared by the desktop app and its feature libraries.

- `createDesktopFixture()` builds the compact two-context model every renderer
  test renders against, so a fixture cannot drift between projects.
- `vitest.setup.ts` installs the jsdom polyfills (`ResizeObserver`, pointer
  capture) and the Testing Library cleanup each React test project needs.

Nothing here ships in the app; it exists so the feature libraries can test
without depending on the application project.
