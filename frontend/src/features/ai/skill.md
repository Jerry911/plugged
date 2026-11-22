---
name: plugged-drawings
description: Turn an existing floor plan (PDF, photo, sketch) into Plugged drawings of a Belgian electrical installation (AREI), via the Plugged connector.
---

# Plugged drawings

Plugged ({{URL}}) draws the documents of a Belgian household installation after the AREI. This skill works through the Plugged
connector (MCP tools `plugged_guide`, `list_projects`, `create_project`, `list_symbols`, `draw_floor_plan`, `get_project`,
`save_project`). If those tools are not available, tell the user to add the connector first: in Plugged, Account → AI-assistent shows
the address and the steps.

## Steps

1. Call `plugged_guide` once and follow it.
2. Read the plan the user gave. Find the scale from dimension lines, a scale bar or known sizes (doors 0.8-1 m). Work in metres,
   x to the right and y down from the top left corner of the building, the same origin for every floor.
3. Ask before you guess: which floors, unreadable dimensions, and how the user wants the circuits grouped if he has a preference.
4. `create_project` (name: address or client) unless the user names an existing project (`list_projects`).
5. `list_symbols` with where `plan` for the symbol keys.
6. `draw_floor_plan`: rooms as rectangles with their names, doors, windows, passages, and the electrical points with their marks
   (`A1`, `A2`, ... - a switch and the lamps it switches share one mark). Follow the AREI groupings of the guide: at most 8 socket
   outlets per circuit, lighting on its own circuits (at least two in a home of more than two rooms), a circuit of its own for cooking
   plate, oven, washing machine, dryer, dishwasher and charging station.
7. Report what you drew, per floor and per circuit, and what you were unsure about. Give the link from the answer: when the user opens
   the project, Plugged offers to make the eendraadschema from the marks, and *Controleer* checks it against the AREI.

Never invent measurements, addresses, EAN numbers or measurement results. Answer in the language of the user. Every save keeps the
previous version in the history of the project.
