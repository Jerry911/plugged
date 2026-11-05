// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Busbar-style layout of an eendraadschema: a horizontal bus with circuits placed left to right.
// The layout works in drawing units (about a pixel); MM_PER_UNIT converts them to millimetres on the sheet. The result is a list of drawn
// items per circuit, which BoardSheet.jsx renders:
//   {kind: 'line', x1, y1, x2, y2}
//   {kind: 'text', x, y, text, fontSize, anchor, bold, italic, vertical, id}   vertical: rotated -90 degrees, the text runs upwards
//   {kind: 'sym', shapes, x, y, size, rotation, breaker, id}                   a library symbol centred on (x, y)
//   {kind: 'rect', x, y, w, h, id}  {kind: 'circ', x, y, r}
//   {kind: 'hit', ...} / {kind: 'stem', ...}                                   click area / drag & drop latch zone of a circuit (editor only)
// `id` links a drawn item to its element of the tree (click to select).
import {placedShapesOf, socketStackOf} from '../symbols/symbolShapes.js'
import {pathPoints} from '../symbols/pathPoints.js'
import {symbolName, typeOf} from '../symbols/symbolLibrary.js'
import {t} from '../i18n/translate.js'
import {flatten, newId} from './tree.js'

// The full size of the drawing, which is also its smallest: its smallest text (13 units, also the details) is then as large as the titles of
// the footer (2.2 mm), so a printed sheet stays readable. At this size a circuit with the maximum of 8 points (each with a name and a count)
// always fits on a sheet (see the tests). Sheets are never drawn smaller, except for a single circuit that is too high for a sheet even on its
// own (many detail lines under its points).
export const MM_PER_UNIT = 0.17,
    // the drawing area of a sheet in mm: inside the frame (10 mm from the edges) and above the footer (which starts at y 185)
    DRAWING_WIDTH = 277,
    DRAWING_TOP = 12,
    DRAWING_BOTTOM = 184,
    DRAWING_HEIGHT = DRAWING_BOTTOM - DRAWING_TOP,
    // the head below the bus (earth, main breaker, kWh meter with its cable) in drawing units: the bus goes as low as this leaves room for
    HEAD_DEPTH = 124,
    // a sheet holds this width of circuits at full size; a wider circuit starts a new sheet, unless the sheet is drawn smaller anyway (a
    // circuit that is too high) and the circuit fits at that size, see sheetScale
    MAX_SHEET_WIDTH = 1600,
    // the height of circuits (above the bus) a sheet holds at full size
    MAX_SHEET_HEIGHT = DRAWING_HEIGHT / MM_PER_UNIT - HEAD_DEPTH,
    // Sub boards in sub boards are higher than a sheet at full size; they are drawn smaller, but never smaller than this (still readable on
    // paper): a circuit in a sub board whose points would need more height bends into a next column instead
    NESTED_MIN_SCALE = 0.112,
    NESTED_HEIGHT = DRAWING_HEIGHT / NESTED_MIN_SCALE - HEAD_DEPTH,
    // a sheet is at least this high (drawing units above the bus)
    MIN_SHEET_HEIGHT = 120,
    // where the bus and the first circuit start (left of it: room for the name of the first circuit, clear of the frame)
    BUS_START_X = 40,
    // horizontal space between two circuits
    CIRCUIT_SPACING = 24,
    // length of the line from the stem of a circuit to an element on it
    BRANCH_STUB = 24,
    // where the specs of the breaker and its short-circuit rating start above the bus, and how far right of the stem their first column stands
    SPEC_BOTTOM = 10,
    SPEC_OFFSET = 20,
    SYMBOL_SIZE = 46,
    ELEMENT_GAP = 20,
    // drag & drop latch zone along the stem of a circuit: half its width, and how far it reaches above the top branch (room for the next one)
    STEM_ZONE_HALF_WIDTH = 16,
    STEM_ZONE_REACH = 150
/** The scale (mm per unit) a sheet with the given width and height (units above the bus) is drawn at: full size, or smaller to fit. */
// Where the bus lies on a sheet (mm from the top), for circuits of the given height (drawing units above the bus) at the given scale: around the
// middle of the page while the circuits are low, lower as they get higher (keeping some room above the highest one), down to where the head
// below the bus just stays above the footer.
export const BUS_MIDDLE = 100,
    BUS_TOP_ROOM = 15
export const busPosition = (height, scale) =>
    Math.min(DRAWING_BOTTOM - HEAD_DEPTH * scale, Math.max(BUS_MIDDLE, DRAWING_TOP + height * scale + BUS_TOP_ROOM))

export const sheetScale = (width, height) =>
    Math.min(MM_PER_UNIT, DRAWING_WIDTH / Math.max(1, width), DRAWING_HEIGHT / Math.max(1, height + HEAD_DEPTH))

// While circuits are laid out: how high the bus of the circuit being laid out lies above the bus of the sheet (in a sub board: the top edge of
// its box), and how much room its points have above its own bus before they bend into a next column (see drawColumns). On the bus of the sheet
// that is a sheet at full size; in a sub board it is a sheet at NESTED_MIN_SCALE, less the height its board lies at.
let circuitBase = 0,
    pointRoom = null
const withRoom = (base, room, work) => {
    const before = [circuitBase, pointRoom]
    ;[circuitBase, pointRoom] = [base, room]
    try {
        return work()
    } finally {
        ;[circuitBase, pointRoom] = before
    }
}

/** Elements drawn as a box with their own circuits inside (a domotics cabinet, a sub board). */
export const BOX_TYPES = new Set(['domotica', 'subbord'])
const textWidth = (text) => String(text || '').length * 6.6

// Details of an element (brand, type, serial number, Pmax, Umax, ...): one line per entry. Lines are separated by Enter (a real new line)
// or by '|' (how the eendraadschema stores them), so both a typed text area and an imported file give the same lines.
export const DETAIL_FONT_SIZE = 13,
    DETAIL_LINE_HEIGHT = 15
export const detailLines = (details) =>
    String(details ?? '')
        .split(/\r?\n|\|/)
        .map((line) => line.trim())
        .filter(Boolean)
const detailWidth = (line) => String(line || '').length * DETAIL_FONT_SIZE * 0.56

