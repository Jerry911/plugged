// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Which shapes of a symbol lie in a rectangle (the selection box of the symbol editor). Lines and arcs are tested as the polyline they
// are drawn as, every other shape by its bounding box. Coordinates are those of the 24x24 grid.

const DEFAULT_FONT_SIZE = 10

/** Points of an arc (degrees, clockwise on screen, like arcPath) as a polyline. */
const arcPoints = (arc) => {
    const sweep = (((arc.a2 - arc.a1) % 360) + 360) % 360,
        steps = Math.max(2, Math.ceil(sweep / 10))
    return Array.from({length: steps + 1}, (_, i) => {
        const angle = ((arc.a1 + (sweep * i) / steps) * Math.PI) / 180
        return [arc.cx + arc.r * Math.cos(angle), arc.cy + arc.r * Math.sin(angle)]
    })
}

/** The polyline a line or arc is drawn as, or null for the other shapes. */
const polylineOf = (shape) => {
    if (shape.t === 'line') return [[shape.x1, shape.y1], [shape.x2, shape.y2]]
    if (shape.t === 'arc') return arcPoints(shape)
    return null
}

/** {x1, y1, x2, y2}: the bounding box of a shape (the outline of a path is taken from the numbers of its path data). */
export const shapeBounds = (shape) => {
    const box = (points) => ({
        x1: Math.min(...points.map((p) => p[0])),
        y1: Math.min(...points.map((p) => p[1])),
        x2: Math.max(...points.map((p) => p[0])),
        y2: Math.max(...points.map((p) => p[1])),
    })
    const polyline = polylineOf(shape)
    if (polyline) return box(polyline)
    switch (shape.t) {
        case 'circle':
            return {x1: shape.cx - shape.r, y1: shape.cy - shape.r, x2: shape.cx + shape.r, y2: shape.cy + shape.r}
        case 'rect':
            return {x1: shape.x, y1: shape.y, x2: shape.x + shape.w, y2: shape.y + shape.h}
        case 'path': {
            const numbers = (shape.d.match(/-?\d*\.?\d+/g) || []).map(Number),
                points = []
            for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]])
            return points.length ? box(points) : {x1: 0, y1: 0, x2: 0, y2: 0}
        }
        default: {
            // text: x is the middle, y the baseline
            const size = shape.fs || DEFAULT_FONT_SIZE,
                halfWidth = (String(shape.s).length * size * 0.6) / 2
            return {x1: shape.x - halfWidth, y1: shape.y - size * 0.7, x2: shape.x + halfWidth, y2: shape.y}
        }
    }
}

// does the segment (a, b) have a point in the rectangle? (Liang-Barsky clipping)
const segmentTouches = ([ax, ay], [bx, by], rect) => {
    let low = 0,
        high = 1
    const dx = bx - ax,
        dy = by - ay
    for (const [p, q] of [
        [-dx, ax - rect.x1],
        [dx, rect.x2 - ax],
        [-dy, ay - rect.y1],
        [dy, rect.y2 - ay],
    ]) {
        if (p === 0) {
            if (q < 0) return false
        } else {
            const r = q / p
            if (p < 0) low = Math.max(low, r)
            else high = Math.min(high, r)
            if (low > high) return false
        }
    }
    return true
}

/** The rectangle between two corners, in any order. */
export const rectBetween = (a, b) => ({x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y)})

/** Does any part of the shape lie in the rectangle? (For a circle or rectangle: its bounding box touches it.) */
export const shapeTouches = (shape, rect) => {
    const polyline = polylineOf(shape)
    if (polyline) return polyline.some((point, i) => (i ? segmentTouches(polyline[i - 1], point, rect) : false))
    const b = shapeBounds(shape)
    return b.x1 <= rect.x2 && b.x2 >= rect.x1 && b.y1 <= rect.y2 && b.y2 >= rect.y1
}

/** The indexes of the shapes that lie in the box between the two corners or touch it (like the selection box of the situatieschema). */
export const shapesInBox = (shapes, from, to) => {
    const rect = rectBetween(from, to)
    return shapes.flatMap((shape, index) => (shapeTouches(shape, rect) ? [index] : []))
}

/** {x1, y1, x2, y2}: the box around several shapes, or null for none. */
export const unionBounds = (shapes) => {
    if (!shapes.length) return null
    const boxes = shapes.map(shapeBounds)
    return {
        x1: Math.min(...boxes.map((b) => b.x1)),
        y1: Math.min(...boxes.map((b) => b.y1)),
        x2: Math.max(...boxes.map((b) => b.x2)),
        y2: Math.max(...boxes.map((b) => b.y2)),
    }
}
