# End-to-end tests (Playwright)

Tests that drive the application in a real browser, the way a user does: clicking in the lists, drawing with the mouse on the
sheets, dragging symbols from the palette, downloading PDFs. They complement the Vitest unit tests in `src/test`.

## Running

```
npm install
npm run e2e:install     # once: downloads the Chromium that Playwright uses
npm run e2e             # starts the Vite dev server itself and runs everything
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
| `integration-test` | `npm run e2e`: Playwright starts the jar on port 18080 with an in-memory H2 database and runs every spec, plus `api.spec.js` |
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
E2E_REAL_BACKEND=1 npm run e2e                  # PowerShell: $env:E2E_REAL_BACKEND=1; npm run e2e
```

Playwright starts the jar itself on port 18080 (`E2E_PORT`, `E2E_JAR` and `E2E_JAVA` change the port, the jar and the java). The tests delete
all projects and restore the symbol catalog of the server they talk to, so they never use a server that is already running unless you
set `E2E_REUSE_SERVER=1`. Tests that need a broken backend (a failing save, an unreachable symbol service) are skipped.

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
| `api.spec.js` | contract of the REST API (real backend only) |

`fixtures.js` has the fake backend, the dialog handling (`alert`/`confirm`/`prompt`) and the helpers for the drawing sheets;
`data.js` has the project documents the tests start from.
