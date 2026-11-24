// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The eendraadschema made from the situatieschema: the loose symbols on the plans (drawn from the palette, not yet linked to an element of the
// eendraadschema) become circuits, by their text. "B4" is point 4 of circuit B: everything with that text is one point, its switches in series
// and the lamp(s) under the last switch (B4 with two wissels and a lamp: wissel -> wissel -> lichtpunt). A circuit with only lamps and their
// switches gets a 16 A breaker and 3G1,5 cable, any other one 20 A and 3G2,5.
// The new circuits come under the existing board (a new project has one); a letter that is already a circuit gets the new points at its end.
// The board always ends up under a complete aansluiting net (kWh meter and main differentieel, the defaults of a new project): it gets one when
// it has none, and an aansluiting without its properties (an older project) gets them, so the head of the eendraadschema is drawn. Nothing
// else that exists changes. The symbols on the plan are then linked to their new elements, so plan and eendraadschema stay one.
// Pure: the symbol types come in through `typeOf(project, key)`.
import {flatten, newId} from './tree.js'
import {circuitInfo, defaultProperties, defaultTree} from './boardLayout.js'
import {circuitMarks} from './project.js'
import {itemRooms, roomList} from './rooms.js'

/** The lamps, and the switches and other controls that turn them on: a circuit of only these is a lighting circuit. */
export const LIGHT_TYPES = new Set(['lichtpunt', 'wandlamp', 'tl', 'spot', 'led', 'noodlicht', 'lichtcircuit'])
export const CONTROL_TYPES = new Set([
    'schakelaar',
    'schakelaar2',
    'schakelaar3',
    'verklikker',
    'wissel',
    'wissel2',
    'omschakelaar',
    'kruis',
    'dimmer',
    'drukknop',
    'beweging',
    'teleruptor',
    'dimmermodule',
    'relais',
    'minuterie',
])
/** The breaker and cable of a lighting circuit and of any other circuit. */
export const LIGHTING_CIRCUIT = {amp: 16, kabel: 'XVB Cca 3G1,5'},
    POWER_CIRCUIT = {amp: 20, kabel: 'XVB Cca 3G2,5'}
/** The breakers to choose from for a new circuit, and the cable that goes with each (copper, as the AREI asks for a house). */
export const BREAKERS = [6, 10, 16, 20, 25, 32, 40]
export const CABLE_FOR_BREAKER = {
    6: 'XVB Cca 3G1,5',
    10: 'XVB Cca 3G1,5',
    16: 'XVB Cca 3G1,5',
    20: 'XVB Cca 3G2,5',
    25: 'XVB Cca 3G4',
    32: 'XVB Cca 3G6',
    40: 'XVB Cca 3G10',
}
/** Cables to suggest (any other text can be typed). */
export const CABLES = [
    'XVB Cca 3G1,5',
    'XVB Cca 3G2,5',
    'XVB Cca 3G4',
    'XVB Cca 3G6',
    'XVB Cca 3G10',
    'XVB Cca 5G1,5',
    'XVB Cca 5G2,5',
    'EXVB Cca 3G1,5',
    'EXVB Cca 3G2,5',
    'VOB 3G1,5 in buis',
    'VOB 3G2,5 in buis',
]

/** The circuit and point of a text such as "B4", "b 4" or "AA12": {letter, number}, or null when it is not one. */
export const parseMark = (text) => {
    const match = /^\s*([A-Za-z]{1,3})\s*[-.]?\s*(\d{1,3})\s*$/.exec(text || '')
    return match && +match[2] > 0 ? {letter: match[1].toUpperCase(), number: +match[2]} : null
}

/** Is a symbol of this type a part of an electrical circuit (not furniture, not a part of the board, not a symbol of a control diagram)? */
const isCircuitElement = (symbolType) => (symbolType.parents || []).length > 0 && symbolType.cat !== 'Verdeling'

const isLighting = (type) => LIGHT_TYPES.has(type) || CONTROL_TYPES.has(type)

/**
 * What generating would do, without doing it: {circuits, skipped, linked}.
 * circuits: [{letter, existing (a circuit of the eendraadschema that gets points), amp, kabel (new circuits only), points: [{number, types}]}]
 * skipped: [{pageIndex, item, reason}] with reason 'noLabel' (no text like A1) or 'taken' (that point is already in the eendraadschema)
 */
