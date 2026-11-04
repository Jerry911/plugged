// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The drawing primitives of a symbol and the shapes that are computed instead of taken from the library (stacked and vertical sockets).
// Symbols are drawn on a 24x24 grid; the connection point of a symbol is on the line y = 12 and the supply enters from the left.
// Shapes: line, circle, rect (both optionally filled with f: 1 = in the colour of the drawing, 2 = in the colour of the paper), path (SVG path data d,
// filled with f like the others), text (optional fs = font size, b = bold) and arc (degrees, clockwise on screen). Every shape may have sw: the line weight
// relative to the weight of the drawing. Most standard symbols are drawn like those of the online eendraadschema (see UpstreamSymbols.java).

/** Rounds to two decimals, like the backend does. */
export const round2 = (value) => Math.round(value * 100) / 100

const lineShape = (x1, y1, x2, y2) => ({t: 'line', x1, y1, x2, y2})
const textShape = (x, y, content, fontSize) => (fontSize ? {t: 'text', x, y, s: content, fs: fontSize} : {t: 'text', x, y, s: content})
const arcShape = (cx, cy, r, a1, a2) => ({t: 'arc', cx, cy, r, a1, a2})
const withWeight = (shape, strokeWeight) => ({...shape, sw: strokeWeight})

// The drawing of the eendraadschema is scaled by UPSTREAM_SCALE (a 40 x 40 box becomes 14 x 14): its x = 1 is our x = 1 and its centre line
// our y = 12 (see UpstreamSymbols.java).
const UPSTREAM_SCALE = 0.35,
    // relative line weight of an upstream stroke width of 2
    UPSTREAM_WEIGHT_2 = 1.5,
    // the span (in upstream units, after the first apex) that stacked sockets may use at the full size
    STACK_SPAN = 29,
    // distance between chained sockets (20 in the eendraadschema, a bit more so that the arches do not seem glued together); keep equal to PITCH in StandardSymbols.java
    SOCKET_PITCH = 24

/**
 * Socket (contactdoos) as in the eendraadschema: pe = bar for the protective conductor, kid = little feet on the arch (kinderveiligheid),
 * h = waterproof, n = number of sockets. Horizontal (default, how the eendraadschema chains them): the supply line meets the apex of arcs
 * that open to the right, n arcs chained every SOCKET_PITCH units of the eendraadschema grid (the whole stack is scaled down when that does not
 * fit the grid). Vertical (horizontal = false): the supply line drops onto an arch, with n > 1 the number is written next to it. For the
 * horizontal drawing the standard symbols of the backend (StandardSymbols.socket) are the same: keep them equal.
 */
export const socketShapes = ({pe = true, kid = false, h: waterproof = false, n: count = 1} = {}, horizontal = true) => {
    if (!horizontal)
        return [
            lineShape(1, 12, 14, 12),
            lineShape(14, 12, 14, 15.5),
            ...(pe ? [lineShape(9.5, 15.5, 18.5, 15.5)] : []),
            arcShape(14, 20, 4.5, 180, 360),
            ...(kid ? [lineShape(8.2, 20, 9.5, 20), lineShape(18.5, 20, 19.8, 20)] : []),
            ...(waterproof ? [textShape(20, 10, 'h', 8)] : count > 1 ? [textShape(20, 10, String(count), 7)] : []),
        ]
    // n sockets do not fit the grid at the full size: the whole stack (arches, bars, feet) is scaled down about its supply point, so the gap between
    // the arches stays in proportion for double, triple, quadruple, ... sockets (shrink = 1 up to a double socket)
    const shrink = count > 1 ? Math.min(1, (35 + STACK_SPAN) / (35 + (count - 1) * SOCKET_PITCH)) : 1,
        scale = UPSTREAM_SCALE * shrink,
        gridX = (upstreamX) => round2(1 - scale + scale * upstreamX),
        gridY = (upstreamY) => round2(12 + scale * upstreamY),
        radius = round2(15 * scale),
        shapes = [lineShape(1, 12, gridX(21 + (count - 1) * SOCKET_PITCH), 12)]
    for (let socket = 0; socket < count; socket++) {
        const apexX = gridX(21 + socket * SOCKET_PITCH),
            centreX = gridX(36 + socket * SOCKET_PITCH)
        if (pe) shapes.push(withWeight(lineShape(apexX, round2(12 - radius), apexX, round2(12 + radius)), UPSTREAM_WEIGHT_2))
        shapes.push(withWeight(arcShape(centreX, 12, radius, 90, 270), UPSTREAM_WEIGHT_2))
        if (kid)
            shapes.push(
                withWeight(lineShape(centreX, gridY(-20), centreX, gridY(-14.1)), UPSTREAM_WEIGHT_2),
                withWeight(lineShape(centreX, gridY(20), centreX, gridY(14.1)), UPSTREAM_WEIGHT_2),
            )
    }
    if (waterproof) shapes.push(textShape(gridX(21), round2(12 - radius - 1.8), 'h', 4.5))
    return shapes
}

/**
 * The number of sockets of a placed symbol (properties.aantal multiplies the sockets of the symbol) and whether they are drawn horizontally
 * (properties.hor, default yes); null for a symbol that is not a socket. Waterproof (h) is not a symbol of its own but a property of a placed
 * socket (properties.h; on the situatieschema also of a loose symbol): the small 'h' next to it.
 */
export const socketStackOf = (symbolType, properties = {}) => {
    const count = (symbolType.sock?.n || 1) * (Number(properties.aantal) > 1 ? Number(properties.aantal) : 1)
    return symbolType.sock ? {n: count, hor: properties.hor ?? true} : null
}

/** The drawing of a placed symbol: the symbol itself, unless it is a socket that has to be stacked, marked waterproof or drawn vertically. */
export const placedShapesOf = (symbolType, properties = {}) => {
    const stack = socketStackOf(symbolType, properties)
    if (!stack) return symbolType.shapes
    const waterproof = !!(symbolType.sock.h || properties.h)
    if (!stack.hor) return socketShapes({...symbolType.sock, h: waterproof}, false)
    const unchanged = stack.n === (symbolType.sock.n || 1) && waterproof === !!symbolType.sock.h
    return unchanged ? symbolType.shapes : socketShapes({...symbolType.sock, n: stack.n, h: waterproof}, true)
}

/** SVG path data of an arc shape (degrees, clockwise on screen). */
export const arcPath = (arc) => {
    const toRadians = Math.PI / 180,
        pointAt = (angle) => `${round2(arc.cx + arc.r * Math.cos(angle * toRadians))} ${round2(arc.cy + arc.r * Math.sin(angle * toRadians))}`,
        sweep = (((arc.a2 - arc.a1) % 360) + 360) % 360
    return `M${pointAt(arc.a1)}A${arc.r} ${arc.r} 0 ${sweep > 180 ? 1 : 0} 1 ${pointAt(arc.a2)}`
}

export const shapeBuilders = {line: lineShape, text: textShape, arc: arcShape}
