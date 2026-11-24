# Drawing in Plugged

Plugged makes the documents of a Belgian household installation after the AREI (Book 1):
- the **situatieschema**: the floor plan, one page per floor, with the electrical points as symbols;
- the **eendraadschema**: the single-line diagram (connection, kWh meter, differentials, circuits A, B, C, ... with their points);
- the **bedradingsschema** (not needed for the inspection).

You draw the situatieschema with `draw_floor_plan`. The user then makes the eendraadschema from it in Plugged with one click
(*Eendraadschema maken*), which reads the **marks** of your symbols. Plugged's *Controleer* then checks the result against the AREI.

## 1. Read the plan

- Find the scale: dimension lines (cotes), a scale bar, or known sizes (an interior door is 0.8-0.9 m, a front door about 1 m).
  Work in **metres**. If you cannot measure reliably, ask the user for one or two real dimensions.
- One `floor` per storey (ground floor, first floor, basement, ...), all in the same coordinate system so they line up:
  x to the right, y down, from the top left corner of the building.
- Rooms: rectangles `{name, x, y, w, h}`. Draw an L-shaped room as two rectangles, or with `walls` plus a `texts` label with
  `area: true`. Rooms that touch share their wall automatically.
- Doors and windows: their centre on a wall, `rotation` 0 for a horizontal wall and 90 for a vertical one, `width` in metres.
  An opening without a door (stairs, open kitchen) is a `passage`.
- Room names in the language of the user (e.g. *Living*, *Keuken*, *Badkamer*, *Slaapkamer 1*, *Hal*, *WC*, *Berging*).

## 2. Place the electrical points

Use `list_symbols` (where: `plan`) for the keys. The usual ones:

| what | key |
|---|---|
| socket outlet with earth and child protection (the normal one today) | `stopcontact_pekid` |
| double / triple socket outlet | `stopcontact2`, `stopcontact3` |
| light point (ceiling), wall light, spot | `lichtpunt`, `wandlamp`, `spot` |
| switch, two-way switch, double two-way, intermediate (cross) | `schakelaar`, `wissel`, `wissel2`, `kruis` |
| push button, motion detector, dimmer | `drukknop`, `beweging`, `dimmer` |
| cooking plate, oven, washing machine, dryer, dishwasher | `kookplaat`, `oven`, `wasmachine`, `droogkast`, `vaatwas` |
| boiler, fridge, freezer, heating, air conditioning, ventilation | `boiler`, `koelkast`, `diepvries`, `verwarming`, `airco`, `ventilatie` |
| charging station, solar panels, inverter | `laadpaal`, `zonnepanelen`, `omvormer` |
| distribution board, kWh meter | `bord`, `teller` |
| smoke detector, data, TV | `rookmelder`, `data`, `tv` |

Place a symbol where the point is (a socket against its wall, a light point in the middle of the room or where the plan shows it).

## 3. Mark every point with its circuit

The mark is the circuit letter(s) and the number of the point: `A1`, `A2`, ..., `B1`, ... (AREI 3.1.2.1: circuits are capital letters).
- **Everything with the same mark is one point**: a switch and the lamp(s) it switches share a mark (`B4` on the switch and on the
  lamp); two two-way switches and their lamp all get `B4`.
- Group sensibly, as an electrician would, and follow the AREI (Plugged checks it):
  - at most **8 socket outlets** per circuit (a double or triple socket counts as one; a fixed appliance or a group of lamps behind
    one switch also counts as one point) — 2.5 mm², 20 A;
  - lighting on its own circuits (16 A, 1.5 mm²); a home with more than two rooms has at least **two lighting circuits**;
  - **a circuit of its own** for the cooking plate, the oven, the washing machine, the dryer, the dishwasher and a charging station;
    also for a boiler, heating, air conditioning or microwave of 2600 W or more;
  - bathrooms, kitchen and outside sockets are best on circuits of their own rooms, not mixed with the living areas.
- Leave the mark out of the board (`bord`) and the meter.

## 4. After drawing

- Say what you drew (floors, rooms, number of points per circuit) and what you were unsure about.
- Tell the user to open the project in Plugged (the link in the answer): it offers to make the eendraadschema from the marks. Then
  *Controleer* lists what the AREI still asks (measurements, title block, protections).
- Changes later: draw again with `replace: true`, or read the project (`get_project`), change the document and `save_project`.
  Every save keeps the previous version in the history of the project (Project → Laden → history), so nothing is lost.

## The project document (for get_project / save_project)

JSON, owned by the editor: keep what you do not understand exactly as it is.
- `footer`: the title block (`straat`, `nr`, `postcode`, `gemeente`, `eigenaar`, `ean`, `tekenaar`, `datum`, `schaal` like `1:50`,
  `rev`, `dossier`, `stelsel` like `230V TT`, measurements `aardingsweerstand`, `isolatieweerstand`, `meetdatum`).
- `een`: pages of the eendraadschema `{id, name, tree}`; `tree` is nested `{id, type, label, info, p: {...}, children}`.
  A circuit has `type: "kring"` and `p: {polen, amp, curve, kabel, kortsl, tekst, lengte}`.
- `sit`: pages of the situatieschema `{id, name, walls: [{id, x1, y1, x2, y2}], items: [...]}` in **mm on an A4 sheet**
  (297 x 210, drawing area above the title block); real size = mm x scale / 1000. Items: `{kind: "sym", type, x, y, r, s, mark, node}`,
  `{kind: "text", txt, x, y, s, r, area}`, `{kind: "door" | "window", x, y, r, w, f, m}`. `node` links a symbol to an element of the
  eendraadschema. A page may have `symScale` (default 2): the plan draws its symbols at `s` times that, so keep `s` at 7.
- `wire`: pages of the bedradingsschema.
