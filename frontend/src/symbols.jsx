// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Drawing of symbols and the lookup in the active symbol library. The symbols themselves (standard ones, edited ones and the user's own)
// live in the backend (GET /api/symbols, see library.jsx): that is where the standard drawings are defined and where they are restored from.
// Symbols are drawn on a 24x24 grid; the connection point of a symbol is on the line y = 12 and the supply enters from the left.
// Shapes: line, circle, rect (both optionally filled with f: 1 = in the colour of the drawing, 2 = in the colour of the paper), path (SVG path data d,
// filled with f like the others), text (optional fs = font size, b = bold) and arc (degrees, clockwise on screen). Every shape may have sw: the line weight
// relative to the weight of the drawing. Most standard symbols are drawn like those of the online eendraadschema (see UpstreamSymbols.java).
export const rd = (v) => Math.round(v * 100) / 100
const L = (x1, y1, x2, y2) => ({t: 'line', x1, y1, x2, y2}),
    T = (x, y, s, fs) => (fs ? {t: 'text', x, y, s, fs} : {t: 'text', x, y, s}),
    AR = (cx, cy, r, a1, a2) => ({t: 'arc', cx, cy, r, a1, a2}),
    WT = (h, sw) => ({...h, sw})
// the drawing of the eendraadschema is scaled by U (a 40 x 40 box becomes 14 x 14), its x = 1 is our x = 1 and its centre line our y = 12 (see UpstreamSymbols.java)
const U = 0.35,
    W2 = 1.5,
    STACK = 29,
    PITCH = 24, // distance between chained sockets (20 in the eendraadschema, a bit more so that the arches do not seem glued together)
    ux = (x) => rd(1 - U + U * x),
    uy = (y) => rd(12 + U * y)
// Socket (contactdoos) as in the eendraadschema: pe = bar for the protective conductor, kid = little feet on the arch (kinderveiligheid),
// h = waterproof, n = number of sockets. Horizontal (default, how the eendraadschema chains them): the supply line meets the apex of arcs
// that open to the right, n arcs chained every PITCH (24) units of the eendraadschema grid (the whole stack is scaled down when that does not fit the grid). Vertical
// (hor = false): the supply line drops onto an arch, with n > 1 the number is written next to it. For the horizontal drawing the standard
// symbols of the backend (StandardSymbols.socket) are the same: keep them equal.
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
    // n sockets do not fit the grid at the full size: the whole stack (arches, bars, feet) is scaled down about its supply point, so the gap between
    // the arches stays in proportion for double, triple, quadruple, ... sockets (f = 1 up to a double socket)
    const f = n > 1 ? Math.min(1, (35 + STACK) / (35 + (n - 1) * PITCH)) : 1,
        s = U * f,
        X = (x) => rd(1 - s + s * x),
        Y = (y) => rd(12 + s * y),
        r = rd(15 * s),
        out = [L(1, 12, X(21 + (n - 1) * PITCH), 12)]
    for (let k = 0; k < n; k++) {
        const apex = X(21 + k * PITCH),
            cx = X(36 + k * PITCH)
        if (pe) out.push(WT(L(apex, rd(12 - r), apex, rd(12 + r)), W2))
        out.push(WT(AR(cx, 12, r, 90, 270), W2))
        if (kid) out.push(WT(L(cx, Y(-20), cx, Y(-14.1)), W2), WT(L(cx, Y(20), cx, Y(14.1)), W2))
    }
    if (h) out.push(T(X(21), rd(12 - r - 1.8), 'h', 4.5))
    return out
}
// waterproof (h) is not a symbol of its own but a property of a placed socket (p.h; on the situatieschema also of a loose symbol): the small 'h' next to it
// number of sockets of a placed symbol (p.aantal multiplies the sockets of the symbol) and whether they are drawn horizontally (p.hor, default yes)
export const stackOf = (t, pr = {}) => {
    const n = (t.sock?.n || 1) * (Number(pr.aantal) > 1 ? Number(pr.aantal) : 1)
    return t.sock ? {n, hor: pr.hor ?? true} : null
}
// the drawing of a placed symbol: the symbol itself, unless it is a socket that has to be stacked or drawn vertically
export const shapesOf = (t, pr = {}) => {
    const sk = stackOf(t, pr)
    if (!sk) return t.shapes
    const h = !!(t.sock.h || pr.h)
    if (!sk.hor) return sockShapes({...t.sock, h}, false)
    return sk.n === (t.sock.n || 1) && h === !!t.sock.h ? t.shapes : sockShapes({...t.sock, n: sk.n, h}, true)
}
// a symbol that is not in the library (anymore, e.g. deleted): a box with a question mark
const UNKNOWN = {k: '?', name: 'Onbekend symbool', cat: 'Overig', parents: [], place: false, shapes: [{t: 'rect', x: 2, y: 6, w: 20, h: 12}, T(12, 15, '?')]}
// the empty element made by the "insert before / after" buttons: a dashed-looking box that is replaced by a real symbol with the Type dropdown.
// It is not in the library (so it is not in the palette) and is not placed on the situatieschema.
export const EMPTY_TYPE = {
    k: 'leeg',
    name: 'Leeg symbool',
    cat: 'Overig',
    parents: [],
    place: false,
    shapes: [L(1, 12, 5, 12), {t: 'rect', x: 5, y: 6, w: 14, h: 12, sw: 0.6}, L(19, 12, 23, 12), T(12, 15, '?', 8)],
}
// The root of an eendraadschema (the connection to the grid). It has no symbol of its own in the library: on the board it is drawn as the kWh meter and
// the main breaker/differential. It is still a type of the tree, and the parts that may hang directly under it are listed here, not in the backend.
export const CONNECTION_TYPE = {
    k: 'aansluiting',
    name: 'Aansluiting net',
    cat: 'Verdeling',
    parents: [],
    place: false,
    shapes: [{t: 'rect', x: 4, y: 6, w: 16, h: 12}, L(4, 6, 20, 18), L(4, 18, 20, 6)],
}
export const UNDER_CONNECTION = ['teller', 'hoofdschakelaar', 'bord', 'diff', 'aarding']
let LIB = [],
    IDX = new Map()
