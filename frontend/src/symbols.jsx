// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// 24x24 grid shapes. Simplified approximations of AREI/EN 60617 symbols: refine here or in the custom tab.
const L = (x1, y1, x2, y2) => ({t: 'line', x1, y1, x2, y2}),
    C = (cx, cy, r) => ({t: 'circle', cx, cy, r}),
    B = (x, y, w, h) => ({t: 'rect', x, y, w, h}),
    T = (x, y, s) => ({t: 'text', x, y, s})
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
const lamp = [C(12, 12, 7), L(7, 7, 17, 17), L(17, 7, 7, 17)],
    sw = [C(7, 12, 2), L(8.5, 10.5, 17, 4)],
    box = (s) => [B(3, 3, 18, 18), ...s]
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
        [B(5, 7, 14, 10), C(12, 12, 3), L(12, 2, 12, 7)],
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
    X('stopcontact', 'Stopcontact', S, KR, [C(12, 12, 6), L(6, 12, 18, 12), L(12, 12, 12, 19)]),
    X('stopcontact2', 'Dubbel stopcontact', S, KR, [C(12, 12, 6), L(6, 12, 18, 12), L(12, 12, 12, 19), L(15, 4, 15, 8)]),
    X('stopcontact3', 'Stopcontact 3-fasig/zwaar', S, KR, [C(12, 12, 6), L(6, 12, 18, 12), L(12, 12, 12, 19), T(12, 8, '3')]),
    X('data', 'Data (RJ45)', S, KR, [B(5, 5, 14, 14), T(12, 15, 'D')]),
    X('tv', 'TV-aansluiting', S, KR, [B(5, 5, 14, 14), T(12, 15, 'TV')]),
    X('lichtpunt', 'Lichtpunt', O, LP, lamp),
    X('wandlamp', 'Wandlamp', O, LP, [...lamp, L(4, 20, 20, 20)]),
    X('tl', 'TL-armatuur', O, LP, [B(2, 9, 20, 6), L(2, 12, 22, 12)]),
    X('noodlicht', 'Noodverlichting', O, LP, [...lamp, B(10, 10, 4, 4)]),
    X('schakelaar', 'Enkelpolige schakelaar', O, KR, sw),
    X('wissel', 'Wisselschakelaar', O, KR, [...sw, L(5.5, 10.5, 1.5, 4)]),
    X('dimmer', 'Dimmer', O, KR, [...sw, L(13, 15.5, 21, 15.5)]),
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
    X('omvormer', 'Omvormer', E, EL, [B(3, 5, 18, 14), L(4, 18, 20, 6)]),
    X('batterij', 'Thuisbatterij', E, EL, [B(3, 8, 16, 10), B(19, 11, 3, 4), L(8, 10, 8, 16)]),
    X('domotica', 'Domotica (kast)', G, EL, [B(2, 6, 20, 12), T(12, 15, 'D')]),
    X('subbord', 'Onderbord', G, [...EL, 'bord'], [B(2, 5, 20, 14), L(2, 12, 22, 12)]),
    X('trafo', 'Transformator', G, EL, [C(9, 12, 5), C(15, 12, 5)]),
    X('modulaire', 'Modulaire schakelaar', O, EL, [B(5, 6, 14, 12), L(5, 12, 19, 12)]),
    X('lichtcircuit', 'Lichtcircuit', O, EL, [...lamp, C(12, 12, 9)]),
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
export const allTypes = (p) => [
    ...BUILTIN,
    ...(p.custom || []).map((c) => ({k: 'custom:' + c.id, name: c.name, cat: 'Eigen', parents: KR, place: true, shapes: c.shapes})),
]
export const typeOf = (p, k) => allTypes(p).find((t) => t.k === k) || BUILTIN[0]
export const Sym = ({shapes, x = 0, y = 0, s = 8, stroke = '#000'}) => (
    <g transform={`translate(${x - s / 2},${y - s / 2}) scale(${s / 24})`} stroke={stroke} fill="none" strokeWidth="1.5">
        {shapes.map((h, i) =>
            h.t === 'line' ? (
                <line key={i} x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} />
            ) : h.t === 'circle' ? (
                <circle key={i} cx={h.cx} cy={h.cy} r={h.r} />
            ) : h.t === 'rect' ? (
                <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} />
            ) : (
                <text key={i} x={h.x} y={h.y} fontSize="10" textAnchor="middle" fill={stroke} stroke="none">
                    {h.s}
                </text>
            ),
        )}
    </g>
)
