// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Cable calculations per circuit: the length of the cable (typed, or estimated from the situatieschema), the voltage drop at the rated
// current of the breaker, and the smallest short-circuit current at the far end compared with the magnetic trip current of the breaker.
// Indicative values, as a help for the drawing: they replace neither a calculation note nor the measurements on site.
//
// Voltage drop: the AREI sets no maximum; the standard gives, in an informative annex, 3 % for lighting and 5 % for other loads.
// Short circuit: a breaker trips magnetically within 3-5 In (curve B), 5-10 In (C), 10-20 In (D); to be sure it does at the end of the
// cable the smallest short-circuit current there must reach the upper value. The impedance of the network up to the board is not known
// from the drawing: it is typed in Kaderinfo, or an assumed value is used (and said so).
import {flatten} from './tree.js'
import {scaleOf, fromSheet} from './geometry.js'
import {parseSpecs} from './rules.js'

export const RESISTIVITY = 0.0225 // Ω·mm²/m: copper at its working temperature
export const ASSUMED_NETWORK_IMPEDANCE = 0.3 // Ω: phase-neutral loop of the network up to the board, when Kaderinfo has none
export const DROP_LIMITS = {lighting: 3, other: 5} // %
export const TRIP_FACTOR = {B: 5, C: 10, D: 20} // upper end of the magnetic trip band, × In
// the estimate of a cable: the run from point to point along the walls (horizontal and vertical, not straight across a room), plus the way
// down and up in the wall at every point and at the board, plus a floor height for every other floor
const DROP_PER_POINT = 1.5 // m
const FLOOR_HEIGHT = 3 // m
const LIGHT_TYPES = new Set(['lichtpunt', 'lamp', 'tl', 'spot', 'wandlamp', 'noodlicht', 'led'])

const voltageOf = (footer = {}) => (/400/.test(footer.stelsel || '') ? 400 : 230)
const number = (text) => {
    const value = parseFloat(String(text ?? '').replace(',', '.'))
    return Number.isFinite(value) && value > 0 ? value : null
}

/** Where the symbols linked to these elements stand on the situatieschema: [{page, x, y}] in sheet mm. */
const placedPoints = (project, ids) =>
    (project.sit || []).flatMap((page, pageIndex) => (page.items || []).filter((item) => item.node && ids.has(item.node) && Number.isFinite(item.x) && Number.isFinite(item.y)).map((item) => ({page: pageIndex, x: item.x, y: item.y})))

/** Where the board of a circuit stands on the situatieschema: the symbol linked to its bord, or a loose board symbol; null when not drawn. */
const boardPoint = (project, boardIds) => {
    for (const [pageIndex, page] of (project.sit || []).entries()) {
        const item = (page.items || []).find(
            (candidate) => Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && ((candidate.node && boardIds.has(candidate.node)) || (!candidate.node && candidate.type === 'bord')),
        )
        if (item) return {page: pageIndex, x: item.x, y: item.y}
    }
    return null
}

/**
 * The estimated length (m) of the cable of a circuit from where its board and its points stand on the situatieschema: null when the board
 * or the points are not on it. `board` is the bord node the circuit hangs under (or null).
 */
export const estimateLength = (project, circuit, boardNode = null) => {
    const scale = scaleOf(project.footer),
        ids = new Set(flatten(circuit.children || []).map((node) => node.id)),
        points = placedPoints(project, ids),
        start = boardPoint(project, new Set(boardNode ? [boardNode.id] : []))
    if (!points.length || !start) return null
    // nearest point next, along the walls
    let here = start,
        metres = DROP_PER_POINT
    const left = [...points]
    while (left.length) {
        const distance = (point) => fromSheet(Math.abs(point.x - here.x) + Math.abs(point.y - here.y), scale) + (point.page === here.page ? 0 : FLOOR_HEIGHT)
        left.sort((a, b) => distance(a) - distance(b))
        const next = left.shift()
        metres += distance(next) + DROP_PER_POINT
        here = next
    }
    return Math.ceil(metres * 2) / 2
}

