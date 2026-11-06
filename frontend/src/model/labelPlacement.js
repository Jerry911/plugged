// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Where the marking of a symbol on the situatieschema (A1, F5, ...) is written: on the first free spot around the symbol, so it never hides
// behind a wall, another symbol, a door, a window, a text or the marking of another symbol, and stays on the drawing area of the sheet.
// Everything is in mm on the sheet; boxes are {x1, y1, x2, y2}.

/** Font size (mm) of the marking of a symbol of the standard size (SYMBOL_SIZE). */
export const LABEL_FONT_SIZE = 2.6
// the standard size of a symbol on the plan (DEFAULT_ITEM_SIZE.sym of SituationSheet)
const SYMBOL_SIZE = 7
/** The smallest marking (mm): as large as the titles of the kader, so a print stays readable. */
export const MIN_LABEL_FONT_SIZE = 2.2
/** Font size (mm) of the marking of a symbol of `size`: it grows and shrinks with the symbol, but never below MIN_LABEL_FONT_SIZE. */
export const labelFontSize = (size = SYMBOL_SIZE) => Math.max(MIN_LABEL_FONT_SIZE, (LABEL_FONT_SIZE * size) / SYMBOL_SIZE)
// gap between a symbol (the lines it is drawn with) and its marking
const GAP = 0.5
// the drawing area of a sheet (the grid of the editor)
export const DRAWING_AREA = {x1: 5, y1: 5, x2: 292, y2: 185}
// half the thickness of a wall as drawn (stroke width 1.6)
const WALL_HALF = 0.8

/** Approximate width (mm) of a bold marking. */
export const labelWidth = (text, fontSize = LABEL_FONT_SIZE) => Math.max(1, String(text).length) * fontSize * 0.62

const boxOverlap = (a, b) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1))

const boxAround = (points) => ({
    x1: Math.min(...points.map((p) => p.x)),
    y1: Math.min(...points.map((p) => p.y)),
    x2: Math.max(...points.map((p) => p.x)),
    y2: Math.max(...points.map((p) => p.y)),
})

/** The box of a local rectangle (x1..x2, y1..y2 around the origin) after scale(sx, sy), rotate(degrees) and translate(x, y). */
const transformedBox = ({x, y, r = 0, sx = 1, sy = 1}, local) => {
    const angle = (r * Math.PI) / 180,
        cos = Math.cos(angle),
        sin = Math.sin(angle)
    const corners = [
        [local.x1, local.y1],
        [local.x2, local.y1],
        [local.x1, local.y2],
        [local.x2, local.y2],
    ].map(([px, py]) => {
        const qx = px * sx,
            qy = py * sy
        return {x: x + qx * cos - qy * sin, y: y + qx * sin + qy * cos}
    })
    return boxAround(corners)
}

/** The box of a text of the given width and height centred on (x, y) and turned by `angle` degrees around that point. */
export const centredTextBox = (x, y, angle, width, height) => transformedBox({x, y, r: angle}, {x1: -width / 2, y1: -height / 2, x2: width / 2, y2: height / 2})

/** The part of a wall (a thick segment) that lies in a box, as a length (0 = the wall does not touch the box). */
export const wallInBox = (wall, box) => {
    // clip the segment to the box grown by half the wall thickness (Liang-Barsky)
    const grown = {x1: box.x1 - WALL_HALF, y1: box.y1 - WALL_HALF, x2: box.x2 + WALL_HALF, y2: box.y2 + WALL_HALF},
        dx = wall.x2 - wall.x1,
        dy = wall.y2 - wall.y1
    let from = 0,
        to = 1
    for (const [p, q] of [
        [-dx, wall.x1 - grown.x1],
        [dx, grown.x2 - wall.x1],
        [-dy, wall.y1 - grown.y1],
        [dy, grown.y2 - wall.y1],
    ]) {
        if (p === 0) {
            if (q < 0) return 0
        } else {
            const t = q / p
            if (p < 0) from = Math.max(from, t)
            else to = Math.min(to, t)
        }
    }
    if (from > to) return 0
    // a wall that only grazes a corner still counts a little, so a free spot always wins
    return Math.max(0.1, (to - from) * Math.hypot(dx, dy))
}

/** The square a symbol of `size` is drawn in, around its centre: what it takes when the lines it is drawn with are not known. */
const squareOf = (size) => ({x1: -size / 2, y1: -size / 2, x2: size / 2, y2: size / 2})

/**
 * What a symbol really covers around its centre (mm): the box around its lines (24 x 24 grid, drawn at `size`), with half the line width,
 * turned by `rotation`. Most symbols do not fill their square (a bell, a push button), so the marking can come close to the drawing itself.
 * Without lines (unknown symbol) it is the square.
 */
