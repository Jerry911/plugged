// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// SVG path data (the 'path' shapes of a symbol) as a polyline: curves and arcs are sampled. Used to find where a path touches the connection
// line of a symbol and how far it reaches.

const ARGUMENTS = {M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0}
const CURVE_STEPS = 12

// the points of an elliptical arc from (x0, y0) to (x, y) (SVG endpoint parameterization, F.6.5 of the SVG specification)
const arcPoints = (x0, y0, rx, ry, rotation, large, sweep, x, y) => {
    if ((x0 === x && y0 === y) || !rx || !ry) return [[x, y]]
    rx = Math.abs(rx)
    ry = Math.abs(ry)
    const phi = (rotation * Math.PI) / 180,
        cos = Math.cos(phi),
        sin = Math.sin(phi),
        dx = (x0 - x) / 2,
        dy = (y0 - y) / 2,
        x1 = cos * dx + sin * dy,
        y1 = -sin * dx + cos * dy,
        lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
    if (lambda > 1) {
        rx *= Math.sqrt(lambda)
        ry *= Math.sqrt(lambda)
    }
    const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1,
        denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1,
        factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator)),
        cx1 = (factor * rx * y1) / ry,
        cy1 = (-factor * ry * x1) / rx,
        cx = cos * cx1 - sin * cy1 + (x0 + x) / 2,
        cy = sin * cx1 + cos * cy1 + (y0 + y) / 2,
        angleOf = (ux, uy) => Math.atan2(uy, ux),
        start = angleOf((x1 - cx1) / rx, (y1 - cy1) / ry)
    let delta = angleOf((-x1 - cx1) / rx, (-y1 - cy1) / ry) - start
    if (!sweep && delta > 0) delta -= 2 * Math.PI
    if (sweep && delta < 0) delta += 2 * Math.PI
    const steps = Math.max(2, Math.ceil(Math.abs(delta) / (Math.PI / 18)))
    return Array.from({length: steps}, (_, i) => {
        const angle = start + (delta * (i + 1)) / steps
        return [cx + rx * Math.cos(angle) * cos - ry * Math.sin(angle) * sin, cy + rx * Math.cos(angle) * sin + ry * Math.sin(angle) * cos]
    })
}

const bezier = (points, steps = CURVE_STEPS) =>
    Array.from({length: steps}, (_, i) => {
        let level = points
        const t = (i + 1) / steps
        while (level.length > 1) level = level.slice(1).map((p, j) => [level[j][0] + (p[0] - level[j][0]) * t, level[j][1] + (p[1] - level[j][1]) * t])
        return level[0]
    })

/** The points of path data in drawing order (absolute and relative commands, curves and arcs sampled; Z returns to the start of the subpath). */
export const pathPoints = (d) => {
    const points = []
    let x = 0,
        y = 0,
        startX = 0,
        startY = 0,
        lastControl = null
    const push = (list) => {
        list.forEach((p) => points.push(p))
        if (list.length) [x, y] = list[list.length - 1]
    }
    for (const [, letter, rest] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
        const command = letter.toUpperCase(),
            relative = letter !== command,
            numbers = (rest.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number),
            size = ARGUMENTS[command]
        if (size === undefined) continue
        if (command === 'Z') {
            push([[startX, startY]])
            lastControl = null
            continue
        }
        for (let i = 0; i + size <= numbers.length; i += size) {
            const n = numbers.slice(i, i + size),
                ox = relative ? x : 0,
                oy = relative ? y : 0
            let control = null
            switch (command) {
                case 'M':
                case 'L': {
                    push([[n[0] + ox, n[1] + oy]])
                    if (command === 'M' && i === 0) [startX, startY] = [x, y]
                    break
                }
                case 'H':
                    push([[n[0] + ox, y]])
                    break
                case 'V':
                    push([[x, n[0] + oy]])
                    break
                case 'C':
                    control = [n[2] + ox, n[3] + oy]
                    push(bezier([[x, y], [n[0] + ox, n[1] + oy], control, [n[4] + ox, n[5] + oy]]))
                    break
                case 'S': {
                    const first = lastControl ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y]
                    control = [n[0] + ox, n[1] + oy]
                    push(bezier([[x, y], first, control, [n[2] + ox, n[3] + oy]]))
                    break
                }
                case 'Q':
                    control = [n[0] + ox, n[1] + oy]
                    push(bezier([[x, y], control, [n[2] + ox, n[3] + oy]]))
                    break
                case 'T': {
                    control = lastControl ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y]
                    push(bezier([[x, y], control, [n[0] + ox, n[1] + oy]]))
                    break
                }
                default: // A
                    push(arcPoints(x, y, n[0], n[1], n[2], !!n[3], !!n[4], n[5] + ox, n[6] + oy))
            }
            lastControl = control
        }
    }
    return points
}
