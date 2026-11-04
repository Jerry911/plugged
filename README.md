# Plugged
Draw Belgian (AREI) electrical schemas in the browser: eendraadschema, situatieschema, your own symbols, rule verification and vector PDF export.

Spring Boot 4 backend (Java 21, JPA, file-based H2) with a React 18 + Vite frontend. The built frontend is served by the backend, so a production install is a single jar.

## Quick start
| You want to | Command | Open |
|---|---|---|
| Develop | `cd backend && mvn spring-boot:run`, and in a second terminal `cd frontend && npm i && npm run dev` | http://localhost:5173 (proxies `/api` to the backend) |
| Run as one jar | `cd backend && mvn clean install`, then `java -jar target/plugged-0.1.0.jar` | http://localhost:8080 |
| Run with Docker | `docker compose up --build` | http://localhost:8080 |

Requirements: JDK 21 and Maven 3.9+. Node is only needed for frontend development (`mvn clean install` downloads Node 22 into `frontend/node` by itself). Docker is optional.

## Changing the port
| What | Default | How to change it |
|---|---|---|
| Backend / jar | 8080 | `PORT=9090` (or `SERVER_PORT=9090`) as environment variable, or `--server.port=9090` on the command line |
| Vite dev server | 5173 | `DEV_PORT=3000` |
| Port the dev server proxies `/api` to | 8080 | `BACKEND_PORT=9090` (must match the backend port) |
| Docker Compose (host side) | 8080 | `PLUGGED_PORT=9090` in the shell or in a `.env` file next to `docker-compose.yml` |

Examples:
```
# jar
PORT=9090 java -jar backend/target/plugged-0.1.0.jar
java -jar backend/target/plugged-0.1.0.jar --server.port=9090

# development: backend on 9090, frontend on 3000
cd backend && mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=9090
cd frontend && DEV_PORT=3000 BACKEND_PORT=9090 npm run dev

# Docker
PLUGGED_PORT=9090 docker compose up --build      # then open http://localhost:9090
docker run -p 9090:8080 -v plugged-data:/data plugged
```
Windows PowerShell: set the variable first, e.g. `$env:PORT=9090; java -jar ...`.

To make a port permanent without environment variables:
- Backend: put `server.port=9090` in `backend/config/application.properties` (Spring Boot reads `./config/application.properties` from the working directory; the folder is git-ignored). It works for `mvn spring-boot:run` from `backend/` and for the jar when started from that folder.
- Frontend dev server: put `DEV_PORT=3000` and `BACKEND_PORT=9090` in `frontend/.env.local` (git-ignored, works on every OS).
- Docker Compose: put `PLUGGED_PORT=9090` in `.env`.
- Docker without Compose: the container listens on `PORT` (8080 by default); either map another host port (`-p 9090:8080`) or change both (`-e PORT=9090 -p 9090:9090`).

## Data
The project is saved as one JSON document (id 1) in a file-based H2 database: `backend/data/plugged` when you run from `backend/`, the `plugged-data` volume (`/data`) in Docker. Override the location with `SPRING_DATASOURCE_URL` (e.g. `jdbc:h2:file:/some/dir/plugged`). The symbol library is stored in the same database and shared by all projects. Use **JSON ↑ / JSON ↓** in the header to export and import a project file.

## Features
- **Eendraadschema**: multi-sheet A4 diagram with a bus, kWh meter, main differential and circuits; palette, properties panel and a collapsible tree (*Opbouw*).
- **Situatieschema**: floor plan with walls, rooms, doors/windows, dimensions and the symbols of the eendraadschema.
- **Components**: the symbol library and a symbol editor.
- **Controleer**: verification against guideline AREI limits.
- **Export**: vector PDF (jsPDF + svg2pdf.js, A4 landscape, all sheets).
- **Undo/redo** (100 steps), **EDS import and export** with the online eendraadschema tool.
- **Languages**: Dutch, French and English (picker in the top bar).