export const symbolExtent = (bounds, size, rotation = 0, strokeWidth = 1) => {
    if (!bounds) return squareOf(size)
    const scale = size / 24,
        half = (strokeWidth * scale) / 2
    return transformedBox(
        {x: 0, y: 0, r: rotation},
        {x1: (bounds.x1 - 12) * scale - half, y1: (bounds.y1 - 12) * scale - half, x2: (bounds.x2 - 12) * scale + half, y2: (bounds.y2 - 12) * scale + half},
    )
}

/** The box a symbol, text, door or window takes on the sheet; size = the size of the item as drawn; extent = what a symbol really covers. */
export const itemBox = (item, size, extent = squareOf(size)) => {
    if (item.kind === 'sym') return {x1: item.x + extent.x1, y1: item.y + extent.y1, x2: item.x + extent.x2, y2: item.y + extent.y2}
    if (item.kind === 'text') {
        const width = Math.max(size, String(item.txt || '').length * size * 0.55)
        return transformedBox({x: item.x, y: item.y, r: item.r}, {x1: 0, y1: -size, x2: width, y2: size * 0.3})
    }
    // door (with its swing) or window
    const half = (item.w || 10) / 2,
        local = item.kind === 'door' ? {x1: -half, y1: -2 * half, x2: half, y2: 0} : {x1: -half, y1: -1, x2: half, y2: 1}
    return transformedBox({x: item.x, y: item.y, r: item.r, sx: item.m ? -1 : 1, sy: item.f ? -1 : 1}, local)
}

/**
 * The places a marking can take around a symbol, best first: right (where it always was), then the other sides and the corners.
 * Each is the box of the text, where to write it ({x, y} with text-anchor and dominant-baseline middle) and its font size (with the symbol).
 */
export const candidateSpots = (item, size, text, extent = squareOf(size)) => {
    const fontSize = labelFontSize(size),
        width = labelWidth(text, fontSize),
        height = fontSize,
        right = item.x + extent.x2 + GAP + width / 2,
        left = item.x + extent.x1 - GAP - width / 2,
        above = item.y + extent.y1 - GAP - height / 2,
        below = item.y + extent.y2 + GAP + height / 2,
        middle = item.y + (extent.y1 + extent.y2) / 2,
        centre = item.x + (extent.x1 + extent.x2) / 2,
        // the corners: the text just beyond the corner of the symbol
        cornerAbove = item.y + extent.y1 - height / 2 + 0.4,
        cornerBelow = item.y + extent.y2 + height / 2 - 0.4
    return [
        {side: 'right', x: right, y: middle},
        {side: 'top-right', x: right, y: cornerAbove},
        {side: 'bottom-right', x: right, y: cornerBelow},
        {side: 'left', x: left, y: middle},
        {side: 'top-left', x: left, y: cornerAbove},
        {side: 'bottom-left', x: left, y: cornerBelow},
        {side: 'top', x: centre, y: above},
        {side: 'bottom', x: centre, y: below},
    ].map((spot) => ({...spot, fontSize, box: {x1: spot.x - width / 2, y1: spot.y - height / 2, x2: spot.x + width / 2, y2: spot.y + height / 2}}))
}

// what covering something costs: a wall or a symbol hides the marking, another marking or a length makes both hard to read, leaving the
// sheet loses it
const COST = {outside: 1000, wall: 100, item: 100, label: 60, text: 60}

const outsideArea = (box) => (box.x2 - box.x1) * (box.y2 - box.y1) - boxOverlap(box, DRAWING_AREA)

/**
 * Where to write the marking of each labelled symbol of a page.
 * walls: the walls of the page; items: all items of the page with their drawn size ({item, size, extent}); labelled: the symbols with a
 * marking ({item, size, text, extent}); extent (optional): what a symbol really covers (symbolExtent); texts: boxes of other texts on the page to keep clear of (the lengths of the walls). Returns a Map from item id to the chosen spot {side, x, y, box}. The markings are placed one after the other in the
 * order given, each avoiding the ones placed before it; the first spot without any obstacle wins, else the one that hides the least.
 */
export function placeLabels(walls, items, labelled, texts = []) {
    const obstacles = items.map(({item, size, extent}) => ({id: item.id, box: itemBox(item, size, extent)})),
        placed = [],
        spots = new Map()
    for (const {item, size, text, extent} of labelled) {
        let best = null
        for (const [rank, spot] of candidateSpots(item, size, text, extent).entries()) {
            let cost = COST.outside * outsideArea(spot.box)
            for (const wall of walls) cost += COST.wall * wallInBox(wall, spot.box)
            for (const obstacle of obstacles) if (obstacle.id !== item.id) cost += COST.item * boxOverlap(spot.box, obstacle.box)
            for (const other of placed) cost += COST.label * boxOverlap(spot.box, other)
            for (const text of texts) cost += COST.text * boxOverlap(spot.box, text)
            // among equally good spots the preferred order decides
            const score = cost + rank * 1e-6
            if (!best || score < best.score) best = {spot, score}
            if (cost === 0) break
        }
        placed.push(best.spot.box)
        spots.set(item.id, best.spot)
    }
    return spots
}
