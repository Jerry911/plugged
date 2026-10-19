# Plugged
Draw Belgian (AREI) electrical schemas: eendraadschema, situatieschema, custom symbols, verification and PDF export.
Dev: `cd backend && mvn spring-boot:run` (port 8080) and `cd frontend && npm i && npm run dev` (port 5173, proxies /api).
Prod: `npm run build` in frontend (outputs into backend static), then `mvn package` and run the jar.
Project is saved as one JSON doc (id 1) in a file-based H2 DB under backend/data.
Multi-page diagrams, drag/edit on the plan, PDF export (jsPDF + svg2pdf.js, vector, A4 landscape, all sheets). Built-in symbols are simplified: refine in frontend/src/symbols.jsx.

## Tests
- Frontend: `cd frontend && npm test` (Vitest + React Testing Library, jsdom); `npm run coverage` enforces thresholds (95% lines/functions, 90% branches). Currently ~100% lines.
- Backend: `cd backend && mvn verify` (JUnit 5, Spring Boot Test, MockMvc, @DataJpaTest, JaCoCo with a 90% line gate; report in `target/site/jacoco`).

## Verification ("Controleer" button)
`frontend/src/rules.js` checks the eendraadschema (all sheets) and returns errors / warnings / info; click an issue to jump to the node.
Checks: hierarchy, aansluiting/aarding present, kring under a differentieel, differentieel sensitivity (max 30 mA with stopcontacten), empty bord/diff/kring, kring specs and cable-vs-protection table, max stopcontacten/lichtpunten per kring, appliances on their own kring, switches without lamp, duplicate kring names, incomplete footer, components missing on the situatieschema.
Limits are guideline values in `LIMITS` (rules.js): verify them against the current AREI before relying on them.

## Eendraadschema layout and EDS import
- The eendraadschema is drawn like the original tool: a horizontal bus with the kWh meter, main differential and earth below it, and circuits placed from left to right (each circuit gets as much width as its elements need). When a sheet is full the next circuits continue on the next A4 sheet ("vervolg op blad N").
- New projects start with an aansluiting (kWh meter, 4P 40A 300 mA differential) and a geaard verdeelbord. Choose "Kring (automaat)" in the palette to append a circuit; elements are added to the selected circuit (or to the last one).
- **EDS ↑** in the header imports a file exported from https://eendraadschema.goethals-jacobs.be/ (circuits, elements, owner/address for the footer and the symbols on the situatieschema). Unknown element types become "Vrij element"; the import message lists them.

## Build, tests and Docker
- `cd backend && mvn clean install` builds everything: it installs Node 22 locally (into `frontend/node`), runs `npm ci`, builds the React app into the jar, runs the backend tests **and the frontend tests** (`npm test`), then enforces the JaCoCo gate.
  - `-DskipTests` skips backend and frontend tests; `-Dfrontend.skip=true` skips Node, the frontend build and the frontend tests (the jar then has no UI).
- Docker: `docker compose up --build` and open http://localhost:8080. The H2 database lives in the `plugged-data` volume (`/data`), so projects survive restarts. Run the tests during the image build with `docker build --build-arg RUN_TESTS=true .`
- Plain Docker: `docker build -t plugged . && docker run -p 8080:8080 -v plugged-data:/data plugged`. Extra JVM options: `-e JAVA_OPTS="-Xmx512m"`.

## Situatieschema drawing
- Drawing and dragging snap to the grid points (grid size selectable bottom right; a blue marker shows the snapped point, with a preview for walls and rooms). Tick **Vrij tekenen** (bottom right, off by default) to draw at any position.
- Zoom with the − / % / + buttons in the top right of the drawing (50%–400%); click the percentage to reset.

## Shortcuts and editing
- **Del / Backspace**: delete the selected node (eendraadschema) or wall/symbol (situatieschema); there is also a red "Verwijder (Del)" button above each sheet.
- **Ctrl/Cmd+Z**: undo, **Ctrl/Cmd+Y** or **Ctrl/Cmd+Shift+Z**: redo (also buttons in the header; changes made within 0.5 s, like typing or dragging, form one step; 100 steps are kept).
- **Footer**: click any cell of the footer on a sheet (or the yellow "Kaderinfo" button) to edit it.
- **Grid**: dropdown bottom right in the situatieschema; the dots show the snap grid (larger dots every 10 mm).

## License
GNU Affero General Public License v3.0 (see `LICENSE` and `NOTICE`). Copyright 2026 Pleysier Jeroen.
You may use, modify and redistribute Plugged, including running it as a network service, but every modified version must be released under the same license with its source available to its users, keep the notices, mark changes and credit the original ("Based on Plugged by Pleysier Jeroen"). Note: the AGPL does not prohibit commercial use.
