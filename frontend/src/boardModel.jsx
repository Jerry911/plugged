// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Busbar-style layout of an eendraadschema: a horizontal bus with circuits placed left to right (units ~ px, see U for mm).
import {shapesOf, stackOf, typeOf} from './symbols'
import {flat, uid} from './util.jsx'

export const U = 0.16,
    MAXW = 1700,
    BUSX0 = 20,
    SP = 24,
    STUB = 24,
    SYM = 46,
    GAP = 20,
    ROWH = 100,
    BOXUP = 120,
    // drag & drop latch zone along the stem of a circuit: half its width, and how far it reaches above the top branch (room for the next one)
    STEMW = 16,
    STEMUP = 150
export const BOXT = new Set(['domotica', 'subbord'])
const tw = (s) => String(s || '').length * 6.6
// Details of an element (brand, type, serial number, Pmax, Umax, ...): one line per entry. Lines are separated by Enter (a real new line)
// or by '|' (how the eendraadschema stores them), so both a typed text area and an imported file give the same lines.
export const DET_SIZE = 11,
    DET_LINE = 13
export const detailLines = (s) =>
    String(s ?? '')
        .split(/\r?\n|\|/)
        .map((x) => x.trim())
        .filter(Boolean)
const dw = (s) => String(s || '').length * DET_SIZE * 0.56
export const letter = (i) =>
    i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26))
export const infoOf = (q = {}) => [(q.curve || '') + (q.amp || ''), q.polen ? q.polen + 'P' : '', q.kabel || ''].filter(Boolean).join(' ')
export const nextLetter = (tree) => {
    const used = new Set(
        flat(tree)
            .filter((n) => n.type === 'kring')
            .map((n) => n.label),
    )
    let i = 0
    while (used.has(letter(i))) i++
    return letter(i)
}
export const defaultProps = (k) =>
    ({
        kring: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5', kortsl: 3, bescherming: 'automatisch', tekst: ''},
        aansluiting: {teller: true, polen: 4, amp: 40, bescherming: 'differentieel', delta: 300, diffType: 'A', kabel: '4x16', kortsl: 3},
        bord: {geaard: true},
    })[k]
export const defaultTree = () => [
    {
        id: uid(),
        type: 'aansluiting',
        label: 'Aansluiting net',
        info: '',
        p: defaultProps('aansluiting'),
        children: [{id: uid(), type: 'bord', label: 'Verdeelbord', info: '', p: defaultProps('bord'), children: []}],
    },
]
// Breakers and the kWh meter are the symbols of the library (so edits to a symbol show up in the diagram). A breaker is drawn so that its
// lever is 30 units long (as in the eendraadschema). The pivot of the symbol is (13, 14) on its 24 grid and the lever tip lies BRK_TIP units
// above the pivot: the line above the breaker carries on from there.
export const BRK_S = (24 * 30) / Math.hypot(13 - 9.41, 14 - 4.13),
    BRK_TIP = ((14 - 4.13) * BRK_S) / 24,
    // the box of the kWh meter symbol is 14 grid units wide: 50 drawing units
    KWH_S = (24 * 50) / 14
// drawing item of the breaker symbol `key` with its pivot on (x, y)
export const breakerItem = (p, key, x, y, extra = {}) => ({
    k: 'sym',
    shapes: typeOf(p, key).shapes,
    x: x - BRK_S / 24,
    y: y - (2 * BRK_S) / 24,
    s: BRK_S,
    breaker: 1,
    ...extra,
})
// A differentieel either groups circuits (it has none under it yet, or circuits: they are drawn side by side and the differentieel itself is not
// drawn) or is a circuit of its own: a breaker with what it feeds under it (sub boards, elements, another differentieel). The main line (a board
// under it) is not a circuit.
export const isDiffCircuit = (d) => d.type === 'diff' && d.children.length > 0 && !d.children.some((c) => c.type === 'kring' || c.type === 'bord')
// The lines next to the breaker of a differentieel, like the differentieel of the aansluiting: 'Δ30mA', '4P - 40A', ('Curve C' of a
// differentieelautomaat), 'Type A'. A differentieel without these properties (typed in by hand) shows its info instead.
export const diffSpecs = (pr = {}, info = '') =>
    pr.delta || pr.amp
        ? [pr.delta ? `Δ${pr.delta}mA` : '', pr.amp ? `${pr.polen || 2}P - ${pr.amp}A` : '', pr.curve ? `Curve ${pr.curve}` : '', pr.diffType ? `Type ${pr.diffType}` : ''].filter(Boolean)
        : [info].filter(Boolean)
