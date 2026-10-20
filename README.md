# Plugged
Draw Belgian (AREI) electrical schemas: eendraadschema, situatieschema, custom symbols, verification and PDF export.
Dev: `cd backend && mvn spring-boot:run` (port 8080) and `cd frontend && npm i && npm run dev` (port 5173, proxies /api).
Prod: `npm run build` in frontend (outputs into backend static), then `mvn package` and run the jar.
Project is saved as one JSON doc (id 1) in a file-based H2 DB under backend/data.
Multi-page diagrams, drag/edit on the plan, PDF export (jsPDF + svg2pdf.js, vector, A4 landscape, all sheets). Built-in symbols are simplified: refine in frontend/src/symbols.jsx.

## Componenten (symbol library)
- The **Componenten** tab has a menu with all components on the left and the selected component on the right: name, category, where it may hang, placeable on the situatieschema, and a 24x24 drawing canvas (line, circle, rectangle, half circle, text) with a **Raster** dropdown (0.5 / 1 / 2 / 4) that sets the grid and the snapping. The connection point of a symbol is the red centre line (y = 12).
- All standard components (defined in `frontend/src/symbols.jsx`) are stored in the H2 database (table `component_doc`, REST `/api/components`) and seeded on first start; defaults added in a later version are added automatically. Standard components can be edited and restored ("Standaard herstellen"); own components can be duplicated and deleted. The library is shared by all projects; own components are also written into the exported project JSON (`custom`).

## Tests
- Frontend: `cd frontend && npm test` (Vitest + React Testing Library, jsdom); `npm run coverage` enforces thresholds (95% lines/functions, 90% branches). Currently ~100% lines.
- Backend: `cd backend && mvn verify` (JUnit 5, Spring Boot Test, MockMvc, @DataJpaTest, JaCoCo with a 90% line gate; report in `target/site/jacoco`).

## Verification ("Controleer" button)
`frontend/src/rules.js` checks the eendraadschema (all sheets) and returns errors / warnings / info; click an issue to jump to the node.
Checks: hierarchy, aansluiting/aarding present, kring under a differentieel, differentieel sensitivity (max 30 mA with stopcontacten), empty bord/diff/kring, kring specs and cable-vs-protection table, max stopcontacten/lichtpunten per kring, appliances on their own kring, switches without lamp, duplicate kring names, incomplete footer, components missing on the situatieschema.
Limits are guideline values in `LIMITS` (rules.js): verify them against the current AREI before relying on them.

## Eendraadschema layout and EDS import
- The eendraadschema is drawn like the original tool: a horizontal bus with the kWh meter, main differential and earth below it, and circuits placed from left to right (each circuit gets as much width as its elements need; a circuit that is lower than the overhang of the previous circuits slides left underneath it to save width and sheets). When a sheet is full the next circuits continue on the next A4 sheet ("vervolg op blad N").
- New projects start with an aansluiting (kWh meter, 4P 40A 300 mA differential) and a geaard verdeelbord. Choose "Kring (automaat)" in the palette to append a circuit; elements are added to the selected circuit (or to the last one).
- **EDS ↑** in the header imports a file exported from https://eendraadschema.goethals-jacobs.be/ (circuits, elements and owner/address for the footer; the situatieschema in the file is not imported, existing situatieschema pages and walls are kept and their symbols are cleared). Unknown element types become "Vrij element"; the import message lists them.

## Build, tests and Docker
- `cd backend && mvn clean install` builds everything: it installs Node 22 locally (into `frontend/node`), runs `npm ci`, builds the React app into the jar, runs the backend tests **and the frontend tests** (`npm test`), then enforces the JaCoCo gate.
  - `-DskipTests` skips backend and frontend tests; `-Dfrontend.skip=true` skips Node, the frontend build and the frontend tests (the jar then has no UI).
- Docker: `docker compose up --build` and open http://localhost:8080. The H2 database lives in the `plugged-data` volume (`/data`), so projects survive restarts. Run the tests during the image build with `docker build --build-arg RUN_TESTS=true .`
- Plain Docker: `docker build -t plugged . && docker run -p 8080:8080 -v plugged-data:/data plugged`. Extra JVM options: `-e JAVA_OPTS="-Xmx512m"`.

## Situatieschema drawing
- Drawing and dragging snap to the grid points (grid size selectable bottom right; a blue marker shows the snapped point, with a preview for walls and rooms). Tick **Vrij tekenen** (bottom right, off by default) to draw at any position.
- Zoom with the − / % / + buttons in the top right of the drawing (50%–400%); click the percentage to reset.

## Situatieschema: selecting, dimensions and layout
- **Right click** cancels what you are drawing and switches back to *Selecteer*.
- **Select**: click an element (hit areas are generous) or drag a box on an empty spot to select everything it touches; Shift adds/toggles. A selection moves (drag, arrow keys), rotates (R), duplicates and is deleted (Del or the trash button at the top right of the selection) as one group.
- **Dimensions**: lengths are shown along the walls, computed from the footer scale (`1:50` by default). The **Maten** button (top right of the drawing) shows/hides them; the setting is stored per sheet and also applies to PDF/print. While drawing a wall or room you can type its size and press Enter: `3,5` or `350cm` for a wall, `4x3,5` for a room (metres unless you add `cm`/`mm`); the direction follows the cursor. Selected walls and doors/windows have a length/width field.
- The **Nergens geplaatst** list lives in a panel right of the drawing; collapse it with the `>` button and the drawing takes the extra width.

## Shortcuts and editing
- **Del / Backspace**: delete the selected node (eendraadschema) or wall/symbol (situatieschema); there is also a red "Verwijder (Del)" button above each sheet.
- **Ctrl/Cmd+Z**: undo, **Ctrl/Cmd+Y** or **Ctrl/Cmd+Shift+Z**: redo (also buttons in the header; changes made within 0.5 s, like typing or dragging, form one step; 100 steps are kept).
- **Footer**: click any cell of the footer on a sheet (or the yellow "Kaderinfo" button) to edit it.
- **Grid**: dropdown bottom right in the situatieschema; the dots show the snap grid (larger dots every 10 mm).

## License
GNU Affero General Public License v3.0 (see `LICENSE` and `NOTICE`). Copyright 2026 Pleysier Jeroen.
You may use, modify and redistribute Plugged, including running it as a network service, but every modified version must be released under the same license with its source available to its users, keep the notices, mark changes and credit the original ("Based on Plugged by Pleysier Jeroen"). Note: the AGPL does not prohibit commercial use.