/** The letter of the n-th circuit: A..Z, then AA, AB, ... */
export const circuitLetter = (index) =>
    index < 26 ? String.fromCharCode(65 + index) : String.fromCharCode(64 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26))

/** The short specs of a circuit from its properties, e.g. 'B16 2P XVB Cca 3G2,5'. */
export const circuitInfo = (properties = {}) =>
    [(properties.curve || '') + (properties.amp || ''), properties.polen ? properties.polen + 'P' : '', properties.kabel || ''].filter(Boolean).join(' ')

/** The first circuit letter that is not used yet in the tree. */
export const nextCircuitLetter = (tree) => {
    const used = new Set(
        flatten(tree)
            .filter((node) => node.type === 'kring')
            .map((node) => node.label),
    )
    let index = 0
    while (used.has(circuitLetter(index))) index++
    return circuitLetter(index)
}

/** The properties a new element of this type starts with (undefined for types without properties). */
export const defaultProperties = (typeKey) =>
    ({
        kring: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5', kortsl: 3, bescherming: 'automatisch', tekst: ''},
        aansluiting: {teller: true, polen: 4, amp: 40, bescherming: 'differentieel', delta: 300, diffType: 'A', kabel: '4x16', kortsl: 3},
        bord: {geaard: true},
    })[typeKey]

/** The tree of a new page: a connection to the grid with a distribution board under it (labels in the active language). */
export const defaultTree = () => [
    {
        id: newId(),
        type: 'aansluiting',
        label: t('board.connectionLabel'),
        info: '',
        p: defaultProperties('aansluiting'),
        children: [{id: newId(), type: 'bord', label: t('board.boardLabel'), info: '', p: defaultProperties('bord'), children: []}],
    },
]

// Breakers and the kWh meter are the symbols of the library (so edits to a symbol show up in the diagram). A breaker is drawn so that its
// lever is 30 units long (as in the eendraadschema). The pivot of the symbol is (13, 14) on its 24 grid and the lever tip lies BREAKER_TIP
// units above the pivot: the line above the breaker carries on from there.
export const BREAKER_SIZE = (24 * 30) / Math.hypot(13 - 9.41, 14 - 4.13),
    BREAKER_TIP = ((14 - 4.13) * BREAKER_SIZE) / 24,
    // the box of the kWh meter symbol is 14 grid units wide: 50 drawing units
    METER_SIZE = (24 * 50) / 14,
    // the line of the kWh meter below the bus: low enough for a clear bend up to the lower contact (y 66) of the main breaker
    METER_Y = 96

/** The drawn item of the breaker symbol `typeKey` with its pivot on (x, y). */
export const breakerItem = (project, typeKey, x, y, extra = {}) => ({
    kind: 'sym',
    shapes: typeOf(project, typeKey).shapes,
    x: x - BREAKER_SIZE / 24,
    y: y - (2 * BREAKER_SIZE) / 24,
    size: BREAKER_SIZE,
    breaker: 1,
    ...extra,
})

/**
 * A differentieel either groups circuits (it has none under it yet, or circuits: they are drawn side by side and the differentieel itself is
 * not drawn) or is a circuit of its own: a breaker with what it feeds under it (sub boards, elements, another differentieel). The main line
 * (a board under it) is not a circuit.
 */
export const isDiffCircuit = (node) =>
    node.type === 'diff' && node.children.length > 0 && !node.children.some((child) => child.type === 'kring' || child.type === 'bord')

const curveText = (curve) => t('board.curve', {curve})
const typeText = (type) => t('board.diffType', {type})
const ratingText = (poles, amps) => `${poles || 2}P - ${amps}A`

/**
 * The lines next to the breaker of a differentieel, like the differentieel of the aansluiting: 'Δ30mA', '4P - 40A', ('Curve C' of a
 * differentieelautomaat), 'Type A'. A differentieel without these properties (typed in by hand) shows its info instead.
 */
export const differentialSpecs = (properties = {}, info = '') =>
    properties.delta || properties.amp
        ? [
              properties.delta ? `Δ${properties.delta}mA` : '',
              properties.amp ? ratingText(properties.polen, properties.amp) : '',
              properties.curve ? curveText(properties.curve) : '',
              properties.diffType ? typeText(properties.diffType) : '',
          ].filter(Boolean)
        : [info].filter(Boolean)

const lineItem = (x1, y1, x2, y2) => ({kind: 'line', x1, y1, x2, y2}),
    textItem = (x, y, text, options = {}) => ({kind: 'text', x, y, text, ...options})