const line = (x1, y1, x2, y2) => ({k: 'line', x1, y1, x2, y2}),
    text = (x, y, s, o = {}) => ({k: 'text', x, y, s, ...o})
// Plaatsing of the cable of a circuit (as in the online eendraadschema): the symbols are drawn left of the stem, between the name and the line.
// p.plaatsing = '' | 'ondergronds' | 'luchtleiding' | 'inwand' | 'opwand', p.inbuis = the cable runs in a conduit (a small circle).
export const PLAATSING = [
    ['', 'Niet opgegeven'],
    ['ondergronds', 'Ondergronds'],
    ['luchtleiding', 'Luchtleiding'],
    ['inwand', 'In wand'],
    ['opwand', 'Op wand'],
]
// room the symbols need left of the stem: the name of the circuit moves that far to the left
export const IND_W = 24
// 'ondergronds', 'inwand' and 'opwand' are drawn left of the stem (and may be marked 'in buis' with a small circle); the circle of a
// 'luchtleiding' sits on the stem itself, and a luchtleiding is never 'in buis'
export const LEFT = ['ondergronds', 'inwand', 'opwand']
export const hasPlacement = (pr = {}) => LEFT.includes(pr.plaatsing)
// an imported or typed value ('In wand', 'in_wand', 'N/A', ...) as one of the keys above ('' = not given)
export const plaatsingOf = (v) => {
    const k = String(v ?? '')
        .toLowerCase()
        .replace(/[^a-z]/g, '')
    return PLAATSING.some((x) => x[0] && x[0] === k) ? k : ''
}
const BAR = 13 // half the length of the symbols along the stem
// The drawings (xs = x of the stem, yc = centre along the stem), drawn once at the start of the cable.
const E = (xs, yc, bar, tip) => [
    line(bar, yc - BAR, bar, yc + BAR),
    line(bar, yc - BAR, tip, yc - BAR),
    line(bar, yc, tip, yc),
    line(bar, yc + BAR, tip, yc + BAR),
]
const PLACE = {
    // earth symbol turned along the stem: three lines getting shorter towards the stem
    ondergronds: (xs) => [line(xs - 16, -102, xs - 16, -76), line(xs - 12.5, -99.5, xs - 12.5, -78.5), line(xs - 9, -97, xs - 9, -81)],
    // two E's: bar at the stem, teeth to the left (mirrored E's)
    opwand: (xs) => [...E(xs, -83, xs - 6, xs - 19), ...E(xs, -152, xs - 6, xs - 19)],
    // two E's: bar on the outside, teeth to the stem
    inwand: (xs) => [...E(xs, -83, xs - 19, xs - 6), ...E(xs, -152, xs - 19, xs - 6)],
    // a circle on the stem itself
    luchtleiding: (xs) => [{k: 'circ', x: xs, y: -100, r: 5}],
}
const CONDUIT_Y = -127
export const placement = (pr, xs) => [
    ...(PLACE[pr.plaatsing]?.(xs) || []),
    // in buis: a small circle between the symbols
    ...(hasPlacement(pr) && pr.inbuis ? [{k: 'circ', x: xs - 12.5, y: CONDUIT_Y, r: 5}] : []),
]
export const reach = (shapes) => {
    let l = Infinity,
        r = -Infinity
    const hit = (a, b) => {
        l = Math.min(l, a)
        r = Math.max(r, b)
    }
    shapes.forEach((h) => {
        if (h.t === 'circle' && Math.abs(h.cy - 12) <= h.r) {
            const d = Math.sqrt(h.r ** 2 - (h.cy - 12) ** 2)
            hit(h.cx - d, h.cx + d)
        } else if (h.t === 'rect' && h.y <= 12 && 12 <= h.y + h.h) hit(h.x, h.x + h.w)
        else if (h.t === 'line' && h.y1 === 12 && h.y2 === 12) hit(Math.min(h.x1, h.x2), Math.max(h.x1, h.x2))
        else if (h.t === 'arc' && Math.abs(12 - h.cy) <= h.r) {
            const dy = 12 - h.cy,
                d = Math.sqrt(h.r ** 2 - dy ** 2),
                span = (((h.a2 - h.a1) % 360) + 360) % 360
            ;[h.cx - d, h.cx + d].forEach((x) => {
                const ang = (Math.atan2(dy, x - h.cx) * 180) / Math.PI
                if ((((ang - h.a1) % 360) + 360) % 360 <= span + 1e-9) hit(x, x)
            })
        }
    })
    return l <= r ? [l, r] : null
}
// vertical room of an element in a stack: the symbol, its count (x3), its label and one line per detail
const own = (n) => (n.label ? 100 : Number(n.p?.aantal) > 1 ? 80 : 66) + detailLines(n.p?.details).length * DET_LINE
// A sub board needs the room of its circuits, which are drawn like the circuits on the bus: measure them (at least 300 for a board with circuits)
const ext = (p, n) =>
    BOXT.has(n.type)
        ? n.children.length
            ? Math.max(300, 30 - node(p, n, 0, 0, []).top)
            : 100
        : Math.max(
            own(n),
            n.children.reduce((a, c) => a + ext(p, c), 0),
        )