/** The bord a node hangs under in the tree of its page, or null. */
const boardOf = (project, node) => {
    for (const page of project.een || []) {
        const path = []
        const walk = (nodes) =>
            nodes.some((candidate) => {
                path.push(candidate)
                if (candidate.id === node.id || walk(candidate.children || [])) return true
                path.pop()
                return false
            })
        if (walk(page.tree || [])) return [...path].reverse().find((candidate) => candidate.type === 'bord' || candidate.type === 'subbord') || null
    }
    return null
}

/** The cable length of a circuit: {length (m), estimated} with the typed length first; null when neither is known. */
export const circuitLength = (project, circuit) => {
    const typed = number(circuit.p?.lengte)
    if (typed) return {length: typed, estimated: false}
    const estimate = estimateLength(project, circuit, boardOf(project, circuit))
    return estimate == null ? null : {length: estimate, estimated: true}
}

/** "12 m", "≈ 12,5 m": the length as written next to the cable on the eendraadschema. */
export const lengthText = (length, locale = 'nl-BE') =>
    (length.estimated ? '≈ ' : '') + length.length.toLocaleString(locale, {maximumFractionDigits: 1}) + ' m'

/**
 * The calculation of a circuit (a kring node): null when its rating or cable section is unknown. {length, estimated (the length is an
 * estimate), lengthKnown, current, section, voltage, drop (%), dropLimit (%), lighting, impedance, impedanceAssumed, shortCircuit (A, the
 * smallest at the far end), tripCurrent (A), trips (the breaker is sure to trip magnetically there), maxLength (m)}. Without a length only
 * the maximum length is worked out.
 */
export const circuitCalculation = (project, circuit) => {
    const properties = circuit.p || {},
        specs = parseSpecs([properties.kabel, circuit.info].filter(Boolean).join(' ')),
        current = Number(properties.amp) || parseSpecs(circuit.info).amp,
        section = specs.mm2
    if (!current || !section) return null
    const typed = number(properties.lengte),
        estimate = typed ? null : estimateLength(project, circuit, boardOf(project, circuit)),
        length = typed ?? estimate,
        voltage = voltageOf(project.footer),
        threePhase = Number(properties.polen) >= 3 && voltage === 400,
        descendants = flatten(circuit.children || []),
        lighting = descendants.length > 0 && descendants.every((node) => LIGHT_TYPES.has(node.type) || /schakelaar|wissel|kruis|drukknop|dimmer|minuterie|beweging/.test(node.type)),
        impedanceTyped = number(project.footer?.netimpedantie),
        impedance = impedanceTyped ?? ASSUMED_NETWORK_IMPEDANCE,
        curve = (properties.curve || /\b([BCD])\s*\d/.exec(circuit.info || '')?.[1] || 'B').toUpperCase(),
        tripCurrent = (TRIP_FACTOR[curve] || TRIP_FACTOR.B) * current,
        // a phase-neutral fault (230 V between them): the loop is the phase and the neutral of the cable plus the network
        loopVoltage = 0.95 * 230,
        maxLength = Math.max(0, ((loopVoltage / tripCurrent - impedance) * section) / (2 * RESISTIVITY))
    const result = {
        length,
        estimated: !typed && length != null,
        lengthKnown: length != null,
        current,
        section,
        voltage,
        lighting,
        dropLimit: lighting ? DROP_LIMITS.lighting : DROP_LIMITS.other,
        impedance,
        impedanceAssumed: impedanceTyped == null,
        curve,
        tripCurrent,
        maxLength: Math.floor(maxLength),
    }
    if (length == null) return result
    const conductorResistance = (RESISTIVITY * length) / section,
        // single phase: there and back (2 conductors) on 230 V; three phase on 400 V: √3 × one conductor
        dropVolts = threePhase ? Math.sqrt(3) * conductorResistance * current : 2 * conductorResistance * current,
        shortCircuit = loopVoltage / (impedance + 2 * conductorResistance)
    return {
        ...result,
        drop: (100 * dropVolts) / (threePhase ? 400 : 230),
        shortCircuit,
        trips: shortCircuit >= tripCurrent,
    }
}
