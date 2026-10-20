// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Pure helpers for the situatieschema: real-world dimensions (via the footer scale) and hit testing.
const UNIT = {mm: 0.001, cm: 0.01, m: 1}
const MAX_SHEET_LEN = 400 // longer than the drawing area (mm on the sheet)

// "1:50" -> 50 (falls back to 50)
export const scaleOf = (footer) => {
    const m = /^\s*1\s*[:/]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(footer?.schaal || '')
    const v = m ? parseFloat(m[1].replace(',', '.')) : NaN
    return v > 0 ? v : 50
}
// "3,5" | "3.5m" | "350cm" | "3500 mm" -> metres (a number without unit is metres)
export const parseLen = (s) => {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*$/i.exec(String(s ?? ''))
    if (!m) return null
    const v = parseFloat(m[1].replace(',', '.')) * UNIT[(m[2] || 'm').toLowerCase()]
    return v > 0 ? v : null
}
// real metres -> millimetres on the sheet, or null when it does not fit on the sheet
export const toSheet = (metres, scale) => {
    const v = (metres * 1000) / scale
    return v > 0 && v <= MAX_SHEET_LEN ? v : null
}
export const fromSheet = (mm, scale) => (mm * scale) / 1000
export const fmtLen = (mm, scale) => fromSheet(mm, scale).toFixed(2).replace('.', ',') + ' m'
// "4x3,5" -> {w:4,h:3.5} (metres); a single value gives a square
export const parseDims = (s) => {
    const parts = String(s ?? '').split(/[x×*]/i)
    if (parts.length > 2) return null
    const w = parseLen(parts[0]),
        h = parts.length === 2 ? parseLen(parts[1]) : w
    return w == null || h == null ? null : {w, h}
}
export const r2 = (v) => Math.round(v * 100) / 100
// unit vector from a to b; within 10 degrees of an axis it snaps to that axis; a === b gives +x
export const dirTo = (a, b) => {
    const dx = b.x - a.x,
        dy = b.y - a.y,
        L = Math.hypot(dx, dy)
    if (!L) return {x: 1, y: 0}
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI,
        axis = Math.round(ang / 90) * 90
    if (Math.abs(ang - axis) < 10)
        return {x: Math.round(Math.cos((axis * Math.PI) / 180)) || 0, y: Math.round(Math.sin((axis * Math.PI) / 180)) || 0}
    return {x: dx / L, y: dy / L}
}
export const rectWalls = (a, b) =>
    [
        [a.x, a.y, b.x, a.y],
        [b.x, a.y, b.x, b.y],
        [b.x, b.y, a.x, b.y],
        [a.x, b.y, a.x, a.y],
    ].map(([x1, y1, x2, y2]) => ({x1, y1, x2, y2}))
// Liang-Barsky: does the segment touch the rectangle r = {x0,y0,x1,y1}?
export const segHitsRect = (ax, ay, bx, by, r) => {
    let t0 = 0,
        t1 = 1
    const dx = bx - ax,
        dy = by - ay
    for (const [p, q] of [
        [-dx, ax - r.x0],
        [dx, r.x1 - ax],
        [-dy, ay - r.y0],
        [dy, r.y1 - ay],
    ]) {
        if (p === 0) {
            if (q < 0) return false
        } else {
            const t = q / p
            if (p < 0) {
                if (t > t1) return false
                if (t > t0) t0 = t
            } else {
                if (t < t0) return false
                if (t < t1) t1 = t
            }
        }
    }
    return true
}
export const boxesOverlap = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0
export const wallBox = (w) => ({
    x0: Math.min(w.x1, w.x2) - 0.8,
    y0: Math.min(w.y1, w.y2) - 0.8,
    x1: Math.max(w.x1, w.x2) + 0.8,
    y1: Math.max(w.y1, w.y2) + 0.8,
})
// approximate extent of an item on the sheet (used for box selection and the delete button)
export const itemBox = (i) => {
    if (i.kind === 'text') {
        const s = i.s || 4,
            w = Math.max(s, String(i.txt || '').length * s * 0.55)
        return {x0: i.x, y0: i.y - s, x1: i.x + w, y1: i.y + s * 0.3}
    }
    const r = i.kind === 'sym' ? (i.s || 7) / 2 + 1 : (i.w || 10) / 2
    return {x0: i.x - r, y0: i.y - r, x1: i.x + r, y1: i.y + r}
}
export const unionBox = (boxes) =>
    boxes.length
        ? boxes.reduce((u, b) => ({x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1)}))
        : null
export const hitsInBox = (r, walls, items) => [
    ...walls.filter((w) => segHitsRect(w.x1, w.y1, w.x2, w.y2, r)).map((w) => ({k: 'wall', id: w.id})),
    ...items.filter((i) => boxesOverlap(itemBox(i), r)).map((i) => ({k: 'item', id: i.id})),
]