function stack(p, kids, sx, y, out, stub, num) {
    let acc = 0,
        r = sx,
        top = y - 30,
        bot = y + 30,
        last = y
    kids.forEach((c, i) => {
        const yi = y - acc
        acc += ext(p, c)
        last = yi
        out.push(line(sx, yi, sx + stub, yi))
        if (num) out.push(text(sx - 4, yi - 10, c.p?.nr || String(i + 1), {size: 13, anchor: 'end'}))
        const e = node(p, c, sx + stub, yi, out)
        r = Math.max(r, e.r)
        top = Math.min(top, e.top)
        bot = Math.max(bot, e.bot)
    })
    if (last !== y) out.push(line(sx, y, sx, last))
    return {r, top, bot}
}
// BW = room of a breaker that lies on the line between two elements (a circuit or differentieel under another one: AC -> breaker -> Veranda board)
const BW = 64
// The breaker of a circuit or differentieel under another circuit: the symbol lies on its side on the line (the current flows from left to right),
// the line stops at the lower contact and carries on after the lever. Name above it, specs and cable under it; then what hangs under it.
function inline(p, n, x, y, out) {
    const dif = n.type === 'diff',
        pr = n.p || {},
        u = BRK_S / 24,
        cx = x + BW / 2,
        px = cx - 2 * u
    out.push(
        line(x, y, px, y),
        {k: 'sym', shapes: typeOf(p, dif ? 'diff' : 'kring').shapes, x: cx, y: y - u, s: BRK_S, breaker: 1, r: 90, id: n.id},
        line(px + BRK_TIP, y, x + BW, y),
    )
    const specs = dif ? diffSpecs(pr, n.info) : pr.amp ? [`${pr.polen || 2}P - ${pr.amp}A`, pr.curve ? `Curve ${pr.curve}` : ''] : [n.info]
    ;[...specs, pr.kabel].filter(Boolean).forEach((t, i) => out.push(text(cx, y + 24 + 13 * i, t, {anchor: 'middle', id: n.id})))
    if (n.label) out.push(text(cx, y - 22, n.label, {bold: 1, size: 13, anchor: 'middle', id: n.id}))
    return stack(p, n.children, x + BW, y, out, STUB, false)
}
// a drawn item moved by (dx, dy)
const shift = (it, dx, dy) =>
    it.k === 'line' ? {...it, x1: it.x1 + dx, x2: it.x2 + dx, y1: it.y1 + dy, y2: it.y2 + dy} : {...it, x: it.x + dx, y: it.y + dy}
