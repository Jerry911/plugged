// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Starter templates for the situatieschema: floor plans of common Belgian homes, drawn in real metres. A template is turned into
// situatieschema pages (one per floor) at the scale of the project: walls (the outlines of the rooms, shared walls merged into one line),
// doors, windows and the name of every room as a text. Everything on it is ordinary drawing afterwards: move, resize or delete as usual.
//
// A floor: {name, rooms: [{name, x, y, w, h}], doors: [{x, y, r, w, f?, m?}], windows: [{x, y, r, w}], passages?: [{x, y, r, w}]} in
// metres, x to the right and y down from the top left corner. A door, window or passage lies on a wall: r 0 on a horizontal wall, 90 on
// a vertical one; w its width. A door opens to the top (r 0) or to the right (r 90) unless f (flip) is set, m puts the hinge on the other
// side. A passage is an opening without a door (the stairs open onto the hall): that part of the wall is left out. Room and floor names
// are translation keys (templates.rooms.*, templates.floors.*).

// from large to small: a template is drawn as large as the sheet allows (1:20 ... 1:40 for a studio or a small terraced house)
const STANDARD_SCALES = [20, 25, 40, 50, 75, 100, 125, 150, 200]
// the part of an A4 sheet a template is centred in (mm): the drawing area above the title block, with a margin
export const TEMPLATE_AREA = {x: 10, y: 8, w: 277, h: 170}

const FRONT_DOOR = 1.0,
    DOOR = 0.9,
    NARROW_DOOR = 0.8