## Eendraadschema layout and editing
- The diagram is drawn like the original tool: a horizontal bus with the kWh meter, main differential and earth below it, and circuits placed from left to right. Each circuit gets the width its elements need; a circuit that is lower than the overhang of the previous circuits slides left underneath it to save width and sheets. When a sheet is full the next circuits continue on the next A4 sheet ("vervolg op blad N").
- New projects start with an aansluiting (kWh meter, 4P 40A 300 mA differential) and a geaard verdeelbord. Choose "Kring (automaat)" in the palette to append a circuit; elements are added to the selected circuit (or to the last one).
- **Palette**: click a symbol to add it, or drag it onto the diagram; a blue preview shows where it will land. Drag & drop never checks whether a symbol "fits": every symbol can be dropped anywhere and you correct a mistake afterwards.
  - Over a symbol of a circuit: before it (left half) or after it (right half).
  - Over a circuit (its free area or stem): a *Kring* comes left or right of it, a differentieel / verdeelbord / teller / hoofdschakelaar in front of it, anything else becomes its last branch.
  - Over the bus, the head or below the bus: a *Kring* becomes the last circuit, a differentieel / verdeelbord in front of the board (on the main line), anything else under the board.
  - Anywhere else above the bus: the nearest circuit counts. Elements that are not drawn themselves (a differentieel) show their place by marking the bus or the circuit in blue.
- **Eigenschappen** (above *Opbouw*, close with the cross) holds the properties of the selected element. The toolbar there inserts an empty element before / after / as a branch of the selection (its Type dropdown only lists what fits there), moves it earlier / later, one level up / down, duplicates, deletes, and rotates a symbol counter-clockwise / clockwise in steps of 15° (full 360°).
- **Opbouw** shows the tree; main levels have an arrow that collapses / expands everything below them.
- **EDS ↓** in the header imports a file: the circuits, elements and owner/address for the footer. The situatieschema in the file is not imported (existing situatieschema pages and walls are kept and their symbols are cleared). Unknown element types become "Vrij element"; the import message lists them. A differential circuit of the file (protection "differentieel" or "differentieelautomaat") that feeds a board is imported as a *Differentieel* (specs such as `4P 40A 30mA type A` in its info) with the board as an *Onderbord* under it, and is drawn as the circuit of that board. A circuit or differentieel directly under another one (e.g. a second breaker in front of a sub board) is drawn as a breaker lying on the line, with its name above and its specs under it. Circuits inside a sub board are drawn exactly like the circuits on the bus (breaker, specs, short-circuit value, plaatsing, in buis, numbers of the elements) and are selected the same way, by clicking anywhere on their stem. A Differentieel may hang under a Differentieel, Kring, Overspanningsbeveiliging or Onderbord.
- **EDS ↑** exports the eendraadschema (all sheets one after the other) and the owner/address as a `.eds` file that the online tool opens. The situatieschema is not exported. A Differentieel that feeds boards is written back as a differential circuit; meter, main switch and the other differentials are part of the Aansluiting in the EDS format; symbols without an EDS equivalent (own components, fridge, buzzer, ...) are written as a free consumer named after the symbol, and the export message lists them.

## Situatieschema: placing symbols
- The left list holds the components that can be placed; filter it with the search box. The *Nergens geplaatst* panel right of the drawing lists the eendraadschema elements that are not on the plan yet; collapse it with the `>` button.

## Situatieschema drawing
- Drawing and dragging snap to the grid points (grid size selectable bottom right; a blue marker shows the snapped point, with a preview for walls and rooms). Tick **Vrij tekenen** (bottom right, off by default) to draw at any position.
- Zoom with the − / % / + buttons in the top right of the drawing (50%–400%); click the percentage to reset.

