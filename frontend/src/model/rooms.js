// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The rooms of a floor plan: the closed areas the walls enclose. Walls are loose segments (sheet millimetres), joined end to end, at
// T-junctions (an end on another wall) and where they cross; the rooms are the faces of that planar graph, without the outside.
import {fromSheet} from './geometry.js'
import {flatten} from './tree.js'

const EPS = 0.3 // sheet mm: points closer than this are the same point
const key = (point) => Math.round(point.x / EPS) + ',' + Math.round(point.y / EPS)

/** Where segment a-b and segment c-d cross or touch: the parameters along a-b (0..1), at most two (collinear overlap gives its ends). */
const cuts = (a, b, c, d) => {
    const rx = b.x - a.x,
        ry = b.y - a.y,
        sx = d.x - c.x,
        sy = d.y - c.y,
        denominator = rx * sy - ry * sx,
        length = Math.hypot(rx, ry)
    if (!length) return []
    if (Math.abs(denominator) < 1e-9) {
        // parallel: only collinear overlaps matter; cut a-b where the ends of c-d lie on it
        const offset = Math.abs((c.x - a.x) * ry - (c.y - a.y) * rx) / length
        if (offset > EPS) return []
        return [c, d].map((point) => ((point.x - a.x) * rx + (point.y - a.y) * ry) / (length * length)).filter((t) => t > 0 && t < 1)
    }
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator,
        u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator,
        slackT = EPS / length,
        slackU = EPS / Math.hypot(sx, sy)
    return t > slackT && t < 1 - slackT && u >= -slackU && u <= 1 + slackU ? [t] : []
}

/** The signed area of a polygon (sheet mm²); the walk below gives the rooms a positive one and the outside a negative one. */
const signedArea = (points) => points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
}, 0) / 2

/**
 * The rooms enclosed by the walls: [{points, area}] with `area` in sheet mm² (positive), the smallest first. A wall that ends in the
 * middle of a room (a dangling end) does not split it.
 */
export const roomFaces = (walls = []) => {
    // 1. split every wall where another wall meets or crosses it
    const segments = []
    walls.forEach((wall, index) => {
        const a = {x: wall.x1, y: wall.y1},
            b = {x: wall.x2, y: wall.y2}
        const ts = [0, 1]
        walls.forEach((other, otherIndex) => {
            if (otherIndex !== index) ts.push(...cuts(a, b, {x: other.x1, y: other.y1}, {x: other.x2, y: other.y2}))
        })
        const sorted = [...new Set(ts.map((t) => Math.round(t * 1e6) / 1e6))].sort((p, q) => p - q),
            at = (t) => ({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t})
        for (let i = 0; i + 1 < sorted.length; i++) segments.push([at(sorted[i]), at(sorted[i + 1])])
    })
    // 2. the graph: points merged within EPS, each undirected edge once
    const nodes = new Map(),
        edges = new Set(),
        nodeOf = (point) => {
            const k = key(point)
            if (!nodes.has(k)) nodes.set(k, {x: point.x, y: point.y, k, out: []})
            return nodes.get(k)
        }
    segments.forEach(([p, q]) => {
        const from = nodeOf(p),
            to = nodeOf(q)
        if (from === to) return
        const edgeKey = [from.k, to.k].sort().join('|')
        if (edges.has(edgeKey)) return
        edges.add(edgeKey)
        from.out.push(to)
        to.out.push(from)
    })
    // 3. drop dangling ends (walls that stop in a room), repeatedly
    let pruned = true
    while (pruned) {
        pruned = false
        nodes.forEach((node) => {
            if (node.out.length === 1) {
                const neighbour = node.out[0]
                neighbour.out = neighbour.out.filter((other) => other !== node)
                node.out = []
                pruned = true
            }
        })
    }
    nodes.forEach((node) => node.out.sort((p, q) => Math.atan2(p.y - node.y, p.x - node.x) - Math.atan2(q.y - node.y, q.x - node.x)))
    // 4. walk every directed edge once: at each point turn to the next edge clockwise, which traces the face on its one side
    const used = new Set(),
        faces = []
    nodes.forEach((start) =>
        start.out.forEach((first) => {
            if (used.has(start.k + '>' + first.k)) return
            const points = []
            let from = start,
                to = first,
                guard = 0
            while (!used.has(from.k + '>' + to.k) && guard++ < 10000) {
                used.add(from.k + '>' + to.k)
                points.push({x: from.x, y: from.y})
                const index = to.out.indexOf(from),
                    next = to.out[(index - 1 + to.out.length) % to.out.length]
                from = to
                to = next
            }
            if (points.length >= 3) faces.push({points, signed: signedArea(points)})
        }),
    )
    // the rooms run one way round, the outside of every separate building the other way
    return faces
        .filter((face) => face.signed > 1e-6)
        .map((face) => ({points: face.points, area: face.signed}))
        .sort((p, q) => p.area - q.area)
}

/** Is the point inside the polygon (even-odd rule)? */
export const insidePolygon = (point, polygon) => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i],
            b = polygon[j]
        if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
}

/** The smallest room around a point, or null. */
export const roomAt = (faces, point) => faces.find((face) => insidePolygon(point, face.points)) || null

/** A room's real floor area in m² at the drawing scale (1:scale). */
export const roomArea = (face, scale) => fromSheet(1, scale) ** 2 * face.area

/** "12,04 m²" in the language's decimal separator. */
export const formatArea = (squareMetres, locale = 'nl') =>
    squareMetres.toLocaleString(locale === 'en' ? 'en-GB' : locale + '-BE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' m²'

/**
 * The room each symbol of the situatieschema stands in, by its name: Map(item id → name). A room is named by a text inside it (one that
 * shows the area first, otherwise the biggest); a symbol outside every room, or in a room without a name, is not in the map.
 */
export const itemRooms = (project) => {
    const rooms = new Map()
    ;(project?.sit || []).forEach((page) => {
        const texts = (page.items || []).filter((item) => item.kind === 'text' && String(item.txt || '').trim())
        if (!texts.length) return
        const faces = roomFaces(page.walls || []),
            names = new Map()
        texts
            .slice()
            .sort((a, b) => (b.area ? 1 : 0) - (a.area ? 1 : 0) || (b.s || 0) - (a.s || 0))
            .forEach((text) => {
                const face = roomAt(faces, {x: text.x + (String(text.txt).length * (text.s || 4) * 0.55) / 2, y: text.y - (text.s || 4) / 3})
                if (face && !names.has(face)) names.set(face, String(text.txt).trim())
            })
        ;(page.items || [])
            .filter((item) => item.kind === 'sym')
            .forEach((item) => {
                const face = roomAt(faces, item)
                if (face && names.has(face)) rooms.set(item.id, names.get(face))
            })
    })
    return rooms
}

/** The rooms of a list of situatieschema items, each once, in the order met: "Keuken, Berging". '' when none is known. */
export const roomList = (rooms, items) => [...new Set(items.map((item) => rooms.get(item.id)).filter(Boolean))].join(', ')

/** The rooms the points of an eendraadschema circuit are drawn in (through the symbols linked to its elements). */
export const circuitRoomNames = (project, circuit) => {
    const ids = new Set(flatten([circuit]).map((node) => node.id)),
        linked = (project?.sit || []).flatMap((page) => (page.items || []).filter((item) => item.node && ids.has(item.node)))
    return roomList(itemRooms(project), linked)
}