export const PLAN_TEMPLATES = [
    {
        id: 'studio',
        w: 6,
        h: 5.4,
        floors: [
            {
                name: 'single',
                rooms: [
                    {name: 'livingKitchenBedroom', x: 0, y: 0, w: 6, h: 3.4},
                    {name: 'bathroom', x: 0, y: 3.4, w: 2.6, h: 2},
                    {name: 'entrance', x: 2.6, y: 3.4, w: 3.4, h: 2},
                ],
                doors: [
                    {x: 5.4, y: 5.4, r: 0, w: FRONT_DOOR},
                    {x: 3.6, y: 3.4, r: 0, w: DOOR},
                    {x: 2.6, y: 4.95, r: 90, w: NARROW_DOOR, f: true},
                ],
                windows: [
                    {x: 1.6, y: 0, r: 0, w: 1.6},
                    {x: 4.4, y: 0, r: 0, w: 1.6},
                    {x: 0, y: 4.4, r: 90, w: 0.6},
                ],
            },
        ],
    },
    {
        id: 'apartment',
        w: 12,
        h: 8.5,
        floors: [
            {
                name: 'single',
                rooms: [
                    {name: 'living', x: 0, y: 0, w: 6.5, h: 4},
                    {name: 'kitchen', x: 6.5, y: 0, w: 3, h: 4},
                    {name: 'storage', x: 9.5, y: 0, w: 2.5, h: 4},
                    {name: 'hall', x: 0, y: 4, w: 12, h: 1.2},
                    {name: 'bedroom1', x: 0, y: 5.2, w: 4.2, h: 3.3},
                    {name: 'bedroom2', x: 4.2, y: 5.2, w: 3.4, h: 3.3},
                    {name: 'bathroom', x: 7.6, y: 5.2, w: 2.6, h: 3.3},
                    {name: 'toilet', x: 10.2, y: 5.2, w: 1.8, h: 3.3},
                ],
                doors: [
                    {x: 12, y: 4.6, r: 90, w: FRONT_DOOR, f: true},
                    {x: 3.2, y: 4, r: 0, w: DOOR},
                    {x: 8, y: 4, r: 0, w: DOOR},
                    {x: 10.75, y: 4, r: 0, w: NARROW_DOOR},
                    {x: 2.1, y: 5.2, r: 0, w: DOOR, f: true},
                    {x: 5.9, y: 5.2, r: 0, w: DOOR, f: true},
                    {x: 8.9, y: 5.2, r: 0, w: NARROW_DOOR, f: true},
                    {x: 11.1, y: 5.2, r: 0, w: NARROW_DOOR, f: true},
                ],
                windows: [
                    {x: 1.8, y: 0, r: 0, w: 2.4},
                    {x: 4.8, y: 0, r: 0, w: 2.4},
                    {x: 8, y: 0, r: 0, w: 1.4},
                    {x: 2.1, y: 8.5, r: 0, w: 1.6},
                    {x: 5.9, y: 8.5, r: 0, w: 1.4},
                    {x: 8.9, y: 8.5, r: 0, w: 0.8},
                ],
            },
        ],
    },
    {
        id: 'terraced',
        w: 10,
        h: 6,
        floors: [
            {
                name: 'ground',
                rooms: [
                    {name: 'hall', x: 0, y: 0, w: 5, h: 1.2},
                    {name: 'living', x: 0, y: 1.2, w: 5, h: 4.8},
                    {name: 'stairs', x: 5, y: 0, w: 1.5, h: 2.2},
                    {name: 'toilet', x: 5, y: 2.2, w: 1.5, h: 1.5},
                    {name: 'storage', x: 5, y: 3.7, w: 1.5, h: 2.3},
                    {name: 'kitchen', x: 6.5, y: 0, w: 3.5, h: 6},
                ],
                doors: [
                    {x: 0, y: 0.6, r: 90, w: FRONT_DOOR},
                    {x: 3.5, y: 1.2, r: 0, w: DOOR, f: true},
                    {x: 5, y: 0.6, r: 90, w: NARROW_DOOR},
                    {x: 5.75, y: 2.2, r: 0, w: 0.7},
                    {x: 6.5, y: 1.1, r: 90, w: DOOR},
                    {x: 6.5, y: 4.85, r: 90, w: NARROW_DOOR, f: true},
                    {x: 10, y: 1.4, r: 90, w: DOOR, f: true},
                ],
                windows: [
                    {x: 0, y: 3.6, r: 90, w: 2.4},
                    {x: 10, y: 4.2, r: 90, w: 1.8},
                ],
            },
            {
                name: 'first',
                rooms: [
                    {name: 'bedroom1', x: 0, y: 0, w: 5, h: 6},
                    {name: 'stairs', x: 5, y: 0, w: 1.5, h: 2.2},
                    {name: 'landing', x: 5, y: 2.2, w: 1.5, h: 3.8},
                    {name: 'bedroom2', x: 6.5, y: 0, w: 3.5, h: 3.4},
                    {name: 'bathroom', x: 6.5, y: 3.4, w: 3.5, h: 2.6},
                ],
                doors: [
                    {x: 5, y: 4.4, r: 90, w: DOOR, f: true},
                    {x: 6.5, y: 2.8, r: 90, w: DOOR},
                    {x: 6.5, y: 4.9, r: 90, w: NARROW_DOOR},
                ],
                passages: [{x: 5.75, y: 2.2, r: 0, w: 1.5}],
                windows: [
                    {x: 0, y: 3, r: 90, w: 2},
                    {x: 10, y: 1.7, r: 90, w: 1.6},
                    {x: 10, y: 4.7, r: 90, w: 0.8},
                ],
            },
        ],
    },
    {
        id: 'detached',
        w: 12,
        h: 8,
        floors: [
            {
                name: 'ground',
                rooms: [
                    {name: 'living', x: 0, y: 0, w: 7, h: 4.5},
                    {name: 'kitchen', x: 7, y: 0, w: 5, h: 4.5},
                    {name: 'office', x: 0, y: 4.5, w: 3.5, h: 3.5},
                    {name: 'entrance', x: 3.5, y: 4.5, w: 2, h: 3.5},
                    {name: 'stairs', x: 5.5, y: 4.5, w: 1.5, h: 3.5},
                    {name: 'toilet', x: 7, y: 4.5, w: 1.3, h: 3.5},
                    {name: 'storage', x: 8.3, y: 4.5, w: 3.7, h: 3.5},
                ],
                passages: [{x: 5.5, y: 6.25, r: 90, w: 3.5}],
                doors: [
                    {x: 4.5, y: 8, r: 0, w: FRONT_DOOR},
                    {x: 4.5, y: 4.5, r: 0, w: DOOR},
                    {x: 3.5, y: 6.2, r: 90, w: DOOR, f: true},
                    {x: 7, y: 6.8, r: 90, w: NARROW_DOOR},
                    {x: 10, y: 4.5, r: 0, w: DOOR, f: true},
                    {x: 7, y: 2.2, r: 90, w: DOOR},
                    // the back door of the kitchen on the side wall: in the top right corner of the sheet it would be under the zoom buttons
                    {x: 12, y: 1.1, r: 90, w: DOOR, f: true},
                ],
                windows: [
                    {x: 3, y: 0, r: 0, w: 3},
                    {x: 9.5, y: 0, r: 0, w: 1.6},
                    {x: 0, y: 2.2, r: 90, w: 1.6},
                    {x: 12, y: 3.2, r: 90, w: 1.2},
                    {x: 1.75, y: 8, r: 0, w: 1.4},
                    {x: 10.15, y: 8, r: 0, w: 0.8},
                ],
            },
            {
                name: 'first',
                rooms: [
                    {name: 'bedroom1', x: 0, y: 0, w: 4.5, h: 3.8},
                    {name: 'bathroom', x: 4.5, y: 0, w: 3, h: 3.8},
                    {name: 'bedroom2', x: 7.5, y: 0, w: 4.5, h: 3.8},
                    {name: 'landing', x: 0, y: 3.8, w: 12, h: 1.2},
                    {name: 'bedroom3', x: 0, y: 5, w: 5.5, h: 3},
                    {name: 'stairs', x: 5.5, y: 5, w: 1.5, h: 3},
                    {name: 'toilet', x: 7, y: 5, w: 1.3, h: 3},
                    {name: 'storage', x: 8.3, y: 5, w: 3.7, h: 3},
                ],
                passages: [{x: 6.25, y: 5, r: 0, w: 1.5}],
                doors: [
                    {x: 3.5, y: 3.8, r: 0, w: DOOR},
                    {x: 5.2, y: 3.8, r: 0, w: NARROW_DOOR},
                    {x: 8.5, y: 3.8, r: 0, w: DOOR},
                    {x: 3.5, y: 5, r: 0, w: DOOR, f: true},
                    {x: 7.65, y: 5, r: 0, w: NARROW_DOOR, f: true},
                    {x: 9.2, y: 5, r: 0, w: DOOR, f: true},
                ],
                windows: [
                    {x: 2.25, y: 0, r: 0, w: 1.6},
                    {x: 6, y: 0, r: 0, w: 0.8},
                    {x: 9.75, y: 0, r: 0, w: 1.6},
                    {x: 2.25, y: 8, r: 0, w: 1.6},
                    {x: 9.9, y: 8, r: 0, w: 0.8},
                ],
            },
        ],
    },
]