export const planOneWire = (project, typeOf, choices = {}) => {
    const loose = [],
        skipped = []
    project.sit.forEach((page, pageIndex) =>
        page.items.forEach((item) => {
            if (item.kind !== 'sym' || item.node || !item.type) return
            if (!isCircuitElement(typeOf(project, item.type))) return
            const mark = parseMark(item.mark)
            if (mark) loose.push({pageIndex, item, ...mark})
            else skipped.push({pageIndex, item, reason: 'noLabel'})
        }),
    )
    const taken = new Set(circuitMarks(project).values()),
        existing = new Map()
    project.een.forEach((page) =>
        flatten(page.tree).forEach((node) => {
            if (node.type === 'kring' && node.label && !existing.has(node.label.toUpperCase())) existing.set(node.label.toUpperCase(), node)
        }),
    )
    const byLetter = new Map()
    loose.forEach((entry) => {
        if (taken.has(entry.letter + entry.number) || (existing.has(entry.letter) && taken.has(existing.get(entry.letter).label + entry.number))) {
            skipped.push({pageIndex: entry.pageIndex, item: entry.item, reason: 'taken'})
            return
        }
        if (!byLetter.has(entry.letter)) byLetter.set(entry.letter, new Map())
        const points = byLetter.get(entry.letter)
        if (!points.has(entry.number)) points.set(entry.number, [])
        points.get(entry.number).push(entry)
    })
    const rooms = itemRooms(project)
    const circuits = [...byLetter.keys()].sort(compareLetters).map((letter) => {
        const points = [...byLetter.get(letter).entries()].sort(([a], [b]) => a - b).map(([number, entries]) => ({number, entries})),
            lighting = points.every((point) => point.entries.every((entry) => isLighting(entry.item.type))),
            circuit = existing.get(letter)
        const chosen = choices[letter] || {}
        return {
            letter: circuit ? circuit.label : letter,
            existing: circuit || null,
            ...(circuit ? {} : lighting ? LIGHTING_CIRCUIT : POWER_CIRCUIT),
            ...(circuit ? {} : {...(chosen.amp ? {amp: chosen.amp} : {}), ...(chosen.kabel?.trim() ? {kabel: chosen.kabel.trim()} : {})}),
            points: points.map((point) => ({
                number: point.number,
                types: orderedEntries(point.entries).map((entry) => entry.item.type),
                entries: point.entries,
            })),
            // the rooms its symbols stand in (by the room names on the plan): the name of a new circuit
            rooms: roomList(
                rooms,
                points.flatMap((point) => point.entries.map((entry) => entry.item)),
            ),
        }
    })
    return {circuits, skipped, linked: circuits.reduce((sum, circuit) => sum + circuit.points.reduce((count, point) => count + point.entries.length, 0), 0)}
}

// A before B, Z before AA
const compareLetters = (a, b) => a.length - b.length || a.localeCompare(b)

// the switches of a point first (as they lie on the plan), then the rest
const orderedEntries = (entries) => [
    ...entries.filter((entry) => CONTROL_TYPES.has(entry.item.type)),
    ...entries.filter((entry) => !CONTROL_TYPES.has(entry.item.type)),
]

const elementOf = (item) => ({id: newId(), type: item.type, label: '', info: '', ...(item.h ? {p: {h: true}} : {}), children: []})

// The entries of a point as groups: every switch on its own (two wissels are two switches in series), but the same lamp or socket more than
// once (four spots marked B4) is one element with its count, as the eendraadschema draws it (one spot, x4).
const groupedEntries = (entries) => {
    const groups = [],
        byKind = new Map()
    entries.forEach((entry) => {
        if (CONTROL_TYPES.has(entry.item.type)) return groups.push([entry])
        const kind = entry.item.type + (entry.item.h ? '|h' : '')
        if (byKind.has(kind)) byKind.get(kind).push(entry)
        else {
            const group = [entry]
            byKind.set(kind, group)
            groups.push(group)
        }
    })
    return groups
}

// One point: its switches in series, the rest under the last switch; without a switch the rest hangs under the first element. `link` gets
// item id -> element id (the symbols of one group all link to the same element).
const pointElement = (point, link) => {
    const entries = orderedEntries(point.entries),
        elements = groupedEntries(entries).map((group) => {
            const element = elementOf(group[0].item)
            if (group.length > 1) element.p = {...element.p, aantal: group.length}
            group.forEach((entry) => link.set(entry.item.id, element.id))
            return element
        }),
        switches = entries.filter((entry) => CONTROL_TYPES.has(entry.item.type)).length,
        head = elements[0]
    let last = head
    elements.slice(1).forEach((element, index) => {
        last.children.push(element)
        if (index + 1 < switches) last = element
    })
    return head
}

// the points under a circuit that already has `count` of them: a number that is not its position is written on the point (p.nr)
const numbered = (element, number, position) => (number === position ? element : {...element, p: {...element.p, nr: String(number)}})