// Plaatsing of the cable of a circuit (as in the online eendraadschema): the symbols are drawn left of the stem, between the name and the line.
// properties.plaatsing = '' | 'ondergronds' | 'luchtleiding' | 'inwand' | 'opwand', properties.inbuis = the cable runs in a conduit (a small circle).
// The labels are in the translations: placement.<value> ('' = placement.none).
export const CABLE_PLACEMENTS = ['', 'ondergronds', 'luchtleiding', 'inwand', 'opwand']
export const placementLabel = (placement) => t('placement.' + (placement || 'none'))
/** Room the placement symbols need left of the stem: the name of the circuit moves that far to the left. */
export const PLACEMENT_WIDTH = 24
// 'ondergronds', 'inwand' and 'opwand' are drawn left of the stem (and may be marked 'in buis' with a small circle); the circle of a
// 'luchtleiding' sits on the stem itself, and a luchtleiding is never 'in buis'
export const PLACEMENTS_LEFT_OF_STEM = ['ondergronds', 'inwand', 'opwand']
export const hasPlacement = (properties = {}) => PLACEMENTS_LEFT_OF_STEM.includes(properties.plaatsing)
/** An imported or typed value ('In wand', 'in_wand', 'N/A', ...) as one of CABLE_PLACEMENTS ('' = not given). */
export const placementOf = (value) => {
    const key = String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z]/g, '')
    return CABLE_PLACEMENTS.some((placement) => placement && placement === key) ? key : ''
}
const PLACEMENT_HALF_LENGTH = 13 // half the length of the symbols along the stem
// an E along the stem: a bar from (barX, centreY - 13) to (barX, centreY + 13) with three teeth reaching to tipX
const letterE = (centreY, barX, tipX) => [
    lineItem(barX, centreY - PLACEMENT_HALF_LENGTH, barX, centreY + PLACEMENT_HALF_LENGTH),
    lineItem(barX, centreY - PLACEMENT_HALF_LENGTH, tipX, centreY - PLACEMENT_HALF_LENGTH),
    lineItem(barX, centreY, tipX, centreY),
    lineItem(barX, centreY + PLACEMENT_HALF_LENGTH, tipX, centreY + PLACEMENT_HALF_LENGTH),
]
// the drawings per placement (stemX = x of the stem), drawn once at the start of the cable
const PLACEMENT_DRAWINGS = {
    // earth symbol turned along the stem: three lines getting shorter towards the stem
    ondergronds: (stemX) => [
        lineItem(stemX - 16, -102, stemX - 16, -76),
        lineItem(stemX - 12.5, -99.5, stemX - 12.5, -78.5),
        lineItem(stemX - 9, -97, stemX - 9, -81),
    ],
    // two E's: bar at the stem, teeth to the left (mirrored E's)
    opwand: (stemX) => [...letterE(-83, stemX - 6, stemX - 19), ...letterE(-152, stemX - 6, stemX - 19)],
    // two E's: bar on the outside, teeth to the stem
    inwand: (stemX) => [...letterE(-83, stemX - 19, stemX - 6), ...letterE(-152, stemX - 19, stemX - 6)],
    // a circle on the stem itself
    luchtleiding: (stemX) => [{kind: 'circ', x: stemX, y: -100, r: 5}],
}
const CONDUIT_Y = -127
/** The drawn items of the placement of a circuit cable. */
export const placementItems = (properties, stemX) => [
    ...(PLACEMENT_DRAWINGS[properties.plaatsing]?.(stemX) || []),
    // in buis: a small circle between the symbols
    ...(hasPlacement(properties) && properties.inbuis ? [{kind: 'circ', x: stemX - 12.5, y: CONDUIT_Y, r: 5}] : []),
]

/** The part [left, right] of the connection line y = 12 that the shapes of a symbol cover (null when no shape touches it). */
export const connectionReach = (shapes) => {
    let left = Infinity,
        right = -Infinity
    const cover = (from, to) => {
        left = Math.min(left, from)
        right = Math.max(right, to)
    }
    // where a polyline (a line or a path) lies on the connection line: along a stretch on it, or at the point where it crosses or touches it
    const onLine = (y) => Math.abs(y - 12) < 1e-6
    const coverPolyline = (points) => {
        if (points.length === 1 && onLine(points[0][1])) cover(points[0][0], points[0][0])
        for (let i = 1; i < points.length; i++) {
            const [ax, ay] = points[i - 1],
                [bx, by] = points[i]
            if (onLine(ay) && onLine(by)) cover(Math.min(ax, bx), Math.max(ax, bx))
            else if (onLine(ay)) cover(ax, ax)
            else if (onLine(by)) cover(bx, bx)
            else if ((ay - 12) * (by - 12) < 0) {
                const crossing = ax + ((12 - ay) / (by - ay)) * (bx - ax)
                cover(crossing, crossing)
            }
        }
    }
    shapes.forEach((shape) => {
        if (shape.t === 'circle' && Math.abs(shape.cy - 12) <= shape.r) {
            const halfChord = Math.sqrt(shape.r ** 2 - (shape.cy - 12) ** 2)
            cover(shape.cx - halfChord, shape.cx + halfChord)
        } else if (shape.t === 'rect' && shape.y <= 12 && 12 <= shape.y + shape.h) cover(shape.x, shape.x + shape.w)
        else if (shape.t === 'line') coverPolyline([[shape.x1, shape.y1], [shape.x2, shape.y2]])
        else if (shape.t === 'path') coverPolyline(pathPoints(shape.d))
        else if (shape.t === 'arc' && Math.abs(12 - shape.cy) <= shape.r) {
            const dy = 12 - shape.cy,
                halfChord = Math.sqrt(shape.r ** 2 - dy ** 2),
                span = (((shape.a2 - shape.a1) % 360) + 360) % 360
            ;[shape.cx - halfChord, shape.cx + halfChord].forEach((x) => {
                const angle = (Math.atan2(dy, x - shape.cx) * 180) / Math.PI
                if ((((angle - shape.a1) % 360) + 360) % 360 <= span + 1e-9) cover(x, x)
            })
        }
    })
    return left <= right ? [left, right] : null
}

// vertical room of an element in a stack: the symbol, its count (x3), its label and one line per detail
// how far what hangs under a point (count, name, details) reaches below its line: see drawNode; a box (sub board) reaches 25 below its line,
// a breaker on the line its specs and cable (see drawInlineBreaker)
const textBelow = (node) => {
    if (BOX_TYPES.has(node.type)) return 26
    if (node.type === 'kring' || node.type === 'diff') return 28 + 13 * Math.max(0, inlineSpecs(node).length - 1)
    const counted = Number(node.p?.aantal) > 1
    return (node.label ? (counted ? 62 : 48) : counted ? 46 : 30) + detailLines(node.p?.details).length * DETAIL_LINE_HEIGHT
}
// (the symbol reaches 28 above its line; below it the count, the name or both: see drawNode; a few units between two points)
const ownHeight = (node) => {
    const counted = Number(node.p?.aantal) > 1
    return (node.label ? (counted ? 96 : 84) : counted ? 80 : 66) + detailLines(node.p?.details).length * DETAIL_LINE_HEIGHT
}
// A sub board needs the room of its circuits, which are drawn like the circuits on the bus: measure them (at least 300 for a board with circuits)
const elementHeight = (project, node) =>
    BOX_TYPES.has(node.type)
        ? node.children.length
            ? Math.max(300, 30 - drawNode(project, node, 0, 0, []).top)
            : 100
        : Math.max(
              ownHeight(node),
              node.children.reduce((sum, child) => sum + elementHeight(project, child), 0),
          )

