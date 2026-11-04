// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The drawing primitives of a symbol and the shapes that are computed instead of taken from the library (stacked and vertical sockets).
// Symbols are drawn on a 24x24 grid; the connection point of a symbol is on the line y = 12 and the supply enters from the left.
// Shapes: line, circle, rect (both optionally filled with f: 1 = in the colour of the drawing, 2 = in the colour of the paper), path (SVG path data d,
// filled with f like the others), text (optional fs = font size, b = bold) and arc (degrees, clockwise on screen). Every shape may have sw: the line weight
// relative to the weight of the drawing.

/** Rounds to two decimals, like the backend does. */
export const round2 = (value) => Math.round(value * 100) / 100

const lineShape = (x1, y1, x2, y2) => ({t: 'line', x1, y1, x2, y2})
const textShape = (x, y, content, fontSize) => (fontSize ? {t: 'text', x, y, s: content, fs: fontSize} : {t: 'text', x, y, s: content})
const arcShape = (cx, cy, r, a1, a2) => ({t: 'arc', cx, cy, r, a1, a2})

// Horizontal sockets (how the standard symbols draw them): the supply line runs from x = 1 to the apex of the last arch, the arches open to the right.
const SOCKET_APEX = 4,
    // one socket: radius of the arch and half the height of the bar of the protective conductor
    SINGLE_RADIUS = 4.5,
    SINGLE_BAR = 5.2,
    // stacked sockets: smaller arches, one every STACK_PITCH units, the bar as high as the arch and a short tick above and below every arch
    STACK_RADIUS = 4,
    STACK_PITCH = 6,
    STACK_TICK = 1,
    // the right edge a stack may reach; a longer stack is scaled down about the apex of its first arch
    RIGHT_EDGE = 23

/**
 * Socket (contactdoos): pe = bar for the protective conductor, kid = little feet on the arch (kinderveiligheid), h = waterproof, n = number of
 * sockets. Horizontal (default): the supply line meets the apex of the arches, which open to the right; n > 1 arches are chained every
 * STACK_PITCH units (the whole stack is scaled down when it does not fit the grid). Vertical (horizontal = false): the supply line drops onto an
 * arch, with n > 1 the number is written next to it. The stacks are drawn in the style of the double and triple socket of the catalog
 * (standard-symbols.json): the same arches, bars and ticks (symbols.test.jsx checks it); redraw those and change this too.
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
    const stacked = count > 1,
        fullRadius = stacked ? STACK_RADIUS : SINGLE_RADIUS,
        fullLength = fullRadius + (count - 1) * STACK_PITCH,
        scale = Math.min(1, (RIGHT_EDGE - SOCKET_APEX) / fullLength),
        radius = round2(fullRadius * scale),
        bar = round2((stacked ? STACK_RADIUS : SINGLE_BAR) * scale),
        apexOf = (socket) => round2(SOCKET_APEX + socket * STACK_PITCH * scale),
        shapes = [lineShape(1, 12, apexOf(count - 1), 12)]
    for (let socket = 0; socket < count; socket++) {
        const apexX = apexOf(socket),
            centreX = round2(apexX + radius)
        if (pe) shapes.push(lineShape(apexX, round2(12 - bar), apexX, round2(12 + bar)))
        shapes.push(arcShape(centreX, 12, radius, 90, 270))
        if (stacked) {
            const tick = round2(STACK_TICK * scale)
            shapes.push(lineShape(centreX, round2(12 - radius - tick), centreX, round2(12 - radius)), lineShape(centreX, round2(12 + radius), centreX, round2(12 + radius + tick)))
        }
        // the feet cross the top and the bottom of the arch, a third of the radius outside it
        if (kid) shapes.push(lineShape(centreX, round2(12 - radius * 4 / 3), centreX, round2(12 - radius * 0.94)), lineShape(centreX, round2(12 + radius * 4 / 3), centreX, round2(12 + radius * 0.94)))
    }
    if (waterproof) shapes.push(textShape(apexOf(0), round2(12 - bar - 1.8), 'h', 4.5))
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

/** The little 'h' of a waterproof socket on a drawing of the library: above the apex of its first arch, clear of the highest line. */
export const waterproofMark = (shapes) => {
    const arcs = shapes.filter((shape) => shape.t === 'arc'),
        first = arcs.reduce((left, arc) => (arc.cx - arc.r < left.cx - left.r ? arc : left), arcs[0]),
        top = Math.min(...shapes.flatMap((shape) => (shape.t === 'line' ? [shape.y1, shape.y2] : shape.t === 'arc' ? [shape.cy - shape.r] : [])))
    return textShape(round2(first.cx - first.r), round2(top - 1.8), 'h', 4.5)
}

/**
 * The drawing of a placed symbol: the symbol itself, unless it is a socket that has to be stacked (Aantal) or drawn vertically; those are
 * computed by socketShapes. A waterproof socket keeps the drawing of the library with a little 'h' next to it.
 */
export const placedShapesOf = (symbolType, properties = {}) => {
    const stack = socketStackOf(symbolType, properties)
    if (!stack) return symbolType.shapes
    const waterproof = !!(symbolType.sock.h || properties.h)
    if (!stack.hor) return socketShapes({...symbolType.sock, h: waterproof}, false)
    if (stack.n !== (symbolType.sock.n || 1)) return socketShapes({...symbolType.sock, n: stack.n, h: waterproof}, true)
    const marked = symbolType.shapes.some((shape) => shape.t === 'text' && shape.s === 'h')
    return waterproof && !marked ? [...symbolType.shapes, waterproofMark(symbolType.shapes)] : symbolType.shapes
}

/** SVG path data of an arc shape (degrees, clockwise on screen). */
export const arcPath = (arc) => {
    const toRadians = Math.PI / 180,
        pointAt = (angle) => `${round2(arc.cx + arc.r * Math.cos(angle * toRadians))} ${round2(arc.cy + arc.r * Math.sin(angle * toRadians))}`,
        sweep = (((arc.a2 - arc.a1) % 360) + 360) % 360
    return `M${pointAt(arc.a1)}A${arc.r} ${arc.r} 0 ${sweep > 180 ? 1 : 0} 1 ${pointAt(arc.a2)}`
}

export const shapeBuilders = {line: lineShape, text: textShape, arc: arcShape}
