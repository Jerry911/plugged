// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Standard components on a 24x24 grid (the connection point of a symbol is on the line y = 12). They are the defaults of the
// component library: the active library (defaults + edited + own components, stored in the database) is registered with setLibrary().
// Shapes: line, circle, rect (both optionally filled with f: 1), text (optional fs = font size) and arc (degrees, clockwise on screen).
// Drawn after AREI Boek 1, hoofdstuk 2.13, tabel 2.23 (grafische symbolen). Bump SYMV when the standard drawings change: stored
// copies of the standard components with another version are replaced by the new standard (see mergeLibrary in library.js).
export const SYMV = 3
const rd = (v) => Math.round(v * 100) / 100
const L = (x1, y1, x2, y2) => ({t: 'line', x1, y1, x2, y2}),
    C = (cx, cy, r) => ({t: 'circle', cx, cy, r}),
    B = (x, y, w, h) => ({t: 'rect', x, y, w, h}),
    T = (x, y, s, fs) => (fs ? {t: 'text', x, y, s, fs} : {t: 'text', x, y, s})
const AR = (cx, cy, r, a1, a2) => ({t: 'arc', cx, cy, r, a1, a2}),
    DOT = (cx, cy, r = 1.4) => ({t: 'circle', cx, cy, r, f: 1})
const X = (k, name, cat, parents, shapes, place = true, extra = {}) => ({k, name, cat, parents, place, shapes, v: SYMV, ...extra})
const EL = [
    'kring',
    'domotica',
    'subbord',
    'schakelaar',
    'schakelaar2',
    'schakelaar3',
    'verklikker',
    'wissel',
    'omschakelaar',
    'kruis',
    'dimmer',
    'drukknop',
    'lichtpunt',
    'stopcontact',
    'stopcontact_alg',
    'stopcontact_kid',
    'stopcontact_pekid',
    'stopcontact2',
    'stopcontact3',
    'stopcontact_h',
    'trafo',
    'modulaire',
    'motor',
    'bel',
    'zoemer',
    'sirene',
    'klok',
    'data',
    'tv',
    'vrij',
    'lichtcircuit',
    'microgolf',
    'zonnepanelen',
    'omvormer',
    'batterij',
    'oven',
    'kookplaat',
    'wasmachine',
    'droogkast',
    'vaatwas',
    'koelkast',
    'diepvries',
    'airco',
    'ventilatie',
    'laadpaal',
    'boiler',
    'verwarming',
    'thermostaat',
    'rookmelder',
    'aftakdoos',
    'wandlamp',
    'tl',
    'noodlicht',
]
const KR = EL,
    LP = EL,
    V = 'Verdeling',
    S = 'Stopcontacten',
    O = 'Verlichting & bediening',
    A = 'Toestellen',
    E = 'Energie',
    G = 'Overig'
// lamp (still used by the lichtcircuit): circle with a cross whose ends touch the circle
const lamp = (cx = 12, cy = 12, r = 7) => {
    const d = rd(r * Math.SQRT1_2)
    return [C(cx, cy, r), L(rd(cx - d), rd(cy - d), rd(cx + d), rd(cy + d)), L(rd(cx + d), rd(cy - d), rd(cx - d), rd(cy + d))]
}
// lichtpunt: supply line ending in a cross (the cross is centred on the end of the line)
const cross = (cx, cy, r = 5) => [L(cx - r, cy - r, cx + r, cy + r), L(cx - r, cy + r, cx + r, cy - r)]
// switch: supply line, hinge circle (centre cx), lever (starts on the circle) and flags that start on the lever (one flag per pole)
const UX = 0.766,
    UY = -0.643