// The elements under one point, stacked upwards from (stemX, y): a stub to each, numbered when `numbered` (the points of a circuit).
function drawStack(project, children, stemX, y, out, stubLength, numbered, firstNumber = 1) {
    let used = 0,
        right = stemX,
        top = y - 30,
        bottom = y + 30,
        lastY = y
    children.forEach((child, index) => {
        const childY = y - used
        used += elementHeight(project, child)
        lastY = childY
        out.push(lineItem(stemX, childY, stemX + stubLength, childY))
        if (numbered) out.push(textItem(stemX - 4, childY - 10, child.p?.nr || String(firstNumber + index), {fontSize: 13, anchor: 'end'}))
        const extent = drawNode(project, child, stemX + stubLength, childY, out)
        right = Math.max(right, extent.right)
        top = Math.min(top, extent.top)
        bottom = Math.max(bottom, extent.bottom)
    })
    if (lastY !== y) out.push(lineItem(stemX, y, stemX, lastY))
    return {right, top, bottom}
}

// gap between two columns of the points of a circuit, how far a point reaches above its line (the symbol) and the room the line over the
// top of a bend takes above the highest point
const COLUMN_GAP = 40,
    POINT_TOP = 28,
    BEND_ROOM = 2

// The points of a circuit, stacked upwards from (stemX, topY). Only when they are higher than a sheet holds with the bus at its lowest (a
// circuit holds at most 8 points, which always fit: see the tests) they go on in a next column to the right: the line bends over the top of
// the previous column and comes down along the new stem, where the points go up again from the bottom and the numbering carries on.
function drawColumns(project, children, stemX, topY, out) {
    // the points in columns that each stay below `room` (a point lies `used` above the first one and reaches POINT_TOP above its line)
    const split = (room) => {
        const columns = []
        let used = 0
        children.forEach((child) => {
            if (!columns.length || (columns.at(-1).length && used + POINT_TOP > room)) {
                columns.push([])
                used = 0
            }
            columns.at(-1).push(child)
            used += elementHeight(project, child)
        })
        return columns
    }
    const height = pointRoom ?? MAX_SHEET_HEIGHT
    let columns = split(height + topY)
    // a bend needs room for the line over the top
    if (columns.length > 1) columns = split(height + topY - BEND_ROOM)
    if (columns.length < 2) return drawStack(project, children, stemX, topY, out, BRANCH_STUB, true)
    let x = stemX,
        number = 1,
        extent = null
    columns.forEach((column, index) => {
        const drawn = []
        const stack = drawStack(project, column, x, topY, drawn, BRANCH_STUB, true, number)
        if (index) {
            // up from the highest point of the previous column, over the top of both columns and down along the new stem to its lowest point
            const overY = Math.min(extent.top, stack.top) - BEND_ROOM
            out.push(lineItem(extent.stemX, extent.lastY, extent.stemX, overY), lineItem(extent.stemX, overY, x, overY), lineItem(x, overY, x, topY))
        }
        out.push(...drawn)
        extent = {
            stemX: x,
            lastY: topY - column.slice(0, -1).reduce((sum, child) => sum + elementHeight(project, child), 0),
            right: Math.max(extent?.right ?? x, stack.right),
            top: Math.min(extent?.top ?? topY, stack.top),
            bottom: Math.max(extent?.bottom ?? topY, stack.bottom),
        }
        number += column.length
        x = extent.right + COLUMN_GAP
    })
    return {right: extent.right, top: extent.top - BEND_ROOM, bottom: extent.bottom}
}

// room of a breaker that lies on the line between two elements (a circuit or differentieel under another one: AC -> breaker -> Veranda board)
const INLINE_BREAKER_WIDTH = 64
// The breaker of a circuit or differentieel under another circuit: the symbol lies on its side on the line (the current flows from left to
// right), the line stops at the lower contact and carries on after the lever. Name above it, specs and cable under it; then what hangs under it.
// the lines under a breaker on a line: its specs and cable
const inlineSpecs = (node) => {
    const properties = node.p || {},
        specs =
            node.type === 'diff'
                ? differentialSpecs(properties, node.info)
                : properties.amp
                  ? [ratingText(properties.polen, properties.amp), properties.curve ? curveText(properties.curve) : '']
                  : [node.info]
    return [...specs, properties.kabel].filter(Boolean)
}

function drawInlineBreaker(project, node, x, y, out) {
    const isDifferential = node.type === 'diff',
        properties = node.p || {},
        gridUnit = BREAKER_SIZE / 24,
        centreX = x + INLINE_BREAKER_WIDTH / 2,
        pivotX = centreX - 2 * gridUnit
    out.push(
        lineItem(x, y, pivotX, y),
        {
            kind: 'sym',
            shapes: typeOf(project, isDifferential ? 'diff' : 'kring').shapes,
            x: centreX,
            y: y - gridUnit,
            size: BREAKER_SIZE,
            breaker: 1,
            rotation: 90,
            id: node.id,
        },
        lineItem(pivotX + BREAKER_TIP, y, x + INLINE_BREAKER_WIDTH, y),
    )
    inlineSpecs(node).forEach((line, index) => out.push(textItem(centreX, y + 24 + 13 * index, line, {anchor: 'middle', id: node.id})))
    if (node.label) out.push(textItem(centreX, y - 22, node.label, {bold: 1, fontSize: 13, anchor: 'middle', id: node.id}))
    return drawStack(project, node.children, x + INLINE_BREAKER_WIDTH, y, out, BRANCH_STUB, false)
}

// a drawn item moved by (dx, dy)
const shiftItem = (item, dx, dy) =>
    item.kind === 'line'
        ? {...item, x1: item.x1 + dx, x2: item.x2 + dx, y1: item.y1 + dy, y2: item.y2 + dy}
        : {...item, x: item.x + dx, y: item.y + dy}

// A differentieel that is a circuit of its own is drawn like a circuit: its breaker (the diff symbol), name, specs and cable are those of the
// differentieel, a click on it selects the differentieel, and what hangs under it is drawn above it.
const differentialAsCircuit = (node) => ({
    id: node.id,
    type: 'kring',
    diff: true,
    label: node.label || '',
    info: node.info || '',
    p: {...node.p, bescherming: 'automatisch'},
    children: node.children,
})
// an anonymous circuit without breaker around one element (its id ends with '~': it has no properties and no click area)
const anonymousCircuit = (node) => ({id: node.id + '~', type: 'kring', label: '', info: '', p: {bescherming: 'geen'}, children: [node]})
// elements that are not drawn themselves: the circuits under them are (an empty element of the insert buttons keeps the circuits under it visible)
const TRANSPARENT_TYPES = ['diff', 'zekering', 'hoofdschakelaar', 'leeg', 'overspanning']

