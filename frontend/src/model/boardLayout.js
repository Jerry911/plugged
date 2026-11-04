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
import {symbolName, typeOf} from '../symbols/symbolLibrary.js'
import {t} from '../i18n/translate.js'
import {flatten, newId} from './tree.js'

export const MM_PER_UNIT = 0.16,
    // a sheet holds at most this width of circuits; the next circuit starts a new sheet
    MAX_SHEET_WIDTH = 1700,
    BUS_START_X = 20,
    // horizontal space between two circuits
    CIRCUIT_SPACING = 24,
    // length of the line from the stem of a circuit to an element on it
    BRANCH_STUB = 24,
    SYMBOL_SIZE = 46,
    ELEMENT_GAP = 20,
    // drag & drop latch zone along the stem of a circuit: half its width, and how far it reaches above the top branch (room for the next one)
    STEM_ZONE_HALF_WIDTH = 16,
    STEM_ZONE_REACH = 150
/** Elements drawn as a box with their own circuits inside (a domotics cabinet, a sub board). */
export const BOX_TYPES = new Set(['domotica', 'subbord'])
const textWidth = (text) => String(text || '').length * 6.6

// Details of an element (brand, type, serial number, Pmax, Umax, ...): one line per entry. Lines are separated by Enter (a real new line)
// or by '|' (how the eendraadschema stores them), so both a typed text area and an imported file give the same lines.
export const DETAIL_FONT_SIZE = 11,
    DETAIL_LINE_HEIGHT = 13
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
    METER_SIZE = (24 * 50) / 14

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
    shapes.forEach((shape) => {
        if (shape.t === 'circle' && Math.abs(shape.cy - 12) <= shape.r) {
            const halfChord = Math.sqrt(shape.r ** 2 - (shape.cy - 12) ** 2)
            cover(shape.cx - halfChord, shape.cx + halfChord)
        } else if (shape.t === 'rect' && shape.y <= 12 && 12 <= shape.y + shape.h) cover(shape.x, shape.x + shape.w)
        else if (shape.t === 'line' && shape.y1 === 12 && shape.y2 === 12) cover(Math.min(shape.x1, shape.x2), Math.max(shape.x1, shape.x2))
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
const ownHeight = (node) => (node.label ? 100 : Number(node.p?.aantal) > 1 ? 80 : 66) + detailLines(node.p?.details).length * DETAIL_LINE_HEIGHT
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
function drawStack(project, children, stemX, y, out, stubLength, numbered) {
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
        if (numbered) out.push(textItem(stemX - 4, childY - 10, child.p?.nr || String(index + 1), {fontSize: 13, anchor: 'end'}))
        const extent = drawNode(project, child, stemX + stubLength, childY, out)
        right = Math.max(right, extent.right)
        top = Math.min(top, extent.top)
        bottom = Math.max(bottom, extent.bottom)
    })
    if (lastY !== y) out.push(lineItem(stemX, y, stemX, lastY))
    return {right, top, bottom}
}

// room of a breaker that lies on the line between two elements (a circuit or differentieel under another one: AC -> breaker -> Veranda board)
const INLINE_BREAKER_WIDTH = 64
// The breaker of a circuit or differentieel under another circuit: the symbol lies on its side on the line (the current flows from left to
// right), the line stops at the lower contact and carries on after the lever. Name above it, specs and cable under it; then what hangs under it.
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
    const specs = isDifferential
        ? differentialSpecs(properties, node.info)
        : properties.amp
          ? [ratingText(properties.polen, properties.amp), properties.curve ? curveText(properties.curve) : '']
          : [node.info]
    ;[...specs, properties.kabel]
        .filter(Boolean)
        .forEach((line, index) => out.push(textItem(centreX, y + 24 + 13 * index, line, {anchor: 'middle', id: node.id})))
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
    circuitsOf(node, true).forEach((circuit) => {
        const layout = layoutCircuit(project, circuit),
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
        topY = -Math.max(215, 150 + textWidth(cable) + 40)
    const stack = drawStack(project, node.children, stemX, topY, out, BRANCH_STUB, true)
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
    if (!unprotected) {
        const specs = node.diff
                ? differentialSpecs(properties, node.info)
                : properties.amp
                  ? [ratingText(properties.polen, properties.amp), properties.curve ? curveText(properties.curve) : null]
                  : [node.info || null],
            shortCircuitText = properties.kortsl && !node.diff ? `${properties.kortsl}000` : null
        specs.filter(Boolean).forEach((line, index) => out.push(textItem(stemX + 13 + 13 * index, -62, line, {vertical: 1})))
        if (shortCircuitText)
            out.push(
                {kind: 'rect', x: stemX + 33, y: -66 - textWidth(shortCircuitText) - 4, w: 15, h: textWidth(shortCircuitText) + 8},
                textItem(stemX + 44, -66, shortCircuitText, {vertical: 1}),
            )
    }
    if (cable) out.push(textItem(stemX + 13, -150, cable, {vertical: 1}))
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
    return {node, w: Math.max(stack.right + 14, stemX + 56), items: out, minY: Math.min(stack.top, topY - 60)}
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
        out.push({kind: 'sym', shapes: typeOf(project, 'teller').shapes, x: 35 + 4 * meterUnit, y: 96, size: METER_SIZE, id})
        out.push(lineItem(85, 96, head.main ? 197 : 130, 96))
        if (head.main) out.push(lineItem(197, 96, 197, 66))
        if (head.properties?.kabel) out.push(textItem(110, 114, head.properties.kabel, {fontSize: 13}))
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
    const busCircuits = bus ? circuitsOf(bus) : []
    // Circuits are placed left to right. A circuit that is lower than the overhang of earlier circuits on the same sheet
    // (their wide rows sit higher up) slides left underneath that overhang, which saves width (and sometimes a whole sheet).
    // Without such an overhang the spacing is exactly `previous width + CIRCUIT_SPACING`. `newSheet` marks the first circuit of a new sheet.
    let sheetStartX = 0,
        right = 0,
        placedOnSheet = []
    const circuits = busCircuits.map((circuitNode, index) => {
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
            if (Math.max(right, x + layout.w) - sheetStartX > MAX_SHEET_WIDTH) {
                x = right + CIRCUIT_SPACING
                sheetStartX = x - 10
                placedOnSheet = []
                newSheet = true
            }
        }
        placement.x = x
        placedOnSheet.push(placement)
        right = newSheet || index === 0 ? x + layout.w : Math.max(right, x + layout.w)
        return {...layout, x, newSheet}
    })
    const end = busCircuits.length ? right + CIRCUIT_SPACING : BUS_START_X,
        rootProperties = root?.p
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
    return {circuits, end, bus, head: {...head, items: headItems(project, head)}}
}

/** The board cut into printed sheets: [{from, to (circuit indexes), x0, x1, minY, first, last}]. */
export function sheetSlices(board) {
    const slices = []
    let current = null
    board.circuits.forEach((circuit, index) => {
        if (!current || circuit.newSheet) {
            current = {from: index, to: index, x0: current ? circuit.x - 10 : 0, x1: 0, minY: -120}
            slices.push(current)
        }
        current.to = index + 1
        current.x1 = Math.max(current.x1, circuit.x + circuit.w)
        current.minY = Math.min(current.minY, circuit.minY)
    })
    if (!slices.length) slices.push({from: 0, to: 0, x0: 0, x1: 0, minY: -120})
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