const lever = (flags = 1, cx = 7) => {
    const ex = rd(cx + 12 * UX),
        ey = rd(12 + 12 * UY),
        out = [L(1, 12, cx - 2.5, 12), C(cx, 12, 2.5), L(rd(cx + 2.5 * UX), rd(12 + 2.5 * UY), ex, ey)]
    for (let k = 0; k < flags; k++) {
        const px = ex - k * 2.4 * UX,
            py = ey - k * 2.4 * UY
        out.push(L(rd(px), rd(py), rd(px + 1.93), rd(py + 2.3)))
    }
    return out
}
// an arm of a multi-way switch: a lever from the hinge circle (centre cx, 12; r 2.5) along the unit vector (ux, uy) with a flag at its end
const arm = (cx, ux, uy, len) => {
    const ex = rd(cx + len * ux),
        ey = rd(12 + len * uy),
        sx = ux > 0 ? 1 : -1,
        sy = uy < 0 ? 1 : -1
    return [L(rd(cx + 2.5 * ux), rd(12 + 2.5 * uy), ex, ey), L(ex, ey, rd(ex + sx * 1.93), rd(ey + sy * 2.3))]
}
// socket (contactdoos), after the PDF: pe = bar for the protective conductor, kid = little feet on the arch (kinderveiligheid),
// h = waterproof, n = number of sockets. Vertical (default for one socket): supply line that drops onto an arch; with n > 1 the
// number is written next to it. Horizontal: the supply line meets the apex of arcs opening to the right, n arcs stacked behind each other.
export const sockShapes = ({pe = true, kid = false, h = false, n = 1} = {}, hor = false) => {
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
    if (pe && n === 1) out.push(L(x0, 12 - r, x0, 12 + r))
    for (let k = 0; k < n; k++) {
        const cx = rd(x0 + r + k * sp)
        out.push(AR(cx, 12, r, 90, 270))
        if (kid) out.push(L(cx, rd(12 - r - 1.3), cx, rd(12 - r)), L(cx, rd(12 + r), cx, rd(12 + r + 1.3)))
    }
    if (h && n === 1) out.push(T(20, 8, 'h', 8))
    return out
}
// horizontal stacking of a socket on the eendraadschema: by default as soon as there is more than one (p.aantal), p.hor overrides
export const stackOf = (t, pr = {}) => {
    const n = (t.sock?.n || 1) * (Number(pr.aantal) > 1 ? Number(pr.aantal) : 1)
    return t.sock ? {n, hor: pr.hor ?? n > 1} : null
}
const socket = (o) => sockShapes(o)
// appliance (verbruiker): supply line and a square at the right
const app = (shapes = []) => [L(1, 12, 8, 12), B(8, 5, 14, 14), ...shapes]
const tilde = (cx, cy) => [AR(rd(cx - 1.5), cy, 1.5, 180, 360), AR(rd(cx + 1.5), cy, 1.5, 0, 180)]
const snow = (cx, cy, r = 4) => {
    const a = rd(r * 0.866),
        b = rd(r * 0.5)
    return [L(cx, cy - r, cx, cy + r), L(rd(cx - a), rd(cy - b), rd(cx + a), rd(cy + b)), L(rd(cx - a), rd(cy + b), rd(cx + a), rd(cy - b))]
}
// automatic circuit breaker (kleine vermogensschakelaar): vertical, terminals above and below and a lever with a small square
const breaker = (square = true) => [L(13, 2, 13, 8), L(13, 15, 13, 22), L(13, 15, 9.5, 9), ...(square ? [B(8, 7, 2.6, 2.6)] : [])]
const hatch = (x1, x2, y1, y2, n) => Array.from({length: n}, (_, i) => rd(x1 + ((x2 - x1) * i) / (n - 1))).map((x) => L(x, y1, x, y2))
// vertical lines inside a circle (boiler)
const circleHatch = (cx, cy, r, n) =>
    Array.from({length: n}, (_, i) => rd(cx - r + ((i + 1) * 2 * r) / (n + 1))).map((x) => {
        const d = rd(Math.sqrt(r * r - (x - cx) ** 2))
        return L(x, rd(cy - d), x, rd(cy + d))
    })