// The circuits under a bus or a sub board, in drawing order. A sub board (or, in a sub board, any other element) directly under it is drawn as
// an anonymous circuit without breaker; a differentieel that groups circuits is not drawn itself.
const circuitsOf = (parent, inBoard = false) =>
    parent.children.flatMap((child) => {
        if (child.type === 'kring') return [child]
        if (child.type === 'subbord') return [anonymousCircuit(child)]
        if (isDiffCircuit(child)) return [differentialAsCircuit(child)]
        if (TRANSPARENT_TYPES.includes(child.type)) return circuitsOf(child, inBoard)
        return inBoard ? [anonymousCircuit(child)] : []
    })

// A box element (sub board, domotics): a rectangle with its title, its circuits drawn above it like the circuits on the bus.
function drawBox(project, node, x, y, out) {
    const title = node.p?.tekst || node.label || symbolName(typeOf(project, node.type))
    let nextX = x + 14,
        top = y - 26
    // The circuits of a sub board are laid out by layoutCircuit(), exactly like the circuits on the bus (breaker, specs, plaatsing, in buis,
    // numbers of the elements, click area and latch zone), and moved so that their stem starts on the top edge of the board.
    // the circuits of the board stand on its top edge: that much higher above the bus of the sheet, and with that much less room above them
    const base = circuitBase + 25 - y
    circuitsOf(node, true).forEach((circuit) => {
        const layout = withRoom(base, NESTED_HEIGHT - base, () => layoutCircuit(project, circuit)),
            bounds = layout.items.map(itemBounds).filter(Boolean),
            left = Math.min(...bounds.map((box) => box[0]), 0),
            right = Math.max(layout.w, ...bounds.map((box) => box[2])),
            dx = nextX - left,
            dy = y - 25
        layout.items.forEach((item) => out.push(shiftItem(item, dx, dy)))
        top = Math.min(top, dy + layout.minY)
        nextX = dx + right + ELEMENT_GAP
    })
    const width = Math.max(100, textWidth(title) * 1.4 + 30, node.children.length ? nextX - x - ELEMENT_GAP + 16 : 0)
    out.push(
        {kind: 'rect', x, y: y - 25, w: width, h: 50, id: node.id},
        textItem(x + width / 2, y + 5, title, {bold: 1, anchor: 'middle', fontSize: 14, id: node.id}),
    )
    return {right: x + width, top, bottom: y + 30}
}

// Draws one element (and what hangs under it) with its connection point on (x, y); returns its extent {right, top, bottom}.
function drawNode(project, node, x, y, out) {
    const symbolType = typeOf(project, node.type),
        properties = node.p || {},
        label = node.label || ''
    if (node.type === 'kring' || node.type === 'diff') return drawInlineBreaker(project, node, x, y, out)
    if (BOX_TYPES.has(node.type)) return drawBox(project, node, x, y, out)
    const stackedSockets = socketStackOf(symbolType, properties)?.hor,
        shapes = placedShapesOf(symbolType, properties),
        countText = Number(properties.aantal) > 1 && !stackedSockets ? 'x' + properties.aantal : '',
        details = detailLines(properties.details),
        width = Math.max(SYMBOL_SIZE + 6, textWidth(label) + 8, textWidth(countText) + 8, ...details.map((line) => detailWidth(line) + 8)),
        centreX = x + width / 2
    out.push({kind: 'sym', shapes, x: centreX, y, size: SYMBOL_SIZE, id: node.id, ...(node.r ? {rotation: node.r} : {})})
    const reach = connectionReach(shapes)
    if (reach) {
        const reachLeft = centreX + ((reach[0] - 12) * SYMBOL_SIZE) / 24,
            reachRight = centreX + ((reach[1] - 12) * SYMBOL_SIZE) / 24
        if (reachLeft > x) out.push(lineItem(x, y, reachLeft, y))
        if (node.children.length && reachRight < x + width) out.push(lineItem(reachRight, y, x + width, y))
    }
    if (countText) out.push(textItem(centreX, y + 38, countText, {anchor: 'middle'}))
    if (label) out.push(textItem(centreX, y + (countText ? 54 : 40), label, {anchor: 'middle', italic: 1}))
    // the details hang below the count and the name, one line each, aligned left (flush with the left edge of the element), clickable like the symbol
    const detailsTop = label ? (countText ? 54 : 40) : countText ? 38 : 26
    details.forEach((line, index) =>
        out.push(textItem(x + 4, y + detailsTop + DETAIL_LINE_HEIGHT * (index + 1) + 2, line, {fontSize: DETAIL_FONT_SIZE, id: node.id})),
    )
    let right = x + width,
        top = y - 28,
        bottom =
            y + Math.max(label ? (countText ? 62 : 48) : countText ? 46 : 30, details.length ? detailsTop + DETAIL_LINE_HEIGHT * details.length + 6 : 0)
    if (node.children.length) {
        const stemX = right + ELEMENT_GAP / 2
        out.push(lineItem(right, y, stemX, y))
        const stack = drawStack(project, node.children, stemX, y, out, ELEMENT_GAP / 2, false)
        right = stack.right
        top = Math.min(top, stack.top)
        bottom = Math.max(bottom, stack.bottom)
    }
    return {right, top, bottom}
}

