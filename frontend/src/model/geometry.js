// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Pure helpers for the situatieschema: real-world dimensions (via the footer scale) and hit testing.
// Coordinates on the sheet are millimetres of an A4 landscape sheet (297 x 210).
import {getLocale} from '../i18n/translate.js'

const METRES_PER_UNIT = {mm: 0.001, cm: 0.01, m: 1}
const MAX_SHEET_LENGTH = 400 // longer than the drawing area (mm on the sheet)

/** "1:50" -> 50 (falls back to 50). */
export const scaleOf = (footer) => {
    const match = /^\s*1\s*[:/]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(footer?.schaal || '')
    const value = match ? parseFloat(match[1].replace(',', '.')) : NaN
    return value > 0 ? value : 50
}

/** "3,5" | "3.5m" | "350cm" | "3500 mm" -> metres (a number without unit is metres); null when it is not a positive length. */
export const parseLength = (text) => {
    const match = /^\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*$/i.exec(String(text ?? ''))
    if (!match) return null
    const metres = parseFloat(match[1].replace(',', '.')) * METRES_PER_UNIT[(match[2] || 'm').toLowerCase()]
    return metres > 0 ? metres : null
}

/** Real metres -> millimetres on the sheet, or null when it does not fit on the sheet. */
export const toSheet = (metres, scale) => {
    const millimetres = (metres * 1000) / scale
    return millimetres > 0 && millimetres <= MAX_SHEET_LENGTH ? millimetres : null
}

const STANDARD_SCALES = [50, 75, 100, 125, 150, 200, 250, 500, 1000, 2000, 5000]
/** The longest length (mm) that comfortably fits the drawing area of a sheet. */
export const FIT_SHEET_LENGTH = 280

/** The smallest standard scale (larger than the current one) at which `metres` fits on the sheet; null when it already fits. */
export const suggestScale = (metres, scale) =>
    (metres * 1000) / scale <= FIT_SHEET_LENGTH
        ? null
        : (STANDARD_SCALES.find((candidate) => candidate > scale && (metres * 1000) / candidate <= FIT_SHEET_LENGTH) ?? null)

/** Millimetres on the sheet -> real metres. */
export const fromSheet = (millimetres, scale) => (millimetres * scale) / 1000

/** Millimetres on the sheet as a real length, e.g. "3,50 m" (decimal separator of the active language). */
export const formatLength = (millimetres, scale) =>
    fromSheet(millimetres, scale).toLocaleString(getLocale(), {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false}) + ' m'

/** "4x3,5" -> {w: 4, h: 3.5} (metres); a single value gives a square; null when it cannot be read. */
export const parseDimensions = (text) => {
    const parts = String(text ?? '').split(/[x×*]/i)
    if (parts.length > 2) return null
    const width = parseLength(parts[0]),
        height = parts.length === 2 ? parseLength(parts[1]) : width
    return width == null || height == null ? null : {w: width, h: height}
}

export const round2 = (value) => Math.round(value * 100) / 100

/** Unit vector from a to b; within 10 degrees of an axis it snaps to that axis; a === b gives +x. */
export const directionTo = (from, to) => {
    const dx = to.x - from.x,
        dy = to.y - from.y,
        length = Math.hypot(dx, dy)
    if (!length) return {x: 1, y: 0}
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI,
        axis = Math.round(angle / 90) * 90
    if (Math.abs(angle - axis) < 10)
        return {x: Math.round(Math.cos((axis * Math.PI) / 180)) || 0, y: Math.round(Math.sin((axis * Math.PI) / 180)) || 0}
    return {x: dx / length, y: dy / length}
}

/** The four walls of the rectangle with opposite corners a and b. */
export const rectangleWalls = (a, b) =>
    [
        [a.x, a.y, b.x, a.y],
        [b.x, a.y, b.x, b.y],
        [b.x, b.y, a.x, b.y],
        [a.x, b.y, a.x, a.y],
    ].map(([x1, y1, x2, y2]) => ({x1, y1, x2, y2}))

/** Liang-Barsky: does the segment (ax, ay)-(bx, by) touch the rectangle box = {x0, y0, x1, y1}? */
export const segmentHitsBox = (ax, ay, bx, by, box) => {
    let entry = 0,
        exit = 1
    const dx = bx - ax,
        dy = by - ay
    for (const [direction, distance] of [
        [-dx, ax - box.x0],
        [dx, box.x1 - ax],
        [-dy, ay - box.y0],
        [dy, box.y1 - ay],
    ]) {
        if (direction === 0) {
            if (distance < 0) return false
        } else {
            const ratio = distance / direction
            if (direction < 0) {
                if (ratio > exit) return false
                if (ratio > entry) entry = ratio
            } else {
                if (ratio < entry) return false
                if (ratio < exit) exit = ratio
            }
        }
    }
    return true
}

export const boxesOverlap = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0

/** The box around a wall, with a small margin. */
export const wallBox = (wall) => ({
    x0: Math.min(wall.x1, wall.x2) - 0.8,
    y0: Math.min(wall.y1, wall.y2) - 0.8,
    x1: Math.max(wall.x1, wall.x2) + 0.8,
    y1: Math.max(wall.y1, wall.y2) + 0.8,
})

/** Approximate extent of an item on the sheet (used for box selection and the delete button). */
export const itemBox = (item) => {
    if (item.kind === 'text') {
        const size = item.s || 4,
            width = Math.max(size, String(item.txt || '').length * size * 0.55)
        return {x0: item.x, y0: item.y - size, x1: item.x + width, y1: item.y + size * 0.3}
    }
    const halfSize = item.kind === 'sym' ? (item.s || 7) / 2 + 1 : (item.w || 10) / 2
    return {x0: item.x - halfSize, y0: item.y - halfSize, x1: item.x + halfSize, y1: item.y + halfSize}
}

/** The box around all boxes; null for none. */
export const unionBox = (boxes) =>
    boxes.length
        ? boxes.reduce((union, box) => ({
              x0: Math.min(union.x0, box.x0),
              y0: Math.min(union.y0, box.y0),
              x1: Math.max(union.x1, box.x1),
              y1: Math.max(union.y1, box.y1),
          }))
        : null

/** The walls and items inside (or touching) the selection rectangle, as selection entries {k: 'wall' | 'item', id}. */
export const hitsInBox = (box, walls, items) => [
    ...walls.filter((wall) => segmentHitsBox(wall.x1, wall.y1, wall.x2, wall.y2, box)).map((wall) => ({k: 'wall', id: wall.id})),
    ...items.filter((item) => boxesOverlap(itemBox(item), box)).map((item) => ({k: 'item', id: item.id})),
]
