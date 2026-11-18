// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The bedradingsschema (wiring diagram): pages like those of the situatieschema ({id, name, walls, items, dims}) with also
//   wires: [{id, a, b, points: [{x, y}], style, color, w, ortho}]  a and b = an end: {item, pin} (attached to a connection point of a symbol,
//          it follows when the symbol moves) or {x, y} (a free end); points = the bends in between
//   boxes: [{id, x1, y1, x2, y2, style, color, w}]                   rectangles, e.g. the enclosure of a board or a box with its terminals
// Symbols have connection points ("pins") on their 24 grid: given by the symbol (pins: [[x, y]]) or found from the drawing.
import {segmentHitsBox} from './geometry.js'

export const WIRE_STYLES = ['solid', 'dashed', 'dotted', 'dashdot']
/** The colours of a wire, with their drawing colour; yellow-green (earth) is drawn green with yellow dashes over it. */
export const WIRE_COLOURS = {
    black: '#000000',
    gray: '#8a8a8a',
    brown: '#7b4a1e',
    blue: '#1565c0',
    red: '#d32f2f',
    green: '#2e7d32',
    yellowgreen: '#2e9e3a',
}
export const EARTH_YELLOW = '#f4d03f'
export const WIRE_WIDTHS = [0.25, 0.35, 0.5, 0.7, 1]
/** What a new wire or box looks like until the user picks something else. */
export const DEFAULT_PEN = {style: 'solid', color: 'black', w: 0.35}
// a click this close to a connection point (mm on the sheet) attaches the wire to it
export const PIN_SNAP_DISTANCE = 2.5
// a click this close to a wire puts the end on that wire (a branch)
export const WIRE_SNAP_DISTANCE = 1.2
// line ends this close to the border of the 24 grid are connection points
const BORDER = 2.5

/** Shown in the palette of the eendraadschema (een false: a symbol only for the bedradingsschema, e.g. a contactor). */
export const inOneWire = (symbolType) => symbolType.een !== false
/** Shown in the palette of the bedradingsschema: its own setting, else when it can be placed on a plan. */
export const inWiring = (symbolType) => !!(symbolType.wire ?? symbolType.place)

/** The dash pattern of a line style for a line of width `width` (mm); undefined for a solid line. */
export const dashArray = (style, width = DEFAULT_PEN.w) => {
    const unit = Math.max(1, width / 0.35)
    const pattern = {dashed: [3, 1.5], dotted: [0.01, 1.1], dashdot: [4, 1.2, 0.01, 1.2]}[style]
    return pattern ? pattern.map((length) => Math.round(length * unit * 100) / 100).join(' ') : undefined
}

/** The drawing colour of a wire colour. */
export const colourOf = (color) => WIRE_COLOURS[color] || color || '#000'

/**
 * The connection points of a symbol on its 24 grid: [[x, y], ...]. Given by the symbol (an empty list: none, e.g. furniture), else the ends of
 * its lines on the border of the grid, else the centre.
 */
export const symbolPins = (symbolType) => {
    if (!symbolType) return []
    if (Array.isArray(symbolType.pins)) return symbolType.pins
    const pins = []
    const onBorder = (x, y) => x <= BORDER || x >= 24 - BORDER || y <= BORDER || y >= 24 - BORDER
    ;(symbolType.shapes || []).forEach((shape) => {
        if (shape.t !== 'line') return
        ;[
            [shape.x1, shape.y1],
            [shape.x2, shape.y2],
        ].forEach(([x, y]) => onBorder(x, y) && !pins.some((pin) => pin[0] === x && pin[1] === y) && pins.push([x, y]))
    })
    return pins.length ? pins : [[12, 12]]
}

/** Where connection point `pin` ([x, y] on the 24 grid) of a symbol item lies on the sheet: the item turns and scales it. */
export const pinPosition = (item, pin, size) => {
    const scale = size / 24,
        angle = ((item.r || 0) * Math.PI) / 180,
        dx = (pin[0] - 12) * scale,
        dy = (pin[1] - 12) * scale
    return {x: round3(item.x + dx * Math.cos(angle) - dy * Math.sin(angle)), y: round3(item.y + dx * Math.sin(angle) + dy * Math.cos(angle))}
}
const round3 = (value) => Math.round(value * 1000) / 1000

/**
 * Finds the sheet position of wire ends. `pinsOf(item)` = the connection points of a symbol item on the sheet ([{x, y}]); an end attached to a
 * symbol or pin that is gone falls back to where it was last seen (its x, y).
 */
export const endResolver = (items, pinsOf) => {
    const byId = new Map(items.map((item) => [item.id, item]))
    return (end) => {
        if (end?.item != null) {
            const item = byId.get(end.item),
                pin = item && pinsOf(item)[end.pin]
            if (pin) return pin
        }
        return end && Number.isFinite(end.x) ? {x: end.x, y: end.y} : null
    }
}