// Bounding box [x1, y1, x2, y2] of a drawn item (text sizes are estimated), used to pack circuits tighter.
const itemBounds = (item) => {
    if (item.kind === 'line')
        return [Math.min(item.x1, item.x2) - 2, Math.min(item.y1, item.y2) - 2, Math.max(item.x1, item.x2) + 2, Math.max(item.y1, item.y2) + 2]
    if (item.kind === 'rect') return [item.x - 2, item.y - 2, item.x + item.w + 2, item.y + item.h + 2]
    if (item.kind === 'sym') {
        // a turned symbol needs more room: half the width of its turned bounding square
        const angle = ((item.rotation || 0) * Math.PI) / 180,
            half = (SYMBOL_SIZE / 2) * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))) + 4
        return [item.x - half, item.y - half, item.x + half, item.y + half]
    }
    if (item.kind === 'circ') return [item.x - item.r - 2, item.y - item.r - 2, item.x + item.r + 2, item.y + item.r + 2]
    if (item.kind !== 'text') return null
    const fontSize = item.fontSize || 13,
        width = String(item.text ?? '').length * fontSize * (item.bold ? 0.7 : 0.62),
        ascent = fontSize * 0.85,
        descent = fontSize * 0.3
    if (item.vertical) {
        // rotated -90 degrees: the text runs upwards from (x, y)
        const [from, to] =
            item.anchor === 'middle' ? [item.y - width / 2, item.y + width / 2] : item.anchor === 'end' ? [item.y, item.y + width] : [item.y - width, item.y]
        return [item.x - ascent, from, item.x + descent, to]
    }
    const [from, to] =
        item.anchor === 'middle' ? [item.x - width / 2, item.x + width / 2] : item.anchor === 'end' ? [item.x - width, item.x] : [item.x, item.x + width]
    return [from, item.y - ascent, to, item.y + descent]
}

/**
 * The layout of one circuit with its stem at x = 30 (or further right when the cable placement needs room) and the bus at y = 0:
 * {node, w: width, items, minY: highest point}.
 */
export function layoutCircuit(project, node) {
    const out = [],
        properties = node.p || {},
        withPlacement = hasPlacement(properties),
        stemX = withPlacement ? 30 + PLACEMENT_WIDTH : 30,
        // the name sits left of the placement symbols
        nameX = stemX - 14 - (withPlacement ? PLACEMENT_WIDTH : 0),
        unprotected = properties.bescherming === 'geen',
        cable = properties.kabel || '',
        // the specs of the breaker and its short-circuit rating stand next to each other right of the stem, a bit above the bus; the cable
        // stands above them along the stem
        specs = unprotected
            ? []
            : node.diff
              ? differentialSpecs(properties, node.info)
              : properties.amp
                ? [ratingText(properties.polen, properties.amp), properties.curve ? curveText(properties.curve) : null]
                : [node.info || null],
        specLines = specs.filter(Boolean),
        shortCircuitText = !unprotected && properties.kortsl && !node.diff ? `${properties.kortsl}000` : null,
        columnX = (index) => stemX + SPEC_OFFSET + 13 * index,
        shortCircuitX = columnX(specLines.length) + 7,
        // (textWidth estimates short for these vertical texts: 20% extra so they never run into each other or into the first point)
        specsTop = SPEC_BOTTOM + 1.2 * Math.max(0, ...specLines.map(textWidth), shortCircuitText ? textWidth(shortCircuitText) + 8 : 0),
        cableBottom = specLines.length || shortCircuitText ? specsTop + 10 : SPEC_BOTTOM,
        cableTop = cable ? cableBottom + 1.2 * textWidth(cable) : specsTop,
        // the long name of the circuit and its extra text stand left of the stem, below the number of the first point
        nameColumn = (node.label || '').length > 3 ? 12 + textWidth(node.label) + 8 + (properties.tekst ? textWidth(properties.tekst) : 0) : properties.tekst ? 72 + textWidth(properties.tekst) : 0,
        // the first point: above the breaker, and with what hangs under it (count, name, details) clear of the texts along the stem
        topY = -Math.max(140, cableTop + 12 + (node.children[0] ? textBelow(node.children[0]) : 0), nameColumn * 1.2 + 34)
    const stack = drawColumns(project, node.children, stemX, topY, out)
    if (unprotected) out.push(lineItem(stemX, 0, stemX, topY))
    else {
        // the line does not run through the breaker: it stops at the lower contact, the lever swings up and to the left
        // (with its filled block, see the kring symbol), the line carries on above the lever
        out.push(
            lineItem(stemX, 0, stemX, -30),
            breakerItem(project, node.diff ? 'diff' : 'kring', stemX, -30),
            lineItem(stemX, -30 - BREAKER_TIP, stemX, topY),
        )
    }
    const longName = (node.label || '').length > 3
    out.push(
        longName
            ? textItem(nameX, -6, node.label, {bold: 1, fontSize: 14, vertical: 1, id: node.id})
            : textItem(stemX - 14, -6, node.label || '', {bold: 1, fontSize: 16, anchor: 'middle', id: node.id}),
    )
    if (properties.tekst)
        out.push(textItem(nameX, longName ? -12 - textWidth(node.label) - 8 : -72, properties.tekst, {bold: 1, fontSize: 14, vertical: 1, id: node.id}))
    specLines.forEach((line, index) => out.push(textItem(columnX(index), -SPEC_BOTTOM, line, {vertical: 1})))
    if (shortCircuitText)
        out.push(
            {kind: 'rect', x: shortCircuitX - 11, y: -SPEC_BOTTOM - textWidth(shortCircuitText) - 4, w: 15, h: textWidth(shortCircuitText) + 8},
            textItem(shortCircuitX, -SPEC_BOTTOM, shortCircuitText, {vertical: 1}),
        )
    if (cable) out.push(textItem(columnX(0), -cableBottom, cable, {vertical: 1}))
    out.push(...placementItems(properties, stemX))
    // A click anywhere on the stem selects the circuit (not only on its letter): a transparent area over the whole stem, drawn first so the
    // elements of the circuit and their own clicks stay on top. (The invisible circuit around a sub board has no properties: no area.)
    if (!String(node.id).endsWith('~')) {
        const areaLeft = (properties.tekst || longName ? nameX : stemX) - 14,
            // The latch zone: a narrow strip along the whole stem, from above the breaker to well above the top branch. A symbol that is dragged
            // into it latches onto the circuit and becomes its next branch, also in the empty space above the last branch where nothing is drawn yet.
            zoneTop = Math.min(stack.top, topY) - STEM_ZONE_REACH
        out.unshift({kind: 'stem', x: stemX - STEM_ZONE_HALF_WIDTH, y: zoneTop, w: 2 * STEM_ZONE_HALF_WIDTH, h: -60 - zoneTop, id: node.id})
        out.unshift({kind: 'hit', x: areaLeft, y: topY, w: stemX + 52 - areaLeft, h: -topY + 6, id: node.id})
    }
    return {node, w: Math.max(stack.right + 14, shortCircuitText ? shortCircuitX + 14 : columnX(specLines.length), stemX + 56), items: out, minY: Math.min(stack.top, topY - 60)}
}