const round = (value) => Math.round(value * 1000) / 1000

/**
 * The walls of a floor: the edges of its rooms, with the collinear edges that overlap or touch merged into one wall, so a wall shared by
 * two rooms is one line. Answers [{x1, y1, x2, y2}] in metres.
 */
export const roomWalls = (rooms, passages = []) => {
    const horizontal = new Map(),
        vertical = new Map(),
        add = (map, at, from, to) => {
            const key = round(at)
            map.set(key, [...(map.get(key) || []), [round(Math.min(from, to)), round(Math.max(from, to))]])
        }
    rooms.forEach(({x, y, w, h}) => {
        add(horizontal, y, x, x + w)
        add(horizontal, y + h, x, x + w)
        add(vertical, x, y, y + h)
        add(vertical, x + w, y, y + h)
    })
    const merged = (spans) =>
        spans
            .sort((a, b) => a[0] - b[0])
            .reduce((result, span) => {
                const last = result[result.length - 1]
                if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1])
                else result.push([...span])
                return result
            }, [])
    // the spans of a line minus the passages on it
    const cut = (spans, gaps) =>
        gaps.reduce(
            (result, [from, to]) => result.flatMap(([a, b]) => (to <= a || from >= b ? [[a, b]] : [...(from > a ? [[a, from]] : []), ...(to < b ? [[to, b]] : [])])),
            spans,
        )
    const gapsOn = (vertical, at) =>
        passages
            .filter((passage) => (passage.r === 90) === vertical && round(vertical ? passage.x : passage.y) === at)
            .map((passage) => [round((vertical ? passage.y : passage.x) - passage.w / 2), round((vertical ? passage.y : passage.x) + passage.w / 2)])
    return [
        ...[...horizontal].flatMap(([y, spans]) => cut(merged(spans), gapsOn(false, y)).map(([x1, x2]) => ({x1, y1: y, x2, y2: y}))),
        ...[...vertical].flatMap(([x, spans]) => cut(merged(spans), gapsOn(true, x)).map(([y1, y2]) => ({x1: x, y1, x2: x, y2}))),
    ]
}