// the parts of the main line that an aansluiting of an older project can have as elements of their own (instead of as its properties)
const MAIN_LINE_PARTS = new Set(['teller', 'hoofdschakelaar', 'diff'])

// the path of elements from the top of `nodes` down to the element `id` (both included), or null
const pathTo = (nodes, id) => {
    for (const node of nodes) {
        if (node.id === id) return [node]
        const below = pathTo(node.children, id)
        if (below) return [node, ...below]
    }
    return null
}

const connection = (children) => ({...defaultTree()[0], children})

/**
 * A page tree where the board `boardId` hangs under a complete aansluiting net: the top element above the board is put under a new
 * aansluiting when there is none above it; an aansluiting without its properties gets those of a new project when nothing of the main line
 * (a teller, hoofdschakelaar or differentieel element) lies between it and the board, otherwise the head would not be drawn.
 */
const withConnection = (tree, boardId) => {
    const path = pathTo(tree, boardId),
        above = path.slice(0, -1),
        aansluiting = above.find((node) => node.type === 'aansluiting')
    if (!aansluiting) return tree.map((node) => (node.id === path[0].id ? connection([node]) : node))
    if (aansluiting.p || above.some((node) => MAIN_LINE_PARTS.has(node.type))) return tree
    return mapTree(tree, (node) => (node.id === aansluiting.id ? {...node, p: {...defaultTree()[0].p}} : node))
}

/** The board the new circuits hang under: the first one of the eendraadschema (a page without any gets the tree of a new project). */
const withBoard = (project) => {
    for (let pageIndex = 0; pageIndex < project.een.length; pageIndex++) {
        const board = flatten(project.een[pageIndex].tree).find((node) => node.type === 'bord')
        if (board)
            return {
                project: {
                    ...project,
                    een: project.een.map((page, index) => (index === pageIndex ? {...page, tree: withConnection(page.tree, board.id)} : page)),
                },
                boardId: board.id,
            }
    }
    const tree = defaultTree(),
        boardId = tree[0].children[0].id,
        een = project.een.length
            ? project.een.map((page, index) => (index ? page : {...page, tree: [...page.tree, ...tree]}))
            : [{id: newId(), name: '1', tree}]
    return {project: {...project, een}, boardId}
}

const mapTree = (nodes, change) => nodes.map((node) => change({...node, children: mapTree(node.children, change)}))

/**
 * Makes the circuits of planOneWire: {project, plan}. `choices` = {letter: {amp, kabel}}: the breaker and cable chosen for a new circuit
 * in the dialog (a blank cable keeps the one of the plan). The new circuits are added under the board, the points of an existing circuit at its
 * end, and every symbol that became an element is linked to it (its own text, type and waterproof property now come from the element).
 */
export const generateOneWire = (project, typeOf, choices = {}) => {
    const plan = planOneWire(project, typeOf, choices)
    if (!plan.circuits.length) return {project, plan}
    const link = new Map(),
        additions = new Map(),
        fresh = []
    plan.circuits.forEach((circuit) => {
        if (circuit.existing) {
            const start = circuit.existing.children.length
            additions.set(
                circuit.existing.id,
                circuit.points.map((point, index) => numbered(pointElement(point, link), point.number, start + index + 1)),
            )
        } else {
            const p = {...defaultProperties('kring'), amp: circuit.amp, kabel: circuit.kabel, ...(circuit.rooms ? {tekst: circuit.rooms} : {})}
            fresh.push({
                id: newId(),
                type: 'kring',
                label: circuit.letter,
                info: circuitInfo(p),
                p,
                children: circuit.points.map((point, index) => numbered(pointElement(point, link), point.number, index + 1)),
            })
        }
    })
    // the board, with a complete aansluiting above it, also when only existing circuits get points
    const {project: withTheBoard, boardId} = withBoard(project)
    const een = withTheBoard.een.map((page) => ({
        ...page,
        tree: mapTree(page.tree, (node) =>
            additions.has(node.id)
                ? {...node, children: [...node.children, ...additions.get(node.id)]}
                : node.id === boardId
                  ? {...node, children: [...node.children, ...fresh]}
                  : node,
        ),
    }))
    const sit = withTheBoard.sit.map((page) => ({
        ...page,
        items: page.items.map((item) => {
            if (!link.has(item.id)) return item
            const {type: _type, mark: _mark, h: _h, ...rest} = item
            return {...rest, node: link.get(item.id)}
        }),
    }))
    return {project: {...withTheBoard, een, sit}, plan}
}
