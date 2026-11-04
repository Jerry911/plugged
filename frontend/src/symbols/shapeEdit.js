// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Moving shapes of a symbol (the symbol editor drags the selected shapes). Coordinates are those of the 24x24 grid.
import {round2} from './symbolShapes.js'

// the number of numbers each (absolute) SVG path command takes, and which of them are x, y pairs that have to move
const PATH_ARGUMENTS = {M: 2, L: 2, C: 6, S: 4, Q: 4, T: 2, A: 7}

/** Path data moved by (dx, dy); the symbols only use absolute commands (M L C S Q T A Z), relative ones are left as they are. */
export const translatePath = (d, dx, dy) =>
    d.replace(/([A-Za-z])([^A-Za-z]*)/g, (whole, command, rest) => {
        const numbers = rest.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || []
        const size = PATH_ARGUMENTS[command]
        if (command === 'H' || command === 'V') return command + numbers.map((n) => round2(n + (command === 'H' ? dx : dy))).join(' ')
        if (!size || !numbers.length) return whole
        const moved = numbers.map((n, i) => {
            const slot = i % size
            if (command === 'A') return slot === 5 ? n + dx : slot === 6 ? n + dy : n // rx ry rotation large sweep x y
            return round2(slot % 2 === 0 ? n + dx : n + dy)
        })
        return command + moved.map((n) => round2(n)).join(' ')
    })

/** The shape moved by (dx, dy). */
export const translateShape = (shape, dx, dy) => {
    switch (shape.t) {
        case 'line':
            return {...shape, x1: round2(shape.x1 + dx), y1: round2(shape.y1 + dy), x2: round2(shape.x2 + dx), y2: round2(shape.y2 + dy)}
        case 'circle':
        case 'arc':
            return {...shape, cx: round2(shape.cx + dx), cy: round2(shape.cy + dy)}
        case 'path':
            return {...shape, d: translatePath(shape.d, dx, dy)}
        default: // rect and text
            return {...shape, x: round2(shape.x + dx), y: round2(shape.y + dy)}
    }
}

/** The point of a shape that follows the grid while it is dragged (its first point, centre or corner). */
export const shapeAnchor = (shape) => {
    switch (shape.t) {
        case 'line':
            return {x: shape.x1, y: shape.y1}
        case 'circle':
        case 'arc':
            return {x: shape.cx, y: shape.cy}
        case 'path': {
            const [x, y] = shape.d.match(/-?\d*\.?\d+/g)?.map(Number) || [0, 0]
            return {x, y}
        }
        default:
            return {x: shape.x, y: shape.y}
    }
}
