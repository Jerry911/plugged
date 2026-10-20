// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Standard components on a 24x24 grid (the connection point of a symbol is on the line y = 12). They are the defaults of the
// component library: the active library (defaults + edited + own components, stored in the database) is registered with setLibrary().
// Shapes: line, circle, rect, text (optional fs = font size) and arc (degrees, clockwise on screen).
// Draw them after AREI Boek 1, hoofdstuk 2.13, tabel 2.23 and refine them in the Componenten tab.
const rd = (v) => Math.round(v * 100) / 100
const L = (x1, y1, x2, y2) => ({t: 'line', x1, y1, x2, y2}),
    C = (cx, cy, r) => ({t: 'circle', cx, cy, r}),
    B = (x, y, w, h) => ({t: 'rect', x, y, w, h}),
    T = (x, y, s, fs) => (fs ? {t: 'text', x, y, s, fs} : {t: 'text', x, y, s})
const AR = (cx, cy, r, a1, a2) => ({t: 'arc', cx, cy, r, a1, a2})
const X = (k, name, cat, parents, shapes, place = true) => ({k, name, cat, parents, place, shapes})
const EL = [
    'kring',
    'domotica',
    'subbord',
    'schakelaar',
    'wissel',
    'dimmer',
    'drukknop',
    'lichtpunt',
    'stopcontact',
    'stopcontact2',
    'stopcontact3',
    'trafo',
    'modulaire',
    'motor',
    'bel',
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
    'vaatwas',
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
// lamp: circle with a cross whose ends touch the circle
const lamp = (cx = 12, cy = 12, r = 7) => {
    const d = rd(r * Math.SQRT1_2)
    return [C(cx, cy, r), L(rd(cx - d), rd(cy - d), rd(cx + d), rd(cy + d)), L(rd(cx + d), rd(cy - d), rd(cx - d), rd(cy + d))]
}
// switch: supply line, hinge circle, lever (starts on the circle) and flags that start on the lever (both = both sides: two-way)
const lever = (flags = 1, both = false) => {
    const ux = 0.766,
        uy = -0.643,
        ex = rd(7 + 12 * ux),
        ey = rd(12 + 12 * uy),
        out = [L(1, 12, 4.5, 12), C(7, 12, 2.5), L(rd(7 + 2.5 * ux), rd(12 + 2.5 * uy), ex, ey)]
    for (let k = 0; k < flags; k++) {
        const px = ex - k * 2.4 * ux,
            py = ey - k * 2.4 * uy
        out.push(both ? L(rd(px - 1.93), rd(py - 2.3), rd(px + 1.93), rd(py + 2.3)) : L(rd(px), rd(py), rd(px + 1.93), rd(py + 2.3)))
    }
    return out
}
// socket (contactdoos): wire, vertical bar and half circle; pin = contact for the protective conductor
const socket = (pin = true) => [L(1, 12, 9, 12), L(9, 6, 9, 18), AR(9, 12, 6, -90, 90), ...(pin ? [L(9, 12, 13, 12)] : [])]
const box = (s) => [B(3, 3, 18, 18), ...s]
export const BUILTIN = [
    X('aansluiting', 'Aansluiting net', V, [], [B(4, 6, 16, 12), L(4, 6, 20, 18), L(4, 18, 20, 6)], false),
    X('teller', 'Teller (kWh)', V, ['aansluiting'], [B(4, 4, 16, 16), T(12, 15, 'kWh')]),
    X('hoofdschakelaar', 'Hoofdschakelaar', V, ['aansluiting', 'teller'], [L(12, 2, 12, 7), L(12, 7, 18, 17), L(12, 17, 12, 22)], false),
    X('bord', 'Verdeelbord', V, ['aansluiting', 'teller', 'hoofdschakelaar', 'diff', 'bord'], [B(2, 5, 20, 14), L(2, 12, 22, 12)]),
    X(
        'diff',
        'Differentieel (aardlek)',
        V,
        ['bord', 'hoofdschakelaar', 'aansluiting', 'teller'],
        [B(5, 7, 14, 10), C(12, 12, 3), L(12, 2, 12, 7), L(12, 17, 12, 22)],
        false,
    ),
    X('overspanning', 'Overspanningsbeveiliging', V, ['bord'], [B(3, 7, 18, 10), T(12, 15, 'SPD')], false),
    X(
        'kring',
        'Kring (automaat)',
        V,
        ['bord', 'diff', 'domotica', 'subbord', 'kring'],
        [B(7, 5, 10, 14), L(12, 2, 12, 5), L(12, 19, 12, 22), L(7, 19, 17, 5)],
        false,
    ),
    X('zekering', 'Smeltveiligheid', V, ['bord', 'diff'], [B(8, 4, 8, 16), L(12, 2, 12, 22)], false),
    X('stopcontact', 'Stopcontact', S, KR, socket()),
    X('stopcontact2', 'Dubbel stopcontact', S, KR, [...socket(), T(20, 20, '2', 8)]),
    X('stopcontact3', 'Stopcontact 3-fasig/zwaar', S, KR, [...socket(), T(20, 20, '3', 8)]),
    X('data', 'Data (RJ45)', S, KR, [B(5, 5, 14, 14), T(12, 15, 'D')]),
    X('tv', 'TV-aansluiting', S, KR, [B(5, 5, 14, 14), T(12, 15, 'TV')]),
    X('lichtpunt', 'Lichtpunt', O, LP, lamp()),
    X('wandlamp', 'Wandlamp', O, LP, [...lamp(11, 12, 6), L(17, 5, 17, 19)]),
    X('tl', 'TL-armatuur', O, LP, [B(2, 9, 20, 6), L(2, 12, 22, 12)]),
    X('noodlicht', 'Noodverlichting', O, LP, [...lamp(), B(10, 10, 4, 4)]),
    X('schakelaar', 'Enkelpolige schakelaar', O, KR, lever(1)),
    X('wissel', 'Wisselschakelaar', O, KR, lever(1, true)),
    X('dimmer', 'Dimmer', O, KR, [...lever(1), L(6, 20, 20, 8), L(20, 8, 18.38, 11.49), L(20, 8, 16.3, 9.07)]),
    X('drukknop', 'Drukknop', O, KR, [C(12, 12, 6), C(12, 12, 3)]),
    X('bel', 'Bel / zoemer', O, KR, [C(12, 12, 7), T(12, 15, 'B')]),
    X('rookmelder', 'Rookmelder', O, KR, [C(12, 12, 8), T(12, 15, 'R')]),
    X('thermostaat', 'Thermostaat', O, KR, [C(12, 12, 7), T(12, 15, 'T')]),
    X('motor', 'Motor', A, KR, [C(12, 12, 8), T(12, 15, 'M')]),
    X('verwarming', 'Elektrische verwarming', A, KR, [B(3, 6, 18, 12), T(12, 15, 'V')]),
    X('boiler', 'Boiler', A, KR, [C(12, 12, 8), T(12, 15, 'B')]),
    X('kookplaat', 'Kookplaat', A, KR, box([C(8, 8, 2.5), C(16, 8, 2.5), C(8, 16, 2.5), C(16, 16, 2.5)])),
    X('oven', 'Oven', A, KR, box([B(7, 8, 10, 8)])),
    X('wasmachine', 'Wasmachine / droogkast', A, KR, box([C(12, 13, 5)])),
    X('vaatwas', 'Vaatwasser', A, KR, box([L(3, 8, 21, 8), T(12, 18, 'V')])),
    X('airco', 'Airco / warmtepomp', A, KR, [B(2, 6, 20, 12), T(12, 15, 'AC')]),
    X('ventilatie', 'Ventilatie', A, KR, [C(12, 12, 8), T(12, 15, 'V')]),
    X('laadpaal', 'Laadpaal EV', E, KR, [B(4, 3, 16, 18), T(12, 15, 'EV')]),
    X('zonnepanelen', 'Zonnepanelen', E, EL, [B(2, 5, 20, 14), L(2, 12, 22, 12), L(8, 5, 8, 19), L(15, 5, 15, 19)]),
    X('omvormer', 'Omvormer', E, EL, [B(3, 5, 18, 14), L(3, 19, 21, 5)]),
    X('batterij', 'Thuisbatterij', E, EL, [B(3, 8, 16, 10), B(19, 11, 3, 4), L(8, 10, 8, 16)]),
    X('domotica', 'Domotica (kast)', G, EL, [B(2, 6, 20, 12), T(12, 15, 'D')]),
    X('subbord', 'Onderbord', G, [...EL, 'bord'], [B(2, 5, 20, 14), L(2, 12, 22, 12)]),
    X('trafo', 'Transformator', G, EL, [C(9, 12, 5), C(15, 12, 5)]),
    X('modulaire', 'Modulaire schakelaar', O, EL, [B(5, 6, 14, 12), L(5, 12, 19, 12)]),
    X('lichtcircuit', 'Lichtcircuit', O, EL, [...lamp(), C(12, 12, 10)]),
    X('microgolf', 'Microgolfoven', A, EL, box([T(12, 15, 'MW')])),
    X('aftakdoos', 'Aftakdoos', G, KR, [B(8, 8, 8, 8)]),
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
    <g transform={`translate(${x - s / 2},${y - s / 2}) scale(${s / 24})`} stroke={stroke} fill="none" strokeWidth={w}>
        {shapes.map((h, i) =>
            h.t === 'line' ? (
                <line key={i} x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} />
            ) : h.t === 'circle' ? (
                <circle key={i} cx={h.cx} cy={h.cy} r={h.r} />
            ) : h.t === 'rect' ? (
                <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} />
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