/**
 * All points of a wire on the sheet: its ends and bends, with the corners of a right-angled ("ortho") wire filled in: the first leg leaves its
 * start vertically (the connection points of the schema symbols are on top and bottom), the other legs go horizontally first.
 */
export const wirePoints = (wire, resolve) => {
    const a = resolve(wire.a),
        b = resolve(wire.b)
    if (!a || !b) return []
    const corners = [a, ...(wire.points || []), b],
        points = [a]
    for (let index = 1; index < corners.length; index++) {
        const previous = points[points.length - 1],
            next = corners[index]
        if (wire.ortho && previous.x !== next.x && previous.y !== next.y) points.push(index === 1 ? {x: previous.x, y: next.y} : {x: next.x, y: previous.y})
        points.push(next)
    }
    return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
}

export const pathOf = (points) => points.map((point, index) => (index ? 'L' : 'M') + point.x + ' ' + point.y).join(' ')

export const lengthOf = (points) => points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0)

/** The point of segment a-b nearest to p, with its distance. */
export const nearestOnSegment = (p, a, b) => {
    const dx = b.x - a.x,
        dy = b.y - a.y,
        along = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))),
        point = {x: a.x + along * dx, y: a.y + along * dy}
    return {point, distance: Math.hypot(point.x - p.x, point.y - p.y), along}
}

const samePoint = (a, b) => Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05

/**
 * The junction dots: where three or more wires meet at a free point (not on a connection point of a symbol, a terminal shows the
 * connection itself). An end on the middle of another wire (a branch) counts that wire twice.
 */
export const junctions = (wires, resolve) => {
    const drawn = wires.map((wire) => ({wire, points: wirePoints(wire, resolve)})).filter((entry) => entry.points.length > 1),
        ends = []
    drawn.forEach(({wire, points}) => {
        if (wire.a?.item == null) ends.push(points[0])
        if (wire.b?.item == null) ends.push(points[points.length - 1])
    })
    const dots = []
    ends.forEach((end) => {
        if (dots.some((dot) => samePoint(dot, end))) return
        let degree = 0
        drawn.forEach(({points}) => {
            const first = points[0],
                last = points[points.length - 1]
            if (samePoint(first, end)) degree++
            if (samePoint(last, end)) degree++
            const through = points.some((point, index) => {
                if (index === 0) return false
                const hit = nearestOnSegment(end, points[index - 1], point)
                return hit.distance < 0.05 && !samePoint(hit.point, first) && !samePoint(hit.point, last)
            })
            if (through) degree += 2
        })
        if (degree >= 3) dots.push({x: end.x, y: end.y})
    })
    return dots
}

/** Does a wire touch the selection rectangle? */
export const wireHitsBox = (points, box) =>
    points.some((point, index) => index > 0 && segmentHitsBox(points[index - 1].x, points[index - 1].y, point.x, point.y, box))

/** The box around a rectangle (box) of the page, with a small margin. */
export const boxBox = (box) => ({
    x0: Math.min(box.x1, box.x2) - 0.8,
    y0: Math.min(box.y1, box.y2) - 0.8,
    x1: Math.max(box.x1, box.x2) + 0.8,
    y1: Math.max(box.y1, box.y2) + 0.8,
})

/** The box around the points of a wire. */
export const pointsBox = (points) =>
    points.length
        ? {
              x0: Math.min(...points.map((point) => point.x)) - 0.8,
              y0: Math.min(...points.map((point) => point.y)) - 0.8,
              x1: Math.max(...points.map((point) => point.x)) + 0.8,
              y1: Math.max(...points.map((point) => point.y)) + 0.8,
          }
        : null

/** Does a rectangle of the page touch the selection rectangle? Its four sides are checked (a rectangle around the selection does not count). */
export const boxHitsBox = (box, selection) => {
    const {x1, y1, x2, y2} = box
    return [
        [x1, y1, x2, y1],
        [x2, y1, x2, y2],
        [x2, y2, x1, y2],
        [x1, y2, x1, y1],
    ].some(([ax, ay, bx, by]) => segmentHitsBox(ax, ay, bx, by, selection))
}

/** The wires with every end attached to one of `itemIds` turned into a free end where it is now (the symbols are deleted). */
export const detachFrom = (wires, itemIds, resolve) =>
    wires.map((wire) => {
        const free = (end) => (end?.item != null && itemIds.has(end.item) ? {...resolve(end)} : end)
        return {...wire, a: free(wire.a), b: free(wire.b)}
    })

/** The wires moved by (dx, dy): their free ends and bends move, ends on a symbol stay on it. */
export const moveWire = (wire, dx, dy) => {
    const move = (point) => ({...point, x: round3(point.x + dx), y: round3(point.y + dy)})
    return {
        ...wire,
        a: wire.a?.item != null ? wire.a : move(wire.a),
        b: wire.b?.item != null ? wire.b : move(wire.b),
        points: (wire.points || []).map(move),
    }
}

/** A new, empty page of the bedradingsschema. */
export const emptyWiringPage = (id, name) => ({id, name, walls: [], items: [], wires: [], boxes: []})
