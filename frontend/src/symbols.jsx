// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Drawing of symbols and the lookup in the active symbol library. The symbols themselves (standard ones, edited ones and the user's own)
// live in the backend (GET /api/symbols, see library.js): that is where the standard drawings are defined and where they are restored from.
// Symbols are drawn on a 24x24 grid; the connection point of a symbol is on the line y = 12 and the supply enters from the left.
// Shapes: line, circle, rect (both optionally filled with f: 1), text (optional fs = font size) and arc (degrees, clockwise on screen).
export const rd = (v) => Math.round(v * 100) / 100
const L = (x1, y1, x2, y2) => ({t: 'line', x1, y1, x2, y2}),
    T = (x, y, s, fs) => (fs ? {t: 'text', x, y, s, fs} : {t: 'text', x, y, s}),
    AR = (cx, cy, r, a1, a2) => ({t: 'arc', cx, cy, r, a1, a2})
// Socket (contactdoos) after the PDF: pe = bar for the protective conductor, kid = little feet on the arch (kinderveiligheid),
// h = waterproof, n = number of sockets. Horizontal (default, how the eendraadschema chains them): the supply line meets the apex of arcs
// that open to the right, n arcs stacked behind each other. Vertical (hor = false): the supply line drops onto an arch, with n > 1 the
// number is written next to it. For n = 1 the horizontal drawing is the standard symbol of the backend (StandardSymbols.socket): keep them equal.
export const sockShapes = ({pe = true, kid = false, h = false, n = 1} = {}, hor = true) => {
    if (!hor)
        return [
            L(1, 12, 14, 12),
            L(14, 12, 14, 15.5),
            ...(pe ? [L(9.5, 15.5, 18.5, 15.5)] : []),
            AR(14, 20, 4.5, 180, 360),
            ...(kid ? [L(8.2, 20, 9.5, 20), L(18.5, 20, 19.8, 20)] : []),
            ...(h ? [T(20, 10, 'h', 8)] : n > 1 ? [T(20, 10, String(n), 7)] : []),
        ]
    const r = 4.5,
        x0 = 4,
        sp = n > 1 ? rd(Math.min(4, (19 - r) / (n - 1))) : 0,
        out = [L(1, 12, x0, 12)]
    if (pe && n === 1) out.push(L(x0, 12 - 5.2, x0, 12 + 5.2))
    for (let k = 0; k < n; k++) {
        const cx = rd(x0 + r + k * sp)
        out.push(AR(cx, 12, r, 90, 270))
        if (kid) out.push(L(cx, rd(12 - r - 1.3), cx, rd(12 - r)), L(cx, rd(12 + r), cx, rd(12 + r + 1.3)))
    }
    if (h && n === 1) out.push(T(13, 9, 'h', 8))
    return out
}
// number of sockets of a placed symbol (p.aantal multiplies the sockets of the symbol) and whether they are drawn horizontally (p.hor, default yes)
export const stackOf = (t, pr = {}) => {
    const n = (t.sock?.n || 1) * (Number(pr.aantal) > 1 ? Number(pr.aantal) : 1)
    return t.sock ? {n, hor: pr.hor ?? true} : null
}
// the drawing of a placed symbol: the symbol itself, unless it is a socket that has to be stacked or drawn vertically
export const shapesOf = (t, pr = {}) => {
    const sk = stackOf(t, pr)
    if (!sk) return t.shapes
    if (!sk.hor) return sockShapes(t.sock, false)
    return sk.n === (t.sock.n || 1) ? t.shapes : sockShapes({...t.sock, n: sk.n}, true)
}
// a symbol that is not in the library (anymore): a box with a question mark
const UNKNOWN = {k: '?', name: 'Onbekend symbool', cat: 'Overig', parents: [], place: false, shapes: [{t: 'rect', x: 2, y: 6, w: 20, h: 12}, T(12, 15, '?')]}
let LIB = [],
    IDX = new Map()
// the active symbol library (standard symbols + the user's edited and own ones, as delivered by the backend)
export const setLibrary = (l) => {
    LIB = l || []
    IDX = new Map(LIB.map((t) => [t.k, t]))
}
// projects saved before the library existed carry their own components in p.custom: they are still understood
const legacy = (p) =>
    (p.custom || [])
        .map((c) => ({k: 'custom:' + c.id, name: c.name, cat: c.cat || 'Eigen', parents: c.parents || IDX.get('stopcontact')?.parents || [], place: c.place !== false, shapes: c.shapes}))
        .filter((t) => !IDX.has(t.k))
export const allTypes = (p) => [...LIB, ...legacy(p)]
export const typeOf = (p, k) => IDX.get(k) || legacy(p).find((t) => t.k === k) || IDX.get('aansluiting') || UNKNOWN
export const arcPath = (h) => {
    const r = Math.PI / 180,
        pt = (a) => `${rd(h.cx + h.r * Math.cos(a * r))} ${rd(h.cy + h.r * Math.sin(a * r))}`
    return `M${pt(h.a1)}A${h.r} ${h.r} 0 ${(((h.a2 - h.a1) % 360) + 360) % 360 > 180 ? 1 : 0} 1 ${pt(h.a2)}`
}
export const Sym = ({shapes, x = 0, y = 0, s = 8, stroke = '#000', w = 1.5}) => (
    <g transform={`translate(${x - s / 2},${y - s / 2}) scale(${s / 24})`} stroke={stroke} fill="none" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
        {shapes.map((h, i) =>
            h.t === 'line' ? (
                <line key={i} x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} />
            ) : h.t === 'circle' ? (
                <circle key={i} cx={h.cx} cy={h.cy} r={h.r} {...(h.f ? {fill: stroke} : {})} />
            ) : h.t === 'rect' ? (
                <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} {...(h.f ? {fill: stroke} : {})} />
            ) : h.t === 'arc' ? (
                <path key={i} d={arcPath(h)} />
            ) : (
                <text key={i} x={h.x} y={h.y} fontSize={h.fs || 10} textAnchor="middle" fill={stroke} stroke="none">
                    {h.s}
                </text>
            ),
        )}
    </g>
)