/** Does the template fit the template area of the sheet at this scale. */
export const fitsAt = (template, scale) => (template.w * 1000) / scale <= TEMPLATE_AREA.w && (template.h * 1000) / scale <= TEMPLATE_AREA.h

/** The scale to draw a template at: the current one when it fits, else the smallest standard scale above it that does. */
export const scaleForTemplate = (template, scale) =>
    fitsAt(template, scale) ? scale : (STANDARD_SCALES.find((candidate) => candidate > scale && fitsAt(template, candidate)) ?? null)

/**
 * The scale at which a template fills the sheet best: the largest drawing that still fits (a 12 x 8 m house at 1:50, not at 1:75 with
 * half the sheet empty). Used while nothing is drawn yet, when the scale of the project can still change freely.
 */
export const bestScaleForTemplate = (template) => STANDARD_SCALES.find((candidate) => fitsAt(template, candidate)) ?? null

const TEXT_WIDTH_FACTOR = 0.55 // the width of a character relative to the text size, as the situatieschema estimates it

/**
 * The situatieschema pages of a template at a scale: one per floor, {name, walls, items} in millimetres on the sheet, centred in the
 * drawing area. `translate(key)` names the floors and rooms, `newId()` gives the ids.
 */
export const templatePages = (template, scale, translate, newId) => {
    const sheet = (metres) => round((metres * 1000) / scale),
        left = TEMPLATE_AREA.x + (TEMPLATE_AREA.w - sheet(template.w)) / 2,
        top = TEMPLATE_AREA.y + (TEMPLATE_AREA.h - sheet(template.h)) / 2,
        at = (x, y) => ({x: round(left + sheet(x)), y: round(top + sheet(y))})
    return template.floors.map((floor) => {
        const walls = roomWalls(floor.rooms, floor.passages).map((wall) => {
            const start = at(wall.x1, wall.y1),
                end = at(wall.x2, wall.y2)
            return {id: newId(), x1: start.x, y1: start.y, x2: end.x, y2: end.y}
        })
        const opening = (kind) => (opening) => ({
            id: newId(),
            kind,
            ...at(opening.x, opening.y),
            r: opening.r,
            w: sheet(opening.w),
            ...(opening.f ? {f: true} : {}),
            ...(opening.m ? {m: true} : {}),
        })
        const labels = floor.rooms.map((room) => {
            const txt = translate('templates.rooms.' + room.name),
                // smaller text in a narrow room, so the name stays inside it
                size = sheet(room.w) < txt.length * 4 * TEXT_WIDTH_FACTOR + 4 ? 3 : 4,
                centre = at(room.x + room.w / 2, room.y + room.h / 2)
            return {
                id: newId(),
                kind: 'text',
                x: round(centre.x - (txt.length * size * TEXT_WIDTH_FACTOR) / 2),
                y: round(centre.y + size * 0.35),
                txt,
                s: size,
                r: 0,
                // the room name shows the floor area under it
                area: true,
            }
        })
        return {
            name: translate('templates.floors.' + floor.name),
            walls,
            items: [...floor.doors.map(opening('door')), ...floor.windows.map(opening('window')), ...labels],
        }
    })
}

/** Is there anything drawn on these situatieschema pages. */
export const hasDrawing = (pages) => pages.some((page) => page.walls.length || page.items.length)