## Situatieschema: selecting, dimensions and layout
- **Right click** cancels what you are drawing and switches back to *Selecteer*.
- **Select**: click an element (hit areas are generous) or drag a box on an empty spot to select everything it touches; Shift adds/toggles. A selection moves (drag, arrow keys), rotates (R), duplicates and is deleted (Del or the trash button at the top right of the selection) as one group.
- **Dimensions**: lengths are shown along the walls, computed from the footer scale (`1:50` by default). The **Maten** button (top right of the drawing) shows/hides them; the setting is stored per sheet and also applies to PDF/print. While drawing a wall or room you can type its size and press Enter: `3,5` or `350cm` for a wall, `4x3,5` for a room (metres unless you add `cm`/`mm`); the direction follows the cursor. Selected walls and doors/windows have a length/width field.

## Components (symbol library)
- The **Components** tab has a menu with all components on the left and the selected component on the right: name, category, where it may hang, placeable on the situatieschema, and a 24x24 drawing canvas (line, circle, rectangle, half circle, text) with a **Raster** dropdown (0.5 / 1 / 2 / 4) that sets the grid and the snapping. The connection point of a symbol is the red centre line (y = 12).
- The symbols live in the backend. The standard symbols are defined in `backend/.../StandardSymbols.java` and stored in the H2 database (tables `symbols`, `symbol_parents`, `symbol_shapes`; REST `/api/symbols`). They are seeded on first start; when `StandardSymbols.VERSION` goes up, stored standard symbols that were not edited are replaced by the new drawing, edited ones are kept. Standard symbols can be edited and restored ("Standaard herstellen" per symbol, "Alle standaard herstellen" for all of them; they cannot be deleted); own symbols can be duplicated and deleted. The library is shared by all projects; own symbols are also written into the exported project JSON (`custom`).
- Orientation: the eendraadschema chains the symbols along a horizontal line, so every symbol is drawn with its supply entering from the left on `y = 12`. Where the PDF draws a symbol with a vertical supply (sockets) it is drawn rotated: the supply meets the apex of the arch. Most symbols (sockets, switches, lamps, appliances, energy) are drawn like those of the online eendraadschema and generated from its `SVGSymbols.ts` (`UpstreamSymbols.java`, see `tools/upstream-symbols/`); the shapes therefore also include `path` (SVG path data), a relative line weight `sw`, white fill (`f: 2`) and bold text (`b`). Symbols that the eendraadschema does not have keep their own drawing. Breakers and the earthing symbol are vertical symbols. A socket can still be drawn vertically (hanging) per element with the "Horizontaal" checkbox.
- Custom components made with an older version (table `component_doc`, `/api/components`) are copied into the symbols table the first time the app is opened and then removed from the old table.
- API: `GET /api/symbols`, `GET /api/symbols/template`, `GET|PUT|DELETE /api/symbols/{k}` (400 when invalid, 409 when deleting a standard symbol), `POST /api/symbols/{k}/restore`, `POST /api/symbols/restore`.
- The frontend tests use `frontend/src/test/fixtures/standard-symbols.json` as their library. It is generated from the Java catalog (run `StandardSymbolsJson` from the backend tests, working directory `backend`); `StandardSymbolsTest` fails when it is out of date.

## Verification ("Controleer" button)
`frontend/src/rules.jsx` checks the eendraadschema (all sheets) and returns errors / warnings / info; click an issue to jump to the node.
Checks: hierarchy, aansluiting/aarding present, kring under a differentieel, differentieel sensitivity (max 30 mA with stopcontacten), empty bord/diff/kring, kring specs and cable-vs-protection table, max stopcontacten/lichtpunten per kring, appliances on their own kring, switches without lamp, duplicate kring names, incomplete footer, components missing on the situatieschema.
Limits are guideline values in `LIMITS` (rules.jsx): verify them against the current AREI before relying on them.