// A differentieel that is a circuit of its own is drawn like a circuit: its breaker (the diff symbol), name, specs and cable are those of the
// differentieel, a click on it selects the differentieel, and what hangs under it is drawn above it.
const diffCircuit = (c) => ({id: c.id, type: 'kring', diff: true, label: c.label || '', info: c.info || '', p: {...c.p, bescherming: 'automatisch'}, children: c.children})
// the circuits under a bus or a sub board, in drawing order. A sub board (or, in a sub board, any other element) directly under it is drawn as an
// anonymous circuit without breaker; a differentieel that groups circuits is not drawn itself.
const circuitsOf = (n, inBoard = false) =>
    n.children.flatMap((c) =>
        c.type === 'kring'
            ? [c]
            : c.type === 'subbord'
                ? [{id: c.id + '~', type: 'kring', label: '', info: '', p: {bescherming: 'geen'}, children: [c]}]
                : isDiffCircuit(c)
                    ? [diffCircuit(c)]
                    : ['diff', 'zekering', 'hoofdschakelaar', 'leeg', 'overspanning'].includes(c.type) // an empty element (insert buttons) keeps the circuits under it visible
                        ? circuitsOf(c, inBoard)
                        : inBoard
                            ? [{id: c.id + '~', type: 'kring', label: '', info: '', p: {bescherming: 'geen'}, children: [c]}]
                            : [],
    )