// the active symbol library (standard symbols + the user's edited and own ones, as delivered by the backend)
export const setLibrary = (l) => {
    // the library does not know the connection: the parts that hang under it get it as an allowed parent here
    LIB = (l || []).map((t) => (UNDER_CONNECTION.includes(t.k) && !t.parents.includes('aansluiting') ? {...t, parents: [...t.parents, 'aansluiting']} : t))
    IDX = new Map(LIB.map((t) => [t.k, t]))
}
// projects saved before the library existed carry their own components in p.custom: they are still understood
const legacy = (p) =>
    (p.custom || [])
        .map((c) => ({k: 'custom:' + c.id, name: c.name, cat: c.cat || 'Eigen', parents: c.parents || IDX.get('stopcontact')?.parents || [], place: c.place !== false, shapes: c.shapes}))
        .filter((t) => !IDX.has(t.k))
export const allTypes = (p) => [...LIB, ...legacy(p)]
export const typeOf = (p, k) => IDX.get(k) || (k === EMPTY_TYPE.k ? EMPTY_TYPE : null) || (k === CONNECTION_TYPE.k ? CONNECTION_TYPE : null) || legacy(p).find((t) => t.k === k) || UNKNOWN
export const arcPath = (h) => {
    const r = Math.PI / 180,
        pt = (a) => `${rd(h.cx + h.r * Math.cos(a * r))} ${rd(h.cy + h.r * Math.sin(a * r))}`
    return `M${pt(h.a1)}A${h.r} ${h.r} 0 ${(((h.a2 - h.a1) % 360) + 360) % 360 > 180 ? 1 : 0} 1 ${pt(h.a2)}`
}
// rot: the rotation (degrees) the parent applies to the symbol; texts in the symbol (the h of a waterproof socket) are turned back so that they stay upright and readable
export const Sym = ({shapes, x = 0, y = 0, s = 8, stroke = '#000', w = 1.5, rot = 0}) => {
    // the colour a shape is filled with: f 1 = the colour of the drawing, f 2 = the paper (it hides what lies behind it)
    const fill = (h) => (h.f === 2 ? {fill: '#fff'} : h.f ? {fill: stroke} : {}),
        // the line weight of a shape is relative to the one of the drawing
        sw = (h) => (h.sw ? {strokeWidth: rd(w * h.sw)} : {})
    return (
        <g transform={`translate(${x - s / 2},${y - s / 2}) scale(${s / 24})`} stroke={stroke} fill="none" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
            {shapes.map((h, i) =>
                h.t === 'line' ? (
                    <line key={i} x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} {...sw(h)} />
                ) : h.t === 'circle' ? (
                    <circle key={i} cx={h.cx} cy={h.cy} r={h.r} {...fill(h)} {...sw(h)} />
                ) : h.t === 'rect' ? (
                    <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} {...fill(h)} {...sw(h)} />
                ) : h.t === 'arc' ? (
                    <path key={i} d={arcPath(h)} {...sw(h)} />
                ) : h.t === 'path' ? (
                    <path key={i} d={h.d} {...fill(h)} {...sw(h)} />
                ) : (
                    <text
                        key={i}
                        x={h.x}
                        y={h.y}
                        fontSize={h.fs || 10}
                        fontWeight={h.b ? 'bold' : undefined}
                        textAnchor="middle"
                        fill={stroke}
                        stroke="none"
                        transform={rot % 360 ? `rotate(${-rot} ${h.x} ${rd(h.y - (h.fs || 10) * 0.35)})` : undefined}
                    >
                        {h.s}
                    </text>
                ),
            )}
        </g>
    )
}
