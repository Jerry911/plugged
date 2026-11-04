# End-to-end tests (Playwright)

Tests that drive the application in a real browser, the way a user does: clicking in the lists, drawing with the mouse on the
sheets, dragging symbols from the palette, downloading PDFs. They complement the Vitest unit tests in `src/test`.

## Running

```
npm install
npm run e2e:install     # once: downloads the Chromium that Playwright uses
npm run e2e             # starts the Vite dev server itself and runs everything against an in-memory fake of the REST API
npm run e2e:all         # starts the real Spring Boot jar (profile "test") and runs ALL specs against it, api.spec.js included
npm run e2e:ui          # the same in Playwright's interactive UI
npx playwright test verify            # only e2e/verify.spec.js
npx playwright show-report            # the HTML report of the last run
```

### In the Maven build

`mvn clean install` runs them last, against the packaged application:

| phase | what runs |
| --- | --- |
| `test` | backend tests (surefire) and the frontend unit tests (`npm test`) |
| `package` | the jar, with the built frontend inside |
| `pre-integration-test` | `npm run e2e:install` (downloads Chromium once; a no-op when it is already there) |
| `integration-test` | `npm run e2e` with `E2E_REAL_BACKEND=1`: Playwright starts the jar on port 18080 with the `test` profile and runs every spec, plus `api.spec.js` |
| `verify` / `install` | JaCoCo check, install |

A failing end-to-end test fails the build, so a broken jar is not installed. Reports end up in `frontend/playwright-report`
(and screenshots/traces of failures in `frontend/test-results`).

* `-DskipTests` skips backend, frontend and end-to-end tests; `-Dfrontend.e2e.skip=true` skips only the end-to-end tests;
  `-Dfrontend.skip=true` skips everything of the frontend. `mvn test` stops before the end-to-end tests (there is no jar yet).
* Another port: `-De2e.port=19090`.
* On a Linux build server Chromium needs a few system libraries: run `npx playwright install-deps chromium` once (needs root).

### Against the real backend by hand

```
cd ../backend && mvn -DskipTests package       # builds target/plugged-0.1.0.jar with the frontend inside
cd ../frontend
npm run e2e:all                                 # works the same in every shell
```
(`E2E_REAL_BACKEND=1 npm run e2e` does the same; PowerShell: `$env:E2E_REAL_BACKEND=1; npm run e2e`.)

Playwright starts the jar itself on port 18080 (`E2E_PORT`, `E2E_JAR` and `E2E_JAVA` change the port, the jar and the java), with
`--spring.profiles.active=test --spring.config.additional-location=optional:file:./e2e/`. That loads **`e2e/application-test.properties`**, which
overrides the settings inside the jar: an in-memory H2 database and a fixed PayPal link and contact address for the Info page (the tests read
the same file to know what to expect). Add settings there when a test needs the application configured in a certain way.

The tests delete all projects and restore the symbol catalog of the server they talk to, so they never use a server that is already running
unless you set `E2E_REUSE_SERVER=1`.

### Nothing is skipped (apart from `api.spec.js` and `auth.spec.js` in the fake mode)

Every test runs in both modes. A backend that breaks on purpose (`backend.failSave`, `backend.symbolsDown`, `backend.gate`, `backend.info`) is
simulated in the real mode by answering those requests of the page in the browser (`page.route`, see `RealBackend` in `fixtures.js`), while the
requests of the tests themselves still reach the application. The one test that changes the standard of a symbol ("Maak standaard") puts the
original back afterwards (`backend.resetStandard`), because the application keeps that choice in a hidden row until it stops.

The editor needs a signed-in user. The fake answers `/api/auth/status` with a signed-in user (`FAKE_USER`). Against the real application the
`request` fixture signs in as the administrator (`ADMIN`, the address of `plugged.admin.email` in `application-test.properties`; the first test
of a run creates it, like the first start of a real installation), sends the CSRF token with every change, and the browser of each test gets the
same session cookies.

## Files

| file | covers |
| --- | --- |
| `project.spec.js` | start, load, save, project numbers, old format migration, undo/redo, JSON import/export, backend failures |
| `pages.spec.js` | add, rename, copy, move, delete of sheets (eendraadschema) and plattegronden (situatieschema) |
| `footer.spec.js` | the kader and the Kaderinfo dialog |
| `eendraad.spec.js` | palette, hierarchy rules, properties, ordering, rotating, inserting, drag and drop, folding, zoom |
| `verify.spec.js` | "Controleer" panel, jumping to elements (including the centring below the sticky popup) |
| `situatie.spec.js` | walls, rooms, typed lengths, doors, windows, symbols, text, selection, hiding, waterproof, zoom, snapping |
| `components.spec.js` | the symbol editor, and a new component used in both schemas |
| `import-export.spec.js` | PDF, printing, `.eds` import |
| `info.spec.js` | the Info tab (FAQ, donate button, contact form that opens the mail program) and the Importeren / Exporteren buttons |
| `tour.spec.js` | the guided tour, step by step, and its cards in small windows |
| `i18n.spec.js` | switching between Dutch, French and English, the language of the browser, `Accept-Language` on the requests |
| `api.spec.js` | contract of the REST API (real backend only) |
| `auth.spec.js` | registering, approval by the administrator, signing in and out, 401 without a session, CSRF, groups and sharing a project (real backend only) |

`mode.js` decides between the fake and the real backend and reads `application-test.properties`; `fixtures.js` has the fake and the real backend, the dialog handling (`alert`/`confirm`/`prompt`) and the helpers for the drawing sheets;
`data.js` has the project documents the tests start from; `texts.js` gives the texts of the application (`t('app.saved')`).

The tests find elements by id (`page.locator('#eds-delete')`, `app.paletteButton('stopcontact')`, `app.treeRowById('K1')`), not by their text; a text is only checked against the dictionary with `t()`. See "Test conventions" in the main README.