function node(p, n, x, y, out) {
    const t = typeOf(p, n.type),
        pr = n.p || {},
        lab = n.label || ''
    if (n.type === 'kring' || n.type === 'diff') return inline(p, n, x, y, out)
    if (BOXT.has(n.type)) {
        const title = pr.tekst || lab || t.name
        let cx = x + 14,
            top = y - 26
        // The circuits of a sub board are drawn by circuit(), exactly like the circuits on the bus (breaker, specs, plaatsing, in buis, numbers of the
        // elements, click area and latch zone), and moved so that their stem starts on the top edge of the board.
        circuitsOf(n, true).forEach((c) => {
            const l = circuit(p, c),
                bx = l.items.map(box).filter(Boolean),
                left = Math.min(...bx.map((b) => b[0]), 0),
                right = Math.max(l.w, ...bx.map((b) => b[2])),
                dx = cx - left,
                dy = y - 25
            l.items.forEach((it) => out.push(shift(it, dx, dy)))
            top = Math.min(top, dy + l.minY)
            cx = dx + right + GAP
        })
        const w = Math.max(100, tw(title) * 1.4 + 30, n.children.length ? cx - x - GAP + 16 : 0)
        out.push(
            {k: 'rect', x, y: y - 25, w, h: 50, id: n.id},
            text(x + w / 2, y + 5, title, {bold: 1, anchor: 'middle', size: 14, id: n.id}),
        )
        return {r: x + w, top, bot: y + 30}
    }
    const stacked = stackOf(t, pr)?.hor,
        shapes = shapesOf(t, pr),
        cnt = Number(pr.aantal) > 1 && !stacked ? 'x' + pr.aantal : '',
        det = detailLines(pr.details),
        w = Math.max(SYM + 6, tw(lab) + 8, tw(cnt) + 8, ...det.map((d) => dw(d) + 8))
    out.push({k: 'sym', shapes, x: x + w / 2, y, s: SYM, id: n.id, ...(n.r ? {r: n.r} : {})})
    const rc = reach(shapes),
        mid = x + w / 2
    if (rc) {
        const a = mid + ((rc[0] - 12) * SYM) / 24,
            b = mid + ((rc[1] - 12) * SYM) / 24
        if (a > x) out.push(line(x, y, a, y))
        if (n.children.length && b < x + w) out.push(line(b, y, x + w, y))
    }
    if (cnt) out.push(text(x + w / 2, y + 38, cnt, {anchor: 'middle'}))
    if (lab) out.push(text(x + w / 2, y + (cnt ? 54 : 40), lab, {anchor: 'middle', italic: 1}))
    // the details hang below the count and the name, one line each, aligned left (flush with the left edge of the element), clickable like the symbol itself
    const below = lab ? (cnt ? 54 : 40) : cnt ? 38 : 26
    det.forEach((d, i) => out.push(text(x + 4, y + below + DET_LINE * (i + 1) + 2, d, {size: DET_SIZE, id: n.id})))
    let r = x + w,
        top = y - 28,
        bot = y + Math.max(lab ? (cnt ? 62 : 48) : cnt ? 46 : 30, det.length ? below + DET_LINE * det.length + 6 : 0)
    if (n.children.length) {
        const sx = r + GAP / 2
        out.push(line(r, y, sx, y))
        const st = stack(p, n.children, sx, y, out, GAP / 2, false)
        r = st.r
        top = Math.min(top, st.top)
        bot = Math.max(bot, st.bot)
    }
    return {r, top, bot}
}
// Bounding box [x1, y1, x2, y2] of a drawn item (text sizes are estimated), used to pack circuits tighter.
const box = (it) => {
    if (it.k === 'line') return [Math.min(it.x1, it.x2) - 2, Math.min(it.y1, it.y2) - 2, Math.max(it.x1, it.x2) + 2, Math.max(it.y1, it.y2) + 2]
    if (it.k === 'rect') return [it.x - 2, it.y - 2, it.x + it.w + 2, it.y + it.h + 2]
    if (it.k === 'sym') {
        // a turned symbol needs more room: half the width of its turned bounding square
        const a = ((it.r || 0) * Math.PI) / 180,
            h = (SYM / 2) * (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))) + 4
        return [it.x - h, it.y - h, it.x + h, it.y + h]
    }
    if (it.k === 'circ') return [it.x - it.r - 2, it.y - it.r - 2, it.x + it.r + 2, it.y + it.r + 2]
    if (it.k !== 'text') return null
    const size = it.size || 13,
        w = String(it.s ?? '').length * size * (it.bold ? 0.7 : 0.62),
        up = size * 0.85,
        dn = size * 0.3
    if (it.rot) {
        // rotated -90 degrees: the text runs upwards from (x, y)
        const [a, b] = it.anchor === 'middle' ? [it.y - w / 2, it.y + w / 2] : it.anchor === 'end' ? [it.y, it.y + w] : [it.y - w, it.y]
        return [it.x - up, a, it.x + dn, b]
    }
    const [a, b] = it.anchor === 'middle' ? [it.x - w / 2, it.x + w / 2] : it.anchor === 'end' ? [it.x - w, it.x] : [it.x, it.x + w]
    return [a, it.y - up, b, it.y + dn]
}
export function circuit(p, n) {
    const out = [],
        pr = n.p || {},
        ind = hasPlacement(pr),
        xs = ind ? 30 + IND_W : 30,
        // the name sits left of the placement symbols
        tx = xs - 14 - (ind ? IND_W : 0),
        none = pr.bescherming === 'geen',
        cable = pr.kabel || '',
        y0 = -Math.max(215, 150 + tw(cable) + 40)
    const st = stack(p, n.children, xs, y0, out, STUB, true)
    if (none) out.push(line(xs, 0, xs, y0))
    else {
        // the line does not run through the breaker: it stops at the lower contact, the lever swings up and to the left
        // (with its filled block, see the kring symbol), the line carries on above the lever
        out.push(line(xs, 0, xs, -30), breakerItem(p, n.diff ? 'diff' : 'kring', xs, -30), line(xs, -30 - BRK_TIP, xs, y0))
    }
    const long = (n.label || '').length > 3
    out.push(
        long
            ? text(tx, -6, n.label, {bold: 1, size: 14, rot: 1, id: n.id})
            : text(xs - 14, -6, n.label || '', {bold: 1, size: 16, anchor: 'middle', id: n.id}),
    )
    if (pr.tekst) out.push(text(tx, long ? -12 - tw(n.label) - 8 : -72, pr.tekst, {bold: 1, size: 14, rot: 1, id: n.id}))
    if (!none) {
        const sp = n.diff ? diffSpecs(pr, n.info) : pr.amp ? [`${pr.polen || 2}P - ${pr.amp}A`, pr.curve ? `Curve ${pr.curve}` : null] : [n.info || null],
            k = pr.kortsl && !n.diff ? `${pr.kortsl}000` : null
        sp.filter(Boolean).forEach((s, i) => out.push(text(xs + 13 + 13 * i, -62, s, {rot: 1})))
        if (k) out.push({k: 'rect', x: xs + 33, y: -66 - tw(k) - 4, w: 15, h: tw(k) + 8}, text(xs + 44, -66, k, {rot: 1}))
    }
    if (cable) out.push(text(xs + 13, -150, cable, {rot: 1}))
    out.push(...placement(pr, xs))
    // A click anywhere on the stem selects the circuit (not only on its letter): a transparent area over the whole stem, drawn first so the
    // elements of the circuit and their own clicks stay on top. (The invisible circuit around a sub board has no properties: no area.)
    if (!String(n.id).endsWith('~')) {
        const x0 = (pr.tekst || long ? tx : xs) - 14,
            // The latch zone: a narrow strip along the whole stem, from above the breaker to well above the top branch. A symbol that is dragged into it
            // latches onto the circuit and becomes its next branch, also in the empty space above the last branch where nothing is drawn yet.
            zy = Math.min(st.top, y0) - STEMUP
        out.unshift({k: 'stem', x: xs - STEMW, y: zy, w: 2 * STEMW, h: -60 - zy, id: n.id})
        out.unshift({k: 'hit', x: x0, y: y0, w: xs + 52 - x0, h: -y0 + 6, id: n.id})
    }
    return {n, w: Math.max(st.r + 14, xs + 56), items: out, minY: Math.min(st.top, y0 - 60)}
}
// The head of the board (kWh meter and main breaker of the connection, in drawing units left of the bus) made of the symbols of the library.
// Every part belongs to the aansluiting element: clicking it selects that element, like the elements of a circuit.
export const headItems = (p, h) => {
    const out = [],
        id = h.id,
        k = KWH_S / 24
    if (h.kwh) {
        // the symbol's box runs from x 35 to 85 and its supply line starts at x 10, the line carries on to the main breaker (or the end of the head)
        out.push({k: 'sym', shapes: typeOf(p, 'teller').shapes, x: 35 + 4 * k, y: 96, s: KWH_S, id})
        out.push(line(85, 96, h.main ? 197 : 130, 96))
        if (h.main) out.push(line(197, 96, 197, 66))
        if (h.q?.kabel) out.push(text(110, 114, h.q.kabel, {size: 13}))
    }
    if (h.main) {
        // the supply comes from the meter below: the line stops at the lower contact (y 66), the lever swings up and to the left towards the busbar,
        // the line carries on above the lever up to the busbar
        out.push(breakerItem(p, h.main === 'differentieel' ? 'diff' : 'hoofdschakelaar', 197, 66, {id}), line(197, 0, 197, 66 - BRK_TIP))
        ;[
            [h.main === 'differentieel' ? `Δ${h.q.delta || 300}mA` : null, 0],
            [`${h.q.polen || 2}P - ${h.q.amp || 40}A`, 1],
            [h.q.diffType ? `Type ${h.q.diffType}` : null, 2],
        ]
            .filter((a) => a[0])
            .forEach(([s, i]) => out.push(text(210 + 13 * i, 66, s, {rot: 1, id})))
    }
    return out
}
export function board(p, pg) {
    const tree = pg.tree,
        root = tree.find((n) => n.type === 'aansluiting') || null
    const findBus = (n) => {
        if (n.type === 'bord') return n
        for (const c of n.children)
            if (['teller', 'hoofdschakelaar', 'diff', 'bord'].includes(c.type)) {
                const r = findBus(c)
                if (r) return r
            }
        return null
    }
    const bus = (root && findBus(root)) || flat(tree).find((n) => n.type === 'bord') || null
    const cs = bus ? circuitsOf(bus) : []
    // Circuits are placed left to right. A circuit that is lower than the overhang of earlier circuits on the same sheet
    // (their wide rows sit higher up) slides left underneath that overhang, which saves width (and sometimes a whole sheet).
    // Without such an overhang the spacing is exactly `previous width + SP`. `brk` marks the first circuit of a new sheet.
    let x0 = 0,
        right = 0,
        placed = []
    const circuits = cs.map((c, i) => {
        const l = circuit(p, c),
            bx = l.items.map(box).filter(Boolean),
            px = bx.reduce((a, b) => Math.max(a, b[2]), 0),
            m = {x: 0, bx, pad: Math.max(0, l.w - px)}
        let x = i ? right + SP : BUSX0,
            brk = false
        if (placed.length) {
            let lo = placed.at(-1).x + SP
            for (const q of placed) {
                let reach = -Infinity
                for (const b of q.bx) if (b[3] >= l.minY - 12 && b[1] <= 6) reach = Math.max(reach, b[2])
                if (reach > -Infinity) lo = Math.max(lo, q.x + reach + q.pad + SP)
            }
            x = Math.min(x, lo)
            if (Math.max(right, x + l.w) - x0 > MAXW) {
                x = right + SP
                x0 = x - 10
                placed = []
                brk = true
            }
        }
        m.x = x
        placed.push(m)
        right = brk || i === 0 ? x + l.w : Math.max(right, x + l.w)
        return {...l, x, brk}
    })
    const end = cs.length ? right + SP : BUSX0,
        q = root?.p
    const head = {
        id: root?.id,
        q,
        kwh: !!root && (q ? q.teller !== false : flat([root]).some((n) => n.type === 'teller')),
        main: q?.bescherming === 'differentieel' || q?.bescherming === 'automatisch' ? q.bescherming : null,
        ground: !!bus && (!!bus.p?.geaard || flat(tree).some((n) => n.type === 'aarding')),
        // the earth belongs to the distribution board
        groundId: bus?.id,
    }
    return {circuits, end, bus, head: {...head, items: headItems(p, head)}}
}
export function slices(b) {
    const out = []
    let cur = null
    b.circuits.forEach((c, i) => {
        if (!cur || c.brk) {
            cur = {from: i, to: i, x0: cur ? c.x - 10 : 0, x1: 0, minY: -120}
            out.push(cur)
        }
        cur.to = i + 1
        cur.x1 = Math.max(cur.x1, c.x + c.w)
        cur.minY = Math.min(cur.minY, c.minY)
    })
    if (!out.length) out.push({from: 0, to: 0, x0: 0, x1: 0, minY: -120})
    out.forEach((s, i) => {
        s.first = i === 0
        s.last = i === out.length - 1
        if (s.last) s.x1 = Math.max(s.x1, b.end)
        if (s.first) s.x1 = Math.max(s.x1, 260)
    })
    return out
}
// `scoped`: number the eendraad sheets and the situatieschema pages separately (as shown in their own tab: Blad 6/6 and Blad 1/1);
// otherwise one continuous numbering over all printed sheets (PDF export).
export function sheetPlan(p, scoped = false) {
    const plan = [
        ...p.een.flatMap((pg) => {
            const b = board(p, pg)
            return slices(b).map((sl) => ({kind: 'een', pg, b, sl}))
        }),
        ...p.sit.map((pg) => ({kind: 'sit', pg})),
    ]
    if (!scoped) return plan.map((e, i) => ({...e, no: i + 1, total: plan.length}))
    const seen = {},
        total = {}
    plan.forEach((e) => (total[e.kind] = (total[e.kind] || 0) + 1))
    return plan.map((e) => ({...e, no: (seen[e.kind] = (seen[e.kind] || 0) + 1), total: total[e.kind]}))
}
// numbering of a page within its own tab
export const numbering = (p, pg) => {
    const e = sheetPlan(p, true).find((x) => x.pg === pg)
    return e ? {no: e.no, total: e.total} : {no: 0, total: 0}
}