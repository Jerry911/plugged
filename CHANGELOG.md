# Changelog

All notable changes to Plugged are written here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/): the last number for fixes, the middle one for new features, the first one for big changes.

The version itself is the `<version>` in `backend/pom.xml`. Note every change under *Unreleased* while you work; when you raise the version,
rename *Unreleased* to that version with the date and start a new, empty *Unreleased* above it.

## [Unreleased]

### Changed

- Everything up to date: Java 25 (was 21; the Docker images and the desktop program too), Spring Boot 4.2.0, Node 26 LTS for the build, React 19 and the other frontend packages (Vite, Vitest, Playwright, jsdom, pako 3 ...), and the GitHub Actions of the release workflow. The Docker build installs `libatomic1`, which Node 26 needs on Linux.

### Added

- Situatieschema: copy and paste with Ctrl+C / Ctrl+V (also to another sheet), Ctrl+X and Ctrl+D, and a copy button next to the trash button of the selection.
- Situatieschema: a *Symbolen* slider under the plan sets how big the symbols are drawn (default 150 %, bigger than before); they do not follow the scale.

### Fixed

- Deleting a sheet (or a circuit or element) of the eendraadschema made its symbols disappear from the situatieschema; they now stay as loose symbols with their type and marking (B4), so *Eendraadschema maken* can make them again.
- Eendraadschema maken: several of the same lamp in one point (four spots marked B4) became four elements; now one element with its count (*x4*).
- AI link: the steps now point to Customize › Connectors and Customize › Skills (the current place in Claude), with the Owner step for Team/Enterprise.
- The downloadable skill had a description longer than the 200 characters claude.ai accepts, so uploading it failed.

## [1.0.0] - 2026-11-22

The first release.

### Added

#### Drawing
- **Eendraadschema**: multi-sheet A4 single-line diagram with connection, kWh meter, main differential, boards and circuits; palette with
  drag & drop and a preview, properties panel, a collapsible *Opbouw* tree, circuits packed tightly over continuation sheets.
- **Situatieschema**: floor plans with walls, rooms, doors, windows, dimensions and the symbols of the eendraadschema, with the circuit and
  point next to each symbol; starter templates of a house; a tool rail with keyboard shortcuts; *Eendraadschema maken* from a marked plan.
- **Bedradingsschema**: a free wiring diagram with wires, frames, line styles and the IEC 60617 symbols.
- **Componenten**: a library of AREI (table 2.23) and IEC 60617 symbols (about 495), and a symbol editor for own symbols, shareable with
  groups.
- Room names with their floor area on the plan, and room names as the name of a circuit.
- Recently used symbols above the palette.
- Undo and redo (100 steps).

#### Checking and calculating
- **Controleer**: checks against the AREI (Book 1), each message with its article, grouped, with what is still missing before the
  inspection; rules can be switched off per user.
- **Kabelberekening**: cable length (typed or estimated from the plan), voltage drop, short-circuit current at the end of the cable and the
  maximum length per breaker.
- Measurements for the inspection (earth and insulation resistance) in *Kaderinfo*.

#### Documents
- Vector PDF of all sheets and printing; all sheets as SVG or PNG.
- **Materiaallijst**: the bill of materials, with cable lengths, as Excel or CSV.
- **Offerte**: price lists of the user (shareable with a group) with articles, what each symbol is made of, cover frames per number of
  places and direction, labour, margin and VAT; an offerte of a project as PDF and Excel. On the situatieschema symbols can be mounted
  horizontally or vertically and combined in one cover frame.
- QR code of a project to stick on the circuit board.
- Import and export of `.eds` files of the online eendraadschema tool, and of Plugged's own `.json`.

#### Working together
- Accounts with approval by an administrator, groups, projects shared with groups, an educational mode for teachers and students.
- Versions, history and restore of every project; duplicate; trash; search and sort.
- Who else has a shared project open, and a warning when somebody else saved it in the meantime.
- Own data export and removing one's own account (GDPR).

#### Ways to run
- **Server**: one jar (Spring Boot 4.1.2) or Docker, with an H2 database.
- **Offline and installable (PWA)**: installable as an app; opens without a connection once it was used; saves without a connection are
  kept on the device and sent when the connection is back, without overwriting somebody else's work.
- **Desktop program** for one computer (Windows, macOS, Linux): no server and no account, the data stays on the computer; built by
  `desktop/jpackage.sh` and released by the GitHub workflow when the version in `backend/pom.xml` is raised.
- **AI link**: users connect their own AI assistant (Claude, ChatGPT, Claude Code) through MCP with OAuth or a personal key, so it can
  draw floor plans in their projects; a downloadable skill for the assistant.

#### Other
- Dutch, French and English.
- Three colour themes (Marine, Werkbank, Helder); works on laptops, tablets and phones.
- Info page with how to use, FAQ, contact through the mail program and a donate link.

[Unreleased]: https://github.com/Jerry911/plugged/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Jerry911/plugged/releases/tag/v1.0.0