## Guided tour
- A new visitor gets a short guided tour (`Tour.jsx`, steps in `tourSteps.jsx`, styles in `styles/tour.css`): a dimmed page with the next control highlighted and a card that explains it. The tour walks through the palette, a first *Kring* and its *Eigenschappen*, a stopcontact, then the situatieschema: a first wall (two clicks), a second wall with a typed length (the person has to type about 15 m, which is too long for the default scale 1:50, so the application proposes a scale and the tour has the person choose it and confirm the wall), the *Kaderinfo* where the scale is shown and can be changed, a door, a symbol, the *Nergens geplaatst* panel and the properties of a symbol. Steps that ask the person to do something wait until they did it; "Sla over" skips such a step.
- **First visit**: there are no user accounts, so the browser remembers that the tour was seen in `localStorage` (key `plugged.tour`; `TOUR_VERSION` in `Tour.jsx` decides which version was seen, raise it to show a changed tour to everybody again). Without storage (private mode) the tour is shown once per page load. It starts when the project has been fetched, and only when that project is empty: a new browser that finds real work on the server does not get the tour by itself, so the tour cannot be saved over it.
- **Start it again** with **▶ Rondleiding starten** at the top of the **Info** tab (it asks first when the open project already contains work). The last step offers *Leeg project starten*, because the tour leaves a circuit, walls and a door in the open project.
- **Change the tour**: steps are data in `tourSteps.jsx` (`target`, `place`, `tab`, and `watch` for a step that waits for an action). Targets are `data-tour="..."` attributes in the editor (palette buttons are `pal-<symbol key>`, tools are `tool-<tool>`), so renaming classes or ids does not break the tour.
- Steps that watch the page itself (the typed length, the *Schaal* button, the Kaderinfo dialog) use a `watch` that reads the DOM; `tourSteps.test.jsx` tests those functions, including the values that must not finish a step.
- Tests: `features/tour/Tour.test.jsx` (the component), `features/tour/TourApp.test.jsx` (inside the real editor, every step must point at something that exists) and `e2e/tour.spec.js`. The other tests start as a visitor who has seen the tour (`src/test/setup.js`, `e2e/fixtures.js`).

## Shortcuts and editing
- **Del / Backspace**: delete the selected node (eendraadschema) or wall/symbol (situatieschema); there is also a red "Verwijder (Del)" button above each sheet.
- **Ctrl/Cmd+Z**: undo, **Ctrl/Cmd+Y** or **Ctrl/Cmd+Shift+Z**: redo (also buttons in the header; changes made within 0.5 s, like typing or dragging, form one step).
- **R** (situatieschema): rotate the selection.
- **Footer**: click any cell of the footer on a sheet (or the yellow "Kaderinfo" button) to edit it.

## Languages
The application speaks Dutch (`nl`, the default), French (`fr`) and English (`en`).
- **Frontend**: every text is in `frontend/src/i18n/locales/{nl,fr,en}.js`, one nested dictionary per language with exactly the same keys (a unit test checks the keys, lists and `{placeholders}`). Components use `const {t} = useTranslation()` and `t('pages.sheetName', {number: 2})`; plain modules import `t` from `i18n/translate.js`. Longer help texts use `RichText` (`**bold**`, `[[Ctrl]]` for a key, `\n` for a line break, a list = paragraphs). A text missing in French or English falls back on Dutch.
- **Choosing the language**: the stored choice (`localStorage['plugged.language']`), else the first browser language Plugged speaks, else Dutch. The picker (`#language-select`) changes it at once and sets `<html lang>`.
- **What stays Dutch**: the stored project and symbol data (JSON keys such as `een`, `sit`, `footer.schaal`, symbol keys such as `stopcontact`) and the names of the standard symbols in the database, so existing projects, exports and `.eds` files keep working. The names of standard symbols and categories are translated when they are shown, as long as the user did not rename them. Default labels that the application generates (e.g. "Verdeelbord") are recognised in every language.
- **Backend**: every request carries `Accept-Language` (`api/http.js`). Error answers of the API are RFC 9457 problem details whose `detail` is written in that language (`backend/src/main/resources/i18n/messages*.properties`, `LocalizedStatusException`, `LocalizedExceptionHandler`, `LocaleConfig`); `messageKey` holds the language-independent key. Any other language gets Dutch.
- **Adding a language**: copy `locales/en.js`, translate it, register it in `LANGUAGES`/`DICTIONARIES` of `i18n/translate.js`, add a `messages_xx.properties` and the locale to `LocaleConfig.SUPPORTED`.

