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

## Shortcuts and editing
- **Del / Backspace**: delete the selected node (eendraadschema) or wall/symbol (situatieschema); there is also a red "Verwijder (Del)" button above each sheet.
- **Ctrl/Cmd+Z**: undo, **Ctrl/Cmd+Y** or **Ctrl/Cmd+Shift+Z**: redo (also buttons in the header; changes made within 0.5 s, like typing or dragging, form one step; 100 steps are kept).
- **Footer**: click any cell of the footer on a sheet (or the yellow "Kaderinfo" button) to edit it.
- **Grid**: dropdown bottom right in the situatieschema; the dots show the snap grid (larger dots every 10 mm).

## License
GNU Affero General Public License v3.0 (see `LICENSE` and `NOTICE`). Copyright 2026 pleysje.
You may use, modify and redistribute Plugged, including running it as a network service, but every modified version must be released under the same license with its source available to its users, keep the notices, mark changes and credit the original ("Based on Plugged by pleysje"). Note: the AGPL does not prohibit commercial use.