/**
 * The head of the board (kWh meter and main breaker of the connection, in drawing units left of the bus) made of the symbols of the library.
 * Every part belongs to the aansluiting element: clicking it selects that element, like the elements of a circuit.
 */
export const headItems = (project, head) => {
    const out = [],
        id = head.id,
        meterUnit = METER_SIZE / 24
    if (head.kwh) {
        // the symbol's box runs from x 35 to 85 and its supply line starts at x 10, the line carries on to the main breaker (or the end of the head)
        // (the head stays within HEAD_DEPTH below the bus, so the bus can go low on the sheet)
        out.push({kind: 'sym', shapes: typeOf(project, 'teller').shapes, x: 35 + 4 * meterUnit, y: METER_Y, size: METER_SIZE, id})
        out.push(lineItem(85, METER_Y, head.main ? 197 : 130, METER_Y))
        if (head.main) out.push(lineItem(197, METER_Y, 197, 66))
        if (head.properties?.kabel) out.push(textItem(110, METER_Y + 18, head.properties.kabel, {fontSize: 13}))
    }
    if (head.main) {
        // the supply comes from the meter below: the line stops at the lower contact (y 66), the lever swings up and to the left towards the
        // busbar, the line carries on above the lever up to the busbar
        out.push(
            breakerItem(project, head.main === 'differentieel' ? 'diff' : 'hoofdschakelaar', 197, 66, {id}),
            lineItem(197, 0, 197, 66 - BREAKER_TIP),
        )
        const properties = head.properties
        ;[
            [head.main === 'differentieel' ? `Δ${properties.delta || 300}mA` : null, 0],
            [ratingText(properties.polen, properties.amp || 40), 1],
            [properties.diffType ? typeText(properties.diffType) : null, 2],
        ]
            .filter(([line]) => line)
            .forEach(([line, column]) => out.push(textItem(210 + 13 * column, 66, line, {vertical: 1, id})))
    }
    return out
}

// the elements between the connection and the bus that the bus may hang under
const MAIN_LINE_TYPES = ['teller', 'hoofdschakelaar', 'diff', 'bord']

// Lays the circuits out left to right along a bus: [{...layoutCircuit, x, newSheet}] and where the bus ends.
// Circuits are placed left to right. A circuit that is lower than the overhang of earlier circuits on the same sheet
// (their wide rows sit higher up) slides left underneath that overhang, which saves width (and sometimes a whole sheet).
// Without such an overhang the spacing is exactly `previous width + CIRCUIT_SPACING`. `newSheet` marks the first circuit of a new sheet.
// A circuit that makes the sheet wider than MAX_SHEET_WIDTH still joins it when the sheet does not get smaller for it: a sheet with a
// circuit that is too high is drawn smaller anyway and has room left at its end (no sheet with a single small circuit after it).
function layoutBus(project, nodes) {
    // a circuit with sub boards that is too wide for one sheet is cut into parts (see splitWide)
    const circuitNodes = nodes.flatMap((node) => {
        const layout = layoutCircuit(project, node),
            room = widthFor(-layout.minY)
        return layout.w > room && holdsBox(node) ? splitWide(project, node, room) : [node]
    })
    let sheetStartX = 0,
        right = 0,
        sheetHeight = MIN_SHEET_HEIGHT,
        placedOnSheet = []
    const circuits = circuitNodes.map((circuitNode, index) => {
        const layout = layoutCircuit(project, circuitNode),
            bounds = layout.items.map(itemBounds).filter(Boolean),
            drawnRight = bounds.reduce((max, box) => Math.max(max, box[2]), 0),
            placement = {x: 0, bounds, padding: Math.max(0, layout.w - drawnRight)}
        let x = index ? right + CIRCUIT_SPACING : BUS_START_X,
            newSheet = false
        if (placedOnSheet.length) {
            let lowest = placedOnSheet.at(-1).x + CIRCUIT_SPACING
            for (const earlier of placedOnSheet) {
                let overhang = -Infinity
                for (const box of earlier.bounds) if (box[3] >= layout.minY - 12 && box[1] <= 6) overhang = Math.max(overhang, box[2])
                if (overhang > -Infinity) lowest = Math.max(lowest, earlier.x + overhang + earlier.padding + CIRCUIT_SPACING)
            }
            x = Math.min(x, lowest)
            const width = Math.max(right, x + layout.w) - sheetStartX,
                // the bus runs CIRCUIT_SPACING past the last circuit
                scaleNow = sheetScale(right + CIRCUIT_SPACING - sheetStartX, sheetHeight),
                scaleWith = sheetScale(width + CIRCUIT_SPACING, Math.max(sheetHeight, -layout.minY))
            if (width > MAX_SHEET_WIDTH && scaleWith < scaleNow - 1e-9) {
                x = right + CIRCUIT_SPACING
                sheetStartX = x - 10
                sheetHeight = MIN_SHEET_HEIGHT
                placedOnSheet = []
                newSheet = true
            }
        }
        sheetHeight = Math.max(sheetHeight, -layout.minY)
        placement.x = x
        placedOnSheet.push(placement)
        right = newSheet || index === 0 ? x + layout.w : Math.max(right, x + layout.w)
        return {...layout, x, newSheet}
    })
    return {circuits, end: circuitNodes.length ? right + CIRCUIT_SPACING : BUS_START_X}
}

// How wide a circuit can be on a sheet of its own: a high circuit makes the sheet smaller anyway (sheetScale), which leaves more room in width.
const widthFor = (height) => DRAWING_WIDTH / Math.min(MM_PER_UNIT, DRAWING_HEIGHT / (height + HEAD_DEPTH)) - BUS_START_X - CIRCUIT_SPACING