## Project structure
```
frontend/src
  app/            App (top bar, tabs, saving), PageBar, projectDocument (new/normalize a project)
  api/            http (fetch with Accept-Language), projectApi, useSymbolLibrary
  hooks/          useHistory (undo/redo)
  i18n/           translate, I18nProvider/useTranslation, RichText, LanguageSelect, locales/
  model/          pure logic: tree, project, boardLayout, insertion, geometry, rules (AREI checks), eds (import/export)
  symbols/        symbol shapes, library helpers, SymbolGraphic
  components/     shared UI: Sheet, ZoomPane, ZoomControls, domId
  features/       oneWire (eendraadschema), situation (situatieschema), symbolEditor, verify, footer, info, tour, project (load/export/PDF)
  styles/
  test/           Vitest tests, mirroring the folders above
backend/src/main/java/com/pleysje/plugged
  PluggedApplication
  controller/     REST controllers (projects, symbols, info, legacy components)
  service/        SymbolService (catalog rules), SymbolMapper, SymbolSeeder
  repository/     Spring Data repositories
  entity/         JPA entities (ProjectDoc, SymbolEntity, ShapeRow, ComponentDoc)
  dto/            API records (SymbolDto, ProjectSummary, InfoDto)
  catalog/        the standard symbols and their drawing primitives
  i18n/, config/  localized errors and the locale/message configuration
  logging/        ApiLog
```

## Test conventions
Tests find elements by their **id**, never by the text on a button: texts change with the language. Every interactive element has a stable id, prefixed by the part of the screen it belongs to (`tab-*`, `btn-*`, `eds-*` eendraadschema, `sit-*` situatieschema, `comp-*` symbol editor, `verify-*`, `footer-*`, `tour-*`, `project-*`, `export-*`). Ids built from data go through `toDomId` (`custom:1` becomes `custom_1`), e.g. `#eds-palette-stopcontact`, `#eds-tree-<node id>`, `#comp-item-<symbol key>`. Where a test does check a text, it compares it with the dictionary (`t('app.saved')` in unit tests, `t()` of `e2e/texts.js` in Playwright), so a rewording of a text never breaks a test. Unit tests run in Dutch (`src/test/setup.js`), the browser tests in a Dutch browser (`locale: 'nl-BE'`); `i18n.test.jsx` and `e2e/i18n.spec.js` cover the switching.

## Build, tests and Docker
- `cd backend && mvn clean install` builds everything: it installs Node 22 locally (into `frontend/node`), runs `npm ci`, builds the React app into the jar, runs the backend tests **and the frontend tests** (`npm test`), then enforces the JaCoCo gate.
  - `-DskipTests` skips backend and frontend tests; `-Dfrontend.skip=true` skips Node, the frontend build and the frontend tests (the jar then has no UI).
- Frontend only: `cd frontend && npm test` (Vitest + React Testing Library, jsdom); `npm run coverage` enforces thresholds (95% lines/statements/functions, 90% branches).
- Backend only: `cd backend && mvn verify` (JUnit 5, Spring Boot Test, MockMvc, @DataJpaTest, JaCoCo with a 90% line gate; report in `target/site/jacoco`).
- Docker: `docker compose up --build`. Run the tests during the image build with `docker build --build-arg RUN_TESTS=true .`. Plain Docker: `docker build -t plugged . && docker run -p 8080:8080 -v plugged-data:/data plugged`. Extra JVM options: `-e JAVA_OPTS="-Xmx512m"`.

## License
GNU Affero General Public License v3.0 (see `LICENSE` and `NOTICE`). Copyright 2026 Pleysier Jeroen.
You may use, modify and redistribute Plugged, including running it as a network service, but every modified version must be released under the same license with its source available to its users, keep the notices, mark changes and credit the original ("Based on Plugged by Pleysier Jeroen"). Note: the AGPL does not prohibit commercial use.