export const BUILTIN = [
    X('aansluiting', 'Aansluiting net', V, [], [B(4, 6, 16, 12), L(4, 6, 20, 18), L(4, 18, 20, 6)], false),
    X('teller', 'Teller (kWh)', V, ['aansluiting'], [L(1, 12, 8, 12), B(8, 5, 14, 14), L(8, 8, 22, 8), T(15, 16.5, 'kWh', 5.5)]),
    X('hoofdschakelaar', 'Hoofdschakelaar', V, ['aansluiting', 'teller'], breaker(false), false),
    X('bord', 'Verdeelbord', V, ['aansluiting', 'teller', 'hoofdschakelaar', 'diff', 'bord'], [B(2, 7, 20, 10)]),
    X('diff', 'Differentieel (aardlek)', V, ['bord', 'hoofdschakelaar', 'aansluiting', 'teller'], [...breaker(false), L(13, 12, 15, 12), B(15, 10, 7, 4)], false),
    X('overspanning', 'Overspanningsbeveiliging', V, ['bord'], [B(3, 7, 18, 10), T(12, 15, 'SPD')], false),
    X('kring', 'Kring (automaat)', V, ['bord', 'diff', 'domotica', 'subbord', 'kring'], breaker(), false),
    X('zekering', 'Smeltveiligheid', V, ['bord', 'diff'], [L(1, 12, 23, 12), B(5, 8.5, 14, 7)], false),
    X('stopcontact_alg', 'Stopcontact (algemeen symbool)', S, KR, socket({pe: false}), true, {sock: {pe: false}}),
    X('stopcontact', 'Stopcontact', S, KR, socket({pe: true}), true, {sock: {pe: true}}),
    X('stopcontact_kid', 'Stopcontact (kinderveiligheid)', S, KR, socket({pe: false, kid: true}), true, {sock: {pe: false, kid: true}}),
    X('stopcontact_pekid', 'Stopcontact (aarding + kinderveiligheid)', S, KR, socket({pe: true, kid: true}), true, {sock: {pe: true, kid: true}}),
    X('stopcontact2', 'Dubbel stopcontact', S, KR, socket({n: 2}), true, {sock: {pe: true, n: 2}}),
    X('stopcontact3', 'Drievoudig stopcontact', S, KR, socket({n: 3}), true, {sock: {pe: true, n: 3}}),
    X('stopcontact_h', 'Waterdicht stopcontact', S, KR, socket({h: true}), true, {sock: {pe: true, h: true}}),
    X('data', 'Data (RJ45)', S, KR, [L(1, 12, 9, 12), L(9, 6, 9, 18), L(9, 6, 16, 6), L(9, 18, 16, 18)]),
    X('tv', 'TV-aansluiting', S, KR, [B(5, 5, 14, 14), T(12, 15, 'TV')]),
    X('lichtpunt', 'Lichtpunt', O, LP, [L(1, 12, 15, 12), ...cross(15, 12)]),
    X('wandlamp', 'Wandlamp', O, LP, [L(1, 12, 9, 12), ...cross(9, 12), L(16, 4, 16, 20)]),
    X('tl', 'TL-armatuur', O, LP, [L(3, 12, 21, 12), L(3, 6, 3, 18), L(21, 6, 21, 18)]),
    X('noodlicht', 'Noodverlichting', O, LP, [B(3, 3, 18, 18), ...cross(12, 12, 7), DOT(12, 12, 1.8)]),
    X('schakelaar', 'Enkelpolige schakelaar', O, KR, lever(1)),
    X('schakelaar2', 'Tweepolige schakelaar', O, KR, lever(2)),
    X('schakelaar3', 'Driepolige schakelaar', O, KR, lever(3)),
    X('verklikker', 'Schakelaar met verklikkerlamp', O, KR, [L(1, 12, 4.5, 12), C(7, 12, 2.5), ...cross(7, 12, 1.77), ...lever(1).slice(2)]),
    X('wissel', 'Wisselschakelaar', O, KR, [L(1, 12, 9.5, 12), C(12, 12, 2.5), ...arm(12, UX, UY, 11), ...arm(12, -UX, -UY, 11)]),
    X('omschakelaar', 'Omschakelaar', O, KR, [L(1, 12, 9.5, 12), C(12, 12, 2.5), ...arm(12, -0.5, -0.866, 11), ...arm(12, 0.5, -0.866, 11)]),
    X('kruis', 'Kruisschakelaar', O, KR, [L(1, 12, 9.5, 12), C(12, 12, 2.5), ...arm(12, -0.5, -0.866, 10), ...arm(12, 0.5, -0.866, 10), ...arm(12, -0.5, 0.866, 10), ...arm(12, 0.5, 0.866, 10)]),
    X('dimmer', 'Dimmer', O, KR, [...lever(0), L(11.7, 8.9, 19.5, 5), L(19.5, 5, 19.5, 12), L(19.5, 12, 11.7, 8.9)]),
    X('drukknop', 'Drukknop', O, KR, [C(12, 12, 7), C(12, 12, 3.2)]),
    X('bel', 'Bel', O, KR, [L(1, 12, 12, 12), L(12, 6, 12, 18), AR(12, 12, 6, -90, 90)]),
    X('zoemer', 'Zoemer', O, KR, [L(1, 12, 12, 12), L(12, 6, 12, 18), L(12, 6, 16, 6), L(12, 18, 16, 18), AR(16, 12, 6, -90, 90)]),
    X('sirene', 'Sirene', O, KR, [L(1, 12, 12, 12), L(12, 5, 12, 19), L(12, 5, 22, 12), L(12, 19, 22, 12)]),
    X('klok', 'Horloge', O, KR, [C(12, 12, 8), L(12, 12, 12, 6), L(12, 12, 7, 12), DOT(12, 12, 1)]),
    X('rookmelder', 'Rookmelder', O, KR, [C(12, 12, 8), T(12, 15, 'R')]),
    X('thermostaat', 'Thermostaat', O, KR, [B(2, 7, 20, 10), C(12, 12, 3.2), L(9.5, 12, 14.5, 12)]),
    X('motor', 'Motor', A, KR, [L(1, 12, 6, 12), C(14, 12, 8), T(14, 15.5, 'M', 11)]),
    X('verwarming', 'Elektrische verwarming', A, KR, [L(1, 12, 10, 12), B(10, 6, 12, 12), ...hatch(12, 20, 6, 18, 5)]),
    X('boiler', 'Boiler', A, KR, [C(12, 12, 8), ...circleHatch(12, 12, 8, 5)]),
    X('kookplaat', 'Kookplaat', A, KR, app([DOT(12.5, 9.5, 1.6), DOT(17.5, 9.5, 1.6), DOT(17.5, 14.5, 1.6)])),
    X('oven', 'Oven', A, KR, app([L(8, 8, 22, 8), DOT(15, 14, 1.8)])),
    X('wasmachine', 'Wasmachine', A, KR, app([C(15, 12, 4.5), DOT(15, 12, 1.8)])),
    X('droogkast', 'Droogkast', A, KR, app([C(13.5, 9, 1.8), C(17, 9, 1.8), DOT(15, 15, 1.6)])),
    X('vaatwas', 'Vaatwasser', A, KR, app([L(8, 5, 13.2, 10.2), L(16.8, 13.8, 22, 19), L(22, 5, 16.8, 10.2), L(13.2, 13.8, 8, 19), C(15, 12, 2.5)])),
    X('koelkast', 'Koelkast', A, KR, app(snow(15, 12, 4))),
    X('diepvries', 'Diepvriezer', A, KR, [L(1, 12, 5, 12), B(5, 7, 17, 10), ...snow(8.5, 12, 2.2), ...snow(13.5, 12, 2.2), ...snow(18.5, 12, 2.2)]),
    X('airco', 'Airco / warmtepomp', A, KR, [B(2, 6, 20, 12), T(12, 15, 'AC')]),
    X('ventilatie', 'Ventilator', A, KR, app([C(12.5, 12, 2.5), C(17.5, 12, 2.5)])),
    X('microgolf', 'Microgolfoven', A, KR, app([...tilde(15, 9.5), ...tilde(15, 14.5)])),
    X('laadpaal', 'Laadpaal EV', E, KR, [B(4, 3, 11, 18), B(6, 5, 7, 3.5), L(9.5, 10, 9.5, 18), L(17, 3, 17, 18), B(16, 3, 2, 2.5), L(3, 21, 16, 21)]),
    X('zonnepanelen', 'Zonnepanelen', E, EL, [B(3, 4, 18, 16), L(3, 14, 21, 14), L(6, 6.5, 11, 11.5), L(11, 11.5, 11, 8.7), L(11, 11.5, 8.2, 11.5), L(9, 5.5, 14, 10.5)]),
    X('omvormer', 'Omvormer', E, EL, [B(3, 4, 18, 16), L(3, 20, 21, 4), ...tilde(8, 9), L(13, 15, 19, 15), L(13, 17.5, 14.5, 17.5), L(16, 17.5, 17.5, 17.5)]),
    X('batterij', 'Thuisbatterij', E, EL, [B(3, 8, 16, 10), B(19, 11, 3, 4), L(8, 10, 8, 16)]),
    X('domotica', 'Domotica (kast)', G, EL, [B(3, 3, 18, 18), L(3, 10, 21, 10), C(9, 16, 1.5), L(10.1, 14.9, 14, 12), L(14, 12, 15.5, 13.5)]),
    X('subbord', 'Onderbord', G, [...EL, 'bord'], [B(2, 5, 20, 14), L(2, 12, 22, 12)]),
    X('trafo', 'Transformator', G, EL, [C(9, 12, 6), C(15, 12, 6)]),
    X('modulaire', 'Modulaire schakelaar', O, EL, [B(5, 2, 14, 19), L(5, 18.5, 19, 18.5), C(10, 14.5, 1.6), L(11.1, 13.4, 15, 8), L(15, 8, 16.9, 10.3)]),
    X('lichtcircuit', 'Lichtcircuit', O, EL, [...lamp(), C(12, 12, 10)]),
    X('aftakdoos', 'Aftakdoos', G, KR, [C(12, 12, 8), DOT(12, 12, 2.6)]),
    X(
        'aarding',
        'Aardingspunt',
        G,
        ['bord', 'aansluiting'],
        [L(12, 3, 12, 12), L(5, 12, 19, 12), L(8, 15, 16, 15), L(10, 18, 14, 18)],
        false,
    ),
    X('vrij', 'Vrij element', G, [...KR, 'bord'], [B(2, 6, 20, 12), T(12, 15, '?')]),
]
export const BUILTIN_KEYS = new Set(BUILTIN.map((t) => t.k))
let LIB = BUILTIN,
    IDX = new Map(BUILTIN.map((t) => [t.k, t]))
// the active component library (standard components + the user's edited and own ones); empty falls back to the standard components
export const setLibrary = (l) => {
    LIB = l && l.length ? l : BUILTIN
    IDX = new Map(LIB.map((t) => [t.k, t]))
}
export const ELEMENT_KEYS = EL
// projects saved before the library existed carry their own components in p.custom: they are still understood
const legacy = (p) =>
    (p.custom || [])
        .map((c) => ({k: 'custom:' + c.id, name: c.name, cat: c.cat || 'Eigen', parents: c.parents || KR, place: c.place !== false, shapes: c.shapes}))
        .filter((t) => !IDX.has(t.k))
export const allTypes = (p) => [...LIB, ...legacy(p)]
export const typeOf = (p, k) => IDX.get(k) || legacy(p).find((t) => t.k === k) || BUILTIN[0]
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