const isBox = (node) => BOX_TYPES.has(node.type) && node.children.length > 0
// does the drawing under `node` hold a box (sub board, domotics) with circuits?
const holdsBox = (node) => node.children.some((child) => isBox(child) || holdsBox(child))
// the circuits of the outermost box under `node` (where `node` can be cut), or none
const cutPoints = (node) => {
    const queue = [...node.children]
    while (queue.length) {
        const child = queue.shift()
        if (isBox(child)) return child.children
        queue.push(...child.children)
    }
    return []
}
// a part that stays whole when it fits: it holds no box that holds another box (one sub board with its circuits, or a plain circuit)
const keptWhole = (node) => !node.children.some((child) => (isBox(child) ? child.children.some(holdsBox) || child.children.some(isBox) : !keptWhole(child)))

/**
 * Cuts a circuit with sub boards (or domotics boxes) in it that is too wide for one sheet into parts that each fit within `room`. The parts are
 * filled from left to right: a circuit in a box that holds deeper boxes is opened up into the circuits of its own box, while a circuit that
 * holds at most one box with plain circuits (a sub board with its circuits) stays whole and goes to the next part when it does not fit
 * anymore (it is only cut itself when it is too wide on its own). Every part repeats the way down to what it holds: the circuit, its breakers
 * and the boxes it hangs in, each with only the circuits of that part; the other things along the way are drawn in the first part only.
 * Each part becomes a circuit on the bus of its own, on the next sheets.
 */
function splitWide(project, circuit, room) {
    const groups = [new Set()]
    // the copy of `node` with only what the part holds (`chosen`), and the way down to it
    const copyOf = (node, chosen, first) => ({
        ...node,
        children: node.children
            .filter((child) => chosen.has(child) || holds(child, chosen) || (first && !isBox(node) && !holdsBox(child)))
            .map((child) => (chosen.has(child) || !holds(child, chosen) ? child : copyOf(child, chosen, first))),
    })
    const holds = (node, chosen) => node.children.some((child) => chosen.has(child) || holds(child, chosen))
    const fits = (chosen, first) => layoutCircuit(project, copyOf(circuit, chosen, first)).w <= room
    const place = (piece) => {
        const current = groups.at(-1),
            first = groups.length === 1
        if (!keptWhole(piece)) return cutPoints(piece).forEach(place)
        if (!current.size || fits(new Set([...current, piece]), first)) return current.add(piece)
        groups.push(new Set([piece]))
        // too wide even on its own: cut it as well
        if (!fits(groups.at(-1), false) && cutPoints(piece).length) {
            groups.pop()
            groups.push(new Set())
            cutPoints(piece).forEach(place)
        }
    }
    cutPoints(circuit).forEach(place)
    const parts = groups.filter((group) => group.size)
    return parts.length > 1 ? parts.map((group, index) => copyOf(circuit, group, index === 0)) : [circuit]
}

/** The layout of one eendraadschema page: {circuits: [{...layoutCircuit, x, newSheet}], end, bus, head}. */
export function layoutBoard(project, page) {
    const tree = page.tree,
        root = tree.find((node) => node.type === 'aansluiting') || null
    const findBus = (node) => {
        if (node.type === 'bord') return node
        for (const child of node.children)
            if (MAIN_LINE_TYPES.includes(child.type)) {
                const bus = findBus(child)
                if (bus) return bus
            }
        return null
    }
    const bus = (root && findBus(root)) || flatten(tree).find((node) => node.type === 'bord') || null
    const board = {...layoutBus(project, bus ? circuitsOf(bus) : []), bus}
    const rootProperties = root?.p
    const head = {
        id: root?.id,
        properties: rootProperties,
        kwh: !!root && (rootProperties ? rootProperties.teller !== false : flatten([root]).some((node) => node.type === 'teller')),
        main:
            rootProperties?.bescherming === 'differentieel' || rootProperties?.bescherming === 'automatisch' ? rootProperties.bescherming : null,
        ground: !!bus && (!!bus.p?.geaard || flatten(tree).some((node) => node.type === 'aarding')),
        // the earth belongs to the distribution board
        groundId: bus?.id,
    }
    board.head = {...head, items: headItems(project, head)}
    return board
}


/** The board cut into printed sheets: [{from, to (circuit indexes), x0, x1, minY, first, last}]. */
export function sheetSlices(board) {
    const slices = []
    let current = null
    board.circuits.forEach((circuit, index) => {
        if (!current || circuit.newSheet) {
            current = {from: index, to: index, x0: current ? circuit.x - 10 : 0, x1: 0, minY: -MIN_SHEET_HEIGHT}
            slices.push(current)
        }
        current.to = index + 1
        current.x1 = Math.max(current.x1, circuit.x + circuit.w)
        current.minY = Math.min(current.minY, circuit.minY)
    })
    if (!slices.length) slices.push({from: 0, to: 0, x0: 0, x1: 0, minY: -MIN_SHEET_HEIGHT})
    slices.forEach((slice, index) => {
        slice.first = index === 0
        slice.last = index === slices.length - 1
        if (slice.last) slice.x1 = Math.max(slice.x1, board.end)
        if (slice.first) slice.x1 = Math.max(slice.x1, 260)
    })
    return slices
}

/**
 * Every printed sheet of the project: [{kind: 'een' | 'sit', page, board, slice, number, total}].
 * `perTab`: number the eendraad sheets and the situatieschema pages separately (as shown in their own tab: Blad 6/6 and Blad 1/1);
 * otherwise one continuous numbering over all printed sheets (PDF export).
 */
export function sheetPlan(project, perTab = false) {
    const plan = [
        ...project.een.flatMap((page) => {
            const board = layoutBoard(project, page)
            return sheetSlices(board).map((slice) => ({kind: 'een', page, board, slice}))
        }),
        ...project.sit.map((page) => ({kind: 'sit', page})),
    ]
    if (!perTab) return plan.map((sheet, index) => ({...sheet, number: index + 1, total: plan.length}))
    const counted = {},
        totals = {}
    plan.forEach((sheet) => (totals[sheet.kind] = (totals[sheet.kind] || 0) + 1))
    return plan.map((sheet) => ({...sheet, number: (counted[sheet.kind] = (counted[sheet.kind] || 0) + 1), total: totals[sheet.kind]}))
}


/** The numbering {number, total} of a page within its own tab. */
export const pageNumbering = (project, page) => {
    const sheet = sheetPlan(project, true).find((candidate) => candidate.page === page)
    return sheet ? {number: sheet.number, total: sheet.total} : {number: 0, total: 0}
}
