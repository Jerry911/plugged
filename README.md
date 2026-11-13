# Plugged
Draw Belgian (AREI) electrical schemas in the browser: eendraadschema, situatieschema, your own symbols, rule verification and vector PDF export.

Spring Boot 4 backend (Java 21, JPA, file-based H2) with a React 18 + Vite frontend. The built frontend is served by the backend, so a production install is a single jar.

## Quick start
| You want to | Command | Open |
|---|---|---|
| Develop | `cd backend && mvn spring-boot:run`, and in a second terminal `cd frontend && npm i && npm run dev` | http://localhost:5173 (proxies `/api` to the backend) |
| Run as one jar | `cd backend && mvn clean install`, then `PLUGGED_ADMIN_EMAIL=you@example.be java -jar target/plugged-0.1.0.jar` | http://localhost:8080 |
| Run with Docker | `PLUGGED_ADMIN_EMAIL=you@example.be docker compose up --build` | http://localhost:8080 |

On the first start Plugged asks for the details of the administrator account and a **setup key** that it prints in its log (the console; `docker compose logs plugged` in Docker), see [Accounts and signing in](#accounts-and-signing-in).

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
Every project is saved as one JSON document (with its owner and the groups it is shared with) in a file-based H2 database: `backend/data/plugged` when you run from `backend/`, the `plugged-data` volume (`/data`) in Docker. Override the location with `SPRING_DATASOURCE_URL` (e.g. `jdbc:h2:file:/some/dir/plugged`). The symbols are stored in the same database: the standard ones shared by everybody, the own ones per user or group. Use **JSON ↑ / JSON ↓** in the header to export and import a project file.

## Accounts and signing in
Everybody signs in before the editor opens (Spring Security, session cookie, CSRF token in the `XSRF-TOKEN` cookie / `X-XSRF-TOKEN` header).

| Setting | Environment variable | What it does |
|---|---|---|
| `plugged.admin.email` | `PLUGGED_ADMIN_EMAIL` | Email address of the administrator, **required**. It is also the address the contact form of the Info page writes to (it replaces the former `PLUGGED_CONTACT_EMAIL`). |
| `server.servlet.session.timeout` | `PLUGGED_SESSION_TIMEOUT` | How long a session lasts without any request (default `8h`). |
| `plugged.setup.key` | `PLUGGED_SETUP_KEY` | The setup key of the first start. Empty (default): a new random key at every start, printed in the log until the administrator exists. Set it only for automated installations. |
| `plugged.auth.max-failed-logins` / `plugged.auth.lockout` | `PLUGGED_MAX_FAILED_LOGINS` / `PLUGGED_LOCKOUT` | After this many wrong passwords in a row (default `5`) an account is locked for this long (default `15m`). |
| `plugged.auth.ip-max-attempts` / `plugged.auth.ip-window` | `PLUGGED_IP_MAX_ATTEMPTS` / `PLUGGED_IP_WINDOW` | At most this many failed sign-ins, first starts and registrations per network address (default `30`) per window (default `15m`); then 429. |
| `plugged.max-request-size` | `PLUGGED_MAX_REQUEST_SIZE` | Largest request body of the API, e.g. a project (default `5MB`); larger ones get 413. |
| `plugged.max-projects-per-user` | `PLUGGED_MAX_PROJECTS_PER_USER` | How many projects one user may own (default `500`, `0` = no limit). |
| `server.forward-headers-strategy` | `PLUGGED_FORWARD_HEADERS` | `native` (default): behind a reverse proxy that terminates HTTPS (nginx, Traefik, Caddy), its `X-Forwarded-*` headers are trusted from internal addresses, so requests count as HTTPS (Secure cookies, HSTS) and the sign-in limits see the real visitor. Without a proxy nothing changes. `none` turns it off. |
| `server.servlet.session.cookie.secure` | `PLUGGED_SECURE_COOKIES` | `true` forces the Secure flag on the session cookie. Leave `false` (default) for a local setup over plain `http://localhost`. |
| `plugged.content-security-policy` | `PLUGGED_CSP` | The Content-Security-Policy header (default: only the own scripts, styles, images and API; no framing). Empty = no header. |

- **First start**: as long as there is no administrator, the page shows *Welkom bij Plugged* and asks for the **setup key**, the first name, surname and password of the administrator. The setup key is printed in the log of the server at every start (a new one each time) as long as there is no administrator, so only somebody who can read the log of the server can become the administrator, not whoever opens the page first. The email address is the one of `PLUGGED_ADMIN_EMAIL`, shown read-only: it cannot be chosen or changed. The administrator account is approved from the start and is signed in at once. Without `PLUGGED_ADMIN_EMAIL` the page says how to set it and nobody can sign in.
- **Wrong passwords**: after `PLUGGED_MAX_FAILED_LOGINS` wrong passwords in a row an account is locked for `PLUGGED_LOCKOUT`, also for the right password; an address without an account answers the same way, so the answers do not tell which addresses have an account. *Beheer → Gebruikers* shows 🔒 *Vergrendeld* and an *Ontgrendelen* button. A successful sign-in forgets the earlier wrong attempts.
- **Registering**: the sign-in page links to *Registreren* (`/#register`): first name, surname, email address and password (at least 8 characters). A new account is **not approved** and cannot sign in until the administrator approves it.
- **Beheer** (administrators only) is one item in the top bar with two tabs; a badge counts the accounts waiting for approval.
  - *Gebruikers*: *Goedkeuren* approves an account; *Maak beheerder* makes an approved account an administrator, *Maak gewone gebruiker* takes the role away again; *Weigeren* / *Verwijderen* removes an ordinary account. The primary administrator (the account of `PLUGGED_ADMIN_EMAIL`) always stays administrator, nobody takes the role away from himself, and an administrator cannot be removed (make him an ordinary user first). A change of role applies on the next request of that user, without signing in again; a removed account is signed out on its next request and its projects go to the administrator who removed it.
  - *Groepen*: create, rename and remove groups and choose their members (approved accounts). A user can be in several groups. Only administrators manage groups. ☆/★ on a member makes him an **owner** of the group (a teacher), and every group has the switch of its educational mode.
  - *Symbolen*: the standard symbols for the next release (see Components).
- **Educational mode** (per group, off by default): the members of the group who are not its owner (students) cannot validate a schema (no ✖/⚠ counts, no *Controleer* button or panel; on the situatieschema the elements still to place are a plain list without warning, title or counts, and the tab shows no ⚠ count) and cannot import or export a project (JSON or EDS), in *any* of their projects, so they cannot copy the work into a project of their own or into another installation of Plugged. PDF and print stay. Owners and administrators are never restricted; somebody who owns one group but is a student in another group in educational mode is restricted. The owners of a group (who are no administrator) get **🎓 Mijn groepen** in the top bar, where they switch the mode of their groups; administrators switch it under Beheer → Groepen. A student's editor fetches his status again when the window gets the focus and every minute, so a switch reaches students who are working; a student sees 🎓 in the top bar (*Educatieve modus* on mouse-over). The server enforces what it can: a student cannot create a project that already has content (`POST /api/projects` with circuits or anything drawn answers 403), which is what an import or a copy of somebody else's project would be; his editor creates a new project empty and then saves his work in it. A student can still read the projects he may open (the editor needs them), so with the developer tools of his browser he can copy what he sees into a project of his own.
- **Automatic save**: an own project that is already on the server (it has a number) is saved by itself, but sparingly so the database and the connection are not worn out (`hooks/useAutoSave.js`): only when something changed since the last save, 20 s after the last change (`AUTO_SAVE_IDLE`), and while you keep editing at the latest 2 minutes after the first unsaved change (`AUTO_SAVE_MAX_WAIT`); also right away when the tab is hidden or the page closed (a `keepalive` request, for documents under 60 KB). A failed save is tried again after 30 s, 1, 2 and then every 5 minutes, not with every change. The top bar shows *Automatisch opgeslagen om hh:mm*. A new project gets its number from a save by hand first, and a project of somebody else (shared with a group, or opened by the Hoofdbeheerder) is only saved by hand, so two people with the same project open never overwrite each other's work without noticing.
- **Signing out**: *Afmelden* in the top bar (it asks first when the open project has unsaved changes). When a session ends during the work (timeout, restart of the server), the sign-in form opens on top of the editor, so the open project is not lost.
- **Projects and sharing**: every project has an owner, the user who saved it first. A user sees his own projects and the projects shared with one of his groups. The main administrator (the *Hoofdbeheerder*, `PLUGGED_ADMIN_EMAIL`) sees all projects of everyone, shared or not, and can open, save, share and delete them; other administrators manage users, groups and symbols, but for projects they are users like any other (`ProjectService`). In *Project → Laden* the owner (or an administrator) shares a project with groups (the 👥 button) and deletes it; members of those groups can open and save it, but not delete or share it. The list shows under each name whose project it is and who it is shared with. The server gives new projects their number (`POST /api/projects`, a database sequence; a client cannot choose one), so two users never pick the same one; the editor opens with the user's most recently saved project, or a new one. Projects saved before accounts existed belong to the primary administrator.
- **Versions**: every save of a project is a new version. The editor sends the version it loaded with each save (`If-Match`); when somebody else saved the project in between, the save is refused (409) and the top bar says so, instead of overwriting that work. Sharing a project is not a new version. The server only stores documents the editor can open (valid JSON, the expected parts of the expected kind; 400 otherwise).
- **Symbols**: the standard symbols are shared by everybody and changed (edited, deleted, restored, *Maak standaard*) by administrators only; for the others they are read-only in *Componenten*, where *Dupliceer* makes an own copy. An own symbol is personal (*Alleen ik*) or belongs to a group (*Hoort bij*): the members of the group use it, and members who are no students in educational mode change it. A stored project carries a copy of the own symbols it uses (`symbols`), so it still draws for somebody it is shared with who does not have them. The personal symbols of a removed account, and the symbols of a removed group, go to the administrator who removed it; own symbols from before symbols had owners belong to the primary administrator.
- Accounts live in the `users` table (name, surname, email, bcrypt password hash, `admin` default false, `approved`, and as telemetry `last_login` and `login_count`: when the account last signed in and how many times; the first start of the administrator counts as a sign-in). *Beheer → Gebruikers* shows them in the column *Laatst aangemeld*. Email addresses are stored in lower case.

REST API:
- `GET /api/auth/status`, `POST /api/auth/setup {name, surname, password, setupKey} | register | login | logout` (login: 401 wrong address or password, 403 not approved yet, 423 locked; 429 too many attempts from one address)
- projects: `GET /api/projects`, `GET /api/projects/summaries` (`{id, name, updated, owner, groups, mine, canManage}`), `POST /api/projects?name=` (answers `{id, version}`), `GET /api/projects/{id}` (version in the `ETag` header), `PUT /api/projects/{id}` (needs `If-Match: "<version>"`: 428 without it, 409 when it is outdated; answers the new `ETag`), `DELETE /api/projects/{id}`, `PUT /api/projects/{id}/groups {groupIds}`; a project the user may not see answers 404
- symbols: `GET /api/symbols` (each with `group` and `editable`), `GET /api/symbols/groups` (the groups the user can put a symbol in), `PUT /api/symbols/{key}` (`group`: null = personal), see `SymbolController`
- `GET /api/groups`: the groups the user can share with (his own; every group for an administrator); `GET /api/groups/owned`: the groups whose educational mode he may switch (with their members); `PUT /api/groups/{id}/educational {educational}` (an owner of the group or an administrator). `GET /api/auth/status` tells the editor `user.restricted` (a student in educational mode) and `user.ownedGroups`
- administrators: `GET /api/admin/users` (with `lockedUntil`), `POST /api/admin/users/{id}/approve`, `POST /api/admin/users/{id}/unlock`, `PUT /api/admin/users/{id}/admin {admin}`, `DELETE /api/admin/users/{id}`; `GET | POST /api/admin/groups`, `PUT | DELETE /api/admin/groups/{id}`, `PUT | DELETE /api/admin/groups/{id}/members/{userId}`, `PUT | DELETE /api/admin/groups/{id}/owners/{userId}`

Everything under `/api/` needs a signed-in user (401 otherwise), except `/api/auth/**` and `/api/info`.

## Features
- **Eendraadschema**: multi-sheet A4 diagram with a bus, kWh meter, main differential and circuits; palette, properties panel and a collapsible tree (*Opbouw*).
- **Situatieschema**: floor plan with walls, rooms, doors/windows, dimensions and the symbols of the eendraadschema.
- **Components**: the symbol library and a symbol editor.
- **Controleer**: verification against guideline AREI limits.
- **Export**: vector PDF (jsPDF + svg2pdf.js, A4 landscape, all sheets).
- **Undo/redo** (100 steps), **EDS import and export** with the online eendraadschema tool.
- **Languages**: Dutch, French and English (picker in the top bar).

## Eendraadschema layout and editing
- The diagram is drawn like the original tool: a horizontal bus with the kWh meter, main differential and earth below it, and circuits placed from left to right. Each circuit gets the width its elements need; a circuit that is lower than the overhang of the previous circuits slides left underneath it to save width and sheets. When a sheet is full the next circuits continue on the next A4 sheet ("vervolg op blad N"). Printed sheets stay readable: the drawing is never smaller than full size (`MM_PER_UNIT` = 0.17 mm per unit, at which its smallest text, 13 units, is as large as the titles of the footer, 2.2 mm). A circuit with the maximum of 8 points always fits on a sheet at that size, also with a name and a count on every point (a test checks every symbol of the library): the bus lies around the middle of the page while the circuits are low and goes down as points are added, to just above the footer (the head below it stays within `HEAD_DEPTH`, `busPosition`), and the specs, short-circuit rating and cable stand next to each other along the stem from just above the bus. Only a circuit with more points than fit with the bus at its lowest bends: the line goes over the top into a next column, where the points go up again from the bottom and the numbering carries on. A circuit with sub boards (or domotics boxes) in it that is too wide for one sheet is cut into parts on next sheets (`splitWide` in `model/boardLayout.js`): the parts are filled from left to right, a sub board with only plain circuits stays whole on one part, and every part repeats the way down to what it holds (the circuit and its breakers, and the boards it hangs in, each with only the circuits of that part); the connection and main protection are under the bus of every sheet. Sub boards in sub boards are higher than a sheet at full size and drawn smaller, but never below `NESTED_MIN_SCALE` (still readable on paper): a circuit inside a sub board whose points would need more height bends into a next column as well. Only something that does not fit even then (many detail lines under the points) makes its sheet smaller.
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
- The left list holds the components that can be placed; filter it with the search box. The *Nergens geplaatst* panel right of the drawing lists the eendraadschema elements that are not on the plan yet; collapse it with the `>` button above it (in the line of the page buttons, at the right): collapsed it takes no room at all, and the drawing takes its width.
- The marking of a placed symbol (its circuit and number, e.g. A1, F5) is written on the first free spot around the symbol: right (the default), then top-right, bottom-right, left, top-left, bottom-left, above and below. A spot is free when it does not touch a wall, another symbol, a door, a window, a text, the length of a wall or the marking of another symbol, and stays on the drawing area; when no spot is free the one that hides the least wins. It is recalculated on every change, so moving a symbol or placing one next to it moves the marking along (model/labelPlacement.js; the PDF uses the same placement). The marking is written right next to the lines of the symbol (the box around its lines, turned with it), not next to the square the symbol is drawn in, so it stays close to a narrow symbol such as a bell. It grows and shrinks with the size of its symbol (2.6 mm at the standard size 7), but never below 2.2 mm, the size of the titles of the kader, so a print stays readable.
- **Eigenschappen** of the selection (a symbol, text, door or window; a wall; several elements) look the same as on the eendraadschema (`components/PropertiesBox.jsx`): a heading with a close button at the top right, what is selected, the fields, and a row of icon buttons with a hover text: turn 15° either way and 90°, mirror (doors and windows), duplicate and delete.

## Screen sizes
- **Panels as high as the window**: the palette and *Opbouw* of the eendraadschema, the tools and components and the *Nergens geplaatst* list of the situatieschema and the list of Componenten reach exactly to the bottom of the window, whatever its size (`hooks/useFillHeight.js` sets their height from their top to the bottom of the window and follows scrolling and resizing). The part marked `fill-grow` (Opbouw, the component lists) takes the room that is left and scrolls inside; when even that does not fit, the whole panel scrolls.
- **The situatieschema** takes all the width between the panels; collapsing *Nergens geplaatst* gives it that width too. A sheet that is higher than the window scrolls with the page, the panels stay in view.
- **Laptop** (up to 1500 px wide): Afdrukken, Info, Beheer and Afmelden in the top bar show only their icon (their text is the hover text), so the bar keeps one line.
- **Tablet upright and phone** (up to 900 px wide, `NARROW_SCREEN`): the panels stand above the drawing (at most 45% of the screen high, scrolling inside) and *Nergens geplaatst* below it, with words on its toggle; Ongedaan, Opnieuw and Kaderinfo show only their icon too; the *Eigenschappen* of the selection sit along the bottom of the screen, over the drawing, always in reach; dialogs take the width of the screen; the mouse and keyboard help of the situatieschema is hidden. Tapping works like clicking everywhere; dragging from the palette of the eendraadschema needs a mouse, a tap on a symbol adds it as well. The symbol editor (Componenten) can be used with taps, but drawing a selection box needs a mouse.

## Situatieschema drawing
- Drawing and dragging snap to the grid points (grid size selectable bottom right; a blue marker shows the snapped point, with a preview for walls and rooms). Tick **Vrij tekenen** (bottom right, off by default) to draw at any position.
- Zoom with the − / % / + buttons in the top right of the drawing (50%–400%); click the percentage to reset.

## Situatieschema: selecting, dimensions and layout
- **Right click** cancels what you are drawing and switches back to *Selecteer*.
- **Select**: click an element (hit areas are generous) or drag a box on an empty spot to select everything it touches; Shift adds/toggles. A selection moves (drag, arrow keys), rotates (R), duplicates and is deleted (Del or the trash button at the top right of the selection) as one group.
- **Dimensions**: lengths are shown along the walls, computed from the footer scale (`1:50` by default). The **Maten** button (top right of the drawing) shows/hides them; the setting is stored per sheet and also applies to PDF/print. While drawing a wall or room you can type its size and press Enter: `3,5` or `350cm` for a wall, `4x3,5` for a room (metres unless you add `cm`/`mm`); the direction follows the cursor. Selected walls and doors/windows have a length/width field.

## Components (symbol library)
- The **Components** tab has a menu with all components on the left and the selected component on the right: name, category, where it may hang, placeable on the situatieschema, and a 24x24 drawing canvas (line, circle, rectangle, half circle, text) with a **Raster** dropdown (0.5 / 1 / 2 / 4) that sets the grid and the snapping. The connection point of a symbol is the red centre line (y = 12).
- The symbols live in the backend, in the H2 database (tables `symbols`, `symbol_parents`, `symbol_shapes`; REST `/api/symbols`). The standard symbols that ship with the application are the **catalog file** `backend/src/main/resources/catalog/standard-symbols.json` (read by `StandardSymbols.java`). On every start, before the web server answers (`SymbolSeeder`), a new installation gets them, and an existing one replaces its stored standard symbols that nobody edited when their drawing differs from the catalog; edited ones are kept. Standard symbols can be edited and restored ("Standaard herstellen" per symbol, "Alle standaard herstellen" for all of them; they cannot be deleted); own symbols can be duplicated and deleted. The library is shared by all projects; own symbols are also written into the exported project JSON (`custom`).
- **Changing the standard symbols for a release** happens in the application: draw a standard symbol in the Components tab and choose **Maak standaard**, then **Beheer → Symbolen** lists what differs from the running version and downloads the complete catalog (`standard-symbols.json`, one symbol per line, so git shows readable differences). Replace the catalog file with it and build; `StandardSymbolsTest` checks the rules a catalog must follow (valid shapes, known parents, every circuit symbol touches `y = 12`, one arch per socket). Only "Maak standaard" counts: an edit that was not made the standard, a deleted standard symbol and the users' own symbols do not change the catalog. The download cleans up what would break the build: a parent that is a user's own symbol (`custom:…`) is left out, and socket properties a standard misses (an older database without the socket count `n`) come from the running catalog. Whatever still breaks one of the rules is listed in **Beheer → Symbolen** above the download, per symbol, so it can be fixed with "Maak standaard" or "Standaard herstellen" first. API: `GET /api/admin/symbols/catalog` (the file), `GET /api/admin/symbols/catalog/changes` and `GET /api/admin/symbols/catalog/problems`.
- Orientation: the eendraadschema chains the symbols along a horizontal line, so every symbol touches the line `y = 12`. Sockets are drawn rotated: the supply meets the apex of the arch. Shapes can be `line`, `circle`, `rect`, `arc`, `text` and `path` (SVG path data), with a relative line weight `sw`, white fill (`f: 2`) and bold text (`b`). Breakers and the earthing symbol are vertical symbols. A socket can still be drawn vertically (hanging) per element with the "Horizontaal" checkbox. A socket keeps the drawing of the catalog; a waterproof one (h) gets a little `h` above it. Only stacks (Aantal) and hanging sockets are computed, by `socketShapes` in `frontend/src/symbols/symbolShapes.js`, in the style of the double and triple socket of the catalog (`symbols.test.jsx` checks it): when you redraw those, change `socketShapes` too.
- API: `GET /api/symbols`, `GET /api/symbols/template`, `GET|PUT|DELETE /api/symbols/{k}` (400 when invalid, 409 when deleting a standard symbol), `POST /api/symbols/{k}/restore`, `POST /api/symbols/restore`.
- The frontend tests (`src/test/fixtures/standardSymbols.js`) and the fake backend of the browser tests read the same catalog file as their library, so they always test the symbols that ship; there is no copy to keep in step.

## Verification ("Controleer" button)
`frontend/src/rules.jsx` checks the eendraadschema (all sheets) and returns errors / warnings / info; click an issue to jump to the node.
Checks: hierarchy, aansluiting/aarding present, kring under a differentieel, differentieel sensitivity (max 30 mA with stopcontacten), empty bord/diff/kring, kring specs and cable-vs-protection table, max stopcontacten/lichtpunten per kring, appliances on their own kring, switches without lamp, duplicate kring names, incomplete footer, components missing on the situatieschema.
Limits are guideline values in `LIMITS` (rules.jsx): verify them against the current AREI before relying on them.

## Guided tour
- A new visitor gets a short guided tour (`Tour.jsx`, steps in `tourSteps.jsx`, styles in `styles/tour.css`): a dimmed page with the next control highlighted and a card that explains it. The tour walks through the palette, a first *Kring* and its *Eigenschappen*, a stopcontact, then the situatieschema: a first wall (two clicks), a second wall with a typed length (the person has to type about 15 m, which is too long for the default scale 1:50, so the application proposes a scale and the tour has the person choose it and confirm the wall), the *Kaderinfo* where the scale is shown and can be changed, a door, a symbol, the *Nergens geplaatst* panel and the properties of a symbol. Steps that ask the person to do something wait until they did it; "Sla over" skips such a step.
- **First visit**: the browser remembers per user that the tour was seen, in `localStorage` (key `plugged.tour.<user id>`), so a new account that signs in on a browser where somebody else already saw the tour still gets it (`TOUR_VERSION` in `Tour.jsx` decides which version was seen, raise it to show a changed tour to everybody again). Without storage (private mode) the tour is shown once per page load. It starts when the project has been fetched, and only when that project is empty: a new browser that finds real work on the server does not get the tour by itself, so the tour cannot be saved over it.
- **Start it again** with **▶ Rondleiding starten** at the top of the **Info** tab (it asks first when the open project already contains work). The last step offers *Leeg project starten*, because the tour leaves a circuit, walls and a door in the open project.
- **Change the tour**: steps are data in `tourSteps.jsx` (`target`, `place`, `tab`, and `watch` for a step that waits for an action). Targets are `data-tour="..."` attributes in the editor (palette buttons are `pal-<symbol key>`, tools are `tool-<tool>`), so renaming classes or ids does not break the tour.
- Steps that watch the page itself (the typed length, the *Schaal* button, the Kaderinfo dialog) use a `watch` that reads the DOM; `tourSteps.test.jsx` tests those functions, including the values that must not finish a step.
- Tests: `features/tour/Tour.test.jsx` (the component), `features/tour/TourApp.test.jsx` (inside the real editor, every step must point at something that exists) and `e2e/tour.spec.js`. The other tests start as a visitor who has seen the tour (`src/test/setup.js`, `e2e/fixtures.js`).

## Shortcuts and editing
- **Del / Backspace**: delete the selected node (eendraadschema) or wall/symbol (situatieschema); there is also a red "Verwijder (Del)" button above each sheet.
- **Ctrl/Cmd+Z**: undo, **Ctrl/Cmd+Y** or **Ctrl/Cmd+Shift+Z**: redo (also buttons in the header; changes made within 0.5 s, like typing or dragging, form one step).
- **R** (situatieschema): rotate the selection.
- **Project menu** (anywhere in the editor, `App.jsx`): **Alt+S** save, **Alt+N** new project, **Alt+L** open the menu with the list of projects, **Alt+I** import, **Alt+E** export (open or close the dialog); the menu shows the keys next to its items. Alt and not Ctrl, because the browser keeps several Ctrl keys for itself (Ctrl+N a new window, Ctrl+L the address bar). Only Alt alone counts: Ctrl+Alt is AltGr on Windows (AltGr+E = €), and Shift or Cmd leave the key to the browser. On a Mac Option+letter types a special character, so there the physical key (`event.code`) counts, except in a text field, where Option+E is the accent of é. In educational mode Alt+I and Alt+E do nothing.
- **Footer**: click any cell of the footer on a sheet (or the yellow "Kaderinfo" button) to edit it.

## Languages
The application speaks Dutch (`nl`, the language the texts are written in), French (`fr`) and English (`en`, for a browser in any other language).
- **Frontend**: every text is in `frontend/src/i18n/locales/{nl,fr,en}.js`, one nested dictionary per language with exactly the same keys (a unit test checks the keys, lists and `{placeholders}`). Components use `const {t} = useTranslation()` and `t('pages.sheetName', {number: 2})`; plain modules import `t` from `i18n/translate.js`. Longer help texts use `RichText` (`**bold**`, `[[Ctrl]]` for a key, `\n` for a line break, a list = paragraphs). A text missing in French or English falls back on Dutch.
- **Choosing the language**: the stored choice (`localStorage['plugged.language']`), else the first browser language Plugged speaks (`nl-BE` → Dutch, `fr-CH` → French), else English (`DEFAULT_LANGUAGE`). The picker (`#language-select`) changes it at once and sets `<html lang>`.
- **What stays Dutch**: the stored project and symbol data (JSON keys such as `een`, `sit`, `footer.schaal`, symbol keys such as `stopcontact`) and the names of the standard symbols in the database, so existing projects, exports and `.eds` files keep working. The names of standard symbols and categories are translated when they are shown, as long as the user did not rename them. Default labels that the application generates (e.g. "Verdeelbord") are recognised in every language.
- **Backend**: every request carries `Accept-Language` (`api/http.js`). Error answers of the API are RFC 9457 problem details whose `detail` is written in that language (`backend/src/main/resources/i18n/messages*.properties`, `LocalizedStatusException`, `LocalizedExceptionHandler`, `LocaleConfig`); `messageKey` holds the language-independent key. Any other language (or none) gets English.
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
  features/       oneWire (eendraadschema), situation (situatieschema), symbolEditor, verify, footer, info, tour, project (load/export/PDF),
                  auth (first start, sign in, register, AuthGate), admin (Beheer: users, groups, standard symbols)
  styles/
  test/           Vitest tests, mirroring the folders above
backend/src/main/java/com/pleysje/plugged
  PluggedApplication
  controller/     REST controllers (projects, groups, symbols, info, auth, admin users, groups and symbol catalog, legacy components)
  service/        SymbolService (catalog rules), SymbolMapper, SymbolSeeder, ProjectService (who may see and change which project), GroupService
  repository/     Spring Data repositories
  entity/         JPA entities (ProjectDoc, SymbolEntity, ShapeRow, AppUser, UserGroup)
  dto/            API records (SymbolDto, ProjectSummary, InfoDto, UserDto, AuthStatusDto, AuthRequests, GroupDto, AdminRequests, ProjectRow)
  security/       SecurityConfig (who may call what, CSRF, session), UserService (accounts), ActiveUserFilter, CsrfCookieFilter
  catalog/        StandardSymbols (reads the catalog file catalog/standard-symbols.json), CatalogJson (its format), SymbolShapes (shape rules)
  i18n/, config/  localized errors and the locale/message configuration
  logging/        ApiLog
```

## Test conventions
Tests find elements by their **id**, never by the text on a button: texts change with the language. Every interactive element has a stable id, prefixed by the part of the screen it belongs to (`tab-*`, `btn-*`, `eds-*` eendraadschema, `sit-*` situatieschema, `comp-*` symbol editor, `verify-*`, `footer-*`, `tour-*`, `project-*`, `export-*`, `auth-*` sign-in / registration / first start, `admin-*`, `users-*`, `group-*` Beheer). Ids built from data go through `toDomId` (`custom:1` becomes `custom_1`), e.g. `#eds-palette-stopcontact`, `#eds-tree-<node id>`, `#comp-item-<symbol key>`. Where a test does check a text, it compares it with the dictionary (`t('app.saved')` in unit tests, `t()` of `e2e/texts.js` in Playwright), so a rewording of a text never breaks a test. Unit tests run in Dutch (`src/test/setup.js`), the browser tests in a Dutch browser (`locale: 'nl-BE'`); `i18n.test.jsx` and `e2e/i18n.spec.js` cover the switching.

## Build, tests and Docker
- `cd backend && mvn clean install` builds everything: it installs Node 22 locally (into `frontend/node`), runs `npm ci`, builds the React app into the jar, runs the backend tests **and the frontend tests** (`npm test`), then enforces the JaCoCo gate.
  - `-DskipTests` skips backend and frontend tests; `-Dfrontend.skip=true` skips Node, the frontend build and the frontend tests (the jar then has no UI).
- Frontend only: `cd frontend && npm test` (Vitest + React Testing Library, jsdom); `npm run coverage` enforces thresholds (95% lines/statements/functions, 90% branches).
- Backend only: `cd backend && mvn verify` (JUnit 5, Spring Boot Test, MockMvc, @DataJpaTest, JaCoCo with a 90% line gate; report in `target/site/jacoco`).
- **Logging during the tests** is off, so the output stays readable: the backend tests use `src/test/resources/logback-test.xml` (show the logs with `mvn test -Dplugged.test.log=DEBUG`), the application under Playwright gets `logging.threshold.console=OFF` from `frontend/e2e/application-test.properties` (show its log with `E2E_LOG=1`). The repository tests do not print SQL (`@DataJpaTest(showSql = false)`), and Mockito is loaded as a Java agent so the JDK does not warn about it. `logging.threshold.console` also works for the application itself (e.g. `--logging.threshold.console=WARN`).
- **Who did it**: every log line written during a request carries the signed-in user (his email address, `[-]` without one), e.g. `2026-11-04 15:11:18.509 INFO  [http-nio-8080-exec-4] [admin@example.be] c.p.p.c.AuthController : User 1 signed in (sign-in number 1)` (`logging/UserMdcFilter`, `%X{user}` in `logback-spring.xml`). A refused sign-in is logged with the address that was tried.
- Docker: `docker compose up --build`. Run the tests during the image build with `docker build --build-arg RUN_TESTS=true .`. Plain Docker: `docker build -t plugged . && docker run -p 8080:8080 -v plugged-data:/data plugged`. Extra JVM options: `-e JAVA_OPTS="-Xmx512m"`.

## License
GNU Affero General Public License v3.0 (see `LICENSE` and `NOTICE`). Copyright 2026 Pleysier Jeroen.
You may use, modify and redistribute Plugged, including running it as a network service, but every modified version must be released under the same license with its source available to its users, keep the notices, mark changes and credit the original ("Based on Plugged by Pleysier Jeroen"). Note: the AGPL does not prohibit commercial use.
